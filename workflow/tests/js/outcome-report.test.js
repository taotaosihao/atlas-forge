"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const test = require("node:test");

const CLI_PATH = path.resolve(__dirname, "../../bin/lib/codex-workflow/outcome/cli.js");
const { resolvePaths } = require(path.resolve(
  __dirname,
  "../../bin/lib/codex-workflow/core/paths.js",
));
const { archiveTask, createTask, startTask } = require(path.resolve(
  __dirname,
  "../../bin/lib/codex-workflow/task/lifecycle.js",
));
const { taskRuntimeFile } = require(path.resolve(
  __dirname,
  "../../bin/lib/codex-workflow/task/runtime.js",
));
const { markOutcome } = require(path.resolve(
  __dirname,
  "../../bin/lib/codex-workflow/outcome/marker.js",
));
const {
  buildOutcomeReport,
  median,
  renderOutcomeMarkdown,
} = require(path.resolve(__dirname, "../../bin/lib/codex-workflow/outcome/report.js"));
const { REPORT_USAGE, parseReportArgs } = require(CLI_PATH);

function temporaryWorkflow(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-outcome-report."));
  const environment = {
    ...process.env,
    CODEX_HOME_ROOT: home,
    CODEX_WORKFLOW_ROOT: path.join(home, "workflow"),
    TMPDIR: path.join(home, "tmp"),
  };
  t.after(() => fs.rmSync(home, { force: true, recursive: true }));
  return { environment, paths: resolvePaths(environment) };
}

function clock(value) {
  return () => new Date(value);
}

function writeTaskFile(
  paths,
  taskId,
  title = "Historical unknown",
  created = "2026-07-09",
  updated = created,
) {
  fs.mkdirSync(paths.tasksDir, { recursive: true });
  fs.writeFileSync(
    path.join(paths.tasksDir, `${taskId}.md`),
    [
      `id: ${taskId}`,
      `title: ${title}`,
      "status: todo",
      `created: ${created}`,
      `updated: ${updated}`,
      "",
      "## Success Criteria",
      "legacy",
      "",
    ].join("\n"),
  );
}

function writeLegacyTask(paths, taskId) {
  writeTaskFile(paths, taskId, "Historical unknown", "2020-01-01", "2020-01-02");
  const artifactDir = path.join(paths.artifactsDir, taskId);
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(
    path.join(artifactDir, "runtime.jsonl"),
    '{"kind":"task-status","detail":"started","created_at":"2020-01-02T00:00:00Z"}\n',
  );
}

test("computes prospective coverage and median only from structured evidence", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const first = createTask("First metric", "first", {
    clock: clock("2026-07-08T00:00:00.000Z"),
    environment,
  });
  startTask(first, { clock: clock("2026-07-08T01:00:00.000Z"), environment });
  markOutcome(first, "first-code", "commit:first", {
    clock: clock("2026-07-08T02:00:00.000Z"),
    environment,
  });
  markOutcome(first, "operable-flow", "docs/headless.md", {
    clock: clock("2026-07-08T02:30:00.000Z"),
    environment,
    notApplicableReason: "headless CLI",
    notApplicableRequested: true,
  });

  const second = createTask("Second metric", "second", {
    clock: clock("2026-07-09T00:00:00.000Z"),
    environment,
  });
  startTask(second, { clock: clock("2026-07-09T01:00:00.000Z"), environment });
  markOutcome(second, "first-code", "commit:later-line", {
    clock: clock("2026-07-09T04:00:00.000Z"),
    environment,
  });
  markOutcome(second, "first-code", "commit:earlier-time", {
    clock: clock("2026-07-09T03:00:00.000Z"),
    environment,
  });
  fs.appendFileSync(
    taskRuntimeFile(paths, second),
    '{"kind":"clean-review","detail":"clean","created_at":"2026-07-09T03:30:00Z"}\n',
  );

  const missingStart = createTask("Missing start", "unknown", {
    clock: clock("2026-07-10T00:00:00.000Z"),
    environment,
  });
  markOutcome(missingStart, "first-code", "commit:no-start", {
    clock: clock("2026-07-10T01:00:00.000Z"),
    environment,
  });
  writeLegacyTask(paths, "20200101-001-historical");

  const report = buildOutcomeReport({
    clock: clock("2026-07-10T12:00:00.000Z"),
    days: 30,
    environment,
  });
  assert.equal(report.prospective_task_count, 3);
  assert.equal(report.historical_unknown_count, 1);
  assert.equal(report.open_stale_task_count, 1);

  const firstCode = report.outcomes.find((outcome) => outcome.kind === "first-code");
  assert.deepEqual(firstCode, {
    kind: "first-code",
    applicable_count: 3,
    known_count: 2,
    unknown_count: 1,
    not_applicable_count: 0,
    coverage: 2 / 3,
    median_ms: 5_400_000,
  });
  const operable = report.outcomes.find((outcome) => outcome.kind === "operable-flow");
  assert.equal(operable.applicable_count, 2);
  assert.equal(operable.not_applicable_count, 1);
  assert.equal(operable.known_count, 0);
  assert.equal(
    report.tasks.find((task) => task.task_id === second).outcomes["first-code"].evidence,
    "commit:earlier-time",
  );
  assert.equal(
    report.tasks.find((task) => task.task_id === missingStart).outcomes["first-code"].status,
    "unknown",
  );
  assert.equal(
    report.outcomes.find((outcome) => outcome.kind === "clean-review").known_count,
    0,
  );
});

