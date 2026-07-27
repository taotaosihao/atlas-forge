"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const test = require("node:test");

const WORKFLOW_ROOT = path.resolve(__dirname, "../..");
const CLI_PATH = path.join(WORKFLOW_ROOT, "bin/lib/codex-workflow/task/cli.js");
const TEMPLATE_PATH = path.join(WORKFLOW_ROOT, "templates/task.md");
const { resolvePaths } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/core/paths.js",
));
const {
  blockTask,
  createTask,
  startTask,
} = require(path.join(WORKFLOW_ROOT, "bin/lib/codex-workflow/task/lifecycle.js"));
const {
  taskEventFile,
} = require(path.join(WORKFLOW_ROOT, "bin/lib/codex-workflow/core/task-mutation.js"));
const {
  reconcileTaskRuntime,
} = require(path.join(WORKFLOW_ROOT, "bin/lib/codex-workflow/core/reconcile.js"));
const {
  readJsonObject,
  taskRuntimeFile,
  taskStateFile,
} = require(path.join(WORKFLOW_ROOT, "bin/lib/codex-workflow/task/runtime.js"));
const {
  parseVerifyArgs,
  runVerification,
} = require(path.join(WORKFLOW_ROOT, "bin/lib/codex-workflow/verification/runner.js"));

function clockAt(value) {
  return () => new Date(value);
}

function temporaryWorkflow(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-runtime-consistency."));
  const root = path.join(home, "workflow");
  const environment = {
    ...process.env,
    CODEX_HOME_ROOT: home,
    CODEX_WORKFLOW_ROOT: root,
    TMPDIR: path.join(home, "tmp"),
  };
  fs.mkdirSync(path.join(root, "templates"), { recursive: true });
  fs.copyFileSync(TEMPLATE_PATH, path.join(root, "templates", "task.md"));
  t.after(() => fs.rmSync(home, { force: true, recursive: true }));
  return { environment, paths: resolvePaths(environment) };
}

function eventRows(paths, taskId) {
  return fs.readFileSync(taskEventFile(paths, taskId), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

function snapshot(paths, taskId) {
  return {
    task: fs.readFileSync(path.join(paths.tasksDir, `${taskId}.md`)),
    state: fs.readFileSync(taskStateFile(paths, taskId)),
    runtime: fs.readFileSync(taskRuntimeFile(paths, taskId)),
    events: fs.readFileSync(taskEventFile(paths, taskId)),
  };
}

function spawnCli(environment, ...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], { env: environment });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stderr }));
  });
}

test("F1: failure before authoritative append leaves every projection unchanged", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const options = { clock: clockAt("2026-07-27T10:00:00Z"), environment };
  const taskId = createTask("Event F1", "append is the commit point", options);
  const before = snapshot(paths, taskId);

  assert.throws(
    () => startTask(taskId, {
      ...options,
      failBeforeEventAppend: true,
      operationId: "start-f1",
    }),
    /injected failure before authoritative event append/,
  );
  assert.deepEqual(snapshot(paths, taskId), before);
});

test("F1: verification records also remain absent before authoritative append", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const options = { clock: clockAt("2026-07-27T10:00:30Z"), environment };
  const taskId = createTask("Verification F1", "records follow the event", options);
  const before = snapshot(paths, taskId);
  const verificationDir = path.join(paths.artifactsDir, taskId, "verification");

  assert.throws(
    () => runVerification(
      parseVerifyArgs([taskId, "--", process.execPath, "-e", "process.exit(0)"]),
      {
        ...options,
        failBeforeEventAppend: true,
        operationId: "verify-f1",
        recordToken: "20260727T100030000000000",
      },
    ),
    /injected failure before authoritative event append/,
  );
  assert.deepEqual(snapshot(paths, taskId), before);
  assert.deepEqual(fs.readdirSync(verificationDir), []);
});

test("F2/F3: durable event replays projection and same operation is idempotent", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const options = { clock: clockAt("2026-07-27T10:01:00Z"), environment };
  const taskId = createTask("Event F2", "replay after projection failure", options);
  const before = snapshot(paths, taskId);

  assert.throws(
    () => startTask(taskId, {
      ...options,
      failAfterEventAppend: true,
      operationId: "start-f2",
    }),
    /authoritative event committed but projection is inconsistent/,
  );
  assert.deepEqual(fs.readFileSync(path.join(paths.tasksDir, `${taskId}.md`)), before.task);
  assert.deepEqual(fs.readFileSync(taskStateFile(paths, taskId)), before.state);
  assert.deepEqual(fs.readFileSync(taskRuntimeFile(paths, taskId)), before.runtime);
  assert.equal(eventRows(paths, taskId).length, 2);

  startTask(taskId, { ...options, operationId: "start-f2" });
  assert.equal(eventRows(paths, taskId).length, 2);
  assert.equal(readJsonObject(taskStateFile(paths, taskId)).status, "doing");
  const afterReplay = snapshot(paths, taskId);
  startTask(taskId, { ...options, operationId: "start-f2" });
  assert.deepEqual(snapshot(paths, taskId), afterReplay);
  const derived = fs.readFileSync(taskRuntimeFile(paths, taskId), "utf8")
    .trim().split("\n").map((line) => JSON.parse(line)).at(-1);
  assert.equal(derived.derived_from_schema, 2);
  assert.equal(derived.derived_from_event_id, eventRows(paths, taskId).at(-1).event_id);
  assert.equal(derived.authoritative_event_id, derived.derived_from_event_id);
});

