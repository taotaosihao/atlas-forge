"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const test = require("node:test");

const CLI_PATH = path.resolve(__dirname, "../../bin/lib/codex-workflow/task/cli.js");
const TEMPLATE_PATH = path.resolve(__dirname, "../../templates/task.md");
const { resolvePaths } = require(path.resolve(
  __dirname,
  "../../bin/lib/codex-workflow/core/paths.js",
));
const {
  archiveTask,
  blockTask,
  completeTask,
  createTask,
  resumeTask,
  staleTasks,
  startTask,
} = require(path.resolve(__dirname, "../../bin/lib/codex-workflow/task/lifecycle.js"));
const { updateTaskFields, validateTaskFile } = require(path.resolve(
  __dirname,
  "../../bin/lib/codex-workflow/task/repository.js",
));
const { taskRuntimeFile, taskStateFile } = require(path.resolve(
  __dirname,
  "../../bin/lib/codex-workflow/task/runtime.js",
));
const { prepareTaskCommand } = require(path.resolve(
  __dirname,
  "../../bin/lib/codex-workflow/core/command-runtime.js",
));

function temporaryWorkflow(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-task-lifecycle."));
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
  return { environment, home, paths: resolvePaths(environment), root };
}

function fixedClock(value) {
  return () => new Date(value);
}

function readEvents(paths, taskId) {
  return fs
    .readFileSync(taskRuntimeFile(paths, taskId), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

function spawnCli(environment, ...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], { env: environment });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stderr, stdout }));
  });
}

test("creates a task, state projection, scaffold, and schema-v1 event in JavaScript", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const clock = fixedClock("2026-07-10T02:03:04.567Z");
  const taskId = createTask("20260709-003-纯中文任务", "keeper behavior", {
    clock,
    environment,
    eventId: () => "event-created",
  });

  assert.equal(taskId, "20260710-001-u-aef88ab23da7");
  const file = path.join(paths.tasksDir, `${taskId}.md`);
  const { task } = validateTaskFile(file);
  assert.deepEqual(task, {
    id: taskId,
    title: "20260709-003-纯中文任务",
    status: "todo",
    created: "2026-07-10",
    updated: "2026-07-10",
  });
  assert.match(fs.readFileSync(file, "utf8"), /## Success Criteria\nkeeper behavior/);
  assert.equal(fs.existsSync(path.join(paths.artifactsDir, taskId, "context.md")), true);
  assert.equal(JSON.parse(fs.readFileSync(taskStateFile(paths, taskId), "utf8")).status, "todo");
  assert.deepEqual(readEvents(paths, taskId), [
    {
      schema_version: 1,
      event_id: "event-created",
      task_id: taskId,
      kind: "task.created",
      occurred_at: "2026-07-10T02:03:04.567Z",
      data: { from: null, to: "todo" },
    },
  ]);
});

test("serializes parallel init-task calls and removes the init lock", async (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const concurrentEnvironment = {
    ...environment,
    CODEX_WORKFLOW_TEST_INIT_PAUSE_BEFORE_WRITE: "0.1",
  };

  const [first, second] = await Promise.all([
    spawnCli(concurrentEnvironment, "init-task", "Parallel task", "first"),
    spawnCli(concurrentEnvironment, "init-task", "Parallel task", "second"),
  ]);

  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.notEqual(first.stdout, second.stdout);
  assert.equal(fs.readdirSync(paths.tasksDir).filter((name) => name.endsWith(".md")).length, 2);
  assert.equal(fs.existsSync(`${paths.initTaskLockFile}.dir`), false);
  assert.deepEqual(
    fs.readdirSync(paths.tasksDir).filter((name) => name.endsWith(".tmp")),
    [],
  );
});

