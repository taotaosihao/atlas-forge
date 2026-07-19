"use strict";

const { main: auditMain } = require("./audit");
const { ContractError, checkRun, fileDigest, run } = require("./core");
const { review } = require("./review");

function parse(argv, command) {
  const result = {};
  while (argv.length) { const raw = argv.shift(); if (!raw.startsWith("--")) throw new ContractError(`意外的位置参数: ${raw}`); const equal = raw.indexOf("="); const key = raw.slice(2, equal < 0 ? undefined : equal); const value = equal < 0 ? argv.shift() : raw.slice(equal + 1); if (key === "check-owner-decision") { if (equal >= 0 || (value && !value.startsWith("--"))) throw new ContractError("--check-owner-decision 不接受值"); result.checkOwnerDecision = true; if (value) argv.unshift(value); continue; } if (!value || value.startsWith("--")) throw new ContractError(`--${key} 缺少值`); const property = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); if (property in result) throw new ContractError(`重复选项: --${key}`); result[property] = value; }
  const allowed = command === "run" ? ["projectConfig", "contract", "artifactRoot", "runId", "attempts", "format"] : command === "check-run" ? ["runRoot", "format"] : ["bafRoot", "card", "contract", "format", "checkOwnerDecision"];
  for (const key of Object.keys(result)) if (!allowed.includes(key)) throw new ContractError(`未知选项: --${key}`);
  result.format ||= "human"; if (!new Set(["json", "human"]).has(result.format)) throw new ContractError("--format 必须是 json 或 human");
  if (command === "run") { for (const key of ["projectConfig", "contract", "artifactRoot"]) if (!result[key]) throw new ContractError(`run 缺少 --${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`); if (result.attempts !== undefined) { result.attempts = Number(result.attempts); if (!Number.isInteger(result.attempts) || result.attempts < 1) throw new ContractError("--attempts 必须是正整数"); } }
  if (command === "check-run" && !result.runRoot) throw new ContractError("check-run 缺少 --run-root");
  if (command === "review") { for (const key of ["bafRoot", "card"]) if (!result[key]) throw new ContractError(`review 缺少 --${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`); if (result.checkOwnerDecision) { if (!result.contract) throw new ContractError("owner decision 校验需要 --contract"); result.contractDigest = fileDigest(result.contract); } }
  return result;
}
function human(command, value) { if (command === "run") return `Atlas Web UI 技术运行\nrun: ${value.result.run_id}\n状态: ${value.result.technical_status}\nartifacts: ${value.run_root}\n`; if (command === "check-run") return `Atlas Web UI 运行校验\nrun: ${value.run_id}\n状态: ${value.technical_status}\n`; return `Atlas Web UI 场景审核卡校验\n场景: ${value.scenario_id}\n证据校验: ${value.evidence_validation.status}\n` }
function usage(message) { if (message) process.stderr.write(`${message}\n`); process.stderr.write("usage: codex-web-acceptance audit|run|check-run|review [options]\n"); process.exitCode = 1; }
function main(argv) {
  const command = argv[0]; if (command === "audit") return auditMain(argv);
  if (!["run", "check-run", "review"].includes(command)) return usage("首个参数必须是 audit、run、check-run 或 review");
  try { const options = parse(argv.slice(1), command); const value = command === "run" ? run(options) : command === "check-run" ? checkRun(options) : review(options); if (options.format === "json") process.stdout.write(`${JSON.stringify(value)}\n`); else process.stdout.write(human(command, value)); const ok = command === "run" ? value.result.technical_status === "passed" : value.ok; process.exitCode = ok ? 0 : 2; }
  catch (error) { if (error instanceof ContractError) usage(error.message); else { process.stderr.write(`codex-web-acceptance: 内部错误: ${error.message}\n`); process.exitCode = 1; } }
}
module.exports = { main };
