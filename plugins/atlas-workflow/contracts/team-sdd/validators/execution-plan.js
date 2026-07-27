"use strict";

const crypto = require("crypto");
const {
  ID_PATTERN,
  isObject,
} = require("./common");

const POLICY_ID = "atlas-slice-size-v1";
const RISK_CLASSES = new Set(["low", "medium", "high", "critical"]);
const GATE_CLASSES = new Set([
  "unit", "integration", "contract", "lint", "typecheck", "build", "e2e",
  "auth", "permission", "security", "data-consistency", "migration", "backup",
  "restore", "served-ui", "browser-flow", "install", "postflight",
  "release-identity", "collision", "downgrade", "symlink", "exact-layout",
]);
const CACHE_POLICIES = new Set([
  "identity-bound", "fresh-executed", "cached", "imported", "skipped",
]);
const PERMANENT_GATE_CLASSES = new Set([
  "auth", "permission", "security", "data-consistency", "migration", "backup",
  "restore", "served-ui", "browser-flow", "install", "postflight",
  "release-identity", "collision", "downgrade", "symlink", "exact-layout",
]);
const TOP_LEVEL_KEYS = ["schema_version", "size_policy", "slices"];
const SIZE_POLICY_KEYS = ["policy_id"];
const SLICE_KEYS = [
  "slice_id", "objective", "depends_on", "keeper_outputs", "owned_paths",
  "forbidden_paths", "acceptance_refs", "risk_class", "failure_domain",
  "rollback_boundary", "budget", "checks", "size_exception",
];
const REQUIRED_SLICE_KEYS = SLICE_KEYS.filter((key) => !["forbidden_paths", "size_exception"].includes(key));
const BUDGET_KEYS = [
  "max_changed_files", "max_loc", "max_wall_clock_minutes", "max_required_checks",
];
const CHECK_KEYS = ["check_id", "gate_class", "command", "final_only", "cache_policy"];
const EXCEPTION_KEYS = ["authority_ref", "expires_at", "reason", "compensating_controls"];

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function canonicalJson(value) {
  return JSON.stringify(stableValue(value));
}

function sha256Value(value) {
  return crypto.createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function push(errors, location, message) {
  errors.push(`${location}: ${message}`);
}

function exactKeys(value, required, allowed, location, errors) {
  for (const key of required) {
    if (!Object.hasOwn(value, key)) push(errors, location, `missing required key: ${key}`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) push(errors, location, `unknown key: ${key}`);
  }
}

function nonEmptyString(value, location, errors) {
  if (typeof value !== "string" || !value.trim()) push(errors, location, "must be a non-empty string");
}

function safeId(value, location, errors) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) push(errors, location, "must be a safe identifier");
}

function uniqueStrings(value, location, errors, { nonEmpty = false } = {}) {
  if (!Array.isArray(value)) {
    push(errors, location, "must be an array of strings");
    return [];
  }
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== "string" || !item.trim()) {
      push(errors, location, "must contain only non-empty strings");
      continue;
    }
    if (seen.has(item)) push(errors, location, `duplicate value: ${item}`);
    seen.add(item);
  }
  if (nonEmpty && value.length === 0) push(errors, location, "must not be empty");
  return value.filter((item) => typeof item === "string" && item.trim());
}

