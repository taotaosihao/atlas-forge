"use strict";

const {
  createReleaseFact,
  evidenceByRef,
  isObject,
  sourceFor,
  validateContentRef,
  validateDigest,
} = require("../validators/evidence");

const CONTROLS = Object.freeze([
  "authentication",
  "authorization",
  "privacy",
  "secrets",
  "observability",
  "failure_diagnosis",
  "recovery",
  "rollback",
  "support",
]);
const INPUT_KEYS = [
  "schema_version", "review_id", "candidate_manifest_digest", "owner_decision",
  "controls", "evidence_refs",
];
const OWNER_KEYS = ["owner", "status", "evidence_ref"];
const CONTROL_KEYS = ["status", "summary", "evidence_refs"];
const STATUSES = new Set(["passed", "failed", "cannot_verify"]);

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
  if (!isObject(input.owner_decision)) {
    errors.push("owner_decision must be an object");
  } else {
    for (const key of OWNER_KEYS) {
      if (!Object.hasOwn(input.owner_decision, key)) errors.push(`owner_decision missing required key: ${key}`);
    }
    for (const key of Object.keys(input.owner_decision)) {
      if (!OWNER_KEYS.includes(key)) errors.push(`owner_decision unknown key: ${key}`);
    }
    if (typeof input.owner_decision.owner !== "string" || !input.owner_decision.owner.trim()) {
      errors.push("owner_decision.owner must be non-empty");
    }
    if (!["accepted", "rejected", "cannot_verify"].includes(input.owner_decision.status)) {
      errors.push("owner_decision.status is invalid");
    }
    if (typeof input.owner_decision.evidence_ref !== "string" || !input.owner_decision.evidence_ref.trim()) {
      errors.push("owner_decision.evidence_ref must be non-empty");
    }
  }
  if (!isObject(input.controls)) {
    errors.push("controls must be an object");
  } else {
    for (const control of CONTROLS) {
      const value = input.controls[control];
      if (!isObject(value)) {
        errors.push(`controls.${control} must be an object`);
        continue;
      }
      for (const key of CONTROL_KEYS) {
        if (!Object.hasOwn(value, key)) errors.push(`controls.${control} missing required key: ${key}`);
      }
      for (const key of Object.keys(value)) {
        if (!CONTROL_KEYS.includes(key)) errors.push(`controls.${control} unknown key: ${key}`);
      }
      if (!STATUSES.has(value.status)) errors.push(`controls.${control}.status is invalid`);
      if (typeof value.summary !== "string" || value.summary.trim().length < 20) {
        errors.push(`controls.${control}.summary must be substantive`);
      }
      if (!Array.isArray(value.evidence_refs)
        || value.evidence_refs.some((item) => typeof item !== "string" || !item.trim())) {
        errors.push(`controls.${control}.evidence_refs must be an array of non-empty strings`);
      } else if (new Set(value.evidence_refs).size !== value.evidence_refs.length) {
        errors.push(`controls.${control}.evidence_refs must not contain duplicates`);
      }
    }
    for (const key of Object.keys(input.controls)) {
      if (!CONTROLS.includes(key)) errors.push(`controls unknown key: ${key}`);
    }
  }
  if (!Array.isArray(input.evidence_refs)) {
    errors.push("evidence_refs must be an array");
  } else {
    input.evidence_refs.forEach((ref, index) => validateContentRef(ref, `evidence_refs[${index}]`, errors));
    const refs = input.evidence_refs.map((item) => item?.ref).filter(Boolean);
    if (new Set(refs).size !== refs.length) errors.push("evidence_refs must not contain duplicate refs");
    const known = new Set(refs);
    if (input.owner_decision?.evidence_ref && !known.has(input.owner_decision.evidence_ref)) {
      errors.push("owner_decision.evidence_ref is not content-addressed in evidence_refs");
    }
    for (const control of CONTROLS) {
      for (const ref of input.controls?.[control]?.evidence_refs || []) {
        if (!known.has(ref)) errors.push(`controls.${control}.evidence_refs contains unknown ref: ${ref}`);
      }
    }
  }
  return errors;
}

function collectReleaseOperability(input, options) {
  const { policyBinding, candidateManifestDigest, evaluatedAt } = options;
  if (policyBinding.dimension !== "security-operability"
    || policyBinding.collector_adapter_ref !== "release-operability-v1@1") {
    throw new Error("release-operability-v1 requires the security-operability policy binding");
  }
  const errors = validateInput(input);
  const source = sourceFor(
    "release_operability_review",
    `release-operability:${input?.review_id || "unknown"}`,
    input,
  );
  const values = CONTROLS.map((control) => input?.controls?.[control]).filter(Boolean);
  let outcome = "cannot_verify";
  let reasonCodes = ["OPERABILITY_REVIEW_INVALID"];
  let summary = "Security and operability review is incomplete, inconsistent, or invalid under the strict release contract.";
  if (errors.length === 0 && input.candidate_manifest_digest !== candidateManifestDigest) {
    reasonCodes = ["CANDIDATE_IDENTITY_MISMATCH"];
    summary = "Security and operability evidence was collected for a different candidate manifest.";
  } else if (errors.length === 0 && (input.owner_decision.status === "rejected"
    || values.some((control) => control.status === "failed"))) {
    outcome = "failed";
    reasonCodes = ["SECURITY_OR_OPERABILITY_REJECTED"];
    summary = "At least one required security or operability control is known to fail for the current candidate.";
  } else if (errors.length === 0 && input.owner_decision.status === "accepted"
    && values.length === CONTROLS.length
    && values.every((control) => control.status === "passed" && control.evidence_refs.length > 0)) {
    outcome = "passed";
    reasonCodes = [];
    summary = "All required security, privacy, observability, recovery, rollback, and support controls have accepted evidence.";
  } else if (errors.length === 0) {
    reasonCodes = ["SECURITY_OR_OPERABILITY_UNRESOLVED"];
    summary = "At least one required security or operability control or owner decision remains unresolved.";
  }

  const evidence = evidenceByRef(input?.evidence_refs);
  const selectedRefs = new Set([
    input?.owner_decision?.evidence_ref,
    ...CONTROLS.flatMap((control) => input?.controls?.[control]?.evidence_refs || []),
  ].filter(Boolean));
  return createReleaseFact({
    policyBinding,
    candidateManifestDigest,
    outcome,
    reasonCodes,
    summary,
    source,
    evidenceRefs: [...selectedRefs].map((ref) => evidence.get(ref)).filter(Boolean),
    evaluatedAt,
  });
}

module.exports = { CONTROLS, collectReleaseOperability, validateInput };
