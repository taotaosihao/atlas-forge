---
name: analyze
description: Use the Atlas analyze flow for read-only cross-file synthesis.
---

Use the Atlas analyze flow for this request.

Follow this loop:

1. Run `~/.codex/workflow/bin/codex-workflow list`.
2. Reuse a relevant `doing` task if one already exists. Otherwise create/start one.
3. Read the task file and the current artifact inputs before exploring:
   - `~/.codex/workflow/bin/codex-workflow show <task-id>`
   - `workflow/artifacts/<task-id>/context.md`
   - `workflow/artifacts/<task-id>/spec.md`
   - `workflow/artifacts/<task-id>/analysis.md`
4. Keep this step read-only.
5. Gather evidence from the real repo.
   - commands
   - file paths
   - call sites
   - config values
   - actual outputs
6. Write `workflow/artifacts/<task-id>/analysis.md` with:
   - `## Evidence`
   - `## Inference`
   - `## Unknown`
   - `## Ranked Synthesis`
7. Keep inference and unknown separate.
8. If the boundary is still unclear, switch to `$atlas-workflow:clarify`.
9. If discussion or staffing is the next step, switch to `$atlas-workflow:team`.
10. Before claiming the analysis artifact is ready for clarification, team discussion, handoff, or execution planning, run:
    - `~/.codex/workflow/bin/codex-workflow ready <task-id> --require analysis`
11. If the artifact is intentionally partial or exploratory, do not claim execution readiness; report the remaining unknowns instead.
12. In the final reply, include the task id, `analysis.md` path, evidence sources reviewed, readiness result if run, and remaining unknowns.
