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
const { archiveTask, createTask, startTask } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/task/lifecycle.js",
));
const { getTaskField, taskFile, updateTaskFields } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/task/repository.js",
));
const { readJsonObject, taskRuntimeFile, taskStateFile } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/task/runtime.js",
));
const {
  parseAttemptArgs,
  parseDispatchArgs,
  parseFallbackArgs,
  parseLaneArgs,
  parseLoopRecordArgs,
  parsePromoteArgs,
  parseRecordFinalizeArgs,
  parseRecordStartArgs,
  parseSelectionArgs,
  runAttemptRecord,
  runDispatchRecord,
  runFallbackRecord,
  runLaneRecord,
  runLoopRecord,
  runPromote,
  runRecordFinalize,
  runRecordStart,
  runSelectionRecord,
  runStatus,
  runStop,
  teamDecisionFile,
  teamDir,
  teamLockFile,
  teamStaffingFile,
} = require(path.join(WORKFLOW_ROOT, "bin/lib/codex-workflow/team/commands.js"));
const { buildObservation, launchLabel } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/team/paseo-observer.js",
));

function clockAt(value) {
  return () => new Date(value);
}

function temporaryWorkflow(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-team-commands."));
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

function createFixtureTask(environment, title = "Native team") {
  const options = {
    clock: clockAt("2026-07-10T12:00:00.000Z"),
    environment,
  };
  const taskId = createTask(title, "native team contract", options);
  startTask(taskId, options);
  return taskId;
}

function startNativeRecord(environment, taskId, clock = "2026-07-10T12:01:00.000Z") {
  return runRecordStart(
    parseRecordStartArgs([
      taskId,
      "implement the bounded native team slice",
      "--mode",
      "discuss",
      "--agents=3",
      "--roles",
      "executor,reviewer,verifier",
    ]),
    { clock: clockAt(clock), environment },
  );
}

function startPaseoRecord(environment, taskId, clock = "2026-07-10T12:01:00.000Z") {
  return runRecordStart(
    parseRecordStartArgs([
      taskId,
      "implement the bounded paseo team slice",
      "--backend=paseo",
      "--mode",
      "discuss",
      "--agents=4",
      "--roles",
      "planner,implementer,reviewer,verifier",
      "--providers",
      "codex=gpt-5.6,claude=sonnet-4,deepseek=deepseek-coder,glm=glm-4.5,kimi=kimi-k3",
      "--selection-authority-kind",
      "user-message",
      "--selection-authority-ref",
      "user-message:paseo-test",
    ]),
    { clock: clockAt(clock), environment },
  );
}

function writeNativeArtifacts(paths, taskId) {
  const directory = teamDir(paths, taskId);
  const round = path.join(directory, "round-native.md");
  const decision = teamDecisionFile(paths, taskId);
  const staffing = teamStaffingFile(paths, taskId);
  fs.writeFileSync(
    round,
    "# Native Round\n\n- backend: native\n\n## Evidence\nThe native execution round completed with contract evidence.\n",
  );
  fs.writeFileSync(
    decision,
    "# Team Decision\n\n- backend: native\n\n## Primary Decision\nUse the bounded JavaScript native-team implementation.\n",
  );
  fs.writeFileSync(
    staffing,
    `# Staffing

- backend: native

## Ownership

Only the integration owner writes the dispatcher.

## Verification

Node tests and repository contracts provide evidence.
`,
  );
  return { decision, round, staffing };
}

function writePaseoArtifacts(paths, taskId) {
  const directory = teamDir(paths, taskId);
  const round = path.join(directory, "round-paseo.md");
  const decision = teamDecisionFile(paths, taskId);
  const staffing = teamStaffingFile(paths, taskId);
  fs.writeFileSync(
    round,
    "# Paseo Round\n\n- backend: paseo\n\n## Evidence\nThe paseo execution round completed with contract evidence.\n",
  );
  fs.writeFileSync(
    decision,
    "# Team Decision\n\n- backend: paseo\n\n## Primary Decision\nUse the bounded JavaScript paseo-team implementation.\n",
  );
  fs.writeFileSync(
    staffing,
    `# Staffing

- backend: paseo

## Ownership

Only the integration owner writes the dispatcher.

## Verification

Node tests and repository contracts provide evidence.
`,
  );
  return { decision, round, staffing };
}

function readEvents(paths, taskId) {
  return fs
    .readFileSync(taskRuntimeFile(paths, taskId), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

function legacyShape(event) {
  return {
    kind: event.kind,
    detail: event.detail,
    created_at: event.created_at,
  };
}

function readTeam(paths, taskId) {
  return readJsonObject(taskStateFile(paths, taskId)).active_team;
}

function invokeControl(run, parse, environment, argv, clock = "2026-07-10T12:06:00.000Z", extra = {}) {
  return run(parse(argv), { clock: clockAt(clock), environment, ...extra });
}

function writeEvidence(paths, taskId, ...references) {
  for (const reference of references) {
    const file = path.join(taskArtifactDir(paths, taskId), reference);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `evidence for ${reference}\n`);
  }
}

function recordCapability(environment, taskId, {
  snapshotId, provider, model, family, runtimeModes = [], operationId = `${snapshotId}-op`,
}) {
  const stdout = JSON.stringify({ models: [{
    id: model,
    provider,
    model_family: family,
    runtime_mode_ids: runtimeModes,
  }] });
  return invokeControl(runSelectionRecord, parseSelectionArgs, environment, [
    taskId, `--operation-id=${operationId}`, `--event-id=${snapshotId}`,
    "--kind=capability", `--authority-ref=controller-observation:${snapshotId}`,
    `--provider=${provider}`, `--model=${model}`,
  ], "2026-07-10T12:05:00.000Z", {
    observePaseoCommand(action) {
      return {
        stdout,
        stderr: "",
        observation: buildObservation({ action, exitCode: 0, stdout, stderr: "" }),
      };
    },
  });
}

function recordAttemptObservation(environment, taskId, {
  attemptId, observationId, action, observation, args = ["review bounded scope"],
}) {
  const argv = [
    taskId, `--operation-id=${observationId}-op`, "--action=observe",
    `--attempt=${attemptId}`, `--observation-id=${observationId}`,
    `--observer-action=${action}`,
  ];
  if (action === "run") argv.push(`--observer-args-json=${JSON.stringify(args)}`);
  return invokeControl(runAttemptRecord, parseAttemptArgs, environment, argv,
    "2026-07-10T12:05:30.000Z", {
      observePaseoCommand(observedAction) {
        if (observedAction === "ls") {
          const stdout = JSON.stringify([]);
          return {
            observation: buildObservation({
              action: "ls", exitCode: 0, stdout, stderr: "",
            }),
            stdout,
            stderr: "",
          };
        }
        return { observation, stdout: "", stderr: "" };
      },
    });
}

test("record-start validates and records native running state", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Record native start");
  assert.throws(
    () =>
      runRecordStart(
        parseRecordStartArgs([
          taskId,
          "objective",
          "--backend=external",
          "--mode=discuss",
          "--agents=1",
          "--roles=executor",
        ]),
        { environment },
      ),
    /invalid team backend: external/,
  );
  assert.throws(
    () =>
      runRecordStart(
        parseRecordStartArgs([
          taskId,
          "objective",
          "--mode=discuss",
          "--agents=1",
          "--roles=executor",
          "--providers=codex/model",
        ]),
        { environment },
      ),
    /native team backend does not accept providers/,
  );
  assert.throws(
    () =>
      runRecordStart(
        parseRecordStartArgs([
          "missing-task",
          "objective",
          "--mode=discuss",
          "--agents=1",
          "--roles=executor",
        ]),
        { environment },
      ),
    /unknown task: missing-task/,
  );

  const result = startNativeRecord(environment, taskId);
  assert.deepEqual(result.lines, [
    `task_id: ${taskId}`,
    "backend: native",
    "mode: discuss",
    "status: running",
    `decision: ${teamDecisionFile(paths, taskId)}`,
    `staffing: ${teamStaffingFile(paths, taskId)}`,
    "team_run_id: run-0001",
    "generation: 1",
  ]);
  const file = taskFile(paths.tasksDir, taskId);
  assert.equal(getTaskField(file, "active_team_backend"), "native");
  assert.equal(getTaskField(file, "active_team_status"), "running");
  const state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(state.active_team.agents, "3");
  assert.equal(state.active_team.roles, "executor,reviewer,verifier");
  assert.equal(state.active_team.providers, "");
  assert.equal(state.active_team.temp_dir, "");
  assert.equal(fs.existsSync(`${teamLockFile(taskId, environment)}.dir`), false);
  assert.deepEqual(legacyShape(readEvents(paths, taskId).at(-1)), {
    kind: "team-record-start",
    detail: "native/discuss roles=executor,reviewer,verifier",
    created_at: "2026-07-10T12:01:00Z",
  });
});

test("record-start requires explicit Paseo selection authority and validates providers", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Record paseo start");
  assert.throws(
    () =>
      runRecordStart(
        parseRecordStartArgs([
          taskId,
          "objective",
          "--backend=paseo",
          "--mode=discuss",
          "--agents=2",
          "--roles=planner,reviewer",
        ]),
        { environment },
      ),
    /explicit team backend requires selection authority/,
  );
  assert.throws(
    () =>
      runRecordStart(
        parseRecordStartArgs([
          taskId,
          "objective",
          "--backend=paseo",
          "--mode=discuss",
          "--agents=2",
          "--roles=planner,reviewer",
          "--providers",
          "codex=gpt-5.6\nclaude=sonnet-4",
          "--selection-authority-kind=user-message",
          "--selection-authority-ref=user-message:paseo-test",
        ]),
        { environment },
      ),
    /unsafe paseo providers: reason must be a single non-empty line/,
  );

  const result = startPaseoRecord(environment, taskId);
  assert.deepEqual(result.lines, [
    `task_id: ${taskId}`,
    "backend: paseo",
    "mode: discuss",
    "status: running",
    `decision: ${teamDecisionFile(paths, taskId)}`,
    `staffing: ${teamStaffingFile(paths, taskId)}`,
    "providers: codex=gpt-5.6,claude=sonnet-4,deepseek=deepseek-coder,glm=glm-4.5,kimi=kimi-k3",
    "team_run_id: run-0001",
    "generation: 1",
  ]);
  const state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(state.active_team.backend, "paseo");
  assert.equal(
    state.active_team.providers,
    "codex=gpt-5.6,claude=sonnet-4,deepseek=deepseek-coder,glm=glm-4.5,kimi=kimi-k3",
  );
  assert.equal(state.active_team.temp_dir, "");
  assert.deepEqual(legacyShape(readEvents(paths, taskId).at(-1)), {
    kind: "team-record-start",
    detail: "paseo/discuss roles=planner,implementer,reviewer,verifier",
    created_at: "2026-07-10T12:01:00Z",
  });
});

