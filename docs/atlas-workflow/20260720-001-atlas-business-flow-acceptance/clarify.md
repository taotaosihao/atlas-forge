# 执行澄清

workflow_id: `20260720-001-atlas`

## 原始请求

用户指出，真实 Chromium、network mutation、后端对象、signed callback、Trace、三次 fresh-seed 和 validators 等中间结果没有一起成为可直接审阅的验收材料；如果是业务验收，材料应包含单据的完整业务流转流程证据，使业务人员能清晰判断是否符合预期。

## 需求重述

在不改变 Atlas BAF v2 权威和现有技术执行结论的前提下，把分散在 run artifact 中的已登记证据组织为一份可读、可定位、失败关闭的完整业务流转材料。材料必须回答：验收哪张单、初始状态是什么、谁在真实 UI 做了什么、触发了什么请求和后端变化、单据怎样逐步流转、反向输入为何未改变状态、最终 UI/API/DB/audit 是否一致，以及每个判断的证据在哪里。

## 当前事实

- 现有 review-card v1 的 `steps[].actual` 只能由 evidence map 的描述和结果拼接，Sharp Cell 当前三步分别只指向 run29、run30、run31 的总 technical result。
- 当前 evidence map 登记三次 run-result、Trace、最终 running 截图和 owner decision；更细的 WorkOrder、LineTask、DeviceTask、assignment、callback 和状态事实位于复制的 run artifact 内，没有逐节点登记成 human-first 材料。
- Core 已能校验 card 对当前 scenario/verdict/evidence map 的 digest、canonical 图片路径、evidence ID 和 owner decision 当前引用，但还没有业务单据链、状态前后值、证据类别或时间顺序的完整性要求。
- run29、run30、run31 已证明真实 UI、非 CNC `plc_report_only`、invalid/valid callback、UI running readback 和三次独立 fresh-seed；本方案优先复用这些原始 artifacts，不自动重跑。
- 当前 accepted bundle 的准确历史语义是“框架跑通”；本方案不追溯改写它，也不据此宣称完整产品业务验收已经完成。

## 已锁定边界

- 新材料是 BAF 当前事实的确定性视图，不是第二套 business facts、evidence authority、scorecard、签字或 verdict。
- 图片只能证明视觉状态，不能单独证明操作、因果关系、状态转换或业务符合性。
- Core 使用 domain-neutral 结构；领域对象名、状态机、步骤与证据要求来自项目 flow contract 和 validators。
- actual facts 必须来自当前已登记 evidence；缺失写“未登记”，证据不足写“当前无法判断”，不能由 AI 自由摘要补齐。
- Material 必须同时展示正向流转和合同要求的反向控制，例如 invalid callback no-mutation。
- Owner decision 必须发生在完整材料生成并通过引用校验之后，并绑定 flow 内容摘要；旧 decision 不自动沿用。
- 现有 raw Trace、HAR、日志、API/DB dump 继续留在 Git 外，human-first Markdown 只展示必要摘要和可定位引用。

## 关键风险

- 若把可读 Markdown作为新事实源，会与 BAF 冲突；因此 Markdown只能由已验证 card 确定性产生。
- 若 Core 硬编码 Sharp Cell 对象或状态，会破坏通用性；因此领域事实必须由项目 flow contract、adapter 和独立 validators 提供。
- 若只列 evidence ID，业务人员仍无法判断流程；因此每个节点必须同时展示预期、actual facts、状态前后值和证据类别。
- 若允许 AI 自由生成 actual summary，会产生不可验证陈述；因此 v2 卡片使用结构化事实，展示文本由 Core 固定规则组合。
- 若修改当前 accepted artifact，会破坏历史；因此迁移采用可恢复归档和新的 review bundle，历史结论保留。

## 简化判断

该工作不是 tiny change。它改变通用 review 协议、owner decision 绑定、项目证据登记和 Sharp Cell 业务验收材料，必须先有版本化合同和正负验证矩阵。无需重新进行产品策略探索，因为用户已明确选择“完整业务流转证据”方向。
