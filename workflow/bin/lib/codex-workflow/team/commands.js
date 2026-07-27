"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { atomicWriteJson } = require("../core/atomic-file");
const {
  CommandError,
  appendLegacyRuntimeEvent,
  commandOptions,
  prepareTaskCommand,
  updateTaskCommand,
} = require("../core/command-runtime");
const { posixChecksum, withLock } = require("../core/lock");
const { relativeToCodeHome, taskArtifactDir } = require("../core/paths");
const { getTaskField, requireTaskFile, validateTaskFile } = require("../task/repository");
const { updateTaskFields } = require("../task/repository");
const {
  readJsonObject,
  replaceActiveTeam,
  taskRuntimeFile,
  taskStateFile,
  timestampSeconds,
} = require("../task/runtime");
const {
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
  openDispatch,
  openLane,
  quiesceAttempt,
  recordCapabilitySnapshot,
  recordObservation,
  recordSelectionEvent,
  reserveAttempt,
  terminalAttempt,
} = require("./lane-registry");
const { classifyPaseoObservation } = require("./backend-failures");
const { launchLabel, observePaseoCommand, reconcileLaunch } = require("./paseo-observer");
const {
  admitTeamStart,
  globalAdmissionLockFile,
  validateTeamWriterAdmission,
} = require("./admission");
const {
  ATTEMPT_USAGE,
  DISPATCH_USAGE,
  FALLBACK_USAGE,
  LANE_USAGE,
  LOOP_RECORD_USAGE,
  PROMOTE_USAGE,
  RECORD_FINALIZE_USAGE,
  RECORD_START_USAGE,
  SELECTION_USAGE,
  STATUS_USAGE,
  STOP_USAGE,
  booleanValue,
  commaList,
  parseAttemptArgs,
  parseDispatchArgs,
  parseFallbackArgs,
  parseJsonStringArray,
  parseLaneArgs,
  parseLoopRecordArgs,
  parsePromoteArgs,
  parseRecordFinalizeArgs,
  parseRecordStartArgs,
  parseSelectionArgs,
  validateBackend,
  validateExecutionAuthorization,
  validateFinalStatus,
  validateLoopStatus,
  validateMode,
  validatePositiveInteger,
  validateQuery,
  validateReason,
} = require("./args");

function teamDir(paths, taskId) {
  return path.join(taskArtifactDir(paths, taskId), "team");
}

function teamDecisionFile(paths, taskId) {
  return path.join(teamDir(paths, taskId), "decision.md");
}

function teamStaffingFile(paths, taskId) {
  return path.join(teamDir(paths, taskId), "staffing.md");
}

function teamLockFile(taskId, environment = process.env) {
  return path.join(
    environment.TMPDIR || os.tmpdir(),
    "codex-workflow-team-locks",
    `${posixChecksum(taskId)}.lock`,
  );
}

function snapshotPromotionFile(file, label, required = false) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    if (error.code === "ENOENT" && !required) {
      return { content: null, file, mode: null };
    }
    throw error;
  }
  if (!stat.isFile()) {
    throw new CommandError(`${label} is not a regular file: ${file}`);
  }
  return { content: fs.readFileSync(file), file, mode: stat.mode & 0o777 };
}

