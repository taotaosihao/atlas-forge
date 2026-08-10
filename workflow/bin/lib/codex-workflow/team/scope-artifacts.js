"use strict";

const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");
const { CommandError } = require("../core/command-runtime");
const { taskArtifactDir } = require("../core/paths");
const { StableFileError, stableFileSnapshot, stableJsonSnapshot } = require("../core/stable-file");

const MAX_AUTHORITY_ARTIFACT_BYTES = 4 * 1024 * 1024;

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
    if (!fs.existsSync(planFile)) continue;
    const files = {
      brief: path.join(root, "contracts/team-sdd/validators/brief.js"),
      contract: path.join(root, "contracts/team-sdd/validators/implementation-contract.js"),
      intent: path.join(root, "contracts/release-certification/validators/release-intent.js"),
      lint: path.join(root, "scripts/codex-implementation-contract-lint"),
      scope: path.join(root, "contracts/team-sdd/validators/scope-grant.js"),
    };
    for (const [label, file] of Object.entries(files)) {
      if (!fs.existsSync(file)) {
        throw new CommandError(`canonical execution validator root lacks vNext ${label} capability: ${root}`);
      }
    }
    const contracts = {
      ...require(planFile),
      ...require(files.brief),
      ...require(files.contract),
      ...require(files.intent),
      ...require(files.lint),
      ...require(files.scope),
      pluginRoot: fs.realpathSync(root),
    };
    if (contracts.SCOPE_GRANT_CAPABILITY !== "atlas-scope-grant-vnext-1"
      || typeof contracts.canonicalScopeVNext !== "function"
      || typeof contracts.validateContractText !== "function"
      || typeof contracts.scopeDigest !== "function") {
      throw new CommandError(`canonical execution validator root is not vNext capable: ${root}`);
    }
    return contracts;
  }
  throw new CommandError("canonical vNext execution validators are unavailable");
}

function gitOutput(repo, args, label) {
  const result = childProcess.spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new CommandError(`${label}: ${(result.stderr || result.error?.message || "git failed").trim()}`);
  }
  return result.stdout.trim();
}

function repositoryIdentity(brief, cwd) {
  if (!path.isAbsolute(brief.repo || "")) throw new CommandError("vNext brief repo must be absolute");
  const repo = fs.realpathSync(brief.repo);
  if (repo !== brief.repo) throw new CommandError("vNext brief repo must use its canonical realpath");
  const cwdRepo = fs.realpathSync(gitOutput(
    cwd,
    ["rev-parse", "--show-toplevel"],
    "unable to resolve current repository",
  ));
  if (repo !== cwdRepo) throw new CommandError(`brief repo does not match current repository: ${repo} <> ${cwdRepo}`);
  const base = gitOutput(repo, ["rev-parse", "--verify", `${brief.base_sha}^{commit}`], "brief base_sha is invalid");
  if (base !== brief.base_sha) throw new CommandError("vNext brief base_sha must be the canonical commit SHA");
  const ancestor = childProcess.spawnSync("git", ["-C", repo, "merge-base", "--is-ancestor", base, "HEAD"]);
  if (ancestor.status !== 0) throw new CommandError("brief base_sha is not an ancestor of current HEAD");
  return { base, repo };
}

function relativeCanonical(root, file, label) {
  const relative = path.relative(root, file).split(path.sep).join("/");
  if (!relative || relative === ".." || relative.startsWith("../") || path.isAbsolute(relative)) {
    throw new CommandError(`${label} is outside its canonical root`);
  }
  return relative;
}

function snapshotJson(file, label, options = {}) {
  try {
    return stableJsonSnapshot(file, label, {
      maximumBytes: MAX_AUTHORITY_ARTIFACT_BYTES,
      ...options,
    });
  } catch (error) {
    if (error instanceof StableFileError) throw new CommandError(error.message);
    throw error;
  }
}

function snapshotText(file, label, options = {}) {
  try {
    return stableFileSnapshot(file, label, {
      maximumBytes: MAX_AUTHORITY_ARTIFACT_BYTES,
      ...options,
    });
  } catch (error) {
    if (error instanceof StableFileError) throw new CommandError(error.message);
    throw error;
  }
}

function same(left, right, contracts) {
  return contracts.canonicalJson(left) === contracts.canonicalJson(right);
}

function expectedDependencyBindings(plan, slice) {
  const slices = new Map(plan.slices.map((item) => [item.slice_id, item]));
  return slice.depends_on.map((sliceId) => ({
    slice_id: sliceId,
    required_outcome: "succeeded",
    keeper_outputs: slices.get(sliceId).keeper_outputs,
  }));
}

