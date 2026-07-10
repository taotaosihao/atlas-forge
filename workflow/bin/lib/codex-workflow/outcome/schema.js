"use strict";

const OUTCOME_KINDS = ["first-code", "operable-flow", "clean-review"];
const OUTCOME_KIND_SET = new Set(OUTCOME_KINDS);

function outcomeEventKind(kind) {
  return `outcome.${kind}`;
}

function outcomeKindFromEvent(row) {
  if (!row || row.schema_version !== 1 || typeof row.kind !== "string") {
    return "";
  }
  const prefix = "outcome.";
  if (!row.kind.startsWith(prefix)) {
    return "";
  }
  const kind = row.kind.slice(prefix.length);
  if (!OUTCOME_KIND_SET.has(kind)) {
    return "";
  }
  if (
    typeof row.event_id !== "string" ||
    !row.event_id ||
    typeof row.task_id !== "string" ||
    !row.task_id ||
    typeof row.occurred_at !== "string" ||
    Number.isNaN(Date.parse(row.occurred_at)) ||
    !row.data ||
    typeof row.data !== "object" ||
    typeof row.data.evidence !== "string" ||
    !row.data.evidence.trim() ||
    /[\n\r\t]/.test(row.data.evidence) ||
    typeof row.data.applicable !== "boolean"
  ) {
    return "";
  }
  if (
    row.data.applicable === false &&
    (typeof row.data.not_applicable_reason !== "string" ||
      !row.data.not_applicable_reason.trim() ||
      /[\n\r\t]/.test(row.data.not_applicable_reason))
  ) {
    return "";
  }
  return kind;
}

module.exports = {
  OUTCOME_KINDS,
  OUTCOME_KIND_SET,
  outcomeEventKind,
  outcomeKindFromEvent,
};
