"use strict";

const path = require("path");
const { isDeepStrictEqual } = require("util");
const { parseTaskHeader, renderTaskFields, splitTaskDocument } = require("./repository");
const { digestCanonical } = require("../verification/identity");
const {
  currentGrant,
  executionHistoryRequired,
} = require("../team/execution-grant");
const {
  isTerminalTeamStatus,
  teamClosureIssues,
  teamControlPlaneClosureIssues,
} = require("../team/lane-registry");

const LIFECYCLE_KINDS = new Set([
  "task.created", "task.started", "task.blocked", "task.resumed",
  "task.completion.closed", "task.archived",
]);
const LIFECYCLE_STATE_FIELDS = [
  "task_id", "title", "status", "artifact_dir", "blocked_reason", "blocked_at",
  "resumed_at", "archived_reason", "archived_at", "no_verify_reason", "no_verify_at",
  "completion",
];
const LIFECYCLE_HEADER_FIELDS = [
  "id", "title", "status", "created", "updated", "artifact_dir", "blocked_reason",
  "blocked_at", "resumed_at", "completion_outcome", "completion_authority_ref",
  "completion_evidence_refs", "completion_closed_at", "archived_reason", "archived_at",
  "no_verify_reason", "no_verify_at",
];

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function seconds(event) {
  const value = event?.occurred_at;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value) {
    throw new Error("task lifecycle event occurred_at must be canonical ISO UTC");
  }
  return value.replace(/\.\d{3}Z$/, "Z");
}

function localDay(event) {
  if (typeof event.local_day !== "string"
    || !/^\d{4}-\d{2}-\d{2}$/.test(event.local_day)
    || !Number.isInteger(event.local_utc_offset_minutes)
    || event.local_utc_offset_minutes < -14 * 60
    || event.local_utc_offset_minutes > 14 * 60) {
    throw new Error("task lifecycle event local_day must be persisted by its producer");
  }
  const local = new Date(
    Date.parse(event.occurred_at) + event.local_utc_offset_minutes * 60 * 1000,
  );
  const expected = [local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate()]
    .map((value, index) => String(value).padStart(index === 0 ? 4 : 2, "0"))
    .join("-");
  if (event.local_day !== expected) {
    throw new Error("task lifecycle event local_day differs from its persisted UTC offset");
  }
  return event.local_day;
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || !isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort())) {
    throw new Error(`${label} has invalid fields`);
  }
}

function embeddedVerificationIdentity(source) {
  const identityPath = `verification/${path.basename(source.result?.identityFile || "")}`;
  const entry = (source.projection?.files || []).find((candidate) => (
    candidate.path === identityPath
  ));
  if (!entry?.content_base64) {
    throw new Error("direct completion verification identity receipt is missing");
  }
  let record;
  try {
    record = JSON.parse(Buffer.from(entry.content_base64, "base64").toString("utf8"));
  } catch (error) {
    throw new Error(`direct completion verification identity is invalid JSON: ${error.message}`);
  }
  const body = { ...record };
  delete body.record_id;
  if (record.record_id !== source.data?.record_id
    || record.record_id !== digestCanonical(body)
    || record.identity_digest !== source.data?.identity_digest
    || record.identity_digest !== digestCanonical(record.identity || {})) {
    throw new Error("direct completion verification identity digest is invalid");
  }
  return { identityPath, record };
}

function headerValue(fields, key) {
  return fields[key]?.[0] || "";
}

