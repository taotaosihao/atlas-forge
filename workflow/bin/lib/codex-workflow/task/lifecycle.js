"use strict";

const fs = require("fs");
const path = require("path");
const { atomicWriteFile } = require("../core/atomic-file");
const { sleepMilliseconds, taskLockFile, withLock } = require("../core/lock");
const { resolvePaths, taskArtifactDirRelative } = require("../core/paths");
const { taskIdTitleToken } = require("./id");
const {
  listTaskRecords,
  requireTaskFile,
  taskFile,
  updateTaskFields,
  validateTaskFile,
} = require("./repository");
const {
  appendTaskLifecycleEvent,
  clearCurrentTaskPointer,
  hasSuccessfulVerification,
  lifecycleEvents,
  readJsonObject,
  setTaskStateFields,
  syncTaskRuntime,
  taskStateFile,
  timestampSeconds,
  writeCurrentTaskPointer,
} = require("./runtime");

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

function eventOptions(options) {
  return { clock: options.clock, eventId: options.eventId };
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
    atomicWriteFile(
      taskFile(paths.tasksDir, taskId),
      renderTaskTemplate(template, values),
      { encoding: "utf8" },
    );
    syncTaskRuntime(paths, taskId, clock);
    appendTaskLifecycleEvent(
      paths,
      taskId,
      "task.created",
      { from: null, to: "todo" },
      eventOptions({ ...options, clock }),
    );
    return taskId;
  });
}

function lockedTask(paths, taskId, callback) {
  const file = taskFile(paths.tasksDir, taskId);
  return withLock(taskLockFile(paths, file), () => {
    requireTaskFile(paths.tasksDir, taskId);
    const record = validateTaskFile(file);
    readJsonObject(taskStateFile(paths, taskId));
    return callback(file, record);
  });
}

function startTask(taskId, options = {}) {
  const environment = options.environment || process.env;
  const paths = options.paths || resolvePaths(environment);
  const clock = options.clock || (() => new Date());
  return lockedTask(paths, taskId, (file, { task }) => {
    if (task.status === "done") {
      throw new TaskLifecycleError(`task already done: ${taskId}`);
    }
    if (task.status === "doing") {
      throw new TaskLifecycleError(`task already doing: ${taskId}`);
    }
    if (task.status !== "todo") {
      throw new TaskLifecycleError(`task must be todo before start: ${taskId}`);
    }
    pauseFromEnvironment(environment, "CODEX_WORKFLOW_TEST_UPDATE_PAUSE_BEFORE_WRITE");
    updateTaskFields(file, { status: "doing", updated: localDay(clock) });
    syncTaskRuntime(paths, taskId, clock);
    writeCurrentTaskPointer(paths, taskId, clock);
    appendTaskLifecycleEvent(
      paths,
      taskId,
      "task.started",
      { from: "todo", to: "doing" },
      eventOptions({ ...options, clock }),
    );
  });
}

function blockTask(taskId, reason, options = {}) {
  validateReason("block reason", reason);
  const environment = options.environment || process.env;
  const paths = options.paths || resolvePaths(environment);
  const clock = options.clock || (() => new Date());
  return lockedTask(paths, taskId, (file, { task }) => {
    if (task.status !== "doing") {
      throw new TaskLifecycleError(`task must be doing before block: ${taskId}`);
    }
    pauseFromEnvironment(environment, "CODEX_WORKFLOW_TEST_UPDATE_PAUSE_BEFORE_WRITE");
    const blockedAt = timestampSeconds(clock);
    updateTaskFields(file, {
      status: "blocked",
      updated: localDay(clock),
      blocked_reason: reason,
      blocked_at: blockedAt,
    });
    syncTaskRuntime(paths, taskId, clock);
    clearCurrentTaskPointer(paths, taskId);
    appendTaskLifecycleEvent(
      paths,
      taskId,
      "task.blocked",
      { from: "doing", to: "blocked", reason },
      eventOptions({ ...options, clock }),
    );
  });
}

