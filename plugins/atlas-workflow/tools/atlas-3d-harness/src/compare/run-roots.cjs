"use strict";

const fs = require("fs");
const path = require("path");
const { POLICY, TOLERANCE } = require("../domain/semantics.cjs");
const { fileDigest, sha256 } = require("../security/digest.cjs");
const { safeEvidenceFile } = require("../protocol/capture-set.cjs");
const { LIMITS, enforceByteLength } = require("../protocol/limits.cjs");
const { readJson, validate } = require("../protocol/schema.cjs");

const PURPOSES = Object.freeze(["semantic-state", "render-review"]);
const canonicalJson = (value) => JSON.stringify(value, (_, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const digestValue = (value) => sha256(Buffer.from(canonicalJson(value)));
function canonicalRoot(value) {
  if (typeof value !== "string" || !path.isAbsolute(value) || path.resolve(value) !== value) throw new Error("COMPARE_ROOT_CANONICAL_ABSOLUTE_REQUIRED");
  const stat = fs.lstatSync(value); if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(value) !== value) throw new Error("COMPARE_ROOT_REGULAR_DIRECTORY_REQUIRED");
  return value;
}
function treeFingerprint(root) {
  const rows = [], walk = (directory) => {
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name), relative = path.relative(root, file), stat = fs.lstatSync(file, { bigint: true });
      if (stat.isSymbolicLink()) throw new Error("COMPARE_TREE_SYMLINK_REJECTED");
      if (stat.isDirectory()) walk(file);
      else if (stat.isFile()) {
        if (rows.length >= LIMITS.max_temp_files) throw new Error("COMPARE_TREE_FILE_LIMIT");
        const png = relative.endsWith(".png");
        const metadata = [stat.dev, stat.ino, stat.size, stat.mode, stat.mtimeNs, stat.ctimeNs, stat.birthtimeNs].map(String).join(":");
        rows.push([relative, String(stat.size), png ? metadata : fileDigest(file)]);
      } else throw new Error("COMPARE_TREE_SPECIAL_FILE_REJECTED");
    }
  }; walk(root); return digestValue(rows);
}
function loadValidatedRoot(root) {
  const before = treeFingerprint(root);
  const checked = require("../cli/main.cjs").checkDomain(root);
  if (checked.status !== "passed") throw new Error(`COMPARE_PREREQUISITE_${checked.reason}`);
  const contract = validate("run-contract.schema.json", readJson(path.join(root, "frozen-contract")));
  const attemptRoot = path.join(root, "attempt-1");
  const manifest = validate("capture-set.schema.json", readJson(safeEvidenceFile(attemptRoot, "capture-set.json", LIMITS.max_raw_bytes)));
  const captures = manifest.captures.map((entry) => validate("capture.schema.json", readJson(safeEvidenceFile(attemptRoot, entry.capture_path, LIMITS.max_raw_bytes + LIMITS.max_canonical_bytes))));
  return { root, before, contract, manifest, captures };
}
function semanticContractIdentity(contract) {
  return digestValue({ protocol: "atlas-3d-capture-set@1", page_protocol: "atlas-3d-page@1", policy: POLICY, tolerance: TOLERANCE, canonical_schema: fileDigest(path.resolve(__dirname, "../../contracts/canonical-state.schema.json")), raw_schema: fileDigest(path.resolve(__dirname, "../../contracts/raw-capture.schema.json")), adapter_semantics: contract.resources.page_adapter });
}
function hardIdentity(item) {
  const scenario = item.contract.scenario;
  return {
    protocol: item.manifest.protocol,
    semantic_contract: semanticContractIdentity(item.contract),
    coordinate_numeric_policy: digestValue(scenario.expected.semantics),
    scenario_expected: digestValue({ scenario_id: scenario.scenario_id, expected: scenario.expected }),
    fixture_seed_epoch: digestValue({ fixture: scenario.fixture, seed: scenario.seed, epoch_ms: scenario.epoch_ms }),
    capabilities_profiles: digestValue({ capabilities: scenario.required_capabilities, profiles: scenario.required_profiles }),
    input_set: digestValue({ checkpoints: scenario.checkpoints, views: scenario.views, viewports: scenario.viewports }),
    resource_asset_set: digestValue(item.contract.resources),
  };
}
function renderPairIdentity(item) {
  const scenario = item.contract.scenario;
  return { protocol: item.manifest.protocol, scenario_fixture: digestValue({ scenario_id: scenario.scenario_id, fixture: scenario.fixture }), input_set: digestValue({ checkpoints: scenario.checkpoints, views: scenario.views, viewports: scenario.viewports }), targets: digestValue(item.captures.map((capture) => capture.raw.object.id)) };
}
function softIdentity(item) {
  const first = item.captures[0];
  return { implementation_head: item.contract.provenance.source_head, browser_binary_driver: item.contract.provenance.browser_binary_digest, browser_version: first.transport.browser_version, browser_launch: first.transport.actual_launch_argv_digest, os_arch: item.contract.runtime.host_profile, gpu_driver: "not-recorded@reviewed-local-1", headless: first.transport.launch_argv.includes("--headless=new"), viewport_dpr: digestValue(item.manifest.captures.map((entry) => entry.viewport)), colorspace: "not-recorded@reviewed-local-1", camera: digestValue(item.captures.map((capture) => capture.canonical.camera)), render_pipeline: digestValue({ three: item.contract.resources.three, three_core: item.contract.resources.three_core }), asset: item.contract.resources.scene, adapter: item.contract.resources.page_adapter };
}
function drift(left, right) { return Object.keys(left).filter((key) => canonicalJson(left[key]) !== canonicalJson(right[key])).sort(); }
function semanticResult(left, right) {
  const leftByKey = new Map(left.manifest.captures.map((entry, index) => [entry.key, left.captures[index].canonical]));
  const rightByKey = new Map(right.manifest.captures.map((entry, index) => [entry.key, right.captures[index].canonical]));
  const keys = [...new Set([...leftByKey.keys(), ...rightByKey.keys()])].sort(), diffs = [];
  for (const key of keys) {
    const a = leftByKey.get(key), b = rightByKey.get(key);
    if (canonicalJson(a) !== canonicalJson(b)) {
      const fields = [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].filter((field) => canonicalJson(a?.[field]) !== canonicalJson(b?.[field])).sort().slice(0, 32);
      diffs.push({ key, fields });
      if (diffs.length === 64) break;
    }
  }
  return { status: diffs.length ? "different" : "equal", diffs };
}
function renderResult(left, right) {
  const rightByKey = new Map(right.manifest.captures.map((entry, index) => [entry.key, { entry, capture: right.captures[index] }])), pairs = [];
  for (let index = 0; index < left.manifest.captures.length; index += 1) { const a = left.manifest.captures[index], b = rightByKey.get(a.key), target = left.captures[index].raw.object.id; if (!b) return { status: "not_comparable", reason: `missing render pair ${a.key}`, pairs: [] }; if (target !== b.capture.raw.object.id) return { status: "not_comparable", reason: `render target drift ${a.key}`, pairs: [] }; pairs.push({ key: a.key, target_id: target, left: { path: a.png_path, sha256: a.png_sha256 }, right: { path: b.entry.png_path, sha256: b.entry.png_sha256 } }); }
  if (pairs.length !== right.manifest.captures.length) return { status: "not_comparable", reason: "render pair cardinality mismatch", pairs: [] };
  return { status: "paired", scenario_id: left.contract.scenario.scenario_id, fixture_id: left.contract.scenario.fixture.id, pairs };
}
function compareRunRoots({ left: leftInput, right: rightInput, purpose }) {
  if (!PURPOSES.includes(purpose)) throw new Error(`UNSUPPORTED_COMPARE_PURPOSE ${purpose}`);
  let left, right;
  try { left = loadValidatedRoot(canonicalRoot(leftInput)); right = loadValidatedRoot(canonicalRoot(rightInput)); }
  catch (error) { return { schema_version: 1, purpose, status: "not_comparable", reason: String(error.message || error).slice(0, 240), warnings: [] }; }
  const hardDrift = drift(purpose === "semantic-state" ? hardIdentity(left) : renderPairIdentity(left), purpose === "semantic-state" ? hardIdentity(right) : renderPairIdentity(right));
  const warnings = drift(softIdentity(left), softIdentity(right)).map((field) => `soft drift: ${field}`);
  let result = hardDrift.length ? { status: "not_comparable", reason: `hard identity drift: ${hardDrift.join(",")}` } : purpose === "semantic-state" ? semanticResult(left, right) : renderResult(left, right);
  const afterLeft = treeFingerprint(left.root), afterRight = treeFingerprint(right.root);
  if (afterLeft !== left.before || afterRight !== right.before) throw new Error("COMPARE_MUTATED_INPUT_TREE");
  result = { schema_version: 1, purpose, ...result, warnings };
  enforceByteLength(JSON.stringify(result), LIMITS.max_adapter_stdout_bytes, "COMPARE_OUTPUT_LIMIT");
  return result;
}

module.exports = { PURPOSES, compareRunRoots, testing: Object.freeze({ drift, hardIdentity, renderPairIdentity, renderResult, semanticResult, treeFingerprint }) };
