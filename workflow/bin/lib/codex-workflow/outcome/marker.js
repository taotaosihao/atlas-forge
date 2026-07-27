"use strict";

const { resolvePaths } = require("../core/paths");
const { derivedLegacyRows, recordTaskRuntimeEvent } = require("../core/task-mutation");
const { requireTaskFile, taskFile, validateTaskFile } = require("../task/repository");
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
  requireTaskFile(paths.tasksDir, taskId);
  validateTaskFile(file);
  const data = {
    evidence,
    applicable: !notApplicableRequested,
    ...(notApplicableRequested ? { not_applicable_reason: notApplicableReason } : {}),
  };
  const eventId = options.eventId ? options.eventId() : "";
  const committed = recordTaskRuntimeEvent(
    paths,
    taskId,
    {
      kind: outcomeEventKind(kind),
      operationId: options.operationId,
      data,
    },
    {
      schema_version: 1,
      event_id: eventId,
      kind: outcomeEventKind(kind),
      data,
    },
    {
      ...options,
      environment,
      ...(eventId ? { eventId: () => eventId } : {}),
    },
  );
  return derivedLegacyRows(committed.event)[0];
}

module.exports = {
  OutcomeMarkerError,
  markOutcome,
  validateSingleLine,
};
