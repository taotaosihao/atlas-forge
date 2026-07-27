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
  TRACE_USAGE,
  parseFeedbackArgs,
  parseLearningDecisionArgs,
  parseLessonArgs,
  parseTraceArgs,
  runFeedbackCycle,
  runLearningDecision,
  runLessonCandidate,
  runTracePromotion,
  tracePreview,
} = require(path.join(WORKFLOW_ROOT, "bin/lib/codex-workflow/feedback/commands.js"));
const {
  computeGoalRef,
  digestFile,
} = require(path.resolve(
  WORKFLOW_ROOT,
  "../plugins/atlas-workflow/contracts/team-sdd/validators/controller-resolution.js",
));

function clockAt(value) {
  return () => new Date(value);
}

function temporaryWorkflow(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-feedback-commands."));
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

function createFixtureTask(environment, title = "Feedback commands") {
  return createTask(title, "feedback contract", {
    clock: clockAt("2026-07-10T11:00:00.000Z"),
    environment,
  });
}

function readJsonLines(file) {
  return fs
    .readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

function legacyShape(event) {
  return { kind: event.kind, detail: event.detail, created_at: event.created_at };
}

test("promotes the latest failed verification into trace and regression records", (t) => {
  assert.equal(
    tracePreview(Array.from({ length: 121 }, (_, index) => `${index}`).join("\n")).split(
      "\n",
    ).length,
    120,
  );
  assert.match(tracePreview("x".repeat(7000)), /\n\.\.\. \(truncated\)$/);

  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Trace promotion");
  const artifactDir = taskArtifactDir(paths, taskId);
  const verificationDir = path.join(artifactDir, "verification");
  fs.writeFileSync(path.join(verificationDir, "001.md"), "- verdict: passed\n- exit_code: 0\n");
  fs.writeFileSync(path.join(verificationDir, "002.md"), "- verdict: failed\n- exit_code: 2\n");
  const latest = path.join(verificationDir, "003.md");
  fs.writeFileSync(latest, "- verdict: failed\n- exit_code: 3\nlatest failure\n");

  const result = runTracePromotion(
    parseTraceArgs([
      taskId,
      "--from=latest",
      "--type",
      "regression",
      "--reason",
      "preserve failed behavior",
    ]),
    { clock: clockAt("2026-07-10T11:01:02.000Z"), environment },
  );
  const candidate = "T20260710110102";
  const traceFile = path.join(artifactDir, "trace-candidates.md");
  const regression = path.join(artifactDir, "regressions", `${candidate}.md`);
  assert.deepEqual(result.lines, [
    `task_id: ${taskId}`,
    `artifact: ${traceFile}`,
    `candidate: ${candidate}`,
    `source: ${latest}`,
    "type: regression",
    "owner: atlas",
    `regression: ${regression}`,
  ]);
  assert.match(fs.readFileSync(traceFile, "utf8"), /latest failure/);
  assert.match(fs.readFileSync(regression, "utf8"), /preserve failed behavior/);
  const ledger = readJsonLines(path.join(artifactDir, "ledger.jsonl"));
  assert.deepEqual(ledger.at(-1), {
    kind: "trace-promote",
    created_at: "2026-07-10T11:01:02Z",
    candidate_id: candidate,
    type: "regression",
    owner: "atlas",
    source: latest,
    reason: "preserve failed behavior",
    regression,
  });
  const file = taskFile(paths.tasksDir, taskId);
  assert.equal(getTaskField(file, "latest_trace_candidate"), candidate);
  const state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(state.trace.latest_source, latest);
  assert.equal(state.trace.latest_type, "regression");
  assert.deepEqual(legacyShape(readJsonLines(taskRuntimeFile(paths, taskId)).at(-1)), {
    kind: "trace-promote",
    detail: `${candidate} regression`,
    created_at: "2026-07-10T11:01:02Z",
  });

  assert.throws(
    () =>
      runTracePromotion(
        parseTraceArgs([taskId, "--type=outside", "--reason=bad"]),
        { clock: clockAt("2026-07-10T11:02:00Z"), environment },
      ),
    /invalid type: outside/,
  );
  const noFailure = createFixtureTask(environment, "No failed verification");
  assert.throws(
    () =>
      runTracePromotion(
        parseTraceArgs([noFailure, "--type=lesson", "--reason=none"]),
        { clock: clockAt("2026-07-10T11:03:00Z"), environment },
      ),
    /no failed verification record found for --from latest/,
  );
});

test("records non-SDD feedback without escalating from severity or affected rows", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Feedback cycles");
  const artifactDir = taskArtifactDir(paths, taskId);
  const first = runFeedbackCycle(
    parseFeedbackArgs([
      taskId,
      "--source=verify",
      "--finding=required check failed",
      "--severity=high",
      "--classification=implementation-bug",
      "--route=repair",
      "--evidence=verification/failed.md",
    ]),
    { clock: clockAt("2026-07-10T11:10:00Z"), environment },
  );
  assert.equal(first.lines[3], "cycle: 0");
  assert.equal(first.lines[4], "status: current-cycle-note");
  assert.equal(fs.existsSync(path.join(artifactDir, "plan-cycles")), false);

  const second = runFeedbackCycle(
    parseFeedbackArgs([
      taskId,
      "--source=user",
      "--finding=low priority note",
      "--severity=low",
      "--classification=scope-change",
      "--route=clarify",
    ]),
    { clock: clockAt("2026-07-10T11:11:00Z"), environment },
  );
  assert.equal(second.lines[2], "cycle_file: -");
  assert.equal(second.lines[3], "cycle: 0");
  assert.equal(second.lines[4], "status: current-cycle-note");
  const returnFile = path.join(artifactDir, "return-to-plan.md");
  assert.match(fs.readFileSync(returnFile, "utf8"), /low priority note/);
  assert.doesNotMatch(fs.readFileSync(returnFile, "utf8"), /required check failed/);

  const third = runFeedbackCycle(
    parseFeedbackArgs([
      taskId,
      "--source=design-review",
      "--finding=acceptance row changed",
      "--severity=medium",
      "--classification=acceptance-gap",
      "--route=acceptance-update",
      "--affected-row=A1",
      "--affected-row=A2",
      "--evidence=review.md",
    ]),
    { clock: clockAt("2026-07-10T11:12:00Z"), environment },
  );
  assert.equal(third.lines[3], "cycle: 0");
  assert.equal(third.lines[4], "status: current-cycle-note");
  const events = readJsonLines(path.join(artifactDir, "ledger.jsonl"));
  assert.deepEqual(
    events.map((event) => [event.plan_cycle, event.cycle_status]),
    [
      [0, "current-cycle-note"],
      [0, "current-cycle-note"],
      [0, "current-cycle-note"],
    ],
  );
  const state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(state.active_plan_cycle, 0);
  assert.equal(state.latest_feedback_route, "acceptance-update");
  assert.equal(state.previous_approval_status, undefined);
  assert.equal(state.stale_acceptance_rows, undefined);
  assert.equal(getTaskField(taskFile(paths.tasksDir, taskId), "active_plan_cycle"), "0");
});

test("keeps supported non-SDD feedback sources input-compatible and non-escalating", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Legacy feedback escalation matrix");
  const sources = ["verify", "design-review", "user"];

  for (const source of sources) {
    const parsed = parseFeedbackArgs([
      taskId,
      `--source=${source}`,
      `--finding=${source} observation`,
      "--severity=low",
      "--classification=scope-change",
      "--route=clarify",
    ]);
    assert.equal(parsed.source, source);
  }

  const cases = [
    { severity: "low", rows: [], expectedCycle: 0, expectedStatus: "current-cycle-note" },
    { severity: "medium", rows: [], expectedCycle: 0, expectedStatus: "current-cycle-note" },
    { severity: "blocking", rows: ["AC-legacy"], expectedCycle: 0, expectedStatus: "current-cycle-note" },
  ];

  cases.forEach((entry, index) => {
    const args = [
      taskId,
      `--source=${sources[index]}`,
      `--finding=legacy behavior ${index}`,
      `--severity=${entry.severity}`,
      "--classification=scope-change",
      "--route=new-prd",
      ...entry.rows.flatMap((row) => ["--affected-row", row]),
    ];
    const result = runFeedbackCycle(parseFeedbackArgs(args), {
      clock: clockAt(`2026-07-10T12:0${index}:00Z`),
      environment,
    });
    assert.equal(result.lines[3], `cycle: ${entry.expectedCycle}`);
    assert.equal(result.lines[4], `status: ${entry.expectedStatus}`);
  });

  const events = readJsonLines(path.join(taskArtifactDir(paths, taskId), "ledger.jsonl"));
  assert.deepEqual(
    events.map(({ source, severity, affected_rows: rows, plan_cycle: cycle, cycle_status: status }) => ({
      source,
      severity,
      rows,
      cycle,
      status,
    })),
    cases.map((entry, index) => ({
      source: sources[index],
      severity: entry.severity,
      rows: entry.rows,
      cycle: entry.expectedCycle,
      status: entry.expectedStatus,
    })),
  );
});

