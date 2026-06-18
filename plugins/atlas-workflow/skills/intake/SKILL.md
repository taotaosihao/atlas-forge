---
name: intake
description: Use the Atlas intake flow when user intent, scope, stakeholder, or problem boundary is ambiguous before brainstorm, clarify, or execution.
---

Use the Atlas intake flow for this request.

This is the deep-interview style intake layer:

- Use `$atlas-workflow:office-hours` when the question is whether an idea is worth doing.
- Use `$atlas-workflow:brainstorm` when the idea is worth exploring but the solution shape is unclear.
- Use `$atlas-workflow:intake` when intent, scope, stakeholder, constraints, or success shape is ambiguous.
- Use `$atlas-workflow:clarify` when the direction is chosen and execution boundaries need to be locked.

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
- If the user already gave a precise implementation request, skip intake and use `$atlas-workflow:task`.
