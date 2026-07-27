"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const test = require("node:test");

const CLI_PATH = path.resolve(__dirname, "../../bin/lib/codex-workflow/task/cli.js");
const TEMPLATE_PATH = path.resolve(__dirname, "../../templates/task.md");
const { parseDoneArgs } = require(CLI_PATH);
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
const { validateTaskFile } = require(path.resolve(
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
const {
  parseVerifyArgs,
  runVerification,
} = require(path.resolve(
  __dirname,
  "../../bin/lib/codex-workflow/verification/runner.js",
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

function recordPassingVerification(environment, taskId, clock, options = {}) {
  return runVerification(
    parseVerifyArgs([
      taskId,
      "--outcome=passed",
      "--",
      process.execPath,
      "-e",
      "process.exit(0)",
    ]),
    {
      clock,
      environment,
      recordToken: options.recordToken || "20260710T040506000000000",
      ...(options.cwd ? { cwd: options.cwd } : {}),
    },
  );
}

function v2Team(overrides = {}) {
  return {
    schema_version: 2,
    team_run_id: "run-0001",
    generation: 1,
    mode: "execute",
    status: "complete",
    lanes: [{ lane_id: "implementation", status: "closed" }],
    dispatches: [{
      dispatch_id: "implementation-dispatch",
      lane_id: "implementation",
      status: "closed",
    }],
    attempts: [{
      attempt_id: "implementation-attempt",
      dispatch_id: "implementation-dispatch",
      lane_id: "implementation",
      status: "quiesced",
    }],
    writer_leases: [{
      lease_id: "lease-implementation-attempt",
      owner_attempt_id: "implementation-attempt",
      state: "released",
    }],
    ...overrides,
  };
}

function replaceTeam(paths, taskId, team) {
  const file = taskStateFile(paths, taskId);
  const state = JSON.parse(fs.readFileSync(file, "utf8"));
  state.active_team = team;
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
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
  const [createdEvent] = readEvents(paths, taskId);
  assert.deepEqual(
    {
      schema_version: createdEvent.schema_version,
      task_id: createdEvent.task_id,
      kind: createdEvent.kind,
      occurred_at: createdEvent.occurred_at,
      data: createdEvent.data,
    },
    {
      schema_version: 1,
      task_id: taskId,
      kind: "task.created",
      occurred_at: "2026-07-10T02:03:04.567Z",
      data: { from: null, to: "todo" },
    },
  );
  assert.equal(createdEvent.event_id, "legacy-event-created");
  assert.equal(createdEvent.authoritative_event_id, "event-created");
  assert.equal(createdEvent.derived_from_event_id, "event-created");
  assert.equal(createdEvent.derived_from_schema, 2);
  assert.equal(createdEvent.revision, 1);
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
  recordPassingVerification(environment, taskId, clock);

  completeTask(taskId, options);
  assert.equal(validateTaskFile(path.join(paths.tasksDir, `${taskId}.md`)).task.status, "done");
  assert.equal(fs.existsSync(paths.currentTaskFile), false);
  state = JSON.parse(fs.readFileSync(taskStateFile(paths, taskId), "utf8"));
  assert.equal(state.completion.outcome, "succeeded");
  assert.match(state.completion.verification_record_id, /^sha256:[a-f0-9]{64}$/);
  assert.match(state.completion.verification_identity_digest, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(
    readEvents(paths, taskId).map((event) => event.kind),
    ["task.created", "task.started", "task.blocked", "task.resumed", "verify", "task.done"],
  );
});

test("parses succeeded and explicit non-success completion options", () => {
  assert.deepEqual(parseDoneArgs(["task-1"]), {
    authorityRef: "",
    evidenceRefs: [],
    noVerifyReason: "",
    noVerifyRequested: false,
    outcome: "succeeded",
    taskId: "task-1",
  });
  assert.deepEqual(
    parseDoneArgs([
      "task-2",
      "--outcome=failed",
      "--authority-ref",
      "user-message:stop",
      "--evidence-ref=team/failure.md",
      "--evidence-ref",
      "log://failure",
      "--no-verify=command unavailable",
    ]),
    {
      authorityRef: "user-message:stop",
      evidenceRefs: ["team/failure.md", "log://failure"],
      noVerifyReason: "command unavailable",
      noVerifyRequested: true,
      outcome: "failed",
      taskId: "task-2",
    },
  );
  assert.throws(
    () => parseDoneArgs(["task-3", "--outcome=failed", "--outcome=cancelled"]),
    /usage: codex-workflow done/,
  );
});

test("keeps the done verification gate and rejects no-verify for succeeded completion", (t) => {
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

  assert.throws(
    () => completeTask(taskId, {
      ...options,
      noVerifyReason: "self-use manual check",
      noVerifyRequested: true,
    }),
    /no-verify cannot complete a succeeded task/,
  );
  assert.equal(validateTaskFile(path.join(paths.tasksDir, `${taskId}.md`)).task.status, "doing");
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
  recordPassingVerification(environment, taskId, clock, {
    recordToken: "20260710T053000000000000",
  });
  completeTask(taskId, options);

  const completed = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  assert.equal(completed.status, "done");
  assert.equal(completed.severity, "Critical");
  assert.deepEqual(completed.admission, {
    disposition: "visible-follow-up",
    repair_status: "open",
  });
});

test("rejects succeeded completion while a Team is active", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const clock = fixedClock("2026-07-10T05:40:00.000Z");
  const options = { clock, environment };
  const taskId = createTask("Active Team gate", "Team must finish", options);
  startTask(taskId, options);
  recordPassingVerification(environment, taskId, clock, {
    recordToken: "20260710T054000000000000",
  });
  replaceTeam(paths, taskId, v2Team({
    status: "running",
    lanes: [],
    dispatches: [],
    attempts: [],
    writer_leases: [],
  }));
  const stateBefore = fs.readFileSync(taskStateFile(paths, taskId));
  const runtimeBefore = fs.readFileSync(taskRuntimeFile(paths, taskId));

  assert.throws(
    () => completeTask(taskId, options),
    /Team is not terminal for succeeded completion: running/,
  );
  assert.equal(validateTaskFile(path.join(paths.tasksDir, `${taskId}.md`)).task.status, "doing");
  assert.deepEqual(fs.readFileSync(taskStateFile(paths, taskId)), stateBefore);
  assert.deepEqual(fs.readFileSync(taskRuntimeFile(paths, taskId)), runtimeBefore);
  assert.equal(readEvents(paths, taskId).some((event) => event.kind === "task.done"), false);
});

test("rejects succeeded completion for every non-quiesced attempt state", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const clock = fixedClock("2026-07-10T05:45:00.000Z");
  const options = { clock, environment };

  for (const [index, status] of ["reserved", "bound", "running", "terminal"].entries()) {
    const taskId = createTask(`Attempt ${status}`, "attempt must quiesce", options);
    startTask(taskId, options);
    recordPassingVerification(environment, taskId, clock, {
      recordToken: `20260710T05450000000000${index}`,
    });
    replaceTeam(paths, taskId, v2Team({
      attempts: [{
        attempt_id: "implementation-attempt",
        dispatch_id: "implementation-dispatch",
        lane_id: "implementation",
        status,
      }],
      writer_leases: [],
    }));

    assert.throws(
      () => completeTask(taskId, options),
      new RegExp(`Team attempt is not quiesced: implementation-attempt=${status}`),
    );
    assert.equal(validateTaskFile(path.join(paths.tasksDir, `${taskId}.md`)).task.status, "doing");
  }
});

test("rejects succeeded completion while a writer lease remains active", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const clock = fixedClock("2026-07-10T05:50:00.000Z");
  const options = { clock, environment };
  const taskId = createTask("Writer lease gate", "lease must release", options);
  startTask(taskId, options);
  recordPassingVerification(environment, taskId, clock, {
    recordToken: "20260710T055000000000000",
  });
  replaceTeam(paths, taskId, v2Team({
    writer_leases: [{
      lease_id: "lease-implementation-attempt",
      owner_attempt_id: "implementation-attempt",
      state: "active",
    }],
  }));

  assert.throws(
    () => completeTask(taskId, options),
    /Team writer lease is not released: lease-implementation-attempt=active/,
  );
  assert.equal(validateTaskFile(path.join(paths.tasksDir, `${taskId}.md`)).task.status, "doing");
});

test("rejects succeeded completion while a Team lane or dispatch remains open", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const clock = fixedClock("2026-07-10T05:52:00.000Z");
  const options = { clock, environment };
  const cases = [
    {
      label: "lane",
      team: v2Team({ lanes: [{ lane_id: "implementation", status: "open" }] }),
      expected: /Team lane is not closed: implementation=open/,
    },
    {
      label: "dispatch",
      team: v2Team({
        dispatches: [{
          dispatch_id: "implementation-dispatch",
          lane_id: "implementation",
          status: "open",
        }],
      }),
      expected: /Team dispatch is not closed: implementation-dispatch=open/,
    },
  ];

  for (const [index, fixture] of cases.entries()) {
    const taskId = createTask(`Open Team ${fixture.label}`, "all Team work must close", options);
    startTask(taskId, options);
    recordPassingVerification(environment, taskId, clock, {
      recordToken: `20260710T05520000000000${index}`,
    });
    replaceTeam(paths, taskId, fixture.team);
    assert.throws(() => completeTask(taskId, options), fixture.expected);
    assert.equal(validateTaskFile(path.join(paths.tasksDir, `${taskId}.md`)).task.status, "doing");
  }
});

