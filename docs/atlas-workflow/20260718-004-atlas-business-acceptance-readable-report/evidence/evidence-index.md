# 方案证据索引

workflow_id: `20260718-004-atlas`
artifact_category: phase_conclusion

## Brownfield 证据

- 当前模板暴露机器字段：`workflow/templates/business-acceptance-report.md`、`business-evidence-map.md`、`business-verdict.md`。
- 机器字段被测试固化：`workflow/tests/contract_team_business_acceptance.sh` 与 `workflow/tests/contract.sh`。
- 当前 machine truth：`plugins/atlas-workflow/contracts/team-sdd/business-*.schema.json`、`validators/business-*.js`、`scripts/codex-team-artifact-lint`。
- Phase 6 能力边界：`docs/atlas-workflow/20260710-003-atlas-forge-release-integrity-governance-plan/evidence/phase-6-conclusion.md`。

## 方案阶段验证

- 多 Agent：三个只读席位完成两轮独立审阅和交叉质疑，结论记录于 `../team-decision.md`。

| Gate | 命令或动作 | 结果 |
| --- | --- | --- |
| Markdown links | `scripts/check-relative-markdown-links.py --root .` | 通过；检查 228 个 Markdown 文件和 73 个相对链接 |
| Contract index | `node plugins/atlas-workflow/scripts/codex-contract-index-lint --root docs/atlas-workflow/20260718-004-atlas-business-acceptance-readable-report` | `contract_index_lint: true` |
| Implementation contract | `node plugins/atlas-workflow/scripts/codex-implementation-contract-lint --strict --file docs/atlas-workflow/20260718-004-atlas-business-acceptance-readable-report/implementation-contract.final.md` | semantics v1，0 errors，0 warnings |
| Workflow readiness | `codex-workflow ready 20260718-004-atlas --require context,spec,decision` | `status: ready`，issues 为空 |
| Markdown diff | `git diff --check` | 通过 |
| Forbidden paths | `git diff --exit-code -- plugins/multica-sdlc .agents` | 通过；无 diff |
| Hard fingerprints | 只读 `git rev-parse HEAD:plugins/multica-sdlc HEAD:.agents` | `8b87ecd1c5decce18f31e65442747661debfcb5e` / `3e3f8d512d88d309830ceb180baf694149ffa657` |

## 第一性原理人工审查摘要补充验证

followup_workflow_id: `20260718-005-atlas`

| Gate | 命令或动作 | 结果 |
| --- | --- | --- |
| 双入口合同 | 检查权威实施合同自身摘要、生成报告固定结构、`AC-16` 和 presentation diagnostic | 通过；合同与报告均强制使用“要确认什么、事实从哪里来、为什么是这个结论、人工还要判断什么”四问 |
| Markdown links | `scripts/check-relative-markdown-links.py --root .` | 通过；检查 228 个 Markdown 文件和 73 个相对链接 |
| Contract index | `node plugins/atlas-workflow/scripts/codex-contract-index-lint --root docs/atlas-workflow/20260718-004-atlas-business-acceptance-readable-report` | `contract_index_lint: true` |
| Implementation contract | `node plugins/atlas-workflow/scripts/codex-implementation-contract-lint --strict --file docs/atlas-workflow/20260718-004-atlas-business-acceptance-readable-report/implementation-contract.final.md` | semantics v1，0 errors，0 warnings |
| Markdown diff | `git diff --check` | 通过 |
| Forbidden paths | `git diff --exit-code -- plugins/multica-sdlc .agents` | 通过；无 diff |

## 实施阶段证据预算

- Git 只保留最终代码、测试、必要 golden fixture、权威合同和一个精简 phase conclusion。
- 原始命令输出、临时 BAF bundle、失败重试、完整 diff、hash 中间值和 debug 输出放 Git 外临时目录。
- 本任务不创建截图、视频、HAR、Playwright trace 或浏览器证据；Product/UI gate 不适用。

## 20260718-006 BLOCK 与 20260718-007 修订验证

- 三席只读 Team Review `20260718-006-atlas-team-review` 一致裁决 `BLOCK`：计数 view-model、dual 混合环境、rejected 过度表述、conditional 警告顺序和 principle diagnostic 测试层不闭合。
- 用户授权 `20260718-007-atlas` 修订并再次 review；当前修订不修改 BAF schema/validator、Multica、安装态、cache 或 marketplace。

| Gate | 命令或动作 | 当前结果 |
| --- | --- | --- |
| Review repairs source assertion | 检查业务/技术结果维度、alignment 单位、failure signal、not-run/null 链路、证据边界、severity、pure policy、AC-17 至 AC-21 | 通过；`focused_semantic_assertions: true` |
| Markdown links | `scripts/check-relative-markdown-links.py --root .` | 通过；检查 228 个 Markdown 文件和 73 个相对链接 |
| Contract index | `node plugins/atlas-workflow/scripts/codex-contract-index-lint --root docs/atlas-workflow/20260718-004-atlas-business-acceptance-readable-report` | `contract_index_lint: true` |
| Implementation contract | `node plugins/atlas-workflow/scripts/codex-implementation-contract-lint --strict --file docs/atlas-workflow/20260718-004-atlas-business-acceptance-readable-report/implementation-contract.final.md` | semantics v1，0 errors，0 warnings |
| Markdown diff | `git diff --check` | 通过 |
| Forbidden paths | `git diff --exit-code -- plugins/multica-sdlc .agents` | 通过；无 diff |
| Model policy | `workflow/bin/atlas-agent-model-policy` | 通过；`atlas-agent-model-policy: ok family=5.6 roles=7`；实际运行时模型未由当前工具证明 |
| Workflow readiness | `codex-workflow ready 20260718-007-atlas --require context,spec,decision` | `status: ready`，issues 为空 |
| Second Team Review | 原三席按业务可读性、合同可实施性和防误导能力迭代复审当前完整 diff | 最终三席均 `PASS`，P0/P1 均为 0；task `20260718-007-atlas` |

最终复审确认合同已覆盖：

- `business_result` 与 `technical_gate_result` 不混算，顶层状态与明确场景失败信号不同时如实提示；
- ghost 按记录、duplicate 按不同 ID、missing 按不同场景 ID 计数，重复 ghost 的重叠规则和 fixtures 唯一；
- 双侧/单侧 not-run/null 先于 path 相等判断，只有两个非空 path 相等才可称同链路；
- evidence 只声明已实现的结构与必要引用检查，accepted-risk 不冒充正式批准；
- 原因只出现一次，首屏用业务词显示高严重度事项，四问和完整首屏分别受 `180/520` 与 `540` 字符预算约束；
- tamper-first 保持不变，所有 renderer-owned presentation diagnostics 都有统一纯函数测试入口。
