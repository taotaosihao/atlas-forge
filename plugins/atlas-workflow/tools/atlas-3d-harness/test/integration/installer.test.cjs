"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const test = require("node:test");
const { installManagedBrowser, testing } = require("../../bin/install-managed-browser.cjs");

const ENTRYPOINT = path.resolve(__dirname, "../../bin/install-managed-browser.cjs");
const SOURCE_LAYOUT = testing.deriveLayout(ENTRYPOINT, process.execPath);
const HOST = Object.freeze({ platform: "darwin", arch: "arm64", node: "24.15.0" });

function copyRegular(source, target, mode) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  fs.chmodSync(target, mode);
}

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "atlas-3d-installer-")));
  const script = path.join(root, "plugins", "atlas-workflow", "tools", "atlas-3d-harness", "bin", "install-managed-browser.cjs");
  const nodeExecutable = path.join(root, "runtime", "bin", "node");
  const layout = testing.deriveLayout(script, nodeExecutable);

  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.writeFileSync(script, "entrypoint\n");
  fs.mkdirSync(path.dirname(nodeExecutable), { recursive: true });
  fs.writeFileSync(nodeExecutable, "node\n");
  fs.chmodSync(nodeExecutable, 0o755);
  copyRegular(SOURCE_LAYOUT.npmCli, layout.npmCli, 0o755);
  copyRegular(SOURCE_LAYOUT.npmPackage, layout.npmPackage, 0o644);
  copyRegular(SOURCE_LAYOUT.playwrightCli, layout.playwrightCli, 0o755);
  copyRegular(SOURCE_LAYOUT.playwrightPackage, layout.playwrightPackage, 0o644);
  copyRegular(SOURCE_LAYOUT.playwrightRegistry, layout.playwrightRegistry, 0o644);
  fs.mkdirSync(layout.cacheRoot, { recursive: true });

  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, layout, nodeExecutable };
}

function run(item, options = {}) {
  return installManagedBrowser({
    layout: item.layout,
    nodeExecutable: item.nodeExecutable,
    cwd: item.root,
    host: HOST,
    ...options,
  });
}

function replaceInode(target) {
  const replacement = `${target}.replacement`;
  const mode = fs.lstatSync(target).mode & 0o777;
  fs.copyFileSync(target, replacement);
  fs.chmodSync(replacement, mode);
  fs.renameSync(replacement, target);
}

function makeFifo(target) {
  fs.rmSync(target, { recursive: true, force: true });
  const result = spawnSync("/usr/bin/mkfifo", [target], { stdio: "pipe" });
  assert.strictEqual(result.status, 0, result.stderr?.toString());
}

test("installer derives source, Node-owned npm, Playwright, and cache paths", () => {
  const layout = testing.deriveLayout(ENTRYPOINT, process.execPath);
  const npmRoot = path.resolve(path.dirname(process.execPath), "../lib/node_modules/npm");
  assert.strictEqual(layout.toolRoot, path.resolve(__dirname, "../.."));
  assert.strictEqual(layout.repoRoot, path.resolve(__dirname, "../../../../../.."));
  assert.strictEqual(layout.nodeExecutable, process.execPath);
  assert.strictEqual(layout.npmCli, path.join(npmRoot, "bin/npm-cli.js"));
  assert.strictEqual(layout.npmPackage, path.join(npmRoot, "package.json"));
  assert.strictEqual(layout.playwrightCli, path.join(layout.toolRoot, "node_modules/playwright-core/cli.js"));
  assert.strictEqual(layout.playwrightPackage, path.join(layout.toolRoot, "node_modules/playwright-core/package.json"));
  assert.strictEqual(layout.playwrightRegistry, path.join(layout.toolRoot, "node_modules/playwright-core/browsers.json"));
  assert.strictEqual(layout.cacheRoot, path.join(layout.repoRoot, ".tmp/atlas-3d-harness/playwright-browsers"));
});

