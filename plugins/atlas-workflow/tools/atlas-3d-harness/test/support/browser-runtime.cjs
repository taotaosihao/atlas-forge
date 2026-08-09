"use strict";
const fs = require("fs"); const os = require("os"); const path = require("path");
function makeAttemptRuntime(t, label = "browser") {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `atlas-3d-${label}-`))), runRoot = path.join(root, "run"), attemptRoot = path.join(runRoot, "attempt-1"), runId = `${label}-run`;
  fs.mkdirSync(attemptRoot, { recursive: true });
  fs.writeFileSync(path.join(runRoot, "manifest.json"), `${JSON.stringify({ schema_version: 1, task_id: "atlas-3d-harness", run_id: runId })}\n`);
  if (t) t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, runRoot, attemptRoot, identity: { run_id: runId, attempt: 1, source_head: "0".repeat(40) } };
}
module.exports = { makeAttemptRuntime };
