"use strict";

const path = require("path");
const { isDeepStrictEqual } = require("util");
const { digestCanonical } = require("../verification/identity");
const { currentGrant } = require("./execution-grant");
const { TASK_ARTIFACT_PREFIX } = require("./contract-locator");
const {
  bindAttempt,
  closeDispatch,
  closeLane,
  createTeamRun,
  deriveTeam,
  disposeDispatch,
  fallbackAttempt,
  isMutableTeamStatus,
  isTerminalTeamStatus,
  markAttemptRunning,
  openDispatch,
  openLane,
  quiesceAttempt,
  recordCapabilitySnapshot,
  recordLaunchReconciliation,
  recordObservation,
  recordSelectionEvent,
  reserveAttempt,
  resolveLaunchClaim,
  teamControlPlaneClosureIssues,
  terminalAttempt,
} = require("./lane-registry");
const { booleanValue, commaList } = require("./args");

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const AUTHORITY_REF = /^(user-message|operator-input):[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const ACTIVE_TEAM_STATUSES = new Set(["running", "promoted:execute", "promoted:worktree"]);
const DOING_TASK_CONTROL_STARTS = new Set([
  "team.lane.open", "team.dispatch.open", "team.attempt.reserve",
  "team.attempt.fallback", "team.attempt.observation.launch.claimed",
]);

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || !isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort())) {
    throw new Error(`${label} has invalid fields`);
  }
}

function activeTeam(event) {
  const team = event?.projection?.state?.active_team;
  return team && typeof team === "object" && !Array.isArray(team) ? team : null;
}

function array(team, field) {
  return Array.isArray(team?.[field]) ? team[field] : [];
}

function claimIdentity(claim) {
  return Object.fromEntries([
    "schema_version",
    "claim_kind",
    "task_id",
    "team_run_id",
    "team_generation",
    "attempt_id",
    "attempt_status",
    "operation_id",
    "claim_operation_id",
    "terminal_operation_id",
    "request_digest",
    "launch_operation_id",
    "grant_id",
    "scope_digest",
    "evidence_epoch",
    "slice_id",
    "artifact_identity",
  ].map((field) => [field, claim[field]]));
}

