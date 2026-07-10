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
const { createTask, startTask } = require(path.resolve(
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
const { MARK_USAGE, parseMarkArgs } = require(CLI_PATH);

function temporaryWorkflow(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-outcome-marker."));
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

function rows(paths, taskId) {
  return fs
    .readFileSync(taskRuntimeFile(paths, taskId), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

test("records an evidence-bound first-code event", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createTask("Outcome marker", "marker", {
    clock: clock("2026-07-10T01:00:00.000Z"),
    environment,
  });
  startTask(taskId, { clock: clock("2026-07-10T02:00:00.000Z"), environment });

  const event = markOutcome(taskId, "first-code", "commit:abc123", {
    clock: clock("2026-07-10T03:00:00.000Z"),
    environment,
    eventId: () => "outcome-event",
  });

  assert.deepEqual(event, {
    schema_version: 1,
    event_id: "outcome-event",
    task_id: taskId,
    kind: "outcome.first-code",
    occurred_at: "2026-07-10T03:00:00.000Z",
    data: { evidence: "commit:abc123", applicable: true },
  });
  assert.deepEqual(rows(paths, taskId).at(-1), event);
});

test("records explicit not-applicable markers and keeps duplicate events", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createTask("Headless marker", "not applicable", {
    clock: clock("2026-07-10T01:00:00.000Z"),
    environment,
  });

  markOutcome(taskId, "operable-flow", "docs/contract.md", {
    clock: clock("2026-07-10T02:00:00.000Z"),
    environment,
    notApplicableReason: "headless CLI",
    notApplicableRequested: true,
  });
  markOutcome(taskId, "operable-flow", "verification/second.md", {
    clock: clock("2026-07-10T03:00:00.000Z"),
    environment,
  });

  const outcomes = rows(paths, taskId).filter((row) => row.kind === "outcome.operable-flow");
  assert.equal(outcomes.length, 2);
  assert.deepEqual(outcomes[0].data, {
    evidence: "docs/contract.md",
    applicable: false,
    not_applicable_reason: "headless CLI",
  });
  assert.equal(outcomes[1].data.applicable, true);
});

test("rejects invalid kinds, empty evidence, and empty not-applicable reasons", (t) => {
  const { environment } = temporaryWorkflow(t);
  const taskId = createTask("Invalid outcome", "validation", { environment });

  assert.throws(
    () => markOutcome(taskId, "speed", "commit:abc", { environment }),
    /invalid outcome kind: speed/,
  );
  assert.throws(
    () => markOutcome(taskId, "first-code", " ", { environment }),
    /outcome evidence must be a single non-empty line/,
  );
  assert.throws(
    () =>
      markOutcome(taskId, "operable-flow", "docs/contract.md", {
        environment,
        notApplicableReason: "",
        notApplicableRequested: true,
      }),
    /not-applicable reason must be a single non-empty line/,
  );
});

test("parses marker options and preserves usage failures", () => {
  assert.deepEqual(
    parseMarkArgs([
      "task-1",
      "--kind=clean-review",
      "--evidence",
      "review.md",
      "--not-applicable=headless",
    ]),
    {
      taskId: "task-1",
      kind: "clean-review",
      evidence: "review.md",
      notApplicableReason: "headless",
      notApplicableRequested: true,
    },
  );
  assert.throws(
    () => parseMarkArgs([]),
    (error) => error.message === MARK_USAGE,
  );
  assert.throws(() => parseMarkArgs(["task-1", "--kind", "first-code"]), /--evidence/);
});

test("outcome marker CLI emits one structured result and stable diagnostics", (t) => {
  const { environment } = temporaryWorkflow(t);
  const taskId = createTask("Outcome CLI", "public CLI", { environment });
  const marked = spawnSync(
    process.execPath,
    [CLI_PATH, "outcome-mark", taskId, "--kind", "clean-review", "--evidence", "review.md"],
    { encoding: "utf8", env: environment },
  );
  assert.equal(marked.status, 0, marked.stderr);
  assert.match(marked.stdout, new RegExp(`^task_id: ${taskId}$`, "m"));
  assert.match(marked.stdout, /^event: outcome\.clean-review$/m);
  assert.match(marked.stdout, /^applicable: true$/m);

  const invalid = spawnSync(
    process.execPath,
    [CLI_PATH, "outcome-mark", taskId, "--kind", "unknown", "--evidence", "x"],
    { encoding: "utf8", env: environment },
  );
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stderr, "invalid outcome kind: unknown\n");
});
