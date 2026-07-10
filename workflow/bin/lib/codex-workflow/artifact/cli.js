"use strict";

const { TaskRepositoryError } = require("../task/repository");
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

function main(argv) {
  try {
    const command = argv[0];
    if (!Object.hasOwn(USAGE, command)) {
      throw new ArtifactCliError(
        "usage: codex-workflow {scaffold-intake|scaffold-brainstorm|scaffold-clarify|scaffold-team|scaffold-phase}",
      );
    }
    runScaffold(command, argv.slice(1));
    return 0;
  } catch (error) {
    if (
      !(error instanceof ArtifactCliError) &&
      !(error instanceof ArtifactScaffoldError) &&
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
  runScaffold,
};
