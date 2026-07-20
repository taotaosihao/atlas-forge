"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  isObject,
  requireObject,
  requireKeys,
  rejectUnknownKeys,
  expectInteger,
  expectEnum,
  expectString,
  expectStringArray,
  expectArray,
  expectSafeId,
} = require("./common");

const DOCUMENT_KEYS = [
  "schema_version",
  "task_id",
  "slice_id",
  "verdict_digest",
  "goal_ref",
  "records",
  "evidence_gaps",
];
const RECORD_KEYS = [
  "finding_id",
  "disposition",
  "basis",
  "authority_refs",
  "repair_status",
  "reason",
];
const GAP_KEYS = ["gap_id", "status", "evidence_refs", "reason"];
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const CANONICAL_REQUIREMENTS_PATH = "brief.md";
const CANONICAL_GLOBAL_CONSTRAINTS_PATH = "../../global-constraints.md";
const SAFETY_INVARIANTS = new Set([
  "invariant:safety",
  "invariant:data-integrity",
  "invariant:permission-boundary",
]);
const PLACEHOLDER_REASON_TOKENS = new Set([
  "-",
  "—",
  "fixme",
  "n/a",
  "na",
  "none",
  "null",
  "placeholder",
  "tbd",
  "todo",
  "unknown",
  "unset",
  "占位",
  "待定",
  "待确认",
  "待补充",
  "未定",
  "暂无",
]);
const PLACEHOLDER_REASON_SEPARATORS = new Set([
  " ",
  "\t",
  ":",
  "：",
  ".",
  "。",
  ",",
  "，",
  ";",
  "；",
  "!",
  "！",
  "?",
  "？",
  "-",
  "—",
  "–",
]);

