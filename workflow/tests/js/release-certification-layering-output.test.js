"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const WORKFLOW_ROOT = path.resolve(__dirname, "../..");
const {
  captureVerificationOutput,
  resolveVerificationOutputs,
  validateCapturedOutput,
} = require(path.join(WORKFLOW_ROOT, "bin/lib/codex-workflow/verification/identity"));
const { releaseSweepRequired } = require(path.join(
  WORKFLOW_ROOT, "bin/lib/codex-workflow/verification/required-gates",
));

test("release sweep layering follows projected requirements rather than contract presence", () => {
  const plan = {
    release: { profile_ref: "opaque-profile" },
    slices: [
      { slice_id: "implementation", checks: [{ check_id: "unit" }] },
      {
        slice_id: "terminal",
        checks: [{
          check_id: "release",
          release_requirement: { requirement_ref: "opaque.requirement" },
        }],
      },
    ],
  };
  assert.equal(Boolean(plan.release), true);
  assert.equal(releaseSweepRequired(plan.slices[0].checks), false);
  assert.equal(releaseSweepRequired(plan.slices[1].checks), true);
  assert.equal(releaseSweepRequired([
    { check_id: "unit" },
    { check_id: "partial", release_requirement: { requirement_ref: "one-of-many" } },
  ]), true);
});

test("captured outputs are canonical content identities and fail revalidation after drift", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-layered-output."));
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  const parent = path.join(root, "release");
  fs.mkdirSync(parent);
  const target = path.join(parent, "fact.json");
  const [declared] = resolveVerificationOutputs([target], parent, root);
  fs.writeFileSync(target, "{\"fact\":true}\n");
  const captured = captureVerificationOutput(declared);
  assert.equal(validateCapturedOutput(captured), target);
  assert.deepEqual(Object.keys(captured).sort(), [
    "mode", "path", "requested", "sha256", "size", "type",
  ]);
  fs.appendFileSync(target, "drift\n");
  assert.throws(() => validateCapturedOutput(captured), /changed after capture/);
});
