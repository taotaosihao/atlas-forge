# Atlas 单据完整业务流转验收材料

workflow_id: `20260720-001-atlas`
artifact_category: durable_handoff
status: ready-for-implementation

## 结论

下一版 Atlas Web UI Acceptance 不再把最终截图和 run 总结果当作足够的业务验收材料。凡声称“业务验收”的场景，都必须把同一单据从初始状态到最终状态的完整业务流转组织为可读时间线，并为每个关键节点并列展示操作、预期、实际、对象状态变化、UI/network/backend/DB/audit/外部输入证据及其当前 BAF evidence 引用。

方案不新增平行事实源或 verdict。BAF v2 JSON/JSONL 继续是唯一 machine facts，`business-verdict.json` 继续是唯一最终 verdict；新增内容是现有 `codex-web-acceptance review` 的版本化 review-card v2 校验和确定性 Markdown 输出。任何无法从当前已登记 evidence 确定的内容必须写“未登记”或“当前无法判断”。支持 accepted 基线的原始证据还必须能从稳定 artifact locator 恢复并重新通过 digest/review 校验；仅存在于单机绝对路径的材料不能称为长期可恢复基线。

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
7. Git 只保存合同、schema、validator、项目 flow contract、小型脱敏 fixtures/golden、evidence manifest、digest 和 phase conclusion；Trace、HAR、视频、API/DB dump、callback payload、全量日志和批量截图保存在受控 artifact storage。
8. 每个长期 evidence manifest entry 必须记录 evidence/run/attempt identity、SHA-256、size、media type、稳定无凭据 locator、敏感级别、retention class 和 policy reference。保留期限与存储 provider 由项目/组织配置决定，不写死在 Core。

## 三层证据生命周期

| 层级 | 保存内容 | 默认边界 |
| --- | --- | --- |
| Git | 规则、代码、schema、validators、脱敏小样、manifest、digest、结论 | 可 diff、无 secret、不包含大体积真实运行原件 |
| Durable artifact | accepted 所需 Trace/HAR/截图/API/DB/audit/callback/log 等原始证据 | immutable/versioned、访问受控、可按 locator 恢复、受 retention policy 管理 |
| Ephemeral | 失败重试、调试日志、临时截图、migration 中间输出 | 短期保留，不支持长期 accepted 基线 |

建议项目 policy 以版本化配置采用以下起始值，而不是写死在 Core：

| 类型 | 建议 retention |
| --- | --- |
| accepted 合同、manifest、digest、结论 | 与对应产品版本长期保留 |
| accepted 关键原始证据 | 1–3 年，或至少覆盖产品维护周期 |
| blocked/rejected 最终审核材料 | 6–12 个月 |
| 有缺陷定位价值的失败 run | 90–180 天 |
| 普通失败 attempt/调试材料 | 14–30 天 |
| credential/token/cookie | 不进入存储；发现即阻断并按安全流程处置 |

## 下一步

本 bundle 只锁定实施方案，不授权写代码、上传 artifact 或选择外部存储。获得明确实施授权后，按 [最终实施合同](./implementation-contract.final.md) 从 review-card v2 最小可执行切片开始；不得先建设报告平台、Dashboard、新 BAF 或对象存储平台。
