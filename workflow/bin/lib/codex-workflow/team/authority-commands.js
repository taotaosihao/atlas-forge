"use strict";

const path = require("path");
const { CommandError, commandOptions } = require("../core/command-runtime");
const { readAuthoritativeEvents } = require("../core/event-store");
const { taskEventFile, mutateTaskRuntime } = require("../core/task-mutation");
const { renderTaskFields } = require("../task/repository");
const { timestampSeconds } = require("../task/runtime");
const { sha256 } = require("../verification/identity");
const { inProgressVerificationClaims } = require("../verification/required-gates");
const { activeControlPlaneLeases } = require("./writer-lease-control");
const { teamControlPlaneClosureIssues } = require("./lane-registry");
const {
  assertActiveExecutionGrant,
  assertSizeExceptionValidity,
  authorityReplayPostcondition,
  currentGrant,
  transitionAuthorityState,
} = require("./execution-grant");
const { assertCanonicalGrantArtifacts, buildCanonicalScope } = require("./scope-artifacts");
const { globalAdmissionLockFile } = require("./admission");
const { withLock } = require("../core/lock");
const {
  AUTHORIZE_USAGE,
  GRANT_USAGE,
  REPLAN_USAGE,
  parseAuthorizeArgs,
  parseGrantArgs,
  parseReplanArgs,
} = require("./args");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableSame(left, right, contracts) {
  return contracts.canonicalJson(left) === contracts.canonicalJson(right);
}

function requireDoingProjection(currentProjection, command) {
  if (!currentProjection?.state || currentProjection.state.status !== "doing") {
    throw new CommandError(`${command} requires a doing task with authoritative projection`);
  }
  return clone(currentProjection.state);
}

function grantRecord({ authorization, loaded, grantId, revision, clock, evidenceEpoch }) {
  return {
    schema_version: 1,
    grant_id: grantId,
    status: "active",
    scope_digest: loaded.scopeDigest,
    scope: loaded.scope,
    evidence_epoch: evidenceEpoch,
    authorization_provenance: authorization,
    issued_at: timestampSeconds(clock),
    issued_revision: revision,
    terminal: null,
  };
}

function deliveryAuthority(loaded, authorization, revision) {
  if (!loaded.release) return null;
  const immutableRef = loaded.releaseIntent?.target_delivery_authority_ref || "";
  if (immutableRef !== authorization.ref) {
    throw new CommandError(
      "product_release initial grant authority must equal immutable target_delivery_authority_ref",
    );
  }
  return {
    kind: authorization.kind,
    ref: authorization.ref,
    established_revision: revision,
    contract_sha256: loaded.artifacts.contract.sha256,
    execution_plan_sha256: loaded.artifacts.planSha256,
    release_binding: clone(loaded.scope.release_binding),
  };
}

function assertScopeAssertion(parsed, loaded, label) {
  if (parsed.expectedScopeDigest && parsed.expectedScopeDigest !== loaded.scopeDigest) {
    throw new CommandError(`${label} expected scope digest does not match the canonical scope`);
  }
}

function stableScopeAppendGuard(parsed, context, expectedScope, expectedDigest, parent = null) {
  return () => {
    const rebuilt = buildCanonicalScope({
      authorizationRef: parsed.authorizationRef,
      briefPath: parsed.briefPath,
      cwd: context.cwd,
      environment: context.environment,
      evidencePolicy: expectedScope.evidence_policy,
      grantId: parsed.grantId,
      objective: parsed.objective,
      parent,
      paths: context.paths,
      taskId: parsed.taskId,
    });
    if (rebuilt.scopeDigest !== expectedDigest
      || !stableSame(rebuilt.scope, expectedScope, rebuilt.contracts)) {
      throw new CommandError("authority artifacts changed before authoritative event append");
    }
  };
}

