# Atlas Forge JS-first 自用工作流重规划

本 bundle 将 Atlas Forge 的近期目标从“面向外部分发的发布能力”切换为“纯自用场景下更快、更容易维护的本地工作流”。

## 结论

- 采用 CommonJS + Node 标准库，不引入 npm 依赖、TypeScript 或构建链。
- 采用按命令域渐进迁移；公开 `codex-workflow` 路径保留，Bash 最终收缩为薄 façade。
- 首个代码切片直接修复 task slug，并建立 `node:test` 路径，不先做空框架。
- JS-first MVP 由三部分组成：slug、task lifecycle/hygiene、outcome events/report。
- release/marketplace 能力降为 trigger-only backlog；现有 fail-closed 和 integrity guard 保持不动。
- Multica 继续 planned deprecation，整个方案不修改、不迁移、不运行 Multica。

## 文档入口

- [权威合同](./implementation-contract.final.md)
- [实施计划](./implementation-plan.md)
- [架构决策](./decision.md)
- [实施分工](./staffing.md)
- [合同索引](./contract-index.md)

## 与上一轮计划的关系

上一轮 [发布完整性与工作流治理方案](../20260710-003-atlas-forge-release-integrity-governance-plan/README.md) 已完成的保护继续有效。本 bundle 只取代其“后续优先级”和“延后项路线”：

- shared marketplace mutation 继续 fail closed，不重新开放。
- Atlas-only marketplace 与 exact-SHA rotation 不再是近期实施项。
- release integration 只在 release 相关文件变化时运行，不阻塞普通 task/workflow 迭代。
- 既有 release 合同仍是相应代码的行为依据；本 bundle 不授权移除任何保护。

## 下一步

Phase 1–3 的 JS-first MVP 已完成；用户已批准继续。Phase 4A 也已完成：五个 scaffold 命令及 route/checkpoint/source/prompt planning 命令均由 CommonJS 单一实现。下一步进入 Phase 4B，迁移 readiness、feedback 与 verification；低优先级 release backlog 和 Multica 继续不进入关键路径。
