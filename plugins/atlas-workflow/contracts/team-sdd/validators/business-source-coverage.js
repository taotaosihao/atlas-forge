"use strict";

const {
  requireObject,
  requireKeys,
  rejectUnknownKeys,
  expectString,
  expectInteger,
  expectEnum,
  expectStringArray,
  expectObjectArray,
  expectSafeId,
} = require("./common");

const KEYS = [
  "schema_version",
  "task_id",
  "sources",
  "coverage_gaps",
  "conflicts",
  "coverage_summary",
];

const SOURCE_KEYS = [
  "source_id",
  "source_type",
  "description",
  "refs",
  "coverage_status",
  "covered_threads",
];

const SOURCE_TYPES = [
  "sop",
  "process_diagram",
  "policy",
  "customer_requirement",
  "historical_chat",
  "work_order_log",
  "interview",
  "system_screenshot",
  "system_export",
  "other",
];

function validateBusinessSourceCoverage(value) {
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
  expectObjectArray(value, "sources", errors);
  expectStringArray(value, "coverage_gaps", errors);
  expectStringArray(value, "conflicts", errors);
  expectString(value, "coverage_summary", errors);
  if (Array.isArray(value.sources)) {
    value.sources.forEach((source, index) => validateSource(source, index, errors));
  }
  return errors;
}

function validateSource(source, index, errors) {
  if (!requireObject(source, errors)) {
    errors.push(`sources[${index}] must be an object`);
    return;
  }
  requireKeys(source, SOURCE_KEYS, errors);
  rejectUnknownKeys(source, SOURCE_KEYS, errors);
  expectSafeId(source, "source_id", errors);
  expectEnum(source, "source_type", SOURCE_TYPES, errors);
  expectString(source, "description", errors);
  expectStringArray(source, "refs", errors);
  expectEnum(source, "coverage_status", ["covered", "partial", "missing", "conflicting"], errors);
  expectStringArray(source, "covered_threads", errors);
}

module.exports = { validateBusinessSourceCoverage };