function assertProjectionParity(event) {
  const state = event.projection.state;
  const fields = parseTaskHeader(event.projection.task_content);
  if (headerValue(fields, "id") !== event.task_id || state.task_id !== event.task_id
    || headerValue(fields, "title") !== state.title
    || headerValue(fields, "status") !== state.status
    || headerValue(fields, "last_verified_at") !== (state.last_verified_at || "")) {
    throw new Error("task Markdown identity/status/verification headers differ from state");
  }
  const team = state.active_team;
  if (team?.schema_version === 2 && (
    headerValue(fields, "active_team_backend") !== (team.backend || "")
      || headerValue(fields, "active_team_mode") !== (team.mode || "")
      || headerValue(fields, "active_team_status") !== (team.status || "")
      || headerValue(fields, "active_team_decision") !== (team.decision || "")
  )) {
    throw new Error("task Markdown Team headers differ from active Team state");
  }
  if (state.runtime_revision !== event.revision || state.last_event_id !== event.event_id
    || state.consistency !== "current") {
    throw new Error("task projection runtime metadata differs from its event");
  }
}

function assertLifecycleHeadersPreserved(previous, next) {
  const before = parseTaskHeader(previous.task_content);
  const after = parseTaskHeader(next.task_content);
  for (const field of LIFECYCLE_HEADER_FIELDS) {
    if (!isDeepStrictEqual(before[field], after[field])) {
      throw new Error(`event changed task lifecycle header it does not own: ${field}`);
    }
  }
  const beforeBody = splitTaskDocument(previous.task_content).body.replace(/^\n+/, "");
  const afterBody = splitTaskDocument(next.task_content).body.replace(/^\n+/, "");
  if (beforeBody !== afterBody) {
    throw new Error("event changed task body it does not own");
  }
}

function assertLifecycleStatePreserved(previous, next) {
  for (const field of LIFECYCLE_STATE_FIELDS) {
    if (!isDeepStrictEqual(previous.state[field], next.state[field])) {
      throw new Error(`event changed task lifecycle state it does not own: ${field}`);
    }
  }
}

function expectedState(previous, event, updates) {
  const state = clone(previous.state);
  Object.assign(state, updates, {
    runtime_revision: event.revision,
    last_event_id: event.event_id,
    consistency: "current",
  });
  return state;
}

function assertExactLifecycleProjection(event, previous, taskContent, state) {
  if (event.projection.task_content !== taskContent
    || !isDeepStrictEqual(event.projection.state, state)) {
    throw new Error(`${event.kind} projection is not its exact lifecycle transition`);
  }
}

function validateCreated(event, index) {
  exactKeys(event.data, ["from", "to"], "task.created data");
  if (index !== 0 || event.revision !== 1 || event.data.from !== null || event.data.to !== "todo"
    || event.projection.state.status !== "todo"
    || !isDeepStrictEqual(event.result, { task_id: event.task_id })) {
    throw new Error("task.created is not a canonical genesis event");
  }
  const fields = parseTaskHeader(event.projection.task_content);
  if (headerValue(fields, "created") !== localDay(event)
    || headerValue(fields, "updated") !== localDay(event)
    || event.projection.state.updated_at !== seconds(event)) {
    throw new Error("task.created date projection differs from its event clock");
  }
  for (const field of [
    "execution_authority", "verification", "slice_acceptances", "execution_evidence_history",
    "completion",
  ]) {
    if (event.projection.state[field] !== undefined) {
      throw new Error(`task.created injected privileged state: ${field}`);
    }
  }
  if (event.projection.state.active_team?.schema_version === 2) {
    throw new Error("task.created cannot initialize a Team v2 generation");
  }
}

function validateStarted(event, previous) {
  exactKeys(event.data, ["from", "to"], "task.started data");
  if (event.data.from !== "todo" || event.data.to !== "doing"
    || previous.state.status !== "todo" || !isDeepStrictEqual(event.result, {})) {
    throw new Error("task.started envelope is invalid");
  }
  const taskContent = renderTaskFields(previous.task_content, {
    status: "doing", updated: localDay(event),
  });
  assertExactLifecycleProjection(event, previous, taskContent, expectedState(previous, event, {
    status: "doing", updated_at: seconds(event),
  }));
}

