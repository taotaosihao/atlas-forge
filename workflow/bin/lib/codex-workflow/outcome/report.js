"use strict";

const { readEventRows } = require("../core/event-store");
const { resolvePaths } = require("../core/paths");
const { staleTasks } = require("../task/lifecycle");
const { listTaskIds, taskFile, validateTaskFile } = require("../task/repository");
const { taskRuntimeFile } = require("../task/runtime");
const { OUTCOME_KINDS, outcomeKindFromEvent } = require("./schema");

function timestampValue(clock) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("clock must return a valid date");
  }
  return date;
}

function isTaskEvent(row, taskId, kind) {
  return Boolean(
    row &&
      row.schema_version === 1 &&
      typeof row.event_id === "string" &&
      row.event_id &&
      row.task_id === taskId &&
      row.kind === kind &&
      typeof row.occurred_at === "string" &&
      !Number.isNaN(Date.parse(row.occurred_at)) &&
      row.data &&
      typeof row.data === "object" &&
      !Array.isArray(row.data),
  );
}

function earliestEvent(rows, predicate) {
  return rows
    .filter(predicate)
    .sort((left, right) => Date.parse(left.occurred_at) - Date.parse(right.occurred_at))[0];
}

function median(values) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function taskOutcome(rows, taskId, kind, startedAt) {
  const events = rows
    .filter((row) => row.task_id === taskId && outcomeKindFromEvent(row) === kind)
    .sort((left, right) => Date.parse(left.occurred_at) - Date.parse(right.occurred_at));
  const firstMarker = events[0];
  if (firstMarker && firstMarker.data.applicable === false) {
    return {
      status: "not-applicable",
      occurred_at: firstMarker.occurred_at,
      evidence: firstMarker.data.evidence,
      reason: firstMarker.data.not_applicable_reason,
    };
  }
  if (!startedAt) {
    return { status: "unknown" };
  }
  const startedMs = Date.parse(startedAt);
  const event = earliestEvent(
    events,
    (row) =>
      row.data.applicable === true &&
      Date.parse(row.occurred_at) >= startedMs,
  );
  if (!event) {
    return { status: "unknown" };
  }
  return {
    status: "known",
    occurred_at: event.occurred_at,
    evidence: event.data.evidence,
    latency_ms: Date.parse(event.occurred_at) - startedMs,
  };
}

function buildOutcomeReport({
  days = 30,
  staleDays = 7,
  environment = process.env,
  paths = resolvePaths(environment),
  clock = () => new Date(),
} = {}) {
  const now = timestampValue(clock);
  const nowMs = now.getTime();
  const cutoffMs = nowMs - Number(days) * 24 * 60 * 60 * 1000;
  const tasks = [];
  let historicalUnknownCount = 0;
  let outsideWindowCount = 0;

  for (const taskId of listTaskIds(paths.tasksDir)) {
    const { task } = validateTaskFile(taskFile(paths.tasksDir, taskId));
    const rows = readEventRows(taskRuntimeFile(paths, taskId));
    const created = earliestEvent(rows, (row) => isTaskEvent(row, taskId, "task.created"));
    if (!created) {
      historicalUnknownCount += 1;
      continue;
    }
    const createdMs = Date.parse(created.occurred_at);
    if (createdMs < cutoffMs || createdMs > nowMs) {
      outsideWindowCount += 1;
      continue;
    }

    const started = earliestEvent(
      rows,
      (row) =>
        isTaskEvent(row, taskId, "task.started") &&
        Date.parse(row.occurred_at) >= createdMs,
    );
    const startedAt = started ? started.occurred_at : null;
    const outcomes = Object.fromEntries(
      OUTCOME_KINDS.map((kind) => [kind, taskOutcome(rows, taskId, kind, startedAt)]),
    );
    tasks.push({
      task_id: task.id,
      title: task.title,
      status: task.status,
      created_at: created.occurred_at,
      started_at: startedAt,
      outcomes,
    });
  }

  const summaries = OUTCOME_KINDS.map((kind) => {
    const values = tasks.map((task) => task.outcomes[kind]);
    const known = values.filter((value) => value.status === "known");
    const notApplicable = values.filter((value) => value.status === "not-applicable");
    const applicableCount = values.length - notApplicable.length;
    const knownCount = known.length;
    return {
      kind,
      applicable_count: applicableCount,
      known_count: knownCount,
      unknown_count: applicableCount - knownCount,
      not_applicable_count: notApplicable.length,
      coverage: applicableCount === 0 ? null : knownCount / applicableCount,
      median_ms: median(known.map((value) => value.latency_ms)),
    };
  });

  return {
    schema_version: 1,
    generated_at: now.toISOString(),
    window_days: Number(days),
    stale_threshold_days: Number(staleDays),
    prospective_task_count: tasks.length,
    outside_window_task_count: outsideWindowCount,
    historical_unknown_count: historicalUnknownCount,
    open_stale_task_count: staleTasks(staleDays, { clock, environment, paths }).length,
    outcomes: summaries,
    tasks,
  };
}

function formatCoverage(value) {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function formatMedian(value) {
  return value === null ? "unknown" : `${value} ms`;
}

function formatTaskOutcome(value) {
  if (value.status === "known") {
    return `known (${value.latency_ms} ms)`;
  }
  return value.status;
}

function renderOutcomeMarkdown(report) {
  const lines = [
    "# Outcome Latency Report",
    "",
    `generated_at: ${report.generated_at}`,
    `window_days: ${report.window_days}`,
    `prospective_tasks: ${report.prospective_task_count}`,
    `outside_window_tasks: ${report.outside_window_task_count}`,
    `historical_unknown_tasks: ${report.historical_unknown_count}`,
    `open_stale_tasks: ${report.open_stale_task_count}`,
    `stale_threshold_days: ${report.stale_threshold_days}`,
    "",
    "| Outcome | Applicable | Known | Unknown | Not Applicable | Coverage | Median Raw Wall Time |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const outcome of report.outcomes) {
    lines.push(
      `| ${outcome.kind} | ${outcome.applicable_count} | ${outcome.known_count} | ${outcome.unknown_count} | ${outcome.not_applicable_count} | ${formatCoverage(outcome.coverage)} | ${formatMedian(outcome.median_ms)} |`,
    );
  }

  lines.push("", "## Prospective Task Outcomes", "");
  if (report.tasks.length === 0) {
    lines.push("- No prospective tasks in the selected structured-event window.", "");
    return `${lines.join("\n")}\n`;
  }
  lines.push(
    "| Task | Started | First Code | Operable Flow | Clean Review |",
    "| --- | --- | --- | --- | --- |",
  );
  for (const task of report.tasks) {
    lines.push(
      `| ${task.task_id} | ${task.started_at || "unknown"} | ${formatTaskOutcome(task.outcomes["first-code"])} | ${formatTaskOutcome(task.outcomes["operable-flow"])} | ${formatTaskOutcome(task.outcomes["clean-review"])} |`,
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

module.exports = {
  buildOutcomeReport,
  earliestEvent,
  formatCoverage,
  median,
  renderOutcomeMarkdown,
  taskOutcome,
};
