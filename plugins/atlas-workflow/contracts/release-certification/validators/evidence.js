"use strict";

const crypto = require("node:crypto");

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const OUTCOMES = new Set(["passed", "failed", "cannot_verify"]);
const SOURCE_KINDS = new Set([
  "business_acceptance",
  "formal_web_ui_review",
  "release_data_review",
  "release_operability_review",
]);
const POLICY_KEYS = [
  "profile_ref", "profile_sha256", "requirement_ref", "requirement_sha256",
  "dimension", "required", "waiver_policy", "definition_ref", "definition_sha256",
  "collector_adapter_ref", "collector_adapter_sha256", "fact_schema_ref",
  "fact_schema_sha256", "evaluator_ref", "evaluator_sha256", "pass_rule_sha256",
  "required_candidate_components",
];
const FACT_KEYS = [
  "schema_version", "fact_id", "policy_binding", "candidate_manifest_digest",
  "outcome", "reason_codes", "summary", "source", "evidence_refs", "evaluated_at",
];
const CONTENT_REF_KEYS = ["ref", "sha256", "kind"];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function digestValue(value) {
  const serialized = JSON.stringify(stableValue(value));
  return `sha256:${crypto.createHash("sha256").update(serialized === undefined ? "undefined" : serialized).digest("hex")}`;
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

function uniqueStrings(value, location, errors, { nonEmpty = false, safe = false } = {}) {
  if (!Array.isArray(value)) {
    errors.push(`${location}: must be an array`);
    return [];
  }
  if (nonEmpty && value.length === 0) errors.push(`${location}: must not be empty`);
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== "string" || !item.trim() || (safe && !SAFE_ID.test(item))) {
      errors.push(`${location}: must contain only ${safe ? "safe " : ""}non-empty strings`);
      continue;
    }
    if (seen.has(item)) errors.push(`${location}: duplicate value: ${item}`);
    seen.add(item);
  }
  return [...seen];
}

function validateDigest(value, location, errors) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    errors.push(`${location}: must be a sha256:<64 lowercase hex> digest`);
  }
}

function validateContentRef(value, location, errors, { source = false } = {}) {
  if (!exactKeys(value, CONTENT_REF_KEYS, CONTENT_REF_KEYS, location, errors)) return;
  nonEmptyString(value.ref, `${location}.ref`, errors);
  validateDigest(value.sha256, `${location}.sha256`, errors);
  if (source) {
    if (!SOURCE_KINDS.has(value.kind)) errors.push(`${location}.kind: unsupported source kind`);
  } else {
    nonEmptyString(value.kind, `${location}.kind`, errors);
  }
}

function validatePolicyBinding(value, location = "policy_binding") {
  const errors = [];
  if (!exactKeys(value, POLICY_KEYS, POLICY_KEYS, location, errors)) return errors;
  for (const field of [
    "profile_ref", "requirement_ref", "dimension", "definition_ref",
    "collector_adapter_ref", "fact_schema_ref", "evaluator_ref",
  ]) {
    nonEmptyString(value[field], `${location}.${field}`, errors);
  }
  for (const field of [
    "profile_sha256", "requirement_sha256", "definition_sha256",
    "collector_adapter_sha256", "fact_schema_sha256", "evaluator_sha256",
    "pass_rule_sha256",
  ]) {
    validateDigest(value[field], `${location}.${field}`, errors);
  }
  if (value.required !== true) errors.push(`${location}.required: must equal true`);
  if (value.waiver_policy !== "never") errors.push(`${location}.waiver_policy: must equal never`);
  uniqueStrings(
    value.required_candidate_components,
    `${location}.required_candidate_components`,
    errors,
    { nonEmpty: true, safe: true },
  );
  return errors;
}

function factBody(value) {
  const { fact_id: _factId, ...body } = value;
  return body;
}

