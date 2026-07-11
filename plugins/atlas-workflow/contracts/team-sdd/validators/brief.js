"use strict";

const {
  requireObject,
  requireKeys,
  rejectUnknownKeys,
  expectString,
  expectInteger,
  expectPositiveInteger,
  expectEnum,
  expectStringArray,
  expectSafeId,
  expectAbsoluteExistingDir,
  expectGitRevision,
} = require("./common");

const BASE_KEYS = [
  "schema_version",
  "task_id",
  "slice_id",
  "repo",
  "base_sha",
  "objective",
  "requirements_path",
  "global_constraints_path",
  "owned_paths",
  "forbidden_paths",
  "acceptance_refs",
  "required_checks",
  "commit_policy",
  "output_contract",
];

const V1_KEYS = [...BASE_KEYS, "max_question_rounds", "fix_loop_policy"];
const V2_KEYS = BASE_KEYS;

function validateBrief(value) {
  const errors = [];
  if (!requireObject(value, errors)) {
    return errors;
  }
  expectInteger(value, "schema_version", errors);
  if (![1, 2].includes(value.schema_version)) {
    errors.push("schema_version must be one of: 1, 2");
    return errors;
  }
  const keys = value.schema_version === 1 ? V1_KEYS : V2_KEYS;
  requireKeys(value, keys, errors);
  rejectUnknownKeys(value, keys, errors);
  expectSafeId(value, "task_id", errors);
  expectSafeId(value, "slice_id", errors);
  expectAbsoluteExistingDir(value, "repo", errors);
  expectString(value, "base_sha", errors);
  expectString(value, "objective", errors);
  expectString(value, "requirements_path", errors);
  expectString(value, "global_constraints_path", errors);
  expectStringArray(value, "owned_paths", errors);
  expectStringArray(value, "forbidden_paths", errors);
  expectStringArray(value, "acceptance_refs", errors);
  expectStringArray(value, "required_checks", errors);
  if (value.schema_version === 1) {
    expectEnum(value, "commit_policy", ["required_for_file_changes", "required_always", "no_change_allowed"], errors);
    expectPositiveInteger(value, "max_question_rounds", errors);
    expectEnum(value, "fix_loop_policy", ["unbounded_until_clean_or_terminal"], errors);
  } else {
    expectEnum(value, "commit_policy", ["logical_outcome", "changes_allowed_no_commit", "no_change_allowed"], errors);
  }
  expectEnum(value, "output_contract", ["final_message_json_only"], errors);
  expectGitRevision(value.repo, value.base_sha, "base_sha", errors);
  return errors;
}

module.exports = { validateBrief };
