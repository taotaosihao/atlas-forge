"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { once } = require("events");
const test = require("node:test");
const { fingerprint, fileIdentity, sha256 } = require("./lib/portable");

function temporaryRoot(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "atlas-portable.")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("portable shell helpers hash files/stdin and retain permission/identity checks", (t) => {
  const root = temporaryRoot(t);
  const file = path.join(root, "file with spaces");
  fs.writeFileSync(file, "abc", { mode: 0o600 });
  const result = spawnSync("bash", ["-c", [
    'source "$1"',
    'sha256 "$2"',
    "printf abc | sha256",
    'file_mode "$2"',
    'file_identity "$2"',
    'fingerprint "$2"',
  ].join("\n"), "portable-test", path.join(__dirname, "lib/portable.sh"), file], {
    encoding: "utf8",
    env: { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin` },
  });
  assert.equal(result.status, 0, result.stderr);
  const digest = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
  assert.deepEqual(result.stdout.trim().split("\n"), [digest, digest, "600", fileIdentity(file), fingerprint(file)]);
});

test("missing tools and macOS system Bash fail dependency admission", () => {
  const args = ["-c", 'source "$1"; test_command_dir "$2"', "dependency-test",
    path.join(__dirname, "lib/portable.sh")];
  const result = spawnSync("bash", [...args, "__atlas_missing_dependency__"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /require __atlas_missing_dependency__ on PATH/);
  if (process.platform === "darwin") {
    const oldBash = spawnSync("/bin/bash", [...args, "bash"], {
      encoding: "utf8", env: { PATH: "/usr/bin:/bin" },
    });
    assert.notEqual(oldBash.status, 0);
    assert.match(oldBash.stderr, /require Bash 4\+/);
  }
});

test("tree fingerprints cover bytes, paths and modes but keep inode identity separate", (t) => {
  const root = temporaryRoot(t);
  const tree = path.join(root, "tree");
  const copy = path.join(root, "copy");
  fs.mkdirSync(tree);
  fs.chmodSync(tree, 0o755);
  const file = path.join(tree, "line\nbreak");
  fs.writeFileSync(file, "old", { mode: 0o600 });
  const original = fingerprint(tree);
  fs.cpSync(tree, copy, { recursive: true });
  assert.equal(fingerprint(copy), original);
  assert.notEqual(fileIdentity(copy), fileIdentity(tree));
  fs.writeFileSync(file, "new");
  assert.notEqual(fingerprint(tree), original);
  fs.writeFileSync(file, "old");
  fs.chmodSync(file, 0o700);
  assert.notEqual(fingerprint(tree), original);
  fs.chmodSync(file, 0o600);
  assert.equal(fingerprint(tree), original);
  fs.chmodSync(tree, 0o700);
  assert.notEqual(fingerprint(tree), original);
  assert.equal(sha256(Buffer.from("abc")), sha256("abc"));
});

test("fingerprints do not follow symlinks and distinguish missing and special entries", (t) => {
  const root = temporaryRoot(t);
  const tree = path.join(root, "tree");
  const external = path.join(root, "external");
  fs.mkdirSync(tree);
  fs.writeFileSync(external, "outside");
  const link = path.join(tree, "link");
  fs.symlinkSync(external, link);
  const original = fingerprint(tree);
  fs.writeFileSync(external, "changed outside");
  assert.equal(fingerprint(tree), original);
  fs.unlinkSync(link);
  fs.symlinkSync("missing", link);
  assert.notEqual(fingerprint(tree), original);
  assert.notEqual(fingerprint(link), "missing");
  assert.equal(fingerprint(path.join(root, "absent")), "missing");
  const beforeFifo = fingerprint(tree);
  const fifo = path.join(tree, "fifo");
  const result = spawnSync("mkfifo", [fifo], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.notEqual(fingerprint(tree), beforeFifo);
  fs.unlinkSync(fifo);
  assert.equal(fingerprint(tree), beforeFifo);
});

test("Atlas fixture copies exclude local tool state without changing the source", (t) => {
  const root = temporaryRoot(t);
  const source = path.join(root, "source");
  const target = path.join(root, "target");
  const tool = "tools/atlas-3d-harness";
  fs.mkdirSync(path.join(source, tool), { recursive: true });
  fs.writeFileSync(path.join(source, tool, "package.json"), "{}\n");
  for (const name of ["node_modules", ".local", "runs", "artifacts"]) {
    fs.mkdirSync(path.join(source, tool, name));
    fs.writeFileSync(path.join(source, tool, name, "sentinel"), "local state");
  }
  fs.writeFileSync(path.join(source, tool, "runtime-config.local.json"), "{}\n");
  fs.writeFileSync(path.join(source, tool, "run.log"), "local log");
  const before = fingerprint(source);
  const result = spawnSync("bash", ["-c", 'source "$1"; copy_atlas_fixture "$2" "$3"',
    "fixture-copy", path.join(__dirname, "lib/portable.sh"), source, target], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fs.readdirSync(path.join(target, tool)), ["package.json"]);
  assert.equal(fingerprint(source), before);
});

for (const [termination, expected] of [[null, 124], ["SIGINT", 130], ["SIGTERM", 143]]) {
  test(`bounded command cleans its descendants on ${termination || "timeout"}`, { timeout: 10000 }, async (t) => {
    const child = spawn("python3", [path.join(__dirname, "lib/run-with-timeout.py"),
      termination ? "15" : "1", process.execPath, "-e", `
        require("child_process").spawn(process.execPath,
          ["-e", "setInterval(() => {}, 1000)"], { stdio: "inherit" });
        console.log(process.pid);
        setInterval(() => {}, 1000);
      `], { stdio: ["ignore", "pipe", "pipe"] });
    let group;
    t.after(() => {
      child.kill("SIGKILL");
      if (group) {
        try { process.kill(-group, "SIGKILL"); } catch (error) {
          if (error.code !== "ESRCH") throw error;
        }
      }
    });
    const closed = once(child, "close");
    const [ready] = await once(child.stdout, "data");
    group = Number(ready.toString().trim());
    assert.ok(Number.isInteger(group) && group > 0);
    if (termination) assert.equal(child.kill(termination), true);
    // close also waits for the inherited pipe in the grandchild to close.
    const [code, signal] = await closed;
    assert.equal(signal, null);
    assert.equal(code, expected);
  });
}

function runRepoFixture(t, probe, options = {}) {
  const root = temporaryRoot(t);
  const repo = path.join(root, "repo");
  const originalHome = path.join(root, process.platform === "darwin" ? 'home "quoted"' : "home with spaces");
  fs.mkdirSync(path.join(originalHome, ".codex"), { recursive: true });
  fs.writeFileSync(path.join(originalHome, ".codex/sentinel"), "private fixture");
  fs.mkdirSync(path.join(repo, "plugins/atlas-workflow"), { recursive: true });
  fs.mkdirSync(path.join(repo, "workflow/tests"), { recursive: true });
  fs.writeFileSync(path.join(repo, "probe.js"), probe(originalHome));
  fs.writeFileSync(path.join(repo, "workflow/tests/contract.sh"),
    '#!/usr/bin/env bash\nset -euo pipefail\nnode "$ATLAS_FORGE_ROOT/probe.js"\nprintf "fixture suite passed\\n"\n');
  const env = { ...process.env, HOME: originalHome, ATLAS_FORGE_ROOT: repo, KEEP_TEST_TMP: "0", TMPDIR: root };
  if (options.emptyTrace) {
    const bin = path.join(root, "bin");
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, "uname"), "#!/bin/sh\nprintf '%s\\n' Linux\n", { mode: 0o755 });
    fs.writeFileSync(path.join(bin, "strace"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    env.PATH = `${bin}:${env.PATH}`;
  }
  return spawnSync("bash", [path.join(__dirname, "contract_repo.sh")], { env, encoding: "utf8" });
}

test("repo wrapper runs its allowed fixture under the real host isolation backend", (t) => {
  const result = runRepoFixture(t, () => 'require("fs").readFileSync(process.env.GIT_CONFIG_GLOBAL);');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /HOME isolation verified with/);
  assert.match(result.stdout, /fixture suite passed/);
});

for (const [name, probe] of [
  ["temporary HOME canary", () => 'try { require("fs").readFileSync(process.env.HOME + "/.ssh/sentinel"); } catch {}'],
  ["protected write", () => 'require("fs").writeFileSync(process.env.HOME + "/.ssh/sentinel", "changed");'],
  ["original HOME path", (home) => `require("fs").readFileSync(${JSON.stringify(path.join(home, ".codex/sentinel"))});`],
  ["child process", () => 'const r = require("child_process").spawnSync(process.execPath, ["-e", \'require("fs").readFileSync(process.env.HOME + "/.ssh/sentinel")\']); process.exit(r.signal ? 1 : r.status);'],
]) {
  test(`repo isolation rejects access through ${name}`, (t) => {
    const result = runRepoFixture(t, probe);
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stdout, /HOME isolation verified with/);
    assert.doesNotMatch(result.stdout, /repo contract passed:/);
    if (process.platform === "darwin") {
      assert.doesNotMatch(result.stdout, /fixture suite passed/);
    } else {
      assert.match(result.stderr, /accessed protected HOME path:/);
    }
  });
}

test("macOS kernel guard follows symlink targets without leaking protected data", { skip: process.platform !== "darwin" }, (t) => {
  const result = runRepoFixture(t, (home) => `
    const fs = require("fs");
    const link = process.env.CODEX_HOME + "/escape";
    fs.symlinkSync(${JSON.stringify(path.join(home, ".codex"))}, link);
    fs.readFileSync(link + "/sentinel");
  `);
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stdout, /HOME isolation verified with/);
  assert.doesNotMatch(result.stdout, /fixture suite passed/);
});

test("a successful tracer exit without a trace still fails closed", (t) => {
  const result = runRepoFixture(t, () => "", { emptyTrace: true });
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stderr, /no file-access trace/);
});
