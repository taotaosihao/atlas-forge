"use strict";

const {
  requireObject,
  requireKeys,
  rejectUnknownKeys,
  expectInteger,
  expectEnum,
  expectStringArray,
  expectSafeId,
} = require("./common");

const KEYS = [
  "schema_version",
  "task_id",
  "verdict",
  "technical_gate_status",
  "business_acceptance_status",
  "required_followups",
];

const ACCEPTANCE_LEVELS = ["accepted", "conditionally_accepted", "rejected", "blocked"];
const STATUS_LEVELS = ["passed", "failed", "blocked", "not_run"];

function validateBusinessVerdict(value) {
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
  expectEnum(value, "verdict", ACCEPTANCE_LEVELS, errors);
  expectEnum(value, "technical_gate_status", STATUS_LEVELS, errors);
  expectEnum(value, "business_acceptance_status", STATUS_LEVELS, errors);
  expectStringArray(value, "required_followups", errors);
  return errors;
}

module.exports = { validateBusinessVerdict };
