# Atlas 业务验收中文阅读层方案

workflow_id: `20260718-004-atlas`
artifact_category: durable_handoff
status: ready-for-implementation

## 结论

当前 BAF v2 的机器门禁保持不变。新增一个 headless renderer，从已经通过 strict business artifact lint 的完整 JSON bundle 确定性生成中文 `business-acceptance-report.md`，并提供陈旧、手改和业务交付完整性检查。

生成报告是只读派生物，不是第二事实源。业务人员只阅读报告中的中文结论、范围、技术资格、环境真实性、场景结果、双目标独立证据和未解决事项；原始字段、枚举、ID、路径、score 和 failed gates 进入技术附录。

## 验收前先看四件事

- **要确认什么**：不是看材料数量，而是判断约定业务目标在约定范围内是否达到。
- **事实从哪里来**：只使用验收结论中记录的判断、场景定义、实际结果、环境记录、验收材料、偏差和风险；计划场景不冒充实际结果，缺失不冒充零条。
- **为什么是这个结论**：系统不重新决定通过或不通过，只核对记录结构和合同明确要求的关系，再解释实际状态、阻断和剩余事项；记录通过检查不等于每项材料都支持结论，也不等于业务已经同意。
- **人工还要判断什么**：自动检查不核实材料内容；证据提供方负责真实性，业务负责人判断目标、范围和剩余风险，发布批准另行进行。

实施合同和未来生成的 `business-acceptance-report.md` 都必须保留这类四问摘要。报告中的摘要由唯一只读模型确定性生成，原因只出现一次，整个首屏受字符预算约束；有条件验收的不可签署警告先于任何正向措辞；业务结果与技术结果分开，顶层状态和场景失败信号不同时必须明示；两个空链路不能写成同一链路；最高或高严重度偏差和标记风险必须用业务词在首屏提示。

## 文档入口

- [合同索引](./contract-index.md)
- [最终实施合同](./implementation-contract.final.md)
- [多 Agent 决策](./team-decision.md)
- [实施分工](./staffing.md)
- [方案验证索引](./evidence/evidence-index.md)

## 与既有 BAF v2 的关系

本方案只覆盖业务阅读和交付展示层。以下权威继续来自既有 [Phase 6 合同与证据](../20260710-003-atlas-forge-release-integrity-governance-plan/README.md)：

- v1/v2 兼容规则；
- strict v2、task/scenario/report closure；
- Goal A/B 状态、同一路径、integration mode 和证据不可替代；
- local、external、manual evidence identity 与路径安全；
- machine lint 只证明结构、引用、状态和证据身份的能力边界。

本方案不修改既有 `business-*.schema.json` 或 `validators/business-*.js`，也不把业务验收升级成生产发布批准。

## 下一步

修订后的实施合同已通过业务可读性、合同可实施性和对抗性三席复审，P0/P1 均为 0。当前仍只完成可实施方案，尚未实现 renderer；下一步需要用户明确授权实施。实施时仍只修改仓库权威源，不刷新真实 plugin cache、marketplace snapshot 或共享 workflow runtime。
