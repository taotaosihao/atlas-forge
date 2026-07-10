"use strict";

const {
  requireObject,
  requireKeys,
  rejectUnknownKeys,
  expectString,
  expectInteger,
  expectEnum,
  expectStringArray,
  expectSafeId,
} = require("./common");

const V1_KEYS = [
  "schema_version",
  "task_id",
  "business_goal",
  "agent_responsibility",
  "excluded_scope",
  "stakeholders",
  "success_definition",
  "risk_boundaries",
];

const V2_KEYS = [
  "schema_version",
  "task_id",
  "closure_mode",
  "business_goal",
  "agent_responsibility",
  "excluded_scope",
  "stakeholders",
  "success_definition",
  "risk_boundaries",
];

function validateBusinessIntent(value, options = {}) {
  const errors = [];
  if (!requireObject(value, errors)) {
    return errors;
  }
  const keys = value.schema_version === 2 ? V2_KEYS : V1_KEYS;
  requireKeys(value, keys, errors);
  rejectUnknownKeys(value, keys, errors);
  expectInteger(value, "schema_version", errors);
  if (![1, 2].includes(value.schema_version)) {
    errors.push("schema_version must be 1 or 2");
  }
  if (options.strict === true && value.schema_version !== 2) {
    errors.push("strict business acceptance requires schema_version 2");
  }
  expectSafeId(value, "task_id", errors);
  if (value.schema_version === 2) {
    expectEnum(value, "closure_mode", ["standard", "dual_goal"], errors);
  }
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
