"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  CommandError,
  appendLegacyRuntimeEvent,
  commandOptions,
  prepareTaskCommand,
  updateTaskCommand,
} = require("../core/command-runtime");
const { posixChecksum, withLock } = require("../core/lock");
const { relativeToCodeHome, taskArtifactDir } = require("../core/paths");
const { getTaskField, requireTaskFile, validateTaskFile } = require("../task/repository");
const {
  readJsonObject,
  taskRuntimeFile,
  taskStateFile,
  timestampSeconds,
} = require("../task/runtime");

const RECORD_START_USAGE =
  'usage: codex-workflow team-record-start <task-id> "<objective>" --backend native --mode discuss|execute --agents N --roles "<roles>" [--authorization-ref <user-message-ref>]';
const RECORD_FINALIZE_USAGE =
  "usage: codex-workflow team-record-finalize <task-id> --backend native --status complete|failed|interrupted --round <file> --decision <file> --staffing <file>";
const LOOP_RECORD_USAGE =
  "usage: codex-workflow team-loop-record <task-id> --backend native --status loop-done|loop-incomplete|loop-failed|loop-timeout --loop <file> --iterations N [--max-iterations N] [--max-time <duration>]";
const STATUS_USAGE = "usage: codex-workflow team-status <task-id>";
const STOP_USAGE = "usage: codex-workflow team-stop <task-id>";
const PROMOTE_USAGE =
  "usage: codex-workflow team-promote <task-id> --to execute|worktree|finish [--authorization-ref <user-message-ref>]";

function teamDir(paths, taskId) {
  return path.join(taskArtifactDir(paths, taskId), "team");
}

function teamDecisionFile(paths, taskId) {
  return path.join(teamDir(paths, taskId), "decision.md");
}

function teamStaffingFile(paths, taskId) {
  return path.join(teamDir(paths, taskId), "staffing.md");
}

function teamLockFile(taskId, environment = process.env) {
  return path.join(
    environment.TMPDIR || os.tmpdir(),
    "codex-workflow-team-locks",
    `${posixChecksum(taskId)}.lock`,
  );
}

function snapshotPromotionFile(file, label, required = false) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    if (error.code === "ENOENT" && !required) {
      return { content: null, file, mode: null };
    }
    throw error;
  }
  if (!stat.isFile()) {
    throw new CommandError(`${label} is not a regular file: ${file}`);
  }
  return { content: fs.readFileSync(file), file, mode: stat.mode & 0o777 };
}

