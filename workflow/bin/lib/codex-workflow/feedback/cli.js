#!/usr/bin/env node
"use strict";

const { CommandError } = require("../core/command-runtime");
const { TaskRepositoryError } = require("../task/repository");
const {
  FEEDBACK_USAGE,
  LEARNING_DECISION_USAGE,
  LESSON_USAGE,
  TRACE_USAGE,
  parseFeedbackArgs,
  parseLearningDecisionArgs,
  parseLessonArgs,
  parseTraceArgs,
  runFeedbackCycle,
  runLearningDecision,
  runLessonCandidate,
  runTracePromotion,
} = require("./commands");

const COMMANDS = {
  "trace-promote": [parseTraceArgs, runTracePromotion],
  "feedback-cycle": [parseFeedbackArgs, runFeedbackCycle],
  "lesson-candidate": [parseLessonArgs, runLessonCandidate],
  "learning-decision": [parseLearningDecisionArgs, runLearningDecision],
};

function main(argv) {
  try {
    if (!Object.hasOwn(COMMANDS, argv[0])) {
      throw new CommandError(
        `usage: codex-workflow {trace-promote|feedback-cycle|lesson-candidate|learning-decision}\n${TRACE_USAGE}\n${FEEDBACK_USAGE}\n${LESSON_USAGE}\n${LEARNING_DECISION_USAGE}`,
      );
    }
    const [parse, run] = COMMANDS[argv[0]];
    const result = run(parse(argv.slice(1)));
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

module.exports = { COMMANDS, main };
