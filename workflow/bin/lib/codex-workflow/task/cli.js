"use strict";

const fs = require("fs");
const { spawnSync } = require("child_process");
const { resolvePaths, workflowRoot } = require("../core/paths");
const {
  TaskLifecycleError,
  archiveTask,
  blockTask,
  completeTask,
  createTask,
  resumeTask,
  staleTasks,
  startTask,
} = require("./lifecycle");
const {
  TaskRepositoryError,
  listTaskRecords,
  requireTaskFile,
  validateTaskFile,
} = require("./repository");

const LIST_USAGE = "usage: codex-workflow list [--all|--days <n>|--days=<n>]";
const SHOW_USAGE = "usage: codex-workflow show <task-id>";
const INIT_USAGE = 'usage: codex-workflow init-task "<title>" "<success criteria>"';
const START_USAGE = "usage: codex-workflow start <task-id>";
const DONE_USAGE = 'usage: codex-workflow done <task-id> [--no-verify "<reason>"]';
const BLOCK_USAGE = 'usage: codex-workflow block <task-id> --reason "<reason>"';
const RESUME_USAGE = "usage: codex-workflow resume <task-id>";
const ARCHIVE_USAGE = 'usage: codex-workflow archive <task-id> --reason "<reason>"';
const STALE_USAGE = "usage: codex-workflow stale [--days <n>|--days=<n>]";

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

function parseListArgs(argv) {
  let mode = "recent";
  let days = "7";
  let modeLocked = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--all") {
      if (modeLocked) {
        throw new CliError(LIST_USAGE);
      }
      mode = "all";
      modeLocked = true;
    } else if (argument === "--days") {
      if (modeLocked || index + 1 >= argv.length) {
        throw new CliError(LIST_USAGE);
      }
      mode = "recent";
      modeLocked = true;
      days = argv[++index];
    } else if (argument.startsWith("--days=")) {
      if (modeLocked) {
        throw new CliError(LIST_USAGE);
      }
      mode = "recent";
      modeLocked = true;
      days = argument.slice("--days=".length);
    } else {
      throw new CliError(LIST_USAGE);
    }
  }

  if (mode === "recent" && !/^[1-9]\d*$/.test(days)) {
    throw new CliError(`invalid days: ${days}`);
  }
  return { days, mode };
}

function formatLocalDay(date) {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function listCutoffDay(days, now = new Date()) {
  const offset = Number(days) - 1;
  return formatLocalDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset));
}

