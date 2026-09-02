"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  CommandError,
  commandOptions,
} = require("../core/command-runtime");
const { taskMutationLockFile, withLock } = require("../core/lock");
const { relativeToCodeHome, resolvePaths, taskArtifactDir } = require("../core/paths");
const { canonicalJson, readAuthoritativeEvents, sha256 } = require("../core/event-store");
const { mutateTaskRuntime, taskEventFile } = require("../core/task-mutation");
const {
  assertDecisionReadyFromEvents,
  assertExecutionGrantDecisionFresh,
  assertPromptBundleDecisionSnapshot,
  assertTeamDecisionFresh,
} = require("../artifact/decisions");
const {
  getTaskField,
  renderTaskFields,
  requireTaskFile,
  validateTaskFile,
} = require("../task/repository");
const {
  projectTaskState,
  readJsonObject,
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
  recordLaunchReconciliation,
  recordObservation,
  recordSelectionEvent,
  reserveAttempt,
  resolveLaunchClaim,
  terminalAttempt,
  teamControlPlaneClosureIssues,
} = require("./lane-registry");
const { classifyPaseoObservation } = require("./backend-failures");
const { launchLabel, observePaseoCommand, reconcileLaunch } = require("./paseo-observer");
const {
  FIRST_CODE_STOP_CODE,
  admitTeamStart,
  briefRequestIdentity,
  globalAdmissionLockFile,
  validateTeamWriterAdmission,
} = require("./admission");
const {
  assertActiveExecutionGrant,
  authorityReplayPostcondition,
  firstCodeBoundary,
} = require("./execution-grant");
const { assertCanonicalGrantArtifacts, buildCanonicalScope } = require("./scope-artifacts");
const { enforceFirstCodeBoundary } = require("./first-code");
const {
  prepareWriterLeaseControlEvent,
  syncWriterLeaseControlAfterEvent,
} = require("./writer-lease-control");
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

const CONTROLLER_AUTHORITY_REF =
  /^(user-message|operator-input):[A-Za-z0-9][A-Za-z0-9._:-]*$/;

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
  return taskMutationLockFile(resolvePaths(environment), taskId);
}

function writerLeaseControlHooks(paths, taskId, options = {}) {
  return {
    beforeEventAppend(event) {
      if (options.beforeEventAppend) options.beforeEventAppend(event);
      prepareWriterLeaseControlEvent(paths, taskId, event);
    },
    afterEventAppend(event, context) {
      if (options.afterEventAppend) options.afterEventAppend(event, context);
      syncWriterLeaseControlAfterEvent(paths, taskId, event);
    },
  };
}

function requireV2Team(paths, taskId, currentState = null) {
  const state = currentState || authoritativeTaskState(paths, taskId);
  const team = state.active_team && typeof state.active_team === "object" ? state.active_team : {};
  if (team.schema_version !== 2) throw new CommandError("team v2 run is required");
  return team;
}

function authoritativeTaskState(paths, taskId) {
  const events = readAuthoritativeEvents(taskEventFile(paths, taskId), taskId);
  const latest = events.at(-1);
  if (latest) return JSON.parse(JSON.stringify(latest.projection.state));
  return readJsonObject(taskStateFile(paths, taskId));
}

function buildTeamProjection(
  paths,
  taskId,
  team,
  clock,
  currentState = null,
  currentTaskContent = null,
) {
  deriveTeam(team);
  if (team.backend_sidecar && new Set(["mixed", "none"]).has(team.effective_backend)) {
    team.backend = "native";
  }
  const taskFile = currentTaskContent === null ? requireTaskFile(paths.tasksDir, taskId) : null;
  if (taskFile) validateTaskFile(taskFile);
  const source = currentTaskContent === null ? fs.readFileSync(taskFile, "utf8") : currentTaskContent;
  const taskContent = renderTaskFields(source, {
    active_team_backend: team.backend,
    active_team_mode: team.mode,
    active_team_status: team.status,
    active_team_decision:
      team.decision || relativeToCodeHome(paths, teamDecisionFile(paths, taskId)),
  });
  const state = projectTaskState(
    paths,
    taskId,
    taskContent,
    currentState || authoritativeTaskState(paths, taskId),
    clock,
  );
  state.active_team = team;
  state.updated_at = timestampSeconds(clock);
  return { task_content: taskContent, state };
}

function authoritySensitiveTeamReplayPostcondition(clock, environment, paths, taskId) {
  return (context) => {
    const team = context.existing.result?.team
      || context.existing.projection?.state?.active_team;
    if (team?.schema_version !== 2 || team.mode !== "execute") return null;
    return authorityReplayPostcondition({
      clock,
      evidenceEpoch: team.evidence_epoch,
      grantId: team.grant_id,
      requireUnexpired: true,
      scopeDigest: team.scope_digest,
      sliceId: team.slice_id,
      teamRunId: team.team_run_id,
      validateCurrent({ grant }) {
        if (!team.admission?.brief?.path) {
          throw new CommandError("execute Team replay lacks its canonical brief path");
        }
        assertCanonicalGrantArtifacts({
          briefPath: team.admission.brief.path,
          environment,
          grant,
          paths,
          taskId,
        });
      },
    })(context);
  };
}

function assertCurrentExecuteTeamAuthority(
  team,
  state,
  clock,
  environment,
  paths,
  taskId,
  { requireUnexpired = false } = {},
) {
  if (team?.schema_version !== 2 || team.mode !== "execute") return null;
  const grant = assertActiveExecutionGrant(state, {
    evidenceEpoch: team.evidence_epoch,
    grantId: team.grant_id,
    scopeDigest: team.scope_digest,
    sliceId: team.slice_id,
  }, { clock, requireUnexpired });
  if (team.admission?.grant_id !== grant.grant_id
    || team.admission?.scope_digest !== grant.scope_digest
    || team.admission?.evidence_epoch !== grant.evidence_epoch
    || !team.admission?.brief?.path) {
    throw new CommandError("Team admission no longer matches the current execution grant");
  }
  assertCanonicalGrantArtifacts({
    briefPath: team.admission.brief.path,
    environment,
    grant,
    paths,
    taskId,
  });
  return grant;
}

function assertCurrentExecuteTeamAuthorityIdentity(team, state) {
  if (team?.schema_version !== 2 || team.mode !== "execute") return null;
  const grant = assertActiveExecutionGrant(state, {
    evidenceEpoch: team.evidence_epoch,
    grantId: team.grant_id,
    scopeDigest: team.scope_digest,
    sliceId: team.slice_id,
  });
  if (team.admission?.grant_id !== grant.grant_id
    || team.admission?.scope_digest !== grant.scope_digest
    || team.admission?.evidence_epoch !== grant.evidence_epoch) {
    throw new CommandError("Team admission no longer matches the current execution grant");
  }
  return grant;
}

function assertEarlyTeamReplayAuthority(team, state, context, operationId) {
  try {
    return assertCurrentExecuteTeamAuthority(
      team,
      state,
      context.clock,
      context.environment,
      context.paths,
      context.taskId,
      { requireUnexpired: true },
    );
  } catch (error) {
    throw new CommandError(`stale authorization replay: ${operationId}: ${error.message}`);
  }
}

