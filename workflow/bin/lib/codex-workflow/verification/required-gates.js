"use strict";

const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const { taskArtifactDir } = require("../core/paths");
const { readAuthoritativeEvents } = require("../core/event-store");
const { stableFileSnapshot, stableJsonSnapshot } = require("../core/stable-file");
const { captureWorktreeSnapshot } = require("../core/worktree-snapshot");
const { executionAuthorityTeam } = require("../team/execution-authority-event");
const {
  assertActiveExecutionGrant,
  currentGrant,
  executionHistoryRequired,
  validateAuthorityEnvelope,
} = require("../team/execution-grant");
const {
  captureVerificationIdentity,
  digestCanonical,
  identityInputPaths,
  sha256,
} = require("./identity");
const {
  evaluateReleaseSweep,
  resolveValidatedReleaseIntent,
} = require("./release-certification");

const PERMANENT_FRESH_GATE_CLASSES = new Set([
  "auth", "permission", "security", "data-consistency", "migration", "backup",
  "restore", "served-ui", "browser-flow", "install", "postflight",
  "release-identity", "collision", "downgrade", "symlink", "exact-layout",
]);
const REQUIRED_GATE_BINDING_FIELDS = [
  "check_id", "slice_id", "contract_sha256", "execution_plan_sha256", "brief_sha256",
  "gate_class", "command_digest", "cache_policy", "final_only", "repo_realpath", "base_sha",
  "admission_head_sha", "admission_tree_oid",
  "grant_id", "scope_digest", "evidence_epoch",
];

class RequiredGateError extends Error {
  constructor(message) {
    super(message);
    this.name = "RequiredGateError";
  }
}

function inProgressVerificationClaims(state, authority = null) {
  const claims = Array.isArray(state?.verification?.operation_claims)
    ? state.verification.operation_claims
    : [];
  return claims.filter((claim) => {
    if (claim?.status !== "in_progress") return false;
    if (!authority) return true;
    const identity = claim.authority_identity;
    return identity?.grant_id === authority.grant_id
      && identity.scope_digest === authority.scope_digest
      && identity.evidence_epoch === authority.evidence_epoch;
  });
}

function indeterminateClaimsForRequiredCheck(state, expected) {
  const claims = Array.isArray(state?.verification?.operation_claims)
    ? state.verification.operation_claims
    : [];
  return claims.filter((claim) => {
    if (claim?.status !== "indeterminate" || !claim.authority_identity) return false;
    const authority = claim.authority_identity;
    const binding = claim.required_check_binding;
    return authority.grant_id === expected.grant_id
      && authority.scope_digest === expected.scope_digest
      && authority.evidence_epoch === expected.evidence_epoch
      && binding?.check_id === expected.check_id
      && binding.slice_id === expected.slice_id
      && binding.gate_class === expected.gate_class
      && binding.command_digest === expected.command_digest;
  });
}

function readJson(file, label) {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("expected an object");
    }
    return value;
  } catch (error) {
    throw new RequiredGateError(`${label} is invalid JSON: ${error.message}`);
  }
}

function canonicalFile(file, label) {
  const resolved = path.resolve(file || "");
  let stat;
  try {
    stat = fs.lstatSync(resolved);
  } catch (error) {
    if (error.code === "ENOENT") throw new RequiredGateError(`${label} is missing: ${resolved}`);
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(resolved) !== resolved) {
    throw new RequiredGateError(`${label} must be a canonical regular non-symlink file: ${resolved}`);
  }
  return resolved;
}

function canonicalDirectory(directory, label) {
  const resolved = path.resolve(directory || "");
  let stat;
  try {
    stat = fs.lstatSync(resolved);
  } catch (error) {
    if (error.code === "ENOENT") throw new RequiredGateError(`${label} is missing: ${resolved}`);
    throw error;
  }
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(resolved) !== resolved) {
    throw new RequiredGateError(`${label} must be a canonical non-symlink directory: ${resolved}`);
  }
  return resolved;
}

function repositoryRoot(cwd, label) {
  const result = childProcess.spawnSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) {
    throw new RequiredGateError(
      `${label}: ${(result.stderr || result.error?.message || "git failed").trim()}`,
    );
  }
  return fs.realpathSync(result.stdout.trim());
}

function repositoryHead(repo, label) {
  const result = childProcess.spawnSync(
    "git", ["-C", repo, "rev-parse", "--verify", "HEAD^{commit}"], { encoding: "utf8" },
  );
  if (result.error || result.status !== 0) {
    throw new RequiredGateError(
      `${label}: ${(result.stderr || result.error?.message || "git failed").trim()}`,
    );
  }
  return result.stdout.trim();
}

