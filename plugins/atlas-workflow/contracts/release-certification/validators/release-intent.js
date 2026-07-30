"use strict";

const { loadBundledProfile, profileBinding } = require("./profile");

const TARGET_DELIVERY_CLASSES = new Set(["exploration", "product_release", "non_product"]);
const WORK_TYPES = new Set(["implementation", "planning", "review", "audit", "docs-only"]);
const RELEASE_STAGES = new Set(["mvp", "beta", "limited_release", "general_availability", "scaled"]);
const ISOLATION_BOUNDARIES = Object.freeze([
  "route", "brand", "data", "credentials", "runtime", "release_config", "user_reachability",
]);
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const AUTHORITY_REF = /^(?:goal|current-required|user-message|operator-input):[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const PRODUCT_STAGE_CLAIM = /\b(?:mvp|beta|ga|limited[ -]?release|general[ -]?availability|scaled[ -]?release|release[ -]?ready|production[ -]?(?:ready|use))\b/i;
const PRODUCT_STAGE_CLAIM_CJK = /(?:正式产品|正式发布|生产可用|生产就绪|可对外发布|公开发布|正式上线)/;
const POSITIVE_PRODUCT_DELIVERY = /\b(?:builds?|creates?|delivers?|deploys?|launches?|publishes?|releases?|ships?)\b.{0,80}\b(?:mvp|beta|general[ -]?availability|product[ -]?release|release[ -]?candidate|web[ -]?ui|api|cli|worker|service)\b/i;
const POSITIVE_PRODUCT_DELIVERY_CJK = /(?:交付|发布|部署|投产|上线).{0,40}(?:MVP|Beta|正式产品|产品版本|发布候选|Web[ -]?UI|API|CLI|worker|服务)/i;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

function nonEmptyString(value, location, errors, minimum = 1) {
  if (typeof value !== "string" || value.trim().length < minimum) {
    errors.push(`${location}: must be a substantive non-empty string`);
  }
}

function uniqueStrings(value, location, errors, expectedValues = null) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${location}: must be a non-empty array of strings`);
    return [];
  }
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== "string" || !item.trim()) {
      errors.push(`${location}: must contain only non-empty strings`);
      continue;
    }
    if (seen.has(item)) errors.push(`${location}: duplicate value: ${item}`);
    if (expectedValues && !expectedValues.has(item)) errors.push(`${location}: unsupported value: ${item}`);
    seen.add(item);
  }
  return [...seen];
}

function validateContentRef(value, location, errors) {
  if (!exactKeys(value, ["ref", "sha256"], ["ref", "sha256"], location, errors)) return;
  nonEmptyString(value.ref, `${location}.ref`, errors);
  if (typeof value.sha256 !== "string" || !SHA256.test(value.sha256)) {
    errors.push(`${location}.sha256: must be a sha256:<64 lowercase hex> digest`);
  }
}

function validateCommon(value, errors) {
  if (value.schema_version !== 1) errors.push("release_intent.schema_version: must equal 1");
  if (!TARGET_DELIVERY_CLASSES.has(value.target_delivery_class)) {
    errors.push("release_intent.target_delivery_class: unsupported target delivery class");
  }
  if (typeof value.target_delivery_authority_ref !== "string"
    || !AUTHORITY_REF.test(value.target_delivery_authority_ref)) {
    errors.push("release_intent.target_delivery_authority_ref: must be a stable authority reference");
  }
}

function validateProductRelease(value, errors) {
  const keys = [
    "schema_version", "target_delivery_class", "target_delivery_authority_ref", "release_stage",
    "surface_inventory", "surface_kinds", "release_profile_refs", "release_claim_refs",
    "audience_refs", "critical_outcome_refs",
  ];
  if (!exactKeys(value, keys, keys, "release_intent", errors)) return;
  validateCommon(value, errors);
  if (!RELEASE_STAGES.has(value.release_stage)) {
    errors.push("release_intent.release_stage: unsupported release stage metadata");
  }
  validateContentRef(value.surface_inventory, "release_intent.surface_inventory", errors);
  const surfaces = uniqueStrings(value.surface_kinds, "release_intent.surface_kinds", errors);
  if (surfaces.length !== 1 || surfaces[0] !== "web_ui") {
    errors.push("release_intent.surface_kinds: v1 supports exactly one pure web_ui surface");
  }
  if (!Array.isArray(value.release_profile_refs) || value.release_profile_refs.length !== 1) {
    errors.push("release_intent.release_profile_refs: v1 requires exactly one profile reference");
  } else {
    const ref = value.release_profile_refs[0];
    if (exactKeys(ref, ["profile_ref", "profile_sha256"], ["profile_ref", "profile_sha256"], "release_intent.release_profile_refs[0]", errors)) {
      nonEmptyString(ref.profile_ref, "release_intent.release_profile_refs[0].profile_ref", errors);
      if (typeof ref.profile_sha256 !== "string" || !SHA256.test(ref.profile_sha256)) {
        errors.push("release_intent.release_profile_refs[0].profile_sha256: must be a sha256:<64 lowercase hex> digest");
      }
      try {
        const profile = loadBundledProfile(ref.profile_ref);
        const binding = profileBinding(profile);
        if (profile.surface_kind !== "web_ui") {
          errors.push("release_intent.release_profile_refs[0]: profile is not applicable to web_ui");
        }
        if (ref.profile_sha256 !== binding.profile_sha256) {
          errors.push("release_intent.release_profile_refs[0].profile_sha256: does not match bundled immutable profile");
        }
      } catch (error) {
        errors.push(`release_intent.release_profile_refs[0].profile_ref: ${error.message}`);
      }
    }
  }
  uniqueStrings(value.release_claim_refs, "release_intent.release_claim_refs", errors);
  uniqueStrings(value.audience_refs, "release_intent.audience_refs", errors);
  uniqueStrings(value.critical_outcome_refs, "release_intent.critical_outcome_refs", errors);
}

function validateExploration(value, errors) {
  const keys = [
    "schema_version", "target_delivery_class", "target_delivery_authority_ref", "artifact_kind",
    "allowed_claims", "isolation_boundaries", "promotion_policy",
  ];
  if (!exactKeys(value, keys, keys, "release_intent", errors)) return;
  validateCommon(value, errors);
  if (!["spike", "prototype", "demo"].includes(value.artifact_kind)) {
    errors.push("release_intent.artifact_kind: must be spike, prototype, or demo");
  }
  const claims = uniqueStrings(value.allowed_claims, "release_intent.allowed_claims", errors);
  if (claims.some((claim) => PRODUCT_STAGE_CLAIM.test(claim) || PRODUCT_STAGE_CLAIM_CJK.test(claim))) {
    errors.push("release_intent.allowed_claims: exploration cannot claim a product stage or release readiness");
  }
  const boundaries = uniqueStrings(
    value.isolation_boundaries,
    "release_intent.isolation_boundaries",
    errors,
    new Set(ISOLATION_BOUNDARIES),
  );
  for (const boundary of ISOLATION_BOUNDARIES) {
    if (!boundaries.includes(boundary)) {
      errors.push(`release_intent.isolation_boundaries: missing mandatory boundary: ${boundary}`);
    }
  }
  if (!["discard", "revalidate"].includes(value.promotion_policy)) {
    errors.push("release_intent.promotion_policy: must be discard or revalidate");
  }
}

function validateNonProduct(value, errors) {
  const keys = [
    "schema_version", "target_delivery_class", "target_delivery_authority_ref",
    "deliverable_kind", "not_applicable_reason",
  ];
  if (!exactKeys(value, keys, keys, "release_intent", errors)) return;
  validateCommon(value, errors);
  nonEmptyString(value.deliverable_kind, "release_intent.deliverable_kind", errors);
  nonEmptyString(value.not_applicable_reason, "release_intent.not_applicable_reason", errors, 20);
  if (typeof value.not_applicable_reason === "string"
    && (POSITIVE_PRODUCT_DELIVERY.test(value.not_applicable_reason)
      || POSITIVE_PRODUCT_DELIVERY_CJK.test(value.not_applicable_reason))) {
    errors.push("release_intent.not_applicable_reason: a product or release cannot be relabeled non_product");
  }
}

function validateReleaseIntent(value) {
  const errors = [];
  if (!isObject(value)) return ["release_intent: must be an object"];
  if (value.target_delivery_class === "product_release") validateProductRelease(value, errors);
  else if (value.target_delivery_class === "exploration") validateExploration(value, errors);
  else if (value.target_delivery_class === "non_product") validateNonProduct(value, errors);
  else {
    const keys = ["schema_version", "target_delivery_class", "target_delivery_authority_ref"];
    exactKeys(value, keys, keys, "release_intent", errors);
    validateCommon(value, errors);
  }
  return errors;
}

function extractReleaseIntent(markdown) {
  const pattern = /^```atlas-release-intent\+json[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm;
  const matches = [...String(markdown).matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error(`expected exactly one atlas-release-intent+json fenced block, found ${matches.length}`);
  }
  let intent;
  try {
    intent = JSON.parse(matches[0][1]);
  } catch (error) {
    throw new Error(`invalid release intent JSON: ${error.message}`);
  }
  const errors = validateReleaseIntent(intent);
  if (errors.length > 0) throw new Error(errors.join("; "));
  return intent;
}

function extractContractWorkType(markdown) {
  const matches = [...String(markdown).matchAll(/^work_type:[ \t]*([^\r\n]+?)[ \t]*$/gm)];
  if (matches.length !== 1) {
    throw new Error(`expected exactly one work_type field, found ${matches.length}`);
  }
  const workType = matches[0][1].trim();
  if (!WORK_TYPES.has(workType)) {
    throw new Error(`unsupported work_type: ${workType}`);
  }
  return workType;
}

module.exports = {
  ISOLATION_BOUNDARIES,
  RELEASE_STAGES,
  TARGET_DELIVERY_CLASSES,
  WORK_TYPES,
  extractContractWorkType,
  extractReleaseIntent,
  validateReleaseIntent,
};
