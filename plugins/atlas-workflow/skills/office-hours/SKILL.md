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

For a corrected premise or rejected direction, first apply the shared
[decision supersession protocol](../../references/decision-supersession.md).

This is the upstream product judgment layer:

- Use `$atlas-workflow:office-hours` when the user is still deciding whether an idea is worth doing, who it serves, what problem it solves, or how broad the scope should be.
- Use `$atlas-workflow:brainstorm` when the idea is worth exploring and the main question is what shape the solution should take.
- Use `$atlas-workflow:product-design` when the direction is chosen for a user-visible feature but its primary scenario or user-operable flow is not approved.
- Use `$atlas-workflow:clarify` when the direction is settled and only execution boundaries are missing; pure backend, CLI, or no-interaction work needs no Design Handoff.

Treat a chosen direction as a hypothesis with supporting assumptions still to
check. Look up facts that could change the product recommendation before
settling it. A question can be worth asking without stopping independent work;
wait only when proceeding would overreach authority, make a high-cost choice on
weak evidence, or invalidate the next result.

Follow this loop:

1. Decide whether persistence, recovery, audit, or handoff value justifies a
   workflow record. Keep a clear, self-contained judgment in the current
   response when it does not.
2. When a durable record is useful, run `~/.codex/workflow/bin/codex-workflow list`,
   reuse a relevant `doing` task, and create/start one only when no relevant
   task exists. Keep one current authoritative body for the product judgment;
   do not mirror it into a repository bundle merely for handoff.
3. For a durable nontrivial judgment, record the active route:
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
6. Ask product questions one at a time when the answer could change the
   recommendation, and say whether the answer must block. Prefer ordinary
   dialogue; use structured choice tools only when available and helpful. Do
   not block independent fact-finding when `AskUserQuestion` or
   `request_user_input` is unavailable.
7. Challenge weak assumptions directly:
   - unclear user or buyer
   - vague pain
   - solution looking like a feature instead of a product
   - scope too large for one spec
   - no visible reason this must exist now
8. If the idea is too broad, decompose it into smaller projects and choose the first slice before continuing.
9. When a durable record is useful, write or update the current authoritative
   body with:
   - current state
   - target user and use case
   - confirmed facts
   - assumptions
   - risks and unknowns
10. Write or update a separate `workflow/artifacts/<task-id>/decision.md` only
   when the workflow needs a distinct decision record; otherwise keep the
   decision in the one current body. Include:
   - product thesis
   - why now
   - alternatives considered
   - recommended next slice
   - explicit kill or pause criteria when appropriate
11. Stop at a decision checkpoint. Do not implement code from this skill.
12. If the idea should proceed, recommend the next Atlas entry:
   - `$atlas-workflow:brainstorm` for solution shape and design options
   - `$atlas-workflow:product-design` when the direction is chosen but the user-visible scenario or flow is not approved
   - `$atlas-workflow:clarify` when execution boundaries remain and no user-visible scenario or flow decision is missing
   - `$atlas-workflow:task` for an already-scoped implementation
13. When a durable workflow record is used for handoff, run
    `~/.codex/workflow/bin/codex-workflow ready <task-id> --require <used-supported-kinds>`
    with only its intended `context`, `spec`, `analysis`, or `decision` artifacts.
    If the one authoritative body is elsewhere, use
    `ready <task-id> --skip "<reason naming that body>"`; do not create copies
    for the checker. Readiness does not prove semantic sufficiency or authority.
14. In the final reply, include task and artifact paths only when a durable
    record was used, then report the strongest product judgment, readiness
    result if run, open questions, and the recommended next Atlas skill.

Hard rules:

- Do not turn every engineering task into office-hours. Use it only when product direction, user value, or scope is genuinely unsettled.
- Do not write implementation code or modify project source during office-hours.
- Keep confirmed facts separate from assumptions.
- Do not run `route-decision` or create a record merely because a request is
  short, tiny, or spans a particular number of files. A clear implementation
  request should go directly to `$atlas-workflow:task` or `$atlas-workflow:clarify`.
- Keep artifacts in `workflow/artifacts/<task-id>/` unless the user explicitly asks for repo docs.
- Keep pure backend, migration, CLI, and tiny precise changes out of Product Design; route them to Task or Clarify.
