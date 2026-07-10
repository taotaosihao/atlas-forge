"use strict";

const {
  ID_PATTERN,
  isObject,
  requireObject,
  requireKeys,
  rejectUnknownKeys,
  expectInteger,
  expectEnum,
  expectStringArray,
  expectSafeId,
} = require("./common");

const V1_KEYS = [
  "schema_version",
  "task_id",
  "verdict",
  "technical_gate_status",
  "business_acceptance_status",
  "required_followups",
];

const V2_KEYS = [
  ...V1_KEYS,
  "blockers",
  "goal_a",
  "goal_b",
];

const V2_REQUIRED_KEYS = [
  ...V1_KEYS,
  "blockers",
];

const GOAL_KEYS = [
  "status",
  "evidence_refs",
  "integration_path_id",
  "integration_mode",
];

const ACCEPTANCE_LEVELS = ["accepted", "conditionally_accepted", "rejected", "blocked"];
const STATUS_LEVELS = ["passed", "failed", "blocked", "not_run"];
const INTEGRATION_MODES = ["real", "approved_simulator", "mock", "synthetic", "not_run"];
const ACCEPTED_INTEGRATION_MODES = ["real", "approved_simulator"];
const BLOCKER_PLACEHOLDER = /^(?:(?:tbd|todo|unspecified|placeholder)(?:\b.*)?|pending|unknown|none(?: identified)?|n\/?a|not[_ -]?applicable|not blocked\b.*|no (?:known )?(?:blockers?|blocking conditions?)\b.*|there (?:are|is) no (?:known )?(?:blockers?|blocking conditions?)\b.*|待定|占位(?:符|文本)?|无|无阻塞(?:项|条件)?|无阻断(?:项|条件)?|没有阻塞(?:项|条件)?|没有阻断(?:项|条件)?|暂无阻塞(?:项|条件)?|暂无阻断(?:项|条件)?|不存在阻塞(?:项|条件)?|不存在阻断(?:项|条件)?|不适用)[.!。！]?$/i;

function validateBusinessVerdict(value, options = {}) {
  const errors = [];
  if (!requireObject(value, errors)) {
    return errors;
  }
  const isV2 = value.schema_version === 2;
  requireKeys(value, isV2 ? V2_REQUIRED_KEYS : V1_KEYS, errors);
  rejectUnknownKeys(value, isV2 ? V2_KEYS : V1_KEYS, errors);
  expectInteger(value, "schema_version", errors);
  if (![1, 2].includes(value.schema_version)) {
    errors.push("schema_version must be 1 or 2");
  }
  if (options.strict === true && value.schema_version !== 2) {
    errors.push("strict business acceptance requires schema_version 2");
  }
  expectSafeId(value, "task_id", errors);
  expectEnum(value, "verdict", ACCEPTANCE_LEVELS, errors);
  expectEnum(value, "technical_gate_status", STATUS_LEVELS, errors);
  expectEnum(value, "business_acceptance_status", STATUS_LEVELS, errors);
  expectStringArray(value, "required_followups", errors);
  if (!isV2) {
    return errors;
  }

  expectStringArray(value, "blockers", errors);
  if (Array.isArray(value.blockers)
    && value.blockers.some((blocker) => typeof blocker !== "string"
      || blocker.trim().length === 0
      || BLOCKER_PLACEHOLDER.test(blocker.trim()))) {
    errors.push("blockers must contain substantive named blocking conditions, not placeholders or no-blocker declarations");
  }

  const hasGoalA = Object.prototype.hasOwnProperty.call(value, "goal_a");
  const hasGoalB = Object.prototype.hasOwnProperty.call(value, "goal_b");
  if (hasGoalA !== hasGoalB) {
    errors.push("goal_a and goal_b must either both be present or both be absent");
  }
  if (hasGoalA) {
    validateGoal(value.goal_a, "goal_a", errors);
    validateGoal(value.goal_b, "goal_b", errors);
    validateGoalPair(value, errors);
  }

  if (["blocked", "rejected"].includes(value.verdict)
    && Array.isArray(value.blockers)
    && value.blockers.length === 0) {
    errors.push("blocked/rejected verdict requires at least one explicit blocker");
  }
  if (["accepted", "conditionally_accepted"].includes(value.verdict)
    && Array.isArray(value.blockers)
    && value.blockers.length > 0) {
    errors.push("accepted/conditionally_accepted verdict must not contain blockers");
  }
  return errors;
}