test("record-start requires an explicit authorization ref before execute writes", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Guard native execute start");
  const stateFile = taskStateFile(paths, taskId);
  const runtimeFile = taskRuntimeFile(paths, taskId);
  const stateBefore = fs.readFileSync(stateFile, "utf8");
  const runtimeBefore = fs.readFileSync(runtimeFile, "utf8");
  const parsed = {
    taskId,
    objective: "implement the explicitly authorized change",
    backend: "",
    mode: "execute",
    agents: "1",
    roles: "executor",
    authorizationRef: "",
  };

  assert.throws(
    () => runRecordStart(parsed, { environment }),
    /missing execute authorization ref/,
  );
  assert.equal(fs.readFileSync(stateFile, "utf8"), stateBefore);
  assert.equal(fs.readFileSync(runtimeFile, "utf8"), runtimeBefore);

  const result = runRecordStart(
    { ...parsed, authorizationRef: "user-message:implement-roadmap" },
    { environment },
  );
  assert.ok(result.lines.includes("authorization_ref: user-message:implement-roadmap"));
  assert.equal(
    readJsonObject(stateFile).active_team.authorization_ref,
    "user-message:implement-roadmap",
  );
});

test("record-start rejects done and archived tasks before changing Team state", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  for (const status of ["done", "archived"]) {
    const taskId = createFixtureTask(environment, `Reject ${status} Team start`);
    if (status === "archived") {
      archiveTask(taskId, "fixture closure", {
        clock: clockAt("2026-07-10T12:00:30.000Z"),
        environment,
      });
    } else {
      updateTaskFields(taskFile(paths.tasksDir, taskId), { status: "done" });
      updateTaskCommand(paths, taskId, {}, {}, clockAt("2026-07-10T12:00:30.000Z"));
    }
    const stateFile = taskStateFile(paths, taskId);
    const runtimeFile = taskRuntimeFile(paths, taskId);
    const before = {
      state: fs.readFileSync(stateFile),
      runtime: fs.readFileSync(runtimeFile),
    };

    assert.throws(
      () => startNativeRecord(environment, taskId),
      new RegExp(`task must be doing before team start: ${taskId}`),
    );
    assert.deepEqual(fs.readFileSync(stateFile), before.state);
    assert.deepEqual(fs.readFileSync(runtimeFile), before.runtime);
  }
});

test("finalize rejects invalid artifacts without changing running state", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Reject native artifacts");
  startNativeRecord(environment, taskId);
  const { decision, round, staffing } = writeNativeArtifacts(paths, taskId);
  fs.writeFileSync(
    staffing,
    "# Staffing\n\n- backend: native\n\nPending discussion.\n",
  );
  const parsed = parseRecordFinalizeArgs([
    taskId,
    "--backend=native",
    "--status=complete",
    `--round=${round}`,
    `--decision=${decision}`,
    `--staffing=${staffing}`,
  ]);
  assert.throws(
    () => runRecordFinalize(parsed, { environment }),
    /team staffing file is not substantive/,
  );
  assert.equal(readJsonObject(taskStateFile(paths, taskId)).active_team.status, "running");

  const outside = path.join(path.dirname(paths.root), "outside-round.md");
  fs.writeFileSync(
    outside,
    "# Native Round\n\n- backend: native\n\nOutside ownership must be rejected as evidence.\n",
  );
  writeNativeArtifacts(paths, taskId);
  assert.throws(
    () =>
      runRecordFinalize(
        { ...parsed, roundFile: outside },
        { environment },
      ),
    /team round file is outside current task team directory/,
  );
  assert.equal(readJsonObject(taskStateFile(paths, taskId)).active_team.status, "running");
});

test("finalize records complete native artifacts", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Finalize native record");
  startNativeRecord(environment, taskId);
  const { decision, round, staffing } = writeNativeArtifacts(paths, taskId);
  const result = runRecordFinalize(
    parseRecordFinalizeArgs([
      taskId,
      "--backend",
      "native",
      "--status",
      "complete",
      "--round",
      round,
      "--decision",
      decision,
      "--staffing",
      staffing,
    ]),
    { clock: clockAt("2026-07-10T12:02:00.000Z"), environment },
  );
  assert.deepEqual(result.lines, [
    `task_id: ${taskId}`,
    "backend: none",
    "status: complete",
    `decision: ${decision}`,
    `staffing: ${staffing}`,
    `round: ${round}`,
    `sidecar: ${path.join(teamDir(paths, taskId), "backend-v2.json")}`,
  ]);
  const state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(state.active_team.status, "complete");
  assert.equal(state.active_team.effective_backend, "none");
  assert.equal(state.active_team.admissions.length, 0);
  assert.equal(state.active_team.attempts.length, 0);
  assert.equal(state.active_team.compatibility_records[0].kind, "record-only-finalize");
  assert.match(state.active_team.round_file, /team\/round-native\.md$/);
  assert.match(state.active_team.staffing, /team\/staffing\.md$/);
  assert.equal(state.active_team.temp_dir, "");
  assert.deepEqual(legacyShape(readEvents(paths, taskId).at(-1)), {
    kind: "team-record-finalize",
    detail: `none/complete round=${state.active_team.round_file}`,
    created_at: "2026-07-10T12:02:00Z",
  });
  assert.throws(() => invokeControl(runLaneRecord, parseLaneArgs, environment, [
    taskId, "--operation-id=post-finalize-lane", "--action=open", "--lane=too-late",
  ]), /team run is not mutable: complete/);
  assert.throws(() => runPromote(parsePromoteArgs([
    taskId, "--to=worktree",
  ]), { environment }), /team run is not mutable: complete/);
});

test("finalize records complete paseo artifacts with matching backend markers", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Finalize paseo record");
  startPaseoRecord(environment, taskId);
  const { decision, round, staffing } = writePaseoArtifacts(paths, taskId);
  const result = runRecordFinalize(
    parseRecordFinalizeArgs([
      taskId,
      "--backend",
      "paseo",
      "--status",
      "complete",
      "--round",
      round,
      "--decision",
      decision,
      "--staffing",
      staffing,
    ]),
    { clock: clockAt("2026-07-10T12:02:00.000Z"), environment },
  );
  assert.deepEqual(result.lines, [
    `task_id: ${taskId}`,
    "backend: none",
    "status: complete",
    `decision: ${decision}`,
    `staffing: ${staffing}`,
    `round: ${round}`,
    `sidecar: ${path.join(teamDir(paths, taskId), "backend-v2.json")}`,
  ]);
  const state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(state.active_team.status, "complete");
  assert.equal(state.active_team.effective_backend, "none");
  assert.equal(state.active_team.admissions.length, 0);
  assert.equal(state.active_team.attempts.length, 0);
  assert.match(state.active_team.round_file, /team\/round-paseo\.md$/);
  assert.equal(
    state.active_team.providers,
    "codex=gpt-5.6,claude=sonnet-4,deepseek=deepseek-coder,glm=glm-4.5,kimi=kimi-k3",
  );
  assert.deepEqual(legacyShape(readEvents(paths, taskId).at(-1)), {
    kind: "team-record-finalize",
    detail: `none/complete round=${state.active_team.round_file}`,
    created_at: "2026-07-10T12:02:00Z",
  });
});

