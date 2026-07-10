"use strict";

const { appendStructuredEvent } = require("../core/event-store");
const { taskLockFile, withLock } = require("../core/lock");
const { resolvePaths } = require("../core/paths");
const { requireTaskFile, taskFile, validateTaskFile } = require("../task/repository");
const { taskRuntimeFile } = require("../task/runtime");
const { OUTCOME_KIND_SET, outcomeEventKind } = require("./schema");

class OutcomeMarkerError extends Error {
  constructor(message) {
    super(message);
    this.name = "OutcomeMarkerError";
  }
}

function validateSingleLine(label, value) {
  if (!value || /[\n\r\t]/.test(value) || /^\s*$/.test(value)) {
    throw new OutcomeMarkerError(`${label} must be a single non-empty line`);
  }
}

function markOutcome(
  taskId,
  kind,
  evidence,
  { notApplicableReason = "", notApplicableRequested = false, ...options } = {},
) {
  if (!OUTCOME_KIND_SET.has(kind)) {
    throw new OutcomeMarkerError(`invalid outcome kind: ${kind}`);
  }
  validateSingleLine("outcome evidence", evidence);
  if (notApplicableRequested) {
    validateSingleLine("not-applicable reason", notApplicableReason);
  }

  const environment = options.environment || process.env;
  const paths = options.paths || resolvePaths(environment);
  const file = taskFile(paths.tasksDir, taskId);
  return withLock(taskLockFile(paths, file), () => {
    requireTaskFile(paths.tasksDir, taskId);
    validateTaskFile(file);
    return appendStructuredEvent(taskRuntimeFile(paths, taskId), {
      taskId,
      kind: outcomeEventKind(kind),
      data: {
        evidence,
        applicable: !notApplicableRequested,
        ...(notApplicableRequested
          ? { not_applicable_reason: notApplicableReason }
          : {}),
      },
      clock: options.clock,
      eventId: options.eventId,
    });
  });
}

module.exports = {
  OutcomeMarkerError,
  markOutcome,
  validateSingleLine,
};
