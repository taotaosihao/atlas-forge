"use strict";

const {
  contentAddressedEvidence,
  createReleaseFact,
  evidenceByRef,
  isObject,
  sourceFor,
  validateContentRef,
  validateDigest,
} = require("../validators/evidence");

const DIMENSIONS = Object.freeze([
  "capability-truth",
  "surface-states",
  "formal-content-ia",
  "accessibility-quality",
]);
const INPUT_KEYS = [
  "schema_version", "review_id", "candidate_manifest_digest", "surface_inventory",
  "owner_decision", "dimensions", "failure_checks", "evidence_refs",
];
const DIMENSION_KEYS = ["status", "summary", "evidence_refs", "finding_codes"];
const OWNER_KEYS = ["owner", "status", "evidence_ref"];
const FAILURE_KEYS = ["dead_controls", "happy_path_only", "engineering_meta_leakage"];
const STATUSES = new Set(["passed", "failed", "cannot_verify"]);

function validateReview(input) {
  const errors = [];
  if (!isObject(input)) return ["input must be an object"];
  for (const key of INPUT_KEYS) {
    if (!Object.hasOwn(input, key)) errors.push(`missing required key: ${key}`);
  }
  for (const key of Object.keys(input)) {
    if (!INPUT_KEYS.includes(key)) errors.push(`unknown key: ${key}`);
  }
  if (input.schema_version !== 2) errors.push("schema_version must equal 2");
  if (typeof input.review_id !== "string" || !input.review_id.trim()) errors.push("review_id must be non-empty");
  validateDigest(input.candidate_manifest_digest, "candidate_manifest_digest", errors);
  validateContentRef(input.surface_inventory, "surface_inventory", errors);
  if (input.surface_inventory?.kind !== "surface_inventory") {
    errors.push("surface_inventory.kind must equal surface_inventory");
  }
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
  if (!isObject(input.dimensions)) {
    errors.push("dimensions must be an object");
  } else {
    for (const dimension of DIMENSIONS) {
      const value = input.dimensions[dimension];
      if (!isObject(value)) {
        errors.push(`dimensions.${dimension} must be an object`);
        continue;
      }
      for (const key of DIMENSION_KEYS) {
        if (!Object.hasOwn(value, key)) errors.push(`dimensions.${dimension} missing required key: ${key}`);
      }
      for (const key of Object.keys(value)) {
        if (!DIMENSION_KEYS.includes(key)) errors.push(`dimensions.${dimension} unknown key: ${key}`);
      }
      if (!STATUSES.has(value.status)) errors.push(`dimensions.${dimension}.status is invalid`);
      if (typeof value.summary !== "string" || value.summary.trim().length < 20) {
        errors.push(`dimensions.${dimension}.summary must be substantive`);
      }
      for (const field of ["evidence_refs", "finding_codes"]) {
        if (!Array.isArray(value[field]) || value[field].some((item) => typeof item !== "string" || !item.trim())) {
          errors.push(`dimensions.${dimension}.${field} must be an array of non-empty strings`);
        } else if (new Set(value[field]).size !== value[field].length) {
          errors.push(`dimensions.${dimension}.${field} must not contain duplicates`);
        }
      }
    }
    for (const key of Object.keys(input.dimensions)) {
      if (!DIMENSIONS.includes(key)) errors.push(`dimensions unknown key: ${key}`);
    }
  }
  if (!isObject(input.failure_checks)) {
    errors.push("failure_checks must be an object");
  } else {
    for (const key of FAILURE_KEYS) {
      if (!Object.hasOwn(input.failure_checks, key)) errors.push(`failure_checks missing required key: ${key}`);
      if (!STATUSES.has(input.failure_checks[key])) errors.push(`failure_checks.${key} is invalid`);
    }
    for (const key of Object.keys(input.failure_checks)) {
      if (!FAILURE_KEYS.includes(key)) errors.push(`failure_checks unknown key: ${key}`);
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
    for (const dimension of DIMENSIONS) {
      for (const ref of input.dimensions?.[dimension]?.evidence_refs || []) {
        if (!known.has(ref)) errors.push(`dimensions.${dimension}.evidence_refs contains unknown ref: ${ref}`);
      }
    }
  }
  return errors;
}

function dimensionOutcome(input, dimension, errors, candidateMatches) {
  if (errors.length > 0) {
    return {
      outcome: "cannot_verify",
      reasonCodes: ["FORMAL_REVIEW_INVALID"],
      summary: "Formal Web UI review input is incomplete, inconsistent, or not valid under the strict release contract.",
    };
  }
  if (!candidateMatches) {
    return {
      outcome: "cannot_verify",
      reasonCodes: ["CANDIDATE_IDENTITY_MISMATCH"],
      summary: "Formal Web UI evidence was collected for a different candidate manifest and cannot support this release.",
    };
  }
  const value = input.dimensions[dimension];
  const failureKey = {
    "capability-truth": "dead_controls",
    "surface-states": "happy_path_only",
    "formal-content-ia": "engineering_meta_leakage",
  }[dimension];
  if (input.owner_decision.status === "rejected") {
    return {
      outcome: "failed",
      reasonCodes: ["FORMAL_OWNER_REJECTED"],
      summary: "The accountable owner explicitly rejected the formal Web UI evidence for the current candidate.",
    };
  }
  if (value.status === "failed" || (failureKey && input.failure_checks[failureKey] === "failed")) {
    return {
      outcome: "failed",
      reasonCodes: [failureKey ? failureKey.toUpperCase() : `${dimension.toUpperCase().replaceAll("-", "_")}_FAILED`],
      summary: value.summary,
    };
  }
  if (value.status === "cannot_verify"
    || (failureKey && input.failure_checks[failureKey] === "cannot_verify")
    || input.owner_decision.status !== "accepted"
    || value.evidence_refs.length === 0
    || value.finding_codes.length > 0) {
    return {
      outcome: "cannot_verify",
      reasonCodes: ["FORMAL_REVIEW_UNRESOLVED"],
      summary: "Formal Web UI evidence or owner decision is conditional, missing, unstable, or contains unresolved findings.",
    };
  }
  return { outcome: "passed", reasonCodes: [], summary: value.summary };
}

function collectFormalWebUi(input, options) {
  const { policyBindings, candidateManifestDigest, evaluatedAt } = options;
  const bindings = new Map((policyBindings || []).map((binding) => [binding.dimension, binding]));
  if (DIMENSIONS.some((dimension) => (
    !bindings.has(dimension)
    || bindings.get(dimension).collector_adapter_ref !== "formal-web-ui-v1@1"
  ))) {
    throw new Error("formal-web-ui-v1 requires all four formal Web UI policy bindings");
  }
  const errors = validateReview(input);
  const candidateMatches = input?.candidate_manifest_digest === candidateManifestDigest;
  const source = sourceFor("formal_web_ui_review", `formal-web-ui:${input?.review_id || "unknown"}`, input);
  const evidence = evidenceByRef(input?.evidence_refs);
  return DIMENSIONS.map((dimension) => {
    const evaluation = dimensionOutcome(input, dimension, errors, candidateMatches);
    const refs = input?.dimensions?.[dimension]?.evidence_refs || [];
    const selected = refs.map((ref) => evidence.get(ref)).filter(Boolean);
    const ownerEvidence = evidence.get(input?.owner_decision?.evidence_ref);
    if (ownerEvidence && !selected.some((item) => item.ref === ownerEvidence.ref)) selected.push(ownerEvidence);
    const evidenceRefs = contentAddressedEvidence([input?.surface_inventory, ...selected]);
    return createReleaseFact({
      policyBinding: bindings.get(dimension),
      candidateManifestDigest,
      ...evaluation,
      source,
      evidenceRefs,
      evaluatedAt,
    });
  });
}

module.exports = { DIMENSIONS, collectFormalWebUi, validateReview };
