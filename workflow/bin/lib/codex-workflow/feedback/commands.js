"use strict";

const fs = require("fs");
const path = require("path");
const {
  CommandError,
  appendLegacyRuntimeEvent,
  artifactFile,
  commandOptions,
  expandUserPath,
  oneLine,
  prepareTaskCommand,
  updateTaskCommand,
} = require("../core/command-runtime");
const { relativeToCodeHome } = require("../core/paths");
const { timestampSeconds } = require("../task/runtime");
const { evaluateSddAdmission } = require("./sdd-admission");

const TRACE_USAGE =
  'usage: codex-workflow trace-promote <task-id> [--from latest|<verification-record>] --type regression|lesson|workflow-rule --reason "<reason>" [--owner atlas|multica|project]';
const FEEDBACK_USAGE =
  'usage: codex-workflow feedback-cycle <task-id> --source sdd-review|verify|design-review|multica-review|multica-e2e|user --finding "<summary>" --severity blocking|high|medium|low --classification implementation-bug|spec-gap|acceptance-gap|env-blocker|prd-conflict|scope-change --route repair|clarify|new-prd|blocker|acceptance-update [--affected-row <id>]... [--evidence <path-or-url>]... [--sdd-slice <id> --finding-id <id> --verdict-digest <sha256> --goal-ref <sha256>]';
const LESSON_USAGE =
  'usage: codex-workflow lesson-candidate <task-id> --trigger repeated-failure|remote|ui|data-contract|multica-feedback|manual --lesson "<candidate>" [--evidence <path-or-url>]...';
const LEARNING_DECISION_USAGE =
  'usage: codex-workflow learning-decision <task-id> --decision promote|skip --reason "<reason>" [--candidate <id>]...';

function parseOptions(argv, configuration) {
  if (argv.length === 0) {
    throw new CommandError(configuration.usage);
  }
  const result = {
    ...configuration.defaults,
    taskId: argv[0],
  };
  for (const field of Object.values(configuration.repeatFlags || {})) {
    result[field] = [];
  }
  const scalarFlags = configuration.scalarFlags || {};
  const repeatFlags = configuration.repeatFlags || {};
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (Object.hasOwn(scalarFlags, argument) || Object.hasOwn(repeatFlags, argument)) {
      if (index + 1 >= argv.length) {
        throw new CommandError(configuration.usage);
      }
      const value = argv[++index];
      if (Object.hasOwn(scalarFlags, argument)) {
        result[scalarFlags[argument]] = value;
      } else {
        result[repeatFlags[argument]].push(value);
      }
      continue;
    }
    let matched = false;
    for (const [flag, field] of Object.entries(scalarFlags)) {
      if (argument.startsWith(`${flag}=`)) {
        result[field] = argument.slice(flag.length + 1);
        matched = true;
        break;
      }
    }
    if (!matched) {
      for (const [flag, field] of Object.entries(repeatFlags)) {
        if (argument.startsWith(`${flag}=`)) {
          result[field].push(argument.slice(flag.length + 1));
          matched = true;
          break;
        }
      }
    }
    if (!matched) {
      throw new CommandError(configuration.usage);
    }
  }
  for (const [field, flag] of configuration.required || []) {
    if (!result[field]) {
      throw new CommandError(`missing required argument: ${flag}`);
    }
  }
  return result;
}

function stringifyLikePython(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stringifyLikePython).join(", ")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .map(([key, item]) => `${JSON.stringify(key)}: ${stringifyLikePython(item)}`)
      .join(", ")}}`;
  }
  return JSON.stringify(value);
}

function appendLedger(file, event) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${stringifyLikePython(event)}\n`, "utf8");
}

function timestampCandidate(prefix, recordedAt) {
  return `${prefix}${recordedAt.replace(/[-:TZ]/g, "")}`;
}

function splitLines(text) {
  const lines = text.split(/\r\n|\n|\r/);
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}

function parseTraceArgs(argv) {
  return parseOptions(argv, {
    usage: TRACE_USAGE,
    defaults: { sourceRef: "latest", traceType: "", reason: "", owner: "atlas" },
    scalarFlags: {
      "--from": "sourceRef",
      "--type": "traceType",
      "--reason": "reason",
      "--owner": "owner",
    },
    required: [
      ["traceType", "--type"],
      ["reason", "--reason"],
    ],
  });
}