function validateBlocked(event, previous) {
  exactKeys(event.data, ["from", "to", "reason"], "task.blocked data");
  if (event.data.from !== "doing" || event.data.to !== "blocked"
    || previous.state.status !== "doing" || typeof event.data.reason !== "string"
    || !event.data.reason.trim() || /[\r\n\t]/.test(event.data.reason)
    || !isDeepStrictEqual(event.result, {})) {
    throw new Error("task.blocked envelope is invalid");
  }
  if ((previous.state.verification?.operation_claims || [])
    .some((claim) => claim.status === "in_progress")) {
    throw new Error("task.blocked cannot strand an in-progress verification claim");
  }
  const now = seconds(event);
  const taskContent = renderTaskFields(previous.task_content, {
    status: "blocked", updated: localDay(event), blocked_reason: event.data.reason,
    blocked_at: now,
  });
  assertExactLifecycleProjection(event, previous, taskContent, expectedState(previous, event, {
    status: "blocked", blocked_reason: event.data.reason, blocked_at: now, updated_at: now,
  }));
}

function validateResumed(event, previous) {
  exactKeys(event.data, ["from", "to"], "task.resumed data");
  if (event.data.from !== "blocked" || event.data.to !== "doing"
    || previous.state.status !== "blocked" || !isDeepStrictEqual(event.result, {})) {
    throw new Error("task.resumed envelope is invalid");
  }
  const now = seconds(event);
  const taskContent = renderTaskFields(previous.task_content, {
    status: "doing", updated: localDay(event), resumed_at: now,
  });
  assertExactLifecycleProjection(event, previous, taskContent, expectedState(previous, event, {
    status: "doing", resumed_at: now, updated_at: now,
  }));
}

