"use strict";
const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const test = require("node:test");
const Ajv2020 = require("ajv/dist/2020");
const { BROWSER_BINARY, CACHE_ROOT } = require("../../src/resources/layout.cjs");
process.env.PLAYWRIGHT_BROWSERS_PATH = CACHE_ROOT;
const { chromium } = require("playwright-core");
const { MARKER, cleanupBrowserEnvironment, prepareBrowserEnvironment, testing: browserEnvironmentTesting } = require("../../src/security/browser-environment.cjs");
const { EXPECTED, preflight, verifyIdentity, verifySourceStatus } = require("../../src/security/preflight.cjs");
const { launchOwnedBrowserServer, ownedBrowserProcessEvidence } = require("../../src/transport/browser.cjs");
const { makeAttemptRuntime } = require("../support/browser-runtime.cjs");

const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");

test("exact current Mac, lock, registry, and managed binary pass before launch", () => {
  const value = preflight();
  assert.match(value.source_head, /^[a-f0-9]{40}$/);
  assert.strictEqual(value.browser_revision, "1228");
  assert.strictEqual(value.browser_version, "149.0.7827.55");
});

test("host/source/driver/lock identity mismatches are zero-start failures", () => {
  for (const key of ["platform", "arch", "os", "build", "darwin", "node", "lock", "registry", "binary", "info_plist", "revision", "browser"]) {
    let starts = 0;
    assert.throws(() => { verifyIdentity({ ...EXPECTED, head: "0".repeat(40), [key]: "drift" }); starts += 1; });
    assert.strictEqual(starts, 0);
  }
  assert.throws(() => verifyIdentity({ ...EXPECTED, head: "drift" }), /head/);
  assert.throws(() => verifySourceStatus(" M tools/atlas-3d-harness/source.cjs"), /source tree/);
  const saved = process.env.PATH;
  process.env.PATH = "/tmp/atlas-shadow";
  try { assert.doesNotThrow(() => preflight()); } finally { process.env.PATH = saved; }
});

test("lock and third-party manifest distinguish Chrome binary terms from Chromium source license", () => {
  const root = path.resolve(__dirname, "../..");
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json")));
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json")));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "third-party/manifest.json")));
  const schema = JSON.parse(fs.readFileSync(path.join(root, "third-party/manifest.schema.json")));
  assert.strictEqual(lock.lockfileVersion, 3);
  assert.deepStrictEqual(Object.keys(pkg.dependencies).sort(), ["ajv", "gl-matrix", "playwright-core", "pngjs", "three"]);
  for (const version of Object.values(pkg.dependencies)) assert(!version.startsWith("^") && !version.startsWith("~"));
  for (const name of ["install", "postinstall", "prepare"]) assert.strictEqual(pkg.scripts[name], undefined);
  const ajv = new Ajv2020({ strict: true });
  const validate = ajv.compile(schema);
  assert(validate(manifest), ajv.errorsText(validate.errors));
  assert.strictEqual(manifest.browser.license, undefined);
  assert.strictEqual(manifest.browser.distribution_terms.identity, "Google Chrome Terms of Service");
  assert.strictEqual(manifest.browser.open_source_source_license.component, "Chromium source portions");
  const wrongIdentity = structuredClone(manifest);
  wrongIdentity.browser.distribution_terms.bundle_terms_text_sha256 = "0".repeat(64);
  assert.strictEqual(validate(wrongIdentity), false, "wrong Chrome terms identity must be rejected");
  assert.strictEqual(manifest.npm.length, Object.keys(lock.packages).length - 1);
  for (const item of manifest.npm) {
    const entry = lock.packages[`node_modules/${item.name}`];
    assert(entry);
    for (const key of ["version", "resolved", "integrity", "license"]) assert.strictEqual(item[key], entry[key]);
  }
  for (const name of ["MIT.txt", "BSD-3-Clause.txt", "Apache-2.0.txt"]) assert(fs.statSync(path.join(root, "third-party/licenses", name)).size > 500);
});

