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
const {
  DIMENSIONS: INTEGRATED_DIMENSIONS,
  DIMENSION_CONTROLS,
  collectIntegratedApp,
  validateInput: validateIntegratedInput,
} = require(path.join(
  CONTRACT_ROOT,
  "release-certification/adapters/integrated-app-v1",
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

function integratedPolicyBindings() {
  const profile = loadBundledProfile("integrated-app-v1");
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

const INTEGRATED_COMPONENTS = Object.freeze({
  web_ui: `sha256:${"1".repeat(64)}`,
  api: `sha256:${"2".repeat(64)}`,
  worker: `sha256:${"3".repeat(64)}`,
  database: `sha256:${"4".repeat(64)}`,
  external_integration: `sha256:${"5".repeat(64)}`,
});

const PASSING_OBSERVATIONS = Object.freeze({
  "api-contract": Object.freeze({
    shared_contract: { contract_version: "v1", api_artifact_digest: `sha256:${"a".repeat(64)}`, positive_cases: 8, negative_cases: 6, failed_cases: 0 },
    api_envelope: { envelope_version: "v1", routes_checked: 12, invalid_envelopes: 0 },
    authn_authz_negative_paths: { roles_checked: 6, denied_cases: 12, unexpected_allows: 0 },
    compatibility: { baseline_version: "v1", target_version: "v2", breaking_changes: 0 },
    error_semantics: { cases_checked: 10, unstable_error_codes: 0, leaked_sensitive_errors: 0 },
  }),
  "worker-reliability": Object.freeze({
    transactional_outbox: { flow_id: "device-event", transactions_tested: 10, commits_without_outbox: 0, outbox_without_commit: 0 },
    durable_handoff: { flow_id: "device-event", messages_committed: 10, lost_messages: 0 },
    inbox_effect_idempotency: { flow_id: "device-event", duplicate_deliveries: 3, duplicate_effects: 0 },
    retry_backoff_dead_letter: { flow_id: "device-event", retries_observed: 3, dead_lettered_messages: 1, silent_drops: 0 },
    poison_message_quarantine: { flow_id: "device-event", poison_messages: 2, quarantined_messages: 2, blocked_following_messages: 0 },
    ordering_and_concurrency: { flow_id: "device-event", out_of_order_inputs: 3, concurrent_workers: 2, stale_overwrites: 0 },
    restart_recovery: { flow_id: "device-event", restart_count: 2, recovered_jobs: 8, lost_jobs: 0 },
  }),
  "data-integrity": Object.freeze({
    schema_migration: { from_version: "v1", to_version: "v2", migration_bundle_sha256: `sha256:${"6".repeat(64)}`, upgrade_passed: true, rollback_compatibility_passed: true },
    database_constraints: { cases_checked: 12, violations_committed: 0 },
    transactional_consistency: { flow_id: "inspection-result", fault_injections: 4, partial_commits: 0 },
    backup_restore: { backup_digest: `sha256:${"7".repeat(64)}`, restore_target: "isolated-restore", restored_schema_head: "v2", checksum_match: true },
    production_data_isolation: { routes_checked: 12, demo_data_leaks: 0, acceptance_data_leaks: 0 },
  }),
  "external-integration": Object.freeze({
    contract_binding: { contract_version: "hive-v1", config_sha256: `sha256:${"b".repeat(64)}`, topics_or_routes_checked: 8, mismatches: 0 },
    identity_credentials_rotation_revocation: { credential_identity: "hive-tenant-device", issuance_tested: true, rotation_tested: true, revocation_tested: true, stale_credentials_accepted: 0 },
    inbound_idempotency_conflict: { flow_id: "device-event", duplicate_inputs: 3, duplicate_effects: 0, conflicting_payloads: 2, conflicts_quarantined: 2 },
    ordering_epoch_sequence_replay: { flow_id: "device-event", epochs_observed: 2, replayed_messages: 4, stale_overwrites: 0, duplicate_effects: 0 },
    retry_dead_letter_manual_replay: { flow_id: "device-event", retries_observed: 3, dead_lettered_messages: 1, manual_replay_passed: true, silent_drops: 0 },
    command_ack_timeout_cancel: { command_flow_id: "device-event", commands_checked: 8, timeouts_injected: 2, cancellation_tested: true, duplicate_device_effects: 0, late_ack_accepted: 0 },
    degraded_mode: { dependencies_failed: 2, core_operations_preserved: true, unsafe_operations_allowed: 0 },
  }),
  "performance-resilience": Object.freeze({
    declared_budget: { load_profile: "mes-p1", duration_seconds: 300, thresholds_sha256: `sha256:${"8".repeat(64)}` },
    steady_state: { load_profile: "mes-p1", thresholds_sha256: `sha256:${"8".repeat(64)}`, samples: 100, p95_ms: 180, p95_budget_ms: 250, lost_events: 0, duplicate_effects: 0 },
    burst_and_backlog: { load_profile: "mes-p1", thresholds_sha256: `sha256:${"8".repeat(64)}`, peak_backlog: 500, drain_seconds: 40, drain_budget_seconds: 60, unbounded_growth: false },
    failure_recovery: { load_profile: "mes-p1", thresholds_sha256: `sha256:${"8".repeat(64)}`, faults_injected: 4, recovery_seconds: 30, recovery_budget_seconds: 60, lost_events: 0, duplicate_effects: 0 },
    resource_limits: { load_profile: "mes-p1", thresholds_sha256: `sha256:${"8".repeat(64)}`, peak_cpu_percent: 80, peak_memory_bytes: 536870912, limit_breaches: 0 },
  }),
});

function integratedInput() {
  const evidenceRecords = [];
  const dimensions = Object.fromEntries(INTEGRATED_DIMENSIONS.map((dimension) => [dimension, {
    status: "passed",
    summary: `The ${dimension} dimension passed every required control against the final integrated candidate.`,
    controls: Object.fromEntries(DIMENSION_CONTROLS[dimension].map((control) => {
      const ref = `${dimension}-${control}-proof`;
      evidenceRecords.push({
        content_ref: evidence(ref, "6", "integrated_control_evidence"),
        record: {
          schema_version: 1,
          evidence_id: ref,
          candidate_manifest_digest: CANDIDATE,
          deployment_id: "deployment-mes-p1",
          observed_unit_set_sha256: `sha256:${"d".repeat(64)}`,
          evidence_set_id: "evidence-set-mes-p1",
          run_id: "run-mes-p1",
          dimension,
          control_id: control,
          component_identities: Object.fromEntries(
            Object.keys(INTEGRATED_COMPONENTS)
              .filter((component) => ({
                "api-contract": ["api", "database"],
                "worker-reliability": ["api", "worker", "database", "external_integration"],
                "data-integrity": ["api", "worker", "database"],
                "external-integration": ["api", "worker", "database", "external_integration"],
                "performance-resilience": Object.keys(INTEGRATED_COMPONENTS),
              })[dimension].includes(component))
              .map((component) => [component, INTEGRATED_COMPONENTS[component]]),
          ),
          check_identity: {
            producer: "atlas-test-integrated-producer@1",
            check_id: `${dimension}.${control}`,
            gate_class: "integration",
            command_sha256: `sha256:${"9".repeat(64)}`,
          },
          executed_at: EVALUATED_AT,
          observations: clone(PASSING_OBSERVATIONS[dimension][control]),
        },
      });
      return [control, {
        status: "passed",
        summary: `The ${control} control passed with candidate-bound evidence from the final integrated runtime.`,
        evidence_ref: ref,
      }];
    })),
    finding_codes: [],
  }]));
  return {
    schema_version: 2,
    review_id: "integrated-app-review",
    candidate_manifest_digest: CANDIDATE,
    deployment_id: "deployment-mes-p1",
    candidate_components: { ...INTEGRATED_COMPONENTS },
    observed_unit_set_sha256: `sha256:${"d".repeat(64)}`,
    evidence_set_id: "evidence-set-mes-p1",
    run_id: "run-mes-p1",
    observation_window: {
      started_at: "2026-07-30T07:00:00.000Z",
      ended_at: EVALUATED_AT,
    },
    owner_decision: {
      owner: "integrated-service-owner",
      status: "accepted",
      evidence_ref: "integrated-owner-decision",
    },
    owner_evidence: evidence("integrated-owner-decision", "8", "human_decision"),
    dimensions,
    evidence_records: evidenceRecords,
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

test("integrated application adapter emits five strict candidate-bound facts", () => {
  const bindings = integratedPolicyBindings();
  const integratedBindings = INTEGRATED_DIMENSIONS.map((dimension) => bindings.get(dimension));
  const input = integratedInput();
  assert.deepEqual(validateIntegratedInput(input), []);
  const facts = collectIntegratedApp(input, {
    policyBindings: integratedBindings,
    candidateManifestDigest: CANDIDATE,
    evaluatedAt: EVALUATED_AT,
  });
  assert.equal(facts.length, 5);
  assert.deepEqual(facts.map((fact) => fact.outcome), Array(5).fill("passed"));
  assert.ok(facts.every((fact) => validateReleaseFact(fact, {
    expectedPolicyBinding: bindings.get(fact.policy_binding.dimension),
    candidateManifestDigest: CANDIDATE,
  }).length === 0));

  const unresolved = integratedInput();
  unresolved.dimensions["worker-reliability"].finding_codes = ["BACKLOG_RECOVERY_UNPROVEN"];
  const unresolvedFacts = collectIntegratedApp(unresolved, {
    policyBindings: integratedBindings,
    candidateManifestDigest: CANDIDATE,
    evaluatedAt: EVALUATED_AT,
  });
  assert.equal(
    unresolvedFacts.find((fact) => fact.policy_binding.dimension === "worker-reliability").outcome,
    "cannot_verify",
  );

  const failed = integratedInput();
  const failedControl = failed.dimensions["external-integration"]
    .controls.ordering_epoch_sequence_replay;
  failedControl.status = "failed";
  const failedRecord = failed.evidence_records.find((item) => (
    item.content_ref.ref === failedControl.evidence_ref
  ));
  failedRecord.record.observations.stale_overwrites = 1;
  const failedFacts = collectIntegratedApp(failed, {
    policyBindings: integratedBindings,
    candidateManifestDigest: CANDIDATE,
    evaluatedAt: EVALUATED_AT,
  });
  assert.equal(
    failedFacts.find((fact) => fact.policy_binding.dimension === "external-integration").outcome,
    "failed",
  );

  const stale = integratedInput();
  const staleFacts = collectIntegratedApp(stale, {
    policyBindings: integratedBindings,
    candidateManifestDigest: `sha256:${"0".repeat(64)}`,
    evaluatedAt: EVALUATED_AT,
  });
  assert.ok(staleFacts.every((fact) => (
    fact.outcome === "cannot_verify" && fact.reason_codes[0] === "CANDIDATE_IDENTITY_MISMATCH"
  )));
});

test("integrated controls reject arbitrary proof reuse and cross-candidate evidence", () => {
  const bindings = integratedPolicyBindings();
  const integratedBindings = INTEGRATED_DIMENSIONS.map((dimension) => bindings.get(dimension));

  const reused = integratedInput();
  const sharedRef = reused.dimensions["api-contract"].controls.shared_contract.evidence_ref;
  for (const dimension of INTEGRATED_DIMENSIONS) {
    for (const control of DIMENSION_CONTROLS[dimension]) {
      reused.dimensions[dimension].controls[control].evidence_ref = sharedRef;
    }
  }
  assert.match(validateIntegratedInput(reused).join("\n"), /distinct typed evidence record/);
  assert.ok(collectIntegratedApp(reused, {
    policyBindings: integratedBindings,
    candidateManifestDigest: CANDIDATE,
    evaluatedAt: EVALUATED_AT,
  }).every((fact) => fact.outcome === "cannot_verify"));

  const crossCandidate = integratedInput();
  crossCandidate.evidence_records[0].record.candidate_manifest_digest = `sha256:${"0".repeat(64)}`;
  assert.match(validateIntegratedInput(crossCandidate).join("\n"), /does not match the review/);

  const wrongComponents = integratedInput();
  wrongComponents.evidence_records[0].record.component_identities.api = `sha256:${"0".repeat(64)}`;
  assert.match(validateIntegratedInput(wrongComponents).join("\n"), /does not match candidate_components/);

  const wrongKind = integratedInput();
  wrongKind.evidence_records[0].content_ref.kind = "artifact";
  assert.match(validateIntegratedInput(wrongKind).join("\n"), /integrated_control_evidence/);

  const ownerReuse = integratedInput();
  ownerReuse.owner_evidence.ref = ownerReuse.evidence_records[0].content_ref.ref;
  ownerReuse.owner_decision.evidence_ref = ownerReuse.owner_evidence.ref;
  assert.match(validateIntegratedInput(ownerReuse).join("\n"), /cannot be reused/);

  const splitFlow = integratedInput();
  const commandRef = splitFlow.dimensions["external-integration"]
    .controls.command_ack_timeout_cancel.evidence_ref;
  splitFlow.evidence_records.find((item) => item.content_ref.ref === commandRef)
    .record.observations.command_flow_id = "unrelated-command-flow";
  assert.match(validateIntegratedInput(splitFlow).join("\n"), /must bind one end-to-end flow identity/);

  const splitWorkerFlow = integratedInput();
  const restartRef = splitWorkerFlow.dimensions["worker-reliability"]
    .controls.restart_recovery.evidence_ref;
  splitWorkerFlow.evidence_records.find((item) => item.content_ref.ref === restartRef)
    .record.observations.flow_id = "unrelated-restart-flow";
  assert.match(validateIntegratedInput(splitWorkerFlow).join("\n"), /must bind one end-to-end flow identity/);

  const crossRun = integratedInput();
  crossRun.evidence_records[0].record.run_id = "different-run";
  assert.match(validateIntegratedInput(crossRun).join("\n"), /run_id does not match the review/);
});

test("integrated evidence sets reject expired and future observation windows", () => {
  const bindings = integratedPolicyBindings();
  const integratedBindings = INTEGRATED_DIMENSIONS.map((dimension) => bindings.get(dimension));

  const boundary = integratedInput();
  boundary.observation_window.started_at = "2026-07-29T08:00:00.000Z";
  boundary.evidence_records.forEach((item) => {
    item.record.executed_at = "2026-07-29T08:00:00.000Z";
  });
  assert.ok(collectIntegratedApp(boundary, {
    policyBindings: integratedBindings,
    candidateManifestDigest: CANDIDATE,
    evaluatedAt: EVALUATED_AT,
  }).every((fact) => fact.outcome === "passed"));

  const expired = integratedInput();
  expired.observation_window = {
    started_at: "2026-07-28T07:00:00.000Z",
    ended_at: "2026-07-28T08:00:00.000Z",
  };
  expired.evidence_records.forEach((item) => {
    item.record.executed_at = "2026-07-28T08:00:00.000Z";
  });
  assert.ok(collectIntegratedApp(expired, {
    policyBindings: integratedBindings,
    candidateManifestDigest: CANDIDATE,
    evaluatedAt: EVALUATED_AT,
  }).every((fact) => fact.outcome === "cannot_verify"));

  const future = integratedInput();
  future.observation_window.ended_at = "2026-07-30T09:00:00.000Z";
  future.evidence_records[0].record.executed_at = "2026-07-30T09:00:00.000Z";
  assert.ok(collectIntegratedApp(future, {
    policyBindings: integratedBindings,
    candidateManifestDigest: CANDIDATE,
    evaluatedAt: EVALUATED_AT,
  }).every((fact) => fact.outcome === "cannot_verify"));
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
