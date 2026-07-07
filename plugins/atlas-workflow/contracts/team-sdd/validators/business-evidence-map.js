"use strict";

const {
  requireObject,
  requireKeys,
  rejectUnknownKeys,
  expectString,
  expectInteger,
  expectEnum,
  expectObjectArray,
  expectSafeId,
} = require("./common");

const KEYS = [
  "schema_version",
  "task_id",
  "evidence_refs",
];

const EVIDENCE_REF_KEYS = [
  "evidence_id",
  "scenario_id",
  "source_type",
  "description",
  "evidence_path",
  "result",
];

function validateBusinessEvidenceMap(value) {
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
  expectObjectArray(value, "evidence_refs", errors);
  if (Array.isArray(value.evidence_refs)) {
    value.evidence_refs.forEach((ref, index) => validateEvidenceRef(ref, index, errors));
  }
  return errors;
}

function validateEvidenceRef(ref, index, errors) {
  if (!requireObject(ref, errors)) {
    errors.push(`evidence_refs[${index}] must be an object`);
    return;
  }
  requireKeys(ref, EVIDENCE_REF_KEYS, errors);
  rejectUnknownKeys(ref, EVIDENCE_REF_KEYS, errors);
  expectSafeId(ref, "evidence_id", errors);
  expectSafeId(ref, "scenario_id", errors);
  expectEnum(ref, "source_type", ["local", "external", "manual"], errors);
  expectString(ref, "description", errors);
  expectString(ref, "evidence_path", errors);
  expectString(ref, "result", errors);
}

module.exports = { validateBusinessEvidenceMap };
