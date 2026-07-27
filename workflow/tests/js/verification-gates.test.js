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
const { resolvePaths } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/core/paths.js",
));
const { createTask } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/task/lifecycle.js",
));
const { taskFile } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/task/repository.js",
));
const { taskRuntimeFile, taskStateFile } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/task/runtime.js",
));
const {
  GATE_METRIC_USAGE,
  GATE_REPORT_USAGE,
  gateMetricsFile,
  parseGateMetricArgs,
  parseGateReportArgs,
  runGateMetric,
  runGateReport,
} = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/verification/gates.js",
));

function fixedClock() {
  return new Date("2026-07-10T10:00:00.000Z");
}

function temporaryWorkflow(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-verification-gates."));
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

function createFixtureTask(environment, title = "Gate metrics") {
  return createTask(title, "gate metric contract", {
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

test("appends a normalized metric without changing task or business state", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment);
  const file = taskFile(paths.tasksDir, taskId);
  const stateFile = taskStateFile(paths, taskId);
  const taskBefore = fs.readFileSync(file);
  const stateBefore = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  const result = runGateMetric(
    parseGateMetricArgs([
      taskId,
      "--gate",
      " ready ",
      "--action=used",
      "--reason",
      " manual verification ",
      "--duration-ms=0012",
    ]),
    { clock: fixedClock, environment },
  );

  const metricsFile = gateMetricsFile(paths);
  assert.deepEqual(result.lines, [
    `task_id: ${taskId}`,
    `metrics: ${metricsFile}`,
    "gate: ready",
    "action: used",
    "duration_ms: 12",
  ]);
  assert.deepEqual(JSON.parse(fs.readFileSync(metricsFile, "utf8")), {
    created_at: "2026-07-10T10:00:00Z",
    task_id: taskId,
    gate: "ready",
    action: "used",
    reason: "manual verification",
    duration_ms: 12,
  });
  assert.deepEqual(fs.readFileSync(file), taskBefore);
  const stateAfter = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  for (const key of ["runtime_revision", "last_event_id", "consistency"]) {
    delete stateBefore[key];
    delete stateAfter[key];
  }
  assert.deepEqual(stateAfter, stateBefore);
  const event = readEvents(paths, taskId).at(-1);
  assert.deepEqual({ kind: event.kind, detail: event.detail, created_at: event.created_at }, {
    kind: "gate-metric",
    detail: "ready used",
    created_at: "2026-07-10T10:00:00Z",
  });
  assert.equal(event.derived_from_schema, 2);
});

test("keeps optional duration and core metric diagnostics stable", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Gate validation");
  const result = runGateMetric(
    parseGateMetricArgs([
      taskId,
      "--gate=verify",
      "--action=skipped",
      "--reason=not needed locally",
    ]),
    { clock: fixedClock, environment },
  );
  assert.equal(result.lines.at(-1), "duration_ms: -");
  assert.equal(JSON.parse(fs.readFileSync(gateMetricsFile(paths), "utf8")).duration_ms, null);

  assert.throws(
    () =>
      runGateMetric(
        parseGateMetricArgs([
          taskId,
          "--gate=outside",
          "--action=used",
          "--reason=bad gate",
        ]),
        { clock: fixedClock, environment },
      ),
    /invalid gate: outside/,
  );
  assert.throws(
    () =>
      runGateMetric(
        parseGateMetricArgs([
          taskId,
          "--gate=verify",
          "--action=unknown",
          "--reason=bad action",
        ]),
        { clock: fixedClock, environment },
      ),
    /invalid action: unknown/,
  );
  assert.throws(
    () =>
      runGateMetric(
        parseGateMetricArgs([
          taskId,
          "--gate=verify",
          "--action=used",
          "--reason=duration",
          "--duration-ms=-1",
        ]),
        { clock: fixedClock, environment },
      ),
    /invalid duration-ms: -1/,
  );
  assert.throws(
    () =>
      runGateMetric(
        parseGateMetricArgs([taskId, "--gate=verify", "--action=used", "--reason= "]),
        { clock: fixedClock, environment },
      ),
    /invalid reason: must be non-empty/,
  );
  assert.throws(
    () => parseGateMetricArgs([taskId, "--gate=verify", "--action=used"]),
    /missing required argument: --reason/,
  );
});

test("reports the rolling window, sorted groups, counts, and integer median", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const metricsFile = gateMetricsFile(paths);
  fs.mkdirSync(path.dirname(metricsFile), { recursive: true });
  const rows = [
    { created_at: "2026-07-09T10:00:00Z", gate: "verify", action: "used", duration_ms: 1 },
    { created_at: "2026-07-10T09:00:00Z", gate: "verify", action: "used", duration_ms: 2 },
    { created_at: "2026-07-10T08:00:00Z", gate: "ready", action: "skipped", duration_ms: null },
    { created_at: "2026-07-10T07:00:00Z", gate: "ready", action: "failed", duration_ms: 4 },
    { created_at: "2026-07-11T10:00:00Z", gate: "ready", action: "used", duration_ms: 8 },
    { created_at: "2026-07-09T09:59:59Z", gate: "outside", action: "used", duration_ms: 99 },
  ];
  fs.writeFileSync(
    metricsFile,
    `${rows.map((row) => JSON.stringify(row)).join("\n")}\nnot-json\n`,
  );

  const result = runGateReport(parseGateReportArgs(["--days=1"]), {
    clock: fixedClock,
    environment,
  });
  assert.equal(
    result.output,
    [
      "# Gate Report",
      "",
      "Window: 1 day(s)",
      "Events: 5",
      "",
      "| Gate | Used | Skipped | Failed | Median Duration ms |",
      "| --- | ---: | ---: | ---: | ---: |",
      "| ready | 1 | 1 | 1 | 6 |",
      "| verify | 2 | 0 | 0 | 1 |",
      "",
    ].join("\n"),
  );
  assert.doesNotMatch(result.output, /outside/);
});

