# 规划证据索引

workflow_id: 20260710-001-atlas-forge-js-first-self-use-workflow-replan
evidence_status: planning-complete

| Evidence | Location | Role |
| --- | --- | --- |
| 执行合同 | [implementation-contract.final.md](../implementation-contract.final.md) | 权威范围与验收 |
| 实施计划 | [implementation-plan.md](../implementation-plan.md) | Phase、验证和停止条件 |
| 架构决策 | [decision.md](../decision.md) | 方案比较与选型 |
| 实施分工 | [staffing.md](../staffing.md) | 后续 slice ownership |
| 上一轮发布合同 | [release contract](../../20260710-003-atlas-forge-release-integrity-governance-plan/implementation-contract.final.md) | 继续有效的 release 防线 |
| Phase 1 结论 | [phase-1-conclusion.md](./phase-1-conclusion.md) | JS task-id/slug keeper slice 与验证 |
| Phase 2A 结论 | [phase-2a-conclusion.md](./phase-2a-conclusion.md) | JS task repository `list/show` 读取切片 |
| Phase 2B 结论 | [phase-2b-conclusion.md](./phase-2b-conclusion.md) | JS task lifecycle、状态扩展、事件与 stale |

## 本轮只读事实

- `codex-workflow`：8,197 行 Bash、约 174 个函数、41 个顶层命令、44 段 Python heredoc。
- Node 基线：当前机器 `v24.15.0`；仓库已有无依赖 CommonJS CLI/validators。
- 同步边界：`workflow/bin/` 已递归进入 Atlas scoped sync 与 equality verification。
- task inventory：`doing=15`、`done=464`、`todo=2`；存在重复 task-id 前缀和长期 doing。
- Multica changed-path check：规划落盘后 `plugins/multica-sdlc/**` 与 `.agents/**` 无 diff。

## 验证记录

- strict implementation contract lint：通过。
- contract index lint：通过。
- relative Markdown links：通过。
- workflow readiness `context,spec,analysis,decision`：通过。
- private path audit：runtime/instructions 无未授权发现；本 bundle 未新增 private path。
- Phase 1 Node tests：7/7 通过。
- Phase 1 hermetic repo contract：通过。
- Phase 1 Atlas dev-sync integration：通过，`workflow/bin/lib/` 递归同步且 release/Multica sentinels 不变。
- Phase 1 完整 `workflow/tests/contract.sh`：通过。
- Phase 2A Node tests：17/17 通过。
- Phase 2A 删除 list-only Bash/Python，并保留 lifecycle 共用 validator。
- Phase 2A hermetic repo contract 与完整 `workflow/tests/contract.sh`：通过。
- Phase 2B task tests：25/25 通过，含并行 init、状态机、done gate、pointer、archive 与 stale。
- Phase 2B 删除 task-specific Bash ID/render/status/lifecycle 实现；公开 Bash 仅 delegation + legacy memory sync。
- Phase 2B hermetic repo contract、dev-sync 与完整 `workflow/tests/contract.sh`：通过。