test("excludes explicit pre-start and missing-start N/A markers from the denominator", (t) => {
  const { environment } = temporaryWorkflow(t);
  const preStart = createTask("Pre-start N/A", "headless", {
    clock: clock("2026-07-09T00:00:00.000Z"),
    environment,
  });
  markOutcome(preStart, "operable-flow", "docs/headless-pre.md", {
    clock: clock("2026-07-09T00:30:00.000Z"),
    environment,
    notApplicableReason: "headless before start",
    notApplicableRequested: true,
  });
  startTask(preStart, { clock: clock("2026-07-09T01:00:00.000Z"), environment });

  const missingStart = createTask("Missing-start N/A", "headless", {
    clock: clock("2026-07-10T00:00:00.000Z"),
    environment,
  });
  markOutcome(missingStart, "operable-flow", "docs/headless-missing.md", {
    clock: clock("2026-07-10T00:30:00.000Z"),
    environment,
    notApplicableReason: "headless without start",
    notApplicableRequested: true,
  });

  const report = buildOutcomeReport({
    clock: clock("2026-07-10T12:00:00.000Z"),
    days: 30,
    environment,
  });
  const operable = report.outcomes.find((outcome) => outcome.kind === "operable-flow");
  assert.equal(operable.applicable_count, 0);
  assert.equal(operable.not_applicable_count, 2);
  assert.equal(operable.unknown_count, 0);
  assert.equal(operable.coverage, null);
  assert.equal(report.tasks[0].outcomes["operable-flow"].status, "not-applicable");
  assert.equal(report.tasks[1].outcomes["operable-flow"].status, "not-applicable");
});

test("rejects incomplete schema-v1 task creation and start events", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const badCreated = "20260709-001-bad-created";
  const badStarted = "20260709-002-bad-started";
  writeTaskFile(paths, badCreated, "Bad created event");
  writeTaskFile(paths, badStarted, "Bad started event");
  for (const taskId of [badCreated, badStarted]) {
    fs.mkdirSync(path.join(paths.artifactsDir, taskId), { recursive: true });
  }
  fs.writeFileSync(
    taskRuntimeFile(paths, badCreated),
    `${JSON.stringify({
      schema_version: 1,
      event_id: "created-without-data",
      task_id: badCreated,
      kind: "task.created",
      occurred_at: "2026-07-09T00:00:00.000Z",
    })}\n`,
  );
  fs.writeFileSync(
    taskRuntimeFile(paths, badStarted),
    [
      {
        schema_version: 1,
        event_id: "valid-created",
        task_id: badStarted,
        kind: "task.created",
        occurred_at: "2026-07-09T00:00:00.000Z",
        data: {},
      },
      {
        schema_version: 1,
        event_id: "start-without-data",
        task_id: badStarted,
        kind: "task.started",
        occurred_at: "2026-07-09T01:00:00.000Z",
      },
      {
        schema_version: 1,
        event_id: "valid-outcome",
        task_id: badStarted,
        kind: "outcome.first-code",
        occurred_at: "2026-07-09T02:00:00.000Z",
        data: { evidence: "commit:bad-start", applicable: true },
      },
    ].map((row) => JSON.stringify(row)).join("\n") + "\n",
  );

  const report = buildOutcomeReport({
    clock: clock("2026-07-10T12:00:00.000Z"),
    days: 30,
    environment,
  });
  assert.equal(report.historical_unknown_count, 1);
  assert.equal(report.prospective_task_count, 1);
  assert.equal(report.tasks[0].task_id, badStarted);
  assert.equal(report.tasks[0].started_at, null);
  assert.equal(report.tasks[0].outcomes["first-code"].status, "unknown");
});