test("preserves legacy Multica feedback cycle decisions without invoking Multica", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Legacy Multica feedback decisions");
  const markerFile = path.join(taskArtifactDir(paths, taskId), "multica-feedback.json");
  const baseArgs = [
    taskId,
    "--source=multica-review",
    "--finding=legacy Multica feedback",
    "--severity=high",
    "--classification=implementation-bug",
    "--route=repair",
  ];
  const noteCases = [
    null,
    "{not-json",
    { task_id: taskId, status: "repair-needed", round: 0, issue: "bad round", blocking_findings: ["finding"] },
    { task_id: taskId, status: "repair-needed", round: 1, issue: "", blocking_findings: ["finding"] },
    { task_id: taskId, status: "repair-needed", round: 1, issue: "missing blockers", blocking_findings: [] },
    { task_id: taskId, status: "repair-needed", round: 1, issue: "bad blocker", blocking_findings: [1] },
    { task_id: taskId, status: "clean", round: 1, issue: "clean", blocking_findings: ["finding"] },
    { task_id: taskId, status: "blocked", round: 1, issue: "blocked", blocking_findings: ["finding"] },
    { task_id: "foreign-task", status: "repair-needed", round: 1, issue: "foreign", blocking_findings: ["finding"] },
  ];
  for (const [index, marker] of noteCases.entries()) {
    if (marker === null) {
      fs.rmSync(markerFile, { force: true });
    } else {
      fs.writeFileSync(markerFile, typeof marker === "string" ? marker : `${JSON.stringify(marker)}\n`);
    }
    const result = runFeedbackCycle(parseFeedbackArgs(baseArgs), {
      clock: clockAt(`2026-07-10T12:1${index}:00Z`),
      environment,
    });
    assert.equal(result.lines[3], "cycle: 0");
    assert.equal(result.lines[4], "status: current-cycle-note");
  }

  fs.writeFileSync(markerFile, `${JSON.stringify({
    task_id: taskId,
    status: "repair-needed",
    round: 1,
    issue: "legacy review requires repair",
    blocking_findings: ["legacy-blocker"],
  })}\n`);
  const cycleCases = [
    { source: "multica-review", severity: "high", rows: [], cycle: 1 },
    { source: "multica-e2e", severity: "low", rows: ["AC-legacy"], cycle: 2 },
  ];
  for (const [index, entry] of cycleCases.entries()) {
    const result = runFeedbackCycle(parseFeedbackArgs([
      taskId,
      `--source=${entry.source}`,
      `--finding=legacy Multica feedback ${index}`,
      `--severity=${entry.severity}`,
      "--classification=implementation-bug",
      "--route=repair",
      ...entry.rows.flatMap((row) => ["--affected-row", row]),
    ]), {
      clock: clockAt(`2026-07-10T12:2${index}:00Z`),
      environment,
    });
    assert.equal(result.lines[3], `cycle: ${entry.cycle}`);
    assert.equal(result.lines[4], "status: new-cycle");
  }
  const state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(state.previous_approval_status, "stale-if-affected");
  assert.equal(state.stale_acceptance_rows, "AC-legacy");
});