test("runs todo-doing-blocked-doing-done with pointer and reason projections", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const clock = fixedClock("2026-07-10T04:05:06.789Z");
  let eventNumber = 0;
  const options = {
    clock,
    environment,
    eventId: () => `event-${++eventNumber}`,
  };
  const taskId = createTask("Lifecycle", "all states", options);

  startTask(taskId, options);
  assert.equal(validateTaskFile(path.join(paths.tasksDir, `${taskId}.md`)).task.status, "doing");
  assert.equal(JSON.parse(fs.readFileSync(paths.currentTaskFile, "utf8")).task_id, taskId);

  blockTask(taskId, "waiting for local dependency", options);
  let state = JSON.parse(fs.readFileSync(taskStateFile(paths, taskId), "utf8"));
  assert.equal(state.status, "blocked");
  assert.equal(state.blocked_reason, "waiting for local dependency");
  assert.equal(fs.existsSync(paths.currentTaskFile), false);

  resumeTask(taskId, options);
  assert.equal(JSON.parse(fs.readFileSync(paths.currentTaskFile, "utf8")).task_id, taskId);
  state = JSON.parse(fs.readFileSync(taskStateFile(paths, taskId), "utf8"));
  state.last_verified_at = "2026-07-10T04:05:06Z";
  state.verification = { last_exit_code: "0" };
  fs.writeFileSync(taskStateFile(paths, taskId), `${JSON.stringify(state, null, 2)}\n`);
  updateTaskFields(path.join(paths.tasksDir, `${taskId}.md`), {
    last_verified_at: "2026-07-10T04:05:06Z",
  });

  completeTask(taskId, options);
  assert.equal(validateTaskFile(path.join(paths.tasksDir, `${taskId}.md`)).task.status, "done");
  assert.equal(fs.existsSync(paths.currentTaskFile), false);
  assert.deepEqual(
    readEvents(paths, taskId).map((event) => event.kind),
    ["task.created", "task.started", "task.blocked", "task.resumed", "task.done"],
  );
});

test("keeps the done verification gate and records an explicit skip", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const clock = fixedClock("2026-07-10T05:00:00.000Z");
  const options = { clock, environment };
  const taskId = createTask("Done gate", "verification", options);
  startTask(taskId, options);

  assert.throws(
    () => completeTask(taskId, options),
    /task lacks successful workflow verification/,
  );
  assert.equal(validateTaskFile(path.join(paths.tasksDir, `${taskId}.md`)).task.status, "doing");
  assert.throws(
    () =>
      completeTask(taskId, {
        ...options,
        noVerifyReason: " ",
        noVerifyRequested: true,
      }),
    /unsafe no-verify reason/,
  );

  completeTask(taskId, {
    ...options,
    noVerifyReason: "self-use manual check",
    noVerifyRequested: true,
  });
  const state = JSON.parse(fs.readFileSync(taskStateFile(paths, taskId), "utf8"));
  assert.equal(state.verification.skipped, true);
  assert.equal(state.verification.skip_reason, "self-use manual check");
  assert.deepEqual(
    readEvents(paths, taskId).slice(-2).map((event) => event.kind),
    ["verification.skipped", "task.done"],
  );
});

test("resume and done do not interpret admission-shaped task state", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const clock = fixedClock("2026-07-10T05:30:00.000Z");
  const options = { clock, environment };
  const taskId = createTask("Admission-independent lifecycle", "lifecycle only", options);
  startTask(taskId, options);
  blockTask(taskId, "pause before lifecycle characterization", options);

  const stateFile = taskStateFile(paths, taskId);
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  state.severity = "Critical";
  state.admission = { disposition: "visible-follow-up", repair_status: "open" };
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);

  resumeTask(taskId, options);
  completeTask(taskId, {
    ...options,
    noVerifyRequested: true,
    noVerifyReason: "characterize lifecycle without changing admission semantics",
  });

  const completed = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  assert.equal(completed.status, "done");
  assert.equal(completed.severity, "Critical");
  assert.deepEqual(completed.admission, {
    disposition: "visible-follow-up",
    repair_status: "open",
  });
});