test("managed browser exposes the frozen bundle-local Google Chrome terms", async (t) => {
  const owned = makeAttemptRuntime(t, "terms");
  const runtime = prepareBrowserEnvironment({ attemptRoot: owned.attemptRoot, identity: owned.identity });
  const browser = await chromium.launch({ headless: false, args: ["--headless=new"], env: runtime.environment });
  try {
    const page = await browser.newPage();
    await page.goto("chrome://terms");
    const text = await page.locator("body").innerText();
    assert.strictEqual(Buffer.byteLength(text), 1158);
    assert.strictEqual(digest(text), "75c4a5fc8d4997160863050754b9e8d3f7a39fc8c192498ae813cf195768ed1c");
  } finally {
    await browser.close();
    cleanupBrowserEnvironment(runtime);
  }
});

test("browser runtime cleanup requires exact authority and is safely repeatable", (t) => {
  const owned = makeAttemptRuntime(t, "cleanup-ok");
  const runtime = prepareBrowserEnvironment({ attemptRoot: owned.attemptRoot, identity: owned.identity });
  assert.deepStrictEqual(cleanupBrowserEnvironment(runtime), { removed: true, already_absent: false });
  assert.deepStrictEqual(cleanupBrowserEnvironment(runtime), { removed: false, already_absent: true });
  assert.throws(() => prepareBrowserEnvironment({ attemptRoot: `${owned.attemptRoot}/../attempt-1`, identity: owned.identity }), /canonical absolute syntax/);
  assert.throws(() => cleanupBrowserEnvironment({ attemptRoot: owned.root, runtimeRoot: owned.root, identity: owned.identity, ownership: { attempt_root: owned.root, runtime_root: owned.root } }), /invalid|authority|mismatch/);
});

test("browser runtime cleanup rejects missing, mismatched, and symlink-substituted ownership", (t) => {
  for (const kind of ["missing", "mismatched"]) {
    const owned = makeAttemptRuntime(t, `cleanup-${kind}`);
    const runtime = prepareBrowserEnvironment({ attemptRoot: owned.attemptRoot, identity: owned.identity });
    const marker = path.join(runtime.runtimeRoot, MARKER);
    if (kind === "missing") fs.unlinkSync(marker);
    else fs.writeFileSync(marker, `${JSON.stringify({ ...runtime.ownership, ownership_id: "0".repeat(64) })}\n`);
    assert.throws(() => cleanupBrowserEnvironment(runtime), /marker/);
    assert(fs.existsSync(runtime.runtimeRoot));
  }
  const owned = makeAttemptRuntime(t, "cleanup-symlink");
  const runtime = prepareBrowserEnvironment({ attemptRoot: owned.attemptRoot, identity: owned.identity });
  const unrelated = path.join(owned.root, "unrelated");
  fs.rmSync(runtime.runtimeRoot, { recursive: true });
  fs.mkdirSync(unrelated);
  fs.writeFileSync(path.join(unrelated, "keep"), "keep");
  fs.symlinkSync(unrelated, runtime.runtimeRoot);
  assert.throws(() => cleanupBrowserEnvironment(runtime), /non-symlink/);
  assert.strictEqual(fs.readFileSync(path.join(unrelated, "keep"), "utf8"), "keep");
});

test("browser runtime cleanup rejects a preexisting ownership-specific quarantine", (t) => {
  const owned = makeAttemptRuntime(t, "cleanup-collision");
  const runtime = prepareBrowserEnvironment({ attemptRoot: owned.attemptRoot, identity: owned.identity });
  const quarantine = browserEnvironmentTesting.quarantinePath(runtime);
  fs.mkdirSync(quarantine);
  fs.writeFileSync(path.join(quarantine, "keep"), "keep");
  assert.throws(() => cleanupBrowserEnvironment(runtime), /quarantine collision/);
  assert(fs.existsSync(path.join(runtime.runtimeRoot, MARKER)));
  assert.strictEqual(fs.readFileSync(path.join(quarantine, "keep"), "utf8"), "keep");
});

