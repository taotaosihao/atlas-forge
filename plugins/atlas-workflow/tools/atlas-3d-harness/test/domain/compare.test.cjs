"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const test = require("node:test");
const { dispatch } = require("../../src/cli/main.cjs");
const { compareRunRoots, testing } = require("../../src/compare/run-roots.cjs");
const { invokeKernelWorker } = require("../../src/kernel-integration/launcher.cjs");

const baseScenario = path.resolve(__dirname, "../../examples/basic-three/scenario.json");
const industrialScenario = path.resolve(__dirname, "../../examples/basic-three/industrial-scenario.json");
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "atlas-3d-compare-"))), runs = path.join(root, "runs"), runtime = path.join(root, "runtime.json");
  fs.mkdirSync(runs); fs.writeFileSync(runtime, `${JSON.stringify({ schema_version: 1, trust_profile: "reviewed-local@1", project_root: path.dirname(baseScenario), origin: "http://127.0.0.1:41733", host_profile: "current-mac-arm64@1", attempts: 1 })}\n`);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const run = (scenario, id) => dispatch(["run", "--scenario", scenario, "--runtime-config", runtime, "--artifact-root", runs, "--run-id", id]).run_root;
  return { root, run };
}
function independentlyValidatedDifferentRoot(root, sourceRun) {
  const config = JSON.parse(fs.readFileSync(path.join(sourceRun, "frozen-project-config.json"))), configFile = path.join(root, "different-project.json"), runs = path.join(root, "different-runs");
  config.adapter.argv = [process.execPath, path.resolve(__dirname, "../fixtures/different-evidence-adapter.cjs"), path.join(sourceRun, "attempt-1")]; fs.writeFileSync(configFile, `${JSON.stringify(config)}\n`);
  const run = invokeKernelWorker({ operation: "run", project_config: configFile, contract: path.join(sourceRun, "frozen-contract"), artifact_root: runs, run_id: "validated-different", attempts: 1 });
  assert.strictEqual(run.result.technical_status, "passed"); assert.strictEqual(dispatch(["check-run", "--run-root", run.run_root]).status, "passed"); return run.run_root;
}

test("semantic-state and render-review compare two independently passed complete real roots read-only", (t) => {
  const item = fixture(t), left = item.run(baseScenario, "left"), right = item.run(baseScenario, "right");
  const before = [testing.treeFingerprint(left), testing.treeFingerprint(right)];
  const semantic = compareRunRoots({ left, right, purpose: "semantic-state" });
  assert.deepStrictEqual({ status: semantic.status, diffs: semantic.diffs }, { status: "equal", diffs: [] });
  assert.deepStrictEqual(semantic.warnings, ["soft drift: browser_launch"]);
  const cli = spawnSync(process.execPath, [path.resolve(__dirname, "../../bin/atlas-3d-harness.cjs"), "compare", "--left", left, "--right", right, "--purpose", "semantic-state"], { encoding: "utf8", maxBuffer: 1024 * 1024 }); assert.strictEqual(cli.status, 0); assert.strictEqual(JSON.parse(cli.stdout).status, "equal");
  const render = compareRunRoots({ left, right, purpose: "render-review" });
  assert.strictEqual(render.status, "paired"); assert.strictEqual(render.pairs.length, 12);
  assert(render.pairs.every((pair) => pair.left.path.endsWith(".png") && pair.right.path.endsWith(".png") && /^[a-f0-9]{64}$/.test(pair.left.sha256)));
  assert.deepStrictEqual([testing.treeFingerprint(left), testing.treeFingerprint(right)], before);
  const changed = independentlyValidatedDifferentRoot(item.root, right);
  const different = compareRunRoots({ left, right: changed, purpose: "semantic-state" }); assert.strictEqual(different.status, "different"); assert.deepStrictEqual(different.diffs[0], { key: "vp-640x480-dpr-1--view-hero--checkpoint-home", fields: ["render_revision", "rendered_state_revision", "state_revision"] });
});

test("hard identity drift, tamper, missing root, and symlink root never become pass", (t) => {
  const item = fixture(t), base = item.run(baseScenario, "base"), industrial = item.run(industrialScenario, "industrial");
  assert.strictEqual(compareRunRoots({ left: base, right: industrial, purpose: "semantic-state" }).status, "not_comparable");
  const link = path.join(item.root, "run-link"); fs.symlinkSync(base, link);
  assert.strictEqual(compareRunRoots({ left: link, right: base, purpose: "semantic-state" }).status, "not_comparable");
  assert.strictEqual(compareRunRoots({ left: path.join(item.root, "missing"), right: base, purpose: "render-review" }).status, "not_comparable");
  const manifest = JSON.parse(fs.readFileSync(path.join(base, "attempt-1/capture-set.json"))), capture = path.join(base, "attempt-1", manifest.captures[0].capture_path);
  fs.appendFileSync(capture, " ");
  assert.strictEqual(compareRunRoots({ left: base, right: industrial, purpose: "semantic-state" }).status, "not_comparable");
});

test("purpose and drift truth table is deterministic and bounded", () => {
  for (const purpose of ["pixel-regression", "performance", "unknown"]) assert.throws(() => compareRunRoots({ left: "/tmp/a", right: "/tmp/b", purpose }), /UNSUPPORTED_COMPARE_PURPOSE/);
  const make = (value) => ({ contract: { scenario: { scenario_id: "s", fixture: { id: "f" } } }, manifest: { captures: [{ key: "k", png_path: "png/k.png", png_sha256: value }] }, captures: [{ raw: { object: { id: "cube" } }, canonical: { object: { id: "cube", value } } }] });
  assert.deepStrictEqual(testing.semanticResult(make("a"), make("a")), { status: "equal", diffs: [] });
  assert.deepStrictEqual(testing.semanticResult(make("a"), make("b")), { status: "different", diffs: [{ key: "k", fields: ["object"] }] });
  assert.strictEqual(testing.renderResult(make("a"), make("b")).status, "paired");
  assert.deepStrictEqual(testing.drift({ a: 1, b: 2 }, { a: 1, b: 3 }), ["b"]);
});

test("render-review fails closed when a same-size PNG is overwritten after validation", (t) => {
  const item = fixture(t), left = item.run(baseScenario, "left-overwrite"), right = item.run(baseScenario, "right-overwrite");
  const main = require("../../src/cli/main.cjs"), originalCheck = main.checkDomain;
  const manifest = JSON.parse(fs.readFileSync(path.join(left, "attempt-1/capture-set.json"))), png = path.join(left, "attempt-1", manifest.captures[0].png_path), size = fs.statSync(png).size;
  let overwritten = false;
  main.checkDomain = (root) => { const result = originalCheck(root); if (!overwritten && root === left) { fs.writeFileSync(png, Buffer.alloc(size, 0x42)); overwritten = true; } return result; };
  try { assert.throws(() => compareRunRoots({ left, right, purpose: "render-review" }), /COMPARE_MUTATED_INPUT_TREE/); }
  finally { main.checkDomain = originalCheck; }
  assert.strictEqual(overwritten, true);
});