test("F4: one operation id with a different payload fails before mutation", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const options = { clock: clockAt("2026-07-27T10:02:00Z"), environment };
  const taskId = createTask("Event F4", "operation identity", options);
  startTask(taskId, { ...options, operationId: "shared-operation" });
  const before = snapshot(paths, taskId);

  assert.throws(
    () => blockTask(taskId, "different payload", {
      ...options,
      operationId: "shared-operation",
    }),
    /operation_id replay payload conflict: shared-operation/,
  );
  assert.deepEqual(snapshot(paths, taskId), before);

  const events = eventRows(paths, taskId);
  events.at(-1).projection.state.status = "blocked";
  fs.writeFileSync(
    taskEventFile(paths, taskId),
    `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
  );
  assert.throws(
    () => reconcileTaskRuntime(taskId, { environment }),
    /authoritative event record digest mismatch/,
  );
});

test("F5: reconcile is dry-run by default and authority-gated apply rebuilds projection", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const options = { clock: clockAt("2026-07-27T10:03:00Z"), environment };
  const taskId = createTask("Event F5", "reconcile projection", options);
  startTask(taskId, { ...options, operationId: "start-f5" });
  const expectedState = fs.readFileSync(taskStateFile(paths, taskId));
  fs.unlinkSync(taskStateFile(paths, taskId));

  const dryRun = reconcileTaskRuntime(taskId, { environment });
  assert.equal(dryRun.status, "missing");
  assert.equal(fs.existsSync(taskStateFile(paths, taskId)), false);
  assert.throws(
    () => reconcileTaskRuntime(taskId, { apply: true, environment }),
    /reconcile --apply requires authority_ref/,
  );
  const applied = reconcileTaskRuntime(taskId, {
    apply: true,
    authorityRef: "user-message:repair-f5",
    clock: clockAt("2026-07-27T10:03:30Z"),
    environment,
  });
  assert.equal(applied.status, "current");
  assert.deepEqual(fs.readFileSync(taskStateFile(paths, taskId)), expectedState);
  assert.equal(fs.readdirSync(path.join(paths.artifactsDir, taskId, "reconcile-backups")).length > 0, true);

  const runtimeRows = fs.readFileSync(taskRuntimeFile(paths, taskId), "utf8")
    .trim().split("\n").map((line) => JSON.parse(line));
  runtimeRows.pop();
  fs.writeFileSync(
    taskRuntimeFile(paths, taskId),
    `${runtimeRows.map((row) => JSON.stringify(row)).join("\n")}\n`,
  );
  assert.equal(reconcileTaskRuntime(taskId, { environment }).status, "behind");
  const repairedLegacy = reconcileTaskRuntime(taskId, {
    apply: true,
    authorityRef: "user-message:repair-derived-f5",
    clock: clockAt("2026-07-27T10:03:40Z"),
    environment,
  });
  assert.equal(repairedLegacy.status, "current");
  const repairedRow = fs.readFileSync(taskRuntimeFile(paths, taskId), "utf8")
    .trim().split("\n").map((line) => JSON.parse(line)).at(-1);
  assert.equal(repairedRow.derived_from_event_id, eventRows(paths, taskId).at(-1).event_id);
});

test("F6: concurrent start operations serialize to one legal revision", async (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const options = { clock: clockAt("2026-07-27T10:04:00Z"), environment };
  const taskId = createTask("Event F6", "concurrent revision", options);
  const concurrentEnvironment = {
    ...environment,
    CODEX_WORKFLOW_TEST_MUTATION_PAUSE_AFTER_OBSERVE: "0.15",
  };

  const [first, second] = await Promise.all([
    spawnCli(concurrentEnvironment, "start", taskId),
    spawnCli(concurrentEnvironment, "start", taskId),
  ]);
  assert.deepEqual([first.status, second.status].sort(), [0, 1]);
  assert.match(`${first.stderr}${second.stderr}`, /stale task revision|task already doing/);
  const events = eventRows(paths, taskId);
  assert.deepEqual(events.map((event) => event.revision), [1, 2]);
  assert.equal(events[1].last_event_id, events[0].event_id);
  assert.equal(readJsonObject(taskStateFile(paths, taskId)).runtime_revision, 2);
});
