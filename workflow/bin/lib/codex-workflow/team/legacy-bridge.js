"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { CommandError, commandOptions } = require("../core/command-runtime");
const { readAuthoritativeEvents } = require("../core/event-store");
const {
  applyTaskProjection,
  materializeTaskProjection,
  mutateTaskRuntime,
  taskEventFile,
} = require("../core/task-mutation");
const { relativeToCodeHome, taskArtifactDir } = require("../core/paths");
const {
  requireOpenExecutionTask,
  requireTaskFile,
  validateTaskFile,
} = require("../task/repository");
const { readJsonObject, taskRuntimeFile, taskStateFile } = require("../task/runtime");

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

function seedIsolatedLegacyRoot(paths, isolatedPaths, taskId, events) {
  const source = taskArtifactDir(paths, taskId);
  const target = taskArtifactDir(isolatedPaths, taskId);
  fs.mkdirSync(isolatedPaths.tasksDir, { recursive: true });
  fs.mkdirSync(isolatedPaths.artifactsDir, { recursive: true });
  if (fs.existsSync(source)) {
    fs.cpSync(source, target, { dereference: false, recursive: true });
  }
  const projection = materializeTaskProjection(events);
  if (!projection) throw new CommandError(`missing canonical task projection: ${taskId}`);
  applyTaskProjection(isolatedPaths, taskId, projection);
  fs.writeFileSync(
    taskEventFile(isolatedPaths, taskId),
    `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
  );
}

function replaceArtifactRoot(value, fromAbsolute, toAbsolute, fromRelative, toRelative) {
  if (Array.isArray(value)) {
    return value.map((item) => replaceArtifactRoot(
      item, fromAbsolute, toAbsolute, fromRelative, toRelative,
    ));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      replaceArtifactRoot(item, fromAbsolute, toAbsolute, fromRelative, toRelative),
    ]));
  }
  if (typeof value !== "string") return value;
  return value.replaceAll(fromAbsolute, toAbsolute).replaceAll(fromRelative, toRelative);
}

function rebaseLegacyProjection(paths, isolatedPaths, taskId, taskContent, state) {
  const fromAbsolute = taskArtifactDir(isolatedPaths, taskId);
  const toAbsolute = taskArtifactDir(paths, taskId);
  const fromRelative = relativeToCodeHome(paths, fromAbsolute);
  const toRelative = relativeToCodeHome(paths, toAbsolute);
  return {
    taskContent: replaceArtifactRoot(
      taskContent, fromAbsolute, toAbsolute, fromRelative, toRelative,
    ),
    state: replaceArtifactRoot(state, fromAbsolute, toAbsolute, fromRelative, toRelative),
  };
}

function readRuntimeSource(paths, taskId) {
  try {
    return fs.readFileSync(taskRuntimeFile(paths, taskId), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

function captureNewLegacyRows(paths, taskId, baseline) {
  const current = readRuntimeSource(paths, taskId);
  if (!current.startsWith(baseline)) {
    throw new CommandError("legacy runtime output rewrote its isolated baseline");
  }
  return current.slice(baseline.length).split("\n").flatMap((line, index) => {
    if (!line.trim()) return [];
    let row;
    try {
      row = JSON.parse(line);
    } catch (error) {
      throw new CommandError(`legacy runtime row ${index + 1} is invalid JSON: ${error.message}`);
    }
    if (typeof row.kind !== "string" || !row.kind.trim()) {
      throw new CommandError(`legacy runtime row ${index + 1} is missing kind`);
    }
    if (row.schema_version === 1) {
      return [{ schema_version: 1, kind: row.kind, data: row.data || {} }];
    }
    return [{ kind: row.kind, detail: typeof row.detail === "string" ? row.detail : "" }];
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
  const events = readAuthoritativeEvents(taskEventFile(paths, taskId), taskId);
  const observedRevision = events.at(-1)?.revision || 0;
  const tempParent = environment.TMPDIR || os.tmpdir();
  fs.mkdirSync(tempParent, { recursive: true });
  const isolatedHome = fs.mkdtempSync(path.join(tempParent, "codex-workflow-legacy-"));
  const isolatedEnvironment = {
    ...environment,
    CODEX_WORKFLOW_ROOT: path.join(isolatedHome, "workflow"),
  };
  const isolatedPaths = commandOptions({ environment: isolatedEnvironment }).paths;
  try {
    seedIsolatedLegacyRoot(paths, isolatedPaths, taskId, events);
    const runtimeBaseline = readRuntimeSource(isolatedPaths, taskId);
    const child = spawnSync(options.legacyBin || LEGACY_BIN, argv, {
      env: isolatedEnvironment,
      stdio: "inherit",
    });
    if (child.error) {
      throw new CommandError(`unable to run legacy ${command}: ${child.error.message}`);
    }
    const exitCode = Number.isInteger(child.status) ? child.status : 1;
    const isolatedTaskFile = requireTaskFile(isolatedPaths.tasksDir, taskId);
    const rebased = rebaseLegacyProjection(
      paths,
      isolatedPaths,
      taskId,
      fs.readFileSync(isolatedTaskFile, "utf8"),
      readJsonObject(taskStateFile(isolatedPaths, taskId)),
    );
    const files = captureLegacyTeamFiles(isolatedPaths, taskId);
    const legacyRows = captureNewLegacyRows(isolatedPaths, taskId, runtimeBaseline);
    mutateTaskRuntime(
      paths,
      taskId,
      {
        kind: `compatibility.${command.replace("-", ".")}.closed`,
        data: {
          exit_code: exitCode,
          legacy_rows: legacyRows.length,
          team_status: rebased.state.active_team?.status || "",
        },
      },
      () => ({
        projection: {
          task_content: rebased.taskContent,
          state: rebased.state,
          files,
        },
        legacy: legacyRows,
      }),
      { environment, expectedRevision: observedRevision },
    );
    return { exitCode, lines: [] };
  } finally {
    fs.rmSync(isolatedHome, { force: true, recursive: true });
  }
}

module.exports = {
  LEGACY_BIN,
  LEGACY_TEAM_FILE,
  captureNewLegacyRows,
  captureLegacyTeamFiles,
  rebaseLegacyProjection,
  runLegacyTeamCommand,
  seedIsolatedLegacyRoot,
};
