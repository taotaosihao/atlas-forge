"use strict";

const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");
const { sleepMilliseconds, withLock } = require("../core/lock");
const { resolvePaths, taskArtifactDirRelative } = require("../core/paths");
const { mutateTaskRuntime } = require("../core/task-mutation");
const { canonicalJson } = require("../core/event-store");
const { captureWorktreeSnapshot } = require("../core/worktree-snapshot");
const { taskIdTitleToken } = require("./id");
const {
  listTaskRecords,
  requireTaskFile,
  renderTaskFields,
  taskFile,
  validateTaskFile,
} = require("./repository");
const {
  clearCurrentTaskPointer,
  ensureTaskRuntimeScaffold,
  lifecycleEvents,
  projectTaskState,
  readJsonObject,
  successfulVerificationAdmission,
  taskStateFile,
  timestampSeconds,
  writeCurrentTaskPointer,
} = require("./runtime");
const {
  isTerminalTeamStatus,
  teamClosureIssues,
  teamControlPlaneClosureIssues,
} = require("../team/lane-registry");
const {
  assertActiveExecutionGrant,
  assertSizeExceptionValidity,
  currentGrant,
  executionHistoryRequired,
  terminalAuthorityReplayPostcondition,
  transitionAuthorityState,
} = require("../team/execution-grant");
const { assertCanonicalGrantArtifacts } = require("../team/scope-artifacts");
const { inProgressVerificationClaims } = require("../verification/required-gates");
const {
  assertDecisionReadyFromEvents,
  assertTeamDecisionFresh,
  assertVerificationDecisionFresh,
} = require("../artifact/decisions");

class TaskLifecycleError extends Error {
  constructor(message) {
    super(message);
    this.name = "TaskLifecycleError";
  }
}

function localDay(clock = () => new Date()) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("clock must return a valid date");
  }
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function validateTitle(title) {
  if (!title || /[\n\r\t]/.test(title) || /^\s*$/.test(title)) {
    throw new TaskLifecycleError("unsafe title: titles must be a single line");
  }
}

function validateReason(label, reason) {
  if (!reason || /[\n\r\t]/.test(reason) || /^\s*$/.test(reason)) {
    throw new TaskLifecycleError(
      `unsafe ${label}: reason must be a single non-empty line`,
    );
  }
}

function indeterminateRequiredVerificationClaims(state, activeGrant) {
  const claims = state.verification?.operation_claims;
  if (!Array.isArray(claims)) return [];
  return claims.filter((claim) => {
    if (claim?.status !== "indeterminate") return false;
    if (!claim.authority_identity) return true;
    if (!activeGrant) return false;
    const authority = claim.authority_identity;
    return authority.grant_id === activeGrant.grant_id
      && authority.scope_digest === activeGrant.scope_digest
      && authority.evidence_epoch === activeGrant.evidence_epoch
      && (activeGrant.scope?.required_slices || [])
        .some((slice) => slice.slice_id === authority.slice_id);
  });
}

function assertNoIndeterminateRequiredVerification(state, activeGrant) {
  const claims = indeterminateRequiredVerificationClaims(state, activeGrant);
  if (claims.length === 0) return;
  throw new TaskLifecycleError(
    "successful completion is blocked by indeterminate verification in the current " +
      "authority epoch: " + claims.map((claim) => {
        const checkId = claim.required_check_binding?.check_id || "unknown-check";
        return `${claim.operation_id}/${checkId}`;
      }).join(", ") + "; explicitly replan to a new authority/evidence epoch and reverify",
  );
}

function gitOutput(repo, args, label) {
  const result = childProcess.spawnSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) {
    throw new TaskLifecycleError(
      `${label}: ${(result.stderr || result.error?.message || "git failed").trim()}`,
    );
  }
  return result.stdout.trim();
}

