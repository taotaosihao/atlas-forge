"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

const REPO_ROOT = path.resolve(__dirname, "../../..");
const WORKFLOW_ROOT = path.resolve(__dirname, "../..");
const PUBLIC_BIN = path.join(WORKFLOW_ROOT, "bin", "codex-workflow");
const TEMPLATE_DIR = path.join(WORKFLOW_ROOT, "templates");
const { resolvePaths, taskArtifactDir } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/core/paths.js",
));
const { readAuthoritativeEvents } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/core/event-store.js",
));
const { mutateTaskRuntime, taskEventFile } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/core/task-mutation.js",
));
const { completeTask, createTask, startTask } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/task/lifecycle.js",
));
const {
  assertExecutionGrantDecisionFresh,
  checkDecisions,
  parseDecisionCheckArgs,
  parseDecisionConflictArgs,
  parseDecisionRecordArgs,
  readDecisionControl,
  recordDecision,
  recordDecisionConflict,
} = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/artifact/decisions.js",
));
const { parsePromptArgs, writePromptBundle } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/artifact/provenance.js",
));
const {
  parseLaneArgs,
  parseRecordStartArgs,
  runLaneRecord,
  runRecordStart,
  runStop,
} = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/team/commands.js",
));
const { parseVerifyArgs, runVerification } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/verification/runner.js",
));
const { runLegacyTeamCommand } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/team/legacy-bridge.js",
));

function fixedClock() {
  return new Date("2026-09-02T04:00:00.000Z");
}

function temporaryWorkflow(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-decision-control."));
  const environment = {
    ...process.env,
    HOME: home,
    CODEX_HOME_ROOT: home,
    CODEX_WORKFLOW_ROOT: path.join(home, "workflow"),
    CODEX_WORKFLOW_TEMPLATE_DIR: TEMPLATE_DIR,
    TMPDIR: path.join(home, "tmp"),
  };
  t.after(() => fs.rmSync(home, { force: true, recursive: true }));
  return { environment, home, paths: resolvePaths(environment) };
}

function createFixtureTask(environment, title) {
  const options = { clock: fixedClock, environment };
  const taskId = createTask(title, "decision supersession contract", options);
  startTask(taskId, options);
  return taskId;
}

function record(environment, argv) {
  return recordDecision(parseDecisionRecordArgs(argv), {
    clock: fixedClock,
    environment,
  });
}

function conflict(environment, argv) {
  return recordDecisionConflict(parseDecisionConflictArgs(argv), {
    clock: fixedClock,
    environment,
  });
}

function bundle(environment, home, taskId) {
  const context = path.join(home, "context.md");
  fs.writeFileSync(context, "current task context\n", "utf8");
  return writePromptBundle(parsePromptArgs([
    taskId,
    "--include",
    context,
    "--agent=reviewer",
  ]), { clock: fixedClock, cwd: home, environment });
}

function verify(environment, taskId, recordToken) {
  return runVerification(parseVerifyArgs([
    taskId,
    "--outcome=passed",
    "--",
    process.execPath,
    "-e",
    "process.exit(0)",
  ]), { clock: fixedClock, environment, recordToken });
}