function restorePromotionFile(snapshot) {
  if (snapshot.content === null) {
    try {
      fs.unlinkSync(snapshot.file);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
    return;
  }
  let current = null;
  try {
    current = fs.readFileSync(snapshot.file);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
  if (!current || !current.equals(snapshot.content)) {
    fs.writeFileSync(snapshot.file, snapshot.content);
  }
  fs.chmodSync(snapshot.file, snapshot.mode);
}

function requireV2Team(paths, taskId) {
  const state = readJsonObject(taskStateFile(paths, taskId));
  const team = state.active_team && typeof state.active_team === "object" ? state.active_team : {};
  if (team.schema_version !== 2) throw new CommandError("team v2 run is required");
  return team;
}

function writeV2Projection(paths, taskId, team, clock) {
  deriveTeam(team);
  if (team.backend_sidecar && new Set(["mixed", "none"]).has(team.effective_backend)) {
    team.backend = "native";
  }
  const taskFile = requireTaskFile(paths.tasksDir, taskId);
  const snapshots = [
    snapshotPromotionFile(taskFile, "task file", true),
    snapshotPromotionFile(taskStateFile(paths, taskId), "task state", true),
  ];
  try {
    updateTaskFields(taskFile, {
      active_team_backend: team.backend,
      active_team_mode: team.mode,
      active_team_status: team.status,
      active_team_decision: team.decision || relativeToCodeHome(paths, teamDecisionFile(paths, taskId)),
    });
    replaceActiveTeam(paths, taskId, team, clock);
  } catch (error) {
    for (const snapshot of snapshots.reverse()) restorePromotionFile(snapshot);
    throw error;
  }
}

function mutateV2Team(taskId, operationFn, options = {}) {
  const { clock, environment, paths } = commandOptions(options);
  prepareTaskCommand(paths, taskId, clock);
  let output;
  withLock(globalAdmissionLockFile(paths), () => {
    withLock(teamLockFile(taskId, environment), () => {
      const team = requireV2Team(paths, taskId);
      try {
        output = operationFn(team, timestampSeconds(clock));
      } catch (error) {
        if (error instanceof RegistryError) throw new CommandError(error.message);
        throw error;
      }
      validateTeamWriterAdmission(paths, taskId, output.team);
      writeV2Projection(paths, taskId, output.team, clock);
    });
  });
  return { ...output, paths };
}

function runRecordStart(parsed, options = {}) {
  const backend = parsed.backend || "native";
  validateBackend(backend);
  validateMode(parsed.mode);
  if (parsed.agents) validatePositiveInteger(parsed.agents, "agents");
  validateQuery(parsed.objective);
  if (parsed.roles) validateReason(parsed.roles, "team roles");
  if (parsed.providers) validateReason(parsed.providers, "paseo providers");
  if (backend !== "paseo" && parsed.providers) {
    throw new CommandError("native team backend does not accept providers");
  }
  const requestedFallbackPolicy = parsed.fallbackPolicy || "codex";
  const fallbackPolicy = requestedFallbackPolicy === "no-fallback"
    ? "none"
    : requestedFallbackPolicy;
  if (!new Set(["codex", "none"]).has(fallbackPolicy)) {
    throw new CommandError(`invalid fallback policy: ${parsed.fallbackPolicy}`);
  }
  if (parsed.backend) {
    if (!new Set(["user-message", "operator-input"]).has(parsed.selectionAuthorityKind)
      || !parsed.selectionAuthorityRef) {
      throw new CommandError("explicit team backend requires selection authority");
    }
    validateReason(parsed.selectionAuthorityRef, "selection authority ref");
  }
  validateExecutionAuthorization(parsed.mode, parsed.authorizationRef);
  const { clock, cwd, environment, paths } = commandOptions(options);
  const decisionFile = teamDecisionFile(paths, parsed.taskId);
  const staffingFile = teamStaffingFile(paths, parsed.taskId);
  const decision = relativeToCodeHome(paths, decisionFile);
  const staffing = relativeToCodeHome(paths, staffingFile);
  let team;
  let replayed = false;
  withLock(globalAdmissionLockFile(paths), () => {
    withLock(teamLockFile(parsed.taskId, environment), () => {
      const taskFile = requireTaskFile(paths.tasksDir, parsed.taskId);
      const { task } = validateTaskFile(taskFile);
      if (task.status !== "doing") {
        throw new CommandError(`task must be doing before team start: ${parsed.taskId}`);
      }
      const state = readJsonObject(taskStateFile(paths, parsed.taskId));
      const admission = admitTeamStart({
        briefPath: parsed.briefPath,
        clock,
        cwd,
        mode: parsed.mode,
        paths,
        taskId: parsed.taskId,
      });
      const previous = state.active_team && typeof state.active_team === "object"
        ? state.active_team : {};
      if (parsed.operationId && previous.start_operation_id === parsed.operationId) {
        const previousIdentity = {
          mode: previous.mode,
          objective: previous.objective,
          configuredBackend: previous.configured_backend,
          fallbackPolicy: previous.configured_fallback_policy,
          authorizationRef: previous.authorization_ref,
          agents: previous.agents,
          roles: previous.roles,
          providers: previous.providers,
          selectionAuthorityKind: previous.selection_events?.[0]?.authority_kind || "",
          selectionAuthorityRef: previous.selection_events?.[0]?.authority_ref || "",
          briefSha256: previous.admission?.brief?.sha256 || "",
        };
        const replayIdentity = {
          mode: parsed.mode,
          objective: parsed.objective,
          configuredBackend: parsed.backend || null,
          fallbackPolicy,
          authorizationRef: parsed.mode === "execute" ? parsed.authorizationRef : "",
          agents: parsed.agents || "",
          roles: parsed.roles || "",
          providers: parsed.providers || "",
          selectionAuthorityKind: parsed.backend ? parsed.selectionAuthorityKind : "",
          selectionAuthorityRef: parsed.backend ? parsed.selectionAuthorityRef : "",
          briefSha256: admission.brief?.sha256 || "",
        };
        if (JSON.stringify(previousIdentity) !== JSON.stringify(replayIdentity)) {
          throw new CommandError(`team start operation_id replay conflict: ${parsed.operationId}`);
        }
        team = previous;
        replayed = true;
        return;
      }
      prepareTaskCommand(paths, parsed.taskId, clock);
      const generation = previous.schema_version === 2 ? Number(previous.generation || 0) + 1 : 1;
      const now = timestampSeconds(clock);
      try {
        team = createTeamRun({
          previous,
          mode: parsed.mode,
          objective: parsed.objective,
          configuredBackend: parsed.backend || null,
          fallbackPolicy,
          authorizationRef: parsed.authorizationRef,
          agents: parsed.agents,
          roles: parsed.roles,
          providers: parsed.providers,
          decision,
          staffing,
          now,
          teamSelection: parsed.backend ? {
            eventId: `selection-team-${String(generation).padStart(4, "0")}`,
            kind: "backend",
            scope: "team",
            authorityKind: parsed.selectionAuthorityKind,
            authorityRef: parsed.selectionAuthorityRef,
            backend,
          } : null,
        });
      } catch (error) {
        if (error instanceof RegistryError) throw new CommandError(error.message);
        throw error;
      }
      team.admission = admission;
      team.admitted_owned_paths = admission.admitted_owned_paths;
      team.slice_id = admission.brief?.slice_id || "";
      team.start_operation_id = parsed.operationId || "";
      writeV2Projection(paths, parsed.taskId, team, clock);
    });
  });
  if (!replayed) {
    appendLegacyRuntimeEvent(
      paths,
      parsed.taskId,
      "team-record-start",
      `${backend}/${parsed.mode} roles=${parsed.roles || "dynamic"}`,
      clock,
    );
  }
  const lines = [
    `task_id: ${parsed.taskId}`,
    `backend: ${backend}`,
    `mode: ${parsed.mode}`,
    `status: ${team.status}`,
    `decision: ${decisionFile}`,
    `staffing: ${staffingFile}`,
  ];
  if (parsed.mode === "execute") {
    lines.push(`authorization_ref: ${parsed.authorizationRef}`);
    lines.push(`brief: ${team.admission.brief.path}`);
    lines.push(`slice_id: ${team.slice_id}`);
    lines.push(`operation_id: ${team.start_operation_id}`);
  }
  if (parsed.providers) {
    lines.push(`providers: ${parsed.providers}`);
  }
  lines.push(`team_run_id: ${team.team_run_id}`, `generation: ${team.generation}`);
  return {
    exitCode: 0,
    lines,
  };
}

function controlResultLines(taskId, action, result) {
  return [
    `task_id: ${taskId}`,
    `action: ${action}`,
    ...Object.entries(result || {}).map(([key, value]) => `${key}: ${displayValue(value)}`),
  ];
}

function capabilityEntries(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload && payload.models)) return payload.models;
  if (Array.isArray(payload && payload.data && payload.data.models)) return payload.data.models;
  return [];
}

function runtimeModeIds(entry) {
  const values = entry.runtime_mode_ids || entry.runtime_modes || entry.modes || [];
  if (!Array.isArray(values)) return [];
  return [...new Set(values.flatMap((value) => {
    if (typeof value === "string") return [value];
    if (value && typeof value === "object" && value.callable !== false && value.id) {
      return [String(value.id)];
    }
    return [];
  }))];
}

function providerRuntimeModeIds(result, provider) {
  if (!result || !result.observation || result.observation.exit_code !== 0) return [];
  let payload;
  try {
    payload = JSON.parse(result.stdout || "");
  } catch (_error) {
    return [];
  }
  const entries = Array.isArray(payload) ? payload : [];
  const entry = entries.find((item) => String(item && item.provider || "") === provider);
  return entry && typeof entry.defaultMode === "string" && entry.defaultMode
    ? [entry.defaultMode]
    : [];
}

function providerModelFamily(result, provider) {
  if (!result || !result.observation || result.observation.exit_code !== 0) return "";
  let payload;
  try {
    payload = JSON.parse(result.stdout || "");
  } catch (_error) {
    return "";
  }
  const entries = Array.isArray(payload) ? payload : [];
  const entry = entries.find((item) => String(item && item.provider || "") === provider);
  const family = String(entry && (
    entry.model_family || entry.family || entry.provider_class || entry.providerClass
  ) || "").toLowerCase();
  return new Set(["claude", "non-claude"]).has(family) ? family : "";
}