test("keeps historical and outside-window tasks out of latency samples", (t) => {
  const { environment } = temporaryWorkflow(t);
  const old = createTask("Old prospective", "outside", {
    clock: clock("2026-05-01T00:00:00.000Z"),
    environment,
  });
  archiveTask(old, "outside report window", {
    clock: clock("2026-05-02T00:00:00.000Z"),
    environment,
  });

  const report = buildOutcomeReport({
    clock: clock("2026-07-10T00:00:00.000Z"),
    days: 30,
    environment,
  });
  assert.equal(report.prospective_task_count, 0);
  assert.equal(report.outside_window_task_count, 1);
  assert.equal(report.historical_unknown_count, 0);
  assert.equal(report.outcomes[0].coverage, null);
  assert.equal(report.outcomes[0].median_ms, null);
});

test("renders Markdown with explicit unknown and not-applicable states", () => {
  const markdown = renderOutcomeMarkdown({
    schema_version: 1,
    generated_at: "2026-07-10T00:00:00.000Z",
    window_days: 30,
    stale_threshold_days: 7,
    prospective_task_count: 1,
    outside_window_task_count: 0,
    historical_unknown_count: 4,
    open_stale_task_count: 2,
    outcomes: [
      {
        kind: "first-code",
        applicable_count: 1,
        known_count: 0,
        unknown_count: 1,
        not_applicable_count: 0,
        coverage: 0,
        median_ms: null,
      },
      {
        kind: "operable-flow",
        applicable_count: 0,
        known_count: 0,
        unknown_count: 0,
        not_applicable_count: 1,
        coverage: null,
        median_ms: null,
      },
    ],
    tasks: [
      {
        task_id: "task-1",
        started_at: null,
        outcomes: {
          "first-code": { status: "unknown" },
          "operable-flow": { status: "not-applicable" },
          "clean-review": { status: "unknown" },
        },
      },
    ],
  });
  assert.match(markdown, /historical_unknown_tasks: 4/);
  assert.match(markdown, /\| operable-flow \| 0 \| 0 \| 0 \| 1 \| n\/a \| unknown \|/);
  assert.match(markdown, /\| task-1 \| unknown \| unknown \| not-applicable \| unknown \|/);
});

test("parses report options and calculates a standard median", () => {
  assert.deepEqual(parseReportArgs([]), { days: 30, json: false });
  assert.deepEqual(parseReportArgs(["--json", "--days=7"]), { days: 7, json: true });
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
  assert.throws(() => parseReportArgs(["--days", "0"]), /invalid days: 0/);
  assert.throws(
    () => parseReportArgs(["--json", "--json"]),
    (error) => error.message === REPORT_USAGE,
  );
});

test("outcome report CLI emits matching JSON and stable errors", (t) => {
  const { environment } = temporaryWorkflow(t);
  const now = new Date();
  const createdAt = new Date(now.getTime() - 60 * 60 * 1000);
  const startedAt = new Date(now.getTime() - 30 * 60 * 1000);
  const markedAt = new Date(now.getTime() - 10 * 60 * 1000);
  const taskId = createTask("Report CLI", "json", { clock: () => createdAt, environment });
  startTask(taskId, { clock: () => startedAt, environment });
  markOutcome(taskId, "clean-review", "review:clean", {
    clock: () => markedAt,
    environment,
  });

  const result = spawnSync(
    process.execPath,
    [CLI_PATH, "outcome-report", "--days", "1", "--json"],
    { encoding: "utf8", env: environment },
  );
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.prospective_task_count, 1);
  assert.equal(
    report.outcomes.find((outcome) => outcome.kind === "clean-review").median_ms,
    20 * 60 * 1000,
  );

  const invalid = spawnSync(
    process.execPath,
    [CLI_PATH, "outcome-report", "--days=0"],
    { encoding: "utf8", env: environment },
  );
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stderr, "invalid days: 0\n");
});
