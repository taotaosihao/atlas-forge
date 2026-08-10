"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { TextDecoder } = require("util");

class StableFileError extends Error {
  constructor(message) {
    super(message);
    this.name = "StableFileError";
  }
}

function sameStat(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === ""
    || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function decodeUtf8(buffer, label, resolved) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch (error) {
    throw new StableFileError(`${label} is not readable UTF-8: ${resolved}: ${error.message}`);
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function stableFileSnapshot(requested, label, options = {}) {
  const resolved = path.resolve(requested || "");
  let descriptor;
  try {
    descriptor = fs.openSync(
      resolved,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0),
    );
  } catch (error) {
    if (error.code === "ENOENT") throw new StableFileError(`${label} is missing: ${resolved}`);
    if (error.code === "ELOOP") {
      throw new StableFileError(`${label} must not be a symbolic link: ${resolved}`);
    }
    throw error;
  }
  try {
    const before = fs.fstatSync(descriptor);
    if (!before.isFile()) throw new StableFileError(`${label} must be a regular file: ${resolved}`);
    if (options.maximumBytes && before.size > options.maximumBytes) {
      throw new StableFileError(`${label} exceeds ${options.maximumBytes} bytes: ${resolved}`);
    }
    const buffer = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor);
    if (!sameStat(before, after) || buffer.length !== after.size) {
      throw new StableFileError(`${label} changed while it was being read: ${resolved}`);
    }
    let pathStat;
    try {
      pathStat = fs.lstatSync(resolved);
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new StableFileError(`${label} changed while it was being read: ${resolved}`);
      }
      throw error;
    }
    if (!pathStat.isFile() || pathStat.isSymbolicLink() || !sameStat(after, pathStat)) {
      throw new StableFileError(`${label} path identity changed while it was being read: ${resolved}`);
    }
    const realpath = fs.realpathSync(resolved);
    if (realpath !== resolved) {
      throw new StableFileError(`${label} must use its canonical realpath: ${resolved}`);
    }
    if (options.root) {
      const root = fs.realpathSync(path.resolve(options.root));
      if (!inside(root, realpath)) {
        throw new StableFileError(`${label} must be inside ${root}: ${realpath}`);
      }
    }
    return {
      buffer,
      path: realpath,
      sha256: `sha256:${crypto.createHash("sha256").update(buffer).digest("hex")}`,
      stat: {
        dev: after.dev,
        ino: after.ino,
        size: after.size,
        mtime_ms: after.mtimeMs,
        ctime_ms: after.ctimeMs,
      },
      text: decodeUtf8(buffer, label, resolved),
    };
  } finally {
    fs.closeSync(descriptor);
  }
}

function stableJsonSnapshot(requested, label, options = {}) {
  const snapshot = stableFileSnapshot(requested, label, options);
  try {
    snapshot.value = JSON.parse(snapshot.text);
  } catch (error) {
    throw new StableFileError(`${label} is invalid JSON: ${error.message}`);
  }
  if (!snapshot.value || typeof snapshot.value !== "object" || Array.isArray(snapshot.value)) {
    throw new StableFileError(`${label} is invalid JSON: expected an object`);
  }
  return snapshot;
}

module.exports = {
  StableFileError,
  stableFileSnapshot,
  stableJsonSnapshot,
};
