# Team Decision

- backend: native
- task_id: 20260709-034-big-screen-ui-vertical-slice-workflow-correction-review
- mode: discuss
- verdict: accepted
- promoted_to: none

## Decision

`atlas-workflow` 需要新增独立的 `Operable UI Vertical Slice Gate`，用于防止 UI/产品类任务长期停留在
headless scanner、model、fixture、evidence，而没有真实可操作浏览器入口。

该 gate 与 Business Acceptance First Mode 互补：

- BAF 继续解决 business/process/stakeholder acceptance，尤其是 protocol/device integration 与 business UI 互相替代的问题。
- `Operable UI Vertical Slice Gate` 解决更早的产品 UI 问题：用户面对的软件产品、编辑器、播放器、dashboard、控制台、站点或工具必须尽早有 served UI entrypoint 和最小可操作路径。

## Consensus Basis

- workflow-architect：当前 P0 规划把 gate-first 绝对化，没有反向 UI gate；`browser-derived evidence` 语义过宽。
- product-acceptance-critic：P0F-05 合格于 network/security evidence，但不能算 UI/product acceptance；BAF opt-in 且偏 protocol/device 场景。
- implementation-verifier：第一批应先做 guidance/template/contract-test，后续再做 JSON/lint；当前未提交 BAF patch 不能被覆盖。

## Accepted Gates

`Operable UI Vertical Slice Gate` 触发时必须记录：

- `Product/UI gate: required | not_applicable`
- `first_operable_user_flow`
- `browser_entrypoint`
- `served_ui_validation_action`
- `ui_data_mode`
- `required_safety_gates`
- `allowed_headless_only_until`
- `stop_if_no_ui_by_phase`

合格证据必须打开真实 served app route，并能完成一个最小用户动作或可观察状态变化。`page.setContent()`、synthetic HTML、`page.route` fulfilled main document、headless model/unit tests、scanner/fixture/CLI pass、单独的 network allowlist capture 都不能单独满足 UI/product acceptance。

## Next Step

进入 guidance-only execute patch：

- 修改 `team/SKILL.md`、`clarify/SKILL.md`、`task/SKILL.md`。
- 修改 `workflow/templates/implementation-contract.md`、`implementation-contract.final.md`、`team-staffing.md`，可选补 `gate-checklist.md`。
- 修改 `workflow/tests/contract.sh` 增加文本合同断言。
- 运行 `git diff --check`、`bash workflow/tests/contract.sh`，刷新 plugin cache 并 `cmp`。

Big Screen 业务线应暂停 P0G/更多 scanner-only evidence，先开最小 served UI vertical slice；P0F-05 只标记为 network-boundary passed，不能标记为 UI/product acceptance passed。
