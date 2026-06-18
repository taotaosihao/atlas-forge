---
name: task
description: Use the Atlas task flow for bounded work.
---

Use the local task helper for this request.

Follow this loop:

1. Run `~/.codex/workflow/bin/codex-workflow list`.
2. Reuse a relevant `doing` task if one already exists.
3. Otherwise create a new bounded task with:
   - `~/.codex/workflow/bin/codex-workflow init-task "<short title>" "<clear done condition>"`
   - then `~/.codex/workflow/bin/codex-workflow start <task-id>`
4. Use `$atlas-workflow:analyze` when the task still needs read-only evidence synthesis across multiple files.
5. Use `$atlas-workflow:clarify` when the task needs explicit non-goals, decision boundaries, and acceptance criteria before execution.
6. Use `$atlas-workflow:team` when discussion, staffing, or promotion should happen before code changes.
7. For nontrivial direct execution that intentionally bypasses earlier planning layers, record:
   - `~/.codex/workflow/bin/codex-workflow route-decision <task-id> --intent task --risk <low|medium|high> --decision use --reason "<why direct task execution is appropriate>"`
8. Do not record route-decision for tiny precise fixes where scope and verification are already obvious.
9. Keep small features and fixes in the current workspace. Only switch to `$atlas-workflow:worktree` when the work clearly needs isolation.
10. If isolated branch work reaches completion, switch to `$atlas-workflow:finish` instead of merging, discarding, or cleaning up automatically.
11. Keep the task scope small and use `~/.codex/workflow/bin/codex-workflow show <task-id>` when you need the task details.
12. If this is a small precise fix with intentionally minimal artifacts, run:
    - `~/.codex/workflow/bin/codex-workflow ready <task-id> --skip "<why artifacts are intentionally minimal>"`
13. For nontrivial implementation with filled planning artifacts, run the relevant `ready` check before reporting execution readiness or handoff.
14. Before reporting success, verify the work with real commands.
15. When one feature or fix is complete, create a dedicated git commit for that single piece of work using `type[optional scope]: <description>`. If the change is larger, add a clear body that explains what changed and what it affects.
16. When the work is actually finished, run `~/.codex/workflow/bin/codex-workflow done <task-id>`.
17. In the final reply, include the task id, changed files or artifact paths, readiness/skip result if used, verification commands and results, and any blockers or unverified assumptions.