function runAuthorize(parsed, options = {}) {
  const context = commandOptions(options);
  let issued;
  let guard = null;
  let committed;
  withLock(globalAdmissionLockFile(context.paths), () => {
    committed = mutateTaskRuntime(
      context.paths,
      parsed.taskId,
      {
        kind: "authority.grant.issued",
        operationId: parsed.operationId,
        data: {
          authorization_ref: parsed.authorizationRef,
          brief_path: path.resolve(parsed.briefPath),
          grant_id: parsed.grantId,
          objective: parsed.objective,
          expected_scope_digest: parsed.expectedScopeDigest || "",
        },
      },
      ({ currentProjection, occurredAt, revision }) => {
        const eventClock = () => new Date(occurredAt);
        const state = requireDoingProjection(currentProjection, "team-authorize");
        if (state.execution_authority) {
          throw new CommandError("execution authority already exists; use explicit team-replan");
        }
        const loaded = buildCanonicalScope({
          authorizationRef: parsed.authorizationRef,
          briefPath: parsed.briefPath,
          cwd: context.cwd,
          environment: context.environment,
          evidencePolicy: { mode: "invalidate-incompatible", retained_receipt_ids: [] },
          grantId: parsed.grantId,
          objective: parsed.objective,
          parent: null,
          paths: context.paths,
          taskId: parsed.taskId,
        });
        assertScopeAssertion(parsed, loaded, "team-authorize");
        const authorization = loaded.contracts.parseAuthorityRef(parsed.authorizationRef);
        issued = grantRecord({
          authorization,
          clock: eventClock,
          evidenceEpoch: 1,
          grantId: parsed.grantId,
          loaded,
          revision: revision + 1,
        });
        assertSizeExceptionValidity(issued, { all: true, clock: eventClock });
        const transition = {
          schema_version: 1,
          type: "grant-issued",
          revision: revision + 1,
          grant: issued,
          delivery_authority: deliveryAuthority(loaded, authorization, revision + 1),
        };
        transitionAuthorityState(state, transition);
        state.updated_at = timestampSeconds(eventClock);
        guard = stableScopeAppendGuard(parsed, context, loaded.scope, loaded.scopeDigest);
        return {
          authorityTransition: transition,
          projection: {
            task_content: currentProjection.task_content,
            state,
          },
          result: {
            grant: issued,
            grant_id: issued.grant_id,
            scope_digest: issued.scope_digest,
            evidence_epoch: issued.evidence_epoch,
          },
          legacy: [{ kind: "authority-grant-issued", detail: issued.grant_id }],
        };
      },
      {
        ...options,
        clock: context.clock,
        environment: context.environment,
        beforeEventAppend(event) {
          if (options.beforeEventAppend) options.beforeEventAppend(event);
          if (guard) guard(event);
        },
        replayPostcondition: authorityReplayPostcondition({
          allExceptions: true,
          clock: context.clock,
          grantId: parsed.grantId,
          requireUnexpired: true,
          validateCurrent({ grant }) {
            assertCanonicalGrantArtifacts({
              briefPath: parsed.briefPath,
              environment: context.environment,
              grant,
              paths: context.paths,
              taskId: parsed.taskId,
            });
          },
        }),
      },
    );
  });
  issued = committed.result.grant;
  return {
    exitCode: 0,
    lines: [
      `task_id: ${parsed.taskId}`,
      `grant_id: ${issued.grant_id}`,
      `scope_digest: ${issued.scope_digest}`,
      `evidence_epoch: ${issued.evidence_epoch}`,
      `status: ${issued.status}`,
      ...(committed.replay ? ["replayed: true"] : []),
    ],
  };
}

function currentAuthorityState(paths, taskId) {
  const events = readAuthoritativeEvents(taskEventFile(paths, taskId), taskId);
  const latest = events.at(-1);
  if (!latest) throw new CommandError(`team-grant requires authoritative task history: ${taskId}`);
  return latest.projection.state;
}

function runGrant(parsed, options = {}) {
  const { paths } = commandOptions(options);
  const authority = currentAuthorityState(paths, parsed.taskId).execution_authority;
  if (!authority || authority.schema_version !== 2) {
    throw new CommandError("no vNext execution authority exists for task");
  }
  const current = currentGrant(authority);
  return {
    exitCode: 0,
    lines: [
      `task_id: ${parsed.taskId}`,
      `formal_execution: ${authority.formal_execution}`,
      `formal_product_release: ${authority.formal_product_release}`,
      `current_grant_id: ${authority.current_grant_id || ""}`,
      `current_status: ${current?.status || "terminal"}`,
      `scope_digest: ${current?.scope_digest || ""}`,
      `evidence_epoch: ${current?.evidence_epoch || ""}`,
      `grant_history: ${authority.grants.map((grant) => `${grant.grant_id}=${grant.status}`).join(",")}`,
    ],
  };
}

