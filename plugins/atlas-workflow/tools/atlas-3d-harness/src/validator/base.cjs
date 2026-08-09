"use strict";
const fs = require("fs");
const path = require("path");
const { evaluateDomain } = require("../oracles/domain.cjs");
const { validate } = require("../protocol/schema.cjs");
const { loadCaptureSet } = require("../protocol/capture-set.cjs");
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => input += chunk);
process.stdin.on("end", () => {
  try {
    const request = JSON.parse(input), ctx = request.run_context;
    if (!ctx || ctx.artifact_root !== path.join(path.dirname(ctx.artifact_root), `attempt-${ctx.attempt}`)) throw new Error("current attempt authority missing");
    const runRoot = path.dirname(ctx.artifact_root);
    const contract = validate("run-contract.schema.json", JSON.parse(fs.readFileSync(path.join(runRoot, "frozen-contract"), "utf8")));
    const loaded = loadCaptureSet(ctx.artifact_root, contract.scenario);
    let result = { status: "passed", reason: "complete capture matrix passed" };
    for (const capture of loaded.captures) { result = evaluateDomain(contract.scenario, capture); if (result.status !== "passed") break; }
    if (result.status === "passed") for (const viewport of contract.scenario.viewports) for (const view of contract.scenario.views) {
      const series = loaded.captures.filter((capture) => capture.transport.pre.viewport_width === viewport.width && capture.transport.pre.viewport_height === viewport.height && capture.raw.view === view);
      result = require("../oracles/domain.cjs").evaluateSeries(contract.scenario, series); if (result.status !== "passed") break;
    }
    process.stdout.write(`${JSON.stringify({ protocol_version: "1", validator_id: request.validator_id, claim_id: request.claim_id, input_digest: request.input_digest, evidence_digest: request.evidence_digest, status: result.status, reason: result.reason })}\n`);
  } catch (error) { process.stderr.write(`${String(error.message || error).slice(0, 160)}\n`); process.exitCode = 1; }
});
