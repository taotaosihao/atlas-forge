"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const CONTRACT_ROOT = path.join(ROOT, "plugins/atlas-workflow/contracts");
const { collectBusinessAcceptance } = require(path.join(
  CONTRACT_ROOT,
  "release-certification/adapters/business-acceptance-v2",
));
const { collectFormalWebUi } = require(path.join(
  CONTRACT_ROOT,
  "release-certification/adapters/formal-web-ui-v1",
));
const { collectReleaseData } = require(path.join(
  CONTRACT_ROOT,
  "release-certification/adapters/release-data-v1",
));
const { CONTROLS, collectReleaseOperability } = require(path.join(
  CONTRACT_ROOT,
  "release-certification/adapters/release-operability-v1",
));
const { validateReleaseFact } = require(path.join(
  CONTRACT_ROOT,
  "release-certification/validators/evidence",
));
const { loadBundledProfile, profileBinding } = require(path.join(
  CONTRACT_ROOT,
  "release-certification/validators/profile",
));
const { releaseRequirementProjection } = require(path.join(
  CONTRACT_ROOT,
  "team-sdd/validators/execution-plan",
));

const CANDIDATE = `sha256:${"c".repeat(64)}`;
const EVALUATED_AT = "2026-07-30T08:00:00.000Z";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function evidence(ref, char = "e", kind = "artifact") {
  return { ref, sha256: `sha256:${char.repeat(64)}`, kind };
}

function policyBindings() {
  const profile = loadBundledProfile("web-ui-v1");
  const binding = profileBinding(profile);
  return new Map(profile.requirements.map((requirement) => [
    requirement.dimension,
    releaseRequirementProjection(profile, binding, requirement),
  ]));
}

function businessInput() {
  return {
    schema_version: 1,
    candidate_manifest_digest: CANDIDATE,
    verdict: {
      schema_version: 2,
      task_id: "release-task",
      verdict: "accepted",
      technical_gate_status: "passed",
      business_acceptance_status: "passed",
      required_followups: [],
      blockers: [],
      goal_a: {
        status: "passed",
        evidence_refs: ["goal-a-proof"],
        integration_path_id: "primary-integration",
        integration_mode: "real",
      },
      goal_b: {
        status: "passed",
        evidence_refs: ["goal-b-proof"],
        integration_path_id: "primary-integration",
        integration_mode: "real",
      },
    },
    acceptance_report: {
      schema_version: 1,
      task_id: "release-task",
      scenario_results: [{
        scenario_id: "primary-journey",
        business_result: "passed",
        technical_gate_result: "passed",
        score: 100,
      }],
      technical_gate_summary: { blocking_failure_count: 0, failed_gates: [] },
      rating: { total: 100, level: "accepted", blocking_technical_gate_failed: false },
      open_deviations: [],
    },
    evidence_refs: [
      evidence("business-acceptance-report", "a"),
      evidence("goal-a-proof", "b", "business_evidence"),
      evidence("goal-b-proof", "c", "business_evidence"),
    ],
  };
}

function formalInput() {
  const dimensions = Object.fromEntries([
    "capability-truth", "surface-states", "formal-content-ia", "accessibility-quality",
  ].map((dimension) => [dimension, {
    status: "passed",
    summary: `The ${dimension} review passed with stable served evidence for the final candidate.`,
    evidence_refs: [`${dimension}-proof`],
    finding_codes: [],
  }]));
  return {
    schema_version: 2,
    review_id: "formal-review",
    candidate_manifest_digest: CANDIDATE,
    surface_inventory: evidence("surface-inventory", "b", "surface_inventory"),
    owner_decision: { owner: "product-owner", status: "accepted", evidence_ref: "owner-decision" },
    dimensions,
    failure_checks: {
      dead_controls: "passed",
      happy_path_only: "passed",
      engineering_meta_leakage: "passed",
    },
    evidence_refs: [
      evidence("owner-decision", "d", "human_decision"),
      ...Object.keys(dimensions).map((dimension, index) => (
        evidence(`${dimension}-proof`, String(index + 1), "browser_evidence")
      )),
    ],
  };
}

