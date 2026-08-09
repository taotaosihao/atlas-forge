"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const test = require("node:test");
const { validate } = require("../../src/protocol/schema.cjs");
const { LOWER_QUATERNION_NORM, UPPER_QUATERNION_NORM, close, quantize, quaternion } = require("../../src/domain/semantics.cjs");
const { canonicalize } = require("../../src/canonical/base.cjs");
const { makeCapture } = require("../support/domain-capture.cjs");
const base = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../examples/basic-three/scenario.json")));
const industrial = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../examples/basic-three/industrial-scenario.json")));
const oraclePath = require.resolve("../../src/oracles/domain.cjs");
const industrialOraclePath = require.resolve("../../src/oracles/industrial.cjs");
const oracle = () => require(oraclePath);

function semanticFault(name, scenario, capture, expectedReason) {
  validate("raw-capture.schema.json", capture.raw);
  capture.canonical = canonicalize(capture.raw);
  validate("capture.schema.json", capture);
  const result = oracle().evaluateDomain(scenario, capture);
  assert.strictEqual(result.status, "failed", name);
  assert.match(result.reason, expectedReason, name);
  assert(result.reason.length <= 160, name);
}

test("literal base and industrial tables cover every 2 viewport x 2 view x 3 checkpoint combination", () => {
  for (const scenario of [base, industrial]) {
    let combinations = 0;
    const series = scenario.checkpoints.map((checkpoint) => makeCapture(scenario, checkpoint.name, "hero"));
    assert.strictEqual(oracle().evaluateSeries(scenario, series).status, "passed");
    for (const viewport of scenario.viewports) for (const view of scenario.views) for (const checkpoint of scenario.checkpoints) {
      assert(viewport.width > 0);
      assert.deepStrictEqual(oracle().evaluateDomain(scenario, makeCapture(scenario, checkpoint.name, view, viewport)), { status: "passed", reason: scenario.required_profiles.length ? "industrial profile domain passed" : "base profile domain passed" });
      combinations += 1;
    }
    assert.strictEqual(combinations, 12);
  }
});

test("base profile does not load industrial oracle or expose industrial facts", () => {
  delete require.cache[oraclePath]; delete require.cache[industrialOraclePath];
  const baseOracle = require(oraclePath), capture = makeCapture(base, "home", "hero");
  assert.strictEqual(baseOracle.evaluateDomain(base, capture).status, "passed");
  assert.strictEqual(require.cache[industrialOraclePath], undefined);
  assert.strictEqual(capture.raw.industrial, undefined);
  for (const forbidden of ["visible", "frustum", "projected_share", "joint_valid", "attachment_valid", "verdict"]) assert.strictEqual(JSON.stringify(capture.raw).includes(`\"${forbidden}\"`), false);
});

test("profile, capability, industrial field, interaction, and unknown-field negatives are schema-invalid", () => {
  const baseWithIndustrialCapability = structuredClone(base); baseWithIndustrialCapability.required_capabilities.push("kinematics.joints@1");
  const baseWithIndustrialExpected = structuredClone(base); baseWithIndustrialExpected.expected.industrial = structuredClone(industrial.expected.industrial);
  const industrialWithoutProfile = structuredClone(industrial); industrialWithoutProfile.required_profiles = [];
  const hitTest = structuredClone(base); hitTest.required_capabilities.push("interaction.hit-test@1");
  const unknown = structuredClone(base); unknown.expected.scene.nodes[0].verdict = "passed";
  for (const value of [baseWithIndustrialCapability, baseWithIndustrialExpected, industrialWithoutProfile, hitTest, unknown]) assert.throws(() => validate("scenario.schema.json", value), /invalid/);
  const baseRawWithIndustrial = makeCapture(base, "home", "hero").raw; baseRawWithIndustrial.industrial = structuredClone(makeCapture(industrial, "home", "hero").raw.industrial);
  assert.throws(() => validate("raw-capture.schema.json", baseRawWithIndustrial), /invalid/);
});

test("finite, negative-zero, quaternion normalization, and half-away quantization boundaries are frozen", () => {
  assert.strictEqual(quantize(0.000000499999), 0);
  assert.strictEqual(quantize(0.0000005), 0.000001);
  assert.strictEqual(quantize(-0.000000499999), 0);
  assert.strictEqual(quantize(-0.0000005), -0.000001);
  assert.strictEqual(quantize(-0), 0);
  assert.throws(() => quantize(Infinity), /NUMERIC_POLICY/);
  const boundaryEpsilon = Number.EPSILON * 4;
  assert.throws(() => quaternion([0, 0, 0, LOWER_QUATERNION_NORM - boundaryEpsilon]), /QUATERNION_NORMALIZATION/, "lower outside just below must reject");
  assert.doesNotThrow(() => quaternion([0, 0, 0, LOWER_QUATERNION_NORM]), "lower exact must accept");
  assert.doesNotThrow(() => quaternion([0, 0, 0, LOWER_QUATERNION_NORM + boundaryEpsilon]), "lower inside just above must accept");
  assert.doesNotThrow(() => quaternion([0, 0, 0, UPPER_QUATERNION_NORM - boundaryEpsilon]), "upper inside just below must accept");
  assert.doesNotThrow(() => quaternion([0, 0, 0, UPPER_QUATERNION_NORM]), "upper exact must accept");
  assert.throws(() => quaternion([0, 0, 0, UPPER_QUATERNION_NORM + boundaryEpsilon]), /QUATERNION_NORMALIZATION/, "upper outside just above must reject");
  assert.throws(() => quaternion([0, 0, 0, 1.00000149]), /QUATERNION_NORMALIZATION/);
  assert.throws(() => quaternion([0, 0, 0, NaN]), /NUMERIC_POLICY/);
  assert.strictEqual(close([0], [0.000001]), false, "oracle comparison must not add a second tolerance after quantization");
});

