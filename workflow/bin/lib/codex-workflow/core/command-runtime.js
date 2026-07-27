"use strict";

const os = require("os");
const path = require("path");
const { resolvePaths, taskArtifactDir } = require("./paths");
const { recordTaskRuntimeEvent } = require("./task-mutation");
const {
  requireTaskFile,
  renderTaskFields,
  validateTaskFile,
} = require("../task/repository");
const {
  readJsonObject,
  ensureTaskRuntimeScaffold,
  projectTaskState,
  taskStateFile,
  timestampSeconds,
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
  const { task } = validateTaskFile(file);
  readJsonObject(taskStateFile(paths, taskId));
  ensureTaskRuntimeScaffold(paths, taskId, task.title);
  return file;
}

function updateTaskCommand(paths, taskId, headerUpdates, stateUpdates, clock) {
  return recordTaskRuntimeEvent(
    paths,
    taskId,
    {
      kind: "compatibility.task-update",
      data: { header_updates: headerUpdates, state_updates: stateUpdates },
    },
    [],
    {
      clock,
      projectionTransform({ taskContent, state }) {
        const rendered = renderTaskFields(taskContent, headerUpdates);
        const projected = projectTaskState(paths, taskId, rendered, state, clock);
        applyStateUpdates(projected, stateUpdates);
        projected.updated_at = timestampSeconds(clock);
        return { taskContent: rendered, state: projected };
      },
    },
  );
}

function castStateValue(value) {
  if (value === "__TRUE__") return true;
  if (value === "__FALSE__") return false;
  if (value === "__NULL__") return null;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

function applyStateUpdates(state, updates) {
  for (const [key, rawValue] of Object.entries(updates)) {
    const parts = key.split(".");
    let cursor = state;
    for (const part of parts.slice(0, -1)) {
      if (!cursor[part] || typeof cursor[part] !== "object" || Array.isArray(cursor[part])) {
        cursor[part] = {};
      }
      cursor = cursor[part];
    }
    cursor[parts.at(-1)] = castStateValue(String(rawValue));
  }
}

function appendLegacyRuntimeEvent(paths, taskId, kind, detail, clock) {
  return recordTaskRuntimeEvent(
    paths,
    taskId,
    {
      kind: `compatibility.${kind}`,
      data: { legacy_kind: kind, detail },
    },
    { kind, detail },
    { clock },
  );
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
