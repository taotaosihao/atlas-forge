"use strict";

const fs = require("fs");
const path = require("path");
const { taskArtifactDir } = require("../core/paths");

const TASK_ARTIFACT_PREFIX = "@workflow-task-artifact/";

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative !== ""
    && relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function canonicalRoot(root) {
  return fs.realpathSync(path.resolve(root));
}

function posixRelative(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function locateRequestedContract({ paths, repo, requested, taskId }) {
  const file = path.resolve(requested || "");
  const repoRoot = canonicalRoot(repo);
  const taskRoot = canonicalRoot(taskArtifactDir(paths, taskId));

  if (inside(repoRoot, file)) {
    const relative = posixRelative(repoRoot, file);
    if (relative.startsWith(TASK_ARTIFACT_PREFIX)) {
      throw new Error(`Team vNext repository contract uses reserved locator prefix: ${relative}`);
    }
    return { file, root: repoRoot, scopePath: relative };
  }
  if (inside(taskRoot, file)) {
    return {
      file,
      root: taskRoot,
      scopePath: `${TASK_ARTIFACT_PREFIX}${posixRelative(taskRoot, file)}`,
    };
  }
  throw new Error(
    `Team vNext contract must be inside ${repoRoot} or current task artifact ${taskRoot}: ${file}`,
  );
}

function resolveScopeContract({ contractPath, paths, repo, taskId }) {
  const taskArtifact = String(contractPath || "").startsWith(TASK_ARTIFACT_PREFIX);
  const root = canonicalRoot(taskArtifact ? taskArtifactDir(paths, taskId) : repo);
  const relative = taskArtifact
    ? String(contractPath).slice(TASK_ARTIFACT_PREFIX.length)
    : String(contractPath || "");
  const file = path.resolve(root, relative);
  if (!inside(root, file)) {
    throw new Error(`Team vNext contract locator escapes its authority root: ${contractPath}`);
  }
  return { file, root, scopePath: contractPath };
}

module.exports = {
  TASK_ARTIFACT_PREFIX,
  locateRequestedContract,
  resolveScopeContract,
};
