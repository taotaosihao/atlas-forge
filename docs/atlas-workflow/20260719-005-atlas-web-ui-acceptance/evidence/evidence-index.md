# 方案证据索引

workflow_id: `20260719-005-ai-ui-intake`
artifact_category: clarification_conclusion

## Brownfield 证据

- BAF schema/validator：`plugins/atlas-workflow/contracts/team-sdd/business-*.schema.json`、`validators/business-*.js`。
- strict closure：`plugins/atlas-workflow/scripts/codex-team-artifact-lint`、`workflow/tests/contract_team_business_acceptance.sh`。
- 历史完整 renderer 证据：提交 `5963d6c` 位于 `codex/atlas-business-acceptance-readable-report`，未合入当前 `main`，仅作为后来明确保留的重实现备份，不是本合同前置条件。
- 历史精简替代证据：提交 `358cf49` 位于 `codex/atlas-business-acceptance-readable-report-minimal`，同样未合入当前 `main`；其 human-first、非签字、BAF machine facts 唯一权威语义由用户本轮明确要求恢复到本合同。
- Sharp Cell Playwright：`/home/gewu/work/sharp-cell/apps/fms-web/playwright.config.ts`。
- Sharp Cell 现有闭环：`/home/gewu/work/sharp-cell/apps/fms-web/e2e/follow-up-work-order-business-closure.spec.ts` 明确把 final business acceptance 列为 non-claim。
- Sharp Cell 状态与 callback：`tasks.service.ts` 要求 PLC 控制任务通过 signed callback；`beezer-ingest.controller.ts` 提供真实 ingress。
- Sharp Cell 权限：`packages/fms-db/src/index.ts` 显示 planner 具备锚点所需 task 权限，operator 不具备完整 line/device write。
- Sharp Cell seed：`packages/fms-db/src/seed.ts` 当前只创建 admin/operator，未创建 acceptance-only planner。
- Sharp Cell running readiness：`tasks.service.ts` 要求父 WorkOrder/LineTask `in_progress`、material-event chain，CNC/file-driven 任务还要求绑定文件和 verified transfer readback。
- Sharp Cell Trace：`apps/fms-web/playwright.config.ts` 当前为 `on-first-retry`，attempt 1 通过时不会自动留 Trace。

## 澄清阶段结论

- 两个仓库在棕地检查时均无现有 dirty diff。
- 不依赖历史 Trace/视频做最终归因；首轮在隔离 fresh-seed 环境主动采集。
- v1 只使用 Sharp Cell 一条 scenario，Core 无项目业务/viewport 常量。
- 历史 Multica 范围保持禁止修改与运行。
- 2026-07-19 native Team 只读评审结论为 BLOCK；用户随后授权“修正”，最终合同已对业务路径可达性、planner、attempt-1 Trace、Phase 依赖、独立 validators、UI-intent gate 和 CLI/schema 分发边界做替换式修订。
- Kimi Code K3（thinking on、YOLO）只读 Epic 复审结论 PASS：8/8 blocker 闭合，无 P0/P1，thin layer 未演化为平台；用户随后授权收敛 P2，Sharp Cell v1 因此冻结非 CNC、`plc_report_only` reference target，owner decision digest check 归属 Core-owned `acceptance-owner-design-intent`。
- 本轮新授权纠正过时依赖：当前 `main` 未包含 `5963d6c` 或 `358cf49`，因此删除 `codex-team-business-report` 的 Phase 2 prerequisite、V-09、停止条件与所有执行性引用；精简中文 handoff/review card 只服务非专业人员按场景操作并对照当前 BAF 事实。
- 本轮独立只读 Reviewer 最终结论 PASS，P0/P1/P2 actionable findings 均为 0；确认无残留 renderer 执行依赖、无平行 verdict、无 human-first 换名平台，且真实 UI、BAF strict closure 与 Multica 禁区均未削弱。

## 澄清阶段验证

