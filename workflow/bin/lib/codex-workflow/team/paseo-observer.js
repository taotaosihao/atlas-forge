"use strict";

const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { classifyPaseoObservation } = require("./backend-failures");

const OBSERVER_VERSION = 1;
const ALLOWED_ACTIONS = new Set([
  "run", "wait", "stop", "inspect", "ls", "provider-list", "provider-models",
]);

function oneLine(value) {
  return String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

function parseJson(text) {
  try {
    return JSON.parse(String(text || ""));
  } catch (_error) {
    return null;
  }
}

function firstStructuredError(value) {
  if (!value || typeof value !== "object") return {};
  if (value.error && typeof value.error === "object") return value.error;
  return value;
}

function structuredFailure(stdoutJson, stderrJson, exitCode) {
  const envelope = stderrJson || stdoutJson;
  if (!envelope || typeof envelope !== "object") return {};
  const structured = firstStructuredError(envelope);
  const status = oneLine(structured.status || envelope.status).toLowerCase();
  const httpStatus = Number(structured.http_status || structured.httpStatus || 0);
  const hasNestedError = envelope.error && typeof envelope.error === "object";
  if (Number(exitCode) !== 0 || hasNestedError
    || /^(error|failed|unavailable|crashed|timeout)$/.test(status)
    || httpStatus >= 400) {
    return structured;
  }
  return {};
}

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function buildObservation({ action, exitCode, stdout, stderr, observedAt, rawEvidenceRef,
  launchOperationId }) {
  if (!ALLOWED_ACTIONS.has(action)) {
    throw new Error(`unsupported Paseo observation action: ${action}`);
  }
  const stdoutJson = parseJson(stdout);
  const stderrJson = parseJson(stderr);
  const payload = stderrJson || stdoutJson || {};
  const structured = structuredFailure(stdoutJson, stderrJson, exitCode);
  const message = oneLine(structured.message || (Number(exitCode) !== 0 ? stderr : ""));
  const status = oneLine(structured.status
    || (stderrJson && stderrJson.status)
    || (stdoutJson && stdoutJson.status));
  const code = oneLine(structured.code);
  const httpStatus = Number(structured.http_status || structured.httpStatus || 0) || null;
  const retryAfterValue = structured.retry_after_ms
    ?? structured.retryAfterMs
    ?? structured.retry_after;
  const retryAfter = retryAfterValue === undefined || retryAfterValue === null
    ? Number.NaN
    : Number(retryAfterValue);
  const observation = {
    schema_version: OBSERVER_VERSION,
    adapter: "atlas-paseo-observer",
    action,
    command: `paseo ${action}`,
    source: action === "run" ? "provider" : "paseo-cli",
    channel: action === "run" ? "runtime" : "control",
    exit_code: Number(exitCode),
    status,
    code,
    http_status: httpStatus,
    retry_after_ms: Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : null,
    message,
    observed_at: observedAt || new Date().toISOString(),
    raw_evidence_ref: rawEvidenceRef || "",
    raw_digest: digest(`${stdout || ""}\n---stderr---\n${stderr || ""}`),
  };
  const runtimeAgentId = oneLine(
    payload.runtime_agent_id || payload.agent_id || (payload.agent && payload.agent.id),
  );
  if (runtimeAgentId) observation.runtime_agent_id = runtimeAgentId;
  if (typeof payload.actor_created === "boolean") {
    observation.actor_created = payload.actor_created;
  } else if (action === "run" && payload.agent && payload.agent.id) {
    observation.actor_created = true;
  }
  if (launchOperationId) observation.launch_operation_id = oneLine(launchOperationId);
  Object.assign(observation, classifyPaseoObservation(observation));
  return observation;
}

function observePaseoCommand(action, args, options = {}) {
  if (!ALLOWED_ACTIONS.has(action)) {
    throw new Error(`unsupported Paseo observation action: ${action}`);
  }
  const paseoBin = options.paseoBin || process.env.PASEO_BIN || "paseo";
  const spawn = options.spawnSync || spawnSync;
  let argv = action === "provider-models"
    ? ["provider", "models", ...args]
    : action === "provider-list" ? ["provider", "ls", ...args] : [action, ...args];
  if (action === "run" && options.launchScope) {
    const sanitized = [];
    for (let index = 0; index < argv.length; index += 1) {
      const argument = String(argv[index]);
      if (argument.startsWith("--label=atlas-team-launch=")) continue;
      if (argument === "--label"
        && String(argv[index + 1] || "").startsWith("atlas-team-launch=")) {
        index += 1;
        continue;
      }
      sanitized.push(argv[index]);
    }
    argv = sanitized;
    argv.push("--label", launchLabel(options.launchScope));
  }
  if (!argv.includes("--json")) argv.push("--json");
  let result;
  try {
    result = spawn(paseoBin, argv, {
      cwd: options.cwd || process.cwd(),
      encoding: "utf8",
      env: options.environment || process.env,
    });
  } catch (error) {
    result = { status: null, stdout: "", stderr: error.message, error };
  }
  const exitCode = Number.isInteger(result.status) ? result.status : 127;
  const observation = buildObservation({
    action,
    exitCode,
    stdout: result.stdout || "",
    stderr: result.stderr || (result.error && result.error.message) || "",
    observedAt: options.observedAt,
    rawEvidenceRef: options.rawEvidenceRef,
    launchOperationId: options.launchOperationId,
  });
  if (result.error && result.error.code === "ENOENT") {
    observation.source = "paseo-cli";
    observation.channel = "control";
    observation.code = "ENOENT";
    observation.message = oneLine(result.error.message);
    Object.assign(observation, classifyPaseoObservation(observation));
  }
  return { observation, stderr: result.stderr || "", stdout: result.stdout || "" };
}

function launchLabel(scope) {
  const required = ["taskId", "teamRunId", "attemptId", "launchOperationId"];
  if (!scope || required.some((field) => !scope[field])) {
    throw new Error("launch label requires task, team run, attempt, and launch operation scope");
  }
  const value = required.map((field) => encodeURIComponent(String(scope[field]))).join("/");
  return `atlas-team-launch=${value}`;
}

function reconcileLaunch(filteredAgents) {
  const matches = Array.isArray(filteredAgents) ? filteredAgents : [];
  if (matches.length === 1) return { status: "matched", agent: matches[0] };
  if (matches.length === 0) return { status: "missing", agent: null };
  return { status: "ambiguous", agent: null };
}

module.exports = {
  ALLOWED_ACTIONS,
  OBSERVER_VERSION,
  buildObservation,
  launchLabel,
  observePaseoCommand,
  reconcileLaunch,
};
