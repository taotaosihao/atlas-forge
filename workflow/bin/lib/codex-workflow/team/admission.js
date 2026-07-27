"use strict";

const childProcess = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { CommandError } = require("../core/command-runtime");
const { taskArtifactDir } = require("../core/paths");
const { pathsOverlap } = require("./lane-registry");

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SHA256 = /^sha256:([a-f0-9]{64})$/;
const PERMANENT_GATES = new Set([
  "auth", "permission", "security", "data-consistency", "migration", "backup",
  "restore", "served-ui", "browser-flow", "install", "postflight",
  "release-identity", "collision", "downgrade", "symlink", "exact-layout",
]);
const TERMINAL_SLICE_EVENTS = new Set([
  "slice_complete", "slice_blocked", "slice_superseded", "slice_abandoned",
]);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function digestValue(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

function digestFile(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function canonicalFile(file, label) {
  const resolved = path.resolve(file || "");
  let stat;
  try {
    stat = fs.lstatSync(resolved);
  } catch (error) {
    if (error.code === "ENOENT") throw new CommandError(`${label} is missing: ${resolved}`);
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(resolved) !== resolved) {
    throw new CommandError(`${label} must be a canonical regular non-symlink file: ${resolved}`);
  }
  return resolved;
}

function readJson(file, label) {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("expected an object");
    }
    return value;
  } catch (error) {
    throw new CommandError(`${label} is invalid JSON: ${error.message}`);
  }
}

