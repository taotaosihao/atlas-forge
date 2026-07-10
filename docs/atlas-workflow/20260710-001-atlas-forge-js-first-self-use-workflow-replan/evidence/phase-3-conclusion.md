# Phase 3 结论：Outcome events 与 latency report

workflow_id: 20260710-001-atlas-forge-js-first-self-use-workflow-replan
implementation_task: 20260710-010-atlas-forge-js-first-outcome-metrics-phase-3
phase_status: implemented
created: 2026-07-10

## Keeper outcome

- Marker keeper commit：`01e5526 feat(workflow): record structured outcome events`。
- Report keeper commit：`f35f87f feat(workflow): report outcome latency`。
- `outcome-mark` 写入 `outcome.first-code|operable-flow|clean-review` schema-v1 JSONL event，并强制单行 evidence；显式 N/A 同时要求 reason。
- `outcome-report [--days N] [--json]` 只把具有合法 `task.created` 的任务纳入 prospective window，从最早合法 `task.started` 到最早合法 applicable marker 计算 raw wall-clock latency。
- 报告按 kind 输出 applicable、known、unknown、not-applicable、coverage 与 median；无 applicable denominator 时 coverage 为 `null`/`n/a`。
- historical task 不回填、不猜测，只计入 `historical_unknown_count`；window 外 prospective task 单独计数。
- open stale count 复用 Phase 2 的只读 stale 模型，但不进入 outcome latency；既有 gate metrics 保持独立。

## 事件与报告边界

| Boundary | Implemented behavior |
| --- | --- |
| Prospective 起点 | 最早合法 schema-v1 `task.created`，必须包含 object `data` |
| Latency 起点 | 不早于 created 的最早合法 schema-v1 `task.started` |
| Applicable 终点 | 不早于 start 的最早合法同 kind marker |
| Not applicable | 最早合法同 kind marker 为 N/A 时排除 denominator，不要求 start |
| Legacy rows | `{kind,detail,created_at}` 及伪 outcome detail 全部忽略 |
| 时间来源 | 只使用结构化 event `occurred_at`；不使用 Git、mtime 或 task date |

Markdown 与 JSON 由同一个 report model 渲染。runtime 行物理顺序不参与语义，所有候选事件按 `occurred_at` 排序。

## 复审闭环

初审发现两项结果正确性问题：pre-start/missing-start N/A 被计入 applicable unknown，以及缺少 `data` 的伪 schema-v1 task event 可建立 prospective/start。实现随后分离 applicability 与 latency endpoint，并要求 `task.created/task.started` 的 `data` 为非数组 object；新增对应负向 fixtures 后，复审判定两项均关闭，最终 verdict 为 `CLEAN`。

## 验证

| Gate | Result |
| --- | --- |
| `node --test workflow/tests/js/outcome-*.test.js` | 12/12 passed |
| `node --test workflow/tests/js/*.test.js` | 37/37 passed |
| `bash workflow/tests/contract_repo.sh` | passed |
| `bash workflow/tests/integration_atlas_plugin_dev_sync.sh` | passed；hermetic sync，未写真实安装态 |
| `bash workflow/tests/contract.sh` | passed |
| source CLI 读取真实 self-use state | passed；0 prospective，历史任务保持 unknown，未写运行态 |
| reviewer recheck | `CLEAN`；P1/P2 closed |
| forbidden paths | release/plugin/Multica/`.agents/**` 无 diff |

## 明确暂留

- 不实现 marker 撤销、active-time 扣除、SLO、dashboard、个人或 agent 排名。
- 不回填历史 outcome，不把 synthetic/headless fixture 当真实 operable flow；headless 使用显式 N/A。
- 实施 task `20260710-010-atlas-forge-js-first-outcome-metrics-phase-3` 创建于 schema-v1 lifecycle 上线前，因此保持 historical unknown；不为自测补写或推断 latency。
- artifact、readiness 与 verification 仍在 Phase 4；release backlog 继续 trigger-only，Multica 继续 planned deprecation 且零修改。

## 下一步

JS-first MVP 已达成。下一决策点是在当前收益点暂停，或另行进入 Phase 4；若继续，应先选择高频、纯数据且 Python heredoc 密集的 artifact 命令迁移到 CommonJS，并保持公开 CLI 与现有合同兼容。