function capabilityFromObserverResult(result, providerResult, provider, model) {
  if (!result || !result.observation || result.observation.exit_code !== 0) {
    throw new CommandError("Paseo provider model observation failed");
  }
  let payload;
  try {
    payload = JSON.parse(result.stdout || "");
  } catch (error) {
    throw new CommandError(`invalid Paseo provider model JSON: ${error.message}`);
  }
  const entry = capabilityEntries(payload).find((item) => {
    const identifier = item && (item.id || item.model || item.name);
    const itemProvider = item && (item.provider || item.provider_id);
    return String(identifier || "") === model && (!itemProvider || String(itemProvider) === provider);
  });
  if (!entry) throw new CommandError(`Paseo capability snapshot does not contain model: ${provider}/${model}`);
  const visibleClaude = /(^|[-_/.])claude($|[-_/.])/.test(`${provider}/${model}`.toLowerCase());
  let modelFamily = String(
    entry.model_family || entry.family || entry.provider_class || entry.providerClass || "",
  ).toLowerCase();
  if (!new Set(["claude", "non-claude"]).has(modelFamily)) {
    modelFamily = visibleClaude ? "claude"
      : providerModelFamily(providerResult, provider) || "unknown";
  }
  return {
    modelFamily,
    payloadDigest: `models:${result.observation.raw_digest};providers:${providerResult.observation.raw_digest}`,
    runtimeModeIds: [...new Set([
      ...runtimeModeIds(entry),
      ...providerRuntimeModeIds(providerResult, provider),
    ])],
  };
}

function runSelectionRecord(parsed, options = {}) {
  if (parsed.kind === "capability") {
    const { clock, environment, paths } = commandOptions(options);
    prepareTaskCommand(paths, parsed.taskId, clock);
    const existingTeam = requireV2Team(paths, parsed.taskId);
    const existingOperation = (existingTeam.operation_log || [])
      .find((entry) => entry.operation_id === parsed.operationId);
    if (existingOperation) {
      const snapshot = (existingTeam.capability_snapshots || [])
        .find((item) => item.snapshot_id === existingOperation.result.snapshot_id);
      if (existingOperation.kind !== "capability.record" || !snapshot
        || snapshot.snapshot_id !== parsed.eventId
        || snapshot.provider !== parsed.provider || snapshot.model !== parsed.model) {
        throw new CommandError(`operation_id replay payload conflict: ${parsed.operationId}`);
      }
      return {
        exitCode: 0,
        lines: controlResultLines(parsed.taskId, "selection-record", existingOperation.result),
      };
    }
    const observer = options.observePaseoCommand || observePaseoCommand;
    const observed = observer("provider-models", [parsed.provider], {
      environment,
      observedAt: timestampSeconds(clock),
      paseoBin: options.paseoBin,
    });
    const providerObserved = observer("provider-list", [], {
      environment,
      observedAt: timestampSeconds(clock),
      paseoBin: options.paseoBin,
    });
    if (!providerObserved || !providerObserved.observation
      || providerObserved.observation.exit_code !== 0) {
      throw new CommandError("Paseo provider capability observation failed");
    }
    const capability = capabilityFromObserverResult(
      observed, providerObserved, parsed.provider, parsed.model,
    );
    const output = mutateV2Team(parsed.taskId, (team, now) => recordCapabilitySnapshot(team, {
      operationId: parsed.operationId,
      snapshotId: parsed.eventId,
      provider: parsed.provider,
      model: parsed.model,
      modelFamily: capability.modelFamily,
      runtimeModeIds: capability.runtimeModeIds,
      payloadDigest: capability.payloadDigest,
      observationAction: "provider-models+provider-list",
      observedAt: observed.observation.observed_at,
      authorityRef: parsed.authorityRef,
      now,
    }), { ...options, clock, environment, paths });
    return { exitCode: 0, lines: controlResultLines(parsed.taskId, "selection-record", output.result) };
  }
  const output = mutateV2Team(parsed.taskId, (team, now) => recordSelectionEvent(team, {
    ...parsed,
    now,
  }), options);
  return { exitCode: 0, lines: controlResultLines(parsed.taskId, "selection-record", output.result) };
}

function runLaneRecord(parsed, options = {}) {
  let action;
  if (parsed.action === "open") {
    action = (team, now) => openLane(team, {
      ...parsed,
      configuredBackend: parsed.backend || null,
      fallbackPolicy: parsed.fallbackPolicy === "no-fallback" ? "none" : parsed.fallbackPolicy,
      ownedPaths: commaList(parsed.paths),
      writable: parsed.writable === undefined
        ? undefined
        : booleanValue(parsed.writable, "writable"),
      now,
    });
  } else if (parsed.action === "close") {
    action = (team, now) => closeLane(team, { ...parsed, now });
  } else {
    throw new CommandError(LANE_USAGE);
  }
  const output = mutateV2Team(parsed.taskId, action, options);
  return { exitCode: 0, lines: controlResultLines(parsed.taskId, `lane-${parsed.action}`, output.result) };
}

function runDispatchRecord(parsed, options = {}) {
  let action;
  if (parsed.action === "open") {
    action = (team, now) => openDispatch(team, {
      ...parsed,
      configuredBackend: parsed.backend || null,
      fallbackPolicy: parsed.fallbackPolicy === "no-fallback" ? "none" : parsed.fallbackPolicy,
      now,
    });
  } else if (parsed.action === "dispose") {
    action = (team, now) => disposeDispatch(team, {
      ...parsed,
      admittedAttemptIds: commaList(parsed.admittedAttempts),
      evidenceRefs: commaList(parsed.evidenceRefs),
      now,
    });
  } else if (parsed.action === "close") {
    action = (team, now) => closeDispatch(team, { ...parsed, now });
  } else {
    throw new CommandError(DISPATCH_USAGE);
  }
  const output = mutateV2Team(parsed.taskId, action, options);
  return { exitCode: 0, lines: controlResultLines(parsed.taskId, `dispatch-${parsed.action}`, output.result) };
}

function canonicalEvidenceRefs(paths, taskId, refs, label) {
  const root = fs.realpathSync(taskArtifactDir(paths, taskId));
  return refs.map((reference) => {
    if (!reference || reference.includes("\\") || path.isAbsolute(reference)) {
      throw new CommandError(`${label} must be a task-artifact-relative path: ${reference}`);
    }
    const unresolved = path.resolve(root, reference);
    const relative = path.relative(root, unresolved);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new CommandError(`${label} escapes the task artifact directory: ${reference}`);
    }
    let stat;
    try {
      stat = fs.lstatSync(unresolved);
    } catch (error) {
      if (error.code === "ENOENT") throw new CommandError(`missing ${label}: ${reference}`);
      throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) {
      throw new CommandError(`${label} is not a non-empty regular file: ${reference}`);
    }
    const absolute = fs.realpathSync(unresolved);
    const canonicalRelative = path.relative(root, absolute);
    if (canonicalRelative === ".." || canonicalRelative.startsWith(`..${path.sep}`)
      || path.isAbsolute(canonicalRelative)) {
      throw new CommandError(`${label} resolves outside the task artifact directory: ${reference}`);
    }
    return canonicalRelative.split(path.sep).join("/");
  });
}

