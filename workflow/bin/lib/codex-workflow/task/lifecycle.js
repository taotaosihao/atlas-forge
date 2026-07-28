"use strict";

const fs = require("fs");
const path = require("path");
const { sleepMilliseconds, withLock } = require("../core/lock");
const { resolvePaths, taskArtifactDirRelative } = require("../core/paths");
const { mutateTaskRuntime } = require("../core/task-mutation");
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
const { teamClosureIssues } = require("../team/lane-registry");

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

function currentTaskProjection(paths, taskId, updates, clock, mutateState = (state) => state) {
  const file = requireTaskFile(paths.tasksDir, taskId);
  const { task } = validateTaskFile(file);
  const taskContent = renderTaskFields(fs.readFileSync(file, "utf8"), updates);
  const state = projectTaskState(
    paths,
    taskId,
    taskContent,
    readJsonObject(taskStateFile(paths, taskId)),
    clock,
  );
  mutateState(state);
  return { projection: { task_content: taskContent, state }, task };
}

function createTask(title, criteria, options = {}) {
  const environment = options.environment || process.env;
  const paths = options.paths || resolvePaths(environment);
  const clock = options.clock || (() => new Date());
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
    () => {
      const { projection, task } = currentTaskProjection(
        paths, taskId, { status: "doing", updated: localDay(clock) }, clock,
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
  const blockedAt = timestampSeconds(clock);
  const result = mutateTaskRuntime(
    paths,
    taskId,
    { kind: "task.blocked", operationId: options.operationId, data: { from: "doing", to: "blocked", reason } },
    () => {
      const { projection, task } = currentTaskProjection(paths, taskId, {
        status: "blocked", updated: localDay(clock), blocked_reason: reason, blocked_at: blockedAt,
      }, clock);
      if (task.status !== "doing") {
        throw new TaskLifecycleError(`task must be doing before block: ${taskId}`);
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
  const resumedAt = timestampSeconds(clock);
  const result = mutateTaskRuntime(
    paths,
    taskId,
    { kind: "task.resumed", operationId: options.operationId, data: { from: "blocked", to: "doing" } },
    () => {
      const { projection, task } = currentTaskProjection(paths, taskId, {
        status: "doing", updated: localDay(clock), resumed_at: resumedAt,
      }, clock);
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
  const closedAt = timestampSeconds(clock);
  const data = {
    from: "doing",
    to: "done",
    outcome,
    authority_ref: authorityRef,
    evidence_refs: [...evidenceRefs],
    no_verify_reason: noVerifyRequested ? noVerifyReason : "",
  };
  const result = mutateTaskRuntime(
    paths,
    taskId,
    { kind: "task.completion.closed", operationId: options.operationId, data },
    ({ revision }) => {
      const currentFile = requireTaskFile(paths.tasksDir, taskId);
      const { task } = validateTaskFile(currentFile);
      if (task.status === "done") throw new TaskLifecycleError(`task already done: ${taskId}`);
      if (task.status !== "doing") {
        throw new TaskLifecycleError(`task must be doing before done: ${taskId}`);
      }
      const currentState = readJsonObject(taskStateFile(paths, taskId));
      const teamIssues = teamClosureIssues(currentState.active_team, outcome);
      if (teamIssues.length > 0) throw new TaskLifecycleError(teamIssues.join("\n"));
      let verification = {
        identityDigest: "", passed: outcome !== "succeeded", reasons: [], recordId: "",
      };
      if (outcome === "succeeded") {
        verification = successfulVerificationAdmission(paths, taskId, {
          captureIdentity: options.captureIdentity,
          environment,
        });
        if (!verification.passed) {
          throw new TaskLifecycleError(
            `task lacks successful workflow verification: ${taskId}\n` +
              `${verification.reasons.join("\n")}\n` +
              `run: codex-workflow verify ${taskId} -- <command...>`,
          );
        }
      }
      pauseFromEnvironment(environment, "CODEX_WORKFLOW_TEST_UPDATE_PAUSE_BEFORE_WRITE");
      const updates = {
        status: "done",
        updated: localDay(clock),
        completion_outcome: outcome,
        completion_authority_ref: authorityRef || "-",
        completion_evidence_refs: evidenceRefs.length > 0 ? evidenceRefs.join(" ") : "-",
        completion_closed_at: closedAt,
      };
      if (noVerifyRequested) {
        updates.no_verify_reason = noVerifyReason;
        updates.no_verify_at = closedAt;
      }
      const taskContent = renderTaskFields(fs.readFileSync(currentFile, "utf8"), updates);
      const state = projectTaskState(paths, taskId, taskContent, currentState, clock);
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
        team_run_id: activeTeam.team_run_id || "",
        team_generation: activeTeam.generation || 0,
        closed_at: closedAt,
      };
      if (outcome === "succeeded" && state.execution_authority?.status === "active") {
        state.execution_authority = {
          ...state.execution_authority,
          completion: {
            completed_at: closedAt,
            completed_revision: revision + 1,
          },
        };
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
      return { projection: { task_content: taskContent, state }, legacy };
    },
    mutationOptions(options, clock, environment),
  );
  if (!result.replay || result.latest) clearCurrentTaskPointer(paths, taskId);
  return result;
}

function archiveTask(taskId, reason, options = {}) {
  validateReason("archive reason", reason);
  const environment = options.environment || process.env;
  const paths = options.paths || resolvePaths(environment);
  const clock = options.clock || (() => new Date());
  const archivedAt = timestampSeconds(clock);
  const result = mutateTaskRuntime(
    paths,
    taskId,
    { kind: "task.archived", operationId: options.operationId, data: { reason } },
    () => {
      const file = requireTaskFile(paths.tasksDir, taskId);
      const { task } = validateTaskFile(file);
      if (task.status === "archived") {
        throw new TaskLifecycleError(`task already archived: ${taskId}`);
      }
      const allowed = new Set(["todo", "doing", "blocked", "done"]);
      if (!allowed.has(task.status)) {
        throw new TaskLifecycleError(`task cannot be archived from ${task.status}: ${taskId}`);
      }
      pauseFromEnvironment(environment, "CODEX_WORKFLOW_TEST_UPDATE_PAUSE_BEFORE_WRITE");
      const taskContent = renderTaskFields(fs.readFileSync(file, "utf8"), {
        status: "archived", updated: localDay(clock), archived_reason: reason, archived_at: archivedAt,
      });
      const state = projectTaskState(
        paths, taskId, taskContent, readJsonObject(taskStateFile(paths, taskId)), clock,
      );
      return {
        projection: { task_content: taskContent, state },
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
