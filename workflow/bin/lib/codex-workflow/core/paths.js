"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

function moduleWorkflowRoot() {
  return path.resolve(__dirname, "../../../..");
}

function workflowRoot(environment = process.env) {
  return environment.ATLAS_WORKFLOW_ROOT || environment.CODEX_WORKFLOW_ROOT || moduleWorkflowRoot();
}

function codexHomeRoot(environment = process.env) {
  if (environment.ATLAS_HOME_ROOT) {
    return environment.ATLAS_HOME_ROOT;
  }
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

function relativeToCodeHome(paths, target) {
  const artifactDir = path.resolve(target);
  const codeHome = path.resolve(paths.codeHome);
  const relative = path.relative(codeHome, artifactDir);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return artifactDir;
  }
  return relative.split(path.sep).join("/");
}

function taskArtifactDirRelative(paths, taskId) {
  return relativeToCodeHome(paths, taskArtifactDir(paths, taskId));
}

/**
 * Installed Claude Code plugin cache layout: `<claude-config-dir>/plugins/cache/<marketplace>/<plugin>/<version>`.
 * Returns version directories across every cached marketplace, `.in_use`-marked versions first,
 * so callers scanning for a plugin-owned file can prefer the active install.
 */
function claudePluginCacheCandidates(environment = process.env, pluginName = "atlas-workflow") {
  const claudeConfigDir = environment.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
  const cacheRoot = path.join(claudeConfigDir, "plugins", "cache");
  let marketplaces;
  try {
    marketplaces = fs.readdirSync(cacheRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const candidates = [];
  for (const marketplace of marketplaces) {
    if (!marketplace.isDirectory()) continue;
    const pluginDir = path.join(cacheRoot, marketplace.name, pluginName);
    let versions;
    try {
      versions = fs.readdirSync(pluginDir, { withFileTypes: true });
    } catch {
      continue;
    }
    const versionDirs = versions
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(pluginDir, entry.name));
    versionDirs.sort((a, b) => {
      const aInUse = fs.existsSync(path.join(a, ".in_use"));
      const bInUse = fs.existsSync(path.join(b, ".in_use"));
      if (aInUse === bInUse) return 0;
      return aInUse ? -1 : 1;
    });
    candidates.push(...versionDirs);
  }
  return candidates;
}

module.exports = {
  claudePluginCacheCandidates,
  codexHomeRoot,
  moduleWorkflowRoot,
  relativeToCodeHome,
  resolvePaths,
  taskArtifactDir,
  taskArtifactDirRelative,
  workflowRoot,
};
