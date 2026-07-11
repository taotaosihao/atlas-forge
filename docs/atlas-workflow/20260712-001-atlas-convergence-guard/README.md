# Atlas 工作流收敛减法

本 bundle 是 `20260712-001-atlas` 的实施入口。目标是用一道 execute 准入和流程减法解决误晋级与长任务膨胀，不再增加 roadmap/scope/review 状态机。

## 核心规则

- 分析、评审和澄清不能自行进入 execute；execute 必须引用明确实施消息。
- “完整实施”只有在当前已授权目标就是具名 roadmap 或其全部已列 phases 时，才连续完成内部 slices；“完成”“不要停”本身不扩大较窄目标，roadmap 文件存在性也不授权实施。
- Reviewer 发现不受限；自动 repair 只覆盖当前目标阻断、当前 diff 回归和使本次交付不安全的问题。
- 明确、低风险、可验证的工作默认由主 agent 直接完成；多文件本身不触发 Team。
- 自动 commit 按适中的独立逻辑成果划分；长任务只维护一份非 Git 覆盖式 checkpoint。
- 时间、轮次、Agent、commit、token 和 tool call 只作 telemetry。

## 文档

- [合同入口](contract-index.md)
- [最终决策](decision.md)
- [执行规格](spec.md)
- [权威实现合同](implementation-contract.final.md)
- [执行责任](staffing.md)

## 验证

专项 Team command/SDD/native tests 先运行，再运行 plugin validation、integrity、repo contract 和最终 `workflow/tests/contract.sh`。原始日志不提交 Git；命令结果、逻辑 commit 和最终报告构成结论证据。
