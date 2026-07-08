---
name: cw
description: Use the Atlas local workflow helper for bounded work.
---

Use the local workflow helper for this request.

## 输出语言

- 生成或更新项目文档、需求/方案/分析/交接材料、design-review 报告、team 决策、workflow artifacts 和面向用户的总结时，默认使用中文。
- 命令、文件路径、代码标识符、配置键、API 名称、错误原文和必须保持的模板字段可以保留原文。
- 如果 `codex-workflow` 创建了英文骨架标题，在写入实质内容时改为中文标题；用户明确要求其他语言时，以用户要求为准。

## Short Request Intake Gate

Before local execution, classify the request. One-line or low-information
requests default to intake or clarify when they have multiple plausible meanings,
lack a clear acceptance path, or omit important user, data, permission,
deployment, workflow, or ownership boundaries. In that case, do not edit code;
ask the fewest blocking questions needed and give critical feedback about the
main ambiguity, risk, simpler alternative, or stop condition.

Direct local execution is allowed only through the tiny escape hatch: the
affected surface, expected behavior, validation path, and risk are all clear; the
change does not touch data, permissions, deployment, migration, product strategy,
or architecture boundaries; and the scope is normally a single file or similarly
small. If tiny classification is uncertain, ask one short question before
coding.

Non-tiny work must have auditable documentation before code changes. Existing
external issues, PRDs, or design docs may count as equivalent evidence only when
the current workflow artifact cites them and fills missing acceptance,
verification, risk, and stop-condition gaps. At minimum use `context.md` and
`spec.md`; execution-ready changes should also have a project doc or lightweight
implementation contract.

Follow this loop:

1. Search MemPalace for relevant prior decisions, sessions, and legacy Atlas lessons.
2. Run `~/.codex/workflow/bin/codex-workflow list`.
3. Reuse a relevant `doing` task if one already exists. Otherwise create a new bounded task with:
   - `~/.codex/workflow/bin/codex-workflow init-task "<short title>" "<clear done condition>"`
   - then `~/.codex/workflow/bin/codex-workflow start <task-id>`
4. Treat `~/.codex/workflow/bin/codex-workflow recall "<task title or topic>"` as a legacy fallback only when MemPalace is unavailable.
5. Use `$atlas-workflow:analyze` for read-only cross-file evidence synthesis when the next step is still diagnosis.
6. Use `$atlas-workflow:clarify` when the request fails the short request intake gate or brownfield facts need to become `context.md` and `spec.md`.
7. Default to `$atlas-workflow:team` for non-tiny bounded work before execution:
   - Use native team for behavior changes, multi-file work, meaningful implementation choices, evaluator/reviewer judgment, or contract formation.
   - `$atlas-workflow:team` uses Codex native subagents. If native subagent tools are unavailable, stop and ask whether to use explicit legacy `$atlas-workflow:team-v1`; do not silently fall back to legacy CLI lanes.
   - Tiny precise fixes may stay in direct local flow when scope and verification are obvious.
   - Explicit user requests to avoid multi-agent or directly perform a tiny fix override the default when safe.
   - If the native team round is interrupted or stalls, follow `$atlas-workflow:team`: inspect recorded native lane output, write a synthesized `team/decision.md` when evidence is sufficient, run readiness, then continue direct local execution only when no unresolved blocking issue remains.
8. Use `$atlas-workflow:team` when the task needs discussion, staffing, review, contract formation, or promotion before execution.
9. Keep small features and fixes in the current workspace. Only switch to `$atlas-workflow:worktree` when the work clearly needs isolation.
10. If isolated branch work reaches completion, switch to `$atlas-workflow:finish` instead of merging, discarding, or cleaning up automatically.
11. Keep the task scope small and use `~/.codex/workflow/bin/codex-workflow show <task-id>` when you need to inspect the task file.
12. Keep phase evidence concise: git should hold phase conclusion files and final deliverables, while raw logs, Playwright JSON, traces, videos, HAR, bulk screenshots, full command output, debug JSONL, API dumps, port status, and intermediate repair output stay in the temporary run directory by default.
13. For nontrivial implementation with filled planning artifacts, run the relevant `~/.codex/workflow/bin/codex-workflow ready <task-id> --require ...` check before reporting execution readiness or handoff.
14. If this is a small precise fix with intentionally minimal artifacts, run `~/.codex/workflow/bin/codex-workflow ready <task-id> --skip "<why artifacts are intentionally minimal>"`.
15. Before reporting success, verify the work with real commands.
16. When one feature or fix is complete, create a dedicated git commit for that single piece of work using `type[optional scope]: <description>`. If the change is larger, add a clear body that explains what changed and what it affects.
17. When the work is actually finished, run `~/.codex/workflow/bin/codex-workflow done <task-id>`.
18. Let MemPalace hooks/mining capture reusable context by default; use `codex-workflow learn` only for legacy manual archival.
19. In the final reply, include the task id, changed files or artifact paths, readiness/skip result if used, verification commands and results, and any blockers or unverified assumptions.
