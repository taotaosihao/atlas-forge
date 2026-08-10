"use strict";

const crypto = require("crypto");
const path = require("path");
const { isDeepStrictEqual } = require("util");
const { currentGrant } = require("../team/execution-grant");

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const AUTHORITY_REF = /^(user-message|operator-input):[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const GIT_OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
  );
}

function digest(value) {
  return `sha256:${crypto.createHash("sha256")
    .update(JSON.stringify(stableValue(value))).digest("hex")}`;
}

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function bashQuote(value) {
  if (value === "") return "''";
  const safeAscii = /^[A-Za-z0-9_@%+=:./-]$/;
  if (!/[\n\r\t\x00-\x1f\x7f]/.test(value)) {
    return Array.from(value, (character, index) => {
      if (character.codePointAt(0) > 0x7f || safeAscii.test(character)
        || (index > 0 && (character === "#" || character === "~"))) {
        return character;
      }
      return `\\${character}`;
    }).join("");
  }
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
  return `$'${escaped}'`;
}

function formatCommand(command) {
  return command.map(bashQuote).join(" ");
}

function seconds(timestamp) {
  return timestamp.replace(/\.\d{3}Z$/, "Z");
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || !isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort())) {
    throw new Error(`${label} has invalid fields`);
  }
}

function verificationState(event) {
  const verification = event?.projection?.state?.verification;
  return verification && typeof verification === "object" && !Array.isArray(verification)
    ? verification
    : {};
}

function taskStatus(event) {
  return event?.projection?.state?.status;
}

function verificationClaims(verification) {
  return Array.isArray(verification.operation_claims) ? verification.operation_claims : [];
}

function authorityBoundary(authorityIdentity) {
  if (!authorityIdentity) {
    return { schema_version: 1, kind: "direct-unbound" };
  }
  return {
    schema_version: 1,
    kind: "execution-grant",
    grant_id: authorityIdentity.grant_id,
    scope_digest: authorityIdentity.scope_digest,
    evidence_epoch: authorityIdentity.evidence_epoch,
    slice_id: authorityIdentity.slice_id,
  };
}

function requiredCheckBinding(requiredGate) {
  if (!requiredGate) return null;
  return {
    schema_version: 1,
    check_id: requiredGate.check_id,
    slice_id: requiredGate.slice_id,
    gate_class: requiredGate.gate_class,
    command_digest: requiredGate.command_digest,
  };
}

function validateAuthorityIdentity(identity, label) {
  if (identity === null) return;
  exactKeys(identity, [
    "grant_id",
    "scope_digest",
    "evidence_epoch",
    "slice_id",
    "brief_sha256",
    "contract_sha256",
    "execution_plan_sha256",
    "admission_head_sha",
    "admission_tree_oid",
    "repo_realpath",
  ], label);
  for (const field of ["scope_digest", "brief_sha256", "contract_sha256",
    "execution_plan_sha256"]) {
    if (!DIGEST.test(identity[field] || "")) throw new Error(`${label} ${field} is invalid`);
  }
  if (!Number.isInteger(identity.evidence_epoch) || identity.evidence_epoch < 1) {
    throw new Error(`${label} evidence_epoch is invalid`);
  }
  if (!SAFE_ID.test(identity.grant_id || "") || !SAFE_ID.test(identity.slice_id || "")
    || !GIT_OID.test(identity.admission_head_sha || "")
    || !GIT_OID.test(identity.admission_tree_oid || "")
    || typeof identity.repo_realpath !== "string" || !path.isAbsolute(identity.repo_realpath)) {
    throw new Error(`${label} grant, slice, repository, or admission snapshot is invalid`);
  }
}

function validateExecutionTarget(target, event) {
  exactKeys(target, [
    "schema_version", "task_id", "cwd_realpath", "command", "input_paths", "output_paths",
  ], "verification execution target");
  if (target.schema_version !== 1 || target.task_id !== event.task_id
    || typeof target.cwd_realpath !== "string" || !target.cwd_realpath
    || !Array.isArray(target.command) || target.command.length === 0
    || target.command.some((value) => typeof value !== "string")
    || !Array.isArray(target.input_paths)
    || target.input_paths.some((value) => typeof value !== "string")
    || !Array.isArray(target.output_paths)
    || target.output_paths.some((value) => typeof value !== "string")) {
    throw new Error("verification execution target is invalid");
  }
}

