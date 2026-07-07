"use strict";

const {
  isObject,
  requireObject,
  requireKeys,
  rejectUnknownKeys,
  expectString,
  expectInteger,
  expectEnum,
  expectStringArray,
  expectObjectArray,
  expectSafeId,
} = require("./common");

const KEYS = [
  "schema_version",
  "task_id",
  "scenario_results",
  "technical_gate_summary",
  "rating",
  "open_deviations",
];

const SCENARIO_RESULT_KEYS = [
  "scenario_id",
  "business_result",
  "technical_gate_result",
  "score",
];

const TECHNICAL_GATE_SUMMARY_KEYS = [
  "blocking_failure_count",
  "failed_gates",
];

const RATING_KEYS = [
  "total",
  "level",
  "blocking_technical_gate_failed",
];

const RESULT_LEVELS = ["passed", "failed", "blocked", "not_run"];
const ACCEPTANCE_LEVELS = ["accepted", "conditionally_accepted", "rejected", "blocked"];

function validateBusinessAcceptanceReport(value) {
  const errors = [];
  if (!requireObject(value, errors)) {
    return errors;
  }
  requireKeys(value, KEYS, errors);
  rejectUnknownKeys(value, KEYS, errors);
  expectInteger(value, "schema_version", errors);
  if (value.schema_version !== 1) {
    errors.push("schema_version must be 1");
  }
  expectSafeId(value, "task_id", errors);
  expectObjectArray(value, "scenario_results", errors);
  if (Array.isArray(value.scenario_results)) {
    value.scenario_results.forEach((result, index) => validateScenarioResult(result, index, errors));
  }
  validateTechnicalGateSummary(value.technical_gate_summary, errors);
  validateRating(value.rating, errors);
  expectStringArray(value, "open_deviations", errors);
  return errors;
}

function validateScenarioResult(result, index, errors) {
  if (!requireObject(result, errors)) {
    errors.push(`scenario_results[${index}] must be an object`);
    return;
  }
  requireKeys(result, SCENARIO_RESULT_KEYS, errors);
  rejectUnknownKeys(result, SCENARIO_RESULT_KEYS, errors);
  expectSafeId(result, "scenario_id", errors);
  expectEnum(result, "business_result", RESULT_LEVELS, errors);
  expectEnum(result, "technical_gate_result", RESULT_LEVELS, errors);
  expectInteger(result, "score", errors);
  if (Number.isInteger(result.score) && (result.score < 0 || result.score > 100)) {
    errors.push("scenario_results[].score must be between 0 and 100");
  }
}

function validateTechnicalGateSummary(summary, errors) {
  if (!isObject(summary)) {
    errors.push("technical_gate_summary must be an object");
    return;
  }
  requireKeys(summary, TECHNICAL_GATE_SUMMARY_KEYS, errors);
  rejectUnknownKeys(summary, TECHNICAL_GATE_SUMMARY_KEYS, errors);
  expectInteger(summary, "blocking_failure_count", errors);
  if (Number.isInteger(summary.blocking_failure_count) && summary.blocking_failure_count < 0) {
    errors.push("technical_gate_summary.blocking_failure_count must be non-negative");
  }
  expectStringArray(summary, "failed_gates", errors);
}

function validateRating(rating, errors) {
  if (!isObject(rating)) {
    errors.push("rating must be an object");
    return;
  }
  requireKeys(rating, RATING_KEYS, errors);
  rejectUnknownKeys(rating, RATING_KEYS, errors);
  expectInteger(rating, "total", errors);
  if (Number.isInteger(rating.total) && (rating.total < 0 || rating.total > 100)) {
    errors.push("rating.total must be between 0 and 100");
  }
  expectEnum(rating, "level", ACCEPTANCE_LEVELS, errors);
  if (typeof rating.blocking_technical_gate_failed !== "boolean") {
    errors.push("rating.blocking_technical_gate_failed must be a boolean");
  }
}

module.exports = { validateBusinessAcceptanceReport };
