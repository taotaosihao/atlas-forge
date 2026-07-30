"use strict";

const fs = require("fs");
const path = require("path");

const {
  ID_PATTERN,
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
const {
  POLICY_ID,
  pathsOverlap,
  validateCheck,
  validateException,
} = require("./execution-plan");

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
const V3_KEYS = [
  "schema_version",
  "task_id",
  "slice_id",
  "repo",
  "base_sha",
  "objective",
  "requirements_path",
  "global_constraints_path",
  "contract",
  "dependencies",
  "keeper_outputs",
  "owned_paths",
  "forbidden_paths",
  "acceptance_refs",
  "risk_class",
  "failure_domain",
  "rollback_boundary",
  "budget",
  "checks",
  "size_gate",
  "commit_policy",
  "output_contract",
];
const CONTRACT_KEYS = ["path", "sha256", "semantics_version", "execution_plan_sha256"];
const RELEASE_KEYS = [
  "target_delivery_class", "intent_sha256", "profile_ref", "profile_sha256",
  "check_definition_set_sha256", "requirement_refs",
];
const WORK_TYPES = ["implementation", "planning", "review", "audit", "docs-only"];
const DEPENDENCY_KEYS = ["slice_id", "required_outcome", "keeper_outputs"];
const BUDGET_KEYS = ["max_changed_files", "max_loc", "max_wall_clock_minutes", "max_required_checks"];
const SIZE_GATE_KEYS = ["decision", "policy_id", "estimate", "exception"];
const ESTIMATE_KEYS = [
  "estimated_changed_files", "estimated_net_loc", "target_p90_minutes",
  "serial_dependency_depth", "independent_vertical_count",
];

function validateExactObject(value, label, keys, errors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${label} must be an object`);
    return false;
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) errors.push(`${label} missing required key: ${key}`);
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) errors.push(`${label} unknown key: ${key}`);
  }
  return true;
}

function validateUniqueStrings(value, label, errors, nonEmpty = false) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    errors.push(`${label} must be an array of non-empty strings`);
    return;
  }
  if (nonEmpty && value.length === 0) errors.push(`${label} must not be empty`);
  if (new Set(value).size !== value.length) errors.push(`${label} must not contain duplicates`);
}

function validateReleaseBinding(value, label, errors) {
  if (!validateExactObject(value, label, RELEASE_KEYS, errors)) return;
  if (value.target_delivery_class !== "product_release") {
    errors.push(`${label}.target_delivery_class must equal product_release`);
  }
  if (typeof value.profile_ref !== "string" || !ID_PATTERN.test(value.profile_ref)) {
    errors.push(`${label}.profile_ref must be a safe identifier`);
  }
  for (const field of ["intent_sha256", "profile_sha256", "check_definition_set_sha256"]) {
    if (!/^sha256:[a-f0-9]{64}$/.test(value[field] || "")) {
      errors.push(`${label}.${field} must use sha256:<hex>`);
    }
  }
  validateUniqueStrings(value.requirement_refs, `${label}.requirement_refs`, errors, true);
}

function validateV3(value, errors) {
  requireKeys(value, V3_KEYS, errors);
  rejectUnknownKeys(value, V3_KEYS, errors);
  expectSafeId(value, "task_id", errors);
  expectSafeId(value, "slice_id", errors);
  expectAbsoluteExistingDir(value, "repo", errors);
  expectString(value, "base_sha", errors);
  expectString(value, "objective", errors);
  expectString(value, "requirements_path", errors);
  expectString(value, "global_constraints_path", errors);
  if (path.isAbsolute(value.requirements_path || "")) errors.push("requirements_path must be relative");
  if (path.isAbsolute(value.global_constraints_path || "")) errors.push("global_constraints_path must be relative");

  const contractKeys = [
    ...CONTRACT_KEYS,
    ...(value.contract?.semantics_version === 4 ? ["work_type"] : []),
    ...(value.contract?.release === undefined ? [] : ["release"]),
  ];
  if (validateExactObject(value.contract, "contract", contractKeys, errors)) {
    if (typeof value.contract.path !== "string" || !path.isAbsolute(value.contract.path)) {
      errors.push("contract.path must be an absolute path");
    } else if (!fs.existsSync(value.contract.path) || !fs.statSync(value.contract.path).isFile()) {
      errors.push("contract.path must exist and be a regular file");
    }
    if (!/^sha256:[a-f0-9]{64}$/.test(value.contract.sha256 || "")) {
      errors.push("contract.sha256 must use sha256:<hex>");
    }
    if (![1, 2, 3, 4].includes(value.contract.semantics_version)) {
      errors.push("contract.semantics_version must be one of: 1, 2, 3, 4");
    }
    if (value.contract.semantics_version === 4
      && !WORK_TYPES.includes(value.contract.work_type)) {
      errors.push(`contract.work_type must be one of: ${WORK_TYPES.join(", ")}`);
    }
    if (!/^sha256:[a-f0-9]{64}$/.test(value.contract.execution_plan_sha256 || "")) {
      errors.push("contract.execution_plan_sha256 must use sha256:<hex>");
    }
    if (value.contract.release !== undefined) {
      if (value.contract.semantics_version !== 4) {
        errors.push("contract.release is supported only for semantics version 4");
      }
      validateReleaseBinding(value.contract.release, "contract.release", errors);
    }
  }

  if (!Array.isArray(value.dependencies)) {
    errors.push("dependencies must be an array");
  } else {
    const ids = new Set();
    value.dependencies.forEach((dependency, index) => {
      const label = `dependencies[${index}]`;
      if (!validateExactObject(dependency, label, DEPENDENCY_KEYS, errors)) return;
      expectSafeId(dependency, "slice_id", errors);
      if (ids.has(dependency.slice_id)) errors.push(`${label}.slice_id must be unique`);
      ids.add(dependency.slice_id);
      if (dependency.slice_id === value.slice_id) errors.push(`${label}.slice_id cannot reference the current slice`);
      if (dependency.required_outcome !== "succeeded") errors.push(`${label}.required_outcome must equal succeeded`);
      validateUniqueStrings(dependency.keeper_outputs, `${label}.keeper_outputs`, errors, true);
    });
  }

  validateUniqueStrings(value.keeper_outputs, "keeper_outputs", errors, true);
  validateUniqueStrings(value.owned_paths, "owned_paths", errors, true);
  validateUniqueStrings(value.forbidden_paths, "forbidden_paths", errors);
  validateUniqueStrings(value.acceptance_refs, "acceptance_refs", errors, true);
  for (const owned of value.owned_paths || []) {
    for (const forbidden of value.forbidden_paths || []) {
      if (pathsOverlap(owned, forbidden)) errors.push(`owned path overlaps forbidden path: ${owned} <> ${forbidden}`);
    }
  }
  expectEnum(value, "risk_class", ["low", "medium", "high", "critical"], errors);
  expectString(value, "failure_domain", errors);
  expectString(value, "rollback_boundary", errors);

  if (validateExactObject(value.budget, "budget", BUDGET_KEYS, errors)) {
    for (const key of BUDGET_KEYS) {
      if (!Number.isInteger(value.budget[key]) || value.budget[key] < 1) errors.push(`budget.${key} must be a positive integer`);
    }
  }
  if (!Array.isArray(value.checks) || value.checks.length === 0) {
    errors.push("checks must be a non-empty array");
  } else {
    const ids = new Set();
    value.checks.forEach((check, index) => {
      validateCheck(check, `checks[${index}]`, errors, {
        schemaVersion: value.contract?.release ? 2 : 1,
      });
      if (check && ids.has(check.check_id)) errors.push(`checks[${index}].check_id must be unique`);
      if (check) ids.add(check.check_id);
    });
  }

  if (validateExactObject(value.size_gate, "size_gate", SIZE_GATE_KEYS, errors)) {
    if (!new Set(["pass", "split_required", "exception"]).has(value.size_gate.decision)) {
      errors.push("size_gate.decision must be one of: pass, split_required, exception");
    }
    if (value.size_gate.policy_id !== POLICY_ID) errors.push(`size_gate.policy_id must equal ${POLICY_ID}`);
    if (validateExactObject(value.size_gate.estimate, "size_gate.estimate", ESTIMATE_KEYS, errors)) {
      for (const key of ESTIMATE_KEYS) {
        const minimum = key === "serial_dependency_depth" ? 0 : 1;
        if (!Number.isInteger(value.size_gate.estimate[key]) || value.size_gate.estimate[key] < minimum) {
          errors.push(`size_gate.estimate.${key} must be an integer >= ${minimum}`);
        }
      }
    }
    if (value.size_gate.decision === "exception") {
      validateException(value.size_gate.exception, "size_gate.exception", errors);
    } else if (value.size_gate.exception !== null) {
      errors.push("size_gate.exception must be null unless decision is exception");
    }
  }
  expectEnum(value, "commit_policy", ["logical_outcome", "changes_allowed_no_commit", "no_change_allowed"], errors);
  expectEnum(value, "output_contract", ["final_message_json_only"], errors);
  expectGitRevision(value.repo, value.base_sha, "base_sha", errors);
}

function validateBrief(value) {
  const errors = [];
  if (!requireObject(value, errors)) {
    return errors;
  }
  expectInteger(value, "schema_version", errors);
  if (![1, 2, 3].includes(value.schema_version)) {
    errors.push("schema_version must be one of: 1, 2, 3");
    return errors;
  }
  if (value.schema_version === 3) {
    validateV3(value, errors);
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
