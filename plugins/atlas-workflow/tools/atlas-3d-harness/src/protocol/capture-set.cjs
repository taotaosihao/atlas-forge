"use strict";

const fs = require("fs");
const path = require("path");
const { captureBindingId, fileDigest, sha256 } = require("../security/digest.cjs");
const { LIMITS } = require("./limits.cjs");
const { readJson, validate } = require("./schema.cjs");

const dprLabel = (value) => String(value).replace(".", "p");
function combination(viewport, view, checkpoint) {
  const viewportKey = `vp-${viewport.width}x${viewport.height}-dpr-${dprLabel(viewport.device_scale_factor)}`;
  const key = `${viewportKey}--view-${view}--checkpoint-${checkpoint}`;
  return Object.freeze({
    key,
    capturePath: `captures/${key}.json`,
    pngPath: `png/${viewportKey}/view-${view}/checkpoint-${checkpoint}.png`,
  });
}

function expectedCombinations(scenario) {
  const output = [];
  for (const viewport of scenario.viewports) for (const view of scenario.views) for (const checkpoint of scenario.checkpoints) output.push({ viewport, view, checkpoint, ...combination(viewport, view, checkpoint.name) });
  if (output.length !== LIMITS.max_capture_count) throw new Error("CAPTURE_COUNT_LIMIT");
  return output;
}

function safeEvidenceFile(root, relative, maxBytes) {
  if (typeof relative !== "string" || path.isAbsolute(relative) || relative.includes("\\") || relative.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("EVIDENCE_PATH_INVALID");
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error("EVIDENCE_PATH_ESCAPE");
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(resolved) !== resolved || stat.size > maxBytes) throw new Error("EVIDENCE_FILE_INVALID");
  return resolved;
}

function loadCaptureSet(attemptRoot, scenario) {
  const manifestFile = safeEvidenceFile(attemptRoot, "capture-set.json", LIMITS.max_raw_bytes);
  const manifest = validate("capture-set.schema.json", readJson(manifestFile, LIMITS.max_raw_bytes));
  if (manifest.scenario_id !== scenario.scenario_id) throw new Error("CAPTURE_SET_SCENARIO_MISMATCH");
  const expected = expectedCombinations(scenario);
  if (manifest.captures.length !== expected.length) throw new Error("CAPTURE_SET_COUNT_MISMATCH");
  const captures = [];
  for (let index = 0; index < expected.length; index += 1) {
    const declaration = manifest.captures[index], item = expected[index];
    if (declaration.key !== item.key || declaration.checkpoint !== item.checkpoint.name || declaration.view !== item.view || JSON.stringify(declaration.viewport) !== JSON.stringify(item.viewport) || declaration.capture_path !== item.capturePath || declaration.png_path !== item.pngPath) throw new Error("CAPTURE_SET_ORDER_OR_IDENTITY_MISMATCH");
    const captureFile = safeEvidenceFile(attemptRoot, declaration.capture_path, LIMITS.max_raw_bytes + LIMITS.max_canonical_bytes);
    const pngFile = safeEvidenceFile(attemptRoot, declaration.png_path, LIMITS.max_png_bytes);
    if (fileDigest(captureFile) !== declaration.capture_sha256 || fileDigest(pngFile) !== declaration.png_sha256) throw new Error("CAPTURE_SET_DIGEST_MISMATCH");
    const capture = validate("capture.schema.json", readJson(captureFile, LIMITS.max_raw_bytes + LIMITS.max_canonical_bytes));
    if (capture.png.path !== declaration.png_path || capture.png.sha256 !== declaration.png_sha256 || capture.raw.checkpoint !== declaration.checkpoint || capture.raw.view !== declaration.view) throw new Error("CAPTURE_SET_CONTENT_BINDING_MISMATCH");
    const binding = captureBindingId([scenario.scenario_id, declaration.checkpoint, declaration.view, declaration.viewport.width, declaration.viewport.height, declaration.viewport.device_scale_factor, capture.raw.stateRevision, capture.raw.renderRevision, capture.png.sha256]);
    if (capture.captureBindingId !== binding) throw new Error("CAPTURE_BINDING_ID_MISMATCH");
    captures.push(capture);
  }
  const semanticDigest = (capture) => { const canonical = structuredClone(capture.canonical); delete canonical.state_revision; delete canonical.rendered_state_revision; delete canonical.render_revision; return sha256(Buffer.from(JSON.stringify(canonical))); };
  const fresh = captures[0], replayBIndex = expected.findIndex((item) => item.viewport === scenario.viewports[0] && item.view === scenario.views[1] && item.checkpoint === scenario.checkpoints[1]), replayB = captures[replayBIndex];
  if (manifest.replay.key !== expected[0].key || manifest.replay.fresh_a_digest !== semanticDigest(fresh) || manifest.replay.same_context_b_digest !== semanticDigest(replayB) || manifest.replay.same_context_a_digest !== manifest.replay.fresh_a_digest || manifest.replay.second_fresh_a_digest !== manifest.replay.fresh_a_digest) throw new Error("REPLAY_BINDING_MISMATCH");
  return Object.freeze({ manifest, captures });
}

module.exports = { combination, expectedCombinations, loadCaptureSet, safeEvidenceFile };
