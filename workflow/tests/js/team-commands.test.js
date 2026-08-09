"use strict";

const assert = require("assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const test = require("node:test");

const WORKFLOW_ROOT = path.resolve(__dirname, "../..");
const PUBLIC_BIN = path.join(WORKFLOW_ROOT, "bin", "codex-workflow");
const TEAM_LEDGER_BIN = path.resolve(
  WORKFLOW_ROOT, "../plugins/atlas-workflow/scripts/codex-team-ledger",
);
const TEMPLATE_DIR = path.join(WORKFLOW_ROOT, "templates");
const { resolvePaths, taskArtifactDir } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/core/paths.js",
));
const { updateTaskCommand } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/core/command-runtime.js",
));
const {
  authoritativeEventDigest,
  canonicalJson,
  sha256: eventStoreSha256,
} = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/core/event-store.js",
));
const { taskEventFile } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/core/task-mutation.js",
));
const { reconcileTaskRuntime } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/core/reconcile.js",
));
const { taskMutationLockFile } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/core/lock.js",
));
const { archiveTask, completeTask, createTask, startTask } = require(path.join(
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
const {
  formatCommand,
  parseVerifyArgs,
  runVerification,
} = require(path.join(WORKFLOW_ROOT, "bin/lib/codex-workflow/verification/runner.js"));
const { executionCompletionAdmission, requiredGateAdmission } = require(path.join(
  WORKFLOW_ROOT, "bin/lib/codex-workflow/verification/required-gates.js",
));
const { globalAdmissionLockFile } = require(path.join(
  WORKFLOW_ROOT, "bin/lib/codex-workflow/team/admission.js",
));
const {
  parseSliceAcceptArgs,
  parseSliceSupersedeArgs,
  runSliceAccept,
  runSliceSupersede,
} = require(path.join(WORKFLOW_ROOT, "bin/lib/codex-workflow/team/slice-acceptance.js"));

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

function spawnWorkflow(environment, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(PUBLIC_BIN, args, { cwd, env: environment });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stderr, stdout }));
  });
}