| Gate | 命令或动作 | 结果 |
| --- | --- | --- |
| Implementation contract | `node plugins/atlas-workflow/scripts/codex-implementation-contract-lint --strict --file docs/atlas-workflow/20260719-005-atlas-web-ui-acceptance/implementation-contract.final.md` | semantics v1，0 errors，0 warnings |
| Contract index | `node plugins/atlas-workflow/scripts/codex-contract-index-lint --root docs/atlas-workflow/20260719-005-atlas-web-ui-acceptance` | `contract_index_lint: true` |
| Markdown links | `scripts/check-relative-markdown-links.py --root .` | 通过；235 个 Markdown 文件、81 个相对链接 |
| Markdown diff | `git diff --check` | 通过 |
| Workflow readiness | `/home/gewu/.codex/workflow/bin/codex-workflow ready 20260719-005-ai-ui-intake --require context,spec,decision` | installed runtime task `status: ready`，issues 为空；repo-local binary 不是该 Git 外 task state 的查询入口 |
| Forbidden paths | `git diff --exit-code -- plugins/multica-sdlc .agents` | 通过；无 diff |
| Multica fingerprints | 只读 `git rev-parse HEAD:plugins/multica-sdlc HEAD:.agents` | `8b87ecd1c5decce18f31e65442747661debfcb5e` / `3e3f8d512d88d309830ceb180baf694149ffa657` |

## Team 修订后验证

| Gate | 结果 |
| --- | --- |
| `node plugins/atlas-workflow/scripts/codex-implementation-contract-lint --strict --file docs/atlas-workflow/20260719-005-atlas-web-ui-acceptance/implementation-contract.final.md` | semantics v1，0 errors，0 warnings |
| `codex-contract-index-lint` | `contract_index_lint: true` |
| Markdown links | 235 个 Markdown 文件、81 个相对链接通过 |
| `/home/gewu/.codex/workflow/bin/codex-workflow ready 20260719-005-ai-ui-intake --require context,spec,decision` | installed runtime task ready，issues 为空 |
| Diff/forbidden paths | `git diff --check` 通过；Multica paths 无 diff，hard fingerprints 不变 |

## 实施 Phase 1 结论

- 评审结论：[phase-review-report.md](./phase-review-report.md)。
- 实施提交：`a5921957a3f4b16ed1a112032f02fc1e41eb7152`（`feat(atlas): add executable web acceptance audit`）。
- Phase 1 状态：可执行 audit、专项正负合同、Sharp Cell 只读风险扫描和独立 reviewer focused repair 均完成。
- Phase 2 恢复状态：原 `blocked_dependency` 是 Phase 1 当时真实记录；提交 `8714e47` 的替换式权威合同修订已删除该过时 renderer 前置条件。恢复实施不依赖、不合入也不重实现 `codex-team-business-report`，继续以 BAF v2 JSON/JSONL 为唯一 machine facts、`business-verdict.json` 为唯一 verdict。
- Sharp Cell 与 Multica：两个范围均零修改，Multica hard fingerprints 不变。

## 实施 Phase 2 至 Phase 4 当前结论

### 本地逻辑提交

- Atlas Phase 2：`f4d6154`（`feat(atlas): add web acceptance run protocol`），交付 project protocol、run/check-run、attempt/evidence invariants、独立 validator envelope、BAF review bridge 与 human-first review contract；未引入 `codex-team-business-report`、自动 renderer、presentation check 或平行 verdict。
- Sharp Cell Phase 3：`8b96d8ed`（`feat(acceptance): add real web UI anchor`），交付非 CNC、`plc_report_only` reference target 的真实 served UI anchor、项目配置、fresh-seed setup、adapter 与独立 validators。
- Sharp Cell focused repair：`a2effed4`（`fix(acceptance): atomically capture popup evidence`）与 `6d81c440`（`fix(acceptance): pin popup snapshot to option`）。Phase 4 最终三次 convergence 均运行于冻结代码 `6d81c440`；后者把 production-line popup/option 快照绑定到已等待的严格唯一 DOM element，未放宽 validator 或确定性验收条款。
- Sharp Cell BAF closure：`22f3c37b`（`feat(acceptance): close real runs into BAF`），复用现有 BAF v2 authority 与 Core `check-run`，把三次完整 run artifact 绑定到既有 native Team task `20260719-005-ai-ui-intake`；technical run task ID `atlas-web-ui-acceptance-sharp-cell-v1` 只作为 evidence identity，不形成第二个 roadmap/task。

### Phase 4 convergence