function versionSort(lines) {
  if (lines.length === 0) {
    return "";
  }

  const result = spawnSync("sort", ["-t", "\t", "-k2,2V"], {
    encoding: "utf8",
    input: `${lines.join("\n")}\n`,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new CliError(result.stderr.trim() || `sort failed with exit code ${result.status}`);
  }
  return result.stdout;
}

function runList(argv, environment = process.env) {
  const { days, mode } = parseListArgs(argv);
  const cutoffDay = mode === "recent" ? listCutoffDay(days) : "";
  const { tasksDir } = resolvePaths(environment);
  const lines = listTaskRecords(tasksDir, cutoffDay, mode === "all").map(
    (task) => `${task.status}\t${task.id}\t${task.title.replace(/\t/g, " ")}`,
  );
  process.stdout.write(versionSort(lines));
}

function runShow(argv, environment = process.env) {
  if (argv.length !== 1) {
    throw new CliError(SHOW_USAGE);
  }
  const { tasksDir } = resolvePaths(environment);
  const file = requireTaskFile(tasksDir, argv[0]);
  validateTaskFile(file);
  process.stdout.write(fs.readFileSync(file));
}

function parseReasonArgs(argv, usage) {
  if (argv.length < 2) {
    throw new CliError(usage);
  }
  const taskId = argv[0];
  let reason;
  if (argv[1] === "--reason" && argv.length === 3) {
    reason = argv[2];
  } else if (argv[1].startsWith("--reason=") && argv.length === 2) {
    reason = argv[1].slice("--reason=".length);
  } else {
    throw new CliError(usage);
  }
  return { reason, taskId };
}

function parseDoneArgs(argv) {
  if (argv.length < 1) {
    throw new CliError(DONE_USAGE);
  }
  const taskId = argv[0];
  const rest = argv.slice(1);
  if (rest.length === 0) {
    return { noVerifyReason: "", noVerifyRequested: false, taskId };
  }
  if (rest[0] === "--no-verify" && rest.length === 2) {
    return { noVerifyReason: rest[1], noVerifyRequested: true, taskId };
  }
  if (rest[0].startsWith("--no-verify=") && rest.length === 1) {
    return {
      noVerifyReason: rest[0].slice("--no-verify=".length),
      noVerifyRequested: true,
      taskId,
    };
  }
  throw new CliError(DONE_USAGE);
}

function parseStaleArgs(argv) {
  if (argv.length === 0) {
    return 7;
  }
  let value;
  if (argv[0] === "--days" && argv.length === 2) {
    value = argv[1];
  } else if (argv[0].startsWith("--days=") && argv.length === 1) {
    value = argv[0].slice("--days=".length);
  } else {
    throw new CliError(STALE_USAGE);
  }
  if (!/^[1-9]\d*$/.test(value)) {
    throw new CliError(`invalid days: ${value}`);
  }
  return Number(value);
}

function runInitTask(argv, environment = process.env) {
  if (argv.length !== 2) {
    throw new CliError(INIT_USAGE);
  }
  const taskId = createTask(argv[0], argv[1], { environment });
  process.stdout.write(`${taskId}\n`);
}

function runStart(argv, environment = process.env) {
  if (argv.length !== 1) {
    throw new CliError(START_USAGE);
  }
  startTask(argv[0], { environment });
}

function runDone(argv, environment = process.env) {
  const { taskId, ...options } = parseDoneArgs(argv);
  completeTask(taskId, { ...options, environment });
}

function runBlock(argv, environment = process.env) {
  const { reason, taskId } = parseReasonArgs(argv, BLOCK_USAGE);
  blockTask(taskId, reason, { environment });
}

function runResume(argv, environment = process.env) {
  if (argv.length !== 1) {
    throw new CliError(RESUME_USAGE);
  }
  resumeTask(argv[0], { environment });
}

function runArchive(argv, environment = process.env) {
  const { reason, taskId } = parseReasonArgs(argv, ARCHIVE_USAGE);
  archiveTask(taskId, reason, { environment });
}

function runStale(argv, environment = process.env) {
  const days = parseStaleArgs(argv);
  const lines = staleTasks(days, { environment }).map(
    (task) =>
      `${task.status}\t${task.id}\t${task.lastActivity}\t${task.source}\t${task.title.replace(/\t/g, " ")}`,
  );
  process.stdout.write(versionSort(lines));
}

function main(argv) {
  const command = argv[0];
  try {
    if (command === "list") {
      runList(argv.slice(1));
    } else if (command === "show") {
      runShow(argv.slice(1));
    } else if (command === "init-task") {
      runInitTask(argv.slice(1));
    } else if (command === "start") {
      runStart(argv.slice(1));
    } else if (command === "done") {
      runDone(argv.slice(1));
    } else if (command === "block") {
      runBlock(argv.slice(1));
    } else if (command === "resume") {
      runResume(argv.slice(1));
    } else if (command === "archive") {
      runArchive(argv.slice(1));
    } else if (command === "stale") {
      runStale(argv.slice(1));
    } else {
      throw new CliError(
        "usage: codex-workflow {init-task|list|start|block|resume|done|archive|stale|show}",
      );
    }
    return 0;
  } catch (error) {
    if (
      !(error instanceof CliError) &&
      !(error instanceof TaskLifecycleError) &&
      !(error instanceof TaskRepositoryError)
    ) {
      process.stderr.write(`${error.message || String(error)}\n`);
      return 1;
    }
    process.stderr.write(`${error.message}\n`);
    return error.exitCode || 1;
  }
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = {
  ARCHIVE_USAGE,
  BLOCK_USAGE,
  DONE_USAGE,
  INIT_USAGE,
  LIST_USAGE,
  RESUME_USAGE,
  SHOW_USAGE,
  STALE_USAGE,
  START_USAGE,
  listCutoffDay,
  main,
  parseDoneArgs,
  parseListArgs,
  parseReasonArgs,
  parseStaleArgs,
  versionSort,
  workflowRoot,
};
