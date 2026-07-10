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
const { getTaskField, taskFile } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/task/repository.js",
));
const { readJsonObject, taskRuntimeFile, taskStateFile } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/task/runtime.js",
));
const { parseCheckpointArgs, writeCheckpoint } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/artifact/checkpoint.js",
));
const {
  parsePromptArgs,
  parseSourceArgs,
  writePromptBundle,
  writeSourceSnapshot,
} = require(path.join(WORKFLOW_ROOT, "bin/lib/codex-workflow/artifact/provenance.js"));
const { parseRouteArgs, writeRouteDecision } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/artifact/routing.js",
));

function fixedClock() {
  return new Date("2026-07-10T08:30:00.000Z");
}

function temporaryWorkflow(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-artifact-planning."));
  const environment = {
    ...process.env,
    HOME: home,
    CODEX_HOME_ROOT: home,
    CODEX_WORKFLOW_ROOT: path.join(home, "workflow"),
    CODEX_WORKFLOW_TEMPLATE_DIR: TEMPLATE_DIR,
    TMPDIR: path.join(home, "tmp"),
  };
  t.after(() => fs.rmSync(home, { force: true, recursive: true }));
  return { environment, home, paths: resolvePaths(environment) };
}

function createFixtureTask(environment, title) {
  return createTask(title, "artifact planning contract", {
    clock: fixedClock,
    environment,
  });
}

test("records route decisions, legacy layer aliases, and consensus evidence", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Route planning");
  const artifactDir = taskArtifactDir(paths, taskId);
  const decisionFile = path.join(artifactDir, "team", "decision.md");
  fs.writeFileSync(
    decisionFile,
    "# Team Decision\n\n## Planner\nUse route evidence.\n\n## Architect\nKeep state structured.\n\n## Critic\nReject templates.\n",
  );
  const parsed = parseRouteArgs([
    taskId,
    "--intent",
    "team",
    "--risk=medium",
    "--decision",
    "use",
    "--reason",
    "native review is required",
    "--next",
    "finish",
    "--assumption",
    "contract approved",
    "--consensus",
  ]);
  const lines = writeRouteDecision(parsed, { clock: fixedClock, environment });

  assert.equal(lines[0], `task_id: ${taskId}`);
  assert.match(lines[7], /consensus-plan\.md$/);
  assert.equal(getTaskField(taskFile(paths.tasksDir, taskId), "route_intent"), "team");
  assert.equal(getTaskField(taskFile(paths.tasksDir, taskId), "route_next"), "finish");
  const state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(state.route.assumptions_count, 1);
  assert.equal(state.route.consensus, `workflow/artifacts/${taskId}/consensus-plan.md`);
  assert.match(fs.readFileSync(path.join(artifactDir, "routing-decision.md"), "utf8"), /- Action: use/);
  assert.match(fs.readFileSync(path.join(artifactDir, "consensus-plan.md"), "utf8"), /Planner: explicit/);

  const alias = parseRouteArgs([
    taskId,
    "--layer",
    "task",
    "--risk",
    "low",
    "--decision",
    "skip",
    "--reason",
    "direct path is enough",
  ]);
  writeRouteDecision(alias, { clock: fixedClock, environment });
  assert.equal(getTaskField(taskFile(paths.tasksDir, taskId), "route_intent"), "task");
});

test("writes checkpoint ledger, lifecycle projection, task fields, and state", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Checkpoint planning");
  const parsed = parseCheckpointArgs([
    taskId,
    "--phase=plan",
    "--summary",
    "plan | ready",
    "--branch",
    "main",
    "--worktree=none",
    "--next",
    "run contract",
    "--next=review output",
  ]);
  const lines = writeCheckpoint(parsed, { clock: fixedClock, environment });

  assert.equal(lines[3], "phase: plan");
  assert.equal(lines[4], "next_count: 2");
  const file = taskFile(paths.tasksDir, taskId);
  assert.equal(getTaskField(file, "current_phase"), "plan");
  const state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(state.current_phase, "plan");
  assert.equal(state.checkpoint.summary, "plan | ready");
  const lifecycle = fs.readFileSync(path.join(taskArtifactDir(paths, taskId), "lifecycle.md"), "utf8");
  assert.match(lifecycle, /\| plan \| plan \\\| ready \| run contract; review output \|/);
  assert.throws(
    () =>
      writeCheckpoint(
        parseCheckpointArgs([taskId, "--phase", "blocked", "--summary", "waiting"]),
        { clock: fixedClock, environment },
      ),
    /blocked phase requires --blocker/,
  );
});