test("installer ignores PATH and bin/npm shadows and runs the two exact no-shell children", (t) => {
  const item = fixture(t);
  const shadow = path.join(item.root, "shadow");
  fs.mkdirSync(shadow);
  fs.writeFileSync(path.join(shadow, "npm"), "trap\n");
  fs.chmodSync(path.join(shadow, "npm"), 0o755);
  fs.symlinkSync("../lib/node_modules/npm/bin/npm-cli.js", path.join(path.dirname(item.nodeExecutable), "npm"));

  const calls = [];
  const environment = { PATH: shadow, SENTINEL: "preserved" };
  const result = run(item, {
    environment,
    runner(command, argv, options) {
      calls.push({ command, argv, options });
      return { status: 0, signal: null };
    },
  });

  assert.deepStrictEqual(result, {
    status: "installed",
    tool_root: item.layout.toolRoot,
    cache_root: item.layout.cacheRoot,
    browser: "chromium",
    shell: false,
    with_deps: false,
  });
  assert.deepStrictEqual(calls.map(({ command, argv }) => ({ command, argv })), [
    { command: item.nodeExecutable, argv: [item.layout.npmCli, "ci", "--ignore-scripts", "--prefix", item.layout.toolRoot] },
    { command: item.nodeExecutable, argv: [item.layout.playwrightCli, "install", "--no-shell", "chromium"] },
  ]);
  for (const call of calls) {
    assert.strictEqual(call.options.cwd, item.root);
    assert.strictEqual(call.options.shell, false);
    assert.strictEqual(call.options.stdio, "inherit");
  }
  assert.strictEqual(calls[0].options.env, environment);
  assert.deepStrictEqual(calls[1].options.env, { ...environment, PLAYWRIGHT_BROWSERS_PATH: item.layout.cacheRoot });
  assert(!calls.flatMap((call) => call.argv).includes("--with-deps"));
  assert(!calls.some((call) => call.command === "npm" || call.command === path.join(shadow, "npm")));
});

test("installer rejects wrong host, Node, cwd, layout, and preexisting cache symlink before spawn", (t) => {
  const cases = [
    { host: { ...HOST, platform: "linux" }, reason: /DARWIN_ARM64/ },
    { host: { ...HOST, arch: "x64" }, reason: /DARWIN_ARM64/ },
    { host: { ...HOST, node: "24.14.0" }, reason: /NODE_24_15_0/ },
  ];
  for (const itemCase of cases) {
    const item = fixture(t);
    let starts = 0;
    assert.throws(() => run(item, { host: itemCase.host, runner: () => { starts += 1; return { status: 0 }; } }), itemCase.reason);
    assert.strictEqual(starts, 0);
  }

  const wrongCwd = fixture(t);
  let starts = 0;
  assert.throws(() => run(wrongCwd, { cwd: path.dirname(wrongCwd.root), runner: () => { starts += 1; return { status: 0 }; } }), /CWD_REPO_ROOT/);
  assert.strictEqual(starts, 0);

  const wrongLayout = fixture(t);
  starts = 0;
  assert.throws(() => run(wrongLayout, { layout: { ...wrongLayout.layout, npmCli: wrongLayout.layout.script }, runner: () => { starts += 1; return { status: 0 }; } }), /CHECKOUT_LAYOUT/);
  assert.strictEqual(starts, 0);

  const cacheSymlink = fixture(t);
  fs.rmSync(path.join(cacheSymlink.root, ".tmp"), { recursive: true, force: true });
  fs.symlinkSync(path.join(cacheSymlink.root, "plugins"), path.join(cacheSymlink.root, ".tmp"));
  starts = 0;
  assert.throws(() => run(cacheSymlink, { runner: () => { starts += 1; return { status: 0 }; } }), /CACHE_IDENTITY/);
  assert.strictEqual(starts, 0);
});

test("installer binds npm version, canonical target, regular-file type, and link count before npm ci", (t) => {
  const wrongVersion = fixture(t);
  const packageJson = JSON.parse(fs.readFileSync(wrongVersion.layout.npmPackage, "utf8"));
  packageJson.version = "11.12.0";
  fs.writeFileSync(wrongVersion.layout.npmPackage, `${JSON.stringify(packageJson)}\n`);

  const wrongTarget = fixture(t);
  const fifo = fixture(t);
  makeFifo(fifo.layout.npmCli);
  const hardlink = fixture(t);
  fs.linkSync(hardlink.layout.npmCli, `${hardlink.layout.npmCli}.hardlink`);

  const cases = [
    { item: wrongVersion, options: {}, reason: /NPM_IDENTITY_MISMATCH/ },
    { item: wrongTarget, options: { layout: { ...wrongTarget.layout, npmCli: wrongTarget.layout.script } }, reason: /CHECKOUT_LAYOUT/ },
    { item: fifo, options: {}, reason: /NPM_CLI_IDENTITY_INVALID/ },
    { item: hardlink, options: {}, reason: /NPM_CLI_IDENTITY_INVALID/ },
  ];
  for (const itemCase of cases) {
    let starts = 0;
    assert.throws(() => run(itemCase.item, { ...itemCase.options, runner: () => { starts += 1; return { status: 0 }; } }), itemCase.reason);
    assert.strictEqual(starts, 0);
  }
});

