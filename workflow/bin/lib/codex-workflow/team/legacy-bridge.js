"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { CommandError, commandOptions } = require("../core/command-runtime");
const { readAuthoritativeEvents } = require("../core/event-store");
const { assertDecisionReadyFromEvents } = require("../artifact/decisions");
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
  renderTaskFields,
  validateTaskFile,
} = require("../task/repository");
const {
  projectTaskState,
  readJsonObject,
  taskRuntimeFile,
  taskStateFile,
} = require("../task/runtime");

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

function legacyTeamMode(argv) {
  let mode = "discuss";
  for (let index = 3; index < argv.length; index += 1) {
    if (argv[index] === "--mode") {
      mode = argv[index + 1] || "";
      index += 1;
    } else if (argv[index].startsWith("--mode=")) {
      mode = argv[index].slice("--mode=".length);
    }
  }
  return mode;
}

function discussDisplayProjection(currentProjection, rebased, files, legacyRows, paths, taskId) {
  const state = JSON.parse(JSON.stringify(currentProjection.state));
  const legacyTeam = rebased.state.active_team && typeof rebased.state.active_team === "object"
    ? rebased.state.active_team
    : {};
  const display = Object.fromEntries([
    "backend", "mode", "status", "decision", "staffing", "round_file", "objective",
    "agents", "roles", "providers", "created_at",
  ].flatMap((key) => Object.hasOwn(legacyTeam, key) ? [[key, legacyTeam[key]]] : []));
  display.mode = "discuss";
  if (state.active_team?.schema_version === 2) {
    state.legacy_team_discuss = display;
  } else {
    state.active_team = display;
  }
  const taskContent = renderTaskFields(currentProjection.task_content, {
    active_team_backend: display.backend || "legacy",
    active_team_mode: "discuss",
    active_team_status: display.status || "complete",
    active_team_decision: display.decision || "",
  });
  const projected = projectTaskState(paths, taskId, taskContent, state);
  if (state.active_team?.schema_version === 2) projected.active_team = state.active_team;
  if (state.legacy_team_discuss) projected.legacy_team_discuss = state.legacy_team_discuss;
  return {
    projection: { task_content: taskContent, state: projected, files },
    legacy: legacyRows,
  };
}

function runLegacyTeamCommand(argv, options = {}) {
  const command = argv[0];
  if (!new Set(["team-start", "team-loop"]).has(command) || !argv[1]) {
    throw new CommandError("usage: codex-workflow {team-start|team-loop} <task-id> ...");
  }
  if (command === "team-loop") {
    throw new CommandError("legacy team-loop is disabled because it implicitly launches execute mode");
  }
  const mode = legacyTeamMode(argv);
  if (mode !== "discuss") {
    throw new CommandError("legacy team-start is discuss-only; execute requires a vNext controller grant");
  }
  const { environment, paths } = commandOptions(options);
  const taskId = argv[1];
  const taskFile = requireTaskFile(paths.tasksDir, taskId);
  const { task } = validateTaskFile(taskFile);
  requireOpenExecutionTask(task, command);
  const events = readAuthoritativeEvents(taskEventFile(paths, taskId), taskId);
  const decisionControl = assertDecisionReadyFromEvents(events, taskId);
  if (decisionControl.has_records) {
    throw new CommandError(
      "legacy team-start cannot bind recorded decisions; use team-record-start",
    );
  }
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
      ({ currentProjection }) => discussDisplayProjection(
        currentProjection,
        rebased,
        files,
        legacyRows,
        paths,
        taskId,
      ),
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
  discussDisplayProjection,
  legacyTeamMode,
  rebaseLegacyProjection,
  runLegacyTeamCommand,
  seedIsolatedLegacyRoot,
};