function restorePromotionFile(snapshot) {
  if (snapshot.content === null) {
    try {
      fs.unlinkSync(snapshot.file);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
    return;
  }
  let current = null;
  try {
    current = fs.readFileSync(snapshot.file);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
  if (!current || !current.equals(snapshot.content)) {
    fs.writeFileSync(snapshot.file, snapshot.content);
  }
  fs.chmodSync(snapshot.file, snapshot.mode);
}

function parseFlags(argv, startIndex, configuration) {
  const result = { ...configuration.defaults };
  for (let index = startIndex; index < argv.length; index += 1) {
    const argument = argv[index];
    if (Object.hasOwn(configuration.flags, argument)) {
      if (index + 1 >= argv.length) {
        throw new CommandError(configuration.usage);
      }
      result[configuration.flags[argument]] = argv[++index];
      continue;
    }
    let matched = false;
    for (const [flag, field] of Object.entries(configuration.flags)) {
      if (argument.startsWith(`${flag}=`)) {
        result[field] = argument.slice(flag.length + 1);
        matched = true;
        break;
      }
    }
    if (!matched) {
      throw new CommandError(`unknown ${configuration.name} option: ${argument}`);
    }
  }
  for (const [field, message] of configuration.required || []) {
    if (!result[field]) {
      throw new CommandError(message);
    }
  }
  return result;
}

function validatePositiveInteger(value, label) {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new CommandError(`invalid ${label}: ${value}`);
  }
}

function validateBackend(backend) {
  if (backend !== "native") {
    throw new CommandError(`invalid team backend: ${backend}`);
  }
}

function validateMode(mode) {
  if (!new Set(["discuss", "execute"]).has(mode)) {
    throw new CommandError(`invalid team mode: ${mode}`);
  }
}

function validateFinalStatus(status) {
  if (!new Set(["complete", "failed", "interrupted"]).has(status)) {
    throw new CommandError(`invalid team final status: ${status}`);
  }
}

function validateLoopStatus(status) {
  if (!new Set(["loop-done", "loop-incomplete", "loop-failed", "loop-timeout"]).has(status)) {
    throw new CommandError(`invalid team loop status: ${status}`);
  }
}

function validateQuery(value) {
  if (!value || /[\n\r]/.test(value) || /^\s*$/.test(value)) {
    throw new CommandError("unsafe query: query must be a single non-empty line");
  }
}

function validateReason(value, label) {
  if (!value || /[\n\r\t]/.test(value) || /^\s*$/.test(value)) {
    throw new CommandError(`unsafe ${label}: reason must be a single non-empty line`);
  }
}

function validateExecutionAuthorization(mode, authorizationRef) {
  if (mode !== "execute") {
    return;
  }
  if (!authorizationRef) {
    throw new CommandError("missing execute authorization ref");
  }
  validateReason(authorizationRef, "execute authorization ref");
}

function parseRecordStartArgs(argv) {
  if (argv.length < 2) {
    throw new CommandError(RECORD_START_USAGE);
  }
  const parsed = parseFlags(argv, 2, {
    name: "team-record-start",
    usage: RECORD_START_USAGE,
    defaults: { backend: "", mode: "", agents: "", roles: "", authorizationRef: "" },
    flags: {
      "--backend": "backend",
      "--mode": "mode",
      "--agents": "agents",
      "--roles": "roles",
      "--authorization-ref": "authorizationRef",
    },
    required: [
      ["backend", "missing team backend"],
      ["mode", "missing team mode"],
      ["agents", "missing team agents"],
      ["roles", "missing team roles"],
    ],
  });
  return { ...parsed, objective: argv[1], taskId: argv[0] };
}

function runRecordStart(parsed, options = {}) {
  validateBackend(parsed.backend);
  validateMode(parsed.mode);
  validatePositiveInteger(parsed.agents, "agents");
  validateQuery(parsed.objective);
  validateReason(parsed.roles, "team roles");
  validateExecutionAuthorization(parsed.mode, parsed.authorizationRef);
  const { clock, environment, paths } = commandOptions(options);
  prepareTaskCommand(paths, parsed.taskId, clock);
  const decisionFile = teamDecisionFile(paths, parsed.taskId);
  const staffingFile = teamStaffingFile(paths, parsed.taskId);
  const decision = relativeToCodeHome(paths, decisionFile);
  const staffing = relativeToCodeHome(paths, staffingFile);
  withLock(teamLockFile(parsed.taskId, environment), () => {
    updateTaskCommand(
      paths,
      parsed.taskId,
      {
        active_team_backend: parsed.backend,
        active_team_mode: parsed.mode,
        active_team_status: "running",
        active_team_decision: decision,
      },
      {
        "active_team.backend": parsed.backend,
        "active_team.mode": parsed.mode,
        "active_team.status": "running",
        "active_team.decision": decision,
        "active_team.objective": parsed.objective,
        "active_team.agents": parsed.agents,
        "active_team.roles": parsed.roles,
        "active_team.authorization_ref": parsed.mode === "execute" ? parsed.authorizationRef : "",
        "active_team.staffing": staffing,
        "active_team.temp_dir": "",
      },
      clock,
    );
  });
  appendLegacyRuntimeEvent(
    paths,
    parsed.taskId,
    "team-record-start",
    `${parsed.backend}/${parsed.mode} roles=${parsed.roles}`,
    clock,
  );
  const lines = [
    `task_id: ${parsed.taskId}`,
    `backend: ${parsed.backend}`,
    `mode: ${parsed.mode}`,
    "status: running",
    `decision: ${decisionFile}`,
    `staffing: ${staffingFile}`,
  ];
  if (parsed.mode === "execute") {
    lines.push(`authorization_ref: ${parsed.authorizationRef}`);
  }
  return {
    exitCode: 0,
    lines,
  };
}

function parseRecordFinalizeArgs(argv) {
  if (argv.length === 0) {
    throw new CommandError(RECORD_FINALIZE_USAGE);
  }
  return {
    ...parseFlags(argv, 1, {
      name: "team-record-finalize",
      usage: RECORD_FINALIZE_USAGE,
      defaults: { backend: "", status: "", roundFile: "", decisionFile: "", staffingFile: "" },
      flags: {
        "--backend": "backend",
        "--status": "status",
        "--round": "roundFile",
        "--decision": "decisionFile",
        "--staffing": "staffingFile",
      },
      required: [
        ["backend", "missing team backend"],
        ["status", "missing team status"],
      ],
    }),
    taskId: argv[0],
  };
}

function validateExistingNonemptyFile(label, file) {
  if (!file || /[\n\r\t]/.test(file)) {
    throw new CommandError(`invalid ${label} path: ${file}`);
  }
  let stats;
  try {
    stats = fs.statSync(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new CommandError(`missing ${label} file: ${file}`);
    }
    throw error;
  }
  if (!stats.isFile()) {
    throw new CommandError(`missing ${label} file: ${file}`);
  }
  if (stats.size === 0) {
    throw new CommandError(`empty ${label} file: ${file}`);
  }
}

function validateNativeArtifact(paths, taskId, label, file) {
  validateExistingNonemptyFile(label, file);
  const teamRoot = fs.realpathSync(teamDir(paths, taskId));
  const absolute = fs.realpathSync(file);
  const relative = path.relative(teamRoot, absolute);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new CommandError(
      `${label} file is outside current task team directory: ${absolute}`,
    );
  }
  const text = fs.readFileSync(absolute, "utf8");
  if (!/(^|\b)backend\s*[:=]\s*native\b/im.test(text)) {
    throw new CommandError(`${label} file is missing backend: native marker: ${absolute}`);
  }
  const ignoredPrefixes = [
    "Task:",
    "Title:",
    "- task_id:",
    "- title:",
    "- backend:",
    "- mode:",
    "- objective:",
    "- agents:",
    "- roles:",
    "- status:",
    "- created_at:",
    "- completed_at:",
    "- decision_file:",
    "- round_file:",
    "- staffing:",
    "- loop:",
    "- iterations",
    "- max_",
  ];
  const content = text
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !line.startsWith("#") &&
        !line.startsWith("```") &&
        line !== "Pending discussion." &&
        !ignoredPrefixes.some((prefix) => line.startsWith(prefix)),
    )
    .join("\n")
    .trim();
  if (content.length < 20) {
    throw new CommandError(`${label} file is not substantive: ${absolute}`);
  }
  return absolute;
}