function validateCheckBinding(binding, label) {
  if (binding === null) return;
  exactKeys(binding, [
    "schema_version", "check_id", "slice_id", "gate_class", "command_digest",
  ], label);
  if (binding.schema_version !== 1 || !binding.check_id || !binding.slice_id
    || !binding.gate_class || !DIGEST.test(binding.command_digest || "")) {
    throw new Error(`${label} is invalid`);
  }
}

function validateClaimIdentity(identity, event) {
  exactKeys(identity, [
    "schema_version",
    "claim_kind",
    "task_id",
    "operation_id",
    "claim_operation_id",
    "terminal_operation_id",
    "request_digest",
    "execution_fingerprint",
    "execution_target",
    "required_check_binding",
    "authority_identity",
  ], "verification claim identity");
  if (identity.schema_version !== 2 || identity.claim_kind !== "verification-command"
    || identity.task_id !== event.task_id || identity.operation_id !== identity.terminal_operation_id
    || identity.claim_operation_id !== `${identity.operation_id}-verification-claim`
    || !DIGEST.test(identity.request_digest || "")
    || !DIGEST.test(identity.execution_fingerprint || "")) {
    throw new Error("verification claim identity is invalid");
  }
  validateExecutionTarget(identity.execution_target, event);
  if (identity.execution_fingerprint !== digest(identity.execution_target)) {
    throw new Error("verification claim execution fingerprint mismatch");
  }
  validateCheckBinding(identity.required_check_binding, "verification required check binding");
  validateAuthorityIdentity(identity.authority_identity, "verification authority identity");
  if ((identity.authority_identity === null) !== (identity.required_check_binding === null)) {
    throw new Error("verification authority and required check bindings are inconsistent");
  }
}

