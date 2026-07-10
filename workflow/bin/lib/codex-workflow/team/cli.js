#!/usr/bin/env node
"use strict";

const { CommandError } = require("../core/command-runtime");
const { TaskRepositoryError } = require("../task/repository");
const {
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
} = require("./commands");

function main(argv) {
  try {
    const command = argv[0];
    let result;
    if (command === "team-record-start") {
      result = runRecordStart(parseRecordStartArgs(argv.slice(1)));
    } else if (command === "team-record-finalize") {
      result = runRecordFinalize(parseRecordFinalizeArgs(argv.slice(1)));
    } else if (command === "team-loop-record") {
      result = runLoopRecord(parseLoopRecordArgs(argv.slice(1)));
    } else if (command === "team-status") {
      result = runStatus(argv.slice(1));
    } else if (command === "team-stop") {
      result = runStop(argv.slice(1));
    } else if (command === "team-promote") {
      result = runPromote(parsePromoteArgs(argv.slice(1)));
    } else {
      throw new CommandError(
        "usage: codex-workflow {team-record-start|team-record-finalize|team-loop-record|team-status|team-stop|team-promote}",
      );
    }
    process.stdout.write(`${result.lines.join("\n")}\n`);
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

module.exports = { main };
