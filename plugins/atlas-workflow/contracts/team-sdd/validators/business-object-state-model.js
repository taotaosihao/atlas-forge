"use strict";

const {
  requireObject,
  requireKeys,
  rejectUnknownKeys,
  expectString,
  expectInteger,
  expectStringArray,
  expectObjectArray,
  expectSafeId,
} = require("./common");

const KEYS = [
  "schema_version",
  "task_id",
  "objects",
];

const OBJECT_KEYS = [
  "object_id",
  "name",
  "state_owner",
  "states",
  "transitions",
  "conflict_policy",
];

const TRANSITION_KEYS = [
  "from",
  "to",
  "action",
  "allowed_roles",
  "evidence_required",
];

function validateBusinessObjectStateModel(value) {
  const errors = [];
  if (!requireObject(value, errors)) {
    return errors;
  }
  requireKeys(value, KEYS, errors);
  rejectUnknownKeys(value, KEYS, errors);
  expectInteger(value, "schema_version", errors);
  if (value.schema_version !== 1) {
    errors.push("schema_version must be 1");
  }
  expectSafeId(value, "task_id", errors);
  expectObjectArray(value, "objects", errors);
  if (Array.isArray(value.objects)) {
    value.objects.forEach((objectModel, index) => validateObjectModel(objectModel, index, errors));
  }
  return errors;
}

function validateObjectModel(objectModel, index, errors) {
  if (!requireObject(objectModel, errors)) {
    errors.push(`objects[${index}] must be an object`);
    return;
  }
  requireKeys(objectModel, OBJECT_KEYS, errors);
  rejectUnknownKeys(objectModel, OBJECT_KEYS, errors);
  expectSafeId(objectModel, "object_id", errors);
  expectString(objectModel, "name", errors);
  expectString(objectModel, "state_owner", errors);
  expectStringArray(objectModel, "states", errors);
  expectObjectArray(objectModel, "transitions", errors);
  expectString(objectModel, "conflict_policy", errors);
  if (Array.isArray(objectModel.transitions)) {
    objectModel.transitions.forEach((transition, transitionIndex) => {
      validateTransition(transition, index, transitionIndex, errors);
    });
  }
}

function validateTransition(transition, objectIndex, transitionIndex, errors) {
  if (!requireObject(transition, errors)) {
    errors.push(`objects[${objectIndex}].transitions[${transitionIndex}] must be an object`);
    return;
  }
  requireKeys(transition, TRANSITION_KEYS, errors);
  rejectUnknownKeys(transition, TRANSITION_KEYS, errors);
  expectString(transition, "from", errors);
  expectString(transition, "to", errors);
  expectString(transition, "action", errors);
  expectStringArray(transition, "allowed_roles", errors);
  expectStringArray(transition, "evidence_required", errors);
}

module.exports = { validateBusinessObjectStateModel };