test("canonicalization is profile-complete, exact-bound, and idempotent", () => {
  for (const scenario of [base, industrial]) {
    const capture = makeCapture(scenario, "mid", "profile");
    validate("capture.schema.json", capture);
    assert.deepStrictEqual(canonicalize(capture.canonical), capture.canonical);
    assert.strictEqual(capture.canonical.profile, capture.raw.profile);
  }
  const baseMutations = [
    (value) => value.object.world_matrix[12] = 1,
    (value) => value.object.aabb_min[0] -= 1,
    (value) => value.camera.matrix_world_inverse[12] = 1,
    (value) => value.timeline.joint_radians = 0.25
  ];
  for (const mutate of baseMutations) {
    const capture = makeCapture(base, "home", "hero"); mutate(capture.canonical);
    validate("capture.schema.json", capture);
    assert.match(oracle().evaluateDomain(base, capture).reason, /CANONICAL_BINDING/);
  }
  for (const mutate of [
    (value) => value.industrial.joint.world_matrix[12] = 1,
    (value) => value.industrial.socket.world_matrix[12] = 1,
    (value) => value.industrial.attachment.world_matrix[12] = 1
  ]) {
    const capture = makeCapture(industrial, "home", "hero"); mutate(capture.canonical);
    validate("capture.schema.json", capture);
    assert.match(oracle().evaluateDomain(industrial, capture).reason, /CANONICAL_BINDING/);
  }
  const baseWithIndustrial = makeCapture(base, "home", "hero"); baseWithIndustrial.canonical = structuredClone(baseWithIndustrial.canonical); baseWithIndustrial.canonical.industrial = structuredClone(makeCapture(industrial, "home", "hero").canonical.industrial);
  assert.throws(() => validate("capture.schema.json", baseWithIndustrial), /invalid/);
  const industrialMissing = makeCapture(industrial, "home", "hero"); industrialMissing.canonical = structuredClone(industrialMissing.canonical); delete industrialMissing.canonical.industrial;
  assert.throws(() => validate("capture.schema.json", industrialMissing), /invalid/);
});

test("valid-but-wrong base facts are independently rejected", () => {
  const wrongParent = makeCapture(base, "home", "hero"); wrongParent.raw.object.parent_id = "wrong-parent";
  semanticFault("wrong parent", base, wrongParent, /SCENE_PARENT/);
  const rowMajor = makeCapture(base, "mid", "hero");
  const transpose = (matrix) => matrix.map((_, index) => matrix[(index % 4) * 4 + Math.floor(index / 4)]);
  rowMajor.raw.object.parent_world_matrix = transpose(rowMajor.raw.object.parent_world_matrix); rowMajor.raw.object.world_matrix = transpose(rowMajor.raw.object.world_matrix);
  semanticFault("row versus column major", base, rowMajor, /PARENT_WORLD_MATRIX/);
  const wrongOrder = makeCapture(base, "home", "hero"); wrongOrder.raw.object.world_matrix[12] = 1;
  semanticFault("wrong multiplication order", base, wrongOrder, /TRANSFORM_COMPOSITION/);
  const degrees = makeCapture(base, "mid", "hero"); degrees.raw.timeline.joint_radians = 0.5 * Math.PI / 180;
  semanticFault("degrees as radians", base, degrees, /TIMELINE_RADIANS/);
  const clipping = makeCapture(base, "home", "hero"); clipping.raw.camera.near = 101;
  semanticFault("near far clipping", base, clipping, /CAMERA_CLIPPING/);
  const outside = makeCapture(base, "home", "hero"); outside.raw.camera.matrix_world_inverse[12] = 1000;
  semanticFault("target outside frustum", base, outside, /CAMERA_VIEW_MATRIX/);
  const coupledPageError = makeCapture(base, "home", "hero");
  coupledPageError.raw.object.parent_world_matrix[12] = 2; coupledPageError.raw.object.world_matrix[12] = 2; coupledPageError.raw.object.aabb_min[0] += 2; coupledPageError.raw.object.aabb_max[0] += 2;
  semanticFault("Page rendering and raw facts share the same wrong transform", base, coupledPageError, /PARENT_WORLD_MATRIX/);
});

