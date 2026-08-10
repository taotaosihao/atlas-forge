"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { TextDecoder } = require("util");
const { validateBrief } = require("./brief");
const { validateReviewVerdict } = require("./review-verdict");
const {
  computeGoalRefFromInputs,
  validateControllerResolutionAgainst,
} = require("./controller-resolution");
const {
  MAX_AUTHORITY_SLICES,
  canonicalAuthoritySliceIdentities,
} = require("./authority-identity");

const MAX_AUTHORITY_ARTIFACT_BYTES = 4 * 1024 * 1024;

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function statIdentity(stat) {
  return [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeMs, stat.ctimeMs].join(":");
}

function canonicalDirectory(directory, label) {
  const resolved = path.resolve(directory);
  const stat = fs.lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(resolved) !== resolved) {
    throw new Error(`${label} must be a canonical non-symlink directory: ${resolved}`);
  }
  return { path: resolved, stat: statIdentity(stat) };
}

function stableFile(file, label, { optional = false } = {}) {
  const resolved = path.resolve(file);
  let descriptor;
  try {
    descriptor = fs.openSync(resolved, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  } catch (error) {
    if (optional && error.code === "ENOENT") return null;
    throw new Error(`${label} is missing or cannot be opened safely: ${resolved}: ${error.message}`);
  }
  try {
    const before = fs.fstatSync(descriptor);
    if (!before.isFile() || before.size > MAX_AUTHORITY_ARTIFACT_BYTES) {
      throw new Error(`${label} must be a regular file no larger than ${MAX_AUTHORITY_ARTIFACT_BYTES} bytes`);
    }
    const buffer = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < buffer.length) {
      const count = fs.readSync(descriptor, buffer, offset, buffer.length - offset, offset);
      if (count === 0) throw new Error(`${label} changed while being read`);
      offset += count;
    }
    const after = fs.fstatSync(descriptor);
    const link = fs.lstatSync(resolved);
    if (statIdentity(before) !== statIdentity(after) || statIdentity(after) !== statIdentity(link)
      || link.isSymbolicLink() || fs.realpathSync(resolved) !== resolved) {
      throw new Error(`${label} changed or is not a canonical regular non-symlink file`);
    }
    return {
      buffer,
      digest: sha256(buffer),
      path: resolved,
      stat: statIdentity(after),
    };
  } finally {
    fs.closeSync(descriptor);
  }
}

function utf8(snapshot, label) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(snapshot.buffer);
  } catch (error) {
    throw new Error(`${label} must contain valid UTF-8: ${error.message}`);
  }
}

function json(snapshot, label) {
  try {
    return JSON.parse(utf8(snapshot, label));
  } catch (error) {
    throw new Error(`${label} must contain valid JSON: ${error.message}`);
  }
}

function verifyUnchanged(snapshot, label) {
  if (!snapshot) return;
  const stat = fs.lstatSync(snapshot.path);
  if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(snapshot.path) !== snapshot.path
    || statIdentity(stat) !== snapshot.stat) {
    throw new Error(`${label} changed while authority was being validated`);
  }
}

function verifyOptionalUnchanged(snapshot, file, label) {
  if (snapshot) {
    verifyUnchanged(snapshot, label);
    return;
  }
  try {
    fs.lstatSync(file);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw new Error(`${label} absence could not be revalidated: ${error.message}`);
  }
  throw new Error(`${label} appeared while authority was being validated`);
}

