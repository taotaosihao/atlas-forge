"use strict";

const path = require("path");
const {
  checkRun,
  run,
  stableJson,
} = require(path.resolve(__dirname, "../../../../../../workflow/bin/lib/codex-web-acceptance/core.js"));

function exactKeys(value, required) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("kernel worker request must be an object");
  const unknown = Object.keys(value).filter((key) => !required.includes(key));
  if (unknown.length || required.some((key) => !(key in value))) throw new Error("kernel worker request fields are invalid");
}

function dispatch(request) {
  if (request?.operation === "run") {
    exactKeys(request, ["operation", "project_config", "contract", "artifact_root", "run_id", "attempts"]);
    return run({
      projectConfig: request.project_config,
      contract: request.contract,
      artifactRoot: request.artifact_root,
      runId: request.run_id,
      attempts: request.attempts,
      allowedPhases: ["capture"],
    });
  }
  if (request?.operation === "check-run") {
    exactKeys(request, ["operation", "run_root"]);
    return checkRun({ runRoot: request.run_root });
  }
  throw new Error("kernel worker operation is unsupported");
}

if (require.main === module) {
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { input += chunk; });
  process.stdin.on("end", () => {
    try {
      process.stdout.write(stableJson(dispatch(JSON.parse(input))));
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    }
  });
}

module.exports = { dispatch };
