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
const { updateTaskCommand } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/core/command-runtime.js",
));
const { createTask } = require(path.join(
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
const {
  parseReadyArgs,
  runReady,
} = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/verification/readiness.js",
));

function fixedClock() {
  return new Date("2026-07-10T08:30:00.000Z");
}

function temporaryWorkflow(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-verification-ready."));
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

function createFixtureTask(environment, title = "Readiness") {
  return createTask(title, "readiness contract", {
    clock: fixedClock,
    environment,
  });
}

function appendSubstantiveArtifacts(paths, taskId) {
  const artifactDir = taskArtifactDir(paths, taskId);
  for (const name of ["context", "spec", "analysis"]) {
    fs.appendFileSync(path.join(artifactDir, `${name}.md`), `\nSubstantive ${name}.\n`);
  }
}

function readRuntimeEvents(paths, taskId) {
  return fs
    .readFileSync(taskRuntimeFile(paths, taskId), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

function legacyShape(event) {
  return { kind: event.kind, detail: event.detail, created_at: event.created_at };
}

test("records fresh template artifacts as not ready", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment);
  const result = runReady(parseReadyArgs([taskId]), {
    clock: fixedClock,
    environment,
  });

  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.lines, [
    `task_id: ${taskId}`,
    "status: not-ready",
    "requirements: context,spec,analysis",
    "issues: context:template,spec:template,analysis:template",
    "paths: context:context.md,spec:spec.md,analysis:analysis.md",
  ]);
  const file = taskFile(paths.tasksDir, taskId);
  assert.equal(getTaskField(file, "readiness_status"), "not-ready");
  assert.equal(getTaskField(file, "readiness_checked_at"), "2026-07-10T08:30:00Z");
  const state = readJsonObject(taskStateFile(paths, taskId));
  assert.deepEqual(state.readiness, {
    status: "not-ready",
    checked_at: "2026-07-10T08:30:00Z",
    requirements: "context,spec,analysis",
    issues: "context:template,spec:template,analysis:template",
    paths: "context:context.md,spec:spec.md,analysis:analysis.md",
    skip_reason: "-",
  });
  assert.deepEqual(legacyShape(readRuntimeEvents(paths, taskId).at(-1)), {
    kind: "readiness",
    detail:
      "not-ready context,spec,analysis context:template,spec:template,analysis:template",
    created_at: "2026-07-10T08:30:00Z",
  });
});

test("accepts substantive defaults and uses the root decision when present", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Decision readiness");
  appendSubstantiveArtifacts(paths, taskId);
  const artifactDir = taskArtifactDir(paths, taskId);
  fs.writeFileSync(
    path.join(artifactDir, "team", "decision.md"),
    "# Team Decision\n\nSubstantive team decision.\n",
  );

  let result = runReady(
    parseReadyArgs([taskId, "--require", "context, spec, analysis, decision"]),
    { clock: fixedClock, environment },
  );
  assert.equal(result.exitCode, 0);
  assert.equal(result.lines[1], "status: ready");
  assert.equal(
    result.lines[4],
    "paths: context:context.md,spec:spec.md,analysis:analysis.md,decision:team/decision.md",
  );

  fs.writeFileSync(path.join(artifactDir, "decision.md"), "# Root Decision\n");
  result = runReady(
    parseReadyArgs([taskId, "--require=context,spec,analysis,decision"]),
    { clock: fixedClock, environment },
  );
  assert.equal(result.exitCode, 1);
  assert.equal(result.lines[3], "issues: decision:template");
  assert.equal(
    result.lines[4],
    "paths: context:context.md,spec:spec.md,analysis:analysis.md,decision:decision.md",
  );

  fs.appendFileSync(path.join(artifactDir, "decision.md"), "\nRoot approval.\n");
  result = runReady(
    parseReadyArgs([taskId, "--require=context,spec,analysis,decision"]),
    { clock: fixedClock, environment },
  );
  assert.equal(result.exitCode, 0);
});

test("ready evaluates requested artifacts without interpreting admission-shaped state", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Admission-independent readiness");
  appendSubstantiveArtifacts(paths, taskId);
  const stateFile = taskStateFile(paths, taskId);
  updateTaskCommand(paths, taskId, {}, {
    severity: "Critical",
    "admission.disposition": "visible-follow-up",
    "admission.repair_status": "open",
  }, fixedClock);

  const result = runReady(parseReadyArgs([taskId]), { clock: fixedClock, environment });
  assert.equal(result.exitCode, 0);
  assert.equal(result.lines[1], "status: ready");
  const updated = readJsonObject(stateFile);
  assert.equal(updated.severity, "Critical");
  assert.deepEqual(updated.admission, {
    disposition: "visible-follow-up",
    repair_status: "open",
  });
});

