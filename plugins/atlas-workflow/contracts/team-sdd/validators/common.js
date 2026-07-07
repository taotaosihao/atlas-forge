"use strict";

const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireObject(value, errors) {
  if (!isObject(value)) {
    errors.push("value must be an object");
    return false;
  }
  return true;
}

function requireKeys(value, keys, errors) {
  for (const key of keys) {
    if (!(key in value)) {
      errors.push(`missing required key: ${key}`);
    }
  }
}

function rejectUnknownKeys(value, keys, errors) {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      errors.push(`unknown key: ${key}`);
    }
  }
}

function expectString(value, key, errors, options = {}) {
  if (typeof value[key] !== "string" || (!options.allowEmpty && value[key].length === 0)) {
    errors.push(`${key} must be a ${options.allowEmpty ? "string" : "non-empty string"}`);
  }
}

function expectNullableString(value, key, errors) {
  if (value[key] !== null && typeof value[key] !== "string") {
    errors.push(`${key} must be a string or null`);
  }
}

function expectInteger(value, key, errors) {
  if (!Number.isInteger(value[key])) {
    errors.push(`${key} must be an integer`);
  }
}

function expectPositiveInteger(value, key, errors) {
  if (!Number.isInteger(value[key]) || value[key] < 1) {
    errors.push(`${key} must be a positive integer`);
  }
}

function expectEnum(value, key, allowed, errors) {
  if (!allowed.includes(value[key])) {
    errors.push(`${key} must be one of: ${allowed.join(", ")}`);
  }
}

function expectStringArray(value, key, errors) {
  if (!Array.isArray(value[key]) || value[key].some((item) => typeof item !== "string")) {
    errors.push(`${key} must be an array of strings`);
  }
}

function expectArray(value, key, errors) {
  if (!Array.isArray(value[key])) {
    errors.push(`${key} must be an array`);
  }
}

function expectObjectArray(value, key, errors) {
  if (!Array.isArray(value[key]) || value[key].some((item) => !isObject(item))) {
    errors.push(`${key} must be an array of objects`);
  }
}

function expectSafeId(value, key, errors) {
  if (typeof value[key] !== "string" || !ID_PATTERN.test(value[key])) {
    errors.push(`${key} must be a safe identifier`);
  }
}

function expectAbsoluteExistingDir(value, key, errors) {
  if (typeof value[key] !== "string" || !path.isAbsolute(value[key])) {
    errors.push(`${key} must be an absolute path`);
    return;
  }
  if (!fs.existsSync(value[key]) || !fs.statSync(value[key]).isDirectory()) {
    errors.push(`${key} must exist and be a directory`);
  }
}

function expectGitRevision(repo, revision, label, errors) {
  if (!repo || !revision) {
    return;
  }
  try {
    childProcess.execFileSync("git", ["-C", repo, "rev-parse", "--verify", `${revision}^{commit}`], {
      stdio: "ignore",
    });
  } catch (_error) {
    errors.push(`${label} must resolve to a commit in repo`);
  }
}

function readJsonFile(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function extractLabeledJsonBlock(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escaped}\\s*\\n\\s*\`\`\`json\\s*\\n([\\s\\S]*?)\\n\\s*\`\`\``, "m");
  const match = text.match(pattern);
  if (!match) {
    throw new Error(`missing ${label} fenced JSON block`);
  }
  return JSON.parse(match[1]);
}

module.exports = {
  ID_PATTERN,
  isObject,
  requireObject,
  requireKeys,
  rejectUnknownKeys,
  expectString,
  expectNullableString,
  expectInteger,
  expectPositiveInteger,
  expectEnum,
  expectStringArray,
  expectArray,
  expectObjectArray,
  expectSafeId,
  expectAbsoluteExistingDir,
  expectGitRevision,
  readJsonFile,
  extractLabeledJsonBlock,
};
