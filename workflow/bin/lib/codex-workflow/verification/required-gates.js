"use strict";

const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const { taskArtifactDir } = require("../core/paths");
const { readAuthoritativeEvents } = require("../core/event-store");
const { captureWorktreeSnapshot } = require("../core/worktree-snapshot");
const {
  captureVerificationIdentity,
  digestCanonical,
  identityInputPaths,
  sha256,
} = require("./identity");
const { evaluateReleaseSweep } = require("./release-certification");

const PERMANENT_FRESH_GATE_CLASSES = new Set([
  "auth", "permission", "security", "data-consistency", "migration", "backup",
  "restore", "served-ui", "browser-flow", "install", "postflight",
  "release-identity", "collision", "downgrade", "symlink", "exact-layout",
]);
const REQUIRED_GATE_BINDING_FIELDS = [
  "check_id", "slice_id", "contract_sha256", "execution_plan_sha256", "brief_sha256",
  "gate_class", "command_digest", "cache_policy", "final_only", "repo_realpath", "base_sha",
  "admission_head_sha", "admission_tree_oid",
];

class RequiredGateError extends Error {
  constructor(message) {
    super(message);
    this.name = "RequiredGateError";
  }
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

function admittedExecutionBrief(paths, taskId, state, requested = {}) {
  const team = state.active_team && typeof state.active_team === "object"
    ? state.active_team
    : {};
  const admission = team.admission && typeof team.admission === "object"
    ? team.admission
    : {};
  const identity = admission.brief && typeof admission.brief === "object"
    ? admission.brief
    : null;
  if (admission.mode !== "execution-v3" || !identity) return null;
  const snapshot = admission.slice_start_snapshot;
  if (!snapshot || typeof snapshot.head_sha !== "string" || !snapshot.head_sha
    || typeof snapshot.tree_oid !== "string" || !snapshot.tree_oid) {
    throw new RequiredGateError("admitted Team is missing its slice-start repository snapshot");
  }
  const file = canonicalFile(identity.path, "admitted Team brief");
  if (requested.briefPath && path.resolve(requested.briefPath) !== file) {
    throw new RequiredGateError("verification brief does not match the admitted Team brief");
  }
  const brief = readJson(file, "admitted Team brief");
  if (brief.schema_version !== 3 || brief.task_id !== taskId) {
    throw new RequiredGateError("admitted Team brief task or schema mismatch");
  }
  const expected = path.join(
    taskArtifactDir(paths, taskId), "team", "sdd", "slices", brief.slice_id, "brief.json",
  );
  if (file !== expected) throw new RequiredGateError(`admitted Team brief is not canonical: ${expected}`);
  if (requested.sliceId && requested.sliceId !== brief.slice_id) {
    throw new RequiredGateError(`verification slice does not match admitted slice: ${brief.slice_id}`);
  }
  const briefSha256 = sha256(fs.readFileSync(file));
  if (briefSha256 !== identity.sha256) {
    throw new RequiredGateError("admitted Team brief sha256 no longer matches");
  }
  if (brief.slice_id !== identity.slice_id
    || brief.contract?.sha256 !== identity.contract_sha256
    || brief.contract?.execution_plan_sha256 !== identity.execution_plan_sha256) {
    throw new RequiredGateError("admitted Team brief contract identity no longer matches");
  }
  const contractFile = canonicalFile(brief.contract.path, "admitted implementation contract");
  if (sha256(fs.readFileSync(contractFile)) !== identity.contract_sha256) {
    throw new RequiredGateError("admitted implementation contract sha256 no longer matches");
  }
  const repo = canonicalDirectory(brief.repo, "admitted repository");
  if (identity.repo && identity.repo !== repo) {
    throw new RequiredGateError("admitted Team repository identity no longer matches");
  }
  return { admission, brief, briefSha256, contractFile, file, identity, repo, team };
}

function bindRequiredCheck({ commandText, cwd, parsed, paths, state }) {
  const requested = [parsed.briefPath, parsed.sliceId, parsed.checkId].filter(Boolean);
  if (requested.length > 0 && requested.length !== 3) {
    throw new RequiredGateError("bound verification requires --brief, --slice-id, and --check-id together");
  }
  if (requested.length === 0) return null;
  const context = admittedExecutionBrief(paths, parsed.taskId, state, {
    briefPath: parsed.briefPath,
    sliceId: parsed.sliceId,
  });
  if (!context) throw new RequiredGateError("bound verification requires an admitted execution-v3 Team");
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
  const check = (context.brief.checks || []).find((item) => item.check_id === parsed.checkId);
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
    final_only: check.final_only,
    gate_class: check.gate_class,
    repo_realpath: context.repo,
    slice_id: context.brief.slice_id,
    ...(check.release_requirement ? { release_requirement: check.release_requirement } : {}),
  };
}

