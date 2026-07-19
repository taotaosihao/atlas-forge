"use strict";

const fs = require("fs");
const path = require("path");
const { ContractError, containsSecret, digest, fileDigest, readJson, stableJson } = require("./core");

const MISSING = new Set(["未登记", "当前无法判断"]);
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function keys(value, required, optional, label) { if (!isObject(value)) throw new ContractError(`${label} 必须是 object`); for (const key of required) if (!(key in value)) throw new ContractError(`${label} 缺少字段: ${key}`); const allowed = new Set([...required, ...optional]); const unknown = Object.keys(value).filter((key) => !allowed.has(key)); if (unknown.length) throw new ContractError(`${label} 未知字段: ${unknown.join(",")}`); }
function text(value, label) { if (typeof value !== "string" || !value.trim()) throw new ContractError(`${label} 必须是非空字符串`); }
function array(value, label) { if (!Array.isArray(value)) throw new ContractError(`${label} 必须是数组`); }

function evidenceIds(map, scenarioId) { return new Set(map.evidence_refs.filter((item) => typeof item === "string" || item.scenario_id === scenarioId).map((item) => typeof item === "string" ? item : item.evidence_id).filter(Boolean)); }
function integrationMode(verdict) { if (verdict.schema_version === 1) return "not_run"; const goals = [verdict.goal_a, verdict.goal_b].filter(Boolean); if (!goals.length) return "not_run"; const modes = new Set(goals.map((goal) => goal.integration_mode)); return modes.size === 1 ? goals[0].integration_mode : "not_run"; }
function canonicalFile(root, relative, label) { if (typeof relative !== "string" || !relative || path.isAbsolute(relative)) throw new ContractError(`${label} 必须是 card-root 内相对路径`); const target = path.resolve(root, relative); if (target === root || !target.startsWith(`${root}${path.sep}`)) throw new ContractError(`${label} path escape`); const stat = fs.lstatSync(target, { throwIfNoEntry: false }); if (!stat?.isFile() || stat.isSymbolicLink() || fs.realpathSync(target) !== target) throw new ContractError(`${label} 必须是 canonical regular non-symlink file`); return target; }
function validateCard(card, verdict, map, scenario, authority, cardRoot) {
  keys(card, ["schema_version", "task_id", "scenario_id", "title", "baf_refs", "integration_mode", "steps", "reference_images", "actual_screenshots", "limitations"], ["owner_decision"], "review card");
  if (card.schema_version !== 1) throw new ContractError("review card schema_version 不支持");
  for (const key of ["task_id", "scenario_id", "title", "integration_mode"]) text(card[key], key);
  if (card.task_id !== verdict.task_id || card.task_id !== map.task_id) throw new ContractError("card/BAF task_id mismatch");
  keys(card.baf_refs, ["verdict", "technical_status", "business_status", "evidence_refs", "verdict_digest", "evidence_map_digest", "scenario_digest"], [], "baf_refs"); array(card.baf_refs.evidence_refs, "baf_refs.evidence_refs");
  if (card.baf_refs.verdict !== verdict.verdict || card.baf_refs.technical_status !== verdict.technical_gate_status || card.baf_refs.business_status !== verdict.business_acceptance_status) throw new ContractError("card 未忠实引用当前 BAF verdict/status");
  if (card.integration_mode !== integrationMode(verdict)) throw new ContractError("card integration_mode 与 BAF 不一致");
  if (card.baf_refs.verdict_digest !== authority.verdict || card.baf_refs.evidence_map_digest !== authority.map || card.baf_refs.scenario_digest !== authority.scenario) throw new ContractError("card BAF authority digest 已过期");
  if (card.scenario_id !== scenario.scenario_id || card.title !== scenario.business_goal || scenario.task_id !== card.task_id) throw new ContractError("card 未忠实引用当前 BAF scenario");
  const known = evidenceIds(map, card.scenario_id); for (const id of card.baf_refs.evidence_refs) if (!known.has(id)) throw new ContractError(`card 引用了未登记 evidence: ${id}`);
  const evidenceById = new Map(map.evidence_refs.filter((item) => item.scenario_id === card.scenario_id).map((item) => [item.evidence_id, item]));
  array(card.steps, "steps"); if (!card.steps.length) throw new ContractError("card 至少需要一个场景步骤");
  const operations = new Set([scenario.trigger, ...(scenario.expected_agent_behavior || [])]); const expected = new Set([...(scenario.expected_business_state || []), ...(scenario.pass_criteria || [])]);
  for (const [index, step] of card.steps.entries()) { keys(step, ["operation", "expected", "actual", "evidence_refs"], [], `steps[${index}]`); for (const key of ["operation", "expected", "actual"]) text(step[key], `steps[${index}].${key}`); if (!operations.has(step.operation) || !expected.has(step.expected)) throw new ContractError(`steps[${index}] 未忠实引用 scenario 操作/预期`); array(step.evidence_refs, "step evidence_refs"); for (const id of step.evidence_refs) if (!known.has(id)) throw new ContractError(`步骤引用未登记 evidence: ${id}`); if (!step.evidence_refs.length && !MISSING.has(step.actual)) throw new ContractError("无证据的实际结果必须写“未登记”或“当前无法判断”"); if (step.evidence_refs.length) { const actual = step.evidence_refs.map((id) => { const item = evidenceById.get(id); return `${item.description}（结果：${item.result}）`; }).join("；"); if (step.actual !== actual) throw new ContractError(`steps[${index}] actual 未忠实引用 evidence facts`); } }
  for (const field of ["reference_images", "actual_screenshots", "limitations"]) { array(card[field], field); if (!card[field].length) throw new ContractError(`${field} 缺失时必须显式登记占位语义`); card[field].forEach((item) => text(item, field)); }
  for (const [field, label] of [["reference_images", "reference image"], ["actual_screenshots", "actual screenshot"]]) for (const item of card[field]) if (!MISSING.has(item)) canonicalFile(cardRoot, item, label);
  if (card.integration_mode !== "real" && /真实(?:运行|系统验收|\s*UI\s*验收|链路|环境|系统)/i.test(stableJson(card))) throw new ContractError("非 real integration_mode 不得称为真实运行");
}

