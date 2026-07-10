"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const test = require("node:test");

const WORKFLOW_ROOT = path.resolve(__dirname, "../..");
const PUBLIC_BIN = path.join(WORKFLOW_ROOT, "bin", "codex-workflow");
const RECORD_CLI = path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/verification/record-cli.js",
);
const TEMPLATE_DIR = path.join(WORKFLOW_ROOT, "templates");
const { resolvePaths } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/core/paths.js",
));
const { createTask, startTask } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/task/lifecycle.js",
));
const { getTaskField, taskFile } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/task/repository.js",
));
const { readJsonObject, taskRuntimeFile, taskStateFile } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/task/runtime.js",
));
const { outputPreview } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/verification/record.js",
));
const {
  VERIFY_USAGE,
  formatCommand,
  parseVerifyArgs,
  runVerification,
} = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/verification/runner.js",
));

function fixedClock() {
  return new Date("2026-07-10T09:15:00.000Z");
}

function temporaryWorkflow(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-verification-runner."));
  const environment = {
    ...process.env,
    CODEX_HOME_ROOT: home,
    CODEX_WORKFLOW_ROOT: path.join(home, "workflow"),
    CODEX_WORKFLOW_TEMPLATE_DIR: TEMPLATE_DIR,
    TMPDIR: path.join(home, "tmp"),
  };
  t.after(() => fs.rmSync(home, { force: true, recursive: true }));
  return { environment, home, paths: resolvePaths(environment) };
}

function createFixtureTask(environment, title = "Verification runner") {
  return createTask(title, "verification record contract", {
    clock: fixedClock,
    environment,
  });
}

function readEvents(paths, taskId) {
  return fs
    .readFileSync(taskRuntimeFile(paths, taskId), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

test("runs a passing argv command and records independent verification metadata", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment);
  const parsed = parseVerifyArgs([
    taskId,
    "--outcome",
    "blocked",
    "--trajectory=fixed",
    "--evaluator",
    "human",
    "--evidence",
    "verification/manual.md",
    "--evidence=https://example.invalid/run/1",
    "--",
    process.execPath,
    "-e",
    'process.stdout.write("child stdout\\n"); process.stderr.write("child stderr\\n")',
  ]);
  const result = runVerification(parsed, {
    clock: fixedClock,
    environment,
    recordToken: "20260710T091500000000000",
  });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.lines, [
    `task_id: ${taskId}`,
    `record: ${result.recordFile}`,
    "verdict: passed",
  ]);
  const record = fs.readFileSync(result.recordFile, "utf8");
  assert.match(record, /^# Verification Record/m);
  assert.match(record, /- exit_code: 0\n- verdict: passed\n- outcome: blocked/);
  assert.match(record, /- trajectory: fixed\n- evaluator: human/);
  assert.match(record, /- `verification\/manual\.md`/);
  assert.match(record, /- `https:\/\/example\.invalid\/run\/1`/);
  assert.match(record, /```text\nchild stdout\n```/);
  assert.match(record, /```text\nchild stderr\n```/);

  const file = taskFile(paths.tasksDir, taskId);
  assert.equal(getTaskField(file, "last_verified_at"), "2026-07-10T09:15:00Z");
  const state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(state.last_verified_at, "2026-07-10T09:15:00Z");
  assert.deepEqual(state.verification, {
    last_record: `workflow/artifacts/${taskId}/verification/20260710T091500000000000.md`,
    last_exit_code: 0,
    outcome: "blocked",
    trajectory: "fixed",
    evaluator: "human",
    failure_attribution: "",
    evidence_refs: "verification/manual.md https://example.invalid/run/1",
  });
  assert.deepEqual(readEvents(paths, taskId).at(-1), {
    kind: "verify",
    detail: `${formatCommand(parsed.command)} => passed`,
    created_at: "2026-07-10T09:15:00Z",
  });
});

test("returns a failed command exit code after writing every projection", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Failed verification");
  const parsed = parseVerifyArgs([
    taskId,
    "--outcome=failed",
    "--trajectory",
    "reproduced",
    "--evaluator=local-command",
    "--failure-attribution",
    "code",
    "--evidence",
    "review.md",
    "--",
    process.execPath,
    "-e",
    'process.stderr.write("failure detail\\n"); process.exit(3)',
  ]);
  const result = runVerification(parsed, {
    clock: fixedClock,
    environment,
    recordToken: "20260710T091500000000001",
  });

  assert.equal(result.exitCode, 3);
  assert.equal(result.lines[2], "verdict: failed");
  const record = fs.readFileSync(result.recordFile, "utf8");
  assert.match(record, /- exit_code: 3\n- verdict: failed/);
  assert.match(record, /- failure_attribution: code/);
  assert.match(record, /failure detail/);
  const state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(state.verification.last_exit_code, 3);
  assert.equal(state.verification.outcome, "failed");
  assert.equal(state.verification.failure_attribution, "code");
  assert.equal(readEvents(paths, taskId).at(-1).kind, "verify");
});

