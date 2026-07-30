"use strict";

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const PRODUCER_REF = /^[A-Za-z0-9][A-Za-z0-9._/@:-]*$/;
const KEYS = [
  "schema_version",
  "producer_ref",
  "producer_sha256",
  "source_ref",
  "source_sha256",
  "candidate_manifest_digest",
  "requirement_refs",
];

function validateReleaseProducerProvenance(value, context = {}) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["trusted producer provenance is missing"];
  }
  for (const key of KEYS) {
    if (!Object.hasOwn(value, key)) errors.push(`producer provenance missing required key: ${key}`);
  }
  for (const key of Object.keys(value)) {
    if (!KEYS.includes(key)) errors.push(`producer provenance unknown key: ${key}`);
  }
  if (value.schema_version !== 1) errors.push("producer provenance schema_version must equal 1");
  if (typeof value.producer_ref !== "string" || !PRODUCER_REF.test(value.producer_ref)) {
    errors.push("producer provenance producer_ref is invalid");
  }
  for (const key of ["producer_sha256", "source_sha256", "candidate_manifest_digest"]) {
    if (!DIGEST.test(value[key] || "")) errors.push(`producer provenance ${key} is invalid`);
  }
  if (typeof value.source_ref !== "string" || !value.source_ref.trim()) {
    errors.push("producer provenance source_ref must be non-empty");
  }
  if (!Array.isArray(value.requirement_refs) || value.requirement_refs.length !== 1
    || typeof value.requirement_refs[0] !== "string" || !value.requirement_refs[0]) {
    errors.push("producer provenance must cover exactly one release requirement");
  }

  const identity = context.identity || {};
  const knownProducerDigests = new Set([
    ...(identity.toolchain || []).map((item) => item?.sha256),
    ...(identity.inputs || []).map((item) => item?.sha256),
  ].filter(Boolean));
  if (context.identity && !knownProducerDigests.has(value.producer_sha256)) {
    errors.push("producer provenance is not bound to the captured toolchain or inputs");
  }
  if (context.sourceEntry && (value.source_ref !== context.sourceEntry.requested
    || value.source_sha256 !== context.sourceEntry.sha256)) {
    errors.push("producer provenance does not bind the raw collector input");
  }
  if (context.candidateManifestDigest
    && value.candidate_manifest_digest !== context.candidateManifestDigest) {
    errors.push("producer provenance does not bind the release candidate");
  }
  if (context.requirementRef
    && (value.requirement_refs.length !== 1 || value.requirement_refs[0] !== context.requirementRef)) {
    errors.push("producer provenance does not bind the current release requirement");
  }
  return errors;
}

module.exports = { validateReleaseProducerProvenance };