function dataInput() {
  return {
    schema_version: 1,
    review_id: "data-review",
    candidate_manifest_digest: CANDIDATE,
    status: "accepted",
    data_mode: "production_equivalent",
    product_routes_reviewed: ["/projects", "/projects/:id"],
    demo_seed_detected: false,
    acceptance_data_detected: false,
    lifecycle_verified: true,
    schema_migration_verified: true,
    summary: "Production-equivalent data semantics, lifecycle, and schema migration behavior are verified.",
    evidence_refs: [evidence("data-review-proof", "f", "data_review")],
  };
}

function operabilityInput() {
  const controls = Object.fromEntries(CONTROLS.map((control) => [control, {
    status: "passed",
    summary: `The ${control} control passed against the final release candidate with stable evidence.`,
    evidence_refs: [`${control}-proof`],
  }]));
  return {
    schema_version: 1,
    review_id: "operability-review",
    candidate_manifest_digest: CANDIDATE,
    owner_decision: { owner: "service-owner", status: "accepted", evidence_ref: "ops-owner-decision" },
    controls,
    evidence_refs: [
      evidence("ops-owner-decision", "9", "human_decision"),
      ...CONTROLS.map((control, index) => evidence(
        `${control}-proof`,
        "abcdef012"[index],
        "control_evidence",
      )),
    ],
  };
}

test("trusted adapters emit seven valid facts for one candidate", () => {
  const bindings = policyBindings();
  const facts = [
    collectBusinessAcceptance(businessInput(), {
      policyBinding: bindings.get("critical-journey"),
      candidateManifestDigest: CANDIDATE,
      evaluatedAt: EVALUATED_AT,
    }),
    ...collectFormalWebUi(formalInput(), {
      policyBindings: [...bindings.values()].filter((binding) => (
        ["capability-truth", "surface-states", "formal-content-ia", "accessibility-quality"]
          .includes(binding.dimension)
      )),
      candidateManifestDigest: CANDIDATE,
      evaluatedAt: EVALUATED_AT,
    }),
    collectReleaseData(dataInput(), {
      policyBinding: bindings.get("production-data"),
      candidateManifestDigest: CANDIDATE,
      evaluatedAt: EVALUATED_AT,
    }),
    collectReleaseOperability(operabilityInput(), {
      policyBinding: bindings.get("security-operability"),
      candidateManifestDigest: CANDIDATE,
      evaluatedAt: EVALUATED_AT,
    }),
  ];
  assert.equal(facts.length, 7);
  assert.deepEqual(facts.map((fact) => fact.outcome), Array(7).fill("passed"));
  assert.equal(new Set(facts.map((fact) => fact.policy_binding.requirement_ref)).size, 7);
  assert.ok(facts.filter((fact) => [
    "capability-truth", "surface-states", "formal-content-ia", "accessibility-quality",
  ].includes(fact.policy_binding.dimension)).every((fact) => (
    fact.evidence_refs.some((ref) => ref.kind === "surface_inventory")
  )));
  assert.ok(facts.every((fact) => validateReleaseFact(fact, {
    expectedPolicyBinding: bindings.get(fact.policy_binding.dimension),
    candidateManifestDigest: CANDIDATE,
  }).length === 0));

});

test("conditional or unstable human evidence cannot satisfy release facts", () => {
  const bindings = policyBindings();
  const business = businessInput();
  business.verdict.verdict = "conditionally_accepted";
  business.acceptance_report.rating.level = "conditionally_accepted";
  const businessFact = collectBusinessAcceptance(business, {
    policyBinding: bindings.get("critical-journey"),
    candidateManifestDigest: CANDIDATE,
    evaluatedAt: EVALUATED_AT,
  });
  assert.equal(businessFact.outcome, "cannot_verify");

  const formal = formalInput();
  formal.owner_decision.status = "cannot_verify";
  const formalFacts = collectFormalWebUi(formal, {
    policyBindings: [...bindings.values()].filter((binding) => binding.collector_adapter_ref === "formal-web-ui-v1@1"),
    candidateManifestDigest: CANDIDATE,
    evaluatedAt: EVALUATED_AT,
  });
  assert.ok(formalFacts.every((fact) => fact.outcome === "cannot_verify"));

  const simulator = businessInput();
  simulator.verdict.goal_a.integration_mode = "approved_simulator";
  simulator.verdict.goal_b.integration_mode = "approved_simulator";
  const simulatorFact = collectBusinessAcceptance(simulator, {
    policyBinding: bindings.get("critical-journey"),
    candidateManifestDigest: CANDIDATE,
    evaluatedAt: EVALUATED_AT,
  });
  assert.equal(simulatorFact.outcome, "cannot_verify");

  const missingEvidence = businessInput();
  missingEvidence.evidence_refs = missingEvidence.evidence_refs.filter((ref) => ref.ref !== "goal-b-proof");
  const missingEvidenceFact = collectBusinessAcceptance(missingEvidence, {
    policyBinding: bindings.get("critical-journey"),
    candidateManifestDigest: CANDIDATE,
    evaluatedAt: EVALUATED_AT,
  });
  assert.equal(missingEvidenceFact.outcome, "cannot_verify");
});

