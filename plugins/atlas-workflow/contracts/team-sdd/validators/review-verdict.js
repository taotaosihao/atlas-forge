"use strict";

const {
  isObject,
  requireObject,
  requireKeys,
  rejectUnknownKeys,
  expectString,
  expectInteger,
  expectEnum,
  expectStringArray,
  expectArray,
  expectSafeId,
} = require("./common");

const KEYS = [
  "schema_version",
  "task_id",
  "slice_id",
  "base_sha",
  "head_sha",
  "spec_compliance",
  "task_quality",
  "issues",
  "cannot_verify_from_diff",
  "strengths",
  "reviewed_inputs",
];

function validateReviewVerdict(value) {
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
  expectSafeId(value, "slice_id", errors);
  expectString(value, "base_sha", errors);
  expectString(value, "head_sha", errors);
  expectEnum(value, "spec_compliance", ["pass", "fail", "cannot_verify"], errors);
  expectEnum(value, "task_quality", ["pass", "fail"], errors);
  expectArray(value, "issues", errors);
  expectArray(value, "cannot_verify_from_diff", errors);
  expectStringArray(value, "strengths", errors);
  if (!isObject(value.reviewed_inputs)) {
    errors.push("reviewed_inputs must be an object");
  }
  if (Array.isArray(value.issues)) {
    value.issues.forEach((issue, index) => validateIssue(issue, index, errors));
  }
  return errors;
}

function validateIssue(issue, index, errors) {
  if (!isObject(issue)) {
    errors.push(`issues[${index}] must be an object`);
    return;
  }
  for (const key of ["severity", "category", "path", "evidence", "required_fix"]) {
    if (typeof issue[key] !== "string" || issue[key].length === 0) {
      errors.push(`issues[${index}].${key} must be a non-empty string`);
    }
  }
  if (!["Critical", "Important", "Minor"].includes(issue.severity)) {
    errors.push(`issues[${index}].severity is invalid`);
  }
  if ("line" in issue && issue.line !== null && !Number.isInteger(issue.line)) {
    errors.push(`issues[${index}].line must be an integer or null`);
  }
}

module.exports = { validateReviewVerdict };