test("installer rejects same-content npm inode replacement during npm ci", (t) => {
  const item = fixture(t);
  let starts = 0;
  assert.throws(() => run(item, {
    runner() {
      starts += 1;
      replaceInode(item.layout.npmCli);
      return { status: 0, signal: null };
    },
  }), /NPM_IDENTITY_DRIFT/);
  assert.strictEqual(starts, 1);
});

test("installer rejects unsafe or wrong Playwright files after npm and never starts the browser", (t) => {
  const cases = [];
  for (const kind of ["missing", "directory", "symlink", "hardlink"]) {
    const item = fixture(t);
    if (kind === "missing") fs.unlinkSync(item.layout.playwrightCli);
    if (kind === "directory") {
      fs.unlinkSync(item.layout.playwrightCli);
      fs.mkdirSync(item.layout.playwrightCli);
    }
    if (kind === "symlink") {
      fs.unlinkSync(item.layout.playwrightCli);
      fs.symlinkSync(item.layout.script, item.layout.playwrightCli);
    }
    if (kind === "hardlink") fs.linkSync(item.layout.playwrightCli, `${item.layout.playwrightCli}.hardlink`);
    cases.push({ item, reason: /PLAYWRIGHT_CLI_IDENTITY_INVALID/ });
  }

  const wrongVersion = fixture(t);
  const packageJson = JSON.parse(fs.readFileSync(wrongVersion.layout.playwrightPackage, "utf8"));
  packageJson.version = "1.61.0";
  fs.writeFileSync(wrongVersion.layout.playwrightPackage, `${JSON.stringify(packageJson)}\n`);
  cases.push({ item: wrongVersion, reason: /PLAYWRIGHT_IDENTITY_MISMATCH/ });

  const wrongRegistry = fixture(t);
  fs.appendFileSync(wrongRegistry.layout.playwrightRegistry, "\n");
  cases.push({ item: wrongRegistry, reason: /PLAYWRIGHT_IDENTITY_MISMATCH/ });

  for (const itemCase of cases) {
    let starts = 0;
    assert.throws(() => run(itemCase.item, { runner: () => { starts += 1; return { status: 0, signal: null }; } }), itemCase.reason);
    assert.strictEqual(starts, 1);
  }
});

test("installer rejects same-content Playwright CLI or registry inode replacement during browser install", (t) => {
  for (const key of ["playwrightCli", "playwrightRegistry"]) {
    const item = fixture(t);
    let starts = 0;
    assert.throws(() => run(item, {
      runner() {
        starts += 1;
        if (starts === 2) replaceInode(item.layout[key]);
        return { status: 0, signal: null };
      },
    }), /PLAYWRIGHT_IDENTITY_DRIFT/);
    assert.strictEqual(starts, 2);
  }
});

test("installer rejects cache-root symlink, special-file, or missing postconditions after browser exit zero", (t) => {
  for (const kind of ["symlink", "fifo", "missing"]) {
    const item = fixture(t);
    let starts = 0;
    assert.throws(() => run(item, {
      runner() {
        starts += 1;
        if (starts === 2) {
          if (kind === "symlink") {
            const external = path.join(item.root, "external-browser-cache");
            fs.renameSync(item.layout.cacheRoot, external);
            fs.symlinkSync(external, item.layout.cacheRoot);
          } else if (kind === "fifo") {
            makeFifo(item.layout.cacheRoot);
          } else {
            fs.rmSync(item.layout.cacheRoot, { recursive: true, force: true });
          }
        }
        return { status: 0, signal: null };
      },
    }), /CACHE_IDENTITY_INVALID/);
    assert.strictEqual(starts, 2);
  }
});

test("installer preserves stable spawn, signal, and nonzero failure codes", (t) => {
  const failures = [
    [[{ error: new Error("spawn") }], /NPM_CI_SPAWN_FAILED/, 1],
    [[{ status: null, signal: "SIGTERM" }], /NPM_CI_SIGNALED/, 1],
    [[{ status: 2, signal: null }], /NPM_CI_NONZERO/, 1],
    [[{ status: 0, signal: null }, { error: new Error("spawn") }], /MANAGED_CHROMIUM_SPAWN_FAILED/, 2],
    [[{ status: 0, signal: null }, { status: null, signal: "SIGTERM" }], /MANAGED_CHROMIUM_SIGNALED/, 2],
    [[{ status: 0, signal: null }, { status: 2, signal: null }], /MANAGED_CHROMIUM_NONZERO/, 2],
  ];
  for (const [results, reason, expectedStarts] of failures) {
    const item = fixture(t);
    let starts = 0;
    assert.throws(() => run(item, { runner: () => results[starts++] }), reason);
    assert.strictEqual(starts, expectedStarts);
  }
});
