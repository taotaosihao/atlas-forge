# Atlas Forge 文档索引

本索引定义仓库文档的阅读优先级，不批量改写历史方案。源码、schema、测试和 manifest 与文档冲突时，以当前可执行合同为准。

## Authoritative

以下文件用于当前开发、运行或发布决策：

| 文档 | 权威范围 |
| --- | --- |
| [仓库 README](../README.md) | marketplace、安装、开发和仓库布局 |
| [项目约束](../AGENTS.md) | source of truth、开发/发布边界、Multica 禁写和最小验证矩阵 |
| [Workflow helper README](../workflow/README.md) | `codex-workflow` 命令、artifact 和 helper 使用边界 |
| [Atlas Workflow plugin README](../plugins/atlas-workflow/README.md) | Atlas skill 入口和合同概览；source/cache 路径以项目约束为准 |
| [发布完整性与治理 bundle](atlas-workflow/20260710-003-atlas-forge-release-integrity-governance-plan/README.md) | 当前 Atlas release integrity、semantic lint 和治理合同及 phase evidence |
| [业务验收中文阅读层合同](atlas-workflow/20260718-004-atlas-business-acceptance-readable-report/README.md) | BAF v2 中文派生报告、freshness/tamper 与 presentation-strict；底层 machine semantics 继续继承发布完整性与治理 bundle |
| [远端 Agent 部署手册](remote-agent-deployment.md) | 仅 legacy/full-stack 兼容部署；包含冻结 Multica 资产，不是 Atlas dev/release 路径 |
| [Daily Agent Benchmark](daily-agent-benchmark.md) | benchmark 的当前运行说明 |

## Superseded

以下文档保留设计演进证据，但不再作为当前执行入口：

| 已取代文档 | 后继文档或实现 |
| --- | --- |
| [业务验收优先初版方案](atlas-forge-native-team-business-first-acceptance-plan.md) | [业务验收框架评审修订版](atlas-forge-native-team-business-acceptance-review-revised-plan.md) |
| [业务验收框架评审修订版](atlas-forge-native-team-business-acceptance-review-revised-plan.md) | [Native Team 业务验收层实施方案](atlas-workflow/20260707-001-atlas-native-team-business-acceptance-implementation-plan.md) 及当前 business schemas/tests |
| [Native Team 业务验收层实施方案](atlas-workflow/20260707-001-atlas-native-team-business-acceptance-implementation-plan.md) | [当前发布完整性与治理 bundle](atlas-workflow/20260710-003-atlas-forge-release-integrity-governance-plan/README.md) 中的 BAF v2 合同与 Phase 6 证据 |
| [Native Team Superpowers unbounded fix-loop plan](atlas_forge_codex_native_team_superpowers_unbounded_fix_loop_plan.md) | [Final revised plan](atlas_forge_codex_native_team_superpowers_final_revised_plan.md) |

## Historical

- 除 Authoritative 表明确登记的当前入口外，`docs/` 下的 plan、review 和 implementation contract 默认都是历史决策或审阅证据；Superseded 表左栏进一步标识其中已被明确取代的文档。
- 文件名包含 `review` 的文档默认记录当时 finding，不自动成为当前规范。
- 历史文档可以解释设计来源，但不能覆盖当前 `AGENTS.md`、权威 bundle、源码、schema 或测试。
- 新文档只有在本索引明确登记后，才成为跨任务的权威入口。
