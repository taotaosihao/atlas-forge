# GLM5.2 Advisor Review

workflow_id: 20260709-034-big-screen-ui-vertical-slice-workflow-correction-review
task_id: 20260709-034-big-screen-ui-vertical-slice-workflow-correction-review
reviewer: GLM5.2 advisor
provider: zenmux/glm-5.2
agent_id: d812a02c-391d-4447-ad89-58c862c9386a
date: 2026-07-09
scope: atlas-workflow UI vertical slice gate correction

## 结论

`Operable UI Vertical Slice Gate` 是正确修正方向，但第一批 patch 不能只补一个 gate
名称或一组问责字段。Big Screen P0 跑偏的主因是 workflow 排序被反转：安全 gate
被当成 happy-path UI 的前置条件，导致任务长期停留在 scanner、headless model、
fixture 和 synthetic browser evidence，而没有真实 served、可操作的浏览器入口。

对用户可见产品任务，Atlas workflow 应明确以下排序原则：

- served operable UI thin slice 是 release、perf、soak、phase evidence 阶段的前置条件。
- `no-data-plane-direct`、`no-cloud-runtime`、Provider credential/browser boundary 等安全 gate
  应在该 UI slice 上并行验证，不能成为无限期阻塞 UI 的理由。
- `allowed_headless_only_until` 和 `stop_if_no_ui_by_phase` 是该 gate 的承重规则，不应只是可选字段。

## 第一批实现前必须补强

### Served UI 定义

`served UI` 必须指 HTML document 与 JS/CSS app assets 来自真实 HTTP server，例如 dev server、
preview server 或 static served bundle。`page.route` 只能用于 mock 后端/data-plane 响应，
不能 mock 主文档、app bundle 或静态资产。

如果证据依赖 `page.setContent()`、synthetic HTML、fulfilled main document、synthetic app bundle、
headless model、scanner fixture、CLI pass、typecheck/build-only，不能单独算 UI/product acceptance。

### Stop 默认值

当 `Product/UI gate: required` 但未声明 `stop_if_no_ui_by_phase` 时，应默认在进入 release、
perf、soak 或 P0G-style evidence 之前停止继续扩展 headless scanners/evidence，并返回
clarify/team 重新确认。

### Tiny / Not Applicable 边界

`Product/UI gate: not_applicable` 只适用于：

- 纯 headless 任务，例如 CLI、worker、library、scanner；
- 不改变用户可见 UI 行为的小改动，例如 typo、局部文案、已存在页面上的极小样式修复。

一个尚无 served app 的产品任务不能因为 scope 薄而被判定为 tiny。该类任务必须声明
browser entrypoint、first operable user flow 和 stop phase。

### UI Data Mode

UI slice 可以使用 fixture、in-memory store、approved simulator 或 canned control-plane，
但 evidence 必须能区分当前 UI 使用的是 stub/mock 数据还是真实 control-plane/backend。
否则 runtime stub 会被长期固化，重复 Big Screen P0 的 drift。

### BAF 关系

Business Acceptance First Mode 与 `Operable UI Vertical Slice Gate` 是互补关系：

- BAF 继续约束 business/process/stakeholder acceptance，尤其是 protocol/device integration
  与 business UI 互相替代的问题。
- UI vertical slice gate 约束产品是否有 served、可操作的用户入口。
- 两者都适用时，served UI evidence 不能自动替代 BAF Goal B；BAF Goal B 仍需要业务场景路径证据。

### Contract Test 覆盖

第一批 `workflow/tests/contract.sh` 不应只断言字段名存在，还应断言非证据清单和承重字段存在：

- `page.setContent`
- `page.route`
- `synthetic`
- `headless model`
- `allowed_headless_only_until`
- `stop_if_no_ui_by_phase`

否则后续改动可能只保留 gate 标题，删除真正能防 drift 的规则，而 contract test 仍然通过。

## 建议新增负向证据 Guard

第一批应增加轻量 shell guard，用于抓住 P0F-05 这类误判：

- 当 phase review、business verdict 或 evidence report 声称满足 UI/product acceptance；
- 且证据只包含 `page.setContent`、synthetic HTML、`page.route(...).fulfill()`、headless model、
  scanner fixture 或 network allowlist capture；
- 且没有 served URL、browser entrypoint、真实 app route 或 served-app screenshot/DOM evidence；
- 则不能接受为 UI/product acceptance。

该 guard 比第一阶段 JSON schema 更有效。schema 可以检查字段是否存在，但很难判断
`served_ui_validation_action` 是否真正打开了 served app，还是 synthetic browser harness。

## Guidance First 判断

第一批采用 guidance、template、contract-test 先行是正确选择。原因包括：

- 本次缺陷是语义误判，不是单纯结构字段缺失。
- Review 阶段把 browser-derived security evidence 误判成 UI/product acceptance，因此第一批应先改变 reviewer
  与 executor 的判断标准。
- JSON schema / artifact lint 适合作为第二阶段 backstop，过早引入会带来 fixture 兼容性风险和假安全感。

第一批必须把非证据规则落到 contract template、gate checklist、staffing/reviewer guidance 中，不能只写在
`team/SKILL.md` 的 prose 里。后续 reviewer 通常优先检查 phase conclusion、contract AC 和 checklist；
如果规则不在这些入口，guidance-only 容易失效。

## 第二阶段 Follow-up

以下内容应在 guidance-first patch 稳定后再做：

- JSON schema 或 artifact lint：拒绝 `Product/UI gate: required` 但缺少 served UI evidence 的 accepted verdict。
- `codex-contract-index-lint`：UI 类任务缺 UI gate 字段时失败。
- `codex-workflow ready`：对 UI/product/browser workflow 可选要求 UI gate 字段。
- Big Screen 类示例合同和 fixture。
- worktree readiness 检查。

## 执行建议

第一批实现应按以下优先级落地：

1. 在 `$atlas-workflow:team`、`$atlas-workflow:clarify`、`$atlas-workflow:task` 写入排序原则：
   served UI thin slice 先行，安全 gate 在该 slice 上并行验证。
2. 将核心必填收敛到 `browser_entrypoint`、`first_operable_user_flow`、`stop_if_no_ui_by_phase`，
   并保留 data/runtime 与 safety gate 字段作为补充说明。
3. 在 implementation contract、staffing、gate checklist 中写死非证据清单和 served UI 证据要求。
4. 在 `workflow/tests/contract.sh` 增加字段断言、非证据清单断言和负向 evidence guard。
5. 刷新 `atlas-workflow` plugin cache，并用 `cmp` 验证 source/cache 同步。

## 边界

`/home/gewu/work/atlas-forge` 是 workflow 工具仓，不包含 `apps/big-screen-web`。本次文档和后续
atlas-workflow patch 只能防止未来任务重复 drift；不能直接生成当前 Big Screen 产品 UI。

当前 Big Screen 业务线应单独暂停继续 P0G/更多 scanner-only evidence，先切出一个最小 served UI
vertical slice，例如 projects、editor、binding、preview、publish、player 的薄闭环。P0F-05 只能标记为
network-boundary passed，不能标记为 UI/product acceptance passed。