function runRecordFinalize(parsed, options = {}) {
  validateBackend(parsed.backend);
  validateFinalStatus(parsed.status);
  const { clock, environment, paths } = commandOptions(options);
  const taskFile = prepareTaskCommand(paths, parsed.taskId, clock);
  const currentBackend = getTaskField(taskFile, "active_team_backend");
  const currentStatus = getTaskField(taskFile, "active_team_status");
  if (currentBackend !== "native" || currentStatus !== "running") {
    throw new CommandError(
      "team-record-finalize requires an active native team record in running status",
    );
  }
  const roundAbsolute = validateNativeArtifact(
    paths,
    parsed.taskId,
    "team round",
    parsed.roundFile,
  );
  const decisionAbsolute = validateNativeArtifact(
    paths,
    parsed.taskId,
    "team decision",
    parsed.decisionFile,
  );
  const staffingAbsolute = validateNativeArtifact(
    paths,
    parsed.taskId,
    "team staffing",
    parsed.staffingFile,
  );
  const round = relativeToCodeHome(paths, roundAbsolute);
  const decision = relativeToCodeHome(paths, decisionAbsolute);
  const staffing = relativeToCodeHome(paths, staffingAbsolute);
  const mode = getTaskField(taskFile, "active_team_mode");
  withLock(teamLockFile(parsed.taskId, environment), () => {
    updateTaskCommand(
      paths,
      parsed.taskId,
      {
        active_team_backend: parsed.backend,
        active_team_status: parsed.status,
        active_team_decision: decision,
      },
      {
        "active_team.backend": parsed.backend,
        "active_team.mode": mode,
        "active_team.status": parsed.status,
        "active_team.decision": decision,
        "active_team.round_file": round,
        "active_team.staffing": staffing,
        "active_team.temp_dir": "",
      },
      clock,
    );
  });
  appendLegacyRuntimeEvent(
    paths,
    parsed.taskId,
    "team-record-finalize",
    `${parsed.backend}/${parsed.status} round=${round}`,
    clock,
  );
  return {
    exitCode: 0,
    lines: [
      `task_id: ${parsed.taskId}`,
      `backend: ${parsed.backend}`,
      `status: ${parsed.status}`,
      `decision: ${parsed.decisionFile}`,
      `staffing: ${parsed.staffingFile}`,
      `round: ${parsed.roundFile}`,
    ],
  };
}

function parseLoopRecordArgs(argv) {
  if (argv.length === 0) {
    throw new CommandError(LOOP_RECORD_USAGE);
  }
  return {
    ...parseFlags(argv, 1, {
      name: "team-loop-record",
      usage: LOOP_RECORD_USAGE,
      defaults: {
        backend: "",
        status: "",
        loopFile: "",
        iterations: "",
        maxIterations: "",
        maxTime: "",
      },
      flags: {
        "--backend": "backend",
        "--status": "status",
        "--loop": "loopFile",
        "--iterations": "iterations",
        "--max-iterations": "maxIterations",
        "--max-time": "maxTime",
      },
      required: [
        ["backend", "missing team backend"],
        ["status", "missing team loop status"],
        ["iterations", "missing team loop iterations"],
      ],
    }),
    taskId: argv[0],
  };
}

