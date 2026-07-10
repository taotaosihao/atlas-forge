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
const {
  TRACE_USAGE,
  parseFeedbackArgs,
  parseLearningDecisionArgs,
  parseLessonArgs,
  parseTraceArgs,
  runFeedbackCycle,
  runLearningDecision,
  runLessonCandidate,
  runTracePromotion,
  tracePreview,
} = require(path.join(WORKFLOW_ROOT, "bin/lib/codex-workflow/feedback/commands.js"));

function clockAt(value) {
  return () => new Date(value);
}

function temporaryWorkflow(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-feedback-commands."));
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

function createFixtureTask(environment, title = "Feedback commands") {
  return createTask(title, "feedback contract", {
    clock: clockAt("2026-07-10T11:00:00.000Z"),
    environment,
  });
}

function readJsonLines(file) {
  return fs
    .readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

test("promotes the latest failed verification into trace and regression records", (t) => {
  assert.equal(
    tracePreview(Array.from({ length: 121 }, (_, index) => `${index}`).join("\n")).split(
      "\n",
    ).length,
    120,
  );
  assert.match(tracePreview("x".repeat(7000)), /\n\.\.\. \(truncated\)$/);

  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Trace promotion");
  const artifactDir = taskArtifactDir(paths, taskId);
  const verificationDir = path.join(artifactDir, "verification");
  fs.writeFileSync(path.join(verificationDir, "001.md"), "- verdict: passed\n- exit_code: 0\n");
  fs.writeFileSync(path.join(verificationDir, "002.md"), "- verdict: failed\n- exit_code: 2\n");
  const latest = path.join(verificationDir, "003.md");
  fs.writeFileSync(latest, "- verdict: failed\n- exit_code: 3\nlatest failure\n");

  const result = runTracePromotion(
    parseTraceArgs([
      taskId,
      "--from=latest",
      "--type",
      "regression",
      "--reason",
      "preserve failed behavior",
    ]),
    { clock: clockAt("2026-07-10T11:01:02.000Z"), environment },
  );
  const candidate = "T20260710110102";
  const traceFile = path.join(artifactDir, "trace-candidates.md");
  const regression = path.join(artifactDir, "regressions", `${candidate}.md`);
  assert.deepEqual(result.lines, [
    `task_id: ${taskId}`,
    `artifact: ${traceFile}`,
    `candidate: ${candidate}`,
    `source: ${latest}`,
    "type: regression",
    "owner: atlas",
    `regression: ${regression}`,
  ]);
  assert.match(fs.readFileSync(traceFile, "utf8"), /latest failure/);
  assert.match(fs.readFileSync(regression, "utf8"), /preserve failed behavior/);
  const ledger = readJsonLines(path.join(artifactDir, "ledger.jsonl"));
  assert.deepEqual(ledger.at(-1), {
    kind: "trace-promote",
    created_at: "2026-07-10T11:01:02Z",
    candidate_id: candidate,
    type: "regression",
    owner: "atlas",
    source: latest,
    reason: "preserve failed behavior",
    regression,
  });
  const file = taskFile(paths.tasksDir, taskId);
  assert.equal(getTaskField(file, "latest_trace_candidate"), candidate);
  const state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(state.trace.latest_source, latest);
  assert.equal(state.trace.latest_type, "regression");
  assert.deepEqual(readJsonLines(taskRuntimeFile(paths, taskId)).at(-1), {
    kind: "trace-promote",
    detail: `${candidate} regression`,
    created_at: "2026-07-10T11:01:02Z",
  });

  assert.throws(
    () =>
      runTracePromotion(
        parseTraceArgs([taskId, "--type=outside", "--reason=bad"]),
        { clock: clockAt("2026-07-10T11:02:00Z"), environment },
      ),
    /invalid type: outside/,
  );
  const noFailure = createFixtureTask(environment, "No failed verification");
  assert.throws(
    () =>
      runTracePromotion(
        parseTraceArgs([noFailure, "--type=lesson", "--reason=none"]),
        { clock: clockAt("2026-07-10T11:03:00Z"), environment },
      ),
    /no failed verification record found for --from latest/,
  );
});

test("advances feedback plan cycles only for high severity or affected rows", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Feedback cycles");
  const artifactDir = taskArtifactDir(paths, taskId);
  const first = runFeedbackCycle(
    parseFeedbackArgs([
      taskId,
      "--source=verify",
      "--finding=required check failed",
      "--severity=high",
      "--classification=implementation-bug",
      "--route=repair",
      "--evidence=verification/failed.md",
    ]),
    { clock: clockAt("2026-07-10T11:10:00Z"), environment },
  );
  assert.equal(first.lines[3], "cycle: 1");
  assert.equal(first.lines[4], "status: new-cycle");
  assert.ok(fs.existsSync(path.join(artifactDir, "plan-cycles", "cycle-1.md")));

  const second = runFeedbackCycle(
    parseFeedbackArgs([
      taskId,
      "--source=user",
      "--finding=low priority note",
      "--severity=low",
      "--classification=scope-change",
      "--route=clarify",
    ]),
    { clock: clockAt("2026-07-10T11:11:00Z"), environment },
  );
  assert.equal(second.lines[2], "cycle_file: -");
  assert.equal(second.lines[3], "cycle: 1");
  assert.equal(second.lines[4], "status: current-cycle-note");
  const returnFile = path.join(artifactDir, "return-to-plan.md");
  assert.match(fs.readFileSync(returnFile, "utf8"), /low priority note/);
  assert.doesNotMatch(fs.readFileSync(returnFile, "utf8"), /required check failed/);

  const third = runFeedbackCycle(
    parseFeedbackArgs([
      taskId,
      "--source=design-review",
      "--finding=acceptance row changed",
      "--severity=medium",
      "--classification=acceptance-gap",
      "--route=acceptance-update",
      "--affected-row=A1",
      "--affected-row=A2",
      "--evidence=review.md",
    ]),
    { clock: clockAt("2026-07-10T11:12:00Z"), environment },
  );
  assert.equal(third.lines[3], "cycle: 2");
  assert.ok(fs.existsSync(path.join(artifactDir, "plan-cycles", "cycle-2.md")));
  const events = readJsonLines(path.join(artifactDir, "ledger.jsonl"));
  assert.deepEqual(
    events.map((event) => [event.plan_cycle, event.cycle_status]),
    [
      [1, "new-cycle"],
      [1, "current-cycle-note"],
      [2, "new-cycle"],
    ],
  );
  const state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(state.active_plan_cycle, 2);
  assert.equal(state.latest_feedback_route, "acceptance-update");
  assert.equal(state.stale_acceptance_rows, "A1;A2");
  assert.equal(getTaskField(taskFile(paths.tasksDir, taskId), "active_plan_cycle"), "2");
});

test("appends lesson candidates and retains compatibility trigger values", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Lesson candidates");
  const first = runLessonCandidate(
    parseLessonArgs([
      taskId,
      "--trigger=manual",
      "--lesson=keep verification local",
      "--evidence=review.md",
    ]),
    { clock: clockAt("2026-07-10T11:20:00Z"), environment },
  );
  assert.equal(first.lines[2], "candidate: L20260710112000");
  const second = runLessonCandidate(
    parseLessonArgs([
      taskId,
      "--trigger=multica-feedback",
      "--lesson=feed required rows back to plan",
    ]),
    { clock: clockAt("2026-07-10T11:21:00Z"), environment },
  );
  assert.equal(second.lines[4], "evidence_count: 0");
  const lessonFile = path.join(taskArtifactDir(paths, taskId), "lesson-candidates.md");
  const text = fs.readFileSync(lessonFile, "utf8");
  assert.equal((text.match(/^# Lesson Candidates$/gm) || []).length, 1);
  assert.match(text, /L20260710112000/);
  assert.match(text, /L20260710112100/);
  const state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(state.learning.latest_candidate, "L20260710112100");
  assert.equal(state.learning.trigger, "multica-feedback");
  assert.throws(
    () =>
      runLessonCandidate(
        parseLessonArgs([taskId, "--trigger=outside", "--lesson=bad"]),
        { clock: clockAt("2026-07-10T11:22:00Z"), environment },
      ),
    /invalid trigger: outside/,
  );
});

test("overwrites the current learning decision while retaining its ledger", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Learning decision");
  runLearningDecision(
    parseLearningDecisionArgs([
      taskId,
      "--decision=promote",
      "--reason=two repeated failures",
      "--candidate=L1",
      "--candidate=L2",
    ]),
    { clock: clockAt("2026-07-10T11:30:00Z"), environment },
  );
  const second = runLearningDecision(
    parseLearningDecisionArgs([
      taskId,
      "--decision=skip",
      "--reason=single local occurrence",
    ]),
    { clock: clockAt("2026-07-10T11:31:00Z"), environment },
  );
  assert.equal(second.lines.at(-1), "candidates: 0");
  const artifactDir = taskArtifactDir(paths, taskId);
  const decision = fs.readFileSync(path.join(artifactDir, "learning-decision.md"), "utf8");
  assert.match(decision, /- Decision: skip/);
  assert.match(decision, /- All current candidates\./);
  assert.doesNotMatch(decision, /two repeated failures/);
  const ledger = readJsonLines(path.join(artifactDir, "ledger.jsonl"));
  assert.deepEqual(
    ledger.map((event) => [event.decision, event.candidates]),
    [
      ["promote", ["L1", "L2"]],
      ["skip", []],
    ],
  );
  const state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(state.learning.decision, "skip");
  assert.equal(state.learning.decision_candidates, 0);
  assert.throws(
    () =>
      runLearningDecision(
        parseLearningDecisionArgs([taskId, "--decision=archive", "--reason=bad"]),
        { clock: clockAt("2026-07-10T11:32:00Z"), environment },
      ),
    /invalid decision: archive/,
  );
});

test("public Bash dispatcher delegates generic feedback commands", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Public feedback");
  const source = path.join(environment.CODEX_HOME_ROOT, "failed.md");
  fs.writeFileSync(source, "- verdict: failed\n- exit_code: 2\n");
  const trace = spawnSync(
    PUBLIC_BIN,
    [
      "trace-promote",
      taskId,
      `--from=${source}`,
      "--type=lesson",
      "--reason=public trace",
      "--owner=project",
    ],
    { encoding: "utf8", env: environment },
  );
  assert.equal(trace.status, 0, trace.stderr);
  assert.match(trace.stdout, /type: lesson\nowner: project\nregression: -\n$/);

  const lesson = spawnSync(
    PUBLIC_BIN,
    [
      "lesson-candidate",
      taskId,
      "--trigger=manual",
      "--lesson=public lesson",
      "--evidence=trace.md",
    ],
    { encoding: "utf8", env: environment },
  );
  assert.equal(lesson.status, 0, lesson.stderr);
  assert.equal(readJsonObject(taskStateFile(paths, taskId)).learning.trigger, "manual");

  const invalid = spawnSync(PUBLIC_BIN, ["trace-promote", taskId, "--unknown"], {
    encoding: "utf8",
    env: environment,
  });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stderr, `${TRACE_USAGE}\n`);
});
