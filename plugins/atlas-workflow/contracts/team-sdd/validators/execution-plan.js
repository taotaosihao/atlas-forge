"use strict";

const crypto = require("crypto");
const {
  ID_PATTERN,
  isObject,
} = require("./common");
const {
  digestValue,
  loadBundledProfile,
  profileBinding,
} = require("../../release-certification/validators/profile");
const {
  extractReleaseIntent,
  validateReleaseIntent,
} = require("../../release-certification/validators/release-intent");

const POLICY_ID = "atlas-slice-size-v2";
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
const V1_TOP_LEVEL_KEYS = ["schema_version", "size_policy", "slices"];
const V2_TOP_LEVEL_KEYS = [...V1_TOP_LEVEL_KEYS, "release"];
const SIZE_POLICY_KEYS = ["policy_id"];
const SLICE_KEYS = [
  "slice_id", "objective", "depends_on", "keeper_outputs", "owned_paths",
  "forbidden_paths", "acceptance_refs", "risk_class", "failure_domain",
  "rollback_boundary", "estimate", "budget", "checks", "size_exception",
];
const REQUIRED_SLICE_KEYS = SLICE_KEYS.filter((key) => !["forbidden_paths", "size_exception"].includes(key));
const BUDGET_KEYS = [
  "max_changed_files", "max_loc", "max_wall_clock_minutes", "max_required_checks",
];
const ESTIMATE_KEYS = [
  "estimated_changed_files", "estimated_net_loc", "target_p90_minutes",
  "serial_dependency_depth", "independent_vertical_count",
];
const CHECK_KEYS = ["check_id", "gate_class", "command", "final_only", "cache_policy"];
const RELEASE_KEYS = [
  "target_delivery_class", "intent_sha256", "profile_ref", "profile_sha256",
  "check_definition_set_sha256", "requirement_refs",
];
const RELEASE_REQUIREMENT_KEYS = [
  "profile_ref", "profile_sha256", "requirement_ref", "requirement_sha256",
  "dimension", "required", "waiver_policy", "definition_ref", "definition_sha256",
  "collector_adapter_ref", "collector_adapter_sha256", "fact_schema_ref",
  "fact_schema_sha256", "evaluator_ref", "evaluator_sha256", "pass_rule_sha256",
  "required_candidate_components",
];
const EXCEPTION_KEYS = ["authority_ref", "expires_at", "reason", "compensating_controls"];
const SHA256 = /^sha256:[a-f0-9]{64}$/;

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

