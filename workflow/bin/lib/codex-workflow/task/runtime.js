"use strict";

const fs = require("fs");
const path = require("path");
const { atomicWriteJson } = require("../core/atomic-file");
const { appendLifecycleEvent, readEventRows } = require("../core/event-store");
const { withLock } = require("../core/lock");
const { taskArtifactDir, taskArtifactDirRelative } = require("../core/paths");
const {
  requireTaskFile,
  updateTaskFields,
  validateTaskFile,
} = require("./repository");

function timestampSeconds(clock = () => new Date()) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("clock must return a valid date");
  }
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function readJsonObject(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`corrupt task state: ${file}: expected a JSON object`);
    }
    return value;
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    if (error instanceof SyntaxError) {
      throw new Error(`corrupt task state: ${file}: ${error.message}`);
    }
    throw error;
  }
}

function taskStateFile(paths, taskId) {
  return path.join(taskArtifactDir(paths, taskId), "state.json");
}

function taskRuntimeFile(paths, taskId) {
  return path.join(taskArtifactDir(paths, taskId), "runtime.jsonl");
}

function ensureFile(file, content) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, content, "utf8");
  }
}

function ensureTaskRuntimeScaffold(paths, taskId, title) {
  const artifactDir = taskArtifactDir(paths, taskId);
  const verificationDir = path.join(artifactDir, "verification");
  const teamDir = path.join(artifactDir, "team");
  const hookFailuresDir = path.join(artifactDir, "hook-failures");
  fs.mkdirSync(verificationDir, { recursive: true });
  fs.mkdirSync(teamDir, { recursive: true });
  fs.mkdirSync(hookFailuresDir, { recursive: true });

  ensureFile(path.join(artifactDir, "context.md"), `# Context\n\nTask: ${taskId}\nTitle: ${title}\n`);
  ensureFile(path.join(artifactDir, "spec.md"), `# Spec\n\nTask: ${taskId}\n`);
  ensureFile(path.join(artifactDir, "analysis.md"), `# Analysis\n\nTask: ${taskId}\n`);
  ensureFile(path.join(teamDir, "decision.md"), "# Team Decision\n\nPending discussion.\n");
  ensureFile(path.join(teamDir, "staffing.md"), "# Staffing\n\nPending discussion.\n");
}

function headerValue(fields, key) {
  return fields[key] ? fields[key][0] : "";
}

function writeTaskState(paths, taskId, clock = () => new Date()) {
  const file = requireTaskFile(paths.tasksDir, taskId);
  const { fields, task } = validateTaskFile(file);
  const stateFile = taskStateFile(paths, taskId);
  const state = readJsonObject(stateFile);
  const activeTeam =
    state.active_team && typeof state.active_team === "object" ? state.active_team : {};

  activeTeam.backend = headerValue(fields, "active_team_backend") || activeTeam.backend || "";
  activeTeam.mode = headerValue(fields, "active_team_mode") || activeTeam.mode || "";
  activeTeam.status = headerValue(fields, "active_team_status") || activeTeam.status || "";
  activeTeam.decision =
    headerValue(fields, "active_team_decision") || activeTeam.decision || "";

  Object.assign(state, {
    task_id: task.id,
    title: task.title,
    status: task.status,
    artifact_dir: taskArtifactDirRelative(paths, taskId),
    last_verified_at: headerValue(fields, "last_verified_at"),
    updated_at: timestampSeconds(clock),
    active_team: activeTeam,
  });

  for (const key of [
    "blocked_reason",
    "blocked_at",
    "resumed_at",
    "archived_reason",
    "archived_at",
    "no_verify_reason",
    "no_verify_at",
  ]) {
    const value = headerValue(fields, key);
    if (value) {
      state[key] = value;
    }
  }

  atomicWriteJson(stateFile, state);
  return state;
}

function castStateValue(value) {
  if (value === "__TRUE__") {
    return true;
  }
  if (value === "__FALSE__") {
    return false;
  }
  if (value === "__NULL__") {
    return null;
  }
  if (/^\d+$/.test(value)) {
    return Number(value);
  }
  return value;
}

