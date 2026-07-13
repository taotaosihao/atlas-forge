# 证据索引

当前阶段完成合同修正，尚未执行实现。

- 官方依据：OpenAI Codex Subagents 与 Configuration Reference。
- 本机基线：`codex-cli 0.144.1`；stable `multi_agent=true`；`multi_agent_v2=false`。
- Runtime 校准：仅在出现异常 token 消耗、异常 fan-out、疑似昂贵父模型继承等成本信号，或用户明确要求时抽样；版本/配置变化本身不触发。可见 metadata 记录简短结论，原始 logs/session 输出不进入 Git。
- `unverified` 表示当前不可观察，不表示 Team 执行失败。
- 当前没有触发校准，因此无需 runtime 校准证据。