test("archives without verification, preserves durable files, and conditionally clears pointer", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const options = { clock: fixedClock("2026-07-10T06:00:00.000Z"), environment };
  const first = createTask("First active", "first", options);
  const second = createTask("Second active", "second", options);
  startTask(first, options);
  startTask(second, options);
  const sentinel = path.join(paths.artifactsDir, first, "keep.txt");
  fs.writeFileSync(sentinel, "keep\n");

  archiveTask(first, "superseded", options);
  assert.equal(validateTaskFile(path.join(paths.tasksDir, `${first}.md`)).task.status, "archived");
  assert.equal(fs.readFileSync(sentinel, "utf8"), "keep\n");
  assert.equal(JSON.parse(fs.readFileSync(paths.currentTaskFile, "utf8")).task_id, second);
  assert.match(
    fs.readFileSync(path.join(paths.tasksDir, `${first}.md`), "utf8"),
    /^archived_reason: superseded$/m,
  );
});

test("reports stale open tasks without mutating task or artifact files", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const oldOptions = { clock: fixedClock("2026-06-01T00:00:00.000Z"), environment };
  const recentOptions = { clock: fixedClock("2026-07-09T00:00:00.000Z"), environment };
  const old = createTask("Old structured", "old", oldOptions);
  const recent = createTask("Recent structured", "recent", recentOptions);
  const legacyId = "20260501-001-legacy";
  const legacyFile = path.join(paths.tasksDir, `${legacyId}.md`);
  fs.writeFileSync(
    legacyFile,
    [
      `id: ${legacyId}`,
      "title: Legacy",
      "status: blocked",
      "created: 2026-05-01",
      "updated: 2026-05-02",
      "",
      "## Success Criteria",
      "legacy",
      "",
    ].join("\n"),
  );
  const before = new Map(
    [old, recent, legacyId].map((taskId) => [
      taskId,
      fs.readFileSync(path.join(paths.tasksDir, `${taskId}.md`), "utf8"),
    ]),
  );

  const stale = staleTasks(7, {
    clock: fixedClock("2026-07-10T12:00:00.000Z"),
    environment,
  });
  assert.deepEqual(
    stale.map(({ id, source }) => ({ id, source })),
    [
      { id: legacyId, source: "legacy-date" },
      { id: old, source: "event" },
    ],
  );
  for (const [taskId, content] of before) {
    assert.equal(fs.readFileSync(path.join(paths.tasksDir, `${taskId}.md`), "utf8"), content);
  }
});

test("rejects corrupt task state before lifecycle or command preparation writes", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const options = { clock: fixedClock("2026-07-10T13:00:00.000Z"), environment };
  const corruptValues = ['{"active_team":', "[]", "null"];

  for (const [index, corrupt] of corruptValues.entries()) {
    const taskId = createTask(`Corrupt state ${index}`, "must fail closed", options);
    const taskPath = path.join(paths.tasksDir, `${taskId}.md`);
    const statePath = taskStateFile(paths, taskId);
    const runtimePath = taskRuntimeFile(paths, taskId);
    fs.writeFileSync(statePath, corrupt);
    const before = {
      task: fs.readFileSync(taskPath),
      state: fs.readFileSync(statePath),
      runtime: fs.readFileSync(runtimePath),
    };

    assert.throws(
      () => startTask(taskId, options),
      new RegExp(`corrupt task state: .*${taskId}.*state\\.json`),
    );
    assert.deepEqual(fs.readFileSync(taskPath), before.task);
    assert.deepEqual(fs.readFileSync(statePath), before.state);
    assert.deepEqual(fs.readFileSync(runtimePath), before.runtime);
    assert.throws(
      () => prepareTaskCommand(paths, taskId, options.clock),
      new RegExp(`corrupt task state: .*${taskId}.*state\\.json`),
    );
    assert.deepEqual(fs.readFileSync(taskPath), before.task);
    assert.deepEqual(fs.readFileSync(statePath), before.state);
    assert.deepEqual(fs.readFileSync(runtimePath), before.runtime);
  }
});