function writeSddAdmissionFixture(paths, taskId) {
  const sliceDir = path.join(taskArtifactDir(paths, taskId), "team/sdd/slices/slice-001");
  fs.mkdirSync(sliceDir, { recursive: true });
  fs.writeFileSync(path.join(sliceDir, "brief.md"), "# Brief\n\nCurrent requirement.\n");
  const brief = {
    schema_version: 2,
    task_id: taskId,
    slice_id: "slice-001",
    repo: paths.root,
    base_sha: "1".repeat(40),
    objective: "Exercise SDD feedback admission",
    requirements_path: "brief.md",
    global_constraints_path: "../../global-constraints.md",
    owned_paths: ["workflow"],
    forbidden_paths: ["outside-owned-surface"],
    acceptance_refs: ["AC-1"],
    required_checks: ["targeted"],
    commit_policy: "logical_outcome",
    output_contract: "final_message_json_only",
  };
  fs.writeFileSync(path.join(sliceDir, "brief.json"), `${JSON.stringify(brief, null, 2)}\n`);
  const verdict = {
    schema_version: 2,
    task_id: taskId,
    slice_id: "slice-001",
    base_sha: "1".repeat(40),
    head_sha: "2".repeat(40),
    spec_compliance: "fail",
    task_quality: "fail",
    issues: [{
      finding_id: "finding-current",
      severity: "Important",
      category: "contract",
      path: "brief.json",
      line: 1,
      evidence: "current finding evidence",
      required_fix: "conditional repair",
    }],
    cannot_verify_from_diff: [],
    strengths: [],
    reviewed_inputs: { brief_json: "brief.json", review_package_diff: "review-package.diff" },
  };
  const verdictFile = path.join(sliceDir, "review-verdict.json");
  fs.writeFileSync(verdictFile, `${JSON.stringify(verdict, null, 2)}\n`);
  const locator = {
    sliceId: "slice-001",
    findingId: "finding-current",
    verdictDigest: digestFile(verdictFile),
    goalRef: computeGoalRef(brief, sliceDir),
  };
  const resolution = {
    schema_version: 2,
    task_id: taskId,
    slice_id: locator.sliceId,
    verdict_digest: locator.verdictDigest,
    goal_ref: locator.goalRef,
    records: [{
      finding_id: locator.findingId,
      disposition: "current-required",
      basis: "goal-blocker",
      authority_refs: ["acceptance:AC-1"],
      repair_status: "open",
      reason: "finding blocks AC-1",
    }],
    evidence_gaps: [],
  };
  const resolutionFile = path.join(sliceDir, "controller-resolution.json");
  fs.writeFileSync(resolutionFile, `${JSON.stringify(resolution, null, 2)}\n`);
  return { brief, locator, resolution, resolutionFile, sliceDir, verdict, verdictFile };
}