function finalCommitLink(state, clock, revision) {
  const completion = state.completion;
  const snapshot = completion?.outcome === "succeeded"
    ? completion.completion_snapshot
    : null;
  if (!snapshot?.repo_realpath || !snapshot.head_sha || !snapshot.tree_oid) return null;
  const current = captureWorktreeSnapshot(snapshot.repo_realpath);
  if (current.tree_oid !== snapshot.tree_oid) {
    throw new TaskLifecycleError(
      "successful execution worktree changed after completion; restore the accepted tree before archive",
    );
  }
  const committedTree = gitOutput(
    snapshot.repo_realpath,
    ["rev-parse", "--verify", `${current.head_sha}^{tree}`],
    "unable to inspect final execution commit",
  );
  if (committedTree !== snapshot.tree_oid) {
    throw new TaskLifecycleError(
      "successful execution must commit the exact accepted tree before archive",
    );
  }
  gitOutput(
    snapshot.repo_realpath,
    ["merge-base", "--is-ancestor", snapshot.head_sha, current.head_sha],
    "final execution commit must descend from the completed HEAD",
  );
  return {
    schema_version: 1,
    repo_realpath: snapshot.repo_realpath,
    head_sha: current.head_sha,
    tree_oid: current.tree_oid,
    completion_head_sha: snapshot.head_sha,
    source_completion_revision: (state.execution_authority?.grants || [])
      .findLast((grant) => grant.status === "completed")?.terminal?.revision
      || state.runtime_revision,
    linked_revision: revision + 1,
    linked_at: timestampSeconds(clock),
  };
}

function pauseFromEnvironment(environment, name) {
  if (!environment[name]) {
    return;
  }
  const milliseconds = Number(environment[name]) * 1000;
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    throw new TaskLifecycleError(`invalid test pause: ${environment[name]}`);
  }
  sleepMilliseconds(milliseconds);
}

function nextTaskId(paths, title, clock = () => new Date()) {
  const prefix = localDay(clock).replace(/-/g, "");
  const token = taskIdTitleToken(title);
  let maximum = 0;
  for (const name of fs.readdirSync(paths.tasksDir)) {
    if (!name.endsWith(".md")) {
      continue;
    }
    const match = new RegExp(`^${prefix}-(\\d+)-`).exec(name);
    if (match) {
      maximum = Math.max(maximum, Number(match[1]));
    }
  }

  let sequence = maximum + 1;
  let candidate = `${prefix}-${String(sequence).padStart(3, "0")}-${token}`;
  while (fs.existsSync(taskFile(paths.tasksDir, candidate))) {
    sequence += 1;
    candidate = `${prefix}-${String(sequence).padStart(3, "0")}-${token}`;
  }
  return candidate;
}

function renderTaskTemplate(template, values) {
  return template.replace(
    /\{\{(ID|TITLE|STATUS|CREATED|UPDATED|ARTIFACT_DIR|LAST_VERIFIED_AT|ACTIVE_TEAM_BACKEND|ACTIVE_TEAM_MODE|ACTIVE_TEAM_STATUS|ACTIVE_TEAM_DECISION|SUCCESS_CRITERIA)\}\}/g,
    (_match, key) => values[key],
  );
}

function mutationOptions(options, clock, environment) {
  return {
    clock,
    environment,
    eventId: options.eventId,
    expectedRevision: options.expectedRevision,
    failAfterEventAppend: options.failAfterEventAppend,
    failBeforeEventAppend: options.failBeforeEventAppend,
    operationId: options.operationId,
  };
}

function lifecycleLegacy(kind, data) {
  return { schema_version: 1, kind, data };
}

function currentTaskProjection(
  paths,
  taskId,
  updates,
  clock,
  mutateState = (state) => state,
  authoritativeProjection = null,
) {
  let task;
  let source;
  let currentState;
  if (authoritativeProjection) {
    task = { status: authoritativeProjection.state.status };
    source = authoritativeProjection.task_content;
    currentState = authoritativeProjection.state;
  } else {
    const file = requireTaskFile(paths.tasksDir, taskId);
    ({ task } = validateTaskFile(file));
    source = fs.readFileSync(file, "utf8");
    currentState = readJsonObject(taskStateFile(paths, taskId));
  }
  const taskContent = renderTaskFields(source, updates);
  const state = projectTaskState(
    paths,
    taskId,
    taskContent,
    currentState,
    clock,
  );
  mutateState(state);
  return { projection: { task_content: taskContent, state }, task };
}

