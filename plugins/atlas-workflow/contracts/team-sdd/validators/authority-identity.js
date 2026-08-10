"use strict";

const path = require("path");

const MAX_AUTHORITY_SLICES = 64;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const IDENTITY_KEYS = [
  "path",
  "task_id",
  "slice_id",
  "brief_json_sha256",
  "brief_md_sha256",
  "evidence_manifest_sha256",
  "review_verdict_sha256",
  "controller_resolution_sha256",
  "global_constraints_sha256",
];

function fail(message) {
  throw new Error(message);
}

function canonicalAuthoritySliceIdentity(value, label = "authority slice identity") {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  for (const key of IDENTITY_KEYS) {
    if (!Object.hasOwn(value, key)) fail(`${label} missing required key: ${key}`);
  }
  for (const key of Object.keys(value)) {
    if (!IDENTITY_KEYS.includes(key)) fail(`${label} unknown key: ${key}`);
  }
  if (typeof value.path !== "string" || !path.isAbsolute(value.path)
    || value.path !== path.resolve(value.path) || value.path !== value.path.normalize("NFC")
    || /[^\x20-\x7e]/.test(value.path)) {
    fail(`${label}.path must be an absolute canonical ASCII path`);
  }
  for (const key of ["task_id", "slice_id"]) {
    if (typeof value[key] !== "string" || !SAFE_ID.test(value[key])) {
      fail(`${label}.${key} must be a safe identifier`);
    }
  }
  for (const key of ["brief_json_sha256", "brief_md_sha256"]) {
    if (typeof value[key] !== "string" || !DIGEST.test(value[key])) {
      fail(`${label}.${key} must use sha256:<64 lowercase hex>`);
    }
  }
  for (const key of [
    "evidence_manifest_sha256",
    "review_verdict_sha256",
    "controller_resolution_sha256",
    "global_constraints_sha256",
  ]) {
    if (value[key] !== null && (typeof value[key] !== "string" || !DIGEST.test(value[key]))) {
      fail(`${label}.${key} must be null or sha256:<64 lowercase hex>`);
    }
  }
  if ((value.review_verdict_sha256 === null) !== (value.controller_resolution_sha256 === null)) {
    fail(`${label} review verdict and controller resolution must both be absent or both be present`);
  }
  return Object.fromEntries(IDENTITY_KEYS.map((key) => [key, value[key]]));
}

function canonicalAuthoritySliceIdentities(values, { requireSorted = true } = {}) {
  if (!Array.isArray(values) || values.length === 0 || values.length > MAX_AUTHORITY_SLICES) {
    fail(`authority_slices must contain 1-${MAX_AUTHORITY_SLICES} identities`);
  }
  const canonical = values.map((value, index) => (
    canonicalAuthoritySliceIdentity(value, `authority_slices[${index}]`)
  ));
  const sorted = [...canonical].sort((left, right) => (
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  ));
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index - 1].path === sorted[index].path) {
      fail(`authority_slices contains duplicate path: ${sorted[index].path}`);
    }
  }
  if (requireSorted && JSON.stringify(canonical) !== JSON.stringify(sorted)) {
    fail("authority_slices must be sorted by canonical path");
  }
  return sorted;
}

module.exports = {
  IDENTITY_KEYS,
  MAX_AUTHORITY_SLICES,
  canonicalAuthoritySliceIdentities,
  canonicalAuthoritySliceIdentity,
};
