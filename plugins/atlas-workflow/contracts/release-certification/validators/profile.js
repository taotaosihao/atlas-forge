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

const INTEGRATED_PROFILE_DIMENSIONS = Object.freeze([
  ...PROFILE_DIMENSIONS,
  "api-contract",
  "worker-reliability",
  "data-integrity",
  "external-integration",
  "performance-resilience",
]);

const INTEGRATED_SURFACE_KINDS = Object.freeze([
  "web_ui",
  "api",
  "worker",
  "database",
  "external_integration",
]);

const BUNDLED_PROFILE_DIGESTS = Object.freeze({
  "web-ui-v1": "sha256:b63388d9e375eb8311d51845645b051a06600ee0a584ce35e029d78e1ac1fda6",
  "integrated-app-v1": "sha256:80adb0c08ef783662ac6409e7c9b9b3c320e95c4a2b4c009ed06e9b090e1a52f",
});

const BUNDLED_COMPONENT_FILES = Object.freeze({
  "collector_adapter:business-acceptance-v2@2": path.join(__dirname, "..", "adapters", "business-acceptance-v2.js"),
  "collector_adapter:formal-web-ui-v1@1": path.join(__dirname, "..", "adapters", "formal-web-ui-v1.js"),
  "collector_adapter:integrated-app-v1@1": path.join(__dirname, "..", "adapters", "integrated-app-v1.js"),
  "collector_adapter:release-data-v1@1": path.join(__dirname, "..", "adapters", "release-data-v1.js"),
  "collector_adapter:release-operability-v1@1": path.join(__dirname, "..", "adapters", "release-operability-v1.js"),
  "fact_schema:release-fact-v1@1": path.join(__dirname, "evidence.js"),
  "evaluator:capability-truth-v1@1": path.join(__dirname, "evidence.js"),
  "evaluator:critical-journey-v1@1": path.join(__dirname, "evidence.js"),
  "evaluator:surface-states-v1@1": path.join(__dirname, "evidence.js"),
  "evaluator:formal-content-ia-v1@1": path.join(__dirname, "evidence.js"),
  "evaluator:production-data-v1@1": path.join(__dirname, "evidence.js"),
  "evaluator:accessibility-quality-v1@1": path.join(__dirname, "evidence.js"),
  "evaluator:security-operability-v1@1": path.join(__dirname, "evidence.js"),
  "evaluator:api-contract-v1@1": path.join(__dirname, "..", "adapters", "integrated-app-v1.js"),
  "evaluator:worker-reliability-v1@1": path.join(__dirname, "..", "adapters", "integrated-app-v1.js"),
  "evaluator:data-integrity-v1@1": path.join(__dirname, "..", "adapters", "integrated-app-v1.js"),
  "evaluator:external-integration-v1@1": path.join(__dirname, "..", "adapters", "integrated-app-v1.js"),
  "evaluator:performance-resilience-v1@1": path.join(__dirname, "..", "adapters", "integrated-app-v1.js"),
});