function isPlaceholderReason(value) {
  if (typeof value !== "string") return true;
  const normalized = value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/^[`'"“”‘’()[\]{}<>《》【】]+|[`'"“”‘’()[\]{}<>《》【】]+$/gu, "")
    .trim();
  if (!normalized) return true;
  for (const token of PLACEHOLDER_REASON_TOKENS) {
    if (normalized === token) return true;
    if (
      normalized.startsWith(token)
      && PLACEHOLDER_REASON_SEPARATORS.has(normalized[token.length])
    ) return true;
  }
  return false;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function digestFile(file) {
  return sha256(fs.readFileSync(file));
}

function computeGoalRef(brief, sliceDir) {
  if (brief.requirements_path !== CANONICAL_REQUIREMENTS_PATH) {
    throw new Error(`requirements_path must be canonical: ${CANONICAL_REQUIREMENTS_PATH}`);
  }
  const requirementsFile = path.join(sliceDir, CANONICAL_REQUIREMENTS_PATH);
  const requirementsStat = fs.lstatSync(requirementsFile);
  if (!requirementsStat.isFile() || requirementsStat.isSymbolicLink()) {
    throw new Error("canonical requirements file must be a regular non-symlink file");
  }
  const requirementsRealPath = fs.realpathSync(requirementsFile);
  const relativeToSlice = path.relative(sliceDir, requirementsRealPath);
  if (
    requirementsRealPath !== requirementsFile
    || relativeToSlice.startsWith("..")
    || path.isAbsolute(relativeToSlice)
  ) {
    throw new Error("canonical requirements file must remain inside the current slice");
  }
  const evidenceManifestFile = path.join(sliceDir, "evidence-manifest.json");
  let contractDigest = null;
  if (fs.existsSync(evidenceManifestFile)) {
    const manifest = JSON.parse(fs.readFileSync(evidenceManifestFile, "utf8"));
    contractDigest = typeof manifest.contract_sha256 === "string"
      ? manifest.contract_sha256
      : null;
  }
  const acceptanceRefs = [...brief.acceptance_refs]
    .map((item) => item.trim())
    .sort();
  return sha256(JSON.stringify({
    task_id: brief.task_id,
    slice_id: brief.slice_id,
    requirements_digest: digestFile(requirementsFile),
    contract_digest: contractDigest,
    acceptance_refs: acceptanceRefs,
    base_sha: brief.base_sha,
  }));
}

function validateControllerResolution(value) {
  const errors = [];
  if (!requireObject(value, errors)) {
    return errors;
  }
  requireKeys(value, DOCUMENT_KEYS, errors);
  rejectUnknownKeys(value, DOCUMENT_KEYS, errors);
  expectInteger(value, "schema_version", errors);
  if (value.schema_version !== 2) errors.push("schema_version must be 2");
  expectSafeId(value, "task_id", errors);
  expectSafeId(value, "slice_id", errors);
  expectString(value, "verdict_digest", errors);
  expectString(value, "goal_ref", errors);
  if (typeof value.verdict_digest === "string" && !DIGEST_PATTERN.test(value.verdict_digest)) {
    errors.push("verdict_digest must be a lowercase SHA-256 digest");
  }
  if (typeof value.goal_ref === "string" && !DIGEST_PATTERN.test(value.goal_ref)) {
    errors.push("goal_ref must be a lowercase SHA-256 digest");
  }
  expectArray(value, "records", errors);
  expectArray(value, "evidence_gaps", errors);
  if (Array.isArray(value.records)) {
    value.records.forEach((record, index) => validateRecord(record, index, errors));
    validateUniqueIdentities(value.records, "finding_id", errors);
  }
  if (Array.isArray(value.evidence_gaps)) {
    value.evidence_gaps.forEach((gap, index) => validateGap(gap, index, errors));
    validateUniqueIdentities(value.evidence_gaps, "gap_id", errors);
  }
  return errors;
}

function validateUniqueIdentities(items, key, errors) {
  const seen = new Set();
  for (const item of items) {
    if (!isObject(item) || typeof item[key] !== "string") continue;
    if (seen.has(item[key])) errors.push(`duplicate ${key}: ${item[key]}`);
    seen.add(item[key]);
  }
}

function validateRecord(record, index, errors) {
  const label = `records[${index}]`;
  if (!isObject(record)) {
    errors.push(`${label} must be an object`);
    return;
  }
  requireKeys(record, RECORD_KEYS, errors);
  rejectUnknownKeys(record, RECORD_KEYS, errors);
  expectSafeId(record, "finding_id", errors);
  expectEnum(record, "disposition", ["current-required", "visible-follow-up", "informational"], errors);
  expectEnum(record, "basis", ["goal-blocker", "diff-regression", "safety-data-permission-risk", "not-current-required", "no-action"], errors);
  expectStringArray(record, "authority_refs", errors);
  expectEnum(record, "repair_status", ["open", "resolved", "omitted"], errors);
  expectString(record, "reason", errors);

  const authorities = Array.isArray(record.authority_refs) ? record.authority_refs : [];
  if (record.disposition === "current-required") {
    if (!["goal-blocker", "diff-regression", "safety-data-permission-risk"].includes(record.basis)) {
      errors.push(`${label} current-required has invalid basis`);
    }
    if (!["open", "resolved"].includes(record.repair_status)) {
      errors.push(`${label} current-required requires open or resolved repair_status`);
    }
    if (authorities.length === 0 || authorities.some((item) => item.length === 0)) {
      errors.push(`${label} current-required requires non-empty authority_refs`);
    }
  } else {
    const expectedBasis = record.disposition === "visible-follow-up" ? "not-current-required" : "no-action";
    if (record.basis !== expectedBasis) {
      errors.push(`${label} ${record.disposition} requires basis ${expectedBasis}`);
    }
    if (record.repair_status !== "omitted") {
      errors.push(`${label} ${record.disposition} requires repair_status omitted`);
    }
    if (authorities.length !== 0) {
      errors.push(`${label} ${record.disposition} must not carry authority_refs`);
    }
  }
}

function validateGap(gap, index, errors) {
  const label = `evidence_gaps[${index}]`;
  if (!isObject(gap)) {
    errors.push(`${label} must be an object`);
    return;
  }
  requireKeys(gap, GAP_KEYS, errors);
  rejectUnknownKeys(gap, GAP_KEYS, errors);
  expectSafeId(gap, "gap_id", errors);
  expectEnum(gap, "status", ["open", "resolved", "terminal-blocker"], errors);
  expectStringArray(gap, "evidence_refs", errors);
  expectString(gap, "reason", errors);
  if (gap.status === "resolved" && (!Array.isArray(gap.evidence_refs) || gap.evidence_refs.length === 0)) {
    errors.push(`${label} resolved requires evidence_refs`);
  }
}

function validateControllerResolutionAgainst(value, context) {
  const errors = validateControllerResolution(value);
  if (errors.length > 0) return errors;
  const { verdict, brief, verdictDigest, goalRef } = context;
  if (value.task_id !== verdict.task_id || value.task_id !== brief.task_id) {
    errors.push(`TASK_ID_MISMATCH expected ${brief.task_id}, got ${value.task_id}`);
  }
  if (value.slice_id !== verdict.slice_id || value.slice_id !== brief.slice_id) {
    errors.push(`SLICE_ID_MISMATCH expected ${brief.slice_id}, got ${value.slice_id}`);
  }
  if (value.verdict_digest !== verdictDigest) {
    errors.push(`VERDICT_DIGEST_MISMATCH expected ${verdictDigest}, got ${value.verdict_digest}`);
  }
  if (value.goal_ref !== goalRef) {
    errors.push(`GOAL_REF_MISMATCH expected ${goalRef}, got ${value.goal_ref}`);
  }

  validateCoverage(
    verdict.issues.map((issue) => issue.finding_id),
    value.records.map((record) => record.finding_id),
    "finding_id",
    errors,
  );
  validateCoverage(
    verdict.cannot_verify_from_diff.map((gap) => gap.gap_id),
    value.evidence_gaps.map((gap) => gap.gap_id),
    "gap_id",
    errors,
  );
  value.records.forEach((record, index) => validateAuthority(
    record,
    index,
    verdict,
    brief,
    context.sliceDir,
    errors,
  ));
  return errors;
}

function validateCoverage(expectedValues, actualValues, label, errors) {
  const expected = new Set(expectedValues);
  const counts = new Map();
  for (const actual of actualValues) counts.set(actual, (counts.get(actual) || 0) + 1);
  for (const item of expected) {
    if (!counts.has(item)) errors.push(`${label.toUpperCase()}_MISSING ${item}`);
    if ((counts.get(item) || 0) > 1) errors.push(`${label.toUpperCase()}_DUPLICATE ${item}`);
  }
  for (const item of counts.keys()) {
    if (!expected.has(item)) errors.push(`${label.toUpperCase()}_UNKNOWN ${item}`);
  }
}

function validateAuthority(record, index, verdict, brief, sliceDir, errors) {
  if (record.disposition !== "current-required") return;
  const label = `records[${index}]`;
  const refs = new Set(record.authority_refs);
  const diffRef = `diff:${verdict.base_sha}..${verdict.head_sha}`;
  if (record.basis === "goal-blocker") {
    if (!brief.acceptance_refs.some((ref) => refs.has(`acceptance:${ref}`))) {
      errors.push(`${label} goal-blocker requires an authority ref for a current acceptance`);
    }
  } else if (record.basis === "diff-regression") {
    if (!refs.has(`slice:${brief.slice_id}`) || !refs.has(diffRef)) {
      errors.push(`${label} diff-regression requires current slice and diff authority refs`);
    }
  } else if (record.basis === "safety-data-permission-risk") {
    const invariantRefs = [...refs].filter((ref) => ref.startsWith("invariant:"));
    if (!invariantRefs.some((ref) => SAFETY_INVARIANTS.has(ref))) {
      errors.push(`${label} safety-data-permission-risk requires a canonical safety/data/permission invariant`);
    }
    if (invariantRefs.some((ref) => !SAFETY_INVARIANTS.has(ref))) {
      errors.push(`${label} safety-data-permission-risk rejects non-canonical invariant refs`);
    }
    if (!refs.has(diffRef)) {
      errors.push(`${label} safety-data-permission-risk requires the current diff authority ref`);
    }
    if (!brief.acceptance_refs.some((ref) => refs.has(`acceptance:${ref}`))) {
      errors.push(`${label} safety-data-permission-risk requires an authority ref for a current acceptance`);
    }
    if (isPlaceholderReason(record.reason)) {
      errors.push(`${label} safety-data-permission-risk requires a substantive causal reason`);
    }
    if (brief.global_constraints_path !== CANONICAL_GLOBAL_CONSTRAINTS_PATH) {
      errors.push(`${label} safety-data-permission-risk requires canonical global_constraints_path ${CANONICAL_GLOBAL_CONSTRAINTS_PATH}`);
    }
    const taskSddRoot = sliceDir ? path.resolve(sliceDir, "../..") : null;
    const constraintsPath = taskSddRoot
      ? path.join(taskSddRoot, "global-constraints.md")
      : null;
    let constraintsStat = null;
    try {
      constraintsStat = constraintsPath ? fs.lstatSync(constraintsPath) : null;
    } catch (_error) {
      errors.push(`${label} safety-data-permission-risk requires the current global constraints file`);
    }
    if (constraintsStat && (!constraintsStat.isFile() || constraintsStat.isSymbolicLink())) {
      errors.push(`${label} safety-data-permission-risk requires a regular non-symlink global constraints file`);
    } else if (constraintsStat) {
      const constraintsRealPath = fs.realpathSync(constraintsPath);
      const relativeToSddRoot = path.relative(taskSddRoot, constraintsRealPath);
      if (
        constraintsRealPath !== constraintsPath
        || relativeToSddRoot.startsWith("..")
        || path.isAbsolute(relativeToSddRoot)
      ) {
        errors.push(`${label} safety-data-permission-risk requires canonical constraints realpath inside the task SDD root`);
      } else {
        const constraintsRef = `constraints-sha256:${digestFile(constraintsPath)}`;
        if (!refs.has(constraintsRef)) {
          errors.push(`${label} safety-data-permission-risk requires ${constraintsRef}`);
        }
      }
    }
  }
}

module.exports = {
  computeGoalRef,
  digestFile,
  validateControllerResolution,
  validateControllerResolutionAgainst,
};
