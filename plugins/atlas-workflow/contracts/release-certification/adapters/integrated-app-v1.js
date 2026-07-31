"use strict";

const {
  contentAddressedEvidence,
  createReleaseFact,
  isObject,
  sourceFor,
  validateContentRef,
  validateDigest,
} = require("../validators/evidence");

const SURFACE_COMPONENTS = Object.freeze([
  "web_ui",
  "api",
  "worker",
  "database",
  "external_integration",
]);

const DIMENSION_CONTROLS = Object.freeze({
  "api-contract": Object.freeze([
    "shared_contract",
    "api_envelope",
    "authn_authz_negative_paths",
    "compatibility",
    "error_semantics",
  ]),
  "worker-reliability": Object.freeze([
    "transactional_outbox",
    "durable_handoff",
    "inbox_effect_idempotency",
    "retry_backoff_dead_letter",
    "poison_message_quarantine",
    "ordering_and_concurrency",
    "restart_recovery",
  ]),
  "data-integrity": Object.freeze([
    "schema_migration",
    "database_constraints",
    "transactional_consistency",
    "backup_restore",
    "production_data_isolation",
  ]),
  "external-integration": Object.freeze([
    "contract_binding",
    "identity_credentials_rotation_revocation",
    "inbound_idempotency_conflict",
    "ordering_epoch_sequence_replay",
    "retry_dead_letter_manual_replay",
    "command_ack_timeout_cancel",
    "degraded_mode",
  ]),
  "performance-resilience": Object.freeze([
    "declared_budget",
    "steady_state",
    "burst_and_backlog",
    "failure_recovery",
    "resource_limits",
  ]),
});

const DIMENSIONS = Object.freeze(Object.keys(DIMENSION_CONTROLS));
const DIMENSION_COMPONENTS = Object.freeze({
  "api-contract": Object.freeze(["api", "database"]),
  "worker-reliability": Object.freeze(["api", "worker", "database", "external_integration"]),
  "data-integrity": Object.freeze(["api", "worker", "database"]),
  "external-integration": Object.freeze(["api", "worker", "database", "external_integration"]),
  "performance-resilience": SURFACE_COMPONENTS,
});

