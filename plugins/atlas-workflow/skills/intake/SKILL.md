---
name: intake
description: Use the Atlas intake flow when user intent, scope, stakeholder, or problem boundary is ambiguous before brainstorm, clarify, or execution.
---

Use the Atlas intake flow for this request.

## 输出语言

- 生成或更新项目文档、需求/方案/分析/交接材料、design-review 报告、team 决策、workflow artifacts 和面向用户的总结时，默认使用中文。
- 命令、文件路径、代码标识符、配置键、API 名称、错误原文和必须保持的模板字段可以保留原文。
- 如果 `codex-workflow` 创建了英文骨架标题，在写入实质内容时改为中文标题；用户明确要求其他语言时，以用户要求为准。

This is the deep-interview style intake layer:

- Use `$atlas-workflow:office-hours` when the question is whether an idea is worth doing.
- Use `$atlas-workflow:brainstorm` when the idea is worth exploring but the solution shape is unclear.
- Use `$atlas-workflow:intake` when intent, scope, stakeholder, constraints, or success shape is ambiguous.
- Use `$atlas-workflow:clarify` when the direction is chosen and execution boundaries need to be locked.
- Treat `intake.md` as workflow working notes by default. Do not mirror the full
  interview transcript or decision tree into repo docs; when intake produces a
  durable handoff, write only the confirmed summary, open blockers, and next
  layer recommendation.

## Short Request Intake Gate

Treat one-line or low-information requests as intake candidates by default when
they have multiple plausible meanings, lack a clear acceptance path, or omit
important user, data, permission, deployment, workflow, or ownership boundaries.
Ask only the fewest blocking questions needed, usually 1-3 questions, and include
critical feedback about the main ambiguity, risk, simpler alternative, or stop
condition. Do not edit code during intake.

Direct execution is allowed only through the tiny escape hatch: the affected
surface, expected behavior, validation path, and risk are all clear; the change
does not touch data, permissions, deployment, migration, product strategy, or
architecture boundaries; and the scope is normally a single file or similarly
small. If tiny classification is uncertain, ask one short question first.

Non-tiny requests must produce auditable documentation before coding. Existing
external issues, PRDs, or design docs may count as equivalent evidence only when
the current artifact cites them and fills missing acceptance, verification, risk,
and stop-condition gaps.

Follow this loop:

1. Run `~/.codex/workflow/bin/codex-workflow list`.
2. Reuse a relevant `doing` task if one already exists. Otherwise create/start one.
3. Record routing evidence:
   - `~/.codex/workflow/bin/codex-workflow route-decision <task-id> --intent intake --risk <low|medium|high> --decision use --reason "<why intent or scope must be resolved>"`
4. Read existing `workflow/artifacts/<task-id>/context.md`, `decision.md`, `spec.md`, or `analysis.md` before writing intake notes.
5. Identify only blocking ambiguity:
   - actual user or customer
   - target workflow
   - in-scope and out-of-scope surfaces
   - hard constraints
   - success or failure signal
   - decision owner
6. Ask the fewest blocking questions needed. Do not turn intake into a full PRD interview.
7. Write `workflow/artifacts/<task-id>/intake.md`:
   - known facts
   - unresolved blockers
   - assumptions that are safe to carry
   - recommended next layer: office-hours, brainstorm, clarify, task, or multica-handoff
8. If the next layer is already clear, record it with `route-decision --decision use` or a skip reason for the omitted layer when non-obvious.
9. Before claiming intake is complete, run:
   - `~/.codex/workflow/bin/codex-workflow ready <task-id> --require context,analysis`
   - or `ready --skip "<reason>"` when `intake.md` is the only intended artifact.
10. In the final reply, include the task id, `intake.md`, routing decision, unresolved blockers, and recommended next layer.

Hard rules:

- Intake does not produce execution-ready specs.
- Do not force `office-hours -> brainstorm -> intake -> clarify` as a mandatory chain.
- If the user already gave a precise implementation request, skip intake and use `$atlas-workflow:task` only when the tiny escape hatch or a complete non-tiny documentation path is satisfied.