function runLoopRecord(parsed, options = {}) {
  validateBackend(parsed.backend);
  validateLoopStatus(parsed.status);
  validatePositiveInteger(parsed.iterations, "loop iterations");
  if (parsed.maxIterations) {
    validatePositiveInteger(parsed.maxIterations, "loop max iterations");
  }
  if (parsed.maxTime) {
    validateReason(parsed.maxTime, "loop max time");
  }
  const { clock, environment, paths } = commandOptions(options);
  const taskFile = prepareTaskCommand(paths, parsed.taskId, clock);
  if (getTaskField(taskFile, "active_team_backend") !== "native") {
    throw new CommandError("team-loop-record requires a native team record");
  }
  const loopAbsolute = validateNativeArtifact(
    paths,
    parsed.taskId,
    "team loop",
    parsed.loopFile,
  );
  const decisionFile = teamDecisionFile(paths, parsed.taskId);
  const staffingFile = teamStaffingFile(paths, parsed.taskId);
  const decision = relativeToCodeHome(paths, decisionFile);
  const staffing = relativeToCodeHome(paths, staffingFile);
  const loop = relativeToCodeHome(paths, loopAbsolute);
  const mode = getTaskField(taskFile, "active_team_mode") || "execute";
  const stateUpdates = {
    "active_team.backend": parsed.backend,
    "active_team.mode": mode,
    "active_team.status": parsed.status,
    "active_team.decision": decision,
    "active_team.staffing": staffing,
    "active_team.loop.status": parsed.status,
    "active_team.loop.file": loop,
    "active_team.loop.iteration": parsed.iterations,
  };
  if (parsed.maxIterations) {
    stateUpdates["active_team.loop.max_iterations"] = parsed.maxIterations;
  }
  if (parsed.maxTime) {
    stateUpdates["active_team.loop.max_time"] = parsed.maxTime;
  }
  withLock(teamLockFile(parsed.taskId, environment), () => {
    updateTaskCommand(
      paths,
      parsed.taskId,
      {
        active_team_backend: parsed.backend,
        active_team_mode: mode,
        active_team_status: parsed.status,
        active_team_decision: decision,
      },
      stateUpdates,
      clock,
    );
  });
  appendLegacyRuntimeEvent(
    paths,
    parsed.taskId,
    "team-loop-record",
    `${parsed.backend}/${parsed.status} loop=${loop} iterations=${parsed.iterations}`,
    clock,
  );
  return {
    exitCode: 0,
    lines: [
      `task_id: ${parsed.taskId}`,
      `backend: ${parsed.backend}`,
      `status: ${parsed.status}`,
      `loop: ${parsed.loopFile}`,
      `iterations: ${parsed.iterations}`,
    ],
  };
}

function displayValue(value) {
  return value === undefined || value === null ? "" : String(value);
}

function runStatus(argv, options = {}) {
  if (argv.length !== 1) {
    throw new CommandError(STATUS_USAGE);
  }
  const { clock, paths } = commandOptions(options);
  prepareTaskCommand(paths, argv[0], clock);
  const state = readJsonObject(taskStateFile(paths, argv[0]));
  const team = state.active_team && typeof state.active_team === "object" ? state.active_team : {};
  const loop = team.loop && typeof team.loop === "object" ? team.loop : {};
  const fields = [
    ["task_id", state.task_id],
    ["status", state.status],
    ["artifact_dir", state.artifact_dir],
    ["last_verified_at", state.last_verified_at],
    ["team_backend", team.backend],
    ["team_mode", team.mode],
    ["team_status", team.status],
    ["team_decision", team.decision],
    ["team_objective", team.objective],
    ["team_agents", team.agents],
    ["team_roles", team.roles],
    ["team_round", team.round_file],
    ["team_staffing", team.staffing],
    ["team_temp_dir", team.temp_dir],
    ["team_promoted_to", team.promoted_to],
    ["team_loop_status", loop.status],
    ["team_loop_file", loop.file],
    ["team_loop_iteration", loop.iteration],
    ["team_loop_max_iterations", loop.max_iterations],
    ["team_loop_max_time", loop.max_time],
  ];
  return { exitCode: 0, lines: fields.map(([key, value]) => `${key}: ${displayValue(value)}`) };
}

