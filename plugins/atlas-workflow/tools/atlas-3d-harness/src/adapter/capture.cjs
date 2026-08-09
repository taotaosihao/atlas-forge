"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { startServer } = require("../launcher/server.cjs");
const { preflight } = require("../security/preflight.cjs");
const { validate } = require("../protocol/schema.cjs");
const { LIMITS, enforceByteLength } = require("../protocol/limits.cjs");
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
let input = "";
process.stdin.setEncoding("utf8"); process.stdin.on("data", (chunk) => { input += chunk; if (Buffer.byteLength(input) > LIMITS.max_adapter_stdout_bytes) throw new Error("adapter stdin cap exceeded"); });
process.stdin.on("end", async () => {
  let server;
  try {
    const request = JSON.parse(input); if (request.phase !== "capture") throw new Error("unsupported phase");
    preflight();
    const runRoot = path.dirname(request.artifact_root);
    const contract = validate("run-contract.schema.json", JSON.parse(fs.readFileSync(path.join(runRoot, "frozen-contract"), "utf8")));
    server = await startServer({ expectedDigests: contract.resources });
    if (JSON.stringify(contract.limits) !== JSON.stringify(LIMITS)) throw new Error("RUN_LIMITS_IDENTITY_MISMATCH");
    const { captureMatrix } = require("../transport/browser.cjs");
    const result = await captureMatrix({ origin: server.origin, scenario: contract.scenario, served: server.served, expectedDigests: contract.resources, attemptRoot: request.artifact_root, runIdentity: { run_id: request.run_id, attempt: request.attempt, source_head: contract.provenance.source_head } });
    const refs = [], entries = [], prepared = []; let tempFiles = 0, tempBytes = 0;
    for (const output of result.outputs) {
      const captureBytes = Buffer.from(`${JSON.stringify(output.capture)}\n`);
      enforceByteLength(captureBytes, LIMITS.max_raw_bytes + LIMITS.max_canonical_bytes, "CAPTURE_FILE_BYTE_LIMIT");
      tempFiles += 2; tempBytes += captureBytes.length + output.pngBytes.length;
      const captureSha = digest(captureBytes), pngSha = digest(output.pngBytes);
      entries.push({ key: output.key, checkpoint: output.checkpoint.name, view: output.view, viewport: output.viewport, capture_path: output.capturePath, capture_sha256: captureSha, png_path: output.capture.png.path, png_sha256: pngSha });
      refs.push({ id: `capture-${output.key}`, claim_id: "atlas-3d-matrix-capture", status: "passed", path: output.capturePath, sha256: captureSha }, { id: `png-${output.key}`, claim_id: "atlas-3d-matrix-capture", status: "passed", path: output.capture.png.path, sha256: pngSha });
      prepared.push({ capturePath: output.capturePath, captureBytes, pngPath: output.capture.png.path, pngBytes: output.pngBytes });
    }
    const manifest = validate("capture-set.schema.json", { schema_version: 1, protocol: "atlas-3d-capture-set@1", scenario_id: contract.scenario.scenario_id, capture_count: entries.length, captures: entries, replay: result.replay });
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest)}\n`); enforceByteLength(manifestBytes, LIMITS.max_raw_bytes, "CAPTURE_SET_BYTE_LIMIT");
    tempFiles += 1; tempBytes += manifestBytes.length;
    if (tempFiles > LIMITS.max_temp_files || tempBytes > LIMITS.max_temp_bytes || refs.length + 1 > LIMITS.max_evidence_refs) throw new Error("TEMP_OR_EVIDENCE_LIMIT");
    for (const item of prepared) {
      fs.mkdirSync(path.dirname(path.join(request.artifact_root, item.pngPath)), { recursive: true });
      fs.mkdirSync(path.dirname(path.join(request.artifact_root, item.capturePath)), { recursive: true });
      fs.writeFileSync(path.join(request.artifact_root, item.capturePath), item.captureBytes, { flag: "wx" });
      fs.writeFileSync(path.join(request.artifact_root, item.pngPath), item.pngBytes, { flag: "wx" });
    }
    fs.writeFileSync(path.join(request.artifact_root, "capture-set.json"), manifestBytes, { flag: "wx" });
    refs.unshift({ id: "capture-set", claim_id: "atlas-3d-matrix-capture", status: "passed", path: "capture-set.json", sha256: digest(manifestBytes) });
    const envelope = { protocol_version: "1", phase: request.phase, facts: { protocol: "atlas-3d-capture-set@1", stable: true, capture_count: entries.length, replay_digest: digest(Buffer.from(JSON.stringify(result.replay))) }, evidence_refs: refs, failure_facts: [] };
    const stdout = `${JSON.stringify(envelope)}\n`; enforceByteLength(stdout, LIMITS.max_adapter_stdout_bytes, "ADAPTER_STDOUT_LIMIT"); process.stdout.write(stdout);
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
  finally { if (server) await server.close().catch(() => {}); }
});