function validateCompletionShape(event, previous, events) {
  exactKeys(event.data, [
    "from", "to", "outcome", "authority_ref", "evidence_refs", "no_verify_reason",
  ], "task.completion.closed data");
  const data = event.data;
  if (previous.state.status !== "doing" || data.from !== "doing" || data.to !== "done"
    || !new Set(["succeeded", "failed", "cancelled"]).has(data.outcome)
    || !Array.isArray(data.evidence_refs)
    || (data.outcome !== "succeeded" && (!data.authority_ref || data.evidence_refs.length === 0))
    || (data.outcome === "succeeded" && data.no_verify_reason)) {
    throw new Error("task.completion.closed envelope is invalid");
  }
  if ((previous.state.verification?.operation_claims || [])
    .some((claim) => claim.status === "in_progress")) {
    throw new Error("task.completion.closed cannot strand an in-progress verification claim");
  }
  const teamIssues = teamClosureIssues(previous.state.active_team, data.outcome);
  if (teamIssues.length > 0) {
    throw new Error(`task.completion.closed Team barrier failed: ${teamIssues.join("; ")}`);
  }
  const activeGrant = currentGrant(previous.state.execution_authority);
  if (previous.state.execution_authority?.schema_version === 2 && !activeGrant) {
    throw new Error("formal completion requires a current active execution grant");
  }
  if (!activeGrant && executionHistoryRequired(events.slice(0, -1))) {
    throw new Error("formal execution history cannot use direct task completion");
  }
  const completion = event.projection.state.completion;
  exactKeys(completion, [
    "schema_version", "outcome", "authority_ref", "evidence_refs", "completion_snapshot",
    "verification_record_id", "verification_identity_digest", "verification_record_ids",
    "release_decision", "grant_id", "scope_digest", "evidence_epoch", "team_run_id",
    "team_generation", "closed_at",
  ], "task completion projection");
  const team = previous.state.active_team || {};
  if (completion.schema_version !== 1 || completion.outcome !== data.outcome
    || completion.authority_ref !== data.authority_ref
    || !isDeepStrictEqual(completion.evidence_refs, data.evidence_refs)
    || completion.closed_at !== seconds(event)
    || completion.grant_id !== (activeGrant?.grant_id || "")
    || completion.scope_digest !== (activeGrant?.scope_digest || "")
    || completion.evidence_epoch !== (activeGrant?.evidence_epoch || 0)
    || completion.team_run_id !== (team.team_run_id || "")
    || completion.team_generation !== (team.generation || 0)
    || !Array.isArray(completion.verification_record_ids)) {
    throw new Error("task completion projection is not bound to its prior authority/evidence");
  }
  if (data.outcome === "succeeded" && activeGrant) {
    const acceptedSources = [];
    const recordIds = [];
    for (const slice of activeGrant.scope.required_slices) {
      const accepted = previous.state.slice_acceptances?.[slice.slice_id];
      const source = events.slice(0, -1).find((candidate) => (
        candidate.kind === "slice.accepted"
          && candidate.revision === accepted?.revision
          && candidate.result?.accepted?.operation_id === accepted?.operation_id
          && candidate.result?.accepted?.slice_id === slice.slice_id
      ));
      if (!accepted || accepted.status !== "accepted" || !source) {
        throw new Error(`task completion lacks authoritative accepted slice: ${slice.slice_id}`);
      }
      acceptedSources.push({ accepted, source });
      const byCheck = new Map((accepted.verification_records || [])
        .map((record) => [record.check_id, record]));
      for (const check of slice.checks) {
        const record = byCheck.get(check.check_id);
        if (!record || !isDeepStrictEqual(
          previous.state.verification?.required_gates?.[check.check_id],
          Object.fromEntries(Object.entries(record).filter(
            ([field]) => !new Set([
              "verification_event_id", "verification_revision", "release_fact_id",
              "release_fact_outcome", "candidate_manifest_digest",
            ]).has(field),
          )),
        )) {
          throw new Error(`task completion verification evidence is not current: ${check.check_id}`);
        }
        recordIds.push(record.record_id);
      }
    }
    const final = acceptedSources.sort((left, right) => (
      left.source.revision - right.source.revision
    )).at(-1);
    const actual = final.accepted.actual_size || {};
    const expectedSnapshot = {
      schema_version: 2,
      grant_id: activeGrant.grant_id,
      scope_digest: activeGrant.scope_digest,
      evidence_epoch: activeGrant.evidence_epoch,
      repo_realpath: activeGrant.scope.repo.realpath,
      head_sha: actual.accepted_head_sha || actual.start_head_sha || "",
      tree_oid: actual.accepted_tree_oid || actual.current_tree_oid || "",
      source_slice_id: final.accepted.slice_id,
      source_acceptance_event_id: final.source.event_id,
      source_acceptance_revision: final.source.revision,
    };
    if (!isDeepStrictEqual(completion.completion_snapshot, expectedSnapshot)
      || !isDeepStrictEqual(completion.verification_record_ids, recordIds)
      || completion.verification_record_id !== (recordIds.length === 1 ? recordIds[0] : "")
      || completion.verification_identity_digest !== "") {
      throw new Error("formal task completion snapshot/records differ from accepted evidence");
    }
    const binding = activeGrant.scope.release_binding;
    if (!binding && completion.release_decision !== null) {
      throw new Error("ordinary execution completion cannot carry a release decision");
    }
    if (binding) {
      validateReleaseDecision(completion.release_decision, binding);
      const releaseRecords = acceptedSources.flatMap(({ accepted }) => (
        accepted.verification_records || []
      )).filter((record) => record.release_requirement);
      const recordsByRequirement = new Map(releaseRecords.map((record) => [
        record.release_requirement.requirement_ref,
        record,
      ]));
      if (recordsByRequirement.size !== binding.requirement_refs.length
        || completion.release_decision.status !== "certified"
        || completion.release_decision.requirement_results.some((result) => (
          result.submitted_outcome !== "passed" || result.outcome !== "passed"
        ))
        || completion.release_decision.candidate_manifest_digest !== releaseRecords[0]
          ?.candidate_manifest_digest
        || releaseRecords.some((record) => (
          record.candidate_manifest_digest
            !== completion.release_decision.candidate_manifest_digest
        ))
        || completion.release_decision.requirement_results.some((result) => {
          const record = recordsByRequirement.get(result.requirement_ref);
          return !record || record.release_fact_id !== result.fact_id
            || record.release_fact_outcome !== result.outcome
            || (result.outcome === "passed" && result.submitted_outcome !== "passed");
        })) {
        throw new Error("task completion release decision differs from accepted release receipts");
      }
    }
  } else if (data.outcome === "succeeded") {
    const verification = previous.state.verification || {};
    const matching = events.slice(0, -1).filter((candidate) => (
      candidate.kind === "verification.recorded"
        && candidate.data?.record_id === verification.record_id
        && candidate.data?.identity_digest === verification.identity_digest
        && previous.state.last_verified_at === seconds(candidate)
        && String(verification.last_identity_record || "")
          .endsWith(`verification/${path.basename(candidate.result?.identityFile || "")}`)
        && String(verification.last_record || "")
          .endsWith(`verification/${path.basename(candidate.result?.recordFile || "")}`)
    ));
    const source = matching.at(-1) || null;
    const embedded = source ? embeddedVerificationIdentity(source) : null;
    if (completion.completion_snapshot !== null
      || !source || !embedded
      || completion.verification_record_id !== verification.record_id
      || completion.verification_identity_digest !== verification.identity_digest
      || !isDeepStrictEqual(completion.verification_record_ids, [verification.record_id])
      || completion.release_decision !== null
      || previous.state.last_verified_at !== seconds(source)
      || verification.last_exit_code !== 0
      || verification.outcome !== "passed" || verification.identity_schema_version !== 2
      || verification.identity_stable !== true || verification.skipped === true
      || !String(verification.last_identity_record || "").endsWith(embedded.identityPath)
      || source.data.required_gate !== null || source.data.release_evidence !== null
      || source.data.authority_identity !== null
      || source.data.verdict !== "passed" || source.data.outcome !== "passed"
      || source.result?.exitCode !== 0
      || embedded.record.schema_version !== 2 || embedded.record.task_id !== event.task_id
      || embedded.record.verdict !== "passed" || embedded.record.outcome !== "passed"
      || embedded.record.provenance !== "executed"
      || embedded.record.snapshot_stable !== true
      || embedded.record.result?.exit_code !== 0) {
      throw new Error("direct task completion is not bound to one verification identity");
    }
  } else if (completion.completion_snapshot !== null
    || completion.verification_record_id !== ""
    || completion.verification_identity_digest !== ""
    || !isDeepStrictEqual(completion.verification_record_ids, [])
    || completion.release_decision !== null) {
    throw new Error("non-success task completion carries successful verification or release evidence");
  }
  const expectedResult = {
    outcome: data.outcome,
    grant_id: activeGrant?.grant_id || "",
    scope_digest: activeGrant?.scope_digest || "",
    evidence_epoch: activeGrant?.evidence_epoch || 0,
  };
  if (!isDeepStrictEqual(event.result, expectedResult)) {
    throw new Error("task.completion.closed result is invalid");
  }
}

