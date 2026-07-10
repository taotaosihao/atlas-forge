# 规划证据索引

workflow_id: 20260710-001-atlas-forge-js-first-self-use-workflow-replan
evidence_status: implemented

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
| Phase 3 结论 | [phase-3-conclusion.md](./phase-3-conclusion.md) | evidence-bound outcome marker 与 latency report |
| Phase 4A 结论 | [phase-4a-conclusion.md](./phase-4a-conclusion.md) | artifact scaffold、routing、checkpoint、source 与 prompt planning 迁移 |
| Phase 4B 结论 | [phase-4b-conclusion.md](./phase-4b-conclusion.md) | readiness、verify/record、gate metrics 与 generic feedback 迁移 |
| Phase 5 领域决策 | [phase-5-domain-decisions.md](./phase-5-domain-decisions.md) | native team migrate 与其余领域 keep-shell/retire 边界 |
| Phase 5 结论 | [phase-5-conclusion.md](./phase-5-conclusion.md) | native team CommonJS 迁移、legacy 边界与验证 |
| Phase 6 结论 | [phase-6-conclusion.md](./phase-6-conclusion.md) | 薄公开 façade、JS root router、legacy boundary 与最终集成 |

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
- Phase 3 marker/report tests：12/12 通过；全部 JS tests：37/37 通过。
- Phase 3 keeper commits：marker `01e5526`；report `f35f87f`。
- Phase 3 复审发现并关闭 N/A denominator 与 incomplete task-event validation 两项缺陷；最终 verdict 为 `CLEAN`。
- Phase 3 hermetic repo contract、dev-sync 与完整 `workflow/tests/contract.sh`：通过。
- Phase 4A keeper commits：scaffold `1d08a5b`；planning `e3e8202`。
- Phase 4A artifact tests：12/12；全部 JS tests：49/49；repo/full contract 与 dev-sync 通过。
- Phase 4A reviewer：4A1 P2 修复后 `CLEAN`；4A2 `CLEAN`；release/Multica forbidden paths 无 diff。
- Phase 4B keeper commits：readiness `19e6667`；verify `5dc5951`；gates `162f8b4`；feedback `99bc7e9`。
- Phase 4B targeted tests：4+5+5+5；全部 JS tests：68/68；repo/full contract 与 dev-sync sentinel 通过。
- Phase 4B reviewers：4B1/4B3/4B4 `CLEAN`；4B2 quoting P2 修复并 focused recheck `CLEAN`。
- Phase 4B 结束时 `codex-workflow` 为 5,407 行、28 段 Python heredoc；Multica-facing handler 保留且 function block diff=0。
- Phase 5 keeper commits：领域决策 `74af117`；native team `0c86f66`。
- Phase 5 native team tests 6/6；全部 JS tests 74/74；repo contract 与独立 reviewer `CLEAN`。
- Phase 5 结束时 `codex-workflow` 为 4,773 行、26 段 Python heredoc；legacy team 与 Multica-facing 边界保留。
- Phase 6 keeper commits：入口拆分 `4898ebc`；doctor layout fixture `e7c3859`。
- Phase 6 root CLI tests 4/4；全部 JS tests 78/78；独立 reviewer `CLEAN`。
- 最终 `contract.sh`、host layout、strict doctor 35/35、local cache 与 dev-sync 通过；Multica hard fingerprints 全部匹配。
- 公开 `codex-workflow` 为 5 行 façade；4,775 行 internal legacy 仅承接 13 条显式 keep-shell 命令与兼容 usage。