function validateReleaseFact(value, options = {}) {
  const errors = [];
  if (!exactKeys(value, FACT_KEYS, FACT_KEYS, "fact", errors)) return errors;
  if (value.schema_version !== 1) errors.push("fact.schema_version: must equal 1");
  validateDigest(value.fact_id, "fact.fact_id", errors);
  errors.push(...validatePolicyBinding(value.policy_binding, "fact.policy_binding"));
  validateDigest(value.candidate_manifest_digest, "fact.candidate_manifest_digest", errors);
  if (!OUTCOMES.has(value.outcome)) errors.push("fact.outcome: unsupported outcome");
  const reasons = uniqueStrings(value.reason_codes, "fact.reason_codes", errors, { safe: true });
  if (value.outcome === "passed" && reasons.length > 0) {
    errors.push("fact.reason_codes: passed outcome must not contain reasons");
  }
  if (["failed", "cannot_verify"].includes(value.outcome) && reasons.length === 0) {
    errors.push("fact.reason_codes: non-passing outcome requires a reason");
  }
  nonEmptyString(value.summary, "fact.summary", errors, 20);
  validateContentRef(value.source, "fact.source", errors, { source: true });
  if (!Array.isArray(value.evidence_refs)) {
    errors.push("fact.evidence_refs: must be an array");
  } else {
    value.evidence_refs.forEach((ref, index) => validateContentRef(ref, `fact.evidence_refs[${index}]`, errors));
    const refs = value.evidence_refs.map((item) => item?.ref).filter(Boolean);
    if (new Set(refs).size !== refs.length) errors.push("fact.evidence_refs: refs must be unique");
    if (value.outcome === "passed" && value.evidence_refs.length === 0) {
      errors.push("fact.evidence_refs: passed outcome requires content-addressed evidence");
    }
  }
  if (typeof value.evaluated_at !== "string" || Number.isNaN(Date.parse(value.evaluated_at))) {
    errors.push("fact.evaluated_at: must be an ISO-8601 timestamp");
  }
  if (typeof value.fact_id === "string" && value.fact_id !== digestValue(factBody(value))) {
    errors.push("fact.fact_id: does not match the typed fact content");
  }
  if (options.expectedPolicyBinding
    && JSON.stringify(stableValue(value.policy_binding))
      !== JSON.stringify(stableValue(options.expectedPolicyBinding))) {
    errors.push("fact.policy_binding: does not match the admitted release requirement");
  }
  if (options.candidateManifestDigest
    && value.candidate_manifest_digest !== options.candidateManifestDigest) {
    errors.push("fact.candidate_manifest_digest: does not match the final candidate");
  }
  return errors;
}

function createReleaseFact({
  policyBinding,
  candidateManifestDigest,
  outcome,
  reasonCodes = [],
  summary,
  source,
  evidenceRefs = [],
  evaluatedAt,
}) {
  const policyErrors = validatePolicyBinding(policyBinding);
  if (policyErrors.length > 0) throw new Error(`invalid policy binding: ${policyErrors.join("; ")}`);
  const fact = {
    schema_version: 1,
    policy_binding: stableValue(policyBinding),
    candidate_manifest_digest: candidateManifestDigest,
    outcome,
    reason_codes: [...reasonCodes],
    summary,
    source: stableValue(source),
    evidence_refs: evidenceRefs.map(stableValue),
    evaluated_at: evaluatedAt,
  };
  fact.fact_id = digestValue(fact);
  const errors = validateReleaseFact(fact, { expectedPolicyBinding: policyBinding, candidateManifestDigest });
  if (errors.length > 0) throw new Error(`invalid release fact: ${errors.join("; ")}`);
  return fact;
}

function sourceFor(kind, ref, input) {
  return { ref, sha256: digestValue(input), kind };
}

function contentAddressedEvidence(value) {
  if (!Array.isArray(value)) return [];
  const selected = [];
  const seen = new Set();
  for (const item of value) {
    const errors = [];
    validateContentRef(item, "evidence", errors);
    if (errors.length > 0 || seen.has(item.ref)) continue;
    seen.add(item.ref);
    selected.push(stableValue(item));
  }
  return selected;
}

function evidenceByRef(value) {
  return new Map(contentAddressedEvidence(value).map((item) => [item.ref, item]));
}

module.exports = {
  OUTCOMES,
  POLICY_KEYS,
  SOURCE_KINDS,
  contentAddressedEvidence,
  createReleaseFact,
  digestValue,
  evidenceByRef,
  isObject,
  sourceFor,
  stableValue,
  validateContentRef,
  validateDigest,
  validatePolicyBinding,
  validateReleaseFact,
};
