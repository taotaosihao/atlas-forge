#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const EXPECTED = Object.freeze({
  node: "24.15.0",
  npm: Object.freeze({
    version: "11.12.1",
    cli_sha256: "8e5f6f3429f8cdbe693cdc29904e9d5a7b127a494bd15c804bd54c7403bfcbe7",
    package_sha256: "48a06e6aeede3499e391710db82fe948afa7e74ecbf3e819b66121f3cd54666b",
  }),
  playwright: Object.freeze({
    version: "1.61.1",
    cli_sha256: "f1c4075aef116c766092250d7f37b3249a7cee6465d953207fc38c8f6145becd",
    package_sha256: "759e376f995bf39edd4810d699b99469bab1d7428b6fbc78d41912f367df7ba9",
    registry_sha256: "ee39bc924bc3d1bd895626c2910f1292d109bbfeeb5abd113acb45e1951cc942",
  }),
});
const TOOL_RELATIVE = path.join("plugins", "atlas-workflow", "tools", "atlas-3d-harness");

function failure(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function statPath(target, operations = fs) {
  try {
    return operations.lstatSync(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function assertNoSymlinkTraversal(target, { allowMissing = false, operations = fs } = {}) {
  const absolute = path.resolve(target);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = statPath(current, operations);
    if (!stat) {
      if (allowMissing) return;
      throw failure("INSTALL_PATH_MISSING");
    }
    if (stat.isSymbolicLink()) throw failure("INSTALL_PATH_SYMLINK_TRAVERSAL");
    if (current !== absolute && !stat.isDirectory()) throw failure("INSTALL_PATH_PARENT_NOT_DIRECTORY");
  }
}

function digestFile(target, operations = fs) {
  return crypto.createHash("sha256").update(operations.readFileSync(target)).digest("hex");
}

function regularFileIdentity(target, code, operations = fs) {
  try {
    assertNoSymlinkTraversal(target, { operations });
    const stat = operations.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || operations.realpathSync(target) !== target) {
      throw failure(code);
    }
    return Object.freeze({
      dev: String(stat.dev),
      ino: String(stat.ino),
      digest: digestFile(target, operations),
    });
  } catch {
    throw failure(code);
  }
}

function directoryIdentity(directory, code, operations = fs) {
  try {
    assertNoSymlinkTraversal(directory, { operations });
    const stat = operations.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || operations.realpathSync(directory) !== directory) {
      throw failure(code);
    }
    return Object.freeze({ dev: String(stat.dev), ino: String(stat.ino) });
  } catch {
    throw failure(code);
  }
}

function sameDirectoryIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameFileIdentity(left, right) {
  return sameDirectoryIdentity(left, right) && left.digest === right.digest;
}

function parseJson(target, code, operations = fs) {
  try {
    return JSON.parse(operations.readFileSync(target, "utf8"));
  } catch {
    throw failure(code);
  }
}

function deriveLayout(scriptFile = __filename, nodeExecutable = process.execPath) {
  const script = path.resolve(scriptFile);
  const toolRoot = path.resolve(path.dirname(script), "..");
  const repoRoot = path.resolve(toolRoot, "../../../..");
  const npmRoot = path.resolve(path.dirname(nodeExecutable), "../lib/node_modules/npm");
  return Object.freeze({
    script,
    toolRoot,
    repoRoot,
    cacheRoot: path.join(repoRoot, ".tmp", "atlas-3d-harness", "playwright-browsers"),
    nodeExecutable: path.resolve(nodeExecutable),
    npmCli: path.join(npmRoot, "bin", "npm-cli.js"),
    npmPackage: path.join(npmRoot, "package.json"),
    playwrightCli: path.join(toolRoot, "node_modules", "playwright-core", "cli.js"),
    playwrightPackage: path.join(toolRoot, "node_modules", "playwright-core", "package.json"),
    playwrightRegistry: path.join(toolRoot, "node_modules", "playwright-core", "browsers.json"),
  });
}

function validateLayout(layout, operations = fs) {
  const derived = deriveLayout(layout.script, layout.nodeExecutable);
  if (Object.keys(derived).some((key) => layout[key] !== derived[key])) {
    throw failure("INSTALL_CHECKOUT_LAYOUT_MISMATCH");
  }
  if (path.basename(layout.nodeExecutable) !== "node" || path.basename(path.dirname(layout.nodeExecutable)) !== "bin") {
    throw failure("INSTALL_NODE_LAYOUT_MISMATCH");
  }
  if (
    path.relative(layout.repoRoot, layout.toolRoot) !== TOOL_RELATIVE ||
    layout.script !== path.join(layout.toolRoot, "bin", "install-managed-browser.cjs")
  ) {
    throw failure("INSTALL_CHECKOUT_LAYOUT_MISMATCH");
  }
  regularFileIdentity(layout.script, "INSTALL_ENTRYPOINT_IDENTITY_INVALID", operations);
  const repoIdentity = directoryIdentity(layout.repoRoot, "INSTALL_REPO_IDENTITY_INVALID", operations);
  const toolIdentity = directoryIdentity(layout.toolRoot, "INSTALL_TOOL_IDENTITY_INVALID", operations);
  try {
    assertNoSymlinkTraversal(layout.cacheRoot, { allowMissing: true, operations });
  } catch {
    throw failure("INSTALL_CACHE_IDENTITY_INVALID");
  }
  return Object.freeze({ repoIdentity, toolIdentity });
}

function freezeNpm(layout, operations = fs) {
  const node = regularFileIdentity(layout.nodeExecutable, "INSTALL_NODE_IDENTITY_INVALID", operations);
  const cli = regularFileIdentity(layout.npmCli, "INSTALL_NPM_CLI_IDENTITY_INVALID", operations);
  const packageFile = regularFileIdentity(layout.npmPackage, "INSTALL_NPM_PACKAGE_IDENTITY_INVALID", operations);
  const packageJson = parseJson(layout.npmPackage, "INSTALL_NPM_PACKAGE_INVALID", operations);
  if (
    cli.digest !== EXPECTED.npm.cli_sha256 ||
    packageFile.digest !== EXPECTED.npm.package_sha256 ||
    packageJson.name !== "npm" ||
    packageJson.version !== EXPECTED.npm.version
  ) {
    throw failure("INSTALL_NPM_IDENTITY_MISMATCH");
  }
  return Object.freeze({ node, cli, packageFile });
}

function revalidateNpm(layout, frozen, operations = fs) {
  const current = freezeNpm(layout, operations);
  if (
    !sameFileIdentity(frozen.node, current.node) ||
    !sameFileIdentity(frozen.cli, current.cli) ||
    !sameFileIdentity(frozen.packageFile, current.packageFile)
  ) {
    throw failure("INSTALL_NPM_IDENTITY_DRIFT");
  }
}

function freezePlaywright(layout, operations = fs) {
  const cli = regularFileIdentity(layout.playwrightCli, "INSTALL_PLAYWRIGHT_CLI_IDENTITY_INVALID", operations);
  const packageFile = regularFileIdentity(layout.playwrightPackage, "INSTALL_PLAYWRIGHT_PACKAGE_IDENTITY_INVALID", operations);
  const registry = regularFileIdentity(layout.playwrightRegistry, "INSTALL_PLAYWRIGHT_REGISTRY_IDENTITY_INVALID", operations);
  const packageJson = parseJson(layout.playwrightPackage, "INSTALL_PLAYWRIGHT_PACKAGE_INVALID", operations);
  if (
    cli.digest !== EXPECTED.playwright.cli_sha256 ||
    packageFile.digest !== EXPECTED.playwright.package_sha256 ||
    registry.digest !== EXPECTED.playwright.registry_sha256 ||
    packageJson.name !== "playwright-core" ||
    packageJson.version !== EXPECTED.playwright.version
  ) {
    throw failure("INSTALL_PLAYWRIGHT_IDENTITY_MISMATCH");
  }
  return Object.freeze({ cli, packageFile, registry });
}

function revalidatePlaywright(layout, frozen, operations = fs) {
  const current = freezePlaywright(layout, operations);
  if (
    !sameFileIdentity(frozen.cli, current.cli) ||
    !sameFileIdentity(frozen.packageFile, current.packageFile) ||
    !sameFileIdentity(frozen.registry, current.registry)
  ) {
    throw failure("INSTALL_PLAYWRIGHT_IDENTITY_DRIFT");
  }
}

function checkChild(result, label) {
  if (result?.error) throw failure(`${label}_SPAWN_FAILED`);
  if (result?.signal) throw failure(`${label}_SIGNALED`);
  if (result?.status !== 0) throw failure(`${label}_NONZERO`);
}

function installManagedBrowser(privateOptions = {}) {
  const nodeExecutable = privateOptions.nodeExecutable || process.execPath;
  const layout = privateOptions.layout || deriveLayout(__filename, nodeExecutable);
  const operations = privateOptions.operations || fs;
  const runner = privateOptions.runner || spawnSync;
  const host = privateOptions.host || { platform: process.platform, arch: process.arch, node: process.versions.node };
  const cwd = privateOptions.cwd || process.cwd();
  const environment = privateOptions.environment || process.env;

  if (host.platform !== "darwin" || host.arch !== "arm64") throw failure("INSTALL_HOST_DARWIN_ARM64_REQUIRED");
  if (host.node !== EXPECTED.node) throw failure("INSTALL_NODE_24_15_0_REQUIRED");
  if (layout.nodeExecutable !== path.resolve(nodeExecutable)) throw failure("INSTALL_NODE_LAYOUT_MISMATCH");

  const identities = validateLayout(layout, operations);
  if (path.resolve(cwd) !== layout.repoRoot || operations.realpathSync(cwd) !== layout.repoRoot) {
    throw failure("INSTALL_CWD_REPO_ROOT_REQUIRED");
  }
  const npmIdentity = freezeNpm(layout, operations);
  const npmResult = runner(
    layout.nodeExecutable,
    [layout.npmCli, "ci", "--ignore-scripts", "--prefix", layout.toolRoot],
    { cwd: layout.repoRoot, env: environment, shell: false, stdio: "inherit" },
  );
  checkChild(npmResult, "INSTALL_NPM_CI");

  const afterNpm = validateLayout(layout, operations);
  if (
    !sameDirectoryIdentity(identities.repoIdentity, afterNpm.repoIdentity) ||
    !sameDirectoryIdentity(identities.toolIdentity, afterNpm.toolIdentity)
  ) {
    throw failure("INSTALL_CHECKOUT_IDENTITY_DRIFT");
  }
  revalidateNpm(layout, npmIdentity, operations);
  const playwrightIdentity = freezePlaywright(layout, operations);

  const browserEnvironment = { ...environment, PLAYWRIGHT_BROWSERS_PATH: layout.cacheRoot };
  const browserResult = runner(
    layout.nodeExecutable,
    [layout.playwrightCli, "install", "--no-shell", "chromium"],
    { cwd: layout.repoRoot, env: browserEnvironment, shell: false, stdio: "inherit" },
  );
  checkChild(browserResult, "INSTALL_MANAGED_CHROMIUM");

  const afterBrowser = validateLayout(layout, operations);
  if (
    !sameDirectoryIdentity(identities.repoIdentity, afterBrowser.repoIdentity) ||
    !sameDirectoryIdentity(identities.toolIdentity, afterBrowser.toolIdentity)
  ) {
    throw failure("INSTALL_CHECKOUT_IDENTITY_DRIFT");
  }
  revalidateNpm(layout, npmIdentity, operations);
  revalidatePlaywright(layout, playwrightIdentity, operations);
  directoryIdentity(layout.cacheRoot, "INSTALL_CACHE_IDENTITY_INVALID", operations);

  return Object.freeze({
    status: "installed",
    tool_root: layout.toolRoot,
    cache_root: layout.cacheRoot,
    browser: "chromium",
    shell: false,
    with_deps: false,
  });
}

function main() {
  try {
    process.stdout.write(`${JSON.stringify(installManagedBrowser())}\n`);
  } catch (error) {
    process.stderr.write(`${error.code || "INSTALL_FAILED"}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  installManagedBrowser,
  testing: Object.freeze({ EXPECTED, assertNoSymlinkTraversal, checkChild, deriveLayout, validateLayout }),
};
