# Atlas Web 真实 UI 验收薄层

workflow_id: `20260719-005-ai-ui-intake`
artifact_category: durable_handoff
status: ready-for-implementation

## 结论

本方案不建设新的 AI 测试平台，也不重定义 Atlas BAF。Atlas Forge 只新增 dependency-free 的 Web UI execution/audit/evidence 薄层；项目通过版本化 JSON 协议接入自己的 Playwright、环境、数据库和外部系统 adapter。Sharp Cell 是首个 reference pack。

v1 只证明一条可信闭环：acceptance-only 计划员从真实登录页进入，通过 UI 创建、发布工单并启动目标 LineTask；project config 冻结非 CNC、`plc_report_only` reference target 并证明 CNC/file readiness 不适用；通过 signed ingress 完成 material-event chain；无效 Beezer 签名被拒绝且关联状态不变；有效 signed callback 经真实 ingress 推动同一 `DeviceTask` 到 `running`；UI、API、DB、callback、审计和 attempt-1 Trace 一致。任何缺证据、独立 validator 失败、首试失败、局部通过或 non-claim 都不能成为最终业务通过。

## 权威入口

- [合同索引](./contract-index.md)
- [执行澄清](./clarify.md)
- [执行规格](./spec.md)
- [最终实施合同](./implementation-contract.final.md)
- [实施分工](./staffing.md)
- [方案证据索引](./evidence/evidence-index.md)

## 关键边界

- BAF v2 的 machine semantics、strict lint、evidence identity 和 verdict 保持唯一权威。
- Core 不硬编码 Sharp Cell 业务、DOM、账号、viewport、浏览器或端口。
- Sharp Cell 当前 `1366x768` 和本地 `/login` 地址属于 project config，不属于 Core。
- API/DB 只取证；用户业务动作必须走 UI，设备输入必须走真实 signed callback ingress。
- 项目 adapter 只提交原始证据；required claim 由 adapter 之外的确定性 validator 校验。
- 中文审核材料是确定性派生物并绑定 digest；它不重算 verdict，但 v1 final accepted 必须有 acceptance owner 对当前 digest 的“符合”判断，并通过 Core-owned `acceptance-owner-design-intent` 校验。
- `codex-team-business-report` 是 Phase 2 显式外部 prerequisite；本合同不顺带实施 renderer。
- v1 达成三次 fresh-seed 新 run 首次通过后立即停止，不迁移其余用例，不接第二项目。

## 下一步

等待用户明确授权实施 [最终实施合同](./implementation-contract.final.md)。本 bundle 的完成不授权写代码、commit、push、安装刷新、部署或发布。