function assertReplanQuiescent(paths, taskId, state, authority) {
  const controlLeases = activeControlPlaneLeases(paths)
    .filter((lease) => lease.task_id === taskId);
  if (controlLeases.length > 0) {
    throw new CommandError(
      `team-replan requires no active or uncertain writer lease: ${controlLeases.map((lease) => lease.lease_id).join(", ")}`,
    );
  }
  const team = state.active_team && typeof state.active_team === "object" ? state.active_team : {};
  const pendingLaunchClaims = (team.observer_launch_claims || [])
    .filter((claim) => claim.status === "in_progress");
  if (pendingLaunchClaims.length > 0) {
    throw new CommandError(
      `team-replan is blocked by in-progress observer launch claims: ${pendingLaunchClaims.map((claim) => claim.attempt_id).join(", ")}`,
    );
  }
  const pendingVerificationClaims = inProgressVerificationClaims(state, authority);
  if (pendingVerificationClaims.length > 0) {
    throw new CommandError(
      `team-replan is blocked by in-progress verification claims: ${pendingVerificationClaims.map((claim) => claim.operation_id).join(", ")}`,
    );
  }
  const attempts = (team.attempts || []).filter((attempt) => (
    new Set(["reserved", "bound", "running"]).has(attempt.status)
  ));
  if (attempts.length > 0) {
    throw new CommandError(`team-replan requires no active attempt: ${attempts.map((item) => item.attempt_id).join(", ")}`);
  }
  const leases = (team.writer_leases || []).filter((lease) => (
    new Set(["active", "uncertain-active"]).has(lease.state)
  ));
  if (leases.length > 0) {
    throw new CommandError(`team-replan requires no active writer lease: ${leases.map((item) => item.lease_id).join(", ")}`);
  }
  const writableLanes = (team.lanes || []).filter((lane) => lane.writable && lane.status !== "closed");
  if (writableLanes.length > 0) {
    throw new CommandError(`team-replan requires writable lanes to be closed: ${writableLanes.map((item) => item.lane_id).join(", ")}`);
  }
  const writableLaneIds = new Set((team.lanes || []).filter((lane) => lane.writable).map((lane) => lane.lane_id));
  const dispatches = (team.dispatches || []).filter((dispatch) => (
    writableLaneIds.has(dispatch.lane_id) && dispatch.status !== "closed"
  ));
  if (dispatches.length > 0) {
    throw new CommandError(`team-replan requires writable dispatches to be closed: ${dispatches.map((item) => item.dispatch_id).join(", ")}`);
  }
  const closureIssues = teamControlPlaneClosureIssues(team);
  if (closureIssues.length > 0) {
    throw new CommandError(
      `team-replan requires a closed v2 Team control plane: ${closureIssues.join("; ")}`,
    );
  }
  return team;
}

function evidenceReceipts(state) {
  const receipts = new Map();
  for (const gate of Object.values(state.verification?.required_gates || {})) {
    if (gate?.record_id) receipts.set(gate.record_id, { type: "verification", value: clone(gate) });
  }
  for (const accepted of Object.values(state.slice_acceptances || {})) {
    if (accepted?.operation_id && accepted.status === "accepted") {
      receipts.set(accepted.operation_id, { type: "slice", value: clone(accepted) });
    }
  }
  return receipts;
}

