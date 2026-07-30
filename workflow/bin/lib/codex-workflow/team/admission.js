"use strict";

const childProcess = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { CommandError } = require("../core/command-runtime");
const { taskArtifactDir } = require("../core/paths");
const { readAuthoritativeEvents } = require("../core/event-store");
const { taskEventFile } = require("../core/task-mutation");
const { captureWorktreeSnapshot: captureRepositorySnapshot } = require("../core/worktree-snapshot");
const { pathsOverlap } = require("./lane-registry");
const { sha256 } = require("../verification/identity");
const { validateGateRecord } = require("../verification/required-gates");

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SHA256 = /^sha256:([a-f0-9]{64})$/;
const PERMANENT_GATES = new Set([
  "auth", "permission", "security", "data-consistency", "migration", "backup",
  "restore", "served-ui", "browser-flow", "install", "postflight",
  "release-identity", "collision", "downgrade", "symlink", "exact-layout",
]);
const SIZE_POLICY_ID = "atlas-slice-size-v2";

function pluginCandidates(environment, paths) {
  return [
    environment.ATLAS_WORKFLOW_PLUGIN_ROOT,
    paths.codeHome && path.join(paths.codeHome, "plugins", "atlas-workflow"),
    path.join(path.resolve(__dirname, "../../../../.."), "plugins", "atlas-workflow"),
  ].filter(Boolean);
}

function loadCanonicalExecutionContracts(environment, paths) {
  for (const root of pluginCandidates(environment, paths)) {
    const planFile = path.join(root, "contracts/team-sdd/validators/execution-plan.js");
    const intentFile = path.join(root, "contracts/release-certification/validators/release-intent.js");
    if (fs.existsSync(planFile) && fs.existsSync(intentFile)) {
      return {
        ...require(planFile),
        ...require(intentFile),
      };
    }
  }
  return null;
}