function validateGoal(goal, label, errors) {
  if (!isObject(goal)) {
    errors.push(`${label} must be an object`);
    return;
  }
  requireKeys(goal, GOAL_KEYS, errors);
  rejectUnknownKeys(goal, GOAL_KEYS, errors);
  expectEnum(goal, "status", STATUS_LEVELS, errors);
  expectStringArray(goal, "evidence_refs", errors);
  if (Array.isArray(goal.evidence_refs)) {
    const seen = new Set();
    goal.evidence_refs.forEach((ref) => {
      if (!ID_PATTERN.test(ref)) {
        errors.push(`${label}.evidence_refs must contain only safe identifiers`);
      }
      if (seen.has(ref)) {
        errors.push(`${label}.evidence_refs must not contain duplicates`);
      }
      seen.add(ref);
    });
  }
  if (goal.integration_path_id !== null
    && (typeof goal.integration_path_id !== "string" || !ID_PATTERN.test(goal.integration_path_id))) {
    errors.push(`${label}.integration_path_id must be a safe identifier or null`);
  }
  expectEnum(goal, "integration_mode", INTEGRATION_MODES, errors);

  if (goal.status === "passed" && Array.isArray(goal.evidence_refs) && goal.evidence_refs.length === 0) {
    errors.push(`${label} passed status requires non-empty evidence_refs`);
  }
  if (goal.status === "passed" && goal.integration_path_id === null) {
    errors.push(`${label} passed status requires integration_path_id`);
  }
  if (goal.status === "passed" && goal.integration_mode === "not_run") {
    errors.push(`${label} passed status cannot use integration_mode not_run`);
  }
  if (goal.status === "not_run") {
    if (Array.isArray(goal.evidence_refs) && goal.evidence_refs.length > 0) {
      errors.push(`${label} not_run status must not contain evidence_refs`);
    }
    if (goal.integration_path_id !== null || goal.integration_mode !== "not_run") {
      errors.push(`${label} not_run status requires null integration_path_id and integration_mode not_run`);
    }
  }
  if (goal.integration_mode === "not_run" && goal.integration_path_id !== null) {
    errors.push(`${label} integration_mode not_run requires null integration_path_id`);
  }
  if (goal.integration_mode !== "not_run" && goal.integration_path_id === null) {
    errors.push(`${label} integration_mode ${goal.integration_mode} requires integration_path_id`);
  }
}

function validateGoalPair(value, errors) {
  const accepted = ["accepted", "conditionally_accepted"].includes(value.verdict);
  if (!accepted || !isObject(value.goal_a) || !isObject(value.goal_b)) {
    return;
  }
  if (value.goal_a.status !== "passed" || value.goal_b.status !== "passed") {
    errors.push("accepted/conditionally_accepted dual-goal verdict requires goal_a and goal_b status passed");
  }
  const sharedEvidence = Array.isArray(value.goal_a.evidence_refs)
    && Array.isArray(value.goal_b.evidence_refs)
    && value.goal_a.evidence_refs.some((ref) => value.goal_b.evidence_refs.includes(ref));
  if (sharedEvidence) {
    errors.push("goal_a and goal_b evidence_refs must not substitute for one another");
  }
  if (value.goal_a.integration_path_id !== value.goal_b.integration_path_id) {
    errors.push("accepted/conditionally_accepted dual-goal verdict requires the same integration_path_id");
  }
  if (value.goal_a.integration_mode !== value.goal_b.integration_mode
    || !ACCEPTED_INTEGRATION_MODES.includes(value.goal_a.integration_mode)) {
    errors.push("accepted/conditionally_accepted dual-goal verdict requires the same real or approved_simulator integration_mode");
  }
}

module.exports = { validateBusinessVerdict };