function sddFeedbackArgs(taskId, locator, overrides = {}) {
  const values = { ...locator, ...overrides };
  const args = [
    taskId,
    "--source=sdd-review",
    "--finding=SDD finding feedback",
    "--severity=high",
    "--classification=implementation-bug",
    "--route=repair",
    "--affected-row=AC-1",
  ];
  if (values.sliceId) args.push(`--sdd-slice=${values.sliceId}`);
  if (values.findingId) args.push(`--finding-id=${values.findingId}`);
  if (values.verdictDigest) args.push(`--verdict-digest=${values.verdictDigest}`);
  if (values.goalRef) args.push(`--goal-ref=${values.goalRef}`);
  return args;
}

test("creates a repair cycle only for a canonically validated current-required open SDD admission", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Admitted SDD feedback");
  const { locator } = writeSddAdmissionFixture(paths, taskId);
  const result = runFeedbackCycle(parseFeedbackArgs(sddFeedbackArgs(taskId, locator)), {
    clock: clockAt("2026-07-10T12:20:00Z"),
    environment,
  });
  assert.equal(result.lines[3], "cycle: 1");
  assert.equal(result.lines[4], "status: new-cycle");
  assert.equal(result.lines[6], "admission: current-required-open");
  assert.ok(fs.existsSync(path.join(taskArtifactDir(paths, taskId), "plan-cycles/cycle-1.md")));
});