function admittedExecutionBrief(paths, taskId, state, requested = {}, options = {}) {
  const team = state.active_team && typeof state.active_team === "object"
    ? state.active_team
    : {};
  const admission = team.admission && typeof team.admission === "object"
    ? team.admission
    : {};
  const identity = admission.brief && typeof admission.brief === "object"
    ? admission.brief
    : null;
  if (admission.mode !== "execution-vnext" || !identity) return null;
  const snapshot = admission.slice_start_snapshot;
  if (!snapshot || typeof snapshot.head_sha !== "string" || !snapshot.head_sha
    || typeof snapshot.tree_oid !== "string" || !snapshot.tree_oid) {
    throw new RequiredGateError("admitted Team is missing its slice-start repository snapshot");
  }
  const file = canonicalFile(identity.path, "admitted Team brief");
  if (requested.briefPath && path.resolve(requested.briefPath) !== file) {
    throw new RequiredGateError("verification brief does not match the admitted Team brief");
  }
  let briefSnapshot;
  try {
    briefSnapshot = stableJsonSnapshot(file, "admitted Team brief", { maximumBytes: 4 * 1024 * 1024 });
  } catch (error) {
    throw new RequiredGateError(error.message);
  }
  const brief = briefSnapshot.value;
  if (brief.schema_version !== 4 || brief.task_id !== taskId) {
    throw new RequiredGateError("admitted Team brief task or schema mismatch");
  }
  const expected = path.join(
    taskArtifactDir(paths, taskId), "team", "sdd", "slices", brief.slice_id, "brief.json",
  );
  if (file !== expected) throw new RequiredGateError(`admitted Team brief is not canonical: ${expected}`);
  if (requested.sliceId && requested.sliceId !== brief.slice_id) {
    throw new RequiredGateError(`verification slice does not match admitted slice: ${brief.slice_id}`);
  }
  const briefSha256 = briefSnapshot.sha256;
  if (briefSha256 !== identity.sha256) {
    throw new RequiredGateError("admitted Team brief sha256 no longer matches");
  }
  if (brief.slice_id !== identity.slice_id
    || brief.contract?.sha256 !== identity.contract_sha256
    || brief.contract?.execution_plan_sha256 !== identity.execution_plan_sha256
    || brief.contract?.work_type !== identity.work_type) {
    throw new RequiredGateError("admitted Team brief contract identity no longer matches");
  }
  if (brief.contract?.release && brief.contract.work_type !== "implementation") {
    throw new RequiredGateError(
      "release verification requires admitted work_type implementation",
    );
  }
  const contractFile = canonicalFile(brief.contract.path, "admitted implementation contract");
  let contractSnapshot;
  try {
    contractSnapshot = stableFileSnapshot(contractFile, "admitted implementation contract", {
      maximumBytes: 4 * 1024 * 1024,
      root: brief.repo,
    });
  } catch (error) {
    throw new RequiredGateError(error.message);
  }
  if (contractSnapshot.sha256 !== identity.contract_sha256) {
    throw new RequiredGateError("admitted implementation contract sha256 no longer matches");
  }
  const repo = canonicalDirectory(brief.repo, "admitted repository");
  if (identity.repo && identity.repo !== repo) {
    throw new RequiredGateError("admitted Team repository identity no longer matches");
  }
  const grant = assertActiveExecutionGrant(state, {
    evidenceEpoch: admission.evidence_epoch,
    grantId: admission.grant_id,
    scopeDigest: admission.scope_digest,
    sliceId: brief.slice_id,
    briefSha256,
  }, {
    clock: options.clock,
    requireUnexpired: Boolean(options.requireUnexpired),
  });
  if (team.grant_id !== grant.grant_id || team.scope_digest !== grant.scope_digest
    || team.evidence_epoch !== grant.evidence_epoch) {
    throw new RequiredGateError("admitted Team grant identity is no longer current");
  }
  return {
    admission,
    brief,
    briefSha256,
    contractFile,
    contractSnapshot,
    file,
    grant,
    identity,
    repo,
    team,
  };
}

function bindRequiredCheck({ clock, commandText, cwd, parsed, paths, state }) {
  const requested = [parsed.briefPath, parsed.sliceId, parsed.checkId].filter(Boolean);
  if (requested.length > 0 && requested.length !== 3) {
    throw new RequiredGateError("bound verification requires --brief, --slice-id, and --check-id together");
  }
  if (requested.length === 0) return null;
  const context = admittedExecutionBrief(paths, parsed.taskId, state, {
    briefPath: parsed.briefPath,
    sliceId: parsed.sliceId,
  }, {
    clock,
    requireUnexpired: true,
  });
  if (!context) throw new RequiredGateError("bound verification requires an admitted execution-vnext Team");
  const actualRepo = repositoryRoot(cwd, "unable to resolve verification repository");
  if (actualRepo !== context.repo) {
    throw new RequiredGateError(
      `verification repository does not match admitted brief: ${actualRepo} <> ${context.repo}`,
    );
  }
  const currentHead = repositoryHead(actualRepo, "unable to resolve verification HEAD");
  if (currentHead !== context.admission.slice_start_snapshot.head_sha) {
    throw new RequiredGateError(
      "verification HEAD does not match the admitted slice-start HEAD; pause and replan",
    );
  }
  const scopeSlice = context.grant.scope.required_slices.find(
    (item) => item.slice_id === context.brief.slice_id,
  );
  const check = (scopeSlice?.checks || []).find((item) => item.check_id === parsed.checkId);
  if (!check) throw new RequiredGateError(`verification check is not declared by the admitted brief: ${parsed.checkId}`);
  if (commandText !== check.command) {
    throw new RequiredGateError(`verification command does not match check ${check.check_id}`);
  }
  if (parsed.gateClassProvided && parsed.gateClass !== check.gate_class) {
    throw new RequiredGateError(`verification gate class does not match check ${check.check_id}`);
  }
  return {
    admission_head_sha: context.admission.slice_start_snapshot.head_sha,
    admission_tree_oid: context.admission.slice_start_snapshot.tree_oid,
    brief_sha256: context.briefSha256,
    cache_policy: check.cache_policy,
    base_sha: context.brief.base_sha,
    check_id: check.check_id,
    command_digest: sha256(commandText),
    contract_sha256: context.identity.contract_sha256,
    execution_plan_sha256: context.identity.execution_plan_sha256,
    evidence_epoch: context.grant.evidence_epoch,
    final_only: check.final_only,
    gate_class: check.gate_class,
    grant_id: context.grant.grant_id,
    repo_realpath: context.repo,
    scope_digest: context.grant.scope_digest,
    slice_id: context.brief.slice_id,
    ...(check.release_requirement ? { release_requirement: check.release_requirement } : {}),
  };
}

