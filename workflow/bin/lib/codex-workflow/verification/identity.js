"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { captureWorktreeSnapshot } = require("../core/worktree-snapshot");

const ENVIRONMENT_NAMES = Object.freeze([
  "CI",
  "LANG",
  "LC_ALL",
  "NODE_ENV",
  "NODE_OPTIONS",
  "PATH",
]);
const LOCKFILE_NAMES = new Set([
  "Cargo.lock",
  "Gemfile.lock",
  "Pipfile.lock",
  "bun.lock",
  "bun.lockb",
  "composer.lock",
  "go.sum",
  "package-lock.json",
  "pnpm-lock.yaml",
  "poetry.lock",
  "uv.lock",
  "yarn.lock",
]);
const MAX_GIT_OUTPUT = 128 * 1024 * 1024;
const binaryDigests = new Map();

class VerificationIdentityError extends Error {
  constructor(message) {
    super(message);
    this.name = "VerificationIdentityError";
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
  );
}

function canonicalJson(value) {
  return JSON.stringify(stableValue(value));
}

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function digestCanonical(value) {
  return sha256(canonicalJson(value));
}

function runGit(cwd, args, { encoding = null } = {}) {
  const result = spawnSync("git", ["-C", cwd, ...args], {
    encoding,
    maxBuffer: MAX_GIT_OUTPUT,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString("utf8")
      : String(result.stderr || "");
    throw new VerificationIdentityError(
      stderr.trim() || `git ${args.join(" ")} failed with exit code ${result.status}`,
    );
  }
  return result.stdout;
}

function gitText(cwd, args) {
  return String(runGit(cwd, args, { encoding: "utf8" })).trim();
}

function fileMode(stat) {
  return `0${(stat.mode & 0o7777).toString(8)}`;
}

function untrackedManifest(repoRoot) {
  const output = runGit(repoRoot, ["ls-files", "--others", "--exclude-standard", "-z"]);
  const names = output.toString("utf8").split("\0").filter(Boolean).sort();
  return names.map((name) => {
    const absolute = path.join(repoRoot, name);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) {
      return {
        path: name,
        type: "symlink",
        mode: fileMode(stat),
        target_sha256: sha256(fs.readlinkSync(absolute)),
      };
    }
    if (stat.isFile()) {
      return {
        path: name,
        type: "file",
        mode: fileMode(stat),
        size: stat.size,
        sha256: sha256(fs.readFileSync(absolute)),
      };
    }
    return { path: name, type: "special", mode: fileMode(stat) };
  });
}

function environmentIdentity(environment) {
  return {
    policy_id: "atlas-verification-env-v1",
    included_names: [...ENVIRONMENT_NAMES],
    values: ENVIRONMENT_NAMES.map((name) => ({
      name,
      present: Object.hasOwn(environment, name),
      value_sha256: Object.hasOwn(environment, name)
        ? sha256(String(environment[name]))
        : "",
    })),
    secrets_persisted: false,
  };
}

function resolveExecutable(command, cwd, environment) {
  if (!command) return "";
  if (command.includes(path.sep)) {
    const candidate = path.isAbsolute(command) ? command : path.resolve(cwd, command);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return fs.realpathSync(candidate);
    } catch {
      return "";
    }
  }
  for (const directory of String(environment.PATH || "").split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, command);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return fs.realpathSync(candidate);
    } catch {
      // Continue through PATH without exposing its values in the record.
    }
  }
  return "";
}