test("keeps stale, wrong, non-required, resolved, and missing SDD admission visible without a cycle", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Rejected SDD escalation");
  const fixture = writeSddAdmissionFixture(paths, taskId);
  const cases = [
    { name: "missing locator", args: sddFeedbackArgs(taskId, fixture.locator, { findingId: "" }) },
    { name: "wrong finding", args: sddFeedbackArgs(taskId, fixture.locator, { findingId: "wrong-finding" }) },
    { name: "stale verdict", args: sddFeedbackArgs(taskId, fixture.locator, { verdictDigest: "f".repeat(64) }) },
    { name: "wrong goal", args: sddFeedbackArgs(taskId, fixture.locator, { goalRef: "e".repeat(64) }) },
  ];
  for (const entry of cases) {
    const result = runFeedbackCycle(parseFeedbackArgs(entry.args), {
      clock: clockAt("2026-07-10T12:21:00Z"),
      environment,
    });
    assert.equal(result.lines[4], "status: current-cycle-note", entry.name);
  }

  const wrongResolution = structuredClone(fixture.resolution);
  wrongResolution.goal_ref = "d".repeat(64);
  fs.writeFileSync(fixture.resolutionFile, `${JSON.stringify(wrongResolution, null, 2)}\n`);
  const invalidResolution = runFeedbackCycle(
    parseFeedbackArgs(sddFeedbackArgs(taskId, fixture.locator)),
    { clock: clockAt("2026-07-10T12:21:30Z"), environment },
  );
  assert.equal(invalidResolution.lines[4], "status: current-cycle-note");

  for (const [disposition, repairStatus, basis] of [
    ["visible-follow-up", "omitted", "not-current-required"],
    ["informational", "omitted", "no-action"],
    ["current-required", "resolved", "goal-blocker"],
  ]) {
    const resolution = structuredClone(fixture.resolution);
    Object.assign(resolution.records[0], {
      disposition,
      repair_status: repairStatus,
      basis,
      authority_refs: disposition === "current-required" ? ["acceptance:AC-1"] : [],
    });
    fs.writeFileSync(fixture.resolutionFile, `${JSON.stringify(resolution, null, 2)}\n`);
    const result = runFeedbackCycle(parseFeedbackArgs(sddFeedbackArgs(taskId, fixture.locator)), {
      clock: clockAt("2026-07-10T12:22:00Z"),
      environment,
    });
    assert.equal(result.lines[4], "status: current-cycle-note", disposition);
  }
  fs.rmSync(fixture.resolutionFile);
  const missing = runFeedbackCycle(parseFeedbackArgs(sddFeedbackArgs(taskId, fixture.locator)), {
    clock: clockAt("2026-07-10T12:23:00Z"),
    environment,
  });
  assert.equal(missing.lines[4], "status: current-cycle-note");
  const events = readJsonLines(path.join(taskArtifactDir(paths, taskId), "ledger.jsonl"));
  assert.equal(events.every((event) => event.cycle_status === "current-cycle-note"), true);
  assert.equal(events.every((event) => typeof event.admission_reason === "string"), true);
});

test("rejects internally consistent SDD artifacts replayed across task or slice identity", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Foreign SDD replay");
  const fixture = writeSddAdmissionFixture(paths, taskId);

  function writeForeign(identity) {
    const brief = { ...fixture.brief, ...identity };
    const verdict = { ...fixture.verdict, ...identity };
    fs.writeFileSync(path.join(fixture.sliceDir, "brief.json"), `${JSON.stringify(brief, null, 2)}\n`);
    fs.writeFileSync(fixture.verdictFile, `${JSON.stringify(verdict, null, 2)}\n`);
    const locator = {
      ...fixture.locator,
      verdictDigest: digestFile(fixture.verdictFile),
      goalRef: computeGoalRef(brief, fixture.sliceDir),
    };
    const resolution = {
      ...fixture.resolution,
      ...identity,
      verdict_digest: locator.verdictDigest,
      goal_ref: locator.goalRef,
    };
    fs.writeFileSync(fixture.resolutionFile, `${JSON.stringify(resolution, null, 2)}\n`);
    return locator;
  }

  for (const [name, identity] of [
    ["foreign task", { task_id: "foreign-task" }],
    ["foreign slice", { slice_id: "foreign-slice" }],
  ]) {
    const locator = writeForeign(identity);
    const result = runFeedbackCycle(parseFeedbackArgs(sddFeedbackArgs(taskId, locator)), {
      clock: clockAt("2026-07-10T12:24:00Z"),
      environment,
    });
    assert.equal(result.lines[4], "status: current-cycle-note", name);
    assert.equal(result.lines[7], "admission_reason: cross-task-or-slice-artifact", name);
  }
});

test("rejects symlinked SDD authority artifacts even when their content is valid", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Symlinked SDD authority");
  const fixture = writeSddAdmissionFixture(paths, taskId);
  const foreignResolution = path.join(taskArtifactDir(paths, taskId), "foreign-resolution.json");
  fs.copyFileSync(fixture.resolutionFile, foreignResolution);
  fs.rmSync(fixture.resolutionFile);
  fs.symlinkSync(foreignResolution, fixture.resolutionFile);

  const result = runFeedbackCycle(
    parseFeedbackArgs(sddFeedbackArgs(taskId, fixture.locator)),
    { clock: clockAt("2026-07-10T12:25:00Z"), environment },
  );
  assert.equal(result.lines[4], "status: current-cycle-note");
  assert.equal(result.lines[7], "admission_reason: missing-sdd-admission-artifact");
});

