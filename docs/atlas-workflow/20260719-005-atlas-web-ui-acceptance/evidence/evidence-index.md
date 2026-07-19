# 方案证据索引

workflow_id: `20260719-005-ai-ui-intake`
artifact_category: clarification_conclusion

## Brownfield 证据

- BAF schema/validator：`plugins/atlas-workflow/contracts/team-sdd/business-*.schema.json`、`validators/business-*.js`。
- strict closure：`plugins/atlas-workflow/scripts/codex-team-artifact-lint`、`workflow/tests/contract_team_business_acceptance.sh`。
- 中文阅读层状态：`../20260718-004-atlas-business-acceptance-readable-report/implementation-contract.final.md` 已 ready-for-implementation；目标 renderer 当前不存在。
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
- Phase 2 状态：`blocked_dependency`；repository、`workflow/bin` 与安装态均无 `codex-team-business-report`，未代为实施或合入 readable renderer。
- Sharp Cell 与 Multica：两个范围均零修改，Multica hard fingerprints 不变。

## 实施阶段证据预算

- Git：代码、schema、必要 fixtures/golden、项目 contract、少量最终审核截图、`phase-review-report.md`、`evidence-index.md` 和 `gate-checklist.md`。
- Git 外：Playwright JSON、Trace、视频、HAR、完整日志、API/DB dump、callback payload、port/process 状态、失败 attempts 和中间修复输出。
- 每 phase 目标不超过 10 个 Git evidence 文件与 1 MB；超出必须在 phase conclusion 解释。