function compatibleGate(receipt, oldGrant, newGrant) {
  if (receipt.grant_id !== oldGrant.grant_id || receipt.scope_digest !== oldGrant.scope_digest
    || receipt.evidence_epoch !== oldGrant.evidence_epoch) return false;
  const oldSlice = oldGrant.scope.required_slices.find((slice) => slice.slice_id === receipt.slice_id);
  const nextSlice = newGrant.scope.required_slices.find((slice) => slice.slice_id === receipt.slice_id);
  if (!oldSlice || !nextSlice || JSON.stringify(oldSlice) !== JSON.stringify(nextSlice)) return false;
  const check = nextSlice.checks.find((item) => item.check_id === receipt.check_id);
  return Boolean(check
    && receipt.brief_sha256 === nextSlice.brief_sha256
    && receipt.contract_sha256 === newGrant.scope.contract.sha256
    && receipt.execution_plan_sha256 === newGrant.scope.execution_plan.sha256
    && receipt.gate_class === check.gate_class
    && receipt.command_digest === sha256(check.command)
    && receipt.cache_policy === check.cache_policy
    && receipt.final_only === check.final_only);
}

function compatibleSlice(receipt, oldGrant, newGrant, retainedIds) {
  if (receipt.grant_id !== oldGrant.grant_id || receipt.scope_digest !== oldGrant.scope_digest
    || receipt.evidence_epoch !== oldGrant.evidence_epoch) return false;
  const oldSlice = oldGrant.scope.required_slices.find((slice) => slice.slice_id === receipt.slice_id);
  const nextSlice = newGrant.scope.required_slices.find((slice) => slice.slice_id === receipt.slice_id);
  if (!oldSlice || !nextSlice || JSON.stringify(oldSlice) !== JSON.stringify(nextSlice)
    || receipt.brief_sha256 !== nextSlice.brief_sha256
    || receipt.contract_sha256 !== newGrant.scope.contract.sha256
    || receipt.execution_plan_sha256 !== newGrant.scope.execution_plan.sha256) return false;
  return (receipt.verification_records || []).every((record) => (
    retainedIds.has(record.record_id) && compatibleGate(record, oldGrant, newGrant)
  ));
}

function dependencyRetentions(receipts, newGrant, retainedIds) {
  const acceptedBySlice = new Map([...receipts].flatMap(([id, receipt]) => (
    receipt.type === "slice" ? [[receipt.value.slice_id, id]] : []
  )));
  for (const slice of newGrant.scope.required_slices) {
    const acceptanceId = acceptedBySlice.get(slice.slice_id);
    if (!acceptanceId || !retainedIds.has(acceptanceId)) continue;
    for (const dependency of slice.depends_on) {
      const dependencyId = acceptedBySlice.get(dependency);
      if (!dependencyId || !retainedIds.has(dependencyId)) {
        throw new CommandError(
          `retained slice ${slice.slice_id} requires retained transitive dependency ${dependency}`,
        );
      }
    }
  }
}

function rebindReceipt(receipt, oldGrant, newGrant, revision) {
  const source = {
    grant_id: oldGrant.grant_id,
    scope_digest: oldGrant.scope_digest,
    evidence_epoch: oldGrant.evidence_epoch,
  };
  const rebound = {
    ...clone(receipt),
    grant_id: newGrant.grant_id,
    scope_digest: newGrant.scope_digest,
    evidence_epoch: newGrant.evidence_epoch,
    origin_binding: clone(receipt.origin_binding || receipt.retained_from || source),
    retained_from: source,
    retention_history: [
      ...(receipt.retention_history || []),
      { ...source, retention_revision: revision },
    ],
    retention_revision: revision,
  };
  if (Array.isArray(rebound.verification_records)) {
    rebound.verification_records = rebound.verification_records.map((record) => (
      rebindReceipt(record, oldGrant, newGrant, revision)
    ));
  }
  return rebound;
}