test("keeps parser diagnostics and public child exit-code delegation stable", (t) => {
  assert.equal(formatCommand(["bash", "-lc", "exit 3"]), "bash -lc exit\\ 3 ");
  assert.equal(formatCommand(["echo", "中文", "a,b"]), "echo 中文 a\\,b ");
  assert.equal(
    formatCommand(["echo", "#", "~", "a#b", "a~b"]),
    "echo \\# \\~ a#b a~b ",
  );
  assert.throws(() => parseVerifyArgs([]), new RegExp(VERIFY_USAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.throws(() => parseVerifyArgs(["task", "--",]), new RegExp("usage: codex-workflow verify"));
  assert.throws(
    () => parseVerifyArgs(["task", "--outcome", "unknown", "--", "true"]),
    /invalid outcome: unknown/,
  );
  assert.throws(
    () => parseVerifyArgs(["task", "--failure-attribution=outside", "--", "true"]),
    /invalid failure attribution: outside/,
  );

  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Public failed verification");
  const child = spawnSync(
    PUBLIC_BIN,
    [
      "verify",
      taskId,
      "--outcome",
      "failed",
      "--failure-attribution",
      "test",
      "--",
      process.execPath,
      "-e",
      'process.stdout.write("not public\\n"); process.exit(3)',
    ],
    { encoding: "utf8", env: environment },
  );
  assert.equal(child.status, 3, child.stderr);
  assert.match(child.stdout, /^task_id: .+\nrecord: .+\nverdict: failed\n$/);
  assert.doesNotMatch(child.stdout, /not public/);
  assert.equal(child.stderr, "");
  const state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(state.verification.last_exit_code, 3);
  assert.equal(state.verification.failure_attribution, "test");

  const invalid = spawnSync(PUBLIC_BIN, ["verify", taskId, "--",], {
    encoding: "utf8",
    env: environment,
  });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stderr, `${VERIFY_USAGE}\n`);
});

test("shares the JavaScript record writer with smoke and preserves preview limits", (t) => {
  const { home } = temporaryWorkflow(t);
  const stdoutFile = path.join(home, "stdout");
  const stderrFile = path.join(home, "stderr");
  const recordFile = path.join(home, "smoke.md");
  fs.writeFileSync(
    stdoutFile,
    Array.from({ length: 82 }, (_, index) => `line-${index + 1}`).join("\n"),
  );
  fs.writeFileSync(stderrFile, "");
  assert.match(outputPreview(stdoutFile), /line-80\n\.\.\. \(2 more lines omitted\)$/);

  const written = spawnSync(
    process.execPath,
    [
      RECORD_CLI,
      recordFile,
      "smoke",
      "task-smoke",
      "codex exec smoke",
      "/tmp/repo",
      "0",
      "passed",
      stdoutFile,
      stderrFile,
      "2026-07-10T09:15:00Z",
      "passed",
      "smoke-only",
      "local-command",
      "",
      "0",
    ],
    { encoding: "utf8" },
  );
  assert.equal(written.status, 0, written.stderr);
  const record = fs.readFileSync(recordFile, "utf8");
  assert.match(record, /^# Smoke Record/);
  assert.match(record, /- trajectory: smoke-only/);
  assert.match(record, /\.\.\. \(2 more lines omitted\)/);
});

test("keeps the Bash smoke command compatible with the JavaScript record writer", (t) => {
  const { environment } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Smoke writer");
  startTask(taskId, { clock: fixedClock, environment });
  const mockCodex = path.join(environment.CODEX_HOME_ROOT, "mock-codex");
  fs.writeFileSync(
    mockCodex,
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "last_message=''",
      "while [[ $# -gt 0 ]]; do",
      "  if [[ \"$1\" == '--output-last-message' ]]; then",
      "    last_message=\"$2\"",
      "    shift 2",
      "  else",
      "    shift",
      "  fi",
      "done",
      "printf '%s\\n' 'CODEX-SMOKE-OK' > \"$last_message\"",
      "printf '%s\\n' 'mock smoke stdout'",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );

  const smoke = spawnSync(PUBLIC_BIN, ["smoke"], {
    encoding: "utf8",
    env: { ...environment, CODEX_BIN: mockCodex },
  });
  assert.equal(smoke.status, 0, smoke.stderr);
  assert.match(smoke.stdout, new RegExp(`^task_id: ${taskId}\\nrecord: (.+)\\nmessage: CODEX-SMOKE-OK\\n$`));
  const recordFile = smoke.stdout.match(/record: (.+)\n/)[1];
  const record = fs.readFileSync(recordFile, "utf8");
  assert.match(record, /^# Smoke Record/);
  assert.match(record, /mock smoke stdout/);
  assert.match(record, /CODEX-SMOKE-OK/);
  assert.match(record, /- verdict: passed/);
});