function agentsFromListResult(result) {
  if (!result || !result.observation || result.observation.exit_code !== 0) {
    throw new CommandError("Paseo launch reconciliation failed");
  }
  let payload;
  try {
    payload = JSON.parse(result.stdout || "");
  } catch (error) {
    throw new CommandError(`invalid Paseo agent list JSON: ${error.message}`);
  }
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload && payload.agents)) return payload.agents;
  throw new CommandError("Paseo agent list response does not contain agents");
}

function runObserveAttempt(parsed, options = {}) {
  const { clock, environment, paths } = commandOptions(options);
  prepareTaskCommand(paths, parsed.taskId, clock);
  const existingTeam = requireV2Team(paths, parsed.taskId);
  const attempt = (existingTeam.attempts || []).find((item) => item.attempt_id === parsed.attemptId);
  if (!attempt) throw new CommandError(`unknown attempt: ${parsed.attemptId}`);
  const operationId = `${parsed.operationId}-observation`;
  const existingOperation = (existingTeam.operation_log || [])
    .find((entry) => entry.operation_id === operationId);
  if (existingOperation) {
    const observation = (existingTeam.observations || [])
      .find((item) => item.observation_id === existingOperation.result.observation_id);
    const actionMatches = observation && (observation.action === parsed.observerAction
      || (parsed.observerAction === "run" && observation.action === "ls"
        && observation.reconciliation_status === "matched"));
    if (existingOperation.kind !== "observation.record" || !observation
      || observation.observation_id !== parsed.observationId
      || observation.attempt_id !== parsed.attemptId
      || !actionMatches) {
      throw new CommandError(`operation_id replay payload conflict: ${parsed.operationId}`);
    }
    return {
      exitCode: 0,
      lines: controlResultLines(parsed.taskId, "attempt-observe", existingOperation.result),
    };
  }
  if (!new Set(["run", "wait", "stop", "inspect"]).has(parsed.observerAction)) {
    throw new CommandError(`unsupported Paseo observer action: ${parsed.observerAction}`);
  }
  let args;
  if (parsed.observerAction === "run") {
    args = parseJsonStringArray(parsed.observerArgsJson, "observer args");
    if (args.length === 0) throw new CommandError("Paseo run observation requires observer args");
  } else {
    if (!attempt.runtime_agent_id) {
      throw new CommandError(`${parsed.observerAction} observation requires a bound runtime agent`);
    }
    if (parsed.observerArgsJson) {
      throw new CommandError(`${parsed.observerAction} observation does not accept observer args`);
    }
    args = [attempt.runtime_agent_id];
  }
  const observer = options.observePaseoCommand || observePaseoCommand;
  const launchScope = {
    taskId: parsed.taskId,
    teamRunId: existingTeam.team_run_id,
    attemptId: attempt.attempt_id,
    launchOperationId: attempt.launch_operation_id,
  };
  const observerOptions = {
    environment,
    observedAt: timestampSeconds(clock),
    paseoBin: options.paseoBin,
    launchOperationId: attempt.launch_operation_id,
    launchScope,
  };
  let observed;
  let reconciliationStatus = "";
  if (parsed.observerAction === "run") {
    const listed = observer(
      "ls", ["--global", "--label", launchLabel(launchScope)], observerOptions,
    );
    const reconciliation = reconcileLaunch(agentsFromListResult(listed));
    reconciliationStatus = reconciliation.status;
    if (reconciliation.status === "ambiguous") {
      throw new CommandError("Paseo launch reconciliation is ambiguous");
    }
    if (reconciliation.status === "matched") {
      if (!reconciliation.agent || typeof reconciliation.agent.id !== "string"
        || !reconciliation.agent.id.trim()) {
        throw new CommandError("Paseo launch reconciliation matched an actor without an id");
      }
      observed = {
        ...listed,
        observation: {
          ...listed.observation,
          action: "ls",
          actor_created: true,
          runtime_agent_id: reconciliation.agent.id,
          reconciliation_status: "matched",
        },
      };
    } else {
      observed = observer("run", args, observerOptions);
    }
  } else {
    observed = observer(parsed.observerAction, args, observerOptions);
  }
  if (!observed || !observed.observation
    || (parsed.observerAction === "run"
      ? !new Set(["run", "ls"]).has(observed.observation.action)
      : observed.observation.action !== parsed.observerAction)) {
    throw new CommandError("Paseo observer returned an invalid receipt");
  }
  if (parsed.observerAction !== "run"
    && observed.observation.runtime_agent_id !== attempt.runtime_agent_id) {
    throw new CommandError("Paseo observer receipt does not match the bound runtime agent");
  }
  if (parsed.observerAction === "run" && reconciliationStatus === "missing"
    && observed.observation.exit_code === 0
    && (observed.observation.actor_created !== true
      || !observed.observation.runtime_agent_id)) {
    throw new CommandError("Paseo run receipt does not identify the created actor");
  }
  const observation = {
    ...observed.observation,
    attempt_id: attempt.attempt_id,
    launch_operation_id: attempt.launch_operation_id,
  };
  Object.assign(observation, classifyPaseoObservation(observation));
  const output = mutateV2Team(parsed.taskId, (team, now) => recordObservation(team, {
    operationId,
    observationId: parsed.observationId,
    observation,
    now,
  }), { ...options, clock, environment, paths });
  return { exitCode: 0, lines: controlResultLines(parsed.taskId, "attempt-observe", output.result) };
}