function validateReleaseDecision(decision, binding) {
  exactKeys(decision, [
    "schema_version", "authority", "status", "target_delivery_class", "intent_sha256",
    "profile_ref", "profile_sha256", "candidate_manifest_digest", "requirement_results",
    "decision_id",
  ], "task completion release decision");
  if (decision.schema_version !== 1 || decision.authority !== "derived-from-final-release-sweep"
    || !new Set(["certified", "denied", "cannot_verify"]).has(decision.status)
    || decision.target_delivery_class !== "product_release"
    || decision.intent_sha256 !== binding.intent_sha256
    || decision.profile_ref !== binding.profile_ref
    || decision.profile_sha256 !== binding.profile_sha256
    || !/^sha256:[a-f0-9]{64}$/.test(decision.candidate_manifest_digest || "")
    || !Array.isArray(decision.requirement_results)) {
    throw new Error("task completion release decision differs from execution authority");
  }
  const expectedRefs = [...binding.requirement_refs].sort();
  const actualRefs = [];
  for (const result of decision.requirement_results) {
    exactKeys(result, [
      "requirement_ref", "fact_id", "submitted_outcome", "outcome", "reason_codes",
      "result_id",
    ], "task completion release requirement result");
    const body = { ...result };
    delete body.result_id;
    if (!/^sha256:[a-f0-9]{64}$/.test(result.fact_id || "")
      || !new Set(["passed", "failed", "cannot_verify"]).has(result.submitted_outcome)
      || !new Set(["passed", "failed", "cannot_verify"]).has(result.outcome)
      || !Array.isArray(result.reason_codes) || digestCanonical(body) !== result.result_id) {
      throw new Error("task completion release requirement result is invalid");
    }
    actualRefs.push(result.requirement_ref);
  }
  const body = { ...decision };
  delete body.decision_id;
  const expectedStatus = decision.requirement_results.some((result) => result.outcome === "failed")
    ? "denied"
    : decision.requirement_results.some((result) => result.outcome === "cannot_verify")
      ? "cannot_verify"
      : "certified";
  if (decision.status !== expectedStatus
    || !isDeepStrictEqual(actualRefs.sort(), expectedRefs)
    || digestCanonical(body) !== decision.decision_id) {
    throw new Error("task completion release decision coverage or digest is invalid");
  }
}

