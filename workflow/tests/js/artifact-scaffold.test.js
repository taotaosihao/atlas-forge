"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const test = require("node:test");

const WORKFLOW_ROOT = path.resolve(__dirname, "../..");
const PUBLIC_BIN = path.join(WORKFLOW_ROOT, "bin", "codex-workflow");
const TEMPLATE_DIR = path.join(WORKFLOW_ROOT, "templates");
const { resolvePaths, taskArtifactDir } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/core/paths.js",
));
const { createTask } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/task/lifecycle.js",
));
const { taskRuntimeFile } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/task/runtime.js",
));
const {
  ArtifactScaffoldError,
  scaffoldBrainstorm,
  scaffoldClarify,
  scaffoldIntake,
  scaffoldPhase,
  scaffoldTeam,
} = require(path.join(WORKFLOW_ROOT, "bin/lib/codex-workflow/artifact/scaffold.js"));

function fixedClock() {
  return new Date(2026, 6, 10, 12, 0, 0);
}

function temporaryWorkflow(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-artifact-scaffold."));
  const environment = {
    ...process.env,
    CODEX_HOME_ROOT: home,
    CODEX_WORKFLOW_ROOT: path.join(home, "workflow"),
    CODEX_WORKFLOW_TEMPLATE_DIR: TEMPLATE_DIR,
    TMPDIR: path.join(home, "tmp"),
  };
  t.after(() => fs.rmSync(home, { force: true, recursive: true }));
  return { environment, paths: resolvePaths(environment) };
}

function createFixtureTask(environment, title = "Artifact scaffold") {
  return createTask(title, "scaffold contract", {
    clock: fixedClock,
    environment,
  });
}

test("creates workflow-note scaffolds and preserves substantive existing files", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment);
  const artifactDir = taskArtifactDir(paths, taskId);

  assert.deepEqual(scaffoldIntake(taskId, { clock: fixedClock, environment }), [
    `created\t${path.join(artifactDir, "intake.md")}`,
  ]);
  scaffoldBrainstorm(taskId, { clock: fixedClock, environment });
  scaffoldClarify(taskId, { clock: fixedClock, environment });
  const intakeFile = path.join(artifactDir, "intake.md");
  assert.match(fs.readFileSync(intakeFile, "utf8"), new RegExp(`task_id: ${taskId}`));
  assert.match(fs.readFileSync(intakeFile, "utf8"), /created: 2026-07-10/);

  fs.appendFileSync(intakeFile, "KEEP-ME\n", "utf8");
  const before = fs.readFileSync(intakeFile);
  assert.deepEqual(scaffoldIntake(taskId, { clock: fixedClock, environment }), [
    `exists\t${intakeFile}`,
  ]);
  assert.deepEqual(fs.readFileSync(intakeFile), before);

  const events = fs
    .readFileSync(taskRuntimeFile(paths, taskId), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
    .filter((row) => row.kind === "scaffold");
  assert.deepEqual(
    events.map((row) => row.detail),
    ["intake", "brainstorm", "clarify", "intake"],
  );
});

test("replaces only exact team placeholders and then preserves rendered files", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Team scaffold");
  const teamDir = path.join(taskArtifactDir(paths, taskId), "team");

  assert.deepEqual(scaffoldTeam(taskId, { clock: fixedClock, environment }), [
    `updated\t${path.join(teamDir, "decision.md")}`,
    `updated\t${path.join(teamDir, "staffing.md")}`,
  ]);
  assert.match(fs.readFileSync(path.join(teamDir, "decision.md"), "utf8"), /backend: native/);
  assert.match(fs.readFileSync(path.join(teamDir, "staffing.md"), "utf8"), /## Ownership/);

  const decisionFile = path.join(teamDir, "decision.md");
  fs.appendFileSync(decisionFile, "\nSubstantive decision.\n", "utf8");
  const before = fs.readFileSync(decisionFile);
  const lines = scaffoldTeam(taskId, { clock: fixedClock, environment });
  assert.equal(lines[0], `exists\t${decisionFile}`);
  assert.equal(lines[1], `exists\t${path.join(teamDir, "staffing.md")}`);
  assert.deepEqual(fs.readFileSync(decisionFile), before);
});

test("creates the four phase conclusion files and rejects unsafe phase ids", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Phase scaffold");
  const phaseDir = path.join(taskArtifactDir(paths, taskId), "evidence", "phase-4a");
  const lines = scaffoldPhase(taskId, "phase-4a", { clock: fixedClock, environment });

  assert.equal(lines.length, 4);
  for (const name of [
    "phase-review-report.md",
    "defect-queue.md",
    "evidence-index.md",
    "gate-checklist.md",
  ]) {
    const text = fs.readFileSync(path.join(phaseDir, name), "utf8");
    assert.match(text, new RegExp(`task_id: ${taskId}`));
    assert.match(text, /phase_id: phase-4a/);
  }
  const report = fs.readFileSync(path.join(phaseDir, "phase-review-report.md"), "utf8");
  for (const heading of [
    "## 阶段结论",
    "## 完成与产品经理验收",
    "## 已测试的能力",
    "## 未完成、风险与下一验收点",
    "## 技术追溯（按需查看）",
  ]) {
    assert.match(report, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.ok(report.indexOf("## 完成与产品经理验收") < report.indexOf("## 技术追溯"));
  assert.match(report, /产品经理怎么验收/);
  assert.match(report, /应看到的结果/);
  assert.match(report, /实际结果/);
  assert.throws(
    () => scaffoldPhase(taskId, "../bad", { clock: fixedClock, environment }),
    (error) =>
      error instanceof ArtifactScaffoldError && error.message === "invalid phase id: ../bad",
  );
});

test("rejects a non-file scaffold target without recording a success event", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Invalid target");
  const intakePath = path.join(taskArtifactDir(paths, taskId), "intake.md");
  fs.mkdirSync(intakePath);
  const runtimeFile = taskRuntimeFile(paths, taskId);
  const before = fs.readFileSync(runtimeFile);

  assert.throws(
    () => scaffoldIntake(taskId, { clock: fixedClock, environment }),
    (error) =>
      error instanceof ArtifactScaffoldError &&
      error.message === `artifact path is not a regular file: ${intakePath}`,
  );
  assert.deepEqual(fs.readFileSync(runtimeFile), before);
});

test("public Bash dispatcher delegates scaffold commands and preserves diagnostics", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Public scaffold");
  const result = spawnSync(PUBLIC_BIN, ["scaffold-phase", taskId, "phase-1"], {
    encoding: "utf8",
    env: environment,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim().split("\n").length, 4);
  assert.ok(fs.existsSync(path.join(taskArtifactDir(paths, taskId), "evidence/phase-1/gate-checklist.md")));

  const invalid = spawnSync(PUBLIC_BIN, ["scaffold-phase", taskId, "../bad"], {
    encoding: "utf8",
    env: environment,
  });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stderr, "invalid phase id: ../bad\n");

  const usage = spawnSync(PUBLIC_BIN, ["scaffold-intake", taskId, "extra"], {
    encoding: "utf8",
    env: environment,
  });
  assert.equal(usage.status, 1);
  assert.equal(usage.stderr, "usage: codex-workflow scaffold-intake <task-id>\n");
});
