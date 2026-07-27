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
  appendReconciliationAudit,
  readReconciliationAudit,
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

test("F2B: a different operation restores the latest committed projection before transition", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const options = { clock: clockAt("2026-07-27T10:01:30Z"), environment };
  const taskId = createTask("Event F2B", "restore before another command", options);

  assert.throws(
    () => startTask(taskId, {
      ...options,
      failAfterEventAppend: true,
      operationId: "start-f2b",
    }),
    /authoritative event committed but projection is inconsistent/,
  );
  assert.equal(readJsonObject(taskStateFile(paths, taskId)).status, "todo");

  blockTask(taskId, "continue from the committed start", {
    ...options,
    operationId: "block-f2b",
  });
  const events = eventRows(paths, taskId);
  const state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(events.length, 3);
  assert.equal(state.status, "blocked");
  assert.equal(state.runtime_revision, 3);
  assert.equal(state.last_event_id, events.at(-1).event_id);
});

test("R1-R7: replaying an old operation returns its result without rolling projection back", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const options = { clock: clockAt("2026-07-27T10:01:45Z"), environment };
  const taskId = createTask("Historical replay", "keep the latest projection", options);
  startTask(taskId, { ...options, operationId: "operation-a" });
  blockTask(taskId, "newer operation", { ...options, operationId: "operation-b" });
  const beforeReplay = snapshot(paths, taskId);
  const eventsBefore = eventRows(paths, taskId);
  assert.equal(fs.existsSync(paths.currentTaskFile), false);

  const replay = startTask(taskId, { ...options, operationId: "operation-a" });

  const state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(replay.replay, true);
  assert.equal(replay.latest, false);
  assert.equal(eventRows(paths, taskId).length, eventsBefore.length);
  assert.deepEqual(snapshot(paths, taskId), beforeReplay);
  assert.equal(state.status, "blocked");
  assert.equal(state.runtime_revision, eventsBefore.at(-1).revision);
  assert.equal(state.last_event_id, eventsBefore.at(-1).event_id);
  assert.equal(fs.existsSync(paths.currentTaskFile), false);
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
    reason: "restore the missing state projection",
    clock: clockAt("2026-07-27T10:03:30Z"),
    environment,
  });
  assert.equal(applied.status, "current");
  assert.deepEqual(fs.readFileSync(taskStateFile(paths, taskId)), expectedState);
  assert.equal(fs.readdirSync(path.join(paths.artifactsDir, taskId, "reconcile-backups")).length > 0, true);
  const audit = readReconciliationAudit(paths, taskId);
  assert.equal(audit.length, 2);
  assert.equal(audit[0].event_name, "reconciliation.prepared");
  assert.equal(audit[1].event_name, "reconciliation.applied");
  assert.equal(audit[1].prepared_audit_digest, audit[0].audit_digest);
  assert.equal(audit[1].authority_ref, "user-message:repair-f5");
  assert.equal(audit[1].reason, "restore the missing state projection");
  assert.equal(audit[1].restored_event_id, eventRows(paths, taskId).at(-1).event_id);
  assert.equal(audit[1].restored_revision, 2);
  assert.match(audit[1].previous_projection_digest, /^sha256:[a-f0-9]{64}$/);
  assert.match(audit[1].backup_manifest_digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(eventRows(paths, taskId).length, 2);

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
    reason: "restore the missing legacy projection row",
    clock: clockAt("2026-07-27T10:03:40Z"),
    environment,
  });
  assert.equal(repairedLegacy.status, "current");
  const repairedRow = fs.readFileSync(taskRuntimeFile(paths, taskId), "utf8")
    .trim().split("\n").map((line) => JSON.parse(line)).at(-1);
  assert.equal(repairedRow.derived_from_event_id, eventRows(paths, taskId).at(-1).event_id);
  assert.equal(readReconciliationAudit(paths, taskId).length, 4);
});

test("F5B: reconcile audit WAL prevents unaudited projection recovery", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const options = { clock: clockAt("2026-07-27T10:04:00Z"), environment };
  const taskId = createTask("Event F5B", "reconcile audit WAL", options);
  startTask(taskId, { ...options, operationId: "start-f5b" });
  const expectedState = fs.readFileSync(taskStateFile(paths, taskId));
  fs.unlinkSync(taskStateFile(paths, taskId));

  assert.throws(() => reconcileTaskRuntime(taskId, {
    apply: true,
    authorityRef: "user-message:repair-f5b",
    reason: "prepared audit must be durable first",
    appendAudit: () => { throw new Error("prepared audit write failed"); },
    environment,
  }), /prepared audit write failed/);
  assert.equal(fs.existsSync(taskStateFile(paths, taskId)), false);
  assert.deepEqual(readReconciliationAudit(paths, taskId), []);

  assert.throws(() => reconcileTaskRuntime(taskId, {
    apply: true,
    authorityRef: "user-message:repair-f5b",
    reason: "record an apply failure",
    applyProjection: () => { throw new Error("projection apply failed"); },
    environment,
  }), /projection apply failed/);
  assert.equal(fs.existsSync(taskStateFile(paths, taskId)), false);
  assert.deepEqual(
    readReconciliationAudit(paths, taskId).map((row) => row.event_name),
    ["reconciliation.prepared", "reconciliation.failed"],
  );

  assert.throws(() => reconcileTaskRuntime(taskId, {
    apply: true,
    authorityRef: "user-message:repair-f5b",
    reason: "simulate applied audit failure",
    appendAudit: (...args) => {
      if (args[2] === "reconciliation.applied") throw new Error("applied audit write failed");
      return appendReconciliationAudit(...args);
    },
    environment,
  }), /applied audit write failed/);
  assert.deepEqual(fs.readFileSync(taskStateFile(paths, taskId)), expectedState);
  assert.equal(reconcileTaskRuntime(taskId, { environment }).audit_incomplete, true);

  const recovered = reconcileTaskRuntime(taskId, {
    apply: true,
    authorityRef: "user-message:repair-f5b-retry",
    reason: "complete the prepared reconciliation audit",
    environment,
  });
  assert.equal(recovered.recovered_incomplete, true);
  assert.equal(readReconciliationAudit(paths, taskId).at(-1).event_name, "reconciliation.applied");
  assert.equal(eventRows(paths, taskId).length, 2);
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
