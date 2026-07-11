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
const { updateTaskCommand } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/core/command-runtime.js",
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
  parseLoopRecordArgs,
  parsePromoteArgs,
  parseRecordFinalizeArgs,
  parseRecordStartArgs,
  runLoopRecord,
  runPromote,
  runRecordFinalize,
  runRecordStart,
  runStatus,
  runStop,
  teamDecisionFile,
  teamDir,
  teamLockFile,
  teamStaffingFile,
} = require(path.join(WORKFLOW_ROOT, "bin/lib/codex-workflow/team/commands.js"));

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
  return createTask(title, "native team contract", {
    clock: clockAt("2026-07-10T12:00:00.000Z"),
    environment,
  });
}

function startNativeRecord(environment, taskId, clock = "2026-07-10T12:01:00.000Z") {
  return runRecordStart(
    parseRecordStartArgs([
      taskId,
      "implement the bounded native team slice",
      "--backend=native",
      "--mode",
      "discuss",
      "--agents=3",
      "--roles",
      "executor,reviewer,verifier",
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

function readEvents(paths, taskId) {
  return fs
    .readFileSync(taskRuntimeFile(paths, taskId), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
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
          "missing-task",
          "objective",
          "--backend=native",
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
  ]);
  const file = taskFile(paths.tasksDir, taskId);
  assert.equal(getTaskField(file, "active_team_backend"), "native");
  assert.equal(getTaskField(file, "active_team_status"), "running");
  const state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(state.active_team.agents, 3);
  assert.equal(state.active_team.roles, "executor,reviewer,verifier");
  assert.equal(state.active_team.temp_dir, "");
  assert.equal(fs.existsSync(`${teamLockFile(taskId, environment)}.dir`), false);
  assert.deepEqual(readEvents(paths, taskId).at(-1), {
    kind: "team-record-start",
    detail: "native/discuss roles=executor,reviewer,verifier",
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
    backend: "native",
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
  assert.equal(result.lines.at(-1), "authorization_ref: user-message:implement-roadmap");
  assert.equal(
    readJsonObject(stateFile).active_team.authorization_ref,
    "user-message:implement-roadmap",
  );
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
    "backend: native",
    "status: complete",
    `decision: ${decision}`,
    `staffing: ${staffing}`,
    `round: ${round}`,
  ]);
  const state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(state.active_team.status, "complete");
  assert.match(state.active_team.round_file, /team\/round-native\.md$/);
  assert.match(state.active_team.staffing, /team\/staffing\.md$/);
  assert.equal(state.active_team.temp_dir, "");
  assert.deepEqual(readEvents(paths, taskId).at(-1), {
    kind: "team-record-finalize",
    detail: `native/complete round=${state.active_team.round_file}`,
    created_at: "2026-07-10T12:02:00Z",
  });
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
    "backend: native",
    "status: loop-done",
    `loop: ${loop}`,
    "iterations: 1",
  ]);
  const state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(state.active_team.status, "loop-done");
  assert.equal(state.active_team.loop.iteration, 1);
  assert.equal(state.active_team.loop.max_iterations, 2);
  assert.equal(state.active_team.loop.max_time, "10m");
  assert.match(readEvents(paths, taskId).at(-1).detail, /iterations=1$/);
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
  assert.equal(status.lines.length, 20);
  assert.deepEqual(status.lines.slice(4), [
    "team_backend: legacy",
    "team_mode: execute",
    "team_status: loop-failed",
    `team_decision: workflow/artifacts/${taskId}/team/decision.md`,
    "team_objective: legacy objective",
    "team_agents: 2",
    "team_roles: worker,verifier",
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
