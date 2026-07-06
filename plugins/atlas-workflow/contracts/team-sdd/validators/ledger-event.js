"use strict";

const EVENT_NAMES = new Set([
  "run_started",
  "preflight_clean",
  "preflight_conflict",
  "slice_planned",
  "slice_started",
  "brief_written",
  "path_lease_acquired",
  "implementer_spawned",
  "implementer_done",
  "needs_context",
  "context_answered",
  "implementer_blocked",
  "review_package_written",
  "reviewer_spawned",
  "review_clean",
  "review_failed",
  "cannot_verify_recorded",
  "fix_started",
  "fix_done",
  "fix_progress_stalled",
  "re_review_started",
  "slice_complete",
  "slice_blocked",
  "slice_superseded",
  "slice_abandoned",
  "final_review_started",
  "final_review_clean",
  "final_review_failed",
  "escalated_human",
  "run_complete",
  "run_failed",
]);

const SLICE_EVENTS = new Set([
  "slice_planned",
  "slice_started",
  "brief_written",
  "path_lease_acquired",
  "implementer_spawned",
  "implementer_done",
  "needs_context",
  "context_answered",
  "implementer_blocked",
  "review_package_written",
  "reviewer_spawned",
  "review_clean",
  "review_failed",
  "cannot_verify_recorded",
  "fix_started",
  "fix_done",
  "fix_progress_stalled",
  "re_review_started",
  "slice_complete",
  "slice_blocked",
  "slice_superseded",
  "slice_abandoned",
]);

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function validateLedgerEvent(event) {
  const errors = [];
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return ["event must be an object"];
  }
  if (event.schema_version !== 1) {
    errors.push("schema_version must be 1");
  }
  if (typeof event.event !== "string" || !EVENT_NAMES.has(event.event)) {
    errors.push(`invalid event: ${event.event}`);
  }
  if (typeof event.task_id !== "string" || !ID_PATTERN.test(event.task_id)) {
    errors.push("task_id must be a safe identifier");
  }
  if (typeof event.timestamp !== "string" || event.timestamp.length === 0) {
    errors.push("timestamp must be a non-empty string");
  }
  if (SLICE_EVENTS.has(event.event)) {
    if (typeof event.slice_id !== "string" || !ID_PATTERN.test(event.slice_id)) {
      errors.push(`${event.event} requires a safe slice_id`);
    }
  } else if (event.slice_id !== undefined && (typeof event.slice_id !== "string" || !ID_PATTERN.test(event.slice_id))) {
    errors.push("slice_id must be a safe identifier when present");
  }
  return errors;
}

function isTerminalSliceEvent(eventName) {
  return eventName === "slice_complete" ||
    eventName === "slice_blocked" ||
    eventName === "slice_superseded" ||
    eventName === "slice_abandoned";
}

module.exports = {
  EVENT_NAMES,
  SLICE_EVENTS,
  validateLedgerEvent,
  isTerminalSliceEvent,
};
