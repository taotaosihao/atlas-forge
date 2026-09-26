---
name: cw
description: Compatibility entrypoint for bounded local work that follows the Atlas task flow with workflow-helper tracking. Use when the user invokes cw or wants a tracked Atlas task for a clear change.
---

`$atlas-workflow:cw` is the compatibility entrypoint for local bounded work. Follow `$atlas-workflow:task` as the authoritative execution policy instead of maintaining a second copy of routing, artifact, Team, review, commit, and completion rules.

## Host Note

Codex invokes this flow as `$atlas-workflow:cw`; Claude Code invokes it as `/atlas-workflow:cw` or by calling the `atlas-workflow:cw` skill. Other `$atlas-workflow:<name>` references below follow the same per-host pattern. Commands below are written as bare Atlas command names (`atlas-workflow`, `codex-design-review`, and so on); run them through the current host's entry: `~/.codex/workflow/bin/<command>` on Codex, and `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/bin/<command>` (or the `LOCAL_BIN_ROOT` chosen at install) on Claude Code, whose entry sets the runtime root, so do not call the runtime copy under `workflow/bin` there. A bare `PATH` lookup is acceptable only when `command -v <command>` does not resolve into the other host's directory, because a machine with both hosts can put either first.

Additional local guidance:

- Reuse a relevant `doing` task from `atlas-workflow list`; create/start one only when needed.
- Search MemPalace (when the host provides it) or legacy recall only when the user requests historical memory or prior decisions are material evidence for the current task.
- Keep ordinary features and fixes in the current workspace; use a worktree only for concrete isolation value.
- Keep raw run output outside Git and use a single overwritten rolling checkpoint only for work that crosses compaction or handoff.
- Report the task id, changes, verification, commits, and actionable residual risk.
