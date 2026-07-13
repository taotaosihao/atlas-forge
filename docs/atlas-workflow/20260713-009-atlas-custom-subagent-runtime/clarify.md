# 执行澄清

## 原始请求

按照官方文档和社区调查建议，把“custom subagent 实际模型不可证明”澄清为可实施方案。

## 重述要求

先建立可重复、隔离、可信 metadata 驱动的 runtime smoke；通过后再修正 Team 路由合同。任何不确定、继承或不可观察结果均不得静默判定成功。

## 锁定边界

- 只验证 stable multi-agent 与官方 standalone custom agents。
- live smoke 默认关闭，需要显式 opt-in。
- 不修改真实用户配置，不自动启用 MultiAgentV2，不刷新安装态，不发布。
- 原始日志、session dump 和认证临时副本只在临时目录，禁止进入 Git。

## 关键反馈

直接继续修改模型策略解决不了运行时证据缺口；必须把 static policy 与 runtime binding 分成两个独立 gate。

## 停止条件

需要实验性 runtime、真实配置 mutation、无法安全处理认证、metadata 不可信或 profile 无法精确选择时停止并返回用户。