function applyEvidencePolicy(state, oldGrant, newGrant, retainedReceiptIds, revision) {
  const receipts = evidenceReceipts(state);
  const requested = new Set(retainedReceiptIds);
  const indeterminateBindings = (state.verification?.operation_claims || [])
    .filter((claim) => claim?.status === "indeterminate"
      && claim.authority_identity?.grant_id === oldGrant.grant_id
      && claim.authority_identity?.scope_digest === oldGrant.scope_digest
      && claim.authority_identity?.evidence_epoch === oldGrant.evidence_epoch)
    .map((claim) => ({
      check_id: claim.required_check_binding?.check_id || "",
      slice_id: claim.required_check_binding?.slice_id || claim.authority_identity?.slice_id || "",
    }));
  const taintedCheckIds = new Set(indeterminateBindings.map((binding) => binding.check_id));
  const taintedSliceIds = new Set(indeterminateBindings.map((binding) => binding.slice_id));
  for (const receiptId of requested) {
    if (!receipts.has(receiptId)) throw new CommandError(`unknown evidence receipt requested for retention: ${receiptId}`);
  }
  for (const [receiptId, receipt] of receipts) {
    if (!requested.has(receiptId)) continue;
    const tainted = receipt.type === "verification"
      ? taintedCheckIds.has(receipt.value.check_id)
      : taintedSliceIds.has(receipt.value.slice_id)
        || (receipt.value.verification_records || [])
          .some((record) => taintedCheckIds.has(record.check_id));
    if (tainted) {
      throw new CommandError(
        `evidence receipt is tainted by indeterminate verification and cannot be retained: ${receiptId}`,
      );
    }
    const compatible = receipt.type === "verification"
      ? compatibleGate(receipt.value, oldGrant, newGrant)
      : compatibleSlice(receipt.value, oldGrant, newGrant, requested);
    if (!compatible) throw new CommandError(`evidence receipt is incompatible with the new scope: ${receiptId}`);
  }
  dependencyRetentions(receipts, newGrant, requested);
  const retained = [];
  const invalidated = [];
  const history = [];
  const retainedGates = {};
  const retainedSlices = {};
  for (const [receiptId, receipt] of receipts) {
    history.push({ receipt_id: receiptId, type: receipt.type, value: receipt.value });
    if (requested.has(receiptId)) {
      const rebound = rebindReceipt(receipt.value, oldGrant, newGrant, revision);
      retained.push({ receipt_id: receiptId, type: receipt.type, reason: "explicit-compatible-retention" });
      if (receipt.type === "verification") retainedGates[rebound.check_id] = rebound;
      else retainedSlices[rebound.slice_id] = rebound;
    } else {
      invalidated.push({ receipt_id: receiptId, type: receipt.type, reason: "grant-or-scope-superseded" });
    }
  }
  state.execution_evidence_history = [
    ...(state.execution_evidence_history || []),
    {
      schema_version: 1,
      old_grant_id: oldGrant.grant_id,
      new_grant_id: newGrant.grant_id,
      revision,
      receipts: history,
    },
  ];
  state.verification = {
    ...(state.verification || {}),
    required_gates: retainedGates,
  };
  state.slice_acceptances = retainedSlices;
  return { retained, invalidated };
}

