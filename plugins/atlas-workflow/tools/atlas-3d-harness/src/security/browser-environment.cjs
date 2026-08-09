"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { CACHE_ROOT } = require("../resources/layout.cjs");

const OWNER = "atlas-3d-browser-runtime@1";
const MARKER = ".atlas-browser-runtime-owner.json";

function regularNonSymlink(file, label, operations = fs) {
  const stat = operations.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file`);
  return stat;
}
function directoryNonSymlink(directory, label, operations = fs) {
  const stat = operations.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} must be a non-symlink directory`);
  return stat;
}
function lstatOrNull(file, operations = fs) {
  try { return operations.lstatSync(file); } catch (error) { if (error && error.code === "ENOENT") return null; throw error; }
}
function directoryIdentity(stat) { return Object.freeze({ dev: String(stat.dev), ino: String(stat.ino) }); }
function sameDirectoryIdentity(stat, expected) { return String(stat.dev) === expected.dev && String(stat.ino) === expected.ino; }
function authority(attemptRoot, identity) {
  if (!identity || typeof identity !== "object" || Array.isArray(identity) || Object.keys(identity).sort().join(",") !== "attempt,run_id,source_head") throw new Error("browser runtime identity is invalid");
  if (!Number.isInteger(identity.attempt) || identity.attempt < 1 || typeof identity.run_id !== "string" || !identity.run_id || !/^[a-f0-9]{40}$/.test(identity.source_head)) throw new Error("browser runtime identity mismatch");
  if (!path.isAbsolute(attemptRoot) || path.resolve(attemptRoot) !== attemptRoot) throw new Error("attempt root must be canonical absolute syntax");
  directoryNonSymlink(attemptRoot, "attempt root");
  if (fs.realpathSync(attemptRoot) !== attemptRoot || path.basename(attemptRoot) !== `attempt-${identity.attempt}`) throw new Error("attempt root authority mismatch");
  const runRoot = path.dirname(attemptRoot);
  directoryNonSymlink(runRoot, "run root");
  if (fs.realpathSync(runRoot) !== runRoot) throw new Error("run root authority mismatch");
  const manifestFile = path.join(runRoot, "manifest.json");
  regularNonSymlink(manifestFile, "run manifest");
  const manifestStat = fs.statSync(manifestFile);
  if (manifestStat.size > 1024 * 1024) throw new Error("run manifest exceeds byte cap");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  if (manifest.schema_version !== 1 || manifest.task_id !== "atlas-3d-harness" || manifest.run_id !== identity.run_id) throw new Error("run manifest identity mismatch");
  return { runRoot, runtimeRoot: path.join(attemptRoot, ".browser-runtime") };
}
function prepareBrowserEnvironment({ attemptRoot, identity }) {
  const { runtimeRoot } = authority(attemptRoot, identity);
  if (fs.existsSync(runtimeRoot)) throw new Error("browser runtime already exists");
  fs.mkdirSync(runtimeRoot, { mode: 0o700 });
  const runtimeStat = directoryNonSymlink(runtimeRoot, "browser runtime");
  if (fs.realpathSync(runtimeRoot) !== runtimeRoot || path.dirname(runtimeRoot) !== attemptRoot) throw new Error("browser runtime path mismatch");
  const ownership = Object.freeze({ schema_version: 1, owner: OWNER, attempt_root: attemptRoot, runtime_root: runtimeRoot, run_id: identity.run_id, attempt: identity.attempt, source_head: identity.source_head, ownership_id: crypto.randomBytes(32).toString("hex") });
  fs.writeFileSync(path.join(runtimeRoot, MARKER), `${JSON.stringify(ownership)}\n`, { flag: "wx", mode: 0o600 });
  const environment = Object.freeze({ HOME: runtimeRoot, CFFIXED_USER_HOME: runtimeRoot, XDG_CACHE_HOME: path.join(runtimeRoot, ".cache"), TMPDIR: runtimeRoot, LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin", PLAYWRIGHT_BROWSERS_PATH: CACHE_ROOT });
  return Object.freeze({ attemptRoot, identity: Object.freeze({ ...identity }), runtimeRoot, directoryIdentity: directoryIdentity(runtimeStat), ownership, environment });
}
function quarantinePath(handle) {
  if (!/^[a-f0-9]{64}$/.test(handle.ownership.ownership_id || "")) throw new Error("browser cleanup ownership nonce is invalid");
  return path.join(handle.attemptRoot, `.browser-runtime-quarantine-${handle.ownership.ownership_id}`);
}
function verifyOwnedDirectory(directory, handle, label, operations) {
  const stat = directoryNonSymlink(directory, label, operations);
  if (operations.realpathSync(directory) !== directory || path.dirname(directory) !== handle.attemptRoot) throw new Error(`${label} boundary mismatch`);
  if (!sameDirectoryIdentity(stat, handle.directoryIdentity)) throw new Error(`${label} inode mismatch`);
  const markerFile = path.join(directory, MARKER);
  if (!lstatOrNull(markerFile, operations)) throw new Error(`${label} ownership marker missing`);
  regularNonSymlink(markerFile, `${label} ownership marker`, operations);
  const marker = JSON.parse(operations.readFileSync(markerFile, "utf8"));
  if (JSON.stringify(marker) !== JSON.stringify(handle.ownership)) throw new Error(`${label} ownership marker mismatch`);
  const finalStat = directoryNonSymlink(directory, label, operations);
  if (!sameDirectoryIdentity(finalStat, handle.directoryIdentity)) throw new Error(`${label} inode mismatch`);
}
function restoreQuarantine(runtimeRoot, quarantine, operations) {
  if (!lstatOrNull(quarantine, operations) || lstatOrNull(runtimeRoot, operations)) return false;
  try { operations.renameSync(quarantine, runtimeRoot); return true; } catch { return false; }
}
function cleanupWithOperations(handle, operations) {
  if (!handle || typeof handle !== "object" || !handle.ownership || !handle.directoryIdentity || handle.runtimeRoot !== handle.ownership.runtime_root || handle.attemptRoot !== handle.ownership.attempt_root) throw new Error("browser cleanup handle is invalid");
  const { runtimeRoot } = authority(handle.attemptRoot, handle.identity);
  if (runtimeRoot !== handle.runtimeRoot) throw new Error("browser cleanup target mismatch");
  const quarantine = quarantinePath(handle);
  if (path.dirname(quarantine) !== handle.attemptRoot || path.basename(quarantine) !== `.browser-runtime-quarantine-${handle.ownership.ownership_id}`) throw new Error("browser cleanup quarantine boundary mismatch");
  if (!lstatOrNull(runtimeRoot, operations)) {
    if (lstatOrNull(quarantine, operations)) throw new Error("browser cleanup quarantine collision");
    return Object.freeze({ removed: false, already_absent: true });
  }
  verifyOwnedDirectory(runtimeRoot, handle, "browser runtime cleanup target", operations);
  if (lstatOrNull(quarantine, operations)) throw new Error("browser cleanup quarantine collision");
  operations.renameSync(runtimeRoot, quarantine);
  try {
    if (lstatOrNull(runtimeRoot, operations)) throw new Error("browser cleanup runtime path reappeared");
    verifyOwnedDirectory(quarantine, handle, "browser runtime quarantine", operations);
    // reviewed-local@1 excludes a hostile same-user filesystem actor after this
    // check; path-based recursive removal is not OS-level containment against one.
    operations.rmSync(quarantine, { recursive: true, force: false });
    if (lstatOrNull(quarantine, operations)) throw new Error("browser runtime cleanup incomplete");
  } catch (error) {
    restoreQuarantine(runtimeRoot, quarantine, operations);
    throw error;
  }
  return Object.freeze({ removed: true, already_absent: false });
}
function cleanupBrowserEnvironment(handle) { return cleanupWithOperations(handle, fs); }
module.exports = { MARKER, OWNER, cleanupBrowserEnvironment, prepareBrowserEnvironment, testing: Object.freeze({ cleanupWithOperations, quarantinePath }) };
