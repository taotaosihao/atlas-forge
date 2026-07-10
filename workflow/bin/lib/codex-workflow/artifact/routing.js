"use strict";

const fs = require("fs");
const path = require("path");
const { atomicWriteFile } = require("../core/atomic-file");
const { relativeToCodeHome, taskArtifactDir } = require("../core/paths");
const { taskFile } = require("../task/repository");
const { timestampSeconds } = require("../task/runtime");
const {
  ArtifactError,
  appendLegacyRuntimeEvent,
  artifactFile,
  commandOptions,
  expandUserPath,
  oneLine,
  prepareArtifactTask,
  updateArtifactTask,
} = require("./runtime");

const ROUTE_USAGE =
  'usage: codex-workflow route-decision <task-id> --intent <office-hours|brainstorm|intake|analyze|clarify|task|team|multica-handoff> --risk <low|medium|high> --decision <use|skip> --reason "<reason>" [--next <skill-or-command>] [--assumption "<assumption>"]... [--consensus] [--consensus-source <file>]';
const VALID_INTENTS = new Set([
  "office-hours",
  "brainstorm",
  "intake",
  "analyze",
  "clarify",
  "task",
  "team",
  "multica-handoff",
]);
const VALID_RISKS = new Set(["low", "medium", "high"]);
const VALID_DECISIONS = new Set(["use", "skip"]);

function optionValue(argv, index) {
  if (index + 1 >= argv.length) {
    throw new ArtifactError(ROUTE_USAGE);
  }
  return argv[index + 1];
}

function parseRouteArgs(argv) {
  if (argv.length === 0) {
    throw new ArtifactError(ROUTE_USAGE);
  }
  const taskId = argv[0];
  if (["-h", "--help", "help"].includes(taskId)) {
    return { help: true };
  }
  const result = {
    assumptions: [],
    consensusRequested: false,
    consensusSource: "",
    decision: "",
    intent: "",
    next: "",
    reason: "",
    risk: "",
    taskId,
  };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (["--intent", "--layer"].includes(argument)) {
      result.intent = optionValue(argv, index);
      index += 1;
    } else if (argument.startsWith("--intent=") || argument.startsWith("--layer=")) {
      result.intent = argument.slice(argument.indexOf("=") + 1);
    } else if (argument === "--risk") {
      result.risk = optionValue(argv, index);
      index += 1;
    } else if (argument.startsWith("--risk=")) {
      result.risk = argument.slice("--risk=".length);
    } else if (argument === "--decision") {
      result.decision = optionValue(argv, index);
      index += 1;
    } else if (argument.startsWith("--decision=")) {
      result.decision = argument.slice("--decision=".length);
    } else if (argument === "--reason") {
      result.reason = optionValue(argv, index);
      index += 1;
    } else if (argument.startsWith("--reason=")) {
      result.reason = argument.slice("--reason=".length);
    } else if (argument === "--next") {
      result.next = optionValue(argv, index);
      index += 1;
    } else if (argument.startsWith("--next=")) {
      result.next = argument.slice("--next=".length);
    } else if (argument === "--assumption") {
      result.assumptions.push(optionValue(argv, index));
      index += 1;
    } else if (argument.startsWith("--assumption=")) {
      result.assumptions.push(argument.slice("--assumption=".length));
    } else if (argument === "--consensus") {
      result.consensusRequested = true;
    } else if (argument === "--consensus-source") {
      result.consensusSource = optionValue(argv, index);
      index += 1;
    } else if (argument.startsWith("--consensus-source=")) {
      result.consensusSource = argument.slice("--consensus-source=".length);
    } else {
      throw new ArtifactError(ROUTE_USAGE);
    }
  }
  for (const [key, flag] of [
    ["intent", "--intent"],
    ["risk", "--risk"],
    ["decision", "--decision"],
    ["reason", "--reason"],
  ]) {
    if (!result[key]) {
      throw new ArtifactError(`missing required argument: ${flag}`);
    }
  }
  if (result.consensusSource && !result.consensusRequested) {
    throw new ArtifactError("--consensus-source requires --consensus");
  }
  return result;
}

function displayPath(root, target) {
  const absoluteRoot = path.resolve(root);
  const absoluteTarget = path.resolve(target);
  const relative = path.relative(absoluteRoot, absoluteTarget);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return absoluteTarget;
  }
  return relative.split(path.sep).join("/");
}

function substantiveLines(text) {
  return text.split("\n").filter((raw) => {
    const line = raw.trim();
    return (
      line &&
      !line.startsWith("#") &&
      !line.startsWith("Task:") &&
      !line.startsWith("Title:") &&
      line !== "Pending discussion."
    );
  });
}