function runAttemptRecord(parsed, options = {}) {
  if (parsed.action === "observe") return runObserveAttempt(parsed, options);
  const { paths } = commandOptions(options);
  let evidenceRefs = commaList(parsed.evidenceRefs);
  if (parsed.action === "quiesced" && evidenceRefs.length > 0) {
    evidenceRefs = canonicalEvidenceRefs(paths, parsed.taskId, evidenceRefs, "quiescence evidence");
  }
  const output = mutateV2Team(parsed.taskId, (initialTeam, now) => {
    let transitioned;
    if (parsed.action === "reserve") {
      transitioned = reserveAttempt(initialTeam, {
        ...parsed,
        fallbackPolicy: parsed.fallbackPolicy === "no-fallback" ? "none" : parsed.fallbackPolicy,
        ownedPaths: commaList(parsed.paths),
        writable: parsed.writable === undefined
          ? undefined
          : booleanValue(parsed.writable, "writable"),
        now,
      });
    } else if (parsed.action === "bind") {
      transitioned = bindAttempt(initialTeam, { ...parsed, now });
    } else if (parsed.action === "running") {
      transitioned = markAttemptRunning(initialTeam, { ...parsed, now });
    } else if (parsed.action === "terminal") {
      transitioned = terminalAttempt(initialTeam, {
        ...parsed,
        retryEligible: booleanValue(parsed.retryEligible || "false", "retry eligible"),
        launchInvoked: booleanValue(parsed.launchInvoked || "false", "launch invoked"),
        evidenceRefs: commaList(parsed.evidenceRefs),
        now,
      });
    } else if (parsed.action === "quiesced") {
      transitioned = quiesceAttempt(initialTeam, {
        ...parsed,
        evidenceRefs,
        now,
      });
    } else {
      throw new CommandError(ATTEMPT_USAGE);
    }
    return transitioned;
  }, options);
  return { exitCode: 0, lines: controlResultLines(parsed.taskId, `attempt-${parsed.action}`, output.result) };
}

function runFallbackRecord(parsed, options = {}) {
  const { paths } = commandOptions(options);
  const evidenceRefs = canonicalEvidenceRefs(
    paths, parsed.taskId, commaList(parsed.evidenceRefs), "fallback evidence",
  );
  const output = mutateV2Team(parsed.taskId, (team, now) => fallbackAttempt(team, {
    ...parsed,
    evidenceRefs,
    now,
  }), options);
  return { exitCode: 0, lines: controlResultLines(parsed.taskId, "fallback-record", output.result) };
}

function validateExistingNonemptyFile(label, file) {
  if (!file || /[\n\r\t]/.test(file)) {
    throw new CommandError(`invalid ${label} path: ${file}`);
  }
  let stats;
  try {
    stats = fs.statSync(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new CommandError(`missing ${label} file: ${file}`);
    }
    throw error;
  }
  if (!stats.isFile()) {
    throw new CommandError(`missing ${label} file: ${file}`);
  }
  if (stats.size === 0) {
    throw new CommandError(`empty ${label} file: ${file}`);
  }
}

function validateTeamArtifact(paths, taskId, label, file, backend) {
  validateExistingNonemptyFile(label, file);
  const teamRoot = fs.realpathSync(teamDir(paths, taskId));
  const absolute = fs.realpathSync(file);
  const relative = path.relative(teamRoot, absolute);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new CommandError(
      `${label} file is outside current task team directory: ${absolute}`,
    );
  }
  const text = fs.readFileSync(absolute, "utf8");
  const backendPattern = new RegExp(`(^|\\b)backend\\s*[:=]\\s*${backend}\\b`, "im");
  if (!backendPattern.test(text)) {
    throw new CommandError(
      `${label} file is missing backend: ${backend} marker: ${absolute}`,
    );
  }
  const ignoredPrefixes = [
    "Task:",
    "Title:",
    "- task_id:",
    "- title:",
    "- backend:",
    "- mode:",
    "- objective:",
    "- agents:",
    "- roles:",
    "- status:",
    "- created_at:",
    "- completed_at:",
    "- decision_file:",
    "- round_file:",
    "- staffing:",
    "- loop:",
    "- iterations",
    "- max_",
  ];
  const content = text
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !line.startsWith("#") &&
        !line.startsWith("```") &&
        line !== "Pending discussion." &&
        !ignoredPrefixes.some((prefix) => line.startsWith(prefix)),
    )
    .join("\n")
    .trim();
  if (content.length < 20) {
    throw new CommandError(`${label} file is not substantive: ${absolute}`);
  }
  return absolute;
}

function runRecordFinalize(parsed, options = {}) {
  validateFinalStatus(parsed.status);
  const { clock, environment, paths } = commandOptions(options);
  const taskFile = prepareTaskCommand(paths, parsed.taskId, clock);
  const currentState = readJsonObject(taskStateFile(paths, parsed.taskId));
  if (currentState.active_team && currentState.active_team.schema_version === 2) {
    return runRecordFinalizeV2(parsed, { clock, environment, paths, taskFile });
  }
  validateBackend(parsed.backend);
  const currentBackend = getTaskField(taskFile, "active_team_backend");
  const currentStatus = getTaskField(taskFile, "active_team_status");
  if (currentBackend !== parsed.backend || currentStatus !== "running") {
    throw new CommandError(
      `team-record-finalize requires an active ${parsed.backend} team record in running status`,
    );
  }
  const roundAbsolute = validateTeamArtifact(
    paths,
    parsed.taskId,
    "team round",
    parsed.roundFile,
    parsed.backend,
  );
  const decisionAbsolute = validateTeamArtifact(
    paths,
    parsed.taskId,
    "team decision",
    parsed.decisionFile,
    parsed.backend,
  );
  const staffingAbsolute = validateTeamArtifact(
    paths,
    parsed.taskId,
    "team staffing",
    parsed.staffingFile,
    parsed.backend,
  );
  const round = relativeToCodeHome(paths, roundAbsolute);
  const decision = relativeToCodeHome(paths, decisionAbsolute);
  const staffing = relativeToCodeHome(paths, staffingAbsolute);
  const mode = getTaskField(taskFile, "active_team_mode");
  withLock(teamLockFile(parsed.taskId, environment), () => {
    updateTaskCommand(
      paths,
      parsed.taskId,
      {
        active_team_backend: parsed.backend,
        active_team_status: parsed.status,
        active_team_decision: decision,
      },
      {
        "active_team.backend": parsed.backend,
        "active_team.mode": mode,
        "active_team.status": parsed.status,
        "active_team.decision": decision,
        "active_team.round_file": round,
        "active_team.staffing": staffing,
        "active_team.temp_dir": "",
      },
      clock,
    );
  });
  appendLegacyRuntimeEvent(
    paths,
    parsed.taskId,
    "team-record-finalize",
    `${parsed.backend}/${parsed.status} round=${round}`,
    clock,
  );
  return {
    exitCode: 0,
    lines: [
      `task_id: ${parsed.taskId}`,
      `backend: ${parsed.backend}`,
      `status: ${parsed.status}`,
      `decision: ${parsed.decisionFile}`,
      `staffing: ${parsed.staffingFile}`,
      `round: ${parsed.roundFile}`,
    ],
  };
}

function artifactRelative(paths, taskId, file) {
  return path.relative(taskArtifactDir(paths, taskId), file).split(path.sep).join("/");
}

function backendAssertionMatches(asserted, effective, hasDispatches, resolvedRequestedBackend) {
  if (asserted === effective) return true;
  if (new Set(["mixed", "none"]).has(effective) && asserted === "native") return true;
  return effective === "none" && !hasDispatches && asserted === resolvedRequestedBackend;
}

