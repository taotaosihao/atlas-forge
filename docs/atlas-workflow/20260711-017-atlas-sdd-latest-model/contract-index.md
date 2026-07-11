# 合同索引

workflow_id: 20260711-017-atlas-sdd
contract_status: implemented
current_authoritative_contract: ./implementation-contract.final.md

## 来源链

- 用户方向：禁止项目调用非最新模型，重点治理 reviewer。
- workflow context：`/home/gewu/.codex/workflow/artifacts/20260711-017-atlas-sdd/context.md`
- workflow clarify：`/home/gewu/.codex/workflow/artifacts/20260711-017-atlas-sdd/clarify.md`
- workflow spec：`/home/gewu/.codex/workflow/artifacts/20260711-017-atlas-sdd/spec.md`

## 支持材料

- staffing：`./staffing.md`
- durable spec：`./spec.md`
- team_decision：不适用，本任务未使用 team flow。
- evidence_index：验证结论记录在本 bundle 的 `README.md` 与任务最终回复；原始输出未提交。
- workflow_team_decision：不适用。
- workflow_team_staffing：不适用。

## 权威规则

- `implementation-contract.final.md` 是实施范围与验收的唯一权威。
- “最新模型”由本地 catalog 的最高稳定 GPT family 决定；5.6 不是永久许可值。策略语义稳定，具体投影显式审查。
- 本 bundle 不授权真实安装态刷新。

## 下一步

在新 Codex task 中使用更新后的 skill/agents；每次 native team spawn 前运行 `~/.codex/workflow/bin/atlas-agent-model-policy check`。
