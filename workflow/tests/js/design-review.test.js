"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const test = require("node:test");

const repo = path.resolve(__dirname, "../../..");

test("design-review init leaves viewports and states to the approved design", (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-design-review."));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, "workflow");
  const output = execFileSync(path.join(repo, "workflow/bin/codex-design-review"), [
    "init", "desktop-only review", "/settings", "approved-desktop-design.md",
  ], {
    encoding: "utf8",
    env: {
      ...process.env,
      CODEX_HOME_ROOT: temporary,
      CODEX_WORKFLOW_ROOT: root,
      CODEX_WORKFLOW_TEMPLATE_DIR: path.join(repo, "workflow/templates"),
    },
  });
  const taskId = output.match(/^task_id: (.+)$/m)[1];
  const task = fs.readFileSync(path.join(root, "tasks", `${taskId}.md`), "utf8");
  const review = path.join(root, "design-reviews", taskId);
  const contract = fs.readFileSync(path.join(review, "contract.md"), "utf8");
  const report = fs.readFileSync(path.join(review, "report.md"), "utf8");
  assert.doesNotMatch(task, /桌面和手机/);
  assert.match(task, /批准设计/);
  assert.match(contract, /design_source: approved-desktop-design\.md/);
  assert.doesNotMatch(contract, /Desktop viewport defined|Mobile viewport defined|\| (Desktop|Mobile) \|/);
  assert.doesNotMatch(contract, /No broken (desktop|mobile) layout/);
  assert.doesNotMatch(contract, /\| (Default|Hover|Active|Empty\/error\/loading) \|/);
  assert.match(contract, /approved design and current user decisions/);
  assert.doesNotMatch(report, /^### (Desktop|Mobile)$/m);
  assert.doesNotMatch(report, /Multi-viewport behavior/);
  assert.match(report, /Required viewport behavior/);
  assert.match(report, /required viewport/);
  const verdict = JSON.parse(fs.readFileSync(path.join(review, "verdict.json"), "utf8"));
  assert.equal(verdict.status, "blocked");
  assert.deepEqual(verdict.evidence.viewports_covered, []);
  assert.deepEqual(verdict.evidence.states_covered, []);
});

test("design review continues by goal and authority, not an attempt limit", () => {
  const skill = fs.readFileSync(path.join(repo, "plugins/atlas-workflow/skills/design-review/SKILL.md"), "utf8");
  assert.doesNotMatch(skill, /After \d+ failed loops|keep retries bounded/);
  assert.match(skill, /current implementation authority/);
  assert.match(skill, /new authority/);
  assert.match(skill, /external state/);
  assert.match(skill, /materially advance/);
  assert.match(skill, /Only the literal value `passed`/);
});
