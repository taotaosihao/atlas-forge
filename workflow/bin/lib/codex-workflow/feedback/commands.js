"use strict";

const fs = require("fs");
const path = require("path");
const {
  CommandError,
  artifactFile,
  commandOptions,
  expandUserPath,
  oneLine,
} = require("../core/command-runtime");
const { relativeToCodeHome, taskArtifactDir } = require("../core/paths");
const { readAuthoritativeEvents } = require("../core/event-store");
const { mutateTaskRuntime, taskEventFile } = require("../core/task-mutation");
const { renderTaskFields, requireTaskFile, validateTaskFile } = require("../task/repository");
const {
  projectTaskState,
  readJsonObject,
  taskStateFile,
  timestampSeconds,
} = require("../task/runtime");
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

function readOptionalText(file, fallback = "") {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function projectionFile(paths, taskId, file, content) {
  const root = path.resolve(taskArtifactDir(paths, taskId));
  const absolute = path.resolve(file);
  const relative = path.relative(root, absolute);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new CommandError(`feedback projection escapes task artifacts: ${file}`);
  }
  return {
    path: relative.split(path.sep).join("/"),
    content_base64: Buffer.from(content).toString("base64"),
  };
}

function commitFeedbackRuntime({
  paths,
  taskId,
  kind,
  data,
  headerUpdates,
  updateState,
  files,
  legacyKind,
  legacyDetail,
  options,
}) {
  mutateTaskRuntime(
    paths,
    taskId,
    { kind, operationId: options.operationId, data },
    () => {
      const taskFile = requireTaskFile(paths.tasksDir, taskId);
      validateTaskFile(taskFile);
      const taskContent = renderTaskFields(fs.readFileSync(taskFile, "utf8"), headerUpdates);
      const state = projectTaskState(
        paths,
        taskId,
        taskContent,
        readJsonObject(taskStateFile(paths, taskId)),
        options.clock,
      );
      updateState(state);
      return {
        projection: {
          task_content: taskContent,
          state,
          files: files.map((entry) => projectionFile(
            paths, taskId, entry.file, entry.content,
          )),
        },
        legacy: [{ kind: legacyKind, detail: legacyDetail }],
      };
    },
    options,
  );
}

