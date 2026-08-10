"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const LEGACY_BIN = path.resolve(__dirname, "../../bin/codex-workflow-legacy");

function invokeLegacy(t, args) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-legacy-preflight."));
  const workflowRoot = path.join(root, "workflow-must-not-exist");
  const tmpRoot = path.join(root, "tmp-must-not-exist");
  const launcherMarker = path.join(root, "launcher-ran");
  const launcher = path.join(root, "mock-launcher");
  fs.writeFileSync(launcher, [
    "#!/usr/bin/env bash",
    `printf launched > ${JSON.stringify(launcherMarker)}`,
  ].join("\n"));
  fs.chmodSync(launcher, 0o755);
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));

  const result = spawnSync(LEGACY_BIN, args, {
    encoding: "utf8",
    env: {
      ...process.env,
      CODEX_BIN: launcher,
      PASEO_BIN: launcher,
      CODEX_WORKFLOW_ROOT: workflowRoot,
      TMPDIR: tmpRoot,
    },
  });
  return { launcherMarker, result, tmpRoot, workflowRoot };
}

function assertZeroSideEffects(invocation) {
  assert.equal(fs.existsSync(invocation.workflowRoot), false);
  assert.equal(fs.existsSync(invocation.tmpRoot), false);
  assert.equal(fs.existsSync(invocation.launcherMarker), false);
}

test("direct legacy team-loop fails before workflow writes or child launch", (t) => {
  const invocation = invokeLegacy(t, ["team-loop", "fixture", "unsafe loop"]);
  assert.equal(invocation.result.status, 1);
  assert.match(invocation.result.stderr, /team-loop is disabled because it always enters execute mode/);
  assert.equal(invocation.result.stdout, "");
  assertZeroSideEffects(invocation);
});

test("direct legacy team-start rejects every explicit non-discuss mode before side effects", (t) => {
  for (const modeArgs of [["--mode=execute"], ["--mode", "invalid"]]) {
    const invocation = invokeLegacy(t, ["team-start", "fixture", "unsafe start", ...modeArgs]);
    assert.equal(invocation.result.status, 1);
    assert.match(invocation.result.stderr, /team-start is discuss-only; refusing mode:/);
    assert.equal(invocation.result.stdout, "");
    assertZeroSideEffects(invocation);
  }
});

test("direct legacy team-start preflight preserves default and explicit discuss", (t) => {
  for (const modeArgs of [[], ["--mode=discuss"], ["--mode", "discuss"]]) {
    const invocation = invokeLegacy(t, ["team-start", "missing-task", "safe discussion", ...modeArgs]);
    assert.equal(invocation.result.status, 1);
    assert.match(invocation.result.stderr, /unknown task: missing-task/);
    assert.doesNotMatch(invocation.result.stderr, /team-start is discuss-only/);
    assert.equal(fs.existsSync(invocation.launcherMarker), false);
  }
});
