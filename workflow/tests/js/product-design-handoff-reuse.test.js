"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { writeApprovedDesignHandoff } = require("./helpers/product-design-fixture");

const PLUGIN_ROOT = path.resolve(__dirname, "../../../plugins/atlas-workflow");
const { DESIGN_HANDOFF_FILES, validateDesignHandoffArtifacts } = require(path.join(
  PLUGIN_ROOT, "contracts/product-design/validators/design-handoff",
));
const digest = text => "sha256:" + crypto.createHash("sha256").update(text).digest("hex");

function fixture(t, expectedTarget = "product_increment") {
  const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-design-reuse-"));
  t.after(() => fs.rmSync(taskRoot, { recursive: true, force: true }));
  writeApprovedDesignHandoff({ pluginRoot: PLUGIN_ROOT, target: expectedTarget, taskRoot });
  const artifacts = Object.fromEntries(Object.entries(DESIGN_HANDOFF_FILES).map(([name, relativePath]) => {
    const text = fs.readFileSync(path.join(taskRoot, relativePath), "utf8");
    return [name, { text, relative_path: relativePath, sha256: digest(text) }];
  }));
  return { artifacts, expectedTarget, taskId: "clarify-design-reuse" };
}

function change(input, name, edit) {
  const copy = structuredClone(input);
  const artifact = copy.artifacts[name];
  artifact.text = edit(artifact.text);
  artifact.sha256 = digest(artifact.text);
  return copy;
}

test("unchanged approved A/C/D/E can be read repeatedly without rewriting approval", t => {
  const input = fixture(t);
  const before = structuredClone(input);
  const first = validateDesignHandoffArtifacts(input);
  assert.equal(first.status, "approved");
  assert.equal(first.task_id, input.taskId);
  assert.equal(first.scenario_approval_ref, "user-message:scenario-approval");
  assert.equal(first.flow_approval_ref, "user-message:release");
  assert.deepEqual(validateDesignHandoffArtifacts(input), first);
  assert.deepEqual(input, before);
});

test("identity-neutral whitespace normalization preserves existing approval", t => {
  const input = fixture(t);
  const normalized = change(input, "flow", text => text
    .replace("Open, act, save, confirm, and refresh.", "Open, act, save, confirm, and refresh.   ")
    .replace(/\n/g, "\r\n"));
  const before = validateDesignHandoffArtifacts(input);
  const after = validateDesignHandoffArtifacts(normalized);
  assert.equal(after.flow_identity, before.flow_identity);
  assert.equal(after.flow_approval_ref, before.flow_approval_ref);
  assert.notEqual(after.flow_sha256, before.flow_sha256);
});

test("clear business content without a required approval binding stays non-executable", t => {
  const input = fixture(t);
  for (const name of ["scenario", "flow"]) {
    const missing = change(input, name, text => text.replace(/^approval_ref:.*$/m, 'approval_ref: ""'));
    assert.throws(() => validateDesignHandoffArtifacts(missing), /approval_ref/);
  }
  const staleHandoff = change(input, "handoff", text => text.replace(
    'flow_approval_ref: "user-message:release"', 'flow_approval_ref: "user-message:older"',
  ));
  assert.throws(() => validateDesignHandoffArtifacts(staleHandoff), /identities differ/);
});

test("reorganizing approved text does not authorize carrying a changed identity forward", t => {
  const input = fixture(t);
  const reorganized = change(input, "flow", text => text.replace(
    "Open, act, save, confirm, and refresh.", "- Open, act, save, confirm, and refresh.",
  ));
  assert.throws(() => validateDesignHandoffArtifacts(reorganized), /identities differ/);
});

test("new semantics with old approval or an unresolved blocker fail admission", t => {
  const input = fixture(t);
  const changedScenario = change(input, "scenario", text => text.replace(
    "Refresh preserves the result", "Refresh discards the result",
  ));
  assert.throws(() => validateDesignHandoffArtifacts(changedScenario), /current C semantics/);
  const changedFlow = change(input, "flow", text => text.replace(
    "The primary action persists one governed result.", "The primary action deletes all results.",
  ));
  assert.throws(() => validateDesignHandoffArtifacts(changedFlow), /identities differ/);
  const blocked = change(input, "handoff", text => text.replace(
    "## Blockers\nNone.", "## Blockers\nThe data-write authority is undecided.",
  ));
  assert.throws(() => validateDesignHandoffArtifacts(blocked), /blocking open question or blocker/);
});

test("formal release still requires current-user Flow Approval, not operator-only approval", t => {
  const input = fixture(t, "product_release");
  assert.equal(validateDesignHandoffArtifacts(input).status, "approved");
  let operatorOnly = change(input, "flow", text => text.replace("user-message:release", "operator-input:release"));
  operatorOnly = change(operatorOnly, "handoff", text => text.replace("user-message:release", "operator-input:release"));
  assert.throws(() => validateDesignHandoffArtifacts(operatorOnly), /explicit current-user message ref/);
});
