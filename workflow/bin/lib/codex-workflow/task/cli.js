"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  TaskRepositoryError,
  listTaskRecords,
  requireTaskFile,
  validateTaskFile,
} = require("./repository");

const LIST_USAGE = "usage: codex-workflow list [--all|--days <n>|--days=<n>]";
const SHOW_USAGE = "usage: codex-workflow show <task-id>";

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

function workflowRoot(environment = process.env) {
  return environment.CODEX_WORKFLOW_ROOT || path.resolve(__dirname, "../../../..");
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
  const tasksDir = path.join(workflowRoot(environment), "tasks");
  const lines = listTaskRecords(tasksDir, cutoffDay).map(
    (task) => `${task.status}\t${task.id}\t${task.title.replace(/\t/g, " ")}`,
  );
  process.stdout.write(versionSort(lines));
}

function runShow(argv, environment = process.env) {
  if (argv.length !== 1) {
    throw new CliError(SHOW_USAGE);
  }
  const tasksDir = path.join(workflowRoot(environment), "tasks");
  const file = requireTaskFile(tasksDir, argv[0]);
  validateTaskFile(file);
  process.stdout.write(fs.readFileSync(file));
}

function main(argv) {
  const command = argv[0];
  try {
    if (command === "list") {
      runList(argv.slice(1));
    } else if (command === "show") {
      runShow(argv.slice(1));
    } else {
      throw new CliError("usage: codex-workflow {list|show}");
    }
    return 0;
  } catch (error) {
    if (!(error instanceof CliError) && !(error instanceof TaskRepositoryError)) {
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
  LIST_USAGE,
  SHOW_USAGE,
  listCutoffDay,
  main,
  parseListArgs,
  versionSort,
  workflowRoot,
};
