"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../..");
const {
  extractExecutionPlan,
  validateExecutionPlan,
} = require(path.join(
  ROOT,
  "../plugins/atlas-workflow/contracts/team-sdd/validators/execution-plan.js",
));

function fixturePlan() {
  return extractExecutionPlan(fs.readFileSync(path.join(
    ROOT,
    "../test/fixtures/team-sdd/valid/execution-contract-v3.md",
  ), "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("execution plan accepts a bounded three-slice DAG", () => {
  const plan = fixturePlan();
  assert.equal(plan.slices.length, 3);
  assert.deepEqual(validateExecutionPlan(plan), []);
});

test("execution plan rejects duplicate slice and check identities", () => {
  const plan = clone(fixturePlan());
  plan.slices[1].slice_id = plan.slices[0].slice_id;
  plan.slices[1].checks[0].check_id = plan.slices[0].checks[0].check_id;
  const errors = validateExecutionPlan(plan).join("\n");
  assert.match(errors, /duplicate slice_id/);
  assert.match(errors, /check_id already owned/);
});

test("execution plan rejects missing dependencies and cycles", () => {
  const missing = clone(fixturePlan());
  missing.slices[1].depends_on = ["missing-slice"];
  assert.match(validateExecutionPlan(missing).join("\n"), /unknown dependency/);

  const cyclic = clone(fixturePlan());
  cyclic.slices[0].depends_on = ["slice-three"];
  assert.match(validateExecutionPlan(cyclic).join("\n"), /dependency cycle/);

  const wrongDepth = clone(fixturePlan());
  wrongDepth.slices[2].estimate.serial_dependency_depth = 1;
  assert.match(validateExecutionPlan(wrongDepth).join("\n"), /must equal dependency DAG depth 2/);
});

test("execution plan rejects overlapping ownership and acceptance refs", () => {
  const plan = clone(fixturePlan());
  plan.slices[1].owned_paths = ["src/one/nested/**"];
  plan.slices[1].forbidden_paths = [];
  plan.slices[1].acceptance_refs = plan.slices[0].acceptance_refs;
  const errors = validateExecutionPlan(plan).join("\n");
  assert.match(errors, /owned path overlap/);
  assert.match(errors, /acceptance ref already owned/);
});

test("execution plan rejects downgraded permanent gates", () => {
  const plan = clone(fixturePlan());
  plan.slices[0].checks[0].gate_class = "security";
  plan.slices[0].checks[0].cache_policy = "imported";
  assert.match(validateExecutionPlan(plan).join("\n"), /permanent gate security must be fresh-executed/);
});

test("execution plan requires a complete exception only when over budget", () => {
  const oversized = clone(fixturePlan());
  oversized.slices[0].budget.max_changed_files = 1;
  oversized.slices[0].owned_paths.push("src/extra/**");
  assert.match(validateExecutionPlan(oversized).join("\n"), /requires size_exception/);

  oversized.slices[0].size_exception = {
    authority_ref: "user-message:size-exception",
    expires_at: "2099-01-01T00:00:00Z",
    reason: "the bounded migration cannot be divided safely",
    compensating_controls: ["independent final verification"],
  };
  assert.deepEqual(validateExecutionPlan(oversized), []);

  const unnecessary = clone(fixturePlan());
  unnecessary.slices[0].size_exception = oversized.slices[0].size_exception;
  assert.match(validateExecutionPlan(unnecessary).join("\n"), /only valid for an over-budget slice/);
});

test("execution plan uses author estimates and rejects repository-broad scope", () => {
  const estimated = clone(fixturePlan());
  estimated.slices[0].estimate.estimated_changed_files = 5;
  assert.match(validateExecutionPlan(estimated).join("\n"), /requires size_exception/);

  const broad = clone(fixturePlan());
  broad.slices[0].owned_paths = ["src/**"];
  assert.match(validateExecutionPlan(broad).join("\n"), /requires size_exception/);

  const verticals = clone(fixturePlan());
  verticals.slices[0].estimate.independent_vertical_count = 2;
  assert.match(validateExecutionPlan(verticals).join("\n"), /requires size_exception/);
});

test("execution plan requires an exception beyond two serial dependencies", () => {
  const plan = clone(fixturePlan());
  const fourth = clone(plan.slices[2]);
  fourth.slice_id = "slice-four";
  fourth.depends_on = ["slice-three"];
  fourth.keeper_outputs = ["event:slice-four:ready"];
  fourth.owned_paths = ["docs/four/**"];
  fourth.acceptance_refs = ["AC-V3-4"];
  fourth.estimate.serial_dependency_depth = 3;
  fourth.checks[0].check_id = "slice-four-contract";
  plan.slices.push(fourth);

  assert.match(validateExecutionPlan(plan).join("\n"), /requires size_exception/);

  fourth.size_exception = {
    authority_ref: "user-message:serial-depth-exception",
    expires_at: "2099-01-01T00:00:00Z",
    reason: "the ordered migration cannot be reduced below four stages",
    compensating_controls: ["verify each keeper before starting its dependent slice"],
  };
  assert.deepEqual(validateExecutionPlan(plan), []);
});

test("execution plan extraction requires exactly one canonical fenced block", () => {
  const markdown = fs.readFileSync(path.join(
    ROOT,
    "../test/fixtures/team-sdd/valid/execution-contract-v3.md",
  ), "utf8");
  assert.throws(() => extractExecutionPlan(markdown.replace(/```atlas-execution-plan\+json/, "```json")), /found 0/);
  assert.throws(() => extractExecutionPlan(`${markdown}\n${markdown}`), /found 2/);
});
