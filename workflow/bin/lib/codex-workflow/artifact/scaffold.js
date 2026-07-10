"use strict";

const fs = require("fs");
const path = require("path");
const { atomicWriteFile } = require("../core/atomic-file");
const { resolvePaths, taskArtifactDir } = require("../core/paths");
const { localDay } = require("../task/lifecycle");
const { requireTaskFile, validateTaskFile } = require("../task/repository");
const { appendLegacyRuntimeEvent } = require("./runtime");

const TEAM_DECISION_PLACEHOLDER = "# Team Decision\n\nPending discussion.\n";
const TEAM_STAFFING_PLACEHOLDER = "# Staffing\n\nPending discussion.\n";

class ArtifactScaffoldError extends Error {
  constructor(message) {
    super(message);
    this.name = "ArtifactScaffoldError";
  }
}

function validateSafeId(value, label) {
  if (!value || !/^[A-Za-z0-9._-]+$/.test(value) || value === "." || value === "..") {
    throw new ArtifactScaffoldError(`invalid ${label}: ${value}`);
  }
}

function renderWorkflowTemplate(templateName, taskId, phaseId, options) {
  const { paths, clock } = options;
  const templateFile = path.join(paths.templateDir, templateName);
  if (!fs.existsSync(templateFile) || !fs.statSync(templateFile).isFile()) {
    throw new ArtifactScaffoldError(`missing template: ${templateFile}`);
  }
  const taskFile = requireTaskFile(paths.tasksDir, taskId);
  const { task } = validateTaskFile(taskFile);
  const values = {
    TASK_ID: taskId,
    TITLE: task.title,
    CREATED: localDay(clock),
    PHASE_ID: phaseId || "",
  };
  return fs
    .readFileSync(templateFile, "utf8")
    .replace(/\{\{(TASK_ID|TITLE|CREATED|PHASE_ID)\}\}/g, (_match, key) => values[key]);
}

function scaffoldWriteFile(templateName, outputFile, taskId, options = {}) {
  const phaseId = options.phaseId || "";
  const placeholder = options.placeholder || "";
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  if (fs.existsSync(outputFile)) {
    if (!fs.statSync(outputFile).isFile()) {
      throw new ArtifactScaffoldError(
        `artifact path is not a regular file: ${outputFile}`,
      );
    }
    if (placeholder && fs.readFileSync(outputFile, "utf8") === placeholder) {
      atomicWriteFile(
        outputFile,
        renderWorkflowTemplate(templateName, taskId, phaseId, options),
        { encoding: "utf8" },
      );
      return `updated\t${outputFile}`;
    }
    return `exists\t${outputFile}`;
  }
  atomicWriteFile(
    outputFile,
    renderWorkflowTemplate(templateName, taskId, phaseId, options),
    { encoding: "utf8" },
  );
  return `created\t${outputFile}`;
}

function scaffoldSingle(taskId, kind, templateName, fileName, options = {}) {
  const environment = options.environment || process.env;
  const paths = options.paths || resolvePaths(environment);
  const clock = options.clock || (() => new Date());
  requireTaskFile(paths.tasksDir, taskId);
  const outputFile = path.join(taskArtifactDir(paths, taskId), fileName);
  const lines = [
    scaffoldWriteFile(templateName, outputFile, taskId, { paths, clock }),
  ];
  appendLegacyRuntimeEvent(paths, taskId, "scaffold", kind, clock);
  return lines;
}

function scaffoldIntake(taskId, options = {}) {
  return scaffoldSingle(taskId, "intake", "intake.md", "intake.md", options);
}

function scaffoldBrainstorm(taskId, options = {}) {
  return scaffoldSingle(
    taskId,
    "brainstorm",
    "brainstorm.md",
    "brainstorm.md",
    options,
  );
}

function scaffoldClarify(taskId, options = {}) {
  return scaffoldSingle(taskId, "clarify", "clarify.md", "clarify.md", options);
}

function scaffoldTeam(taskId, options = {}) {
  const environment = options.environment || process.env;
  const paths = options.paths || resolvePaths(environment);
  const clock = options.clock || (() => new Date());
  requireTaskFile(paths.tasksDir, taskId);
  const teamDir = path.join(taskArtifactDir(paths, taskId), "team");
  const lines = [
    scaffoldWriteFile("team-decision.md", path.join(teamDir, "decision.md"), taskId, {
      paths,
      clock,
      placeholder: TEAM_DECISION_PLACEHOLDER,
    }),
    scaffoldWriteFile("team-staffing.md", path.join(teamDir, "staffing.md"), taskId, {
      paths,
      clock,
      placeholder: TEAM_STAFFING_PLACEHOLDER,
    }),
  ];
  appendLegacyRuntimeEvent(paths, taskId, "scaffold", "team", clock);
  return lines;
}

function scaffoldPhase(taskId, phaseId, options = {}) {
  validateSafeId(phaseId, "phase id");
  const environment = options.environment || process.env;
  const paths = options.paths || resolvePaths(environment);
  const clock = options.clock || (() => new Date());
  requireTaskFile(paths.tasksDir, taskId);
  const phaseDir = path.join(taskArtifactDir(paths, taskId), "evidence", phaseId);
  const names = [
    "phase-review-report.md",
    "defect-queue.md",
    "evidence-index.md",
    "gate-checklist.md",
  ];
  const lines = names.map((name) =>
    scaffoldWriteFile(name, path.join(phaseDir, name), taskId, {
      paths,
      clock,
      phaseId,
    }),
  );
  appendLegacyRuntimeEvent(paths, taskId, "scaffold", `phase:${phaseId}`, clock);
  return lines;
}

module.exports = {
  ArtifactScaffoldError,
  TEAM_DECISION_PLACEHOLDER,
  TEAM_STAFFING_PLACEHOLDER,
  renderWorkflowTemplate,
  scaffoldBrainstorm,
  scaffoldClarify,
  scaffoldIntake,
  scaffoldPhase,
  scaffoldTeam,
  scaffoldWriteFile,
  validateSafeId,
};
