# 一句话需求准入门 Team Brainstorm

Task: `20260626-013-atlas-workflow-one-line-request-intake-optimization`

## 背景

用户反馈：一句话需求会被过早解释为可执行编码任务，缺少先询问、确定需求边界、批判性反馈和方案化澄清。用户已确认目标方向：

- 一句话需求默认先问，但 tiny fix 有逃生口。
- 生效范围包括 `atlas-workflow` 插件和当前机器全局 `/home/gewu/.codex/AGENTS.md`。
- 非 tiny 需求必须落文档后再进入编码。

## Team 共识

采用“轻量准入门 + 白名单 tiny escape”。核心不是机械统计句子数量，而是判断请求信息密度和执行风险。低信息、多解释空间、缺少验收路径的请求应先进入 intake/clarify；只有白名单 tiny fix 才能直接执行。

## 推荐修改面

- `/home/gewu/.codex/AGENTS.md`
- `plugins/atlas-workflow/skills/intake/SKILL.md`
- `plugins/atlas-workflow/skills/task/SKILL.md`
- `plugins/atlas-workflow/skills/cw/SKILL.md`
- `plugins/atlas-workflow/skills/clarify/SKILL.md`
- `plugins/atlas-workflow/README.md`
- `workflow/tests/contract.sh`

## Tiny Escape 条件

直接执行应同时满足：

- 目标面明确。
- 期望行为明确。
- 验收命令或人工检查明确。
- 风险低。
- 不涉及数据、权限、部署、迁移、产品策略或架构边界。
- 通常为单文件或极小范围改动。

不确定是否 tiny 时，先问一个简短问题。

## 非 Tiny 文档门槛

非 tiny 不需要完整 PRD，但必须可审计：

- 澄清阶段至少有 `context.md` 和 `spec.md`。
- 进入可执行方案或 team promotion 时写项目文档。
- 编码前形成 lightweight implementation contract 或等价文档，包含目标、非目标、决策边界、验收标准、验证命令、风险/反例和停止条件。

已有外部 issue、PRD 或设计文档可以作为等价证据，但当前 workflow artifact 必须引用它，并补齐缺失的验收、风险和停止条件。

## 用户已确认

- 不确定是否 tiny 时必须先问。
- 接受外部 issue、PRD 或设计文档作为非 tiny 文档等价证据。
- 同意把 `$atlas-workflow:cw` 纳入本次修改面。

## 拒绝方案

- 不采用“所有一句话都强制先问”。
- 不只改 `intake`。
- 不只改全局 `AGENTS.md`。
- 不做复杂自动分类器。

## 验证建议

- `rg` 检查准入门、tiny escape、非 tiny 文档和批判性反馈规则。
- `bash -n workflow/tests/contract.sh`
- `workflow/tests/contract.sh`
- 刷新插件 cache 后用 `cmp` 验证 source/cache 一致。
- 人工审查三类反例：模糊一句话功能、明确 tiny fix、用户显式直接实现但高风险的请求。

## 待确认

- contract test 首轮做到关键规则 grep，还是加入 fixture 场景。
