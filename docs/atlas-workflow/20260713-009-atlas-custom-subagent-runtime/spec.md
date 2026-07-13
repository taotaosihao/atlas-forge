# 可实施规格摘要

## 目标

通过按需 staffing、低成本模型优先和失败后升级，实现 Team 模式的相对降本，同时保持关键判断质量。

## 非目标

- 不保证每次 spawn 都能证明实际 model/effort。
- 不禁止 controller 根据任务证据选择其他可用 profile。
- 不建设 runtime router、Gate A、长期 smoke runner、风险矩阵或成本 dashboard。
- 不修改真实 Codex 用户配置、安装态、MultiAgentV2、发布或 Multica。

## 默认与升级路径

- 小而清晰的任务：默认由主 Agent 直接完成；只有具体证据表明 specialist review 或 delegation 能明显降低风险或延迟时才使用 subagent。
- 实现角色需要时：优先 `atlas-sdd-implementer` / Luna max。
- 常规 review 或 verify 需要时：优先 Terra high。
- 规划确有价值、方向难以撤销或关键结果验收时：优先 Sol medium。
- 默认路径出现一次疑似实现/决策错误且根因不明时：考虑升级 Sol；明确环境 blocker 不升级。
- 大量浏览器操作使用 Luna high；只有证据支撑阶段/最终验收且额外判断有价值时才使用 Sol phase reviewer。

## Runtime 校准

- 只有出现异常 token 消耗、异常 fan-out、疑似昂贵父模型继承等成本信号，或用户明确要求时，才抽样检查一个低成本角色和一个 Sol 角色；版本或配置变化本身不触发校准。
- metadata 可用则记录 `verified`；不可见或矛盾则记录 `unverified`，不阻塞普通任务。
- 确认昂贵父模型继承、异常 fan-out 或成本失控时停止新增 fan-out，允许最小只读诊断，并降级为主 Agent 或更少 subagent；需要配置、运行时、安装、日志上传、上游 issue 或发布 mutation 时另行请求授权。

详细验收与验证见 [最终实施合同](./implementation-contract.final.md)。