function createTask(title, criteria, options = {}) {
  const environment = options.environment || process.env;
  const paths = options.paths || resolvePaths(environment);
  const sourceClock = options.clock || (() => new Date());
  const captured = sourceClock();
  const createdAt = captured instanceof Date ? captured : new Date(captured);
  if (Number.isNaN(createdAt.getTime())) throw new TypeError("clock must return a valid date");
  const clock = () => new Date(createdAt.getTime());
  validateTitle(title);
  if (!fs.existsSync(paths.taskTemplate)) {
    throw new TaskLifecycleError(`missing task template: ${paths.taskTemplate}`);
  }
  fs.mkdirSync(paths.tasksDir, { recursive: true });

  return withLock(paths.initTaskLockFile, () => {
    const taskId = nextTaskId(paths, title, clock);
    pauseFromEnvironment(environment, "CODEX_WORKFLOW_TEST_INIT_PAUSE_BEFORE_WRITE");
    const today = localDay(clock);
    const values = {
      ID: taskId,
      TITLE: title,
      STATUS: "todo",
      CREATED: today,
      UPDATED: today,
      ARTIFACT_DIR: taskArtifactDirRelative(paths, taskId),
      LAST_VERIFIED_AT: "",
      ACTIVE_TEAM_BACKEND: "",
      ACTIVE_TEAM_MODE: "",
      ACTIVE_TEAM_STATUS: "",
      ACTIVE_TEAM_DECISION: "",
      SUCCESS_CRITERIA: criteria,
    };
    const template = fs.readFileSync(paths.taskTemplate, "utf8");
    const taskContent = renderTaskTemplate(template, values);
    const state = projectTaskState(paths, taskId, taskContent, {}, clock);
    mutateTaskRuntime(
      paths,
      taskId,
      {
        kind: "task.created",
        operationId: options.operationId,
        data: { from: null, to: "todo" },
      },
      () => ({
        projection: { task_content: taskContent, state },
        result: { task_id: taskId },
        legacy: [lifecycleLegacy("task.created", { from: null, to: "todo" })],
      }),
      mutationOptions(options, clock, environment),
    );
    ensureTaskRuntimeScaffold(paths, taskId, title);
    return taskId;
  });
}

function startTask(taskId, options = {}) {
  const environment = options.environment || process.env;
  const paths = options.paths || resolvePaths(environment);
  const clock = options.clock || (() => new Date());
  const result = mutateTaskRuntime(
    paths,
    taskId,
    { kind: "task.started", operationId: options.operationId, data: { from: "todo", to: "doing" } },
    ({ currentProjection, occurredAt }) => {
      const eventClock = () => new Date(occurredAt);
      const { projection, task } = currentTaskProjection(
        paths, taskId, { status: "doing", updated: localDay(eventClock) }, eventClock,
        (state) => state,
        currentProjection,
      );
      if (task.status === "done") throw new TaskLifecycleError(`task already done: ${taskId}`);
      if (task.status === "doing") throw new TaskLifecycleError(`task already doing: ${taskId}`);
      if (task.status !== "todo") {
        throw new TaskLifecycleError(`task must be todo before start: ${taskId}`);
      }
      pauseFromEnvironment(environment, "CODEX_WORKFLOW_TEST_UPDATE_PAUSE_BEFORE_WRITE");
      return {
        projection,
        legacy: [lifecycleLegacy("task.started", { from: "todo", to: "doing" })],
      };
    },
    mutationOptions(options, clock, environment),
  );
  if (!result.replay || result.latest) {
    writeCurrentTaskPointer(paths, taskId, clock);
  }
  return result;
}

function blockTask(taskId, reason, options = {}) {
  validateReason("block reason", reason);
  const environment = options.environment || process.env;
  const paths = options.paths || resolvePaths(environment);
  const clock = options.clock || (() => new Date());
  const result = mutateTaskRuntime(
    paths,
    taskId,
    { kind: "task.blocked", operationId: options.operationId, data: { from: "doing", to: "blocked", reason } },
    ({ currentProjection, occurredAt }) => {
      const eventClock = () => new Date(occurredAt);
      const blockedAt = timestampSeconds(eventClock);
      const { projection, task } = currentTaskProjection(paths, taskId, {
        status: "blocked", updated: localDay(eventClock), blocked_reason: reason, blocked_at: blockedAt,
      }, eventClock, (state) => state, currentProjection);
      if (task.status !== "doing") {
        throw new TaskLifecycleError(`task must be doing before block: ${taskId}`);
      }
      const pendingVerificationClaims = inProgressVerificationClaims(currentProjection.state);
      if (pendingVerificationClaims.length > 0) {
        throw new TaskLifecycleError(
          `task block is blocked by in-progress verification claims: ${pendingVerificationClaims.map((claim) => claim.operation_id).join(", ")}`,
        );
      }
      pauseFromEnvironment(environment, "CODEX_WORKFLOW_TEST_UPDATE_PAUSE_BEFORE_WRITE");
      return {
        projection,
        legacy: [lifecycleLegacy("task.blocked", { from: "doing", to: "blocked", reason })],
      };
    },
    mutationOptions(options, clock, environment),
  );
  if (!result.replay || result.latest) {
    clearCurrentTaskPointer(paths, taskId);
  }
  return result;
}

