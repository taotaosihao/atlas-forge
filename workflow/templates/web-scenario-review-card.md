# Web 场景验收交接与审核卡

这张卡帮助非专业验收人按已登记场景操作和核对，不替代 BAF v2 machine facts、`business-verdict.json`、证据真实性判断、签字或发布批准。

## 场景目标与验收条件

- 场景：引用当前 `business-scenario-card`；没有登记时写“未登记”。
- 进入角色与初始条件：引用当前 BAF 场景记录；材料不足时写“当前无法判断”。
- 集成方式：只有 BAF 当前记录为 `integration_mode: real` 才写“真实运行”，其他模式照实登记。

## 场景操作、预期与实际

| 场景操作 | 预期结果 | 实际结果 | 已登记证据 |
| --- | --- | --- | --- |
| 按当前场景逐步操作 | 引用当前场景预期 | 引用当前 evidence result；缺失写“未登记/当前无法判断” | 引用当前 evidence ID |

## 参考图与实际截图

- 参考图：登记当前引用；没有时写“未登记”。
- 实际截图：登记当前引用；不足以判断时写“当前无法判断”。

## 禁止绕过、阻断与未覆盖

- 禁止把 API/DB 结果、重试、mock、截图本身或 AI 摘要替代真实 UI 与 required gate。
- 当前阻断：忠实登记；没有记录时写“未登记”。
- 未覆盖范围：忠实登记，不把未运行内容写成已通过。

## Acceptance owner 人工判断

Acceptance owner 只对当前 contract、参考图、实际截图和 evidence 引用选择“符合”、“不符合”或“需修改”。`acceptance-owner-design-intent` 仅校验当前引用对应关系和判断登记，不产生第二个 verdict。
