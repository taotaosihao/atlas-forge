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

const KEYS = [
  "schema_version",
  "task_id",
  "deviation_id",
  "deviation_type",
  "severity",
  "status",
  "scenario_id",
  "description",
  "owner",
  "evidence_refs",
  "resolution_plan",
];

const DEVIATION_TYPES = [
  "implementation_defect",
  "technical_gate_failure",
  "business_rule_gap",
  "process_fidelity_gap",
  "ux_operability_gap",
  "evidence_gap",
  "source_conflict",
  "scope_mismatch",
];

function validateBusinessDeviationLog(value) {
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
  expectSafeId(value, "deviation_id", errors);
  expectEnum(value, "deviation_type", DEVIATION_TYPES, errors);
  expectEnum(value, "severity", ["P0", "P1", "P2", "P3"], errors);
  expectEnum(value, "status", ["open", "resolved", "accepted_risk"], errors);
  expectSafeId(value, "scenario_id", errors);
  expectString(value, "description", errors);
  expectString(value, "owner", errors);
  expectStringArray(value, "evidence_refs", errors);
  expectString(value, "resolution_plan", errors);
  return errors;
}

module.exports = { validateBusinessDeviationLog };
