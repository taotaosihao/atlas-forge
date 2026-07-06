"use strict";

const {
  requireObject,
  requireKeys,
  rejectUnknownKeys,
  expectInteger,
  expectString,
  expectSafeId,
  isObject,
} = require("./common");

const KEYS = [
  "schema_version",
  "task_id",
  "slice_id",
  "role",
  "model",
  "status",
  "event",
  "timestamp",
  "duration_ms",
  "metadata",
];

function validateScorecardEvent(value) {
  const errors = [];
  if (!requireObject(value, errors)) {
    return errors;
  }
  requireKeys(value, ["schema_version", "task_id", "slice_id", "role", "model", "status", "event", "timestamp"], errors);
  rejectUnknownKeys(value, KEYS, errors);
  expectInteger(value, "schema_version", errors);
  if (value.schema_version !== 1) {
    errors.push("schema_version must be 1");
  }
  expectSafeId(value, "task_id", errors);
  expectSafeId(value, "slice_id", errors);
  expectString(value, "role", errors);
  expectString(value, "model", errors);
  expectString(value, "status", errors);
  expectString(value, "event", errors);
  expectString(value, "timestamp", errors);
  if ("duration_ms" in value && value.duration_ms !== null && (!Number.isInteger(value.duration_ms) || value.duration_ms < 0)) {
    errors.push("duration_ms must be a non-negative integer or null");
  }
  if ("metadata" in value && !isObject(value.metadata)) {
    errors.push("metadata must be an object");
  }
  return errors;
}

module.exports = { validateScorecardEvent };
