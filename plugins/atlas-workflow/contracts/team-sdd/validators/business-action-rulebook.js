"use strict";

const {
  requireObject,
  requireKeys,
  rejectUnknownKeys,
  expectString,
  expectInteger,
  expectStringArray,
  expectObjectArray,
  expectSafeId,
} = require("./common");

const KEYS = [
  "schema_version",
  "task_id",
  "actions",
];

const ACTION_KEYS = [
  "action_id",
  "actor_role",
  "risk_level",
  "preconditions",
  "required_context",
  "allowed_business_apis",
  "forbidden_tools",
  "success_state",
  "failure_state",
  "audit_requirements",
  "evidence_required",
];

function validateBusinessActionRulebook(value) {
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
  expectObjectArray(value, "actions", errors);
  if (Array.isArray(value.actions)) {
    value.actions.forEach((action, index) => validateAction(action, index, errors));
  }
  return errors;
}

function validateAction(action, index, errors) {
  if (!requireObject(action, errors)) {
    errors.push(`actions[${index}] must be an object`);
    return;
  }
  requireKeys(action, ACTION_KEYS, errors);
  rejectUnknownKeys(action, ACTION_KEYS, errors);
  expectSafeId(action, "action_id", errors);
  expectString(action, "actor_role", errors);
  expectString(action, "risk_level", errors);
  expectStringArray(action, "preconditions", errors);
  expectStringArray(action, "required_context", errors);
  expectStringArray(action, "allowed_business_apis", errors);
  expectStringArray(action, "forbidden_tools", errors);
  expectString(action, "success_state", errors);
  expectString(action, "failure_state", errors);
  expectStringArray(action, "audit_requirements", errors);
  expectStringArray(action, "evidence_required", errors);
}

module.exports = { validateBusinessActionRulebook };