test("finalize rejects a backend that does not match the active team", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Reject cross-backend finalize");
  startNativeRecord(environment, taskId);
  const { decision, round, staffing } = writePaseoArtifacts(paths, taskId);
  assert.throws(
    () =>
      runRecordFinalize(
        parseRecordFinalizeArgs([
          taskId,
          "--backend=paseo",
          "--status=complete",
          `--round=${round}`,
          `--decision=${decision}`,
          `--staffing=${staffing}`,
        ]),
        { environment },
      ),
    /v2 finalize backend assertion mismatch: paseo != none/,
  );
});

test("loop-record validates and records terminal loop state", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Record native loop");
  startNativeRecord(environment, taskId);
  const loop = path.join(teamDir(paths, taskId), "loop-native.md");
  fs.writeFileSync(
    loop,
    "# Native Loop\n\n- backend: native\n\n## Evidence\nThe native loop completed with sufficient verification evidence.\n",
  );
  assert.throws(
    () =>
      runLoopRecord(
        parseLoopRecordArgs([
          taskId,
          "--backend=native",
          "--status=loop-done",
          `--loop=${loop}`,
          "--iterations=0",
        ]),
        { environment },
      ),
    /invalid loop iterations: 0/,
  );
  const result = runLoopRecord(
    parseLoopRecordArgs([
      taskId,
      "--backend=native",
      "--status=loop-done",
      `--loop=${loop}`,
      "--iterations=1",
      "--max-iterations=2",
      "--max-time=10m",
    ]),
    { clock: clockAt("2026-07-10T12:03:00.000Z"), environment },
  );
  assert.deepEqual(result.lines, [
    `task_id: ${taskId}`,
    "backend: none",
    "status: loop-done",
    `loop: ${loop}`,
    "iterations: 1",
  ]);
  const state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(state.active_team.status, "loop-done");
  assert.equal(state.active_team.effective_backend, "none");
  assert.equal(state.active_team.admissions.length, 0);
  assert.equal(state.active_team.loop.iteration, 1);
  assert.equal(state.active_team.loop.max_iterations, 2);
  assert.equal(state.active_team.loop.max_time, "10m");
  assert.match(readEvents(paths, taskId).at(-1).detail, /iterations=1$/);
});

test("loop-record validates paseo backend markers and preserves providers", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Record paseo loop");
  startPaseoRecord(environment, taskId);
  const loop = path.join(teamDir(paths, taskId), "loop-paseo.md");
  fs.writeFileSync(
    loop,
    "# Paseo Loop\n\n- backend: paseo\n\n## Evidence\nThe paseo loop completed with sufficient verification evidence.\n",
  );
  const result = runLoopRecord(
    parseLoopRecordArgs([
      taskId,
      "--backend=paseo",
      "--status=loop-done",
      `--loop=${loop}`,
      "--iterations=2",
      "--max-time=15m",
    ]),
    { clock: clockAt("2026-07-10T12:03:00.000Z"), environment },
  );
  assert.deepEqual(result.lines, [
    `task_id: ${taskId}`,
    "backend: none",
    "status: loop-done",
    `loop: ${loop}`,
    "iterations: 2",
  ]);
  const state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(state.active_team.status, "loop-done");
  assert.equal(state.active_team.effective_backend, "none");
  assert.equal(state.active_team.admissions.length, 0);
  assert.equal(state.active_team.loop.iteration, 2);
  assert.equal(
    state.active_team.providers,
    "codex=gpt-5.6,claude=sonnet-4,deepseek=deepseek-coder,glm=glm-4.5,kimi=kimi-k3",
  );
  assert.match(readEvents(paths, taskId).at(-1).detail, /none\/loop-done .*iterations=2$/);
});

test("status and stop preserve shared legacy team fields", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Legacy status projection");
  const clock = clockAt("2026-07-10T12:04:00.000Z");
  updateTaskCommand(
    paths,
    taskId,
    {
      active_team_backend: "legacy",
      active_team_mode: "execute",
      active_team_status: "loop-failed",
      active_team_decision: `workflow/artifacts/${taskId}/team/decision.md`,
    },
    {
      "active_team.backend": "legacy",
      "active_team.mode": "execute",
      "active_team.status": "loop-failed",
      "active_team.objective": "legacy objective",
      "active_team.agents": "2",
      "active_team.roles": "worker,verifier",
      "active_team.providers": "claude=sonnet",
      "active_team.round_file": "legacy/round.md",
      "active_team.staffing": "legacy/staffing.md",
      "active_team.temp_dir": "/tmp/legacy-team",
      "active_team.promoted_to": "worktree",
      "active_team.loop.status": "loop-failed",
      "active_team.loop.file": "legacy/loop.md",
      "active_team.loop.iteration": "2",
      "active_team.loop.max_iterations": "3",
      "active_team.loop.max_time": "5m",
    },
    clock,
  );
  const status = runStatus([taskId], { clock, environment });
  assert.equal(status.lines.length, 21);
  assert.deepEqual(status.lines.slice(4), [
    "team_backend: legacy",
    "team_mode: execute",
    "team_status: loop-failed",
    `team_decision: workflow/artifacts/${taskId}/team/decision.md`,
    "team_objective: legacy objective",
    "team_agents: 2",
    "team_roles: worker,verifier",
    "team_providers: claude=sonnet",
    "team_round: legacy/round.md",
    "team_staffing: legacy/staffing.md",
    "team_temp_dir: /tmp/legacy-team",
    "team_promoted_to: worktree",
    "team_loop_status: loop-failed",
    "team_loop_file: legacy/loop.md",
    "team_loop_iteration: 2",
    "team_loop_max_iterations: 3",
    "team_loop_max_time: 5m",
  ]);

  assert.deepEqual(runStop([taskId], { clock, environment }).lines, [
    `task_id: ${taskId}`,
    "status: stopped",
  ]);
  const stopped = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(stopped.active_team.status, "stopped");
  assert.equal(stopped.active_team.backend, "legacy");
  assert.equal(stopped.active_team.loop.status, "loop-failed");
  assert.equal(stopped.active_team.promoted_to, "worktree");
  assert.equal(stopped.active_team.providers, "claude=sonnet");
  assert.equal(readEvents(paths, taskId).at(-1).kind, "team-stop");
});

test("promote updates state and accepts equals form through the public dispatcher", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Promote native record");
  startNativeRecord(environment, taskId);
  const stateFile = taskStateFile(paths, taskId);
  const runtimeFile = taskRuntimeFile(paths, taskId);
  const stateBefore = fs.readFileSync(stateFile, "utf8");
  const runtimeBefore = fs.readFileSync(runtimeFile, "utf8");
  assert.throws(
    () => runPromote({ taskId, target: "execute", authorizationRef: "" }, { environment }),
    /missing execute authorization ref/,
  );
  assert.equal(fs.readFileSync(stateFile, "utf8"), stateBefore);
  assert.equal(fs.readFileSync(runtimeFile, "utf8"), runtimeBefore);

  const execute = runPromote(parsePromoteArgs([
    taskId,
    "--to=execute",
    "--authorization-ref=user-message:implement-roadmap",
  ]), {
    clock: clockAt("2026-07-10T12:05:00.000Z"),
    environment,
  });
  assert.deepEqual(execute.lines, [
    `task_id: ${taskId}`,
    "target: execute",
    `decision: ${teamDecisionFile(paths, taskId)}`,
    "authorization_ref: user-message:implement-roadmap",
  ]);
  let state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(state.active_team.mode, "execute");
  assert.equal(state.active_team.promoted_to, "execute");
  assert.equal(state.active_team.authorization_ref, "user-message:implement-roadmap");

  const dispatched = spawnSync(PUBLIC_BIN, ["team-promote", taskId, "--to=finish"], {
    encoding: "utf8",
    env: environment,
  });
  assert.equal(dispatched.status, 0, dispatched.stderr);
  assert.match(dispatched.stdout, /^task_id: .+\ntarget: finish\ndecision: .+\n$/);
  state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(state.active_team.mode, "execute");
  assert.equal(state.active_team.status, "promoted:finish");
  assert.equal(state.active_team.promoted_to, "finish");
  const decision = fs.readFileSync(teamDecisionFile(paths, taskId), "utf8");
  assert.match(decision, /- promoted_to: execute/);
  assert.match(decision, /- authorization_ref: user-message:implement-roadmap/);
  assert.match(decision, /- promoted_to: finish/);
  assert.equal(readEvents(paths, taskId).at(-1).detail, "finish");
});

