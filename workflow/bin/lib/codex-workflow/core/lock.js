"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const heldLockDirs = new Set();
let cleanupInstalled = false;

function releaseAllLocks() {
  for (const lockDir of heldLockDirs) {
    try {
      fs.rmdirSync(lockDir);
    } catch (error) {
      if (error.code !== "ENOENT") {
        // A non-empty or externally replaced lock must not be deleted recursively.
      }
    }
    heldLockDirs.delete(lockDir);
  }
}

function installCleanupHandlers() {
  if (cleanupInstalled) {
    return;
  }
  cleanupInstalled = true;
  process.once("exit", releaseAllLocks);
  process.once("SIGINT", () => {
    releaseAllLocks();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    releaseAllLocks();
    process.exit(143);
  });
}

function sleepMilliseconds(milliseconds) {
  if (!(milliseconds > 0)) {
    return;
  }
  const buffer = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(buffer), 0, 0, milliseconds);
}

function acquireLock(lockFile) {
  installCleanupHandlers();
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  const lockDir = `${lockFile}.dir`;
  while (true) {
    try {
      fs.mkdirSync(lockDir);
      heldLockDirs.add(lockDir);
      return () => releaseLock(lockFile);
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }
      sleepMilliseconds(50);
    }
  }
}

function releaseLock(lockFile) {
  const lockDir = `${lockFile}.dir`;
  try {
    fs.rmdirSync(lockDir);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  } finally {
    heldLockDirs.delete(lockDir);
  }
}

function withLock(lockFile, callback) {
  const release = acquireLock(lockFile);
  try {
    return callback();
  } finally {
    release();
  }
}

function posixChecksum(value) {
  const result = spawnSync("cksum", [], { encoding: "utf8", input: value });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `cksum failed with exit code ${result.status}`);
  }
  const match = /^(\d+)/.exec(result.stdout);
  if (!match) {
    throw new Error("unable to parse cksum output");
  }
  return match[1];
}

function taskLockFile(paths, taskFile) {
  return path.join(paths.taskLockDir, `${posixChecksum(taskFile)}.lock`);
}

function taskMutationLockFile(paths, taskId) {
  return taskLockFile(paths, path.join(paths.tasksDir, `${taskId}.md`));
}

module.exports = {
  acquireLock,
  posixChecksum,
  releaseAllLocks,
  releaseLock,
  sleepMilliseconds,
  taskLockFile,
  taskMutationLockFile,
  withLock,
};
