"use strict";

const {
  contentAddressedEvidence,
  createReleaseFact,
  isObject,
  sourceFor,
  validateContentRef,
  validateDigest,
} = require("../validators/evidence");

const INPUT_KEYS = [
  "schema_version", "review_id", "candidate_manifest_digest", "status", "data_mode",
  "product_routes_reviewed", "demo_seed_detected", "acceptance_data_detected",
  "lifecycle_verified", "schema_migration_verified", "summary", "evidence_refs",
];

function validateInput(input) {
  const errors = [];
  if (!isObject(input)) return ["input must be an object"];
  for (const key of INPUT_KEYS) {
    if (!Object.hasOwn(input, key)) errors.push(`missing required key: ${key}`);
  }
  for (const key of Object.keys(input)) {
    if (!INPUT_KEYS.includes(key)) errors.push(`unknown key: ${key}`);
  }
  if (input.schema_version !== 1) errors.push("schema_version must equal 1");
  if (typeof input.review_id !== "string" || !input.review_id.trim()) errors.push("review_id must be non-empty");
  validateDigest(input.candidate_manifest_digest, "candidate_manifest_digest", errors);
  if (!["accepted", "rejected", "cannot_verify"].includes(input.status)) errors.push("status is invalid");
  if (!["production_equivalent", "demo", "synthetic", "unknown"].includes(input.data_mode)) {
    errors.push("data_mode is invalid");
  }
  if (!Array.isArray(input.product_routes_reviewed)
    || input.product_routes_reviewed.some((item) => typeof item !== "string" || !item.trim())) {
    errors.push("product_routes_reviewed must be an array of non-empty routes");
  } else if (new Set(input.product_routes_reviewed).size !== input.product_routes_reviewed.length) {
    errors.push("product_routes_reviewed must not contain duplicates");
  }
  for (const key of [
    "demo_seed_detected", "acceptance_data_detected", "lifecycle_verified", "schema_migration_verified",
  ]) {
    if (typeof input[key] !== "boolean") errors.push(`${key} must be a boolean`);
  }
  if (typeof input.summary !== "string" || input.summary.trim().length < 20) {
    errors.push("summary must be substantive");
  }
  if (!Array.isArray(input.evidence_refs)) {
    errors.push("evidence_refs must be an array");
  } else {
    input.evidence_refs.forEach((ref, index) => validateContentRef(ref, `evidence_refs[${index}]`, errors));
    const refs = input.evidence_refs.map((item) => item?.ref).filter(Boolean);
    if (new Set(refs).size !== refs.length) errors.push("evidence_refs must not contain duplicate refs");
  }
  return errors;
}

function collectReleaseData(input, options) {
  const { policyBinding, candidateManifestDigest, evaluatedAt } = options;
  if (policyBinding.dimension !== "production-data"
    || policyBinding.collector_adapter_ref !== "release-data-v1@1") {
    throw new Error("release-data-v1 requires the production-data policy binding");
  }
  const errors = validateInput(input);
  const source = sourceFor("release_data_review", `release-data:${input?.review_id || "unknown"}`, input);
  let outcome = "cannot_verify";
  let reasonCodes = ["DATA_REVIEW_INVALID"];
  let summary = "Release data review is incomplete, inconsistent, or not valid under the strict production-data contract.";

  if (errors.length === 0 && input.candidate_manifest_digest !== candidateManifestDigest) {
    reasonCodes = ["CANDIDATE_IDENTITY_MISMATCH"];
    summary = "Release data evidence was collected for a different candidate manifest and cannot support this release.";
  } else if (errors.length === 0
    && (input.demo_seed_detected || input.acceptance_data_detected
      || ["demo", "synthetic"].includes(input.data_mode))) {
    outcome = "failed";
    reasonCodes = ["DEMO_OR_ACCEPTANCE_DATA_LEAKAGE"];
    summary = "Demo, synthetic, or acceptance data is present on a product route or is represented as production data.";
  } else if (errors.length === 0 && input.status === "rejected") {
    outcome = "failed";
    reasonCodes = ["PRODUCTION_DATA_REJECTED"];
    summary = input.summary;
  } else if (errors.length === 0
    && input.status === "accepted"
    && input.data_mode === "production_equivalent"
    && input.product_routes_reviewed.length > 0
    && input.lifecycle_verified
    && input.schema_migration_verified
    && input.evidence_refs.length > 0) {
    outcome = "passed";
    reasonCodes = [];
    summary = input.summary;
  } else if (errors.length === 0) {
    reasonCodes = ["PRODUCTION_DATA_UNRESOLVED"];
    summary = "Production data mode, lifecycle, schema migration, reviewed routes, or content-addressed evidence is unresolved.";
  }

  return createReleaseFact({
    policyBinding,
    candidateManifestDigest,
    outcome,
    reasonCodes,
    summary,
    source,
    evidenceRefs: contentAddressedEvidence(input?.evidence_refs),
    evaluatedAt,
  });
}

module.exports = { collectReleaseData, validateInput };