function boundVerificationContext(identity, state) {
  if (identity.authority_identity === null) {
    if (identity.required_check_binding !== null) {
      throw new Error("direct verification carries a required check binding");
    }
    return null;
  }
  const authority = identity.authority_identity;
  const binding = identity.required_check_binding;
  const grant = currentGrant(state?.execution_authority);
  const team = state?.active_team;
  const admission = team?.admission;
  const brief = admission?.brief;
  const snapshot = admission?.slice_start_snapshot;
  const scopeSlice = grant?.scope?.required_slices?.find(
    (candidate) => candidate.slice_id === authority.slice_id,
  );
  const check = scopeSlice?.checks?.find(
    (candidate) => candidate.check_id === binding?.check_id,
  );
  const expectedAuthority = grant && scopeSlice && team ? {
    grant_id: grant.grant_id,
    scope_digest: grant.scope_digest,
    evidence_epoch: grant.evidence_epoch,
    slice_id: scopeSlice.slice_id,
    brief_sha256: scopeSlice.brief_sha256,
    contract_sha256: grant.scope.contract.sha256,
    execution_plan_sha256: grant.scope.execution_plan.sha256,
    admission_head_sha: snapshot?.head_sha,
    admission_tree_oid: snapshot?.tree_oid,
    repo_realpath: grant.scope.repo.realpath,
  } : null;
  const expectedBinding = check ? {
    schema_version: 1,
    check_id: check.check_id,
    slice_id: scopeSlice.slice_id,
    gate_class: check.gate_class,
    command_digest: sha256(check.command),
  } : null;
  const relativeCwd = path.relative(
    authority?.repo_realpath || "",
    identity.execution_target.cwd_realpath,
  );
  const cwdInsideRepo = Boolean(authority?.repo_realpath)
    && (relativeCwd === "" || (!relativeCwd.startsWith(`..${path.sep}`)
      && relativeCwd !== ".." && !path.isAbsolute(relativeCwd)));
  if (!grant || grant.status !== "active" || !team || team.schema_version !== 2
    || team.mode !== "execute" || admission?.mode !== "execution-vnext"
    || team.grant_id !== grant.grant_id || team.scope_digest !== grant.scope_digest
    || team.evidence_epoch !== grant.evidence_epoch || team.slice_id !== scopeSlice?.slice_id
    || admission.grant_id !== grant.grant_id || admission.scope_digest !== grant.scope_digest
    || admission.evidence_epoch !== grant.evidence_epoch
    || brief?.slice_id !== scopeSlice?.slice_id || brief?.sha256 !== scopeSlice?.brief_sha256
    || brief?.contract_sha256 !== grant.scope.contract.sha256
    || brief?.execution_plan_sha256 !== grant.scope.execution_plan.sha256
    || brief?.repo !== grant.scope.repo.realpath || brief?.base_sha !== grant.scope.repo.base_sha
    || !isDeepStrictEqual(authority, expectedAuthority)
    || !isDeepStrictEqual(binding, expectedBinding)
    || !cwdInsideRepo
    || formatCommand(identity.execution_target.command) !== check?.command) {
    const mismatches = Object.entries({
      grant: Boolean(grant) && grant.status === "active",
      team: team?.schema_version === 2 && team.mode === "execute",
      admission: admission?.mode === "execution-vnext",
      team_grant: team?.grant_id === grant?.grant_id && team?.scope_digest === grant?.scope_digest
        && team?.evidence_epoch === grant?.evidence_epoch,
      team_slice: team?.slice_id === scopeSlice?.slice_id,
      admission_grant: admission?.grant_id === grant?.grant_id
        && admission?.scope_digest === grant?.scope_digest
        && admission?.evidence_epoch === grant?.evidence_epoch,
      brief_slice: brief?.slice_id === scopeSlice?.slice_id
        && brief?.sha256 === scopeSlice?.brief_sha256,
      brief_contract: brief?.contract_sha256 === grant?.scope?.contract?.sha256,
      brief_plan: brief?.execution_plan_sha256 === grant?.scope?.execution_plan?.sha256,
      brief_repo: brief?.repo === grant?.scope?.repo?.realpath
        && brief?.base_sha === grant?.scope?.repo?.base_sha,
      authority: isDeepStrictEqual(authority, expectedAuthority),
      binding: isDeepStrictEqual(binding, expectedBinding),
      cwd: cwdInsideRepo,
      command: formatCommand(identity.execution_target.command) === check?.command,
    }).filter(([, matches]) => !matches).map(([field]) => field);
    throw new Error(
      `verification claim differs from its current grant, Team, or scope check: ${mismatches.join(", ")}`,
    );
  }
  return { admission, authority, binding, brief, check, grant, scopeSlice };
}

function expectedRequiredGate(context) {
  const expected = {
    admission_head_sha: context.authority.admission_head_sha,
    admission_tree_oid: context.authority.admission_tree_oid,
    brief_sha256: context.authority.brief_sha256,
    cache_policy: context.check.cache_policy,
    base_sha: context.brief.base_sha,
    check_id: context.check.check_id,
    command_digest: context.binding.command_digest,
    contract_sha256: context.authority.contract_sha256,
    execution_plan_sha256: context.authority.execution_plan_sha256,
    evidence_epoch: context.authority.evidence_epoch,
    final_only: context.check.final_only,
    gate_class: context.check.gate_class,
    grant_id: context.authority.grant_id,
    repo_realpath: context.authority.repo_realpath,
    scope_digest: context.authority.scope_digest,
    slice_id: context.authority.slice_id,
  };
  if (context.check.release_requirement) {
    expected.release_requirement = context.check.release_requirement;
  }
  return expected;
}

function expectedVerification(previousVerification, claims) {
  return { ...previousVerification, operation_claims: claims };
}

function assertVerificationFieldsPreserved(previousVerification, nextVerification, allowed, label) {
  const previous = { ...previousVerification };
  const next = { ...nextVerification };
  for (const field of allowed) {
    delete previous[field];
    delete next[field];
  }
  if (!isDeepStrictEqual(next, previous)) {
    throw new Error(`${label} changed verification fields it does not own`);
  }
}

