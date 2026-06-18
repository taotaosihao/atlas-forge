---
name: clarify
description: Use the Atlas clarify flow to convert a chosen direction into execution-ready context and spec artifacts.
---

Use the Atlas clarify flow for this request.

This is the execution clarification layer:

- Use `$atlas-workflow:office-hours` when product value, user, or scope is still unsettled.
- Use `$atlas-workflow:brainstorm` when the idea is worth exploring but the solution shape still needs options and tradeoffs.
- Use `$atlas-workflow:clarify` when the direction is chosen and the task needs explicit non-goals, decision boundaries, acceptance criteria, and verification before execution.

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
10. Make acceptance criteria command-verifiable or user-visible.
11. Self-review artifacts before reporting:
   - no placeholders such as `TBD` or `TODO`
   - no contradictions between context, decision, and spec
   - assumptions are labelled
   - acceptance criteria match the verification plan
12. Before claiming the artifacts are execution-ready, run:
    - `~/.codex/workflow/bin/codex-workflow ready <task-id> --require context,spec`
    - add `decision` to `--require` when the selected direction or rejected alternatives matter for execution.
13. Use `$atlas-workflow:team` when the task should go through discussion or promotion before execution.
14. In the final reply, include the task id, `context.md`, `decision.md` if used, `spec.md`, readiness result, locked assumptions, and verification plan.

Hard rules:

- Do not re-open product strategy or design exploration unless execution safety depends on it.
- Do not implement code from this skill unless the user explicitly changes the request to implementation after the spec is locked.
- Keep artifacts in `workflow/artifacts/<task-id>/` unless the user explicitly asks for repo docs.