function review(options) {
  const bafRoot = path.resolve(options.bafRoot); const cardFile = path.resolve(options.card);
  if (path.basename(bafRoot) !== "acceptance" || path.basename(path.dirname(bafRoot)) !== "team") throw new ContractError("baf-root 必须指向 task artifact 的 team/acceptance");
  const verdictFile = path.join(bafRoot, "business-verdict.json"); const mapFile = path.join(bafRoot, "business-evidence-map.json");
  for (const [file, label] of [[verdictFile, "business verdict"], [mapFile, "business evidence map"], [cardFile, "review card"]]) { const stat = fs.lstatSync(file, { throwIfNoEntry: false }); if (!stat?.isFile() || stat.isSymbolicLink() || fs.realpathSync(file) !== path.resolve(file)) throw new ContractError(`${label} 必须是 canonical regular non-symlink file`); }
  const verdict = readJson(verdictFile, "business verdict"); const map = readJson(mapFile, "business evidence map"); const card = readJson(cardFile, "review card");
  if (containsSecret(card)) throw new ContractError("review card 包含疑似 secret");
  const scenariosRoot = path.resolve(bafRoot, "scenarios"); const scenarioRootStat = fs.lstatSync(scenariosRoot, { throwIfNoEntry: false }); if (!scenarioRootStat?.isDirectory() || scenarioRootStat.isSymbolicLink() || fs.realpathSync(scenariosRoot) !== scenariosRoot) throw new ContractError("BAF scenarios 必须是 canonical directory"); const candidates = fs.readdirSync(scenariosRoot).filter((name) => /^business-scenario-card\..+\.json$/.test(name)).map((name) => path.join(scenariosRoot, name)).filter((file) => { const stat = fs.lstatSync(file); return stat.isFile() && !stat.isSymbolicLink() && fs.realpathSync(file) === file; }); const matches = candidates.filter((file) => { try { return readJson(file, "scenario").scenario_id === card.scenario_id; } catch { return false; } }); if (matches.length !== 1) throw new ContractError("当前 BAF scenario 引用必须唯一"); const scenarioFile = matches[0]; const scenario = readJson(scenarioFile, "scenario");
  const authority = { verdict: fileDigest(verdictFile), map: fileDigest(mapFile), scenario: fileDigest(scenarioFile) };
  const cardRoot = fs.realpathSync(path.dirname(cardFile)); validateCard(card, verdict, map, scenario, authority, cardRoot);
  let owner = { checked: false, status: "not_checked", reason: "未要求校验 owner 判断" };
  if (options.checkOwnerDecision) {
    keys(card.owner_decision, ["decision", "owner", "decision_evidence_id", "contract_digest", "verdict_digest", "evidence_map_digest", "scenario_digest", "reference_digests", "actual_digests", "evidence_refs"], [], "owner_decision");
    if (!new Set(["符合", "不符合", "需修改"]).has(card.owner_decision.decision)) throw new ContractError("owner decision 必须是“符合/不符合/需修改”");
    text(card.owner_decision.owner, "owner identity");
    text(card.owner_decision.decision_evidence_id, "owner decision evidence id"); const decisionEvidence = map.evidence_refs.find((item) => item.evidence_id === card.owner_decision.decision_evidence_id && item.scenario_id === card.scenario_id); if (!decisionEvidence) throw new ContractError("owner decision 未登记为当前 BAF evidence"); const taskArtifactRoot = fs.realpathSync(path.resolve(bafRoot, "../..")); const decisionPath = canonicalFile(taskArtifactRoot, decisionEvidence.evidence_path, "owner decision evidence"); if (decisionPath !== cardFile) throw new ContractError("owner decision evidence 未指向当前审核卡"); const verdictEvidence = new Set([...(verdict.goal_a?.evidence_refs || []), ...(verdict.goal_b?.evidence_refs || [])]); if (["accepted", "conditionally_accepted"].includes(verdict.verdict) && !verdictEvidence.has(card.owner_decision.decision_evidence_id)) throw new ContractError("最终 verdict 未引用 owner decision evidence");
    for (const field of ["reference_digests", "actual_digests", "evidence_refs"]) array(card.owner_decision[field], `owner_decision.${field}`); for (const field of ["reference_digests", "actual_digests"]) if (card.owner_decision[field].some((value) => !/^[a-f0-9]{64}$/.test(value))) throw new ContractError(`owner_decision.${field} digest 无效`);
    if (card.owner_decision.contract_digest !== options.contractDigest || card.owner_decision.verdict_digest !== authority.verdict || card.owner_decision.evidence_map_digest !== authority.map || card.owner_decision.scenario_digest !== authority.scenario) throw new ContractError("owner decision 当前引用 digest mismatch");
    const expectedRefs = [...card.baf_refs.evidence_refs].sort(); const actualRefs = [...card.owner_decision.evidence_refs].sort(); if (stableJson(expectedRefs) !== stableJson(actualRefs)) throw new ContractError("owner decision evidence refs 已变化");
    const referenceDigests = card.reference_images.filter((item) => !MISSING.has(item)).map((item) => fileDigest(canonicalFile(cardRoot, item, "reference image"))).sort();
    const actualDigests = card.actual_screenshots.filter((item) => !MISSING.has(item)).map((item) => fileDigest(canonicalFile(cardRoot, item, "actual screenshot"))).sort();
    if (stableJson(referenceDigests) !== stableJson([...card.owner_decision.reference_digests].sort()) || stableJson(actualDigests) !== stableJson([...card.owner_decision.actual_digests].sort())) throw new ContractError("owner decision image refs 已变化");
    owner = { checked: true, validator_id: "acceptance-owner-design-intent", status: card.owner_decision.decision === "符合" ? "passed" : "failed", reason: `acceptance owner 已登记：${card.owner_decision.decision}`, owner: card.owner_decision.owner, card_digest: digest(fs.readFileSync(cardFile)) };
  }
  return { schema_version: 1, tool: "codex-web-acceptance", command: "review", ok: owner.status !== "failed", task_id: card.task_id, scenario_id: card.scenario_id, evidence_validation: owner };
}
module.exports = { review };