function validateNonVerificationEvent(event, previousVerification, nextVerification) {
  if (event.kind === "authority.replanned") {
    assertVerificationFieldsPreserved(
      previousVerification,
      nextVerification,
      ["required_gates"],
      "authority.replanned",
    );
    return;
  }
  if (event.kind === "task.completion.closed" && event.data?.no_verify_reason) {
    const expected = {
      ...previousVerification,
      skipped: true,
      skip_reason: event.data.no_verify_reason,
      skipped_at: seconds(event.occurred_at),
    };
    if (!isDeepStrictEqual(nextVerification, expected)) {
      throw new Error("no-verify task completion has a non-canonical verification projection");
    }
    return;
  }
  if (!isDeepStrictEqual(nextVerification, previousVerification)) {
    throw new Error("event changed verification state it does not own");
  }
}

function validateClaimed(event, previousState, previousVerification, previousClaims, nextVerification) {
  validateClaimIdentity(event.data, event);
  boundVerificationContext(event.data, previousState);
  if (event.operation_id !== event.data.claim_operation_id) {
    throw new Error("verification claimed event operation does not match its claim");
  }
  if (previousClaims.some((claim) => claim.operation_id === event.data.operation_id
    || claim.claim_operation_id === event.data.claim_operation_id)) {
    throw new Error("verification claimed event duplicates an existing claim");
  }
  const boundary = authorityBoundary(event.data.authority_identity);
  if (previousClaims.some((claim) => (
    claim.status === "in_progress"
      && (claim.execution_fingerprint || claim.request_digest)
        === (event.data.execution_fingerprint || event.data.request_digest)
      && isDeepStrictEqual(authorityBoundary(claim.authority_identity), boundary)
  ))) {
    throw new Error("verification claimed event duplicates an in-progress execution boundary");
  }
  if (previousClaims.some((claim) => (
    claim.status === "indeterminate"
      && claim.tombstone?.execution_fingerprint === event.data.execution_fingerprint
      && isDeepStrictEqual(claim.tombstone?.authority_boundary, boundary)
  ))) {
    throw new Error("verification claimed event repeats an indeterminate execution boundary");
  }
  const claim = {
    ...event.data,
    status: "in_progress",
    claimed_at: seconds(event.occurred_at),
  };
  const expectedClaims = [...previousClaims, claim];
  if (!isDeepStrictEqual(nextVerification, expectedVerification(
    previousVerification,
    expectedClaims,
  ))) {
    throw new Error("verification claimed projection must append exactly one in-progress claim");
  }
  if (!isDeepStrictEqual(event.result, { claim })) {
    throw new Error("verification claimed result does not match its projected claim");
  }
}

function validateResolved(event, previousVerification, previousClaims, nextVerification) {
  exactKeys(event.data, [
    "pending_operation_id",
    "claim_operation_id",
    "disposition",
    "authority_ref",
    "reason",
    "evidence_refs",
  ], "verification resolved data");
  if (event.data.disposition !== "indeterminate"
    || !AUTHORITY_REF.test(event.data.authority_ref || "")
    || typeof event.data.reason !== "string" || !event.data.reason.trim()
    || /[\r\n\t]/.test(event.data.reason)
    || !Array.isArray(event.data.evidence_refs) || event.data.evidence_refs.length === 0) {
    throw new Error("verification resolved data is invalid");
  }
  const index = previousClaims.findIndex((claim) => (
    claim.operation_id === event.data.pending_operation_id
      && claim.claim_operation_id === event.data.claim_operation_id
  ));
  const previousClaim = previousClaims[index];
  if (index < 0 || previousClaim.status !== "in_progress") {
    throw new Error("verification resolved event does not target an in-progress claim");
  }
  const resolvedAt = seconds(event.occurred_at);
  const resolution = {
    schema_version: 1,
    operation_id: event.operation_id,
    ...event.data,
    resolved_at: resolvedAt,
  };
  const tombstone = {
    schema_version: 1,
    request_digest: previousClaim.request_digest,
    execution_fingerprint: previousClaim.execution_fingerprint,
    authority_boundary: authorityBoundary(previousClaim.authority_identity),
    required_check_binding: previousClaim.required_check_binding,
  };
  const expectedClaims = previousClaims.map((claim, claimIndex) => (
    claimIndex === index
      ? { ...claim, status: "indeterminate", resolved_at: resolvedAt, resolution, tombstone }
      : claim
  ));
  if (!isDeepStrictEqual(nextVerification, expectedVerification(
    previousVerification,
    expectedClaims,
  ))) {
    throw new Error("verification resolved projection is not the canonical indeterminate transition");
  }
  const expectedResult = {
    exitCode: 0,
    lines: [
      `task_id: ${event.task_id}`,
      `operation_id: ${event.data.pending_operation_id}`,
      "status: indeterminate",
    ],
  };
  if (!isDeepStrictEqual(event.result, expectedResult)) {
    throw new Error("verification resolved result is invalid");
  }
}