test("promote leaves task, state, decision, runtime, and events unchanged before commit", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Rollback failed promotion");
  startNativeRecord(environment, taskId);
  const files = [
    taskFile(paths.tasksDir, taskId),
    taskStateFile(paths, taskId),
    teamDecisionFile(paths, taskId),
    taskRuntimeFile(paths, taskId),
    path.join(taskArtifactDir(paths, taskId), "events-v2.jsonl"),
  ];
  const before = files.map((file) => fs.readFileSync(file));

  assert.throws(
    () => runPromote(
      { taskId, target: "finish", authorizationRef: "" },
      { environment, failBeforeEventAppend: true, operationId: "promote-before-commit" },
    ),
    /injected failure before authoritative event append/,
  );
  files.forEach((file, index) => assert.deepEqual(fs.readFileSync(file), before[index]));
});

test("explicit native selection is attested while an omitted backend defaults to native", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Attest explicit native");
  const baseArgs = [taskId, "review the selected native lane", "--backend=native", "--mode=discuss"];
  assert.throws(
    () => runRecordStart(parseRecordStartArgs(baseArgs), { environment }),
    /explicit team backend requires selection authority/,
  );
  runRecordStart(parseRecordStartArgs([
    ...baseArgs,
    "--selection-authority-kind=user-message",
    "--selection-authority-ref=user-message:explicit-native",
  ]), { environment });
  const team = readTeam(paths, taskId);
  assert.equal(team.configured_backend, "native");
  assert.equal(team.selection_events.length, 1);
  assert.equal(team.selection_events[0].backend, "native");
  assert.equal(team.selection_events[0].authority_ref, "user-message:explicit-native");
});

test("v2 public commands enforce idempotent attempt lifecycle and derive admitted sidecar", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Native v2 lifecycle");
  startNativeRecord(environment, taskId);

  invokeControl(runLaneRecord, parseLaneArgs, environment, [
    taskId, "--operation-id=lane-open-1", "--action=open", "--lane=review",
    "--purpose=independent-review", "--role=reviewer",
  ]);
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    taskId, "--operation-id=dispatch-open-1", "--action=open", "--lane=review",
    "--dispatch=review-round-1", "--objective=review-bounded-change",
  ]);
  const reserveArgs = [
    taskId, "--operation-id=attempt-reserve-1", "--action=reserve",
    "--dispatch=review-round-1", "--attempt=native-review-1",
    "--launch-operation-id=launch-native-review-1",
  ];
  const first = invokeControl(runAttemptRecord, parseAttemptArgs, environment, reserveArgs);
  const replay = invokeControl(
    runAttemptRecord,
    parseAttemptArgs,
    environment,
    reserveArgs,
    "2026-07-10T12:07:30.000Z",
  );
  assert.deepEqual(replay.lines, first.lines);
  assert.throws(
    () => invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
      taskId, "--operation-id=second-launch-while-reserved", "--action=reserve",
      "--dispatch=review-round-1", "--attempt=native-review-duplicate-launch",
      "--launch-operation-id=launch-native-review-duplicate",
    ]),
    /dispatch already has an active attempt/,
  );
  assert.throws(
    () => invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
      taskId, "--operation-id=attempt-reserve-1", "--action=reserve",
      "--dispatch=review-round-1", "--attempt=native-review-conflict",
      "--launch-operation-id=launch-native-review-conflict",
    ]),
    /operation_id replay payload conflict/,
  );
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=attempt-bind-1", "--action=bind", "--attempt=native-review-1",
    "--launch-operation-id=launch-native-review-1", "--runtime-agent-id=native-agent-1",
    "--workspace-id=workspace-1", "--worktree=/workspace/review", "--base-sha=abcdef1",
  ]);
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=attempt-running-1", "--action=running", "--attempt=native-review-1",
  ]);
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=attempt-terminal-1", "--action=terminal", "--attempt=native-review-1",
    "--outcome=succeeded", "--launch-invoked=true", "--evidence-refs=team/native-review.md",
  ]);
  writeEvidence(paths, taskId, "team/native-review-quiesced.json");
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=attempt-quiesced-1", "--action=quiesced", "--attempt=native-review-1",
    "--evidence-refs=team/native-review-quiesced.json",
  ]);
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    taskId, "--operation-id=dispatch-dispose-1", "--action=dispose", "--dispatch=review-round-1",
    "--disposition=admitted", "--admitted-attempts=native-review-1",
    "--evidence-refs=team/native-review.md",
  ]);
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    taskId, "--operation-id=dispatch-close-1", "--action=close", "--dispatch=review-round-1",
  ]);
  invokeControl(runLaneRecord, parseLaneArgs, environment, [
    taskId, "--operation-id=lane-close-1", "--action=close", "--lane=review",
    "--convergence=CONSENSUS",
  ]);

  const team = readTeam(paths, taskId);
  assert.equal(team.attempts[0].status, "quiesced");
  assert.deepEqual(team.attempted_backends, ["native"]);
  assert.equal(team.effective_backend, "native");
  assert.equal(team.lanes[0].convergence, "CONSENSUS");

  const { decision, round, staffing } = writeNativeArtifacts(paths, taskId);
  runRecordFinalize(parseRecordFinalizeArgs([
    taskId, "--backend=native", "--status=complete",
    `--round=${round}`, `--decision=${decision}`, `--staffing=${staffing}`,
  ]), { environment });
  const sidecar = readJsonObject(path.join(teamDir(paths, taskId), "backend-v2.json"));
  assert.equal(sidecar.effective_backend, "native");
  assert.deepEqual(sidecar.lanes, [{
    lane_id: "review",
    effective_backend: "native",
    admitted_attempt_ids: ["native-review-1"],
    evidence_refs: ["team/native-review.md"],
  }]);
  assert.deepEqual(
    invokeControl(runAttemptRecord, parseAttemptArgs, environment, reserveArgs).lines,
    first.lines,
  );
});

test("v2 controller rejects forged origins, evidence, perspective, and convergence", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Reject forged controller transitions");
  startNativeRecord(environment, taskId);
  invokeControl(runLaneRecord, parseLaneArgs, environment, [
    taskId, "--operation-id=guard-lane-open", "--action=open", "--lane=guard",
  ]);
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    taskId, "--operation-id=guard-dispatch-open", "--action=open", "--lane=guard",
    "--dispatch=guard-dispatch", "--required-perspective=security",
  ]);
  assert.throws(() => invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=forged-fallback-reserve", "--action=reserve",
    "--dispatch=guard-dispatch", "--attempt=forged-fallback", "--origin=fallback",
    "--launch-operation-id=launch-forged-fallback", "--perspective=security",
  ]), /public reserve does not accept attempt origin: fallback/);
  assert.throws(() => invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=missing-perspective", "--action=reserve",
    "--dispatch=guard-dispatch", "--attempt=missing-perspective",
    "--launch-operation-id=launch-missing-perspective",
  ]), /attempt must satisfy required perspective: security/);
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=guard-reserve", "--action=reserve",
    "--dispatch=guard-dispatch", "--attempt=guard-attempt",
    "--launch-operation-id=launch-guard-attempt", "--perspective=security",
  ]);
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=guard-bind", "--action=bind", "--attempt=guard-attempt",
    "--launch-operation-id=launch-guard-attempt", "--runtime-agent-id=native-guard-agent",
  ]);
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=guard-terminal", "--action=terminal", "--attempt=guard-attempt",
    "--outcome=succeeded",
  ]);
  assert.throws(() => invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=guard-quiesce-forged", "--action=quiesced",
    "--attempt=guard-attempt", "--evidence-refs=team/does-not-exist.json",
  ]), /missing quiescence evidence/);
  writeEvidence(paths, taskId, "team/native-guard-quiescence.json");
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=guard-quiesce", "--action=quiesced", "--attempt=guard-attempt",
    "--evidence-refs=team/native-guard-quiescence.json",
  ]);
  assert.throws(() => invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=guard-terminal-again", "--action=terminal", "--attempt=guard-attempt",
    "--outcome=succeeded",
  ]), /attempt terminal requires reserved, bound, or running state/);
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    taskId, "--operation-id=guard-dispose", "--action=dispose", "--dispatch=guard-dispatch",
    "--disposition=admitted", "--admitted-attempts=guard-attempt",
  ]);
  assert.throws(() => invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    taskId, "--operation-id=guard-dispose-again", "--action=dispose", "--dispatch=guard-dispatch",
    "--disposition=admitted", "--admitted-attempts=guard-attempt",
  ]), /dispatch is already disposed or closed/);
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    taskId, "--operation-id=guard-dispatch-close", "--action=close", "--dispatch=guard-dispatch",
  ]);
  assert.throws(() => invokeControl(runLaneRecord, parseLaneArgs, environment, [
    taskId, "--operation-id=guard-lane-close-wrong", "--action=close", "--lane=guard",
    "--convergence=CONSENSUS_WITH_RESERVATIONS",
  ]), /lane convergence must be CONSENSUS/);
  invokeControl(runLaneRecord, parseLaneArgs, environment, [
    taskId, "--operation-id=guard-lane-close", "--action=close", "--lane=guard",
    "--convergence=CONSENSUS",
  ]);
  invokeControl(runLaneRecord, parseLaneArgs, environment, [
    taskId, "--operation-id=human-lane-open", "--action=open", "--lane=human",
  ]);
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    taskId, "--operation-id=human-dispatch-open", "--action=open", "--lane=human",
    "--dispatch=human-dispatch",
  ]);
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    taskId, "--operation-id=human-dispose", "--action=dispose", "--dispatch=human-dispatch",
    "--disposition=human-decision", "--resolution-ref=user-decision:pending",
  ]);
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    taskId, "--operation-id=human-dispatch-close", "--action=close", "--dispatch=human-dispatch",
  ]);
  assert.throws(() => invokeControl(runLaneRecord, parseLaneArgs, environment, [
    taskId, "--operation-id=human-lane-close-wrong", "--action=close", "--lane=human",
    "--convergence=CONSENSUS",
  ]), /lane convergence must be HUMAN_DECISION_REQUIRED/);
  invokeControl(runLaneRecord, parseLaneArgs, environment, [
    taskId, "--operation-id=human-lane-close", "--action=close", "--lane=human",
    "--convergence=HUMAN_DECISION_REQUIRED",
  ]);
  assert.throws(() => parseAttemptArgs([
    taskId, "--operation-id=forged-observation-file", "--action=terminal",
    "--attempt=guard-attempt", "--outcome=operational-failure",
    "--observation-file=/tmp/forged.json",
  ]), /unknown team-attempt-record option: --observation-file/);
  assert.throws(() => parseAttemptArgs([
    taskId, "--operation-id=forged-actor-type", "--action=reserve",
    "--dispatch=guard-dispatch", "--attempt=forged-actor",
    "--launch-operation-id=launch-forged-actor", "--actor-type=controller",
  ]), /unknown team-attempt-record option: --actor-type/);
});

