# Atlas 单据完整业务流转验收材料

workflow_id: `20260720-001-atlas`
artifact_category: durable_handoff
status: ready-for-implementation

## 结论

下一版 Atlas Web UI Acceptance 不再把最终截图和 run 总结果当作足够的业务验收材料。凡声称“业务验收”的场景，都必须把同一单据从初始状态到最终状态的完整业务流转组织为可读时间线，并为每个关键节点并列展示操作、预期、实际、对象状态变化、UI/network/backend/DB/audit/外部输入证据及其当前 BAF evidence 引用。

方案不新增平行事实源或 verdict。BAF v2 JSON/JSONL 继续是唯一 machine facts，`business-verdict.json` 继续是唯一最终 verdict；新增内容是现有 `codex-web-acceptance review` 的版本化 review-card v2 校验和确定性 Markdown 输出。任何无法从当前已登记 evidence 确定的内容必须写“未登记”或“当前无法判断”。

## 权威入口

- [合同索引](./contract-index.md)
- [执行澄清](./clarify.md)
- [执行规格](./spec.md)
- [最终实施合同](./implementation-contract.final.md)
- [实施分工](./staffing.md)
- [方案证据索引](./evidence/evidence-index.md)

## 关键设计

1. 项目通过 domain-neutral flow contract 声明业务单据类型、关键节点、允许的状态转换、正向路径和必须展示的反向控制；Core 不理解 `WorkOrder`、`LineTask` 或 `DeviceTask` 等领域名称。
2. 项目 adapter 继续提交原始 evidence；项目独立 validators 继续判断领域 join、状态转换和因果关系。Core 只校验 review material 是否忠实引用当前 BAF/evidence、结构是否完整、引用是否 canonical、摘要是否由已登记事实确定性组成。
3. review-card v2 使用结构化 `document_chain`、`flow_steps`、`negative_controls`、`final_state` 和 `convergence`，每个 actual fact 都必须指向已登记 evidence ID；不能从截图、文件名或 AI 文本推断业务事实。
4. `codex-web-acceptance review --format markdown` 只渲染已经验证的 card，不读取未登记数据、不重算 verdict、不鉴真、不签字；JSON 仍可供机器校验。
5. Acceptance owner 的判断必须绑定 flow 内容摘要。flow、场景、verdict、evidence map、参考图、实际截图或 evidence refs 任一变化，旧判断即失效。
6. Sharp Cell 首个材料按 WorkOrder → LineTask → DeviceTask → assignment → invalid callback no-mutation → valid callback → UI running readback 展示；优先复用 run29/run30/run31，缺证据则明确失败关闭，不靠补写说明通过。

## 下一步

本 bundle 只锁定实施方案，不授权写代码。获得明确实施授权后，按 [最终实施合同](./implementation-contract.final.md) 从 review-card v2 最小可执行切片开始；不得先建设报告平台、Dashboard 或新 BAF。
