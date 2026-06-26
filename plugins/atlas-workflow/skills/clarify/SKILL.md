---
name: clarify
description: Use the Atlas clarify flow to convert a chosen direction into execution-ready context and spec artifacts.
---

Use the Atlas clarify flow for this request.

## 输出语言

- 生成或更新项目文档、需求/方案/分析/交接材料、design-review 报告、team 决策、workflow artifacts 和面向用户的总结时，默认使用中文。
- 命令、文件路径、代码标识符、配置键、API 名称、错误原文和必须保持的模板字段可以保留原文。
- 如果 `codex-workflow` 创建了英文骨架标题，在写入实质内容时改为中文标题；用户明确要求其他语言时，以用户要求为准。

This is the execution clarification layer:

- Use `$atlas-workflow:office-hours` when product value, user, or scope is still unsettled.
- Use `$atlas-workflow:brainstorm` when the idea is worth exploring but the solution shape still needs options and tradeoffs.
- Use `$atlas-workflow:clarify` when the direction is chosen and the task needs explicit non-goals, decision boundaries, acceptance criteria, and verification before execution.

## Short Request Clarification

When clarifying a one-line or low-information request, explicitly turn the short
request into an implementable plan before any coding starts. The clarification
should include:

- Original request.
- Restated requirement.
- Critical feedback: ambiguity, risk, simpler alternative, rejected path, or stop condition.
- Tiny escape decision, including why direct execution is or is not allowed.
- Goal and non-goals.
- Decision boundaries.
- Acceptance criteria.
- Verification plan.
- Required documentation source: workflow artifacts, project doc, lightweight implementation contract, or an existing external issue, PRD, or design doc cited from the current artifact.

Non-tiny work must have auditable documentation before code changes. Existing
external issues, PRDs, or design docs may count as equivalent evidence only when
the current artifact cites them and fills missing acceptance, verification, risk,
and stop-condition gaps. If tiny classification is uncertain, ask one short
question before coding.

Follow this loop:

1. Run `~/.codex/workflow/bin/codex-workflow list`.
2. Reuse a relevant `doing` task if one already exists. Otherwise create/start one.
3. For nontrivial execution clarification, record routing evidence:
   - `~/.codex/workflow/bin/codex-workflow route-decision <task-id> --intent clarify --risk <low|medium|high> --decision use --reason "<why boundaries must be locked>"`
   - If office-hours or brainstorm is intentionally skipped because the direction is already chosen, record a separate skip reason only when that choice is non-obvious.
4. Read any existing `workflow/artifacts/<task-id>/context.md`, `decision.md`, `spec.md`, or `analysis.md` before writing new boundaries.
5. Collect brownfield facts before proposing boundaries.
6. Ask one blocking question only when a missing fact would make the spec unsafe. Prefer ordinary dialogue; use structured choice tools only when available and helpful. Do not block when `AskUserQuestion` or `request_user_input` is unavailable.
7. Write `workflow/artifacts/<task-id>/context.md`.
   - current state
   - confirmed facts
   - source of truth files
   - known risks
8. Preserve or update `workflow/artifacts/<task-id>/decision.md` when the chosen approach matters for execution.
   - selected direction
   - rejected alternatives
   - assumptions inherited from brainstorm or office-hours
9. Write `workflow/artifacts/<task-id>/spec.md`.
   - Goal
   - Non-goals
   - Decision Boundaries
   - Acceptance Criteria
   - Verification Plan
   - Critical Feedback
   - Tiny Escape Decision
   - Stop Conditions
10. Make acceptance criteria command-verifiable or user-visible.
11. When the next step is non-tiny implementation, include an implementation-contract expectation:
   - whether `workflow/templates/implementation-contract.md` should be filled before coding
   - which acceptance criteria become required validation rows
   - which commands, browser paths, API calls, CLI invocations, or runtime targets must produce evidence
   - what failure or ambiguity should stop implementation and return to the user
   Keep this lightweight for local Atlas work; do not require a Multica-style multi-agent contract unless the user explicitly asks for Multica handoff.
12. Because clarify turns a chosen direction into an execution-ready plan, also write a concise project doc:
   - prefer an existing project docs location; otherwise create `docs/atlas-workflow/` under the target project root.
   - name it `docs/atlas-workflow/<task-id>-<short-topic>.md` unless the project already has a stronger naming convention.
   - include the goal, non-goals, selected direction, decision boundaries, acceptance criteria, verification plan, assumptions, and next execution step.
   - keep `workflow/artifacts/<task-id>/` as the working record; the project doc is the durable handoff for the repo.
13. Self-review artifacts before reporting:
   - no placeholders such as `TBD` or `TODO`
   - no contradictions between context, decision, spec, and the project doc
   - assumptions are labelled
   - acceptance criteria match the verification plan
14. Before claiming the artifacts are execution-ready, run:
    - `~/.codex/workflow/bin/codex-workflow ready <task-id> --require context,spec`
    - add `decision` to `--require` when the selected direction or rejected alternatives matter for execution.
15. Use `$atlas-workflow:team` when the task should go through discussion or promotion before execution.
16. In the final reply, include the task id, `context.md`, `decision.md` if used, `spec.md`, project doc path, readiness result, locked assumptions, and verification plan.

Hard rules:

- Do not re-open product strategy or design exploration unless execution safety depends on it.
- Do not implement code from this skill unless the user explicitly changes the request to implementation after the spec is locked.
- Keep exploratory or unstable notes in `workflow/artifacts/<task-id>/`; execution-ready specs must also be mirrored into project docs as described above.