function mutateV2Team(taskId, operationFn, options = {}) {
  const { clock, environment, paths } = commandOptions(options);
  let output;
  let committed;
  let authorityGuard = null;
  withLock(globalAdmissionLockFile(paths), () => {
    committed = mutateTaskRuntime(
      paths,
      taskId,
      {
        kind: options.eventKind || "team.control.mutated",
        operationId: options.operationId,
        data: options.operationData || {},
      },
      ({ currentProjection, events, occurredAt }) => {
        const currentState = currentProjection.state;
        if (options.requireDoingTask && currentState.status !== "doing") {
          throw new CommandError(`${options.eventKind || "Team control"} requires a doing task`);
        }
        const team = requireV2Team(paths, taskId, currentState);
        if (options.requireCurrentDecisions) {
          assertTeamDecisionFresh(events, taskId, team, currentState);
        }
        if (team.mode === "execute") {
          authorityGuard = options.factualAuthorityReceipt
            ? () => assertCurrentExecuteTeamAuthorityIdentity(team, currentState)
            : () => assertCurrentExecuteTeamAuthority(
              team,
              currentState,
              clock,
              environment,
              paths,
              taskId,
              { requireUnexpired: Boolean(options.requireUnexpiredAuthority) },
            );
          authorityGuard();
          if (options.requireExecutableFirstCode
            && firstCodeBoundary(currentState.execution_authority, team.slice_id).blocked) {
            throw new CommandError(
              "first-code boundary is paused-replan-required; explicit replan is required before further execution",
            );
          }
        }
        const eventClock = () => new Date(occurredAt);
        try {
          output = operationFn(team, timestampSeconds(eventClock));
        } catch (error) {
          if (error instanceof RegistryError) throw new CommandError(error.message);
          throw error;
        }
        validateTeamWriterAdmission(paths, taskId, output.team);
        return {
          projection: {
            ...buildTeamProjection(
              paths,
              taskId,
              output.team,
              eventClock,
              currentState,
              currentProjection.task_content,
            ),
            files: output.files || [],
          },
          result: output.result || {},
          legacy: output.legacy || [{
            kind: options.legacyKind || "team-control",
            detail: options.legacyDetail || options.eventKind || "team.control.mutated",
          }],
        };
      },
      {
        ...options,
        ...writerLeaseControlHooks(paths, taskId, {
          ...options,
          beforeEventAppend(event) {
            if (options.beforeEventAppend) options.beforeEventAppend(event);
            if (authorityGuard) authorityGuard(event);
          },
        }),
        clock,
        environment,
        expectedRevision: options.expectedRevision,
        replayPostcondition: (context) => {
          const replayTeam = context.existing.result?.team
            || context.existing.projection?.state?.active_team;
          if (options.requireCurrentDecisions) {
            assertTeamDecisionFresh(
              context.events,
              taskId,
              replayTeam,
              context.latest?.projection?.state || {},
            );
          }
          if (options.replayPostcondition) {
            return options.replayPostcondition(context);
          }
          if (replayTeam?.mode === "execute") {
            return authorityReplayPostcondition({
              clock,
              evidenceEpoch: replayTeam.evidence_epoch,
              grantId: replayTeam.grant_id,
              requireUnexpired: true,
              scopeDigest: replayTeam.scope_digest,
              sliceId: replayTeam.slice_id,
              teamRunId: replayTeam.team_run_id,
              validateCurrent({ grant }) {
                if (!replayTeam.admission?.brief?.path) {
                  throw new CommandError("execute Team replay lacks its canonical brief path");
                }
                assertCanonicalGrantArtifacts({
                  briefPath: replayTeam.admission.brief.path,
                  environment,
                  grant,
                  paths,
                  taskId,
                });
              },
            })(context);
          }
          return null;
        },
      },
    );
  });
  if (committed.replay) output = { replay: true, result: committed.result };
  return { ...output, paths };
}

function assertAdmissionRequestIdentity(admission, requested) {
  const actual = {
    brief_path: admission?.brief?.path || "",
    brief_sha256: admission?.brief?.sha256 || "",
    contract_sha256: admission?.brief?.contract_sha256 || "",
    execution_plan_sha256: admission?.brief?.execution_plan_sha256 || "",
  };
  if (JSON.stringify(actual) !== JSON.stringify(requested)) {
    throw new CommandError("Team brief identity changed while admission was being evaluated");
  }
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
  validateExecutionAuthorization(
    parsed.mode,
    parsed.authorizationRef,
    parsed.grantId,
    parsed.scopeDigest,
  );
  const { clock, cwd, environment, paths } = commandOptions(options);
  const decisionFile = teamDecisionFile(paths, parsed.taskId);
  const staffingFile = teamStaffingFile(paths, parsed.taskId);
  const decision = relativeToCodeHome(paths, decisionFile);
  const staffing = relativeToCodeHome(paths, staffingFile);
  let team;
  let committed;
  let scopeGuard = null;
  const startOperationId = parsed.operationId || options.operationId || crypto.randomUUID();
  withLock(globalAdmissionLockFile(paths), () => {
    const requestIdentity = briefRequestIdentity(parsed.briefPath);
    try {
      committed = mutateTaskRuntime(
        paths,
        parsed.taskId,
        {
          kind: "team.started",
          operationId: startOperationId,
          data: {
            mode: parsed.mode,
            objective: parsed.objective,
            backend: parsed.backend || "",
            fallback_policy: fallbackPolicy,
            authorization_ref: parsed.authorizationRef || "",
            grant_id: parsed.grantId || "",
            scope_digest: parsed.scopeDigest || "",
            agents: parsed.agents || "",
            roles: parsed.roles || "",
            providers: parsed.providers || "",
            selection_authority_kind: parsed.selectionAuthorityKind || "",
            selection_authority_ref: parsed.selectionAuthorityRef || "",
            ...requestIdentity,
          },
        },
        ({ currentProjection, events, occurredAt, revision }) => {
          const eventClock = () => new Date(occurredAt);
          if (!currentProjection?.state) {
            throw new CommandError(`unknown task: ${parsed.taskId}`);
          }
          const state = JSON.parse(JSON.stringify(currentProjection.state));
          const decisionControl = assertDecisionReadyFromEvents(
            events,
            parsed.taskId,
          );
          assertPromptBundleDecisionSnapshot(paths, parsed.taskId, decisionControl);
          const admission = admitTeamStart({
            authorizationRef: parsed.authorizationRef,
            briefPath: parsed.briefPath,
            captureIdentity: options.captureIdentity,
            clock: eventClock,
            currentState: state,
            cwd,
            environment,
            expectedGrantId: parsed.grantId,
            expectedScopeDigest: parsed.scopeDigest,
            mode: parsed.mode,
            objective: parsed.objective,
            paths,
            taskId: parsed.taskId,
          });
          assertAdmissionRequestIdentity(admission, requestIdentity);
          if (admission.slice_start_snapshot) {
            admission.slice_start_snapshot.captured_at_revision = revision + 1;
          }
          if (state.status !== "doing") {
            throw new CommandError(`task must be doing before team start: ${parsed.taskId}`);
          }
          const previous = state.active_team && typeof state.active_team === "object"
            ? state.active_team
            : {};
          const generation = previous.schema_version === 2
            ? Number(previous.generation || 0) + 1
            : 1;
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
              now: timestampSeconds(eventClock),
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
          if (parsed.mode === "execute") {
            team.grant_id = admission.grant_id;
            team.scope_digest = admission.scope_digest;
            team.evidence_epoch = admission.evidence_epoch;
            const grant = assertActiveExecutionGrant(state, {
              grantId: admission.grant_id,
              scopeDigest: admission.scope_digest,
            });
            assertExecutionGrantDecisionFresh(state, decisionControl);
            scopeGuard = () => {
              const rebuilt = buildCanonicalScope({
                authorizationRef: grant.authorization_provenance.ref,
                briefPath: parsed.briefPath,
                cwd,
                environment,
                evidencePolicy: grant.scope.evidence_policy,
                grantId: grant.grant_id,
                objective: grant.scope.objective,
                parent: grant.scope.parent,
                paths,
                requireObjectiveMatchesSelected: false,
                taskId: parsed.taskId,
              });
              if (rebuilt.scopeDigest !== grant.scope_digest) {
                throw new CommandError("Team scope artifacts changed before start event append");
              }
            };
          }
          team.start_operation_id = startOperationId;
          validateTeamWriterAdmission(paths, parsed.taskId, team);
          return {
            projection: buildTeamProjection(
              paths,
              parsed.taskId,
              team,
              eventClock,
              state,
              currentProjection.task_content,
            ),
            result: { team },
            legacy: [{
              kind: "team-record-start",
              detail: `${backend}/${parsed.mode} roles=${parsed.roles || "dynamic"}`,
            }],
          };
        },
        {
          ...options,
          ...writerLeaseControlHooks(paths, parsed.taskId, {
            ...options,
            beforeEventAppend(event) {
              if (options.beforeEventAppend) options.beforeEventAppend(event);
              if (scopeGuard) scopeGuard(event);
            },
          }),
          clock,
          environment,
          replayPostcondition: (context) => {
            const replayTeam = context.existing.result?.team
              || context.existing.projection?.state?.active_team;
            const currentState = context.latest?.projection?.state || {};
            const currentDecisions = assertTeamDecisionFresh(
              context.events,
              parsed.taskId,
              replayTeam,
              currentState,
            );
            assertPromptBundleDecisionSnapshot(paths, parsed.taskId, currentDecisions);
            if (parsed.mode !== "execute") {
              return options.replayPostcondition
                ? options.replayPostcondition(context)
                : null;
            }
            return authorityReplayPostcondition({
              clock,
              grantId: parsed.grantId,
              requireUnexpired: true,
              scopeDigest: parsed.scopeDigest,
              validateCurrent({ grant }) {
                assertCanonicalGrantArtifacts({
                  briefPath: parsed.briefPath,
                  environment,
                  grant,
                  paths,
                  taskId: parsed.taskId,
                });
              },
            })(context);
          },
        },
      );
    } catch (error) {
      if (parsed.operationId
        && error.message === `operation_id replay payload conflict: ${parsed.operationId}`) {
        throw new CommandError(`team start operation_id replay conflict: ${parsed.operationId}`);
      }
      if (error.code === FIRST_CODE_STOP_CODE) {
        enforceFirstCodeBoundary(paths, parsed.taskId, error.firstCodeTarget, {
          clock,
          environment,
          operationId: startOperationId,
        });
      }
      throw error;
    }
  });
  if (committed.replay) team = committed.result.team;
  const lines = [
    `task_id: ${parsed.taskId}`,
    `backend: ${backend}`,
    `mode: ${parsed.mode}`,
    `status: ${team.status}`,
    `decision: ${decisionFile}`,
    `staffing: ${staffingFile}`,
  ];
  if (parsed.mode === "execute") {
    lines.push(`authorization_ref: ${team.authorization_ref}`);
    lines.push(`grant_id: ${team.grant_id}`);
    lines.push(`scope_digest: ${team.scope_digest}`);
    lines.push(`evidence_epoch: ${team.evidence_epoch}`);
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

function assertTeamControlPlaneClosed(team, action) {
  const issues = teamControlPlaneClosureIssues(team);
  if (issues.length > 0) {
    throw new CommandError(
      `${action} requires a closed v2 Team control plane: ${issues.join("; ")}`,
    );
  }
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

const DIRECT_PROVIDER_MODEL_FAMILIES = new Map([
  ["claude", "claude"],
  ["codex", "non-claude"],
  ["deepseek", "non-claude"],
  ["glm", "non-claude"],
  ["kimi", "non-claude"],
  ["openai", "non-claude"],
  // grok/xai are family classification only, not supplier admission: no Paseo
  // provider exists for either today. See skills/team/SKILL.md's note on the
  // DeepSeek/ZenMux recipe not implying a future Grok/Kimi route — a new
  // supplier still requires its own independently verified model, transport,
  // auth, and capability before this entry authorizes any routing.
  ["grok", "non-claude"],
  ["xai", "non-claude"],
]);

function directProviderModelFamily(provider) {
  return DIRECT_PROVIDER_MODEL_FAMILIES.get(String(provider || "").toLowerCase()) || "";
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
      : providerModelFamily(providerResult, provider)
        || directProviderModelFamily(provider)
        || "unknown";
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
    const taskFile = requireTaskFile(paths.tasksDir, parsed.taskId);
    validateTaskFile(taskFile);
    const currentState = authoritativeTaskState(paths, parsed.taskId);
    const existingTeam = requireV2Team(paths, parsed.taskId, currentState);
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
      assertEarlyTeamReplayAuthority(existingTeam, currentState, {
        clock, environment, paths, taskId: parsed.taskId,
      }, parsed.operationId);
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
    }), {
      ...options,
      clock,
      environment,
      paths,
      operationId: parsed.operationId,
      operationData: {
        ...parsed,
        modelFamily: capability.modelFamily,
        runtimeModeIds: capability.runtimeModeIds,
        payloadDigest: capability.payloadDigest,
        observationAction: "provider-models+provider-list",
        observedAt: observed.observation.observed_at,
      },
      eventKind: "team.capability.recorded",
    });
    return { exitCode: 0, lines: controlResultLines(parsed.taskId, "selection-record", output.result) };
  }
  const output = mutateV2Team(parsed.taskId, (team, now) => recordSelectionEvent(team, {
    ...parsed,
    now,
  }), {
    ...options,
    operationId: parsed.operationId,
    operationData: { ...parsed },
    eventKind: "team.selection.recorded",
  });
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
  const output = mutateV2Team(parsed.taskId, action, {
    ...options,
    operationId: parsed.operationId,
    operationData: { ...parsed },
    eventKind: `team.lane.${parsed.action}`,
    requireDoingTask: parsed.action === "open",
    requireCurrentDecisions: parsed.action === "open",
  });
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
  const output = mutateV2Team(parsed.taskId, action, {
    ...options,
    operationId: parsed.operationId,
    operationData: { ...parsed },
    eventKind: `team.dispatch.${parsed.action}`,
    requireDoingTask: parsed.action === "open",
    requireCurrentDecisions: parsed.action === "open",
  });
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

