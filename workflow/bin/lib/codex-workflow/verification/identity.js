"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

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
  const normalizedArgv = [...argv].map(String);
  const identity = {
    repo_root_realpath: repoRoot,
    head_commit: gitText(repoRoot, ["rev-parse", "--verify", "HEAD^{commit}"]),
    worktree: {
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
  let stat;
  try {
    stat = fs.lstatSync(entry.path);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new VerificationIdentityError(`release input no longer exists: ${entry.requested}`);
    }
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(entry.path) !== entry.path) {
    throw new VerificationIdentityError(`release input must remain a canonical regular file: ${entry.requested}`);
  }
  if (fileMode(stat) !== entry.mode || stat.size !== entry.size
    || sha256(fs.readFileSync(entry.path)) !== entry.sha256) {
    throw new VerificationIdentityError(`release input changed after verification: ${entry.requested}`);
  }
  return entry.path;
}

module.exports = {
  ENVIRONMENT_NAMES,
  VerificationIdentityError,
  canonicalJson,
  captureVerificationIdentity,
  digestCanonical,
  identityInputPaths,
  sha256,
  stableValue,
  validateCapturedInput,
};
