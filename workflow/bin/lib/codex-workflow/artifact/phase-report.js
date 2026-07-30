"use strict";

const fs = require("fs");
const path = require("path");
const { atomicWriteFile } = require("../core/atomic-file");
const { readAuthoritativeEvents } = require("../core/event-store");
const { resolvePaths, taskArtifactDir } = require("../core/paths");
const { taskEventFile } = require("../core/task-mutation");
const { digestCanonical, sha256 } = require("../verification/identity");
const { validateSafeId } = require("./scaffold");

const AC_HEADER = ["ID", "Criterion", "Required", "Verification", "Authority"];
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const RELEASE_OUTCOMES = new Set(["passed", "failed", "cannot_verify"]);
const RELEASE_STATUSES = new Set(["certified", "denied", "cannot_verify"]);

class PhaseReportError extends Error {
  constructor(message) {
    super(message);
    this.name = "PhaseReportError";
  }
}

function canonicalFile(file, label) {
  const resolved = path.resolve(file || "");
  let stat;
  try {
    stat = fs.lstatSync(resolved);
  } catch (error) {
    throw new PhaseReportError(`${label} is unavailable: ${error.message}`);
  }
  if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(resolved) !== resolved) {
    throw new PhaseReportError(`${label} must be a canonical regular non-symlink file`);
  }
  return resolved;
}

function tableCells(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;
  return trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
}

function acceptanceCriteria(markdown) {
  const lines = String(markdown).split(/\r?\n/);
  const heading = lines.findIndex((line) => line.trim() === "## Acceptance Criteria");
  if (heading < 0) throw new PhaseReportError("contract is missing the Acceptance Criteria section");
  const section = lines.slice(heading + 1);
  const nextHeading = section.findIndex((line) => /^##?\s+/.test(line.trim()));
  const bounded = nextHeading < 0 ? section : section.slice(0, nextHeading);
  const header = bounded.findIndex((line) => {
    const cells = tableCells(line);
    return cells && cells.map((cell) => cell.toLowerCase()).join("|")
      === AC_HEADER.map((cell) => cell.toLowerCase()).join("|");
  });
  if (header < 0) throw new PhaseReportError("Acceptance Criteria table header is invalid");
  const separator = tableCells(bounded[header + 1] || "");
  if (!separator || separator.length !== AC_HEADER.length
    || separator.some((cell) => !/^:?-{3,}:?$/.test(cell))) {
    throw new PhaseReportError("Acceptance Criteria table separator is invalid");
  }
  const rows = [];
  const ids = new Set();
  for (const line of bounded.slice(header + 2)) {
    const cells = tableCells(line);
    if (!cells) continue;
    if (cells.length !== AC_HEADER.length) {
      throw new PhaseReportError("Acceptance Criteria row has an invalid column count");
    }
    const [id, criterion, required, verification, authority] = cells;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id) || ids.has(id)) {
      throw new PhaseReportError(`Acceptance Criteria contains an invalid or duplicate ID: ${id}`);
    }
    if (!criterion || !verification || !authority || !new Set(["yes", "no"]).has(required.toLowerCase())) {
      throw new PhaseReportError(`Acceptance Criteria row is incomplete: ${id}`);
    }
    ids.add(id);
    rows.push({
      id,
      criterion,
      required: required.toLowerCase() === "yes",
      verification,
      authority,
    });
  }
  if (rows.length === 0) throw new PhaseReportError("Acceptance Criteria table has no criteria");
  return rows;
}

