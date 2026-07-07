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
  "threads",
];

const THREAD_KEYS = [
  "thread_id",
  "business_trigger",
  "actor_role",
  "business_objects",
  "start_state",
  "allowed_actions",
  "blocked_actions",
  "expected_state_transitions",
  "exception_paths",
  "human_handoff_points",
  "evidence_required",
];

function validateBusinessThreadMap(value) {
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
  expectObjectArray(value, "threads", errors);
  if (Array.isArray(value.threads)) {
    value.threads.forEach((thread, index) => validateThread(thread, index, errors));
  }
  return errors;
}

function validateThread(thread, index, errors) {
  if (!requireObject(thread, errors)) {
    errors.push(`threads[${index}] must be an object`);
    return;
  }
  requireKeys(thread, THREAD_KEYS, errors);
  rejectUnknownKeys(thread, THREAD_KEYS, errors);
  expectSafeId(thread, "thread_id", errors);
  expectString(thread, "business_trigger", errors);
  expectString(thread, "actor_role", errors);
  expectStringArray(thread, "business_objects", errors);
  expectString(thread, "start_state", errors);
  expectStringArray(thread, "allowed_actions", errors);
  expectStringArray(thread, "blocked_actions", errors);
  expectStringArray(thread, "expected_state_transitions", errors);
  expectStringArray(thread, "exception_paths", errors);
  expectStringArray(thread, "human_handoff_points", errors);
  expectStringArray(thread, "evidence_required", errors);
}

module.exports = { validateBusinessThreadMap };
