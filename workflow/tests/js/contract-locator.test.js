"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const { resolvePaths, taskArtifactDir } = require(path.join(
  ROOT,
  "workflow/bin/lib/codex-workflow/core/paths",
));
const {
  locateRequestedContract,
  resolveScopeContract,
} = require(path.join(
  ROOT,
  "workflow/bin/lib/codex-workflow/team/contract-locator",
));

test("contract locator distinguishes repository and same-task artifact authority roots", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-contract-locator."));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const paths = resolvePaths({
    CODEX_HOME_ROOT: home,
    CODEX_WORKFLOW_ROOT: path.join(home, "workflow"),
  });
  const taskId = "20260811-001-contract-locator";
  const repo = path.join(home, "repo");
  const taskRoot = taskArtifactDir(paths, taskId);
  const otherTaskRoot = taskArtifactDir(paths, "20260811-002-other-task");
  fs.mkdirSync(repo, { recursive: true });
  fs.mkdirSync(taskRoot, { recursive: true });
  fs.mkdirSync(otherTaskRoot, { recursive: true });

  const repositoryContract = path.join(repo, "contract.md");
  const reservedRepositoryContract = path.join(
    repo,
    "@workflow-task-artifact",
    "contract.md",
  );
  const taskContract = path.join(taskRoot, "implementation-contract.final.md");
  const otherTaskContract = path.join(otherTaskRoot, "implementation-contract.final.md");
  fs.mkdirSync(path.dirname(reservedRepositoryContract), { recursive: true });
  for (const file of [
    repositoryContract,
    reservedRepositoryContract,
    taskContract,
    otherTaskContract,
  ]) {
    fs.writeFileSync(file, "contract\n", "utf8");
  }

  assert.equal(locateRequestedContract({
    paths,
    repo,
    requested: repositoryContract,
    taskId,
  }).scopePath, "contract.md");
  assert.throws(() => locateRequestedContract({
    paths,
    repo,
    requested: reservedRepositoryContract,
    taskId,
  }), /reserved locator prefix/);
  const taskLocator = locateRequestedContract({
    paths,
    repo,
    requested: taskContract,
    taskId,
  });
  assert.equal(
    taskLocator.scopePath,
    "@workflow-task-artifact/implementation-contract.final.md",
  );
  assert.deepEqual(resolveScopeContract({
    contractPath: taskLocator.scopePath,
    paths,
    repo,
    taskId,
  }), taskLocator);
  assert.throws(() => locateRequestedContract({
    paths,
    repo,
    requested: otherTaskContract,
    taskId,
  }), /must be inside.*current task artifact/);
  assert.throws(() => resolveScopeContract({
    contractPath: "@workflow-task-artifact/../other-task/contract.md",
    paths,
    repo,
    taskId,
  }), /escapes its authority root/);
});