test("dispatch precedence and Claude manual-only admission fail closed", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Paseo selection precedence");
  startPaseoRecord(environment, taskId);
  invokeControl(runSelectionRecord, parseSelectionArgs, environment, [
    taskId, "--operation-id=selection-native-lane-op", "--event-id=selection-native-lane",
    "--kind=backend", "--scope=lane:native-lane", "--authority-kind=user-message",
    "--authority-ref=user-message:native-override", "--backend=native",
  ]);
  invokeControl(runLaneRecord, parseLaneArgs, environment, [
    taskId, "--operation-id=native-lane-open", "--action=open", "--lane=native-lane",
    "--backend=native", "--selection-event=selection-native-lane",
  ]);
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    taskId, "--operation-id=native-dispatch-open", "--action=open", "--lane=native-lane",
    "--dispatch=native-dispatch",
  ]);
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=native-attempt-reserve", "--action=reserve",
    "--dispatch=native-dispatch", "--attempt=native-attempt",
    "--launch-operation-id=launch-native-attempt",
  ]);

  invokeControl(runLaneRecord, parseLaneArgs, environment, [
    taskId, "--operation-id=paseo-lane-open", "--action=open", "--lane=paseo-lane",
  ]);
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    taskId, "--operation-id=paseo-dispatch-open", "--action=open", "--lane=paseo-lane",
    "--dispatch=paseo-dispatch",
  ]);
  recordCapability(environment, taskId, {
    snapshotId: "unknown-capability", provider: "anthropic-gateway",
    model: "sonnet-exact", family: "unclassified",
  });
  const paseoBase = [
    taskId, "--action=reserve", "--dispatch=paseo-dispatch",
    "--provider=anthropic-gateway", "--model=sonnet-exact",
  ];
  assert.throws(
    () => invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
      ...paseoBase, "--operation-id=unknown-model-reserve", "--attempt=unknown-model",
      "--capability-snapshot=unknown-capability", "--launch-operation-id=launch-unknown-model",
    ]),
    /MODEL_FAMILY_UNVERIFIED/,
  );
  assert.throws(
    () => parseAttemptArgs([
      ...paseoBase, "--operation-id=forged-family", "--attempt=forged-family",
      "--model-family=non-claude", "--launch-operation-id=launch-forged-family",
    ]),
    /unknown team-attempt-record option: --model-family/,
  );
  recordCapability(environment, taskId, {
    snapshotId: "openai-family-unspecified", provider: "openai",
    model: "gpt-family-unspecified", family: undefined,
  });
  assert.throws(
    () => invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
      taskId, "--operation-id=openai-family-unspecified-reserve", "--action=reserve",
      "--dispatch=paseo-dispatch", "--attempt=openai-family-unspecified",
      "--provider=openai", "--model=gpt-family-unspecified",
      "--capability-snapshot=openai-family-unspecified",
      "--launch-operation-id=launch-openai-family-unspecified",
    ]),
    /MODEL_FAMILY_UNVERIFIED/,
  );
  recordCapability(environment, taskId, {
    snapshotId: "claude-capability", provider: "anthropic-gateway",
    model: "sonnet-exact", family: "claude",
  });
  assert.throws(
    () => invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
      ...paseoBase, "--operation-id=claude-without-event", "--attempt=claude-without-event",
      "--capability-snapshot=claude-capability", "--launch-operation-id=launch-claude-without-event",
    ]),
    /CLAUDE_MODEL_SELECTION_REQUIRED/,
  );
  invokeControl(runSelectionRecord, parseSelectionArgs, environment, [
    taskId, "--operation-id=claude-model-selection-op", "--event-id=claude-model-selection",
    "--kind=model", "--scope=dispatch:paseo-dispatch", "--authority-kind=user-message",
    "--authority-ref=user-message:claude-exact", "--provider=anthropic-gateway",
    "--model=sonnet-exact",
  ]);
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    ...paseoBase, "--operation-id=claude-manual-reserve", "--attempt=claude-manual",
    "--capability-snapshot=claude-capability", "--model-selection-event=claude-model-selection",
    "--launch-operation-id=launch-claude-manual",
  ]);

  const team = readTeam(paths, taskId);
  assert.equal(team.dispatches.find((item) => item.dispatch_id === "native-dispatch").resolved_requested_backend, "native");
  assert.equal(team.dispatches.find((item) => item.dispatch_id === "paseo-dispatch").resolved_requested_backend, "paseo");
  assert.equal(team.attempts.find((item) => item.attempt_id === "claude-manual").model_selection_event_id, "claude-model-selection");
});