function runRecordFinalizeV2(parsed, context) {
  const { clock, environment, paths, taskFile } = context;
  let finalizedTeam;
  let effectiveBackend;
  let sidecarFile;
  withLock(teamLockFile(parsed.taskId, environment), () => {
    const current = requireV2Team(paths, parsed.taskId);
    if (!new Set(["running", "promoted:execute", "promoted:worktree"]).has(current.status)) {
      throw new CommandError(`team-record-finalize requires an active v2 team record in running status`);
    }
    const roundAbsolute = validateExistingTeamArtifactPath(paths, parsed.taskId, "team round", parsed.roundFile);
    const decisionAbsolute = validateExistingTeamArtifactPath(paths, parsed.taskId, "team decision", parsed.decisionFile);
    const staffingAbsolute = validateExistingTeamArtifactPath(paths, parsed.taskId, "team staffing", parsed.staffingFile);
    const team = current;
    if (team.lanes.some((lane) => lane.status !== "closed")) {
      throw new CommandError("v2 finalize requires all lanes closed");
    }
    deriveTeam(team);
    effectiveBackend = team.effective_backend;
    if (parsed.backend && !backendAssertionMatches(
      parsed.backend, effectiveBackend, team.dispatches.length > 0,
      team.resolved_requested_backend,
    )) {
      throw new CommandError(`v2 finalize backend assertion mismatch: ${parsed.backend} != ${effectiveBackend}`);
    }
    const artifactBackend = team.dispatches.length === 0 ? parsed.backend : effectiveBackend;
    validateTeamArtifact(paths, parsed.taskId, "team round", roundAbsolute, artifactBackend);
    validateTeamArtifact(paths, parsed.taskId, "team decision", decisionAbsolute, artifactBackend);
    validateTeamArtifact(paths, parsed.taskId, "team staffing", staffingAbsolute, artifactBackend);

    team.status = parsed.status;
    team.round_file = relativeToCodeHome(paths, roundAbsolute);
    team.decision = relativeToCodeHome(paths, decisionAbsolute);
    team.staffing = relativeToCodeHome(paths, staffingAbsolute);
    team.temp_dir = "";
    if (team.dispatches.length === 0) {
      team.compatibility_records.push({
        record_id: `record-finalize-${String(team.generation).padStart(4, "0")}`,
        kind: "record-only-finalize",
        requested_backend_argument: parsed.backend,
        effective_backend: "none",
        live_provider: "unverified",
        evidence_refs: [roundAbsolute, decisionAbsolute, staffingAbsolute]
          .map((file) => artifactRelative(paths, parsed.taskId, file)),
        recorded_at: timestampSeconds(clock),
      });
    }
    const sidecar = backendSidecar(team);
    team.backend = new Set(["native", "paseo"]).has(effectiveBackend) ? effectiveBackend : "native";
    sidecarFile = path.join(teamDir(paths, parsed.taskId), "backend-v2.json");
    team.backend_sidecar = relativeToCodeHome(paths, sidecarFile);
    const snapshots = [
      snapshotPromotionFile(taskFile, "task file", true),
      snapshotPromotionFile(taskStateFile(paths, parsed.taskId), "task state", true),
      snapshotPromotionFile(sidecarFile, "team backend sidecar"),
    ];
    try {
      atomicWriteJson(sidecarFile, sidecar);
      writeV2Projection(paths, parsed.taskId, team, clock);
    } catch (error) {
      for (const snapshot of snapshots.reverse()) restorePromotionFile(snapshot);
      throw error;
    }
    finalizedTeam = team;
  });
  appendLegacyRuntimeEvent(
    paths,
    parsed.taskId,
    "team-record-finalize",
    `${effectiveBackend}/${parsed.status} round=${finalizedTeam.round_file}`,
    clock,
  );
  return {
    exitCode: 0,
    lines: [
      `task_id: ${parsed.taskId}`,
      `backend: ${effectiveBackend}`,
      `status: ${parsed.status}`,
      `decision: ${parsed.decisionFile}`,
      `staffing: ${parsed.staffingFile}`,
      `round: ${parsed.roundFile}`,
      `sidecar: ${sidecarFile}`,
    ],
  };
}

function validateExistingTeamArtifactPath(paths, taskId, label, file) {
  validateExistingNonemptyFile(label, file);
  const teamRoot = fs.realpathSync(teamDir(paths, taskId));
  const absolute = fs.realpathSync(file);
  const relative = path.relative(teamRoot, absolute);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new CommandError(`${label} file is outside current task team directory: ${absolute}`);
  }
  return absolute;
}

function runLoopRecord(parsed, options = {}) {
  validateLoopStatus(parsed.status);
  validatePositiveInteger(parsed.iterations, "loop iterations");
  if (parsed.maxIterations) {
    validatePositiveInteger(parsed.maxIterations, "loop max iterations");
  }
  if (parsed.maxTime) {
    validateReason(parsed.maxTime, "loop max time");
  }
  const { clock, environment, paths } = commandOptions(options);
  const taskFile = prepareTaskCommand(paths, parsed.taskId, clock);
  const state = readJsonObject(taskStateFile(paths, parsed.taskId));
  if (state.active_team && state.active_team.schema_version === 2) {
    return runLoopRecordV2(parsed, { clock, environment, paths, taskFile });
  }
  validateBackend(parsed.backend);
  if (getTaskField(taskFile, "active_team_backend") !== parsed.backend) {
    throw new CommandError(`team-loop-record requires a ${parsed.backend} team record`);
  }
  const loopAbsolute = validateTeamArtifact(
    paths,
    parsed.taskId,
    "team loop",
    parsed.loopFile,
    parsed.backend,
  );
  const decisionFile = teamDecisionFile(paths, parsed.taskId);
  const staffingFile = teamStaffingFile(paths, parsed.taskId);
  const decision = relativeToCodeHome(paths, decisionFile);
  const staffing = relativeToCodeHome(paths, staffingFile);
  const loop = relativeToCodeHome(paths, loopAbsolute);
  const mode = getTaskField(taskFile, "active_team_mode") || "execute";
  const stateUpdates = {
    "active_team.backend": parsed.backend,
    "active_team.mode": mode,
    "active_team.status": parsed.status,
    "active_team.decision": decision,
    "active_team.staffing": staffing,
    "active_team.loop.status": parsed.status,
    "active_team.loop.file": loop,
    "active_team.loop.iteration": parsed.iterations,
  };
  if (parsed.maxIterations) {
    stateUpdates["active_team.loop.max_iterations"] = parsed.maxIterations;
  }
  if (parsed.maxTime) {
    stateUpdates["active_team.loop.max_time"] = parsed.maxTime;
  }
  withLock(teamLockFile(parsed.taskId, environment), () => {
    updateTaskCommand(
      paths,
      parsed.taskId,
      {
        active_team_backend: parsed.backend,
        active_team_mode: mode,
        active_team_status: parsed.status,
        active_team_decision: decision,
      },
      stateUpdates,
      clock,
    );
  });
  appendLegacyRuntimeEvent(
    paths,
    parsed.taskId,
    "team-loop-record",
    `${parsed.backend}/${parsed.status} loop=${loop} iterations=${parsed.iterations}`,
    clock,
  );
  return {
    exitCode: 0,
    lines: [
      `task_id: ${parsed.taskId}`,
      `backend: ${parsed.backend}`,
      `status: ${parsed.status}`,
      `loop: ${parsed.loopFile}`,
      `iterations: ${parsed.iterations}`,
    ],
  };
}

