"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
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
    ["invariant:no-data-loss", `constraints-sha256:${context.constraintsDigest}`, `diff:${"1".repeat(40)}..${"2".repeat(40)}`],
    ["invariant:safety", "invariant:anything-goes", `constraints-sha256:${context.constraintsDigest}`, `diff:${"1".repeat(40)}..${"2".repeat(40)}`],
    ["invariant:safety", `constraints-sha256:${"f".repeat(64)}`, `diff:${"1".repeat(40)}..${"2".repeat(40)}`],
    ["invariant:permission-boundary", `constraints-sha256:${context.constraintsDigest}`, `diff:${"1".repeat(40)}..${"3".repeat(40)}`],
  ]) {
    const invalidSafety = structuredClone(safety);
    invalidSafety.records[0].authority_refs = authorityRefs;
    assert.notDeepEqual(validateControllerResolutionAgainst(invalidSafety, context), []);
  }
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
