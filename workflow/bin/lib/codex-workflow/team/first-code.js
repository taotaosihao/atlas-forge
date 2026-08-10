"use strict";

const crypto = require("crypto");
const { readAuthoritativeEvents } = require("../core/event-store");
const { mutateTaskRuntime, taskEventFile } = require("../core/task-mutation");
const {
  firstCodeBoundary,
  transitionFirstCodeState,
} = require("./execution-grant");

class FirstCodeBoundaryError extends Error {
  constructor(message) {
    super(message);
    this.name = "FirstCodeBoundaryError";
  }
}

function boundaryMessage(boundary) {
  const binding = boundary.grant.scope.first_code;
  return boundary.state.status === "paused-replan-required"
    ? "first-code boundary is paused-replan-required; explicit replan is required before further execution"
    : `first-code slice ${binding.first_code_slice_id} must be accepted with check `
      + `${binding.verification_check_id} before ${binding.stop_before_slice_id}; `
      + "the task is now paused-replan-required";
}

function enforceFirstCodeBoundary(paths, taskId, target, options = {}) {
  const events = readAuthoritativeEvents(taskEventFile(paths, taskId), taskId);
  const latest = events.at(-1);
  if (!latest) return null;
  const boundary = firstCodeBoundary(latest.projection.state.execution_authority, target);
  if (!boundary.blocked) return null;
  if (!boundary.appendPause) throw new FirstCodeBoundaryError(boundaryMessage(boundary));

  const binding = boundary.grant.scope.first_code;
  const operationId = `${options.operationId || crypto.randomUUID()}-first-code-stop-${boundary.grant.grant_id}`;
  const data = {
    grant_id: boundary.grant.grant_id,
    scope_digest: boundary.grant.scope_digest,
    evidence_epoch: boundary.grant.evidence_epoch,
    first_code_slice_id: binding.first_code_slice_id,
    stop_before_slice_id: binding.stop_before_slice_id,
    target,
    reason: "first-code-stop-reached-before-acceptance",
  };
  mutateTaskRuntime(
    paths,
    taskId,
    { kind: "authority.first-code.paused", operationId, data },
    ({ currentProjection, revision }) => {
      const state = JSON.parse(JSON.stringify(currentProjection.state));
      const current = firstCodeBoundary(state.execution_authority, target);
      if (!current.blocked || !current.appendPause
        || current.grant.grant_id !== boundary.grant.grant_id
        || current.grant.scope_digest !== boundary.grant.scope_digest
        || current.grant.evidence_epoch !== boundary.grant.evidence_epoch) {
        throw new FirstCodeBoundaryError("first-code authority changed before its stop event");
      }
      transitionFirstCodeState(state, {
        kind: "authority.first-code.paused",
        operation_id: operationId,
        revision: revision + 1,
        data,
      });
      return {
        projection: {
          task_content: currentProjection.task_content,
          state,
          files: [],
        },
        result: { first_code: state.execution_authority.first_code },
        legacy: [],
      };
    },
    {
      clock: options.clock,
      environment: options.environment,
      expectedRevision: latest.revision,
      replayPostcondition({ currentProjection }) {
        const current = firstCodeBoundary(currentProjection.state.execution_authority, target);
        if (!current.blocked || current.state.status !== "paused-replan-required") {
          throw new FirstCodeBoundaryError("first-code pause replay is no longer authoritative");
        }
      },
    },
  );
  throw new FirstCodeBoundaryError(boundaryMessage(boundary));
}

module.exports = {
  FirstCodeBoundaryError,
  enforceFirstCodeBoundary,
};
