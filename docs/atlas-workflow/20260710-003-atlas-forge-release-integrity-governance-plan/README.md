# Atlas Forge 发布完整性与工作流治理实施方案

workflow_id: `20260710-003-atlas-forge`
artifact_category: durable handoff
status: implementation active

## 结论

Atlas Forge 下一轮实施先解决 atlas-workflow 的发布身份、开发/发布通道混写、stale marketplace snapshot、active cache 防降级和 manifest runtime compatibility。完成这些 P0 后，再拆分 hermetic repo contract 与 host-install integration，最后把 first-code、Product/UI 和 BAF 双目标从文字 presence guard 升级为 versioned semantic lint。

Multica 已标记为 `planned deprecation`：现有兼容入口保留，但不修复、不迁移、不重构、不 bump、不补测试。本方案禁止修改 Multica source、generated assets、router、listener、fixtures、runtime 和同步入口。

## 权威文件

- 当前权威实施方案：[implementation-plan.md](./implementation-plan.md)
- 当前权威实施合同：[implementation-contract.final.md](./implementation-contract.final.md)
- 合同入口：[contract-index.md](./contract-index.md)
- 团队决策：[team-decision.md](./team-decision.md)
- 分工和阶段门：[staffing.md](./staffing.md)
- Native 复核摘要：[reviews/native-plan-review.md](./reviews/native-plan-review.md)
- 证据索引：[evidence/evidence-index.md](./evidence/evidence-index.md)

## 实施顺序

1. Manifest 与 release identity。
2. Dev/release 通道隔离与防降级。
3. Plugin-scoped strict doctor。
4. Hermetic repo contract、host-install integration 与 CI。
5. First-code/Product UI semantic lint。
6. BAF v2 dual-goal semantic lint。
7. 最小文档治理。

Outcome metrics、task 状态扩展、自动清理、slug 修正和 `codex-workflow` 模块化均延后。Multica listener 模块化从路线中删除。

## 下一步

实现任务为 `20260710-004-atlas-forge`。从 Phase 1 开始，每个 phase 独立实现、验证、review 和提交；任一 P0 未闭环时不得进入 semantic lint。
