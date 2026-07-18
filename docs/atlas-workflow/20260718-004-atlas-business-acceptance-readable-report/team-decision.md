# 多 Agent 决策

workflow_id: `20260718-004-atlas`
decision_status: accepted_with_guards

## 参与视角

| 席位 | 审查重点 | 主要结论 |
| --- | --- | --- |
| `business_reader` | 一线业务负责人、运营和 PM 的阅读路径 | 当前把业务结论、技术索引和机器字段说明混为一层；应以一份中文报告作为唯一业务入口 |
| `contract_architect` | schema、validator、artifact lint、兼容和实现边界 | JSON bundle 必须是唯一事实源；Markdown 应由小型 renderer 确定性生成并支持 stale check |
| `adversarial_reviewer` | 状态误述、环境真实性、证据边界和 conditional 滥用 | 术语可以下沉，但技术资格、四态、环境、双目标证据和风险不能隐藏；手工摘要不可接受 |

## 共识

1. 不采用纯模板翻译。
2. 不新增 summary schema，不修改现有 BAF v2 schema/validator。
3. `business-acceptance-report.md` 是自动生成的业务主入口。
4. blocked/rejected 也生成可读报告；非通过结论不能被隐藏。
5. `real`、`approved_simulator`、`mock`、`synthetic`、`not_run` 使用固定中文映射。
6. dual-goal 的设备/外部链路与业务人员操作分别显示独立证据。
7. 机器 lint 不证明 evidence 内容真实性，报告必须保守表述。
8. conditional 缺少可签署信息时，机器 verdict 保持原值，但 presentation strict 必须失败。

## 分歧与裁决

关于“conditional 有 followup 但没有结构化 owner/deadline”是否只告警，最终选择更安全的边界：普通 render/write/check 允许生成并醒目说明缺失；`--check --presentation-strict` 失败。这样不改变 v2 合法性，同时不把不完整材料包装成可签署报告。

## 不可妥协原则

- 一份事实源：完整 JSON bundle 和它引用的本地 evidence 内容。
- 一份业务入口：生成的中文 report。
- 两类门禁：现有 machine lint 与新增 presentation policy 各司其职。
- 不猜测现实事实：renderer 不推断 owner、deadline、风险、现场真实性或生产就绪。
