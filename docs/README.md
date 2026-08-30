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
| [Atlas 3D Harness v0.1 接入合同](atlas-3d-harness.md) | 当前 source checkout 与冻结本机 Mac 上的 3D thin facade、输入信任、bridge、CLI、evidence、compare、安全和限制 |
| [Clarify 当前源码规则](../plugins/atlas-workflow/skills/clarify/SKILL.md) | 只补实际执行缺口；较大且有实质工程取舍时自动使用动态工程视角，在合同前独立提案并相互回应；复用有效批准且不放松身份、权限与发布边界。源码专项已验证，未刷新安装态或运行真实行为回放 |
| [Atlas 默认轻量化方案](atlas-workflow/20260817-001-atlas-default-lightweight/implementation-plan.md) | 保留普通工作的轻量执行、单一范围正文与必要风险控制；ordinary Product/UI contract 不要求独立 `required_safety_gates` 字段。Clarify 的 main-only 默认已被当前技能源码规则取代；安装态未刷新 |
| [Atlas 快速产品通道与后续框架债务修订方案](atlas-workflow/20260803-001-atlas-rapid-product-path/implementation-plan.md) | 保留 product_increment/product_release、path lease 与模型路由解耦及延期债务 backlog；普通 safety 行为沿用默认轻量化方案，Clarify staffing 以当前技能源码为准 |
| [Atlas Clarify 与 Team 有界并行默认策略实施方案](atlas-workflow/20260809-001-atlas-clarify-team-bounded-parallel/implementation-plan.md) | 保留已选择 Team 后的 bounded-ready-wave 策略与兼容边界；Clarify 不因“非 tiny”自动建 child，按当前技能中的实质工程取舍与明确协作请求判断 |
| [Atlas Team Paseo 显式启用与 Codex 连续降级实施方案](atlas-workflow/20260720-011-atlas-team-paseo-codex/implementation-plan.md) | Team 默认 Codex、Paseo 局部 opt-in、Claude model 仅人工指定、运行故障 fallback、多角色审查收敛与实施接管的当前开发目标；实现前以源码和测试的现状行为为准 |
| [Atlas Workflow 支持 Claude Code（双宿主并存）实施方案](atlas-workflow/20260815-001-atlas-claude-code-support/implementation-plan.md) | Claude Code 插件清单/市场、skills 宿主中性化、运行时路径中立、hooks、7 个原生 agents 映射、Team 原生协作按宿主拆分、6 个 Claude commands、Grok provider family 预置的当前实施范围；Codex 行为保持逐字节不变 |
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