test("a correction atomically replaces the old design and invalidates stale consumers", (t) => {
  const { environment, home, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Supersede an old design");
  const first = record(environment, [
    taskId,
    "--id=business-logic-rejection",
    "--authority-ref=user-message:initial",
    "--statement=reject pallet reuse in the business layer",
    "--operation-id=decision-initial",
  ]);
  const firstRevision = Number(
    first.find((line) => line.startsWith("decision_revision: ")).slice(19),
  );

  bundle(environment, home, taskId);
  assert.throws(
    () => record(environment, [
      taskId,
      "--id=invalid-rejection",
      "--authority-ref=user-message:correction",
      "--statement=keep the old decision active while rejecting it",
      "--reject=reject pallet reuse in the business layer",
      "--operation-id=decision-invalid-rejection",
    ]),
    /rejected behavior is still active; supersede decision: business-logic-rejection/,
  );
  record(environment, [
    taskId,
    "--id=read-only-reuse-hint",
    "--authority-ref=user-message:correction",
    "--statement=keep pallet reuse as a read-only hint and preserve existing business logic",
    "--supersedes=business-logic-rejection",
    "--reject=change existing business logic for pallet reuse",
    "--operation-id=decision-correction",
  ]);

  const control = readDecisionControl(paths, taskId);
  assert.deepEqual(control.active.map((item) => item.decision_id), ["read-only-reuse-hint"]);
  assert.deepEqual(control.rejected_behaviors, [
    "reject pallet reuse in the business layer",
    "change existing business logic for pallet reuse",
  ]);
  const staleAuthority = {
    execution_authority: {
      grants: [{
        grant_id: "grant-before-correction",
        issued_revision: firstRevision,
        status: "active",
      }],
    },
  };
  assert.throws(
    () => assertExecutionGrantDecisionFresh(staleAuthority, control),
    /stale execution grant.*explicit replan is required/,
  );
  const rendered = fs.readFileSync(path.join(taskArtifactDir(paths, taskId), "decisions.md"), "utf8");
  assert.match(rendered, /Rejected behavior — must not execute/);
  assert.match(rendered, /preserve existing business logic/);
  assert.throws(
    () => readDecisionControl(paths, taskId, { expectedRevision: firstRevision }),
    /stale decision snapshot/,
  );
  assert.throws(
    () => record(environment, [
      taskId,
      "--id=invalid-revival",
      "--authority-ref=user-message:invalid",
      "--statement=revive the superseded rejection",
      "--supersedes=business-logic-rejection",
      "--operation-id=decision-invalid-revival",
    ]),
    /cannot supersede inactive decision/,
  );

  const startArgs = parseRecordStartArgs([
    taskId,
    "review the current pallet reuse behavior",
    "--mode=discuss",
    "--agents=1",
    "--roles=reviewer",
  ]);
  assert.throws(
    () => runRecordStart(startArgs, { clock: fixedClock, environment }),
    /stale prompt bundle decision snapshot/,
  );
  bundle(environment, home, taskId);
  runRecordStart(startArgs, { clock: fixedClock, environment });

  record(environment, [
    taskId,
    "--id=read-only-reuse-hint-confirmed",
    "--authority-ref=user-message:confirmation",
    "--statement=the read-only reuse hint remains the complete replacement",
    "--supersedes=read-only-reuse-hint",
    "--operation-id=decision-confirmation",
  ]);
  assert.throws(
    () => runLaneRecord(parseLaneArgs([
      taskId,
      "--operation-id=stale-review-lane",
      "--action=open",
      "--lane=review",
      "--purpose=current-design-review",
      "--role=reviewer",
    ]), { clock: fixedClock, environment }),
    /stale Team decision snapshot/,
  );

  runStop([taskId], { clock: fixedClock, environment });
  bundle(environment, home, taskId);
  runRecordStart(startArgs, { clock: fixedClock, environment });
  const opened = runLaneRecord(parseLaneArgs([
    taskId,
    "--operation-id=fresh-review-lane",
    "--action=open",
    "--lane=review",
    "--purpose=current-design-review",
    "--role=reviewer",
  ]), { clock: fixedClock, environment });
  assert.equal(opened.exitCode, 0);
});

test("review evidence that conflicts with an approved design requires a new user decision", (t) => {
  const { environment, home, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Escalate design conflict");
  record(environment, [
    taskId,
    "--id=confirmed-pose",
    "--authority-ref=user-message:pose-confirmed",
    "--statement=the poses at 4.7 and 6.7 are correct and define the remaining poses",
    "--operation-id=decision-pose",
  ]);
  conflict(environment, [
    taskId,
    "--id=endpoint-offset",
    "--decision=confirmed-pose",
    "--reason=the measured endpoint does not match the supplied asset origin",
    "--evidence=team/review/endpoint-offset.md",
    "--operation-id=conflict-endpoint",
  ]);

  assert.throws(
    () => checkDecisions(parseDecisionCheckArgs([taskId]), { environment }),
    /HUMAN_DECISION_REQUIRED.*endpoint-offset/,
  );
  assert.throws(
    () => bundle(environment, home, taskId),
    /HUMAN_DECISION_REQUIRED/,
  );
  assert.throws(
    () => verify(environment, taskId, "20260902T040000000000000"),
    /HUMAN_DECISION_REQUIRED/,
  );
  assert.throws(
    () => record(environment, [
      taskId,
      "--id=reviewer-reinterpretation",
      "--authority-ref=user-message:not-a-resolution",
      "--statement=treat the confirmed poses as reference only",
      "--resolves=endpoint-offset",
      "--operation-id=decision-silent-reinterpretation",
    ]),
    /requires superseding its challenged decision/,
  );
  record(environment, [
    taskId,
    "--id=confirmed-pose-resolution",
    "--authority-ref=user-message:resolve-endpoint",
    "--statement=keep 4.7 and 6.7 correct and fix the endpoint asset or pivot instead",
    "--supersedes=confirmed-pose",
    "--resolves=endpoint-offset",
    "--reject=treat the confirmed poses as reference only",
    "--operation-id=decision-endpoint-resolution",
  ]);

  const lines = checkDecisions(parseDecisionCheckArgs([taskId]), { environment });
  assert.ok(lines.includes("status: current"));
  assert.ok(lines.includes("open_conflicts: 0"));
  bundle(environment, home, taskId);
  const manifest = JSON.parse(fs.readFileSync(
    path.join(taskArtifactDir(paths, taskId), "prompt-bundle.json"),
    "utf8",
  ));
  const control = readDecisionControl(paths, taskId);
  assert.ok(manifest.files.some((entry) => entry.path.endsWith("/decisions.md")));
  assert.deepEqual(control.open_conflicts, []);
  assert.deepEqual(control.active.map((item) => item.decision_id), [
    "confirmed-pose-resolution",
  ]);
  assert.deepEqual(manifest.decision_snapshot, {
    schema_version: 1,
    revision: control.revision,
  });
});

test("a rejected decision cannot revive implicitly but an explicit reversal is auditable", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Reject implicit decision revival");
  record(environment, [
    taskId,
    "--id=old-design",
    "--authority-ref=user-message:old-design",
    "--statement=use the old design",
    "--operation-id=old-design",
  ]);
  record(environment, [
    taskId,
    "--id=corrected-design",
    "--authority-ref=user-message:corrected-design",
    "--statement=use the corrected design",
    "--supersedes=old-design",
    "--operation-id=corrected-design",
  ]);

  assert.throws(() => record(environment, [
    taskId,
    "--id=implicit-revival",
    "--authority-ref=user-message:implicit-revival",
    "--statement=use the old design",
    "--operation-id=implicit-revival",
  ]), /cannot be reactivated without superseding current decision: corrected-design/);
  assert.deepEqual(readDecisionControl(paths, taskId).active.map((item) => item.decision_id), [
    "corrected-design",
  ]);

  record(environment, [
    taskId,
    "--id=explicit-reversal",
    "--authority-ref=user-message:explicit-reversal",
    "--statement=use the old design",
    "--supersedes=corrected-design",
    "--operation-id=explicit-reversal",
  ]);
  const reversed = readDecisionControl(paths, taskId);
  assert.deepEqual(reversed.active.map((item) => item.decision_id), ["explicit-reversal"]);
  assert.deepEqual(reversed.rejected_behaviors, ["use the corrected design"]);
});

test("legacy Team never starts with decisions or an unresolved decision conflict", (t) => {
  const { environment } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Close legacy decision bypass");
  record(environment, [
    taskId,
    "--id=current-design",
    "--authority-ref=user-message:current-design",
    "--statement=use the current design",
    "--operation-id=current-design",
  ]);
  assert.throws(() => runLegacyTeamCommand([
    "team-start", taskId, "review the design", "--mode=discuss",
  ], { environment, legacyBin: "/usr/bin/true" }), /use team-record-start/);

  conflict(environment, [
    taskId,
    "--id=design-conflict",
    "--decision=current-design",
    "--reason=review evidence conflicts with the design",
    "--evidence=team/review/design-conflict.md",
    "--operation-id=design-conflict",
  ]);
  assert.throws(() => runLegacyTeamCommand([
    "team-start", taskId, "review the design", "--mode=discuss",
  ], { environment, legacyBin: "/usr/bin/true" }), /HUMAN_DECISION_REQUIRED/);
});

test("verification cannot record a stale pass when a correction lands during the command", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Reject stale verification terminal");
  record(environment, [
    taskId,
    "--id=design-v1",
    "--authority-ref=user-message:design-v1",
    "--statement=verify design v1",
    "--operation-id=design-v1",
  ]);

  assert.throws(() => runVerification(parseVerifyArgs([
    taskId,
    "--",
    PUBLIC_BIN,
    "decision-record",
    taskId,
    "--id=design-v2",
    "--authority-ref=user-message:design-v2",
    "--statement=verify design v2",
    "--supersedes=design-v1",
    "--operation-id=design-v2",
  ]), {
    clock: fixedClock,
    environment,
    operationId: "verification-crossing-correction",
    recordToken: "20260902T040000000000003",
  }), /stale verification: command observed revision/);

  const events = readAuthoritativeEvents(taskEventFile(paths, taskId), taskId);
  assert.equal(events.at(-1).kind, "decision.recorded");
  assert.equal(events.at(-1).data.decision_id, "design-v2");
  assert.equal(events.some((event) => (
    event.kind === "verification.recorded"
      && event.operation_id === "verification-crossing-correction"
  )), false);
});

