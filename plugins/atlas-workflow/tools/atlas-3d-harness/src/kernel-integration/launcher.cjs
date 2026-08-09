"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

const KERNEL_WORKER_ARGV = Object.freeze([process.execPath, path.join(__dirname, "worker.cjs")]);

function scrubEnvironment() {
  return {
    LANG: "C",
    LC_ALL: "C",
    PATH: "/usr/bin:/bin",
  };
}

function invokeKernelWorker(request) {
  const child = spawnSync(KERNEL_WORKER_ARGV[0], KERNEL_WORKER_ARGV.slice(1), {
    encoding: "utf8",
    env: scrubEnvironment(),
    input: `${JSON.stringify(request)}\n`,
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
  });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error((child.stderr || `kernel worker exit=${child.status}`).trim());
  return JSON.parse(child.stdout);
}

module.exports = { KERNEL_WORKER_ARGV, invokeKernelWorker, scrubEnvironment };
