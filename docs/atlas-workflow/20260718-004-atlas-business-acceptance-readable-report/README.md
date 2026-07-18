# Atlas 业务验收中文阅读层方案

workflow_id: `20260718-004-atlas`
artifact_category: durable_handoff
status: ready-for-implementation

## 结论

当前 BAF v2 的机器门禁保持不变。新增一个 headless renderer，从已经通过 strict business artifact lint 的完整 JSON bundle 确定性生成中文 `business-acceptance-report.md`，并提供陈旧、手改和业务交付完整性检查。

生成报告是只读派生物，不是第二事实源。业务人员只阅读报告中的中文结论、范围、技术资格、环境真实性、场景结果、双目标独立证据和未解决事项；原始字段、枚举、ID、路径、score 和 failed gates 进入技术附录。

## 给人工审查者的底层原理摘要

- **要确认什么**：不是看材料数量，而是判断约定业务目标在约定范围内是否达到。
- **事实从哪里来**：只使用已登记的场景结果、环境、验收材料和未解决事项；中文报告不创造新事实。
- **为什么是这个结论**：先确认材料是否完整且彼此对应，再把已登记结论、场景结果和剩余问题放到一起供业务审查；前一步通过不等于业务已经同意。
- **人工还要判断什么**：范围是否正确、材料是否可信、剩余风险是否可接受；验收报告不自动证明生产可用，也不等于发布批准。

实施合同和未来生成的 `business-acceptance-report.md` 都必须保留这类四问摘要。报告中的摘要位于一句话结论之后，且由 `--presentation-strict` 检查结构完整、表达简短和内部术语泄漏。

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

当前只完成可实施方案。下一步需要用户明确授权实施；实施后仍只修改仓库权威源，不刷新真实 plugin cache、marketplace snapshot 或共享 workflow runtime。