function writeRouteDecision(parsed, options = {}) {
  const { clock, cwd, environment, paths } = commandOptions(options);
  const taskPath = taskFile(paths.tasksDir, parsed.taskId);
  let regularTask = false;
  try {
    regularTask = fs.statSync(taskPath).isFile();
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
  if (!regularTask) {
    throw new ArtifactError(
      `unknown route-decision task id: ${parsed.taskId}\n` +
        "route-decision records against an Atlas workflow task, not an external issue key or temporary handoff name.\n" +
        'create one first with: codex-workflow init-task "<title>" "<done condition>" && codex-workflow start <task-id>',
    );
  }

  const intent = oneLine(parsed.intent, "intent", { allowEmpty: false });
  const risk = oneLine(parsed.risk, "risk", { allowEmpty: false });
  const decision = oneLine(parsed.decision, "decision", { allowEmpty: false });
  const reason = oneLine(parsed.reason, "reason", { allowEmpty: false });
  const next = oneLine(parsed.next, "next");
  const assumptions = parsed.assumptions.map((value) =>
    oneLine(value, "assumption", { allowEmpty: false }),
  );
  if (!VALID_INTENTS.has(intent)) {
    throw new ArtifactError(`invalid intent: ${intent}`);
  }
  if (!VALID_RISKS.has(risk)) {
    throw new ArtifactError(`invalid risk: ${risk}`);
  }
  if (!VALID_DECISIONS.has(decision)) {
    throw new ArtifactError(`invalid decision: ${decision}`);
  }

  prepareArtifactTask(paths, parsed.taskId, clock);
  const recordedAt = timestampSeconds(clock);
  const artifactDir = taskArtifactDir(paths, parsed.taskId);
  const routeFile = artifactFile(paths, parsed.taskId, "routing-decision.md");
  const consensusFile = artifactFile(paths, parsed.taskId, "consensus-plan.md");
  fs.mkdirSync(artifactDir, { recursive: true });
  let consensusDisplay = "-";
  let consensusSourceDisplay = "-";
  if (parsed.consensusRequested) {
    const sourceFile = parsed.consensusSource
      ? path.resolve(cwd, expandUserPath(parsed.consensusSource, environment))
      : path.join(artifactDir, "team", "decision.md");
    let sourceText;
    try {
      if (!fs.statSync(sourceFile).isFile()) {
        throw new Error("not a file");
      }
      sourceText = fs.readFileSync(sourceFile, "utf8");
    } catch {
      throw new ArtifactError(`missing consensus source: ${sourceFile}`);
    }
    if (substantiveLines(sourceText).join("\n").trim().length < 20) {
      throw new ArtifactError(`consensus source is not substantive: ${sourceFile}`);
    }
    const lowered = sourceText.toLowerCase();
    const roleRows = ["Planner", "Architect", "Critic"].map(
      (role) =>
        `- ${role}: ${lowered.includes(role.toLowerCase()) ? "explicit" : "not explicitly labeled"}`,
    );
    const excerptLines = [];
    for (const raw of sourceText.split("\n")) {
      if (raw.trim() === "Pending discussion.") {
        continue;
      }
      excerptLines.push(raw.replace(/\r$/, ""));
      if (excerptLines.length >= 120) {
        excerptLines.push("... (truncated)");
        break;
      }
    }
    const sourceDisplay = displayPath(artifactDir, sourceFile);
    atomicWriteFile(
      consensusFile,
      [
        "# Consensus Plan",
        "",
        `Generated: ${recordedAt}`,
        `Atlas task: ${parsed.taskId}`,
        "",
        "## Source",
        "",
        `- Source: \`${sourceDisplay}\``,
        "- Status: substantive",
        "",
        "## Role Coverage",
        "",
        ...roleRows,
        "",
        "## Consensus Evidence",
        "",
        "```markdown",
        excerptLines.join("\n").trim(),
        "```",
        "",
        "## Use",
        "",
        "This artifact records routing consensus evidence only. It does not override the task spec, PRD, or later verification evidence.",
        "",
      ].join("\n"),
      { encoding: "utf8" },
    );
    consensusDisplay = displayPath(artifactDir, consensusFile);
    consensusSourceDisplay = sourceDisplay;
  }

  const nextDisplay = next || "-";
  const assumptionLines = assumptions.length
    ? assumptions.map((value) => `- ${value}`)
    : ["- None."];
  atomicWriteFile(
    routeFile,
    [
      "# Routing Decision",
      "",
      `Recorded: ${recordedAt}`,
      `Atlas task: ${parsed.taskId}`,
      "",
      "## Decision",
      "",
      `- Intent: ${intent}`,
      `- Risk: ${risk}`,
      `- Action: ${decision}`,
      `- Next: ${nextDisplay}`,
      `- Reason: ${reason}`,
      "",
      "## Assumptions",
      "",
      ...assumptionLines,
      "",
      "## Consensus",
      "",
      `- Requested: ${parsed.consensusRequested ? "yes" : "no"}`,
      `- Source: \`${consensusSourceDisplay}\``,
      `- Plan: \`${consensusDisplay}\``,
      "",
    ].join("\n"),
    { encoding: "utf8" },
  );

  const routeRelative = relativeToCodeHome(paths, routeFile);
  const consensusValue = parsed.consensusRequested
    ? relativeToCodeHome(paths, consensusFile)
    : "-";
  updateArtifactTask(
    paths,
    parsed.taskId,
    {
      route_decision: routeRelative,
      route_recorded_at: recordedAt,
      route_intent: intent,
      route_risk: risk,
      route_action: decision,
      route_reason: reason,
      route_next: nextDisplay,
      route_consensus: consensusValue,
      route_assumptions: String(assumptions.length),
    },
    {
      "route.decision": routeRelative,
      "route.recorded_at": recordedAt,
      "route.intent": intent,
      "route.risk": risk,
      "route.action": decision,
      "route.reason": reason,
      "route.next": nextDisplay,
      "route.consensus": consensusValue,
      "route.assumptions_count": String(assumptions.length),
    },
    clock,
  );
  appendLegacyRuntimeEvent(
    paths,
    parsed.taskId,
    "route-decision",
    `${intent} ${risk} ${decision}: ${reason}`,
    clock,
  );
  return [
    `task_id: ${parsed.taskId}`,
    `artifact: ${routeFile}`,
    `intent: ${intent}`,
    `risk: ${risk}`,
    `decision: ${decision}`,
    `next: ${nextDisplay}`,
    `assumptions: ${assumptions.length}`,
    `consensus: ${consensusValue}`,
  ];
}

module.exports = {
  ROUTE_USAGE,
  VALID_DECISIONS,
  VALID_INTENTS,
  VALID_RISKS,
  displayPath,
  parseRouteArgs,
  substantiveLines,
  writeRouteDecision,
};
