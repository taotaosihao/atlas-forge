"use strict";

const fs = require("fs");
const path = require("path");
const { CommandError, commandOptions } = require("../core/command-runtime");
const { mutateTaskRuntime } = require("../core/task-mutation");
const { taskArtifactDir } = require("../core/paths");
const {
  requireOpenExecutionTask,
  requireTaskFile,
  validateTaskFile,
} = require("../task/repository");

const PROGRESS_PATH = "team/sdd/progress.jsonl";

function pluginCandidates(environment, paths) {
  return [
    environment.ATLAS_WORKFLOW_PLUGIN_ROOT,
    path.join(paths.codeHome, "plugins", "atlas-workflow"),
    path.join(path.resolve(__dirname, "../../../../.."), "plugins", "atlas-workflow"),
  ].filter(Boolean);
}

function loadLedgerValidator(environment, paths) {
  for (const root of pluginCandidates(environment, paths)) {
    const file = path.join(root, "contracts", "team-sdd", "validators", "ledger-event.js");
    if (fs.existsSync(file)) return require(file).validateLedgerEvent;
  }
  throw new CommandError("canonical Team SDD ledger validator is unavailable");
}

function readProgressFile(paths, taskId, validateLedgerEvent) {
  const file = path.join(taskArtifactDir(paths, taskId), PROGRESS_PATH);
  let source = "";
  try {
    source = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
  for (const [index, line] of source.split("\n").filter(Boolean).entries()) {
    let event;
    try {
      event = JSON.parse(line);
    } catch (error) {
      throw new CommandError(`invalid JSON on ledger line ${index + 1}: ${error.message}`);
    }
    const errors = validateLedgerEvent(event);
    if (errors.length > 0) {
      throw new CommandError(`invalid ledger line ${index + 1}: ${errors.join("; ")}`);
    }
  }
  return source;
}

function appendProgressProjection(currentProjection, event, initialContent = "") {
  const existing = (currentProjection?.files || []).find((entry) => entry.path === PROGRESS_PATH);
  const current = existing && existing.deleted !== true
    ? Buffer.from(existing.content_base64, "base64").toString("utf8")
    : initialContent;
  return {
    path: PROGRESS_PATH,
    content_base64: Buffer.from(`${current}${JSON.stringify(event)}\n`).toString("base64"),
  };
}

function appendLedgerEvent(taskId, event, options = {}) {
  const { clock, environment, paths } = commandOptions(options);
  const validateLedgerEvent = loadLedgerValidator(environment, paths);
  const errors = validateLedgerEvent(event);
  if (errors.length > 0) throw new CommandError(errors.join("; "));
  if (event.task_id !== taskId) {
    throw new CommandError(`ledger event task_id does not match task: ${event.task_id}`);
  }
  return mutateTaskRuntime(
    paths,
    taskId,
    {
      kind: "team.ledger.appended",
      operationId: options.operationId,
      data: { ledger_event: event },
    },
    ({ currentProjection }) => {
      const taskFile = requireTaskFile(paths.tasksDir, taskId);
      const { task } = validateTaskFile(taskFile);
      requireOpenExecutionTask(task, "team-ledger-append");
      if (!currentProjection) {
        throw new CommandError(`missing canonical task projection: ${taskId}`);
      }
      const existing = readProgressFile(paths, taskId, validateLedgerEvent);
      return {
        projection: {
          task_content: currentProjection.task_content,
          state: currentProjection.state,
          files: [appendProgressProjection(currentProjection, event, existing)],
        },
        result: { ledger_event: event },
        legacy: [],
      };
    },
    { ...options, clock, environment },
  );
}

module.exports = {
  PROGRESS_PATH,
  appendLedgerEvent,
  appendProgressProjection,
  loadLedgerValidator,
  readProgressFile,
};
