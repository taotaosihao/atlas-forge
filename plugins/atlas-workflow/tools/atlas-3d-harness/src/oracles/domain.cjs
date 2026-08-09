"use strict";
const { mat4, vec4 } = require("gl-matrix");
const { validate } = require("../protocol/schema.cjs");
const { canonicalize } = require("../canonical/base.cjs");
const { POLICY, TOLERANCE, close, finiteVector, quantize, quaternion } = require("../domain/semantics.cjs");

class DomainFailure extends Error { constructor(code) { super(code); this.code = code; } }
const reject = (condition, code) => { if (condition) throw new DomainFailure(code); };
function matrix(value) { return finiteVector(value, 16); }
function expectClose(actual, expected, code, tolerance = TOLERANCE) { reject(!close(actual, expected, tolerance), code); }
function expectedFor(items, key, value, code) { const item = items.find((candidate) => candidate[key] === value); if (!item) throw new DomainFailure(code); return item; }
function localMatrix(node) {
  const output = mat4.create();
  mat4.fromRotationTranslationScale(output, quaternion(node.quaternion_xyzw), finiteVector(node.translation, 3), finiteVector(node.scale, 3));
  return Array.from(output);
}
function composedWorld(node) {
  const output = mat4.create();
  mat4.multiply(output, matrix(node.parent_world_matrix), localMatrix(node));
  return Array.from(output);
}
function projectionFacts(raw) {
  const combined = mat4.create();
  mat4.multiply(combined, matrix(raw.camera.projection_matrix), matrix(raw.camera.matrix_world_inverse));
  const min = finiteVector(raw.object.aabb_min, 3), max = finiteVector(raw.object.aabb_max, 3), points = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
    const clip = vec4.transformMat4(vec4.create(), vec4.fromValues(x, y, z, 1), combined);
    points.push([clip[0] / clip[3], clip[1] / clip[3], clip[2] / clip[3]]);
  }
  const visible = ![0, 1, 2].some((axis) => points.every((point) => point[axis] < -1) || points.every((point) => point[axis] > 1));
  const xs = points.map((point) => point[0]), ys = points.map((point) => point[1]);
  const width = Math.max(0, Math.min(1, Math.max(...xs)) - Math.max(-1, Math.min(...xs)));
  const height = Math.max(0, Math.min(1, Math.max(...ys)) - Math.max(-1, Math.min(...ys)));
  return { visible, projected_share: quantize(width * height / 4) };
}
function validateBase(scenario, capture) {
  const raw = validate("raw-capture.schema.json", capture.raw);
  const canonical = canonicalize(raw);
  reject(JSON.stringify(canonical) !== JSON.stringify(capture.canonical), "CANONICAL_BINDING");
  reject(JSON.stringify(scenario.expected.semantics) !== JSON.stringify(POLICY), "SEMANTICS_POLICY");
  const industrial = scenario.required_profiles.includes("industrial-kinematics@1");
  reject(raw.profile !== (industrial ? "industrial-kinematics@1" : "base@1"), "PROFILE_MISMATCH");
  const expectedNode = expectedFor(scenario.expected.scene.nodes, "id", raw.object.id, "OBJECT_IDENTITY");
  const expectedState = expectedFor(expectedNode.states, "checkpoint", raw.checkpoint, "SCENE_CHECKPOINT");
  reject(raw.object.parent_id !== expectedNode.parent_id, "SCENE_PARENT");
  expectClose(raw.object.translation, expectedNode.translation, "LOCAL_TRANSLATION");
  expectClose(quaternion(raw.object.quaternion_xyzw), expectedNode.quaternion_xyzw, "LOCAL_QUATERNION");
  expectClose(raw.object.scale, expectedNode.scale, "LOCAL_SCALE");
  expectClose(raw.object.parent_world_matrix, expectedState.parent_world_matrix, "PARENT_WORLD_MATRIX");
  expectClose(raw.object.world_matrix, composedWorld(raw.object), "TRANSFORM_COMPOSITION");
  expectClose(raw.object.world_matrix, expectedState.world_matrix, "WORLD_MATRIX");
  expectClose(raw.object.aabb_min, expectedState.aabb_min, "AABB_MIN");
  expectClose(raw.object.aabb_max, expectedState.aabb_max, "AABB_MAX");
  const checkpoint = expectedFor(scenario.expected.timeline, "name", raw.checkpoint, "CHECKPOINT_IDENTITY");
  reject(raw.timeline.time_ms !== checkpoint.time_ms, "TIMELINE_ABSOLUTE_SEEK");
  reject(Math.abs(quantize(raw.timeline.joint_radians) - quantize(checkpoint.joint_radians)) > TOLERANCE, "TIMELINE_RADIANS");
  const view = expectedFor(scenario.expected.views, "name", raw.view, "VIEW_IDENTITY");
  expectClose(raw.camera.matrix_world_inverse, view.camera_world_inverse, "CAMERA_VIEW_MATRIX");
  expectClose(raw.camera.projection_matrix, view.projection_matrix, "CAMERA_PROJECTION_MATRIX");
  reject(quantize(raw.camera.near) !== quantize(view.near) || quantize(raw.camera.far) !== quantize(view.far) || raw.camera.near >= raw.camera.far, "CAMERA_CLIPPING");
  const projected = projectionFacts(raw);
  reject(projected.visible !== view.visible, "FRUSTUM_VISIBILITY");
  const expectedShare = expectedFor(view.projected_shares, "checkpoint", raw.checkpoint, "PROJECTED_SHARE_CHECKPOINT");
  reject(Math.abs(projected.projected_share - quantize(expectedShare.value)) > TOLERANCE, "PROJECTED_SHARE");
  reject(capture.png.non_empty_pixels < scenario.expected.render.min_non_empty_pixels, "RENDER_EMPTY");
  const geometry = capture.transport.pre;
  const viewport = scenario.viewports.find((item) => item.width === geometry.viewport_width && item.height === geometry.viewport_height && quantize(item.device_scale_factor) === quantize(geometry.dpr));
  reject(!viewport || geometry.drawing_buffer_width !== Math.round(viewport.width * viewport.device_scale_factor) || geometry.drawing_buffer_height !== Math.round(viewport.height * viewport.device_scale_factor), "RENDER_VIEWPORT");
  reject(raw.stateRevision !== raw.renderedStateRevision || JSON.stringify(capture.transport.pre) !== JSON.stringify(capture.transport.post), "SAME_RENDER_CLOSURE");
  return raw;
}
function evaluateDomain(scenario, capture) {
  try {
    const raw = validateBase(scenario, capture);
    if (scenario.required_profiles.includes("industrial-kinematics@1")) require("./industrial.cjs").validateIndustrial(scenario, raw);
    return Object.freeze({ status: "passed", reason: scenario.required_profiles.length ? "industrial profile domain passed" : "base profile domain passed" });
  } catch (error) {
    const reason = error instanceof DomainFailure ? error.code : String(error.message || error).slice(0, 120);
    return Object.freeze({ status: "failed", reason: `domain:${reason}`.slice(0, 160) });
  }
}
function evaluateSeries(scenario, captures) {
  for (const capture of captures) { const result = evaluateDomain(scenario, capture); if (result.status !== "passed") return result; }
  try {
    reject(captures.length !== scenario.expected.timeline.length, "SERIES_LENGTH");
    for (let index = 0; index < captures.length; index += 1) reject(captures[index].raw.checkpoint !== scenario.expected.timeline[index].name, "SERIES_ORDER");
    for (let index = 1; index < captures.length; index += 1) {
      const previous = captures[index - 1].raw, current = captures[index].raw;
      if (current.industrial) require("./industrial.cjs").validateIndustrialStep(scenario, previous, current);
    }
    return Object.freeze({ status: "passed", reason: "domain series passed" });
  } catch (error) { return Object.freeze({ status: "failed", reason: `domain:${error.code || error.message}`.slice(0, 160) }); }
}
module.exports = { evaluateDomain, evaluateSeries, projectionFacts };