function runLoopRecordV2(parsed, context) {
  const { clock, environment, paths } = context;
  let effective;
  withLock(teamLockFile(parsed.taskId, environment), () => {
    const team = requireV2Team(paths, parsed.taskId);
    if (!new Set(["running", "promoted:execute", "promoted:worktree"]).has(team.status)) {
      throw new CommandError("team-loop-record requires an active v2 team record in running status");
    }
    deriveTeam(team);
    effective = team.effective_backend;
    if (parsed.backend && !backendAssertionMatches(
      parsed.backend, effective, team.dispatches.length > 0,
      team.resolved_requested_backend,
    )) {
      throw new CommandError(`v2 loop backend assertion mismatch: ${parsed.backend} != ${effective}`);
    }
    const artifactBackend = team.dispatches.length === 0 ? parsed.backend : effective;
    const loopAbsolute = validateTeamArtifact(
      paths, parsed.taskId, "team loop", parsed.loopFile, artifactBackend,
    );
    team.status = parsed.status;
    team.loop = {
      ...(team.loop || {}),
      status: parsed.status,
      file: relativeToCodeHome(paths, loopAbsolute),
      iteration: Number(parsed.iterations),
    };
    if (parsed.maxIterations) team.loop.max_iterations = Number(parsed.maxIterations);
    if (parsed.maxTime) team.loop.max_time = parsed.maxTime;
    if (team.dispatches.length === 0) {
      team.compatibility_records.push({
        record_id: `loop-record-${String(team.generation).padStart(4, "0")}`,
        kind: "record-only-loop",
        requested_backend_argument: parsed.backend,
        effective_backend: "none",
        live_provider: "unverified",
        evidence_refs: [artifactRelative(paths, parsed.taskId, loopAbsolute)],
        recorded_at: timestampSeconds(clock),
      });
    }
    writeV2Projection(paths, parsed.taskId, team, clock);
  });
  appendLegacyRuntimeEvent(
    paths, parsed.taskId, "team-loop-record",
    `${effective}/${parsed.status} loop=${parsed.loopFile} iterations=${parsed.iterations}`, clock,
  );
  return {
    exitCode: 0,
    lines: [
      `task_id: ${parsed.taskId}`,
      `backend: ${effective}`,
      `status: ${parsed.status}`,
      `loop: ${parsed.loopFile}`,
      `iterations: ${parsed.iterations}`,
    ],
  };
}

function displayValue(value) {
  return value === undefined || value === null ? "" : String(value);
}

function runStatus(argv, options = {}) {
  if (argv.length !== 1) {
    throw new CommandError(STATUS_USAGE);
  }
  const { clock, paths } = commandOptions(options);
  prepareTaskCommand(paths, argv[0], clock);
  const state = readJsonObject(taskStateFile(paths, argv[0]));
  const team = state.active_team && typeof state.active_team === "object" ? state.active_team : {};
  const loop = team.loop && typeof team.loop === "object" ? team.loop : {};
  const fields = [
    ["task_id", state.task_id],
    ["status", state.status],
    ["artifact_dir", state.artifact_dir],
    ["last_verified_at", state.last_verified_at],
    ["team_backend", team.backend],
    ["team_mode", team.mode],
    ["team_status", team.status],
    ["team_decision", team.decision],
    ["team_objective", team.objective],
    ["team_agents", team.agents],
    ["team_roles", team.roles],
    ["team_providers", team.providers],
    ["team_round", team.round_file],
    ["team_staffing", team.staffing],
    ["team_temp_dir", team.temp_dir],
    ["team_promoted_to", team.promoted_to],
    ["team_loop_status", loop.status],
    ["team_loop_file", loop.file],
    ["team_loop_iteration", loop.iteration],
    ["team_loop_max_iterations", loop.max_iterations],
    ["team_loop_max_time", loop.max_time],
  ];
  if (team.schema_version === 2) {
    fields.push(
      ["team_schema_version", team.schema_version],
      ["team_run_id", team.team_run_id],
      ["team_generation", team.generation],
      ["team_configured_backend", team.configured_backend],
      ["team_resolved_requested_backend", team.resolved_requested_backend],
      ["team_attempted_backends", (team.attempted_backends || []).join(",")],
      ["team_effective_backend", team.effective_backend],
      ["team_backend_sidecar", team.backend_sidecar],
      ["team_lane_count", (team.lanes || []).length],
      ["team_dispatch_count", (team.dispatches || []).length],
      ["team_attempt_count", (team.attempts || []).length],
      ["team_admission_count", (team.admissions || []).length],
      ["team_fallback_count", (team.fallback_events || []).length],
      ["team_active_writer_leases", (team.writer_leases || []).filter((item) => item.state === "active").length],
      ["team_convergence", (team.lanes || []).map((lane) => `${lane.lane_id}=${lane.convergence}`).join(",")],
      ["team_legacy_projection", new Set(["mixed", "none"]).has(team.effective_backend)],
    );
  }
  return { exitCode: 0, lines: fields.map(([key, value]) => `${key}: ${displayValue(value)}`) };
}

function runStop(argv, options = {}) {
  if (argv.length !== 1) {
    throw new CommandError(STOP_USAGE);
  }
  const { clock, environment, paths } = commandOptions(options);
  prepareTaskCommand(paths, argv[0], clock);
  const decision = relativeToCodeHome(paths, teamDecisionFile(paths, argv[0]));
  const state = readJsonObject(taskStateFile(paths, argv[0]));
  if (state.active_team && state.active_team.schema_version === 2) {
    withLock(teamLockFile(argv[0], environment), () => {
      const team = requireV2Team(paths, argv[0]);
      if (!new Set(["running", "promoted:execute", "promoted:worktree"]).has(team.status)) {
        throw new CommandError(`team run is not mutable: ${team.status}`);
      }
      if ((team.attempts || []).some((attempt) => new Set(["reserved", "bound", "running"]).has(attempt.status))
        || (team.writer_leases || []).some((lease) => lease.state === "active")) {
        throw new CommandError("team-stop requires active attempts to be terminal and quiesced first");
      }
      team.status = "stopped";
      team.decision = decision;
      writeV2Projection(paths, argv[0], team, clock);
    });
    appendLegacyRuntimeEvent(paths, argv[0], "team-stop", "stopped", clock);
    return { exitCode: 0, lines: [`task_id: ${argv[0]}`, "status: stopped"] };
  }
  updateTaskCommand(
    paths,
    argv[0],
    { active_team_status: "stopped", active_team_decision: decision },
    { "active_team.status": "stopped", "active_team.decision": decision },
    clock,
  );
  appendLegacyRuntimeEvent(paths, argv[0], "team-stop", "stopped", clock);
  return { exitCode: 0, lines: [`task_id: ${argv[0]}`, "status: stopped"] };
}