function binaryIdentity(label, file) {
  if (!file) return { name: label, resolved_path: "", sha256: "" };
  const stat = fs.statSync(file);
  const cacheKey = [file, stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join("\0");
  let digest = binaryDigests.get(cacheKey);
  if (!digest && stat.isFile()) {
    digest = sha256(fs.readFileSync(file));
    binaryDigests.set(cacheKey, digest);
  }
  return {
    name: label,
    resolved_path: file,
    mode: fileMode(stat),
    size: stat.size,
    sha256: stat.isFile() ? digest : "",
  };
}

function toolchainIdentity(argv, cwd, environment) {
  const commandPath = resolveExecutable(argv[0], cwd, environment);
  const nodePath = fs.realpathSync(process.execPath);
  return [
    { ...binaryIdentity("workflow-node", nodePath), version: process.version },
    binaryIdentity(argv[0] || "command", commandPath),
  ];
}

function lockfileIdentity(repoRoot) {
  return runGit(repoRoot, ["ls-files", "-z"])
    .toString("utf8")
    .split("\0")
    .filter((name) => name && LOCKFILE_NAMES.has(path.basename(name)))
    .map((name) => ({
      path: name,
      sha256: sha256(fs.readFileSync(path.join(repoRoot, name))),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function inputIdentity(inputPaths, cwd) {
  return [...new Set(inputPaths || [])].map((requested) => {
    if (typeof requested !== "string" || !requested.trim()) {
      throw new VerificationIdentityError("verification input must be a non-empty path");
    }
    const absolute = path.isAbsolute(requested) ? requested : path.resolve(cwd, requested);
    let stat;
    try {
      stat = fs.lstatSync(absolute);
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new VerificationIdentityError(`verification input does not exist: ${requested}`);
      }
      throw error;
    }
    if (stat.isSymbolicLink()) {
      const realpath = fs.realpathSync(absolute);
      const targetStat = fs.statSync(realpath);
      if (!targetStat.isFile()) {
        throw new VerificationIdentityError(
          `verification input symlink must resolve to a file: ${requested}`,
        );
      }
      return {
        requested,
        path: realpath,
        type: "symlink",
        mode: fileMode(stat),
        target_sha256: sha256(fs.readlinkSync(absolute)),
        size: targetStat.size,
        sha256: sha256(fs.readFileSync(realpath)),
      };
    }
    if (!stat.isFile()) {
      throw new VerificationIdentityError(`verification input must be a file: ${requested}`);
    }
    return {
      requested,
      path: fs.realpathSync(absolute),
      type: "file",
      mode: fileMode(stat),
      size: stat.size,
      sha256: sha256(fs.readFileSync(absolute)),
    };
  });
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`)
    && relative !== ".." && !path.isAbsolute(relative));
}

function resolveVerificationOutputs(outputPaths, cwd, artifactRoot) {
  const root = fs.realpathSync(artifactRoot);
  const seen = new Set();
  return (outputPaths || []).map((requested) => {
    if (typeof requested !== "string" || !requested.trim()) {
      throw new VerificationIdentityError("verification output must be a non-empty path");
    }
    const absolute = path.isAbsolute(requested) ? path.resolve(requested) : path.resolve(cwd, requested);
    const parent = path.dirname(absolute);
    let canonicalParent;
    try {
      canonicalParent = fs.realpathSync(parent);
    } catch (error) {
      throw new VerificationIdentityError(`verification output parent is unavailable: ${requested}: ${error.message}`);
    }
    if (canonicalParent !== parent || !inside(root, canonicalParent)) {
      throw new VerificationIdentityError(
        `verification output parent must be canonical and inside the task artifact root: ${requested}`,
      );
    }
    const target = path.join(canonicalParent, path.basename(absolute));
    if (seen.has(target)) {
      throw new VerificationIdentityError(`duplicate verification output: ${requested}`);
    }
    seen.add(target);
    try {
      fs.lstatSync(target);
      throw new VerificationIdentityError(`verification output already exists: ${requested}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    return { requested, path: target };
  });
}

function captureVerificationOutput(declared) {
  let stat;
  try {
    stat = fs.lstatSync(declared.path);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new VerificationIdentityError(`verification output was not created: ${declared.requested}`);
    }
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(declared.path) !== declared.path) {
    throw new VerificationIdentityError(
      `verification output must be a canonical regular file: ${declared.requested}`,
    );
  }
  return {
    requested: declared.requested,
    path: declared.path,
    type: "file",
    mode: fileMode(stat),
    size: stat.size,
    sha256: sha256(fs.readFileSync(declared.path)),
  };
}

function validateCapturedOutput(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)
    || entry.type !== "file" || typeof entry.requested !== "string" || !entry.requested.trim()
    || typeof entry.path !== "string" || !path.isAbsolute(entry.path)
    || !/^sha256:[a-f0-9]{64}$/.test(entry.sha256 || "")
    || !Number.isInteger(entry.size) || entry.size < 0) {
    throw new VerificationIdentityError("verification output identity is incomplete or is not a regular file");
  }
  readCapturedFile(entry, "verification output");
  return entry.path;
}

