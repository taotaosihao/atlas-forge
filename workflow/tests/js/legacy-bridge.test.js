"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

const WORKFLOW_ROOT = path.resolve(__dirname, "../..");
const { captureLegacyTeamFiles } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/team/legacy-bridge.js",
));

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