function resumeTask(taskId, options = {}) {
  const environment = options.environment || process.env;
  const paths = options.paths || resolvePaths(environment);
  const clock = options.clock || (() => new Date());
  const result = mutateTaskRuntime(
    paths,
    taskId,
    { kind: "task.resumed", operationId: options.operationId, data: { from: "blocked", to: "doing" } },
    ({ currentProjection, occurredAt }) => {
      const eventClock = () => new Date(occurredAt);
      const resumedAt = timestampSeconds(eventClock);
      const { projection, task } = currentTaskProjection(paths, taskId, {
        status: "doing", updated: localDay(eventClock), resumed_at: resumedAt,
      }, eventClock, (state) => state, currentProjection);
      if (task.status !== "blocked") {
        throw new TaskLifecycleError(`task must be blocked before resume: ${taskId}`);
      }
      pauseFromEnvironment(environment, "CODEX_WORKFLOW_TEST_UPDATE_PAUSE_BEFORE_WRITE");
      return {
        projection,
        legacy: [lifecycleLegacy("task.resumed", { from: "blocked", to: "doing" })],
      };
    },
    mutationOptions(options, clock, environment),
  );
  if (!result.replay || result.latest) {
    writeCurrentTaskPointer(paths, taskId, clock);
  }
  return result;
}

