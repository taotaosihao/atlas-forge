"use strict";

const { TaskRepositoryError } = require("../task/repository");
const { OutcomeMarkerError, markOutcome } = require("./marker");

const MARK_USAGE =
  'usage: codex-workflow outcome-mark <task-id> --kind first-code|operable-flow|clean-review --evidence <path-or-url> [--not-applicable "<reason>"]';

class OutcomeCliError extends Error {
  constructor(message) {
    super(message);
    this.name = "OutcomeCliError";
  }
}

function parseMarkArgs(argv) {
  if (argv.length < 1) {
    throw new OutcomeCliError(MARK_USAGE);
  }
  const taskId = argv[0];
  let kind = "";
  let evidence = "";
  let notApplicableReason = "";
  let notApplicableRequested = false;

  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--kind" && index + 1 < argv.length) {
      kind = argv[++index];
    } else if (argument.startsWith("--kind=")) {
      kind = argument.slice("--kind=".length);
    } else if (argument === "--evidence" && index + 1 < argv.length) {
      evidence = argv[++index];
    } else if (argument.startsWith("--evidence=")) {
      evidence = argument.slice("--evidence=".length);
    } else if (argument === "--not-applicable" && index + 1 < argv.length) {
      notApplicableReason = argv[++index];
      notApplicableRequested = true;
    } else if (argument.startsWith("--not-applicable=")) {
      notApplicableReason = argument.slice("--not-applicable=".length);
      notApplicableRequested = true;
    } else {
      throw new OutcomeCliError(MARK_USAGE);
    }
  }

  if (!kind) {
    throw new OutcomeCliError("missing required argument: --kind");
  }
  if (!evidence) {
    throw new OutcomeCliError("missing required argument: --evidence");
  }
  return { evidence, kind, notApplicableReason, notApplicableRequested, taskId };
}

function runMark(argv, environment = process.env) {
  const { taskId, kind, evidence, ...options } = parseMarkArgs(argv);
  const event = markOutcome(taskId, kind, evidence, { ...options, environment });
  process.stdout.write(
    [
      `task_id: ${taskId}`,
      `kind: ${kind}`,
      `event_id: ${event.event_id}`,
      `event: ${event.kind}`,
      `evidence: ${evidence}`,
      `applicable: ${event.data.applicable}`,
      "",
    ].join("\n"),
  );
}

function main(argv) {
  try {
    if (argv[0] === "outcome-mark") {
      runMark(argv.slice(1));
    } else {
      throw new OutcomeCliError("usage: codex-workflow {outcome-mark}");
    }
    return 0;
  } catch (error) {
    if (
      !(error instanceof OutcomeCliError) &&
      !(error instanceof OutcomeMarkerError) &&
      !(error instanceof TaskRepositoryError)
    ) {
      process.stderr.write(`${error.message || String(error)}\n`);
      return 1;
    }
    process.stderr.write(`${error.message}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = {
  MARK_USAGE,
  main,
  parseMarkArgs,
};