function repositoryBroadPath(raw) {
  const prefix = pathPrefix(raw);
  if (!prefix) return true;
  const normalized = String(raw).replace(/^\.\//, "").replace(/\/+$/g, "");
  if (normalized === "." || normalized === "**" || normalized === "**/*") return true;
  return /[*?\[\]{}]/.test(normalized) && prefix.split("/").length <= 1;
}

function estimateOverBudget(estimate, budget, checks) {
  return estimate.estimated_changed_files > budget.max_changed_files
    || estimate.estimated_net_loc > budget.max_loc
    || estimate.target_p90_minutes > budget.max_wall_clock_minutes
    || estimate.serial_dependency_depth > 2
    || estimate.independent_vertical_count > 1
    || checks.length > budget.max_required_checks;
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

function validateCheck(value, location, errors, { schemaVersion = 1 } = {}) {
  if (!isObject(value)) {
    push(errors, location, "must be an object");
    return;
  }
  const allowedKeys = schemaVersion === 2 ? [...CHECK_KEYS, "release_requirement"] : CHECK_KEYS;
  exactKeys(value, CHECK_KEYS, allowedKeys, location, errors);
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
  if (value.release_requirement !== undefined && !isObject(value.release_requirement)) {
    push(errors, `${location}.release_requirement`, "must be an object");
  }
}

function validateSlice(slice, index, errors, schemaVersion) {
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
  if (!isObject(slice.estimate)) {
    push(errors, `${location}.estimate`, "must be an object");
  } else {
    exactKeys(slice.estimate, ESTIMATE_KEYS, ESTIMATE_KEYS, `${location}.estimate`, errors);
    for (const key of ESTIMATE_KEYS) {
      const minimum = key === "serial_dependency_depth" ? 0 : 1;
      if (!Number.isInteger(slice.estimate[key]) || slice.estimate[key] < minimum) {
        push(errors, `${location}.estimate.${key}`, `must be an integer >= ${minimum}`);
      }
    }
    if (Array.isArray(slice.depends_on)
      && Number.isInteger(slice.estimate.serial_dependency_depth)
      && slice.estimate.serial_dependency_depth < (slice.depends_on.length > 0 ? 1 : 0)) {
      push(errors, `${location}.estimate.serial_dependency_depth`, "cannot be zero when the slice has dependencies");
    }
  }
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
    slice.checks.forEach((check, checkIndex) => validateCheck(
      check,
      `${location}.checks[${checkIndex}]`,
      errors,
      { schemaVersion },
    ));
  }
  if (slice.size_exception !== undefined) validateException(slice.size_exception, `${location}.size_exception`, errors);
  if (isObject(slice.estimate) && isObject(slice.budget)
    && Array.isArray(slice.owned_paths) && Array.isArray(slice.checks)) {
    const overBudget = estimateOverBudget(slice.estimate, slice.budget, slice.checks)
      || slice.owned_paths.some(repositoryBroadPath);
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

function releaseRequirementProjection(profile, binding, requirement) {
  const definition = binding.requirements[requirement.requirement_id];
  return {
    profile_ref: binding.profile_ref,
    profile_sha256: binding.profile_sha256,
    requirement_ref: requirement.requirement_id,
    requirement_sha256: digestValue(requirement),
    dimension: requirement.dimension,
    required: requirement.required,
    waiver_policy: requirement.waiver_policy,
    definition_ref: definition.definition_ref,
    definition_sha256: definition.definition_sha256,
    collector_adapter_ref: definition.collector_adapter_ref,
    collector_adapter_sha256: definition.collector_adapter_sha256,
    fact_schema_ref: definition.fact_schema_ref,
    fact_schema_sha256: definition.fact_schema_sha256,
    evaluator_ref: definition.evaluator_ref,
    evaluator_sha256: definition.evaluator_sha256,
    pass_rule_sha256: definition.pass_rule_sha256,
    required_candidate_components: [...requirement.check_definition.required_candidate_components],
  };
}

function releasePlanBinding(intent) {
  const intentErrors = validateReleaseIntent(intent);
  if (intentErrors.length > 0) throw new Error(`invalid release intent: ${intentErrors.join("; ")}`);
  if (intent.target_delivery_class !== "product_release") {
    throw new Error("release plan binding requires a product_release intent");
  }
  const profileRef = intent.release_profile_refs?.[0]?.profile_ref;
  const profile = loadBundledProfile(profileRef);
  const binding = profileBinding(profile);
  if (intent.release_profile_refs[0].profile_sha256 !== binding.profile_sha256) {
    throw new Error("release intent profile digest does not match the immutable bundled profile");
  }
  return {
    target_delivery_class: "product_release",
    intent_sha256: digestValue(intent),
    profile_ref: binding.profile_ref,
    profile_sha256: binding.profile_sha256,
    check_definition_set_sha256: binding.check_definition_set_sha256,
    requirement_refs: profile.requirements.map((requirement) => requirement.requirement_id),
  };
}

function validateReleasePlan(plan, intent, errors) {
  if (!isObject(plan.release)) {
    push(errors, "release", "schema version 2 requires a release binding object");
    return;
  }
  exactKeys(plan.release, RELEASE_KEYS, RELEASE_KEYS, "release", errors);
  if (plan.release.target_delivery_class !== "product_release") {
    push(errors, "release.target_delivery_class", "must equal product_release");
  }
  for (const field of ["intent_sha256", "profile_sha256", "check_definition_set_sha256"]) {
    if (typeof plan.release[field] !== "string" || !SHA256.test(plan.release[field])) {
      push(errors, `release.${field}`, "must be a sha256:<64 lowercase hex> digest");
    }
  }
  safeId(plan.release.profile_ref, "release.profile_ref", errors);
  uniqueStrings(plan.release.requirement_refs, "release.requirement_refs", errors, { nonEmpty: true });

  let profile;
  let binding;
  try {
    profile = loadBundledProfile(plan.release.profile_ref);
    binding = profileBinding(profile);
  } catch (error) {
    push(errors, "release.profile_ref", error.message);
    return;
  }
  let expectedRelease;
  try {
    expectedRelease = intent ? releasePlanBinding(intent) : {
      ...plan.release,
      target_delivery_class: "product_release",
      profile_ref: binding.profile_ref,
      profile_sha256: binding.profile_sha256,
      check_definition_set_sha256: binding.check_definition_set_sha256,
      requirement_refs: profile.requirements.map((requirement) => requirement.requirement_id),
    };
  } catch (error) {
    push(errors, "release", error.message);
    return;
  }
  for (const field of RELEASE_KEYS) {
    if (canonicalJson(plan.release[field]) !== canonicalJson(expectedRelease[field])) {
      push(errors, `release.${field}`, "does not match the immutable release intent/Profile binding");
    }
  }

  const requirements = new Map(profile.requirements.map((requirement) => [requirement.requirement_id, requirement]));
  const projected = new Set();
  plan.slices.forEach((slice, sliceIndex) => {
    for (const [checkIndex, check] of (slice.checks || []).entries()) {
      if (!isObject(check) || check.release_requirement === undefined) continue;
      const location = `slices[${sliceIndex}].checks[${checkIndex}].release_requirement`;
      if (!isObject(check.release_requirement)) continue;
      exactKeys(
        check.release_requirement,
        RELEASE_REQUIREMENT_KEYS,
        RELEASE_REQUIREMENT_KEYS,
        location,
        errors,
      );
      const requirementRef = check.release_requirement.requirement_ref;
      const requirement = requirements.get(requirementRef);
      if (!requirement) {
        push(errors, `${location}.requirement_ref`, "is not required by the bound Profile");
        continue;
      }
      if (projected.has(requirementRef)) {
        push(errors, `${location}.requirement_ref`, `duplicate release requirement projection: ${requirementRef}`);
      }
      projected.add(requirementRef);
      const expected = releaseRequirementProjection(profile, binding, requirement);
      for (const field of RELEASE_REQUIREMENT_KEYS) {
        if (canonicalJson(check.release_requirement[field]) !== canonicalJson(expected[field])) {
          push(errors, `${location}.${field}`, "does not match the immutable Profile Check Definition");
        }
      }
      if (check.final_only !== true) push(errors, `${location}.requirement_ref`, "release checks must be final_only");
      if (check.cache_policy !== "fresh-executed") {
        push(errors, `${location}.requirement_ref`, "release checks must be fresh-executed");
      }
      if (!requirement.check_definition.allowed_gate_classes.includes(check.gate_class)) {
        push(errors, `${location}.requirement_ref`, `gate_class ${check.gate_class} is not allowed by the Check Definition`);
      }
    }
  });
  for (const requirementRef of requirements.keys()) {
    if (!projected.has(requirementRef)) {
      push(errors, "slices", `missing release requirement projection: ${requirementRef}`);
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
  const depths = new Map();
  function dependencyDepth(id, trail = new Set()) {
    if (depths.has(id)) return depths.get(id);
    if (trail.has(id) || !ids.has(id)) return 0;
    const nextTrail = new Set(trail).add(id);
    const dependencies = (ids.get(id).depends_on || []).filter((dependency) => ids.has(dependency));
    const depth = dependencies.length === 0
      ? 0
      : 1 + Math.max(...dependencies.map((dependency) => dependencyDepth(dependency, nextTrail)));
    depths.set(id, depth);
    return depth;
  }
  slices.forEach((slice, index) => {
    if (!isObject(slice) || !ids.has(slice.slice_id) || !isObject(slice.estimate)) return;
    const expected = dependencyDepth(slice.slice_id);
    if (slice.estimate.serial_dependency_depth !== expected) {
      push(errors, `slices[${index}].estimate.serial_dependency_depth`,
        `must equal dependency DAG depth ${expected}`);
    }
  });
}

function validateExecutionPlan(value, { contractSemanticsVersion = null, releaseIntent = null } = {}) {
  const errors = [];
  if (!isObject(value)) return ["value: must be an object"];
  const topLevelKeys = value.schema_version === 2 ? V2_TOP_LEVEL_KEYS : V1_TOP_LEVEL_KEYS;
  exactKeys(value, topLevelKeys, topLevelKeys, "value", errors);
  if (![1, 2].includes(value.schema_version)) push(errors, "schema_version", "must equal 1 or 2");
  if (contractSemanticsVersion === 3 && value.schema_version !== 1) {
    push(errors, "schema_version", "semantics-v3 contracts require execution-plan schema version 1");
  }
  if (releaseIntent?.target_delivery_class === "product_release" && value.schema_version !== 2) {
    push(errors, "schema_version", "product_release intent requires execution-plan schema version 2");
  }
  if (releaseIntent && releaseIntent.target_delivery_class !== "product_release" && value.schema_version !== 1) {
    push(errors, "schema_version", "exploration and non_product intents require execution-plan schema version 1");
  }
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
  value.slices.forEach((slice, index) => validateSlice(slice, index, errors, value.schema_version));
  validateGraph(value.slices, errors);
  if (value.schema_version === 2) validateReleasePlan(value, releaseIntent, errors);
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
  const semanticsMatch = /^contract_semantics_version:\s*(\d+)\s*$/m.exec(String(markdown));
  const contractSemanticsVersion = semanticsMatch ? Number(semanticsMatch[1]) : null;
  let releaseIntent = null;
  if (contractSemanticsVersion === 4) {
    try {
      releaseIntent = extractReleaseIntent(markdown);
    } catch {
      // Release-intent diagnostics are owned by the contract envelope validator.
    }
  }
  const errors = validateExecutionPlan(plan, { contractSemanticsVersion, releaseIntent });
  if (errors.length > 0) throw new Error(errors.join("; "));
  return plan;
}

module.exports = {
  CACHE_POLICIES,
  GATE_CLASSES,
  PERMANENT_GATE_CLASSES,
  POLICY_ID,
  canonicalJson,
  estimateOverBudget,
  extractExecutionPlan,
  pathsOverlap,
  releasePlanBinding,
  releaseRequirementProjection,
  repositoryBroadPath,
  sha256Value,
  validateCheck,
  validateException,
  validateExecutionPlan,
};