function completeTask(
  taskId,
  {
    authorityRef = "",
    evidenceRefs = [],
    noVerifyReason = "",
    noVerifyRequested = false,
    outcome = "succeeded",
    ...options
  } = {},
) {
  if (!new Set(["succeeded", "failed", "cancelled"]).has(outcome)) {
    throw new TaskLifecycleError(`invalid completion outcome: ${outcome}`);
  }
  if (!Array.isArray(evidenceRefs)) {
    throw new TaskLifecycleError("completion evidence_refs must be an array");
  }
  if (authorityRef) {
    validateReason("completion authority ref", authorityRef);
  }
  for (const evidenceRef of evidenceRefs) {
    validateReason("completion evidence ref", evidenceRef);
  }
  if (noVerifyRequested) {
    validateReason("no-verify reason", noVerifyReason);
  }
  if (outcome === "succeeded" && noVerifyRequested) {
    throw new TaskLifecycleError("no-verify cannot complete a succeeded task");
  }
  if (outcome !== "succeeded") {
    if (!authorityRef || evidenceRefs.length === 0) {
      throw new TaskLifecycleError(
        `${outcome} completion requires authority_ref and at least one evidence_ref`,
      );
    }
  }
  const environment = options.environment || process.env;
  const paths = options.paths || resolvePaths(environment);
  const clock = options.clock || (() => new Date());
  const data = {
    from: "doing",
    to: "done",
    outcome,
    authority_ref: authorityRef,
    evidence_refs: [...evidenceRefs],
    no_verify_reason: noVerifyRequested ? noVerifyReason : "",
  };
  let completionArtifactGuard = null;
  let completionVerificationGuard = null;
  const result = mutateTaskRuntime(
    paths,
    taskId,
    { kind: "task.completion.closed", operationId: options.operationId, data },
    ({ currentProjection, events, occurredAt, revision }) => {
      const eventClock = () => new Date(occurredAt);
      const closedAt = timestampSeconds(eventClock);
      const currentState = JSON.parse(JSON.stringify(currentProjection.state));
      if (currentState.status === "done") throw new TaskLifecycleError(`task already done: ${taskId}`);
      if (currentState.status !== "doing") {
        throw new TaskLifecycleError(`task must be doing before done: ${taskId}`);
      }
      let decisionControl = null;
      if (outcome === "succeeded") {
        decisionControl = assertDecisionReadyFromEvents(events, taskId);
        const currentTeam = currentState.active_team;
        if (currentTeam?.schema_version === 2) {
          assertTeamDecisionFresh(events, taskId, currentTeam, currentState);
        }
      }
      const pendingVerificationClaims = inProgressVerificationClaims(currentState);
      if (pendingVerificationClaims.length > 0) {
        throw new TaskLifecycleError(
          `task completion is blocked by in-progress verification claims: ${pendingVerificationClaims.map((claim) => claim.operation_id).join(", ")}`,
        );
      }
      const teamIssues = teamClosureIssues(currentState.active_team, outcome);
      if (teamIssues.length > 0) throw new TaskLifecycleError(teamIssues.join("\n"));
      let activeGrant = null;
      if (currentState.execution_authority?.schema_version === 2) {
        activeGrant = assertActiveExecutionGrant(currentState);
        assertSizeExceptionValidity(activeGrant, { all: true, clock: eventClock });
        completionArtifactGuard = () => {
          assertSizeExceptionValidity(activeGrant, { all: true, clock });
          const selected = activeGrant.scope.required_slices[0];
          if (!selected) throw new TaskLifecycleError("active grant has no canonical brief");
          assertCanonicalGrantArtifacts({
            briefPath: path.join(paths.artifactsDir, taskId, selected.brief_path),
            environment,
            grant: activeGrant,
            paths,
            taskId,
          });
        };
        completionArtifactGuard();
      } else if (executionHistoryRequired(events)) {
        throw new TaskLifecycleError(
          "formal execution history requires a current active vNext grant for completion",
        );
      }
      let verification = {
        identityDigest: "", passed: outcome !== "succeeded", reasons: [], recordId: "",
      };
      if (outcome === "succeeded") {
        assertNoIndeterminateRequiredVerification(currentState, activeGrant);
        verification = successfulVerificationAdmission(paths, taskId, {
          captureIdentity: options.captureIdentity,
          environment,
          state: currentState,
        });
        if (!verification.passed) {
          throw new TaskLifecycleError(
            `task lacks successful workflow verification: ${taskId}\n` +
              `${verification.reasons.join("\n")}\n` +
              `run: codex-workflow verify ${taskId} -- <command...>`,
          );
        }
        if (!activeGrant) {
          assertVerificationDecisionFresh(events, currentState, decisionControl);
        }
      }
      pauseFromEnvironment(environment, "CODEX_WORKFLOW_TEST_UPDATE_PAUSE_BEFORE_WRITE");
      const updates = {
        status: "done",
        updated: localDay(eventClock),
        completion_outcome: outcome,
        completion_authority_ref: authorityRef || "-",
        completion_evidence_refs: evidenceRefs.length > 0 ? evidenceRefs.join(" ") : "-",
        completion_closed_at: closedAt,
      };
      if (noVerifyRequested) {
        updates.no_verify_reason = noVerifyReason;
        updates.no_verify_at = closedAt;
      }
      const taskContent = renderTaskFields(currentProjection.task_content, updates);
      const state = projectTaskState(paths, taskId, taskContent, currentState, eventClock);
      const activeTeam = state.active_team && typeof state.active_team === "object"
        ? state.active_team
        : {};
      state.completion = {
        schema_version: 1,
        outcome,
        authority_ref: authorityRef,
        evidence_refs: [...evidenceRefs],
        completion_snapshot: verification.completionSnapshot || null,
        verification_record_id: verification.recordId || "",
        verification_identity_digest: verification.identityDigest || "",
        verification_record_ids: verification.recordIds || (
          verification.recordId ? [verification.recordId] : []
        ),
        release_decision: verification.releaseDecision || null,
        grant_id: activeGrant?.grant_id || "",
        scope_digest: activeGrant?.scope_digest || "",
        evidence_epoch: activeGrant?.evidence_epoch || 0,
        team_run_id: activeTeam.team_run_id || "",
        team_generation: activeTeam.generation || 0,
        closed_at: closedAt,
      };
      if (outcome === "succeeded") {
        const admissionState = JSON.parse(JSON.stringify(currentState));
        completionVerificationGuard = (event) => {
          assertNoIndeterminateRequiredVerification(admissionState, activeGrant);
          const fresh = successfulVerificationAdmission(paths, taskId, {
            captureIdentity: options.captureIdentity,
            environment,
            state: admissionState,
          });
          if (!fresh.passed) {
            throw new TaskLifecycleError(
              "successful verification admission changed before task completion append: " +
                fresh.reasons.join("; "),
            );
          }
          const expected = {
            completion_snapshot: fresh.completionSnapshot || null,
            verification_record_id: fresh.recordId || "",
            verification_identity_digest: fresh.identityDigest || "",
            verification_record_ids: fresh.recordIds || (
              fresh.recordId ? [fresh.recordId] : []
            ),
            release_decision: fresh.releaseDecision || null,
          };
          const projectedCompletion = event.projection?.state?.completion || {};
          const actual = Object.fromEntries(
            Object.keys(expected).map((field) => [field, projectedCompletion[field]]),
          );
          if (canonicalJson(actual) !== canonicalJson(expected)) {
            throw new TaskLifecycleError(
              "successful verification admission changed before task completion append",
            );
          }
        };
      }
      let authorityTransition;
      if (activeGrant) {
        authorityTransition = {
          schema_version: 1,
          type: "grant-completed",
          revision: revision + 1,
          occurred_at: closedAt,
          old_grant_id: activeGrant.grant_id,
          old_scope_digest: activeGrant.scope_digest,
          old_evidence_epoch: activeGrant.evidence_epoch,
          outcome,
          reason: `task-completion:${outcome}`,
        };
        transitionAuthorityState(state, authorityTransition);
      }
      const legacy = [];
      if (noVerifyRequested) {
        state.verification = { ...(state.verification || {}),
          skipped: true, skip_reason: noVerifyReason, skipped_at: closedAt };
        legacy.push(lifecycleLegacy("verification.skipped", { reason: noVerifyReason }));
      }
      legacy.push(lifecycleLegacy("task.done", {
        from: "doing", to: "done", outcome, authority_ref: authorityRef,
        evidence_refs: [...evidenceRefs],
      }));
      return {
        ...(authorityTransition ? { authorityTransition } : {}),
        projection: { task_content: taskContent, state },
        result: {
          outcome,
          grant_id: activeGrant?.grant_id || "",
          scope_digest: activeGrant?.scope_digest || "",
          evidence_epoch: activeGrant?.evidence_epoch || 0,
        },
        legacy,
      };
    },
    {
      ...mutationOptions(options, clock, environment),
      beforeEventAppend(event) {
        if (options.beforeEventAppend) options.beforeEventAppend(event);
        if (completionArtifactGuard) completionArtifactGuard(event);
        if (completionVerificationGuard) completionVerificationGuard(event);
      },
      ...(options.operationId ? {
        replayPostcondition({ existing, ...context }) {
          if (existing.authority_transition) {
            return terminalAuthorityReplayPostcondition("completed")({
              existing,
              ...context,
            });
          }
          return null;
        },
      } : {}),
    },
  );
  if (!result.replay || result.latest) clearCurrentTaskPointer(paths, taskId);
  return result;
}

