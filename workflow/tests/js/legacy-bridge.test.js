"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

const WORKFLOW_ROOT = path.resolve(__dirname, "../..");
const TEMPLATE_DIR = path.join(WORKFLOW_ROOT, "templates");
const {
  captureLegacyTeamFiles,
  runLegacyTeamCommand,
} = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/team/legacy-bridge.js",
));
const { resolvePaths } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/core/paths.js",
));
const { taskEventFile } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/core/task-mutation.js",
));
const { createTask, startTask } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/task/lifecycle.js",
));
const { readJsonObject, taskRuntimeFile, taskStateFile } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/task/runtime.js",
));

function temporaryWorkflow(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-legacy-runtime."));
  const environment = {
    ...process.env,
    CODEX_HOME_ROOT: home,
    CODEX_WORKFLOW_ROOT: path.join(home, "workflow"),
    CODEX_WORKFLOW_TEMPLATE_DIR: TEMPLATE_DIR,
    TMPDIR: path.join(home, "tmp"),
  };
  const paths = resolvePaths(environment);
  const taskId = createTask("Legacy bridge", "preserve canonical mutation", { environment });
  startTask(taskId, { environment });
  t.after(() => fs.rmSync(home, { force: true, recursive: true }));
  return { environment, paths, taskId };
}

function fakeLegacyBin(t, source) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-fake-legacy."));
  const file = path.join(root, "legacy.js");
  fs.writeFileSync(file, `#!/usr/bin/env node\n${source}\n`);
  fs.chmodSync(file, 0o755);
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  return file;
}

test("captures legacy Team sidecars without following symlinks", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-legacy-bridge."));
  const taskId = "20260729-001-legacy-bridge";
  const taskRoot = path.join(root, "artifacts", taskId);
  const teamRoot = path.join(taskRoot, "team");
  fs.mkdirSync(path.join(teamRoot, "sdd"), { recursive: true });
  fs.writeFileSync(path.join(teamRoot, "decision.md"), "decision\n");
  fs.writeFileSync(path.join(teamRoot, "round-20260729.md"), "round\n");
  fs.writeFileSync(path.join(teamRoot, "sdd", "brief.json"), "{}\n");
  fs.writeFileSync(path.join(teamRoot, "notes.md"), "not legacy-owned\n");
  fs.writeFileSync(path.join(taskRoot, "outside.md"), "outside\n");
  fs.symlinkSync(path.join(taskRoot, "outside.md"), path.join(teamRoot, "loop-linked.md"));
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));

  assert.deepEqual(captureLegacyTeamFiles({ artifactsDir: path.join(root, "artifacts") }, taskId), [
    {
      path: "team/decision.md",
      content_base64: Buffer.from("decision\n").toString("base64"),
    },
    {
      path: "team/round-20260729.md",
      content_base64: Buffer.from("round\n").toString("base64"),
    },
  ]);
});

test("rejects a legacy import when the canonical revision advances during execution", (t) => {
  const { environment, paths, taskId } = temporaryWorkflow(t);
  const legacyBin = fakeLegacyBin(t, `
const path = require("path");
const canonicalEnvironment = {
  ...process.env,
  CODEX_WORKFLOW_ROOT: process.env.ATLAS_TEST_CANONICAL_ROOT,
};
const moduleRoot = process.env.ATLAS_TEST_WORKFLOW_ROOT;
const { resolvePaths } = require(path.join(moduleRoot, "bin/lib/codex-workflow/core/paths.js"));
const { updateTaskCommand } = require(path.join(moduleRoot, "bin/lib/codex-workflow/core/command-runtime.js"));
updateTaskCommand(
  resolvePaths(canonicalEnvironment),
  process.argv[3],
  {},
  { current_phase: "concurrent-canonical-mutation" },
  () => new Date("2026-07-29T02:00:00.000Z"),
);
`);
  const initialEvents = fs.readFileSync(taskEventFile(paths, taskId), "utf8").trim().split("\n").length;
  assert.throws(() => runLegacyTeamCommand(
    ["team-start", taskId, "legacy execution"],
    {
      environment: {
        ...environment,
        ATLAS_TEST_CANONICAL_ROOT: environment.CODEX_WORKFLOW_ROOT,
        ATLAS_TEST_WORKFLOW_ROOT: WORKFLOW_ROOT,
      },
      legacyBin,
    },
  ), /stale task revision/);
  assert.equal(
    readJsonObject(taskStateFile(paths, taskId)).current_phase,
    "concurrent-canonical-mutation",
  );
  assert.equal(
    fs.readFileSync(taskEventFile(paths, taskId), "utf8").trim().split("\n").length,
    initialEvents + 1,
  );
});

test("imports isolated legacy state and sidecars when the canonical revision is unchanged", (t) => {
  const { environment, paths, taskId } = temporaryWorkflow(t);
  const legacyBin = fakeLegacyBin(t, `
const fs = require("fs");
const path = require("path");
const taskId = process.argv[3];
const artifact = path.join(process.env.CODEX_WORKFLOW_ROOT, "artifacts", taskId);
const stateFile = path.join(artifact, "state.json");
const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
state.active_team = { backend: "legacy", status: "complete" };
fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + "\\n");
fs.mkdirSync(path.join(artifact, "team"), { recursive: true });
fs.writeFileSync(path.join(artifact, "team", "decision.md"), "isolated decision\\n");
fs.appendFileSync(
  path.join(artifact, "runtime.jsonl"),
  JSON.stringify({ kind: "legacy-test", detail: "isolated runtime row" }) + "\\n",
);
`);
  const result = runLegacyTeamCommand(
    ["team-start", taskId, "legacy execution"],
    { environment, legacyBin },
  );
  assert.equal(result.exitCode, 0);
  const state = readJsonObject(taskStateFile(paths, taskId));
  assert.deepEqual(state.active_team, { backend: "legacy", status: "complete" });
  assert.equal(
    fs.readFileSync(path.join(paths.artifactsDir, taskId, "team", "decision.md"), "utf8"),
    "isolated decision\n",
  );
  assert.equal(
    JSON.parse(fs.readFileSync(taskEventFile(paths, taskId), "utf8").trim().split("\n").at(-1)).kind,
    "compatibility.team.start.closed",
  );
  assert.match(fs.readFileSync(taskRuntimeFile(paths, taskId), "utf8"), /"kind":"legacy-test"/);
});