test("Paseo launch reconciliation binds only the exact observed actor", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Paseo exact launch reconciliation");
  startPaseoRecord(environment, taskId);
  invokeControl(runLaneRecord, parseLaneArgs, environment, [
    taskId, "--operation-id=reconcile-lane-open", "--action=open", "--lane=reconcile",
  ]);
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    taskId, "--operation-id=reconcile-dispatch-open", "--action=open", "--lane=reconcile",
    "--dispatch=reconcile-dispatch",
  ]);
  recordCapability(environment, taskId, {
    snapshotId: "reconcile-capability", provider: "openai", model: "gpt-5.6",
    family: "non-claude",
  });
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=reconcile-reserve", "--action=reserve",
    "--dispatch=reconcile-dispatch", "--attempt=reconcile-attempt",
    "--provider=openai", "--model=gpt-5.6",
    "--capability-snapshot=reconcile-capability",
    "--launch-operation-id=launch-reconcile-attempt",
  ]);
  let runCalls = 0;
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=reconcile-observe", "--action=observe",
    "--attempt=reconcile-attempt", "--observation-id=reconcile-observation",
    "--observer-action=run", '--observer-args-json=["should not launch"]',
  ], "2026-07-10T12:06:00.000Z", {
    observePaseoCommand(action, args) {
      if (action === "run") {
        runCalls += 1;
        throw new Error("reconciled launch must not run again");
      }
      assert.deepEqual(args, [
        "--global",
        "--label",
        launchLabel({
          taskId,
          teamRunId: "run-0001",
          attemptId: "reconcile-attempt",
          launchOperationId: "launch-reconcile-attempt",
        }),
      ]);
      const stdout = JSON.stringify([{
        id: "paseo-exact-agent",
        status: "running",
      }]);
      return {
        stdout,
        stderr: "",
        observation: buildObservation({ action: "ls", exitCode: 0, stdout, stderr: "" }),
      };
    },
  });
  assert.equal(runCalls, 0);
  assert.throws(() => invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=reconcile-bind-missing-receipt", "--action=bind",
    "--attempt=reconcile-attempt", "--launch-operation-id=launch-reconcile-attempt",
    "--runtime-agent-id=paseo-exact-agent",
  ]), /Paseo bind requires an exact launch reconciliation receipt/);
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=reconcile-bind", "--action=bind",
    "--attempt=reconcile-attempt", "--launch-operation-id=launch-reconcile-attempt",
    "--runtime-agent-id=paseo-exact-agent", "--observation-id=reconcile-observation",
  ]);
  const wrongActor = buildObservation({
    action: "stop", exitCode: 0,
    stdout: JSON.stringify({ status: "stopped", agent_id: "different-agent" }),
    stderr: "",
  });
  assert.throws(() => recordAttemptObservation(environment, taskId, {
    attemptId: "reconcile-attempt", observationId: "wrong-stop-observation",
    action: "stop", observation: wrongActor,
  }), /receipt does not match the bound runtime agent/);

  invokeControl(runLaneRecord, parseLaneArgs, environment, [
    taskId, "--operation-id=ambiguous-lane-open", "--action=open", "--lane=ambiguous",
  ]);
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    taskId, "--operation-id=ambiguous-dispatch-open", "--action=open", "--lane=ambiguous",
    "--dispatch=ambiguous-dispatch",
  ]);
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=ambiguous-reserve", "--action=reserve",
    "--dispatch=ambiguous-dispatch", "--attempt=ambiguous-attempt",
    "--provider=openai", "--model=gpt-5.6",
    "--capability-snapshot=reconcile-capability",
    "--launch-operation-id=launch-ambiguous-attempt",
  ]);
  assert.throws(() => invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=ambiguous-observe", "--action=observe",
    "--attempt=ambiguous-attempt", "--observation-id=ambiguous-observation",
    "--observer-action=run", '--observer-args-json=["must not launch"]',
  ], "2026-07-10T12:06:00.000Z", {
    observePaseoCommand(action) {
      const stdout = JSON.stringify([
        { id: "agent-one", status: "running" },
        { id: "agent-two", status: "idle" },
      ]);
      return {
        stdout,
        stderr: "",
        observation: buildObservation({ action, exitCode: 0, stdout, stderr: "" }),
      };
    },
  }), /Paseo launch reconciliation is ambiguous/);
  assert.equal(
    readTeam(paths, taskId).observations.some((item) => item.observation_id === "ambiguous-observation"),
    false,
  );

  invokeControl(runLaneRecord, parseLaneArgs, environment, [
    taskId, "--operation-id=crash-lane-open", "--action=open", "--lane=crash",
  ]);
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    taskId, "--operation-id=crash-dispatch-open", "--action=open", "--lane=crash",
    "--dispatch=crash-dispatch",
  ]);
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=crash-reserve", "--action=reserve",
    "--dispatch=crash-dispatch", "--attempt=crash-attempt",
    "--provider=openai", "--model=gpt-5.6",
    "--capability-snapshot=reconcile-capability",
    "--launch-operation-id=launch-crash-attempt",
  ]);
  const crashArgs = [
    taskId, "--operation-id=crash-observe", "--action=observe",
    "--attempt=crash-attempt", "--observation-id=crash-observation",
    "--observer-action=run", '--observer-args-json=["crash once"]',
  ];
  let crashListCalls = 0;
  let crashRunCalls = 0;
  const crashObserver = {
    observePaseoCommand(action) {
      if (action === "ls") {
        crashListCalls += 1;
        const stdout = JSON.stringify([]);
        return {
          stdout,
          stderr: "",
          observation: buildObservation({ action, exitCode: 0, stdout, stderr: "" }),
        };
      }
      crashRunCalls += 1;
      const stderr = JSON.stringify({
        status: "error",
        actor_created: false,
        error: { code: "RUNTIME_CRASH", message: "runtime crashed before actor creation" },
      });
      const observation = buildObservation({ action, exitCode: 43, stdout: "", stderr });
      observation.actor_created = false;
      return { stdout: "", stderr, observation };
    },
  };
  invokeControl(
    runAttemptRecord, parseAttemptArgs, environment, crashArgs,
    "2026-07-10T12:06:00.000Z", crashObserver,
  );
  invokeControl(
    runAttemptRecord, parseAttemptArgs, environment, crashArgs,
    "2026-07-10T12:07:00.000Z", {
      observePaseoCommand() {
        throw new Error("exact replay must not list or relaunch after crash");
      },
    },
  );
  assert.equal(crashListCalls, 1);
  assert.equal(crashRunCalls, 1);
});

test("required perspective admission requires an independently bound actor", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Independent perspective actor gate");
  startNativeRecord(environment, taskId);
  invokeControl(runLaneRecord, parseLaneArgs, environment, [
    taskId, "--operation-id=perspective-lane-open", "--action=open", "--lane=perspective",
  ]);
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    taskId, "--operation-id=perspective-dispatch-open", "--action=open", "--lane=perspective",
    "--dispatch=perspective-dispatch", "--required-perspective=security",
  ]);
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=unbound-perspective-reserve", "--action=reserve",
    "--dispatch=perspective-dispatch", "--attempt=unbound-perspective",
    "--launch-operation-id=launch-unbound-perspective", "--perspective=security",
  ]);
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=unbound-perspective-terminal", "--action=terminal",
    "--attempt=unbound-perspective", "--outcome=succeeded",
  ]);
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=unbound-perspective-quiesce", "--action=quiesced",
    "--attempt=unbound-perspective",
  ]);
  assert.throws(() => invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    taskId, "--operation-id=unbound-perspective-dispose", "--action=dispose",
    "--dispatch=perspective-dispatch", "--disposition=admitted",
    "--admitted-attempts=unbound-perspective",
  ]), /required perspective must be produced by an independently bound actor/);

  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=controller-perspective-reserve", "--action=reserve",
    "--dispatch=perspective-dispatch", "--attempt=controller-perspective",
    "--launch-operation-id=launch-controller-perspective", "--perspective=security",
  ]);
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=controller-perspective-bind", "--action=bind",
    "--attempt=controller-perspective", "--launch-operation-id=launch-controller-perspective",
    "--runtime-agent-id=controller",
  ]);
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=controller-perspective-terminal", "--action=terminal",
    "--attempt=controller-perspective", "--outcome=succeeded",
  ]);
  writeEvidence(paths, taskId, "team/controller-perspective-quiesced.json");
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=controller-perspective-quiesce", "--action=quiesced",
    "--attempt=controller-perspective",
    "--evidence-refs=team/controller-perspective-quiesced.json",
  ]);
  assert.throws(() => invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    taskId, "--operation-id=controller-perspective-dispose", "--action=dispose",
    "--dispatch=perspective-dispatch", "--disposition=admitted",
    "--admitted-attempts=controller-perspective",
  ]), /required perspective must be produced by an independently bound actor/);
});