function validateCompleted(event, previous, events) {
  validateCompletionShape(event, previous, events);
  const data = event.data;
  const now = seconds(event);
  const updates = {
    status: "done",
    updated: localDay(event),
    completion_outcome: data.outcome,
    completion_authority_ref: data.authority_ref || "-",
    completion_evidence_refs: data.evidence_refs.length > 0 ? data.evidence_refs.join(" ") : "-",
    completion_closed_at: now,
  };
  if (data.no_verify_reason) {
    updates.no_verify_reason = data.no_verify_reason;
    updates.no_verify_at = now;
  }
  if (event.projection.task_content !== renderTaskFields(previous.task_content, updates)) {
    throw new Error("task.completion.closed Markdown projection is invalid");
  }
  const ignored = new Set([
    "execution_authority", "verification", "completion", "runtime_revision", "last_event_id",
    "consistency", "updated_at", "status", "no_verify_reason", "no_verify_at",
  ]);
  const before = previous.state;
  const after = event.projection.state;
  for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (!ignored.has(field) && !isDeepStrictEqual(before[field], after[field])) {
      throw new Error(`task.completion.closed changed unrelated state: ${field}`);
    }
  }
  if (after.status !== "done" || after.updated_at !== now
    || (data.no_verify_reason && (after.no_verify_reason !== data.no_verify_reason
      || after.no_verify_at !== now))) {
    throw new Error("task.completion.closed lifecycle fields are invalid");
  }
}

