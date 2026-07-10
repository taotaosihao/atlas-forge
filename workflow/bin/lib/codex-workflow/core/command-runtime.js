"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { resolvePaths, taskArtifactDir } = require("./paths");
const {
  requireTaskFile,
  updateTaskFields,
  validateTaskFile,
} = require("../task/repository");
const {
  setTaskStateFields,
  syncTaskRuntime,
  taskRuntimeFile,
  timestampSeconds,
  writeTaskState,
} = require("../task/runtime");

class CommandError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "CommandError";
    this.exitCode = exitCode;
  }
}

function commandOptions(options = {}) {
  const environment = options.environment || process.env;
  return {
    clock: options.clock || (() => new Date()),
    cwd: options.cwd || process.cwd(),
    environment,
    paths: options.paths || resolvePaths(environment),
  };
}

function oneLine(value, label, { allowEmpty = true } = {}) {
  if (/[\n\r\t]/.test(value)) {
    throw new CommandError(`invalid ${label}: must be a single line`);
  }
  const trimmed = value.trim();
  if (!allowEmpty && !trimmed) {
    throw new CommandError(`invalid ${label}: must be non-empty`);
  }
  return trimmed;
}

function expandUserPath(value, environment = process.env) {
  if (value === "~") {
    return environment.HOME || os.homedir();
  }
  if (value.startsWith("~/")) {
    return path.join(environment.HOME || os.homedir(), value.slice(2));
  }
  return value;
}

function artifactFile(paths, taskId, name) {
  return path.join(taskArtifactDir(paths, taskId), name);
}

function prepareTaskCommand(paths, taskId, clock) {
  const file = requireTaskFile(paths.tasksDir, taskId);
  validateTaskFile(file);
  syncTaskRuntime(paths, taskId, clock);
  return file;
}

function updateTaskCommand(paths, taskId, headerUpdates, stateUpdates, clock) {
  const file = requireTaskFile(paths.tasksDir, taskId);
  if (Object.keys(headerUpdates).length > 0) {
    updateTaskFields(file, headerUpdates);
  }
  writeTaskState(paths, taskId, clock);
  if (Object.keys(stateUpdates).length > 0) {
    setTaskStateFields(paths, taskId, stateUpdates, clock);
  }
}

function appendLegacyRuntimeEvent(paths, taskId, kind, detail, clock) {
  const row =
    `{"kind": ${JSON.stringify(kind)}, "detail": ${JSON.stringify(detail)}, ` +
    `"created_at": ${JSON.stringify(timestampSeconds(clock))}}\n`;
  const file = taskRuntimeFile(paths, taskId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, row, "utf8");
}

module.exports = {
  ArtifactError: CommandError,
  CommandError,
  appendLegacyRuntimeEvent,
  artifactFile,
  commandOptions,
  expandUserPath,
  oneLine,
  prepareArtifactTask: prepareTaskCommand,
  prepareTaskCommand,
  updateArtifactTask: updateTaskCommand,
  updateTaskCommand,
};
