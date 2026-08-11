"use strict";

const assert = require("assert/strict");
const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const CONTROLLER_RESOLUTION_BIN = path.join(
  ROOT,
  "plugins/atlas-workflow/scripts/codex-team-controller-resolution",
);
const { validateReviewVerdict } = require(path.join(
  ROOT,
  "plugins/atlas-workflow/contracts/team-sdd/validators/review-verdict.js",
));
const {
  computeGoalRef,
  digestFile,
  validateControllerResolution,
  validateControllerResolutionAgainst,
} = require(path.join(
  ROOT,
  "plugins/atlas-workflow/contracts/team-sdd/validators/controller-resolution.js",
));

function issue(findingId, severity = "Important") {
  return {
    finding_id: findingId,
    severity,
    category: "contract",
    path: "brief.json",
    line: 1,
    evidence: `${findingId} evidence`,
    required_fix: `${findingId} conditional repair`,
  };
}

function verdict(overrides = {}) {
  return {
    schema_version: 2,
    task_id: "fixture-v2",
    slice_id: "slice-001",
    base_sha: "1".repeat(40),
    head_sha: "2".repeat(40),
    spec_compliance: "fail",
    task_quality: "fail",
    issues: [issue("finding-a"), issue("finding-b", "Critical")],
    cannot_verify_from_diff: [
      { gap_id: "gap-runtime", description: "runtime evidence unavailable" },
    ],
    strengths: [],
    reviewed_inputs: {
      brief_json: "brief.json",
      review_package_diff: "review-package.diff",
    },
    ...overrides,
  };
}

function admissionRecord(findingId, overrides = {}) {
  return {
    finding_id: findingId,
    disposition: "visible-follow-up",
    basis: "not-current-required",
    authority_refs: [],
    repair_status: "omitted",
    reason: `${findingId} is outside the current goal`,
    ...overrides,
  };
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-sdd-admission."));
  const sliceDir = path.join(root, "team/sdd/slices/slice-001");
  fs.mkdirSync(sliceDir, { recursive: true });
  fs.writeFileSync(path.join(sliceDir, "brief.md"), "# Brief\n\nCurrent requirements.\n");
  const constraintsFile = path.resolve(sliceDir, "../../global-constraints.md");
  fs.writeFileSync(constraintsFile, "# Global Constraints\n\nPreserve safety, data, and permission boundaries.\n");
  const brief = {
    schema_version: 2,
    task_id: "fixture-v2",
    slice_id: "slice-001",
    repo: root,
    base_sha: "1".repeat(40),
    objective: "Exercise finding admission",
    requirements_path: "brief.md",
    global_constraints_path: "../../global-constraints.md",
    owned_paths: ["plugins/atlas-workflow"],
    forbidden_paths: ["plugins/multica-sdlc"],
    acceptance_refs: ["AC-2", "AC-1"],
    required_checks: ["targeted"],
    commit_policy: "logical_outcome",
    output_contract: "final_message_json_only",
  };
  const reviewVerdict = verdict();
  const verdictFile = path.join(sliceDir, "review-verdict.json");
  fs.writeFileSync(verdictFile, `${JSON.stringify(reviewVerdict, null, 2)}\n`);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    brief,
    constraintsDigest: digestFile(constraintsFile),
    constraintsFile,
    goalRef: computeGoalRef(brief, sliceDir),
    reviewVerdict,
    verdict: reviewVerdict,
    sliceDir,
    verdictDigest: digestFile(verdictFile),
  };
}