function runReplan(parsed, options = {}) {
  const context = commandOptions(options);
  let guard = null;
  let committed;
  withLock(globalAdmissionLockFile(context.paths), () => {
    committed = mutateTaskRuntime(
      context.paths,
      parsed.taskId,
      {
        kind: "authority.replanned",
        operationId: parsed.operationId,
        data: {
          authorization_ref: parsed.authorizationRef,
          brief_path: path.resolve(parsed.briefPath),
          evidence_policy: parsed.evidencePolicy,
          expected_delta: parsed.expectedDelta,
          expected_scope_digest: parsed.expectedScopeDigest || "",
          grant_id: parsed.grantId,
          objective: parsed.objective,
          retained_receipt_ids: [...parsed.retainEvidence],
        },
      },
      ({ currentProjection, occurredAt, revision }) => {
        const eventClock = () => new Date(occurredAt);
        const state = requireDoingProjection(currentProjection, "team-replan");
        const oldGrant = assertActiveExecutionGrant(state);
        const team = assertReplanQuiescent(context.paths, parsed.taskId, state, oldGrant);
        const retainedReceiptIds = [...parsed.retainEvidence]
          .sort();
        const evidencePolicy = {
          mode: parsed.evidencePolicy,
          retained_receipt_ids: retainedReceiptIds,
        };
        const loaded = buildCanonicalScope({
          authorizationRef: parsed.authorizationRef,
          briefPath: parsed.briefPath,
          cwd: context.cwd,
          environment: context.environment,
          evidencePolicy,
          grantId: parsed.grantId,
          objective: parsed.objective,
          parent: { grant_id: oldGrant.grant_id, scope_digest: oldGrant.scope_digest },
          paths: context.paths,
          taskId: parsed.taskId,
        });
        assertScopeAssertion(parsed, loaded, "team-replan");
        const delta = loaded.contracts.scopeDelta(oldGrant.scope, loaded.scope);
        if (!stableSame(delta, parsed.expectedDelta, loaded.contracts)) {
          throw new CommandError("team-replan expected delta does not equal the complete machine-computed scope delta");
        }
        const authorization = loaded.contracts.parseAuthorityRef(parsed.authorizationRef);
        const newGrant = grantRecord({
          authorization,
          clock: eventClock,
          evidenceEpoch: oldGrant.evidence_epoch + 1,
          grantId: parsed.grantId,
          loaded,
          revision: revision + 1,
        });
        assertSizeExceptionValidity(newGrant, { all: true, clock: eventClock });
        const evidence = applyEvidencePolicy(
          state,
          oldGrant,
          newGrant,
          retainedReceiptIds,
          revision + 1,
        );
        const transition = {
          schema_version: 1,
          type: "grant-replanned",
          revision: revision + 1,
          occurred_at: timestampSeconds(eventClock),
          old_grant_id: oldGrant.grant_id,
          old_scope_digest: oldGrant.scope_digest,
          old_evidence_epoch: oldGrant.evidence_epoch,
          new_grant: newGrant,
          scope_delta: delta,
          evidence_policy: evidencePolicy,
          evidence,
        };
        transitionAuthorityState(state, transition);
        let taskContent = currentProjection.task_content;
        if (team.schema_version === 2 && team.mode === "execute") {
          state.active_team = {
            ...team,
            status: "stopped",
            scope_superseded_by: newGrant.grant_id,
          };
          taskContent = renderTaskFields(taskContent, { active_team_status: "stopped" });
        }
        state.updated_at = timestampSeconds(eventClock);
        guard = stableScopeAppendGuard(
          parsed,
          context,
          loaded.scope,
          loaded.scopeDigest,
          { grant_id: oldGrant.grant_id, scope_digest: oldGrant.scope_digest },
        );
        return {
          authorityTransition: transition,
          projection: { task_content: taskContent, state },
          result: {
            grant: newGrant,
            grant_id: newGrant.grant_id,
            scope_digest: newGrant.scope_digest,
            evidence_epoch: newGrant.evidence_epoch,
            scope_delta: delta,
            evidence,
          },
          legacy: [{ kind: "authority-replanned", detail: `${oldGrant.grant_id}->${newGrant.grant_id}` }],
        };
      },
      {
        ...options,
        clock: context.clock,
        environment: context.environment,
        beforeEventAppend(event) {
          if (options.beforeEventAppend) options.beforeEventAppend(event);
          if (guard) guard(event);
        },
        replayPostcondition: authorityReplayPostcondition({
          allExceptions: true,
          clock: context.clock,
          grantId: parsed.grantId,
          requireUnexpired: true,
          validateCurrent({ grant }) {
            assertCanonicalGrantArtifacts({
              briefPath: parsed.briefPath,
              environment: context.environment,
              grant,
              paths: context.paths,
              taskId: parsed.taskId,
            });
          },
        }),
      },
    );
  });
  return {
    exitCode: 0,
    lines: [
      `task_id: ${parsed.taskId}`,
      `grant_id: ${committed.result.grant_id}`,
      `scope_digest: ${committed.result.scope_digest}`,
      `evidence_epoch: ${committed.result.evidence_epoch}`,
      `delta_entries: ${(committed.result.scope_delta || []).length}`,
      `retained_evidence: ${(committed.result.evidence?.retained || []).length}`,
      `invalidated_evidence: ${(committed.result.evidence?.invalidated || []).length}`,
      ...(committed.replay ? ["replayed: true"] : []),
    ],
  };
}

module.exports = {
  AUTHORIZE_USAGE,
  GRANT_USAGE,
  REPLAN_USAGE,
  applyEvidencePolicy,
  assertReplanQuiescent,
  parseAuthorizeArgs,
  parseGrantArgs,
  parseReplanArgs,
  runAuthorize,
  runGrant,
  runReplan,
};
