#!/usr/bin/env node
"use strict";

const path = require("path");

const DIRECT_ROUTES = new Map([
  ["init-task", "./task/cli.js"],
  ["list", "./task/cli.js"],
  ["start", "./task/cli.js"],
  ["block", "./task/cli.js"],
  ["resume", "./task/cli.js"],
  ["done", "./task/cli.js"],
  ["archive", "./task/cli.js"],
  ["stale", "./task/cli.js"],
  ["show", "./task/cli.js"],
  ["scaffold-intake", "./artifact/cli.js"],
  ["scaffold-brainstorm", "./artifact/cli.js"],
  ["scaffold-clarify", "./artifact/cli.js"],
  ["scaffold-team", "./artifact/cli.js"],
  ["scaffold-phase", "./artifact/cli.js"],
  ["route-decision", "./artifact/cli.js"],
  ["checkpoint", "./artifact/cli.js"],
  ["source-snapshot", "./artifact/cli.js"],
  ["prompt-bundle", "./artifact/cli.js"],
  ["ready", "./verification/cli.js"],
  ["verify", "./verification/cli.js"],
  ["gate-metric", "./verification/cli.js"],
  ["gate-report", "./verification/cli.js"],
  ["outcome-mark", "./outcome/cli.js"],
  ["outcome-report", "./outcome/cli.js"],
  ["trace-promote", "./feedback/cli.js"],
  ["feedback-cycle", "./feedback/cli.js"],
  ["lesson-candidate", "./feedback/cli.js"],
  ["learning-decision", "./feedback/cli.js"],
  ["team-record-start", "./team/cli.js"],
  ["team-record-finalize", "./team/cli.js"],
  ["team-loop-record", "./team/cli.js"],
  ["team-status", "./team/cli.js"],
  ["team-stop", "./team/cli.js"],
  ["team-promote", "./team/cli.js"],
]);

const DEFAULT_LEGACY_BIN = path.resolve(__dirname, "../../codex-workflow-legacy");

function runLegacy(argv, options = {}) {
  const environment = options.environment || process.env;
  const execve = options.execve || process.execve;
  const legacyBin = options.legacyBin || DEFAULT_LEGACY_BIN;
  return execve(legacyBin, [legacyBin, ...argv], environment);
}

function main(argv, options = {}) {
  const modulePath = DIRECT_ROUTES.get(argv[0]);
  if (modulePath) {
    return require(modulePath).main(argv);
  }
  return runLegacy(argv, options);
}

if (require.main === module) {
  try {
    const exitCode = main(process.argv.slice(2));
    if (Number.isInteger(exitCode)) {
      process.exitCode = exitCode;
    }
  } catch (error) {
    process.stderr.write(`${error.message || String(error)}\n`);
    process.exitCode = error.exitCode || 1;
  }
}

module.exports = { DEFAULT_LEGACY_BIN, DIRECT_ROUTES, main, runLegacy };
