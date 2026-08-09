"use strict";
const { finiteVector, quantize, quaternion } = require("../domain/semantics.cjs");
const vector = (value, length) => finiteVector(value, length);
const matrix = (value) => vector(value, 16);
const canonicalQuaternion = (value, raw) => raw ? quaternion(value) : vector(value, 4);
function industrialState(value) {
  return {
    anchor: { root_id: value.anchor.root_id, root_world_matrix: matrix(value.anchor.root_world_matrix), joint_parent_id: value.anchor.joint_parent_id, visual_id: value.anchor.visual_id, visual_parent_id: value.anchor.visual_parent_id, visual_local_matrix: matrix(value.anchor.visual_local_matrix), visual_world_matrix: matrix(value.anchor.visual_world_matrix) },
    joint: { id: value.joint.id, origin_local: vector(value.joint.origin_local, 3), axis_local: vector(value.joint.axis_local, 3), position_radians: quantize(value.joint.position_radians), parent_world_matrix: matrix(value.joint.parent_world_matrix), world_matrix: matrix(value.joint.world_matrix) },
    socket: { id: value.socket.id, parent_id: value.socket.parent_id, local_matrix: matrix(value.socket.local_matrix), world_matrix: matrix(value.socket.world_matrix) },
    attachment: { id: value.attachment.id, parent_id: value.attachment.parent_id, ancestry: Array.from(value.attachment.ancestry), local_matrix: matrix(value.attachment.local_matrix), world_matrix: matrix(value.attachment.world_matrix), ancestry_scales: value.attachment.ancestry_scales.map((scale) => vector(scale, 3)) }
  };
}
function canonicalize(value) {
  const raw = value.protocol_version === "atlas-3d-page@1";
  if (!raw && value.schema_version !== 1) throw new Error("canonical semantic identity mismatch");
  const profile = value.profile;
  if (!['base@1', 'industrial-kinematics@1'].includes(profile)) throw new Error("canonical profile mismatch");
  const object = value.object, camera = value.camera, timeline = value.timeline;
  if (!object || object.id !== "reference-cube" || !camera || !timeline) throw new Error("canonical semantic identity mismatch");
  const output = {
    schema_version: 1,
    profile,
    coordinate_system: "right-handed-y-up-negative-z-forward-meters-radians@1",
    matrix_layout: "column-major@1",
    checkpoint: value.checkpoint,
    view: value.view,
    state_revision: raw ? value.stateRevision : value.state_revision,
    rendered_state_revision: raw ? value.renderedStateRevision : value.rendered_state_revision,
    render_revision: raw ? value.renderRevision : value.render_revision,
    timeline: { time_ms: timeline.time_ms, joint_radians: quantize(timeline.joint_radians) },
    object: { id: object.id, parent_id: object.parent_id, translation: vector(object.translation, 3), quaternion_xyzw: canonicalQuaternion(object.quaternion_xyzw, raw), scale: vector(object.scale, 3), parent_world_matrix: matrix(object.parent_world_matrix), world_matrix: matrix(object.world_matrix), aabb_min: vector(object.aabb_min, 3), aabb_max: vector(object.aabb_max, 3) },
    camera: { projection_matrix: matrix(camera.projection_matrix), matrix_world_inverse: matrix(camera.matrix_world_inverse), near: quantize(camera.near), far: quantize(camera.far) }
  };
  if (profile === "industrial-kinematics@1") {
    if (!value.industrial) throw new Error("canonical industrial state missing");
    output.industrial = industrialState(value.industrial);
  } else if (value.industrial) throw new Error("base canonical cannot carry industrial state");
  return Object.freeze(output);
}
module.exports = { canonicalize };
