"use strict";

const {
  requireObject,
  requireKeys,
  rejectUnknownKeys,
  expectString,
  expectNullableString,
  expectInteger,
  expectEnum,
  expectStringArray,
  expectArray,
  expectSafeId,
} = require("./common");

const KEYS = [
  "schema_version",
  "status",
  "task_id",
  "slice_id",
  "base_sha",
  "head_sha",
  "commits",
  "changed_files",
  "checks",
  "self_review",
  "concerns",
  "questions",
  "blockers",
  "no_change_reason",
];

function validateCommitPolicy(value, commitPolicy) {
  const errors = [];
  const commits = Array.isArray(value.commits) ? value.commits : [];
  const changedFiles = Array.isArray(value.changed_files) ? value.changed_files : [];
  if (["required_for_file_changes", "required_always"].includes(commitPolicy)
      && (commitPolicy === "required_always" || changedFiles.length > 0)
      && commits.length === 0) {
    errors.push(`commit_policy ${commitPolicy} requires commits`);
  }
  if (commitPolicy === "changes_allowed_no_commit" && commits.length > 0) {
    errors.push("commit_policy changes_allowed_no_commit forbids commits");
  }
  if (commitPolicy === "no_change_allowed" && (changedFiles.length > 0 || commits.length > 0)) {
    errors.push("commit_policy no_change_allowed forbids changed_files and commits");
  }
  return errors;
}

function validateImplementerReport(value, options = {}) {
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
  expectEnum(value, "status", ["DONE", "DONE_WITH_CONCERNS", "NEEDS_CONTEXT", "BLOCKED"], errors);
  expectSafeId(value, "task_id", errors);
  expectSafeId(value, "slice_id", errors);
  expectString(value, "base_sha", errors);
  expectNullableString(value, "head_sha", errors);
  expectStringArray(value, "commits", errors);
  expectStringArray(value, "changed_files", errors);
  expectArray(value, "checks", errors);
  expectString(value, "self_review", errors, { allowEmpty: true });
  expectArray(value, "concerns", errors);
  expectStringArray(value, "questions", errors);
  expectStringArray(value, "blockers", errors);
  expectNullableString(value, "no_change_reason", errors);

  if ((value.status === "DONE" || value.status === "DONE_WITH_CONCERNS") && Array.isArray(value.changed_files) && value.changed_files.length > 0) {
    if (!value.head_sha) {
      errors.push("head_sha is required when changed_files is non-empty");
    }
  }
  if (value.status === "NEEDS_CONTEXT" && Array.isArray(value.questions) && value.questions.length === 0) {
    errors.push("NEEDS_CONTEXT requires questions");
  }
  if (value.status === "BLOCKED" && Array.isArray(value.blockers) && value.blockers.length === 0) {
    errors.push("BLOCKED requires blockers");
  }
  if (options.commitPolicy) {
    errors.push(...validateCommitPolicy(value, options.commitPolicy));
  }
  return errors;
}

module.exports = { validateCommitPolicy, validateImplementerReport };
