"use strict";

const {
  requireObject,
  requireKeys,
  rejectUnknownKeys,
  expectString,
  expectNullableString,
  expectInteger,
  expectStringArray,
  expectSafeId,
} = require("./common");

const REQUIRED_KEYS = [
  "schema_version",
  "task_id",
  "scenario_id",
  "business_goal",
  "entry_role",
  "initial_state",
  "trigger",
  "expected_agent_behavior",
  "expected_business_state",
  "technical_hard_gates",
  "business_evidence_required",
  "technical_evidence_required",
  "pass_criteria",
  "fail_criteria",
];

const KEYS = REQUIRED_KEYS.concat(["slice_id"]);

function validateBusinessScenarioCard(value) {
  const errors = [];
  if (!requireObject(value, errors)) {
    return errors;
  }
  requireKeys(value, REQUIRED_KEYS, errors);
  rejectUnknownKeys(value, KEYS, errors);
  expectInteger(value, "schema_version", errors);
  if (value.schema_version !== 1) {
    errors.push("schema_version must be 1");
  }
  expectSafeId(value, "task_id", errors);
  expectSafeId(value, "scenario_id", errors);
  if ("slice_id" in value) {
    expectNullableString(value, "slice_id", errors);
  }
  expectString(value, "business_goal", errors);
  expectString(value, "entry_role", errors);
  expectStringArray(value, "initial_state", errors);
  expectString(value, "trigger", errors);
  expectStringArray(value, "expected_agent_behavior", errors);
  expectStringArray(value, "expected_business_state", errors);
  expectStringArray(value, "technical_hard_gates", errors);
  expectStringArray(value, "business_evidence_required", errors);
  expectStringArray(value, "technical_evidence_required", errors);
  expectStringArray(value, "pass_criteria", errors);
  expectStringArray(value, "fail_criteria", errors);
  return errors;
}

module.exports = { validateBusinessScenarioCard };
