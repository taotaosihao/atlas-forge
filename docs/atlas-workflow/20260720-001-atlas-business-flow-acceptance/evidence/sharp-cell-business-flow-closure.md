# Sharp Cell 业务流最终 closure（Phase 3 anchor + Phase 4 convergence）

日期：2026-07-20

workflow_id：`20260720-001-atlas`

结论：实施与 live artifact 验证通过；业务材料仍为 `blocked`，尚无新的 v2 owner decision。

## 实际 Team 与提交

本轮使用 Codex native Team，实际 agents 为：

- 主代理 `/root`：controller 与集成。
- 单一可写实施 owner `/root/business_flow_impl`：Atlas Core focused repair、Sharp Cell bridge 实施与定向修正。
- 独立只读 reviewer/verifier `/root/business_flow_review`：协议、provenance、原子发布、rollback 与 live artifact 复核；最终 PASS。
- 只读 Sharp evidence planner `/root/sharp_flow_evidence`：历史 run 与业务事实映射规划。
- 未启用 browser-verifier：本轮只复用已有 run29、run30、run31，没有进入新的浏览器或视觉补采阶段。

形成的本地逻辑提交如下，均未 push、创建 PR、部署、发布或刷新安装态：

- Atlas 合同：`2e01841f5ecc80a9372b34ed4cf05cb2ebaac2ec`（`docs(atlas): prioritize business flow acceptance`）。
- Atlas 完整业务流 review：`2893e2367a3b22b5e783448ac437c52a3976a749`（`feat(atlas): add complete business flow review`）。
- Atlas informational limitation 修正：`9fb980f5740ea0f438e6c209244c41e083f59125`（`fix(atlas): allow informational flow limitations`）。
- Sharp Cell evidence bridge：`e7068444e278729247ac5e3a04708ca0ec6e6056`（`feat(acceptance): bridge complete business flow evidence`）。

## Live artifact 与确定性验证

live acceptance 位于 Git 外 current Team task artifact：`/home/gewu/.codex/workflow/artifacts/20260720-001-atlas/team/acceptance`。该路径只是当前运行时定位信息，不是 Git evidence 链接；大型 raw run、Trace、截图和业务事实仍由 artifact 内 manifest、相对路径与 digest 约束。

live 发布使用既有 task 的真实 `team/sdd`。临时 task-shaped root 中的 Core `check-run`、v2 JSON review、Markdown review 和 BAF validators 通过后，只有 `team/acceptance` 被原子移入 live task；随后执行 `codex-team-artifact-lint --task 20260720-001-atlas --strict --business-acceptance`，结果 PASS。独立 reviewer 复核 live artifact 后最终 PASS；P0/P1/P2 actionable findings 均为 0。

JSON review 与 Markdown 来自同一个 validated flow model。Markdown 不是第二套 facts 或 verdict，`business-verdict.json` 仍是唯一最终 verdict。当前关键 digest 为：

| Identity | SHA-256 |
| --- | --- |
| normalized flow | `07e2b8f3f3c48cc994c7c4c8c626669c66fd264034ecd915ce283328568b4dcd` |
| project flow template | `295b0e009371345c4424b1c30d0d5373563cf76e9105a6bff801cb6863493200` |
| resolved project flow contract | `4b5ab63c6da6812c19116e265e8d88e1fd047922cda2c80a502a613fc415b84d` |
| historical source BAF before bridge | `4db58950e6160cbf127a0affd78bcd75afb91a746478b925cc525d422e72ea12` |
| historical source BAF after bridge | `4db58950e6160cbf127a0affd78bcd75afb91a746478b925cc525d422e72ea12` |

source BAF 前后 digest 相同，旧 accepted bundle 和旧 owner decision 没有被修改，也没有被继承到新的 v2 bundle。

## 三次 run 与 11 个当前 facts refs

Sharp Cell bridge 复用三次独立、attempt-1 passed 的真实 run：run29 是唯一完整业务时间线，run30、run31 只参与 fresh-seed convergence。三次 run 均保持独立 run ID、seed、业务对象、Trace 和截图；没有执行新 run。

当前 review-card/Goal A 精确引用 11 个 granular facts refs：

1. `run29-ui`
2. `run29-running`
3. `run29-callback`
4. `run29-trace`
5. `run29-seed`
6. `run30-running`
7. `run30-trace`
8. `run30-seed`
9. `run31-running`
10. `run31-trace`
11. `run31-seed`

bridge 还验证历史 source evidence map 中 run-1/2/3 的 technical-result、Trace 和 screenshot 共 9 个 provenance refs：它们必须为当前 scenario 的 local passed evidence，canonical path 必须分别对应传入 run root，且由历史 verdict `goal_a` 精确引用。同 scenario 的替代 run 会被拒绝。

## 七项限制与三个 Required gaps

材料完整登记七项限制：

1. `pre-create-state`：WorkOrder 创建前不存在或 draft 状态未登记。
2. `create-release-request-detail`：create/release 独立 route、payload、response 未登记。
3. `queue-dispatch-request-detail`：queue/dispatch 完整 route、payload、response body 未登记。
4. `assignment-creation-before`：assignment 创建前状态当前无法判断；主链以 reserved 作为流程初态。
5. `structured-final-ui-running`：DeviceTask 最终 UI running 的结构化 selector/text readback 当前无法判断。
6. `independent-db-export`：独立数据库导出未登记。
7. `long-term-durable-storage`：外部长期 durable storage 当前无法判断，且为 non-blocking。

其中只有两类 Required 事实缺失，展开为三个确定性 gaps：

- `document_chain.work_order.initial_state`：`pre-create-state`，未登记。
- `flow_steps.ui-running-readback.after`：`structured-final-ui-running`，当前无法判断。
- `final_state.ui`：`structured-final-ui-running`，当前无法判断。

其余五项是 informational limitations，不单独决定材料或业务 verdict，也不新增 durable storage、external manifest 或穷举报告平台前置。

## 当前业务状态与用户下一步

当前 `material_completeness` 为 `blocked`；唯一 `business-verdict.json` 为 `blocked`，其中 `technical_gate_status: passed`、`goal_a.status: passed`、`business_acceptance_status: blocked`、`goal_b.status: blocked`。新的 v2 review-card 没有 `owner_decision`，因此不能称业务已经通过。

用户下一步应先补齐两类 Required facts：

1. 登记 WorkOrder 创建前“不存在或 draft”的可验证事实。
2. 登记最终 DeviceTask `running` 的结构化 UI selector/text readback，同时满足时间线 after 与 final-state UI 两个 targets。

补齐后重新生成并验证当前 JSON/Markdown flow material；只有 material completeness 不再 blocked，acceptance owner 才基于当前 flow digest、当前 evidence refs 和当前截图登记“符合”“不符合”或“需修改”。不需要为了当前下一步先建设长期存储平台，也不得复用旧 owner decision。
