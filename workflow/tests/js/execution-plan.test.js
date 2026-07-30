"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../..");
const {
  extractExecutionPlan,
  releasePlanBinding,
  releaseRequirementProjection,
  validateExecutionPlan,
} = require(path.join(
  ROOT,
  "../plugins/atlas-workflow/contracts/team-sdd/validators/execution-plan.js",
));
const { loadBundledProfile, profileBinding } = require(path.join(
  ROOT,
  "../plugins/atlas-workflow/contracts/release-certification/validators/profile.js",
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

function digest(char) {
  return `sha256:${char.repeat(64)}`;
}

function productIntent() {
  const profile = loadBundledProfile("web-ui-v1");
  return {
    schema_version: 1,
    target_delivery_class: "product_release",
    target_delivery_authority_ref: "goal:REL-PRODUCT",
    release_stage: "mvp",
    surface_inventory: { ref: "AC-SURFACE", sha256: digest("a") },
    surface_kinds: ["web_ui"],
    release_profile_refs: [{
      profile_ref: profile.profile_id,
      profile_sha256: profileBinding(profile).profile_sha256,
    }],
    release_claim_refs: ["AC-CLAIM"],
    audience_refs: ["AC-AUDIENCE"],
    critical_outcome_refs: ["AC-OUTCOME"],
  };
}

function releasePlan(intent = productIntent()) {
  const profile = loadBundledProfile("web-ui-v1");
  const binding = profileBinding(profile);
  return {
    schema_version: 2,
    size_policy: { policy_id: "atlas-slice-size-v2" },
    release: releasePlanBinding(intent),
    slices: [{
      slice_id: "release-slice",
      objective: "Certify the pure Web UI release candidate.",
      depends_on: [],
      keeper_outputs: ["release:web-ui-v1:evidence"],
      owned_paths: ["release/evidence/**"],
      forbidden_paths: ["plugins/multica-sdlc/**"],
      acceptance_refs: ["AC-RELEASE"],
      risk_class: "critical",
      failure_domain: "release-certification",
      rollback_boundary: "one release evidence commit",
      estimate: {
        estimated_changed_files: 2,
        estimated_net_loc: 100,
        target_p90_minutes: 60,
        serial_dependency_depth: 0,
        independent_vertical_count: 1,
      },
      budget: {
        max_changed_files: 4,
        max_loc: 400,
        max_wall_clock_minutes: 90,
        max_required_checks: 7,
      },
      checks: profile.requirements.map((requirement) => ({
        check_id: `release-${requirement.dimension}`,
        gate_class: requirement.check_definition.allowed_gate_classes[0],
        command: `atlas-release-collect ${requirement.requirement_id}`,
        final_only: true,
        cache_policy: "fresh-executed",
        release_requirement: releaseRequirementProjection(profile, binding, requirement),
      })),
    }],
  };
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

test("schema v2 projects every immutable Profile requirement exactly once", () => {
  const intent = productIntent();
  const plan = releasePlan(intent);
  assert.deepEqual(validateExecutionPlan(plan, { contractSemanticsVersion: 4, releaseIntent: intent }), []);
  assert.equal(plan.slices[0].checks.length, 7);

  const missing = clone(plan);
  missing.slices[0].checks.pop();
  assert.match(validateExecutionPlan(missing, { releaseIntent: intent }).join("\n"), /missing release requirement projection/);

  const replacedEvaluator = clone(plan);
  replacedEvaluator.slices[0].checks[0].release_requirement.evaluator_ref = "author-evaluator@1";
  assert.match(validateExecutionPlan(replacedEvaluator, { releaseIntent: intent }).join("\n"), /immutable Profile Check Definition/);
});

test("schema v2 runs the complete release sweep in one terminal slice", () => {
  const intent = productIntent();
  const disconnected = releasePlan(intent);
  disconnected.slices.unshift({
    slice_id: "implementation-slice",
    objective: "Implement the candidate before the global release sweep.",
    depends_on: [],
    keeper_outputs: ["candidate:implemented"],
    owned_paths: ["product/runtime/**"],
    forbidden_paths: ["plugins/multica-sdlc/**"],
    acceptance_refs: ["AC-IMPLEMENTED"],
    risk_class: "high",
    failure_domain: "candidate-implementation",
    rollback_boundary: "one implementation commit",
    estimate: {
      estimated_changed_files: 2,
      estimated_net_loc: 100,
      target_p90_minutes: 60,
      serial_dependency_depth: 0,
      independent_vertical_count: 1,
    },
    budget: {
      max_changed_files: 4,
      max_loc: 400,
      max_wall_clock_minutes: 90,
      max_required_checks: 1,
    },
    checks: [{
      check_id: "implementation-contract",
      gate_class: "contract",
      command: "node --test product/runtime.test.js",
      final_only: false,
      cache_policy: "identity-bound",
    }],
  });
  assert.match(
    validateExecutionPlan(disconnected, { releaseIntent: intent }).join("\n"),
    /must transitively depend on every other slice/,
  );

  disconnected.slices[1].depends_on = ["implementation-slice"];
  disconnected.slices[1].estimate.serial_dependency_depth = 1;
  assert.deepEqual(validateExecutionPlan(disconnected, { releaseIntent: intent }), []);

  const split = clone(disconnected);
  split.slices[0].checks.push(split.slices[1].checks.pop());
  assert.match(
    validateExecutionPlan(split, { releaseIntent: intent }).join("\n"),
    /one terminal certification slice/,
  );
});

test("schema v2 rejects stale policy identity and downgraded release checks", () => {
  const intent = productIntent();
  const stale = releasePlan(intent);
  stale.release.profile_sha256 = digest("b");
  assert.match(validateExecutionPlan(stale, { releaseIntent: intent }).join("\n"), /immutable release intent\/Profile binding/);

  const downgraded = releasePlan(intent);
  const check = downgraded.slices[0].checks[1];
  check.gate_class = "unit";
  check.final_only = false;
  check.cache_policy = "cached";
  const errors = validateExecutionPlan(downgraded, { releaseIntent: intent }).join("\n");
  assert.match(errors, /release checks must be final_only/);
  assert.match(errors, /release checks must be fresh-executed/);
  assert.match(errors, /gate_class unit is not allowed/);
});

test("execution plan versions stay bound to contract and delivery semantics", () => {
  const intent = productIntent();
  assert.match(
    validateExecutionPlan(fixturePlan(), { contractSemanticsVersion: 4, releaseIntent: intent }).join("\n"),
    /product_release intent requires execution-plan schema version 2/,
  );
  assert.match(
    validateExecutionPlan(releasePlan(intent), { contractSemanticsVersion: 3 }).join("\n"),
    /semantics-v3 contracts require execution-plan schema version 1/,
  );
});