function executionPlan(markdown) {
  const matches = [...String(markdown).matchAll(
    /^```atlas-execution-plan\+json[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm,
  )];
  if (matches.length !== 1) {
    throw new PhaseReportError(`contract must contain exactly one execution plan; found ${matches.length}`);
  }
  try {
    const value = JSON.parse(matches[0][1]);
    if (!value || !Array.isArray(value.slices) || value.slices.length === 0) {
      throw new Error("non-empty slices are required");
    }
    return value;
  } catch (error) {
    throw new PhaseReportError(`contract execution plan is invalid: ${error.message}`);
  }
}

function acceptedSliceEvidence(taskId, slice, state, events, authority) {
  const projectedAccepted = state.slice_acceptances?.[slice.slice_id];
  const terminal = events.filter((event) => (
    new Set(["slice.accepted", "slice.superseded"]).has(event.kind)
    && (event.result?.accepted?.slice_id || event.data?.slice_id) === slice.slice_id
  )).at(-1);
  if (!terminal || terminal.kind !== "slice.accepted") {
    if (projectedAccepted?.status === "accepted") {
      throw new PhaseReportError(`accepted slice projection has no authoritative terminal: ${slice.slice_id}`);
    }
    return { status: "not_yet_accepted", receiptIds: [], checks: [] };
  }
  const accepted = terminal?.result?.accepted;
  if (!projectedAccepted || projectedAccepted.status !== "accepted" || !accepted
    || terminal.revision !== accepted.revision
    || digestCanonical(projectedAccepted) !== digestCanonical(accepted)
    || accepted.task_id !== taskId
    || accepted.contract_sha256 !== authority.contract_sha256
    || accepted.execution_plan_sha256 !== authority.execution_plan_sha256) {
    throw new PhaseReportError(`accepted slice authority is inconsistent: ${slice.slice_id}`);
  }
  const records = Array.isArray(accepted.verification_records)
    ? accepted.verification_records
    : [];
  const byCheck = new Map(records.map((record) => [record?.check_id, record]));
  if (records.length !== (slice.checks || []).length || byCheck.size !== records.length) {
    throw new PhaseReportError(`accepted slice verification coverage is inconsistent: ${slice.slice_id}`);
  }
  const checks = [];
  for (const check of slice.checks || []) {
    const record = byCheck.get(check.check_id);
    const event = events.find((candidate) => (
      candidate.event_id === record?.verification_event_id
      && candidate.revision === record?.verification_revision
    ));
    if (!record || record.slice_id !== slice.slice_id
      || record.outcome !== "passed" || record.provenance !== "fresh-executed"
      || record.candidate_tree_oid !== accepted.actual_size?.accepted_tree_oid
      || event?.kind !== "verification.recorded"
      || event.revision >= terminal.revision
      || event.data?.record_id !== record.record_id
      || event.data?.identity_digest !== record.identity_digest
      || event.data?.required_gate?.check_id !== check.check_id
      || event.data?.required_gate?.candidate_tree_oid !== record.candidate_tree_oid) {
      throw new PhaseReportError(
        `accepted slice verification event is inconsistent: ${slice.slice_id}/${check.check_id}`,
      );
    }
    checks.push({
      checkId: check.check_id,
      gateClass: check.gate_class,
      recordId: record.record_id,
    });
  }
  return {
    status: "covered_by_accepted_slice",
    receiptIds: checks.map((check) => check.recordId),
    checks,
  };
}

function exactKeys(value, expected) {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function releaseDecision(state, events, authority) {
  const decision = state.completion?.release_decision;
  if (decision === null || decision === undefined) return null;
  if (!decision || typeof decision !== "object" || Array.isArray(decision)
    || !exactKeys(decision, [
      "schema_version", "authority", "status", "target_delivery_class", "intent_sha256",
      "profile_ref", "profile_sha256", "candidate_manifest_digest", "requirement_results",
      "decision_id",
    ])
    || decision.schema_version !== 1
    || decision.authority !== "derived-from-final-release-sweep"
    || !RELEASE_STATUSES.has(decision.status)
    || decision.target_delivery_class !== "product_release"
    || !DIGEST.test(decision.intent_sha256 || "")
    || typeof decision.profile_ref !== "string" || !decision.profile_ref
    || !DIGEST.test(decision.profile_sha256 || "")
    || !DIGEST.test(decision.candidate_manifest_digest || "")
    || !DIGEST.test(decision.decision_id || "")) {
    throw new PhaseReportError("stored release decision is invalid");
  }
  const binding = authority.release_binding;
  if (!binding || decision.intent_sha256 !== binding.intent_sha256
    || decision.profile_ref !== binding.profile_ref
    || decision.profile_sha256 !== binding.profile_sha256) {
    throw new PhaseReportError("stored release decision does not match execution authority");
  }
  if (state.completion?.schema_version !== 1 || state.completion?.outcome !== "succeeded") {
    throw new PhaseReportError("stored release decision is not attached to successful completion");
  }
  const completionRevision = Number(authority.completion?.completed_revision || 0);
  const completionEvent = events.find((event) => event.revision === completionRevision);
  if (!Number.isInteger(completionRevision) || completionRevision < 1
    || completionEvent?.kind !== "task.completion.closed"
    || completionEvent.data?.outcome !== "succeeded"
    || completionEvent.projection?.state?.execution_authority?.completion?.completed_revision
      !== completionRevision
    || digestCanonical(completionEvent.projection?.state?.completion?.release_decision || null)
      !== digestCanonical(decision)) {
    throw new PhaseReportError("stored release decision is not bound to its completion event");
  }
  const expectedRefs = Array.isArray(binding.requirement_refs) ? binding.requirement_refs : [];
  if (!Array.isArray(decision.requirement_results) || decision.requirement_results.length === 0
    || decision.requirement_results.length !== expectedRefs.length) {
    throw new PhaseReportError("stored release decision requirement coverage is invalid");
  }
  const resultRefs = new Set();
  for (const result of decision.requirement_results) {
    const legacyKeys = ["requirement_ref", "fact_id", "outcome", "reason_codes"];
    const currentKeys = [...legacyKeys, "submitted_outcome", "result_id"];
    if (!result || typeof result !== "object" || Array.isArray(result)
      || (!exactKeys(result, legacyKeys) && !exactKeys(result, currentKeys))
      || typeof result.requirement_ref !== "string" || !result.requirement_ref
      || resultRefs.has(result.requirement_ref)
      || !DIGEST.test(result.fact_id || "")
      || !RELEASE_OUTCOMES.has(result.outcome)
      || !Array.isArray(result.reason_codes)
      || result.reason_codes.some((reason) => typeof reason !== "string" || !reason)) {
      throw new PhaseReportError("stored release decision requirement result is invalid");
    }
    resultRefs.add(result.requirement_ref);
    if (Object.hasOwn(result, "submitted_outcome")) {
      const resultBody = { ...result };
      delete resultBody.result_id;
      if (!RELEASE_OUTCOMES.has(result.submitted_outcome)
        || !DIGEST.test(result.result_id || "")
        || digestCanonical(resultBody) !== result.result_id) {
        throw new PhaseReportError("stored release decision effective result digest is invalid");
      }
    }
  }
  if (JSON.stringify([...resultRefs].sort()) !== JSON.stringify([...expectedRefs].sort())) {
    throw new PhaseReportError("stored release decision requirement set is invalid");
  }
  const derivedStatus = decision.requirement_results.some((result) => result.outcome === "failed")
    ? "denied"
    : decision.requirement_results.some((result) => result.outcome === "cannot_verify")
      ? "cannot_verify"
      : "certified";
  if (decision.status !== derivedStatus) {
    throw new PhaseReportError("stored release decision status is inconsistent with its results");
  }
  const body = { ...decision };
  delete body.decision_id;
  if (digestCanonical(body) !== decision.decision_id) {
    throw new PhaseReportError("stored release decision digest is invalid");
  }
  return decision;
}

function buildPhaseReportProjection(taskId, phaseId, options = {}) {
  validateSafeId(taskId, "task id");
  validateSafeId(phaseId, "phase id");
  const paths = options.paths || resolvePaths(options.environment || process.env);
  const events = readAuthoritativeEvents(taskEventFile(paths, taskId), taskId);
  const latest = events.at(-1);
  if (!latest) throw new PhaseReportError(`task has no authoritative state: ${taskId}`);
  const state = latest.projection.state;
  const authority = state.execution_authority;
  if (!authority || authority.schema_version !== 1) {
    throw new PhaseReportError("phase report requires canonical execution authority");
  }
  const contractFile = canonicalFile(authority.contract_path, "execution authority contract");
  const repo = fs.realpathSync(authority.repo_realpath);
  const relative = path.relative(repo, contractFile);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new PhaseReportError("execution authority contract is outside its repository");
  }
  const contractBytes = fs.readFileSync(contractFile);
  if (sha256(contractBytes) !== authority.contract_sha256) {
    throw new PhaseReportError("execution authority contract digest is invalid");
  }
  const markdown = contractBytes.toString("utf8");
  const plan = executionPlan(markdown);
  if (digestCanonical(plan) !== authority.execution_plan_sha256) {
    throw new PhaseReportError("execution authority plan digest is invalid");
  }
  if (JSON.stringify(plan.slices.map((slice) => slice.slice_id))
    !== JSON.stringify(authority.required_slices || [])) {
    throw new PhaseReportError("execution authority slice set is inconsistent");
  }
  const criteria = acceptanceCriteria(markdown);
  const owners = new Map();
  const sliceEvidence = new Map();
  for (const slice of plan.slices) {
    for (const ref of slice.acceptance_refs || []) {
      if (owners.has(ref)) throw new PhaseReportError(`acceptance criterion has multiple owning slices: ${ref}`);
      owners.set(ref, slice.slice_id);
    }
    sliceEvidence.set(
      slice.slice_id,
      acceptedSliceEvidence(taskId, slice, state, events, authority),
    );
  }
  const projectedCriteria = criteria.map((criterion) => {
    const owner = owners.get(criterion.id) || "";
    if (criterion.required && !owner) {
      throw new PhaseReportError(`required acceptance criterion has no owning slice: ${criterion.id}`);
    }
    const evidence = owner
      ? sliceEvidence.get(owner)
      : { status: "not_yet_accepted", receiptIds: [], checks: [] };
    return { ...criterion, owningSlice: owner, ...evidence };
  });
  const required = projectedCriteria.filter((criterion) => criterion.required);
  if (required.length === 0) {
    throw new PhaseReportError("phase report requires at least one required acceptance criterion");
  }
  const covered = required.filter((criterion) => criterion.status === "covered_by_accepted_slice");
  const coverage = covered.length === required.length
    ? "all_required_ac_covered"
    : covered.length === 0
      ? "none"
      : "partial";
  return {
    schema_version: 1,
    task_id: taskId,
    phase_id: phaseId,
    source_revision: latest.revision,
    contract_sha256: authority.contract_sha256,
    execution_plan_sha256: authority.execution_plan_sha256,
    slice_ids: plan.slices.map((slice) => slice.slice_id),
    coverage,
    required_count: required.length,
    covered_count: covered.length,
    criteria: projectedCriteria,
    slices: plan.slices.map((slice) => ({
      slice_id: slice.slice_id,
      acceptance_refs: [...(slice.acceptance_refs || [])],
      ...sliceEvidence.get(slice.slice_id),
    })),
    release_decision: releaseDecision(state, events, authority),
  };
}

function cell(value) {
  return String(value ?? "").replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}

function shortDigest(value) {
  return value ? `${value.slice(0, 16)}…` : "-";
}

function coverageLabel(coverage) {
  return {
    all_required_ac_covered: "全部覆盖",
    partial: "部分覆盖",
    none: "尚未覆盖",
  }[coverage] || "未知";
}

function renderPhaseReportMarkdown(projection) {
  const decision = projection.release_decision;
  const completed = projection.criteria.filter((criterion) => (
    criterion.required && criterion.status === "covered_by_accepted_slice"
  ));
  const incomplete = projection.criteria.filter((criterion) => (
    criterion.required && criterion.status !== "covered_by_accepted_slice"
  ));
  const lines = [
    "# 阶段验收汇报（权威投影）",
    "",
    "> 本文件由权威合同、验收记录与完成状态只读生成；编辑本文件不会改变验收或发布状态。",
    "",
    "## 给产品经理的结论",
    "",
    `- 验收证据覆盖：${coverageLabel(projection.coverage)}（${projection.covered_count}/${projection.required_count} 项必需验收标准）`,
    `- 当前可验收能力：${completed.length > 0 ? completed.map((item) => item.criterion).join("；") : "无"}`,
    `- 尚未形成权威验收：${incomplete.length > 0 ? incomplete.map((item) => item.criterion).join("；") : "无"}`,
    `- 源码候选认证状态：\`${decision?.status || "absent"}\`（仅针对已验证的源码候选；不表示已安装、推送、部署、发布或对外可用）`,
    "",
    "## 完成了什么，以及产品经理如何验收",
    "",
    "| 用户能力 | 产品经理如何验收 | 应看到的结果 | 当前证据结果 |",
    "| --- | --- | --- | --- |",
  ];
  for (const criterion of projection.criteria) {
    const evidence = criterion.status === "covered_by_accepted_slice"
      ? `已形成权威验收；${criterion.receiptIds.length} 个测试记录可追溯`
      : "尚未形成权威验收";
    const conclusion = criterion.status === "covered_by_accepted_slice" ? "已验收" : "待验收";
    lines.push(`| ${cell(criterion.criterion)} | ${cell(criterion.verification)} | ${cell(criterion.criterion)} | ${cell(`${conclusion}；${evidence}`)} |`);
  }
  lines.push(
    "",
    "## 测试了哪些能力",
    "",
    "| 能力或场景 | 测试方式 | 当前结果 | 直接证据 |",
    "| --- | --- | --- | --- |",
  );
  for (const criterion of projection.criteria) {
    const result = criterion.status === "covered_by_accepted_slice"
      ? "已通过并形成权威验收"
      : "尚未形成权威验收";
    const evidence = criterion.receiptIds.length > 0
      ? `${criterion.receiptIds.length} 个测试记录可追溯`
      : "暂无已接受的测试记录";
    lines.push(`| ${cell(criterion.criterion)} | ${cell(criterion.verification)} | ${cell(result)} | ${cell(evidence)} |`);
  }
  lines.push(
    "",
    "## 未完成与下一验收点",
    "",
  );
  if (incomplete.length === 0) {
    lines.push("- 未覆盖的必需验收标准：无。", "- 下一验收点：查看下方源码候选认证状态；不要把阶段验收等同于已部署或已发布。");
  } else {
    for (const criterion of incomplete) {
      lines.push(`- ${criterion.criterion}：尚未形成可追溯的验收证据。`);
    }
    lines.push("- 下一验收点：按上方验收方法完成验证后重新生成本报告。");
  }
  lines.push(
    "",
    "## 源码候选认证（与部署和发布分离）",
    "",
  );
  if (!decision) {
    lines.push("- 状态：`absent`", "- 当前尚无源码候选认证结论；本报告不得自行判断为 `cannot_verify` 或 `certified`。");
  } else {
    const meaning = {
      certified: "指定源码候选的最终证据链完整。",
      denied: "已有证据证明指定源码候选不满足发布要求。",
      cannot_verify: "当前证据不足以确认指定源码候选满足发布要求。",
    }[decision.status];
    lines.push(`- 状态：\`${decision.status}\``, `- 含义：${meaning}`);
  }
  lines.push(
    "",
    "> 上方认证状态只针对本报告所绑定的源码候选；不表示已经安装、推送、部署、发布或对外可用。",
    "",
    "## 技术追溯",
    "",
    `- task_id: \`${projection.task_id}\``,
    `- phase_id: \`${projection.phase_id}\``,
    `- source_revision: \`${projection.source_revision}\``,
    `- coverage: \`${projection.coverage}\``,
    `- contract_sha256: \`${projection.contract_sha256}\``,
    `- execution_plan_sha256: \`${projection.execution_plan_sha256}\``,
    `- slices: ${projection.slice_ids.map((sliceId) => `\`${sliceId}\``).join(", ")}`,
  );
  for (const slice of projection.slices) {
    const checks = slice.checks.map((check) => `${check.gateClass}:${check.checkId}`).join("；") || "-";
    const receipts = slice.receiptIds.map(shortDigest).join("；") || "-";
    lines.push(`- slice \`${slice.slice_id}\`: \`${slice.status}\`；checks ${checks}；receipts ${receipts}`);
  }
  if (decision) {
    lines.push(
      `- release decision_id: \`${decision.decision_id}\``,
      `- candidate_manifest_digest: \`${decision.candidate_manifest_digest}\``,
      "- release requirement results:",
    );
    for (const result of decision.requirement_results || []) {
      const submitted = result.submitted_outcome && result.submitted_outcome !== result.outcome
        ? `；submitted \`${result.submitted_outcome}\``
        : "";
      const reasons = result.reason_codes.length > 0
        ? `；reasons ${result.reason_codes.map((reason) => `\`${reason}\``).join("、")}`
        : "";
      lines.push(`  - ${result.requirement_ref}: \`${result.outcome}\`（fact \`${shortDigest(result.fact_id)}\`${submitted}${reasons}）`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function writePhaseReportProjection(taskId, phaseId, options = {}) {
  const paths = options.paths || resolvePaths(options.environment || process.env);
  const projection = buildPhaseReportProjection(taskId, phaseId, { ...options, paths });
  const file = path.join(
    taskArtifactDir(paths, taskId), "evidence", phaseId, "phase-review-report.md",
  );
  atomicWriteFile(file, renderPhaseReportMarkdown(projection), { encoding: "utf8" });
  return { file, projection };
}

module.exports = {
  PhaseReportError,
  acceptanceCriteria,
  buildPhaseReportProjection,
  renderPhaseReportMarkdown,
  writePhaseReportProjection,
};
