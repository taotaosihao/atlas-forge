"use strict";

const { CommandError } = require("../core/command-runtime");
const { TaskRepositoryError } = require("../task/repository");
const {
  GATE_METRIC_USAGE,
  GATE_REPORT_USAGE,
  parseGateMetricArgs,
  parseGateReportArgs,
  runGateMetric,
  runGateReport,
} = require("./gates");
const { READY_USAGE, parseReadyArgs, runReady } = require("./readiness");
const {
  VERIFY_RESOLVE_USAGE,
  VERIFY_USAGE,
  parseVerifyArgs,
  parseVerifyResolveArgs,
  runVerification,
  runVerificationResolution,
} = require("./runner");

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
    } else if (argv[0] === "verify-resolve") {
      result = runVerificationResolution(parseVerifyResolveArgs(argv.slice(1)));
    } else if (argv[0] === "gate-metric") {
      result = runGateMetric(parseGateMetricArgs(argv.slice(1)));
    } else if (argv[0] === "gate-report") {
      result = runGateReport(parseGateReportArgs(argv.slice(1)));
    } else {
      throw new CommandError(
        `usage: codex-workflow {ready|verify|verify-resolve|gate-metric|gate-report}\n${READY_USAGE}\n${VERIFY_USAGE}\n${VERIFY_RESOLVE_USAGE}\n${GATE_METRIC_USAGE}\n${GATE_REPORT_USAGE}`,
      );
    }
    if (result.output !== undefined) {
      process.stdout.write(result.output);
    } else {
      writeLines(result.lines);
    }
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