test("writer lease, trusted retry, and atomic writable fallback preserve ownership", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Writable Paseo fallback");
  runRecordStart(parseRecordStartArgs([
    taskId, "execute a bounded Paseo lane", "--backend=paseo", "--mode=execute",
    "--fallback-policy=codex", "--selection-authority-kind=user-message",
    "--selection-authority-ref=user-message:paseo-writer",
    "--authorization-ref=user-message:execute-writer",
  ]), { environment });
  invokeControl(runLaneRecord, parseLaneArgs, environment, [
    taskId, "--operation-id=writer-lane-open", "--action=open", "--lane=writer",
    "--writable", "--paths=workflow/**",
  ]);
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    taskId, "--operation-id=writer-dispatch-open", "--action=open", "--lane=writer",
    "--dispatch=writer-dispatch",
  ]);
  recordCapability(environment, taskId, {
    snapshotId: "writer-capability", provider: "openai", model: "gpt-5.6",
    family: "non-claude", runtimeModes: ["structured-write-v1"],
  });
  const paseoAttempt = (operationId, attemptId, extra = []) => [
    taskId, `--operation-id=${operationId}`, "--action=reserve", "--dispatch=writer-dispatch",
    `--attempt=${attemptId}`, "--provider=openai", "--model=gpt-5.6",
    "--capability-snapshot=writer-capability",
    "--runtime-mode-id=structured-write-v1", "--writable", "--paths=workflow/**",
    `--launch-operation-id=launch-${attemptId}`, ...extra,
  ];
  invokeControl(runAttemptRecord, parseAttemptArgs, environment,
    paseoAttempt("writer-attempt-reserve-1", "paseo-writer-1"));

  invokeControl(runLaneRecord, parseLaneArgs, environment, [
    taskId, "--operation-id=conflict-lane-open", "--action=open", "--lane=conflict",
    "--writable", "--paths=workflow/bin/**",
  ]);
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    taskId, "--operation-id=conflict-dispatch-open", "--action=open", "--lane=conflict",
    "--dispatch=conflict-dispatch",
  ]);
  assert.throws(
    () => invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
      taskId, "--operation-id=conflict-attempt-reserve", "--action=reserve",
      "--dispatch=conflict-dispatch", "--attempt=conflict-attempt", "--provider=openai",
      "--model=gpt-5.6", "--capability-snapshot=writer-capability",
      "--runtime-mode-id=structured-write-v1", "--writable", "--paths=workflow/bin/**",
      "--launch-operation-id=launch-conflict",
    ]),
    /writer lease conflict/,
  );

  const rateObservation = buildObservation({
    action: "run", exitCode: 42, stdout: "",
    stderr: JSON.stringify({ status: "error", error: {
      code: "RATE_LIMITED", http_status: 429, retry_after_ms: 250,
      message: "provider rate limit",
    } }),
    rawEvidenceRef: "team/raw-rate-limit.json",
  });
  rateObservation.actor_created = false;
  recordAttemptObservation(environment, taskId, {
    attemptId: "paseo-writer-1", observationId: "observation-rate-limit",
    action: "run", observation: rateObservation,
  });
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=writer-terminal-1", "--action=terminal", "--attempt=paseo-writer-1",
    "--outcome=operational-failure", "--failure-class=rate_limited",
    "--observation-id=observation-rate-limit",
    "--retry-eligible=true", "--launch-invoked=true", "--evidence-refs=team/rate-limit.json",
  ]);
  writeEvidence(paths, taskId, "team/quiescence-1.json");
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=writer-quiesce-1", "--action=quiesced", "--attempt=paseo-writer-1",
    "--observation-id=observation-rate-limit", "--evidence-refs=team/quiescence-1.json",
  ]);
  assert.throws(
    () => invokeControl(runFallbackRecord, parseFallbackArgs, environment, [
      taskId, "--operation-id=fallback-too-early", "--from-attempt=paseo-writer-1",
      "--to-attempt=native-writer-early", "--launch-operation-id=launch-native-writer-early",
      "--worktree-fingerprint=sha256:early", "--evidence-refs=team/quiescence-1.json",
    ]),
    /eligible retry must be consumed before fallback/,
  );

  assert.throws(
    () => invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
      taskId, "--operation-id=writer-retry-scope-expansion", "--action=reserve",
      "--dispatch=writer-dispatch", "--attempt=paseo-writer-expanded", "--origin=retry",
      "--retry-of=paseo-writer-1", "--provider=openai", "--model=gpt-5.6",
      "--capability-snapshot=writer-capability",
      "--runtime-mode-id=structured-write-v1", "--writable", "--paths=workflow/bin/**",
      "--launch-operation-id=launch-paseo-writer-expanded",
    ]),
    /attempt owned paths must be an exact subset of lane owned paths|retry must preserve predecessor write scope/,
  );
  invokeControl(runAttemptRecord, parseAttemptArgs, environment,
    paseoAttempt("writer-retry-reserve", "paseo-writer-retry", [
      "--origin=retry", "--retry-of=paseo-writer-1",
    ]));
  const unavailableObservation = buildObservation({
    action: "run", exitCode: 43, stdout: "",
    stderr: JSON.stringify({ status: "error", error: {
      code: "PROVIDER_UNAVAILABLE", message: "provider unavailable",
    } }),
    rawEvidenceRef: "team/raw-provider-unavailable.json",
  });
  unavailableObservation.actor_created = false;
  recordAttemptObservation(environment, taskId, {
    attemptId: "paseo-writer-retry", observationId: "observation-provider-unavailable",
    action: "run", observation: unavailableObservation,
  });
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=writer-retry-terminal", "--action=terminal",
    "--attempt=paseo-writer-retry", "--outcome=operational-failure",
    "--failure-class=provider_unavailable", "--observation-id=observation-provider-unavailable",
    "--launch-invoked=true",
    "--evidence-refs=team/provider-unavailable.json",
  ]);
  writeEvidence(paths, taskId, "team/quiescence-retry.json", "team/worktree-status.json");
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=writer-retry-quiesce", "--action=quiesced",
    "--attempt=paseo-writer-retry", "--observation-id=observation-provider-unavailable",
    "--evidence-refs=team/quiescence-retry.json",
  ]);
  assert.throws(
    () => invokeControl(runFallbackRecord, parseFallbackArgs, environment, [
      taskId, "--operation-id=fallback-missing-takeover", "--from-attempt=paseo-writer-retry",
      "--to-attempt=native-writer", "--launch-operation-id=launch-native-writer",
    ]),
    /writable fallback requires takeover fingerprint and evidence/,
  );
  invokeControl(runFallbackRecord, parseFallbackArgs, environment, [
    taskId, "--operation-id=fallback-writer", "--from-attempt=paseo-writer-retry",
    "--to-attempt=native-writer", "--launch-operation-id=launch-native-writer",
    "--worktree-fingerprint=sha256:preserved-worktree",
    "--evidence-refs=team/quiescence-retry.json,team/worktree-status.json",
  ]);
  let team = readTeam(paths, taskId);
  assert.equal(team.fallback_events.length, 1);
  assert.equal(team.takeover_permits.length, 1);
  assert.equal(team.takeover_permits[0].authorization_ref, "user-message:execute-writer");
  assert.deepEqual(team.attempts.find((item) => item.attempt_id === "native-writer").owned_paths, ["workflow/**"]);
  assert.equal(team.writer_leases.find((item) => item.owner_attempt_id === "native-writer").state, "active");

  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=native-writer-terminal", "--action=terminal", "--attempt=native-writer",
    "--outcome=succeeded", "--launch-invoked=true", "--evidence-refs=team/native-result.md",
  ]);
  writeEvidence(paths, taskId, "team/native-quiescence.json");
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=native-writer-quiesce", "--action=quiesced", "--attempt=native-writer",
    "--evidence-refs=team/native-quiescence.json",
  ]);
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    taskId, "--operation-id=writer-dispatch-dispose", "--action=dispose",
    "--dispatch=writer-dispatch", "--disposition=admitted", "--admitted-attempts=native-writer",
    "--evidence-refs=team/native-result.md",
  ]);
  team = readTeam(paths, taskId);
  assert.deepEqual(team.attempted_backends, ["native", "paseo"]);
  assert.equal(team.effective_backend, "native");
  assert.equal(team.writer_leases.filter((item) => item.state === "active").length, 0);
});

test("no-fallback records backend-unavailable and finalizes effective none", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Paseo unavailable without fallback");
  runRecordStart(parseRecordStartArgs([
    taskId, "review without fallback", "--backend=paseo", "--mode=discuss",
    "--fallback-policy=none", "--selection-authority-kind=user-message",
    "--selection-authority-ref=user-message:no-fallback",
  ]), { environment });
  invokeControl(runLaneRecord, parseLaneArgs, environment, [
    taskId, "--operation-id=no-fallback-lane-open", "--action=open", "--lane=review",
  ]);
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    taskId, "--operation-id=no-fallback-dispatch-open", "--action=open", "--lane=review",
    "--dispatch=no-fallback-dispatch",
  ]);
  recordCapability(environment, taskId, {
    snapshotId: "no-fallback-capability", provider: "openai", model: "gpt-5.6",
    family: "non-claude",
  });
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=no-fallback-attempt-reserve", "--action=reserve",
    "--dispatch=no-fallback-dispatch", "--attempt=paseo-unavailable", "--provider=openai",
    "--model=gpt-5.6", "--capability-snapshot=no-fallback-capability",
    "--launch-operation-id=launch-paseo-unavailable",
  ]);
  const quotaObservation = buildObservation({
    action: "run", exitCode: 44, stdout: "",
    stderr: JSON.stringify({ status: "error", error: {
      code: "QUOTA_EXHAUSTED", message: "quota exhausted",
    } }),
  });
  quotaObservation.actor_created = false;
  recordAttemptObservation(environment, taskId, {
    attemptId: "paseo-unavailable", observationId: "observation-quota",
    action: "run", observation: quotaObservation,
  });
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=no-fallback-terminal", "--action=terminal",
    "--attempt=paseo-unavailable", "--outcome=operational-failure",
    "--failure-class=quota_exhausted", "--observation-id=observation-quota",
    "--launch-invoked=true",
  ]);
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=no-fallback-quiesce", "--action=quiesced",
    "--attempt=paseo-unavailable", "--observation-id=observation-quota",
  ]);
  assert.throws(
    () => invokeControl(runFallbackRecord, parseFallbackArgs, environment, [
      taskId, "--operation-id=no-fallback-rejected", "--from-attempt=paseo-unavailable",
      "--to-attempt=native-not-allowed", "--launch-operation-id=launch-native-not-allowed",
    ]),
    /fallback policy is none/,
  );
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    taskId, "--operation-id=no-fallback-dispose", "--action=dispose",
    "--dispatch=no-fallback-dispatch", "--disposition=backend-unavailable",
    "--evidence-refs=team/observation-quota.json",
  ]);
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    taskId, "--operation-id=no-fallback-close", "--action=close",
    "--dispatch=no-fallback-dispatch",
  ]);
  invokeControl(runLaneRecord, parseLaneArgs, environment, [
    taskId, "--operation-id=no-fallback-lane-close", "--action=close", "--lane=review",
    "--convergence=CONSENSUS_WITH_RESERVATIONS",
  ]);
  const directory = teamDir(paths, taskId);
  const round = path.join(directory, "round-none.md");
  const decision = teamDecisionFile(paths, taskId);
  const staffing = teamStaffingFile(paths, taskId);
  fs.writeFileSync(round, "# Round\n\n- backend: none\n\nPaseo was unavailable and no fallback was authorized.\n");
  fs.writeFileSync(decision, "# Decision\n\n- backend: none\n\nNo result was admitted because Paseo was unavailable.\n");
  fs.writeFileSync(staffing, "# Staffing\n\n- backend: none\n\nThe requested provider perspective remains unavailable.\n");
  runRecordFinalize(parseRecordFinalizeArgs([
    taskId, "--backend=native", "--status=failed",
    `--round=${round}`, `--decision=${decision}`, `--staffing=${staffing}`,
  ]), { environment });
  const sidecar = readJsonObject(path.join(directory, "backend-v2.json"));
  assert.equal(sidecar.effective_backend, "none");
  assert.equal(sidecar.legacy_projection, true);
  assert.deepEqual(sidecar.lanes, []);
  assert.equal(getTaskField(taskFile(paths.tasksDir, taskId), "active_team_backend"), "native");
});