function pathPrefix(raw) {
  if (typeof raw !== "string" || !raw.trim() || raw.startsWith("/") || raw.includes("\\")) return "";
  const normalized = raw.replace(/^\.\//, "").replace(/\/+/g, "/");
  if (normalized.split("/").includes("..")) return "";
  const segments = [];
  for (const segment of normalized.split("/")) {
    if (segment === "**" || /[*?\[\]{}]/.test(segment)) break;
    segments.push(segment);
  }
  return segments.join("/");
}

function repositoryBroadPath(raw) {
  const prefix = pathPrefix(raw);
  if (!prefix) return true;
  const normalized = String(raw).replace(/^\.\//, "").replace(/\/+$/g, "");
  if (normalized === "." || normalized === "**" || normalized === "**/*") return true;
  return /[*?\[\]{}]/.test(normalized) && prefix.split("/").length <= 1;
}

function estimateOverBudget(estimate, budget, checks) {
  return estimate.estimated_changed_files > budget.max_changed_files
    || estimate.estimated_net_loc > budget.max_loc
    || estimate.target_p90_minutes > budget.max_wall_clock_minutes
    || estimate.serial_dependency_depth > 2
    || estimate.independent_vertical_count > 1
    || checks.length > budget.max_required_checks;
}

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
  if (plan.schema_version !== 1 || plan.size_policy?.policy_id !== SIZE_POLICY_ID
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
      || !slice.estimate || !slice.budget) {
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
  const depths = new Map();
  function dependencyDepth(sliceId) {
    if (depths.has(sliceId)) return depths.get(sliceId);
    const dependencies = slices.get(sliceId).depends_on;
    const depth = dependencies.length === 0
      ? 0
      : 1 + Math.max(...dependencies.map(dependencyDepth));
    depths.set(sliceId, depth);
    return depth;
  }
  for (const slice of plan.slices) {
    if (slice.estimate.serial_dependency_depth !== dependencyDepth(slice.slice_id)) {
      throw new CommandError(
        `contract execution plan has an incorrect serial dependency depth for ${slice.slice_id}`,
      );
    }
  }
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
  if (!brief.contract || ![3, 4].includes(brief.contract.semantics_version)) {
    throw new CommandError("execute Team start requires a semantics-v3 or semantics-v4 contract binding");
  }
}

function gitOutput(repo, args, label) {
  const result = childProcess.spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new CommandError(`${label}: ${(result.stderr || result.error?.message || "git failed").trim()}`);
  }
  return result.stdout.trim();
}

function captureWorktreeSnapshot(repo) {
  const snapshot = captureRepositorySnapshot(repo);
  return {
    ...snapshot,
    worktree_manifest_digest: `sha256:${digestValue(snapshot)}`,
  };
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

function validateContractBinding(brief, repo, environment, paths) {
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
  const semanticsMatch = /^contract_semantics_version:\s*(\d+)\s*$/m.exec(markdown);
  const semanticsVersion = semanticsMatch ? Number(semanticsMatch[1]) : 1;
  if (semanticsVersion !== brief.contract.semantics_version || ![3, 4].includes(semanticsVersion)) {
    throw new CommandError("brief contract semantics version does not match a supported execution contract");
  }
  let plan;
  let workType = null;
  if (semanticsVersion === 4) {
    const contracts = loadCanonicalExecutionContracts(environment, paths);
    if (!contracts) throw new CommandError("canonical release execution validators are unavailable");
    let intent;
    try {
      workType = contracts.extractContractWorkType(markdown);
      intent = contracts.extractReleaseIntent(markdown);
      plan = contracts.extractExecutionPlan(markdown);
    } catch (error) {
      throw new CommandError(`semantics-v4 release contract is invalid: ${error.message}`);
    }
    const expectedRelease = intent.target_delivery_class === "product_release"
      ? contracts.releasePlanBinding(intent)
      : null;
    if (!same(plan.release || null, expectedRelease)) {
      throw new CommandError("contract release plan does not match the immutable release intent/Profile binding");
    }
    if (!same(brief.contract.release || null, expectedRelease)) {
      throw new CommandError("brief release binding does not match the contract release plan");
    }
    if (brief.contract.work_type !== workType) {
      throw new CommandError("brief work_type does not match the hash-bound contract");
    }
  } else {
    plan = executionPlan(markdown);
    if (brief.contract.release !== undefined) {
      throw new CommandError("semantics-v3 brief cannot carry a release binding");
    }
    if (brief.contract.work_type !== undefined) {
      throw new CommandError("semantics-v3 brief cannot carry work_type");
    }
  }
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
    ["size gate estimate", brief.size_gate?.estimate, slice.estimate],
    ["budget", brief.budget, slice.budget],
    ["checks", brief.checks, slice.checks],
  ];
  for (const [label, actual, expected] of bindings) {
    if (!same(actual, expected)) throw new CommandError(`brief ${label} does not match the contract plan`);
  }
  return { contractDigest, contractFile, plan, planDigest, workType };
}

function validateSizeGate(brief, clock) {
  const gate = brief.size_gate;
  if (!gate || gate.policy_id !== SIZE_POLICY_ID) throw new CommandError("brief size_gate is invalid");
  const budgetKeys = [
    "max_changed_files", "max_loc", "max_wall_clock_minutes", "max_required_checks",
  ];
  if (!brief.budget || Object.keys(brief.budget).sort().join(",")
      !== [...budgetKeys].sort().join(",")
    || budgetKeys.some((key) => !Number.isInteger(brief.budget[key]) || brief.budget[key] < 1)) {
    throw new CommandError("brief size budget is invalid");
  }
  const estimateKeys = [
    "estimated_changed_files", "estimated_net_loc", "target_p90_minutes",
    "serial_dependency_depth", "independent_vertical_count",
  ];
  if (!gate.estimate || Object.keys(gate.estimate).sort().join(",") !== [...estimateKeys].sort().join(",")
    || estimateKeys.some((key) => !Number.isInteger(gate.estimate[key])
      || gate.estimate[key] < (key === "serial_dependency_depth" ? 0 : 1))) {
    throw new CommandError("brief size gate estimate is invalid");
  }
  if ((brief.dependencies || []).length > 0 && gate.estimate.serial_dependency_depth < 1) {
    throw new CommandError("brief serial dependency depth cannot be zero when dependencies exist");
  }
  const overBudget = estimateOverBudget(gate.estimate, brief.budget, brief.checks || [])
    || brief.owned_paths.some(repositoryBroadPath);
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

function validateDependencies(paths, brief, options = {}) {
  const events = readAuthoritativeEvents(taskEventFile(paths, brief.task_id), brief.task_id);
  for (const dependency of brief.dependencies || []) {
    const terminal = events.filter((event) => (
      new Set(["slice.accepted", "slice.superseded"]).has(event.kind)
      && (event.result?.accepted?.slice_id || event.data?.slice_id) === dependency.slice_id
    )).at(-1);
    if (!terminal || terminal.kind !== "slice.accepted") {
      throw new CommandError(`dependency is not keeper-ready succeeded: ${dependency.slice_id}`);
    }
    const accepted = terminal.result?.accepted;
    if (!accepted || accepted.task_id !== brief.task_id
      || accepted.contract_sha256 !== brief.contract.sha256
      || accepted.execution_plan_sha256 !== brief.contract.execution_plan_sha256
      || accepted.status !== "accepted"
      || !SAFE_ID.test(accepted.team_run_id || "")
      || !Number.isInteger(accepted.generation) || accepted.generation < 1
      || accepted.authority_ref !== `team-run:${accepted.team_run_id}`
      || accepted.revision !== terminal.revision
      || !/^sha256:[a-f0-9]{64}$/.test(accepted.brief_sha256 || "")
      || !Array.isArray(accepted.keeper_outputs) || accepted.keeper_outputs.length === 0
      || accepted.keeper_outputs.some((keeper) => (
        !keeper || typeof keeper.reference !== "string" || !keeper.reference
        || typeof keeper.path !== "string" || !keeper.path
        || !/^sha256:[a-f0-9]{64}$/.test(keeper.content_digest || "")
      ))
      || !Array.isArray(accepted.verification_records)
      || accepted.verification_records.length === 0
      || new Set(accepted.verification_records.map((record) => record?.check_id)).size
        !== accepted.verification_records.length
      || accepted.verification_records.some((record) => (
        !record || !SAFE_ID.test(record.check_id || "")
        || !/^sha256:[a-f0-9]{64}$/.test(record.record_id || "")
        || record.record_digest !== record.record_id
        || !/^sha256:[a-f0-9]{64}$/.test(record.identity_digest || "")
        || record.outcome !== "passed" || record.provenance !== "fresh-executed"
      ))) {
      throw new CommandError(`dependency authoritative acceptance is invalid: ${dependency.slice_id}`);
    }
    const matchingRunEvent = events.slice(0, events.indexOf(terminal) + 1).findLast((event) => {
      const team = event.kind === "team.started" ? event.result?.team : null;
      return team?.team_run_id === accepted.team_run_id
        && team?.generation === accepted.generation
        && team?.slice_id === dependency.slice_id
        && team?.admission?.brief?.sha256 === accepted.brief_sha256
        && team?.admission?.brief?.slice_id === dependency.slice_id
        && team?.admission?.brief?.contract_sha256 === accepted.contract_sha256
        && team?.admission?.brief?.execution_plan_sha256 === accepted.execution_plan_sha256;
    });
    if (!matchingRunEvent) {
      throw new CommandError(`dependency Team generation is not authoritative: ${dependency.slice_id}`);
    }
    const dependencyAdmission = matchingRunEvent.result.team.admission;
    if (!dependencyAdmission?.slice_start_snapshot?.head_sha
      || !dependencyAdmission.slice_start_snapshot.tree_oid) {
      throw new CommandError(`dependency Team admission snapshot is invalid: ${dependency.slice_id}`);
    }
    const dependencyBriefPath = path.join(
      taskArtifactDir(paths, brief.task_id), "team", "sdd", "slices", dependency.slice_id, "brief.json",
    );
    const dependencyBriefFile = canonicalFile(dependencyBriefPath, "dependency Team brief");
    const dependencyBrief = readJson(dependencyBriefFile, "dependency Team brief");
    if (`sha256:${digestFile(dependencyBriefFile)}` !== accepted.brief_sha256
      || dependencyBrief.task_id !== brief.task_id
      || dependencyBrief.slice_id !== dependency.slice_id
      || dependencyBrief.contract?.sha256 !== accepted.contract_sha256
      || dependencyBrief.contract?.execution_plan_sha256 !== accepted.execution_plan_sha256) {
      throw new CommandError(`dependency brief identity is invalid: ${dependency.slice_id}`);
    }
    const recordByCheck = new Map(accepted.verification_records.map((record) => [record.check_id, record]));
    if (recordByCheck.size !== dependencyBrief.checks.length
      || accepted.verification_records.length !== recordByCheck.size) {
      throw new CommandError(`dependency verification coverage is invalid: ${dependency.slice_id}`);
    }
    for (const expected of dependencyBrief.checks) {
      const record = recordByCheck.get(expected.check_id);
      const verificationEvent = events.find((event) => (
        event.event_id === record?.verification_event_id
        && event.revision === record?.verification_revision
      ));
      const projectedGate = terminal.projection?.state?.verification?.required_gates?.[expected.check_id];
      const expectedGate = {
        admission_head_sha: dependencyAdmission.slice_start_snapshot.head_sha,
        admission_tree_oid: dependencyAdmission.slice_start_snapshot.tree_oid,
        base_sha: dependencyBrief.base_sha,
        brief_sha256: accepted.brief_sha256,
        cache_policy: expected.cache_policy,
        check_id: expected.check_id,
        command_digest: sha256(expected.command),
        contract_sha256: accepted.contract_sha256,
        execution_plan_sha256: accepted.execution_plan_sha256,
        final_only: expected.final_only,
        gate_class: expected.gate_class,
        repo_realpath: brief.repo,
        slice_id: dependency.slice_id,
      };
      if (!record || record.slice_id !== dependency.slice_id
        || record.contract_sha256 !== accepted.contract_sha256
        || record.execution_plan_sha256 !== accepted.execution_plan_sha256
        || record.brief_sha256 !== accepted.brief_sha256
        || record.gate_class !== expected.gate_class
        || record.command_digest !== expectedGate.command_digest
        || record.cache_policy !== expected.cache_policy
        || record.final_only !== expected.final_only
        || record.repo_realpath !== brief.repo
        || record.outcome !== "passed" || record.provenance !== "fresh-executed"
        || !verificationEvent || verificationEvent.kind !== "verification.recorded"
        || verificationEvent.revision >= terminal.revision
        || verificationEvent.data?.record_id !== record.record_id
        || verificationEvent.data?.identity_digest !== record.identity_digest
        || verificationEvent.data?.required_gate?.check_id !== expected.check_id
        || projectedGate?.record_id !== record.record_id
        || projectedGate?.identity_digest !== record.identity_digest) {
        throw new CommandError(
          `dependency verification evidence is invalid: ${dependency.slice_id}/${expected.check_id}`,
        );
      }
      const gateReasons = [];
      const identity = validateGateRecord(
        paths,
        brief.task_id,
        expectedGate,
        projectedGate,
        {
          captureIdentity: options.captureIdentity,
          environment: options.environment || process.env,
          validateCurrentIdentity: options.validateCurrentIdentity !== false,
        },
        gateReasons,
      );
      if (!identity || identity.record_id !== record.record_id || gateReasons.length > 0) {
        throw new CommandError(
          `dependency verification identity is invalid: ${dependency.slice_id}/${expected.check_id}: ` +
            gateReasons.join("; "),
        );
      }
    }
    const outputs = new Map((accepted.keeper_outputs || []).map((item) => [item.reference, item]));
    for (const required of dependency.keeper_outputs || []) {
      const keeper = outputs.get(required);
      if (!keeper) {
        throw new CommandError(`dependency keeper output is missing for ${dependency.slice_id}: ${required}`);
      }
      const file = path.resolve(brief.repo, keeper.path || "");
      const relative = path.relative(brief.repo, file);
      if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new CommandError(`dependency keeper output escapes repository: ${required}`);
      }
      let stat;
      try {
        stat = fs.lstatSync(file);
      } catch (error) {
        if (error.code === "ENOENT") {
          throw new CommandError(`dependency keeper output is missing on disk: ${required}`);
        }
        throw error;
      }
      if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(file) !== file
        || `sha256:${digestFile(file)}` !== keeper.content_digest) {
        throw new CommandError(`dependency keeper output digest mismatch: ${required}`);
      }
      if (!pathMatchesOwned(keeper.path, dependencyBrief.owned_paths)
        || !(accepted.actual_size?.changed_paths || []).includes(keeper.path)) {
        throw new CommandError(`dependency keeper output is not owned slice output: ${required}`);
      }
    }
  }
}