function observeLaunchRequest(parsed, team, attempt, args) {
  return {
    schema_version: 1,
    task_id: parsed.taskId,
    team_run_id: team.team_run_id,
    team_generation: team.generation,
    attempt_id: attempt.attempt_id,
    operation_id: parsed.operationId,
    observation_id: parsed.observationId,
    observer_action: parsed.observerAction,
    observer_args: [...args],
    launch_operation_id: attempt.launch_operation_id,
  };
}

function observeLaunchClaimIdentity(parsed, team, attempt, args) {
  const artifactIdentity = team.mode === "execute" ? {
    brief_path: team.admission?.brief?.path || "",
    brief_sha256: team.admission?.brief?.sha256 || "",
    contract_sha256: team.admission?.brief?.contract_sha256 || "",
    execution_plan_sha256: team.admission?.brief?.execution_plan_sha256 || "",
  } : null;
  const request = observeLaunchRequest(parsed, team, attempt, args);
  return {
    schema_version: 1,
    claim_kind: "paseo-observer-launch",
    task_id: parsed.taskId,
    team_run_id: team.team_run_id,
    team_generation: team.generation,
    attempt_id: attempt.attempt_id,
    attempt_status: attempt.status,
    operation_id: parsed.operationId,
    claim_operation_id: `${parsed.operationId}-observation-launch-claim`,
    terminal_operation_id: `${parsed.operationId}-observation`,
    request_digest: sha256(canonicalJson(request)),
    launch_operation_id: attempt.launch_operation_id,
    grant_id: team.mode === "execute" ? team.grant_id : "",
    scope_digest: team.mode === "execute" ? team.scope_digest : "",
    evidence_epoch: team.mode === "execute" ? team.evidence_epoch : 0,
    slice_id: team.mode === "execute" ? team.slice_id : "",
    artifact_identity: artifactIdentity,
  };
}