function validateRecordedVerificationFields(event, previousVerification, nextVerification) {
  const allowedChanges = new Set([
    "operation_claims",
    "last_record",
    "last_identity_record",
    "last_exit_code",
    "outcome",
    "trajectory",
    "evaluator",
    "failure_attribution",
    "identity_schema_version",
    "record_id",
    "identity_digest",
    "identity_stable",
    "evidence_refs",
    "required_gates",
    "schema_version",
  ]);
  for (const [field, value] of Object.entries(previousVerification)) {
    if (!allowedChanges.has(field) && !isDeepStrictEqual(nextVerification[field], value)) {
      throw new Error(`verification recorded projection changed unrelated field: ${field}`);
    }
  }
  for (const field of Object.keys(nextVerification)) {
    if (!Object.hasOwn(previousVerification, field) && !allowedChanges.has(field)) {
      throw new Error(`verification recorded projection added unrelated field: ${field}`);
    }
  }
  if (nextVerification.record_id !== event.data.record_id
    || nextVerification.identity_digest !== event.data.identity_digest
    || nextVerification.outcome !== event.data.outcome
    || nextVerification.last_exit_code !== event.result.exitCode
    || typeof nextVerification.last_record !== "string" || !nextVerification.last_record
    || typeof nextVerification.last_identity_record !== "string"
    || !nextVerification.last_identity_record) {
    throw new Error("verification recorded projection does not match event data and result");
  }
}

