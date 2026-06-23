---
name: team
description: Use the Atlas team flow for multi-agent discussion, review, staffing, and promotion.
---

Use the Atlas team flow for this request.

Follow this loop:

1. Run `~/.codex/workflow/bin/codex-workflow list`.
2. Reuse a relevant `doing` task if one already exists. Otherwise create/start one.
3. Record team routing evidence for nontrivial discussion, review, staffing, or promotion:
   - `~/.codex/workflow/bin/codex-workflow route-decision <task-id> --intent team --risk <low|medium|high> --decision use --reason "<why consensus or staffing is needed>"`
4. Read `workflow/artifacts/<task-id>/context.md`, `spec.md`, and `analysis.md` before launching the round.
5. Default to discuss mode with 3 agents:
   - `~/.codex/workflow/bin/codex-workflow team-start <task-id> "<objective>"`
6. Use execute mode when the round should focus on implementation roles:
   - `~/.codex/workflow/bin/codex-workflow team-start <task-id> "<objective>" --mode execute`
7. Use `--claude-review` only when an explicit Claude review lane is wanted.
8. Treat `workflow/artifacts/<task-id>/team/decision.md` as the single main decision file.
9. When a high-risk route or Multica handoff needs consensus evidence, run:
   - `~/.codex/workflow/bin/codex-workflow route-decision <task-id> --intent team --risk high --decision use --reason "<why consensus evidence is required>" --consensus`
10. Use `workflow/artifacts/<task-id>/team/staffing.md` for ownership suggestions.
11. When the team discussion settles an actionable plan, promotion, or staffing handoff, also write a concise project doc:
    - prefer an existing project docs location; otherwise create `docs/atlas-workflow/` under the target project root.
    - name it `docs/atlas-workflow/<task-id>-<short-topic>.md` unless the project already has a stronger naming convention.
    - include the final decision, consensus basis, owner/staffing plan when relevant, acceptance criteria, verification gates, risks, and next execution step.
    - keep `workflow/artifacts/<task-id>/team/decision.md` as the discussion record; the project doc is the durable handoff for the repo.
12. Check status or stop the active round with:
   - `~/.codex/workflow/bin/codex-workflow team-status <task-id>`
   - `~/.codex/workflow/bin/codex-workflow team-stop <task-id>`
13. Before promoting to execution, worktree, finish, or Multica handoff, run:
    - `~/.codex/workflow/bin/codex-workflow ready <task-id> --require context,spec,analysis,decision`
    - use a narrower `--require` list only when the missing artifact is intentionally out of scope and explain why.
14. Promote explicitly with:
    - `~/.codex/workflow/bin/codex-workflow team-promote <task-id> --to execute`
    - `~/.codex/workflow/bin/codex-workflow team-promote <task-id> --to worktree`
    - `~/.codex/workflow/bin/codex-workflow team-promote <task-id> --to finish`
15. In the final reply, include the task id, `decision.md` path, staffing path if produced, project doc path if written, readiness result if run, promotion state, and any open decision.
