# 多 Agent 决策

workflow_id: `20260718-004-atlas`
decision_status: accepted_after_repair_review

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

## 用户后续补充要求

用户在方案形成后进一步要求：实施合同自身和最终验收结果都必须包含一段从底层原理出发、通俗简短、便于人工审查的说明。该要求补强业务阅读入口，不改变三席共识和 machine semantics。

最终合同将其固定为同结构四问：要确认什么、事实从哪里来、为什么是这个结论、人工还要判断什么。实施合同直接给出通俗摘要；生成报告在一句话结论后确定性生成四问摘要，并由 presentation strict 与专项测试强制检查，禁止退化为手工自由摘要。

## 20260718-006 Team Review 与修订处理

三席复审对提交 `fef854e` 一致裁决 `BLOCK`。方向不变，阻断集中在展示语义和测试可达性：

1. 场景定义、实际结果、材料条目、missing/empty 和五类剩余事项没有唯一 view-model。
2. dual-goal 非通过分支允许两侧 mode/path 不同，单一环境表达会误导。
3. rejected 固定写“已完成评估”超出现有 machine contract 能证明的范围。
4. conditional 不可签署警告没有锁定在任何正向措辞之前。
5. tamper-first 顺序使手改摘要无法命中 principle diagnostic，纯 policy 测试层缺失。

第一轮修订将这些 finding 投影为实施合同内的固定 view-model、分支文案、diagnostic 优先级和 table-driven tests，不修改 BAF schema/validator：

- `null` 固定为“未登记”，文件存在且空数组才显示 `0`；计划场景与实际结果分开。
- blockers、followups、report deviation、deviation-log open 和 accepted risk 分来源展示，不生成风险总数。
- dual-goal 只有两侧都已执行、mode 相同且非空 path 相同时才合并环境，否则分别展示；所有环境文案都说“验收记录标记为”。
- rejected 先区分实际结果是否登记以及是否与场景定义一一对应，只有唯一对应的 `business_result` 明确为 failed 时才说明实际业务结果未通过；not-run、blocked、ghost、duplicate、partial coverage 和全 passed 都使用保守分支。
- conditional 正文首行先显示不可签署警告。
- 所有 renderer-owned presentation policy 都有统一纯函数入口和 golden bytes；CLI 保留 tamper 优先级并固定 terminal diagnostic 顺序。

## 20260718-007 首轮复审后的再次修订

业务可读性席给出 `PASS_WITH_FINDINGS`，合同可实施性和对抗性席仍给出 `BLOCK`。新增阻断不是 machine semantics 问题，而是合法底层记录仍可能被中文阅读层说得过强：

1. rejected 的 `blocked`、`not_run` 或无法对应场景的结果可能被误写成实际失败。
2. dual-goal 环境类型相同但集成 path 不同时，正文没有明确说出“不是同一条链路”。
3. “引用是否对应”超出了现有 lint 对所有 evidence 实际提供的保证。
4. P0/P1 偏差和标记风险只有数量，严重度可能在首屏被淹没；`accepted_risk` 也不能冒充正式风险接受。
5. 新增的 conditional-order 和 rejected-overclaim diagnostic 仍缺统一的 pure policy 测试入口。

再次修订按最小展示边界关闭这些问题：

- view-model 新增场景结果对应完整性、环境类型/链路关系、偏差严重度和剩余事项三态；不改变 verdict。
- dual-goal 对 mode 与 path 分别判断，同环境不同链路使用固定警示句。
- 自动检查只声明“已登记结构和合同明确要求的关系”，明确不保证每项材料都支持业务结论。
- 四问下沉五类精确计数，但用“最高严重度/高严重度”业务词保留首屏提示；详细风险只称“记录状态标记为已接受”，不代表正式批准。
- `validateBusinessReportPresentation(markdown, viewModel)` 为所有 renderer-owned diagnostic 提供内存测试入口；保存文件被修改仍优先报 tampered。
- 四问标题改为“验收前先看四件事”，standard 环境文案只陈述本报告无法确认环境，并用逐项/总量字符预算约束简短性。

## 20260718-007 定向复审后的边角修订

定向复审继续用合法 machine 组合压力测试阅读层，发现三个 P1 和一个可读性 P2：场景业务/技术结果计数维度不明确；场景明确失败但顶层业务状态不是 failed 时会反说“没有失败”；双侧均 not-run/null 会把两个空 path 误称同一链路；原因在结论与四问重复且首屏预算没有覆盖 conditional 警告。

合同据此进一步唯一化：

- alignment 只统计 `business_result`，并固定 ghost 记录数、duplicate ID 数、missing 场景 ID 数的单位和重叠规则；技术结果绝不混入业务失败原因。
- 新增 failure-signal relation：场景明确失败必须承认；顶层状态给出不同信号时同时提示不一致，不再否认源记录。
- 环境关系先分双侧未执行和单侧未执行；只有两个非空 path 相同才允许“同一条已登记集成链路”。
- `reason_summary` 只在四问出现一次；严重度代码下沉明细，首屏改用业务词；从一句话结论到验收范围前的全部可见正文统一受 `540` 字符预算约束。
- rejected 原因诊断先于四问字节诊断，并只检查固定原因槽；因此语义负例与结构负例各有唯一、可达的 diagnostic。

本节记录修订响应，不自行宣告复审通过；最终状态以后续只读 Team Review 决策为准。

## 20260718-007 最终复审裁决

修订后的完整 diff 经原三席再次只读复审，最终裁决均为 `PASS`，P0/P1 均为 0：

| 席位 | 最终裁决 | 关闭确认 |
| --- | --- | --- |
| 业务可读性 | PASS | business/technical 结果分离、原因只出现一次、严重度业务化、完整首屏 540 字预算 |
| 合同可实施性 | PASS | failure-signal 分支穷尽、alignment 计数单位唯一、空链路优先级、纯 policy diagnostic 可达 |
| 对抗性 | PASS | 合法 rejected 状态冲突不再反说、not-run/null 不冒充同链路、证据与风险不越权 |

本裁决只解除方案合同的 review blocker，使其恢复 `ready-for-implementation`；没有实施 renderer，没有修改 BAF schema/validator，也不授权安装、发布、cache/marketplace/runtime mutation 或 Multica 变更。