test("authoritative forward transitions fail closed on decision conflicts", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Gate every authoritative forward transition");
  record(environment, [
    taskId,
    "--id=current-design",
    "--authority-ref=user-message:current-design",
    "--statement=use the current design",
    "--operation-id=current-design",
  ]);
  conflict(environment, [
    taskId,
    "--id=blocking-conflict",
    "--decision=current-design",
    "--reason=review evidence requires a user decision",
    "--evidence=team/review/blocking-conflict.md",
    "--operation-id=blocking-conflict",
  ]);
  const before = readAuthoritativeEvents(taskEventFile(paths, taskId), taskId).length;

  for (const [kind, data] of [
    ["authority.grant.issued", { brief_path: "/tmp/unused-brief" }],
    ["authority.replanned", { brief_path: "/tmp/unused-brief" }],
    ["slice.accepted", {}],
    ["verification.recorded", { observed_revision: before }],
    ["task.completion.closed", { outcome: "succeeded" }],
  ]) {
    assert.throws(() => mutateTaskRuntime(
      paths,
      taskId,
      { kind, operationId: `blocked-${kind}`, data },
      ({ currentProjection }) => ({ projection: currentProjection, result: {} }),
      { clock: fixedClock, environment },
    ), /HUMAN_DECISION_REQUIRED/);
    assert.equal(readAuthoritativeEvents(taskEventFile(paths, taskId), taskId).length, before);
  }
});