test("requires a current passed verification identity for succeeded completion", (t) => {
  const { environment, home, paths } = temporaryWorkflow(t);
  const clock = fixedClock("2026-07-10T05:55:00.000Z");
  const options = { clock, environment };
  const repo = path.join(home, "repo");
  fs.mkdirSync(repo);
  const git = (...args) => {
    const result = require("child_process").spawnSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
  };
  git("init", "-q");
  git("config", "user.name", "Atlas Test");
  git("config", "user.email", "atlas@example.invalid");
  fs.writeFileSync(path.join(repo, "input.txt"), "verified\n");
  git("add", "input.txt");
  git("commit", "-qm", "fixture");

  const taskId = createTask("Verification identity", "current snapshot", options);
  startTask(taskId, options);
  recordPassingVerification(environment, taskId, clock, {
    cwd: repo,
    recordToken: "20260710T055500000000000",
  });
  fs.writeFileSync(path.join(repo, "input.txt"), "changed after verification\n");

  assert.throws(
    () => completeTask(taskId, options),
    /verification identity no longer matches the current snapshot/,
  );
  assert.equal(validateTaskFile(path.join(paths.tasksDir, `${taskId}.md`)).task.status, "doing");
});

test("does not admit an exit-zero verification whose outcome is skipped", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const clock = fixedClock("2026-07-10T05:56:00.000Z");
  const options = { clock, environment };
  const taskId = createTask("Skipped verification", "skip is not pass", options);
  startTask(taskId, options);
  runVerification(
    parseVerifyArgs([
      taskId,
      "--outcome=skipped",
      "--",
      process.execPath,
      "-e",
      "process.exit(0)",
    ]),
    {
      ...options,
      recordToken: "20260710T055600000000000",
    },
  );

  assert.throws(
    () => completeTask(taskId, options),
    /last verification outcome is not passed: skipped/,
  );
  assert.equal(validateTaskFile(path.join(paths.tasksDir, `${taskId}.md`)).task.status, "doing");
});

