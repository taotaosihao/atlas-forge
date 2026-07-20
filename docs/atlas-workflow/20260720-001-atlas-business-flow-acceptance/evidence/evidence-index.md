# 方案证据索引

workflow_id: `20260720-001-atlas`
artifact_category: clarification_conclusion

## Brownfield 事实

- 当前 Core review validator：`workflow/bin/lib/codex-web-acceptance/review.js`。
- 当前 review template：`workflow/templates/web-scenario-review-card.md`。
- 当前 focused tests：`workflow/tests/contract_web_acceptance.sh`。
- 当前 BAF authority：`plugins/atlas-workflow/contracts/team-sdd/business-*.schema.json` 与 validators。
- 前序权威合同：`docs/atlas-workflow/20260719-005-atlas-web-ui-acceptance/implementation-contract.final.md`。
- 前序最终证据：`docs/atlas-workflow/20260719-005-atlas-web-ui-acceptance/evidence/evidence-index.md`。
- live accepted artifact：`/home/gewu/.codex/workflow/artifacts/20260719-005-ai-ui-intake/team/acceptance/`。

## 已确认缺口

- `review-card.json` 的三步 actual 分别只引用 run29、run30、run31 的总 technical result，没有逐节点呈现同一单据状态流转。
- `business-evidence-map.json` 只直接登记三次 run-result、Trace、最终截图和 owner decision；业务对象、callback 和状态事实留在深层 run artifact 中。
- 实施前的历史 v1 schema 没有 `document_chain`、before/after states、evidence categories、negative controls、final consistency 或 convergence 的完整性约束。
- 旧 accepted v1 owner decision 不绑定规范化 flow 内容摘要；图片和高层 evidence refs 足以通过当时的引用校验，但不足以让业务 owner 清晰判断完整流程。
- 当前材料只确认当前授权 artifact/bundle 内已登记 evidence 可定位；外部长期保存能力未登记、当前无法判断，且不阻塞 v2 blocked 材料生成。

## 方案结论

- 扩展现有 review contract，而非创建新报告平台。
- 使用结构化 review-card v2 加确定性 Markdown view。
- 所有 actual facts 必须指向当前已登记 evidence；缺失或不足明确失败关闭。
- 以 flow digest 绑定 owner decision，材料变化必须重新人工判断。
- Git 不保存大体积或敏感 raw evidence；外部 export/retention、provider locator/resolver、fresh-root/hermetic、DR 与长期防篡改均已从 Required 和完成条件移出，作为后续 experimental/pending，不阻塞当前 v2 材料。
- Sharp Cell 优先复用 run29/run30/run31；本澄清未运行浏览器、服务或 Multica。

## 实施与 Sharp Cell 业务流最终 closure

- 最终实施、Phase 3 anchor、Phase 4 convergence、live artifact 验证、实际 Team、提交、digest、run/evidence refs、limitations/gaps 与用户下一步见 [sharp-cell-business-flow-closure.md](./sharp-cell-business-flow-closure.md)。
- Atlas 本地提交：`2e01841`、`2893e23`、`9fb980f`；Sharp Cell 本地提交：`e7068444`。均未 push、创建 PR、部署、发布或刷新安装态。
- live current Team task 的 strict BAF closure 与独立 reviewer 均 PASS；JSON 与 Markdown 来自同一个 validated flow model。
- 技术与 Goal A 已通过，但两类 Required facts 仍形成三个 gaps；当前唯一业务 verdict 保持 `blocked`，新 v2 owner decision 尚未登记。
- 历史 source BAF bridge 前后 digest 相同，旧 accepted bundle 和旧 owner decision 保持只读且没有被新 bundle 继承。