test("public clarify readiness rejects missing, empty and unfilled scaffold content", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Single clarify input");
  const file = path.join(taskArtifactDir(paths, taskId), "clarify.md");
  const check = () => spawnSync(PUBLIC_BIN, ["ready", taskId, "--require", "clarify"], {
    encoding: "utf8", env: environment,
  });

  let result = check();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /issues: clarify:missing/);
  fs.writeFileSync(file, "");
  result = check();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /issues: clarify:template/);

  fs.unlinkSync(file);
  const scaffold = spawnSync(PUBLIC_BIN, ["scaffold-clarify", taskId], {
    encoding: "utf8", env: environment,
  });
  assert.equal(scaffold.status, 0, scaffold.stderr);
  const template = fs.readFileSync(file, "utf8");
  for (const content of [
    template,
    template.replace(/^created:.*$/m, "created: 2030-01-01")
      .replace(/^task_id:.*$/m, "task_id: changed-metadata")
      .replace(/ /g, "  ").replace(/\n/g, "\r\n\n"),
    "# Clarify Working Notes\n\n- Goal:\n\n| AC-1 |||\n",
    template.replace("| AC-1 |  |  |", "| AC-1 |  |  |\n| AC-2 |  |  |"),
  ]) {
    fs.writeFileSync(file, content);
    result = check();
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /issues: clarify:template/);
  }
});

test("public clarify readiness uses one filled document without mirrored artifacts or authority", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Filled clarify input");
  const artifactDir = taskArtifactDir(paths, taskId);
  for (const name of ["context", "spec", "analysis"]) {
    fs.unlinkSync(path.join(artifactDir, `${name}.md`));
  }
  const scaffold = spawnSync(PUBLIC_BIN, ["scaffold-clarify", taskId], {
    encoding: "utf8", env: environment,
  });
  assert.equal(scaffold.status, 0, scaffold.stderr);
  const file = path.join(artifactDir, "clarify.md");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8")
    .replace("- Goal:", "- Goal: Check an explicitly selected scope document.")
    .replace("| AC-1 |  |  |", "| AC-1 | Keep existing CLI defaults. | Run the compatibility test. |"));
  const result = spawnSync(PUBLIC_BIN, ["ready", taskId, "--require=clarify"], {
    encoding: "utf8", env: environment,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, [
    `task_id: ${taskId}`, "status: ready", "requirements: clarify", "issues: -",
    "paths: clarify:clarify.md", "",
  ].join("\n"));
  for (const name of ["context", "spec", "analysis"]) {
    assert.equal(fs.existsSync(path.join(artifactDir, `${name}.md`)), false);
  }
  const state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(state.readiness.paths, "clarify:clarify.md");
  assert.equal(state.execution_authority, undefined);
});

test("records an explicit readiness skip and rejects unsafe reasons", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Skipped readiness");
  const result = runReady(
    parseReadyArgs([taskId, "--skip", "self-use manual review"]),
    { clock: fixedClock, environment },
  );

  assert.deepEqual(result, {
    exitCode: 0,
    lines: [
      `task_id: ${taskId}`,
      "status: skipped",
      "requirements: context,spec,analysis",
      "reason: self-use manual review",
    ],
  });
  assert.equal(getTaskField(taskFile(paths.tasksDir, taskId), "readiness_status"), "skipped");
  assert.equal(
    readJsonObject(taskStateFile(paths, taskId)).readiness.skip_reason,
    "self-use manual review",
  );
  assert.equal(readRuntimeEvents(paths, taskId).at(-1).kind, "readiness-skip");

  for (const reason of ["", " ", "two\nlines", "tab\tvalue"]) {
    assert.throws(
      () => parseReadyArgs([taskId, `--skip=${reason}`]),
      /unsafe readiness skip reason: reason must be a single non-empty line/,
    );
  }
});

test("public dispatcher preserves ready output, usage, and exit codes", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Public readiness");

  const fresh = spawnSync(PUBLIC_BIN, ["ready", taskId], {
    encoding: "utf8",
    env: environment,
  });
  assert.equal(fresh.status, 1);
  assert.match(fresh.stdout, /^task_id: .+\nstatus: not-ready\n/);
  assert.equal(fresh.stderr, "");

  appendSubstantiveArtifacts(paths, taskId);
  const ready = spawnSync(PUBLIC_BIN, ["ready", taskId], {
    encoding: "utf8",
    env: environment,
  });
  assert.equal(ready.status, 0, ready.stderr);
  assert.match(ready.stdout, /status: ready/);

  const unknown = spawnSync(PUBLIC_BIN, ["ready", taskId, "--require", "context,unknown"], {
    encoding: "utf8",
    env: environment,
  });
  assert.equal(unknown.status, 2);
  assert.equal(unknown.stderr, "invalid readiness requirement(s): unknown\n");

  const empty = spawnSync(PUBLIC_BIN, ["ready", taskId, "--require="], {
    encoding: "utf8",
    env: environment,
  });
  assert.equal(empty.status, 1);
  assert.equal(empty.stderr, "invalid readiness requirements: empty\n");

  const usage = spawnSync(PUBLIC_BIN, ["ready", taskId, "extra"], {
    encoding: "utf8",
    env: environment,
  });
  assert.equal(usage.status, 1);
  assert.equal(
    usage.stderr,
    'usage: codex-workflow ready <task-id> [--require context,spec,analysis[,decision]|clarify] [--skip "<reason>"]\n',
  );
});
