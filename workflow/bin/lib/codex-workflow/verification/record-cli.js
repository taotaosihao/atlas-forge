#!/usr/bin/env node
"use strict";

const { writeVerificationRecord } = require("./record");

function main(argv) {
  try {
    const evidenceCount = Number(argv[14] || "0");
    writeVerificationRecord({
      recordFile: argv[0],
      recordType: argv[1],
      taskId: argv[2],
      commandText: argv[3],
      cwd: argv[4],
      exitCode: argv[5],
      verdict: argv[6],
      stdoutFile: argv[7],
      stderrFile: argv[8],
      createdAt: argv[9],
      outcome: argv[10] || "",
      trajectory: argv[11] || "",
      evaluator: argv[12] || "",
      failureAttribution: argv[13] || "",
      evidenceRefs: argv.slice(15, 15 + evidenceCount),
    });
    return 0;
  } catch (error) {
    process.stderr.write(`${error.message || String(error)}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { main };