test("v2 state resists stale Markdown headers and generations do not import running legacy state", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Protect v2 runtime state");
  startNativeRecord(environment, taskId);
  updateTaskFields(taskFile(paths.tasksDir, taskId), {
    active_team_backend: "paseo",
    active_team_mode: "execute",
    active_team_status: "failed",
    active_team_decision: "stale/decision.md",
  });
  runStatus([taskId], { environment });
  let team = readTeam(paths, taskId);
  assert.equal(team.schema_version, 2);
  assert.equal(team.backend, "native");
  assert.equal(team.mode, "discuss");
  assert.equal(team.status, "running");
  assert.notEqual(team.decision, "stale/decision.md");

  runStop([taskId], { environment });
  const second = startNativeRecord(environment, taskId, "2026-07-10T12:07:00.000Z");
  assert.ok(second.lines.includes("team_run_id: run-0002"));
  assert.ok(second.lines.includes("generation: 2"));
  team = readTeam(paths, taskId);
  assert.equal(team.generation, 2);

  const legacyTaskId = createFixtureTask(environment, "Reject running legacy import");
  updateTaskCommand(paths, legacyTaskId, {
    active_team_backend: "legacy",
    active_team_mode: "discuss",
    active_team_status: "running",
  }, {
    "active_team.backend": "legacy",
    "active_team.mode": "discuss",
    "active_team.status": "running",
  }, clockAt("2026-07-10T12:08:00.000Z"));
  assert.throws(
    () => startNativeRecord(environment, legacyTaskId, "2026-07-10T12:09:00.000Z"),
    /legacy-running team must finish or stop before v2 start/,
  );
  assert.notEqual(readTeam(paths, legacyTaskId).schema_version, 2);
});

test("admission aggregation derives mixed backend without caller override", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Mixed admitted backends");
  startNativeRecord(environment, taskId);

  function completeLane({ lane, backend = "native", selectionEvent = "" }) {
    const attempt = `${lane}-attempt`;
    const dispatch = `${lane}-dispatch`;
    const evidence = `team/${lane}-result.md`;
    fs.writeFileSync(path.join(taskArtifactDir(paths, taskId), evidence), `${lane} result evidence\n`);
    const laneArgs = [
      taskId, `--operation-id=${lane}-lane-open`, "--action=open", `--lane=${lane}`,
    ];
    if (backend === "paseo") {
      laneArgs.push("--backend=paseo", `--selection-event=${selectionEvent}`);
    }
    invokeControl(runLaneRecord, parseLaneArgs, environment, laneArgs);
    invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
      taskId, `--operation-id=${lane}-dispatch-open`, "--action=open", `--lane=${lane}`,
      `--dispatch=${dispatch}`,
    ]);
    const reserveArgs = [
      taskId, `--operation-id=${lane}-attempt-reserve`, "--action=reserve",
      `--dispatch=${dispatch}`, `--attempt=${attempt}`,
      `--launch-operation-id=launch-${attempt}`,
    ];
    if (backend === "paseo") {
      reserveArgs.push(
        "--provider=openai", "--model=gpt-5.6", "--capability-snapshot=mixed-capability",
      );
    }
    invokeControl(runAttemptRecord, parseAttemptArgs, environment, reserveArgs);
    if (backend === "paseo") {
      const launchObservation = buildObservation({
        action: "run", exitCode: 0,
        stdout: JSON.stringify({ status: "running", agent: { id: `${attempt}-agent` } }),
        stderr: "",
      });
      recordAttemptObservation(environment, taskId, {
        attemptId: attempt, observationId: `${attempt}-launch-observation`,
        action: "run", observation: launchObservation,
      });
      invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
        taskId, `--operation-id=${lane}-attempt-bind`, "--action=bind",
        `--attempt=${attempt}`, `--launch-operation-id=launch-${attempt}`,
        `--runtime-agent-id=${attempt}-agent`,
        `--observation-id=${attempt}-launch-observation`,
      ]);
      invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
        taskId, `--operation-id=${lane}-attempt-running`, "--action=running",
        `--attempt=${attempt}`,
      ]);
    }
    invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
      taskId, `--operation-id=${lane}-attempt-terminal`, "--action=terminal",
      `--attempt=${attempt}`, "--outcome=succeeded", "--launch-invoked=true",
      `--evidence-refs=${evidence}`,
    ]);
    let quiescenceObservationArgs = [];
    if (backend === "paseo") {
      const stopObservation = buildObservation({
        action: "stop", exitCode: 0,
        stdout: JSON.stringify({ status: "stopped", agent_id: `${attempt}-agent` }),
        stderr: "",
      });
      recordAttemptObservation(environment, taskId, {
        attemptId: attempt, observationId: `${attempt}-stop-observation`,
        action: "stop", observation: stopObservation,
      });
      quiescenceObservationArgs = [`--observation-id=${attempt}-stop-observation`];
    }
    writeEvidence(paths, taskId, `team/${lane}-quiesced.json`);
    invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
      taskId, `--operation-id=${lane}-attempt-quiesced`, "--action=quiesced",
      `--attempt=${attempt}`, ...quiescenceObservationArgs,
      `--evidence-refs=team/${lane}-quiesced.json`,
    ]);
    invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
      taskId, `--operation-id=${lane}-dispatch-dispose`, "--action=dispose",
      `--dispatch=${dispatch}`, "--disposition=admitted", `--admitted-attempts=${attempt}`,
      `--evidence-refs=${evidence}`,
    ]);
    invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
      taskId, `--operation-id=${lane}-dispatch-close`, "--action=close", `--dispatch=${dispatch}`,
    ]);
    invokeControl(runLaneRecord, parseLaneArgs, environment, [
      taskId, `--operation-id=${lane}-lane-close`, "--action=close", `--lane=${lane}`,
      "--convergence=CONSENSUS",
    ]);
  }

  completeLane({ lane: "native" });
  invokeControl(runSelectionRecord, parseSelectionArgs, environment, [
    taskId, "--operation-id=mixed-paseo-selection-op", "--event-id=mixed-paseo-selection",
    "--kind=backend", "--scope=lane:paseo", "--authority-kind=user-message",
    "--authority-ref=user-message:mixed-paseo", "--backend=paseo",
  ]);
  recordCapability(environment, taskId, {
    snapshotId: "mixed-capability", provider: "openai", model: "gpt-5.6",
    family: "non-claude",
  });
  completeLane({ lane: "paseo", backend: "paseo", selectionEvent: "mixed-paseo-selection" });

  const directory = teamDir(paths, taskId);
  const round = path.join(directory, "round-mixed.md");
  const decision = teamDecisionFile(paths, taskId);
  const staffing = teamStaffingFile(paths, taskId);
  fs.writeFileSync(round, "# Round\n\n- backend: mixed\n\nNative and Paseo evidence were both admitted.\n");
  fs.writeFileSync(decision, "# Decision\n\n- backend: mixed\n\nThe controller admitted both independent backend results.\n");
  fs.writeFileSync(staffing, "# Staffing\n\n- backend: mixed\n\nNative and Paseo lanes retained distinct provenance.\n");
  const result = runRecordFinalize(parseRecordFinalizeArgs([
    taskId, "--backend=native", "--status=complete",
    `--round=${round}`, `--decision=${decision}`, `--staffing=${staffing}`,
  ]), { environment });
  assert.ok(result.lines.includes("backend: mixed"));
  const sidecar = readJsonObject(path.join(directory, "backend-v2.json"));
  assert.equal(sidecar.effective_backend, "mixed");
  assert.equal(sidecar.legacy_projection, true);
  assert.deepEqual(sidecar.attempted_backends, ["native", "paseo"]);
  assert.deepEqual(sidecar.lanes.map((lane) => lane.effective_backend).sort(), ["native", "paseo"]);
  assert.equal(getTaskField(taskFile(paths.tasksDir, taskId), "active_team_backend"), "native");
});