function runPromote(parsed, options = {}) {
  validateExecutionAuthorization(parsed.target, parsed.authorizationRef);
  const { clock, cwd, environment, paths } = commandOptions(options);
  const decisionFile = teamDecisionFile(paths, parsed.taskId);
  const decision = relativeToCodeHome(paths, decisionFile);
  let replayed = false;
  withLock(globalAdmissionLockFile(paths), () => {
    withLock(teamLockFile(parsed.taskId, environment), () => {
      const taskFile = requireTaskFile(paths.tasksDir, parsed.taskId);
      validateTaskFile(taskFile);
      const state = readJsonObject(taskStateFile(paths, parsed.taskId));
      const activeTeam = state.active_team && typeof state.active_team === "object"
        ? state.active_team
        : {};
      if (activeTeam.schema_version === 2
        && !new Set(["running", "promoted:execute", "promoted:worktree"])
          .has(activeTeam.status)) {
        throw new CommandError(`team run is not mutable: ${activeTeam.status}`);
      }
      const admission = parsed.target === "execute" ? admitTeamStart({
        briefPath: parsed.briefPath,
        clock,
        cwd,
        mode: "execute",
        paths,
        taskId: parsed.taskId,
      }) : null;
      if (parsed.target === "execute"
        && activeTeam.execution_operation_id === parsed.operationId) {
        if (activeTeam.authorization_ref !== parsed.authorizationRef
          || activeTeam.admission?.brief?.sha256 !== admission.brief.sha256) {
          throw new CommandError(`team promotion operation_id replay conflict: ${parsed.operationId}`);
        }
        replayed = true;
        return;
      }
      const snapshots = [
        snapshotPromotionFile(taskFile, "task file", true),
        snapshotPromotionFile(taskStateFile(paths, parsed.taskId), "task state"),
        snapshotPromotionFile(decisionFile, "team decision"),
        snapshotPromotionFile(taskRuntimeFile(paths, parsed.taskId), "task runtime"),
      ];
      let mode = getTaskField(taskFile, "active_team_mode");
      if (parsed.target === "execute") mode = "execute";
      const status = `promoted:${parsed.target}`;
      const promotedTeam = activeTeam.schema_version === 2
        ? JSON.parse(JSON.stringify(activeTeam))
        : null;
      if (promotedTeam) {
        promotedTeam.mode = mode;
        promotedTeam.status = status;
        promotedTeam.promoted_to = parsed.target;
      }
      if (parsed.target === "execute" && promotedTeam) {
        promotedTeam.authorization_ref = parsed.authorizationRef;
        promotedTeam.admission = admission;
        promotedTeam.admitted_owned_paths = admission.admitted_owned_paths;
        promotedTeam.slice_id = admission.brief.slice_id;
        promotedTeam.execution_operation_id = parsed.operationId;
      }
      try {
        if (promotedTeam) {
          promotedTeam.decision = decision;
          validateTeamWriterAdmission(paths, parsed.taskId, promotedTeam);
          writeV2Projection(paths, parsed.taskId, promotedTeam, clock);
        } else {
          updateTaskCommand(
            paths,
            parsed.taskId,
            {
              active_team_mode: mode,
              active_team_status: status,
              active_team_decision: decision,
            },
            {
              "active_team.mode": mode,
              "active_team.status": status,
              "active_team.promoted_to": parsed.target,
              "active_team.authorization_ref": parsed.target === "execute"
                ? parsed.authorizationRef
                : activeTeam.authorization_ref || "",
            },
            clock,
          );
        }
        const authorizationLine = parsed.target === "execute"
          ? `- authorization_ref: ${parsed.authorizationRef}\n- brief: ${admission.brief.path}\n- operation_id: ${parsed.operationId}\n`
          : "";
        fs.appendFileSync(
          decisionFile,
          `\n## Promotion\n\n- promoted_to: ${parsed.target}\n${authorizationLine}- created_at: ${timestampSeconds(clock)}\n`,
          "utf8",
        );
        appendLegacyRuntimeEvent(paths, parsed.taskId, "team-promote", parsed.target, clock);
      } catch (error) {
        try {
          for (const snapshot of snapshots.reverse()) restorePromotionFile(snapshot);
        } catch (rollbackError) {
          throw new CommandError(
            `team promotion failed and rollback failed: ${error.message}; ${rollbackError.message}`,
          );
        }
        throw error;
      }
    });
  });
  const lines = [
    `task_id: ${parsed.taskId}`,
    `target: ${parsed.target}`,
    `decision: ${decisionFile}`,
  ];
  if (parsed.target === "execute") {
    lines.push(`authorization_ref: ${parsed.authorizationRef}`);
    lines.push(`brief: ${parsed.briefPath}`);
    lines.push(`operation_id: ${parsed.operationId}`);
  }
  if (replayed) lines.push("replayed: true");
  return {
    exitCode: 0,
    lines,
  };
}

module.exports = {
  LOOP_RECORD_USAGE,
  ATTEMPT_USAGE,
  DISPATCH_USAGE,
  FALLBACK_USAGE,
  LANE_USAGE,
  PROMOTE_USAGE,
  RECORD_FINALIZE_USAGE,
  RECORD_START_USAGE,
  STATUS_USAGE,
  STOP_USAGE,
  SELECTION_USAGE,
  parseAttemptArgs,
  parseDispatchArgs,
  parseFallbackArgs,
  parseLaneArgs,
  parseLoopRecordArgs,
  parsePromoteArgs,
  parseRecordFinalizeArgs,
  parseRecordStartArgs,
  parseSelectionArgs,
  runAttemptRecord,
  runDispatchRecord,
  runFallbackRecord,
  runLaneRecord,
  runLoopRecord,
  runPromote,
  runRecordFinalize,
  runRecordStart,
  runSelectionRecord,
  runStatus,
  runStop,
  teamDecisionFile,
  teamDir,
  teamLockFile,
  teamStaffingFile,
  validateTeamArtifact,
};
