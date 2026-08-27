---
name: office-hours
description: Use the Atlas office-hours flow to pressure-test an early product, feature, startup, side-project, or open-source idea before design or implementation planning.
---

Use the Atlas office-hours flow for this request.

## Host Note

Codex invokes this flow as `$atlas-workflow:office-hours`; Claude Code invokes it as `/office-hours` or by calling the `office-hours` skill directly. For CLI commands below, prefer the bare `atlas-workflow` command on `PATH`, falling back to the absolute `~/.codex/workflow/bin/codex-workflow` only when no `PATH` command is available.

## 输出语言

- 生成或更新项目文档、需求/方案/分析/交接材料、design-review 报告、team 决策、workflow artifacts 和面向用户的总结时，默认使用中文。
- 面向用户的回复和总结要口语化、通俗易懂：不要把 `canonical scope source`、`staffing_mode`、`release_mode`、`frozen Goal` 这类内部流程术语直接抛给用户，先用平实的中文说清楚意思（例如“本次范围以哪份文档为准”），确有必要时再在括号里附上原术语。
- 命令、文件路径、代码标识符、配置键、API 名称、错误原文和必须保持的模板字段可以保留原文。
- 如果 `codex-workflow` 创建了英文骨架标题，在写入实质内容时改为中文标题；用户明确要求其他语言时，以用户要求为准。

This is the upstream product judgment layer:

- Use `$atlas-workflow:office-hours` when the user is still deciding whether an idea is worth doing, who it serves, what problem it solves, or how broad the scope should be.
- Use `$atlas-workflow:brainstorm` when the idea is worth exploring and the main question is what shape the solution should take.
- Use `$atlas-workflow:product-design` when the direction is chosen for a user-visible feature but its primary scenario or user-operable flow is not approved.
- Use `$atlas-workflow:clarify` when a current Design Handoff exists and only execution-ready boundaries are missing.

Follow this loop:

1. Run `~/.codex/workflow/bin/codex-workflow list`.
2. Reuse a relevant `doing` task if one already exists. Otherwise create/start one.
3. For nontrivial idea intake, record the active route:
   - `~/.codex/workflow/bin/codex-workflow route-decision <task-id> --intent office-hours --risk <low|medium|high> --decision use --reason "<why product judgment is needed>"`
4. Recover local context first:
   - user brief and current conversation
   - project docs and existing artifacts when relevant
   - recent Atlas `context.md`, `decision.md`, `spec.md`, or `analysis.md` for the task
5. State the current hypothesis in one short paragraph:
   - target user
   - problem or job to be done
   - proposed wedge or differentiator
   - what would make this worth building
6. Ask forcing product questions one at a time. Prefer ordinary dialogue; use structured choice tools only when available and helpful. Do not block the flow when `AskUserQuestion` or `request_user_input` is unavailable.
7. Challenge weak assumptions directly:
   - unclear user or buyer
   - vague pain
   - solution looking like a feature instead of a product
   - scope too large for one spec
   - no visible reason this must exist now
8. If the idea is too broad, decompose it into smaller projects and choose the first slice before continuing.
9. Write `workflow/artifacts/<task-id>/context.md` when enough facts are known:
   - current state
   - target user and use case
   - confirmed facts
   - assumptions
   - risks and unknowns
10. Write or update `workflow/artifacts/<task-id>/decision.md`:
   - product thesis
   - why now
   - alternatives considered
   - recommended next slice
   - explicit kill or pause criteria when appropriate
11. Stop at a decision checkpoint. Do not implement code from this skill.
12. If the idea should proceed, recommend the next Atlas entry:
   - `$atlas-workflow:brainstorm` for solution shape and design options
   - `$atlas-workflow:product-design` when the direction is chosen but the user-visible scenario or flow is not approved
   - `$atlas-workflow:clarify` only when a current Design Handoff already defines the user-visible scenario and flow and execution boundaries remain
   - `$atlas-workflow:task` for a very small, already-scoped fix
13. Run `~/.codex/workflow/bin/codex-workflow ready <task-id> --require context,decision` only if you are claiming the product decision artifacts are ready for the next execution-planning layer. For a pure early checkpoint, state that readiness was not claimed.
14. In the final reply, include the task id, artifact paths, the strongest product judgment, readiness result if run, open questions, and the recommended next Atlas skill.

Hard rules:

- Do not turn every engineering task into office-hours. Use it only when product direction, user value, or scope is genuinely unsettled.
- Do not write implementation code or modify project source during office-hours.
- Keep confirmed facts separate from assumptions.
- Do not run `route-decision` for a tiny precise fix that should have gone straight to `$atlas-workflow:task`.
- Keep artifacts in `workflow/artifacts/<task-id>/` unless the user explicitly asks for repo docs.
- Keep pure backend, migration, CLI, and tiny precise changes out of Product Design; route them to Task or Clarify.
