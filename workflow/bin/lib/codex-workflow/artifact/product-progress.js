"use strict";

const { readAuthoritativeEvents } = require("../core/event-store");
const { resolvePaths } = require("../core/paths");
const { taskEventFile } = require("../core/task-mutation");
const { parseTaskHeader } = require("../task/repository");
const { currentGrant } = require("../team/execution-grant");

class ProductProgressError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProductProgressError";
  }
}

function acceptedSliceIds(state) {
  return Object.values(state.slice_acceptances || {})
    .filter((item) => item?.status === "accepted")
    .sort((left, right) => left.revision - right.revision)
    .map((item) => item.slice_id);
}

function actorSummary(state) {
  const team = state.active_team;
  if (!team || typeof team !== "object" || !team.team_run_id) return "无活动 Team";
  const attempts = Array.isArray(team.attempts) ? team.attempts : [];
  const running = attempts.filter((item) => new Set(["reserved", "bound", "running"]).has(item.status));
  return `${team.mode || "unknown"}/${team.status || "unknown"}`
    + `，${running.length} 个活动 actor，Team ${team.team_run_id}`;
}

function blockerSummary(state) {
  if (state.execution_authority?.first_code?.status === "paused-replan-required") {
    return "first-code 止损已触发，必须显式 replan";
  }
  const verificationClaims = (state.verification?.operation_claims || [])
    .filter((item) => new Set(["in_progress", "indeterminate"]).has(item.status));
  if (verificationClaims.length > 0) {
    return `有 ${verificationClaims.length} 个验证 claim 尚未收敛`;
  }
  const observerClaims = (state.active_team?.observer_launch_claims || [])
    .filter((item) => item.status === "in_progress");
  if (observerClaims.length > 0) return `有 ${observerClaims.length} 个 actor 启动 claim 尚未收敛`;
  if (state.status === "blocked") return state.blocked_reason || state.blocker || "任务已阻塞";
  return "无权威阻塞";
}

function nextAcceptance(grant, state) {
  if (!grant) return "等待 controller 建立当前执行授权";
  const firstCode = state.execution_authority?.first_code;
  if (firstCode?.status === "paused-replan-required") return "显式 replan 后重新验收 first-code";
  if (firstCode?.status === "active") {
    return `验收 first-code 切片 ${grant.scope.first_code.first_code_slice_id}`;
  }
  const accepted = new Set(acceptedSliceIds(state));
  const next = grant.scope.required_slices.find((slice) => (
    !accepted.has(slice.slice_id) && slice.depends_on.every((item) => accepted.has(item))
  ));
  return next ? `验收切片 ${next.slice_id}：${next.objective}` : "完成当前授权的最终验收";
}

function latestAccepted(events) {
  const event = events.findLast((item) => item.kind === "slice.accepted");
  if (!event) return "尚无已接受切片";
  return `${event.result.accepted.slice_id} 已接受（revision ${event.revision}）`;
}

function replanSummary(events) {
  const event = events.findLast((item) => item.kind === "authority.replanned");
  if (!event) return "尚未发生 replan";
  const paths = (event.result?.scope_delta || []).map((item) => item.path).filter(Boolean);
  return paths.length > 0
    ? `${paths.length} 项变化：${paths.slice(0, 3).join("、")}${paths.length > 3 ? "…" : ""}`
    : "scope 未发生字段变化";
}

function authorizationImpact(grant, state) {
  if (state.execution_authority?.first_code?.status === "paused-replan-required") {
    return "当前 grant 不可继续执行；需要新的 controller-recordable replan 授权";
  }
  if (!grant) return "没有当前 grant；任何正式执行都需要 controller 授权";
  return `后续执行必须保持 grant ${grant.grant_id} / evidence epoch ${grant.evidence_epoch}`;
}

function buildProductProgress(events) {
  if (!Array.isArray(events) || events.length === 0) {
    throw new ProductProgressError("task has no authoritative event history");
  }
  const latest = events.at(-1);
  const state = latest.projection.state;
  const authority = state.execution_authority;
  const grant = authority?.schema_version === 2 ? currentGrant(authority) : null;
  const headers = parseTaskHeader(latest.projection.task_content);
  const accepted = acceptedSliceIds(state);
  return {
    task_id: latest.task_id,
    title: headers.title?.[0] || latest.task_id,
    task_status: state.status || headers.status?.[0] || "unknown",
    current_objective: grant?.scope?.objective || "尚无当前执行目标",
    current_scope: grant ? {
      grant_id: grant.grant_id,
      scope_digest: grant.scope_digest,
      evidence_epoch: grant.evidence_epoch,
      required_slices: grant.scope.required_slices.map((slice) => slice.slice_id),
    } : null,
    accepted_slices: accepted,
    actors: actorSummary(state),
    last_accepted_result: latestAccepted(events),
    blocker: blockerSummary(state),
    next_acceptance_point: nextAcceptance(grant, state),
    latest_replan_delta: replanSummary(events),
    next_authorization_impact: authorizationImpact(grant, state),
    authoritative_revision: latest.revision,
    authoritative_event_id: latest.event_id,
    updated_at: latest.occurred_at,
  };
}

function readProductProgress(taskId, options = {}) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(taskId || "")) {
    throw new ProductProgressError("product-progress requires a safe task id");
  }
  const paths = options.paths || resolvePaths(options.environment || process.env);
  return buildProductProgress(
    readAuthoritativeEvents(taskEventFile(paths, taskId), taskId),
  );
}

function renderProductProgress(progress) {
  const scope = progress.current_scope;
  return [
    `产品进度｜${progress.task_id}｜${progress.title}`,
    `当前目标：${progress.current_objective}`,
    `当前授权：${scope ? `${scope.grant_id} / epoch ${scope.evidence_epoch}` : "无"}`,
    `已验收：${progress.accepted_slices.length > 0 ? progress.accepted_slices.join("、") : "无"}`,
    `执行状态：${progress.actors}`,
    `最近结果：${progress.last_accepted_result}`,
    `当前阻塞：${progress.blocker}`,
    `下一验收点：${progress.next_acceptance_point}`,
    `最近 replan：${progress.latest_replan_delta}`,
    `授权影响：${progress.next_authorization_impact}`,
    `权威更新时间：${progress.updated_at}（revision ${progress.authoritative_revision}）`,
  ];
}

module.exports = {
  ProductProgressError,
  buildProductProgress,
  readProductProgress,
  renderProductProgress,
};
