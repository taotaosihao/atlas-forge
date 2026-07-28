"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const test = require("node:test");

const WORKFLOW_ROOT = path.resolve(__dirname, "../..");
const SOURCE_BIN = path.join(WORKFLOW_ROOT, "bin");
const TEMPLATE_DIR = path.join(WORKFLOW_ROOT, "templates");
const {
  DEFAULT_LEGACY_BIN,
  DIRECT_ROUTES,
  runLegacy,
} = require(path.join(SOURCE_BIN, "lib/codex-workflow/cli.js"));

const EXPECTED_ROUTES = {
  "./task/cli.js": [
    "archive",
    "block",
    "done",
    "init-task",
    "list",
    "reconcile",
    "resume",
    "show",
    "stale",
    "start",
  ],
  "./artifact/cli.js": [
    "checkpoint",
    "prompt-bundle",
    "route-decision",
    "scaffold-brainstorm",
    "scaffold-clarify",
    "scaffold-intake",
    "scaffold-phase",
    "scaffold-team",
    "source-snapshot",
  ],
  "./verification/cli.js": ["gate-metric", "gate-report", "ready", "verify"],
  "./outcome/cli.js": ["outcome-mark", "outcome-report"],
  "./feedback/cli.js": [
    "feedback-cycle",
    "learning-decision",
    "lesson-candidate",
    "trace-promote",
  ],
  "./team/cli.js": [
    "team-attempt-record",
    "team-dispatch-record",
    "team-fallback-record",
    "team-lane-record",
    "team-loop",
    "team-loop-record",
    "team-promote",
    "team-record-finalize",
    "team-record-start",
    "team-selection-record",
    "team-slice-accept",
    "team-slice-supersede",
    "team-start",
    "team-status",
    "team-stop",
  ],
};

const LEGACY_COMMANDS = [
  "handoff-envelope",
  "result-ingest",
  "curated-packet",
  "multica-feedback",
  "learn",
  "dream",
  "recall",
  "doctor",
  "smoke",
  "self-test",
  "install-hooks",
];

test("does not expose a retry lifecycle command or admission shortcut", () => {
  assert.equal(DIRECT_ROUTES.has("retry"), false);
  assert.equal(LEGACY_COMMANDS.includes("retry"), false);
});

function temporaryLayout(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-root-cli."));
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin, { recursive: true });
  fs.copyFileSync(path.join(SOURCE_BIN, "codex-workflow"), path.join(bin, "codex-workflow"));
  fs.chmodSync(path.join(bin, "codex-workflow"), 0o755);
  fs.cpSync(path.join(SOURCE_BIN, "lib"), path.join(bin, "lib"), { recursive: true });
  const environment = {
    ...process.env,
    CODEX_HOME_ROOT: root,
    CODEX_WORKFLOW_ROOT: path.join(root, "data"),
    CODEX_WORKFLOW_TEMPLATE_DIR: TEMPLATE_DIR,
  };
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  return { bin, environment, root };
}

test("routes exactly 44 migrated commands to their JavaScript domains", () => {
  assert.equal(DIRECT_ROUTES.size, 44);
  for (const [modulePath, expected] of Object.entries(EXPECTED_ROUTES)) {
    const actual = [...DIRECT_ROUTES]
      .filter(([, route]) => route === modulePath)
      .map(([command]) => command)
      .sort();
    assert.deepEqual(actual, expected);
  }
  for (const command of LEGACY_COMMANDS) {
    assert.equal(DIRECT_ROUTES.has(command), false, command);
  }
  assert.equal(DIRECT_ROUTES.has(""), false);
  assert.equal(DIRECT_ROUTES.has("unknown-command"), false);
});

test("legacy help advertises every migrated Team control-plane command", () => {
  const legacySource = fs.readFileSync(DEFAULT_LEGACY_BIN, "utf8");
  for (const command of EXPECTED_ROUTES["./team/cli.js"]) {
    assert.match(legacySource, new RegExp(`\\b${command}\\b`), command);
  }
});

test("passes the complete fallback argv and environment to the legacy launcher", () => {
  const environment = { SENTINEL: "legacy-environment" };
  const observed = {};
  const result = runLegacy(["doctor", "--strict"], {
    environment,
    execve(file, argv, receivedEnvironment) {
      observed.file = file;
      observed.argv = argv;
      observed.environment = receivedEnvironment;
      return 23;
    },
    legacyBin: "/tmp/codex-workflow-legacy",
  });
  assert.equal(result, 23);
  assert.deepEqual(observed, {
    file: "/tmp/codex-workflow-legacy",
    argv: ["/tmp/codex-workflow-legacy", "doctor", "--strict"],
    environment,
  });
  assert.equal(
    DEFAULT_LEGACY_BIN,
    path.join(WORKFLOW_ROOT, "bin", "codex-workflow-legacy"),
  );
});

test("runs a direct command when the legacy launcher is absent", (t) => {
  const { bin, environment } = temporaryLayout(t);
  const result = spawnSync(path.join(bin, "codex-workflow"), ["list", "--all"], {
    encoding: "utf8",
    env: environment,
  });
  assert.equal(fs.existsSync(path.join(bin, "codex-workflow-legacy")), false);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("execs the legacy launcher with its original exit code", (t) => {
  const { bin, environment } = temporaryLayout(t);
  const legacy = path.join(bin, "codex-workflow-legacy");
  fs.writeFileSync(
    legacy,
    "#!/bin/sh\nprintf 'legacy:'\nprintf ' <%s>' \"$@\"\nprintf '\\n'\nexit 23\n",
  );
  fs.chmodSync(legacy, 0o755);
  const result = spawnSync(path.join(bin, "codex-workflow"), ["doctor", "--strict"], {
    encoding: "utf8",
    env: environment,
  });
  assert.equal(result.status, 23, result.stderr);
  assert.equal(result.stdout, "legacy: <doctor> <--strict>\n");
  assert.equal(result.stderr, "");
});
