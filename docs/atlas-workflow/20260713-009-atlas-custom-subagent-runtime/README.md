# Atlas custom subagent 相对降本路由

本 bundle 定义 Atlas Team 的相对降本方案：减少不必要的 subagent 和 Sol 调用，按任务需要优先选择 Luna、Terra、Sol；运行时模型信息用于抽样校准，不作为日常工作硬门禁。

## 当前结论

- `.codex/agents/*.toml` 保持官方 standalone custom-agent 格式。
- 模型分配是可回退的成本偏好，不追求每次 spawn 的绝对证明。
- metadata 不可见时标记 `unverified` 并允许继续；只有出现疑似成本异常时才按需校准，确认昂贵模型继承、异常 fan-out 或明显成本失控时停止新增 fan-out 并做最小只读诊断。
- 不建设长期 smoke runner，不修改真实用户配置，不自动启用 MultiAgentV2。

## 权威文件

- [合同索引](./contract-index.md)
- [最终实施合同](./implementation-contract.final.md)
- [执行澄清](./clarify.md)
- [可实施规格](./spec.md)
- [实施决策](./decision.md)

## 下一步

本 bundle 只定义范围与验收，不构成实施授权。若用户另行授权实施，则按合同修改 Team 与 agent prompt 并补齐静态测试；runtime 校准仅在出现疑似成本信号或用户明确要求时进行，不是完成实施的必需步骤。
