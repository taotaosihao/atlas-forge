"use strict";

const {
  requireObject,
  requireKeys,
  rejectUnknownKeys,
  expectInteger,
  expectSafeId,
  expectString,
  expectStringArray,
  expectArray,
  isObject,
} = require("./common");

const DOCUMENT_KEYS = ["schema_version", "task_id", "leases"];
const LEASE_KEYS = ["slice_id", "paths", "acquired_at"];

function validatePathLeaseDocument(value) {
  const errors = [];
  if (!requireObject(value, errors)) {
    return errors;
  }
  requireKeys(value, DOCUMENT_KEYS, errors);
  rejectUnknownKeys(value, DOCUMENT_KEYS, errors);
  expectInteger(value, "schema_version", errors);
  if (value.schema_version !== 1) {
    errors.push("schema_version must be 1");
  }
  expectSafeId(value, "task_id", errors);
  expectArray(value, "leases", errors);
  if (Array.isArray(value.leases)) {
    value.leases.forEach((lease, index) => validateLease(lease, index, errors));
  }
  return errors;
}

function validateLease(lease, index, errors) {
  if (!isObject(lease)) {
    errors.push(`leases[${index}] must be an object`);
    return;
  }
  requireKeys(lease, LEASE_KEYS, errors);
  rejectUnknownKeys(lease, LEASE_KEYS, errors);
  expectSafeId(lease, "slice_id", errors);
  expectStringArray(lease, "paths", errors);
  expectString(lease, "acquired_at", errors);
}

function normalizeLeasePath(raw) {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error("path must be a non-empty string");
  }
  if (raw.includes("\\")) {
    throw new Error(`path must use POSIX separators: ${raw}`);
  }
  if (raw.startsWith("/") || /^[A-Za-z]:/.test(raw)) {
    throw new Error(`path must be relative: ${raw}`);
  }
  const normalized = raw.replace(/\/+/g, "/").replace(/^\.\//, "");
  const segments = normalized.split("/");
  if (segments.includes("..") || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`path escapes workspace: ${raw}`);
  }
  if (normalized.length === 0 || normalized === ".") {
    throw new Error("path must not be empty");
  }
  return normalized;
}

function deterministicPrefix(pattern) {
  const normalized = normalizeLeasePath(pattern);
  const segments = normalized.split("/");
  const prefix = [];
  for (const segment of segments) {
    if (segment === "**" || /[*?\[\]{}]/.test(segment)) {
      break;
    }
    prefix.push(segment);
  }
  if (prefix.length === 0) {
    return "";
  }
  return prefix.join("/");
}

function prefixesOverlap(left, right) {
  if (left === "" || right === "") {
    return true;
  }
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function pathsOverlap(left, right) {
  return prefixesOverlap(deterministicPrefix(left), deterministicPrefix(right));
}

function findConflicts(requestedPaths, leases, ownerSliceId) {
  const conflicts = [];
  for (const lease of leases) {
    if (lease.slice_id === ownerSliceId) {
      continue;
    }
    for (const requested of requestedPaths) {
      for (const existing of lease.paths) {
        if (pathsOverlap(requested, existing)) {
          conflicts.push({
            slice_id: lease.slice_id,
            requested,
            existing,
          });
        }
      }
    }
  }
  return conflicts;
}

module.exports = {
  validatePathLeaseDocument,
  normalizeLeasePath,
  pathsOverlap,
  findConflicts,
};
