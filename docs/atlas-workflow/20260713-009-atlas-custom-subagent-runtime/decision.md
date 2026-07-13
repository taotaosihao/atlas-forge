# 实施决策

选定官方 standalone `.codex/agents/*.toml` 机制。先实现 stable runtime 的隔离、opt-in profile-binding smoke，只有可信 resolved role/model/effort 全部匹配后，才把 Atlas Team 的模型路由标记为受运行时保证。

不直接启用 MultiAgentV2，不修改真实用户配置，不以 agent 自报或 UI badge 代替可信 metadata。Gate A 不通过时停止并返回脱敏最小复现。