function runStop(argv, options = {}) {
  if (argv.length !== 1) {
    throw new CommandError(STOP_USAGE);
  }
  const { clock, paths } = commandOptions(options);
  prepareTaskCommand(paths, argv[0], clock);
  const decision = relativeToCodeHome(paths, teamDecisionFile(paths, argv[0]));
  updateTaskCommand(
    paths,
    argv[0],
    { active_team_status: "stopped", active_team_decision: decision },
    { "active_team.status": "stopped", "active_team.decision": decision },
    clock,
  );
  appendLegacyRuntimeEvent(paths, argv[0], "team-stop", "stopped", clock);
  return { exitCode: 0, lines: [`task_id: ${argv[0]}`, "status: stopped"] };
}

function parsePromoteArgs(argv) {
  if (argv.length === 0) {
    throw new CommandError(PROMOTE_USAGE);
  }
  const parsed = parseFlags(argv, 1, {
    name: "team-promote",
    usage: PROMOTE_USAGE,
    defaults: { target: "", authorizationRef: "" },
    flags: { "--to": "target", "--authorization-ref": "authorizationRef" },
  });
  if (!new Set(["execute", "worktree", "finish"]).has(parsed.target)) {
    throw new CommandError(`invalid promotion target: ${parsed.target}`);
  }
  return { ...parsed, taskId: argv[0] };
}

function runPromote(parsed, options = {}) {
  validateExecutionAuthorization(parsed.target, parsed.authorizationRef);
  const { clock, environment, paths } = commandOptions(options);
  const decisionFile = teamDecisionFile(paths, parsed.taskId);
  const decision = relativeToCodeHome(paths, decisionFile);
  withLock(teamLockFile(parsed.taskId, environment), () => {
    const taskFile = requireTaskFile(paths.tasksDir, parsed.taskId);
    validateTaskFile(taskFile);
    const snapshots = [
      snapshotPromotionFile(taskFile, "task file", true),
      snapshotPromotionFile(taskStateFile(paths, parsed.taskId), "task state"),
      snapshotPromotionFile(decisionFile, "team decision"),
      snapshotPromotionFile(taskRuntimeFile(paths, parsed.taskId), "task runtime"),
    ];
    let mode = getTaskField(taskFile, "active_team_mode");
    if (parsed.target === "execute") {
      mode = "execute";
    }
    const status = `promoted:${parsed.target}`;
    const stateUpdates = {
      "active_team.mode": mode,
      "active_team.status": status,
      "active_team.promoted_to": parsed.target,
    };
    if (parsed.target === "execute") {
      stateUpdates["active_team.authorization_ref"] = parsed.authorizationRef;
    }
    try {
      updateTaskCommand(
        paths,
        parsed.taskId,
        {
          active_team_mode: mode,
          active_team_status: status,
          active_team_decision: decision,
        },
        stateUpdates,
        clock,
      );
      const authorizationLine = parsed.target === "execute"
        ? `- authorization_ref: ${parsed.authorizationRef}\n`
        : "";
      fs.appendFileSync(
        decisionFile,
        `\n## Promotion\n\n- promoted_to: ${parsed.target}\n${authorizationLine}- created_at: ${timestampSeconds(clock)}\n`,
        "utf8",
      );
      appendLegacyRuntimeEvent(paths, parsed.taskId, "team-promote", parsed.target, clock);
    } catch (error) {
      try {
        for (const snapshot of snapshots.reverse()) {
          restorePromotionFile(snapshot);
        }
      } catch (rollbackError) {
        throw new CommandError(
          `team promotion failed and rollback failed: ${error.message}; ${rollbackError.message}`,
        );
      }
      throw error;
    }
  });
  const lines = [
    `task_id: ${parsed.taskId}`,
    `target: ${parsed.target}`,
    `decision: ${decisionFile}`,
  ];
  if (parsed.target === "execute") {
    lines.push(`authorization_ref: ${parsed.authorizationRef}`);
  }
  return {
    exitCode: 0,
    lines,
  };
}

module.exports = {
  LOOP_RECORD_USAGE,
  PROMOTE_USAGE,
  RECORD_FINALIZE_USAGE,
  RECORD_START_USAGE,
  STATUS_USAGE,
  STOP_USAGE,
  parseLoopRecordArgs,
  parsePromoteArgs,
  parseRecordFinalizeArgs,
  parseRecordStartArgs,
  runLoopRecord,
  runPromote,
  runRecordFinalize,
  runRecordStart,
  runStatus,
  runStop,
  teamDecisionFile,
  teamDir,
  teamLockFile,
  teamStaffingFile,
  validateNativeArtifact,
};
