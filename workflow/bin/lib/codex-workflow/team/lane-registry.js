"use strict";

const crypto = require("crypto");
const { OPERATIONAL_CLASSES } = require("./backend-failures");

const ACTIVE_ATTEMPT_STATES = new Set(["reserved", "bound", "running"]);
const ATTEMPT_OUTCOMES = new Set([
  "succeeded",
  "operational-failure",
  "semantic-failure",
  "interrupted",
]);
const CONTROLLER_DISPOSITIONS = new Set([
  "admitted",
  "rejected",
  "needs-evidence",
  "superseded",
  "backend-unavailable",
  "human-decision",
]);
const BACKENDS = new Set(["native", "paseo"]);
const FALLBACK_POLICIES = new Set(["codex", "none"]);
const ATTEMPT_ORIGINS = new Set(["selected", "retry", "fallback"]);
const PUBLIC_ATTEMPT_ORIGINS = new Set(["selected", "retry"]);
const CONVERGENCE_STATES = new Set([
  "CONSENSUS",
  "CONSENSUS_WITH_RESERVATIONS",
  "HUMAN_DECISION_REQUIRED",
]);
const ACTIVE_TEAM_STATUSES = new Set(["running", "promoted:execute", "promoted:worktree"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

class RegistryError extends Error {
  constructor(message) {
    super(message);
    this.name = "RegistryError";
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

function safeId(value, label) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    throw new RegistryError(`${label} must be a safe identifier`);
  }
  return value;
}

function safeLine(value, label, { allowEmpty = false } = {}) {
  if (typeof value !== "string" || /[\r\n\t]/.test(value) || (!allowEmpty && !value.trim())) {
    throw new RegistryError(`${label} must be a single ${allowEmpty ? "" : "non-empty "}line`);
  }
  return value.trim();
}

function normalizeLeasePath(raw) {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new RegistryError("path must be a non-empty string");
  }
  if (raw.includes("\\")) throw new RegistryError(`path must use POSIX separators: ${raw}`);
  if (raw.startsWith("/") || /^[A-Za-z]:/.test(raw)) {
    throw new RegistryError(`path must be relative: ${raw}`);
  }
  const normalized = raw.replace(/\/+/g, "/").replace(/^\.\//, "");
  const segments = normalized.split("/");
  if (segments.includes("..") || normalized === ".." || normalized.startsWith("../")) {
    throw new RegistryError(`path escapes workspace: ${raw}`);
  }
  if (!normalized || normalized === ".") throw new RegistryError("path must not be empty");
  return normalized;
}

function deterministicPrefix(pattern) {
  const normalized = normalizeLeasePath(pattern);
  const prefix = [];
  for (const segment of normalized.split("/")) {
    if (segment === "**" || /[*?\[\]{}]/.test(segment)) break;
    prefix.push(segment);
  }
  return prefix.join("/");
}

function pathsOverlap(left, right) {
  const leftPrefix = deterministicPrefix(left);
  const rightPrefix = deterministicPrefix(right);
  if (!leftPrefix || !rightPrefix) return true;
  return leftPrefix === rightPrefix
    || leftPrefix.startsWith(`${rightPrefix}/`)
    || rightPrefix.startsWith(`${leftPrefix}/`);
}

function normalizePaths(paths) {
  return [...new Set((paths || []).map(normalizeLeasePath))];
}

function nextGeneration(activeTeam) {
  if (activeTeam && activeTeam.schema_version === 2) {
    return Number(activeTeam.generation || 0) + 1;
  }
  return 1;
}

function isTerminalTeamStatus(status) {
  return new Set([
    "complete", "failed", "interrupted", "stopped", "loop-done", "loop-incomplete",
    "loop-failed", "loop-timeout", "promoted:finish",
  ]).has(status);
}

function createTeamRun({ previous, mode, objective, configuredBackend, fallbackPolicy, authorizationRef,
  agents, roles, providers, decision, staffing, now, teamSelection }) {
  const current = previous && typeof previous === "object" ? previous : {};
  if (current.schema_version === 2 && !isTerminalTeamStatus(current.status)) {
    throw new RegistryError(`active v2 team run must finish before starting a new generation: ${current.status}`);
  }
  if (current.schema_version !== 2 && current.backend
    && !isTerminalTeamStatus(current.status || "")) {
    throw new RegistryError(`legacy-running team must finish or stop before v2 start: ${current.backend}`);
  }
  const generation = nextGeneration(current);
  const runId = `run-${String(generation).padStart(4, "0")}`;
  const team = {
    schema_version: 2,
    team_run_id: runId,
    generation,
    mode,
    status: "running",
    objective,
    authorization_ref: mode === "execute" ? authorizationRef : "",
    configured_backend: configuredBackend || null,
    configured_fallback_policy: fallbackPolicy || null,
    default_backend: "native",
    default_fallback_policy: "codex",
    backend: configuredBackend || "native",
    effective_backend: "none",
    resolved_requested_backend: configuredBackend || "native",
    attempted_backends: [],
    agents: agents || "",
    roles: roles || "",
    providers: providers || "",
    decision,
    staffing,
    temp_dir: "",
    selection_events: [],
    lanes: [],
    dispatches: [],
    attempts: [],
    admissions: [],
    observations: [],
    capability_snapshots: [],
    fallback_events: [],
    takeover_permits: [],
    writer_leases: [],
    operation_log: [],
    compatibility_records: [],
    created_at: now,
  };
  if (teamSelection) {
    recordSelectionEventMutable(team, { ...teamSelection, teamRunId: runId, now });
    team.team_selection_event_id = teamSelection.eventId;
  }
  deriveTeam(team);
  return team;
}

function operation(team, operationId, kind, payload, mutate) {
  safeId(operationId, "operation_id");
  const replayPayload = { ...payload };
  delete replayPayload.now;
  const payloadDigest = digest({ kind, payload: replayPayload });
  const existing = (team.operation_log || []).find((entry) => entry.operation_id === operationId);
  if (existing) {
    if (existing.payload_digest !== payloadDigest || existing.kind !== kind) {
      throw new RegistryError(`operation_id replay payload conflict: ${operationId}`);
    }
    return { replay: true, result: clone(existing.result || {}), team };
  }
  if (!ACTIVE_TEAM_STATUSES.has(team.status)) {
    throw new RegistryError(`team run is not mutable: ${team.status}`);
  }
  const result = mutate() || {};
  team.operation_log.push({ operation_id: operationId, kind, payload_digest: payloadDigest, result });
  team.updated_at = payload.now || team.updated_at;
  deriveTeam(team);
  return { replay: false, result: clone(result), team };
}

function selectionScopeMatches(event, team, laneId, dispatchId) {
  if (event.team_run_id !== team.team_run_id) return false;
  return event.scope === "team"
    || event.scope === `lane:${laneId}`
    || event.scope === `dispatch:${dispatchId}`;
}

function findSelection(team, eventId, kind, laneId = "", dispatchId = "") {
  const event = team.selection_events.find((item) => item.event_id === eventId);
  if (!event || event.kind !== kind || !selectionScopeMatches(event, team, laneId, dispatchId)) {
    throw new RegistryError(`selection event does not match ${kind} scope: ${eventId}`);
  }
  return event;
}

function recordSelectionEventMutable(team, input) {
  safeId(input.eventId, "selection event id");
  if (team.selection_events.some((event) => event.event_id === input.eventId)) {
    throw new RegistryError(`duplicate selection event: ${input.eventId}`);
  }
  if (!new Set(["backend", "model"]).has(input.kind)) {
    throw new RegistryError(`invalid selection kind: ${input.kind}`);
  }
  if (!/^(team|lane:[A-Za-z0-9._-]+|dispatch:[A-Za-z0-9._-]+)$/.test(input.scope)) {
    throw new RegistryError(`invalid selection scope: ${input.scope}`);
  }
  if (!new Set(["user-message", "operator-input"]).has(input.authorityKind)) {
    throw new RegistryError(`invalid authority kind: ${input.authorityKind}`);
  }
  safeLine(input.authorityRef, "authority_ref");
  const event = {
    event_id: input.eventId,
    team_run_id: input.teamRunId || team.team_run_id,
    kind: input.kind,
    scope: input.scope,
    authority_kind: input.authorityKind,
    authority_ref: input.authorityRef,
    recorded_at: input.now,
  };
  if (input.kind === "backend") {
    if (!BACKENDS.has(input.backend)) throw new RegistryError(`invalid selected backend: ${input.backend}`);
    event.backend = input.backend;
  } else {
    event.provider = safeLine(input.provider, "model provider");
    event.model = safeLine(input.model, "selected model");
  }
  team.selection_events.push(event);
  return event;
}

function recordSelectionEvent(teamInput, input) {
  const team = clone(teamInput);
  return operation(team, input.operationId, "selection.record", input, () => ({
    event_id: recordSelectionEventMutable(team, input).event_id,
  }));
}

function recordCapabilitySnapshot(teamInput, input) {
  const team = clone(teamInput);
  return operation(team, input.operationId, "capability.record", input, () => {
    safeId(input.snapshotId, "capability snapshot id");
    if (team.capability_snapshots.some((item) => item.snapshot_id === input.snapshotId)) {
      throw new RegistryError(`duplicate capability snapshot: ${input.snapshotId}`);
    }
    if (!new Set(["claude", "non-claude", "unknown"]).has(input.modelFamily)) {
      throw new RegistryError(`invalid capability model family: ${input.modelFamily}`);
    }
    const snapshot = {
      snapshot_id: input.snapshotId,
      provider: safeLine(input.provider, "capability provider"),
      model: safeLine(input.model, "capability model"),
      model_family: input.modelFamily,
      runtime_mode_ids: [...new Set(input.runtimeModeIds || [])]
        .map((value) => safeLine(value, "runtime mode id")),
      payload_digest: safeLine(input.payloadDigest, "capability payload digest"),
      observation_action: safeLine(input.observationAction, "capability observation action"),
      observed_at: input.observedAt,
      authority_kind: "controller-observation",
      authority_ref: safeLine(input.authorityRef, "capability authority ref"),
      recorded_at: input.now,
    };
    team.capability_snapshots.push(snapshot);
    return { snapshot_id: snapshot.snapshot_id };
  });
}

function openLane(teamInput, input) {
  const team = clone(teamInput);
  return operation(team, input.operationId, "lane.open", input, () => {
    safeId(input.laneId, "lane id");
    if (team.lanes.some((lane) => lane.lane_id === input.laneId)) {
      throw new RegistryError(`duplicate lane: ${input.laneId}`);
    }
    if (input.configuredBackend) {
      if (!BACKENDS.has(input.configuredBackend)) throw new RegistryError(`invalid lane backend: ${input.configuredBackend}`);
      const event = findSelection(team, input.selectionEventId, "backend", input.laneId);
      if (event.backend !== input.configuredBackend) throw new RegistryError("lane backend selection mismatch");
    }
    if (input.fallbackPolicy && !FALLBACK_POLICIES.has(input.fallbackPolicy)) {
      throw new RegistryError(`invalid lane fallback policy: ${input.fallbackPolicy}`);
    }
    const paths = normalizePaths(input.ownedPaths || []);
    if (input.writable && paths.length === 0) throw new RegistryError("writable lane requires owned paths");
    team.lanes.push({
      lane_id: input.laneId,
      purpose: safeLine(input.purpose || input.laneId, "lane purpose"),
      role: safeLine(input.role || "contributor", "lane role"),
      configured_backend: input.configuredBackend || null,
      configured_fallback_policy: input.fallbackPolicy || null,
      selection_event_id: input.selectionEventId || "",
      writable: Boolean(input.writable),
      owned_paths: paths,
      status: "open",
      convergence: "pending",
      created_at: input.now,
    });
    return { lane_id: input.laneId };
  });
}

function closeLane(teamInput, input) {
  const team = clone(teamInput);
  return operation(team, input.operationId, "lane.close", input, () => {
    const lane = requireLane(team, input.laneId);
    if (lane.status !== "open") throw new RegistryError(`lane is not open: ${lane.lane_id}`);
    const dispatches = team.dispatches.filter((dispatch) => dispatch.lane_id === lane.lane_id);
    if (dispatches.some((dispatch) => dispatch.status !== "closed")) {
      throw new RegistryError(`lane has non-closed dispatches: ${lane.lane_id}`);
    }
    if (team.attempts.some((attempt) => dispatches.some((d) => d.dispatch_id === attempt.dispatch_id)
      && ACTIVE_ATTEMPT_STATES.has(attempt.status))) {
      throw new RegistryError(`lane has active attempts: ${lane.lane_id}`);
    }
    if (team.writer_leases.some((lease) => lease.lane_id === lane.lane_id && lease.state === "active")) {
      throw new RegistryError(`lane has active writer lease: ${lane.lane_id}`);
    }
    if (!CONVERGENCE_STATES.has(input.convergence)) {
      throw new RegistryError(`invalid lane convergence: ${input.convergence}`);
    }
    const admissions = dispatches.map((dispatch) => team.admissions.find(
      (admission) => admission.admission_id === dispatch.admission_id,
    ));
    const hasHumanDecision = admissions.some(
      (admission) => admission && admission.disposition === "human-decision",
    );
    const hasReservation = dispatches.length === 0 || admissions.some((admission, index) => {
      if (!admission || admission.disposition !== "admitted") return true;
      const required = dispatches[index].required_perspective;
      if (!required) return false;
      return !(admission.admitted_attempt_ids || []).some((attemptId) => (
        requireAttempt(team, attemptId).perspective_id === required
      ));
    });
    const expectedConvergence = hasHumanDecision
      ? "HUMAN_DECISION_REQUIRED"
      : hasReservation ? "CONSENSUS_WITH_RESERVATIONS" : "CONSENSUS";
    if (input.convergence !== expectedConvergence) {
      throw new RegistryError(`lane convergence must be ${expectedConvergence}`);
    }
    lane.status = "closed";
    lane.convergence = input.convergence;
    lane.closed_at = input.now;
    return { lane_id: lane.lane_id, convergence: lane.convergence };
  });
}

function requireLane(team, laneId) {
  const lane = team.lanes.find((item) => item.lane_id === laneId);
  if (!lane) throw new RegistryError(`unknown lane: ${laneId}`);
  return lane;
}

function requireDispatch(team, dispatchId) {
  const dispatch = team.dispatches.find((item) => item.dispatch_id === dispatchId);
  if (!dispatch) throw new RegistryError(`unknown dispatch: ${dispatchId}`);
  return dispatch;
}

function requireAttempt(team, attemptId) {
  const attempt = team.attempts.find((item) => item.attempt_id === attemptId);
  if (!attempt) throw new RegistryError(`unknown attempt: ${attemptId}`);
  return attempt;
}

function resolveBackend(team, lane, configuredBackend) {
  return configuredBackend || lane.configured_backend || team.configured_backend || team.default_backend;
}

function resolvePolicy(team, lane, configuredPolicy) {
  return configuredPolicy || lane.configured_fallback_policy
    || team.configured_fallback_policy || team.default_fallback_policy;
}

function openDispatch(teamInput, input) {
  const team = clone(teamInput);
  return operation(team, input.operationId, "dispatch.open", input, () => {
    safeId(input.dispatchId, "dispatch id");
    if (team.dispatches.some((dispatch) => dispatch.dispatch_id === input.dispatchId)) {
      throw new RegistryError(`duplicate dispatch: ${input.dispatchId}`);
    }
    const lane = requireLane(team, input.laneId);
    if (lane.status !== "open") throw new RegistryError(`lane is not open: ${lane.lane_id}`);
    if (input.configuredBackend) {
      if (!BACKENDS.has(input.configuredBackend)) throw new RegistryError(`invalid dispatch backend: ${input.configuredBackend}`);
      const event = findSelection(team, input.selectionEventId, "backend", lane.lane_id, input.dispatchId);
      if (event.backend !== input.configuredBackend) throw new RegistryError("dispatch backend selection mismatch");
    }
    if (input.fallbackPolicy && !FALLBACK_POLICIES.has(input.fallbackPolicy)) {
      throw new RegistryError(`invalid dispatch fallback policy: ${input.fallbackPolicy}`);
    }
    team.dispatches.push({
      dispatch_id: input.dispatchId,
      lane_id: lane.lane_id,
      objective: safeLine(input.objective || input.dispatchId, "dispatch objective"),
      configured_backend: input.configuredBackend || null,
      resolved_requested_backend: resolveBackend(team, lane, input.configuredBackend),
      fallback_policy: resolvePolicy(team, lane, input.fallbackPolicy),
      selection_event_id: input.selectionEventId || "",
      required_perspective: input.requiredPerspective
        ? safeLine(input.requiredPerspective, "required perspective")
        : "",
      status: "open",
      created_at: input.now,
    });
    return { dispatch_id: input.dispatchId };
  });
}

function validateClaudeGate(team, dispatch, input) {
  if (dispatch.resolved_requested_backend !== "paseo") return;
  const snapshot = team.capability_snapshots.find(
    (item) => item.snapshot_id === input.capabilitySnapshotId,
  );
  if (!snapshot) throw new RegistryError("trusted capability snapshot is required");
  const provider = safeLine(input.provider || snapshot.provider, "Paseo provider");
  const model = safeLine(input.model || snapshot.model, "Paseo model");
  if (provider !== snapshot.provider || model !== snapshot.model) {
    throw new RegistryError("attempt provider/model differs from capability snapshot");
  }
  const family = snapshot.model_family;
  if (family === "unknown") throw new RegistryError("MODEL_FAMILY_UNVERIFIED");
  const visiblyClaude = /(^|[-_/.])claude($|[-_/.])/.test(`${provider}/${model}`.toLowerCase());
  if (family === "claude" || visiblyClaude) {
    if (!input.modelSelectionEventId) throw new RegistryError("CLAUDE_MODEL_SELECTION_REQUIRED");
    const event = findSelection(team, input.modelSelectionEventId, "model", dispatch.lane_id, dispatch.dispatch_id);
    if (event.provider !== provider || event.model !== model) {
      throw new RegistryError("Claude model selection event does not match provider/model");
    }
  }
  if (input.runtimeModeId && !snapshot.runtime_mode_ids.includes(input.runtimeModeId)) {
    throw new RegistryError("runtime mode is not present in capability snapshot");
  }
  return snapshot;
}

function acquireLease(team, attempt, lane, now) {
  if (!attempt.writable) return null;
  for (const lease of team.writer_leases.filter((item) => item.state === "active")) {
    for (const requested of attempt.owned_paths) {
      for (const existing of lease.paths) {
        if (pathsOverlap(requested, existing)) {
          throw new RegistryError(`writer lease conflict: ${requested} <> ${existing}`);
        }
      }
    }
  }
  const lease = {
    lease_id: `lease-${attempt.attempt_id}`,
    team_run_id: team.team_run_id,
    generation: team.generation,
    lane_id: lane.lane_id,
    owner_attempt_id: attempt.attempt_id,
    paths: [...attempt.owned_paths],
    state: "active",
    acquired_at: now,
  };
  team.writer_leases.push(lease);
  attempt.writer_lease_id = lease.lease_id;
  return lease;
}

function createReservedAttempt(team, dispatch, lane, input) {
  safeId(input.attemptId, "attempt id");
  if (team.attempts.some((attempt) => attempt.attempt_id === input.attemptId)) {
    throw new RegistryError(`duplicate attempt: ${input.attemptId}`);
  }
  if (team.attempts.some((attempt) => attempt.dispatch_id === dispatch.dispatch_id
    && ACTIVE_ATTEMPT_STATES.has(attempt.status))) {
    throw new RegistryError(`dispatch already has an active attempt: ${dispatch.dispatch_id}`);
  }
  const origin = input.origin || "selected";
  if (!ATTEMPT_ORIGINS.has(origin)) throw new RegistryError(`invalid attempt origin: ${origin}`);
  const backend = input.backend || dispatch.resolved_requested_backend;
  if (!BACKENDS.has(backend)) throw new RegistryError(`invalid attempt backend: ${backend}`);
  if (origin === "selected" && backend !== dispatch.resolved_requested_backend) {
    throw new RegistryError("selected attempt backend differs from resolved dispatch backend");
  }
  let retryPredecessor = null;
  if (origin === "retry") {
    const predecessor = requireAttempt(team, input.retryOf);
    retryPredecessor = predecessor;
    if (predecessor.dispatch_id !== dispatch.dispatch_id || predecessor.status !== "quiesced") {
      throw new RegistryError("retry predecessor must be quiesced in the same dispatch");
    }
    if (!predecessor.retry_eligible) throw new RegistryError("retry predecessor is not eligible");
    if (team.attempts.some((attempt) => attempt.origin === "retry" && attempt.dispatch_id === dispatch.dispatch_id)) {
      throw new RegistryError("dispatch automatic retry already consumed");
    }
    if (backend !== predecessor.backend) throw new RegistryError("retry backend must match predecessor");
  }
  const capabilitySnapshot = backend === "paseo" ? validateClaudeGate(team, dispatch, input) : null;
  const writable = input.writable === undefined ? lane.writable : Boolean(input.writable);
  const requestedPaths = Array.isArray(input.ownedPaths) && input.ownedPaths.length > 0
    ? input.ownedPaths
    : lane.owned_paths;
  const ownedPaths = writable ? normalizePaths(requestedPaths) : [];
  if (writable && team.mode !== "execute") throw new RegistryError("writable attempt requires execute mode");
  if (writable && !team.authorization_ref) throw new RegistryError("writable attempt requires authorization_ref");
  if (writable && ownedPaths.length === 0) throw new RegistryError("writable attempt requires owned paths");
  if (ownedPaths.some((ownedPath) => !lane.owned_paths.includes(ownedPath))) {
    throw new RegistryError("attempt owned paths must be an exact subset of lane owned paths");
  }
  if (retryPredecessor && (writable !== retryPredecessor.writable
    || JSON.stringify(ownedPaths) !== JSON.stringify(retryPredecessor.owned_paths))) {
    throw new RegistryError("retry must preserve predecessor write scope");
  }
  if (backend === "paseo" && writable && !input.runtimeModeId) {
    throw new RegistryError("Paseo writable attempt requires verified runtime mode id");
  }
  const attempt = {
    attempt_id: input.attemptId,
    dispatch_id: dispatch.dispatch_id,
    lane_id: lane.lane_id,
    backend,
    fallback_policy: dispatch.fallback_policy,
    origin,
    retry_of: input.retryOf || "",
    retry_ordinal: origin === "retry" ? 1 : 0,
    fallback_from: input.fallbackFrom || "",
    actor_type: backend === "paseo" ? "paseo-agent" : "native-agent",
    provider: capabilitySnapshot ? capabilitySnapshot.provider : (input.provider || ""),
    model: capabilitySnapshot ? capabilitySnapshot.model : (input.model || ""),
    model_family: capabilitySnapshot ? capabilitySnapshot.model_family : "",
    model_selection_event_id: input.modelSelectionEventId || "",
    capability_snapshot_id: capabilitySnapshot ? capabilitySnapshot.snapshot_id : "",
    capability_snapshot_digest: capabilitySnapshot ? capabilitySnapshot.payload_digest : "",
    reserved_runtime_mode_id: input.runtimeModeId || "",
    writable,
    owned_paths: ownedPaths,
    authorization_ref: writable ? team.authorization_ref : "",
    perspective_id: input.perspectiveId || "",
    launch_operation_id: safeId(input.launchOperationId, "launch_operation_id"),
    launch_invoked: false,
    status: "reserved",
    reserved_at: input.now,
    evidence_refs: [],
  };
  acquireLease(team, attempt, lane, input.now);
  team.attempts.push(attempt);
  dispatch.status = "attempts-active";
  return attempt;
}

function reserveAttempt(teamInput, input) {
  const team = clone(teamInput);
  return operation(team, input.operationId, "attempt.reserve", input, () => {
    const origin = input.origin || "selected";
    if (!PUBLIC_ATTEMPT_ORIGINS.has(origin)) {
      throw new RegistryError(`public reserve does not accept attempt origin: ${origin}`);
    }
    const dispatch = requireDispatch(team, input.dispatchId);
    const lane = requireLane(team, dispatch.lane_id);
    if (lane.status !== "open" || !new Set(["open", "attempts-active"]).has(dispatch.status)) {
      throw new RegistryError("attempt reserve requires an open lane and active dispatch");
    }
    if (dispatch.required_perspective && input.perspectiveId !== dispatch.required_perspective) {
      throw new RegistryError(`attempt must satisfy required perspective: ${dispatch.required_perspective}`);
    }
    const attempt = createReservedAttempt(team, dispatch, lane, input);
    return { attempt_id: attempt.attempt_id, status: attempt.status };
  });
}

function bindAttempt(teamInput, input) {
  const team = clone(teamInput);
  return operation(team, input.operationId, "attempt.bind", input, () => {
    const attempt = requireAttempt(team, input.attemptId);
    if (attempt.status !== "reserved") throw new RegistryError("attempt bind requires reserved state");
    if (attempt.launch_operation_id !== input.launchOperationId) throw new RegistryError("launch operation mismatch");
    if (attempt.backend === "paseo") {
      const observation = team.observations.find(
        (item) => item.observation_id === input.observationId,
      );
      const launchReceipt = observation
        && observation.attempt_id === attempt.attempt_id
        && observation.launch_operation_id === attempt.launch_operation_id
        && ((observation.action === "run" && observation.actor_created === true)
          || (observation.action === "ls" && observation.reconciliation_status === "matched"));
      if (!launchReceipt || observation.runtime_agent_id !== input.runtimeAgentId) {
        throw new RegistryError("Paseo bind requires an exact launch reconciliation receipt");
      }
      attempt.launch_observation_id = observation.observation_id;
    }
    attempt.runtime_agent_id = safeLine(input.runtimeAgentId, "runtime agent id");
    attempt.workspace_id = safeLine(input.workspaceId || "unverified", "workspace id");
    attempt.worktree = safeLine(input.worktree || "unverified", "worktree");
    attempt.base_sha = safeLine(input.baseSha || "unverified", "base SHA");
    if (attempt.reserved_runtime_mode_id
      && attempt.reserved_runtime_mode_id !== input.runtimeModeId) {
      throw new RegistryError("bound runtime mode differs from reserved capability");
    }
    attempt.runtime_mode_id = input.runtimeModeId || attempt.reserved_runtime_mode_id || "";
    attempt.launch_invoked = true;
    attempt.status = "bound";
    attempt.bound_at = input.now;
    return { attempt_id: attempt.attempt_id, status: attempt.status };
  });
}

function markAttemptRunning(teamInput, input) {
  const team = clone(teamInput);
  return operation(team, input.operationId, "attempt.running", input, () => {
    const attempt = requireAttempt(team, input.attemptId);
    if (attempt.status !== "bound") throw new RegistryError("attempt running requires bound state");
    attempt.status = "running";
    attempt.running_at = input.now;
    return { attempt_id: attempt.attempt_id, status: attempt.status };
  });
}

function terminalAttempt(teamInput, input) {
  const team = clone(teamInput);
  return operation(team, input.operationId, "attempt.terminal", input, () => {
    const attempt = requireAttempt(team, input.attemptId);
    if (!new Set(["reserved", "bound", "running"]).has(attempt.status)) {
      throw new RegistryError("attempt terminal requires reserved, bound, or running state");
    }
    if (!ATTEMPT_OUTCOMES.has(input.outcome)) throw new RegistryError(`invalid attempt outcome: ${input.outcome}`);
    if (input.outcome === "operational-failure") {
      if (!OPERATIONAL_CLASSES.has(input.failureClass)) {
        throw new RegistryError(`invalid operational failure class: ${input.failureClass}`);
      }
      if (!input.observationId) throw new RegistryError("operational failure requires observation id");
      const observation = team.observations.find((item) => item.observation_id === input.observationId);
      if (!observation || observation.failureClass !== input.failureClass) {
        throw new RegistryError("operational failure observation mismatch");
      }
      attempt.observation_id = input.observationId;
      attempt.failure_class = input.failureClass;
      attempt.retry_eligible = Boolean(input.retryEligible && observation.retryable);
      attempt.retry_after_ms = observation.retryAfterMs;
    } else {
      attempt.retry_eligible = false;
    }
    attempt.launch_invoked = attempt.launch_invoked || Boolean(input.launchInvoked);
    attempt.runtime_outcome = input.outcome;
    attempt.evidence_refs = [...new Set(input.evidenceRefs || [])];
    attempt.status = "terminal";
    attempt.terminal_at = input.now;
    return { attempt_id: attempt.attempt_id, status: attempt.status };
  });
}

function quiesceAttempt(teamInput, input) {
  const team = clone(teamInput);
  return operation(team, input.operationId, "attempt.quiesced", input, () => {
    const attempt = requireAttempt(team, input.attemptId);
    if (attempt.status !== "terminal") throw new RegistryError("attempt quiesce requires terminal state");
    const evidenceRefs = [...new Set(input.evidenceRefs || [])];
    if ((attempt.writable || attempt.runtime_agent_id) && evidenceRefs.length === 0) {
      throw new RegistryError("runtime quiescence requires evidence");
    }
    if (attempt.backend === "paseo" && (attempt.launch_invoked || attempt.runtime_agent_id)) {
      const observation = team.observations.find((item) => item.observation_id === input.observationId);
      if (!observation || observation.attempt_id !== attempt.attempt_id) {
        throw new RegistryError("Paseo quiescence requires a correlated observer receipt");
      }
      const runtimeTerminal = new Set([
        "complete", "completed", "stopped", "failed", "crashed", "not_found",
      ]).has(String(observation.status || "").toLowerCase());
      const startupRejected = observation.action === "run"
        && observation.launch_operation_id === attempt.launch_operation_id
        && observation.actor_created === false
        && observation.exit_code !== 0;
      const actorQuiesced = new Set(["wait", "stop", "inspect"]).has(observation.action)
        && observation.runtime_agent_id === attempt.runtime_agent_id
        && runtimeTerminal;
      if (!startupRejected && !actorQuiesced) {
        throw new RegistryError("observer receipt does not prove Paseo quiescence");
      }
      attempt.quiescence_observation_id = observation.observation_id;
    }
    attempt.status = "quiesced";
    attempt.quiesced_at = input.now;
    attempt.quiescence_evidence_refs = evidenceRefs;
    const lease = team.writer_leases.find((item) => item.owner_attempt_id === attempt.attempt_id && item.state === "active");
    if (lease) {
      lease.state = "released";
      lease.released_at = input.now;
      lease.release_reason = "runtime-quiesced";
    }
    return { attempt_id: attempt.attempt_id, status: attempt.status };
  });
}

function recordObservation(teamInput, input) {
  const team = clone(teamInput);
  return operation(team, input.operationId, "observation.record", input, () => {
    safeId(input.observationId, "observation id");
    if (team.observations.some((item) => item.observation_id === input.observationId)) {
      throw new RegistryError(`duplicate observation: ${input.observationId}`);
    }
    if (!input.observation || input.observation.adapter !== "atlas-paseo-observer"
      || input.observation.schema_version !== 1) {
      throw new RegistryError("untrusted Paseo observation");
    }
    team.observations.push({ observation_id: input.observationId, ...clone(input.observation) });
    return { observation_id: input.observationId };
  });
}

function fallbackAttempt(teamInput, input) {
  const team = clone(teamInput);
  return operation(team, input.operationId, "fallback.create", input, () => {
    const predecessor = requireAttempt(team, input.fromAttemptId);
    if (predecessor.backend !== "paseo" || predecessor.status !== "quiesced"
      || predecessor.runtime_outcome !== "operational-failure") {
      throw new RegistryError("fallback predecessor must be a quiesced operational Paseo failure");
    }
    if (predecessor.fallback_policy !== "codex") throw new RegistryError("fallback policy is none");
    if (predecessor.retry_eligible && predecessor.origin !== "retry") {
      const retry = team.attempts.find((attempt) => attempt.origin === "retry"
        && attempt.retry_of === predecessor.attempt_id);
      if (!retry) throw new RegistryError("eligible retry must be consumed before fallback");
      throw new RegistryError("fallback must reference the quiesced retry attempt");
    }
    if (team.fallback_events.some((event) => event.from_attempt_id === predecessor.attempt_id)) {
      throw new RegistryError("fallback already exists for predecessor");
    }
    const dispatch = requireDispatch(team, predecessor.dispatch_id);
    const lane = requireLane(team, predecessor.lane_id);
    if (lane.status !== "open" || dispatch.status !== "attempts-active") {
      throw new RegistryError("fallback requires an active dispatch in an open lane");
    }
    if (predecessor.writable) {
      if (!input.worktreeFingerprint || !(input.evidenceRefs || []).length) {
        throw new RegistryError("writable fallback requires takeover fingerprint and evidence");
      }
      team.takeover_permits.push({
        permit_id: `permit-${predecessor.attempt_id}`,
        from_attempt_id: predecessor.attempt_id,
        to_attempt_id: input.toAttemptId,
        owned_paths: [...predecessor.owned_paths],
        worktree_fingerprint: input.worktreeFingerprint,
        evidence_refs: [...input.evidenceRefs],
        authorization_ref: predecessor.authorization_ref,
        lane_id: predecessor.lane_id,
        consumed_at: input.now,
      });
    }
    const target = createReservedAttempt(team, dispatch, lane, {
      ...input,
      attemptId: input.toAttemptId,
      backend: "native",
      origin: "fallback",
      fallbackFrom: predecessor.attempt_id,
      writable: predecessor.writable,
      ownedPaths: predecessor.owned_paths,
      launchOperationId: input.launchOperationId,
    });
    team.fallback_events.push({
      event_id: `fallback-${predecessor.attempt_id}`,
      from_attempt_id: predecessor.attempt_id,
      to_attempt_id: target.attempt_id,
      failure_class: predecessor.failure_class,
      evidence_refs: [...new Set(input.evidenceRefs || [])],
      created_at: input.now,
    });
    return { from_attempt_id: predecessor.attempt_id, to_attempt_id: target.attempt_id };
  });
}

function disposeDispatch(teamInput, input) {
  const team = clone(teamInput);
  return operation(team, input.operationId, "dispatch.dispose", input, () => {
    const dispatch = requireDispatch(team, input.dispatchId);
    if (!new Set(["open", "attempts-active"]).has(dispatch.status)
      || dispatch.admission_id
      || team.admissions.some((admission) => admission.dispatch_id === dispatch.dispatch_id)) {
      throw new RegistryError("dispatch is already disposed or closed");
    }
    if (team.attempts.some((attempt) => attempt.dispatch_id === dispatch.dispatch_id
      && ACTIVE_ATTEMPT_STATES.has(attempt.status))) {
      throw new RegistryError("dispatch has active attempts");
    }
    if (!CONTROLLER_DISPOSITIONS.has(input.disposition)) {
      throw new RegistryError(`invalid controller disposition: ${input.disposition}`);
    }
    const admittedAttemptIds = [...new Set(input.admittedAttemptIds || [])];
    if (input.disposition === "admitted" && admittedAttemptIds.length === 0) {
      throw new RegistryError("admitted disposition requires attempt ids");
    }
    for (const attemptId of admittedAttemptIds) {
      const attempt = requireAttempt(team, attemptId);
      if (attempt.dispatch_id !== dispatch.dispatch_id || attempt.status !== "quiesced"
        || attempt.runtime_outcome !== "succeeded") {
        throw new RegistryError(`admitted attempt must be a quiesced success in dispatch: ${attemptId}`);
      }
      if (dispatch.required_perspective && attempt.perspective_id !== dispatch.required_perspective) {
        throw new RegistryError(`admitted attempt does not satisfy required perspective: ${attemptId}`);
      }
      if (dispatch.required_perspective
        && (!attempt.runtime_agent_id
          || /^(main-codex|controller)(?:$|[-:/.])/i.test(attempt.runtime_agent_id))) {
        throw new RegistryError(
          `required perspective must be produced by an independently bound actor: ${attemptId}`,
        );
      }
    }
    if (input.disposition === "backend-unavailable" && dispatch.fallback_policy !== "none") {
      throw new RegistryError("backend-unavailable disposition requires fallback policy none");
    }
    dispatch.status = "attempts-exhausted";
    const admission = {
      admission_id: `admission-${dispatch.dispatch_id}`,
      dispatch_id: dispatch.dispatch_id,
      disposition: input.disposition,
      admitted_attempt_ids: admittedAttemptIds,
      evidence_refs: [...new Set(input.evidenceRefs || [])],
      resolution_ref: input.resolutionRef || "",
      created_at: input.now,
    };
    team.admissions.push(admission);
    dispatch.controller_disposition = input.disposition;
    dispatch.admission_id = admission.admission_id;
    dispatch.status = "controller-disposed";
    return { dispatch_id: dispatch.dispatch_id, disposition: input.disposition };
  });
}

function closeDispatch(teamInput, input) {
  const team = clone(teamInput);
  return operation(team, input.operationId, "dispatch.close", input, () => {
    const dispatch = requireDispatch(team, input.dispatchId);
    if (dispatch.status !== "controller-disposed") {
      throw new RegistryError("dispatch close requires controller-disposed state");
    }
    dispatch.status = "closed";
    dispatch.closed_at = input.now;
    return { dispatch_id: dispatch.dispatch_id, status: dispatch.status };
  });
}

function deriveTeam(team) {
  if (!team || team.schema_version !== 2) return team;
  const attempted = new Set();
  for (const attempt of team.attempts || []) {
    if (attempt.launch_invoked || attempt.bound_at || attempt.running_at || attempt.runtime_agent_id) {
      attempted.add(attempt.backend);
    }
  }
  team.attempted_backends = [...attempted].sort();
  const admittedIds = new Set(
    (team.admissions || []).filter((item) => item.disposition === "admitted")
      .flatMap((item) => item.admitted_attempt_ids || []),
  );
  const effective = new Set(
    (team.attempts || []).filter((attempt) => admittedIds.has(attempt.attempt_id))
      .map((attempt) => attempt.backend),
  );
  team.effective_backend = effective.size === 0 ? "none"
    : effective.size === 1 ? [...effective][0] : "mixed";
  const requested = new Set((team.dispatches || []).map((item) => item.resolved_requested_backend));
  team.resolved_requested_backend = requested.size === 0
    ? (team.configured_backend || team.default_backend)
    : requested.size === 1 ? [...requested][0] : "mixed";
  team.backend = new Set(["native", "paseo"]).has(team.effective_backend)
    ? team.effective_backend
    : team.resolved_requested_backend === "paseo" ? "paseo" : "native";
  return team;
}

function backendSidecar(team) {
  deriveTeam(team);
  const admissions = new Map((team.admissions || []).map((item) => [item.dispatch_id, item]));
  return {
    schema_version: 2,
    team_run_id: team.team_run_id,
    generation: team.generation,
    configured_backend: team.configured_backend,
    resolved_requested_backend: team.resolved_requested_backend,
    attempted_backends: [...team.attempted_backends],
    effective_backend: team.effective_backend,
    legacy_projection: new Set(["mixed", "none"]).has(team.effective_backend),
    lanes: (team.lanes || []).map((lane) => {
      const dispatchIds = new Set(team.dispatches.filter((item) => item.lane_id === lane.lane_id)
        .map((item) => item.dispatch_id));
      const laneAdmissions = [...admissions.values()].filter((item) => dispatchIds.has(item.dispatch_id));
      const admittedAttemptIds = laneAdmissions.flatMap((item) => item.admitted_attempt_ids || []);
      const backends = new Set(team.attempts.filter((item) => admittedAttemptIds.includes(item.attempt_id))
        .map((item) => item.backend));
      return {
        lane_id: lane.lane_id,
        effective_backend: backends.size === 0 ? "none"
          : backends.size === 1 ? [...backends][0] : "mixed",
        admitted_attempt_ids: [...new Set(admittedAttemptIds)],
        evidence_refs: [...new Set(laneAdmissions.flatMap((item) => item.evidence_refs || []))],
      };
    }).filter((lane) => lane.admitted_attempt_ids.length > 0),
  };
}

module.exports = {
  ACTIVE_ATTEMPT_STATES,
  ATTEMPT_ORIGINS,
  ATTEMPT_OUTCOMES,
  BACKENDS,
  CONVERGENCE_STATES,
  CONTROLLER_DISPOSITIONS,
  FALLBACK_POLICIES,
  RegistryError,
  backendSidecar,
  bindAttempt,
  closeDispatch,
  closeLane,
  createTeamRun,
  deriveTeam,
  disposeDispatch,
  fallbackAttempt,
  markAttemptRunning,
  normalizeLeasePath,
  openDispatch,
  openLane,
  pathsOverlap,
  quiesceAttempt,
  recordCapabilitySnapshot,
  recordObservation,
  recordSelectionEvent,
  reserveAttempt,
  terminalAttempt,
};
