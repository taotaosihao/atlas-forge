#!/usr/bin/env node
"use strict";

const fs = require("fs");
const crypto = require("crypto");

const DEFAULT_SUCCESS = new Set(["DONE", "PASS", "CLEAN", "READY", "COMPLETE", "COMPLETED"]);
const DEFAULT_FAILURE = new Set(["FAIL", "FAILED", "BLOCKED", "ERROR"]);
const DEFAULT_BLOCKER = new Set(["BLOCKER", "MISROUTED_ROLE"]);

function parseScalar(raw) {
  const value = raw.trim();
  if (value === "") return "";
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if ((value.startsWith("[") && value.endsWith("]")) || (value.startsWith("{") && value.endsWith("}"))) {
    return JSON.parse(value);
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function parseKeyValue(content) {
  const match = content.match(/^([^:]+):(.*)$/);
  if (!match) return null;
  return [match[1].trim(), match[2].trim()];
}

function parseYaml(text) {
  const lines = text
    .split(/\r?\n/)
    .map((raw) => ({ indent: raw.match(/^ */)[0].length, content: raw.trim() }))
    .filter((line) => line.content && !line.content.startsWith("#"));

  function parseBlock(index, indent) {
    if (index >= lines.length) return [{}, index];
    if (lines[index].content.startsWith("- ")) {
      const arr = [];
      while (index < lines.length && lines[index].indent === indent && lines[index].content.startsWith("- ")) {
        const itemText = lines[index].content.slice(2).trim();
        index += 1;
        let item;
        const pair = parseKeyValue(itemText);
        if (!itemText) {
          [item, index] = parseBlock(index, indent + 2);
        } else if (pair) {
          item = {};
          item[pair[0]] = pair[1] ? parseScalar(pair[1]) : null;
          if (index < lines.length && lines[index].indent > indent) {
            const [rest, next] = parseBlock(index, indent + 2);
            if (rest && typeof rest === "object" && !Array.isArray(rest)) {
              item = { ...item, ...rest };
            }
            index = next;
          }
        } else {
          item = parseScalar(itemText);
        }
        arr.push(item);
      }
      return [arr, index];
    }

    const obj = {};
    while (index < lines.length && lines[index].indent === indent && !lines[index].content.startsWith("- ")) {
      const pair = parseKeyValue(lines[index].content);
      if (!pair) throw new Error(`unsupported YAML line: ${lines[index].content}`);
      const [key, rest] = pair;
      index += 1;
      if (rest) {
        obj[key] = parseScalar(rest);
      } else if (index < lines.length && lines[index].indent > indent) {
        [obj[key], index] = parseBlock(index, lines[index].indent);
      } else {
        obj[key] = null;
      }
    }
    return [obj, index];
  }

  const [result] = parseBlock(0, lines[0] ? lines[0].indent : 0);
  return result;
}

function loadStructured(path) {
  const text = fs.readFileSync(path, "utf8");
  if (path.toLowerCase().endsWith(".json")) return JSON.parse(text);
  return parseYaml(text);
}

function normalizeResult(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim().toUpperCase().replace(/-/g, "_");
}

function getPhases(template) {
  const workflow = template.workflow || template;
  if (!Array.isArray(workflow.phases)) throw new Error("template must contain workflow.phases[]");
  return workflow.phases;
}

function getPhase(template, phaseName) {
  const phase = getPhases(template).find((item) => item.phase === phaseName || item.id === phaseName);
  if (!phase) throw new Error(`phase not found in template: ${phaseName}`);
  return phase;
}

function resultSets(template, phase) {
  const workflow = template.workflow || template;
  const configured = workflow.result_sets || {};
  const success = new Set([...(configured.success || DEFAULT_SUCCESS)].map(normalizeResult));
  const failure = new Set([...(configured.failure || DEFAULT_FAILURE)].map(normalizeResult));
  const blocker = new Set([...(configured.blocker || DEFAULT_BLOCKER)].map(normalizeResult));
  for (const item of phase.success || []) success.add(normalizeResult(item));
  for (const item of phase.failure || []) failure.add(normalizeResult(item));
  for (const item of phase.blocker || []) blocker.add(normalizeResult(item));
  return { success, failure, blocker };
}

function roleSuccessResults(template, phase, role) {
  const { success } = resultSets(template, phase);
  const byRole = phase.success_results || {};
  const values = byRole[role] || byRole["*"];
  return values ? new Set(values.map(normalizeResult)) : success;
}

function eventRoleResults(event) {
  const results = {};
  const completed = event.completed_roles || event.role_results || {};
  if (Array.isArray(completed)) {
    for (const item of completed) {
      if (!item || typeof item !== "object" || !item.role) continue;
      const role = String(item.role);
      results[role] = { ...item, result: normalizeResult(item.result || item.status) };
    }
  } else if (completed && typeof completed === "object") {
    for (const [role, value] of Object.entries(completed)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        results[String(role)] = { ...value, result: normalizeResult(value.result || value.status) };
      } else {
        results[String(role)] = { result: normalizeResult(value) };
      }
    }
  }
  const sourceRole = event.source_role || event.role;
  const sourceResult = normalizeResult(event.result || event.status);
  if (sourceRole && sourceResult) {
    const role = String(sourceRole);
    if (!results[role]) {
      results[role] = {
        result: sourceResult,
        commit_sha: event.commit_sha,
        artifact_type: event.artifact_type,
      };
    }
  }
  return results;
}

function isSuccess(template, phase, role, result) {
  return roleSuccessResults(template, phase, role).has(normalizeResult(result));
}

function staleReason(event, phase, roleData) {
  if (roleData.phase && roleData.phase !== phase.phase) return "phase_mismatch";
  if (!phase.commit_sha_required) return null;
  if (roleData.commit_sha && event.commit_sha && roleData.commit_sha !== event.commit_sha) return "commit_mismatch";
  if (!roleData.commit_sha) return "missing_role_commit_sha";
  return null;
}

function routeConfig(phase, name) {
  return phase[name] && typeof phase[name] === "object" && !Array.isArray(phase[name]) ? phase[name] : {};
}

function asRoleList(value) {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

function resolveRoles(phase, routeDef) {
  if (routeDef.roles !== undefined) return asRoleList(routeDef.roles);
  if (routeDef.roles_from) return asRoleList(phase[String(routeDef.roles_from)]);
  if (routeDef.owner !== undefined) return asRoleList(routeDef.owner);
  return asRoleList(phase.next_roles);
}

function sha(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function buildDecision({ action, phase, route: routeDef, event, reason_code, reason, facts }) {
  let next_roles = resolveRoles(phase, routeDef);
  let next_phase = routeDef.phase || phase.next_phase || phase.phase;
  if (action === "wait") {
    next_roles = [];
    next_phase = phase.phase;
  }
  const rolesHash = sha(JSON.stringify([...next_roles].sort())).slice(0, 16);
  const sourceId = event.source_comment_id || event.comment_id || event.source_run_id || event.run_id || event.task_id || "unknown-source";
  const dedupe_fields = {
    issue_id: event.issue_id || event.issue || "unknown-issue",
    phase: phase.phase,
    commit_sha: event.commit_sha || "unknown-commit",
    source_id: sourceId,
    next_roles_hash: rolesHash,
  };
  return {
    action,
    next_phase,
    next_roles,
    leader_required: next_roles.map((role) => role.toLowerCase()).includes("leader"),
    reason_code,
    reason,
    facts,
    dedupe_key: sha(JSON.stringify(dedupe_fields, Object.keys(dedupe_fields).sort())),
    dedupe_fields,
  };
}

function route(template, event) {
  if (!event.phase) throw new Error("event.phase is required");
  const phase = getPhase(template, String(event.phase));
  const requiredRoles = asRoleList(phase.required_roles);
  const optionalRoles = asRoleList(phase.optional_roles);
  const roleResults = eventRoleResults(event);
  const { failure: failureResults, blocker: blockerResults } = resultSets(template, phase);
  const commitRequired = Boolean(phase.commit_sha_required);
  const commitSha = event.commit_sha;
  const sourceResult = normalizeResult(event.result || event.status);
  const timedOut = Boolean(event.timeout) || sourceResult === "TIMEOUT";
  const joinPolicy = String(phase.join_policy || "all_required");
  const staleRoles = {};
  for (const [role, data] of Object.entries(roleResults)) {
    const stale = staleReason(event, phase, data);
    if (stale) staleRoles[role] = stale;
  }
  const currentRoleResults = {};
  for (const [role, data] of Object.entries(roleResults)) {
    if (!staleRoles[role] || staleRoles[role] === "missing_role_commit_sha") currentRoleResults[role] = data;
  }
  const facts = {
    phase: phase.phase,
    artifact_type: event.artifact_type,
    commit_sha: commitSha,
    join_policy: joinPolicy,
    required_roles: requiredRoles,
    optional_roles: optionalRoles,
    role_results: roleResults,
    stale_roles: staleRoles,
  };

  if (timedOut) {
    const routeDef = routeConfig(phase, "timeout_action");
    const fallback = Object.keys(routeDef).length ? routeDef : { roles_from: "blocker_owner" };
    return buildDecision({
      action: String(fallback.action || "dispatch"),
      phase,
      route: fallback,
      event,
      reason_code: "timeout",
      reason: String(fallback.reason || "Phase timed out."),
      facts,
    });
  }

  const blockerRoles = Object.entries(currentRoleResults).filter(([, data]) => blockerResults.has(normalizeResult(data.result))).map(([role]) => role);
  const failedRoles = Object.entries(currentRoleResults).filter(([, data]) => failureResults.has(normalizeResult(data.result))).map(([role]) => role);
  const passedRequired = requiredRoles.filter((role) => roleResults[role] && !staleRoles[role] && isSuccess(template, phase, role, roleResults[role].result || ""));
  const missingRequired = requiredRoles.filter((role) => !passedRequired.includes(role));
  Object.assign(facts, {
    passed_required: passedRequired,
    missing_required: missingRequired,
    failed_roles: failedRoles,
    blocker_roles: blockerRoles,
  });

  if (commitRequired && !commitSha) {
    const routeDef = routeConfig(phase, "on_blocker");
    const fallback = Object.keys(routeDef).length ? routeDef : { roles_from: "blocker_owner" };
    return buildDecision({
      action: String(fallback.action || "dispatch"),
      phase,
      route: fallback,
      event,
      reason_code: "missing_commit_sha",
      reason: "Template requires commit_sha for this phase.",
      facts,
    });
  }
  if (blockerRoles.length) {
    const routeDef = routeConfig(phase, "on_blocker");
    const fallback = Object.keys(routeDef).length ? routeDef : { roles_from: "blocker_owner" };
    return buildDecision({
      action: String(fallback.action || "dispatch"),
      phase,
      route: fallback,
      event,
      reason_code: "blocker",
      reason: String(fallback.reason || "A role reported BLOCKER."),
      facts,
    });
  }
  if (failedRoles.length) {
    let routeDef = routeConfig(phase, "on_failure");
    routeDef = Object.keys(routeDef).length ? routeDef : { roles_from: "repair_owner", phase: "repair" };
    let reasonCode = "failure";
    if (!resolveRoles(phase, routeDef).length) {
      routeDef = routeConfig(phase, "on_blocker");
      routeDef = Object.keys(routeDef).length ? routeDef : { roles_from: "blocker_owner" };
      reasonCode = "repair_owner_unknown";
    }
    return buildDecision({
      action: String(routeDef.action || "dispatch"),
      phase,
      route: routeDef,
      event,
      reason_code: reasonCode,
      reason: String(routeDef.reason || "A role reported failure."),
      facts,
    });
  }
  if (joinPolicy === "any_blocker") {
    const routeDef = routeConfig(phase, "on_join_wait");
    const fallback = Object.keys(routeDef).length ? routeDef : { action: "wait" };
    return buildDecision({
      action: String(fallback.action || "wait"),
      phase,
      route: fallback,
      event,
      reason_code: "no_blocker_observed",
      reason: String(fallback.reason || "No blocker observed yet."),
      facts,
    });
  }
  if (missingRequired.length) {
    const routeDef = routeConfig(phase, "on_join_wait");
    const fallback = Object.keys(routeDef).length ? routeDef : { action: "wait" };
    return buildDecision({
      action: String(fallback.action || "wait"),
      phase,
      route: fallback,
      event,
      reason_code: Object.keys(staleRoles).length ? "stale_required_result" : "join_waiting",
      reason: String(fallback.reason || "Waiting for required roles."),
      facts,
    });
  }
  const routeDef = routeConfig(phase, "on_join_complete");
  const fallback = Object.keys(routeDef).length ? routeDef : { action: "dispatch", phase: phase.next_phase, roles: phase.next_roles };
  return buildDecision({
    action: String(fallback.action || "dispatch"),
    phase,
    route: fallback,
    event,
    reason_code: "join_complete",
    reason: String(fallback.reason || "Required roles completed."),
    facts,
  });
}

function loadDedupeKeys(path) {
  if (!path || !fs.existsSync(path)) return new Set();
  const keys = new Set();
  for (const raw of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!raw.trim()) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.dedupe_key) keys.add(String(parsed.dedupe_key));
    } catch {
      keys.add(raw.trim());
    }
  }
  return keys;
}

function appendDedupeKey(path, decision) {
  fs.mkdirSync(require("path").dirname(path), { recursive: true });
  fs.appendFileSync(path, JSON.stringify({ dedupe_key: decision.dedupe_key, dedupe_fields: decision.dedupe_fields }) + "\n");
}

module.exports = {
  appendDedupeKey,
  loadDedupeKeys,
  loadStructured,
  normalizeResult,
  parseYaml,
  route,
};