test("records file and URL source snapshots without guessing source content", (t) => {
  const { environment, home, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Source planning");
  const sourceFile = path.join(home, "source.md");
  fs.writeFileSync(sourceFile, "canonical source\n", "utf8");
  const parsed = parseSourceArgs([
    taskId,
    "--source",
    sourceFile,
    "--source=https://example.invalid/spec",
    "--used-for",
    "contract provenance",
    "--authority=canonical",
    "--freshness",
    "fresh",
  ]);
  const lines = writeSourceSnapshot(parsed, {
    clock: fixedClock,
    cwd: home,
    environment,
  });

  assert.equal(lines[3], "count: 2");
  const artifactDir = taskArtifactDir(paths, taskId);
  const rows = fs
    .readFileSync(path.join(artifactDir, "sources.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(rows[0].type, "file");
  assert.match(rows[0].sha256, /^[0-9a-f]{64}$/);
  assert.equal(rows[1].type, "url");
  assert.equal(rows[1].sha256, "-");
  assert.match(fs.readFileSync(path.join(artifactDir, "provenance.md"), "utf8"), /contract provenance/);
  assert.equal(getTaskField(taskFile(paths.tasksDir, taskId), "source_snapshot_count"), "2");
});

test("builds prompt bundle hashes and rewrites provenance from the same model", (t) => {
  const { environment, home, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Prompt planning");
  const includeFile = path.join(home, "context.md");
  fs.writeFileSync(includeFile, "prompt context\n", "utf8");
  const parsed = parsePromptArgs([
    taskId,
    "--include",
    includeFile,
    "--skill=atlas-workflow:task",
    "--agent",
    "reviewer",
    "--bundle-id=p4a-bundle",
  ]);
  const lines = writePromptBundle(parsed, {
    clock: fixedClock,
    cwd: home,
    environment,
  });

  assert.equal(lines[3], "bundle_id: p4a-bundle");
  assert.equal(lines[4], "agent: reviewer");
  const artifactDir = taskArtifactDir(paths, taskId);
  const bundle = JSON.parse(fs.readFileSync(path.join(artifactDir, "prompt-bundle.json"), "utf8"));
  assert.equal(bundle.files[0].path, includeFile);
  assert.match(bundle.files[0].sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(bundle.skills, ["atlas-workflow:task"]);
  assert.match(fs.readFileSync(path.join(artifactDir, "provenance.md"), "utf8"), /- Agent: reviewer/);
  assert.equal(getTaskField(taskFile(paths.tasksDir, taskId), "prompt_bundle_id"), "p4a-bundle");
});

test("public dispatcher preserves route help, errors, and planning output", (t) => {
  const { environment, home } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Public planning");
  const sourceFile = path.join(home, "source.md");
  fs.writeFileSync(sourceFile, "source\n", "utf8");

  const help = spawnSync(PUBLIC_BIN, ["route-decision", "--help"], {
    encoding: "utf8",
    env: environment,
  });
  assert.equal(help.status, 0);
  assert.match(help.stderr, /^usage: codex-workflow route-decision/);

  const invalid = spawnSync(
    PUBLIC_BIN,
    ["route-decision", taskId, "--intent", "unknown", "--risk", "low", "--decision", "use", "--reason", "bad"],
    { encoding: "utf8", env: environment },
  );
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stderr, "invalid intent: unknown\n");

  const source = spawnSync(
    PUBLIC_BIN,
    ["source-snapshot", taskId, "--source", sourceFile, "--used-for", "public contract"],
    { encoding: "utf8", env: environment },
  );
  assert.equal(source.status, 0, source.stderr);
  assert.match(source.stdout, new RegExp(`^task_id: ${taskId}`, "m"));

  const unknown = spawnSync(
    PUBLIC_BIN,
    ["route-decision", "GEW-30", "--intent", "task", "--risk", "low", "--decision", "use", "--reason", "bad"],
    { encoding: "utf8", env: environment },
  );
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /not an external issue key/);
});

test("parsers keep required-argument and enum failures stable", () => {
  assert.throws(() => parseCheckpointArgs(["task", "--summary", "x"]), /missing required argument: --phase/);
  assert.throws(() => parseSourceArgs(["task", "--used-for", "x"]), /missing required argument: --source/);
  assert.throws(() => parsePromptArgs(["task"]), /missing required argument: --include/);
  assert.throws(
    () => parseRouteArgs(["task", "--intent", "task", "--risk", "low", "--decision", "use"]),
    /missing required argument: --reason/,
  );
});

test("planning commands append their legacy runtime event kinds", (t) => {
  const { environment, home, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Runtime planning");
  const includeFile = path.join(home, "input.md");
  fs.writeFileSync(includeFile, "input\n", "utf8");
  writeCheckpoint(
    parseCheckpointArgs([taskId, "--phase", "plan", "--summary", "ready"]),
    { clock: fixedClock, environment },
  );
  writeSourceSnapshot(
    parseSourceArgs([taskId, "--source", includeFile, "--used-for", "runtime"]),
    { clock: fixedClock, environment },
  );
  writePromptBundle(parsePromptArgs([taskId, "--include", includeFile]), {
    clock: fixedClock,
    environment,
  });
  const kinds = fs
    .readFileSync(taskRuntimeFile(paths, taskId), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line).kind);
  assert.ok(kinds.includes("checkpoint"));
  assert.ok(kinds.includes("source-snapshot"));
  assert.ok(kinds.includes("prompt-bundle"));
});
