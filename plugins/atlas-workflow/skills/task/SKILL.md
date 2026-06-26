---
name: task
description: Use the Atlas task flow for bounded work.
---

Use the local task helper for this request.

## 输出语言

- 生成或更新项目文档、需求/方案/分析/交接材料、design-review 报告、team 决策、workflow artifacts 和面向用户的总结时，默认使用中文。
- 命令、文件路径、代码标识符、配置键、API 名称、错误原文和必须保持的模板字段可以保留原文。
- 如果 `codex-workflow` 创建了英文骨架标题，在写入实质内容时改为中文标题；用户明确要求其他语言时，以用户要求为准。

## Short Request Intake Gate

Before editing code, classify the request. One-line or low-information requests
default to intake or clarify when they have multiple plausible meanings, lack a
clear acceptance path, or omit important user, data, permission, deployment,
workflow, or ownership boundaries. In that case, do not edit code; ask the
fewest blocking questions needed and give critical feedback about the main
ambiguity, risk, simpler alternative, or stop condition.

Direct task execution is allowed only through the tiny escape hatch: the
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

1. Run `~/.codex/workflow/bin/codex-workflow list`.
2. Reuse a relevant `doing` task if one already exists.
3. Otherwise create a new bounded task with:
   - `~/.codex/workflow/bin/codex-workflow init-task "<short title>" "<clear done condition>"`
   - then `~/.codex/workflow/bin/codex-workflow start <task-id>`
4. Use `$atlas-workflow:analyze` when the task still needs read-only evidence synthesis across multiple files.
5. Use `$atlas-workflow:clarify` when the request fails the short request intake gate or the task needs explicit non-goals, decision boundaries, and acceptance criteria before execution.
6. Default to `$atlas-workflow:team` for non-tiny bounded work before code changes:
   - Use team when the task changes behavior, touches multiple files, has meaningful implementation choices, benefits from reviewer/evaluator judgment, or needs a lightweight implementation contract.
   - Tiny precise fixes may stay in direct task flow when scope and verification are obvious.
   - Explicit user requests such as "directly implement", "no multi-agent", or "tiny fix" override this default when safe.
   - When team is skipped for a non-tiny task, record why direct execution is still appropriate.
   - If the default team round is interrupted or stalls, follow `$atlas-workflow:team` fallback: inspect partial lane output, write a synthesized `team/decision.md` when evidence is sufficient, run readiness, then continue direct task execution only when no unresolved blocking issue remains.
7. Use `$atlas-workflow:team` specifically for discussion, staffing, review, contract formation, or promotion before code changes.
8. For nontrivial direct execution that intentionally bypasses earlier planning layers or the default team flow, record:
   - `~/.codex/workflow/bin/codex-workflow route-decision <task-id> --intent task --risk <low|medium|high> --decision use --reason "<why direct task execution is appropriate>"`
9. Do not record route-decision for tiny precise fixes where scope and verification are already obvious.
10. Keep small features and fixes in the current workspace. Only switch to `$atlas-workflow:worktree` when the work clearly needs isolation.
11. If isolated branch work reaches completion, switch to `$atlas-workflow:finish` instead of merging, discarding, or cleaning up automatically.
12. Keep the task scope small and use `~/.codex/workflow/bin/codex-workflow show <task-id>` when you need the task details.
13. For non-tiny implementation work, create a lightweight implementation contract before editing code:
    - Use `workflow/templates/implementation-contract.md` as the shape when a separate artifact is useful.
    - Prefer forming this contract from the team decision when the default team flow ran.
    - Required when the task changes user-visible behavior, touches multiple files, changes UI/API/CLI/background-job behavior, or has meaningful edge cases.
    - Tiny precise fixes may skip this when the acceptance path is obvious; say why in the working note or final reply.
    - The contract must name goal, non-goals, acceptance criteria, real validation command or browser/API/CLI action, evidence path, and stop conditions.
    - Do not let the contract expand scope beyond the user request or the clarified spec.
14. If this is a small precise fix with intentionally minimal artifacts, run:
    - `~/.codex/workflow/bin/codex-workflow ready <task-id> --skip "<why artifacts are intentionally minimal>"`
15. For nontrivial implementation with filled planning artifacts, run the relevant `ready` check before reporting execution readiness or handoff.
16. Before reporting success, verify the work with real commands.
17. When one feature or fix is complete, create a dedicated git commit for that single piece of work using `type[optional scope]: <description>`. If the change is larger, add a clear body that explains what changed and what it affects.
18. When the work is actually finished, run `~/.codex/workflow/bin/codex-workflow done <task-id>`.
19. In the final reply, include the task id, changed files or artifact paths, readiness/skip result if used, verification commands and results, and any blockers or unverified assumptions.