function pathMatchesOwned(candidate, patterns) {
  return (patterns || []).some((raw) => {
    const normalized = String(raw || "").replace(/^\.\//, "").replace(/\\/g, "/");
    let expression = "";
    for (let index = 0; index < normalized.length; index += 1) {
      const character = normalized[index];
      if (character === "*" && normalized[index + 1] === "*") {
        expression += ".*";
        index += 1;
      } else if (character === "*") {
        expression += "[^/]*";
      } else if (character === "?") {
        expression += "[^/]";
      } else {
        expression += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
      }
    }
    return new RegExp(`^${expression}$`).test(candidate);
  });
}

function activeWriterLeases(paths, excludedTaskId = "") {
  if (!fs.existsSync(paths.artifactsDir)) return [];
  const leases = [];
  for (const entry of fs.readdirSync(paths.artifactsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === excludedTaskId) continue;
    const stateFile = path.join(paths.artifactsDir, entry.name, "state.json");
    const eventFile = taskEventFile(paths, entry.name);
    if (!fs.existsSync(eventFile) && !fs.existsSync(stateFile)) continue;
    let state;
    if (fs.existsSync(eventFile)) {
      const events = readAuthoritativeEvents(eventFile, entry.name);
      const latest = events.at(-1);
      if (!latest) {
        throw new CommandError(`authoritative task event stream is empty: ${entry.name}`);
      }
      state = latest.projection.state;
    } else {
      state = readJson(stateFile, `legacy task state ${entry.name}`);
    }
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

function admitTeamStart({ briefPath, captureIdentity, clock, cwd, environment, mode, paths, taskId }) {
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
  const binding = validateContractBinding(brief, repo, environment, paths);
  if (mode === "execute" && binding.plan.release && binding.workType !== "implementation") {
    throw new CommandError(
      "product_release Team execution requires work_type implementation; planning and review may discuss but cannot certify",
    );
  }
  validateSizeGate(brief, clock);
  validateDependencies(paths, brief, {
    captureIdentity,
    environment,
    validateCurrentIdentity: true,
  });
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
      ...(binding.workType ? { work_type: binding.workType } : {}),
      ...(binding.plan.release ? { release: binding.plan.release } : {}),
      base_sha: brief.base_sha,
      repo,
    },
    admitted_owned_paths: [...brief.owned_paths],
    required_slices: binding.plan.slices.map((slice) => slice.slice_id),
    slice_start_snapshot: captureWorktreeSnapshot(repo),
  };
}

function briefRequestIdentity(briefPath) {
  if (!briefPath) {
    return {
      brief_path: "",
      brief_sha256: "",
      contract_sha256: "",
      execution_plan_sha256: "",
    };
  }
  const file = canonicalFile(briefPath, "Team brief");
  const brief = readJson(file, "Team brief");
  return {
    brief_path: file,
    brief_sha256: `sha256:${digestFile(file)}`,
    contract_sha256: String(brief.contract?.sha256 || ""),
    execution_plan_sha256: String(brief.contract?.execution_plan_sha256 || ""),
  };
}

function bindExecutionAuthority(state, admission, revision) {
  if (admission?.mode !== "execution-v3") return state.execution_authority || null;
  const requested = {
    schema_version: 1,
    status: "active",
    contract_path: admission.brief.contract_path,
    contract_sha256: admission.brief.contract_sha256,
    execution_plan_sha256: admission.brief.execution_plan_sha256,
    repo_realpath: admission.brief.repo,
    required_slices: [...admission.required_slices],
    ...(admission.brief.work_type ? { work_type: admission.brief.work_type } : {}),
    ...(admission.brief.release ? { release_binding: admission.brief.release } : {}),
  };
  const existing = state.execution_authority;
  if (existing) {
    if (existing.schema_version !== 1
      || !new Set(["active", "completed"]).has(existing.status)) {
      throw new CommandError("task execution authority has an invalid persistent state");
    }
    for (const field of [
      "contract_path", "contract_sha256", "execution_plan_sha256", "repo_realpath", "work_type",
    ]) {
      if (existing[field] !== requested[field]) {
        throw new CommandError(
          "task execution authority is already bound to another contract; explicit replan is required",
        );
      }
    }
    if (!same(existing.release_binding || null, requested.release_binding || null)) {
      throw new CommandError(
        "task execution authority release binding changed; explicit replan is required",
      );
    }
    if (!same(existing.required_slices, requested.required_slices)) {
      throw new CommandError(
        "task execution authority slice set changed; explicit replan is required",
      );
    }
    if (existing.status === "completed") {
      const { completed_at: completedAt = "", ...rest } = existing;
      state.execution_authority = {
        ...rest,
        status: "active",
        ...(completedAt ? {
          completion: {
            completed_at: completedAt,
            completed_revision: Number(existing.completed_revision || existing.established_revision || 0),
          },
        } : {}),
      };
    }
    return state.execution_authority;
  }
  state.execution_authority = {
    ...requested,
    established_revision: revision,
  };
  return state.execution_authority;
}

module.exports = {
  admitTeamStart,
  assertNoGlobalWriterOverlap,
  bindExecutionAuthority,
  briefRequestIdentity,
  captureWorktreeSnapshot,
  globalAdmissionLockFile,
  validateDependencies,
  validateTeamWriterAdmission,
};