function validateBriefPlanBinding(brief, slice, plan, contract, contracts, label) {
  const bindings = [
    ["objective", brief.objective, slice.objective],
    ["dependencies", brief.dependencies, expectedDependencyBindings(plan, slice)],
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
  for (const [field, actual, expected] of bindings) {
    if (!same(actual, expected, contracts)) throw new CommandError(`${label} ${field} does not match the contract plan`);
  }
  if (brief.contract.path !== contract.path || brief.contract.sha256 !== contract.sha256
    || brief.contract.semantics_version !== contract.semanticsVersion
    || brief.contract.execution_plan_schema_version !== plan.schema_version
    || brief.contract.execution_plan_sha256 !== contract.planSha256
    || !same(brief.contract.authority_slices, contract.authorityIdentities, contracts)
    || !same(brief.contract.release || null, contract.release || null, contracts)
    || (brief.contract.work_type || "") !== (contract.workType || "")) {
    throw new CommandError(`${label} contract identity does not match the stable contract snapshot`);
  }
}

function sizeGateDecision(brief, slice, contracts, label) {
  const overBudget = contracts.estimateOverBudget(slice.estimate, slice.budget, slice.checks)
    || slice.owned_paths.some((owned) => contracts.repositoryBroadPath(owned, { strict: true }));
  if (brief.size_gate?.policy_id !== contracts.POLICY_ID
    || !same(brief.size_gate?.estimate, slice.estimate, contracts)) {
    throw new CommandError(`${label} size gate does not match the execution plan`);
  }
  if (overBudget) {
    if (brief.size_gate.decision !== "exception"
      || !same(brief.size_gate.exception, slice.size_exception, contracts)) {
      throw new CommandError(`${label} requires the exact vNext size exception`);
    }
  } else if (brief.size_gate.decision !== "pass" || brief.size_gate.exception !== null) {
    throw new CommandError(`${label} must carry a passing size gate without exception`);
  }
}

function loadCanonicalScopeArtifacts({ briefPath, cwd, environment, paths, taskId }) {
  const contracts = loadCanonicalExecutionContracts(environment, paths);
  const selectedSnapshot = snapshotJson(briefPath, "Team vNext brief");
  const selectedBrief = selectedSnapshot.value;
  const selectedErrors = contracts.validateBrief(selectedBrief);
  if (selectedErrors.length > 0) throw new CommandError(`Team vNext brief is invalid: ${selectedErrors.join("; ")}`);
  if (selectedBrief.schema_version !== 4) {
    throw new CommandError("execute mutation requires exact Team brief schema_version 4; legacy 1/2/3 are read-only");
  }
  if (selectedBrief.task_id !== taskId) throw new CommandError("Team vNext brief task_id mismatch");
  const taskRoot = taskArtifactDir(paths, taskId);
  const expectedSelected = path.join(
    taskRoot,
    "team", "sdd", "slices", selectedBrief.slice_id, "brief.json",
  );
  if (selectedSnapshot.path !== expectedSelected) {
    throw new CommandError(`Team vNext brief is not at its canonical task path: ${expectedSelected}`);
  }
  const { base, repo } = repositoryIdentity(selectedBrief, cwd);
  const contractSnapshot = snapshotText(selectedBrief.contract.path, "Team vNext contract", { root: repo });
  if (selectedBrief.contract.sha256 !== contractSnapshot.sha256) {
    throw new CommandError("Team vNext contract digest does not match its stable bytes");
  }
  const authoritySlices = selectedBrief.contract.authority_slices.map((identity) => identity.path);
  const semanticValidation = contracts.validateContractText(contractSnapshot.text, {
    authoritySlices,
    expectedTaskId: taskId,
    newAuthoring: true,
    strict: true,
    workflowRoot: paths.root,
  });
  if (!semanticValidation.ok) {
    throw new CommandError(`Team vNext contract full semantic validation failed: ${semanticValidation.diagnostics
      .filter((item) => item.severity === "ERROR")
      .map((item) => `${item.code}: ${item.message}`)
      .join("; ")}`);
  }
  if (!same(
    semanticValidation.authorityIdentities,
    selectedBrief.contract.authority_slices,
    contracts,
  )) {
    throw new CommandError("Team vNext authority slice identities do not match current stable artifacts");
  }
  let parsedContract;
  try {
    parsedContract = contracts.parseImplementationContract(contractSnapshot.text);
  } catch (error) {
    throw new CommandError(`Team vNext implementation contract is invalid: ${error.message}`);
  }
  const semanticsVersion = parsedContract.semanticsVersion;
  if (!new Set([5, 6]).has(semanticsVersion)
    || Number(semanticValidation.version) !== semanticsVersion
    || selectedBrief.contract.semantics_version !== semanticsVersion) {
    throw new CommandError("execute mutation requires exact contract semantics vNext 5 or 6");
  }
  const plan = parsedContract.executionPlan;
  const expectedPlanVersion = semanticsVersion === 6 ? 4 : 3;
  if (plan.schema_version !== expectedPlanVersion
    || selectedBrief.contract.execution_plan_schema_version !== expectedPlanVersion) {
    throw new CommandError("Team vNext contract/plan version matrix is invalid");
  }
  const planSha256 = `sha256:${contracts.sha256Value(plan)}`;
  if (selectedBrief.contract.execution_plan_sha256 !== planSha256) {
    throw new CommandError("Team vNext execution plan digest does not match its stable contract bytes");
  }
  let release = null;
  const releaseIntent = parsedContract.releaseIntent;
  const workType = parsedContract.workType;
  if (semanticsVersion === 6) {
    try {
      release = contracts.releasePlanBinding(releaseIntent);
    } catch (error) {
      throw new CommandError(`Team vNext release contract is invalid: ${error.message}`);
    }
    if (workType !== "implementation" || !same(plan.release, release, contracts)
      || !same(selectedBrief.contract.release, release, contracts)
      || selectedBrief.contract.work_type !== workType) {
      throw new CommandError("Team vNext release plan/brief does not match immutable release intent");
    }
  } else if (plan.release !== undefined || selectedBrief.contract.release !== undefined
    || selectedBrief.contract.work_type !== undefined) {
    throw new CommandError("ordinary semantics-v5 execution cannot carry release fields");
  }
  const requiredSlices = [];
  const snapshots = [];
  for (const slice of plan.slices) {
    const briefFile = path.join(taskRoot, "team", "sdd", "slices", slice.slice_id, "brief.json");
    const snapshot = slice.slice_id === selectedBrief.slice_id
      ? selectedSnapshot
      : snapshotJson(briefFile, `Team vNext brief ${slice.slice_id}`, { root: taskRoot });
    const brief = snapshot.value;
    const errors = contracts.validateBrief(brief);
    if (errors.length > 0) throw new CommandError(`Team vNext brief ${slice.slice_id} is invalid: ${errors.join("; ")}`);
    if (brief.schema_version !== 4 || brief.task_id !== taskId || brief.slice_id !== slice.slice_id
      || brief.repo !== repo || brief.base_sha !== base) {
      throw new CommandError(`Team vNext brief identity mismatch: ${slice.slice_id}`);
    }
    validateBriefPlanBinding(brief, slice, plan, {
      path: contractSnapshot.path,
      planSha256,
      release,
      semanticsVersion,
      sha256: contractSnapshot.sha256,
      authorityIdentities: semanticValidation.authorityIdentities,
      workType,
    }, contracts, `Team vNext brief ${slice.slice_id}`);
    sizeGateDecision(brief, slice, contracts, `Team vNext brief ${slice.slice_id}`);
    snapshots.push({ path: snapshot.path, sha256: snapshot.sha256, stat: snapshot.stat });
    requiredSlices.push({
      slice_id: slice.slice_id,
      objective: slice.objective,
      brief_path: relativeCanonical(taskRoot, snapshot.path, `Team vNext brief ${slice.slice_id}`),
      brief_sha256: snapshot.sha256,
      depends_on: [...slice.depends_on],
      keeper_outputs: [...slice.keeper_outputs],
      owned_paths: [...slice.owned_paths],
      forbidden_paths: [...(slice.forbidden_paths || [])],
      acceptance_refs: [...slice.acceptance_refs],
      estimate: { ...slice.estimate },
      budget: { ...slice.budget },
      checks: slice.checks.map((check) => ({
        check_id: check.check_id,
        gate_class: check.gate_class,
        command: check.command,
        final_only: check.final_only,
        cache_policy: check.cache_policy,
        release_requirement: check.release_requirement || null,
      })),
    });
  }
  return {
    artifacts: {
      contract: {
        path: contractSnapshot.path,
        relativePath: relativeCanonical(repo, contractSnapshot.path, "Team vNext contract"),
        sha256: contractSnapshot.sha256,
        stat: contractSnapshot.stat,
      },
      plan,
      planSha256,
      requiredSlices,
      snapshots,
    },
    contracts,
    release,
    releaseIntent,
    repo,
    selectedBrief,
    selectedSnapshot,
    semanticsVersion,
    authorityIdentities: semanticValidation.authorityIdentities,
    workType,
  };
}

function buildCanonicalScope({
  authorizationRef,
  briefPath,
  cwd,
  environment,
  evidencePolicy,
  grantId,
  objective,
  parent,
  paths,
  requireObjectiveMatchesSelected = true,
  taskId,
}) {
  const loaded = loadCanonicalScopeArtifacts({ briefPath, cwd, environment, paths, taskId });
  const authorization = loaded.contracts.parseAuthorityRef(authorizationRef);
  if (requireObjectiveMatchesSelected && objective !== loaded.selectedBrief.objective) {
    throw new CommandError("scope objective must equal the selected canonical slice objective");
  }
  const raw = {
    schema_version: 1,
    grant_id: grantId,
    task_id: taskId,
    repo: { realpath: loaded.repo, base_sha: loaded.selectedBrief.base_sha },
    objective,
    contract: {
      path: loaded.artifacts.contract.relativePath,
      sha256: loaded.artifacts.contract.sha256,
      semantics_version: loaded.semanticsVersion,
      authority_slices: loaded.authorityIdentities,
    },
    execution_plan: {
      schema_version: loaded.artifacts.plan.schema_version,
      sha256: loaded.artifacts.planSha256,
    },
    owned_paths: [...new Set(
      loaded.artifacts.requiredSlices.flatMap((slice) => slice.owned_paths),
    )],
    forbidden_paths: [...new Set(
      loaded.artifacts.requiredSlices.flatMap((slice) => slice.forbidden_paths),
    )],
    required_slices: loaded.artifacts.requiredSlices,
    size_exceptions: [],
    scope_core_digest: `sha256:${"0".repeat(64)}`,
    authorization_provenance: authorization,
    release_binding: loaded.release,
    parent: parent ? { grant_id: parent.grant_id, scope_digest: parent.scope_digest } : null,
    supersedes_grant_id: parent ? parent.grant_id : null,
    evidence_policy: evidencePolicy,
    design_handoff: null,
    first_code: null,
  };
  const canonicalCore = loaded.contracts.canonicalScopeVNext(raw, {
    skipCoreDigestCheck: true,
  });
  raw.scope_core_digest = loaded.contracts.scopeCoreDigest(canonicalCore);
  raw.size_exceptions = loaded.artifacts.plan.slices.flatMap((slice) => {
    if (!slice.size_exception) return [];
    if (slice.size_exception.authority_ref !== authorization.ref) {
      throw new CommandError(
        `size exception authority must equal the controller grant authority for ${slice.slice_id}`,
      );
    }
    return [{
      task_id: taskId,
      slice_id: slice.slice_id,
      grant_id: grantId,
      scope_core_digest: raw.scope_core_digest,
      authority: authorization,
      expires_at: slice.size_exception.expires_at,
      reason: slice.size_exception.reason,
      compensating_controls: [...slice.size_exception.compensating_controls],
    }];
  });
  let scope;
  try {
    scope = loaded.contracts.canonicalScopeVNext(raw);
  } catch (error) {
    throw new CommandError(`canonical vNext scope is invalid: ${error.message}`);
  }
  return {
    ...loaded,
    scope,
    scopeDigest: loaded.contracts.scopeDigest(scope),
  };
}

function assertCanonicalGrantArtifacts({ briefPath, environment, grant, paths, taskId }) {
  const loaded = buildCanonicalScope({
    authorizationRef: grant.authorization_provenance.ref,
    briefPath,
    cwd: grant.scope.repo.realpath,
    environment,
    evidencePolicy: grant.scope.evidence_policy,
    grantId: grant.grant_id,
    objective: grant.scope.objective,
    parent: grant.scope.parent,
    paths,
    requireObjectiveMatchesSelected: false,
    taskId,
  });
  if (loaded.scopeDigest !== grant.scope_digest
    || loaded.contracts.canonicalJson(loaded.scope)
      !== loaded.contracts.canonicalJson(grant.scope)) {
    throw new CommandError("current execution grant no longer matches its canonical artifacts");
  }
  return loaded;
}

module.exports = {
  MAX_AUTHORITY_ARTIFACT_BYTES,
  assertCanonicalGrantArtifacts,
  buildCanonicalScope,
  loadCanonicalExecutionContracts,
  loadCanonicalScopeArtifacts,
};
