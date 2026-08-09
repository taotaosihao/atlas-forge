"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { fileDigest } = require("./digest.cjs");
const { BROWSER_BINARY, REPO_ROOT, TOOL_ROOT } = require("../resources/layout.cjs");

const EXPECTED = Object.freeze({ platform: "darwin", arch: "arm64", os: "26.5.2", build: "25F84", darwin: "25.5.0", node: "v24.15.0", npm: "11.12.1", lock: "227f55d0352646890e665615582b94ce7d4930dfd968704b688c264939e6f3b9", registry: "ee39bc924bc3d1bd895626c2910f1292d109bbfeeb5abd113acb45e1951cc942", binary: "b1b9e2dd063115031f08eadc10ed381ca0fa05b2284baff8f721d87f5f0f61b7", info_plist: "940a9b3055b8fa1cc66d75fe7b5420e72d3cc987c30b4837c8c764be0319a52f", revision: "1228", browser: "149.0.7827.55" });
const out = (file, args) => execFileSync(file, args, { encoding: "utf8", env: { LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin:/usr/sbin:/sbin" } }).trim();
function verifyIdentity(actual) {
  for (const key of ["platform", "arch", "os", "build", "darwin", "node", "lock", "registry", "binary", "info_plist", "revision", "browser"]) assert.strictEqual(actual[key], EXPECTED[key], `${key.includes("platform") || key === "arch" ? "HOST_UNSUPPORTED" : "IDENTITY_MISMATCH"} ${key}`);
  assert(/^[a-f0-9]{40}$/.test(actual.head), "IDENTITY_MISMATCH head");
  return actual;
}
function verifySourceStatus(status) { assert.strictEqual(status, "", "IDENTITY_MISMATCH source tree"); }
function preflight() {
  const actual = { platform: process.platform, arch: process.arch, node: process.version, os: out("/usr/bin/sw_vers", ["-productVersion"]), build: out("/usr/bin/sw_vers", ["-buildVersion"]), darwin: out("/usr/bin/uname", ["-r"]), head: out("/usr/bin/git", ["-C", REPO_ROOT, "rev-parse", "HEAD"]), lock: fileDigest(path.join(TOOL_ROOT, "package-lock.json")), registry: fileDigest(path.join(TOOL_ROOT, "node_modules/playwright-core/browsers.json")), binary: fileDigest(BROWSER_BINARY), info_plist: fileDigest(path.resolve(BROWSER_BINARY, "../../Info.plist")), revision: "1228", browser: out(BROWSER_BINARY, ["--version"]).match(/([0-9]+(?:\.[0-9]+){3})$/)?.[1] };
  verifyIdentity(actual);
  assert.strictEqual(fs.realpathSync(REPO_ROOT), REPO_ROOT, "SOURCE_LAYOUT_MISMATCH");
  verifySourceStatus(out("/usr/bin/git", ["-C", REPO_ROOT, "status", "--porcelain=v1", "--untracked-files=all", "--", path.relative(REPO_ROOT, TOOL_ROOT)]));
  const lock = JSON.parse(fs.readFileSync(path.join(TOOL_ROOT, "package-lock.json")));
  assert.strictEqual(lock.lockfileVersion, 3, "LOCK_IDENTITY_MISMATCH");
  assert.strictEqual(lock.packages["node_modules/playwright-core"].integrity, "sha512-h7Qlt6m4REp25qvIdvbDtVmD4LqVXfpRxhORv9L0jzETM05p4fuPJ3dKyuSXQxDSbXnmS79HAgi9589lGSpLkg==", "LOCK_IDENTITY_MISMATCH playwright");
  return { schema_version: 1, source_head: actual.head, lock_digest: fileDigest(path.join(TOOL_ROOT, "package-lock.json")), browser_registry_digest: EXPECTED.registry, browser_binary_digest: EXPECTED.binary, browser_revision: EXPECTED.revision, browser_version: EXPECTED.browser };
}
module.exports = { EXPECTED, preflight, verifyIdentity, verifySourceStatus };