const INPUT_KEYS = [
  "schema_version", "review_id", "candidate_manifest_digest", "deployment_id",
  "candidate_components", "observed_unit_set_sha256", "evidence_set_id", "run_id",
  "observation_window", "owner_decision", "owner_evidence", "dimensions", "evidence_records",
];
const OWNER_KEYS = ["owner", "status", "evidence_ref"];
const DIMENSION_KEYS = ["status", "summary", "controls", "finding_codes"];
const CONTROL_KEYS = ["status", "summary", "evidence_ref"];
const EVIDENCE_KEYS = ["content_ref", "record"];
const RECORD_KEYS = [
  "schema_version", "evidence_id", "candidate_manifest_digest", "deployment_id",
  "observed_unit_set_sha256", "evidence_set_id", "run_id", "dimension", "control_id",
  "component_identities", "check_identity", "executed_at", "observations",
];
const WINDOW_KEYS = ["started_at", "ended_at"];
const CHECK_KEYS = ["producer", "check_id", "gate_class", "command_sha256"];
const STATUSES = new Set(["passed", "failed", "cannot_verify"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

const TYPES = Object.freeze({
  bool: (value) => typeof value === "boolean",
  digest: (value) => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value),
  integer: (value) => Number.isInteger(value) && value >= 0,
  positive_integer: (value) => Number.isInteger(value) && value > 0,
  string: (value) => typeof value === "string" && value.trim().length > 0,
});

function observationSpec(fields, passes) {
  return Object.freeze({ fields: Object.freeze(fields), passes });
}

const CONTROL_SPECS = Object.freeze({
  "api-contract": Object.freeze({
    shared_contract: observationSpec({
      contract_version: "string", api_artifact_digest: "digest", positive_cases: "positive_integer",
      negative_cases: "positive_integer", failed_cases: "integer",
    }, (value) => value.failed_cases === 0),
    api_envelope: observationSpec({
      envelope_version: "string", routes_checked: "positive_integer",
      invalid_envelopes: "integer",
    }, (value) => value.invalid_envelopes === 0),
    authn_authz_negative_paths: observationSpec({
      roles_checked: "positive_integer", denied_cases: "positive_integer",
      unexpected_allows: "integer",
    }, (value) => value.unexpected_allows === 0),
    compatibility: observationSpec({
      baseline_version: "string", target_version: "string", breaking_changes: "integer",
    }, (value) => value.breaking_changes === 0),
    error_semantics: observationSpec({
      cases_checked: "positive_integer", unstable_error_codes: "integer",
      leaked_sensitive_errors: "integer",
    }, (value) => value.unstable_error_codes === 0 && value.leaked_sensitive_errors === 0),
  }),
  "worker-reliability": Object.freeze({
    transactional_outbox: observationSpec({
      flow_id: "string", transactions_tested: "positive_integer",
      commits_without_outbox: "integer", outbox_without_commit: "integer",
    }, (value) => value.commits_without_outbox === 0 && value.outbox_without_commit === 0),
    durable_handoff: observationSpec({
      flow_id: "string", messages_committed: "positive_integer", lost_messages: "integer",
    }, (value) => value.lost_messages === 0),
    inbox_effect_idempotency: observationSpec({
      flow_id: "string", duplicate_deliveries: "positive_integer", duplicate_effects: "integer",
    }, (value) => value.duplicate_effects === 0),
    retry_backoff_dead_letter: observationSpec({
      flow_id: "string", retries_observed: "positive_integer",
      dead_lettered_messages: "positive_integer", silent_drops: "integer",
    }, (value) => value.silent_drops === 0),
    poison_message_quarantine: observationSpec({
      flow_id: "string", poison_messages: "positive_integer",
      quarantined_messages: "positive_integer", blocked_following_messages: "integer",
    }, (value) => (
      value.quarantined_messages === value.poison_messages && value.blocked_following_messages === 0
    )),
    ordering_and_concurrency: observationSpec({
      flow_id: "string", out_of_order_inputs: "positive_integer",
      concurrent_workers: "positive_integer", stale_overwrites: "integer",
    }, (value) => value.stale_overwrites === 0),
    restart_recovery: observationSpec({
      flow_id: "string", restart_count: "positive_integer",
      recovered_jobs: "positive_integer", lost_jobs: "integer",
    }, (value) => value.lost_jobs === 0),
  }),
  "data-integrity": Object.freeze({
    schema_migration: observationSpec({
      from_version: "string", to_version: "string", migration_bundle_sha256: "digest",
      upgrade_passed: "bool", rollback_compatibility_passed: "bool",
    }, (value) => value.upgrade_passed && value.rollback_compatibility_passed),
    database_constraints: observationSpec({
      cases_checked: "positive_integer", violations_committed: "integer",
    }, (value) => value.violations_committed === 0),
    transactional_consistency: observationSpec({
      flow_id: "string", fault_injections: "positive_integer", partial_commits: "integer",
    }, (value) => value.partial_commits === 0),
    backup_restore: observationSpec({
      backup_digest: "digest", restore_target: "string", restored_schema_head: "string",
      checksum_match: "bool",
    }, (value) => value.checksum_match),
    production_data_isolation: observationSpec({
      routes_checked: "positive_integer", demo_data_leaks: "integer",
      acceptance_data_leaks: "integer",
    }, (value) => value.demo_data_leaks === 0 && value.acceptance_data_leaks === 0),
  }),
  "external-integration": Object.freeze({
    contract_binding: observationSpec({
      contract_version: "string", config_sha256: "digest",
      topics_or_routes_checked: "positive_integer", mismatches: "integer",
    }, (value) => value.mismatches === 0),
    identity_credentials_rotation_revocation: observationSpec({
      credential_identity: "string", issuance_tested: "bool", rotation_tested: "bool",
      revocation_tested: "bool", stale_credentials_accepted: "integer",
    }, (value) => (
      value.issuance_tested && value.rotation_tested && value.revocation_tested
      && value.stale_credentials_accepted === 0
    )),
    inbound_idempotency_conflict: observationSpec({
      flow_id: "string", duplicate_inputs: "positive_integer", duplicate_effects: "integer",
      conflicting_payloads: "positive_integer", conflicts_quarantined: "positive_integer",
    }, (value) => (
      value.duplicate_effects === 0 && value.conflicts_quarantined === value.conflicting_payloads
    )),
    ordering_epoch_sequence_replay: observationSpec({
      flow_id: "string", epochs_observed: "positive_integer", replayed_messages: "positive_integer",
      stale_overwrites: "integer", duplicate_effects: "integer",
    }, (value) => (
      value.epochs_observed >= 2 && value.stale_overwrites === 0 && value.duplicate_effects === 0
    )),
    retry_dead_letter_manual_replay: observationSpec({
      flow_id: "string", retries_observed: "positive_integer",
      dead_lettered_messages: "positive_integer", manual_replay_passed: "bool",
      silent_drops: "integer",
    }, (value) => value.manual_replay_passed && value.silent_drops === 0),
    command_ack_timeout_cancel: observationSpec({
      command_flow_id: "string", commands_checked: "positive_integer",
      timeouts_injected: "positive_integer", cancellation_tested: "bool",
      duplicate_device_effects: "integer", late_ack_accepted: "integer",
    }, (value) => (
      value.cancellation_tested && value.duplicate_device_effects === 0
      && value.late_ack_accepted === 0
    )),
    degraded_mode: observationSpec({
      dependencies_failed: "positive_integer", core_operations_preserved: "bool",
      unsafe_operations_allowed: "integer",
    }, (value) => value.core_operations_preserved && value.unsafe_operations_allowed === 0),
  }),
  "performance-resilience": Object.freeze({
    declared_budget: observationSpec({
      load_profile: "string", duration_seconds: "positive_integer", thresholds_sha256: "digest",
    }, () => true),
    steady_state: observationSpec({
      load_profile: "string", thresholds_sha256: "digest", samples: "positive_integer",
      p95_ms: "positive_integer", p95_budget_ms: "positive_integer", lost_events: "integer",
      duplicate_effects: "integer",
    }, (value) => (
      value.p95_ms <= value.p95_budget_ms && value.lost_events === 0 && value.duplicate_effects === 0
    )),
    burst_and_backlog: observationSpec({
      load_profile: "string", thresholds_sha256: "digest", peak_backlog: "positive_integer",
      drain_seconds: "positive_integer", drain_budget_seconds: "positive_integer",
      unbounded_growth: "bool",
    }, (value) => !value.unbounded_growth && value.drain_seconds <= value.drain_budget_seconds),
    failure_recovery: observationSpec({
      load_profile: "string", thresholds_sha256: "digest", faults_injected: "positive_integer",
      recovery_seconds: "positive_integer", recovery_budget_seconds: "positive_integer",
      lost_events: "integer", duplicate_effects: "integer",
    }, (value) => (
      value.recovery_seconds <= value.recovery_budget_seconds
      && value.lost_events === 0 && value.duplicate_effects === 0
    )),
    resource_limits: observationSpec({
      load_profile: "string", thresholds_sha256: "digest", peak_cpu_percent: "positive_integer",
      peak_memory_bytes: "positive_integer", limit_breaches: "integer",
    }, (value) => value.limit_breaches === 0),
  }),
});

function exactKeys(value, required, allowed, location, errors) {
  if (!isObject(value)) {
    errors.push(`${location} must be an object`);
    return false;
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) errors.push(`${location} missing required key: ${key}`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(`${location} unknown key: ${key}`);
  }
  return true;
}

function nonEmptyString(value, location, errors, minimum = 1) {
  if (typeof value !== "string" || value.trim().length < minimum) {
    errors.push(`${location} must be a substantive non-empty string`);
  }
}

function stringArray(value, location, errors) {
  if (!Array.isArray(value)
    || value.some((item) => typeof item !== "string" || !item.trim())) {
    errors.push(`${location} must be an array of non-empty strings`);
    return [];
  }
  if (new Set(value).size !== value.length) errors.push(`${location} must not contain duplicates`);
  return value;
}

function validateObservations(value, dimension, control, location, errors) {
  const spec = CONTROL_SPECS[dimension][control];
  const keys = Object.keys(spec.fields);
  if (!exactKeys(value, keys, keys, location, errors)) return;
  for (const [key, type] of Object.entries(spec.fields)) {
    if (!TYPES[type](value[key])) errors.push(`${location}.${key} must be ${type}`);
  }
}

function validateComponentIdentities(value, dimension, input, location, errors) {
  const components = DIMENSION_COMPONENTS[dimension];
  if (!exactKeys(value, components, components, location, errors)) return;
  for (const component of components) {
    validateDigest(value[component], `${location}.${component}`, errors);
    if (value[component] !== input.candidate_components?.[component]) {
      errors.push(`${location}.${component} does not match candidate_components`);
    }
  }
}

function validateEvidenceRecord(value, input, location, errors) {
  if (!exactKeys(value, EVIDENCE_KEYS, EVIDENCE_KEYS, location, errors)) return;
  validateContentRef(value.content_ref, `${location}.content_ref`, errors);
  if (value.content_ref?.kind !== "integrated_control_evidence") {
    errors.push(`${location}.content_ref.kind must equal integrated_control_evidence`);
  }
  const record = value.record;
  if (!exactKeys(record, RECORD_KEYS, RECORD_KEYS, `${location}.record`, errors)) return;
  if (record.schema_version !== 1) errors.push(`${location}.record.schema_version must equal 1`);
  nonEmptyString(record.evidence_id, `${location}.record.evidence_id`, errors);
  if (record.evidence_id !== value.content_ref?.ref) {
    errors.push(`${location}.record.evidence_id must equal content_ref.ref`);
  }
  validateDigest(record.candidate_manifest_digest, `${location}.record.candidate_manifest_digest`, errors);
  if (record.candidate_manifest_digest !== input.candidate_manifest_digest) {
    errors.push(`${location}.record.candidate_manifest_digest does not match the review`);
  }
  nonEmptyString(record.deployment_id, `${location}.record.deployment_id`, errors);
  if (record.deployment_id !== input.deployment_id) {
    errors.push(`${location}.record.deployment_id does not match the review`);
  }
  validateDigest(
    record.observed_unit_set_sha256,
    `${location}.record.observed_unit_set_sha256`,
    errors,
  );
  if (record.observed_unit_set_sha256 !== input.observed_unit_set_sha256) {
    errors.push(`${location}.record.observed_unit_set_sha256 does not match the review`);
  }
  for (const field of ["evidence_set_id", "run_id"]) {
    nonEmptyString(record[field], `${location}.record.${field}`, errors);
    if (record[field] !== input[field]) {
      errors.push(`${location}.record.${field} does not match the review`);
    }
  }
  if (!DIMENSIONS.includes(record.dimension)) errors.push(`${location}.record.dimension is invalid`);
  if (!DIMENSION_CONTROLS[record.dimension]?.includes(record.control_id)) {
    errors.push(`${location}.record.control_id is invalid for ${String(record.dimension)}`);
  }
  if (DIMENSIONS.includes(record.dimension)) {
    validateComponentIdentities(
      record.component_identities,
      record.dimension,
      input,
      `${location}.record.component_identities`,
      errors,
    );
  }
  if (exactKeys(record.check_identity, CHECK_KEYS, CHECK_KEYS, `${location}.record.check_identity`, errors)) {
    nonEmptyString(record.check_identity.producer, `${location}.record.check_identity.producer`, errors);
    if (typeof record.check_identity.check_id !== "string"
      || !SAFE_ID.test(record.check_identity.check_id)) {
      errors.push(`${location}.record.check_identity.check_id must be a safe identifier`);
    }
    nonEmptyString(record.check_identity.gate_class, `${location}.record.check_identity.gate_class`, errors);
    validateDigest(
      record.check_identity.command_sha256,
      `${location}.record.check_identity.command_sha256`,
      errors,
    );
  }
  if (typeof record.executed_at !== "string" || Number.isNaN(Date.parse(record.executed_at))) {
    errors.push(`${location}.record.executed_at must be an ISO-8601 timestamp`);
  }
  if (DIMENSIONS.includes(record.dimension)
    && DIMENSION_CONTROLS[record.dimension]?.includes(record.control_id)) {
    validateObservations(
      record.observations,
      record.dimension,
      record.control_id,
      `${location}.record.observations`,
      errors,
    );
  }
}

function validateControl(value, dimension, control, recordByRef, location, errors) {
  if (!exactKeys(value, CONTROL_KEYS, CONTROL_KEYS, location, errors)) return;
  if (!STATUSES.has(value.status)) errors.push(`${location}.status is invalid`);
  nonEmptyString(value.summary, `${location}.summary`, errors, 20);
  nonEmptyString(value.evidence_ref, `${location}.evidence_ref`, errors);
  const evidence = recordByRef.get(value.evidence_ref);
  if (!evidence) {
    errors.push(`${location}.evidence_ref is not a typed evidence record`);
  } else if (evidence.record.dimension !== dimension || evidence.record.control_id !== control) {
    errors.push(`${location}.evidence_ref does not bind ${dimension}.${control}`);
  }
}

function validateDimension(value, dimension, recordByRef, errors) {
  const location = `dimensions.${dimension}`;
  if (!exactKeys(value, DIMENSION_KEYS, DIMENSION_KEYS, location, errors)) return;
  if (!STATUSES.has(value.status)) errors.push(`${location}.status is invalid`);
  nonEmptyString(value.summary, `${location}.summary`, errors, 20);
  stringArray(value.finding_codes, `${location}.finding_codes`, errors);
  if (!isObject(value.controls)) {
    errors.push(`${location}.controls must be an object`);
    return;
  }
  for (const control of DIMENSION_CONTROLS[dimension]) {
    validateControl(
      value.controls[control],
      dimension,
      control,
      recordByRef,
      `${location}.controls.${control}`,
      errors,
    );
  }
  for (const key of Object.keys(value.controls)) {
    if (!DIMENSION_CONTROLS[dimension].includes(key)) {
      errors.push(`${location}.controls unknown key: ${key}`);
    }
  }
}

function evidenceRecordMap(input, errors) {
  if (!Array.isArray(input.evidence_records)) {
    errors.push("evidence_records must be an array");
    return new Map();
  }
  const records = new Map();
  const controlKeys = new Set();
  input.evidence_records.forEach((evidence, index) => {
    const location = `evidence_records[${index}]`;
    validateEvidenceRecord(evidence, input, location, errors);
    const ref = evidence?.content_ref?.ref;
    if (ref) {
      if (records.has(ref)) errors.push(`evidence_records contains duplicate ref: ${ref}`);
      records.set(ref, evidence);
    }
    const record = evidence?.record;
    if (record?.dimension && record?.control_id) {
      const key = `${record.dimension}.${record.control_id}`;
      if (controlKeys.has(key)) errors.push(`evidence_records contains duplicate control: ${key}`);
      controlKeys.add(key);
    }
  });
  const expectedCount = DIMENSIONS.reduce((count, dimension) => (
    count + DIMENSION_CONTROLS[dimension].length
  ), 0);
  if (input.evidence_records.length !== expectedCount) {
    errors.push(`evidence_records must contain exactly ${expectedCount} typed control records`);
  }
  return records;
}

function validateInput(input) {
  const errors = [];
  if (!exactKeys(input, INPUT_KEYS, INPUT_KEYS, "input", errors)) return errors;
  if (input.schema_version !== 2) errors.push("schema_version must equal 2");
  nonEmptyString(input.review_id, "review_id", errors);
  validateDigest(input.candidate_manifest_digest, "candidate_manifest_digest", errors);
  nonEmptyString(input.deployment_id, "deployment_id", errors);
  validateDigest(input.observed_unit_set_sha256, "observed_unit_set_sha256", errors);
  nonEmptyString(input.evidence_set_id, "evidence_set_id", errors);
  nonEmptyString(input.run_id, "run_id", errors);
  if (exactKeys(
    input.observation_window,
    WINDOW_KEYS,
    WINDOW_KEYS,
    "observation_window",
    errors,
  )) {
    for (const field of WINDOW_KEYS) {
      if (typeof input.observation_window[field] !== "string"
        || Number.isNaN(Date.parse(input.observation_window[field]))) {
        errors.push(`observation_window.${field} must be an ISO-8601 timestamp`);
      }
    }
    const started = Date.parse(input.observation_window.started_at);
    const ended = Date.parse(input.observation_window.ended_at);
    if (Number.isFinite(started) && Number.isFinite(ended) && started > ended) {
      errors.push("observation_window.started_at must not be later than ended_at");
    }
    if (Number.isFinite(started) && Number.isFinite(ended)
      && ended - started > 24 * 60 * 60 * 1000) {
      errors.push("observation_window must not exceed 24 hours");
    }
  }
  if (exactKeys(
    input.candidate_components,
    SURFACE_COMPONENTS,
    SURFACE_COMPONENTS,
    "candidate_components",
    errors,
  )) {
    for (const component of SURFACE_COMPONENTS) {
      validateDigest(input.candidate_components[component], `candidate_components.${component}`, errors);
    }
  }
  if (exactKeys(input.owner_decision, OWNER_KEYS, OWNER_KEYS, "owner_decision", errors)) {
    nonEmptyString(input.owner_decision.owner, "owner_decision.owner", errors);
    if (!["accepted", "rejected", "cannot_verify"].includes(input.owner_decision.status)) {
      errors.push("owner_decision.status is invalid");
    }
    nonEmptyString(input.owner_decision.evidence_ref, "owner_decision.evidence_ref", errors);
  }
  validateContentRef(input.owner_evidence, "owner_evidence", errors);
  if (input.owner_evidence?.kind !== "human_decision") {
    errors.push("owner_evidence.kind must equal human_decision");
  }
  if (input.owner_decision?.evidence_ref !== input.owner_evidence?.ref) {
    errors.push("owner_decision.evidence_ref must equal owner_evidence.ref");
  }
  const recordByRef = evidenceRecordMap(input, errors);
  if (recordByRef.has(input.owner_evidence?.ref)) {
    errors.push("owner evidence cannot be reused as typed control evidence");
  }
  if (!isObject(input.dimensions)) {
    errors.push("dimensions must be an object");
  } else {
    for (const dimension of DIMENSIONS) {
      validateDimension(input.dimensions[dimension], dimension, recordByRef, errors);
    }
    for (const key of Object.keys(input.dimensions)) {
      if (!DIMENSIONS.includes(key)) errors.push(`dimensions unknown key: ${key}`);
    }
  }
  const usedRefs = [];
  for (const dimension of DIMENSIONS) {
    for (const control of DIMENSION_CONTROLS[dimension]) {
      const ref = input.dimensions?.[dimension]?.controls?.[control]?.evidence_ref;
      if (typeof ref === "string") usedRefs.push(ref);
    }
  }
  if (new Set(usedRefs).size !== usedRefs.length) {
    errors.push("every integrated control must use a distinct typed evidence record");
  }
  for (const ref of recordByRef.keys()) {
    if (!usedRefs.includes(ref)) errors.push(`typed evidence record is not owned by a control: ${ref}`);
  }
  const integratedFlowControls = [
    ...DIMENSION_CONTROLS["worker-reliability"].map((control) => (
      ["worker-reliability", control, "flow_id"]
    )),
    ["external-integration", "inbound_idempotency_conflict", "flow_id"],
    ["external-integration", "ordering_epoch_sequence_replay", "flow_id"],
    ["external-integration", "retry_dead_letter_manual_replay", "flow_id"],
    ["external-integration", "command_ack_timeout_cancel", "command_flow_id"],
  ];
  const integratedFlowIds = integratedFlowControls.map(([dimension, control, field]) => {
    const ref = input.dimensions?.[dimension]?.controls?.[control]?.evidence_ref;
    return recordByRef.get(ref)?.record?.observations?.[field];
  }).filter((value) => typeof value === "string" && value.trim());
  if (new Set(integratedFlowIds).size > 1) {
    errors.push("worker reliability and external integration controls must bind one end-to-end flow identity");
  }
  const performanceBudgetIdentities = DIMENSION_CONTROLS["performance-resilience"].map((control) => {
    const ref = input.dimensions?.["performance-resilience"]?.controls?.[control]?.evidence_ref;
    const observations = recordByRef.get(ref)?.record?.observations;
    return observations && `${observations.load_profile}:${observations.thresholds_sha256}`;
  }).filter(Boolean);
  if (new Set(performanceBudgetIdentities).size > 1) {
    errors.push("all performance and resilience controls must bind one budget identity");
  }
  return errors;
}

function validateFreshness(input, evaluatedAt) {
  const errors = [];
  const started = Date.parse(input?.observation_window?.started_at);
  const ended = Date.parse(input?.observation_window?.ended_at);
  const evaluated = Date.parse(evaluatedAt);
  if (!Number.isFinite(evaluated)) {
    errors.push("evaluatedAt must be an ISO-8601 timestamp");
    return errors;
  }
  if (Number.isFinite(ended) && ended > evaluated) {
    errors.push("observation_window.ended_at must not be later than fact evaluation");
  }
  if (Number.isFinite(ended) && evaluated - ended > 24 * 60 * 60 * 1000) {
    errors.push("integrated evidence set is older than the 24-hour final-sweep window");
  }
  if (Number.isFinite(started) && evaluated - started > 24 * 60 * 60 * 1000) {
    errors.push("integrated evidence set starts outside the 24-hour final-sweep window");
  }
  for (const evidence of input?.evidence_records || []) {
    const executed = Date.parse(evidence?.record?.executed_at);
    if (Number.isFinite(executed) && Number.isFinite(started) && Number.isFinite(ended)
      && (executed < started || executed > ended)) {
      errors.push(`evidence record executed_at is outside observation_window: ${String(evidence?.record?.evidence_id)}`);
    }
    if (Number.isFinite(executed) && executed > evaluated) {
      errors.push(`evidence record executed_at is later than fact evaluation: ${String(evidence?.record?.evidence_id)}`);
    }
  }
  return errors;
}

function typedEvidence(input, dimension, control) {
  const ref = input?.dimensions?.[dimension]?.controls?.[control]?.evidence_ref;
  return input?.evidence_records?.find((item) => item?.content_ref?.ref === ref);
}

function controlPasses(input, dimension, control) {
  const evidence = typedEvidence(input, dimension, control);
  return Boolean(evidence) && CONTROL_SPECS[dimension][control].passes(evidence.record.observations);
}

function dimensionOutcome(input, dimension, errors, candidateMatches) {
  if (errors.length > 0) {
    return {
      outcome: "cannot_verify",
      reasonCodes: ["INTEGRATED_REVIEW_INVALID"],
      summary: "Integrated application review input or typed control evidence is incomplete, inconsistent, or invalid under the strict release contract.",
    };
  }
  if (!candidateMatches) {
    return {
      outcome: "cannot_verify",
      reasonCodes: ["CANDIDATE_IDENTITY_MISMATCH"],
      summary: "Integrated application evidence was collected for a different candidate manifest and cannot support this release.",
    };
  }
  const value = input.dimensions[dimension];
  const controls = DIMENSION_CONTROLS[dimension];
  if (input.owner_decision.status === "rejected") {
    return {
      outcome: "failed",
      reasonCodes: ["INTEGRATED_OWNER_REJECTED"],
      summary: "The accountable owner explicitly rejected the integrated application evidence for the current candidate.",
    };
  }
  if (value.status === "failed"
    || controls.some((control) => value.controls[control].status === "failed")
    || controls.some((control) => !controlPasses(input, dimension, control))) {
    return {
      outcome: "failed",
      reasonCodes: [`${dimension.toUpperCase().replaceAll("-", "_")}_FAILED`],
      summary: value.summary,
    };
  }
  if (input.owner_decision.status !== "accepted"
    || value.status !== "passed"
    || value.finding_codes.length > 0
    || controls.some((control) => value.controls[control].status !== "passed")) {
    return {
      outcome: "cannot_verify",
      reasonCodes: ["INTEGRATED_REVIEW_UNRESOLVED"],
      summary: "Integrated application evidence, required controls, owner decision, or findings remain unresolved for the current candidate.",
    };
  }
  return { outcome: "passed", reasonCodes: [], summary: value.summary };
}

function collectIntegratedApp(input, options) {
  const { policyBindings, candidateManifestDigest, evaluatedAt } = options;
  const bindings = new Map((policyBindings || []).map((binding) => [binding.dimension, binding]));
  if (DIMENSIONS.some((dimension) => (
    !bindings.has(dimension)
    || bindings.get(dimension).collector_adapter_ref !== "integrated-app-v1@1"
  ))) {
    throw new Error("integrated-app-v1 requires all five integrated application policy bindings");
  }
  const errors = [...validateInput(input), ...validateFreshness(input, evaluatedAt)];
  const candidateMatches = input?.candidate_manifest_digest === candidateManifestDigest;
  const source = sourceFor(
    "release_operability_review",
    `integrated-app:${input?.review_id || "unknown"}`,
    input,
  );
  return DIMENSIONS.map((dimension) => {
    const evaluation = dimensionOutcome(input, dimension, errors, candidateMatches);
    const evidenceRefs = contentAddressedEvidence([
      input?.owner_evidence,
      ...DIMENSION_CONTROLS[dimension].map((control) => (
        typedEvidence(input, dimension, control)?.content_ref
      )),
    ]);
    return createReleaseFact({
      policyBinding: bindings.get(dimension),
      candidateManifestDigest,
      ...evaluation,
      source,
      evidenceRefs,
      evaluatedAt,
    });
  });
}

function evidenceRecordForRef(input, ref) {
  return input?.evidence_records?.find((item) => item?.content_ref?.ref === ref)?.record;
}

module.exports = {
  CONTROL_SPECS,
  DIMENSIONS,
  DIMENSION_COMPONENTS,
  DIMENSION_CONTROLS,
  SURFACE_COMPONENTS,
  collectIntegratedApp,
  evidenceRecordForRef,
  validateInput,
};
