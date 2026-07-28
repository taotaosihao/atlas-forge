"use strict";

const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

class WorktreeSnapshotError extends Error {
  constructor(message) {
    super(message);
    this.name = "WorktreeSnapshotError";
  }
}

function captureWorktreeSnapshot(repo) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-slice-snapshot."));
  const indexFile = path.join(temporary, "index");
  const environment = { ...process.env, GIT_INDEX_FILE: indexFile };
  const run = (args, label) => {
    const result = childProcess.spawnSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      env: environment,
    });
    if (result.error || result.status !== 0) {
      throw new WorktreeSnapshotError(
        `${label}: ${(result.stderr || result.error?.message || "git failed").trim()}`,
      );
    }
    return result.stdout.trim();
  };
  try {
    run(["read-tree", "HEAD"], "unable to initialize worktree snapshot");
    run(["add", "-A", "--", "."], "unable to capture worktree snapshot");
    return {
      head_sha: run(["rev-parse", "--verify", "HEAD^{commit}"], "unable to capture worktree HEAD"),
      tree_oid: run(["write-tree"], "unable to write worktree snapshot tree"),
    };
  } finally {
    fs.rmSync(temporary, { force: true, recursive: true });
  }
}

module.exports = { WorktreeSnapshotError, captureWorktreeSnapshot };
