# Atlas Web UI Acceptance Phase 1 评审结论

workflow_id: `20260719-005-ai-ui-intake`
phase: `Phase 1 — Executable audit`
status: `phase_1_passed_dependency_block_historically_resolved`
reviewed_commit: `a5921957a3f4b16ed1a112032f02fc1e41eb7152`

## 集成结论

Phase 1 已交付可执行 `workflow/bin/codex-web-acceptance audit`。该命令不依赖完整 project config，提供单 JSON envelope 与中文摘要两种输出，按合同区分 blocking、warning 和 approved waiver，并以稳定 rule ID 检测 API login、cookie/storage 注入、位置 locator、深层 CSS、模糊文本、force、固定等待、route mock、弱后置断言、retry 与 attempt-1 Trace 风险。

Core 生产源码不包含 Sharp Cell、业务对象、账号、项目 port、browser、viewport、role 或 entrypoint 的具体值。Sharp Cell 只作为只读 reference target 扫描，未在本 phase 修改。

## Team 与审查

- native execute authorization：`user request in source thread on 2026-07-19: “开启新会话使用team开始实施，要开启goal”`。
- 唯一 writer：`web_acceptance_impl`。
- 独立只读 reviewer/verifier：`web_acceptance_review`。
- 集成 owner：主 Codex。
- browser-verifier 未启用：浏览器或视觉验收尚未进入实质阶段。

Reviewer 发现并验证闭合了四类当前目标 blocker：多行调用逃逸、未豁免 fuzzy text 未阻断、Core forbidden-value guard 缺少正向 sentinel，以及属性选择器内部引号导致 deep-CSS 漏报。最终复审没有 Phase 1 blocker。

AC-01、AC-02 和 AC-04 的 Phase 1 交付已满足。AC-17 仅完成 audit blocking-rule 基础；完整 anchor 源码与 attempt-1 Trace 证明仍属于 Phase 3，不在此结论中提前判定通过。

## 验证证据

| Gate | Result |
| --- | --- |
| `workflow/bin/atlas-agent-model-policy check` | `ok family=5.6 roles=7` |
| `bash workflow/tests/contract_web_acceptance.sh` | passed |
| `node --check workflow/bin/codex-web-acceptance` | passed |
| `node --check workflow/bin/lib/codex-web-acceptance/audit.js` | passed |
| Sharp Cell read-only audit | exit `2`；23 files；369 blocking；27 warning；JSON stdout 单 envelope；中文 stderr；重复输出稳定 |
| Sharp Cell deep-CSS regression | 16 findings；原漏报的 `list-page-template.spec.ts:32/33`、`route-smoke.spec.ts:94`、`ui-framework.spec.ts:92` 均命中 |
| Hermetic repo contract | 当前完整快照在 `/tmp` 独立 Git repo 与 cwd 中运行 `workflow/tests/contract_repo.sh` passed |
| 原 Codex worktree contract | 所有前置合同和 Web 专项通过；嵌套 repo isolation 因 cwd 位于 protected `$HOME/.codex/worktrees/**` 被预期拒绝，strace 证明命中项为继承 cwd |
| `git diff --check` / staged diff check | passed |
| Sharp Cell worktree | clean；无修改 |
| Forbidden paths | `plugins/multica-sdlc/**`、`.agents/**` 无 diff |
| Multica hard fingerprints | `8b87ecd1c5decce18f31e65442747661debfcb5e` / `3e3f8d512d88d309830ceb180baf694149ffa657` |

## Phase 2 恢复记录

Phase 1 结束时 Phase 2 尚未开始。当时 repository、`workflow/bin` 与安装态均不存在 `codex-team-business-report`；该事实和停止决定在当时均真实。历史候选提交 `5963d6c` 与 `358cf49` 未 cherry-pick、merge 或复制。

提交 `8714e47` 后，最新权威合同以替换式修订删除了 renderer prerequisite，并明确禁止依赖或实现 `codex-team-business-report`、自动 renderer 或平行报告状态机。用户随后恢复同一 Goal；因此旧 `blocked_dependency` 只保留为历史 Phase 1 证据，不再是 Phase 2 执行门禁，也不要求 renderer 进入当前基线。

## 非阻断 follow-up

- `ROUTE_MOCK` 会保守标记只执行 `route.continue()` 的 `page.route`。
- deep-CSS 以 selector 组合符或空白判断，属性值本身含空格时可能保守误报。

两项均保持 fail-closed，且可由显式项目 waiver 审计处理，不阻断 Phase 1。
