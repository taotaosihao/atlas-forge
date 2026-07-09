# Big Screen UI Vertical Slice Workflow Correction Review

workflow_id: 20260709-034-big-screen-ui-vertical-slice-workflow-correction-review
task_id: 20260709-034-big-screen-ui-vertical-slice-workflow-correction-review
artifact_category: durable handoff
backend: native

## 结论

Big Screen P0 跑偏的根因不是单个 slice 违规，而是 `atlas-workflow` 当前流程只有
gate-first 的强约束，没有同等强度的“可操作 UI vertical slice”约束。P0F-05 的
browser network-boundary evidence 是有效的安全证据，但不能证明产品 UI 可操作。

`atlas-workflow` 应新增独立的 `Operable UI Vertical Slice Gate`：

- 对 non-tiny 的 UI/产品/browser workflow，必须尽早声明并验证真实 served UI entrypoint。
- headless model、scanner、fixture、synthetic Playwright harness、`page.route` fulfilled document
  只能算安全/边界/模型证据，不能单独算 UI/product acceptance。
- 安全 hard gates 仍然一票否决；UI vertical slice 与 `no-data-plane-direct`、`no-cloud-runtime`、
  Provider credential/browser boundary 并行成立，不互相替代。

## 文件

- 当前权威合同：[implementation-contract.final.md](./implementation-contract.final.md)
- 修正执行方案：[correction-plan.md](./correction-plan.md)
- 团队决策：[team-decision.md](./team-decision.md)
- GLM5.2 advisor 审查：[glm5.2-advisor-review.md](./glm5.2-advisor-review.md)
- Claude Sonnet 5 max advisor 审查：[claude-sonnet-5-max-advisor-review.md](./claude-sonnet-5-max-advisor-review.md)
- 分工与验证计划：[staffing.md](./staffing.md)
- 索引：[contract-index.md](./contract-index.md)
- 证据索引：[evidence/evidence-index.md](./evidence/evidence-index.md)

## 推荐执行

第一批只做 guidance/template/contract-test 改动，但需要把 GLM5.2 与 Claude Sonnet 5 max 的补强意见纳入合同：

1. 在 `$atlas-workflow:team`、`$atlas-workflow:clarify`、`$atlas-workflow:task` 写入排序原则：
   served operable UI thin slice 先于 release/perf/soak/phase evidence expansion；同时 hard safety gates
   必须与 UI slice 共同满足，不能跳过、削弱或上线后补。
2. 将核心必填收敛到 `browser_entrypoint`、`first_operable_user_flow`、`stop_if_no_ui_by_phase`，
   并保留 data/runtime 与 safety gate 字段作为补充说明。
3. 在 implementation contract、staffing、gate checklist 中写死非证据清单和 served UI 证据要求。
4. 在 `workflow/tests/contract.sh` 增加字段断言、非证据清单断言、UI/product acceptance 负向 evidence guard，
   以及 served UI 不能替代 hard safety gate evidence 的反向 guard。
5. 刷新 plugin cache，并用 `cmp` 验证 source/cache 同步。

第二批再考虑 JSON/schema/lint 强制，不要在第一批直接破坏现有 business acceptance fixtures。