function durableObserveLaunchClaimIdentity(claim) {
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

function sameObserveLaunchScope(left, right) {
  return left.task_id === right.task_id
    && left.team_run_id === right.team_run_id
    && left.attempt_id === right.attempt_id
    && left.launch_operation_id === right.launch_operation_id;
}

function matchingObserveLaunchClaim(team, identity, options = {}) {
  const claim = (team.observer_launch_claims || [])
    .find((candidate) => candidate.operation_id === identity.operation_id);
  if (!claim) return null;
  const actualIdentity = durableObserveLaunchClaimIdentity(claim);
  const expectedIdentity = { ...identity };
  if (options.ignoreAttemptStatus) {
    delete actualIdentity.attempt_status;
    delete expectedIdentity.attempt_status;
  }
  if (canonicalJson(actualIdentity) !== canonicalJson(expectedIdentity)) {
    throw new CommandError(`operation_id replay payload conflict: ${identity.operation_id}`);
  }
  return claim;
}

function durableObserveLaunchIdentity(team, parsed, attempt, args) {
  const claim = (team.observer_launch_claims || [])
    .find((candidate) => candidate.operation_id === parsed.operationId);
  if (!claim) return null;
  const expectedRequest = observeLaunchRequest(parsed, team, attempt, args);
  if (claim.task_id !== parsed.taskId
    || claim.team_run_id !== team.team_run_id
    || claim.team_generation !== team.generation
    || claim.attempt_id !== attempt.attempt_id
    || claim.operation_id !== parsed.operationId
    || claim.claim_operation_id !== `${parsed.operationId}-observation-launch-claim`
    || claim.terminal_operation_id !== `${parsed.operationId}-observation`
    || claim.launch_operation_id !== attempt.launch_operation_id
    || claim.request_digest !== sha256(canonicalJson(expectedRequest))) {
    throw new CommandError(`operation_id replay payload conflict: ${parsed.operationId}`);
  }
  return durableObserveLaunchClaimIdentity(claim);
}

function currentObserveLaunchIdentity(team, parsed, args, expected) {
  const attempt = (team.attempts || [])
    .find((candidate) => candidate.attempt_id === expected.attempt_id);
  if (!attempt) throw new CommandError(`unknown attempt: ${expected.attempt_id}`);
  if (attempt.status !== "reserved") {
    throw new CommandError(`Paseo launch requires reserved attempt state: ${attempt.status}`);
  }
  const current = observeLaunchClaimIdentity(parsed, team, attempt, args);
  if (canonicalJson(current) !== canonicalJson(expected)) {
    throw new CommandError("Paseo launch binding changed before authoritative append");
  }
  return current;
}

function appendObserveLaunchClaim(teamInput, parsed, args, identity, now) {
  const team = JSON.parse(JSON.stringify(teamInput));
  currentObserveLaunchIdentity(team, parsed, args, identity);
  const existing = matchingObserveLaunchClaim(team, identity);
  if (existing) {
    throw new CommandError(`Paseo launch claim is already ${existing.status}: ${identity.operation_id}`);
  }
  const conflicting = (team.observer_launch_claims || [])
    .find((candidate) => sameObserveLaunchScope(candidate, identity));
  if (conflicting) {
    throw new CommandError(
      `Paseo launch operation already has a canonical claim: ${identity.launch_operation_id}`,
    );
  }
  const claim = { ...identity, status: "in_progress", claimed_at: now };
  team.observer_launch_claims = [...(team.observer_launch_claims || []), claim];
  return { team, result: { claim: JSON.parse(JSON.stringify(claim)) } };
}

function terminalizeObserveLaunchClaim(teamInput, identity, recordInput) {
  const attempt = (teamInput.attempts || [])
    .find((candidate) => candidate.attempt_id === identity.attempt_id);
  if (!attempt || attempt.status !== "reserved"
    || attempt.launch_operation_id !== identity.launch_operation_id) {
    throw new CommandError("Paseo launch terminal receipt no longer matches its reserved attempt");
  }
  const claim = matchingObserveLaunchClaim(teamInput, identity);
  if (!claim || claim.status !== "in_progress") {
    throw new CommandError(`Paseo launch claim is not in progress: ${identity.operation_id}`);
  }
  const recorded = recordObservation(teamInput, recordInput);
  const terminalClaim = matchingObserveLaunchClaim(recorded.team, identity);
  terminalClaim.status = "terminal";
  terminalClaim.terminal_at = recordInput.now;
  terminalClaim.observation_id = recordInput.observationId;
  terminalClaim.observation_action = recordInput.observation.action;
  terminalClaim.runtime_agent_id = recordInput.observation.runtime_agent_id || "";
  const terminalAttemptRecord = recorded.team.attempts
    .find((candidate) => candidate.attempt_id === identity.attempt_id);
  terminalAttemptRecord.launch_state = "actor-observed";
  terminalAttemptRecord.launch_state_observation_id = recordInput.observationId;
  terminalAttemptRecord.launch_state_updated_at = recordInput.now;
  return {
    ...recorded,
    result: { ...recorded.result, claim: JSON.parse(JSON.stringify(terminalClaim)) },
  };
}

function runObserveAttempt(parsed, options = {}) {
  const { clock, environment, paths } = commandOptions(options);
  const taskFile = requireTaskFile(paths.tasksDir, parsed.taskId);
  validateTaskFile(taskFile);
  readJsonObject(taskStateFile(paths, parsed.taskId));
  const currentState = authoritativeTaskState(paths, parsed.taskId);
  const existingTeam = requireV2Team(paths, parsed.taskId, currentState);
  if (parsed.observerAction === "run") {
    assertCurrentExecuteTeamAuthorityIdentity(existingTeam, currentState);
  } else {
    assertCurrentExecuteTeamAuthority(
      existingTeam, currentState, clock, environment, paths, parsed.taskId,
      { requireUnexpired: false },
    );
  }
  const attempt = (existingTeam.attempts || []).find((item) => item.attempt_id === parsed.attemptId);
  if (!attempt) throw new CommandError(`unknown attempt: ${parsed.attemptId}`);
  const operationId = `${parsed.operationId}-observation`;
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
  let launchIdentity = null;
  let reconciliationOnly = false;
  if (parsed.observerAction === "run") {
    launchIdentity = durableObserveLaunchIdentity(existingTeam, parsed, attempt, args)
      || observeLaunchClaimIdentity(parsed, existingTeam, attempt, args);
    const durableClaim = (existingTeam.observer_launch_claims || [])
      .find((candidate) => candidate.operation_id === parsed.operationId);
    if (durableClaim) {
      if (durableClaim.status === "in_progress") {
        reconciliationOnly = true;
      } else if (durableClaim.status !== "terminal") {
        throw new CommandError(
          `Paseo launch claim requires controller recovery and cannot be replayed: ${durableClaim.status}`,
        );
      }
    }
  }
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
    if (launchIdentity) {
      const claim = matchingObserveLaunchClaim(existingTeam, launchIdentity, {
        ignoreAttemptStatus: true,
      });
      if (!claim || claim.status !== "terminal"
        || claim.observation_id !== parsed.observationId) {
        throw new CommandError(`Paseo launch terminal receipt is incomplete: ${parsed.operationId}`);
      }
    }
    return {
      exitCode: 0,
      lines: controlResultLines(parsed.taskId, "attempt-observe", existingOperation.result),
    };
  }
  if (launchIdentity && !reconciliationOnly) {
    if (options.beforeObserveLaunchClaim) options.beforeObserveLaunchClaim();
    const claimed = mutateV2Team(parsed.taskId, (team, now) => (
      appendObserveLaunchClaim(team, parsed, args, launchIdentity, now)
    ), {
      ...options,
      clock,
      environment,
      paths,
      operationId: launchIdentity.claim_operation_id,
      operationData: launchIdentity,
      eventKind: "team.attempt.observation.launch.claimed",
      requireCurrentDecisions: true,
      requireDoingTask: true,
      requireUnexpiredAuthority: true,
      replayPostcondition: launchIdentity.grant_id
        ? authorityReplayPostcondition({
          clock,
          evidenceEpoch: launchIdentity.evidence_epoch,
          grantId: launchIdentity.grant_id,
          requireUnexpired: false,
          scopeDigest: launchIdentity.scope_digest,
          sliceId: launchIdentity.slice_id,
          teamRunId: launchIdentity.team_run_id,
        })
        : options.replayPostcondition,
    });
    if (claimed.replay) {
      reconciliationOnly = true;
      const replayedIdentity = durableObserveLaunchClaimIdentity(claimed.result.claim || {});
      if (canonicalJson(replayedIdentity) !== canonicalJson(launchIdentity)) {
        throw new CommandError(`operation_id replay payload conflict: ${parsed.operationId}`);
      }
      launchIdentity = replayedIdentity;
    }
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
    } else if (!reconciliationOnly && reconciliation.status === "missing") {
      const launchEvents = readAuthoritativeEvents(
        taskEventFile(paths, parsed.taskId),
        parsed.taskId,
      );
      const launchState = launchEvents.at(-1).projection.state;
      const launchTeam = requireV2Team(paths, parsed.taskId, launchState);
      if (launchTeam.team_run_id !== existingTeam.team_run_id) {
        throw new CommandError("Team generation changed before Paseo actor launch");
      }
      assertTeamDecisionFresh(launchEvents, parsed.taskId, launchTeam, launchState);
      observed = observer("run", args, observerOptions);
    } else {
      const reconciliationUuid = crypto.randomUUID();
      const reconciliationOperationId =
        `${parsed.operationId}-launch-reconcile-${reconciliationUuid}`;
      const reconciliationObservationId =
        `${parsed.observationId}-reconcile-${reconciliationUuid}`;
      const reconciliationObservation = {
        ...listed.observation,
        action: "ls",
        actor_created: false,
        runtime_agent_id: "",
        reconciliation_status: reconciliation.status,
        attempt_id: attempt.attempt_id,
        launch_operation_id: attempt.launch_operation_id,
        launch_request_digest: launchIdentity.request_digest,
      };
      Object.assign(
        reconciliationObservation,
        classifyPaseoObservation(reconciliationObservation),
      );
      mutateV2Team(parsed.taskId, (team, now) => recordLaunchReconciliation(team, {
        operationId: reconciliationOperationId,
        claimOperationId: launchIdentity.claim_operation_id,
        attemptId: launchIdentity.attempt_id,
        launchOperationId: launchIdentity.launch_operation_id,
        observationId: reconciliationObservationId,
        observation: reconciliationObservation,
        reconciliationStatus: reconciliation.status,
        now,
      }), {
        ...options,
        clock,
        environment,
        paths,
        operationId: reconciliationOperationId,
        operationData: {
          taskId: parsed.taskId,
          claimOperationId: launchIdentity.claim_operation_id,
          attemptId: launchIdentity.attempt_id,
          launchOperationId: launchIdentity.launch_operation_id,
          observationId: reconciliationObservationId,
          reconciliationStatus: reconciliation.status,
          observation: reconciliationObservation,
        },
        eventKind: "team.attempt.observation.launch.reconciled",
        factualAuthorityReceipt: true,
        requireUnexpiredAuthority: false,
      });
      throw new CommandError(
        `Paseo launch reconciliation is ${reconciliation.status}; no actor was launched and ` +
          "the writer lease remains held in launch-state-unknown. Retry the same observe " +
          "operation for ls-only reconciliation, or use team-attempt-record " +
          "--action=resolve-launch with controller authority and canonical evidence",
      );
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
    ...(launchIdentity ? { launch_request_digest: launchIdentity.request_digest } : {}),
  };
  Object.assign(observation, classifyPaseoObservation(observation));
  const output = mutateV2Team(parsed.taskId, (team, now) => {
    const recordInput = {
      operationId,
      observationId: parsed.observationId,
      observation,
      now,
    };
    return launchIdentity
      ? terminalizeObserveLaunchClaim(team, launchIdentity, recordInput)
      : recordObservation(team, recordInput);
  }, {
    ...options,
    clock,
    environment,
    paths,
    operationId,
    operationData: {
      taskId: parsed.taskId,
      operationId,
      attemptId: parsed.attemptId,
      observationId: parsed.observationId,
      observerAction: parsed.observerAction,
      observerArgsJson: parsed.observerArgsJson || "",
      observation,
      ...(launchIdentity ? {
        claimOperationId: launchIdentity.claim_operation_id,
        requestDigest: launchIdentity.request_digest,
      } : {}),
    },
    eventKind: "team.attempt.observed",
    factualAuthorityReceipt: Boolean(launchIdentity),
    requireUnexpiredAuthority: false,
    replayPostcondition: launchIdentity ? (() => null) : options.replayPostcondition,
  });
  return { exitCode: 0, lines: controlResultLines(parsed.taskId, "attempt-observe", output.result) };
}

