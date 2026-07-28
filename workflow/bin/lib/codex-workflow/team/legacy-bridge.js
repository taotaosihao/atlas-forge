"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { CommandError, commandOptions } = require("../core/command-runtime");
const { mutateTaskRuntime } = require("../core/task-mutation");
const { taskArtifactDir } = require("../core/paths");
const {
  requireOpenExecutionTask,
  requireTaskFile,
  validateTaskFile,
} = require("../task/repository");
const { readJsonObject, taskStateFile } = require("../task/runtime");

const LEGACY_BIN = path.resolve(__dirname, "../../../codex-workflow-legacy");
const LEGACY_TEAM_FILE = /^(?:decision|staffing|claude-review|round-[^/]+|loop-[^/]+)\.md$/;

function captureLegacyTeamFiles(paths, taskId) {
  const root = taskArtifactDir(paths, taskId);
  const teamRoot = path.join(root, "team");
  let entries;
  try {
    entries = fs.readdirSync(teamRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile() && LEGACY_TEAM_FILE.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const target = path.join(teamRoot, entry.name);
      let descriptor;
      try {
        descriptor = fs.openSync(
          target,
          fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0),
        );
        if (!fs.fstatSync(descriptor).isFile()) return [];
        return [{
          path: `team/${entry.name}`,
          content_base64: fs.readFileSync(descriptor).toString("base64"),
        }];
      } catch (error) {
        if (error.code === "ELOOP" || error.code === "ENOENT") return [];
        throw error;
      } finally {
        if (descriptor !== undefined) fs.closeSync(descriptor);
      }
    });
}

function runLegacyTeamCommand(argv, options = {}) {
  const command = argv[0];
  if (!new Set(["team-start", "team-loop"]).has(command) || !argv[1]) {
    throw new CommandError("usage: codex-workflow {team-start|team-loop} <task-id> ...");
  }
  const { environment, paths } = commandOptions(options);
  const taskId = argv[1];
  const taskFile = requireTaskFile(paths.tasksDir, taskId);
  const { task } = validateTaskFile(taskFile);
  requireOpenExecutionTask(task, command);

  const child = spawnSync(options.legacyBin || LEGACY_BIN, argv, {
    env: environment,
    stdio: "inherit",
  });
  if (child.error) throw new CommandError(`unable to run legacy ${command}: ${child.error.message}`);
  const exitCode = Number.isInteger(child.status) ? child.status : 1;
  const taskContent = fs.readFileSync(taskFile, "utf8");
  const state = readJsonObject(taskStateFile(paths, taskId));
  const files = captureLegacyTeamFiles(paths, taskId);
  mutateTaskRuntime(
    paths,
    taskId,
    {
      kind: `compatibility.${command.replace("-", ".")}.closed`,
      data: {
        exit_code: exitCode,
        team_status: state.active_team?.status || "",
      },
    },
    () => ({
      projection: { task_content: taskContent, state, files },
      legacy: [],
    }),
    { environment },
  );
  return { exitCode, lines: [] };
}

module.exports = {
  LEGACY_BIN,
  LEGACY_TEAM_FILE,
  captureLegacyTeamFiles,
  runLegacyTeamCommand,
};