function resolveCodeHomeReference(paths, reference) {
  return path.isAbsolute(reference) ? reference : path.resolve(paths.codeHome, reference);
}

function exactBinding(value, label, reasons, { history = false } = {}) {
  const fields = history
    ? ["grant_id", "scope_digest", "evidence_epoch", "retention_revision"]
    : ["grant_id", "scope_digest", "evidence_epoch"];
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())
    || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value.grant_id || "")
    || !/^sha256:[a-f0-9]{64}$/.test(value.scope_digest || "")
    || !Number.isInteger(value.evidence_epoch) || value.evidence_epoch < 1
    || (history && (!Number.isInteger(value.retention_revision)
      || value.retention_revision < 1))) {
    reasons.push(`${label} is invalid`);
    return null;
  }
  return value;
}

function sameBinding(left, right) {
  return left?.grant_id === right?.grant_id
    && left?.scope_digest === right?.scope_digest
    && left?.evidence_epoch === right?.evidence_epoch;
}

function projectedReceipt(event, receiptType, receipt) {
  if (receiptType === "verification") {
    return event.projection?.state?.verification?.required_gates?.[receipt.check_id];
  }
  return event.projection?.state?.slice_acceptances?.[receipt.slice_id];
}

function validateRetainedReceipt(
  paths,
  taskId,
  expected,
  receipt,
  options,
  reasons,
  receiptType = "verification",
) {
  const retentionFields = [
    "origin_binding", "retained_from", "retention_history", "retention_revision",
  ];
  const hasRetention = retentionFields.some((field) => Object.hasOwn(receipt || {}, field));
  if (!hasRetention) return { identityExpected: expected, retained: false };
  const label = `${receiptType} receipt ${receipt?.record_id || receipt?.operation_id || "unknown"}`;
  const origin = exactBinding(receipt.origin_binding, `${label} origin binding`, reasons);
  const immediate = exactBinding(receipt.retained_from, `${label} retained-from binding`, reasons);
  if (!Array.isArray(receipt.retention_history) || receipt.retention_history.length === 0) {
    reasons.push(`${label} retention history is invalid`);
    return { identityExpected: expected, retained: true };
  }
  const history = receipt.retention_history.map((entry, index) => exactBinding(
    entry,
    `${label} retention history[${index}]`,
    reasons,
    { history: true },
  ));
  if (!origin || !immediate || history.some((entry) => !entry)) {
    return { identityExpected: expected, retained: true };
  }
  if (!sameBinding(origin, history[0])
    || !sameBinding(immediate, history.at(-1))
    || receipt.retention_revision !== history.at(-1).retention_revision) {
    reasons.push(`${label} retention endpoints are inconsistent`);
  }
  let events = options.authorityEvents;
  if (!events) {
    try {
      events = readAuthoritativeEvents(
        path.join(taskArtifactDir(paths, taskId), "events-v2.jsonl"), taskId,
      );
    } catch (error) {
      reasons.push(`${label} authoritative retention history is unavailable: ${error.message}`);
      return {
        identityExpected: { ...expected, ...origin },
        retained: true,
      };
    }
  }
  const receiptId = receiptType === "verification" ? receipt.record_id : receipt.operation_id;
  for (let index = 0; index < history.length; index += 1) {
    const source = history[index];
    const event = events.find((candidate) => candidate.revision === source.retention_revision);
    const transition = event?.authority_transition;
    const decision = transition?.evidence?.retained?.find((candidate) => (
      candidate.receipt_id === receiptId && candidate.type === receiptType
      && candidate.reason === "explicit-compatible-retention"
    ));
    const nextBinding = index + 1 < history.length ? history[index + 1] : expected;
    const rebound = projectedReceipt(event || {}, receiptType, receipt);
    if (event?.kind !== "authority.replanned"
      || transition?.type !== "grant-replanned"
      || transition.old_grant_id !== source.grant_id
      || transition.old_scope_digest !== source.scope_digest
      || transition.old_evidence_epoch !== source.evidence_epoch
      || !sameBinding(transition.new_grant, nextBinding)
      || !decision
      || !sameBinding(rebound, transition.new_grant)) {
      reasons.push(`${label} retention event ${source.retention_revision} is invalid`);
      continue;
    }
    if (index === history.length - 1 && digestCanonical(rebound) !== digestCanonical(receipt)) {
      reasons.push(`${label} does not match its authoritative retained projection`);
    }
  }
  return {
    identityExpected: { ...expected, ...origin },
    retained: true,
  };
}