function readCapturedFile(entry, label = "captured file") {
  if (!entry || entry.type !== "file" || typeof entry.requested !== "string"
    || typeof entry.path !== "string" || !path.isAbsolute(entry.path)
    || !/^sha256:[a-f0-9]{64}$/.test(entry.sha256 || "")
    || !Number.isInteger(entry.size) || entry.size < 0 || typeof entry.mode !== "string") {
    throw new VerificationIdentityError(`${label} identity is incomplete`);
  }
  let before;
  let descriptor;
  try {
    before = fs.lstatSync(entry.path);
    if (!before.isFile() || before.isSymbolicLink() || fs.realpathSync(entry.path) !== entry.path) {
      throw new Error("path is not a canonical regular file");
    }
    descriptor = fs.openSync(entry.path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const opened = fs.fstatSync(descriptor);
    if (!opened.isFile() || before.dev !== opened.dev || before.ino !== opened.ino
      || fileMode(opened) !== entry.mode || opened.size !== entry.size) {
      throw new Error("opened file identity does not match the captured path");
    }
    const bytes = fs.readFileSync(descriptor);
    const after = fs.lstatSync(entry.path);
    if (after.dev !== opened.dev || after.ino !== opened.ino
      || fileMode(after) !== entry.mode || after.size !== entry.size
      || sha256(bytes) !== entry.sha256) {
      throw new Error("path or content changed during capture");
    }
    return { path: entry.path, bytes };
  } catch (error) {
    throw new VerificationIdentityError(`${label} changed after capture: ${entry.requested}: ${error.message}`);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function captureVerificationIdentity({
  argv,
  cwd = process.cwd(),
  environment = process.env,
  inputPaths = [],
}) {
  const cwdRealpath = fs.realpathSync(cwd);
  const repoRoot = fs.realpathSync(gitText(cwdRealpath, ["rev-parse", "--show-toplevel"]));
  const trackedDiff = runGit(repoRoot, [
    "diff",
    "--no-ext-diff",
    "--binary",
    "--full-index",
    "--",
  ]);
  const stagedDiff = runGit(repoRoot, [
    "diff",
    "--cached",
    "--no-ext-diff",
    "--binary",
    "--full-index",
    "--",
  ]);
  const untracked = untrackedManifest(repoRoot);
  const submodules = runGit(repoRoot, ["submodule", "status", "--recursive"]);
  const snapshot = captureWorktreeSnapshot(repoRoot);
  const normalizedArgv = [...argv].map(String);
  const identity = {
    repo_root_realpath: repoRoot,
    head_commit: gitText(repoRoot, ["rev-parse", "--verify", "HEAD^{commit}"]),
    worktree: {
      tree_oid: snapshot.tree_oid,
      tracked_diff_sha256: sha256(trackedDiff),
      staged_diff_sha256: sha256(stagedDiff),
      untracked_manifest_sha256: digestCanonical(untracked),
      submodule_manifest_sha256: sha256(submodules),
    },
    cwd_realpath: cwdRealpath,
    argv: normalizedArgv,
    argv_sha256: digestCanonical(normalizedArgv),
    environment: environmentIdentity(environment),
    toolchain: toolchainIdentity(normalizedArgv, cwdRealpath, environment),
    lockfiles: lockfileIdentity(repoRoot),
    inputs: inputIdentity(inputPaths, cwdRealpath),
  };
  return { identity, identityDigest: digestCanonical(identity) };
}

function identityInputPaths(identity) {
  return (identity.inputs || []).map((entry) => entry.requested);
}

function validateCapturedInput(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)
    || entry.type !== "file" || typeof entry.requested !== "string" || !entry.requested.trim()
    || typeof entry.path !== "string" || !path.isAbsolute(entry.path)
    || !/^sha256:[a-f0-9]{64}$/.test(entry.sha256 || "")
    || !Number.isInteger(entry.size) || entry.size < 0) {
    throw new VerificationIdentityError("release input identity is incomplete or is not a regular file");
  }
  readCapturedFile(entry, "release input");
  return entry.path;
}

module.exports = {
  ENVIRONMENT_NAMES,
  VerificationIdentityError,
  canonicalJson,
  captureVerificationIdentity,
  digestCanonical,
  identityInputPaths,
  readCapturedFile,
  resolveVerificationOutputs,
  sha256,
  stableValue,
  captureVerificationOutput,
  validateCapturedInput,
  validateCapturedOutput,
};