function validateRecorded(
  event,
  events,
  previousState,
  previousVerification,
  previousClaims,
  nextVerification,
) {
  exactKeys(event.data, [
    "authority_identity",
    "claim_operation_id",
    "record_id",
    "identity_digest",
    "observed_revision",
    "claim_revision",
    "request_digest",
    "required_gate",
    "release_evidence",
    "verdict",
    "outcome",
  ], "verification recorded data");
  const index = previousClaims.findIndex((claim) => claim.operation_id === event.operation_id);
  const previousClaim = previousClaims[index];
  if (index < 0 || previousClaim.status !== "in_progress"
    || previousClaim.terminal_operation_id !== event.operation_id
    || previousClaim.claim_operation_id !== event.data.claim_operation_id
    || previousClaim.request_digest !== event.data.request_digest
    || !isDeepStrictEqual(previousClaim.authority_identity, event.data.authority_identity)) {
    throw new Error("verification recorded event does not match its in-progress claim");
  }
  const context = boundVerificationContext(previousClaim, previousState);
  const claimEvent = events.find((candidate) => (
    candidate.operation_id === previousClaim.claim_operation_id
  ));
  if (!claimEvent || claimEvent.kind !== "verification.claimed"
    || event.data.claim_revision !== claimEvent.revision
    || !Number.isInteger(event.data.observed_revision)
    || event.data.observed_revision < 0 || event.data.observed_revision >= event.revision) {
    throw new Error("verification recorded claim revision binding is invalid");
  }
  if (!event.result || !Number.isInteger(event.result.exitCode)
    || !Array.isArray(event.result.lines)
    || typeof event.result.identityFile !== "string" || !event.result.identityFile
    || typeof event.result.recordFile !== "string" || !event.result.recordFile
    || event.data.verdict !== (event.result.exitCode === 0 ? "passed" : "failed")
    || !DIGEST.test(event.data.record_id || "")
    || !DIGEST.test(event.data.identity_digest || "")) {
    throw new Error("verification recorded result or digest is invalid");
  }
  const terminalAt = seconds(event.occurred_at);
  const expectedClaims = previousClaims.map((claim, claimIndex) => (
    claimIndex === index
      ? { ...claim, status: "terminal", terminal_at: terminalAt, result: event.result }
      : claim
  ));
  if (!isDeepStrictEqual(verificationClaims(nextVerification), expectedClaims)) {
    throw new Error("verification recorded projection must terminalize exactly its claim");
  }
  validateRecordedVerificationFields(event, previousVerification, nextVerification);

  const previousGates = previousVerification.required_gates || {};
  if (event.data.required_gate) {
    if (!context) {
      throw new Error("direct verification recorded event injected a required gate");
    }
    if (nextVerification.schema_version !== 3) {
      throw new Error("bound verification recorded projection requires schema_version 3");
    }
    validateCheckBinding(
      requiredCheckBinding(event.data.required_gate),
      "verification recorded required check binding",
    );
    if (!isDeepStrictEqual(
      previousClaim.required_check_binding,
      requiredCheckBinding(event.data.required_gate),
    )) {
      throw new Error("verification recorded required gate differs from its claim binding");
    }
    const actualStaticGate = { ...event.data.required_gate };
    const candidateTreeOid = actualStaticGate.candidate_tree_oid;
    delete actualStaticGate.candidate_tree_oid;
    if (!GIT_OID.test(candidateTreeOid || "")
      || !isDeepStrictEqual(actualStaticGate, expectedRequiredGate(context))) {
      throw new Error("verification recorded required gate differs from its scope check");
    }
    if (context.check.release_requirement) {
      exactKeys(event.data.release_evidence, [
        "schema_version", "requirement_ref", "fact", "candidate_manifest",
        "producer_provenance",
      ], "verification recorded release evidence");
      if (event.data.release_evidence.schema_version !== 1
        || event.data.release_evidence.requirement_ref
          !== context.check.release_requirement.requirement_ref) {
        throw new Error("verification recorded release evidence requirement is invalid");
      }
    } else if (event.data.release_evidence !== null) {
      throw new Error("non-release verification recorded event carries release evidence");
    }
    const expectedGate = {
      ...event.data.required_gate,
      completed_at: terminalAt,
      event_revision: event.revision,
      identity_digest: event.data.identity_digest,
      identity_record: nextVerification.last_identity_record,
      outcome: event.data.outcome,
      provenance: "fresh-executed",
      record_digest: event.data.record_id,
      record_id: event.data.record_id,
    };
    if (!isDeepStrictEqual(nextVerification.required_gates, {
      ...previousGates,
      [event.data.required_gate.check_id]: expectedGate,
    })) {
      throw new Error("verification recorded required gate projection is invalid");
    }
  } else {
    if (context || previousClaim.required_check_binding !== null
      || event.data.authority_identity !== null) {
      throw new Error("bound verification recorded event omitted its required gate");
    }
    if (event.data.release_evidence !== null) {
      throw new Error("direct verification recorded event carries release evidence");
    }
    if (!isDeepStrictEqual(nextVerification.required_gates, previousVerification.required_gates)) {
      throw new Error("direct verification recorded event changed required gates");
    }
    if (!isDeepStrictEqual(nextVerification.schema_version, previousVerification.schema_version)) {
      throw new Error("direct verification recorded event changed verification schema version");
    }
  }
}