function validateArchived(event, previous, events) {
  exactKeys(event.data, ["reason"], "task.archived data");
  if (!new Set(["todo", "doing", "blocked", "done"]).has(previous.state.status)
    || typeof event.data.reason !== "string" || !event.data.reason.trim()
    || /[\r\n\t]/.test(event.data.reason)) {
    throw new Error("task.archived envelope is invalid");
  }
  if ((previous.state.verification?.operation_claims || [])
    .some((claim) => claim.status === "in_progress")) {
    throw new Error("task.archived cannot strand an in-progress verification claim");
  }
  const team = previous.state.active_team;
  if (team?.schema_version === 2 && (!isTerminalTeamStatus(team.status)
    || teamControlPlaneClosureIssues(team).length > 0)) {
    throw new Error("task.archived requires a terminal, closed Team v2 control plane");
  }
  if (currentGrant(previous.state.execution_authority)) {
    throw new Error("task.archived cannot strand an active execution grant");
  }
  const completion = previous.state.completion;
  const completedGrant = (previous.state.execution_authority?.grants || [])
    .find((grant) => grant.grant_id === completion?.grant_id && grant.status === "completed");
  if (executionHistoryRequired(events.slice(0, -1))) {
    if (previous.state.status !== "done" || completion?.schema_version !== 1 || !completedGrant) {
      throw new Error("formal execution archive requires a bound completed task/grant barrier");
    }
  }
  const now = seconds(event);
  const taskContent = renderTaskFields(previous.task_content, {
    status: "archived", updated: localDay(event), archived_reason: event.data.reason,
    archived_at: now,
  });
  const after = event.projection.state;
  const expected = expectedState(previous, event, {
    status: "archived", archived_reason: event.data.reason, archived_at: now, updated_at: now,
  });
  const link = event.result?.final_commit_link ?? null;
  if (!isDeepStrictEqual(event.result, { final_commit_link: link })) {
    throw new Error("task.archived result is invalid");
  }
  if (previous.state.completion?.completion_snapshot && !link) {
    throw new Error("task archive requires a final commit link for its completion snapshot");
  }
  if (link) {
    exactKeys(link, [
      "schema_version", "repo_realpath", "head_sha", "tree_oid", "completion_head_sha",
      "source_completion_revision", "linked_revision", "linked_at",
    ], "task archive final commit link");
    if (previous.state.status !== "done" || link.schema_version !== 1
      || link.linked_revision !== event.revision || link.linked_at !== now
      || link.repo_realpath !== previous.state.completion?.completion_snapshot?.repo_realpath
      || link.completion_head_sha !== previous.state.completion?.completion_snapshot?.head_sha
      || link.tree_oid !== previous.state.completion?.completion_snapshot?.tree_oid
      || link.source_completion_revision
        !== (completedGrant?.terminal?.revision || previous.state.runtime_revision)
      || !/^[a-f0-9]{40}$/.test(link.head_sha || "")
      || !/^[a-f0-9]{40}$/.test(link.tree_oid || "")
      || !/^[a-f0-9]{40}$/.test(link.completion_head_sha || "")) {
      throw new Error("task archive final commit link is not bound to completion");
    }
    expected.completion = { ...expected.completion, final_commit_link: link };
  }
  assertExactLifecycleProjection(event, previous, taskContent, expected);
}

function validateTaskLifecycleEventProjection(events) {
  for (const [index, event] of events.entries()) {
    try {
      assertProjectionParity(event);
      const previousEvent = events[index - 1];
      const previous = previousEvent?.projection;
      if (event.kind === "task.done") {
        throw new Error("task.done is a legacy row, not an authoritative lifecycle event");
      }
      if (event.kind === "task.created") {
        validateCreated(event, index);
        continue;
      }
      if (!previous) throw new Error("authoritative task history must begin with task.created");
      if (event.kind === "task.started") validateStarted(event, previous);
      else if (event.kind === "task.blocked") validateBlocked(event, previous);
      else if (event.kind === "task.resumed") validateResumed(event, previous);
      else if (event.kind === "task.completion.closed") validateCompleted(event, previous, events.slice(0, index + 1));
      else if (event.kind === "task.archived") validateArchived(event, previous, events.slice(0, index + 1));
      else {
        assertLifecycleHeadersPreserved(previous, event.projection);
        assertLifecycleStatePreserved(previous, event.projection);
      }
    } catch (error) {
      throw new Error(
        `task lifecycle event projection mismatch at revision ${event.revision}: ${error.message}`,
      );
    }
  }
}

module.exports = {
  LIFECYCLE_KINDS,
  validateTaskLifecycleEventProjection,
};