function v4Fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-sdd-admission-v4."));
  const workflowRoot = path.join(root, "workflow");
  const taskId = "fixture-v4";
  const sliceId = "slice-004";
  const taskArtifactRoot = path.join(workflowRoot, "artifacts", taskId);
  const sliceDir = path.join(taskArtifactRoot, "team/sdd/slices", sliceId);
  const authorityDir = path.join(taskArtifactRoot, "team/sdd/slices/authority-v4");
  fs.mkdirSync(sliceDir, { recursive: true });
  fs.mkdirSync(authorityDir, { recursive: true });
  fs.writeFileSync(path.join(sliceDir, "brief.md"), "# Brief v4\n\nCurrent executable requirements.\n");
  const globalConstraintsFile = path.join(taskArtifactRoot, "team/sdd/global-constraints.md");
  fs.writeFileSync(globalConstraintsFile, "# Global Constraints\n\nPreserve safety and data integrity.\n");
  fs.writeFileSync(path.join(taskArtifactRoot, "implementation-contract.final.md"), "# Contract\n");
  const baseSha = childProcess.execFileSync("git", ["-C", ROOT, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const brief = {
    schema_version: 4,
    task_id: taskId,
    slice_id: sliceId,
    repo: ROOT,
    base_sha: baseSha,
    objective: "Exercise executable controller resolution",
    requirements_path: `team/sdd/slices/${sliceId}/brief.md`,
    global_constraints_path: "team/sdd/global-constraints.md",
    contract: {
      path: path.join(taskArtifactRoot, "implementation-contract.final.md"),
      sha256: `sha256:${"a".repeat(64)}`,
      semantics_version: 5,
      execution_plan_schema_version: 3,
      execution_plan_sha256: `sha256:${"b".repeat(64)}`,
      authority_slices: [{
        path: authorityDir,
        task_id: taskId,
        slice_id: "authority-v4",
        brief_json_sha256: `sha256:${"c".repeat(64)}`,
        brief_md_sha256: `sha256:${"d".repeat(64)}`,
        evidence_manifest_sha256: null,
        review_verdict_sha256: null,
        controller_resolution_sha256: null,
        global_constraints_sha256: null,
      }],
    },
    dependencies: [],
    keeper_outputs: ["contract:controller-resolution-v4"],
    owned_paths: ["plugins/atlas-workflow"],
    forbidden_paths: ["plugins/multica-sdlc"],
    acceptance_refs: ["AC-V4"],
    risk_class: "high",
    failure_domain: "A stale goal identity could authorize the wrong repair.",
    rollback_boundary: "Revert the resolver and retain the blocked slice.",
    budget: {
      max_changed_files: 2,
      max_loc: 300,
      max_wall_clock_minutes: 30,
      max_required_checks: 1,
    },
    checks: [{
      check_id: "controller-resolution-v4",
      gate_class: "contract",
      command: "node --test workflow/tests/js/team-sdd-admission.test.js",
      final_only: false,
      cache_policy: "fresh-executed",
    }],
    size_gate: {
      decision: "pass",
      policy_id: "atlas-slice-size-v2",
      estimate: {
        estimated_changed_files: 2,
        estimated_net_loc: 300,
        target_p90_minutes: 30,
        serial_dependency_depth: 0,
        independent_vertical_count: 1,
      },
      exception: null,
    },
    commit_policy: "changes_allowed_no_commit",
    output_contract: "final_message_json_only",
  };
  fs.writeFileSync(path.join(sliceDir, "brief.json"), `${JSON.stringify(brief, null, 2)}\n`);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { brief, globalConstraintsFile, root, sliceDir, taskId, workflowRoot };
}

function resolution(context, overrides = {}) {
  return {
    schema_version: 2,
    task_id: context.brief.task_id,
    slice_id: context.brief.slice_id,
    verdict_digest: context.verdictDigest,
    goal_ref: context.goalRef,
    records: [admissionRecord("finding-a"), admissionRecord("finding-b")],
    evidence_gaps: [
      {
        gap_id: "gap-runtime",
        status: "resolved",
        evidence_refs: ["evidence:runtime-check"],
        reason: "runtime evidence was supplied",
      },
    ],
    ...overrides,
  };
}

test("review verdict dual-reader preserves v1 and enforces verdict-local v2 identities", () => {
  const v1 = { ...verdict(), schema_version: 1, issues: [], cannot_verify_from_diff: [] };
  assert.deepEqual(validateReviewVerdict(v1), []);
  assert.deepEqual(validateReviewVerdict(verdict()), []);
  assert.ok(validateReviewVerdict(verdict({ issues: [issue("same"), issue("same")] }))
    .some((error) => error.includes("duplicate finding_id")));
  assert.ok(validateReviewVerdict(verdict({ issues: [{ ...issue("missing") , finding_id: undefined }] }))
    .some((error) => error.includes("finding_id")));
  assert.ok(validateReviewVerdict(verdict({ cannot_verify_from_diff: ["legacy text"] }))
    .some((error) => error.includes("cannot_verify_from_diff[0]")));
});

test("controller schema closes disposition, basis, authority, and repair combinations", (t) => {
  const context = fixture(t);
  assert.deepEqual(validateControllerResolution(resolution(context)), []);
  const validRequired = resolution(context, {
    records: [
      admissionRecord("finding-a", {
        disposition: "current-required",
        basis: "goal-blocker",
        authority_refs: ["acceptance:AC-1"],
        repair_status: "open",
      }),
      admissionRecord("finding-b", {
        disposition: "current-required",
        basis: "diff-regression",
        authority_refs: ["slice:slice-001", `diff:${"1".repeat(40)}..${"2".repeat(40)}`],
        repair_status: "resolved",
      }),
    ],
  });
  assert.deepEqual(validateControllerResolutionAgainst(validRequired, context), []);
  const safety = resolution(context, {
    records: [
      admissionRecord("finding-a", {
        disposition: "current-required",
        basis: "safety-data-permission-risk",
        authority_refs: [
          "invariant:data-integrity",
          "acceptance:AC-1",
          `constraints-sha256:${context.constraintsDigest}`,
          `diff:${"1".repeat(40)}..${"2".repeat(40)}`,
        ],
        repair_status: "open",
      }),
      admissionRecord("finding-b"),
    ],
  });
  assert.deepEqual(validateControllerResolutionAgainst(safety, context), []);

  for (const authorityRefs of [
    ["invariant:no-data-loss", "acceptance:AC-1", `constraints-sha256:${context.constraintsDigest}`, `diff:${"1".repeat(40)}..${"2".repeat(40)}`],
    ["invariant:safety", "invariant:anything-goes", "acceptance:AC-1", `constraints-sha256:${context.constraintsDigest}`, `diff:${"1".repeat(40)}..${"2".repeat(40)}`],
    ["invariant:safety", "acceptance:AC-1", `constraints-sha256:${"f".repeat(64)}`, `diff:${"1".repeat(40)}..${"2".repeat(40)}`],
    ["invariant:permission-boundary", "acceptance:AC-1", `constraints-sha256:${context.constraintsDigest}`, `diff:${"1".repeat(40)}..${"3".repeat(40)}`],
    ["invariant:data-integrity", `constraints-sha256:${context.constraintsDigest}`, `diff:${"1".repeat(40)}..${"2".repeat(40)}`],
  ]) {
    const invalidSafety = structuredClone(safety);
    invalidSafety.records[0].authority_refs = authorityRefs;
    assert.notDeepEqual(validateControllerResolutionAgainst(invalidSafety, context), []);
  }
  for (const reason of [
    "-",
    "TODO",
    "TODO: explain later",
    "TBD.",
    "TBD!",
    "`TODO`",
    "placeholder reason",
    "FIXME",
    "N/A",
    "ＴＢＤ",
    "待定",
    "待补充：后续填写",
    "TODO，稍后补充",
    "   ",
  ]) {
    const invalidSafety = structuredClone(safety);
    invalidSafety.records[0].reason = reason;
    assert.ok(validateControllerResolutionAgainst(invalidSafety, context)
      .some((error) => error.includes("substantive causal reason")));
  }
  const conciseSafety = structuredClone(safety);
  conciseSafety.records[0].reason = "blocks AC-1";
  assert.deepEqual(validateControllerResolutionAgainst(conciseSafety, context), []);
  const literalTokenSafety = structuredClone(safety);
  literalTokenSafety.records[0].reason = "Reject literal TODO values to satisfy AC-1";
  assert.deepEqual(validateControllerResolutionAgainst(literalTokenSafety, context), []);
  fs.rmSync(context.constraintsFile);
  assert.ok(validateControllerResolutionAgainst(safety, context)
    .some((error) => error.includes("global constraints")));

  const foreignFile = path.join(context.sliceDir, "foreign-constraints.md");
  fs.writeFileSync(foreignFile, "foreign constraints\n");
  for (const foreignPath of [foreignFile, "../../../foreign-constraints.md"]) {
    const foreignBrief = { ...context.brief, global_constraints_path: foreignPath };
    assert.ok(validateControllerResolutionAgainst(safety, { ...context, brief: foreignBrief })
      .some((error) => error.includes("canonical global_constraints_path")));
  }

  fs.symlinkSync(foreignFile, context.constraintsFile);
  assert.ok(validateControllerResolutionAgainst(safety, context)
    .some((error) => error.includes("regular non-symlink")));

  for (const bad of [
    admissionRecord("finding-a", { disposition: "current-required", basis: "not-current-required", authority_refs: ["acceptance:AC-1"], repair_status: "open" }),
    admissionRecord("finding-a", { disposition: "visible-follow-up", basis: "goal-blocker", authority_refs: ["acceptance:AC-1"] }),
    admissionRecord("finding-a", { disposition: "informational", basis: "no-action", repair_status: "open" }),
  ]) {
    assert.notDeepEqual(validateControllerResolution(resolution(context, {
      records: [bad, admissionRecord("finding-b")],
    })), []);
  }
});

test("controller coverage fails closed for identity, goal, finding, and evidence-gap mismatches", (t) => {
  const context = fixture(t);
  const mutations = [
    { task_id: "wrong-task" },
    { slice_id: "wrong-slice" },
    { verdict_digest: "f".repeat(64) },
    { goal_ref: "e".repeat(64) },
    { records: [admissionRecord("finding-a")] },
    { records: [admissionRecord("finding-a"), admissionRecord("finding-a")] },
    { records: [admissionRecord("finding-a"), admissionRecord("unknown")] },
    { evidence_gaps: [] },
    { evidence_gaps: [{ gap_id: "unknown-gap", status: "resolved", evidence_refs: ["evidence:x"], reason: "wrong gap" }] },
  ];
  for (const mutation of mutations) {
    assert.notDeepEqual(validateControllerResolutionAgainst(resolution(context, mutation), context), []);
  }
});

test("standalone controller validation rejects duplicate record and evidence-gap identities", (t) => {
  const context = fixture(t);
  const duplicateRecords = resolution(context, {
    records: [admissionRecord("finding-a"), admissionRecord("finding-a")],
  });
  const duplicateGaps = resolution(context, {
    evidence_gaps: [
      { gap_id: "gap-runtime", status: "resolved", evidence_refs: ["evidence:a"], reason: "first" },
      { gap_id: "gap-runtime", status: "resolved", evidence_refs: ["evidence:b"], reason: "second" },
    ],
  });
  assert.ok(validateControllerResolution(duplicateRecords)
    .some((error) => error.includes("duplicate finding_id")));
  assert.ok(validateControllerResolution(duplicateGaps)
    .some((error) => error.includes("duplicate gap_id")));
});

test("goal identity is deterministic, acceptance-order independent, and requirement-content bound", (t) => {
  const context = fixture(t);
  assert.equal(context.goalRef, "f8521176f83921dac3ce67bf587ff25371476d2e910a7fc770954461493322c0");
  assert.equal(computeGoalRef({ ...context.brief, schema_version: 1 }, context.sliceDir), context.goalRef);
  assert.equal(computeGoalRef({ ...context.brief, schema_version: 3 }, context.sliceDir), context.goalRef);
  const reordered = { ...context.brief, acceptance_refs: ["AC-1", "AC-2"] };
  assert.equal(computeGoalRef(reordered, context.sliceDir), context.goalRef);
  fs.writeFileSync(
    path.join(context.sliceDir, "evidence-manifest.json"),
    `${JSON.stringify({ contract_sha256: "a".repeat(64) })}\n`,
  );
  const contractBound = computeGoalRef(context.brief, context.sliceDir);
  assert.notEqual(contractBound, context.goalRef);
  fs.writeFileSync(
    path.join(context.sliceDir, "evidence-manifest.json"),
    `${JSON.stringify({ contract_sha256: "b".repeat(64) })}\n`,
  );
  assert.notEqual(computeGoalRef(context.brief, context.sliceDir), contractBound);
  fs.appendFileSync(path.join(context.sliceDir, "brief.md"), "Changed authority.\n");
  assert.notEqual(computeGoalRef(context.brief, context.sliceDir), context.goalRef);
});

test("goal identity accepts only the canonical in-slice regular requirements file", (t) => {
  const context = fixture(t);
  const foreignFile = path.join(path.dirname(context.sliceDir), "foreign-brief.md");
  fs.writeFileSync(foreignFile, "# Foreign requirements\n");
  for (const requirementsPath of [foreignFile, "../foreign-brief.md"]) {
    assert.throws(
      () => computeGoalRef({ ...context.brief, requirements_path: requirementsPath }, context.sliceDir),
      /requirements_path must be canonical/,
    );
  }
  const briefFile = path.join(context.sliceDir, "brief.md");
  fs.rmSync(briefFile);
  fs.symlinkSync(foreignFile, briefFile);
  assert.throws(
    () => computeGoalRef(context.brief, context.sliceDir),
    /regular non-symlink/,
  );
});

test("schema-v4 goal identity resolves only the current task-artifact brief", (t) => {
  const context = v4Fixture(t);
  const goalRef = computeGoalRef(context.brief, context.sliceDir);
  assert.match(goalRef, /^[a-f0-9]{64}$/);
  assert.equal(computeGoalRef(context.brief, context.sliceDir), goalRef);

  for (const requirementsPath of [
    "/absolute/brief.md",
    "../brief.md",
    "./team/sdd/slices/slice-004/brief.md",
    "team/sdd/../slices/slice-004/brief.md",
    "team//sdd/slices/slice-004/brief.md",
    "team\\sdd\\slices\\slice-004\\brief.md",
    "team/sdd/slices/other-slice/brief.md",
  ]) {
    assert.throws(
      () => computeGoalRef({ ...context.brief, requirements_path: requirementsPath }, context.sliceDir),
      /requirements_path must be canonical/,
    );
  }
  assert.throws(
    () => computeGoalRef({ ...context.brief, task_id: "foreign-task" }, context.sliceDir),
    /task artifact root must match/,
  );
  const otherSliceDir = path.join(path.dirname(context.sliceDir), "other-slice");
  fs.mkdirSync(otherSliceDir);
  fs.writeFileSync(path.join(otherSliceDir, "brief.md"), "# Other slice\n");
  assert.throws(
    () => computeGoalRef(context.brief, otherSliceDir),
    /slice directory/,
  );
});

test("schema-v4 goal identity rejects links, non-files, and bytes that drift while read", (t) => {
  const symlinkContext = v4Fixture(t);
  const briefFile = path.join(symlinkContext.sliceDir, "brief.md");
  const foreignFile = path.join(symlinkContext.root, "foreign-brief.md");
  fs.writeFileSync(foreignFile, "# Foreign\n");
  fs.rmSync(briefFile);
  fs.symlinkSync(foreignFile, briefFile);
  assert.throws(
    () => computeGoalRef(symlinkContext.brief, symlinkContext.sliceDir),
    /regular non-symlink/,
  );

  const directoryContext = v4Fixture(t);
  const directoryBrief = path.join(directoryContext.sliceDir, "brief.md");
  fs.rmSync(directoryBrief);
  fs.mkdirSync(directoryBrief);
  assert.throws(
    () => computeGoalRef(directoryContext.brief, directoryContext.sliceDir),
    /regular non-symlink/,
  );

  const ancestorContext = v4Fixture(t);
  const aliasedTaskRoot = path.join(ancestorContext.root, "aliased-task-root");
  fs.symlinkSync(
    path.resolve(ancestorContext.sliceDir, "../../../.."),
    aliasedTaskRoot,
    "dir",
  );
  assert.throws(
    () => computeGoalRef(
      ancestorContext.brief,
      path.join(aliasedTaskRoot, "team/sdd/slices", ancestorContext.brief.slice_id),
    ),
    /canonical non-symlink directory/,
  );

  const driftContext = v4Fixture(t);
  const driftBrief = path.join(driftContext.sliceDir, "brief.md");
  const originalReadSync = fs.readSync;
  let changed = false;
  fs.readSync = function readAndMutate(...args) {
    const count = originalReadSync.apply(this, args);
    if (!changed) {
      changed = true;
      fs.appendFileSync(driftBrief, "Changed during read.\n");
    }
    return count;
  };
  try {
    assert.throws(
      () => computeGoalRef(driftContext.brief, driftContext.sliceDir),
      /changed/,
    );
  } finally {
    fs.readSync = originalReadSync;
  }
});

test("controller helper generates a schema-v4 resolution with the shared goal identity", (t) => {
  const context = v4Fixture(t);
  const verdict = {
    schema_version: 2,
    task_id: context.taskId,
    slice_id: context.brief.slice_id,
    base_sha: context.brief.base_sha,
    head_sha: context.brief.base_sha,
    spec_compliance: "pass",
    task_quality: "pass",
    issues: [{
      finding_id: "finding-v4-safety",
      severity: "Critical",
      category: "contract",
      path: "brief.json",
      line: 1,
      evidence: "schema-v4 safety finding evidence",
      required_fix: "repair the current schema-v4 safety finding",
    }],
    cannot_verify_from_diff: [],
    strengths: [],
    reviewed_inputs: {
      brief_json: "brief.json",
      review_package_diff: "review-package.diff",
    },
  };
  const verdictFile = path.join(context.sliceDir, "review-verdict.json");
  const decisionsFile = path.join(context.root, "decisions.json");
  fs.writeFileSync(verdictFile, `${JSON.stringify(verdict, null, 2)}\n`);
  fs.writeFileSync(decisionsFile, `${JSON.stringify({
    records: [{
      finding_id: "finding-v4-safety",
      disposition: "current-required",
      basis: "safety-data-permission-risk",
      authority_refs: [
        "invariant:data-integrity",
        "acceptance:AC-V4",
        `constraints-sha256:${digestFile(context.globalConstraintsFile)}`,
        `diff:${context.brief.base_sha}..${context.brief.base_sha}`,
      ],
      repair_status: "open",
      reason: "The finding can authorize stale or cross-slice repair data.",
    }],
    evidence_gaps: [],
  }, null, 2)}\n`);
  const result = childProcess.spawnSync(process.execPath, [
    CONTROLLER_RESOLUTION_BIN,
    "--task", context.taskId,
    "--slice", context.brief.slice_id,
    "--decisions", decisionsFile,
  ], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, CODEX_WORKFLOW_ROOT: context.workflowRoot },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^goal_ref: [a-f0-9]{64}$/m);
  const resolution = JSON.parse(fs.readFileSync(
    path.join(context.sliceDir, "controller-resolution.json"),
    "utf8",
  ));
  const expectedGoalRef = computeGoalRef(context.brief, context.sliceDir);
  assert.equal(resolution.goal_ref, expectedGoalRef);
  assert.deepEqual(validateControllerResolutionAgainst(resolution, {
    brief: context.brief,
    goalRef: expectedGoalRef,
    sliceDir: context.sliceDir,
    verdict,
    verdictDigest: digestFile(verdictFile),
  }), []);
  const wrongConstraintsBrief = {
    ...context.brief,
    global_constraints_path: "../../global-constraints.md",
  };
  assert.ok(validateControllerResolutionAgainst(resolution, {
    brief: wrongConstraintsBrief,
    goalRef: expectedGoalRef,
    sliceDir: context.sliceDir,
    verdict,
    verdictDigest: digestFile(verdictFile),
  }).some((error) => error.includes("canonical global_constraints_path team/sdd/global-constraints.md")));
});