function materializedVerificationFiles(previous, event) {
  const files = new Map(
    (event?.projection?.files_semantics === "snapshot" ? [] : previous)
      .map((entry) => [entry.path, entry]),
  );
  for (const entry of event?.projection?.files || []) {
    if (typeof entry?.path === "string" && entry.path.startsWith("verification/")) {
      files.set(entry.path, entry);
    }
  }
  return [...files.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function validateVerificationFiles(event, previousEvent, previous) {
  const next = materializedVerificationFiles(previous, event);
  const previousState = previousEvent?.projection?.state || {};
  const nextState = event.projection?.state || {};
  if (!previousEvent) {
    if (next.length > 0 || (nextState.last_verified_at || "") !== "") {
      throw new Error("task genesis injected verification files or last_verified_at");
    }
    return next;
  }
  if (event.kind !== "verification.recorded") {
    if (!isDeepStrictEqual(next, previous)
      || nextState.last_verified_at !== previousState.last_verified_at) {
      throw new Error("event changed verification files or last_verified_at it does not own");
    }
    return next;
  }
  const terminalAt = seconds(event.occurred_at);
  if (nextState.last_verified_at !== terminalAt) {
    throw new Error("verification.recorded last_verified_at differs from event time");
  }
  const recordPath = `verification/${path.basename(event.result.recordFile)}`;
  const identityPath = `verification/${path.basename(event.result.identityFile)}`;
  if (recordPath === identityPath || !recordPath.endsWith(".md") || !identityPath.endsWith(".json")
    || !String(nextState.verification?.last_record || "").endsWith(recordPath)
    || !String(nextState.verification?.last_identity_record || "").endsWith(identityPath)) {
    throw new Error("verification.recorded file pointers are invalid");
  }
  const expected = new Map(previous.map((entry) => [entry.path, entry]));
  const record = next.find((entry) => entry.path === recordPath);
  const identity = next.find((entry) => entry.path === identityPath);
  if (!record?.content_base64 || record.deleted === true
    || !identity?.content_base64 || identity.deleted === true) {
    throw new Error("verification.recorded is missing its exact receipt files");
  }
  expected.set(recordPath, record);
  expected.set(identityPath, identity);
  if (!isDeepStrictEqual(next, [...expected.values()].sort((left, right) => (
    left.path.localeCompare(right.path)
  )))) {
    throw new Error("verification.recorded changed unrelated verification files");
  }
  let identityRecord;
  try {
    identityRecord = JSON.parse(Buffer.from(identity.content_base64, "base64").toString("utf8"));
  } catch (error) {
    throw new Error(`verification identity file is invalid JSON: ${error.message}`);
  }
  if (identityRecord.record_id !== event.data.record_id
    || identityRecord.identity_digest !== event.data.identity_digest) {
    throw new Error("verification identity file differs from authoritative receipt data");
  }
  const recordText = Buffer.from(record.content_base64, "base64").toString("utf8");
  if (!recordText.includes(event.data.record_id)
    || !recordText.includes(event.data.identity_digest)) {
    throw new Error("verification Markdown receipt lacks its authoritative identity binding");
  }
  return next;
}

function validateVerificationClaimEventProjection(events) {
  let materializedFiles = [];
  for (const [index, event] of events.entries()) {
    const previousEvent = index > 0 ? events[index - 1] : null;
    const previousVerification = previousEvent ? verificationState(previousEvent) : {};
    const previousState = previousEvent?.projection?.state || {};
    const previousClaims = verificationClaims(previousVerification);
    const nextVerification = verificationState(event);
    const nextClaims = verificationClaims(nextVerification);
    try {
      if (event.kind === "verification.claimed") {
        validateClaimed(
          event, previousState, previousVerification, previousClaims, nextVerification,
        );
      } else if (event.kind === "verification.resolved") {
        validateResolved(event, previousVerification, previousClaims, nextVerification);
      } else if (event.kind === "verification.recorded") {
        validateRecorded(
          event,
          events,
          previousState,
          previousVerification,
          previousClaims,
          nextVerification,
        );
      } else {
        validateNonVerificationEvent(event, previousVerification, nextVerification);
      }
      materializedFiles = validateVerificationFiles(
        event, previousEvent, materializedFiles,
      );
      const hasPendingRecovery = previousClaims.some((claim) => claim.status === "in_progress")
        || nextClaims.some((claim) => claim.status === "in_progress");
      const isClaimTransition = new Set([
        "verification.claimed", "verification.resolved", "verification.recorded",
      ]).has(event.kind);
      if ((hasPendingRecovery || isClaimTransition)
        && (taskStatus(previousEvent) !== "doing" || taskStatus(event) !== "doing")) {
        throw new Error("verification claim recovery requires task status doing");
      }
    } catch (error) {
      throw new Error(
        `verification claim event projection mismatch at revision ${event.revision}: ${error.message}`,
      );
    }
  }
}

module.exports = {
  validateVerificationClaimEventProjection,
};