function archiveTask(taskId, reason, options = {}) {
  validateReason("archive reason", reason);
  const environment = options.environment || process.env;
  const paths = options.paths || resolvePaths(environment);
  const clock = options.clock || (() => new Date());
  const result = mutateTaskRuntime(
    paths,
    taskId,
    { kind: "task.archived", operationId: options.operationId, data: { reason } },
    ({ currentProjection, events, occurredAt, revision }) => {
      const eventClock = () => new Date(occurredAt);
      const archivedAt = timestampSeconds(eventClock);
      const task = { status: currentProjection.state.status };
      if (task.status === "archived") {
        throw new TaskLifecycleError(`task already archived: ${taskId}`);
      }
      const allowed = new Set(["todo", "doing", "blocked", "done"]);
      if (!allowed.has(task.status)) {
        throw new TaskLifecycleError(`task cannot be archived from ${task.status}: ${taskId}`);
      }
      const pendingVerificationClaims = inProgressVerificationClaims(currentProjection.state);
      if (pendingVerificationClaims.length > 0) {
        throw new TaskLifecycleError(
          `task archive is blocked by in-progress verification claims: ${pendingVerificationClaims.map((claim) => claim.operation_id).join(", ")}`,
        );
      }
      const pendingObserverClaims = (
        currentProjection.state.active_team?.observer_launch_claims || []
      ).filter((claim) => claim.status === "in_progress");
      if (pendingObserverClaims.length > 0) {
        throw new TaskLifecycleError(
          "task archive is blocked by in-progress observer launch claims: " +
            pendingObserverClaims.map((claim) => claim.claim_operation_id).join(", "),
        );
      }
      const activeTeam = currentProjection.state.active_team;
      if (activeTeam?.schema_version === 2) {
        const controlPlaneIssues = teamControlPlaneClosureIssues(activeTeam);
        if (!isTerminalTeamStatus(activeTeam.status) || controlPlaneIssues.length > 0) {
          throw new TaskLifecycleError(
            "task archive requires a terminal, closed v2 Team control plane: " +
              [`status=${activeTeam.status || "missing"}`, ...controlPlaneIssues].join("; "),
          );
        }
      }
      if (currentGrant(currentProjection.state.execution_authority)) {
        throw new TaskLifecycleError(
          "active execution grant must reach task completion before archive",
        );
      }
      if (executionHistoryRequired(events)) {
        const completion = currentProjection.state.completion;
        const completedGrant = (currentProjection.state.execution_authority?.grants || [])
          .find((grant) => grant.grant_id === completion?.grant_id && grant.status === "completed");
        if (task.status !== "done" || completion?.schema_version !== 1 || !completedGrant) {
          throw new TaskLifecycleError(
            "formal execution archive requires a bound completed task and execution grant",
          );
        }
      }
      pauseFromEnvironment(environment, "CODEX_WORKFLOW_TEST_UPDATE_PAUSE_BEFORE_WRITE");
      const taskContent = renderTaskFields(currentProjection.task_content, {
        status: "archived", updated: localDay(eventClock), archived_reason: reason, archived_at: archivedAt,
      });
      const currentState = JSON.parse(JSON.stringify(currentProjection.state));
      const commitLink = task.status === "done"
        ? finalCommitLink(currentState, eventClock, revision)
        : null;
      const state = projectTaskState(paths, taskId, taskContent, currentState, eventClock);
      if (commitLink) {
        state.completion = { ...state.completion, final_commit_link: commitLink };
      }
      return {
        projection: { task_content: taskContent, state },
        result: { final_commit_link: commitLink },
        legacy: [lifecycleLegacy("task.archived", { from: task.status, to: "archived", reason })],
      };
    },
    mutationOptions(options, clock, environment),
  );
  if (!result.replay || result.latest) {
    clearCurrentTaskPointer(paths, taskId);
  }
  return result;
}

