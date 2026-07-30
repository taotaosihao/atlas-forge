"use strict";

const { validateBusinessAcceptanceReport } = require("../../team-sdd/validators/business-acceptance-report");
const { validateBusinessVerdict } = require("../../team-sdd/validators/business-verdict");
const {
  contentAddressedEvidence,
  createReleaseFact,
  isObject,
  sourceFor,
  validateContentRef,
  validateDigest,
} = require("../validators/evidence");

const INPUT_KEYS = [
  "schema_version", "candidate_manifest_digest", "verdict", "acceptance_report", "evidence_refs",
];

function inputErrors(input) {
  const errors = [];
  if (!isObject(input)) return ["input must be an object"];
  for (const key of INPUT_KEYS) {
    if (!Object.hasOwn(input, key)) errors.push(`missing required key: ${key}`);
  }
  for (const key of Object.keys(input)) {
    if (!INPUT_KEYS.includes(key)) errors.push(`unknown key: ${key}`);
  }
  if (input.schema_version !== 1) errors.push("schema_version must equal 1");
  validateDigest(input.candidate_manifest_digest, "candidate_manifest_digest", errors);
  errors.push(...validateBusinessVerdict(input.verdict, { strict: true }).map((error) => `verdict: ${error}`));
  errors.push(...validateBusinessAcceptanceReport(input.acceptance_report).map((error) => `acceptance_report: ${error}`));
  if (input.verdict?.task_id !== input.acceptance_report?.task_id) {
    errors.push("verdict and acceptance_report task_id must match");
  }
  if (!Array.isArray(input.evidence_refs)) {
    errors.push("evidence_refs must be an array");
  } else {
    input.evidence_refs.forEach((ref, index) => validateContentRef(ref, `evidence_refs[${index}]`, errors));
    const refs = input.evidence_refs.map((item) => item?.ref).filter(Boolean);
    if (new Set(refs).size !== refs.length) errors.push("evidence_refs must not contain duplicate refs");
    const knownRefs = new Set(refs);
    for (const goalName of ["goal_a", "goal_b"]) {
      if (!isObject(input.verdict?.[goalName])) {
        errors.push(`verdict.${goalName} is required for product-release acceptance`);
        continue;
      }
      for (const ref of input.verdict[goalName].evidence_refs || []) {
        if (!knownRefs.has(ref)) errors.push(`verdict.${goalName}.evidence_refs contains unknown ref: ${ref}`);
      }
    }
  }
  return errors;
}

function collectBusinessAcceptance(input, options) {
  const { policyBinding, candidateManifestDigest, evaluatedAt } = options;
  if (policyBinding.dimension !== "critical-journey"
    || policyBinding.collector_adapter_ref !== "business-acceptance-v2@2") {
    throw new Error("business-acceptance-v2 requires the critical-journey policy binding");
  }
  const errors = inputErrors(input);
  const source = sourceFor(
    "business_acceptance",
    `business-acceptance:${input?.verdict?.task_id || "unknown"}`,
    input,
  );
  const candidateMatches = input?.candidate_manifest_digest === candidateManifestDigest;
  const verdict = input?.verdict;
  const report = input?.acceptance_report;
  let outcome = "cannot_verify";
  let reasonCodes = ["BUSINESS_SOURCE_INVALID"];
  let summary = "Business acceptance input is incomplete, inconsistent, or not valid under the strict v2 contract.";

  if (errors.length === 0 && !candidateMatches) {
    reasonCodes = ["CANDIDATE_IDENTITY_MISMATCH"];
    summary = "Business acceptance was collected for a different candidate manifest and cannot support this release.";
  } else if (errors.length === 0) {
    const scenarioResults = report.scenario_results;
    const scenarioFailed = scenarioResults.some((result) => (
      result.business_result === "failed" || result.technical_gate_result === "failed"
    ));
    const coherentAccepted = verdict.verdict === "accepted"
      && verdict.technical_gate_status === "passed"
      && verdict.business_acceptance_status === "passed"
      && verdict.required_followups.length === 0
      && verdict.blockers.length === 0
      && verdict.goal_a.status === "passed"
      && verdict.goal_b.status === "passed"
      && verdict.goal_a.integration_mode === "real"
      && verdict.goal_b.integration_mode === "real"
      && report.rating.level === "accepted"
      && report.rating.blocking_technical_gate_failed === false
      && report.technical_gate_summary.blocking_failure_count === 0
      && report.technical_gate_summary.failed_gates.length === 0
      && report.open_deviations.length === 0
      && scenarioResults.length > 0
      && scenarioResults.every((result) => (
        result.business_result === "passed" && result.technical_gate_result === "passed"
      ))
      && input.evidence_refs.length > 0;
    if (coherentAccepted) {
      outcome = "passed";
      reasonCodes = [];
      summary = "Strict Business Acceptance v2 confirms at least one complete critical journey with passing business and technical outcomes.";
    } else if (verdict.verdict === "rejected" || report.rating.level === "rejected" || scenarioFailed) {
      outcome = "failed";
      reasonCodes = ["CRITICAL_JOURNEY_REJECTED"];
      summary = "Business Acceptance contains a known rejected or failed critical journey for the current candidate.";
    } else if (verdict.verdict === "conditionally_accepted" || report.rating.level === "conditionally_accepted") {
      reasonCodes = ["CONDITIONAL_ACCEPTANCE"];
      summary = "Conditional Business Acceptance cannot satisfy a non-waivable product-release critical-journey requirement.";
    } else {
      reasonCodes = ["BUSINESS_ACCEPTANCE_UNRESOLVED"];
      summary = "Business Acceptance is blocked, not run, incomplete, or lacks stable evidence for an unconditional release fact.";
    }
  }

  return createReleaseFact({
    policyBinding,
    candidateManifestDigest,
    outcome,
    reasonCodes,
    summary,
    source,
    evidenceRefs: contentAddressedEvidence(input?.evidence_refs),
    evaluatedAt,
  });
}

module.exports = { collectBusinessAcceptance, inputErrors };
