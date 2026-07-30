"use strict";

const { TaskRepositoryError } = require("../task/repository");
const { CHECKPOINT_USAGE, parseCheckpointArgs, writeCheckpoint } = require("./checkpoint");
const {
  PROMPT_USAGE,
  SOURCE_USAGE,
  parsePromptArgs,
  parseSourceArgs,
  writePromptBundle,
  writeSourceSnapshot,
} = require("./provenance");
const { ROUTE_USAGE, parseRouteArgs, writeRouteDecision } = require("./routing");
const { ArtifactError } = require("./runtime");
const { PhaseReportError, writePhaseReportProjection } = require("./phase-report");
const {
  ArtifactScaffoldError,
  scaffoldBrainstorm,
  scaffoldClarify,
  scaffoldIntake,
  scaffoldPhase,
  scaffoldTeam,
} = require("./scaffold");

const USAGE = {
  "scaffold-intake": "usage: codex-workflow scaffold-intake <task-id>",
  "scaffold-brainstorm": "usage: codex-workflow scaffold-brainstorm <task-id>",
  "scaffold-clarify": "usage: codex-workflow scaffold-clarify <task-id>",
  "scaffold-team": "usage: codex-workflow scaffold-team <task-id>",
  "scaffold-phase": "usage: codex-workflow scaffold-phase <task-id> <phase-id>",
  "project-phase-report": "usage: codex-workflow project-phase-report <task-id> <phase-id>",
  "route-decision": ROUTE_USAGE,
  checkpoint: CHECKPOINT_USAGE,
  "source-snapshot": SOURCE_USAGE,
  "prompt-bundle": PROMPT_USAGE,
};

class ArtifactCliError extends Error {
  constructor(message) {
    super(message);
    this.name = "ArtifactCliError";
  }
}

function writeLines(lines) {
  process.stdout.write(`${lines.join("\n")}\n`);
}

function runScaffold(command, argv, environment = process.env) {
  if (command === "scaffold-phase") {
    if (argv.length !== 2) {
      throw new ArtifactCliError(USAGE[command]);
    }
    writeLines(scaffoldPhase(argv[0], argv[1], { environment }));
    return;
  }
  if (argv.length !== 1) {
    throw new ArtifactCliError(USAGE[command]);
  }
  const handlers = {
    "scaffold-intake": scaffoldIntake,
    "scaffold-brainstorm": scaffoldBrainstorm,
    "scaffold-clarify": scaffoldClarify,
    "scaffold-team": scaffoldTeam,
  };
  writeLines(handlers[command](argv[0], { environment }));
}

function runPlanning(command, argv, environment = process.env) {
  if (command === "project-phase-report") {
    if (argv.length !== 2) throw new ArtifactCliError(USAGE[command]);
    const result = writePhaseReportProjection(argv[0], argv[1], { environment });
    writeLines([`projected\t${result.file}`]);
  } else if (command === "route-decision") {
    const parsed = parseRouteArgs(argv);
    if (parsed.help) {
      process.stderr.write(`${ROUTE_USAGE}\n`);
      return;
    }
    writeLines(writeRouteDecision(parsed, { environment }));
  } else if (command === "checkpoint") {
    writeLines(writeCheckpoint(parseCheckpointArgs(argv), { environment }));
  } else if (command === "source-snapshot") {
    writeLines(writeSourceSnapshot(parseSourceArgs(argv), { environment }));
  } else if (command === "prompt-bundle") {
    writeLines(writePromptBundle(parsePromptArgs(argv), { environment }));
  }
}

function main(argv) {
  try {
    const command = argv[0];
    if (!Object.hasOwn(USAGE, command)) {
      throw new ArtifactCliError(
        "usage: codex-workflow {scaffold-intake|scaffold-brainstorm|scaffold-clarify|scaffold-team|scaffold-phase}",
      );
    }
    if (command.startsWith("scaffold-")) {
      runScaffold(command, argv.slice(1));
    } else {
      runPlanning(command, argv.slice(1));
    }
    return 0;
  } catch (error) {
    if (
      !(error instanceof ArtifactCliError) &&
      !(error instanceof ArtifactError) &&
      !(error instanceof ArtifactScaffoldError) &&
      !(error instanceof PhaseReportError) &&
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
  ArtifactCliError,
  USAGE,
  main,
  runPlanning,
  runScaffold,
};