function setTaskStateFields(paths, taskId, updates, clock = () => new Date()) {
  const stateFile = taskStateFile(paths, taskId);
  const state = readJsonObject(stateFile);
  for (const [key, rawValue] of Object.entries(updates)) {
    const parts = key.split(".");
    let cursor = state;
    for (const part of parts.slice(0, -1)) {
      if (!cursor[part] || typeof cursor[part] !== "object") {
        cursor[part] = {};
      }
      cursor = cursor[part];
    }
    cursor[parts.at(-1)] = castStateValue(String(rawValue));
  }
  state.updated_at = timestampSeconds(clock);
  atomicWriteJson(stateFile, state);
  return state;
}

function syncTaskRuntime(paths, taskId, clock = () => new Date()) {
  const file = requireTaskFile(paths.tasksDir, taskId);
  const { fields, task } = validateTaskFile(file);
  readJsonObject(taskStateFile(paths, taskId));
  ensureTaskRuntimeScaffold(paths, taskId, task.title);
  updateTaskFields(file, {
    artifact_dir: taskArtifactDirRelative(paths, taskId),
    last_verified_at: headerValue(fields, "last_verified_at"),
    active_team_backend: headerValue(fields, "active_team_backend"),
    active_team_mode: headerValue(fields, "active_team_mode"),
    active_team_status: headerValue(fields, "active_team_status"),
    active_team_decision: headerValue(fields, "active_team_decision"),
  });
  return writeTaskState(paths, taskId, clock);
}

function writeCurrentTaskPointer(paths, taskId, clock = () => new Date()) {
  return withLock(paths.pointerLockFile, () => {
    const file = requireTaskFile(paths.tasksDir, taskId);
    const { task } = validateTaskFile(file);
    const pointer = {
      task_id: taskId,
      title: task.title,
      artifact_dir: taskArtifactDirRelative(paths, taskId),
      updated_at: timestampSeconds(clock),
    };
    atomicWriteJson(paths.currentTaskFile, pointer);
    return pointer;
  });
}

function clearCurrentTaskPointer(paths, taskId = "") {
  return withLock(paths.pointerLockFile, () => {
    if (!fs.existsSync(paths.currentTaskFile)) {
      return false;
    }
    if (!taskId) {
      fs.unlinkSync(paths.currentTaskFile);
      return true;
    }

    let pointer;
    try {
      pointer = JSON.parse(fs.readFileSync(paths.currentTaskFile, "utf8"));
    } catch {
      fs.unlinkSync(paths.currentTaskFile);
      return true;
    }
    if (pointer.task_id === taskId) {
      fs.unlinkSync(paths.currentTaskFile);
      return true;
    }
    return false;
  });
}

function appendTaskLifecycleEvent(paths, taskId, kind, data, options = {}) {
  return appendLifecycleEvent(taskRuntimeFile(paths, taskId), {
    taskId,
    kind,
    data,
    ...options,
  });
}

function hasSuccessfulVerification(paths, taskId) {
  const state = readJsonObject(taskStateFile(paths, taskId));
  const verification =
    state.verification && typeof state.verification === "object" ? state.verification : {};
  return Boolean(String(state.last_verified_at || "").trim()) &&
    (verification.last_exit_code === 0 || verification.last_exit_code === "0");
}

function lifecycleEvents(paths, taskId) {
  return readEventRows(taskRuntimeFile(paths, taskId)).filter(
    (row) =>
      row &&
      row.schema_version === 1 &&
      row.task_id === taskId &&
      typeof row.kind === "string" &&
      row.kind.startsWith("task.") &&
      typeof row.occurred_at === "string" &&
      !Number.isNaN(Date.parse(row.occurred_at)),
  );
}

module.exports = {
  appendTaskLifecycleEvent,
  clearCurrentTaskPointer,
  ensureTaskRuntimeScaffold,
  hasSuccessfulVerification,
  lifecycleEvents,
  readJsonObject,
  setTaskStateFields,
  syncTaskRuntime,
  taskRuntimeFile,
  taskStateFile,
  timestampSeconds,
  writeCurrentTaskPointer,
  writeTaskState,
};