- `sharp-cell-phase4-convergence-1-real-26` 失败，原因属于 production-line popup evidence drift；不计入连续成功。
- `sharp-cell-phase4-convergence-2-real-28` 失败，确认 `locator.evaluateAll()` 会在调用时重新解析动态 `:visible` selector 并可能得到瞬时空集合；不计入连续成功。
- 修复冻结后，run29、run30、run31 构成新的连续窗口，三次均为 fresh-seed 新 run、attempt 1 passed、`integration_mode: real`，并各自保存 Trace 与 `1366x768` 实际截图：
  - `/home/gewu/.codex/visualizations/2026/07/19/019f7aa8-0774-79c2-b10f-63a6a4b1c443/sharp-cell-phase3/sharp-cell-phase4-convergence-1-real-29`
  - `/home/gewu/.codex/visualizations/2026/07/19/019f7aa8-0774-79c2-b10f-63a6a4b1c443/sharp-cell-phase3/sharp-cell-phase4-convergence-2-real-30`
  - `/home/gewu/.codex/visualizations/2026/07/19/019f7aa8-0774-79c2-b10f-63a6a4b1c443/sharp-cell-phase3/sharp-cell-phase4-convergence-3-real-31`
- 三次 run 均通过 Core `check-run` 与五个独立 required validators；frozen contract/config/evidence-index digest、全部 evidence digest、attempt-1 authority facts、fresh-seed nonce、runtime identity、WorkOrder、LineTask、DeviceTask、assignment、业务 Trace、Playwright Trace 与截图均完成绑定并互不共享。
- 独立只读 implementation reviewer 最终 PASS，P0/P1/P2 为 0。独立 browser-verifier 对真实浏览器动作、network mutation、invalid/valid signed callback、material-event chain、非 CNC `plc_report_only` readiness、UI `running` readback、Trace 与截图完成复核，结论 PASS，P0/P1/P2 为 0。

### BAF、handoff 与当前停止状态

- Git 外可审阅 BAF bundle：`/home/gewu/.codex/visualizations/2026/07/19/019f7aa8-0774-79c2-b10f-63a6a4b1c443/sharp-cell-phase3/sharp-cell-phase4-baf-closure/20260719-005-ai-ui-intake`。
- 既有 native Team task artifact：`/home/gewu/.codex/workflow/artifacts/20260719-005-ai-ui-intake`。该 task 已补齐与当前执行事实一致的 minimal SDD 记录；`codex-team-artifact-lint --strict --business-acceptance` 与 Sharp closure `validate --workflow-root /home/gewu/.codex/workflow` 均 PASS，未建立第二套 roadmap 或 gate 平台。
- BAF 当前唯一 `business-verdict.json` 为 `blocked`：`technical_gate_status: passed`，`business_acceptance_status: blocked`，`goal_a.integration_mode: real`，`goal_b.status: blocked`。Acceptance owner 判断仍为“未登记”。
- 当前两份 bundle 均已正式登记 `reference-fms-work-orders-expanded-v3.png` 和三张 actual screenshot；这些文件只固定 acceptance owner 人工判断所针对的当前 contract/reference/actual/evidence 引用，不等于 design intent 已判断“符合”。
- 当前唯一残留用户动作是 acceptance owner 对当前 contract/reference/三次 actual screenshot/evidence 引用登记“符合”、“不符合”或“需修改”；在该人工 decision 完成前，`acceptance-owner-design-intent` 不能通过，唯一 verdict 不得改为 `accepted`，本 Goal 当前不能标记 complete。

### 最终范围与禁区核对

- Atlas/Sharp Cell 本地逻辑提交均未 push、创建 PR、部署、发布、安装或刷新真实 Atlas cache/marketplace/workflow runtime。
- Multica runtime/tests 从未运行，`plugins/multica-sdlc/**` 与 `.agents/**` 未修改；hard fingerprints 仍为 `8b87ecd1c5decce18f31e65442747661debfcb5e` / `3e3f8d512d88d309830ceb180baf694149ffa657`。

## 实施阶段证据预算

- Git：代码、schema、必要 fixtures/golden、项目 contract、少量最终审核截图、`phase-review-report.md`、`evidence-index.md` 和 `gate-checklist.md`。
- Git 外：Playwright JSON、Trace、视频、HAR、完整日志、API/DB dump、callback payload、port/process 状态、失败 attempts 和中间修复输出。
- 每 phase 目标不超过 10 个 Git evidence 文件与 1 MB；超出必须在 phase conclusion 解释。