const CANDIDATE_COMPONENTS = new Set([
  "source",
  "artifact",
  "surface_inventory",
  "config",
  "runtime",
  "data",
  "web_ui",
  "api",
  "worker",
  "database",
  "external_integration",
  "deployment_attestation",
  "performance_budget",
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
  if (!exactKeys(value, ["id", "version", "sha256"], ["id", "version", "sha256"], location, errors)) return;
  if (typeof value.id !== "string" || !SAFE_ID.test(value.id)) {
    errors.push(`${location}.id: must be a safe identifier`);
  }
  if (!Number.isInteger(value.version) || value.version < 1) {
    errors.push(`${location}.version: must be a positive integer`);
  }
  if (typeof value.sha256 !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value.sha256)) {
    errors.push(`${location}.sha256: must be a sha256:<64 lowercase hex> digest`);
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
  const integrated = value?.schema_version === 2;
  const keys = integrated
    ? ["schema_version", "profile_id", "surface_kinds", "target_delivery_class", "requirements"]
    : ["schema_version", "profile_id", "surface_kind", "target_delivery_class", "requirements"];
  if (!exactKeys(value, keys, keys, "profile", errors)) return errors;
  if (![1, 2].includes(value.schema_version)) errors.push("profile.schema_version: must equal 1 or 2");
  if (typeof value.profile_id !== "string" || !SAFE_ID.test(value.profile_id)) {
    errors.push("profile.profile_id: must be a safe identifier");
  }
  if (integrated) {
    if (value.profile_id !== "integrated-app-v1") {
      errors.push("profile.profile_id: schema version 2 must equal integrated-app-v1");
    }
    if (!Array.isArray(value.surface_kinds)
      || value.surface_kinds.length !== INTEGRATED_SURFACE_KINDS.length
      || value.surface_kinds.some((surface, index) => surface !== INTEGRATED_SURFACE_KINDS[index])) {
      errors.push(`profile.surface_kinds: must equal ${INTEGRATED_SURFACE_KINDS.join(", ")}`);
    }
  } else {
    if (value.profile_id !== "web-ui-v1") {
      errors.push("profile.profile_id: schema version 1 must equal web-ui-v1");
    }
    if (value.surface_kind !== "web_ui") {
      errors.push("profile.surface_kind: must equal web_ui");
    }
  }
  if (value.target_delivery_class !== "product_release") {
    errors.push("profile.target_delivery_class: must equal product_release");
  }
  if (!Array.isArray(value.requirements)) {
    errors.push("profile.requirements: must be an array");
    return errors;
  }
  const expectedDimensions = integrated ? INTEGRATED_PROFILE_DIMENSIONS : PROFILE_DIMENSIONS;
  if (value.requirements.length !== expectedDimensions.length) {
    errors.push(`profile.requirements: must contain exactly ${expectedDimensions.length} requirements`);
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
    if (!expectedDimensions.includes(requirement.dimension)) {
      errors.push(`${location}.dimension: unsupported dimension: ${String(requirement.dimension)}`);
    } else if (dimensions.has(requirement.dimension)) {
      errors.push(`${location}.dimension: duplicate dimension: ${requirement.dimension}`);
    }
    if (requirement.dimension !== expectedDimensions[index]) {
      errors.push(`${location}.dimension: must equal ${String(expectedDimensions[index])}`);
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
      const expectedDefinitionId = `${value.profile_id}.${requirement.dimension}.v1`;
      if (definitionId !== expectedDefinitionId) {
        errors.push(`${location}.check_definition.definition_id: must equal ${expectedDefinitionId}`);
      }
      if (definitionIds.has(definitionId)) {
        errors.push(`${location}.check_definition.definition_id: duplicate definition id: ${definitionId}`);
      }
      definitionIds.add(definitionId);
    }
  });
  for (const dimension of expectedDimensions) {
    if (!dimensions.has(dimension)) errors.push(`profile.requirements: missing dimension: ${dimension}`);
  }
  return errors;
}

function profileSurfaceKinds(profile) {
  const errors = validateProfile(profile);
  if (errors.length > 0) throw new Error(`invalid release profile: ${errors.join("; ")}`);
  return profile.schema_version === 1 ? [profile.surface_kind] : [...profile.surface_kinds];
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

function digestFile(file) {
  return `sha256:${crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")}`;
}

function assertBundledComponentIntegrity(profile) {
  for (const requirement of profile.requirements) {
    for (const field of ["collector_adapter", "fact_schema", "evaluator"]) {
      const ref = requirement.check_definition[field];
      const key = `${field}:${ref.id}@${ref.version}`;
      const file = BUNDLED_COMPONENT_FILES[key];
      if (!file) throw new Error(`unknown immutable release component: ${key}`);
      const actualDigest = digestFile(file);
      if (ref.sha256 !== actualDigest) {
        throw new Error(`release component integrity mismatch for ${key}: expected ${ref.sha256}, got ${actualDigest}`);
      }
    }
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
  assertBundledComponentIntegrity(value);
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
      evaluator_sha256: requirement.check_definition.evaluator.sha256,
      fact_schema_ref: `${requirement.check_definition.fact_schema.id}@${requirement.check_definition.fact_schema.version}`,
      fact_schema_sha256: requirement.check_definition.fact_schema.sha256,
      collector_adapter_ref: `${requirement.check_definition.collector_adapter.id}@${requirement.check_definition.collector_adapter.version}`,
      collector_adapter_sha256: requirement.check_definition.collector_adapter.sha256,
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
  BUNDLED_COMPONENT_FILES,
  BUNDLED_PROFILE_DIGESTS,
  CANDIDATE_COMPONENTS,
  INTEGRATED_PROFILE_DIMENSIONS,
  INTEGRATED_SURFACE_KINDS,
  PROFILE_DIMENSIONS,
  assertBundledComponentIntegrity,
  assertBundledProfileIntegrity,
  bundledProfilePath,
  digestValue,
  loadBundledProfile,
  profileBinding,
  profileSurfaceKinds,
  stableValue,
  validateProfile,
};