function validateGateRecord(paths, taskId, expected, gate, options, reasons) {
  options = options || {};
  const initialReasonCount = reasons.length;
  if (!gate || typeof gate !== "object") {
    reasons.push(`missing required verification gate: ${expected.check_id}`);
    return null;
  }
  for (const field of REQUIRED_GATE_BINDING_FIELDS) {
    if (gate[field] !== expected[field]) {
      reasons.push(`required verification gate ${expected.check_id} has mismatched ${field}`);
    }
  }
  const retention = validateRetainedReceipt(
    paths, taskId, expected, gate, options, reasons, "verification",
  );
  const identityExpected = retention.identityExpected;
  if (digestCanonical(gate.release_requirement || null)
    !== digestCanonical(expected.release_requirement || null)) {
    reasons.push(`required verification gate ${expected.check_id} has mismatched release_requirement`);
  }
  if (gate.outcome !== "passed" || gate.provenance !== "fresh-executed") {
    reasons.push(`required verification gate ${expected.check_id} is not a fresh executed pass`);
  }
  if (PERMANENT_FRESH_GATE_CLASSES.has(expected.gate_class)
    && gate.provenance !== "fresh-executed") {
    reasons.push(`permanent gate ${expected.check_id} must be fresh-executed`);
  }
  let record = null;
  try {
    record = readJson(resolveCodeHomeReference(paths, gate.identity_record), "verification identity record");
    const withoutId = { ...record };
    delete withoutId.record_id;
    if (record.schema_version !== 3 || record.task_id !== taskId
      || record.record_id !== digestCanonical(withoutId)
      || record.identity_digest !== digestCanonical(record.identity || {})) {
      reasons.push(`required verification gate ${expected.check_id} identity record is invalid`);
    }
    if (record.record_id !== gate.record_id || record.record_id !== gate.record_digest
      || record.identity_digest !== gate.identity_digest) {
      reasons.push(`required verification gate ${expected.check_id} record pointer mismatch`);
    }
    for (const field of REQUIRED_GATE_BINDING_FIELDS) {
      if (record.required_gate?.[field] !== identityExpected[field]) {
        reasons.push(`required verification gate ${expected.check_id} record mismatches ${field}`);
      }
    }
    if (digestCanonical(record.required_gate?.release_requirement || null)
      !== digestCanonical(expected.release_requirement || null)) {
      reasons.push(`required verification gate ${expected.check_id} record mismatches release_requirement`);
    }
    if (record.verdict !== "passed" || record.outcome !== "passed"
      || record.provenance !== "fresh-executed" || record.snapshot_stable !== true) {
      reasons.push(`required verification gate ${expected.check_id} identity is not a stable pass`);
    }
    const identityRepo = record.identity?.repo_root_realpath;
    const identityCwd = record.identity?.cwd_realpath;
    const cwdRelative = typeof identityCwd === "string"
      ? path.relative(expected.repo_realpath, identityCwd)
      : "..";
    if (identityRepo !== expected.repo_realpath
      || cwdRelative === ".." || cwdRelative.startsWith(`..${path.sep}`)
      || path.isAbsolute(cwdRelative)) {
      reasons.push(`required verification gate ${expected.check_id} ran outside the admitted repository`);
    }
    if (record.identity?.head_commit !== expected.admission_head_sha) {
      reasons.push(`required verification gate ${expected.check_id} ran at the wrong admitted HEAD`);
    }
    if (!/^[a-f0-9]{40}$/.test(record.identity?.worktree?.tree_oid || "")) {
      reasons.push(`required verification gate ${expected.check_id} is missing its candidate tree`);
    }
    if (!/^[a-f0-9]{40}$/.test(gate.candidate_tree_oid || "")
      || gate.candidate_tree_oid !== record.required_gate?.candidate_tree_oid
      || gate.candidate_tree_oid !== record.identity?.worktree?.tree_oid) {
      reasons.push(`required verification gate ${expected.check_id} candidate tree binding is invalid`);
    }
    const ancestor = childProcess.spawnSync(
      "git", ["-C", expected.repo_realpath, "merge-base", "--is-ancestor", expected.base_sha, "HEAD"],
    );
    if (ancestor.status !== 0) {
      reasons.push(`required verification gate ${expected.check_id} base is no longer an ancestor`);
    }
    if (repositoryHead(expected.repo_realpath, "unable to resolve current verification HEAD")
      !== expected.admission_head_sha) {
      reasons.push(`required verification gate ${expected.check_id} HEAD advanced after admission`);
    }
    if (reasons.length === initialReasonCount && options.validateCurrentIdentity !== false) {
      const captureIdentity = options.captureIdentity || captureVerificationIdentity;
      const current = captureIdentity({
        argv: record.identity.argv,
        cwd: record.identity.cwd_realpath,
        environment: options.environment || process.env,
        inputPaths: identityInputPaths(record.identity),
      });
      if (current.identityDigest !== record.identity_digest) {
        reasons.push(`required verification gate ${expected.check_id} no longer matches the current snapshot`);
      }
    }
  } catch (error) {
    reasons.push(`unable to validate required gate ${expected.check_id}: ${error.message}`);
  }
  return record;
}

