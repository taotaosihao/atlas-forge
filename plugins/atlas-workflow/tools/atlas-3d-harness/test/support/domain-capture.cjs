"use strict";
const { mat4, vec3 } = require("gl-matrix");
const { canonicalize } = require("../../src/canonical/base.cjs");
const { combination } = require("../../src/protocol/capture-set.cjs");
const clean = (value) => Array.from(value, (item) => Object.is(item, -0) ? 0 : Number(item));
const identity = () => clean(mat4.create());
function makeCapture(scenario, checkpointName, viewName, viewport = scenario.viewports[0]) {
  const checkpoint = scenario.checkpoints.find((item) => item.name === checkpointName);
  const angle = checkpoint.time_ms / 1000;
  const parentWorld = mat4.create(); mat4.fromYRotation(parentWorld, angle);
  const extent = Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle));
  const cameraWorldInverse = mat4.create(); mat4.lookAt(cameraWorldInverse, viewName === "hero" ? [4, 3, 6] : [6, 2, 4], [0, 0, 0], [0, 1, 0]);
  const projection = mat4.create(); mat4.perspective(projection, 50 * Math.PI / 180, 4 / 3, 0.1, 100);
  const industrial = scenario.required_profiles.length > 0;
  const raw = { protocol_version: "atlas-3d-page@1", profile: industrial ? "industrial-kinematics@1" : "base@1", stateRevision: 2, renderedStateRevision: 2, renderRevision: 3, pending: 0, checkpoint: checkpointName, view: viewName, timeline: { time_ms: checkpoint.time_ms, joint_radians: angle }, selector: "canvas", object: { id: "reference-cube", parent_id: "joint-visual", translation: [0, 0, 0], quaternion_xyzw: [0, 0, 0, 1], scale: [1, 1, 1], parent_world_matrix: clean(parentWorld), world_matrix: clean(parentWorld), aabb_min: [-extent, -1, -extent], aabb_max: [extent, 1, extent] }, camera: { projection_matrix: clean(projection), matrix_world_inverse: clean(cameraWorldInverse), near: 0.1, far: 100 } };
  if (industrial) {
    const socketLocal = mat4.create(); mat4.fromTranslation(socketLocal, vec3.fromValues(1.5, 0, 0));
    const socketWorld = mat4.create(); mat4.multiply(socketWorld, parentWorld, socketLocal);
    const attachmentLocal = mat4.create(); mat4.fromTranslation(attachmentLocal, vec3.fromValues(0.25, 0, 0));
    const attachmentWorld = mat4.create(); mat4.multiply(attachmentWorld, socketWorld, attachmentLocal);
    raw.industrial = { anchor: { root_id: "reference-root", root_world_matrix: identity(), joint_parent_id: "reference-root", visual_id: "joint-visual", visual_parent_id: "pivot-joint", visual_local_matrix: identity(), visual_world_matrix: clean(parentWorld) }, joint: { id: "pivot-joint", origin_local: [0, 0, 0], axis_local: [0, 1, 0], position_radians: angle, parent_world_matrix: identity(), world_matrix: clean(parentWorld) }, socket: { id: "tool-socket", parent_id: "joint-visual", local_matrix: clean(socketLocal), world_matrix: clean(socketWorld) }, attachment: { id: "attached-tool", parent_id: "tool-socket", ancestry: ["reference-root", "pivot-joint", "joint-visual", "tool-socket", "attached-tool"], local_matrix: clean(attachmentLocal), world_matrix: clean(attachmentWorld), ancestry_scales: [[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1]] } };
  }
  const geometry = { x: 0, y: 0, width: viewport.width, height: viewport.height, scroll_x: 0, scroll_y: 0, viewport_width: viewport.width, viewport_height: viewport.height, dpr: viewport.device_scale_factor, drawing_buffer_width: Math.round(viewport.width * viewport.device_scale_factor), drawing_buffer_height: Math.round(viewport.height * viewport.device_scale_factor) };
  const resource = (name) => ({ path: `/${name}`, sha256: "b".repeat(64), bytes: 1 });
  const served = { index: resource("index"), scene: resource("scene"), page_adapter: resource("page-adapter"), three: resource("three"), three_core: resource("three-core") };
  const transport = { pre: geometry, post: structuredClone(geometry), served, browser_version: "149.0.7827.55", launch_argv: ["playwright-core@1.61.1", "chromium", "--headless=new"], actual_launch_argv: ["browser", "--one", "--two", "--three", "--four", "--five", "--six", "--seven", "--eight", "--user-data-dir=<ephemeral-profile>"], actual_launch_argv_digest: "c".repeat(64), owned_browser_pid: 1, process_audit: { process_count: 1, real_user_library_refs: 0, owned_runtime_refs: 1 } };
  return { schema_version: 1, captureBindingId: "a".repeat(64), raw, transport, canonical: canonicalize(raw), png: { path: combination(viewport, viewName, checkpointName).pngPath, sha256: "d".repeat(64), width: geometry.drawing_buffer_width, height: geometry.drawing_buffer_height, non_empty_pixels: 100 } };
}
module.exports = { makeCapture };