async function waitForFile(file, timeoutMilliseconds = 3000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if (fs.existsSync(file)) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out waiting for file: ${file}`);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function executionBrief(paths, taskId, options = {}) {
  const repo = path.join(paths.root, "execution-repo");
  fs.mkdirSync(repo, { recursive: true });
  spawnSync("git", ["init", "-q", repo], { encoding: "utf8" });
  spawnSync("git", ["-C", repo, "config", "user.email", "atlas@example.test"]);
  spawnSync("git", ["-C", repo, "config", "user.name", "Atlas Test"]);
  const slice = {
    slice_id: options.sliceId || "execution-slice",
    objective: "execute the admitted test slice",
    depends_on: options.dependsOn || [],
    keeper_outputs: ["event:execution-slice-complete"],
    owned_paths: options.ownedPaths || ["workflow/test-owned/**"],
    forbidden_paths: [],
    acceptance_refs: ["AC-EXECUTE"],
    risk_class: "high",
    failure_domain: "team-execution",
    rollback_boundary: "one logical commit",
    estimate: options.estimate || {
      estimated_changed_files: 2,
      estimated_net_loc: 200,
      target_p90_minutes: 30,
      serial_dependency_depth: (options.dependsOn || []).length > 0 ? 1 : 0,
      independent_vertical_count: 1,
    },
    budget: options.budget || {
      max_changed_files: 4,
      max_loc: 400,
      max_wall_clock_minutes: 60,
      max_required_checks: 2,
    },
    checks: options.checks || [{
      check_id: "execution-contract",
      gate_class: options.gateClass || "contract",
      command: options.command || "bash workflow/tests/contract_team_native.sh",
      final_only: false,
      cache_policy: options.cachePolicy || "identity-bound",
    }],
  };
  if (options.sizeException) slice.size_exception = options.sizeException;
  const dependencySlices = (options.dependsOn || []).map((sliceId) => ({
    ...slice,
    slice_id: sliceId,
    objective: `produce ${sliceId}`,
    depends_on: [],
    keeper_outputs: [`event:${sliceId}:ready`],
    owned_paths: [`dependencies/${sliceId}/**`],
    acceptance_refs: [`AC-${sliceId}`],
    checks: [{ ...slice.checks[0], check_id: `check-${sliceId}` }],
    estimate: { ...slice.estimate, serial_dependency_depth: 0 },
  }));
  const plan = {
    schema_version: 1,
    size_policy: { policy_id: "atlas-slice-size-v2" },
    slices: [...dependencySlices, slice],
  };
  const contract = path.join(repo, "implementation-contract.final.md");
  fs.writeFileSync(contract, [
    "# Test Contract",
    "",
    `task_id: ${taskId}`,
    "contract_semantics_version: 3",
    "",
    "```atlas-execution-plan+json",
    JSON.stringify(plan, null, 2),
    "```",
    "",
  ].join("\n"));
  spawnSync("git", ["-C", repo, "add", "implementation-contract.final.md"]);
  spawnSync("git", ["-C", repo, "commit", "-qm", "test: execution contract"]);
  const baseSha = spawnSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
  const slices = new Map(plan.slices.map((item) => [item.slice_id, item]));
  const contractIdentity = {
    path: contract,
    sha256: `sha256:${sha256(fs.readFileSync(contract))}`,
    semantics_version: 3,
    execution_plan_sha256: `sha256:${sha256(JSON.stringify(stableValue(plan)))}`,
  };
  const briefs = {};
  const briefPaths = {};
  for (const selected of plan.slices) {
    const brief = {
      schema_version: 3,
      task_id: taskId,
      slice_id: selected.slice_id,
      repo,
      base_sha: baseSha,
      objective: selected.objective,
      requirements_path: "brief.md",
      global_constraints_path: "../../global-constraints.md",
      contract: contractIdentity,
      dependencies: selected.depends_on.map((sliceId) => ({
        slice_id: sliceId,
        required_outcome: "succeeded",
        keeper_outputs: slices.get(sliceId).keeper_outputs,
      })),
      keeper_outputs: selected.keeper_outputs,
      owned_paths: selected.owned_paths,
      forbidden_paths: selected.forbidden_paths,
      acceptance_refs: selected.acceptance_refs,
      risk_class: selected.risk_class,
      failure_domain: selected.failure_domain,
      rollback_boundary: selected.rollback_boundary,
      budget: selected.budget,
      checks: selected.checks,
      size_gate: {
        decision: selected.size_exception ? "exception" : options.sizeDecision || "pass",
        policy_id: "atlas-slice-size-v2",
        estimate: selected.estimate,
        exception: selected.size_exception || null,
      },
      commit_policy: "logical_outcome",
      output_contract: "final_message_json_only",
    };
    const briefDir = path.join(
      paths.artifactsDir, taskId, "team", "sdd", "slices", selected.slice_id,
    );
    fs.mkdirSync(briefDir, { recursive: true });
    const briefPath = path.join(briefDir, "brief.json");
    fs.writeFileSync(briefPath, `${JSON.stringify(brief, null, 2)}\n`);
    briefs[selected.slice_id] = brief;
    briefPaths[selected.slice_id] = briefPath;
  }
  const selectedId = options.briefSliceId || slice.slice_id;
  return {
    brief: briefs[selectedId],
    briefPath: briefPaths[selectedId],
    briefPaths,
    briefs,
    contract,
    plan,
    repo,
  };
}

function acceptedExecution(environment, paths, title = "Accepted execution") {
  const taskId = createFixtureTask(environment, title);
  const checkCommand = [process.execPath, "-e", "process.exit(0)"];
  const ownedRoot = `workflow/test-owned/${taskId}`;
  const admission = executionBrief(paths, taskId, {
    command: formatCommand(checkCommand).trimEnd(),
    ownedPaths: [`${ownedRoot}/**`],
  });
  const source = path.join(admission.repo, ownedRoot, "source.js");
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.writeFileSync(source, "module.exports = 'accepted';\n");
  spawnSync("git", ["-C", admission.repo, "add", `${ownedRoot}/source.js`]);
  const stagedSource = spawnSync(
    "git", ["-C", admission.repo, "diff", "--cached", "--quiet"], { encoding: "utf8" },
  );
  if (stagedSource.status === 1) {
    const sourceCommit = spawnSync(
      "git", ["-C", admission.repo, "commit", "-qm", "test: seed accepted source"],
      { encoding: "utf8" },
    );
    assert.equal(sourceCommit.status, 0, sourceCommit.stderr);
  } else {
    assert.equal(stagedSource.status, 0, stagedSource.stderr);
  }
  runRecordStart(parseRecordStartArgs([
    taskId, "execute accepted snapshot", "--mode=execute",
    "--authorization-ref=user-message:accepted-snapshot",
    `--brief=${admission.briefPath}`, "--operation-id=start-accepted-snapshot",
  ]), { cwd: admission.repo, environment });
  runPromote(parsePromoteArgs([taskId, "--to=finish"]), {
    environment,
    operationId: "finish-accepted-snapshot",
  });
  const keeperRelative = `${ownedRoot}/keeper.txt`;
  const keeper = path.join(admission.repo, keeperRelative);
  fs.writeFileSync(keeper, "accepted keeper\n");
  runVerification(parseVerifyArgs([
    taskId, `--brief=${admission.briefPath}`, "--slice-id=execution-slice",
    "--check-id=execution-contract", "--", ...checkCommand,
  ]), {
    cwd: admission.repo,
    environment,
    operationId: "verify-accepted-snapshot",
    recordToken: "20260729T010000000000001",
  });
  runSliceAccept(parseSliceAcceptArgs([
    taskId, `--brief=${admission.briefPath}`, "--operation-id=accept-snapshot",
    `--keeper-output=event:execution-slice-complete=${keeperRelative}`,
  ]), { environment });
  return { admission, checkCommand, keeper, keeperRelative, source, taskId };
}

function authoritativeEvents(paths, taskId) {
  return fs.readFileSync(taskEventFile(paths, taskId), "utf8")
    .trim().split("\n").map((line) => JSON.parse(line));
}

function commitAcceptedWorktree(repo, message) {
  assert.equal(spawnSync("git", ["-C", repo, "add", "-A"]).status, 0);
  const committed = spawnSync("git", ["-C", repo, "commit", "-qm", message], {
    encoding: "utf8",
  });
  assert.equal(committed.status, 0, committed.stderr);
  return {
    head_sha: spawnSync("git", ["-C", repo, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).stdout.trim(),
    tree_oid: spawnSync("git", ["-C", repo, "rev-parse", "HEAD^{tree}"], {
      encoding: "utf8",
    }).stdout.trim(),
  };
}

function withReadFileGuard(forbiddenFile, callback) {
  const original = fs.readFileSync;
  fs.readFileSync = function guardedReadFileSync(file, ...args) {
    if (path.resolve(String(file)) === path.resolve(forbiddenFile)) {
      throw new Error(`unexpected read of guarded file: ${forbiddenFile}`);
    }
    return original.call(this, file, ...args);
  };
  try {
    return callback();
  } finally {
    fs.readFileSync = original;
  }
}

function signControlRecord(value) {
  const unsigned = { ...value };
  delete unsigned.digest;
  return { ...unsigned, digest: eventStoreSha256(canonicalJson(unsigned)) };
}

function readControlJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeControlJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(signControlRecord(value), null, 2)}\n`);
}

function writerControlSnapshotFile(paths) {
  return path.join(paths.stateDir, "team-writer-leases.json");
}

function writerControlJournalFile(paths) {
  return path.join(paths.stateDir, "team-writer-leases.recovery.json");
}

function writerControlForensicFile(paths) {
  return path.join(paths.stateDir, "team-writer-leases.forensic.json");
}

function makeOversizedAuthoritativeEvents(paths, taskId, options = {}) {
  const eventFile = taskEventFile(paths, taskId);
  const latest = authoritativeEvents(paths, taskId).at(-1);
  const stateFile = taskStateFile(paths, taskId);
  const state = readJsonObject(stateFile);
  if (options.mismatchState) {
    state.last_event_id = "mismatched-event";
    state.runtime_revision = latest.revision + 1;
    fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
  }
  const filler = `${JSON.stringify({ filler: "x".repeat(4096) })}\n`;
  const fillerCount = 260;
  fs.writeFileSync(
    eventFile,
    `${filler.repeat(fillerCount)}${JSON.stringify(latest)}\n`,
  );
  assert.ok(fs.statSync(eventFile).size > 1024 * 1024);
  return eventFile;
}

test("managed SDD ledger rows survive canonical mutation and reconciliation", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const fixture = acceptedExecution(environment, paths, "Managed progress ledger");
  const progress = path.join(
    paths.artifactsDir, fixture.taskId, "team", "sdd", "progress.jsonl",
  );
  const appended = spawnSync(process.execPath, [
    TEAM_LEDGER_BIN, "--task", fixture.taskId, "append", "--event", "fix_started", "--json",
    JSON.stringify({ task_id: fixture.taskId, slice_id: "execution-slice", iteration: 1 }),
  ], { encoding: "utf8", env: environment });
  assert.equal(appended.status, 0, appended.stderr);
  assert.equal(authoritativeEvents(paths, fixture.taskId).at(-1).kind, "team.ledger.appended");

  updateTaskCommand(
    paths,
    fixture.taskId,
    {},
    { current_phase: "repair" },
    clockAt("2026-07-29T01:05:00.000Z"),
  );
  assert.match(fs.readFileSync(progress, "utf8"), /"event":"fix_started"/);

  fs.appendFileSync(progress, `${JSON.stringify({ forged: true })}\n`);
  assert.equal(reconcileTaskRuntime(fixture.taskId, { environment }).status, "diverged");
  reconcileTaskRuntime(fixture.taskId, {
    apply: true,
    authorityRef: "test:restore-managed-progress",
    environment,
    reason: "restore canonical managed progress projection",
  });
  const reconciled = fs.readFileSync(progress, "utf8");
  assert.match(reconciled, /"event":"fix_started"/);
  assert.doesNotMatch(reconciled, /"forged":true/);
});

test("first canonical ledger append adopts a valid pre-event progress file", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Adopt legacy progress ledger");
  const progress = path.join(paths.artifactsDir, taskId, "team", "sdd", "progress.jsonl");
  fs.mkdirSync(path.dirname(progress), { recursive: true });
  fs.writeFileSync(progress, `${JSON.stringify({
    schema_version: 1,
    event: "run_started",
    task_id: taskId,
    timestamp: "2026-07-29T01:00:00.000Z",
  })}\n`);
  const appended = spawnSync(process.execPath, [
    TEAM_LEDGER_BIN, "--task", taskId, "append", "--event", "preflight_clean", "--json",
    JSON.stringify({ task_id: taskId }),
  ], { encoding: "utf8", env: environment });
  assert.equal(appended.status, 0, appended.stderr);
  const rows = fs.readFileSync(progress, "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(rows.map((row) => row.event), ["run_started", "preflight_clean"]);
  assert.equal(authoritativeEvents(paths, taskId).at(-1).kind, "team.ledger.appended");
});

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

  const admission = executionBrief(paths, taskId);
  const result = runRecordStart(
    {
      ...parsed,
      authorizationRef: "user-message:implement-roadmap",
      briefPath: admission.briefPath,
      operationId: "start-execution",
    },
    { cwd: admission.repo, environment },
  );
  assert.ok(result.lines.includes("authorization_ref: user-message:implement-roadmap"));
  assert.equal(
    readJsonObject(stateFile).active_team.authorization_ref,
    "user-message:implement-roadmap",
  );
  const runtimeAfterStart = fs.readFileSync(runtimeFile, "utf8");
  runRecordStart(
    {
      ...parsed,
      authorizationRef: "user-message:implement-roadmap",
      briefPath: admission.briefPath,
      operationId: "start-execution",
    },
    { cwd: admission.repo, environment },
  );
  assert.equal(fs.readFileSync(runtimeFile, "utf8"), runtimeAfterStart);
  const briefBeforeReplayConflict = fs.readFileSync(admission.briefPath);
  fs.appendFileSync(admission.briefPath, "\n");
  assert.throws(() => runRecordStart(
    {
      ...parsed,
      authorizationRef: "user-message:implement-roadmap",
      briefPath: admission.briefPath,
      operationId: "start-execution",
    },
    { cwd: admission.repo, environment },
  ), /team start operation_id replay conflict/);
  fs.writeFileSync(admission.briefPath, briefBeforeReplayConflict);
  assert.throws(() => runRecordStart(
    {
      ...parsed,
      objective: "conflicting replay objective",
      authorizationRef: "user-message:implement-roadmap",
      briefPath: admission.briefPath,
      operationId: "start-execution",
    },
    { cwd: admission.repo, environment },
  ), /team start operation_id replay conflict/);
});

test("execute admission requires keeper-ready succeeded dependencies", async (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Dependency admission");
  const checkCommand = [process.execPath, "-e", "process.exit(0)"];
  const admission = executionBrief(paths, taskId, {
    command: formatCommand(checkCommand).trimEnd(),
    dependsOn: ["foundation"],
  });
  const parsed = parseRecordStartArgs([
    taskId, "execute dependent slice", "--mode=execute",
    "--authorization-ref=user-message:dependency-execute",
    `--brief=${admission.briefPath}`, "--operation-id=start-dependent-slice",
  ]);
  assert.throws(
    () => runRecordStart(parsed, { cwd: admission.repo, environment }),
    /dependency is not keeper-ready succeeded: foundation/,
  );
  const progress = path.join(paths.artifactsDir, taskId, "team", "sdd", "progress.jsonl");
  const forged = spawnSync(process.execPath, [
    TEAM_LEDGER_BIN, "--task", taskId, "append", "--event", "slice_complete", "--json",
    JSON.stringify({
    task_id: taskId,
    slice_id: "foundation",
    outcome: "succeeded",
    keeper_outputs: ["event:foundation:ready"],
    }),
  ], { encoding: "utf8", env: environment });
  assert.equal(forged.status, 0, forged.stderr);
  assert.throws(
    () => runRecordStart(parsed, { cwd: admission.repo, environment }),
    /dependency is not keeper-ready succeeded: foundation/,
  );

  runRecordStart(parseRecordStartArgs([
    taskId, "discuss foundation slice", "--mode=discuss",
    `--brief=${admission.briefPaths.foundation}`, "--operation-id=discuss-foundation",
  ]), { cwd: admission.repo, environment });
  runPromote(parsePromoteArgs([
    taskId, "--to=execute", "--authorization-ref=user-message:foundation-execute",
    `--brief=${admission.briefPaths.foundation}`, "--operation-id=promote-foundation",
  ]), { cwd: admission.repo, environment });
  runPromote(parsePromoteArgs([taskId, "--to=finish"]), {
    environment,
    operationId: "finish-foundation",
  });
  const keeper = path.join(admission.repo, "dependencies", "foundation", "keeper.txt");
  fs.mkdirSync(path.dirname(keeper), { recursive: true });
  fs.writeFileSync(keeper, "foundation keeper\n");
  runVerification(parseVerifyArgs([
    taskId, `--brief=${admission.briefPaths.foundation}`, "--slice-id=foundation",
    "--check-id=check-foundation", "--", ...checkCommand,
  ]), {
    cwd: admission.repo,
    environment,
    operationId: "verify-foundation",
    recordToken: "20260710T120600000000001",
  });
  assert.throws(() => runSliceAccept(parseSliceAcceptArgs([
    taskId, `--brief=${admission.briefPaths.foundation}`,
    "--operation-id=accept-foundation-with-unowned-keeper",
    "--keeper-output=event:foundation:ready=implementation-contract.final.md",
  ]), { environment }), /keeper output is outside admitted ownership/);
  runSliceAccept(parseSliceAcceptArgs([
    taskId, `--brief=${admission.briefPaths.foundation}`,
    "--operation-id=accept-foundation",
    "--keeper-output=event:foundation:ready=dependencies/foundation/keeper.txt",
  ]), { environment });
  assert.throws(
    () => completeTask(taskId, { environment, operationId: "done-after-foundation-only" }),
    /missing authoritative accepted slice: execution-slice/,
  );

  const eventFile = taskEventFile(paths, taskId);
  const acceptedStream = fs.readFileSync(eventFile, "utf8");
  const rewriteAccepted = (change) => {
    const events = acceptedStream.trim().split("\n").map((line) => JSON.parse(line));
    change(events.at(-1).result.accepted);
    events.at(-1).event_digest = authoritativeEventDigest(events.at(-1));
    fs.writeFileSync(eventFile, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`);
  };
  rewriteAccepted((accepted) => {
    accepted.brief_sha256 = `sha256:${"1".repeat(64)}`;
  });
  assert.throws(
    () => runRecordStart(parsed, { cwd: admission.repo, environment }),
    /dependency Team generation is not authoritative: foundation/,
  );
  fs.writeFileSync(eventFile, acceptedStream);
  rewriteAccepted((accepted) => { accepted.generation += 1; });
  assert.throws(
    () => runRecordStart(parsed, { cwd: admission.repo, environment }),
    /dependency Team generation is not authoritative: foundation/,
  );
  fs.writeFileSync(eventFile, acceptedStream);
  rewriteAccepted((accepted) => {
    accepted.verification_records = [{ check_id: "check-foundation" }];
  });
  assert.throws(
    () => runRecordStart(parsed, { cwd: admission.repo, environment }),
    /dependency authoritative acceptance is invalid: foundation/,
  );
  fs.writeFileSync(eventFile, acceptedStream);
  rewriteAccepted((accepted) => {
    accepted.execution_plan_sha256 = `sha256:${"0".repeat(64)}`;
  });
  assert.throws(
    () => runRecordStart(parsed, { cwd: admission.repo, environment }),
    /dependency authoritative acceptance is invalid: foundation/,
  );
  fs.writeFileSync(eventFile, acceptedStream);
  rewriteAccepted((accepted) => {
    accepted.verification_records[0].provenance = "imported";
  });
  assert.throws(
    () => runRecordStart(parsed, { cwd: admission.repo, environment }),
    /dependency authoritative acceptance is invalid: foundation/,
  );
  fs.writeFileSync(eventFile, acceptedStream);

  fs.writeFileSync(keeper, "tampered keeper\n");
  assert.throws(
    () => runRecordStart(parsed, { cwd: admission.repo, environment }),
    /dependency verification identity is invalid.*no longer matches the current snapshot|dependency keeper output digest mismatch/,
  );
  fs.writeFileSync(keeper, "foundation keeper\n");

  const changedAfterDependencyVerification = path.join(admission.repo, "changed-after-foundation.txt");
  fs.writeFileSync(changedAfterDependencyVerification, "dependency identity drift\n");
  assert.throws(
    () => runRecordStart(parsed, { cwd: admission.repo, environment }),
    /dependency verification identity is invalid.*no longer matches the current snapshot/,
  );
  fs.unlinkSync(changedAfterDependencyVerification);

  runRecordStart(parsed, { cwd: admission.repo, environment });
  assert.equal(readTeam(paths, taskId).slice_id, "execution-slice");
  assert.match(
    fs.readFileSync(progress, "utf8"),
    /"authority":"derived-from-authoritative-slice-accepted"/,
  );
  runPromote(parsePromoteArgs([taskId, "--to=finish"]), {
    environment,
    operationId: "finish-dependent",
  });
  const dependentKeeper = path.join(admission.repo, "workflow", "test-owned", "dependent.txt");
  fs.mkdirSync(path.dirname(dependentKeeper), { recursive: true });
  fs.writeFileSync(dependentKeeper, "dependent keeper\n");
  runVerification(parseVerifyArgs([
    taskId, `--brief=${admission.briefPath}`, "--slice-id=execution-slice",
    "--check-id=execution-contract", "--", ...checkCommand,
  ]), {
    cwd: admission.repo,
    environment,
    operationId: "verify-dependent",
    recordToken: "20260710T120600000000002",
  });
  const acceptEnvironment = {
    ...environment,
    CODEX_WORKFLOW_TEST_SLICE_ACCEPT_PAUSE_AFTER_DEPENDENCIES: "0.25",
  };
  const accepting = spawnWorkflow(acceptEnvironment, [
    "team-slice-accept", taskId, `--brief=${admission.briefPath}`,
    "--operation-id=accept-dependent-concurrent",
    "--keeper-output=event:execution-slice-complete=workflow/test-owned/dependent.txt",
  ], admission.repo);
  await waitForFile(`${globalAdmissionLockFile(paths)}.dir`);
  const superseding = spawnWorkflow(environment, [
    "team-slice-supersede", taskId, "--slice-id=foundation",
    "--operation-id=supersede-foundation-concurrent",
    "--authority-ref=user-message:dependency-invalidated-concurrent",
    "--reason=prove acceptance and supersede share one admission lock",
  ], admission.repo);
  const [acceptedConcurrently, supersededConcurrently] = await Promise.all([accepting, superseding]);
  assert.equal(acceptedConcurrently.status, 0, acceptedConcurrently.stderr);
  assert.equal(supersededConcurrently.status, 1, supersededConcurrently.stdout);
  assert.match(
    supersededConcurrently.stderr,
    /cannot supersede foundation while accepted dependent slices remain: execution-slice/,
  );
  assert.deepEqual(
    readJsonObject(taskStateFile(paths, taskId)).slice_acceptances["execution-slice"].actual_size.changed_paths,
    ["workflow/test-owned/dependent.txt"],
  );
  runSliceSupersede(parseSliceSupersedeArgs([
    taskId, "--slice-id=execution-slice", "--operation-id=supersede-dependent",
    "--authority-ref=user-message:dependent-invalidated",
    "--reason=release the dependent before invalidating its foundation",
  ]), { environment });
  runSliceSupersede(parseSliceSupersedeArgs([
    taskId, "--slice-id=foundation", "--operation-id=supersede-foundation",
    "--authority-ref=user-message:dependency-invalidated",
    "--reason=foundation keeper is no longer valid",
  ]), { environment });
  assert.throws(
    () => runRecordStart(parseRecordStartArgs([
      taskId, "retry dependent slice", "--mode=execute",
      "--authorization-ref=user-message:dependency-retry",
      `--brief=${admission.briefPath}`, "--operation-id=retry-dependent-slice",
    ]), { cwd: admission.repo, environment }),
    /dependency is not keeper-ready succeeded: foundation/,
  );
});

test("task completion requires every command-bound admitted gate", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Required completion gates");
  const firstCommand = [process.execPath, "-e", "process.exit(0)"];
  const secondCommand = [process.execPath, "--version"];
  const admission = executionBrief(paths, taskId, { checks: [
    {
      check_id: "contracts",
      gate_class: "contract",
      command: formatCommand(firstCommand).trimEnd(),
      final_only: false,
      cache_policy: "identity-bound",
    },
    {
      check_id: "security",
      gate_class: "security",
      command: formatCommand(secondCommand).trimEnd(),
      final_only: true,
      cache_policy: "fresh-executed",
    },
  ] });
  runRecordStart(parseRecordStartArgs([
    taskId, "execute checks bound to the admitted plan", "--mode=execute",
    "--authorization-ref=user-message:required-gates",
    `--brief=${admission.briefPath}`, "--operation-id=start-required-gates",
  ]), { cwd: admission.repo, environment });
  runPromote(parsePromoteArgs([taskId, "--to=finish"]), {
    environment,
    operationId: "finish-required-gates",
  });
  const keeper = path.join(admission.repo, "workflow", "test-owned", "keeper.txt");
  fs.mkdirSync(path.dirname(keeper), { recursive: true });
  fs.writeFileSync(keeper, "accepted keeper\n");

  const admittedHead = spawnSync(
    "git", ["-C", admission.repo, "rev-parse", "HEAD"], { encoding: "utf8" },
  ).stdout.trim();
  const headDrift = path.join(admission.repo, "head-drift.txt");
  fs.writeFileSync(headDrift, "external commit after slice admission\n");
  spawnSync("git", ["-C", admission.repo, "add", "head-drift.txt"]);
  const headCommit = spawnSync(
    "git", ["-C", admission.repo, "commit", "-qm", "test: advance admitted head"],
    { encoding: "utf8" },
  );
  assert.equal(headCommit.status, 0, headCommit.stderr);
  assert.throws(() => runVerification(parseVerifyArgs([
    taskId, `--brief=${admission.briefPath}`, "--slice-id=execution-slice",
    "--check-id=contracts", "--", ...firstCommand,
  ]), { cwd: admission.repo, environment }), /verification HEAD does not match the admitted slice-start HEAD/);
  assert.equal(
    spawnSync("git", ["-C", admission.repo, "update-ref", "HEAD", admittedHead]).status,
    0,
  );
  assert.equal(spawnSync("git", ["-C", admission.repo, "read-tree", "HEAD"]).status, 0);
  fs.rmSync(headDrift);

  runVerification(parseVerifyArgs([taskId, "--", "true"]), {
    cwd: admission.repo,
    environment,
    operationId: "general-true",
    recordToken: "20260710T120700000000001",
  });
  assert.match(
    requiredGateAdmission(paths, taskId, readJsonObject(taskStateFile(paths, taskId)), { environment })
      .reasons.join("\n"),
    /missing required verification gate: contracts/,
  );

  assert.throws(() => runVerification(parseVerifyArgs([
    taskId, `--brief=${admission.briefPath}`, "--slice-id=execution-slice",
    "--check-id=contracts", "--", process.execPath, "--version",
  ]), { cwd: admission.repo, environment }),
  /verification command does not match check contracts/);

  const otherRepo = path.join(paths.root, "other-verification-repo");
  fs.mkdirSync(otherRepo, { recursive: true });
  spawnSync("git", ["init", "-q", otherRepo]);
  spawnSync("git", ["-C", otherRepo, "config", "user.email", "atlas@example.test"]);
  spawnSync("git", ["-C", otherRepo, "config", "user.name", "Atlas Test"]);
  fs.writeFileSync(path.join(otherRepo, "README.md"), "other repo\n");
  spawnSync("git", ["-C", otherRepo, "add", "README.md"]);
  spawnSync("git", ["-C", otherRepo, "commit", "-qm", "test: other repository"]);
  assert.throws(() => runVerification(parseVerifyArgs([
    taskId, `--brief=${admission.briefPath}`, "--slice-id=execution-slice",
    "--check-id=contracts", "--", ...firstCommand,
  ]), { cwd: otherRepo, environment }),
  /verification repository does not match admitted brief/);

  runVerification(parseVerifyArgs([
    taskId, `--brief=${admission.briefPath}`, "--slice-id=execution-slice",
    "--check-id=contracts", "--", ...firstCommand,
  ]), {
    cwd: admission.repo,
    environment,
    operationId: "verify-contracts",
    recordToken: "20260710T120700000000002",
  });
  assert.match(
    requiredGateAdmission(paths, taskId, readJsonObject(taskStateFile(paths, taskId)), { environment })
      .reasons.join("\n"),
    /missing required verification gate: security/,
  );

  runVerification(parseVerifyArgs([
    taskId, `--brief=${admission.briefPath}`, "--slice-id=execution-slice",
    "--check-id=security", "--", ...secondCommand,
  ]), {
    cwd: admission.repo,
    environment,
    operationId: "verify-security",
    recordToken: "20260710T120700000000003",
  });
  const state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(state.verification.schema_version, 3);
  assert.deepEqual(Object.keys(state.verification.required_gates).sort(), ["contracts", "security"]);
  assert.equal(state.verification.required_gates.security.provenance, "fresh-executed");
  assert.match(state.verification.required_gates.security.candidate_tree_oid, /^[a-f0-9]{40}$/);
  const securityIdentity = JSON.parse(fs.readFileSync(path.resolve(
    paths.codeHome, state.verification.required_gates.security.identity_record,
  ), "utf8"));
  assert.equal(
    state.verification.required_gates.security.candidate_tree_oid,
    securityIdentity.identity.worktree.tree_oid,
  );
  const imported = JSON.parse(JSON.stringify(state));
  imported.verification.required_gates.security.provenance = "imported";
  assert.equal(requiredGateAdmission(paths, taskId, imported, { environment }).passed, false);

  assert.throws(
    () => completeTask(taskId, { environment, operationId: "done-without-acceptance" }),
    /missing authoritative accepted slice: execution-slice/,
  );

  const changedSource = path.join(admission.repo, "workflow", "test-owned", "changed-after-gates.txt");
  fs.writeFileSync(changedSource, "changed after required gates\n");
  assert.match(
    requiredGateAdmission(paths, taskId, readJsonObject(taskStateFile(paths, taskId)), { environment })
      .reasons.join("\n"),
    /no longer matches the current snapshot/,
  );
  fs.unlinkSync(changedSource);

  const briefBytes = fs.readFileSync(admission.briefPath);
  fs.appendFileSync(admission.briefPath, "\n");
  assert.throws(
    () => requiredGateAdmission(
      paths, taskId, readJsonObject(taskStateFile(paths, taskId)), { environment },
    ),
    /admitted Team brief sha256 no longer matches/,
  );
  fs.writeFileSync(admission.briefPath, briefBytes);

  runSliceAccept(parseSliceAcceptArgs([
    taskId, `--brief=${admission.briefPath}`, "--operation-id=accept-required-gates",
    "--keeper-output=event:execution-slice-complete=workflow/test-owned/keeper.txt",
  ]), { environment });
  completeTask(taskId, { environment, operationId: "done-all-required-gates" });
  const completedState = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(completedState.status, "done");
  assert.equal(completedState.execution_authority.status, "active");
  assert.equal(completedState.execution_authority.completion.completed_revision, completedState.runtime_revision);
  assert.equal(executionCompletionAdmission(paths, taskId, completedState).passed, true);
  commitAcceptedWorktree(admission.repo, "test: finalize required gates");
  archiveTask(taskId, "completed execution retained for audit", {
    environment,
    operationId: "archive-completed-execution",
  });
  const archivedState = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(archivedState.execution_authority.status, "active");
  assert.deepEqual(
    archivedState.execution_authority.completion,
    completedState.execution_authority.completion,
  );
});

test("completion is bound to the final accepted HEAD and worktree snapshot", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const fixture = acceptedExecution(environment, paths, "Completion snapshot binding");
  const { admission, checkCommand, keeperRelative, source, taskId } = fixture;
  const acceptedState = readJsonObject(taskStateFile(paths, taskId));
  const firstAcceptance = acceptedState.slice_acceptances["execution-slice"];
  assert.match(firstAcceptance.actual_size.accepted_head_sha, /^[a-f0-9]{40}$/);
  assert.match(firstAcceptance.actual_size.accepted_tree_oid, /^[a-f0-9]{40}$/);
  assert.equal(
    firstAcceptance.actual_size.accepted_tree_oid,
    firstAcceptance.actual_size.current_tree_oid,
  );

  fs.writeFileSync(source, "module.exports = 'changed after acceptance';\n");
  assert.throws(
    () => completeTask(taskId, { environment, operationId: "done-after-source-drift" }),
    /repository worktree changed after final slice acceptance/,
  );
  fs.writeFileSync(source, "module.exports = 'accepted';\n");

  const untracked = path.join(path.dirname(source), "untracked.txt");
  fs.writeFileSync(untracked, "untracked after acceptance\n");
  assert.throws(
    () => completeTask(taskId, { environment, operationId: "done-after-untracked-drift" }),
    /repository worktree changed after final slice acceptance/,
  );
  fs.rmSync(untracked);

  const headDrift = spawnSync(
    "git", ["-C", admission.repo, "commit", "--allow-empty", "-qm", "test: drift accepted HEAD"],
    { encoding: "utf8" },
  );
  assert.equal(headDrift.status, 0, headDrift.stderr);
  assert.throws(
    () => completeTask(taskId, { environment, operationId: "done-after-head-drift" }),
    /repository HEAD changed after final slice acceptance/,
  );
  assert.equal(
    spawnSync("git", [
      "-C", admission.repo, "update-ref", "HEAD", firstAcceptance.actual_size.accepted_head_sha,
    ]).status,
    0,
  );

  const outside = path.join(admission.repo, "outside-owned-path.txt");
  fs.writeFileSync(outside, "outside ownership after acceptance\n");
  assert.throws(
    () => completeTask(taskId, { environment, operationId: "done-after-outside-drift" }),
    /repository worktree changed after final slice acceptance/,
  );
  fs.rmSync(outside);

  runVerification(parseVerifyArgs([
    taskId, `--brief=${admission.briefPath}`, "--slice-id=execution-slice",
    "--check-id=execution-contract", "--", ...checkCommand,
  ]), {
    cwd: admission.repo,
    environment,
    operationId: "reverify-restored-snapshot",
    recordToken: "20260729T010000000000002",
  });
  runSliceAccept(parseSliceAcceptArgs([
    taskId, `--brief=${admission.briefPath}`, "--operation-id=reaccept-restored-snapshot",
    `--keeper-output=event:execution-slice-complete=${keeperRelative}`,
  ]), { environment });
  const finalAcceptanceEvent = authoritativeEvents(paths, taskId).at(-1);
  assert.equal(finalAcceptanceEvent.kind, "slice.accepted");
  completeTask(taskId, { environment, operationId: "done-restored-reverified-snapshot" });

  const completed = readJsonObject(taskStateFile(paths, taskId));
  assert.deepEqual(completed.completion.completion_snapshot, {
    schema_version: 1,
    repo_realpath: admission.repo,
    head_sha: finalAcceptanceEvent.result.accepted.actual_size.accepted_head_sha,
    tree_oid: finalAcceptanceEvent.result.accepted.actual_size.accepted_tree_oid,
    source_slice_id: "execution-slice",
    source_acceptance_event_id: finalAcceptanceEvent.event_id,
    source_acceptance_revision: finalAcceptanceEvent.revision,
  });
  assert.throws(() => archiveTask(taskId, "reject uncommitted execution", {
    environment,
    operationId: "archive-uncommitted-snapshot",
  }), /must commit the exact accepted tree before archive/);
  const finalCommit = commitAcceptedWorktree(
    admission.repo,
    "test: commit accepted execution snapshot",
  );
  archiveTask(taskId, "retain final committed execution", {
    environment,
    operationId: "archive-final-committed-snapshot",
  });
  const archived = readJsonObject(taskStateFile(paths, taskId));
  assert.deepEqual(archived.completion.final_commit_link, {
    schema_version: 1,
    repo_realpath: admission.repo,
    head_sha: finalCommit.head_sha,
    tree_oid: finalCommit.tree_oid,
    completion_head_sha: completed.completion.completion_snapshot.head_sha,
    source_completion_revision: completed.runtime_revision,
    linked_revision: archived.runtime_revision,
    linked_at: archived.completion.final_commit_link.linked_at,
  });
  assert.match(archived.completion.final_commit_link.linked_at, /^\d{4}-\d{2}-\d{2}T/);
});

test("done and archived tasks reject acceptance, supersede, and verification writes", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const fixture = acceptedExecution(environment, paths, "Closed execution immutability");
  const { admission, checkCommand, keeperRelative, taskId } = fixture;
  completeTask(taskId, { environment, operationId: "done-before-closed-writes" });
  const doneEventCount = authoritativeEvents(paths, taskId).length;
  const doneState = readJsonObject(taskStateFile(paths, taskId));

  assert.throws(() => runSliceSupersede(parseSliceSupersedeArgs([
    taskId, "--slice-id=execution-slice", "--operation-id=supersede-after-done",
    "--authority-ref=user-message:closed-task", "--reason=must remain immutable",
  ]), { environment }), /team-slice-supersede requires task status doing; current status: done/);
  assert.throws(() => runSliceAccept(parseSliceAcceptArgs([
    taskId, `--brief=${admission.briefPath}`, "--operation-id=accept-after-done",
    `--keeper-output=event:execution-slice-complete=${keeperRelative}`,
  ]), { environment }), /team-slice-accept requires task status doing; current status: done/);
  const verifySentinel = path.join(admission.repo, "verify-after-done-ran.txt");
  assert.throws(() => runVerification(parseVerifyArgs([
    taskId, `--brief=${admission.briefPath}`, "--slice-id=execution-slice",
    "--check-id=execution-contract", "--", process.execPath, "-e",
    `require('fs').writeFileSync(${JSON.stringify(verifySentinel)}, 'ran')`,
  ]), { cwd: admission.repo, environment }), /verify requires task status doing; current status: done/);
  assert.equal(fs.existsSync(verifySentinel), false);
  assert.equal(authoritativeEvents(paths, taskId).length, doneEventCount);
  assert.equal(doneState.slice_acceptances["execution-slice"].status, "accepted");

  commitAcceptedWorktree(admission.repo, "test: finalize closed execution");
  archiveTask(taskId, "retain immutable completion", {
    environment,
    operationId: "archive-closed-execution",
  });
  const archivedEventCount = authoritativeEvents(paths, taskId).length;
  assert.throws(() => runSliceSupersede(parseSliceSupersedeArgs([
    taskId, "--slice-id=execution-slice", "--operation-id=supersede-after-archive",
    "--authority-ref=user-message:archived-task", "--reason=must remain immutable",
  ]), { environment }), /team-slice-supersede requires task status doing; current status: archived/);
  assert.throws(() => runSliceAccept(parseSliceAcceptArgs([
    taskId, `--brief=${admission.briefPath}`, "--operation-id=accept-after-archive",
    `--keeper-output=event:execution-slice-complete=${keeperRelative}`,
  ]), { environment }), /team-slice-accept requires task status doing; current status: archived/);
  assert.throws(() => runVerification(parseVerifyArgs([
    taskId, `--brief=${admission.briefPath}`, "--slice-id=execution-slice",
    "--check-id=execution-contract", "--", ...checkCommand,
  ]), { cwd: admission.repo, environment }), /verify requires task status doing; current status: archived/);
  assert.equal(authoritativeEvents(paths, taskId).length, archivedEventCount);
  assert.equal(
    readJsonObject(taskStateFile(paths, taskId)).slice_acceptances["execution-slice"].status,
    "accepted",
  );
});

test("failed and cancelled completion also close slice mutation authority", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  for (const outcome of ["failed", "cancelled"]) {
    const fixture = acceptedExecution(environment, paths, `Closed ${outcome} execution`);
    completeTask(fixture.taskId, {
      environment,
      operationId: `complete-${outcome}-execution`,
      outcome,
      authorityRef: `user-message:${outcome}-execution`,
      evidenceRefs: [`team/${outcome}.md`],
    });
    const before = authoritativeEvents(paths, fixture.taskId).length;
    assert.throws(() => runSliceSupersede(parseSliceSupersedeArgs([
      fixture.taskId, "--slice-id=execution-slice", `--operation-id=supersede-after-${outcome}`,
      `--authority-ref=user-message:${outcome}`, "--reason=completion is terminal",
    ]), { environment }), /requires task status doing; current status: done/);
    assert.throws(() => runSliceAccept(parseSliceAcceptArgs([
      fixture.taskId, `--brief=${fixture.admission.briefPath}`,
      `--operation-id=accept-after-${outcome}`,
      `--keeper-output=event:execution-slice-complete=${fixture.keeperRelative}`,
    ]), { environment }), /requires task status doing; current status: done/);
    assert.equal(authoritativeEvents(paths, fixture.taskId).length, before);
  }
});

test("completion and supersede serialize to one terminal result", async (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const fixture = acceptedExecution(environment, paths, "Concurrent completion immutability");
  const completion = spawnWorkflow({
    ...environment,
    CODEX_WORKFLOW_TEST_UPDATE_PAUSE_BEFORE_WRITE: "0.25",
  }, ["done", fixture.taskId], fixture.admission.repo);
  await waitForFile(`${taskMutationLockFile(paths, fixture.taskId)}.dir`);
  const supersede = spawnWorkflow(environment, [
    "team-slice-supersede", fixture.taskId, "--slice-id=execution-slice",
    "--operation-id=supersede-concurrent-completion",
    "--authority-ref=user-message:concurrent-completion",
    "--reason=prove terminal mutation serialization",
  ], fixture.admission.repo);
  const [completed, superseded] = await Promise.all([completion, supersede]);
  assert.equal(completed.status, 0, completed.stderr);
  assert.equal(superseded.status, 1, superseded.stdout);
  assert.match(superseded.stderr, /requires task status doing; current status: done/);
  const state = readJsonObject(taskStateFile(paths, fixture.taskId));
  assert.equal(state.status, "done");
  assert.equal(state.slice_acceptances["execution-slice"].status, "accepted");
  assert.equal(
    authoritativeEvents(paths, fixture.taskId).filter((event) => event.kind === "slice.superseded").length,
    0,
  );
});

test("execution authority survives later Team generations and rejects implicit replan", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Persistent execution authority");
  const admission = executionBrief(paths, taskId);
  runRecordStart(parseRecordStartArgs([
    taskId, "execute authoritative plan", "--mode=execute",
    "--authorization-ref=user-message:authority-plan-a",
    `--brief=${admission.briefPath}`, "--operation-id=start-authority-plan-a",
  ]), { cwd: admission.repo, environment });
  runPromote(parsePromoteArgs([taskId, "--to=finish"]), {
    environment,
    operationId: "finish-authority-plan-a",
  });
  runRecordStart(parseRecordStartArgs([
    taskId, "discuss follow-up without replacing execution authority", "--mode=discuss",
    "--operation-id=start-discuss-after-execution",
  ]), { cwd: admission.repo, environment });
  runPromote(parsePromoteArgs([taskId, "--to=finish"]), {
    environment,
    operationId: "finish-discuss-after-execution",
  });
  runVerification(parseVerifyArgs([taskId, "--", "true"]), {
    cwd: admission.repo,
    environment,
    operationId: "general-after-execution",
    recordToken: "20260710T120700000000004",
  });
  assert.throws(
    () => completeTask(taskId, { environment, operationId: "done-after-authority-downgrade" }),
    /missing authoritative accepted slice: execution-slice/,
  );
  assert.equal(
    readJsonObject(taskStateFile(paths, taskId)).execution_authority.execution_plan_sha256,
    admission.brief.contract.execution_plan_sha256,
  );

  const replacement = executionBrief(paths, taskId, { ownedPaths: ["replacement/code/**"] });
  assert.throws(() => runRecordStart(parseRecordStartArgs([
    taskId, "implicitly replace authoritative plan", "--mode=execute",
    "--authorization-ref=user-message:authority-plan-b",
    `--brief=${replacement.briefPath}`, "--operation-id=start-authority-plan-b",
  ]), { cwd: replacement.repo, environment }),
  /task execution authority is already bound to another contract/);
});

test("execute admission rejects global writer overlap until the lease is released", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const firstTask = createFixtureTask(environment, "First writer");
  const firstAdmission = executionBrief(paths, firstTask, { ownedPaths: ["workflow/test-owned/**"] });
  runRecordStart(parseRecordStartArgs([
    firstTask, "hold workflow writer lease", "--mode=execute",
    "--authorization-ref=user-message:first-writer",
    `--brief=${firstAdmission.briefPath}`, "--operation-id=start-first-writer",
  ]), { cwd: firstAdmission.repo, environment });
  invokeControl(runLaneRecord, parseLaneArgs, environment, [
    firstTask, "--operation-id=first-writer-lane", "--action=open", "--lane=writer",
    "--writable", "--paths=workflow/test-owned/**",
  ]);
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    firstTask, "--operation-id=first-writer-dispatch", "--action=open", "--lane=writer",
    "--dispatch=writer-dispatch",
  ]);
  assert.throws(() => invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    firstTask, "--operation-id=first-writer-reserve", "--action=reserve",
    "--dispatch=writer-dispatch", "--attempt=first-writer-attempt",
    "--launch-operation-id=launch-first-writer",
    "--writable", "--paths=workflow/test-owned/**",
  ], "2026-07-10T12:06:00.000Z", { failAfterEventAppend: true }),
  /authoritative event committed but projection is inconsistent/);
  assert.equal(
    (readTeam(paths, firstTask).writer_leases || []).some((lease) => lease.state === "active"),
    false,
  );

  const secondTask = createFixtureTask(environment, "Second writer");
  const secondAdmission = executionBrief(paths, secondTask, { ownedPaths: ["workflow/test-owned/bin/**"] });
  const secondStart = parseRecordStartArgs([
    secondTask, "request overlapping writer scope", "--mode=execute",
    "--authorization-ref=user-message:second-writer",
    `--brief=${secondAdmission.briefPath}`, "--operation-id=start-second-writer",
  ]);
  withReadFileGuard(taskEventFile(paths, firstTask), () => assert.throws(
    () => runRecordStart(secondStart, { cwd: secondAdmission.repo, environment }),
    /global writer lease conflict/,
  ));
  const unrelatedTask = path.join(paths.artifactsDir, "unrelated-huge-history");
  fs.mkdirSync(unrelatedTask, { recursive: true });
  const guardedUnrelatedEvents = path.join(unrelatedTask, "events-v2.jsonl");
  fs.writeFileSync(guardedUnrelatedEvents, "not json and must not be read\n");
  const disjointTask = createFixtureTask(environment, "Disjoint writer");
  const disjointAdmission = executionBrief(paths, disjointTask, { ownedPaths: ["workflow/other-owned/**"] });
  withReadFileGuard(guardedUnrelatedEvents, () => runRecordStart(parseRecordStartArgs([
    disjointTask, "request disjoint writer scope", "--mode=execute",
    "--authorization-ref=user-message:disjoint-writer",
    `--brief=${disjointAdmission.briefPath}`, "--operation-id=start-disjoint-writer",
  ]), { cwd: disjointAdmission.repo, environment }));
  const controlSnapshot = path.join(paths.stateDir, "team-writer-leases.json");
  const controlJournal = path.join(paths.stateDir, "team-writer-leases.recovery.json");
  const goodControlSnapshot = fs.readFileSync(controlSnapshot);
  const failClosedTask = createFixtureTask(environment, "Fail closed writer");
  const failClosedAdmission = executionBrief(paths, failClosedTask, { ownedPaths: ["workflow/fail-closed/**"] });
  fs.writeFileSync(controlSnapshot, "{ corrupt\n");
  fs.rmSync(controlJournal, { force: true });
  assert.throws(
    () => runRecordStart(parseRecordStartArgs([
      failClosedTask,
      "request writer while control plane is corrupt", "--mode=execute",
      "--authorization-ref=user-message:fail-closed",
      `--brief=${failClosedAdmission.briefPath}`,
      "--operation-id=start-fail-closed",
    ]), { cwd: failClosedAdmission.repo, environment }),
    /writer lease control plane.*corrupt|writer lease control plane.*unavailable/,
  );
  fs.writeFileSync(controlSnapshot, goodControlSnapshot);
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    firstTask, "--operation-id=first-writer-terminal", "--action=terminal",
    "--attempt=first-writer-attempt", "--outcome=succeeded",
  ]);
  writeEvidence(paths, firstTask, "team/first-writer-quiesced.json");
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    firstTask, "--operation-id=first-writer-quiesced", "--action=quiesced",
    "--attempt=first-writer-attempt",
    "--evidence-refs=team/first-writer-quiesced.json",
  ]);
  const releasedSecondAdmission = executionBrief(paths, secondTask, { ownedPaths: ["workflow/test-owned/bin/**"] });
  const releasedSecondStart = parseRecordStartArgs([
    secondTask, "request overlapping writer scope after release", "--mode=execute",
    "--authorization-ref=user-message:second-writer",
    `--brief=${releasedSecondAdmission.briefPath}`, "--operation-id=start-second-writer",
  ]);
  runRecordStart(releasedSecondStart, { cwd: releasedSecondAdmission.repo, environment });
  assert.equal(readTeam(paths, secondTask).admission.mode, "execution-v3");
});

test("writer lease recovery journal blocks overlap before event commit and converges on retry", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const firstTask = createFixtureTask(environment, "Prepared writer");
  const firstAdmission = executionBrief(paths, firstTask, { ownedPaths: ["workflow/prepared-owned/**"] });
  runRecordStart(parseRecordStartArgs([
    firstTask, "hold prepared writer lease", "--mode=execute",
    "--authorization-ref=user-message:prepared-writer",
    `--brief=${firstAdmission.briefPath}`, "--operation-id=start-prepared-writer",
  ]), { cwd: firstAdmission.repo, environment });
  invokeControl(runLaneRecord, parseLaneArgs, environment, [
    firstTask, "--operation-id=prepared-writer-lane", "--action=open", "--lane=writer",
    "--writable", "--paths=workflow/prepared-owned/**",
  ]);
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    firstTask, "--operation-id=prepared-writer-dispatch", "--action=open", "--lane=writer",
    "--dispatch=writer-dispatch",
  ]);
  assert.throws(() => invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    firstTask, "--operation-id=prepared-writer-reserve", "--action=reserve",
    "--dispatch=writer-dispatch", "--attempt=prepared-writer-attempt",
    "--launch-operation-id=launch-prepared-writer",
    "--writable", "--paths=workflow/prepared-owned/**",
  ], "2026-07-10T12:06:00.000Z", { failBeforeEventAppend: true }),
  /injected failure before authoritative event append/);
  assert.equal(
    (readTeam(paths, firstTask).writer_leases || []).some((lease) => lease.state === "active"),
    false,
  );

  const secondTask = createFixtureTask(environment, "Prepared overlap");
  const secondAdmission = executionBrief(paths, secondTask, { ownedPaths: ["workflow/prepared-owned/bin/**"] });
  assert.throws(
    () => runRecordStart(parseRecordStartArgs([
      secondTask, "request prepared overlap", "--mode=execute",
      "--authorization-ref=user-message:prepared-overlap",
      `--brief=${secondAdmission.briefPath}`, "--operation-id=start-prepared-overlap",
    ]), { cwd: secondAdmission.repo, environment }),
    /global writer lease conflict/,
  );
  fs.rmSync(path.join(paths.stateDir, "team-writer-leases.json"), { force: true });
  const journalOnlyTask = createFixtureTask(environment, "Prepared journal only overlap");
  const journalOnlyAdmission = executionBrief(
    paths,
    journalOnlyTask,
    { ownedPaths: ["workflow/prepared-owned/journal-only/**"] },
  );
  assert.throws(
    () => runRecordStart(parseRecordStartArgs([
      journalOnlyTask, "request prepared overlap from journal only", "--mode=execute",
      "--authorization-ref=user-message:prepared-journal-only",
      `--brief=${journalOnlyAdmission.briefPath}`, "--operation-id=start-prepared-journal-only",
    ]), { cwd: journalOnlyAdmission.repo, environment }),
    /global writer lease conflict/,
  );
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    firstTask, "--operation-id=prepared-writer-reserve", "--action=reserve",
    "--dispatch=writer-dispatch", "--attempt=prepared-writer-attempt",
    "--launch-operation-id=launch-prepared-writer",
    "--writable", "--paths=workflow/prepared-owned/**",
  ]);
  assert.equal(
    readTeam(paths, firstTask).writer_leases.find(
      (lease) => lease.owner_attempt_id === "prepared-writer-attempt",
    ).state,
    "active",
  );
  assert.equal(fs.existsSync(path.join(paths.stateDir, "team-writer-leases.recovery.json")), false);
});

test("writer lease recovery journal linkage mismatch fails closed", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const firstTask = createFixtureTask(environment, "Mismatched journal writer");
  const firstAdmission = executionBrief(paths, firstTask, { ownedPaths: ["workflow/linkage-owned/**"] });
  runRecordStart(parseRecordStartArgs([
    firstTask, "prepare writer lease with journal", "--mode=execute",
    "--authorization-ref=user-message:linkage-writer",
    `--brief=${firstAdmission.briefPath}`, "--operation-id=start-linkage-writer",
  ]), { cwd: firstAdmission.repo, environment });
  invokeControl(runLaneRecord, parseLaneArgs, environment, [
    firstTask, "--operation-id=linkage-writer-lane", "--action=open", "--lane=writer",
    "--writable", "--paths=workflow/linkage-owned/**",
  ]);
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    firstTask, "--operation-id=linkage-writer-dispatch", "--action=open", "--lane=writer",
    "--dispatch=writer-dispatch",
  ]);
  assert.throws(() => invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    firstTask, "--operation-id=linkage-writer-reserve", "--action=reserve",
    "--dispatch=writer-dispatch", "--attempt=linkage-writer-attempt",
    "--launch-operation-id=launch-linkage-writer",
    "--writable", "--paths=workflow/linkage-owned/**",
  ], "2026-07-10T12:06:00.000Z", { failBeforeEventAppend: true }),
  /injected failure before authoritative event append/);
  const journal = readControlJson(path.join(paths.stateDir, "team-writer-leases.recovery.json"));
  writeControlJson(path.join(paths.stateDir, "team-writer-leases.recovery.json"), {
    ...journal,
    base_snapshot_digest: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  });
  const secondTask = createFixtureTask(environment, "Mismatched journal overlap");
  const secondAdmission = executionBrief(paths, secondTask, { ownedPaths: ["workflow/linkage-owned/bin/**"] });
  assert.throws(
    () => runRecordStart(parseRecordStartArgs([
      secondTask, "request overlap against mismatched journal", "--mode=execute",
      "--authorization-ref=user-message:linkage-overlap",
      `--brief=${secondAdmission.briefPath}`, "--operation-id=start-linkage-overlap",
    ]), { cwd: secondAdmission.repo, environment }),
    /snapshot linkage mismatch/,
  );
});

test("overlapping execute admissions do not create writer leases before writable attempts", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const firstTask = createFixtureTask(environment, "First admitted only");
  const firstAdmission = executionBrief(paths, firstTask, { ownedPaths: ["workflow/admitted-only/**"] });
  runRecordStart(parseRecordStartArgs([
    firstTask, "admit without writer attempt", "--mode=execute",
    "--authorization-ref=user-message:first-admitted-only",
    `--brief=${firstAdmission.briefPath}`, "--operation-id=start-first-admitted-only",
  ]), { cwd: firstAdmission.repo, environment });

  const secondTask = createFixtureTask(environment, "Second admitted only");
  const secondAdmission = executionBrief(paths, secondTask, { ownedPaths: ["workflow/admitted-only/bin/**"] });
  runRecordStart(parseRecordStartArgs([
    secondTask, "admit overlapping scope without writer attempt", "--mode=execute",
    "--authorization-ref=user-message:second-admitted-only",
    `--brief=${secondAdmission.briefPath}`, "--operation-id=start-second-admitted-only",
  ]), { cwd: secondAdmission.repo, environment });

  assert.equal(readTeam(paths, firstTask).writer_leases.length, 0);
  assert.equal(readTeam(paths, secondTask).writer_leases.length, 0);
});

test("non-latest replay cannot roll back writer lease control snapshot", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Replay rollback writer");
  const admission = executionBrief(paths, taskId, { ownedPaths: ["workflow/replay-owned/**"] });
  runRecordStart(parseRecordStartArgs([
    taskId, "execute replay rollback writer", "--mode=execute",
    "--authorization-ref=user-message:replay-writer",
    `--brief=${admission.briefPath}`, "--operation-id=start-replay-writer",
  ]), { cwd: admission.repo, environment });
  invokeControl(runLaneRecord, parseLaneArgs, environment, [
    taskId, "--operation-id=replay-lane-a", "--action=open", "--lane=writer-a",
    "--writable", "--paths=workflow/replay-owned/**",
  ]);
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    taskId, "--operation-id=replay-dispatch-a", "--action=open", "--lane=writer-a",
    "--dispatch=dispatch-a",
  ]);
  const reserveA = [
    taskId, "--operation-id=replay-reserve-a", "--action=reserve",
    "--dispatch=dispatch-a", "--attempt=attempt-a",
    "--launch-operation-id=launch-attempt-a",
    "--writable", "--paths=workflow/replay-owned/**",
  ];
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, reserveA);
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=replay-terminal-a", "--action=terminal",
    "--attempt=attempt-a", "--outcome=succeeded",
  ]);
  writeEvidence(paths, taskId, "team/replay-a-quiesced.json");
  const releaseA = [
    taskId, "--operation-id=replay-quiesce-a", "--action=quiesced",
    "--attempt=attempt-a", "--evidence-refs=team/replay-a-quiesced.json",
  ];
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, releaseA);
  assert.equal(readControlJson(path.join(paths.stateDir, "team-writer-leases.json")).leases.length, 0);
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, reserveA);
  assert.equal(
    readControlJson(path.join(paths.stateDir, "team-writer-leases.json")).leases.length,
    0,
  );

  invokeControl(runLaneRecord, parseLaneArgs, environment, [
    taskId, "--operation-id=replay-lane-b", "--action=open", "--lane=writer-b",
    "--writable", "--paths=workflow/replay-owned/**",
  ]);
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    taskId, "--operation-id=replay-dispatch-b", "--action=open", "--lane=writer-b",
    "--dispatch=dispatch-b",
  ]);
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=replay-reserve-b", "--action=reserve",
    "--dispatch=dispatch-b", "--attempt=attempt-b",
    "--launch-operation-id=launch-attempt-b",
    "--writable", "--paths=workflow/replay-owned/**",
  ]);
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, releaseA);
  assert.deepEqual(
    readControlJson(path.join(paths.stateDir, "team-writer-leases.json"))
      .leases.map((lease) => lease.owner_attempt_id),
    ["attempt-b"],
  );
});

test("writer lease migration snapshot records active and no-lease task provenance", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const noLeaseTask = createFixtureTask(environment, "Migration no lease task");
  const activeTask = createFixtureTask(environment, "Migration active writer task");
  const activeAdmission = executionBrief(paths, activeTask, { ownedPaths: ["workflow/migration-owned/**"] });
  runRecordStart(parseRecordStartArgs([
    activeTask, "execute migration active writer", "--mode=execute",
    "--authorization-ref=user-message:migration-active",
    `--brief=${activeAdmission.briefPath}`, "--operation-id=start-migration-active",
  ]), { cwd: activeAdmission.repo, environment });
  invokeControl(runLaneRecord, parseLaneArgs, environment, [
    activeTask, "--operation-id=migration-lane", "--action=open", "--lane=writer",
    "--writable", "--paths=workflow/migration-owned/**",
  ]);
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    activeTask, "--operation-id=migration-dispatch", "--action=open", "--lane=writer",
    "--dispatch=writer-dispatch",
  ]);
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    activeTask, "--operation-id=migration-reserve", "--action=reserve",
    "--dispatch=writer-dispatch", "--attempt=migration-attempt",
    "--launch-operation-id=launch-migration-attempt",
    "--writable", "--paths=workflow/migration-owned/**",
  ]);
  fs.rmSync(writerControlSnapshotFile(paths), { force: true });
  fs.rmSync(writerControlJournalFile(paths), { force: true });
  fs.rmSync(writerControlForensicFile(paths), { force: true });

  const overlapTask = createFixtureTask(environment, "Migration overlap task");
  const overlapAdmission = executionBrief(paths, overlapTask, { ownedPaths: ["workflow/migration-owned/bin/**"] });
  assert.throws(
    () => runRecordStart(parseRecordStartArgs([
      overlapTask, "trigger fresh control-plane migration", "--mode=execute",
      "--authorization-ref=user-message:migration-overlap",
      `--brief=${overlapAdmission.briefPath}`, "--operation-id=start-migration-overlap",
    ]), { cwd: overlapAdmission.repo, environment }),
    /global writer lease conflict/,
  );
  const snapshot = readControlJson(writerControlSnapshotFile(paths));
  assert.match(snapshot.digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(snapshot.forensic_status, "legacy-compatible");
  assert.equal(snapshot.scanned_tasks, undefined);
  assert.match(snapshot.coverage_digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(snapshot.coverage_count > 0, true);
  assert.equal(snapshot.leases.some((lease) => lease.task_id === activeTask), true);
  const forensic = readControlJson(writerControlForensicFile(paths));
  assert.equal(forensic.digest, snapshot.coverage_digest);
  const scanned = new Map(forensic.scanned_tasks.map((entry) => [entry.task_id, entry]));
  for (const taskId of [activeTask, noLeaseTask]) {
    const entry = scanned.get(taskId);
    assert.ok(entry, `missing scanned task metadata for ${taskId}`);
    assert.match(entry.source_digest, /^sha256:[a-f0-9]{64}$/);
    assert.equal(Number.isInteger(entry.bounded_byte_size), true);
    assert.equal(entry.bounded_byte_size > 0, true);
    assert.match(entry.forensic_result, /bounded-head-verified|legacy-state-uncertain/);
  }
  const serialized = JSON.stringify(forensic.scanned_tasks);
  assert.equal(serialized.includes(paths.root), false);
  assert.equal(serialized.includes("Migration no lease task"), false);
});

test("fresh writer lease migration streams oversized unrelated events and verifies state head", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const hugeTask = createFixtureTask(environment, "Oversized no lease task");
  const guardedHugeEvents = makeOversizedAuthoritativeEvents(paths, hugeTask);
  fs.rmSync(writerControlSnapshotFile(paths), { force: true });
  fs.rmSync(writerControlJournalFile(paths), { force: true });
  fs.rmSync(writerControlForensicFile(paths), { force: true });

  const candidateTask = createFixtureTask(environment, "Fresh migration candidate");
  const candidateAdmission = executionBrief(paths, candidateTask, { ownedPaths: ["workflow/fresh-migration/**"] });
  withReadFileGuard(guardedHugeEvents, () => runRecordStart(parseRecordStartArgs([
    candidateTask, "trigger migration with oversized unrelated event stream", "--mode=execute",
    "--authorization-ref=user-message:fresh-migration",
    `--brief=${candidateAdmission.briefPath}`, "--operation-id=start-fresh-migration",
  ]), { cwd: candidateAdmission.repo, environment }));
  const forensic = readControlJson(writerControlForensicFile(paths));
  const hugeMetadata = forensic.scanned_tasks.find((entry) => entry.task_id === hugeTask);
  assert.ok(hugeMetadata);
  assert.equal(hugeMetadata.source_kind, "authoritative-events-large");
  assert.equal(hugeMetadata.forensic_result, "head-state-matched-history-unverified");
  assert.match(hugeMetadata.source_digest, /^sha256:[a-f0-9]{64}$/);
});

test("fresh writer lease migration fails closed when oversized event head differs from state", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const hugeTask = createFixtureTask(environment, "Oversized mismatched task");
  const guardedHugeEvents = makeOversizedAuthoritativeEvents(paths, hugeTask, { mismatchState: true });
  fs.rmSync(writerControlSnapshotFile(paths), { force: true });
  fs.rmSync(writerControlJournalFile(paths), { force: true });
  fs.rmSync(writerControlForensicFile(paths), { force: true });

  const candidateTask = createFixtureTask(environment, "Fresh migration mismatch candidate");
  const candidateAdmission = executionBrief(paths, candidateTask, { ownedPaths: ["workflow/fresh-mismatch/**"] });
  withReadFileGuard(guardedHugeEvents, () => assert.throws(
    () => runRecordStart(parseRecordStartArgs([
      candidateTask, "trigger migration with mismatched oversized event stream", "--mode=execute",
      "--authorization-ref=user-message:fresh-mismatch",
      `--brief=${candidateAdmission.briefPath}`, "--operation-id=start-fresh-mismatch",
    ]), { cwd: candidateAdmission.repo, environment }),
    /bounded authoritative head does not match state/,
  ));
});

test("fresh writer lease migration rejects oversized unterminated stale tail after active event", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const activeTask = createFixtureTask(environment, "Oversized unterminated active task");
  const admission = executionBrief(paths, activeTask, { ownedPaths: ["workflow/unterminated-active/**"] });
  runRecordStart(parseRecordStartArgs([
    activeTask, "execute unterminated active writer", "--mode=execute",
    "--authorization-ref=user-message:unterminated-active",
    `--brief=${admission.briefPath}`, "--operation-id=start-unterminated-active",
  ]), { cwd: admission.repo, environment });
  invokeControl(runLaneRecord, parseLaneArgs, environment, [
    activeTask, "--operation-id=unterminated-lane", "--action=open", "--lane=writer",
    "--writable", "--paths=workflow/unterminated-active/**",
  ]);
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    activeTask, "--operation-id=unterminated-dispatch", "--action=open", "--lane=writer",
    "--dispatch=writer-dispatch",
  ]);
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    activeTask, "--operation-id=unterminated-reserve", "--action=reserve",
    "--dispatch=writer-dispatch", "--attempt=unterminated-attempt",
    "--launch-operation-id=launch-unterminated-attempt",
    "--writable", "--paths=workflow/unterminated-active/**",
  ]);
  const events = authoritativeEvents(paths, activeTask);
  const activeEvent = events.at(-1);
  const staleNoLeaseEvent = events[0];
  const filler = `${JSON.stringify({ filler: "x".repeat(4096) })}\n`;
  const eventFile = taskEventFile(paths, activeTask);
  fs.writeFileSync(
    eventFile,
    `${filler.repeat(260)}${JSON.stringify(activeEvent)}\n${JSON.stringify(staleNoLeaseEvent)}`,
  );
  assert.ok(fs.statSync(eventFile).size > 1024 * 1024);
  fs.writeFileSync(
    taskStateFile(paths, activeTask),
    `${JSON.stringify(staleNoLeaseEvent.projection.state, null, 2)}\n`,
  );
  fs.rmSync(writerControlSnapshotFile(paths), { force: true });
  fs.rmSync(writerControlJournalFile(paths), { force: true });
  fs.rmSync(writerControlForensicFile(paths), { force: true });

  const candidateTask = createFixtureTask(environment, "Unterminated tail candidate");
  const candidateAdmission = executionBrief(paths, candidateTask, { ownedPaths: ["workflow/unterminated-candidate/**"] });
  assert.throws(
    () => runRecordStart(parseRecordStartArgs([
      candidateTask, "trigger migration with unterminated stale tail", "--mode=execute",
      "--authorization-ref=user-message:unterminated-tail",
      `--brief=${candidateAdmission.briefPath}`, "--operation-id=start-unterminated-tail",
    ]), { cwd: candidateAdmission.repo, environment }),
    /authoritative tail is not newline-terminated/,
  );
  assert.equal(fs.existsSync(writerControlSnapshotFile(paths)), false);
});

test("writer lease hot snapshot and journal enforce bounded size and entry limits", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Control size root");
  const admission = executionBrief(paths, taskId, { ownedPaths: ["workflow/control-size/**"] });
  runRecordStart(parseRecordStartArgs([
    taskId, "create bounded control snapshot", "--mode=execute",
    "--authorization-ref=user-message:control-size",
    `--brief=${admission.briefPath}`, "--operation-id=start-control-size",
  ]), { cwd: admission.repo, environment });
  const snapshotFile = writerControlSnapshotFile(paths);
  fs.writeFileSync(snapshotFile, `${" ".repeat(260 * 1024)}\n`);
  const oversizeTask = createFixtureTask(environment, "Control oversize candidate");
  const oversizeAdmission = executionBrief(paths, oversizeTask, { ownedPaths: ["workflow/control-oversize/**"] });
  assert.throws(() => runRecordStart(parseRecordStartArgs([
    oversizeTask,
    "reject oversized control snapshot", "--mode=execute",
    "--authorization-ref=user-message:control-oversize",
    `--brief=${oversizeAdmission.briefPath}`,
    "--operation-id=start-control-oversize",
  ]), { cwd: oversizeAdmission.repo, environment }), /snapshot corrupt: exceeds size limit/);

  writeControlJson(snapshotFile, {
    schema_version: 1,
    generation: 1,
    forensic_status: "current",
    coverage_digest: "",
    coverage_count: 0,
    coverage_status: "current",
    leases: [{
      task_id: "oversized-path-task",
      lease_id: "lease-oversized",
      owner_attempt_id: "attempt-oversized",
      state: "active",
      paths: ["x".repeat(600)],
    }],
  });
  const boundedTask = createFixtureTask(environment, "Control bounded candidate");
  const boundedAdmission = executionBrief(paths, boundedTask, { ownedPaths: ["workflow/control-bounded/**"] });
  assert.throws(() => runRecordStart(parseRecordStartArgs([
    boundedTask, "reject oversized path in control snapshot", "--mode=execute",
    "--authorization-ref=user-message:control-bounded",
    `--brief=${boundedAdmission.briefPath}`, "--operation-id=start-control-bounded",
  ]), { cwd: boundedAdmission.repo, environment }), /lease paths required/);
});

function controlFileLabel(paths, file) {
  const resolved = path.resolve(String(file));
  if (resolved === path.resolve(paths.stateDir)) return "state-dir";
  const basename = path.basename(resolved);
  if (basename.includes("team-writer-leases.recovery.json")) return "journal";
  if (basename.includes("team-writer-leases.forensic.json")) return "forensic";
  if (basename.includes("team-writer-leases.json")) return "snapshot";
  return "";
}

function withControlFsLog(paths, callback) {
  const originals = {
    openSync: fs.openSync,
    fsyncSync: fs.fsyncSync,
    renameSync: fs.renameSync,
    rmSync: fs.rmSync,
  };
  const descriptorLabels = new Map();
  const log = [];
  fs.openSync = function loggedOpenSync(file, ...args) {
    const descriptor = originals.openSync.call(this, file, ...args);
    const label = controlFileLabel(paths, file);
    if (label) descriptorLabels.set(descriptor, label);
    return descriptor;
  };
  fs.fsyncSync = function loggedFsyncSync(descriptor, ...args) {
    const label = descriptorLabels.get(descriptor);
    if (label) log.push(`fsync:${label}`);
    return originals.fsyncSync.call(this, descriptor, ...args);
  };
  fs.renameSync = function loggedRenameSync(from, to, ...args) {
    const label = controlFileLabel(paths, to);
    if (label) log.push(`rename:${label}`);
    return originals.renameSync.call(this, from, to, ...args);
  };
  fs.rmSync = function loggedRmSync(file, ...args) {
    const label = controlFileLabel(paths, file);
    if (label && !path.basename(String(file)).startsWith(".")) log.push(`rm:${label}`);
    return originals.rmSync.call(this, file, ...args);
  };
  try {
    return callback(log);
  } finally {
    fs.openSync = originals.openSync;
    fs.fsyncSync = originals.fsyncSync;
    fs.renameSync = originals.renameSync;
    fs.rmSync = originals.rmSync;
  }
}

test("writer lease control writes fsync before rename and fsync directory after remove", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Durable control writer");
  const admission = executionBrief(paths, taskId, { ownedPaths: ["workflow/durable-owned/**"] });
  runRecordStart(parseRecordStartArgs([
    taskId, "execute durable writer", "--mode=execute",
    "--authorization-ref=user-message:durable-writer",
    `--brief=${admission.briefPath}`, "--operation-id=start-durable-writer",
  ]), { cwd: admission.repo, environment });
  invokeControl(runLaneRecord, parseLaneArgs, environment, [
    taskId, "--operation-id=durable-lane", "--action=open", "--lane=writer",
    "--writable", "--paths=workflow/durable-owned/**",
  ]);
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    taskId, "--operation-id=durable-dispatch", "--action=open", "--lane=writer",
    "--dispatch=writer-dispatch",
  ]);
  const log = withControlFsLog(paths, (controlLog) => {
    invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
      taskId, "--operation-id=durable-reserve", "--action=reserve",
      "--dispatch=writer-dispatch", "--attempt=durable-attempt",
      "--launch-operation-id=launch-durable-attempt",
      "--writable", "--paths=workflow/durable-owned/**",
    ]);
    return [...controlLog];
  });
  assert.ok(log.indexOf("fsync:journal") < log.indexOf("rename:journal"));
  assert.ok(log.indexOf("rename:journal") < log.lastIndexOf("rename:snapshot"));
  assert.ok(log.lastIndexOf("rename:snapshot") < log.indexOf("rm:journal"));
  assert.ok(log.indexOf("rm:journal") < log.lastIndexOf("fsync:state-dir"));
});

test("post-event control snapshot failure leaves recovery journal blocking overlap", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const firstTask = createFixtureTask(environment, "Control failure writer");
  const firstAdmission = executionBrief(paths, firstTask, { ownedPaths: ["workflow/control-failure/**"] });
  runRecordStart(parseRecordStartArgs([
    firstTask, "execute control failure writer", "--mode=execute",
    "--authorization-ref=user-message:control-failure",
    `--brief=${firstAdmission.briefPath}`, "--operation-id=start-control-failure",
  ]), { cwd: firstAdmission.repo, environment });
  invokeControl(runLaneRecord, parseLaneArgs, environment, [
    firstTask, "--operation-id=control-failure-lane", "--action=open", "--lane=writer",
    "--writable", "--paths=workflow/control-failure/**",
  ]);
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    firstTask, "--operation-id=control-failure-dispatch", "--action=open", "--lane=writer",
    "--dispatch=writer-dispatch",
  ]);

  const originalRename = fs.renameSync;
  let snapshotRenameCount = 0;
  fs.renameSync = function failSecondSnapshotRename(from, to, ...args) {
    if (path.basename(String(to)) === "team-writer-leases.json") {
      snapshotRenameCount += 1;
      if (snapshotRenameCount === 1) {
        throw new Error("injected snapshot durability failure");
      }
    }
    return originalRename.call(this, from, to, ...args);
  };
  try {
    assert.throws(() => invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
      firstTask, "--operation-id=control-failure-reserve", "--action=reserve",
      "--dispatch=writer-dispatch", "--attempt=control-failure-attempt",
      "--launch-operation-id=launch-control-failure-attempt",
      "--writable", "--paths=workflow/control-failure/**",
    ]), /authoritative event committed but projection is inconsistent: injected snapshot durability failure/);
  } finally {
    fs.renameSync = originalRename;
  }
  assert.equal(fs.existsSync(writerControlJournalFile(paths)), true);
  const secondTask = createFixtureTask(environment, "Control failure overlap");
  const secondAdmission = executionBrief(paths, secondTask, { ownedPaths: ["workflow/control-failure/bin/**"] });
  assert.throws(
    () => runRecordStart(parseRecordStartArgs([
      secondTask, "request overlap after control failure", "--mode=execute",
      "--authorization-ref=user-message:control-failure-overlap",
      `--brief=${secondAdmission.briefPath}`, "--operation-id=start-control-failure-overlap",
    ]), { cwd: secondAdmission.repo, environment }),
    /global writer lease conflict/,
  );
});

test("Team start restores a committed task completion before admission", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Restore done before Team start");
  startNativeRecord(environment, taskId);
  runPromote(parsePromoteArgs([taskId, "--to=finish"]), {
    environment,
    operationId: "finish-before-done-failure",
  });
  runVerification(parseVerifyArgs([taskId, "--", process.execPath, "-e", "process.exit(0)"]), {
    environment,
    operationId: "verify-before-done-failure",
    recordToken: "20260710T120650000000001",
  });
  assert.throws(() => completeTask(taskId, {
    environment,
    failAfterEventAppend: true,
    operationId: "done-projection-failure",
  }), /authoritative event committed but projection is inconsistent/);
  assert.equal(readJsonObject(taskStateFile(paths, taskId)).status, "doing");
  assert.throws(
    () => startNativeRecord(environment, taskId, "2026-07-10T12:07:00.000Z"),
    new RegExp(`task must be doing before team start: ${taskId}`),
  );
  assert.equal(readJsonObject(taskStateFile(paths, taskId)).status, "done");
});

test("size exceptions are explicit and cannot downgrade permanent gates", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Size exception");
  const sizeException = {
    authority_ref: "user-message:size-exception",
    expires_at: "2099-01-01T00:00:00Z",
    reason: "bounded integration slice cannot be divided safely",
    compensating_controls: ["independent final contract verification"],
  };
  const admitted = executionBrief(paths, taskId, {
    budget: { max_changed_files: 1, max_loc: 1, max_wall_clock_minutes: 1, max_required_checks: 1 },
    ownedPaths: ["workflow/**", "plugins/**"],
    sizeDecision: "exception",
    sizeException,
  });
  runRecordStart(parseRecordStartArgs([
    taskId, "execute exception-authorized slice", "--mode=execute",
    "--authorization-ref=user-message:size-execute",
    `--brief=${admitted.briefPath}`, "--operation-id=start-size-exception",
  ]), { cwd: admitted.repo, environment });

  const { environment: unsafeEnvironment, paths: unsafePaths } = temporaryWorkflow(t);
  const unsafeTask = createFixtureTask(unsafeEnvironment, "Unsafe permanent gate");
  const unsafe = executionBrief(unsafePaths, unsafeTask, {
    cachePolicy: "cached",
    gateClass: "security",
    budget: { max_changed_files: 1, max_loc: 1, max_wall_clock_minutes: 1, max_required_checks: 1 },
    ownedPaths: ["workflow/**", "plugins/**"],
    sizeDecision: "exception",
    sizeException,
  });
  assert.throws(() => runRecordStart(parseRecordStartArgs([
    unsafeTask, "reject downgraded security gate", "--mode=execute",
    "--authorization-ref=user-message:unsafe-execute",
    `--brief=${unsafe.briefPath}`, "--operation-id=start-unsafe-exception",
  ]), { cwd: unsafe.repo, environment: unsafeEnvironment }), /permanent gate security must be fresh-executed/);
});

test("slice acceptance rejects actual diff drift beyond 150 percent", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Actual size drift");
  const checkCommand = [process.execPath, "-e", "process.exit(0)"];
  const admission = executionBrief(paths, taskId, {
    command: formatCommand(checkCommand).trimEnd(),
    estimate: {
      estimated_changed_files: 1,
      estimated_net_loc: 1,
      target_p90_minutes: 10,
      serial_dependency_depth: 0,
      independent_vertical_count: 1,
    },
    ownedPaths: ["src/bounded/**"],
  });
  runRecordStart(parseRecordStartArgs([
    taskId, "execute drifted slice", "--mode=execute",
    "--authorization-ref=user-message:size-drift",
    `--brief=${admission.briefPath}`, "--operation-id=start-size-drift",
  ]), { cwd: admission.repo, environment });
  runPromote(parsePromoteArgs([taskId, "--to=finish"]), {
    environment,
    operationId: "finish-size-drift",
  });
  const keeper = path.join(admission.repo, "src", "bounded", "keeper.txt");
  fs.mkdirSync(path.dirname(keeper), { recursive: true });
  fs.writeFileSync(keeper, "one\ntwo\nthree\n");
  runVerification(parseVerifyArgs([
    taskId, `--brief=${admission.briefPath}`, "--slice-id=execution-slice",
    "--check-id=execution-contract", "--", ...checkCommand,
  ]), {
    cwd: admission.repo,
    environment,
    operationId: "verify-size-drift",
    recordToken: "20260710T120800000000001",
  });
  assert.throws(() => runSliceAccept(parseSliceAcceptArgs([
    taskId, `--brief=${admission.briefPath}`, "--operation-id=accept-size-drift",
    "--keeper-output=event:execution-slice-complete=src/bounded/keeper.txt",
  ]), { environment }), /slice requires pause\/replan: actual size/);
});

test("slice acceptance rejects candidate B changed after gates verified candidate A", async (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Candidate tree race");
  const checkCommand = [process.execPath, "-e", "process.exit(0)"];
  const admission = executionBrief(paths, taskId, {
    command: formatCommand(checkCommand).trimEnd(),
    ownedPaths: ["src/candidate-race/**"],
  });
  runRecordStart(parseRecordStartArgs([
    taskId, "verify immutable candidate A", "--mode=execute",
    "--authorization-ref=user-message:candidate-race",
    `--brief=${admission.briefPath}`, "--operation-id=start-candidate-race",
  ]), { cwd: admission.repo, environment });
  runPromote(parsePromoteArgs([taskId, "--to=finish"]), {
    environment,
    operationId: "finish-candidate-race-team",
  });
  const keeperRelative = "src/candidate-race/keeper.txt";
  const keeper = path.join(admission.repo, keeperRelative);
  fs.mkdirSync(path.dirname(keeper), { recursive: true });
  fs.writeFileSync(keeper, "candidate A\n");
  runVerification(parseVerifyArgs([
    taskId, `--brief=${admission.briefPath}`, "--slice-id=execution-slice",
    "--check-id=execution-contract", "--", ...checkCommand,
  ]), {
    cwd: admission.repo,
    environment,
    operationId: "verify-candidate-a",
    recordToken: "20260730T120800000000001",
  });

  const marker = path.join(paths.root, "candidate-race-ready");
  const accepting = spawnWorkflow({
    ...environment,
    CODEX_WORKFLOW_TEST_SLICE_ACCEPT_PAUSE_AFTER_DEPENDENCIES: "0.5",
    CODEX_WORKFLOW_TEST_SLICE_ACCEPT_PAUSE_MARKER: marker,
  }, [
    "team-slice-accept", taskId, `--brief=${admission.briefPath}`,
    "--operation-id=accept-candidate-b",
    `--keeper-output=event:execution-slice-complete=${keeperRelative}`,
  ], admission.repo);
  await waitForFile(marker);
  fs.writeFileSync(keeper, "candidate B\n");
  const result = await accepting;
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /candidate changed after required verification/);
  assert.equal(readJsonObject(taskStateFile(paths, taskId)).slice_acceptances?.["execution-slice"], undefined);
  assert.notEqual(authoritativeEvents(paths, taskId).at(-1).kind, "slice.accepted");
});

test("discuss compatibility never grants a writable lease", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Discuss read only");
  startNativeRecord(environment, taskId);
  invokeControl(runLaneRecord, parseLaneArgs, environment, [
    taskId, "--operation-id=discuss-writer-lane", "--action=open", "--lane=writer",
    "--writable", "--paths=workflow/**",
  ]);
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    taskId, "--operation-id=discuss-writer-dispatch", "--action=open", "--lane=writer",
    "--dispatch=writer-dispatch",
  ]);
  assert.throws(() => invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=discuss-writer-reserve", "--action=reserve",
    "--dispatch=writer-dispatch", "--attempt=discuss-writer-attempt",
    "--launch-operation-id=launch-discuss-writer", "--writable", "--paths=workflow/**",
  ]), /writable attempt requires execute mode/);
  assert.equal(readTeam(paths, taskId).writer_leases.length, 0);
});

test("empty writer candidates do not scan unrelated authoritative event streams", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const unrelatedTask = path.join(paths.artifactsDir, "unrelated-empty-candidate-history");
  fs.mkdirSync(unrelatedTask, { recursive: true });
  const guardedUnrelatedEvents = path.join(unrelatedTask, "events-v2.jsonl");
  fs.writeFileSync(guardedUnrelatedEvents, "not json and must not be read\n");
  const taskId = createFixtureTask(environment, "Empty candidate discuss");
  withReadFileGuard(guardedUnrelatedEvents, () => startNativeRecord(environment, taskId));
  assert.equal(readTeam(paths, taskId).writer_leases.length, 0);
  assert.equal(fs.existsSync(path.join(paths.stateDir, "team-writer-leases.json")), false);
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
      updateTaskCommand(paths, taskId, { status: "done" }, { status: "done" },
        clockAt("2026-07-10T12:00:30.000Z"));
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
  const staleLoopState = readJsonObject(taskStateFile(paths, taskId));
  staleLoopState.active_team = {
    backend: "paseo", mode: "discuss", status: "running", decision: "legacy",
  };
  fs.writeFileSync(taskStateFile(paths, taskId), `${JSON.stringify(staleLoopState, null, 2)}\n`);
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

  const admission = executionBrief(paths, taskId);
  const execute = runPromote(parsePromoteArgs([
    taskId,
    "--to=execute",
    "--authorization-ref=user-message:implement-roadmap",
    `--brief=${admission.briefPath}`,
    "--operation-id=promote-execution",
  ]), {
    clock: clockAt("2026-07-10T12:05:00.000Z"),
    cwd: admission.repo,
    environment,
  });
  assert.deepEqual(execute.lines, [
    `task_id: ${taskId}`,
    "target: execute",
    `decision: ${teamDecisionFile(paths, taskId)}`,
    "authorization_ref: user-message:implement-roadmap",
    `brief: ${admission.briefPath}`,
    "operation_id: promote-execution",
  ]);
  let state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(state.active_team.mode, "execute");
  assert.equal(state.active_team.promoted_to, "execute");
  assert.equal(state.active_team.authorization_ref, "user-message:implement-roadmap");
  assert.equal(state.active_team.admission.mode, "execution-v3");
  const runtimeAfterPromotion = fs.readFileSync(runtimeFile, "utf8");
  const replay = runPromote(parsePromoteArgs([
    taskId,
    "--to=execute",
    "--authorization-ref=user-message:implement-roadmap",
    `--brief=${admission.briefPath}`,
    "--operation-id=promote-execution",
  ]), { clock: clockAt("2026-07-10T12:05:00.000Z"), cwd: admission.repo, environment });
  assert.equal(replay.lines.at(-1), "replayed: true");
  assert.equal(fs.readFileSync(runtimeFile, "utf8"), runtimeAfterPromotion);

  const briefBeforeConflict = fs.readFileSync(admission.briefPath, "utf8");
  try {
    fs.appendFileSync(admission.briefPath, "\n");
    assert.throws(() => runPromote(parsePromoteArgs([
      taskId,
      "--to=execute",
      "--authorization-ref=user-message:implement-roadmap",
      `--brief=${admission.briefPath}`,
      "--operation-id=promote-execution",
    ]), {
      clock: clockAt("2026-07-10T12:05:00.000Z"),
      cwd: admission.repo,
      environment,
    }), /operation_id replay conflict/);
  } finally {
    fs.writeFileSync(admission.briefPath, briefBeforeConflict);
  }

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
  const staleFinalizeState = readJsonObject(taskStateFile(paths, taskId));
  staleFinalizeState.active_team = {
    backend: "native", mode: "discuss", status: "running", decision: "legacy",
  };
  fs.writeFileSync(taskStateFile(paths, taskId), `${JSON.stringify(staleFinalizeState, null, 2)}\n`);
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

test("direct non-Claude providers and exact unknown selections pass model admission", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Scoped unknown model admission");
  startPaseoRecord(environment, taskId);

  invokeControl(runLaneRecord, parseLaneArgs, environment, [
    taskId, "--operation-id=kimi-lane-open", "--action=open", "--lane=kimi-ui",
  ]);
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    taskId, "--operation-id=kimi-dispatch-open", "--action=open", "--lane=kimi-ui",
    "--dispatch=kimi-ui-dispatch",
  ]);
  recordCapability(environment, taskId, {
    snapshotId: "kimi-capability", provider: "kimi",
    model: "zenmux-kimi/moonshotai/kimi-k3", family: undefined,
    runtimeModes: ["default"],
  });
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=kimi-attempt-reserve", "--action=reserve",
    "--dispatch=kimi-ui-dispatch", "--attempt=kimi-ui-attempt",
    "--provider=kimi", "--model=zenmux-kimi/moonshotai/kimi-k3",
    "--capability-snapshot=kimi-capability", "--launch-operation-id=launch-kimi-ui",
  ]);

  recordCapability(environment, taskId, {
    snapshotId: "openai-capability", provider: "openai",
    model: "gpt-family-unspecified", family: undefined,
  });

  invokeControl(runLaneRecord, parseLaneArgs, environment, [
    taskId, "--operation-id=unknown-lane-open", "--action=open", "--lane=unknown-exact",
  ]);
  invokeControl(runDispatchRecord, parseDispatchArgs, environment, [
    taskId, "--operation-id=unknown-dispatch-open", "--action=open", "--lane=unknown-exact",
    "--dispatch=unknown-exact-dispatch",
  ]);
  recordCapability(environment, taskId, {
    snapshotId: "unknown-exact-capability", provider: "custom-gateway",
    model: "opaque-model-id", family: "unclassified",
  });
  invokeControl(runSelectionRecord, parseSelectionArgs, environment, [
    taskId, "--operation-id=unknown-model-selection-op",
    "--event-id=unknown-model-selection", "--kind=model",
    "--scope=dispatch:unknown-exact-dispatch", "--authority-kind=user-message",
    "--authority-ref=user-message:unknown-exact", "--provider=custom-gateway",
    "--model=opaque-model-id",
  ]);
  invokeControl(runAttemptRecord, parseAttemptArgs, environment, [
    taskId, "--operation-id=unknown-exact-reserve", "--action=reserve",
    "--dispatch=unknown-exact-dispatch", "--attempt=unknown-exact-attempt",
    "--provider=custom-gateway", "--model=opaque-model-id",
    "--capability-snapshot=unknown-exact-capability",
    "--model-selection-event=unknown-model-selection",
    "--launch-operation-id=launch-unknown-exact",
  ]);

  const team = readTeam(paths, taskId);
  assert.equal(
    team.capability_snapshots.find((item) => item.snapshot_id === "kimi-capability").model_family,
    "non-claude",
  );
  assert.equal(
    team.capability_snapshots.find((item) => item.snapshot_id === "openai-capability").model_family,
    "non-claude",
  );
  assert.equal(
    team.attempts.find((item) => item.attempt_id === "kimi-ui-attempt").model_selection_event_id,
    "",
  );
  const unknownAttempt = team.attempts.find((item) => item.attempt_id === "unknown-exact-attempt");
  assert.equal(unknownAttempt.model_family, "unknown");
  assert.equal(unknownAttempt.model_selection_event_id, "unknown-model-selection");
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
  const admission = executionBrief(paths, taskId);
  runRecordStart(parseRecordStartArgs([
    taskId, "execute a bounded Paseo lane", "--backend=paseo", "--mode=execute",
    "--fallback-policy=codex", "--selection-authority-kind=user-message",
    "--selection-authority-ref=user-message:paseo-writer",
    "--authorization-ref=user-message:execute-writer",
    `--brief=${admission.briefPath}`, "--operation-id=start-paseo-writer",
  ]), { cwd: admission.repo, environment });
  invokeControl(runLaneRecord, parseLaneArgs, environment, [
    taskId, "--operation-id=writer-lane-open", "--action=open", "--lane=writer",
    "--writable", "--paths=workflow/test-owned/**",
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
    "--runtime-mode-id=structured-write-v1", "--writable", "--paths=workflow/test-owned/**",
    `--launch-operation-id=launch-${attemptId}`, ...extra,
  ];
  invokeControl(runAttemptRecord, parseAttemptArgs, environment,
    paseoAttempt("writer-attempt-reserve-1", "paseo-writer-1"));

  invokeControl(runLaneRecord, parseLaneArgs, environment, [
    taskId, "--operation-id=conflict-lane-open", "--action=open", "--lane=conflict",
    "--writable", "--paths=workflow/test-owned/bin/**",
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
      "--runtime-mode-id=structured-write-v1", "--writable", "--paths=workflow/test-owned/bin/**",
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
  assert.deepEqual(team.attempts.find((item) => item.attempt_id === "native-writer").owned_paths,
    ["workflow/test-owned/**"]);
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
  const staleState = readJsonObject(taskStateFile(paths, taskId));
  staleState.active_team = {
    backend: "paseo", mode: "execute", status: "failed", decision: "stale/decision.md",
  };
  fs.writeFileSync(taskStateFile(paths, taskId), `${JSON.stringify(staleState, null, 2)}\n`);
  const authoritativeStatus = runStatus([taskId], { environment });
  assert.ok(authoritativeStatus.lines.includes("team_schema_version: 2"));
  assert.ok(authoritativeStatus.lines.includes("team_status: running"));
  runStop([taskId], { environment });
  let team = readTeam(paths, taskId);
  assert.equal(team.schema_version, 2);
  assert.equal(team.backend, "native");
  assert.equal(team.mode, "discuss");
  assert.equal(team.status, "stopped");
  assert.notEqual(team.decision, "stale/decision.md");

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
