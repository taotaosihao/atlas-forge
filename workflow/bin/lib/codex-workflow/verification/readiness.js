"use strict";

const fs = require("fs");
const path = require("path");
const {
  CommandError,
  appendLegacyRuntimeEvent,
  commandOptions,
  prepareTaskCommand,
  updateTaskCommand,
} = require("../core/command-runtime");
const { taskArtifactDir } = require("../core/paths");
const { timestampSeconds } = require("../task/runtime");

const READY_USAGE =
  'usage: codex-workflow ready <task-id> [--require context,spec,analysis[,decision]] [--skip "<reason>"]';
const VALID_REQUIREMENTS = new Set(["context", "spec", "analysis", "decision"]);

function parseReadyArgs(argv) {
  if (argv.length === 0) {
    throw new CommandError(READY_USAGE);
  }
  const result = {
    requirements: "context,spec,analysis",
    skipReason: "",
    skipRequested: false,
    taskId: argv[0],
  };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--require" || argument === "--skip") {
      if (index + 1 >= argv.length) {
        throw new CommandError(READY_USAGE);
      }
      const value = argv[++index];
      if (argument === "--require") {
        result.requirements = value;
      } else {
        result.skipReason = value;
        result.skipRequested = true;
      }
    } else if (argument.startsWith("--require=")) {
      result.requirements = argument.slice("--require=".length);
    } else if (argument.startsWith("--skip=")) {
      result.skipReason = argument.slice("--skip=".length);
      result.skipRequested = true;
    } else {
      throw new CommandError(READY_USAGE);
    }
  }
  result.requirements = result.requirements.replace(/\s/g, "");
  if (!result.requirements) {
    throw new CommandError("invalid readiness requirements: empty");
  }
  if (
    result.skipRequested &&
    (!result.skipReason || /[\n\r\t]/.test(result.skipReason) || /^\s*$/.test(result.skipReason))
  ) {
    throw new CommandError(
      "unsafe readiness skip reason: reason must be a single non-empty line",
    );
  }
  return result;
}

function substantiveContent(file) {
  const text = fs.readFileSync(file, "utf8");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !line.startsWith("#") &&
        !line.startsWith("Task:") &&
        !line.startsWith("Title:") &&
        line !== "Pending discussion.",
    )
    .join("\n")
    .trim();
}

function evaluateReadiness(paths, taskId, requirementsText) {
  const requirements = requirementsText.split(",").filter((item) => item);
  if (requirements.length === 0) {
    throw new CommandError("invalid readiness requirements: empty", 2);
  }
  const unknown = requirements.filter((item) => !VALID_REQUIREMENTS.has(item));
  if (unknown.length > 0) {
    throw new CommandError(`invalid readiness requirement(s): ${unknown.join(",")}`, 2);
  }
  const artifactDir = taskArtifactDir(paths, taskId);
  const issues = [];
  const recordedPaths = [];
  for (const requirement of requirements) {
    let file;
    if (requirement === "decision") {
      const rootDecision = path.join(artifactDir, "decision.md");
      file = fs.existsSync(rootDecision)
        ? rootDecision
        : path.join(artifactDir, "team", "decision.md");
    } else {
      file = path.join(artifactDir, `${requirement}.md`);
    }
    recordedPaths.push(`${requirement}:${path.relative(artifactDir, file).split(path.sep).join("/")}`);
    if (!fs.existsSync(file)) {
      issues.push(`${requirement}:missing`);
    } else if (!substantiveContent(file)) {
      issues.push(`${requirement}:template`);
    }
  }
  return {
    issues: issues.length ? issues.join(",") : "-",
    paths: recordedPaths.join(","),
    status: issues.length ? "not-ready" : "ready",
  };
}

function runReady(parsed, options = {}) {
  const { clock, paths } = commandOptions(options);
  prepareTaskCommand(paths, parsed.taskId, clock);
  const checkedAt = timestampSeconds(clock);
  if (parsed.skipRequested) {
    updateTaskCommand(
      paths,
      parsed.taskId,
      {
        readiness_status: "skipped",
        readiness_checked_at: checkedAt,
        readiness_requirements: parsed.requirements,
        readiness_issues: "-",
        readiness_skip_reason: parsed.skipReason,
      },
      {
        "readiness.status": "skipped",
        "readiness.checked_at": checkedAt,
        "readiness.requirements": parsed.requirements,
        "readiness.issues": "-",
        "readiness.skip_reason": parsed.skipReason,
      },
      clock,
    );
    appendLegacyRuntimeEvent(
      paths,
      parsed.taskId,
      "readiness-skip",
      `${parsed.requirements}: ${parsed.skipReason}`,
      clock,
    );
    return {
      exitCode: 0,
      lines: [
        `task_id: ${parsed.taskId}`,
        "status: skipped",
        `requirements: ${parsed.requirements}`,
        `reason: ${parsed.skipReason}`,
      ],
    };
  }

  const result = evaluateReadiness(paths, parsed.taskId, parsed.requirements);
  updateTaskCommand(
    paths,
    parsed.taskId,
    {
      readiness_status: result.status,
      readiness_checked_at: checkedAt,
      readiness_requirements: parsed.requirements,
      readiness_issues: result.issues,
      readiness_paths: result.paths,
      readiness_skip_reason: "-",
    },
    {
      "readiness.status": result.status,
      "readiness.checked_at": checkedAt,
      "readiness.requirements": parsed.requirements,
      "readiness.issues": result.issues,
      "readiness.paths": result.paths,
      "readiness.skip_reason": "-",
    },
    clock,
  );
  appendLegacyRuntimeEvent(
    paths,
    parsed.taskId,
    "readiness",
    `${result.status} ${parsed.requirements} ${result.issues}`,
    clock,
  );
  return {
    exitCode: result.status === "ready" ? 0 : 1,
    lines: [
      `task_id: ${parsed.taskId}`,
      `status: ${result.status}`,
      `requirements: ${parsed.requirements}`,
      `issues: ${result.issues}`,
      `paths: ${result.paths}`,
    ],
  };
}

module.exports = {
  READY_USAGE,
  VALID_REQUIREMENTS,
  evaluateReadiness,
  parseReadyArgs,
  runReady,
  substantiveContent,
};
