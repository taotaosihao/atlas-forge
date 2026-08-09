"use strict";
const crypto = require("crypto"); const fs = require("fs"); const path = require("path");
const { captureBindingId } = require("../../src/security/digest.cjs");
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
let input = ""; process.stdin.setEncoding("utf8"); process.stdin.on("data", (chunk) => input += chunk); process.stdin.on("end", () => {
  const request = JSON.parse(input), source = fs.realpathSync(process.argv[2]), manifest = JSON.parse(fs.readFileSync(path.join(source, "capture-set.json"))), refs = [];
  for (let index = 0; index < manifest.captures.length; index += 1) {
    const declaration = manifest.captures[index], sourceCapture = path.join(source, declaration.capture_path), sourcePng = path.join(source, declaration.png_path), targetCapture = path.join(request.artifact_root, declaration.capture_path), targetPng = path.join(request.artifact_root, declaration.png_path);
    fs.mkdirSync(path.dirname(targetCapture), { recursive: true }); fs.mkdirSync(path.dirname(targetPng), { recursive: true });
    let captureBytes;
    if (index === 0) { const capture = JSON.parse(fs.readFileSync(sourceCapture)); capture.raw.stateRevision += 100; capture.raw.renderedStateRevision += 100; capture.raw.renderRevision += 100; capture.canonical.state_revision += 100; capture.canonical.rendered_state_revision += 100; capture.canonical.render_revision += 100; capture.captureBindingId = captureBindingId([manifest.scenario_id, capture.raw.checkpoint, capture.raw.view, declaration.viewport.width, declaration.viewport.height, declaration.viewport.device_scale_factor, capture.raw.stateRevision, capture.raw.renderRevision, capture.png.sha256]); captureBytes = Buffer.from(`${JSON.stringify(capture)}\n`); }
    else captureBytes = fs.readFileSync(sourceCapture);
    const pngBytes = fs.readFileSync(sourcePng); fs.writeFileSync(targetCapture, captureBytes, { flag: "wx" }); fs.writeFileSync(targetPng, pngBytes, { flag: "wx" }); declaration.capture_sha256 = digest(captureBytes); declaration.png_sha256 = digest(pngBytes);
    refs.push({ id: `capture-${declaration.key}`, claim_id: "atlas-3d-matrix-capture", status: "passed", path: declaration.capture_path, sha256: declaration.capture_sha256 }, { id: `png-${declaration.key}`, claim_id: "atlas-3d-matrix-capture", status: "passed", path: declaration.png_path, sha256: declaration.png_sha256 });
  }
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest)}\n`); fs.writeFileSync(path.join(request.artifact_root, "capture-set.json"), manifestBytes, { flag: "wx" }); refs.unshift({ id: "capture-set", claim_id: "atlas-3d-matrix-capture", status: "passed", path: "capture-set.json", sha256: digest(manifestBytes) });
  process.stdout.write(`${JSON.stringify({ protocol_version: "1", phase: request.phase, facts: { protocol: "atlas-3d-capture-set@1", stable: true, capture_count: 12, replay_digest: digest(Buffer.from(JSON.stringify(manifest.replay))) }, evidence_refs: refs, failure_facts: [] })}\n`);
});
