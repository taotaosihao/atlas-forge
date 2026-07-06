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

const KEYS = [
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
  "max_question_rounds",
  "fix_loop_policy",
  "output_contract",
];

function validateBrief(value) {
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
  expectAbsoluteExistingDir(value, "repo", errors);
  expectString(value, "base_sha", errors);
  expectString(value, "objective", errors);
  expectString(value, "requirements_path", errors);
  expectString(value, "global_constraints_path", errors);
  expectStringArray(value, "owned_paths", errors);
  expectStringArray(value, "forbidden_paths", errors);
  expectStringArray(value, "acceptance_refs", errors);
  expectStringArray(value, "required_checks", errors);
  expectEnum(value, "commit_policy", ["required_for_file_changes", "required_always", "no_change_allowed"], errors);
  expectPositiveInteger(value, "max_question_rounds", errors);
  expectEnum(value, "fix_loop_policy", ["unbounded_until_clean_or_terminal"], errors);
  expectEnum(value, "output_contract", ["final_message_json_only"], errors);
  expectGitRevision(value.repo, value.base_sha, "base_sha", errors);
  return errors;
}

module.exports = { validateBrief };