function pathPrefix(raw) {
  if (typeof raw !== "string" || !raw.trim() || raw.startsWith("/") || raw.includes("\\")) return "";
  const normalized = raw.replace(/^\.\//, "").replace(/\/+/g, "/");
  if (normalized.split("/").includes("..")) return "";
  const segments = [];
  for (const segment of normalized.split("/")) {
    if (segment === "**" || /[*?\[\]{}]/.test(segment)) break;
    segments.push(segment);
  }
  return segments.join("/");
}

function pathsOverlap(left, right) {
  const leftPrefix = pathPrefix(left);
  const rightPrefix = pathPrefix(right);
  if (!leftPrefix || !rightPrefix) return true;
  return leftPrefix === rightPrefix
    || leftPrefix.startsWith(`${rightPrefix}/`)
    || rightPrefix.startsWith(`${leftPrefix}/`);
}

function validateException(value, location, errors) {
  if (!isObject(value)) {
    push(errors, location, "must be an object");
    return;
  }
  exactKeys(value, EXCEPTION_KEYS, EXCEPTION_KEYS, location, errors);
  nonEmptyString(value.authority_ref, `${location}.authority_ref`, errors);
  nonEmptyString(value.reason, `${location}.reason`, errors);
  const controls = uniqueStrings(value.compensating_controls, `${location}.compensating_controls`, errors, { nonEmpty: true });
  if (controls.length === 0 && Array.isArray(value.compensating_controls)) {
    push(errors, `${location}.compensating_controls`, "must contain at least one control");
  }
  if (typeof value.expires_at !== "string" || Number.isNaN(Date.parse(value.expires_at))) {
    push(errors, `${location}.expires_at`, "must be an ISO-8601 timestamp");
  }
}

function validateCheck(value, location, errors) {
  if (!isObject(value)) {
    push(errors, location, "must be an object");
    return;
  }
  exactKeys(value, CHECK_KEYS, CHECK_KEYS, location, errors);
  safeId(value.check_id, `${location}.check_id`, errors);
  nonEmptyString(value.command, `${location}.command`, errors);
  if (!GATE_CLASSES.has(value.gate_class)) {
    push(errors, `${location}.gate_class`, `must be one of: ${[...GATE_CLASSES].join(", ")}`);
  }
  if (typeof value.final_only !== "boolean") push(errors, `${location}.final_only`, "must be a boolean");
  if (!CACHE_POLICIES.has(value.cache_policy)) {
    push(errors, `${location}.cache_policy`, `must be one of: ${[...CACHE_POLICIES].join(", ")}`);
  }
  if (PERMANENT_GATE_CLASSES.has(value.gate_class) && value.cache_policy !== "fresh-executed") {
    push(errors, `${location}.cache_policy`, `permanent gate ${value.gate_class} must be fresh-executed`);
  }
}

function validateSlice(slice, index, errors) {
  const location = `slices[${index}]`;
  if (!isObject(slice)) {
    push(errors, location, "must be an object");
    return;
  }
  exactKeys(slice, REQUIRED_SLICE_KEYS, SLICE_KEYS, location, errors);
  safeId(slice.slice_id, `${location}.slice_id`, errors);
  nonEmptyString(slice.objective, `${location}.objective`, errors);
  uniqueStrings(slice.depends_on, `${location}.depends_on`, errors);
  uniqueStrings(slice.keeper_outputs, `${location}.keeper_outputs`, errors, { nonEmpty: true });
  uniqueStrings(slice.owned_paths, `${location}.owned_paths`, errors, { nonEmpty: true });
  uniqueStrings(slice.forbidden_paths || [], `${location}.forbidden_paths`, errors);
  uniqueStrings(slice.acceptance_refs, `${location}.acceptance_refs`, errors, { nonEmpty: true });
  if (!RISK_CLASSES.has(slice.risk_class)) {
    push(errors, `${location}.risk_class`, `must be one of: ${[...RISK_CLASSES].join(", ")}`);
  }
  nonEmptyString(slice.failure_domain, `${location}.failure_domain`, errors);
  nonEmptyString(slice.rollback_boundary, `${location}.rollback_boundary`, errors);
  if (!isObject(slice.budget)) {
    push(errors, `${location}.budget`, "must be an object");
  } else {
    exactKeys(slice.budget, BUDGET_KEYS, BUDGET_KEYS, `${location}.budget`, errors);
    for (const key of BUDGET_KEYS) {
      if (!Number.isInteger(slice.budget[key]) || slice.budget[key] < 1) {
        push(errors, `${location}.budget.${key}`, "must be a positive integer");
      }
    }
  }
  if (!Array.isArray(slice.checks) || slice.checks.length === 0) {
    push(errors, `${location}.checks`, "must be a non-empty array");
  } else {
    slice.checks.forEach((check, checkIndex) => validateCheck(check, `${location}.checks[${checkIndex}]`, errors));
  }
  if (slice.size_exception !== undefined) validateException(slice.size_exception, `${location}.size_exception`, errors);
  if (isObject(slice.budget) && Array.isArray(slice.owned_paths) && Array.isArray(slice.checks)) {
    const overBudget = slice.owned_paths.length > slice.budget.max_changed_files
      || slice.checks.length > slice.budget.max_required_checks;
    if (overBudget && slice.size_exception === undefined) {
      push(errors, location, `slice exceeds ${POLICY_ID} and requires size_exception`);
    } else if (!overBudget && slice.size_exception !== undefined) {
      push(errors, `${location}.size_exception`, "is only valid for an over-budget slice");
    }
  }
  for (const owned of slice.owned_paths || []) {
    if (!pathPrefix(owned)) push(errors, `${location}.owned_paths`, `invalid relative path pattern: ${owned}`);
    for (const forbidden of slice.forbidden_paths || []) {
      if (!pathPrefix(forbidden)) push(errors, `${location}.forbidden_paths`, `invalid relative path pattern: ${forbidden}`);
      if (pathsOverlap(owned, forbidden)) {
        push(errors, location, `owned path overlaps forbidden path: ${owned} <> ${forbidden}`);
      }
    }
  }
}

function validateGraph(slices, errors) {
  const ids = new Map();
  const acceptanceOwners = new Map();
  const checkOwners = new Map();
  slices.forEach((slice, index) => {
    if (!isObject(slice)) return;
    if (ids.has(slice.slice_id)) push(errors, `slices[${index}].slice_id`, `duplicate slice_id: ${slice.slice_id}`);
    else ids.set(slice.slice_id, slice);
    for (const ref of slice.acceptance_refs || []) {
      if (acceptanceOwners.has(ref)) push(errors, `slices[${index}].acceptance_refs`, `acceptance ref already owned by ${acceptanceOwners.get(ref)}: ${ref}`);
      else acceptanceOwners.set(ref, slice.slice_id);
    }
    for (const check of slice.checks || []) {
      if (!isObject(check) || typeof check.check_id !== "string") continue;
      if (checkOwners.has(check.check_id)) push(errors, `slices[${index}].checks`, `check_id already owned by ${checkOwners.get(check.check_id)}: ${check.check_id}`);
      else checkOwners.set(check.check_id, slice.slice_id);
    }
  });
  slices.forEach((slice, index) => {
    if (!isObject(slice)) return;
    for (const dependency of slice.depends_on || []) {
      if (dependency === slice.slice_id) push(errors, `slices[${index}].depends_on`, "slice cannot depend on itself");
      else if (!ids.has(dependency)) push(errors, `slices[${index}].depends_on`, `unknown dependency: ${dependency}`);
    }
  });
  for (let left = 0; left < slices.length; left += 1) {
    for (let right = left + 1; right < slices.length; right += 1) {
      if (!isObject(slices[left]) || !isObject(slices[right])) continue;
      for (const leftPath of slices[left].owned_paths || []) {
        for (const rightPath of slices[right].owned_paths || []) {
          if (pathsOverlap(leftPath, rightPath)) {
            push(errors, "slices", `owned path overlap between ${slices[left].slice_id} and ${slices[right].slice_id}: ${leftPath} <> ${rightPath}`);
          }
        }
      }
    }
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(id, trail) {
    if (visiting.has(id)) {
      push(errors, "slices", `dependency cycle: ${[...trail, id].join(" -> ")}`);
      return;
    }
    if (visited.has(id) || !ids.has(id)) return;
    visiting.add(id);
    for (const dependency of ids.get(id).depends_on || []) visit(dependency, [...trail, id]);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of ids.keys()) visit(id, []);
}

function validateExecutionPlan(value) {
  const errors = [];
  if (!isObject(value)) return ["value: must be an object"];
  exactKeys(value, TOP_LEVEL_KEYS, TOP_LEVEL_KEYS, "value", errors);
  if (value.schema_version !== 1) push(errors, "schema_version", "must equal 1");
  if (!isObject(value.size_policy)) {
    push(errors, "size_policy", "must be an object");
  } else {
    exactKeys(value.size_policy, SIZE_POLICY_KEYS, SIZE_POLICY_KEYS, "size_policy", errors);
    if (value.size_policy.policy_id !== POLICY_ID) push(errors, "size_policy.policy_id", `must equal ${POLICY_ID}`);
  }
  if (!Array.isArray(value.slices) || value.slices.length === 0) {
    push(errors, "slices", "must be a non-empty array");
    return errors;
  }
  value.slices.forEach((slice, index) => validateSlice(slice, index, errors));
  validateGraph(value.slices, errors);
  return errors;
}

function extractExecutionPlan(markdown) {
  const pattern = /^```atlas-execution-plan\+json[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm;
  const matches = [...String(markdown).matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error(`expected exactly one atlas-execution-plan+json fenced block, found ${matches.length}`);
  }
  let plan;
  try {
    plan = JSON.parse(matches[0][1]);
  } catch (error) {
    throw new Error(`invalid execution plan JSON: ${error.message}`);
  }
  const errors = validateExecutionPlan(plan);
  if (errors.length > 0) throw new Error(errors.join("; "));
  return plan;
}

module.exports = {
  CACHE_POLICIES,
  GATE_CLASSES,
  PERMANENT_GATE_CLASSES,
  POLICY_ID,
  canonicalJson,
  extractExecutionPlan,
  pathsOverlap,
  sha256Value,
  validateCheck,
  validateException,
  validateExecutionPlan,
};
