"use strict";

const fs = require("fs");
const path = require("path");
const {
  CommandError,
  appendLegacyRuntimeEvent,
  commandOptions,
  oneLine,
} = require("../core/command-runtime");
const { requireTaskFile } = require("../task/repository");
const { timestampSeconds } = require("../task/runtime");

const GATE_METRIC_USAGE =
  'usage: codex-workflow gate-metric <task-id> --gate <gate> --action used|skipped|failed --reason "<reason>" [--duration-ms <n>]';
const GATE_REPORT_USAGE = "usage: codex-workflow gate-report [--days <n>]";
const VALID_GATES = new Set([
  "ready",
  "route-decision",
  "consensus",
  "handoff-envelope",
  "curated-packet",
  "doctor",
  "self-test",
  "verify",
  "checkpoint",
  "source-snapshot",
  "prompt-bundle",
  "trace-promote",
  "multica-feedback",
  "feedback-cycle",
  "lesson-candidate",
  "learning-decision",
]);
const VALID_ACTIONS = new Set(["used", "skipped", "failed"]);

function gateMetricsFile(paths) {
  return path.join(paths.stateDir, "gate-metrics.jsonl");
}

function parseGateMetricArgs(argv) {
  if (argv.length === 0) {
    throw new CommandError(GATE_METRIC_USAGE);
  }
  const result = {
    action: "",
    durationMs: "",
    gate: "",
    reason: "",
    taskId: argv[0],
  };
  const flags = {
    "--gate": "gate",
    "--action": "action",
    "--reason": "reason",
    "--duration-ms": "durationMs",
  };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (Object.hasOwn(flags, argument)) {
      if (index + 1 >= argv.length) {
        throw new CommandError(GATE_METRIC_USAGE);
      }
      result[flags[argument]] = argv[++index];
      continue;
    }
    let matched = false;
    for (const [flag, field] of Object.entries(flags)) {
      if (argument.startsWith(`${flag}=`)) {
        result[field] = argument.slice(flag.length + 1);
        matched = true;
        break;
      }
    }
    if (!matched) {
      throw new CommandError(GATE_METRIC_USAGE);
    }
  }
  for (const [field, flag] of [
    ["gate", "--gate"],
    ["action", "--action"],
    ["reason", "--reason"],
  ]) {
    if (!result[field]) {
      throw new CommandError(`missing required argument: ${flag}`);
    }
  }
  return result;
}

function normalizeMetric(parsed) {
  const taskId = oneLine(parsed.taskId, "task id", { allowEmpty: false });
  const gate = oneLine(parsed.gate, "gate", { allowEmpty: false });
  const action = oneLine(parsed.action, "action", { allowEmpty: false });
  const reason = oneLine(parsed.reason, "reason", { allowEmpty: false });
  if (!VALID_GATES.has(gate)) {
    throw new CommandError(`invalid gate: ${gate}`);
  }
  if (!VALID_ACTIONS.has(action)) {
    throw new CommandError(`invalid action: ${action}`);
  }
  let durationMs = null;
  if (parsed.durationMs) {
    if (!/^\d+$/.test(parsed.durationMs)) {
      throw new CommandError(`invalid duration-ms: ${parsed.durationMs}`);
    }
    durationMs = Number(parsed.durationMs);
  }
  return { action, durationMs, gate, reason, taskId };
}

function serializeMetric(row) {
  return `{${Object.entries(row)
    .map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`)
    .join(", ")}}`;
}

function runGateMetric(parsed, options = {}) {
  const { clock, paths } = commandOptions(options);
  requireTaskFile(paths.tasksDir, parsed.taskId);
  const metric = normalizeMetric(parsed);
  const metricsFile = gateMetricsFile(paths);
  const row = {
    created_at: timestampSeconds(clock),
    task_id: metric.taskId,
    gate: metric.gate,
    action: metric.action,
    reason: metric.reason,
    duration_ms: metric.durationMs,
  };
  fs.mkdirSync(path.dirname(metricsFile), { recursive: true });
  fs.appendFileSync(metricsFile, `${serializeMetric(row)}\n`, "utf8");
  appendLegacyRuntimeEvent(
    paths,
    parsed.taskId,
    "gate-metric",
    `${metric.gate} ${metric.action}`,
    clock,
  );
  return {
    exitCode: 0,
    lines: [
      `task_id: ${parsed.taskId}`,
      `metrics: ${metricsFile}`,
      `gate: ${metric.gate}`,
      `action: ${metric.action}`,
      `duration_ms: ${metric.durationMs === null ? "-" : metric.durationMs}`,
    ],
    row,
  };
}

function parseGateReportArgs(argv) {
  let days = "30";
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--days") {
      if (index + 1 >= argv.length) {
        throw new CommandError(GATE_REPORT_USAGE);
      }
      days = argv[++index];
    } else if (argument.startsWith("--days=")) {
      days = argument.slice("--days=".length);
    } else {
      throw new CommandError(GATE_REPORT_USAGE);
    }
  }
  if (!/^[1-9]\d*$/.test(days)) {
    throw new CommandError(`invalid days: ${days}`);
  }
  return { days: Number(days) };
}

function readGateRows(paths, days, clock = () => new Date()) {
  const file = gateMetricsFile(paths);
  if (!fs.existsSync(file)) {
    return [];
  }
  const nowValue = clock();
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  const rows = [];
  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    if (!raw.trim()) {
      continue;
    }
    let row;
    try {
      row = JSON.parse(raw);
    } catch {
      continue;
    }
    const created = Date.parse(row.created_at || "");
    if (!Number.isNaN(created) && created >= cutoff) {
      rows.push(row);
    }
  }
  return rows;
}

function medianInteger(values) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return Math.trunc((sorted[middle - 1] + sorted[middle]) / 2);
}

function renderGateReport(rows, days) {
  const groups = new Map();
  for (const row of rows) {
    const gate = row.gate ?? "-";
    if (!groups.has(gate)) {
      groups.set(gate, []);
    }
    groups.get(gate).push(row);
  }
  const lines = [
    "# Gate Report",
    "",
    `Window: ${days} day(s)`,
    `Events: ${rows.length}`,
    "",
    "| Gate | Used | Skipped | Failed | Median Duration ms |",
    "| --- | ---: | ---: | ---: | ---: |",
  ];
  for (const gate of [...groups.keys()].sort()) {
    const group = groups.get(gate);
    const count = (action) => group.filter((row) => row.action === action).length;
    const durations = group
      .map((row) => row.duration_ms)
      .filter((value) => Number.isInteger(value));
    lines.push(
      `| ${gate} | ${count("used")} | ${count("skipped")} | ${count("failed")} | ${medianInteger(durations)} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function runGateReport(parsed, options = {}) {
  const { clock, paths } = commandOptions(options);
  return {
    exitCode: 0,
    output: renderGateReport(readGateRows(paths, parsed.days, clock), parsed.days),
  };
}

module.exports = {
  GATE_METRIC_USAGE,
  GATE_REPORT_USAGE,
  VALID_ACTIONS,
  VALID_GATES,
  gateMetricsFile,
  medianInteger,
  normalizeMetric,
  parseGateMetricArgs,
  parseGateReportArgs,
  readGateRows,
  renderGateReport,
  runGateMetric,
  runGateReport,
  serializeMetric,
};