function snapshotAuthoritySlice(sliceDir, { workflowRoot, expectedTaskId }) {
  const directory = canonicalDirectory(sliceDir, "authority slice");
  const taskSddDirectory = canonicalDirectory(path.resolve(directory.path, "../.."), "task SDD root");
  const evidencePath = path.join(directory.path, "evidence-manifest.json");
  const verdictPath = path.join(directory.path, "review-verdict.json");
  const resolutionPath = path.join(directory.path, "controller-resolution.json");
  const constraintsPath = path.join(taskSddDirectory.path, "global-constraints.md");
  const briefJson = stableFile(path.join(directory.path, "brief.json"), "brief.json");
  const briefMd = stableFile(path.join(directory.path, "brief.md"), "brief.md");
  const evidence = stableFile(evidencePath, "evidence-manifest.json", { optional: true });
  const verdictFile = stableFile(verdictPath, "review-verdict.json", { optional: true });
  const resolutionFile = stableFile(resolutionPath, "controller-resolution.json", { optional: true });
  if (Boolean(verdictFile) !== Boolean(resolutionFile)) {
    throw new Error("review-verdict.json and controller-resolution.json must either both exist or both be absent");
  }
  const constraintsFile = stableFile(
    constraintsPath,
    "global-constraints.md",
    { optional: true },
  );
  const brief = json(briefJson, "brief.json");
  const briefErrors = validateBrief(brief);
  if (![2, 3].includes(brief.schema_version) || briefErrors.length > 0) {
    throw new Error(`invalid authority brief v2/v3: ${briefErrors.join("; ")}`);
  }
  if (expectedTaskId && brief.task_id !== expectedTaskId) {
    throw new Error(`authority task_id ${brief.task_id} does not match expected task ${expectedTaskId}`);
  }
  const expectedDir = path.join(
    path.resolve(workflowRoot), "artifacts", brief.task_id, "team", "sdd", "slices", brief.slice_id,
  );
  if (directory.path !== expectedDir) {
    throw new Error(`authority slice is outside the canonical workflow artifact tree: expected ${expectedDir}`);
  }
  let evidenceValue = null;
  if (evidence) evidenceValue = json(evidence, "evidence-manifest.json");
  const contractDigest = typeof evidenceValue?.contract_sha256 === "string"
    ? evidenceValue.contract_sha256
    : null;
  const goalRef = computeGoalRefFromInputs(brief, {
    requirementsDigest: briefMd.digest,
    contractDigest,
  });
  let verdict = null;
  let resolution = null;
  const currentRequired = [];
  if (verdictFile) {
    verdict = json(verdictFile, "review-verdict.json");
    resolution = json(resolutionFile, "controller-resolution.json");
    const verdictErrors = validateReviewVerdict(verdict);
    if (verdict.schema_version !== 2 || verdictErrors.length > 0) {
      throw new Error(`invalid review verdict v2: ${verdictErrors.join("; ")}`);
    }
    const resolutionErrors = validateControllerResolutionAgainst(resolution, {
      brief,
      verdict,
      verdictDigest: verdictFile.digest,
      goalRef,
      globalConstraintsDigest: constraintsFile?.digest || null,
    });
    if (resolutionErrors.length > 0) {
      throw new Error(`invalid controller resolution: ${resolutionErrors.join("; ")}`);
    }
    for (const record of resolution.records) {
      if (record.disposition === "current-required") currentRequired.push(record.finding_id);
    }
  }
  verifyUnchanged(briefJson, "brief.json");
  verifyUnchanged(briefMd, "brief.md");
  verifyOptionalUnchanged(evidence, evidencePath, "evidence-manifest.json");
  verifyOptionalUnchanged(verdictFile, verdictPath, "review-verdict.json");
  verifyOptionalUnchanged(resolutionFile, resolutionPath, "controller-resolution.json");
  verifyOptionalUnchanged(constraintsFile, constraintsPath, "global-constraints.md");
  const afterDirectory = canonicalDirectory(directory.path, "authority slice");
  if (afterDirectory.stat !== directory.stat) throw new Error("authority slice changed while being validated");
  const afterTaskSddDirectory = canonicalDirectory(taskSddDirectory.path, "task SDD root");
  if (afterTaskSddDirectory.stat !== taskSddDirectory.stat) {
    throw new Error("task SDD root changed while authority was being validated");
  }
  return {
    acceptanceRefs: [...brief.acceptance_refs],
    currentRequired,
    identity: {
      path: directory.path,
      task_id: brief.task_id,
      slice_id: brief.slice_id,
      brief_json_sha256: `sha256:${briefJson.digest}`,
      brief_md_sha256: `sha256:${briefMd.digest}`,
      evidence_manifest_sha256: evidence ? `sha256:${evidence.digest}` : null,
      review_verdict_sha256: verdictFile ? `sha256:${verdictFile.digest}` : null,
      controller_resolution_sha256: resolutionFile ? `sha256:${resolutionFile.digest}` : null,
      global_constraints_sha256: constraintsFile ? `sha256:${constraintsFile.digest}` : null,
    },
  };
}

function snapshotAuthoritySlices(slicePaths, { workflowRoot, expectedTaskId = "" } = {}) {
  if (typeof workflowRoot !== "string" || !path.isAbsolute(workflowRoot)) {
    throw new Error("workflowRoot must be an absolute canonical directory");
  }
  if (!Array.isArray(slicePaths)) throw new Error("authoritySlices must be an array");
  const canonicalRoot = canonicalDirectory(workflowRoot, "workflowRoot").path;
  const normalizedPaths = slicePaths.map((item) => path.resolve(item));
  const paths = [...new Set(normalizedPaths)].sort();
  if (paths.length !== normalizedPaths.length) {
    throw new Error("authoritySlices must not contain duplicate canonical directories");
  }
  if (paths.length === 0 || paths.length > MAX_AUTHORITY_SLICES) {
    throw new Error(`authoritySlices must contain 1-${MAX_AUTHORITY_SLICES} canonical directories`);
  }
  const currentRequired = new Set();
  const goalRefs = new Set();
  const findingOwners = new Map();
  const snapshots = paths.map((slicePath) => snapshotAuthoritySlice(slicePath, {
    workflowRoot: canonicalRoot,
    expectedTaskId,
  }));
  const taskIds = new Set(snapshots.map((snapshot) => snapshot.identity.task_id));
  if (taskIds.size !== 1) {
    throw new Error(`authority slices span multiple tasks: ${[...taskIds].sort().join(", ")}`);
  }
  for (const snapshot of snapshots) {
    snapshot.acceptanceRefs.forEach((ref) => goalRefs.add(ref));
    for (const finding of snapshot.currentRequired) {
      if (findingOwners.has(finding)) {
        throw new Error(`current-required finding appears in multiple authority slices: ${finding}`);
      }
      findingOwners.set(finding, snapshot.identity.path);
      currentRequired.add(finding);
    }
  }
  return {
    currentRequired,
    goalRefs,
    taskId: [...taskIds][0],
    identities: canonicalAuthoritySliceIdentities(snapshots.map((item) => item.identity)),
  };
}

module.exports = {
  MAX_AUTHORITY_ARTIFACT_BYTES,
  snapshotAuthoritySlices,
};
