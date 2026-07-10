"use strict";

const { CommandError } = require("../core/command-runtime");
const { TaskRepositoryError } = require("../task/repository");
const { READY_USAGE, parseReadyArgs, runReady } = require("./readiness");
const { VERIFY_USAGE, parseVerifyArgs, runVerification } = require("./runner");

function writeLines(lines) {
  process.stdout.write(`${lines.join("\n")}\n`);
}

function main(argv) {
  try {
    let result;
    if (argv[0] === "ready") {
      result = runReady(parseReadyArgs(argv.slice(1)));
    } else if (argv[0] === "verify") {
      result = runVerification(parseVerifyArgs(argv.slice(1)));
    } else {
      throw new CommandError(
        `usage: codex-workflow {ready|verify}\n${READY_USAGE}\n${VERIFY_USAGE}`,
      );
    }
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