test("appends lesson candidates and retains compatibility trigger values", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Lesson candidates");
  const first = runLessonCandidate(
    parseLessonArgs([
      taskId,
      "--trigger=manual",
      "--lesson=keep verification local",
      "--evidence=review.md",
    ]),
    { clock: clockAt("2026-07-10T11:20:00Z"), environment },
  );
  assert.equal(first.lines[2], "candidate: L20260710112000");
  const second = runLessonCandidate(
    parseLessonArgs([
      taskId,
      "--trigger=multica-feedback",
      "--lesson=feed required rows back to plan",
    ]),
    { clock: clockAt("2026-07-10T11:21:00Z"), environment },
  );
  assert.equal(second.lines[4], "evidence_count: 0");
  const lessonFile = path.join(taskArtifactDir(paths, taskId), "lesson-candidates.md");
  const text = fs.readFileSync(lessonFile, "utf8");
  assert.equal((text.match(/^# Lesson Candidates$/gm) || []).length, 1);
  assert.match(text, /L20260710112000/);
  assert.match(text, /L20260710112100/);
  const state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(state.learning.latest_candidate, "L20260710112100");
  assert.equal(state.learning.trigger, "multica-feedback");
  assert.throws(
    () =>
      runLessonCandidate(
        parseLessonArgs([taskId, "--trigger=outside", "--lesson=bad"]),
        { clock: clockAt("2026-07-10T11:22:00Z"), environment },
      ),
    /invalid trigger: outside/,
  );
});

test("overwrites the current learning decision while retaining its ledger", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Learning decision");
  runLearningDecision(
    parseLearningDecisionArgs([
      taskId,
      "--decision=promote",
      "--reason=two repeated failures",
      "--candidate=L1",
      "--candidate=L2",
    ]),
    { clock: clockAt("2026-07-10T11:30:00Z"), environment },
  );
  const second = runLearningDecision(
    parseLearningDecisionArgs([
      taskId,
      "--decision=skip",
      "--reason=single local occurrence",
    ]),
    { clock: clockAt("2026-07-10T11:31:00Z"), environment },
  );
  assert.equal(second.lines.at(-1), "candidates: 0");
  const artifactDir = taskArtifactDir(paths, taskId);
  const decision = fs.readFileSync(path.join(artifactDir, "learning-decision.md"), "utf8");
  assert.match(decision, /- Decision: skip/);
  assert.match(decision, /- All current candidates\./);
  assert.doesNotMatch(decision, /two repeated failures/);
  const ledger = readJsonLines(path.join(artifactDir, "ledger.jsonl"));
  assert.deepEqual(
    ledger.map((event) => [event.decision, event.candidates]),
    [
      ["promote", ["L1", "L2"]],
      ["skip", []],
    ],
  );
  const state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(state.learning.decision, "skip");
  assert.equal(state.learning.decision_candidates, 0);
  assert.throws(
    () =>
      runLearningDecision(
        parseLearningDecisionArgs([taskId, "--decision=archive", "--reason=bad"]),
        { clock: clockAt("2026-07-10T11:32:00Z"), environment },
      ),
    /invalid decision: archive/,
  );
});

test("public Bash dispatcher delegates generic feedback commands", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Public feedback");
  const source = path.join(environment.CODEX_HOME_ROOT, "failed.md");
  fs.writeFileSync(source, "- verdict: failed\n- exit_code: 2\n");
  const trace = spawnSync(
    PUBLIC_BIN,
    [
      "trace-promote",
      taskId,
      `--from=${source}`,
      "--type=lesson",
      "--reason=public trace",
      "--owner=project",
    ],
    { encoding: "utf8", env: environment },
  );
  assert.equal(trace.status, 0, trace.stderr);
  assert.match(trace.stdout, /type: lesson\nowner: project\nregression: -\n$/);

  const lesson = spawnSync(
    PUBLIC_BIN,
    [
      "lesson-candidate",
      taskId,
      "--trigger=manual",
      "--lesson=public lesson",
      "--evidence=trace.md",
    ],
    { encoding: "utf8", env: environment },
  );
  assert.equal(lesson.status, 0, lesson.stderr);
  assert.equal(readJsonObject(taskStateFile(paths, taskId)).learning.trigger, "manual");

  const invalid = spawnSync(PUBLIC_BIN, ["trace-promote", taskId, "--unknown"], {
    encoding: "utf8",
    env: environment,
  });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stderr, `${TRACE_USAGE}\n`);
});