test("slice acceptance cannot cross a newer correction", (t) => {
  const { environment, home, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Reject stale Team acceptance");
  record(environment, [
    taskId,
    "--id=design-v1",
    "--authority-ref=user-message:design-v1",
    "--statement=use design v1",
    "--operation-id=design-v1",
  ]);
  bundle(environment, home, taskId);
  runRecordStart(parseRecordStartArgs([
    taskId,
    "review design v1",
    "--mode=discuss",
    "--agents=1",
    "--roles=reviewer",
  ]), { clock: fixedClock, environment });
  record(environment, [
    taskId,
    "--id=design-v2",
    "--authority-ref=user-message:design-v2",
    "--statement=use design v2",
    "--supersedes=design-v1",
    "--operation-id=design-v2",
  ]);
  const before = readAuthoritativeEvents(taskEventFile(paths, taskId), taskId).length;

  assert.throws(() => mutateTaskRuntime(
    paths,
    taskId,
    { kind: "slice.accepted", operationId: "stale-slice-acceptance", data: {} },
    ({ currentProjection }) => ({
      projection: currentProjection,
      result: { accepted: { verification_records: [] } },
    }),
    { clock: fixedClock, environment },
  ), /stale Team decision snapshot/);
  assert.equal(readAuthoritativeEvents(taskEventFile(paths, taskId), taskId).length, before);
});

test("successful completion requires verification newer than the latest correction", (t) => {
  const { environment } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Reverify a correction");
  record(environment, [
    taskId,
    "--id=layout-v1",
    "--authority-ref=user-message:layout-v1",
    "--statement=use the first approved layout",
    "--operation-id=decision-layout-v1",
  ]);
  verify(environment, taskId, "20260902T040000000000001");
  record(environment, [
    taskId,
    "--id=layout-v2",
    "--authority-ref=user-message:layout-v2",
    "--statement=use the corrected compact layout",
    "--supersedes=layout-v1",
    "--operation-id=decision-layout-v2",
  ]);

  assert.throws(
    () => completeTask(taskId, { clock: fixedClock, environment }),
    /stale verification.*decision revision/,
  );
  verify(environment, taskId, "20260902T040000000000002");
  const completed = completeTask(taskId, { clock: fixedClock, environment });
  assert.equal(completed.result.outcome, "succeeded");
});

test("decision parsers reject incomplete commands", () => {
  assert.throws(
    () => parseDecisionRecordArgs(["task", "--id=one"]),
    /missing required argument: --authority-ref/,
  );
  assert.throws(
    () => parseDecisionConflictArgs(["task", "--id=conflict"]),
    /missing required argument: --decision/,
  );
  assert.throws(
    () => parseDecisionCheckArgs(["task", "--unknown=value"]),
    /usage: codex-workflow decision-check/,
  );
});

test("design-bearing skills and agent roles carry the supersession contract", () => {
  const reference = fs.readFileSync(path.join(
    REPO_ROOT,
    "plugins/atlas-workflow/references/decision-supersession.md",
  ), "utf8");
  for (const phrase of [
    "A correction is replacement, not an additive exception",
    "HUMAN_DECISION_REQUIRED",
    "decision-conflict",
    "decision-check",
  ]) {
    assert.match(reference, new RegExp(phrase));
  }

  const skills = [
    "3d-harness",
    "analyze",
    "brainstorm",
    "clarify",
    "design-review",
    "intake",
    "office-hours",
    "product-design",
    "task",
    "team",
    "team-v1",
  ];
  for (const skill of skills) {
    const content = fs.readFileSync(path.join(
      REPO_ROOT,
      "plugins/atlas-workflow/skills",
      skill,
      "SKILL.md",
    ), "utf8");
    assert.match(content, /decision-supersession\.md/, skill);
  }

  for (const directory of [
    path.join(REPO_ROOT, "plugins/atlas-workflow/agents"),
    path.join(REPO_ROOT, ".codex/agents"),
  ]) {
    const files = fs.readdirSync(directory)
      .filter((file) => /^atlas-sdd-.*\.(md|toml)$/.test(file));
    assert.ok(files.length > 0, directory);
    for (const file of files) {
      const content = fs.readFileSync(path.join(directory, file), "utf8");
      assert.match(content, /active decisions/i, file);
      assert.match(content, /rejected behavior/i, file);
    }
  }
});
