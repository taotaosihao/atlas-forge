---
name: brainstorm
description: Use the Atlas brainstorm flow to turn a rough idea into design options, tradeoffs, and a recommended direction before execution clarification.
---

Use the Atlas brainstorm flow for this request.

## Host Note

Codex invokes this flow as `$atlas-workflow:brainstorm`; Claude Code invokes it as `/brainstorm` or by calling the `brainstorm` skill directly. For CLI commands below, prefer the bare `atlas-workflow` command on `PATH`, falling back to the absolute `~/.codex/workflow/bin/codex-workflow` only when no `PATH` command is available.

## 输出语言

- 生成或更新项目文档、需求/方案/分析/交接材料、design-review 报告、team 决策、workflow artifacts 和面向用户的总结时，默认使用中文。
- 面向用户的回复和总结要口语化、通俗易懂：不要把 `canonical scope source`、`staffing_mode`、`release_mode`、`frozen Goal` 这类内部流程术语直接抛给用户，先用平实的中文说清楚意思（例如“本次范围以哪份文档为准”），确有必要时再在括号里附上原术语。
- 命令、文件路径、代码标识符、配置键、API 名称、错误原文和必须保持的模板字段可以保留原文。
- 如果 `codex-workflow` 创建了英文骨架标题，在写入实质内容时改为中文标题；用户明确要求其他语言时，以用户要求为准。

For a corrected or rejected option, first apply the shared
[decision supersession protocol](../../references/decision-supersession.md).

This is the design exploration layer:

- Use `$atlas-workflow:office-hours` first when the core question is whether the idea is worth doing.
- Use `$atlas-workflow:brainstorm` when the idea is worth exploring but the feature shape, UX, architecture, or scope is not settled.
- Use `$atlas-workflow:product-design` next when a user-visible direction is chosen but its primary scenario or surface flow is not approved.
- Use `$atlas-workflow:clarify` when the chosen direction is settled and execution-ready boundaries remain; a current Design Handoff is not a prerequisite for pure backend, CLI, or no-interaction work.

The selected direction remains a hypothesis until its important premises have
enough evidence. Identify the assumptions most likely to change the
recommendation and inspect available facts before comparing solution shapes.
Ask a question when its answer could change the recommendation, but wait only
when continuing would overreach authority, make a high-cost choice, or make the
next result stale.

Follow this loop:

1. Decide whether persistence, recovery, audit, or handoff value justifies a
   workflow record. A small, self-contained exploration can remain in the
   current response.
2. When a durable record is useful, run `~/.codex/workflow/bin/codex-workflow list`,
   reuse a relevant `doing` task, and create/start one only when no relevant
   task exists. Keep one current authoritative body instead of mirroring the
   same exploration across workflow and repository documents.
3. For durable design exploration, record routing evidence:
   - `~/.codex/workflow/bin/codex-workflow route-decision <task-id> --intent brainstorm --risk <low|medium|high> --decision use --reason "<why solution shape is unsettled>"`
   - If office-hours was plausible but intentionally skipped because the idea is already worth exploring, record a separate `--intent office-hours --decision skip` reason.
4. Gather project context before asking detailed questions:
   - current user request and conversation
   - project instructions and existing docs
   - relevant code, UI, tests, or prior Atlas artifacts
   - established user preferences when available
5. Ask one clarifying question at a time when the answer could change the
   recommended design, scope, or acceptance criteria. Mark whether it must
   block; continue independent fact-finding when it does not. Prefer ordinary
   dialogue; use structured choice tools only when available and helpful.
6. Compare only materially different approaches whose tradeoffs could change
   the recommendation. Lead with the recommended approach and explain what the
   other viable choices give up; when evidence leaves one clear shape, state
   that conclusion without inventing two more options.
7. Present the design in sections scaled to complexity:
   - user outcome
   - workflow or interaction model
   - architecture or data flow
   - key components
   - error and edge cases
   - verification strategy
8. For UI or visual product work, offer visual exploration only when seeing options would be materially clearer than text. If accepted, use the available browser or image workflow; otherwise continue text-only.
9. When a durable record is useful, run `~/.codex/workflow/bin/codex-workflow scaffold-brainstorm <task-id>`,
   then write or update the one current `workflow/artifacts/<task-id>/brainstorm.md` and update
   `context.md` when the factual base changes:
   - current state
   - confirmed facts
   - source-of-truth files
   - relevant user preferences
   - risks and unknowns
10. Write or update `workflow/artifacts/<task-id>/decision.md` only when it is
    the distinct current decision body rather than a mirror. Include:
   - options considered
   - tradeoffs
   - recommendation
   - rejected alternatives and why
   - open decisions
11. If the user approves the direction, route by the remaining gap:
   - switch to `$atlas-workflow:product-design` when a user-visible primary scenario or flow-and-surface is not yet approved;
   - when a durable execution spec is useful, write `workflow/artifacts/<task-id>/spec.md` directly when the scope is simple, facts are stable, and no user-visible flow design is missing; or
   - switch to `$atlas-workflow:clarify` when the chosen direction remains valid but explicit non-goals, decision boundaries, and acceptance criteria still need to be locked; do not wait for a Design Handoff for pure backend, CLI, or no-interaction work.
12. When a durable handoff is genuinely useful, update or create one
    authoritative project body with the confirmed direction, its reasons,
    assumptions, acceptance shape, verification strategy, real entrypoint or
    implementation dependency, allowed engineering adjustments, the behavior and
    permission/authorization boundaries to preserve by citing current confirmed
    decisions, and important unresolved items. Reuse an existing project document when possible. Do not
    create a repository bundle or copy the full workflow notes just to satisfy
    a handoff format.
13. Self-review artifacts before reporting:
   - no placeholders such as `TBD` or `TODO`
   - no contradictions between context, decision, spec, and any project doc
   - assumptions are labelled
   - scope is small enough for the next execution step
14. When a durable workflow record is used for handoff, run
    `~/.codex/workflow/bin/codex-workflow ready <task-id> --require <used-supported-kinds>`
    with only its intended `context`, `spec`, `analysis`, or `decision` artifacts.
    When the one authoritative body is `brainstorm.md` or a project document,
    use `ready <task-id> --skip "<reason naming that body>"`; do not create copies
    for the checker. Readiness does not prove semantic sufficiency or authority.
15. For pure option exploration, do not run readiness and do not write project
    docs; report the open decisions instead.
16. Do not implement code from this skill unless the user explicitly changes the request to implementation after approving the direction.
17. In the final reply, include task and artifact paths only when a durable record was used, then report the recommendation, readiness result if run, open decisions, and the recommended next Atlas skill.

Hard rules:

- Do not force brainstorm because the request is large or because it names a
  new surface. For a precise implementation request, use `$atlas-workflow:task`
  or `$atlas-workflow:clarify` directly.
- Do not over-question clear engineering fixes. If the user already gave a precise implementation request, use `$atlas-workflow:task` or `$atlas-workflow:clarify` instead.
- Keep confirmed facts separate from inferences and assumptions.
- Do not make routing evidence a ceremony for a clear request, a tiny label, or
  a file count; route only when a planning-layer choice is meaningful.
- Keep exploratory or unstable notes in `workflow/artifacts/<task-id>/`; when a
  solution is actionable, update the one current authoritative handoff body.
- Keep pure backend, migration, CLI, and tiny precise changes in Task or Clarify rather than Product Design.