function runAttemptRecord(parsed, options = {}) {
  if (parsed.action === "observe") return runObserveAttempt(parsed, options);
  const { clock, environment, paths } = commandOptions(options);
  if (parsed.action === "reserve") {
    const latest = readAuthoritativeEvents(taskEventFile(paths, parsed.taskId), parsed.taskId).at(-1);
    const sliceId = latest?.projection?.state?.active_team?.slice_id;
    if (sliceId) {
      enforceFirstCodeBoundary(paths, parsed.taskId, sliceId, {
        clock,
        environment,
        operationId: parsed.operationId,
      });
    }
  }
  let evidenceRefs = commaList(parsed.evidenceRefs);
  if (new Set(["quiesced", "resolve-launch"]).has(parsed.action)
    && evidenceRefs.length > 0) {
    const label = parsed.action === "resolve-launch"
      ? "observer launch resolution evidence"
      : "quiescence evidence";
    evidenceRefs = canonicalEvidenceRefs(paths, parsed.taskId, evidenceRefs, label);
  }
  if (parsed.action === "resolve-launch") {
    validateReason(parsed.reason, "observer launch resolution reason");
    validateReason(parsed.authorityRef, "observer launch resolution authority ref");
    if (!CONTROLLER_AUTHORITY_REF.test(parsed.authorityRef)) {
      throw new CommandError(
        "observer launch resolution requires a controller-recordable user-message: or operator-input: ref",
      );
    }
    if (parsed.disposition !== "no-actor-confirmed") {
      throw new CommandError("observer launch resolution only accepts no-actor-confirmed");
    }
  }
  let resolutionEvidenceGuard = null;
  if (parsed.action === "resolve-launch") {
    resolutionEvidenceGuard = () => {
      const current = canonicalEvidenceRefs(
        paths,
        parsed.taskId,
        evidenceRefs,
        "observer launch resolution evidence",
      );
      if (canonicalJson(current) !== canonicalJson(evidenceRefs)) {
        throw new CommandError("observer launch resolution evidence changed before event append");
      }
    };
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
    } else if (parsed.action === "resolve-launch") {
      transitioned = resolveLaunchClaim(initialTeam, {
        ...parsed,
        evidenceRefs,
        now,
      });
    } else {
      throw new CommandError(ATTEMPT_USAGE);
    }
    return transitioned;
  }, {
    ...options,
    clock,
    environment,
    paths,
    operationId: parsed.operationId,
    operationData: { ...parsed, evidenceRefs },
    eventKind: `team.attempt.${parsed.action}`,
    requireDoingTask: parsed.action === "reserve",
    requireCurrentDecisions: parsed.action === "reserve",
    requireExecutableFirstCode: parsed.action === "reserve",
    requireUnexpiredAuthority: parsed.action === "reserve",
    factualAuthorityReceipt: parsed.action === "resolve-launch",
    replayPostcondition: parsed.action === "resolve-launch"
      ? () => null
      : options.replayPostcondition,
    beforeEventAppend(event) {
      if (options.beforeEventAppend) options.beforeEventAppend(event);
      if (resolutionEvidenceGuard) resolutionEvidenceGuard(event);
    },
  });
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
  }), {
    ...options,
    operationId: parsed.operationId,
    operationData: { ...parsed, evidenceRefs },
    eventKind: "team.attempt.fallback",
    requireCurrentDecisions: true,
    requireDoingTask: true,
    requireUnexpiredAuthority: true,
  });
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
  let committed;
  let authorityGuard = null;
  withLock(globalAdmissionLockFile(paths), () => {
    committed = mutateTaskRuntime(
      paths,
      parsed.taskId,
      {
        kind: "team.finalized",
        operationId: options.operationId,
        data: {
          backend: parsed.backend,
          status: parsed.status,
          round_file: path.resolve(parsed.roundFile),
          decision_file: path.resolve(parsed.decisionFile),
          staffing_file: path.resolve(parsed.staffingFile),
        },
      },
      ({ currentProjection, events, occurredAt }) => {
        const eventClock = () => new Date(occurredAt);
        const currentState = currentProjection.state;
        const currentTeam = currentState.active_team && typeof currentState.active_team === "object"
          ? JSON.parse(JSON.stringify(currentState.active_team))
          : {};
        if (parsed.status === "complete") {
          const decisionControl = assertDecisionReadyFromEvents(events, parsed.taskId);
          if (currentTeam.schema_version !== 2 && decisionControl.has_records) {
            throw new CommandError(
              "legacy Team finalization cannot prove a current decision snapshot; start a v2 generation",
            );
          }
          if (currentTeam.schema_version === 2) {
            assertTeamDecisionFresh(events, parsed.taskId, currentTeam, currentState);
          }
        }
        if (currentTeam.schema_version === 2) {
          assertCurrentExecuteTeamAuthority(
            currentTeam, currentState, clock, environment, paths, parsed.taskId,
          );
          authorityGuard = () => assertCurrentExecuteTeamAuthority(
            currentTeam, currentState, clock, environment, paths, parsed.taskId,
          );
          const output = finalizeV2Transition(parsed, { clock: eventClock, paths }, currentTeam);
          validateTeamWriterAdmission(paths, parsed.taskId, output.team);
          return {
            projection: {
              ...buildTeamProjection(paths, parsed.taskId, output.team, eventClock, currentState),
              files: output.files,
            },
            result: output.result,
            legacy: output.legacy,
          };
        }
        validateBackend(parsed.backend);
        const taskFile = requireTaskFile(paths.tasksDir, parsed.taskId);
        validateTaskFile(taskFile);
        if (getTaskField(taskFile, "active_team_backend") !== parsed.backend
          || getTaskField(taskFile, "active_team_status") !== "running") {
          throw new CommandError(
            `team-record-finalize requires an active ${parsed.backend} team record in running status`,
          );
        }
        const roundAbsolute = validateTeamArtifact(
          paths, parsed.taskId, "team round", parsed.roundFile, parsed.backend,
        );
        const decisionAbsolute = validateTeamArtifact(
          paths, parsed.taskId, "team decision", parsed.decisionFile, parsed.backend,
        );
        const staffingAbsolute = validateTeamArtifact(
          paths, parsed.taskId, "team staffing", parsed.staffingFile, parsed.backend,
        );
        const round = relativeToCodeHome(paths, roundAbsolute);
        const decision = relativeToCodeHome(paths, decisionAbsolute);
        const staffing = relativeToCodeHome(paths, staffingAbsolute);
        const mode = getTaskField(taskFile, "active_team_mode");
      const currentFile = requireTaskFile(paths.tasksDir, parsed.taskId);
      validateTaskFile(currentFile);
      const taskContent = renderTaskFields(fs.readFileSync(currentFile, "utf8"), {
        active_team_backend: parsed.backend,
        active_team_status: parsed.status,
        active_team_decision: decision,
      });
      const state = projectTaskState(
        paths,
        parsed.taskId,
        taskContent,
        currentState,
        eventClock,
      );
      state.active_team = {
        ...(state.active_team || {}),
        backend: parsed.backend,
        mode,
        status: parsed.status,
        decision,
        round_file: round,
        staffing,
        temp_dir: "",
      };
      return {
        projection: { task_content: taskContent, state },
        result: { effective_backend: parsed.backend, sidecar: false },
        legacy: [{
          kind: "team-record-finalize",
          detail: `${parsed.backend}/${parsed.status} round=${round}`,
        }],
      };
      },
      {
        ...options,
        ...writerLeaseControlHooks(paths, parsed.taskId, {
          ...options,
          beforeEventAppend(event) {
            if (options.beforeEventAppend) options.beforeEventAppend(event);
            if (authorityGuard) authorityGuard(event);
          },
        }),
        clock,
        environment,
        replayPostcondition: (context) => {
          if (parsed.status === "complete") {
            const replayTeam = context.existing.projection?.state?.active_team || {};
            assertTeamDecisionFresh(
              context.events,
              parsed.taskId,
              replayTeam,
              context.latest?.projection?.state || {},
            );
          }
          const postcondition = options.replayPostcondition
            || authoritySensitiveTeamReplayPostcondition(
              clock, environment, paths, parsed.taskId,
            );
          return postcondition(context);
        },
      },
    );
  });
  const effectiveBackend = committed.result.effective_backend || parsed.backend;
  const lines = [
    `task_id: ${parsed.taskId}`,
    `backend: ${effectiveBackend}`,
    `status: ${parsed.status}`,
    `decision: ${parsed.decisionFile}`,
    `staffing: ${parsed.staffingFile}`,
    `round: ${parsed.roundFile}`,
  ];
  if (committed.result.sidecar) {
    lines.push(`sidecar: ${path.join(teamDir(paths, parsed.taskId), "backend-v2.json")}`);
  }
  return {
    exitCode: 0,
    lines,
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

function finalizeV2Transition(parsed, context, team) {
  const { clock, paths } = context;
  const sidecarFile = path.join(teamDir(paths, parsed.taskId), "backend-v2.json");
  if (!new Set(["running", "promoted:execute", "promoted:worktree"]).has(team.status)) {
      throw new CommandError("team-record-finalize requires an active v2 team record in running status");
  }
    const roundAbsolute = validateExistingTeamArtifactPath(paths, parsed.taskId, "team round", parsed.roundFile);
    const decisionAbsolute = validateExistingTeamArtifactPath(paths, parsed.taskId, "team decision", parsed.decisionFile);
    const staffingAbsolute = validateExistingTeamArtifactPath(paths, parsed.taskId, "team staffing", parsed.staffingFile);
    assertTeamControlPlaneClosed(team, "team-record-finalize");
    deriveTeam(team);
    const effectiveBackend = team.effective_backend;
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
    team.backend_sidecar = relativeToCodeHome(paths, sidecarFile);
    return {
      team,
      files: [{
        path: "team/backend-v2.json",
        content_base64: Buffer.from(`${JSON.stringify(sidecar, null, 2)}\n`).toString("base64"),
      }],
      result: {
        effective_backend: effectiveBackend,
        round_file: team.round_file,
        sidecar: true,
      },
      legacy: [{
        kind: "team-record-finalize",
        detail: `${effectiveBackend}/${parsed.status} round=${team.round_file}`,
      }],
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
  let committed;
  let authorityGuard = null;
  withLock(globalAdmissionLockFile(paths), () => {
    committed = mutateTaskRuntime(
      paths,
      parsed.taskId,
      {
        kind: "team.loop.recorded",
        operationId: options.operationId,
        data: {
          backend: parsed.backend,
          status: parsed.status,
          loop_file: path.resolve(parsed.loopFile),
          iterations: Number(parsed.iterations),
          max_iterations: parsed.maxIterations ? Number(parsed.maxIterations) : null,
          max_time: parsed.maxTime || "",
        },
      },
      ({ currentProjection, occurredAt }) => {
        const eventClock = () => new Date(occurredAt);
        const currentState = currentProjection.state;
        const currentTeam = currentState.active_team && typeof currentState.active_team === "object"
          ? JSON.parse(JSON.stringify(currentState.active_team))
          : {};
        if (currentTeam.schema_version === 2) {
          assertCurrentExecuteTeamAuthority(
            currentTeam, currentState, clock, environment, paths, parsed.taskId,
          );
          authorityGuard = () => assertCurrentExecuteTeamAuthority(
            currentTeam, currentState, clock, environment, paths, parsed.taskId,
          );
          const output = loopV2Transition(parsed, { clock: eventClock, paths }, currentTeam);
          validateTeamWriterAdmission(paths, parsed.taskId, output.team);
          return {
            projection: buildTeamProjection(paths, parsed.taskId, output.team, eventClock, currentState),
            result: output.result,
            legacy: output.legacy,
          };
        }
        validateBackend(parsed.backend);
        const taskFile = requireTaskFile(paths.tasksDir, parsed.taskId);
        validateTaskFile(taskFile);
        if (getTaskField(taskFile, "active_team_backend") !== parsed.backend) {
          throw new CommandError(`team-loop-record requires a ${parsed.backend} team record`);
        }
        const loopAbsolute = validateTeamArtifact(
          paths, parsed.taskId, "team loop", parsed.loopFile, parsed.backend,
        );
        const decision = relativeToCodeHome(paths, teamDecisionFile(paths, parsed.taskId));
        const staffing = relativeToCodeHome(paths, teamStaffingFile(paths, parsed.taskId));
        const loop = relativeToCodeHome(paths, loopAbsolute);
        const mode = getTaskField(taskFile, "active_team_mode") || "execute";
      const currentFile = requireTaskFile(paths.tasksDir, parsed.taskId);
      validateTaskFile(currentFile);
      const taskContent = renderTaskFields(fs.readFileSync(currentFile, "utf8"), {
        active_team_backend: parsed.backend,
        active_team_mode: mode,
        active_team_status: parsed.status,
        active_team_decision: decision,
      });
      const nextState = projectTaskState(
        paths,
        parsed.taskId,
        taskContent,
        currentState,
        eventClock,
      );
      const nextLoop = {
        ...((nextState.active_team || {}).loop || {}),
        status: parsed.status,
        file: loop,
        iteration: Number(parsed.iterations),
      };
      if (parsed.maxIterations) nextLoop.max_iterations = Number(parsed.maxIterations);
      if (parsed.maxTime) nextLoop.max_time = parsed.maxTime;
      nextState.active_team = {
        ...(nextState.active_team || {}),
        backend: parsed.backend,
        mode,
        status: parsed.status,
        decision,
        staffing,
        loop: nextLoop,
      };
      return {
        projection: { task_content: taskContent, state: nextState },
        result: { effective_backend: parsed.backend },
        legacy: [{
          kind: "team-loop-record",
          detail: `${parsed.backend}/${parsed.status} loop=${loop} iterations=${parsed.iterations}`,
        }],
      };
      },
      {
        ...options,
        ...writerLeaseControlHooks(paths, parsed.taskId, {
          ...options,
          beforeEventAppend(event) {
            if (options.beforeEventAppend) options.beforeEventAppend(event);
            if (authorityGuard) authorityGuard(event);
          },
        }),
        clock,
        environment,
        replayPostcondition: options.replayPostcondition
          || authoritySensitiveTeamReplayPostcondition(
            clock, environment, paths, parsed.taskId,
          ),
      },
    );
  });
  return {
    exitCode: 0,
    lines: [
      `task_id: ${parsed.taskId}`,
      `backend: ${committed.result.effective_backend || parsed.backend}`,
      `status: ${parsed.status}`,
      `loop: ${parsed.loopFile}`,
      `iterations: ${parsed.iterations}`,
    ],
  };
}

function loopV2Transition(parsed, context, team) {
  const { clock, paths } = context;
  if (!new Set(["running", "promoted:execute", "promoted:worktree"]).has(team.status)) {
      throw new CommandError("team-loop-record requires an active v2 team record in running status");
  }
    assertTeamControlPlaneClosed(team, "team-loop-record");
    deriveTeam(team);
    const effective = team.effective_backend;
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
    return {
      team,
      result: { effective_backend: effective },
      legacy: [{
        kind: "team-loop-record",
        detail: `${effective}/${parsed.status} loop=${team.loop.file} iterations=${parsed.iterations}`,
      }],
    };
}

function displayValue(value) {
  return value === undefined || value === null ? "" : String(value);
}

function runStatus(argv, options = {}) {
  if (argv.length !== 1) {
    throw new CommandError(STATUS_USAGE);
  }
  const { paths } = commandOptions(options);
  const taskFile = requireTaskFile(paths.tasksDir, argv[0]);
  validateTaskFile(taskFile);
  const state = authoritativeTaskState(paths, argv[0]);
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
    const pendingLaunchClaims = (team.observer_launch_claims || [])
      .filter((claim) => claim.status === "in_progress");
    const indeterminateLaunchClaims = (team.observer_launch_claims || [])
      .filter((claim) => claim.status === "indeterminate");
    const pendingLaunchStates = pendingLaunchClaims.map((claim) => {
      const attempt = (team.attempts || [])
        .find((candidate) => candidate.attempt_id === claim.attempt_id);
      return `${claim.attempt_id}:${claim.claim_operation_id}:` +
        `${attempt?.launch_state || "claim-in-progress"}`;
    });
    const launchRecovery = pendingLaunchClaims.map((claim) => (
      `codex-workflow team-attempt-record ${argv[0]} --operation-id=<new-id> ` +
      `--action=resolve-launch --attempt=${claim.attempt_id} ` +
      `--claim-operation-id=${claim.claim_operation_id} ` +
      `--launch-operation-id=${claim.launch_operation_id} ` +
      "--disposition=no-actor-confirmed " +
      "--authority-ref=<user-message:...|operator-input:...> " +
      "--reason=<single-line> --evidence-refs=<task-artifact-relative-file>"
    ));
    launchRecovery.push(...indeterminateLaunchClaims.map((claim) => (
      `codex-workflow team-attempt-record ${argv[0]} --operation-id=<new-id> ` +
      `--action=quiesced --attempt=${claim.attempt_id} ` +
      "--evidence-refs=<task-artifact-relative-file>"
    )));
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
      ["team_observer_launch_claims_pending", pendingLaunchStates.join(",")],
      ["team_observer_launch_claims_indeterminate", indeterminateLaunchClaims
        .map((claim) => `${claim.attempt_id}:${claim.claim_operation_id}`).join(",")],
      ["team_observer_launch_recovery", launchRecovery.join(" | ")],
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
  const taskFile = requireTaskFile(paths.tasksDir, argv[0]);
  validateTaskFile(taskFile);
  const decision = relativeToCodeHome(paths, teamDecisionFile(paths, argv[0]));
  let authorityGuard = null;
  withLock(globalAdmissionLockFile(paths), () => mutateTaskRuntime(
    paths,
    argv[0],
    {
      kind: "team.stopped",
      operationId: options.operationId,
      data: { status: "stopped" },
    },
    ({ currentProjection, occurredAt }) => {
      const eventClock = () => new Date(occurredAt);
      const currentState = currentProjection.state;
      const team = currentState.active_team && typeof currentState.active_team === "object"
        ? JSON.parse(JSON.stringify(currentState.active_team))
        : {};
      if (team.schema_version === 2) {
      assertCurrentExecuteTeamAuthority(team, currentState, clock, environment, paths, argv[0]);
      authorityGuard = () => assertCurrentExecuteTeamAuthority(
        team, currentState, clock, environment, paths, argv[0],
      );
      if (!new Set(["running", "promoted:execute", "promoted:worktree"]).has(team.status)) {
        throw new CommandError(`team run is not mutable: ${team.status}`);
      }
      assertTeamControlPlaneClosed(team, "team-stop");
      team.status = "stopped";
      team.decision = decision;
        validateTeamWriterAdmission(paths, argv[0], team);
        return {
          projection: buildTeamProjection(paths, argv[0], team, eventClock, currentState),
          legacy: [{ kind: "team-stop", detail: "stopped" }],
        };
      }
      const currentFile = requireTaskFile(paths.tasksDir, argv[0]);
      validateTaskFile(currentFile);
      const taskContent = renderTaskFields(fs.readFileSync(currentFile, "utf8"), {
        active_team_status: "stopped",
        active_team_decision: decision,
      });
      const nextState = projectTaskState(
        paths,
        argv[0],
        taskContent,
        currentState,
        eventClock,
      );
      nextState.active_team = {
        ...(nextState.active_team || {}),
        status: "stopped",
        decision,
      };
      return {
        projection: { task_content: taskContent, state: nextState },
        legacy: [{ kind: "team-stop", detail: "stopped" }],
      };
    },
    {
      ...options,
      ...writerLeaseControlHooks(paths, argv[0], {
        ...options,
        beforeEventAppend(event) {
          if (options.beforeEventAppend) options.beforeEventAppend(event);
          if (authorityGuard) authorityGuard(event);
        },
      }),
      clock,
      environment,
      replayPostcondition: options.replayPostcondition
        || authoritySensitiveTeamReplayPostcondition(clock, environment, paths, argv[0]),
    },
  ));
  return { exitCode: 0, lines: [`task_id: ${argv[0]}`, "status: stopped"] };
}

function runPromote(parsed, options = {}) {
  validateExecutionAuthorization(
    parsed.target,
    parsed.authorizationRef,
    parsed.grantId,
    parsed.scopeDigest,
  );
  const { clock, cwd, environment, paths } = commandOptions(options);
  const decisionFile = teamDecisionFile(paths, parsed.taskId);
  const decision = relativeToCodeHome(paths, decisionFile);
  let replayed = false;
  let committed;
  let scopeGuard = null;
  const operationId = parsed.operationId || options.operationId;
  withLock(globalAdmissionLockFile(paths), () => {
    const requestIdentity = parsed.target === "execute"
      ? briefRequestIdentity(parsed.briefPath)
      : briefRequestIdentity("");
    try {
      committed = mutateTaskRuntime(
        paths,
        parsed.taskId,
        {
          kind: "team.promoted",
          operationId,
          data: {
            target: parsed.target,
            authorization_ref: parsed.authorizationRef || "",
            grant_id: parsed.grantId || "",
            scope_digest: parsed.scopeDigest || "",
            ...requestIdentity,
          },
        },
        ({ currentProjection, events, occurredAt, revision }) => {
          const eventClock = () => new Date(occurredAt);
          const state = JSON.parse(JSON.stringify(currentProjection.state));
          const decisionControl = assertDecisionReadyFromEvents(events, parsed.taskId);
          assertPromptBundleDecisionSnapshot(paths, parsed.taskId, decisionControl);
          if (parsed.target === "execute" && state.status !== "doing") {
            throw new CommandError("execute Team promotion requires a doing task");
          }
          const activeTeam = state.active_team && typeof state.active_team === "object"
            ? state.active_team
            : {};
          if (activeTeam.schema_version === 2) {
            assertTeamDecisionFresh(events, parsed.taskId, activeTeam, state);
          } else if (decisionControl.has_records) {
            throw new CommandError(
              "legacy Team promotion cannot prove a current decision snapshot; start a v2 generation",
            );
          }
          if (new Set(["execute", "finish"]).has(parsed.target)) {
            const pendingLaunchClaims = (activeTeam.observer_launch_claims || [])
              .filter((claim) => claim.status === "in_progress");
            if (pendingLaunchClaims.length > 0) {
              throw new CommandError(
                `team ${parsed.target} promotion is blocked by in-progress observer launch claims: ${pendingLaunchClaims.map((claim) => claim.attempt_id).join(", ")}`,
              );
            }
          }
          if (parsed.target === "finish") {
            assertTeamControlPlaneClosed(activeTeam, "team finish promotion");
          }
          if (parsed.target !== "execute" && activeTeam.schema_version === 2
            && activeTeam.mode === "execute") {
            assertCurrentExecuteTeamAuthority(
              activeTeam, state, clock, environment, paths, parsed.taskId,
            );
            scopeGuard = () => assertCurrentExecuteTeamAuthority(
              activeTeam, state, clock, environment, paths, parsed.taskId,
            );
          }
          const admission = parsed.target === "execute" ? admitTeamStart({
            authorizationRef: parsed.authorizationRef,
            briefPath: parsed.briefPath,
            captureIdentity: options.captureIdentity,
            clock: eventClock,
            currentState: state,
            cwd,
            environment,
            expectedGrantId: parsed.grantId,
            expectedScopeDigest: parsed.scopeDigest,
            mode: "execute",
            paths,
            taskId: parsed.taskId,
          }) : null;
          if (admission) {
            assertAdmissionRequestIdentity(admission, requestIdentity);
            admission.slice_start_snapshot.captured_at_revision = revision + 1;
          }
          const taskFile = requireTaskFile(paths.tasksDir, parsed.taskId);
          validateTaskFile(taskFile);
          if (activeTeam.schema_version === 2
            && !new Set(["running", "promoted:execute", "promoted:worktree"])
              .has(activeTeam.status)) {
            throw new CommandError(`team run is not mutable: ${activeTeam.status}`);
          }
          const mode = parsed.target === "execute"
            ? "execute"
            : activeTeam.schema_version === 2
              ? activeTeam.mode
              : getTaskField(taskFile, "active_team_mode");
          const status = `promoted:${parsed.target}`;
          const promotedTeam = {
            ...activeTeam,
            mode,
            status,
            promoted_to: parsed.target,
            decision,
          };
          if (parsed.target === "execute") {
            promotedTeam.objective = admission.canonical_objective;
            promotedTeam.authorization_ref = assertActiveExecutionGrant(state).authorization_provenance.ref;
            promotedTeam.admission = admission;
            promotedTeam.admitted_owned_paths = admission.admitted_owned_paths;
            promotedTeam.slice_id = admission.brief.slice_id;
            promotedTeam.grant_id = admission.grant_id;
            promotedTeam.scope_digest = admission.scope_digest;
            promotedTeam.evidence_epoch = admission.evidence_epoch;
            promotedTeam.execution_operation_id = operationId || "";
            const grant = assertActiveExecutionGrant(state, {
              grantId: admission.grant_id,
              scopeDigest: admission.scope_digest,
            });
            assertExecutionGrantDecisionFresh(state, decisionControl);
            scopeGuard = () => {
              const rebuilt = buildCanonicalScope({
                authorizationRef: grant.authorization_provenance.ref,
                briefPath: parsed.briefPath,
                cwd,
                environment,
                evidencePolicy: grant.scope.evidence_policy,
                grantId: grant.grant_id,
                objective: grant.scope.objective,
                parent: grant.scope.parent,
                paths,
                requireObjectiveMatchesSelected: false,
                taskId: parsed.taskId,
              });
              if (rebuilt.scopeDigest !== grant.scope_digest) {
                throw new CommandError("Team scope artifacts changed before promotion event append");
              }
            };
          }
          validateTeamWriterAdmission(paths, parsed.taskId, promotedTeam);
          const authorizationLines = parsed.target === "execute"
            ? `- authorization_ref: ${parsed.authorizationRef}\n` +
              `- brief: ${admission.brief.path}\n` +
              `- operation_id: ${operationId}\n`
            : "";
          const promotionBlock =
            `\n## Promotion\n\n- promoted_to: ${parsed.target}\n${authorizationLines}` +
            `- created_at: ${timestampSeconds(eventClock)}\n`;
          const projectionFile = {
            path: "team/decision.md",
            content_base64: Buffer.from(
              `${fs.existsSync(decisionFile) ? fs.readFileSync(decisionFile, "utf8") : ""}${promotionBlock}`,
            ).toString("base64"),
          };
          let projection;
          if (activeTeam.schema_version === 2) {
            projection = {
              ...buildTeamProjection(
                paths,
                parsed.taskId,
                promotedTeam,
                eventClock,
                state,
                currentProjection.task_content,
              ),
              files: [projectionFile],
            };
          } else {
            const taskContent = renderTaskFields(currentProjection.task_content, {
              active_team_mode: mode,
              active_team_status: status,
              active_team_decision: decision,
            });
            const nextState = projectTaskState(paths, parsed.taskId, taskContent, state, eventClock);
            nextState.active_team = promotedTeam;
            projection = {
              task_content: taskContent,
              state: nextState,
              files: [projectionFile],
            };
          }
          return {
            projection,
            result: { team: promotedTeam },
            legacy: [{ kind: "team-promote", detail: parsed.target }],
          };
        },
        {
          ...options,
          ...writerLeaseControlHooks(paths, parsed.taskId, {
            ...options,
            beforeEventAppend(event) {
              if (options.beforeEventAppend) options.beforeEventAppend(event);
              if (scopeGuard) scopeGuard(event);
            },
          }),
          clock,
          environment,
          replayPostcondition: (context) => {
            const replayTeam = context.existing.result?.team
              || context.existing.projection?.state?.active_team;
            const currentDecisions = assertTeamDecisionFresh(
              context.events,
              parsed.taskId,
              replayTeam,
              context.latest?.projection?.state || {},
            );
            assertPromptBundleDecisionSnapshot(paths, parsed.taskId, currentDecisions);
            if (parsed.target !== "execute") {
              const postcondition = options.replayPostcondition
                || authoritySensitiveTeamReplayPostcondition(
                  clock, environment, paths, parsed.taskId,
                );
              return postcondition(context);
            }
            return authorityReplayPostcondition({
              clock,
              grantId: parsed.grantId,
              requireUnexpired: true,
              scopeDigest: parsed.scopeDigest,
              validateCurrent({ grant }) {
                assertCanonicalGrantArtifacts({
                  briefPath: parsed.briefPath,
                  environment,
                  grant,
                  paths,
                  taskId: parsed.taskId,
                });
              },
            })(context);
          },
        },
      );
    } catch (error) {
      if (parsed.operationId
        && error.message === `operation_id replay payload conflict: ${parsed.operationId}`) {
        throw new CommandError(`team promotion operation_id replay conflict: ${parsed.operationId}`);
      }
      if (error.code === FIRST_CODE_STOP_CODE) {
        enforceFirstCodeBoundary(paths, parsed.taskId, error.firstCodeTarget, {
          clock,
          environment,
          operationId,
        });
      }
      throw error;
    }
  });
  replayed = committed.replay;
  const lines = [
    `task_id: ${parsed.taskId}`,
    `target: ${parsed.target}`,
    `decision: ${decisionFile}`,
  ];
  if (parsed.target === "execute") {
    lines.push(`authorization_ref: ${parsed.authorizationRef}`);
    lines.push(`brief: ${parsed.briefPath}`);
    lines.push(`operation_id: ${parsed.operationId}`);
    lines.push(`grant_id: ${parsed.grantId}`);
    lines.push(`scope_digest: ${parsed.scopeDigest}`);
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
