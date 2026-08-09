"use strict";
const { mat4, vec3 } = require("gl-matrix");
const { TOLERANCE, close, finiteVector, quantize } = require("../domain/semantics.cjs");
const reject = (condition, code) => { if (condition) { const error = new Error(code); error.code = code; throw error; } };
const matrix = (value) => finiteVector(value, 16);
const expectClose = (actual, expected, code) => reject(!close(actual, expected), code);
function expectedFor(items, key, value, code) { const item = items.find((candidate) => candidate[key] === value); if (!item) { const error = new Error(code); error.code = code; throw error; } return item; }
function axisRotation(axis, angle, origin) {
  const rotation = mat4.create(), before = mat4.create(), after = mat4.create(), output = mat4.create();
  mat4.fromRotation(rotation, angle, vec3.fromValues(...finiteVector(axis, 3)));
  mat4.fromTranslation(before, vec3.fromValues(...finiteVector(origin, 3)));
  mat4.fromTranslation(after, vec3.fromValues(...origin.map((value) => -value)));
  mat4.multiply(output, before, rotation); mat4.multiply(output, output, after);
  return output;
}
function validateIndustrial(scenario, raw) {
  const expected = scenario.expected.industrial, anchor = raw.industrial.anchor, joint = raw.industrial.joint;
  const baseObject = scenario.expected.scene.nodes.find((node) => node.id === raw.object.id);
  reject(!baseObject || baseObject.parent_id !== expected.visual.id, "INDUSTRIAL_EXPECTED_VISUAL_IDENTITY");
  reject(raw.object.parent_id !== anchor.visual_id, "INDUSTRIAL_RAW_VISUAL_IDENTITY");
  const ancestry = [expected.root.id, expected.joint.id, expected.visual.id, expected.socket.id, expected.attachment.id];
  reject(JSON.stringify(ancestry) !== JSON.stringify(expected.attachment.ancestry), "INDUSTRIAL_EXPECTED_CHAIN");
  reject(anchor.root_id !== expected.root.id || anchor.joint_parent_id !== expected.root.id || anchor.visual_id !== expected.visual.id || anchor.visual_parent_id !== expected.visual.parent_id, "INDUSTRIAL_ANCHOR_IDS");
  expectClose(anchor.root_world_matrix, expected.root.world_matrix, "INDUSTRIAL_ROOT_WORLD");
  expectClose(joint.parent_world_matrix, anchor.root_world_matrix, "JOINT_ROOT_ANCHOR");
  reject(expected.joint.limits_radians[0] >= expected.joint.limits_radians[1] || Math.abs(scenario.expected.timeline[0].joint_radians - expected.joint.home_radians) > expected.joint.tolerance_radians, "JOINT_HOME_LIMITS");
  reject(joint.id !== expected.joint.id, "JOINT_IDENTITY");
  expectClose(joint.origin_local, expected.joint.origin_local, "JOINT_ORIGIN");
  expectClose(joint.axis_local, expected.joint.axis_local, "JOINT_LOCAL_AXIS");
  reject(Math.abs(Math.hypot(...joint.axis_local) - 1) > TOLERANCE, "JOINT_AXIS_NORMALIZATION");
  const checkpoint = expectedFor(scenario.expected.timeline, "name", raw.checkpoint, "CHECKPOINT_IDENTITY");
  reject(Math.abs(quantize(joint.position_radians) - quantize(checkpoint.joint_radians)) > expected.joint.tolerance_radians, "JOINT_RADIANS");
  reject(joint.position_radians < expected.joint.limits_radians[0] - expected.joint.tolerance_radians || joint.position_radians > expected.joint.limits_radians[1] + expected.joint.tolerance_radians, "JOINT_LIMITS");
  const jointWorld = mat4.create(); mat4.multiply(jointWorld, matrix(joint.parent_world_matrix), axisRotation(joint.axis_local, joint.position_radians, joint.origin_local));
  expectClose(joint.world_matrix, Array.from(jointWorld), "JOINT_PIVOT_WORLD");
  expectClose(anchor.visual_local_matrix, expected.visual.local_matrix, "VISUAL_LOCAL");
  const visualWorld = mat4.create(); mat4.multiply(visualWorld, joint.world_matrix, anchor.visual_local_matrix);
  expectClose(anchor.visual_world_matrix, Array.from(visualWorld), "VISUAL_WORLD");
  expectClose(anchor.visual_world_matrix, raw.object.parent_world_matrix, "VISUAL_BASE_OBJECT_ANCHOR");
  const socket = raw.industrial.socket;
  reject(socket.id !== expected.socket.id || socket.parent_id !== expected.socket.parent_id, "SOCKET_ANCESTRY");
  expectClose(socket.local_matrix, expected.socket.local_matrix, "SOCKET_LOCAL");
  const socketWorld = mat4.create(); mat4.multiply(socketWorld, anchor.visual_world_matrix, socket.local_matrix);
  expectClose(socket.world_matrix, Array.from(socketWorld), "SOCKET_WORLD");
  const attachment = raw.industrial.attachment;
  reject(attachment.id !== expected.attachment.id || attachment.parent_id !== expected.attachment.parent_socket_id || JSON.stringify(attachment.ancestry) !== JSON.stringify(expected.attachment.ancestry), "ATTACHMENT_ANCESTRY");
  for (const scale of attachment.ancestry_scales) reject(Math.max(...scale) - Math.min(...scale) > TOLERANCE, "ATTACHMENT_NON_UNIFORM_ANCESTRY");
  const attachmentWorld = mat4.create(); mat4.multiply(attachmentWorld, socket.world_matrix, attachment.local_matrix);
  expectClose(attachment.world_matrix, Array.from(attachmentWorld), "ATTACHMENT_WORLD");
}
function validateIndustrialStep(scenario, previous, current) {
  const actualDelta = current.industrial.joint.position_radians - previous.industrial.joint.position_radians;
  const previousExpected = expectedFor(scenario.expected.timeline, "name", previous.checkpoint, "CHECKPOINT_IDENTITY").joint_radians;
  const currentExpected = expectedFor(scenario.expected.timeline, "name", current.checkpoint, "CHECKPOINT_IDENTITY").joint_radians;
  const shortestExpected = Math.atan2(Math.sin(currentExpected - previousExpected), Math.cos(currentExpected - previousExpected));
  reject(Math.abs(actualDelta - shortestExpected) > TOLERANCE, "JOINT_CONTINUOUS_SHORTEST_PATH");
  const a = previous.industrial.attachment.world_matrix.slice(12, 15), b = current.industrial.attachment.world_matrix.slice(12, 15);
  reject(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) > scenario.expected.industrial.attachment.max_step_meters + TOLERANCE, "ATTACHMENT_CONTINUITY");
}
module.exports = { validateIndustrial, validateIndustrialStep };