function resolveCodeHomeReference(paths, reference) {
  return path.isAbsolute(reference) ? reference : path.resolve(paths.codeHome, reference);
}

function validateGateRecord(paths, taskId, expected, gate, options, reasons) {
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
      if (record.required_gate?.[field] !== expected[field]) {
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

function requiredGateAdmission(paths, taskId, state, options = {}) {
  const context = admittedExecutionBrief(paths, taskId, state);
  if (!context) return null;
  const verification = state.verification && typeof state.verification === "object"
    ? state.verification
    : {};
  const gates = verification.required_gates && typeof verification.required_gates === "object"
    ? verification.required_gates
    : {};
  const reasons = [];
  const records = [];
  const expectedChecks = (context.brief.checks || []).map((check) => ({
    admission_head_sha: context.admission.slice_start_snapshot.head_sha,
    admission_tree_oid: context.admission.slice_start_snapshot.tree_oid,
    base_sha: context.brief.base_sha,
    brief_sha256: context.briefSha256,
    cache_policy: check.cache_policy,
    check_id: check.check_id,
    command_digest: sha256(check.command),
    contract_sha256: context.identity.contract_sha256,
    execution_plan_sha256: context.identity.execution_plan_sha256,
    final_only: check.final_only,
    gate_class: check.gate_class,
    repo_realpath: context.repo,
    slice_id: context.brief.slice_id,
    ...(check.release_requirement ? { release_requirement: check.release_requirement } : {}),
  }));
  for (const expected of expectedChecks) {
    const record = validateGateRecord(
      paths, taskId, expected, gates[expected.check_id], options, reasons,
    );
    if (record) records.push(record);
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
  if (context.brief.contract.release && reasons.length === 0) {
    let snapshot;
    try {
      snapshot = captureWorktreeSnapshot(context.repo);
      releaseCertification = evaluateReleaseSweep({
        contractMarkdown: fs.readFileSync(context.contractFile, "utf8"),
        environment: options.environment || process.env,
        paths,
        receipts: records,
        releaseBinding: context.brief.contract.release,
        repo: context.repo,
        snapshot,
        taskId,
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
  return {
    identityDigest: records.length === 1 ? records[0].identity_digest : "",
    passed: reasons.length === 0,
    reasons,
    recordId: records.length === 1 ? records[0].record_id : "",
    recordIds: records.map((record) => record.record_id),
    releaseCertification,
    releaseDecision: releaseCertification?.decision || null,
    verificationRecords: records.map((record) => {
      const gate = gates[record.required_gate?.check_id] || {};
      const release = releaseByCheck.get(record.required_gate?.check_id);
      return {
        ...(record.required_gate || {}),
        event_revision: gate.event_revision || 0,
        identity_digest: record.identity_digest,
        identity_record: gate.identity_record || "",
        outcome: record.outcome,
        provenance: record.provenance,
        record_digest: record.record_id,
        record_id: record.record_id,
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
  if (!authority || typeof authority !== "object") return null;
  const reasons = [];
  if (authority.schema_version !== 1 || authority.status !== "active") {
    reasons.push("task execution authority is not active schema version 1");
  }
  let repo = "";
  let plan = null;
  let contractMarkdown = "";
  try {
    repo = canonicalDirectory(authority.repo_realpath, "execution authority repository");
    if (repo !== authority.repo_realpath) reasons.push("execution authority repository mismatch");
    const contractFile = canonicalFile(authority.contract_path, "execution authority contract");
    const relative = path.relative(repo, contractFile);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      reasons.push("execution authority contract is outside the admitted repository");
    }
    if (sha256(fs.readFileSync(contractFile)) !== authority.contract_sha256) {
      reasons.push("execution authority contract sha256 no longer matches");
    }
    contractMarkdown = fs.readFileSync(contractFile, "utf8");
    const matches = [...contractMarkdown.matchAll(
      /^```atlas-execution-plan\+json[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm,
    )];
    if (matches.length !== 1) throw new Error(`expected one execution plan; found ${matches.length}`);
    plan = JSON.parse(matches[0][1]);
    if (digestCanonical(plan) !== authority.execution_plan_sha256) {
      reasons.push("execution authority plan sha256 no longer matches");
    }
  } catch (error) {
    reasons.push(`unable to load task execution authority: ${error.message}`);
  }
  const slices = Array.isArray(plan?.slices) ? plan.slices : [];
  const expectedSliceIds = slices.map((slice) => slice.slice_id);
  if (JSON.stringify(authority.required_slices || []) !== JSON.stringify(expectedSliceIds)) {
    reasons.push("execution authority required slice set does not match its plan");
  }
  const recordIds = [];
  const releaseReceipts = [];
  const acceptedEvents = [];
  let events = [];
  try {
    events = readAuthoritativeEvents(
      path.join(taskArtifactDir(paths, taskId), "events-v2.jsonl"),
      taskId,
    );
  } catch (error) {
    reasons.push(`unable to load authoritative slice evidence: ${error.message}`);
  }
  for (const slice of slices) {
    const accepted = state.slice_acceptances?.[slice.slice_id];
    if (!accepted || accepted.status !== "accepted") {
      reasons.push(`missing authoritative accepted slice: ${slice.slice_id}`);
      continue;
    }
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
      || accepted.contract_sha256 !== authority.contract_sha256
      || accepted.execution_plan_sha256 !== authority.execution_plan_sha256) {
      reasons.push(`accepted slice identity mismatch: ${slice.slice_id}`);
    }
    let brief;
    try {
      const briefFile = canonicalFile(
        path.join(taskArtifactDir(paths, taskId), "team", "sdd", "slices", slice.slice_id, "brief.json"),
        `accepted slice brief ${slice.slice_id}`,
      );
      brief = readJson(briefFile, `accepted slice brief ${slice.slice_id}`);
      if (sha256(fs.readFileSync(briefFile)) !== accepted.brief_sha256
        || brief.task_id !== taskId || brief.slice_id !== slice.slice_id
        || brief.contract?.sha256 !== authority.contract_sha256
        || brief.contract?.execution_plan_sha256 !== authority.execution_plan_sha256) {
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
      const verificationEvent = events.find((event) => (
        event.event_id === record?.verification_event_id
        && event.revision === record?.verification_revision
      ));
      if (!record || record.slice_id !== slice.slice_id
        || record.contract_sha256 !== authority.contract_sha256
        || record.execution_plan_sha256 !== authority.execution_plan_sha256
        || record.brief_sha256 !== accepted.brief_sha256
        || record.gate_class !== check.gate_class
        || record.command_digest !== sha256(check.command)
        || record.cache_policy !== check.cache_policy
        || record.final_only !== check.final_only
        || record.repo_realpath !== repo
        || record.admission_head_sha !== accepted.actual_size?.start_head_sha
        || record.admission_tree_oid !== accepted.actual_size?.start_tree_oid
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
        || verificationEvent.data?.required_gate?.check_id !== check.check_id) {
        reasons.push(`accepted slice verification event is invalid: ${slice.slice_id}/${check.check_id}`);
      } else {
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
          schema_version: 1,
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
  if (authority.release_binding) {
    if (!completionSnapshot || !repo || !contractMarkdown) {
      reasons.push("release certification requires a stable final completion snapshot");
    } else {
      releaseCertification = evaluateReleaseSweep({
        contractMarkdown,
        environment: options.environment || process.env,
        paths,
        receipts: releaseReceipts,
        releaseBinding: authority.release_binding,
        repo,
        snapshot: completionSnapshot,
        taskId,
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
  requiredGateAdmission,
  validateGateRecord,
};
