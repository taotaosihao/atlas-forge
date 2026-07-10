"use strict";

const { CommandError } = require("../core/command-runtime");
const { TaskRepositoryError } = require("../task/repository");
const { READY_USAGE, parseReadyArgs, runReady } = require("./readiness");

function writeLines(lines) {
  process.stdout.write(`${lines.join("\n")}\n`);
}

function main(argv) {
  try {
    if (argv[0] !== "ready") {
      throw new CommandError(`usage: codex-workflow {ready}\n${READY_USAGE}`);
    }
    const result = runReady(parseReadyArgs(argv.slice(1)));
    writeLines(result.lines);
    return result.exitCode;
  } catch (error) {
    process.stderr.write(`${error.message || String(error)}\n`);
    if (error instanceof CommandError || error instanceof TaskRepositoryError) {
      return error.exitCode || 1;
    }
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { main, writeLines };