function validateFeedbackTask(paths, taskId) {
  const taskFile = requireTaskFile(paths.tasksDir, taskId);
  validateTaskFile(taskFile);
  readJsonObject(taskStateFile(paths, taskId));
  return readAuthoritativeEvents(taskEventFile(paths, taskId), taskId).at(-1)?.revision || 0;
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
  const expectedRevision = validateFeedbackTask(paths, parsed.taskId);
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
  const traceContent = `${readOptionalText(traceFile, "# Trace Candidates\n\n")}${[
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
    ].join("\n")}`;

  let regression = "-";
  const projectedFiles = [{ file: traceFile, content: traceContent }];
  if (traceType === "regression") {
    const regressionDir = artifactFile(paths, parsed.taskId, "regressions");
    regression = path.join(regressionDir, `${candidateId}.md`);
    projectedFiles.push({
      file: regression,
      content: [
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
    });
  }
  const ledgerFile = artifactFile(paths, parsed.taskId, "ledger.jsonl");
  const ledgerEvent = {
    kind: "trace-promote",
    created_at: recordedAt,
    candidate_id: candidateId,
    type: traceType,
    owner,
    source,
    reason,
    regression,
  };
  projectedFiles.push({
    file: ledgerFile,
    content: `${readOptionalText(ledgerFile)}${stringifyLikePython(ledgerEvent)}\n`,
  });
  const traceReference = relativeToCodeHome(paths, traceFile);
  commitFeedbackRuntime({
    paths,
    taskId: parsed.taskId,
    kind: "trace.promoted",
    data: ledgerEvent,
    headerUpdates: {
      trace_candidates: relativeToCodeHome(paths, traceFile),
      latest_trace_candidate: candidateId,
    },
    updateState(state) {
      state.trace = {
        ...(state.trace || {}),
        candidates: traceReference,
        latest_candidate: candidateId,
        latest_source: source,
        latest_type: traceType,
      };
    },
    files: projectedFiles,
    legacyKind: "trace-promote",
    legacyDetail: `${candidateId} ${traceType}`,
    options: { ...options, clock, environment, expectedRevision },
  });
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
  const expectedRevision = validateFeedbackTask(paths, parsed.taskId);
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
  const projectedFiles = [];
  if (createsCycle) {
    const cycleDir = artifactFile(paths, parsed.taskId, "plan-cycles");
    cycleFile = path.join(cycleDir, `cycle-${cycle}.md`);
    projectedFiles.push({
      file: cycleFile,
      content: [
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
    });
  }
  const ledgerEvent = {
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
  };
  projectedFiles.push({
    file: ledgerFile,
    content: `${readOptionalText(ledgerFile)}${stringifyLikePython(ledgerEvent)}\n`,
  });

  const returnFile = artifactFile(paths, parsed.taskId, "return-to-plan.md");
  projectedFiles.push({
    file: returnFile,
    content: [
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
  });
  const rowsJoined = values.rows.length > 0 ? values.rows.join(";") : "-";
  const returnReference = relativeToCodeHome(paths, returnFile);
  commitFeedbackRuntime({
    paths,
    taskId: parsed.taskId,
    kind: "feedback.recorded",
    data: ledgerEvent,
    headerUpdates: {
      return_to_plan: relativeToCodeHome(paths, returnFile),
      active_plan_cycle: cycle,
      latest_feedback_route: values.route,
    },
    updateState(state) {
      state.return_to_plan = {
        ...(state.return_to_plan || {}),
        artifact: returnReference,
      };
      state.active_plan_cycle = cycle;
      state.latest_feedback_route = values.route;
      if (createsCycle) {
        state.previous_approval_status = "stale-if-affected";
        state.stale_acceptance_rows = rowsJoined;
      }
    },
    files: projectedFiles,
    legacyKind: "feedback-cycle",
    legacyDetail: `${cycleStatus} cycle ${cycle} route ${values.route}`,
    options: { ...options, clock, environment, expectedRevision },
  });
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
  const { clock, environment, paths } = commandOptions(options);
  const expectedRevision = validateFeedbackTask(paths, parsed.taskId);
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
  const lessonContent = `${readOptionalText(lessonFile, "# Lesson Candidates\n\n")}${[
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
    ].join("\n")}`;
  const ledgerFile = artifactFile(paths, parsed.taskId, "ledger.jsonl");
  const ledgerEvent = {
    kind: "lesson-candidate",
    candidate_id: candidateId,
    created_at: recordedAt,
    trigger,
    lesson,
    evidence,
  };
  const lessonReference = relativeToCodeHome(paths, lessonFile);
  commitFeedbackRuntime({
    paths,
    taskId: parsed.taskId,
    kind: "lesson.candidate.recorded",
    data: ledgerEvent,
    headerUpdates: {
      lesson_candidates: relativeToCodeHome(paths, lessonFile),
      latest_lesson_candidate: candidateId,
    },
    updateState(state) {
      state.learning = {
        ...(state.learning || {}),
        candidates: lessonReference,
        latest_candidate: candidateId,
        trigger,
      };
    },
    files: [
      { file: lessonFile, content: lessonContent },
      {
        file: ledgerFile,
        content: `${readOptionalText(ledgerFile)}${stringifyLikePython(ledgerEvent)}\n`,
      },
    ],
    legacyKind: "lesson-candidate",
    legacyDetail: `${candidateId} ${trigger}`,
    options: { ...options, clock, environment, expectedRevision },
  });
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
  const { clock, environment, paths } = commandOptions(options);
  const expectedRevision = validateFeedbackTask(paths, parsed.taskId);
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
  const decisionContent = [
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
    ].join("\n");
  const ledgerFile = artifactFile(paths, parsed.taskId, "ledger.jsonl");
  const ledgerEvent = {
    kind: "learning-decision",
    created_at: recordedAt,
    decision,
    reason,
    candidates,
  };
  const decisionReference = relativeToCodeHome(paths, decisionFile);
  commitFeedbackRuntime({
    paths,
    taskId: parsed.taskId,
    kind: "learning.decision.recorded",
    data: ledgerEvent,
    headerUpdates: {
      learning_decision: relativeToCodeHome(paths, decisionFile),
      learning_decision_value: decision,
    },
    updateState(state) {
      state.learning = {
        ...(state.learning || {}),
        decision_file: decisionReference,
        decision,
        decision_candidates: candidates.length,
      };
    },
    files: [
      { file: decisionFile, content: decisionContent },
      {
        file: ledgerFile,
        content: `${readOptionalText(ledgerFile)}${stringifyLikePython(ledgerEvent)}\n`,
      },
    ],
    legacyKind: "learning-decision",
    legacyDetail: decision,
    options: { ...options, clock, environment, expectedRevision },
  });
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