function executionPlan(markdown) {
  const pattern = /^```atlas-execution-plan\+json[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm;
  const matches = [...String(markdown).matchAll(pattern)];
  if (matches.length !== 1) {
    throw new CommandError(`contract must contain exactly one atlas-execution-plan+json block; found ${matches.length}`);
  }
  let plan;
  try {
    plan = JSON.parse(matches[0][1]);
  } catch (error) {
    throw new CommandError(`contract execution plan is invalid JSON: ${error.message}`);
  }
  if (plan.schema_version !== 1 || plan.size_policy?.policy_id !== "atlas-slice-size-v1"
    || !Array.isArray(plan.slices) || plan.slices.length === 0) {
    throw new CommandError("contract execution plan has an invalid v1 envelope");
  }
  const ids = new Set();
  const acceptanceOwners = new Set();
  const checkOwners = new Set();
  for (const slice of plan.slices) {
    if (!slice || !SAFE_ID.test(slice.slice_id || "") || ids.has(slice.slice_id)) {
      throw new CommandError("contract execution plan has an invalid or duplicate slice_id");
    }
    if (!slice.objective || !Array.isArray(slice.depends_on)
      || !Array.isArray(slice.keeper_outputs) || slice.keeper_outputs.length === 0
      || !Array.isArray(slice.owned_paths) || slice.owned_paths.length === 0
      || !Array.isArray(slice.acceptance_refs) || slice.acceptance_refs.length === 0
      || !Array.isArray(slice.checks) || slice.checks.length === 0
      || !slice.budget) {
      throw new CommandError(`contract execution plan has an incomplete slice: ${slice.slice_id || "unknown"}`);
    }
    for (const ref of slice.acceptance_refs) {
      if (acceptanceOwners.has(ref)) throw new CommandError(`contract execution plan has duplicate acceptance ownership: ${ref}`);
      acceptanceOwners.add(ref);
    }
    for (const check of slice.checks) {
      if (!check || !SAFE_ID.test(check.check_id || "") || checkOwners.has(check.check_id)) {
        throw new CommandError("contract execution plan has an invalid or duplicate check_id");
      }
      checkOwners.add(check.check_id);
      if (PERMANENT_GATES.has(check.gate_class) && check.cache_policy !== "fresh-executed") {
        throw new CommandError(`permanent gate ${check.gate_class} must be fresh-executed`);
      }
    }
    ids.add(slice.slice_id);
  }
  for (const slice of plan.slices) {
    if (!Array.isArray(slice.depends_on)
      || slice.depends_on.some((dependency) => dependency === slice.slice_id || !ids.has(dependency))) {
      throw new CommandError(`contract execution plan has invalid dependencies for ${slice.slice_id}`);
    }
  }
  for (let left = 0; left < plan.slices.length; left += 1) {
    for (let right = left + 1; right < plan.slices.length; right += 1) {
      for (const leftPath of plan.slices[left].owned_paths) {
        for (const rightPath of plan.slices[right].owned_paths) {
          if (pathsOverlap(leftPath, rightPath)) {
            throw new CommandError(
              `contract execution plan has overlapping slice ownership: ${leftPath} <> ${rightPath}`,
            );
          }
        }
      }
    }
  }
  const slices = new Map(plan.slices.map((slice) => [slice.slice_id, slice]));
  const visiting = new Set();
  const visited = new Set();
  function visit(sliceId) {
    if (visiting.has(sliceId)) throw new CommandError(`contract execution plan has a dependency cycle at ${sliceId}`);
    if (visited.has(sliceId)) return;
    visiting.add(sliceId);
    for (const dependency of slices.get(sliceId).depends_on) visit(dependency);
    visiting.delete(sliceId);
    visited.add(sliceId);
  }
  for (const sliceId of ids) visit(sliceId);
  return plan;
}

function same(left, right) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function requireBriefShape(brief, taskId) {
  if (brief.schema_version !== 3) throw new CommandError("execute Team start requires brief schema_version 3");
  if (brief.task_id !== taskId) throw new CommandError(`brief task_id does not match Team task: ${brief.task_id}`);
  if (!SAFE_ID.test(brief.slice_id || "")) throw new CommandError("brief slice_id must be a safe identifier");
  if (!Array.isArray(brief.owned_paths) || brief.owned_paths.length === 0) {
    throw new CommandError("brief owned_paths must be non-empty");
  }
  if (!Array.isArray(brief.forbidden_paths)) throw new CommandError("brief forbidden_paths must be an array");
  for (const owned of brief.owned_paths) {
    for (const forbidden of brief.forbidden_paths) {
      if (pathsOverlap(owned, forbidden)) {
        throw new CommandError(`brief owned path overlaps forbidden path: ${owned} <> ${forbidden}`);
      }
    }
  }
  if (!brief.contract || brief.contract.semantics_version !== 3) {
    throw new CommandError("execute Team start requires a semantics-v3 contract binding");
  }
}

function gitOutput(repo, args, label) {
  const result = childProcess.spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new CommandError(`${label}: ${(result.stderr || result.error?.message || "git failed").trim()}`);
  }
  return result.stdout.trim();
}

function validateRepository(brief, cwd) {
  if (!path.isAbsolute(brief.repo || "")) throw new CommandError("brief repo must be absolute");
  const repo = fs.realpathSync(brief.repo);
  const cwdRepo = fs.realpathSync(gitOutput(cwd, ["rev-parse", "--show-toplevel"], "unable to resolve current repository"));
  if (repo !== cwdRepo) throw new CommandError(`brief repo does not match current repository: ${repo} <> ${cwdRepo}`);
  const base = gitOutput(repo, ["rev-parse", "--verify", `${brief.base_sha}^{commit}`], "brief base_sha is invalid");
  const ancestor = childProcess.spawnSync("git", ["-C", repo, "merge-base", "--is-ancestor", base, "HEAD"]);
  if (ancestor.status !== 0) throw new CommandError("brief base_sha is not an ancestor of current HEAD");
  return repo;
}

function validateContractBinding(brief, repo) {
  const contractFile = canonicalFile(brief.contract.path, "brief contract");
  const relative = path.relative(repo, contractFile);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new CommandError("brief contract must be inside the admitted repository");
  }
  const contractDigest = digestFile(contractFile);
  const expectedContract = SHA256.exec(brief.contract.sha256 || "");
  if (!expectedContract || expectedContract[1] !== contractDigest) {
    throw new CommandError("brief contract sha256 does not match the contract file");
  }
  const markdown = fs.readFileSync(contractFile, "utf8");
  if (!/^contract_semantics_version:\s*3\s*$/m.test(markdown)) {
    throw new CommandError("brief contract file is not semantics version 3");
  }
  const plan = executionPlan(markdown);
  const expectedPlan = SHA256.exec(brief.contract.execution_plan_sha256 || "");
  const planDigest = digestValue(plan);
  if (!expectedPlan || expectedPlan[1] !== planDigest) {
    throw new CommandError("brief execution_plan_sha256 does not match the contract plan");
  }
  const slice = plan.slices.find((item) => item.slice_id === brief.slice_id);
  if (!slice) throw new CommandError(`brief slice is absent from the contract plan: ${brief.slice_id}`);
  const slices = new Map(plan.slices.map((item) => [item.slice_id, item]));
  const dependencies = slice.depends_on.map((sliceId) => ({
    slice_id: sliceId,
    required_outcome: "succeeded",
    keeper_outputs: slices.get(sliceId).keeper_outputs,
  }));
  const bindings = [
    ["objective", brief.objective, slice.objective],
    ["dependencies", brief.dependencies, dependencies],
    ["keeper_outputs", brief.keeper_outputs, slice.keeper_outputs],
    ["owned_paths", brief.owned_paths, slice.owned_paths],
    ["forbidden_paths", brief.forbidden_paths, slice.forbidden_paths || []],
    ["acceptance_refs", brief.acceptance_refs, slice.acceptance_refs],
    ["risk_class", brief.risk_class, slice.risk_class],
    ["failure_domain", brief.failure_domain, slice.failure_domain],
    ["rollback_boundary", brief.rollback_boundary, slice.rollback_boundary],
    ["budget", brief.budget, slice.budget],
    ["checks", brief.checks, slice.checks],
  ];
  for (const [label, actual, expected] of bindings) {
    if (!same(actual, expected)) throw new CommandError(`brief ${label} does not match the contract plan`);
  }
  return { contractDigest, contractFile, planDigest };
}

function validateSizeGate(brief, clock) {
  const gate = brief.size_gate;
  if (!gate || gate.policy_id !== "atlas-slice-size-v1") throw new CommandError("brief size_gate is invalid");
  const measured = {
    changed_files: brief.owned_paths.length,
    loc: 0,
    wall_clock_minutes: 0,
    required_checks: (brief.checks || []).length,
  };
  if (!same(gate.measured, measured)) {
    throw new CommandError("brief size gate measurements do not match the admitted slice");
  }
  const overBudget = measured.changed_files > brief.budget.max_changed_files
    || measured.required_checks > brief.budget.max_required_checks;
  if (gate.decision === "split_required") throw new CommandError("brief size gate requires the slice to be split");
  if (gate.decision === "pass") {
    if (overBudget) throw new CommandError("over-budget brief requires a named size exception");
    if (gate.exception !== null) throw new CommandError("passing size gate cannot carry an exception");
  } else if (gate.decision === "exception") {
    if (!overBudget) throw new CommandError("size exception is only valid for an over-budget slice");
    const exception = gate.exception;
    if (!exception || !exception.authority_ref || !exception.reason
      || !Array.isArray(exception.compensating_controls) || exception.compensating_controls.length === 0
      || typeof exception.expires_at !== "string" || Number.isNaN(Date.parse(exception.expires_at))) {
      throw new CommandError("size exception must name authority, expiry, reason, and compensating controls");
    }
    const clockValue = clock();
    const now = clockValue instanceof Date ? clockValue : new Date(clockValue);
    if (Date.parse(exception.expires_at) <= now.getTime()) throw new CommandError("size exception has expired");
  } else {
    throw new CommandError(`invalid size gate decision: ${gate.decision}`);
  }
  for (const check of brief.checks || []) {
    if (PERMANENT_GATES.has(check.gate_class) && check.cache_policy !== "fresh-executed") {
      throw new CommandError(`permanent gate ${check.gate_class} must be fresh-executed`);
    }
  }
}

function readLedger(paths, taskId) {
  const file = path.join(taskArtifactDir(paths, taskId), "team", "sdd", "progress.jsonl");
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new CommandError(`invalid Team SDD ledger row ${index + 1}: ${error.message}`);
    }
  });
}

function validateDependencies(paths, brief) {
  const events = readLedger(paths, brief.task_id);
  for (const dependency of brief.dependencies || []) {
    const terminal = events.filter((event) => event.slice_id === dependency.slice_id
      && TERMINAL_SLICE_EVENTS.has(event.event)).at(-1);
    if (!terminal || terminal.event !== "slice_complete" || terminal.outcome !== "succeeded") {
      throw new CommandError(`dependency is not keeper-ready succeeded: ${dependency.slice_id}`);
    }
    const outputs = new Set(terminal.keeper_outputs || []);
    for (const required of dependency.keeper_outputs || []) {
      if (!outputs.has(required)) {
        throw new CommandError(`dependency keeper output is missing for ${dependency.slice_id}: ${required}`);
      }
    }
  }
}

function activeWriterLeases(paths, excludedTaskId = "") {
  if (!fs.existsSync(paths.artifactsDir)) return [];
  const leases = [];
  for (const entry of fs.readdirSync(paths.artifactsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === excludedTaskId) continue;
    const stateFile = path.join(paths.artifactsDir, entry.name, "state.json");
    if (!fs.existsSync(stateFile)) continue;
    const state = readJson(stateFile, `task state ${entry.name}`);
    const team = state.active_team && typeof state.active_team === "object" ? state.active_team : {};
    for (const lease of team.writer_leases || []) {
      if (lease.state === "active") leases.push({ ...lease, task_id: entry.name });
    }
  }
  return leases;
}

function assertNoGlobalWriterOverlap(paths, taskId, candidatePaths) {
  for (const lease of activeWriterLeases(paths, taskId)) {
    for (const requested of candidatePaths || []) {
      for (const existing of lease.paths || []) {
        if (pathsOverlap(requested, existing)) {
          throw new CommandError(`global writer lease conflict with ${lease.task_id}: ${requested} <> ${existing}`);
        }
      }
    }
  }
}

function validateTeamWriterAdmission(paths, taskId, team) {
  const admitted = team.admitted_owned_paths || [];
  const active = (team.writer_leases || []).filter((lease) => lease.state === "active");
  for (const lease of active) {
    for (const leasePath of lease.paths || []) {
      if (!admitted.some((scope) => (
        leasePath === scope
        || (scope.endsWith("/**") && (
          leasePath === scope.slice(0, -3)
          || leasePath.startsWith(`${scope.slice(0, -3)}/`)
        ))
      ))) {
        throw new CommandError(`writer lease path is outside the admitted brief: ${leasePath}`);
      }
    }
  }
  assertNoGlobalWriterOverlap(paths, taskId, active.flatMap((lease) => lease.paths || []));
}

function globalAdmissionLockFile(paths) {
  return path.join(paths.stateDir, ".team-execution-admission.lock");
}

function admitTeamStart({ briefPath, clock, cwd, mode, paths, taskId }) {
  if (mode === "discuss") {
    if (!briefPath) return { mode: "discuss-compat", brief: null, admitted_owned_paths: [] };
  } else if (!briefPath) {
    throw new CommandError("execute Team start requires --brief");
  }
  if (!briefPath) return { mode: "discuss-compat", brief: null, admitted_owned_paths: [] };
  const file = canonicalFile(briefPath, "Team brief");
  const brief = readJson(file, "Team brief");
  requireBriefShape(brief, taskId);
  const expected = path.join(taskArtifactDir(paths, taskId), "team", "sdd", "slices", brief.slice_id, "brief.json");
  if (file !== expected) throw new CommandError(`Team brief is not at its canonical task path: ${expected}`);
  const repo = validateRepository(brief, cwd);
  const binding = validateContractBinding(brief, repo);
  validateSizeGate(brief, clock);
  validateDependencies(paths, brief);
  assertNoGlobalWriterOverlap(paths, taskId, brief.owned_paths);
  return {
    mode: mode === "execute" ? "execution-v3" : "discuss-v3",
    brief: {
      path: file,
      sha256: `sha256:${digestFile(file)}`,
      slice_id: brief.slice_id,
      contract_path: binding.contractFile,
      contract_sha256: `sha256:${binding.contractDigest}`,
      execution_plan_sha256: `sha256:${binding.planDigest}`,
      base_sha: brief.base_sha,
    },
    admitted_owned_paths: [...brief.owned_paths],
  };
}

module.exports = {
  admitTeamStart,
  assertNoGlobalWriterOverlap,
  globalAdmissionLockFile,
  validateTeamWriterAdmission,
};
