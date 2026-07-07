"use strict";

const {
  requireObject,
  requireKeys,
  rejectUnknownKeys,
  expectString,
  expectInteger,
  expectStringArray,
  expectSafeId,
} = require("./common");

const KEYS = [
  "schema_version",
  "task_id",
  "business_goal",
  "agent_responsibility",
  "excluded_scope",
  "stakeholders",
  "success_definition",
  "risk_boundaries",
];

function validateBusinessIntent(value) {
  const errors = [];
  if (!requireObject(value, errors)) {
    return errors;
  }
  requireKeys(value, KEYS, errors);
  rejectUnknownKeys(value, KEYS, errors);
  expectInteger(value, "schema_version", errors);
  if (value.schema_version !== 1) {
    errors.push("schema_version must be 1");
  }
  expectSafeId(value, "task_id", errors);
  expectString(value, "business_goal", errors);
  expectString(value, "agent_responsibility", errors);
  expectStringArray(value, "excluded_scope", errors);
  expectStringArray(value, "stakeholders", errors);
  expectStringArray(value, "success_definition", errors);
  expectStringArray(value, "risk_boundaries", errors);
  if (Array.isArray(value.success_definition) && value.success_definition.length === 0) {
    errors.push("success_definition must contain at least one item");
  }
  return errors;
}

module.exports = { validateBusinessIntent };