test("historical Demo failure modes become explicit failed facts", () => {
  const bindings = policyBindings();
  const formal = formalInput();
  formal.failure_checks.dead_controls = "failed";
  formal.failure_checks.happy_path_only = "failed";
  formal.failure_checks.engineering_meta_leakage = "failed";
  const formalFacts = collectFormalWebUi(formal, {
    policyBindings: [...bindings.values()].filter((binding) => binding.collector_adapter_ref === "formal-web-ui-v1@1"),
    candidateManifestDigest: CANDIDATE,
    evaluatedAt: EVALUATED_AT,
  });
  assert.equal(formalFacts.find((fact) => fact.policy_binding.dimension === "capability-truth").outcome, "failed");
  assert.equal(formalFacts.find((fact) => fact.policy_binding.dimension === "surface-states").outcome, "failed");
  assert.equal(formalFacts.find((fact) => fact.policy_binding.dimension === "formal-content-ia").outcome, "failed");

  const rejected = formalInput();
  rejected.owner_decision.status = "rejected";
  const rejectedFacts = collectFormalWebUi(rejected, {
    policyBindings: [...bindings.values()].filter((binding) => binding.collector_adapter_ref === "formal-web-ui-v1@1"),
    candidateManifestDigest: CANDIDATE,
    evaluatedAt: EVALUATED_AT,
  });
  assert.ok(rejectedFacts.every((fact) => fact.outcome === "failed"));

  const data = dataInput();
  data.demo_seed_detected = true;
  const dataFact = collectReleaseData(data, {
    policyBinding: bindings.get("production-data"),
    candidateManifestDigest: CANDIDATE,
    evaluatedAt: EVALUATED_AT,
  });
  assert.equal(dataFact.outcome, "failed");
  assert.deepEqual(dataFact.reason_codes, ["DEMO_OR_ACCEPTANCE_DATA_LEAKAGE"]);
});

test("failed controls, candidate drift, and fact tampering fail closed", () => {
  const bindings = policyBindings();
  const operability = operabilityInput();
  operability.controls.authorization.status = "failed";
  const fact = collectReleaseOperability(operability, {
    policyBinding: bindings.get("security-operability"),
    candidateManifestDigest: CANDIDATE,
    evaluatedAt: EVALUATED_AT,
  });
  assert.equal(fact.outcome, "failed");

  const stale = businessInput();
  stale.candidate_manifest_digest = `sha256:${"0".repeat(64)}`;
  const staleFact = collectBusinessAcceptance(stale, {
    policyBinding: bindings.get("critical-journey"),
    candidateManifestDigest: CANDIDATE,
    evaluatedAt: EVALUATED_AT,
  });
  assert.equal(staleFact.outcome, "cannot_verify");
  assert.deepEqual(staleFact.reason_codes, ["CANDIDATE_IDENTITY_MISMATCH"]);

  const tampered = clone(fact);
  tampered.outcome = "passed";
  assert.match(validateReleaseFact(tampered).join("\n"), /fact_id/);
  assert.match(validateReleaseFact(fact, {
    candidateManifestDigest: `sha256:${"1".repeat(64)}`,
  }).join("\n"), /does not match the final candidate/);
});
