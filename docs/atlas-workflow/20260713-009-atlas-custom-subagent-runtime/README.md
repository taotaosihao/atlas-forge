# Atlas custom subagent runtime 路由证明

本 bundle 将官方 custom-agent 机制收敛为可实施的两阶段方案：先用隔离 smoke 证明 stable native runtime 真实绑定 custom-agent profile，再最小修正 Atlas Team 路由合同。

## 当前结论

- `.codex/agents/*.toml` 是官方支持的项目级 standalone custom-agent 格式。
- 静态 model policy 不能替代真实 runtime profile/model/effort 证据。
- 当前 `codex-cli 0.144.1` 的 stable `multi_agent` 是首要验证对象；不自动启用 under-development MultiAgentV2。

## 权威文件

- [合同索引](./contract-index.md)
- [最终实施合同](./implementation-contract.final.md)
- [执行澄清](./clarify.md)
- [可实施规格](./spec.md)
- [职责边界](./staffing.md)

## 下一步

在新任务中按最终实施合同执行 Phase 1。Gate A 未通过时停止，不进入“运行时保证已成立”的 Phase 2。