function resumeTask(taskId, options = {}) {
  const environment = options.environment || process.env;
  const paths = options.paths || resolvePaths(environment);
  const clock = options.clock || (() => new Date());
  return lockedTask(paths, taskId, (file, { task }) => {
    if (task.status !== "blocked") {
      throw new TaskLifecycleError(`task must be blocked before resume: ${taskId}`);
    }
    pauseFromEnvironment(environment, "CODEX_WORKFLOW_TEST_UPDATE_PAUSE_BEFORE_WRITE");
    updateTaskFields(file, {
      status: "doing",
      updated: localDay(clock),
      resumed_at: timestampSeconds(clock),
    });
    syncTaskRuntime(paths, taskId, clock);
    writeCurrentTaskPointer(paths, taskId, clock);
    appendTaskLifecycleEvent(
      paths,
      taskId,
      "task.resumed",
      { from: "blocked", to: "doing" },
      eventOptions({ ...options, clock }),
    );
  });
}

function completeTask(
  taskId,
  { noVerifyReason = "", noVerifyRequested = false, ...options } = {},
) {
  if (noVerifyRequested) {
    validateReason("no-verify reason", noVerifyReason);
  }
  const environment = options.environment || process.env;
  const paths = options.paths || resolvePaths(environment);
  const clock = options.clock || (() => new Date());
  return lockedTask(paths, taskId, (file, { task }) => {
    if (task.status === "done") {
      throw new TaskLifecycleError(`task already done: ${taskId}`);
    }
    if (task.status !== "doing") {
      throw new TaskLifecycleError(`task must be doing before done: ${taskId}`);
    }

    syncTaskRuntime(paths, taskId, clock);
    if (!noVerifyRequested && !hasSuccessfulVerification(paths, taskId)) {
      throw new TaskLifecycleError(
        `task lacks successful workflow verification: ${taskId}\n` +
          `run: codex-workflow verify ${taskId} -- <command...>\n` +
          'or explicitly skip with: codex-workflow done <task-id> --no-verify "<reason>"',
      );
    }

    pauseFromEnvironment(environment, "CODEX_WORKFLOW_TEST_UPDATE_PAUSE_BEFORE_WRITE");
    const updates = { status: "done", updated: localDay(clock) };
    let noVerifyAt = "";
    if (noVerifyRequested) {
      noVerifyAt = timestampSeconds(clock);
      updates.no_verify_reason = noVerifyReason;
      updates.no_verify_at = noVerifyAt;
    }
    updateTaskFields(file, updates);
    syncTaskRuntime(paths, taskId, clock);
    if (noVerifyRequested) {
      setTaskStateFields(
        paths,
        taskId,
        {
          "verification.skipped": "__TRUE__",
          "verification.skip_reason": noVerifyReason,
          "verification.skipped_at": noVerifyAt,
        },
        clock,
      );
      appendTaskLifecycleEvent(
        paths,
        taskId,
        "verification.skipped",
        { reason: noVerifyReason },
        eventOptions({ ...options, clock }),
      );
    }
    clearCurrentTaskPointer(paths, taskId);
    appendTaskLifecycleEvent(
      paths,
      taskId,
      "task.done",
      { from: "doing", to: "done" },
      eventOptions({ ...options, clock }),
    );
  });
}

function archiveTask(taskId, reason, options = {}) {
  validateReason("archive reason", reason);
  const environment = options.environment || process.env;
  const paths = options.paths || resolvePaths(environment);
  const clock = options.clock || (() => new Date());
  return lockedTask(paths, taskId, (file, { task }) => {
    if (task.status === "archived") {
      throw new TaskLifecycleError(`task already archived: ${taskId}`);
    }
    const allowed = new Set(["todo", "doing", "blocked", "done"]);
    if (!allowed.has(task.status)) {
      throw new TaskLifecycleError(`task cannot be archived from ${task.status}: ${taskId}`);
    }
    pauseFromEnvironment(environment, "CODEX_WORKFLOW_TEST_UPDATE_PAUSE_BEFORE_WRITE");
    const archivedAt = timestampSeconds(clock);
    updateTaskFields(file, {
      status: "archived",
      updated: localDay(clock),
      archived_reason: reason,
      archived_at: archivedAt,
    });
    syncTaskRuntime(paths, taskId, clock);
    clearCurrentTaskPointer(paths, taskId);
    appendTaskLifecycleEvent(
      paths,
      taskId,
      "task.archived",
      { from: task.status, to: "archived", reason },
      eventOptions({ ...options, clock }),
    );
  });
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
