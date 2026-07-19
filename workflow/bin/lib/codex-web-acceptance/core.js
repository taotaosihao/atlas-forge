"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const TOOL = "codex-web-acceptance";
const PROTOCOL = "1";
const SECRET = /(?:authorization\s*[:=]|bearer\s+[a-z0-9._~+/=-]+|(?:password|passwd|token|secret|cookie|dsn|database_url)\s*[:=]\s*[^\s,;}]+|[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@)/i;
class ContractError extends Error {}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const digest = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : String(value)).digest("hex");
const stable = (value) => Array.isArray(value) ? value.map(stable) : isObject(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const stableJson = (value) => `${JSON.stringify(stable(value))}\n`;
const safeFailureReason = (message) => /secret/i.test(message) ? "疑似敏感信息已拒绝" : message;
const fileDigest = (file) => digest(fs.readFileSync(file));
const inside = (root, target) => { const relative = path.relative(root, target); return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`)); };

function exactKeys(value, required, optional, label) {
  if (!isObject(value)) throw new ContractError(`${label} 必须是 JSON object`);
  for (const key of required) if (!(key in value)) throw new ContractError(`${label} 缺少字段: ${key}`);
  const allowed = new Set([...required, ...optional]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new ContractError(`${label} 包含未知字段: ${unknown.join(",")}`);
}
function nonempty(value, label) { if (typeof value !== "string" || !value.trim()) throw new ContractError(`${label} 必须是非空字符串`); }
function argv(value, label) { if (!Array.isArray(value) || !value.length || value.some((part) => typeof part !== "string" || !part)) throw new ContractError(`${label} 必须是非空 argv 字符串数组`); }
function readJson(file, label) { let value; try { value = JSON.parse(fs.readFileSync(file, "utf8")); } catch (error) { throw new ContractError(`${label} 不是合法 JSON: ${file}`); } return value; }
function writeExclusive(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, stableJson(value), { flag: "wx", mode: 0o600 }); }

function containsSecret(value) { if (Array.isArray(value)) return value.some(containsSecret); if (isObject(value)) return Object.entries(value).some(([key, child]) => /(?:authorization|password|passwd|token|cookie|secret|dsn|databaseurl|apikey)/.test(key.replace(/[-_]/g, "").toLowerCase()) || containsSecret(child)); if (typeof value !== "string") return false; if (SECRET.test(value)) return true; const trimmed = value.trim(); if (/^[{[]/.test(trimmed)) { try { return containsSecret(JSON.parse(trimmed)); } catch {} } return false; }
function validateConfig(value, file, base = path.dirname(file)) {
  exactKeys(value, ["schema_version", "protocol_version", "task_id", "scenario_id", "project_root", "adapter", "phases", "validators", "required_evidence"], ["entrypoint", "browser", "viewport", "role", "consecutive_successes"], "project config");
  if (value.schema_version !== 1 || value.protocol_version !== PROTOCOL) throw new ContractError("project config schema/protocol version 不支持");
  nonempty(value.task_id, "task_id"); nonempty(value.scenario_id, "scenario_id"); nonempty(value.project_root, "project_root");
  exactKeys(value.adapter, ["argv"], [], "adapter"); argv(value.adapter.argv, "adapter.argv");
  if (!Array.isArray(value.phases) || !value.phases.length || value.phases.some((item) => typeof item !== "string" || !item)) throw new ContractError("phases 必须是非空字符串数组");
  if (!Array.isArray(value.validators) || !value.validators.length || !Array.isArray(value.required_evidence) || !value.required_evidence.length) throw new ContractError("validators/required_evidence 必须是非空数组");
  const validatorIds = new Set();
  const validatorClaims = new Set();
  for (const [index, item] of value.validators.entries()) { exactKeys(item, ["id", "claim_id", "argv"], [], `validators[${index}]`); nonempty(item.id, "validator id"); nonempty(item.claim_id, "validator claim_id"); argv(item.argv, "validator argv"); if (validatorIds.has(item.id)) throw new ContractError(`重复 validator id: ${item.id}`); validatorIds.add(item.id); }
  const evidenceIds = new Set();
  for (const [index, item] of value.required_evidence.entries()) { exactKeys(item, ["id", "claim_id"], [], `required_evidence[${index}]`); nonempty(item.id, "evidence id"); nonempty(item.claim_id, "evidence claim_id"); if (evidenceIds.has(item.id)) throw new ContractError(`重复 evidence id: ${item.id}`); evidenceIds.add(item.id); }
  for (const item of value.validators) { if (validatorClaims.has(item.claim_id)) throw new ContractError(`required claim 必须只有一个 validator: ${item.claim_id}`); validatorClaims.add(item.claim_id); if (stableJson(item.argv) === stableJson(value.adapter.argv)) throw new ContractError(`validator 必须独立于 adapter: ${item.id}`); }
  const requiredClaims = new Set(value.required_evidence.map((item) => item.claim_id));
  for (const claim of requiredClaims) if (!validatorClaims.has(claim)) throw new ContractError(`required claim 缺少独立 validator: ${claim}`);
  for (const claim of validatorClaims) if (!requiredClaims.has(claim)) throw new ContractError(`validator claim 没有 required evidence: ${claim}`);
  for (const key of ["entrypoint", "browser", "role"]) if (key in value) nonempty(value[key], key);
  if ("viewport" in value) { exactKeys(value.viewport, ["width", "height"], [], "viewport"); if (![value.viewport.width, value.viewport.height].every((n) => Number.isInteger(n) && n > 0)) throw new ContractError("viewport 必须是正整数"); }
  if ("consecutive_successes" in value && (!Number.isInteger(value.consecutive_successes) || value.consecutive_successes < 1)) throw new ContractError("consecutive_successes 必须是正整数");
  const root = path.resolve(base, value.project_root);
  if (!fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) throw new ContractError(`project_root 不是目录: ${root}`);
  return { ...value, project_root: root };
}

function parseSingleJson(stdout, label) {
  const trimmed = stdout.trim();
  if (!trimmed || trimmed.split(/\r?\n/).length !== 1) throw new ContractError(`${label} stdout 必须只包含一个单行 JSON envelope`);
  try { return JSON.parse(trimmed); } catch (error) { throw new ContractError(`${label} stdout 不是合法 JSON`); }
}
function execute(command, input, cwd, label) {
  const child = spawnSync(command[0], command.slice(1), { cwd, input: stableJson(input), encoding: "utf8", maxBuffer: 16 * 1024 * 1024, shell: false });
  if (child.error) throw new ContractError(`${label} 无法启动: ${child.error.message}`);
  if (SECRET.test(child.stderr || "")) throw new ContractError(`${label} diagnostic 包含疑似 secret`);
  if (child.stderr) process.stderr.write(child.stderr);
  if (child.status !== 0) throw new ContractError(`${label} exit=${child.status}`);
  const parsed = parseSingleJson(child.stdout, label);
  if (SECRET.test(child.stdout || "") || containsSecret(parsed)) throw new ContractError(`${label} stdout 包含疑似 secret`);
  return parsed;
}

function validateEvidence(ref, attemptRoot) {
  exactKeys(ref, ["id", "claim_id", "status", "path", "sha256"], [], "evidence ref");
  nonempty(ref.id, "evidence id");
  if (ref.claim_id !== null) nonempty(ref.claim_id, "evidence claim_id");
  if (!["passed", "failed", "blocked", "skipped", "missing"].includes(ref.status)) throw new ContractError(`evidence status 无效: ${ref.status}`);
  if (!/^[a-f0-9]{64}$/.test(ref.sha256)) throw new ContractError(`evidence digest 无效: ${ref.id}`);
  nonempty(ref.path, "evidence path");
  if (path.isAbsolute(ref.path)) throw new ContractError(`evidence path 必须相对 artifact root: ${ref.path}`);
  const target = path.resolve(attemptRoot, ref.path);
  if (!inside(attemptRoot, target)) throw new ContractError(`evidence path 逃逸: ${ref.path}`);
  const stat = fs.lstatSync(target, { throwIfNoEntry: false });
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) throw new ContractError(`evidence 必须是 regular non-symlink file: ${ref.path}`);
  if (fs.realpathSync(attemptRoot) !== path.resolve(attemptRoot) || fs.realpathSync(target) !== target) throw new ContractError(`evidence path 必须是 canonical 且不得经过 symlink: ${ref.path}`);
  const content = fs.readFileSync(target);
  if (digest(content) !== ref.sha256) throw new ContractError(`evidence digest mismatch: ${ref.id}`);
  let structured = null; try { structured = JSON.parse(content.toString("utf8")); } catch {}
  if (SECRET.test(content.toString("utf8")) || (structured && containsSecret(structured))) throw new ContractError(`evidence 包含疑似 secret: ${ref.id}`);
}
function validateAdapter(value, phase, attemptRoot) {
  exactKeys(value, ["protocol_version", "phase", "facts", "evidence_refs", "failure_facts"], [], "adapter envelope");
  if (value.protocol_version !== PROTOCOL || value.phase !== phase) throw new ContractError("adapter protocol/phase mismatch");
  if (containsSecret(value)) throw new ContractError("adapter envelope 包含疑似 secret");
  if (!isObject(value.facts) || Array.isArray(value.evidence_refs) === false || Array.isArray(value.failure_facts) === false) throw new ContractError("adapter facts/evidence_refs/failure_facts 类型无效");
  const forbidden = new Set(["verdict", "accepted", "finalstatus", "final_status", "businessverdict", "business_verdict", "claimstatus", "claim_status"]);
  const visit = (node) => { if (Array.isArray(node)) return node.forEach(visit); if (!isObject(node)) return; for (const [key, child] of Object.entries(node)) { if (forbidden.has(key.toLowerCase())) throw new ContractError(`adapter 不得返回业务权限字段: ${key}`); visit(child); } };
  visit(value);
  for (const ref of value.evidence_refs) validateEvidence(ref, attemptRoot);
  for (const item of value.failure_facts) { exactKeys(item, ["class", "reason"], [], "failure fact"); if (!["project", "environment", "safety", "protocol"].includes(item.class)) throw new ContractError("failure class 无效"); nonempty(item.reason, "failure reason"); }
}
function evidenceDigest(refs) { return digest(stableJson(refs.map((ref) => ({ id: ref.id, claim_id: ref.claim_id, status: ref.status, path: ref.path, sha256: ref.sha256 })).sort((a, b) => a.id.localeCompare(b.id)))); }

function runValidator(definition, input, cwd) {
  const value = execute(definition.argv, input, cwd, `validator ${definition.id}`);
  exactKeys(value, ["protocol_version", "validator_id", "claim_id", "input_digest", "evidence_digest", "status", "reason"], [], "validator envelope");
  if (value.protocol_version !== PROTOCOL || value.validator_id !== definition.id || value.claim_id !== definition.claim_id || value.input_digest !== input.input_digest || value.evidence_digest !== input.evidence_digest) throw new ContractError(`validator identity/digest mismatch: ${definition.id}`);
  if (!["passed", "failed"].includes(value.status)) throw new ContractError(`validator status 无效: ${definition.id}`);
  nonempty(value.reason, "validator reason");
  return value;
}

function run(options) {
  const configFile = path.resolve(options.projectConfig); const contractFile = path.resolve(options.contract); const artifactBase = path.resolve(options.artifactRoot);
  const rawConfig = fs.readFileSync(configFile); const config = validateConfig(JSON.parse(rawConfig), configFile);
  if (!fs.statSync(contractFile, { throwIfNoEntry: false })?.isFile()) throw new ContractError(`contract 不存在: ${contractFile}`);
  const runId = options.runId || `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  if (!/^[A-Za-z0-9._-]+$/.test(runId)) throw new ContractError("run-id 只能包含字母、数字、点、下划线和连字符");
  const runRoot = path.join(artifactBase, runId); fs.mkdirSync(artifactBase, { recursive: true }); if (fs.realpathSync(artifactBase) !== artifactBase) throw new ContractError("artifact root 必须是 canonical non-symlink path"); fs.mkdirSync(runRoot, { recursive: false, mode: 0o700 });
  const contractDigest = fileDigest(contractFile); const configDigest = digest(rawConfig);
  const manifest = { schema_version: 1, run_id: runId, task_id: config.task_id, scenario_id: config.scenario_id, config_base: path.dirname(configFile), contract_digest: contractDigest, config_digest: configDigest };
  writeExclusive(path.join(runRoot, "manifest.json"), manifest);
  fs.copyFileSync(configFile, path.join(runRoot, "frozen-project-config.json"), fs.constants.COPYFILE_EXCL);
  fs.copyFileSync(contractFile, path.join(runRoot, "frozen-contract"), fs.constants.COPYFILE_EXCL);
  const verifyFrozenInputs = () => { if (fileDigest(configFile) !== configDigest || fileDigest(contractFile) !== contractDigest) throw new ContractError("contract 或 project config 在 run 中发生变化"); };
  const attempts = []; const allRefs = []; const allValidators = []; const attemptCount = options.attempts || 1;
  for (let attempt = 1; attempt <= attemptCount; attempt += 1) {
    const attemptRoot = path.join(runRoot, `attempt-${attempt}`); fs.mkdirSync(attemptRoot, { mode: 0o700 });
    const phaseOutputs = []; let failureClass = null;
    try {
      for (const phase of config.phases) {
        verifyFrozenInputs();
        const input = { protocol_version: PROTOCOL, phase, task_id: config.task_id, scenario_id: config.scenario_id, run_id: runId, attempt, project_root: config.project_root, artifact_root: attemptRoot, contract_digest: contractDigest };
        const output = execute(config.adapter.argv, input, config.project_root, `adapter ${phase}`); verifyFrozenInputs(); validateAdapter(output, phase, attemptRoot); phaseOutputs.push(output); allRefs.push(...output.evidence_refs.map((ref) => ({ ...ref, attempt })));
        if (output.failure_facts.length && !failureClass) failureClass = output.failure_facts[0].class;
      }
      const refs = phaseOutputs.flatMap((item) => item.evidence_refs);
      const byId = new Map(); for (const ref of refs) { if (byId.has(ref.id)) throw new ContractError(`重复 evidence id: ${ref.id}`); byId.set(ref.id, ref); }
      for (const required of config.required_evidence) { const ref = byId.get(required.id); if (!ref || ref.claim_id !== required.claim_id || ref.status !== "passed") throw new ContractError(`required evidence 未通过: ${required.id}`); }
      const inputDigest = digest(stableJson(phaseOutputs.map((item) => item.facts))); const refsDigest = evidenceDigest(refs);
      for (const definition of config.validators) {
        verifyFrozenInputs();
        const value = runValidator(definition, { protocol_version: PROTOCOL, validator_id: definition.id, claim_id: definition.claim_id, input_digest: inputDigest, evidence_digest: refsDigest, facts: phaseOutputs.map((item) => item.facts), evidence_refs: refs }, config.project_root); verifyFrozenInputs();
        allValidators.push({ ...value, attempt }); if (value.status !== "passed") throw new ContractError(`required validator 未通过: ${definition.id}`);
      }
      if (failureClass) throw new ContractError(`adapter 登记 failure class: ${failureClass}`);
      attempts.push({ attempt, status: "passed", failure_class: null });
    } catch (error) {
      failureClass ||= "protocol";
      const failureReason = safeFailureReason(error.message);
      const completed = new Set(phaseOutputs.map((item) => item.phase));
      for (const phase of config.phases) if (!completed.has(phase)) phaseOutputs.push({ protocol_version: PROTOCOL, phase, facts: {}, evidence_refs: [], failure_facts: [{ class: failureClass, reason: failureReason }] });
      attempts.push({ attempt, status: "failed", failure_class: failureClass, reason: failureReason });
    }
    writeExclusive(path.join(attemptRoot, "attempt.json"), { schema_version: 1, ...attempts[attempts.length - 1], phases: phaseOutputs });
  }
  const firstPassed = attempts[0].status === "passed"; const anyPassed = attempts.some((item) => item.status === "passed");
  const technicalStatus = firstPassed && attempts.every((item) => item.status === "passed") ? "passed" : anyPassed ? "unstable" : "failed";
  const index = { schema_version: 1, run_id: runId, attempts, evidence_refs: allRefs, validators: allValidators };
  writeExclusive(path.join(runRoot, "evidence-index.json"), index);
  const result = { schema_version: 1, tool: TOOL, run_id: runId, task_id: config.task_id, scenario_id: config.scenario_id, technical_status: technicalStatus, failure_class: attempts.find((item) => item.failure_class)?.failure_class || null, attempts, contract_digest: contractDigest, config_digest: configDigest, evidence_index_digest: fileDigest(path.join(runRoot, "evidence-index.json")) };
  writeExclusive(path.join(runRoot, "run-result.json"), result);
  return { result, run_root: runRoot };
}

function checkRun(options) {
  const root = path.resolve(options.runRoot); if (fs.realpathSync(root) !== root) throw new ContractError("run root 必须是 canonical non-symlink path");
  const control = (file, label) => { const target = path.resolve(root, file); if (!inside(root, target)) throw new ContractError(`${label} path escape`); const stat = fs.lstatSync(target, { throwIfNoEntry: false }); if (!stat?.isFile() || stat.isSymbolicLink() || fs.realpathSync(target) !== target) throw new ContractError(`${label} 必须是 canonical regular non-symlink file`); return target; };
  const manifestFile = control("manifest.json", "manifest"); const resultFile = control("run-result.json", "run result"); const indexFile = control("evidence-index.json", "evidence index");
  const manifest = readJson(manifestFile, "manifest"); const result = readJson(resultFile, "run result"); const index = readJson(indexFile, "evidence index");
  if (containsSecret(manifest) || containsSecret(result) || containsSecret(index)) throw new ContractError("run control artifact 包含疑似 secret");
  exactKeys(manifest, ["schema_version", "run_id", "task_id", "scenario_id", "config_base", "contract_digest", "config_digest"], [], "manifest");
  exactKeys(result, ["schema_version", "tool", "run_id", "task_id", "scenario_id", "technical_status", "failure_class", "attempts", "contract_digest", "config_digest", "evidence_index_digest"], [], "run result");
  exactKeys(index, ["schema_version", "run_id", "attempts", "evidence_refs", "validators"], [], "evidence index");
  if (manifest.schema_version !== 1 || result.schema_version !== 1 || index.schema_version !== 1 || result.tool !== TOOL) throw new ContractError("run schema/tool mismatch");
  const frozenConfigFile = control("frozen-project-config.json", "frozen project config"); const frozenContractFile = control("frozen-contract", "frozen contract");
  if (fileDigest(frozenConfigFile) !== manifest.config_digest || fileDigest(frozenContractFile) !== manifest.contract_digest) throw new ContractError("frozen contract/config digest mismatch");
  const config = validateConfig(readJson(frozenConfigFile, "frozen project config"), frozenConfigFile, manifest.config_base);
  if (result.run_id !== manifest.run_id || index.run_id !== manifest.run_id || result.contract_digest !== manifest.contract_digest || result.config_digest !== manifest.config_digest) throw new ContractError("run identity/digest mismatch");
  if (result.task_id !== manifest.task_id || result.scenario_id !== manifest.scenario_id || config.task_id !== manifest.task_id || config.scenario_id !== manifest.scenario_id) throw new ContractError("run task/scenario identity mismatch");
  if (result.evidence_index_digest !== fileDigest(indexFile)) throw new ContractError("evidence index digest mismatch");
  if (!Array.isArray(index.attempts) || stableJson(index.attempts) !== stableJson(result.attempts)) throw new ContractError("attempt history mismatch");
  if (!Array.isArray(index.evidence_refs) || !Array.isArray(index.validators) || !Array.isArray(index.attempts) || !index.attempts.length) throw new ContractError("evidence index arrays 无效");
  const expectedAttempts = [];
  for (const [attemptIndex, listed] of index.attempts.entries()) {
    exactKeys(listed, listed.status === "failed" ? ["attempt", "status", "failure_class", "reason"] : ["attempt", "status", "failure_class"], [], "attempt summary");
    if (listed.attempt !== attemptIndex + 1 || !["passed", "failed"].includes(listed.status)) throw new ContractError("attempt history 必须从 1 开始连续且有序");
    const attemptFile = control(`attempt-${listed.attempt}/attempt.json`, "attempt record"); const record = readJson(attemptFile, "attempt record");
    exactKeys(record, record.status === "failed" ? ["schema_version", "attempt", "status", "failure_class", "reason", "phases"] : ["schema_version", "attempt", "status", "failure_class", "phases"], [], "attempt record");
    if (containsSecret(record)) throw new ContractError("attempt record 包含疑似 secret");
    if (record.schema_version !== 1 || record.attempt !== listed.attempt || !Array.isArray(record.phases) || stableJson(record.phases.map((phase) => phase.phase)) !== stableJson(config.phases)) throw new ContractError("attempt record phase identity/顺序无效");
    const refs = record.phases.flatMap((phase) => { validateAdapter(phase, phase.phase, path.dirname(attemptFile)); return phase.evidence_refs; });
    const byId = new Map(); for (const ref of refs) { if (byId.has(ref.id)) throw new ContractError(`重复 evidence id: ${ref.id}`); byId.set(ref.id, ref); }
    let derivedStatus = "passed"; let derivedReason = null; let derivedClass = null;
    const failureFact = record.phases.flatMap((phase) => phase.failure_facts)[0]; if (failureFact) { derivedStatus = "failed"; derivedReason = `adapter 登记 failure class: ${failureFact.class}`; derivedClass = failureFact.class; }
    for (const required of config.required_evidence) { const ref = byId.get(required.id); if (!ref || ref.claim_id !== required.claim_id || ref.status !== "passed") { derivedStatus = "failed"; derivedReason = `required evidence 未通过: ${required.id}`; derivedClass ||= "protocol"; break; } }
    const inputDigest = digest(stableJson(record.phases.map((phase) => phase.facts))); const refsDigest = evidenceDigest(refs);
    for (const definition of config.validators) { const matches = index.validators.filter((item) => item.attempt === listed.attempt && item.validator_id === definition.id); if (derivedStatus === "passed" && matches.length !== 1) { derivedStatus = "failed"; derivedReason = `validator 数量无效: ${definition.id}`; derivedClass = "protocol"; break; } if (matches.length > 1) throw new ContractError(`重复 validator record: ${definition.id}`); if (matches.length) { const value = matches[0]; exactKeys(value, ["protocol_version", "validator_id", "claim_id", "input_digest", "evidence_digest", "status", "reason", "attempt"], [], "validator record"); if (value.protocol_version !== PROTOCOL || value.claim_id !== definition.claim_id || value.input_digest !== inputDigest || value.evidence_digest !== refsDigest || value.status !== "passed") { derivedStatus = "failed"; derivedReason = `validator closure 无效: ${definition.id}`; derivedClass = "protocol"; break; } } }
    if (listed.reason !== record.reason) throw new ContractError("attempt reason 与证据闭包不一致");
    if (listed.status !== derivedStatus || record.status !== derivedStatus || listed.failure_class !== record.failure_class || (derivedStatus === "passed" && listed.failure_class !== null) || (derivedClass && listed.failure_class !== derivedClass)) throw new ContractError(derivedReason || "attempt status/failure class 与证据闭包不一致");
    expectedAttempts.push(listed);
  }
  const knownValidators = new Set(config.validators.map((item) => item.id)); for (const value of index.validators) if (!knownValidators.has(value.validator_id) || !Number.isInteger(value.attempt) || value.attempt < 1 || value.attempt > index.attempts.length) throw new ContractError("未知 validator record");
  const flattened = [];
  for (const listed of index.attempts) { const record = readJson(path.join(root, `attempt-${listed.attempt}`, "attempt.json"), "attempt record"); flattened.push(...record.phases.flatMap((phase) => phase.evidence_refs.map((ref) => ({ ...ref, attempt: listed.attempt })))); }
  if (stableJson(flattened) !== stableJson(index.evidence_refs)) throw new ContractError("evidence index 与 attempt records 不一致");
  const expected = result.attempts[0]?.status === "passed" && result.attempts.every((item) => item.status === "passed") ? "passed" : result.attempts.some((item) => item.status === "passed") ? "unstable" : "failed";
  if (result.technical_status !== expected) throw new ContractError("failure class/attempt technical status mismatch");
  const expectedFailureClass = result.attempts.find((item) => item.failure_class)?.failure_class || null; if (result.failure_class !== expectedFailureClass) throw new ContractError("run failure_class mismatch");
  return { schema_version: 1, tool: TOOL, command: "check-run", ok: result.technical_status === "passed", run_id: result.run_id, technical_status: result.technical_status };
}

module.exports = { ContractError, checkRun, containsSecret, digest, fileDigest, readJson, run, stableJson };
