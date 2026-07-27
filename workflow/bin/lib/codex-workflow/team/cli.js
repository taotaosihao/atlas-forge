#!/usr/bin/env node
"use strict";

const { CommandError } = require("../core/command-runtime");
const { TaskRepositoryError } = require("../task/repository");
const {
  parseAttemptArgs,
  parseDispatchArgs,
  parseFallbackArgs,
  parseLaneArgs,
  parseLoopRecordArgs,
  parsePromoteArgs,
  parseRecordFinalizeArgs,
  parseRecordStartArgs,
  parseSelectionArgs,
  runAttemptRecord,
  runDispatchRecord,
  runFallbackRecord,
  runLaneRecord,
  runLoopRecord,
  runPromote,
  runRecordFinalize,
  runRecordStart,
  runSelectionRecord,
  runStatus,
  runStop,
} = require("./commands");
const {
  parseSliceAcceptArgs,
  parseSliceSupersedeArgs,
  runSliceAccept,
  runSliceSupersede,
} = require("./slice-acceptance");

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
    } else if (command === "team-selection-record") {
      result = runSelectionRecord(parseSelectionArgs(argv.slice(1)));
    } else if (command === "team-lane-record") {
      result = runLaneRecord(parseLaneArgs(argv.slice(1)));
    } else if (command === "team-dispatch-record") {
      result = runDispatchRecord(parseDispatchArgs(argv.slice(1)));
    } else if (command === "team-attempt-record") {
      result = runAttemptRecord(parseAttemptArgs(argv.slice(1)));
    } else if (command === "team-fallback-record") {
      result = runFallbackRecord(parseFallbackArgs(argv.slice(1)));
    } else if (command === "team-slice-accept") {
      result = runSliceAccept(parseSliceAcceptArgs(argv.slice(1)));
    } else if (command === "team-slice-supersede") {
      result = runSliceSupersede(parseSliceSupersedeArgs(argv.slice(1)));
    } else {
      throw new CommandError(
        "usage: codex-workflow {team-record-start|team-record-finalize|team-loop-record|team-status|team-stop|team-promote|team-selection-record|team-lane-record|team-dispatch-record|team-attempt-record|team-fallback-record|team-slice-accept|team-slice-supersede}",
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
