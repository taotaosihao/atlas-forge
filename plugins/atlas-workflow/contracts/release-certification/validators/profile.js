"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PROFILE_DIMENSIONS = Object.freeze([
  "capability-truth",
  "critical-journey",
  "surface-states",
  "formal-content-ia",
  "production-data",
  "accessibility-quality",
  "security-operability",
]);

const BUNDLED_PROFILE_DIGESTS = Object.freeze({
  "web-ui-v1": "sha256:20b72fda17fca13e7c323fba10a3a9bb276403164b71295df0e0405f705d4687",
});

const CANDIDATE_COMPONENTS = new Set([
  "source",
  "artifact",
  "surface_inventory",
  "config",
  "runtime",
  "data",
]);

const ALLOWED_GATE_CLASSES = new Set([
  "unit", "integration", "contract", "lint", "typecheck", "build", "e2e",
  "auth", "permission", "security", "data-consistency", "migration", "backup",
  "restore", "served-ui", "browser-flow", "install", "postflight",
  "release-identity", "collision", "downgrade", "symlink", "exact-layout",
]);

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function digestValue(value) {
  const body = JSON.stringify(stableValue(value));
  return `sha256:${crypto.createHash("sha256").update(body).digest("hex")}`;
}

function exactKeys(value, required, allowed, location, errors) {
  if (!isObject(value)) {
    errors.push(`${location}: must be an object`);
    return false;
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) errors.push(`${location}: missing required key: ${key}`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(`${location}: unknown key: ${key}`);
  }
  return true;
}

function nonEmptyString(value, location, errors) {
  if (typeof value !== "string" || !value.trim()) errors.push(`${location}: must be a non-empty string`);
}