function staleTasks(days = 7, options = {}) {
  const environment = options.environment || process.env;
  const paths = options.paths || resolvePaths(environment);
  const clock = options.clock || (() => new Date());
  const nowValue = clock();
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const cutoff = now.getTime() - Number(days) * 24 * 60 * 60 * 1000;
  const openStatuses = new Set(["todo", "doing", "blocked"]);
  const records = [];

  for (const task of listTaskRecords(paths.tasksDir, "", false)) {
    if (!openStatuses.has(task.status)) {
      continue;
    }
    const events = lifecycleEvents(paths, task.id).sort(
      (left, right) => Date.parse(left.occurred_at) - Date.parse(right.occurred_at),
    );
    const latest = events.at(-1);
    const source = latest ? "event" : "legacy-date";
    const lastActivity = latest ? latest.occurred_at : task.updated;
    const activityTime = latest
      ? Date.parse(latest.occurred_at)
      : new Date(`${task.updated}T00:00:00`).getTime();
    if (!Number.isNaN(activityTime) && activityTime <= cutoff) {
      records.push({ ...task, lastActivity, source });
    }
  }
  return records;
}

module.exports = {
  TaskLifecycleError,
  archiveTask,
  blockTask,
  completeTask,
  createTask,
  localDay,
  nextTaskId,
  renderTaskTemplate,
  resumeTask,
  staleTasks,
  startTask,
  validateReason,
  validateTitle,
};
