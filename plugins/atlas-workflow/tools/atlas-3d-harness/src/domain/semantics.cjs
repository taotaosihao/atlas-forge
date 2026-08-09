"use strict";
const POLICY = Object.freeze({
  units: "meters-radians@1",
  coordinate_system: "right-handed-y-up-negative-z-forward@1",
  matrix_layout: "column-major@1",
  quaternion_layout: "xyzw@1",
  composition: "parent-world-times-local@1",
  joint_axis_frame: "joint-local@1",
  transform_precedence: "trs-first@1",
  finite_policy: "finite-only-normalize-negative-zero@1",
  quaternion_policy: "normalized-tolerance-1e-6@1",
  quantization_policy: "nearest-1e-6-half-away-from-zero@1"
});
const TOLERANCE = 1e-6;
const LOWER_QUATERNION_NORM = 1 - TOLERANCE;
const UPPER_QUATERNION_NORM = 1 + TOLERANCE;
function quantize(value) {
  if (!Number.isFinite(value)) throw new Error("NUMERIC_POLICY");
  const result = Math.sign(value) * Math.round(Math.abs(value) * 1e6) / 1e6;
  return Object.is(result, -0) ? 0 : result;
}
function finiteVector(value, length) {
  if (!Array.isArray(value) || value.length !== length) throw new Error("NUMERIC_SHAPE");
  return value.map(quantize);
}
function quaternion(value) {
  if (!Array.isArray(value) || value.length !== 4 || value.some((item) => !Number.isFinite(item))) throw new Error("NUMERIC_POLICY");
  const norm = Math.hypot(...value);
  if (norm < LOWER_QUATERNION_NORM || norm > UPPER_QUATERNION_NORM) throw new Error("QUATERNION_NORMALIZATION");
  return value.map((item) => quantize(item / norm));
}
function close(left, right) {
  return left.length === right.length && left.every((value, index) => quantize(value) === quantize(right[index]));
}
module.exports = { LOWER_QUATERNION_NORM, POLICY, TOLERANCE, UPPER_QUATERNION_NORM, close, finiteVector, quantize, quaternion };