test("renders an empty report and rejects invalid days", (t) => {
  const { environment } = temporaryWorkflow(t);
  const result = runGateReport(parseGateReportArgs([]), {
    clock: fixedClock,
    environment,
  });
  assert.equal(
    result.output,
    [
      "# Gate Report",
      "",
      "Window: 30 day(s)",
      "Events: 0",
      "",
      "| Gate | Used | Skipped | Failed | Median Duration ms |",
      "| --- | ---: | ---: | ---: | ---: |",
      "",
    ].join("\n"),
  );
  assert.throws(() => parseGateReportArgs(["--days", "0"]), /invalid days: 0/);
  assert.throws(() => parseGateReportArgs(["--days=01"]), /invalid days: 01/);
  assert.throws(() => parseGateReportArgs(["--days"]), new RegExp(GATE_REPORT_USAGE));
});

test("public dispatcher preserves gate summaries and diagnostics", (t) => {
  const { environment } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Public gates");
  const metric = spawnSync(
    PUBLIC_BIN,
    [
      "gate-metric",
      taskId,
      "--gate",
      "feedback-cycle",
      "--action",
      "used",
      "--reason",
      "required row failed",
      "--duration-ms",
      "12",
    ],
    { encoding: "utf8", env: environment },
  );
  assert.equal(metric.status, 0, metric.stderr);
  assert.match(metric.stdout, /gate: feedback-cycle\naction: used\nduration_ms: 12\n$/);

  const report = spawnSync(PUBLIC_BIN, ["gate-report", "--days", "1"], {
    encoding: "utf8",
    env: environment,
  });
  assert.equal(report.status, 0, report.stderr);
  assert.match(report.stdout, /\| feedback-cycle \| 1 \| 0 \| 0 \| 12 \|/);

  const invalid = spawnSync(
    PUBLIC_BIN,
    ["gate-metric", taskId, "--gate", "unknown", "--action", "used", "--reason", "bad"],
    { encoding: "utf8", env: environment },
  );
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stderr, "invalid gate: unknown\n");

  const usage = spawnSync(PUBLIC_BIN, ["gate-metric"], {
    encoding: "utf8",
    env: environment,
  });
  assert.equal(usage.status, 1);
  assert.equal(usage.stderr, `${GATE_METRIC_USAGE}\n`);
});
