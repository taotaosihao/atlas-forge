---
name: cw
description: Use the Atlas local workflow helper for bounded work.
---

`$atlas-workflow:cw` is the compatibility entrypoint for local bounded work. Follow `$atlas-workflow:task` as the authoritative execution policy instead of maintaining a second copy of routing, artifact, Team, review, commit, and completion rules.

Additional local guidance:

- Reuse a relevant `doing` task from `~/.codex/workflow/bin/codex-workflow list`; create/start one only when needed.
- Search MemPalace or legacy recall only when the user requests historical memory or prior decisions are material evidence for the current task.
- Keep ordinary features and fixes in the current workspace; use a worktree only for concrete isolation value.
- Keep raw run output outside Git and use a single overwritten rolling checkpoint only for work that crosses compaction or handoff.
- Report the task id, changes, verification, commits, and actionable residual risk.
