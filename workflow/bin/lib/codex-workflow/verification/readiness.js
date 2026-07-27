"use strict";

const fs = require("fs");
const path = require("path");
const {
  CommandError,
  commandOptions,
} = require("../core/command-runtime");
const { mutateTaskRuntime } = require("../core/task-mutation");
const { taskArtifactDir } = require("../core/paths");
const { renderTaskFields, requireTaskFile, validateTaskFile } = require("../task/repository");
const {
  projectTaskState,
  readJsonObject,
  taskStateFile,
  timestampSeconds,
} = require("../task/runtime");

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
  const { clock, environment, paths } = commandOptions(options);
  const taskFile = requireTaskFile(paths.tasksDir, parsed.taskId);
  validateTaskFile(taskFile);
  readJsonObject(taskStateFile(paths, parsed.taskId));
  const checkedAt = timestampSeconds(clock);
  if (parsed.skipRequested) {
    recordReadiness(
      paths,
      parsed,
      {
        status: "skipped",
        checked_at: checkedAt,
        requirements: parsed.requirements,
        issues: "-",
        skip_reason: parsed.skipReason,
      },
      `${parsed.requirements}: ${parsed.skipReason}`,
      { ...options, clock, environment },
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
  recordReadiness(
    paths,
    parsed,
    {
      status: result.status,
      checked_at: checkedAt,
      requirements: parsed.requirements,
      issues: result.issues,
      paths: result.paths,
      skip_reason: "-",
    },
    `${result.status} ${parsed.requirements} ${result.issues}`,
    { ...options, clock, environment },
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

function recordReadiness(paths, parsed, readiness, detail, options) {
  const headerUpdates = {
    readiness_status: readiness.status,
    readiness_checked_at: readiness.checked_at,
    readiness_requirements: readiness.requirements,
    readiness_issues: readiness.issues,
    readiness_skip_reason: readiness.skip_reason,
  };
  if (readiness.paths !== undefined) headerUpdates.readiness_paths = readiness.paths;
  mutateTaskRuntime(
    paths,
    parsed.taskId,
    {
      kind: readiness.status === "skipped" ? "readiness.skipped" : "readiness.evaluated",
      operationId: options.operationId,
      data: readiness,
    },
    () => {
      const taskFile = requireTaskFile(paths.tasksDir, parsed.taskId);
      validateTaskFile(taskFile);
      const taskContent = renderTaskFields(fs.readFileSync(taskFile, "utf8"), headerUpdates);
      const state = projectTaskState(
        paths,
        parsed.taskId,
        taskContent,
        readJsonObject(taskStateFile(paths, parsed.taskId)),
        options.clock,
      );
      state.readiness = { ...readiness };
      return {
        projection: { task_content: taskContent, state },
        legacy: [{
          kind: readiness.status === "skipped" ? "readiness-skip" : "readiness",
          detail,
        }],
      };
    },
    options,
  );
}

module.exports = {
  READY_USAGE,
  VALID_REQUIREMENTS,
  evaluateReadiness,
  parseReadyArgs,
  runReady,
  substantiveContent,
};