test("valid-but-wrong industrial facts are independently rejected", () => {
  const wrongAxis = makeCapture(industrial, "mid", "hero"); wrongAxis.raw.industrial.joint.axis_local = [1, 0, 0];
  semanticFault("wrong joint-local axis", industrial, wrongAxis, /JOINT_LOCAL_AXIS/);
  const wrongPivot = makeCapture(industrial, "mid", "hero"); wrongPivot.raw.industrial.joint.origin_local = [1, 0, 0];
  semanticFault("wrong pivot origin", industrial, wrongPivot, /JOINT_ORIGIN/);
  const wrongAncestry = makeCapture(industrial, "home", "hero"); wrongAncestry.raw.industrial.attachment.ancestry[2] = "wrong-visual";
  semanticFault("attachment ancestry", industrial, wrongAncestry, /ATTACHMENT_ANCESTRY/);
  const wrongRoot = makeCapture(industrial, "home", "hero"); wrongRoot.raw.industrial.anchor.root_id = "detached-root"; wrongRoot.raw.industrial.anchor.joint_parent_id = "detached-root";
  semanticFault("wrong industrial root", industrial, wrongRoot, /INDUSTRIAL_ANCHOR_IDS/);
  const wrongVisualParent = makeCapture(industrial, "home", "hero"); wrongVisualParent.raw.industrial.anchor.visual_parent_id = "wrong-joint";
  semanticFault("wrong visual parent", industrial, wrongVisualParent, /INDUSTRIAL_ANCHOR_IDS/);
  const splitIdentityScenario = structuredClone(industrial); splitIdentityScenario.expected.scene.nodes[0].parent_id = "shadow-visual";
  validate("scenario.schema.json", splitIdentityScenario);
  const splitIdentity = makeCapture(industrial, "home", "hero"); splitIdentity.raw.object.parent_id = "shadow-visual";
  semanticFault("base and industrial visual identities split despite equal matrices", splitIdentityScenario, splitIdentity, /INDUSTRIAL_EXPECTED_VISUAL_IDENTITY/);
  const detached = makeCapture(industrial, "home", "hero");
  for (const matrix of [detached.raw.industrial.anchor.root_world_matrix, detached.raw.industrial.joint.parent_world_matrix, detached.raw.industrial.joint.world_matrix, detached.raw.industrial.anchor.visual_world_matrix, detached.raw.industrial.socket.world_matrix, detached.raw.industrial.attachment.world_matrix]) matrix[12] += 10;
  semanticFault("self-consistent industrial chain detached from base scene", industrial, detached, /INDUSTRIAL_ROOT_WORLD|VISUAL_BASE_OBJECT_ANCHOR/);
  const nonUniform = makeCapture(industrial, "home", "hero"); nonUniform.raw.industrial.attachment.ancestry_scales[1] = [1, 2, 1];
  semanticFault("non-uniform attachment ancestry", industrial, nonUniform, /ATTACHMENT_NON_UNIFORM_ANCESTRY/);
  const strictContinuity = structuredClone(industrial); strictContinuity.expected.industrial.attachment.max_step_meters = 0.1;
  validate("scenario.schema.json", strictContinuity);
  const series = strictContinuity.checkpoints.map((checkpoint) => makeCapture(strictContinuity, checkpoint.name, "hero"));
  assert.match(oracle().evaluateSeries(strictContinuity, series).reason, /ATTACHMENT_CONTINUITY/);
  const wrapped = structuredClone(industrial);
  wrapped.expected.timeline[0].joint_radians = 3; wrapped.expected.timeline[1].joint_radians = -3;
  const previous = makeCapture(industrial, "home", "hero").raw, current = makeCapture(industrial, "mid", "hero").raw;
  previous.industrial.joint.position_radians = 3; current.industrial.joint.position_radians = -3;
  assert.throws(() => require("../../src/oracles/industrial.cjs").validateIndustrialStep(wrapped, previous, current), /JOINT_CONTINUOUS_SHORTEST_PATH/);
});

test("Node oracle graph uses gl-matrix but never Three.js or Page solver modules", () => {
  delete require.cache[oraclePath]; delete require.cache[industrialOraclePath];
  const before = new Set(Object.keys(require.cache));
  const loadedOracle = require(oraclePath);
  loadedOracle.evaluateDomain(industrial, makeCapture(industrial, "home", "hero"));
  const newlyLoaded = Object.keys(require.cache).filter((file) => !before.has(file));
  assert(newlyLoaded.some((file) => file.includes("gl-matrix")) || Object.keys(require.cache).some((file) => file.includes("gl-matrix")));
  assert.strictEqual(newlyLoaded.some((file) => file.includes("node_modules/three") || file.endsWith("src/page/page-adapter.mjs") || file.endsWith("examples/basic-three/scene.mjs")), false);
});