function uniqueEnumArray(value, allowed, location, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${location}: must be a non-empty array`);
    return;
  }
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== "string" || !allowed.has(item)) {
      errors.push(`${location}: unsupported value: ${String(item)}`);
    } else if (seen.has(item)) {
      errors.push(`${location}: duplicate value: ${item}`);
    }
    seen.add(item);
  }
}

function validateVersionedRef(value, location, errors) {
  if (!exactKeys(value, ["id", "version"], ["id", "version"], location, errors)) return;
  if (typeof value.id !== "string" || !SAFE_ID.test(value.id)) {
    errors.push(`${location}.id: must be a safe identifier`);
  }
  if (!Number.isInteger(value.version) || value.version < 1) {
    errors.push(`${location}.version: must be a positive integer`);
  }
}

function validateCheckDefinition(value, location, errors) {
  const keys = [
    "definition_id",
    "collector_adapter",
    "fact_schema",
    "evaluator",
    "pass_rule",
    "required_candidate_components",
    "allowed_gate_classes",
  ];
  if (!exactKeys(value, keys, keys, location, errors)) return;
  if (typeof value.definition_id !== "string" || !SAFE_ID.test(value.definition_id)) {
    errors.push(`${location}.definition_id: must be a safe identifier`);
  }
  validateVersionedRef(value.collector_adapter, `${location}.collector_adapter`, errors);
  validateVersionedRef(value.fact_schema, `${location}.fact_schema`, errors);
  validateVersionedRef(value.evaluator, `${location}.evaluator`, errors);
  nonEmptyString(value.pass_rule, `${location}.pass_rule`, errors);
  uniqueEnumArray(value.required_candidate_components, CANDIDATE_COMPONENTS, `${location}.required_candidate_components`, errors);
  uniqueEnumArray(value.allowed_gate_classes, ALLOWED_GATE_CLASSES, `${location}.allowed_gate_classes`, errors);
}

function validateProfile(value) {
  const errors = [];
  const keys = ["schema_version", "profile_id", "surface_kind", "target_delivery_class", "requirements"];
  if (!exactKeys(value, keys, keys, "profile", errors)) return errors;
  if (value.schema_version !== 1) errors.push("profile.schema_version: must equal 1");
  if (typeof value.profile_id !== "string" || !SAFE_ID.test(value.profile_id)) {
    errors.push("profile.profile_id: must be a safe identifier");
  }
  if (value.surface_kind !== "web_ui") errors.push("profile.surface_kind: must equal web_ui");
  if (value.target_delivery_class !== "product_release") {
    errors.push("profile.target_delivery_class: must equal product_release");
  }
  if (!Array.isArray(value.requirements)) {
    errors.push("profile.requirements: must be an array");
    return errors;
  }
  if (value.requirements.length !== PROFILE_DIMENSIONS.length) {
    errors.push(`profile.requirements: must contain exactly ${PROFILE_DIMENSIONS.length} requirements`);
  }
  const dimensions = new Set();
  const requirementIds = new Set();
  const definitionIds = new Set();
  value.requirements.forEach((requirement, index) => {
    const location = `profile.requirements[${index}]`;
    const requirementKeys = [
      "requirement_id", "dimension", "assertion", "required", "waiver_policy", "check_definition",
    ];
    if (!exactKeys(requirement, requirementKeys, requirementKeys, location, errors)) return;
    nonEmptyString(requirement.requirement_id, `${location}.requirement_id`, errors);
    if (!PROFILE_DIMENSIONS.includes(requirement.dimension)) {
      errors.push(`${location}.dimension: unsupported dimension: ${String(requirement.dimension)}`);
    } else if (dimensions.has(requirement.dimension)) {
      errors.push(`${location}.dimension: duplicate dimension: ${requirement.dimension}`);
    }
    dimensions.add(requirement.dimension);
    const expectedId = `${value.profile_id}.${requirement.dimension}`;
    if (requirement.requirement_id !== expectedId) {
      errors.push(`${location}.requirement_id: must equal ${expectedId}`);
    }
    if (requirementIds.has(requirement.requirement_id)) {
      errors.push(`${location}.requirement_id: duplicate requirement id: ${requirement.requirement_id}`);
    }
    requirementIds.add(requirement.requirement_id);
    nonEmptyString(requirement.assertion, `${location}.assertion`, errors);
    if (requirement.required !== true) errors.push(`${location}.required: must equal true`);
    if (requirement.waiver_policy !== "never") errors.push(`${location}.waiver_policy: must equal never`);
    validateCheckDefinition(requirement.check_definition, `${location}.check_definition`, errors);
    const definitionId = requirement.check_definition?.definition_id;
    if (typeof definitionId === "string") {
      if (definitionIds.has(definitionId)) {
        errors.push(`${location}.check_definition.definition_id: duplicate definition id: ${definitionId}`);
      }
      definitionIds.add(definitionId);
    }
  });
  for (const dimension of PROFILE_DIMENSIONS) {
    if (!dimensions.has(dimension)) errors.push(`profile.requirements: missing dimension: ${dimension}`);
  }
  return errors;
}

function bundledProfilePath(profileRef) {
  if (typeof profileRef !== "string" || !SAFE_ID.test(profileRef)) {
    throw new Error(`invalid profile ref: ${String(profileRef)}`);
  }
  return path.join(__dirname, "..", "profiles", `${profileRef}.json`);
}

function assertBundledProfileIntegrity(profileRef, value) {
  const expectedDigest = BUNDLED_PROFILE_DIGESTS[profileRef];
  if (!expectedDigest) throw new Error(`unknown release profile: ${profileRef}`);
  const actualDigest = digestValue(value);
  if (actualDigest !== expectedDigest) {
    throw new Error(`release profile integrity mismatch for ${profileRef}: expected ${expectedDigest}, got ${actualDigest}`);
  }
}

function loadBundledProfile(profileRef) {
  if (!Object.hasOwn(BUNDLED_PROFILE_DIGESTS, profileRef)) {
    throw new Error(`unknown release profile: ${String(profileRef)}`);
  }
  const file = bundledProfilePath(profileRef);
  let value;
  try {
    value = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`unknown release profile: ${profileRef}`);
    throw new Error(`cannot read release profile ${profileRef}: ${error.message}`);
  }
  const errors = validateProfile(value);
  if (errors.length > 0) throw new Error(`invalid release profile ${profileRef}: ${errors.join("; ")}`);
  if (value.profile_id !== profileRef) {
    throw new Error(`release profile file identity mismatch: ${profileRef} != ${value.profile_id}`);
  }
  assertBundledProfileIntegrity(profileRef, value);
  return value;
}

function profileBinding(profile) {
  const errors = validateProfile(profile);
  if (errors.length > 0) throw new Error(`invalid release profile: ${errors.join("; ")}`);
  const definitions = Object.fromEntries(profile.requirements.map((requirement) => [
    requirement.requirement_id,
    {
      definition_ref: requirement.check_definition.definition_id,
      definition_sha256: digestValue(requirement.check_definition),
      evaluator_ref: `${requirement.check_definition.evaluator.id}@${requirement.check_definition.evaluator.version}`,
      evaluator_sha256: digestValue(requirement.check_definition.evaluator),
      fact_schema_ref: `${requirement.check_definition.fact_schema.id}@${requirement.check_definition.fact_schema.version}`,
      fact_schema_sha256: digestValue(requirement.check_definition.fact_schema),
      collector_adapter_ref: `${requirement.check_definition.collector_adapter.id}@${requirement.check_definition.collector_adapter.version}`,
      collector_adapter_sha256: digestValue(requirement.check_definition.collector_adapter),
      pass_rule_sha256: digestValue(requirement.check_definition.pass_rule),
    },
  ]));
  return {
    profile_ref: profile.profile_id,
    profile_sha256: digestValue(profile),
    check_definition_set_sha256: digestValue(definitions),
    requirements: definitions,
  };
}

module.exports = {
  ALLOWED_GATE_CLASSES,
  BUNDLED_PROFILE_DIGESTS,
  CANDIDATE_COMPONENTS,
  PROFILE_DIMENSIONS,
  assertBundledProfileIntegrity,
  bundledProfilePath,
  digestValue,
  loadBundledProfile,
  profileBinding,
  stableValue,
  validateProfile,
};