test("closes failed and cancelled tasks explicitly without projecting succeeded", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const clock = fixedClock("2026-07-10T05:58:00.000Z");
  const options = { clock, environment };

  for (const outcome of ["failed", "cancelled"]) {
    const taskId = createTask(`Explicit ${outcome}`, "non-success closure", options);
    startTask(taskId, options);
    replaceTeam(paths, taskId, v2Team({ status: outcome === "failed" ? "failed" : "stopped" }));
    assert.throws(
      () => completeTask(taskId, { ...options, outcome }),
      /requires authority_ref and at least one evidence_ref/,
    );
    completeTask(taskId, {
      ...options,
      outcome,
      authorityRef: `user-message:${outcome}`,
      evidenceRefs: [`team/${outcome}-closure.md`],
    });

    const state = JSON.parse(fs.readFileSync(taskStateFile(paths, taskId), "utf8"));
    assert.equal(state.status, "done");
    assert.equal(state.completion.outcome, outcome);
    assert.equal(state.completion.authority_ref, `user-message:${outcome}`);
    assert.deepEqual(state.completion.evidence_refs, [`team/${outcome}-closure.md`]);
    assert.notEqual(state.completion.outcome, "succeeded");
    assert.deepEqual(readEvents(paths, taskId).at(-1).data, {
      from: "doing",
      to: "done",
      outcome,
      authority_ref: `user-message:${outcome}`,
      evidence_refs: [`team/${outcome}-closure.md`],
    });
  }
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
