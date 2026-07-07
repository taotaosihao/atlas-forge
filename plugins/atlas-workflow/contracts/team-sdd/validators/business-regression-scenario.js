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
  "scenario_id",
  "source_scenario_id",
  "regression_goal",
  "trigger",
  "initial_state",
  "expected_agent_behavior",
  "expected_business_state",
  "evidence_required",
  "pass_criteria",
];

function validateBusinessRegressionScenario(value) {
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
  expectSafeId(value, "scenario_id", errors);
  expectSafeId(value, "source_scenario_id", errors);
  expectString(value, "regression_goal", errors);
  expectString(value, "trigger", errors);
  expectStringArray(value, "initial_state", errors);
  expectStringArray(value, "expected_agent_behavior", errors);
  expectStringArray(value, "expected_business_state", errors);
  expectStringArray(value, "evidence_required", errors);
  expectStringArray(value, "pass_criteria", errors);
  return errors;
}

module.exports = { validateBusinessRegressionScenario };
