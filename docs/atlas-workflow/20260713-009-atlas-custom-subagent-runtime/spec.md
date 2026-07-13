# 可实施规格摘要

## 目标

证明 `atlas-sdd-reviewer` 使用 Terra high、`atlas-sdd-phase-reviewer` 使用 Sol medium 的真实 spawned-session 绑定，并让 Atlas Team 合同只声明已被证明的能力。

## 非目标

- 不调整模型组合，不新增 agent。
- 不建设动态路由器、风险矩阵或成本 dashboard。
- 不修改真实 Codex 用户配置、cache、marketplace、runtime 或 Multica。

## 阶段

### Phase 1：Runtime proof

- 实现 opt-in smoke runner、两个命名 agent probe、可信 metadata parser、negative fixtures、redaction 和 cleanup。
- specialized child 使用 self-contained mission；禁止把 full-history inheritance 当作通过。
- 产出 `passed | failed | inconclusive`。

### Gate A

只有 resolved role、model、effort 全部匹配时 `passed`。agent 自报、UI badge 或单纯 spawn 成功均不足。

### Phase 2：Contract convergence

- Team 精确点名 custom agents；默认模型不等于固定 staffing。
- 难以撤销的方向在实现前使用 Sol planner；完成结果使用 Sol phase reviewer。
- 明确环境 blocker 不触发 Sol review。
- 视觉 Sol review 只用于 phase/final acceptance。
- implementer 遵循 controller 的适中提交边界。

详细验收与命令见 [最终实施合同](./implementation-contract.final.md)。