test("browser runtime cleanup fails closed when the verified path is atomically substituted before quarantine", (t) => {
  const owned = makeAttemptRuntime(t, "cleanup-substitute");
  const runtime = prepareBrowserEnvironment({ attemptRoot: owned.attemptRoot, identity: owned.identity });
  const preserved = path.join(owned.attemptRoot, ".verified-runtime-preserved");
  let intercepted = false;
  const operations = Object.create(fs);
  operations.renameSync = (source, destination) => {
    if (!intercepted && source === runtime.runtimeRoot) {
      intercepted = true;
      fs.renameSync(source, preserved);
      fs.mkdirSync(source);
      fs.writeFileSync(path.join(source, "unrelated-keep"), "keep");
    }
    fs.renameSync(source, destination);
  };
  assert.throws(() => browserEnvironmentTesting.cleanupWithOperations(runtime, operations), /inode mismatch/);
  assert(intercepted);
  assert.strictEqual(fs.readFileSync(path.join(runtime.runtimeRoot, "unrelated-keep"), "utf8"), "keep");
  assert(fs.existsSync(path.join(preserved, MARKER)), "original verified directory must remain preserved");
  assert.strictEqual(fs.existsSync(browserEnvironmentTesting.quarantinePath(runtime)), false);
});

test("browser runtime cleanup restores without deletion after post-rename marker mismatch", (t) => {
  const owned = makeAttemptRuntime(t, "cleanup-post-marker");
  const runtime = prepareBrowserEnvironment({ attemptRoot: owned.attemptRoot, identity: owned.identity });
  let intercepted = false;
  const operations = Object.create(fs);
  operations.renameSync = (source, destination) => {
    fs.renameSync(source, destination);
    if (!intercepted && source === runtime.runtimeRoot) {
      intercepted = true;
      fs.writeFileSync(path.join(destination, MARKER), `${JSON.stringify({ ...runtime.ownership, ownership_id: "0".repeat(64) })}\n`);
    }
  };
  assert.throws(() => browserEnvironmentTesting.cleanupWithOperations(runtime, operations), /marker mismatch/);
  assert(intercepted);
  assert(fs.existsSync(runtime.runtimeRoot));
  assert.strictEqual(fs.existsSync(browserEnvironmentTesting.quarantinePath(runtime)), false);
});

test("owned process evidence binds the exact browser PID and argv despite a concurrent decoy", async (t) => {
  const first = makeAttemptRuntime(t, "pid-owner");
  const second = makeAttemptRuntime(t, "pid-decoy");
  const firstRuntime = prepareBrowserEnvironment({ attemptRoot: first.attemptRoot, identity: first.identity });
  const secondRuntime = prepareBrowserEnvironment({ attemptRoot: second.attemptRoot, identity: second.identity });
  const owner = await launchOwnedBrowserServer(firstRuntime);
  const decoy = await launchOwnedBrowserServer(secondRuntime);
  const child = owner.process();
  try {
    const evidence = ownedBrowserProcessEvidence(child, firstRuntime.runtimeRoot);
    assert.strictEqual(evidence.pid, child.pid);
    assert.notStrictEqual(evidence.pid, decoy.process().pid);
    assert.strictEqual(evidence.argv_digest, digest(JSON.stringify(child.spawnargs)));
    assert(evidence.sanitized.includes("--user-data-dir=<ephemeral-profile>"));
    assert.throws(() => ownedBrowserProcessEvidence(child, firstRuntime.runtimeRoot, []), /NOT_OBSERVED/);
    assert.throws(() => ownedBrowserProcessEvidence({ ...child, pid: child.pid, spawnfile: child.spawnfile, spawnargs: child.spawnargs.filter((arg) => !arg.startsWith("--user-data-dir=")) }, firstRuntime.runtimeRoot), /PROFILE_ARGV/);
    const profileArg = child.spawnargs.find((arg) => arg.startsWith("--user-data-dir="));
    assert.throws(() => ownedBrowserProcessEvidence({ ...child, pid: child.pid, spawnfile: child.spawnfile, spawnargs: [...child.spawnargs, profileArg] }, firstRuntime.runtimeRoot), /PROFILE_ARGV/);
    assert.throws(() => ownedBrowserProcessEvidence({ ...child, pid: child.pid, spawnfile: "/bin/echo", spawnargs: ["/bin/echo", ...child.spawnargs.slice(1)] }, firstRuntime.runtimeRoot), /EXECUTABLE_IDENTITY/);
  } finally {
    await owner.close();
    await decoy.close();
    cleanupBrowserEnvironment(firstRuntime);
    cleanupBrowserEnvironment(secondRuntime);
  }
  assert.throws(() => ownedBrowserProcessEvidence(child, firstRuntime.runtimeRoot), /STALE/);
});