function latestFailedVerification(paths, taskId) {
  const directory = artifactFile(paths, taskId, "verification");
  let candidates = [];
  try {
    candidates = fs
      .readdirSync(directory)
      .filter((name) => name.endsWith(".md"))
      .sort()
      .map((name) => path.join(directory, name));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
  const failed = candidates.filter((file) => {
    const text = fs.readFileSync(file, "utf8");
    return /^- verdict: failed$/m.test(text) || /^- exit_code: (?!0$).+/m.test(text);
  });
  if (failed.length === 0) {
    throw new CommandError("no failed verification record found for --from latest");
  }
  return failed.at(-1);
}

function traceSource(paths, taskId, sourceRef, cwd, environment) {
  if (sourceRef === "latest") {
    return latestFailedVerification(paths, taskId);
  }
  if (!sourceRef) {
    throw new CommandError("missing --from");
  }
  const expanded = expandUserPath(sourceRef, environment);
  const source = path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded);
  try {
    if (fs.statSync(source).isFile()) {
      return source;
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
  throw new CommandError(`missing trace source: ${sourceRef}`);
}

function tracePreview(text) {
  let preview = splitLines(text).slice(0, 120).join("\n");
  if (preview.length > 6000) {
    preview = `${preview.slice(0, 6000).trimEnd()}\n... (truncated)`;
  }
  return preview;
}

function runTracePromotion(parsed, options = {}) {
  const { clock, cwd, environment, paths } = commandOptions(options);
  prepareTaskCommand(paths, parsed.taskId, clock);
  const traceType = oneLine(parsed.traceType, "type", { allowEmpty: false });
  const reason = oneLine(parsed.reason, "reason", { allowEmpty: false });
  const owner = oneLine(parsed.owner || "atlas", "owner", { allowEmpty: false });
  if (!new Set(["regression", "lesson", "workflow-rule"]).has(traceType)) {
    throw new CommandError(`invalid type: ${traceType}`);
  }
  if (!new Set(["atlas", "multica", "project"]).has(owner)) {
    throw new CommandError(`invalid owner: ${owner}`);
  }
  const source = traceSource(paths, parsed.taskId, parsed.sourceRef, cwd, environment);
  const recordedAt = timestampSeconds(clock);
  const candidateId = timestampCandidate("T", recordedAt);
  const traceFile = artifactFile(paths, parsed.taskId, "trace-candidates.md");
  if (!fs.existsSync(traceFile)) {
    fs.writeFileSync(traceFile, "# Trace Candidates\n\n", "utf8");
  }
  fs.appendFileSync(
    traceFile,
    [
      `## ${candidateId}`,
      "",
      `- Recorded: ${recordedAt}`,
      `- Type: ${traceType}`,
      `- Owner: ${owner}`,
      `- Source: \`${source}\``,
      `- Reason: ${reason}`,
      "",
      "### Trace Preview",
      "",
      "```text",
      tracePreview(fs.readFileSync(source, "utf8")),
      "```",
      "",
    ].join("\n"),
    "utf8",
  );

  let regression = "-";
  if (traceType === "regression") {
    const regressionDir = artifactFile(paths, parsed.taskId, "regressions");
    fs.mkdirSync(regressionDir, { recursive: true });
    regression = path.join(regressionDir, `${candidateId}.md`);
    fs.writeFileSync(
      regression,
      [
        `# Regression Candidate ${candidateId}`,
        "",
        `Source: \`${source}\``,
        `Reason: ${reason}`,
        "",
        "## Reproduction",
        "",
        "Use the source trace above to build a project-specific regression test or checklist.",
        "",
      ].join("\n"),
      "utf8",
    );
  }
  appendLedger(artifactFile(paths, parsed.taskId, "ledger.jsonl"), {
    kind: "trace-promote",
    created_at: recordedAt,
    candidate_id: candidateId,
    type: traceType,
    owner,
    source,
    reason,
    regression,
  });
  updateTaskCommand(
    paths,
    parsed.taskId,
    {
      trace_candidates: relativeToCodeHome(paths, traceFile),
      latest_trace_candidate: candidateId,
    },
    {
      "trace.candidates": relativeToCodeHome(paths, traceFile),
      "trace.latest_candidate": candidateId,
      "trace.latest_source": source,
      "trace.latest_type": traceType,
    },
    clock,
  );
  appendLegacyRuntimeEvent(
    paths,
    parsed.taskId,
    "trace-promote",
    `${candidateId} ${traceType}`,
    clock,
  );
  return {
    exitCode: 0,
    lines: [
      `task_id: ${parsed.taskId}`,
      `artifact: ${traceFile}`,
      `candidate: ${candidateId}`,
      `source: ${source}`,
      `type: ${traceType}`,
      `owner: ${owner}`,
      `regression: ${regression}`,
    ],
  };
}

function parseFeedbackArgs(argv) {
  return parseOptions(argv, {
    usage: FEEDBACK_USAGE,
    defaults: {
      source: "",
      finding: "",
      severity: "",
      classification: "",
      route: "",
      sddSlice: "",
      findingId: "",
      verdictDigest: "",
      goalRef: "",
    },
    scalarFlags: {
      "--source": "source",
      "--finding": "finding",
      "--severity": "severity",
      "--classification": "classification",
      "--route": "route",
      "--sdd-slice": "sddSlice",
      "--finding-id": "findingId",
      "--verdict-digest": "verdictDigest",
      "--goal-ref": "goalRef",
    },
    repeatFlags: { "--affected-row": "rows", "--evidence": "evidence" },
    required: [
      ["source", "--source"],
      ["finding", "--finding"],
      ["severity", "--severity"],
      ["classification", "--classification"],
      ["route", "--route"],
    ],
  });
}

function feedbackValues(parsed) {
  const values = {
    source: oneLine(parsed.source, "source", { allowEmpty: false }),
    finding: oneLine(parsed.finding, "finding", { allowEmpty: false }),
    severity: oneLine(parsed.severity, "severity", { allowEmpty: false }),
    classification: oneLine(parsed.classification, "classification", {
      allowEmpty: false,
    }),
    route: oneLine(parsed.route, "route", { allowEmpty: false }),
    rows: parsed.rows.map((item) => oneLine(item, "affected row", { allowEmpty: false })),
    evidence: parsed.evidence.map((item) =>
      oneLine(item, "evidence", { allowEmpty: false }),
    ),
    admissionLocator: {
      sliceId: oneLine(parsed.sddSlice || "", "SDD slice"),
      findingId: oneLine(parsed.findingId || "", "finding id"),
      verdictDigest: oneLine(parsed.verdictDigest || "", "verdict digest"),
      goalRef: oneLine(parsed.goalRef || "", "goal ref"),
    },
  };
  const enums = [
    ["source", ["sdd-review", "verify", "design-review", "multica-review", "multica-e2e", "user"]],
    ["severity", ["blocking", "high", "medium", "low"]],
    [
      "classification",
      [
        "implementation-bug",
        "spec-gap",
        "acceptance-gap",
        "env-blocker",
        "prd-conflict",
        "scope-change",
      ],
    ],
    ["route", ["repair", "clarify", "new-prd", "blocker", "acceptance-update"]],
  ];
  for (const [field, allowed] of enums) {
    if (!allowed.includes(values[field])) {
      throw new CommandError(`invalid ${field}: ${values[field]}`);
    }
  }
  return values;
}

function previousPlanCycle(ledgerFile) {
  if (!fs.existsSync(ledgerFile)) {
    return 0;
  }
  let previous = 0;
  for (const raw of fs.readFileSync(ledgerFile, "utf8").split("\n")) {
    if (!raw.trim()) {
      continue;
    }
    try {
      const event = JSON.parse(raw);
      previous = Math.max(previous, Number(event.plan_cycle || 0));
    } catch {
      // Historical malformed rows are ignored by the Bash implementation.
    }
  }
  return previous;
}

function hasLegacyMulticaRepairMarker(paths, taskId) {
  const markerFile = artifactFile(paths, taskId, "multica-feedback.json");
  try {
    const marker = JSON.parse(fs.readFileSync(markerFile, "utf8"));
    return marker
      && typeof marker === "object"
      && !Array.isArray(marker)
      && marker.task_id === taskId
      && marker.status === "repair-needed"
      && Number.isInteger(marker.round)
      && marker.round > 0
      && typeof marker.issue === "string"
      && marker.issue.trim().length > 0
      && Array.isArray(marker.blocking_findings)
      && marker.blocking_findings.length > 0
      && marker.blocking_findings.every((finding) => (
        typeof finding === "string" && finding.trim().length > 0
      ));
  } catch (_error) {
    return false;
  }
}

function runFeedbackCycle(parsed, options = {}) {
  const { clock, environment, paths } = commandOptions(options);
  prepareTaskCommand(paths, parsed.taskId, clock);
  const values = feedbackValues(parsed);
  values.taskId = parsed.taskId;
  const admission = evaluateSddAdmission(values, { environment, paths });
  const recordedAt = timestampSeconds(clock);
  const ledgerFile = artifactFile(paths, parsed.taskId, "ledger.jsonl");
  const previousCycle = previousPlanCycle(ledgerFile);
  const legacyMulticaCycle = ["multica-review", "multica-e2e"].includes(values.source)
    && hasLegacyMulticaRepairMarker(paths, parsed.taskId)
    && (["blocking", "high"].includes(values.severity) || values.rows.length > 0);
  const createsCycle = admission.admitted || legacyMulticaCycle;
  const cycle = createsCycle ? previousCycle + 1 : previousCycle;
  const cycleStatus = createsCycle ? "new-cycle" : "current-cycle-note";
  let cycleFile = "-";
  if (createsCycle) {
    const cycleDir = artifactFile(paths, parsed.taskId, "plan-cycles");
    fs.mkdirSync(cycleDir, { recursive: true });
    cycleFile = path.join(cycleDir, `cycle-${cycle}.md`);
    fs.writeFileSync(
      cycleFile,
      [
        `# Plan Cycle ${cycle}`,
        "",
        `Created: ${recordedAt}`,
        `Source: ${values.source}`,
        `Severity: ${values.severity}`,
        `Classification: ${values.classification}`,
        `Route: ${values.route}`,
        `Finding: ${values.finding}`,
        `Admission: ${admission.status}`,
        `Admission reason: ${admission.reason}`,
        "",
        "## Affected Acceptance Rows",
        "",
        ...(values.rows.length > 0
          ? values.rows.map((item) => `- ${item}`)
          : ["- None specified."]),
        "",
        "## Evidence",
        "",
        ...(values.evidence.length > 0
          ? values.evidence.map((item) => `- \`${item}\``)
          : ["- None recorded."]),
        "",
      ].join("\n"),
      "utf8",
    );
  }
  appendLedger(ledgerFile, {
    kind: "feedback-cycle",
    created_at: recordedAt,
    plan_cycle: cycle,
    cycle_status: cycleStatus,
    source: values.source,
    finding: values.finding,
    severity: values.severity,
    classification: values.classification,
    route: values.route,
    affected_rows: values.rows,
    evidence: values.evidence,
    admission_status: admission.status,
    admission_reason: admission.reason,
    admission_locator: values.admissionLocator,
  });

  const returnFile = artifactFile(paths, parsed.taskId, "return-to-plan.md");
  fs.writeFileSync(
    returnFile,
    [
      "# Return-To-Plan Feedback",
      "",
      `Updated: ${recordedAt}`,
      `Atlas task: ${parsed.taskId}`,
      "",
      "## Latest Feedback",
      "",
      `- Cycle status: ${cycleStatus}`,
      `- Active plan cycle: ${cycle}`,
      `- Source: ${values.source}`,
      `- Severity: ${values.severity}`,
      `- Classification: ${values.classification}`,
      `- Route: ${values.route}`,
      `- Finding: ${values.finding}`,
      `- Admission: ${admission.status}`,
      `- Admission reason: ${admission.reason}`,
      "",
      "## Stale / Affected Acceptance Rows",
      "",
      ...(values.rows.length > 0
        ? values.rows.map((item) => `- ${item}`)
        : ["- None specified."]),
      "",
      "## Evidence",
      "",
      ...(values.evidence.length > 0
        ? values.evidence.map((item) => `- \`${item}\``)
        : ["- None recorded."]),
      "",
      "## Rule",
      "",
      "Feedback remains visible by default. Canonically validated current-required open SDD admission creates a repair cycle; legacy Multica severity/affected-row decisions require a valid durable repair-needed marker for this task.",
      "",
    ].join("\n"),
    "utf8",
  );
  const rowsJoined = values.rows.length > 0 ? values.rows.join(";") : "-";
  const stateUpdates = {
    "return_to_plan.artifact": relativeToCodeHome(paths, returnFile),
    active_plan_cycle: cycle,
    latest_feedback_route: values.route,
  };
  if (createsCycle) {
    stateUpdates.previous_approval_status = "stale-if-affected";
    stateUpdates.stale_acceptance_rows = rowsJoined;
  }
  updateTaskCommand(
    paths,
    parsed.taskId,
    {
      return_to_plan: relativeToCodeHome(paths, returnFile),
      active_plan_cycle: cycle,
      latest_feedback_route: values.route,
    },
    stateUpdates,
    clock,
  );
  appendLegacyRuntimeEvent(
    paths,
    parsed.taskId,
    "feedback-cycle",
    `${cycleStatus} cycle ${cycle} route ${values.route}`,
    clock,
  );
  return {
    exitCode: 0,
    lines: [
      `task_id: ${parsed.taskId}`,
      `artifact: ${returnFile}`,
      `cycle_file: ${cycleFile}`,
      `cycle: ${cycle}`,
      `status: ${cycleStatus}`,
      `route: ${values.route}`,
      `admission: ${admission.status}`,
      `admission_reason: ${admission.reason}`,
    ],
  };
}

function parseLessonArgs(argv) {
  return parseOptions(argv, {
    usage: LESSON_USAGE,
    defaults: { trigger: "", lesson: "" },
    scalarFlags: { "--trigger": "trigger", "--lesson": "lesson" },
    repeatFlags: { "--evidence": "evidence" },
    required: [
      ["trigger", "--trigger"],
      ["lesson", "--lesson"],
    ],
  });
}

function runLessonCandidate(parsed, options = {}) {
  const { clock, paths } = commandOptions(options);
  prepareTaskCommand(paths, parsed.taskId, clock);
  const trigger = oneLine(parsed.trigger, "trigger", { allowEmpty: false });
  const lesson = oneLine(parsed.lesson, "lesson", { allowEmpty: false });
  const evidence = parsed.evidence.map((item) =>
    oneLine(item, "evidence", { allowEmpty: false }),
  );
  if (
    !new Set([
      "repeated-failure",
      "remote",
      "ui",
      "data-contract",
      "multica-feedback",
      "manual",
    ]).has(trigger)
  ) {
    throw new CommandError(`invalid trigger: ${trigger}`);
  }
  const recordedAt = timestampSeconds(clock);
  const candidateId = timestampCandidate("L", recordedAt);
  const lessonFile = artifactFile(paths, parsed.taskId, "lesson-candidates.md");
  if (!fs.existsSync(lessonFile)) {
    fs.writeFileSync(lessonFile, "# Lesson Candidates\n\n", "utf8");
  }
  fs.appendFileSync(
    lessonFile,
    [
      `## ${candidateId}`,
      "",
      `- Recorded: ${recordedAt}`,
      `- Trigger: ${trigger}`,
      `- Lesson: ${lesson}`,
      "",
      "### Evidence",
      "",
      ...(evidence.length > 0
        ? evidence.map((item) => `- \`${item}\``)
        : ["- None recorded."]),
      "",
    ].join("\n"),
    "utf8",
  );
  appendLedger(artifactFile(paths, parsed.taskId, "ledger.jsonl"), {
    kind: "lesson-candidate",
    candidate_id: candidateId,
    created_at: recordedAt,
    trigger,
    lesson,
    evidence,
  });
  updateTaskCommand(
    paths,
    parsed.taskId,
    {
      lesson_candidates: relativeToCodeHome(paths, lessonFile),
      latest_lesson_candidate: candidateId,
    },
    {
      "learning.candidates": relativeToCodeHome(paths, lessonFile),
      "learning.latest_candidate": candidateId,
      "learning.trigger": trigger,
    },
    clock,
  );
  appendLegacyRuntimeEvent(
    paths,
    parsed.taskId,
    "lesson-candidate",
    `${candidateId} ${trigger}`,
    clock,
  );
  return {
    exitCode: 0,
    lines: [
      `task_id: ${parsed.taskId}`,
      `artifact: ${lessonFile}`,
      `candidate: ${candidateId}`,
      `trigger: ${trigger}`,
      `evidence_count: ${evidence.length}`,
    ],
  };
}

function parseLearningDecisionArgs(argv) {
  return parseOptions(argv, {
    usage: LEARNING_DECISION_USAGE,
    defaults: { decision: "", reason: "" },
    scalarFlags: { "--decision": "decision", "--reason": "reason" },
    repeatFlags: { "--candidate": "candidates" },
    required: [
      ["decision", "--decision"],
      ["reason", "--reason"],
    ],
  });
}

function runLearningDecision(parsed, options = {}) {
  const { clock, paths } = commandOptions(options);
  prepareTaskCommand(paths, parsed.taskId, clock);
  const decision = oneLine(parsed.decision, "decision", { allowEmpty: false });
  const reason = oneLine(parsed.reason, "reason", { allowEmpty: false });
  const candidates = parsed.candidates.map((item) =>
    oneLine(item, "candidate", { allowEmpty: false }),
  );
  if (!new Set(["promote", "skip"]).has(decision)) {
    throw new CommandError(`invalid decision: ${decision}`);
  }
  const recordedAt = timestampSeconds(clock);
  const decisionFile = artifactFile(paths, parsed.taskId, "learning-decision.md");
  fs.writeFileSync(
    decisionFile,
    [
      "# Learning Decision",
      "",
      `Recorded: ${recordedAt}`,
      `Atlas task: ${parsed.taskId}`,
      "",
      `- Decision: ${decision}`,
      `- Reason: ${reason}`,
      "",
      "## Candidates",
      "",
      ...(candidates.length > 0
        ? candidates.map((item) => `- ${item}`)
        : ["- All current candidates."]),
      "",
      "## Boundary",
      "",
      "This records whether lesson candidates should be promoted later. It does not automatically write permanent memory.",
      "",
    ].join("\n"),
    "utf8",
  );
  appendLedger(artifactFile(paths, parsed.taskId, "ledger.jsonl"), {
    kind: "learning-decision",
    created_at: recordedAt,
    decision,
    reason,
    candidates,
  });
  updateTaskCommand(
    paths,
    parsed.taskId,
    {
      learning_decision: relativeToCodeHome(paths, decisionFile),
      learning_decision_value: decision,
    },
    {
      "learning.decision_file": relativeToCodeHome(paths, decisionFile),
      "learning.decision": decision,
      "learning.decision_candidates": candidates.length,
    },
    clock,
  );
  appendLegacyRuntimeEvent(paths, parsed.taskId, "learning-decision", decision, clock);
  return {
    exitCode: 0,
    lines: [
      `task_id: ${parsed.taskId}`,
      `artifact: ${decisionFile}`,
      `decision: ${decision}`,
      `candidates: ${candidates.length}`,
    ],
  };
}

module.exports = {
  FEEDBACK_USAGE,
  LEARNING_DECISION_USAGE,
  LESSON_USAGE,
  TRACE_USAGE,
  appendLedger,
  latestFailedVerification,
  parseFeedbackArgs,
  parseLearningDecisionArgs,
  parseLessonArgs,
  parseOptions,
  parseTraceArgs,
  previousPlanCycle,
  runFeedbackCycle,
  runLearningDecision,
  runLessonCandidate,
  runTracePromotion,
  stringifyLikePython,
  timestampCandidate,
  tracePreview,
};