function validateDeliveryAuthority(events, authority, targetAuthorityRef, reasons) {
  if (!authority?.formal_product_release) return;
  const delivery = authority.delivery_authority;
  const authorityRef = delivery?.ref;
  const revision = Number(delivery?.established_revision || 0);
  if (!/^(?:user-message|operator-input):[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(authorityRef || "")
    || authorityRef !== targetAuthorityRef || !Number.isInteger(revision) || revision < 1) {
    reasons.push("release delivery authority is unresolved or is not controller-originated");
    return;
  }
  const event = events.find((candidate) => candidate.revision === revision);
  const initial = authority.grants?.[0];
  if (!event || event.kind !== "authority.grant.issued"
    || event.authority_transition?.type !== "grant-issued"
    || event.authority_transition?.grant?.grant_id !== initial?.grant_id
    || event.authority_transition?.delivery_authority?.ref !== authorityRef
    || delivery.contract_sha256 !== initial?.scope?.contract?.sha256
    || delivery.execution_plan_sha256 !== initial?.scope?.execution_plan?.sha256
    || digestCanonical(delivery.release_binding || null)
      !== digestCanonical(initial?.scope?.release_binding || null)
    || event.projection?.state?.execution_authority?.delivery_authority?.ref !== authorityRef
    || event.projection?.state?.execution_authority?.delivery_authority?.established_revision
      !== revision) {
    reasons.push("release delivery authority is not bound to its authoritative controller event");
  }
}

function releaseSweepRequired(checks) {
  return (checks || []).some((check) => Boolean(check?.release_requirement));
}

function requiredGateAdmission(paths, taskId, state, options = {}) {
  const context = admittedExecutionBrief(paths, taskId, state, {}, {
    clock: options.clock,
    requireUnexpired: true,
  });
  if (!context) return null;
  const verification = state.verification && typeof state.verification === "object"
    ? state.verification
    : {};
  const gates = verification.required_gates && typeof verification.required_gates === "object"
    ? verification.required_gates
    : {};
  const reasons = [];
  const records = [];
  let authorityEvents = [];
  try {
    authorityEvents = readAuthoritativeEvents(
      path.join(taskArtifactDir(paths, taskId), "events-v2.jsonl"), taskId,
    );
    let targetAuthorityRef = "";
    if (context.brief.contract.release) {
      targetAuthorityRef = resolveValidatedReleaseIntent({
        contractMarkdown: context.contractSnapshot.text,
        environment: options.environment || process.env,
        paths,
        releaseBinding: context.brief.contract.release,
      }).intent.target_delivery_authority_ref;
    }
    validateDeliveryAuthority(
      authorityEvents, state.execution_authority, targetAuthorityRef, reasons,
    );
  } catch (error) {
    reasons.push(`unable to validate release delivery authority: ${error.message}`);
  }
  const scopeSlice = context.grant.scope.required_slices.find(
    (slice) => slice.slice_id === context.brief.slice_id,
  );
  const expectedChecks = (scopeSlice?.checks || []).map((check) => ({
    admission_head_sha: context.admission.slice_start_snapshot.head_sha,
    admission_tree_oid: context.admission.slice_start_snapshot.tree_oid,
    base_sha: context.brief.base_sha,
    brief_sha256: context.briefSha256,
    cache_policy: check.cache_policy,
    check_id: check.check_id,
    command_digest: sha256(check.command),
    contract_sha256: context.identity.contract_sha256,
    execution_plan_sha256: context.identity.execution_plan_sha256,
    evidence_epoch: context.grant.evidence_epoch,
    final_only: check.final_only,
    gate_class: check.gate_class,
    grant_id: context.grant.grant_id,
    repo_realpath: context.repo,
    scope_digest: context.grant.scope_digest,
    slice_id: context.brief.slice_id,
    ...(check.release_requirement ? { release_requirement: check.release_requirement } : {}),
  }));
  for (const expected of expectedChecks) {
    const indeterminateClaims = indeterminateClaimsForRequiredCheck(state, expected);
    if (indeterminateClaims.length > 0) {
      reasons.push(
        `required verification gate ${expected.check_id} is blocked by indeterminate ` +
          `execution in the current authority epoch: ${indeterminateClaims
            .map((claim) => claim.operation_id).join(", ")}`,
      );
      continue;
    }
    const record = validateGateRecord(
      paths,
      taskId,
      expected,
      gates[expected.check_id],
      { ...options, authorityEvents },
      reasons,
    );
    if (record) records.push(record);
  }
  const candidateTrees = new Set(records
    .map((record) => record.required_gate?.candidate_tree_oid)
    .filter(Boolean));
  if (records.length > 0 && candidateTrees.size !== 1) {
    reasons.push("required verification gates do not bind one immutable candidate tree");
  }
  const nonFinalRevision = Math.max(0, ...expectedChecks
    .filter((check) => !check.final_only)
    .map((check) => Number(gates[check.check_id]?.event_revision || 0)));
  for (const expected of expectedChecks.filter((check) => check.final_only)) {
    if (Number(gates[expected.check_id]?.event_revision || 0) <= nonFinalRevision) {
      reasons.push(`final-only verification gate ${expected.check_id} was not executed last`);
    }
  }
  let releaseCertification = null;
  const hasReleaseRequirements = releaseSweepRequired(expectedChecks);
  if (context.brief.contract.release && hasReleaseRequirements && reasons.length === 0) {
    let snapshot;
    try {
      snapshot = captureWorktreeSnapshot(context.repo);
      const evaluateSweep = options.evaluateReleaseSweep || evaluateReleaseSweep;
      releaseCertification = evaluateSweep({
        contractMarkdown: context.contractSnapshot.text,
        evidenceEpoch: context.grant.evidence_epoch,
        environment: options.environment || process.env,
        grantId: context.grant.grant_id,
        paths,
        receipts: records.map((record) => gates[record.required_gate.check_id]),
        releaseBinding: context.brief.contract.release,
        repo: context.repo,
        snapshot,
        scopeDigest: context.grant.scope_digest,
        taskId,
        workType: context.brief.contract.work_type,
      });
      if (!releaseCertification.admissible) {
        reasons.push(...releaseCertification.reasons.map((reason) => `release final sweep: ${reason}`));
      }
    } catch (error) {
      reasons.push(`unable to evaluate release final sweep: ${error.message}`);
    }
  }
  const releaseByCheck = new Map(
    (releaseCertification?.receiptSummaries || []).map((item) => [item.check_id, item]),
  );
  if (releaseCertification?.admissible
    && releaseCertification.decision?.status !== "certified") {
    reasons.push(
      `release final sweep is not certified: ${releaseCertification.decision?.status || "missing"}`,
    );
  }
  return {
    candidateTreeOid: candidateTrees.size === 1 ? [...candidateTrees][0] : "",
    identityDigest: records.length === 1 ? records[0].identity_digest : "",
    passed: reasons.length === 0,
    reasons,
    recordId: records.length === 1 ? records[0].record_id : "",
    recordIds: records.map((record) => record.record_id),
    releaseCertification,
    ...(releaseCertification ? { releaseDecision: releaseCertification.decision || null } : {}),
    verificationRecords: records.map((record) => {
      const gate = gates[record.required_gate?.check_id] || {};
      const release = releaseByCheck.get(record.required_gate?.check_id);
      return {
        ...gate,
        ...(release ? {
          release_fact_id: release.fact_id,
          release_fact_outcome: release.outcome,
          candidate_manifest_digest: release.candidate_manifest_digest,
        } : {}),
      };
    }),
    required: true,
  };
}

function executionCompletionAdmission(paths, taskId, state, options = {}) {
  const authority = state.execution_authority;
  let events = [];
  try {
    events = readAuthoritativeEvents(
      path.join(taskArtifactDir(paths, taskId), "events-v2.jsonl"),
      taskId,
    );
  } catch (error) {
    return {
      passed: false,
      reasons: [`unable to load authoritative execution history: ${error.message}`],
      required: true,
    };
  }
  if (!authority || typeof authority !== "object") {
    if (!executionHistoryRequired(events)) return null;
    return {
      passed: false,
      reasons: ["formal execution history exists but current execution authority is missing"],
      required: true,
    };
  }
  const reasons = [];
  if (authority.schema_version !== 2) {
    return {
      passed: false,
      reasons: ["legacy or unknown execution authority is read-only and cannot authorize completion"],
      required: true,
    };
  }
  let grant;
  try {
    validateAuthorityEnvelope(authority);
    grant = currentGrant(authority);
  } catch (error) {
    return {
      passed: false,
      reasons: [`current execution authority is invalid: ${error.message}`],
      required: true,
    };
  }
  if (!grant || grant.status !== "active") {
    return {
      passed: false,
      reasons: ["task execution authority has no current active grant"],
      required: true,
    };
  }
  const scope = grant.scope;
  if (scope.first_code?.status === "required"
    && authority.first_code?.status !== "satisfied") {
    reasons.push("first-code acceptance is not satisfied for the current execution grant");
  }
  let repo = "";
  let plan = null;
  let contractMarkdown = "";
  let targetAuthorityRef = "";
  try {
    repo = canonicalDirectory(scope.repo.realpath, "execution authority repository");
    if (repo !== scope.repo.realpath) reasons.push("execution authority repository mismatch");
    const contractFile = canonicalFile(
      path.resolve(repo, scope.contract.path),
      "execution authority contract",
    );
    const relative = path.relative(repo, contractFile);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      reasons.push("execution authority contract is outside the admitted repository");
    }
    const contractSnapshot = stableFileSnapshot(contractFile, "execution authority contract", {
      maximumBytes: 4 * 1024 * 1024,
      root: repo,
    });
    if (contractSnapshot.sha256 !== scope.contract.sha256) {
      reasons.push("execution authority contract sha256 no longer matches");
    }
    contractMarkdown = contractSnapshot.text;
    const matches = [...contractMarkdown.matchAll(
      /^```atlas-execution-plan\+json[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm,
    )];
    if (matches.length !== 1) throw new Error(`expected one execution plan; found ${matches.length}`);
    plan = JSON.parse(matches[0][1]);
    if (digestCanonical(plan) !== scope.execution_plan.sha256) {
      reasons.push("execution authority plan sha256 no longer matches");
    }
    if (scope.release_binding) {
      targetAuthorityRef = resolveValidatedReleaseIntent({
        contractMarkdown,
        environment: options.environment || process.env,
        paths,
        releaseBinding: scope.release_binding,
      }).intent.target_delivery_authority_ref;
    }
  } catch (error) {
    reasons.push(`unable to load task execution authority: ${error.message}`);
  }
  const slices = Array.isArray(plan?.slices) ? plan.slices : [];
  const expectedSliceIds = slices.map((slice) => slice.slice_id);
  if (JSON.stringify(scope.required_slices.map((slice) => slice.slice_id))
    !== JSON.stringify(expectedSliceIds)) {
    reasons.push("execution authority required slice set does not match its plan");
  }
  const recordIds = [];
  const releaseReceipts = [];
  const acceptedEvents = [];
  validateDeliveryAuthority(events, authority, targetAuthorityRef, reasons);
  for (const slice of slices) {
    const accepted = state.slice_acceptances?.[slice.slice_id];
    if (!accepted || accepted.status !== "accepted") {
      reasons.push(`missing authoritative accepted slice: ${slice.slice_id}`);
      continue;
    }
    validateRetainedReceipt(
      paths,
      taskId,
      {
        grant_id: grant.grant_id,
        scope_digest: grant.scope_digest,
        evidence_epoch: grant.evidence_epoch,
      },
      accepted,
      { ...options, authorityEvents: events },
      reasons,
      "slice",
    );
    const terminal = events.filter((event) => (
      new Set(["slice.accepted", "slice.superseded"]).has(event.kind)
      && (event.result?.accepted?.slice_id || event.data?.slice_id) === slice.slice_id
    )).at(-1);
    if (!terminal || terminal.kind !== "slice.accepted"
      || terminal.result?.accepted?.operation_id !== accepted.operation_id
      || terminal.revision !== accepted.revision) {
      reasons.push(`accepted slice is not the latest authoritative terminal: ${slice.slice_id}`);
    } else {
      acceptedEvents.push(terminal);
    }
    if (accepted.task_id !== taskId || accepted.slice_id !== slice.slice_id
      || accepted.contract_sha256 !== scope.contract.sha256
      || accepted.execution_plan_sha256 !== scope.execution_plan.sha256
      || accepted.grant_id !== grant.grant_id
      || accepted.scope_digest !== grant.scope_digest
      || accepted.evidence_epoch !== grant.evidence_epoch) {
      reasons.push(`accepted slice identity mismatch: ${slice.slice_id}`);
    }
    let brief;
    try {
      const briefFile = canonicalFile(
        path.join(taskArtifactDir(paths, taskId), "team", "sdd", "slices", slice.slice_id, "brief.json"),
        `accepted slice brief ${slice.slice_id}`,
      );
      const briefSnapshot = stableJsonSnapshot(briefFile, `accepted slice brief ${slice.slice_id}`, {
        maximumBytes: 4 * 1024 * 1024,
      });
      brief = briefSnapshot.value;
      if (briefSnapshot.sha256 !== accepted.brief_sha256
        || brief.task_id !== taskId || brief.slice_id !== slice.slice_id
        || brief.schema_version !== 4
        || brief.contract?.sha256 !== scope.contract.sha256
        || brief.contract?.execution_plan_sha256 !== scope.execution_plan.sha256) {
        reasons.push(`accepted slice brief identity mismatch: ${slice.slice_id}`);
      }
    } catch (error) {
      reasons.push(`unable to validate accepted slice brief ${slice.slice_id}: ${error.message}`);
    }
    const records = Array.isArray(accepted.verification_records)
      ? accepted.verification_records
      : [];
    const byCheck = new Map(records.map((record) => [record?.check_id, record]));
    if (byCheck.size !== (slice.checks || []).length || records.length !== byCheck.size) {
      reasons.push(`accepted slice verification coverage mismatch: ${slice.slice_id}`);
    }
    for (const check of slice.checks || []) {
      const record = byCheck.get(check.check_id);
      const expectedGate = {
        admission_head_sha: accepted.actual_size?.start_head_sha,
        admission_tree_oid: accepted.actual_size?.start_tree_oid,
        base_sha: scope.repo.base_sha,
        brief_sha256: accepted.brief_sha256,
        cache_policy: check.cache_policy,
        check_id: check.check_id,
        command_digest: sha256(check.command),
        contract_sha256: scope.contract.sha256,
        execution_plan_sha256: scope.execution_plan.sha256,
        evidence_epoch: grant.evidence_epoch,
        final_only: check.final_only,
        gate_class: check.gate_class,
        grant_id: grant.grant_id,
        repo_realpath: repo,
        scope_digest: grant.scope_digest,
        slice_id: slice.slice_id,
        ...(check.release_requirement ? { release_requirement: check.release_requirement } : {}),
      };
      const verificationEvent = events.find((event) => (
        event.event_id === record?.verification_event_id
        && event.revision === record?.verification_revision
      ));
      if (!record || record.slice_id !== slice.slice_id
        || record.contract_sha256 !== scope.contract.sha256
        || record.execution_plan_sha256 !== scope.execution_plan.sha256
        || record.grant_id !== grant.grant_id
        || record.scope_digest !== grant.scope_digest
        || record.evidence_epoch !== grant.evidence_epoch
        || record.brief_sha256 !== accepted.brief_sha256
        || record.gate_class !== check.gate_class
        || record.command_digest !== sha256(check.command)
        || record.cache_policy !== check.cache_policy
        || record.final_only !== check.final_only
        || record.repo_realpath !== repo
        || record.admission_head_sha !== accepted.actual_size?.start_head_sha
        || record.admission_tree_oid !== accepted.actual_size?.start_tree_oid
        || record.candidate_tree_oid !== accepted.actual_size?.accepted_tree_oid
        || digestCanonical(record.release_requirement || null)
          !== digestCanonical(check.release_requirement || null)
        || record.outcome !== "passed" || record.provenance !== "fresh-executed"
        || !/^sha256:[a-f0-9]{64}$/.test(record.record_id || "")
        || record.record_digest !== record.record_id
        || !/^sha256:[a-f0-9]{64}$/.test(record.identity_digest || "")) {
        reasons.push(`accepted slice verification is invalid: ${slice.slice_id}/${check.check_id}`);
      } else if (!verificationEvent || verificationEvent.kind !== "verification.recorded"
        || verificationEvent.revision >= accepted.revision
        || verificationEvent.data?.record_id !== record.record_id
        || verificationEvent.data?.identity_digest !== record.identity_digest
        || verificationEvent.data?.required_gate?.check_id !== check.check_id
        || verificationEvent.data?.required_gate?.candidate_tree_oid !== record.candidate_tree_oid) {
        reasons.push(`accepted slice verification event is invalid: ${slice.slice_id}/${check.check_id}`);
      } else {
        const projectedGate = state.verification?.required_gates?.[check.check_id];
        const gateReasons = [];
        const identity = validateGateRecord(
          paths,
          taskId,
          expectedGate,
          projectedGate,
          { ...options, authorityEvents: events },
          gateReasons,
        );
        if (!identity || identity.record_id !== record.record_id || gateReasons.length > 0) {
          reasons.push(
            `accepted slice verification identity is invalid: ${slice.slice_id}/${check.check_id}: `
              + gateReasons.join("; "),
          );
          continue;
        }
        recordIds.push(record.record_id);
        if (check.release_requirement) releaseReceipts.push(record);
      }
    }
    for (const keeper of accepted.keeper_outputs || []) {
      try {
        const file = canonicalFile(path.resolve(repo, keeper.path || ""), "accepted keeper output");
        const relative = path.relative(repo, file).split(path.sep).join("/");
        if (relative !== keeper.path || sha256(fs.readFileSync(file)) !== keeper.content_digest
          || !(accepted.actual_size?.changed_paths || []).includes(keeper.path)) {
          reasons.push(`accepted keeper output is no longer valid: ${slice.slice_id}/${keeper.reference}`);
        }
      } catch (error) {
        reasons.push(`unable to validate accepted keeper ${slice.slice_id}/${keeper.reference}: ${error.message}`);
      }
    }
  }
  let completionSnapshot = null;
  let releaseCertification = null;
  const finalAcceptance = acceptedEvents.sort((left, right) => left.revision - right.revision).at(-1);
  if (!finalAcceptance) {
    reasons.push("missing final authoritative slice acceptance snapshot");
  } else if (repo) {
    const accepted = finalAcceptance.result?.accepted;
    const actual = accepted?.actual_size || {};
    const acceptedHead = actual.accepted_head_sha || actual.start_head_sha || "";
    const acceptedTree = actual.accepted_tree_oid || actual.current_tree_oid || "";
    if (!acceptedTree) {
      reasons.push("final slice acceptance is missing its worktree snapshot");
    } else {
      try {
        const current = captureWorktreeSnapshot(repo);
        if (!acceptedHead) {
          reasons.push("final slice acceptance is missing its HEAD snapshot");
        } else if (current.head_sha !== acceptedHead) {
          reasons.push("repository HEAD changed after final slice acceptance");
        }
        if (current.tree_oid !== acceptedTree) {
          reasons.push("repository worktree changed after final slice acceptance");
        }
        completionSnapshot = {
          schema_version: 2,
          grant_id: grant.grant_id,
          scope_digest: grant.scope_digest,
          evidence_epoch: grant.evidence_epoch,
          repo_realpath: repo,
          head_sha: current.head_sha,
          tree_oid: current.tree_oid,
          source_slice_id: accepted?.slice_id || "",
          source_acceptance_event_id: finalAcceptance.event_id,
          source_acceptance_revision: finalAcceptance.revision,
        };
      } catch (error) {
        reasons.push(`unable to capture completion repository snapshot: ${error.message}`);
      }
    }
  }
  if (scope.release_binding) {
    const initialWorkType = scope.contract.semantics_version === 6 ? "implementation" : "";
    if (initialWorkType !== "implementation") {
      reasons.push("release completion authority requires work_type implementation");
    } else if (reasons.length > 0) {
      reasons.push("release certification requires valid completion and delivery authority evidence");
    } else if (!completionSnapshot || !repo || !contractMarkdown) {
      reasons.push("release certification requires a stable final completion snapshot");
    } else {
      releaseCertification = evaluateReleaseSweep({
        contractMarkdown,
        evidenceEpoch: grant.evidence_epoch,
        environment: options.environment || process.env,
        grantId: grant.grant_id,
        paths,
        receipts: releaseReceipts,
        releaseBinding: scope.release_binding,
        repo,
        snapshot: completionSnapshot,
        scopeDigest: grant.scope_digest,
        taskId,
        workType: "implementation",
      });
      if (!releaseCertification.admissible) {
        reasons.push(...releaseCertification.reasons.map((reason) => `release final sweep: ${reason}`));
      }
    }
  }
  return {
    completionSnapshot,
    identityDigest: "",
    passed: reasons.length === 0,
    reasons,
    recordId: recordIds.length === 1 ? recordIds[0] : "",
    recordIds,
    releaseCertification,
    releaseDecision: releaseCertification?.decision || null,
    required: true,
  };
}

module.exports = {
  PERMANENT_FRESH_GATE_CLASSES,
  RequiredGateError,
  admittedExecutionBrief,
  bindRequiredCheck,
  executionCompletionAdmission,
  inProgressVerificationClaims,
  requiredGateAdmission,
  releaseSweepRequired,
  validateGateRecord,
  validateRetainedReceipt,
};
