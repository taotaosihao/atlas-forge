"use strict";

const os = require("os");
const path = require("path");

function moduleWorkflowRoot() {
  return path.resolve(__dirname, "../../../..");
}

function workflowRoot(environment = process.env) {
  return environment.CODEX_WORKFLOW_ROOT || moduleWorkflowRoot();
}

function codexHomeRoot(environment = process.env) {
  if (environment.CODEX_HOME_ROOT) {
    return environment.CODEX_HOME_ROOT;
  }
  if (environment.CODEX_HOME) {
    return environment.CODEX_HOME;
  }
  return path.dirname(workflowRoot(environment));
}

function resolvePaths(environment = process.env) {
  const root = workflowRoot(environment);
  const codeHome = codexHomeRoot(environment);
  const tasksDir = path.join(root, "tasks");
  const stateDir = path.join(root, "state");
  const artifactsDir = path.join(root, "artifacts");
  const templateDir =
    environment.CODEX_WORKFLOW_TEMPLATE_DIR || path.join(moduleWorkflowRoot(), "templates");

  return {
    artifactsDir,
    codeHome,
    currentTaskFile: path.join(stateDir, "current-task.json"),
    initTaskLockFile: path.join(tasksDir, ".init-task.lock"),
    pointerLockFile: path.join(stateDir, ".current-task.lock"),
    root,
    stateDir,
    taskLockDir: path.join(environment.TMPDIR || os.tmpdir(), "codex-workflow-task-locks"),
    taskTemplate: path.join(templateDir, "task.md"),
    templateDir,
    tasksDir,
  };
}

function taskArtifactDir(paths, taskId) {
  return path.join(paths.artifactsDir, taskId);
}

function taskArtifactDirRelative(paths, taskId) {
  const artifactDir = path.resolve(taskArtifactDir(paths, taskId));
  const codeHome = path.resolve(paths.codeHome);
  const relative = path.relative(codeHome, artifactDir);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return artifactDir;
  }
  return relative.split(path.sep).join("/");
}

module.exports = {
  codexHomeRoot,
  moduleWorkflowRoot,
  resolvePaths,
  taskArtifactDir,
  taskArtifactDirRelative,
  workflowRoot,
};