function validTimestamp(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

function seconds(timestamp) {
  return String(timestamp).replace(/\.\d{3}Z$/, "Z");
}

function validateLaunchClaimIdentity(identity, event, team, attempt) {
  exactKeys(identity, [
    "schema_version",
    "claim_kind",
    "task_id",
    "team_run_id",
    "team_generation",
    "attempt_id",
    "attempt_status",
    "operation_id",
    "claim_operation_id",
    "terminal_operation_id",
    "request_digest",
    "launch_operation_id",
    "grant_id",
    "scope_digest",
    "evidence_epoch",
    "slice_id",
    "artifact_identity",
  ], "observer launch claim identity");
  if (identity.schema_version !== 1 || identity.claim_kind !== "paseo-observer-launch"
    || identity.task_id !== event.task_id || identity.team_run_id !== team.team_run_id
    || identity.team_generation !== team.generation || identity.attempt_id !== attempt.attempt_id
    || identity.attempt_status !== "reserved" || attempt.status !== "reserved"
    || identity.launch_operation_id !== attempt.launch_operation_id
    || identity.claim_operation_id !== `${identity.operation_id}-observation-launch-claim`
    || identity.terminal_operation_id !== `${identity.operation_id}-observation`
    || !DIGEST.test(identity.request_digest || "")) {
    throw new Error("observer launch claim identity is invalid");
  }
  if (identity.artifact_identity !== null) {
    exactKeys(identity.artifact_identity, [
      "brief_path", "brief_sha256", "contract_sha256", "execution_plan_sha256",
    ], "observer launch artifact identity");
  }
  if (team.mode === "execute") {
    const expectedArtifactIdentity = {
      brief_path: team.admission?.brief?.path || "",
      brief_sha256: team.admission?.brief?.sha256 || "",
      contract_sha256: team.admission?.brief?.contract_sha256 || "",
      execution_plan_sha256: team.admission?.brief?.execution_plan_sha256 || "",
    };
    if (!team.grant_id || !DIGEST.test(team.scope_digest || "")
      || !Number.isInteger(team.evidence_epoch) || team.evidence_epoch < 1
      || !team.slice_id
      || !DIGEST.test(expectedArtifactIdentity.brief_sha256)
      || !DIGEST.test(expectedArtifactIdentity.contract_sha256)
      || !DIGEST.test(expectedArtifactIdentity.execution_plan_sha256)
      || identity.grant_id !== team.grant_id
      || identity.scope_digest !== team.scope_digest
      || identity.evidence_epoch !== team.evidence_epoch
      || identity.slice_id !== team.slice_id
      || !isDeepStrictEqual(identity.artifact_identity, expectedArtifactIdentity)) {
      throw new Error("observer launch claim authority differs from its execute Team");
    }
  } else if (identity.grant_id !== "" || identity.scope_digest !== ""
    || identity.evidence_epoch !== 0 || identity.slice_id !== ""
    || identity.artifact_identity !== null) {
    throw new Error("discussion observer launch claim carries execution authority");
  }
}

function sameGeneration(previous, next) {
  return previous?.schema_version === 2 && next?.schema_version === 2
    && previous.team_run_id === next.team_run_id
    && previous.generation === next.generation;
}

function replaceAt(values, index, value) {
  return values.map((entry, entryIndex) => entryIndex === index ? value : entry);
}

function claimRecoveryObligation(team, claim) {
  if (claim.status === "in_progress") return true;
  const attempt = array(team, "attempts")
    .find((candidate) => candidate.attempt_id === claim.attempt_id);
  const leases = array(team, "writer_leases")
    .filter((lease) => lease.owner_attempt_id === claim.attempt_id);
  return !attempt || attempt.status !== "quiesced"
    || leases.some((lease) => lease.state !== "released");
}

function assertRecoveryStatusMutable(previous, next) {
  const previousObligation = array(previous, "observer_launch_claims")
    .some((claim) => claimRecoveryObligation(previous, claim));
  const nextObligation = array(next, "observer_launch_claims")
    .some((claim) => claimRecoveryObligation(next, claim));
  if ((previousObligation || nextObligation)
    && (!isMutableTeamStatus(previous?.status) || !isMutableTeamStatus(next?.status))) {
    throw new Error("observer launch recovery requires a mutable Team status");
  }
}

function validatePendingPromotion(event, previous, next) {
  const pending = array(previous, "observer_launch_claims")
    .some((claim) => claim.status === "in_progress");
  if (!pending) return;
  if (previous.status === next.status && event.kind !== "team.promoted") return;
  if (event.kind !== "team.promoted" || event.data?.target !== "worktree"
    || next.status !== "promoted:worktree" || next.promoted_to !== "worktree"
    || next.mode !== previous.mode) {
    throw new Error("pending observer launch claim only permits worktree promotion");
  }
}

function assertExactTeam(next, expected, label) {
  deriveTeam(expected);
  if (expected.backend_sidecar
    && new Set(["mixed", "none"]).has(expected.effective_backend)) {
    expected.backend = "native";
  }
  if (!isDeepStrictEqual(next, expected)) {
    const changed = [...new Set([
      ...Object.keys(next || {}),
      ...Object.keys(expected || {}),
    ])].filter((field) => !isDeepStrictEqual(next?.[field], expected?.[field]));
    throw new Error(
      `${label} projection is not the exact reducer transition: ${changed.join(", ")}`,
    );
  }
}

function attemptTransition(event, previous) {
  if (!new Set([
    "team.attempt.reserve",
    "team.attempt.bind",
    "team.attempt.running",
    "team.attempt.terminal",
    "team.attempt.quiesced",
    "team.attempt.fallback",
  ]).has(event.kind)) return null;
  const data = event.data || {};
  if (data.operationId !== event.operation_id) {
    throw new Error("attempt event operation does not match its data");
  }
  const parsed = { ...data };
  delete parsed.evidenceRefs;
  const now = seconds(event.occurred_at);
  const common = { ...parsed, now };
  if (event.kind === "team.attempt.reserve") {
    return reserveAttempt(previous, {
      ...common,
      fallbackPolicy: data.fallbackPolicy === "no-fallback" ? "none" : data.fallbackPolicy,
      ownedPaths: commaList(data.paths),
      writable: data.writable === undefined
        ? undefined
        : booleanValue(data.writable, "writable"),
    });
  }
  if (event.kind === "team.attempt.bind") return bindAttempt(previous, common);
  if (event.kind === "team.attempt.running") return markAttemptRunning(previous, common);
  if (event.kind === "team.attempt.terminal") {
    return terminalAttempt(previous, {
      ...data,
      retryEligible: booleanValue(data.retryEligible || "false", "retry eligible"),
      launchInvoked: booleanValue(data.launchInvoked || "false", "launch invoked"),
      evidenceRefs: commaList(data.evidenceRefs),
      now,
    });
  }
  if (event.kind === "team.attempt.quiesced") {
    return quiesceAttempt(previous, { ...data, evidenceRefs: data.evidenceRefs || [], now });
  }
  if (event.kind === "team.attempt.fallback") {
    return fallbackAttempt(previous, { ...data, evidenceRefs: data.evidenceRefs || [], now });
  }
  return null;
}

function validateAttemptTransition(event, previous, next) {
  const transitioned = attemptTransition(event, previous);
  if (!transitioned) return false;
  assertExactTeam(next, transitioned.team, event.kind);
  if (!isDeepStrictEqual(event.result || {}, transitioned.result || {})) {
    throw new Error(`${event.kind} result does not match its reducer transition`);
  }
  return true;
}

function controlTransition(event, previous) {
  const data = event.data || {};
  const now = seconds(event.occurred_at);
  if (!new Set([
    "team.selection.recorded", "team.capability.recorded", "team.lane.open",
    "team.lane.close", "team.dispatch.open", "team.dispatch.dispose",
    "team.dispatch.close", "team.attempt.observed",
  ]).has(event.kind)) return null;
  if (event.kind === "team.attempt.observed" && data.claimOperationId) return null;
  if (data.operationId !== event.operation_id) {
    throw new Error(`${event.kind} operation does not match its event envelope`);
  }
  if (event.kind === "team.selection.recorded") {
    return recordSelectionEvent(previous, { ...data, now });
  }
  if (event.kind === "team.capability.recorded") {
    return recordCapabilitySnapshot(previous, {
      operationId: data.operationId,
      snapshotId: data.eventId,
      provider: data.provider,
      model: data.model,
      modelFamily: data.modelFamily,
      runtimeModeIds: data.runtimeModeIds,
      payloadDigest: data.payloadDigest,
      observationAction: data.observationAction,
      observedAt: data.observedAt,
      authorityRef: data.authorityRef,
      now,
    });
  }
  if (event.kind === "team.lane.open") {
    return openLane(previous, {
      ...data,
      configuredBackend: data.backend || null,
      fallbackPolicy: data.fallbackPolicy === "no-fallback" ? "none" : data.fallbackPolicy,
      ownedPaths: commaList(data.paths),
      writable: data.writable === undefined
        ? undefined
        : booleanValue(data.writable, "writable"),
      now,
    });
  }
  if (event.kind === "team.lane.close") return closeLane(previous, { ...data, now });
  if (event.kind === "team.dispatch.open") {
    return openDispatch(previous, {
      ...data,
      configuredBackend: data.backend || null,
      fallbackPolicy: data.fallbackPolicy === "no-fallback" ? "none" : data.fallbackPolicy,
      now,
    });
  }
  if (event.kind === "team.dispatch.dispose") {
    return disposeDispatch(previous, {
      ...data,
      admittedAttemptIds: commaList(data.admittedAttempts),
      evidenceRefs: commaList(data.evidenceRefs),
      now,
    });
  }
  if (event.kind === "team.dispatch.close") {
    return closeDispatch(previous, { ...data, now });
  }
  if (event.kind === "team.attempt.observed") {
    exactKeys(data, [
      "taskId", "operationId", "attemptId", "observationId", "observerAction",
      "observerArgsJson", "observation",
    ], "ordinary observer receipt data");
    const attempt = array(previous, "attempts")
      .find((candidate) => candidate.attempt_id === data.attemptId);
    if (data.taskId !== event.task_id || data.operationId !== event.operation_id
      || !new Set(["wait", "stop", "inspect"]).has(data.observerAction)
      || data.observerArgsJson !== "" || !attempt?.runtime_agent_id
      || data.observation?.action !== data.observerAction
      || data.observation?.attempt_id !== attempt.attempt_id
      || data.observation?.runtime_agent_id !== attempt.runtime_agent_id
      || data.observation?.launch_operation_id !== attempt.launch_operation_id
      || Object.prototype.hasOwnProperty.call(data.observation || {}, "launch_request_digest")) {
      throw new Error("ordinary observer receipt is not bound to a non-launch attempt action");
    }
    return recordObservation(previous, {
      operationId: event.operation_id,
      observationId: data.observationId,
      observation: data.observation,
      now,
    });
  }
  return null;
}

function validateControlTransition(event, previous, next) {
  const transitioned = controlTransition(event, previous);
  if (!transitioned) return false;
  assertExactTeam(next, transitioned.team, event.kind);
  if (!isDeepStrictEqual(event.result || {}, transitioned.result || {})) {
    throw new Error(`${event.kind} result does not match its reducer transition`);
  }
  return true;
}

function validateClaimed(event, previous, next) {
  const previousClaims = array(previous, "observer_launch_claims");
  const nextClaims = array(next, "observer_launch_claims");
  const previousAttempt = array(previous, "attempts")
    .find((attempt) => attempt.attempt_id === event.data.attempt_id);
  if (!previousAttempt) throw new Error("observer launch claim attempt is missing");
  validateLaunchClaimIdentity(event.data, event, previous, previousAttempt);
  if (event.operation_id !== event.data.claim_operation_id
    || previousClaims.some((claim) => claim.operation_id === event.data.operation_id)) {
    throw new Error("observer launch claimed operation is inconsistent");
  }
  if (previousClaims.some((claim) => (
    claim.task_id === event.data.task_id
      && claim.team_run_id === event.data.team_run_id
      && claim.attempt_id === event.data.attempt_id
      && claim.launch_operation_id === event.data.launch_operation_id
  ))) {
    throw new Error("observer launch claimed event duplicates a canonical launch scope");
  }
  const appended = nextClaims.at(-1);
  if (!appended || appended.status !== "in_progress"
    || appended.claimed_at !== seconds(event.occurred_at)
    || !isDeepStrictEqual(claimIdentity(appended), event.data)
    || !isDeepStrictEqual(nextClaims.slice(0, -1), previousClaims)
    || !isDeepStrictEqual(array(next, "attempts"), array(previous, "attempts"))
    || !isDeepStrictEqual(array(next, "writer_leases"), array(previous, "writer_leases"))) {
    throw new Error("observer launch claimed projection is not an exact claim append");
  }
  if (!isDeepStrictEqual(event.result, { claim: appended })) {
    throw new Error("observer launch claimed result does not match its claim");
  }
  const expectedTeam = JSON.parse(JSON.stringify(previous));
  expectedTeam.observer_launch_claims = [...previousClaims, appended];
  assertExactTeam(next, expectedTeam, "observer launch claimed");
}

function validateReconciled(event, previous, next) {
  exactKeys(event.data, [
    "taskId", "claimOperationId", "attemptId", "launchOperationId", "observationId",
    "reconciliationStatus", "observation",
  ], "observer launch reconciliation data");
  if (event.data.taskId !== event.task_id) {
    throw new Error("observer launch reconciliation task is inconsistent");
  }
  const previousClaims = array(previous, "observer_launch_claims");
  const claimIndex = previousClaims.findIndex((claim) => (
    claim.claim_operation_id === event.data.claimOperationId
      && claim.attempt_id === event.data.attemptId
      && claim.launch_operation_id === event.data.launchOperationId
  ));
  const claim = previousClaims[claimIndex];
  const previousAttempt = array(previous, "attempts")
    .find((attempt) => attempt.attempt_id === event.data.attemptId);
  if (claimIndex < 0 || claim.status !== "in_progress" || previousAttempt?.status !== "reserved"
    || !new Set(["missing", "ambiguous"]).has(event.data.reconciliationStatus)) {
    throw new Error("observer launch reconciliation does not target its pending claim");
  }
  const nextClaim = array(next, "observer_launch_claims")[claimIndex];
  const reconciliation = nextClaim?.reconciliations?.at(-1);
  const recordedAt = reconciliation?.recorded_at;
  const expectedClaim = {
    ...claim,
    reconciliations: [...(claim.reconciliations || []), {
      observation_id: event.data.observationId,
      status: event.data.reconciliationStatus,
      recorded_at: recordedAt,
    }],
    last_reconciliation_status: event.data.reconciliationStatus,
    last_reconciliation_at: recordedAt,
  };
  if (!validTimestamp(recordedAt)
    || !isDeepStrictEqual(array(next, "observer_launch_claims"), replaceAt(
      previousClaims,
      claimIndex,
      expectedClaim,
    ))) {
    throw new Error("observer launch reconciliation claim projection is invalid");
  }
  const nextAttempt = array(next, "attempts")
    .find((attempt) => attempt.attempt_id === event.data.attemptId);
  const expectedAttempt = {
    ...previousAttempt,
    launch_state: "launch-state-unknown",
    launch_state_observation_id: event.data.observationId,
    launch_state_updated_at: nextAttempt?.launch_state_updated_at,
  };
  if (!validTimestamp(expectedAttempt.launch_state_updated_at)
    || !isDeepStrictEqual(nextAttempt, expectedAttempt)
    || !isDeepStrictEqual(array(next, "writer_leases"), array(previous, "writer_leases"))) {
    throw new Error("observer launch reconciliation attempt or lease projection is invalid");
  }
  const previousObservations = array(previous, "observations");
  const nextObservations = array(next, "observations");
  const observation = nextObservations.at(-1);
  if (!observation || observation.observation_id !== event.data.observationId
    || !isDeepStrictEqual(
      Object.fromEntries(Object.entries(observation).filter(([field]) => field !== "observation_id")),
      event.data.observation,
    )
    || observation.action !== "ls" || observation.actor_created !== false
    || observation.reconciliation_status !== event.data.reconciliationStatus
    || observation.attempt_id !== event.data.attemptId
    || observation.launch_operation_id !== event.data.launchOperationId
    || observation.launch_request_digest !== claim.request_digest
    || !isDeepStrictEqual(nextObservations.slice(0, -1), previousObservations)) {
    throw new Error("observer launch reconciliation observation is invalid");
  }
  if (!isDeepStrictEqual(event.result, {
    attempt_id: event.data.attemptId,
    claim_operation_id: event.data.claimOperationId,
    launch_state: "launch-state-unknown",
    reconciliation_status: event.data.reconciliationStatus,
  })) {
    throw new Error("observer launch reconciliation result is invalid");
  }
  const transitioned = recordLaunchReconciliation(previous, {
    operationId: event.operation_id,
    attemptId: event.data.attemptId,
    claimOperationId: event.data.claimOperationId,
    launchOperationId: event.data.launchOperationId,
    observationId: event.data.observationId,
    observation: Object.fromEntries(
      Object.entries(observation).filter(([field]) => field !== "observation_id"),
    ),
    reconciliationStatus: event.data.reconciliationStatus,
    now: seconds(event.occurred_at),
  });
  assertExactTeam(next, transitioned.team, "observer launch reconciliation");
  if (!isDeepStrictEqual(event.result, transitioned.result)) {
    throw new Error("observer launch reconciliation result differs from its reducer");
  }
}

function validateObservedLaunch(event, previous, next) {
  exactKeys(event.data, [
    "taskId", "operationId", "attemptId", "observationId", "observerAction",
    "observerArgsJson", "observation", "claimOperationId", "requestDigest",
  ], "observer launch terminal data");
  const previousClaims = array(previous, "observer_launch_claims");
  const claimIndex = previousClaims.findIndex((claim) => (
    claim.claim_operation_id === event.data.claimOperationId
      && claim.terminal_operation_id === event.data.operationId
      && claim.attempt_id === event.data.attemptId
  ));
  const claim = previousClaims[claimIndex];
  const previousAttempt = array(previous, "attempts")
    .find((attempt) => attempt.attempt_id === event.data.attemptId);
  const observation = array(next, "observations")
    .find((item) => item.observation_id === event.data.observationId);
  const actorObserved = observation?.actor_created === true
    && Boolean(observation.runtime_agent_id)
    && (observation.action === "run"
      || (observation.action === "ls" && observation.reconciliation_status === "matched"));
  const startupRejected = observation?.action === "run"
    && observation.actor_created === false
    && Number.isInteger(observation.exit_code)
    && observation.exit_code !== 0;
  if (claimIndex < 0 || claim.status !== "in_progress" || previousAttempt?.status !== "reserved"
    || event.data.taskId !== event.task_id || event.data.operationId !== event.operation_id
    || event.data.observerAction !== "run" || event.data.requestDigest !== claim.request_digest
    || event.operation_id !== claim.terminal_operation_id || !observation
    || observation.attempt_id !== claim.attempt_id
    || !isDeepStrictEqual(
      Object.fromEntries(Object.entries(observation).filter(([field]) => field !== "observation_id")),
      event.data.observation,
    )
    || observation.launch_operation_id !== claim.launch_operation_id
    || observation.launch_request_digest !== claim.request_digest
    || (!actorObserved && !startupRejected)) {
    throw new Error("observer launch terminal observation does not match its claim");
  }
  const nextClaim = array(next, "observer_launch_claims")[claimIndex];
  const expectedClaim = {
    ...claim,
    status: "terminal",
    terminal_at: nextClaim?.terminal_at,
    observation_id: event.data.observationId,
    observation_action: observation.action,
    runtime_agent_id: observation.runtime_agent_id || "",
  };
  if (!validTimestamp(expectedClaim.terminal_at)
    || !isDeepStrictEqual(array(next, "observer_launch_claims"), replaceAt(
      previousClaims,
      claimIndex,
      expectedClaim,
    ))) {
    throw new Error("observer launch terminal claim projection is invalid");
  }
  const nextAttempt = array(next, "attempts")
    .find((attempt) => attempt.attempt_id === claim.attempt_id);
  const expectedAttempt = {
    ...previousAttempt,
    launch_state: "actor-observed",
    launch_state_observation_id: event.data.observationId,
    launch_state_updated_at: nextAttempt?.launch_state_updated_at,
  };
  if (!validTimestamp(expectedAttempt.launch_state_updated_at)
    || !isDeepStrictEqual(nextAttempt, expectedAttempt)
    || !isDeepStrictEqual(array(next, "writer_leases"), array(previous, "writer_leases"))) {
    throw new Error("observer launch terminal attempt or lease projection is invalid");
  }
  const previousObservations = array(previous, "observations");
  const nextObservations = array(next, "observations");
  if (!isDeepStrictEqual(nextObservations, [...previousObservations, observation])
    || !isDeepStrictEqual(event.result, {
      observation_id: event.data.observationId,
      claim: nextClaim,
    })) {
    throw new Error("observer launch terminal observation or result projection is invalid");
  }
  const transitioned = recordObservation(previous, {
    operationId: event.operation_id,
    observationId: event.data.observationId,
    observation: Object.fromEntries(
      Object.entries(observation).filter(([field]) => field !== "observation_id"),
    ),
    now: seconds(event.occurred_at),
  });
  const expectedTeam = transitioned.team;
  expectedTeam.observer_launch_claims[claimIndex] = expectedClaim;
  const expectedAttemptIndex = expectedTeam.attempts
    .findIndex((attempt) => attempt.attempt_id === claim.attempt_id);
  expectedTeam.attempts[expectedAttemptIndex] = expectedAttempt;
  assertExactTeam(next, expectedTeam, "observer launch terminal observation");
}

function validateResolved(event, previous, next) {
  const data = event.data;
  const previousClaims = array(previous, "observer_launch_claims");
  const claimIndex = previousClaims.findIndex((claim) => (
    claim.claim_operation_id === data.claimOperationId
      && claim.attempt_id === data.attemptId
      && claim.launch_operation_id === data.launchOperationId
  ));
  const claim = previousClaims[claimIndex];
  const previousAttempt = array(previous, "attempts")
    .find((attempt) => attempt.attempt_id === data.attemptId);
  if (claimIndex < 0 || claim.status !== "in_progress" || previousAttempt?.status !== "reserved"
    || data.taskId !== event.task_id || data.operationId !== event.operation_id
    || data.action !== "resolve-launch" || data.disposition !== "no-actor-confirmed"
    || !AUTHORITY_REF.test(data.authorityRef || "") || typeof data.reason !== "string"
    || !data.reason.trim() || !Array.isArray(data.evidenceRefs) || data.evidenceRefs.length === 0) {
    throw new Error("observer launch resolution does not target its pending claim");
  }
  const nextClaim = array(next, "observer_launch_claims")[claimIndex];
  const resolvedAt = nextClaim?.resolved_at;
  const resolution = {
    schema_version: 1,
    operation_id: event.operation_id,
    disposition: "no-actor-confirmed",
    authority_ref: data.authorityRef,
    reason: data.reason,
    evidence_refs: data.evidenceRefs,
  };
  const expectedClaim = {
    ...claim,
    status: "indeterminate",
    resolved_at: resolvedAt,
    resolution,
  };
  if (!validTimestamp(resolvedAt)
    || !isDeepStrictEqual(array(next, "observer_launch_claims"), replaceAt(
      previousClaims,
      claimIndex,
      expectedClaim,
    ))) {
    throw new Error("observer launch resolution claim projection is invalid");
  }
  const nextAttempt = array(next, "attempts")
    .find((attempt) => attempt.attempt_id === data.attemptId);
  const expectedAttempt = {
    ...previousAttempt,
    launch_state: "no-actor-confirmed",
    launch_invoked: false,
    runtime_outcome: "interrupted",
    evidence_refs: data.evidenceRefs,
    status: "terminal",
    terminal_at: nextAttempt?.terminal_at,
    launch_resolution_operation_id: event.operation_id,
  };
  if (!validTimestamp(expectedAttempt.terminal_at) || !isDeepStrictEqual(nextAttempt, expectedAttempt)
    || !isDeepStrictEqual(array(next, "writer_leases"), array(previous, "writer_leases"))
    || !isDeepStrictEqual(event.result, {
      attempt_id: data.attemptId,
      claim_operation_id: data.claimOperationId,
      claim_status: "indeterminate",
      disposition: "no-actor-confirmed",
      status: "terminal",
    })) {
    throw new Error("observer launch resolution attempt, lease, or result projection is invalid");
  }
  const transitioned = resolveLaunchClaim(previous, { ...data, now: seconds(event.occurred_at) });
  assertExactTeam(next, transitioned.team, "observer launch resolution");
  if (!isDeepStrictEqual(event.result, transitioned.result)) {
    throw new Error("observer launch resolution result differs from its reducer");
  }
}

function validateTeamStart(event, previous, next, previousState) {
  exactKeys(event.data, [
    "mode", "objective", "backend", "fallback_policy", "authorization_ref",
    "grant_id", "scope_digest", "agents", "roles", "providers",
    "selection_authority_kind", "selection_authority_ref", "brief_path",
    "brief_sha256", "contract_sha256", "execution_plan_sha256",
  ], "team.started data");
  if (!next || next.schema_version !== 2 || next.status !== "running") {
    throw new Error("team.started must create a running Team v2 generation");
  }
  if (previousState?.status !== "doing" || event.projection?.state?.status !== "doing") {
    throw new Error("team.started requires a doing task before and after admission");
  }
  if (previous?.schema_version === 2 && (!isTerminalTeamStatus(previous.status)
    || teamControlPlaneClosureIssues(previous).length > 0)) {
    throw new Error("new Team generation requires a terminal, closed previous control plane");
  }
  const generation = previous?.schema_version === 2 ? Number(previous.generation || 0) + 1 : 1;
  const artifactDir = previousState?.artifact_dir || "";
  const decision = `${artifactDir}/team/decision.md`.replace(/^\//, "");
  const staffing = `${artifactDir}/team/staffing.md`.replace(/^\//, "");
  const expected = createTeamRun({
    previous: previous || {},
    mode: event.data.mode,
    objective: event.data.objective,
    configuredBackend: event.data.backend || null,
    fallbackPolicy: event.data.fallback_policy,
    authorizationRef: event.data.authorization_ref,
    agents: event.data.agents,
    roles: event.data.roles,
    providers: event.data.providers,
    decision,
    staffing,
    now: seconds(event.occurred_at),
    teamSelection: event.data.backend ? {
      eventId: `selection-team-${String(generation).padStart(4, "0")}`,
      kind: "backend",
      scope: "team",
      authorityKind: event.data.selection_authority_kind,
      authorityRef: event.data.selection_authority_ref,
      backend: event.data.backend,
    } : null,
  });
  expected.admission = next.admission;
  expected.admitted_owned_paths = next.admission?.admitted_owned_paths || [];
  expected.slice_id = next.admission?.brief?.slice_id || "";
  expected.start_operation_id = event.operation_id;
  const brief = next.admission?.brief;
  if ((brief?.path || "") !== event.data.brief_path
    || (brief?.sha256 || "") !== event.data.brief_sha256
    || (brief?.contract_sha256 || "") !== event.data.contract_sha256
    || (brief?.execution_plan_sha256 || "") !== event.data.execution_plan_sha256) {
    throw new Error("team.started admission brief identity differs from its event data");
  }
  if (event.data.mode === "execute") {
    const grant = currentGrant(previousState?.execution_authority);
    const slice = grant?.scope?.required_slices?.find(
      (candidate) => candidate.slice_id === next.admission?.brief?.slice_id,
    );
    if (next.admission?.mode !== "execution-vnext"
      || next.admission?.grant_id !== event.data.grant_id
      || next.admission?.scope_digest !== event.data.scope_digest
      || next.authorization_ref !== event.data.authorization_ref
      || next.authorization_ref !== grant?.authorization_provenance?.ref
      || !grant || grant.grant_id !== event.data.grant_id
      || grant.scope_digest !== event.data.scope_digest
      || !slice || next.slice_id !== slice.slice_id
      || !isDeepStrictEqual(next.admission.admitted_owned_paths, slice.owned_paths)
      || !isDeepStrictEqual(next.admitted_owned_paths, slice.owned_paths)
      || next.admission.brief.sha256 !== slice.brief_sha256
      || next.admission.brief.contract_sha256 !== grant.scope.contract.sha256
      || next.admission.brief.execution_plan_sha256 !== grant.scope.execution_plan.sha256
      || next.admission.canonical_objective !== slice.objective
      || next.objective !== slice.objective) {
      const mismatches = Object.entries({
        admission_mode: next.admission?.mode === "execution-vnext",
        admission_grant: next.admission?.grant_id === event.data.grant_id,
        admission_scope: next.admission?.scope_digest === event.data.scope_digest,
        authorization_event: next.authorization_ref === event.data.authorization_ref,
        authorization_grant: next.authorization_ref === grant?.authorization_provenance?.ref,
        grant_id: grant?.grant_id === event.data.grant_id,
        grant_scope: grant?.scope_digest === event.data.scope_digest,
        slice: Boolean(slice) && next.slice_id === slice?.slice_id,
        owned_paths: isDeepStrictEqual(next.admission?.admitted_owned_paths, slice?.owned_paths),
        team_owned_paths: isDeepStrictEqual(next.admitted_owned_paths, slice?.owned_paths),
        brief: next.admission?.brief?.sha256 === slice?.brief_sha256,
        contract: next.admission?.brief?.contract_sha256 === grant?.scope?.contract?.sha256,
        execution_plan: next.admission?.brief?.execution_plan_sha256
          === grant?.scope?.execution_plan?.sha256,
        objective: next.admission?.canonical_objective === slice?.objective
          && next.objective === slice?.objective,
      }).filter(([, matches]) => !matches).map(([field]) => field);
      throw new Error(
        `team.started execution admission differs from its event data: ${mismatches.join(", ")}`,
      );
    }
    validateExecutionAdmission(event, next.admission, grant, slice, previousState);
    expected.grant_id = next.admission.grant_id;
    expected.scope_digest = next.admission.scope_digest;
    expected.evidence_epoch = next.admission.evidence_epoch;
  } else {
    const allowedDiscussionModes = event.data.brief_path
      ? new Set(["discuss-vnext", "discuss-v3"])
      : new Set(["discuss-compat"]);
    if (event.data.authorization_ref || event.data.grant_id || event.data.scope_digest
      || !allowedDiscussionModes.has(next.admission?.mode)
      || !Array.isArray(next.admission?.admitted_owned_paths)
      || next.admission.admitted_owned_paths.length !== 0
      || !Array.isArray(next.admitted_owned_paths)
      || next.admitted_owned_paths.length !== 0
      || next.authorization_ref || next.grant_id || next.scope_digest
      || Number(next.evidence_epoch || 0) !== 0) {
      throw new Error("discussion team.started carries execution writer authority");
    }
    if (!event.data.brief_path && !isDeepStrictEqual(next.admission, {
      mode: "discuss-compat",
      brief: null,
      admitted_owned_paths: [],
    })) {
      throw new Error("brief-less discussion team.started admission is not canonical");
    }
  }
  assertExactTeam(next, expected, "team.started");
  if (!isDeepStrictEqual(event.result, { team: next })) {
    throw new Error("team.started result does not match its canonical Team");
  }
}

function validateExecutionAdmission(event, admission, grant, slice, previousState) {
  exactKeys(admission, [
    "mode", "brief", "admitted_owned_paths", "required_slices", "canonical_objective",
    "grant_id", "scope_digest", "evidence_epoch", "slice_start_snapshot",
  ], "Team execution admission");
  const release = grant.scope.release_binding;
  const briefKeys = [
    "path", "sha256", "slice_id", "contract_path", "contract_sha256",
    "execution_plan_schema_version", "execution_plan_sha256", "base_sha", "repo",
    ...(release ? ["work_type", "release", "delivery_authority_ref"] : []),
  ];
  exactKeys(admission.brief, briefKeys, "Team execution admission brief");
  exactKeys(admission.slice_start_snapshot, [
    "head_sha", "tree_oid", "worktree_manifest_digest", "captured_at_revision",
  ], "Team execution admission snapshot");
  const snapshot = admission.slice_start_snapshot;
  const repo = grant.scope.repo.realpath;
  const scopeContractPath = grant.scope.contract.path;
  const contractPathMatches = admission.brief.contract_path === scopeContractPath
    || (!scopeContractPath.startsWith(TASK_ARTIFACT_PREFIX)
      && admission.brief.contract_path === path.join(repo, scopeContractPath));
  if (admission.mode !== "execution-vnext"
    || admission.grant_id !== grant.grant_id
    || admission.scope_digest !== grant.scope_digest
    || admission.evidence_epoch !== grant.evidence_epoch
    || admission.canonical_objective !== slice.objective
    || !isDeepStrictEqual(admission.admitted_owned_paths, slice.owned_paths)
    || !isDeepStrictEqual(
      admission.required_slices,
      grant.scope.required_slices.map((candidate) => candidate.slice_id),
    )
    || admission.brief.path !== event.data.brief_path
    || !path.isAbsolute(admission.brief.path)
    || !admission.brief.path.endsWith(`/${slice.brief_path}`)
    || admission.brief.sha256 !== slice.brief_sha256
    || admission.brief.slice_id !== slice.slice_id
    || !contractPathMatches
    || admission.brief.contract_sha256 !== grant.scope.contract.sha256
    || admission.brief.execution_plan_schema_version
      !== grant.scope.execution_plan.schema_version
    || admission.brief.execution_plan_sha256 !== grant.scope.execution_plan.sha256
    || admission.brief.base_sha !== grant.scope.repo.base_sha
    || admission.brief.repo !== repo
    || snapshot.captured_at_revision !== event.revision
    || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(snapshot.head_sha || "")
    || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(snapshot.tree_oid || "")
    || snapshot.worktree_manifest_digest !== digestCanonical({
      head_sha: snapshot.head_sha,
      tree_oid: snapshot.tree_oid,
    })
    || (release && (
      admission.brief.work_type !== "implementation"
      || !isDeepStrictEqual(admission.brief.release, release)
      || admission.brief.delivery_authority_ref
        !== previousState.execution_authority?.delivery_authority?.ref
    ))) {
    const mismatches = Object.entries({
      mode: admission.mode === "execution-vnext",
      grant: admission.grant_id === grant.grant_id,
      scope: admission.scope_digest === grant.scope_digest,
      epoch: admission.evidence_epoch === grant.evidence_epoch,
      objective: admission.canonical_objective === slice.objective,
      owned_paths: isDeepStrictEqual(admission.admitted_owned_paths, slice.owned_paths),
      required_slices: isDeepStrictEqual(
        admission.required_slices,
        grant.scope.required_slices.map((candidate) => candidate.slice_id),
      ),
      brief_path: admission.brief.path === event.data.brief_path
        && path.isAbsolute(admission.brief.path)
        && admission.brief.path.endsWith(`/${slice.brief_path}`),
      brief_sha: admission.brief.sha256 === slice.brief_sha256,
      brief_slice: admission.brief.slice_id === slice.slice_id,
      contract_path: contractPathMatches,
      contract_sha: admission.brief.contract_sha256 === grant.scope.contract.sha256,
      plan_version: admission.brief.execution_plan_schema_version
        === grant.scope.execution_plan.schema_version,
      plan_sha: admission.brief.execution_plan_sha256 === grant.scope.execution_plan.sha256,
      base: admission.brief.base_sha === grant.scope.repo.base_sha,
      repo: admission.brief.repo === repo,
      snapshot_revision: snapshot.captured_at_revision === event.revision,
      snapshot_head: /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(snapshot.head_sha || ""),
      snapshot_tree: /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(snapshot.tree_oid || ""),
      snapshot_digest: snapshot.worktree_manifest_digest === digestCanonical({
        head_sha: snapshot.head_sha,
        tree_oid: snapshot.tree_oid,
      }),
      release_work_type: !release || admission.brief.work_type === "implementation",
      release_binding: !release || isDeepStrictEqual(admission.brief.release, release),
      release_authority: !release || admission.brief.delivery_authority_ref
        === previousState.execution_authority?.delivery_authority?.ref,
    }).filter(([, matches]) => !matches).map(([field]) => field);
    throw new Error(`Team execution admission is not canonical: ${mismatches.join(", ")}`);
  }
}

const TEAM_CONTROL_FIELDS = [
  "selection_events", "lanes", "dispatches", "attempts", "admissions", "observations",
  "observer_launch_claims", "capability_snapshots", "fallback_events", "takeover_permits",
  "writer_leases", "operation_log",
];

function assertTeamFieldsPreserved(previous, next, fields, label) {
  for (const field of fields) {
    if (!isDeepStrictEqual(next?.[field], previous?.[field])) {
      throw new Error(`${label} changed Team field it does not own: ${field}`);
    }
  }
}

function artifactReference(team, absolute) {
  const marker = "/team/";
  const at = absolute.lastIndexOf(marker);
  const decisionSuffix = "team/decision.md";
  if (!path.isAbsolute(absolute) || at < 0 || !String(team.decision || "").endsWith(decisionSuffix)) {
    throw new Error("Team artifact path cannot be canonically projected");
  }
  return `${team.decision.slice(0, -decisionSuffix.length)}${absolute.slice(at + 1)}`;
}

function validateFinalizedEvent(event, previous, next) {
  if (!ACTIVE_TEAM_STATUSES.has(previous.status)) {
    throw new Error(`team.finalized cannot transition terminal Team status: ${previous.status}`);
  }
  exactKeys(event.data, [
    "backend", "status", "round_file", "decision_file", "staffing_file",
  ], "team.finalized data");
  if (!new Set(["complete", "failed", "interrupted"]).has(event.data.status)) {
    throw new Error("team.finalized status is invalid");
  }
  const expected = JSON.parse(JSON.stringify(previous));
  deriveTeam(expected);
  const effective = expected.effective_backend;
  expected.status = event.data.status;
  expected.round_file = artifactReference(previous, event.data.round_file);
  expected.decision = artifactReference(previous, event.data.decision_file);
  expected.staffing = artifactReference(previous, event.data.staffing_file);
  expected.temp_dir = "";
  if (expected.dispatches.length === 0) {
    expected.compatibility_records.push({
      record_id: `record-finalize-${String(expected.generation).padStart(4, "0")}`,
      kind: "record-only-finalize",
      requested_backend_argument: event.data.backend,
      effective_backend: "none",
      live_provider: "unverified",
      evidence_refs: [event.data.round_file, event.data.decision_file, event.data.staffing_file]
        .map((file) => `team/${file.slice(file.lastIndexOf("/team/") + 6)}`),
      recorded_at: seconds(event.occurred_at),
    });
  }
  expected.backend = new Set(["native", "paseo"]).has(effective) ? effective : "native";
  expected.backend_sidecar = artifactReference(previous, event.data.decision_file)
    .replace(/decision\.md$/, "backend-v2.json");
  assertExactTeam(next, expected, "team.finalized");
  if (!isDeepStrictEqual(event.result, {
    effective_backend: effective,
    round_file: expected.round_file,
    sidecar: true,
  })) {
    throw new Error("team.finalized result is invalid");
  }
}

function validateLoopEvent(event, previous, next) {
  if (!ACTIVE_TEAM_STATUSES.has(previous.status)) {
    throw new Error(`team.loop.recorded cannot transition terminal Team status: ${previous.status}`);
  }
  exactKeys(event.data, [
    "backend", "status", "loop_file", "iterations", "max_iterations", "max_time",
  ], "team.loop.recorded data");
  if (!new Set(["loop-done", "loop-incomplete", "loop-failed", "loop-timeout"])
    .has(event.data.status) || !Number.isInteger(event.data.iterations)
    || event.data.iterations < 1) {
    throw new Error("team.loop.recorded status or iterations are invalid");
  }
  const expected = JSON.parse(JSON.stringify(previous));
  deriveTeam(expected);
  const effective = expected.effective_backend;
  expected.status = event.data.status;
  expected.loop = {
    ...(expected.loop || {}),
    status: event.data.status,
    file: artifactReference(previous, event.data.loop_file),
    iteration: event.data.iterations,
  };
  if (event.data.max_iterations !== null) expected.loop.max_iterations = event.data.max_iterations;
  if (event.data.max_time) expected.loop.max_time = event.data.max_time;
  if (expected.dispatches.length === 0) {
    expected.compatibility_records.push({
      record_id: `loop-record-${String(expected.generation).padStart(4, "0")}`,
      kind: "record-only-loop",
      requested_backend_argument: event.data.backend,
      effective_backend: "none",
      live_provider: "unverified",
      evidence_refs: [`team/${event.data.loop_file.slice(event.data.loop_file.lastIndexOf("/team/") + 6)}`],
      recorded_at: seconds(event.occurred_at),
    });
  }
  assertExactTeam(next, expected, "team.loop.recorded");
  if (!isDeepStrictEqual(event.result, { effective_backend: effective })) {
    throw new Error("team.loop.recorded result is invalid");
  }
}

function validateTopLevelTeamEvent(event, previous, next, previousState) {
  const allowed = new Set();
  const canonicalDecision = `${previousState?.artifact_dir || ""}/team/decision.md`
    .replace(/^\//, "");
  if (event.kind === "team.stopped") {
    if (!ACTIVE_TEAM_STATUSES.has(previous.status)) {
      throw new Error(`team.stopped cannot transition terminal Team status: ${previous.status}`);
    }
    exactKeys(event.data, ["status"], "team.stopped data");
    if (event.data.status !== "stopped" || next.status !== "stopped"
      || next.decision !== canonicalDecision || !isDeepStrictEqual(event.result, {})) {
      throw new Error("team.stopped status is invalid");
    }
    allowed.add("status");
    allowed.add("decision");
  } else if (event.kind === "authority.replanned") {
    if (previous.mode !== "execute") {
      if (!isDeepStrictEqual(next, previous)) {
        throw new Error("authority.replanned changed a non-execute Team");
      }
      return true;
    }
    if (next.status !== "stopped"
      || next.scope_superseded_by !== event.authority_transition?.new_grant?.grant_id) {
      throw new Error("authority.replanned Team projection is not canonically superseded");
    }
    allowed.add("status");
    allowed.add("scope_superseded_by");
  } else if (event.kind === "team.promoted") {
    if (!ACTIVE_TEAM_STATUSES.has(previous.status)) {
      throw new Error(`team.promoted cannot transition terminal Team status: ${previous.status}`);
    }
    exactKeys(event.data, [
      "target", "authorization_ref", "grant_id", "scope_digest", "brief_path",
      "brief_sha256", "contract_sha256", "execution_plan_sha256",
    ], "team.promoted data");
    if (!new Set(["execute", "worktree", "finish"]).has(event.data.target)
      || next.status !== `promoted:${event.data.target}`
      || next.promoted_to !== event.data.target
      || next.decision !== canonicalDecision
      || !isDeepStrictEqual(event.result, { team: next })) {
      throw new Error("team.promoted envelope does not match its projected Team");
    }
    for (const field of ["status", "promoted_to", "decision"]) allowed.add(field);
    if (event.data.target === "execute") {
      for (const field of [
        "mode", "objective", "authorization_ref", "admission", "admitted_owned_paths",
        "slice_id", "grant_id", "scope_digest", "evidence_epoch", "execution_operation_id",
      ]) allowed.add(field);
      const grant = currentGrant(previousState?.execution_authority);
      const slice = grant?.scope?.required_slices?.find(
        (candidate) => candidate.slice_id === next.admission?.brief?.slice_id,
      );
      if (next.mode !== "execute" || next.grant_id !== event.data.grant_id
        || next.scope_digest !== event.data.scope_digest
        || next.authorization_ref !== event.data.authorization_ref
        || next.authorization_ref !== grant?.authorization_provenance?.ref
        || next.admission?.brief?.path !== event.data.brief_path
        || next.admission?.brief?.sha256 !== event.data.brief_sha256
        || next.admission?.brief?.contract_sha256 !== event.data.contract_sha256
        || next.admission?.brief?.execution_plan_sha256 !== event.data.execution_plan_sha256
        || !grant || grant.grant_id !== event.data.grant_id
        || grant.scope_digest !== event.data.scope_digest || !slice
        || next.slice_id !== slice.slice_id
        || !isDeepStrictEqual(next.admission.admitted_owned_paths, slice.owned_paths)
        || !isDeepStrictEqual(next.admitted_owned_paths, slice.owned_paths)
        || next.admission.brief.sha256 !== slice.brief_sha256
        || next.admission.brief.contract_sha256 !== grant.scope.contract.sha256
        || next.admission.brief.execution_plan_sha256 !== grant.scope.execution_plan.sha256
        || next.admission.canonical_objective !== slice.objective
        || next.objective !== slice.objective
        || next.execution_operation_id !== event.operation_id) {
        throw new Error("team execute promotion differs from its authority/admission envelope");
      }
      validateExecutionAdmission(event, next.admission, grant, slice, previousState);
    } else if (next.mode !== previous.mode) {
      throw new Error("non-execute promotion changed Team mode");
    }
  } else if (event.kind === "team.finalized") {
    validateFinalizedEvent(event, previous, next);
    return true;
  } else if (event.kind === "team.loop.recorded") {
    validateLoopEvent(event, previous, next);
    return true;
  } else {
    return false;
  }
  const fields = new Set([...Object.keys(previous || {}), ...Object.keys(next || {})]);
  for (const field of fields) {
    if (!allowed.has(field) && !isDeepStrictEqual(next?.[field], previous?.[field])) {
      throw new Error(`${event.kind} changed Team field it does not own: ${field}`);
    }
  }
  return true;
}

function validateTerminalClosure(previous, next) {
  if (!isTerminalTeamStatus(next?.status) || next.status === previous?.status) return;
  const issues = teamControlPlaneClosureIssues(next);
  if (issues.length > 0) {
    throw new Error(`Team terminal status requires a closed control plane: ${issues.join("; ")}`);
  }
}

function validateObserverClaimEventProjection(events) {
  for (const [index, event] of events.entries()) {
    const previousEvent = index > 0 ? events[index - 1] : null;
    const previous = activeTeam(previousEvent);
    const previousState = previousEvent?.projection?.state || {};
    const next = activeTeam(event);
    const v2Tracked = previous?.schema_version === 2 || next?.schema_version === 2;
    if (!v2Tracked) continue;
    try {
      if ((DOING_TASK_CONTROL_STARTS.has(event.kind)
        || (event.kind === "team.promoted" && event.data?.target === "execute"))
        && (previousState.status !== "doing" || event.projection?.state?.status !== "doing")) {
        throw new Error(`${event.kind} requires a doing task before and after the transition`);
      }
      if (!sameGeneration(previous, next)) {
        if (event.kind !== "team.started") {
          throw new Error("Team generation changed outside team.started");
        }
        validateTeamStart(event, previous, next, previousState);
        continue;
      }
      if (event.kind === "team.started") {
        throw new Error("team.started must create a new Team generation");
      }
      const previousClaims = array(previous, "observer_launch_claims");
      const nextClaims = array(next, "observer_launch_claims");
      let exactControlTransition = false;
      if (event.kind === "team.attempt.observation.launch.claimed") {
        validateClaimed(event, previous, next);
        exactControlTransition = true;
      } else if (event.kind === "team.attempt.observation.launch.reconciled") {
        validateReconciled(event, previous, next);
        exactControlTransition = true;
      } else if (event.kind === "team.attempt.observed" && event.data?.claimOperationId) {
        validateObservedLaunch(event, previous, next);
        exactControlTransition = true;
      } else if (event.kind === "team.attempt.resolve-launch") {
        validateResolved(event, previous, next);
        exactControlTransition = true;
      } else if (validateAttemptTransition(event, previous, next)) {
        exactControlTransition = true;
      } else if (validateControlTransition(event, previous, next)) {
        exactControlTransition = true;
      } else if (!validateTopLevelTeamEvent(event, previous, next, previousState)) {
        if (!isDeepStrictEqual(nextClaims, previousClaims)) {
          throw new Error("non-claim event changed observer launch claims");
        }
        if (!isDeepStrictEqual(next, previous)) {
          throw new Error("event changed Team state it does not own");
        }
      }
      validatePendingPromotion(event, previous, next);
      validateTerminalClosure(previous, next);
      assertRecoveryStatusMutable(previous, next);
      if (new Set(["done", "archived"]).has(event.projection?.state?.status)) {
        const issues = teamControlPlaneClosureIssues(next);
        if (issues.length > 0) {
          throw new Error(
            `terminal task status requires a closed Team control plane: ${issues.join("; ")}`,
          );
        }
      }
    } catch (error) {
      throw new Error(
        `observer claim event projection mismatch at revision ${event.revision}: ${error.message}`,
      );
    }
  }
}

module.exports = {
  validateObserverClaimEventProjection,
};
