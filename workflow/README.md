# Workflow Helper

Use `~/.codex/workflow/bin/codex-workflow` for bounded work that is more than a tiny maintenance action.

Do not use workflow for these tiny tasks:

- one standalone commit or commit-message cleanup
- one single-file documentation sync for rules, paths, or command examples
- status checks, information lookups, or result summaries
- one or two wording, comment, or example edits that do not change behavior

If the work changes behavior, fixes a bug, adjusts tests, touches multiple files in a connected way, or needs branch isolation, it is not a tiny task and should use workflow.

## Quick Loop

1. Create a task.
2. List tasks and pick one.
3. Mark it active with `start`.
4. Search MemPalace for related prior decisions, sessions, and legacy lessons.
5. Verify the work with real commands.
6. Create one dedicated commit for the completed feature or fix using `type[optional scope]: <description>`.
7. Finish it with `done`.
8. Review it with `show`.
9. After the task is done, rely on MemPalace hooks/mining for memory; use `learn` only for legacy manual archival.
10. Use `doctor`, `smoke`, `verify`, and `team-*` when the task needs environment checks, executable validation, or discussion rounds.

## Commands

Create a new task:

```bash
~/.codex/workflow/bin/codex-workflow init-task "Short title" "What done looks like"
```

List tasks:

```bash
~/.codex/workflow/bin/codex-workflow list
```

Start a task:

```bash
~/.codex/workflow/bin/codex-workflow start <task-id>
```

Finish a task:

```bash
~/.codex/workflow/bin/codex-workflow done <task-id>
```

Show a task:

```bash
~/.codex/workflow/bin/codex-workflow show <task-id>
```

Legacy Atlas recall:

```bash
~/.codex/workflow/bin/codex-workflow recall "Short topic"
```

Check local Codex environment health:

```bash
~/.codex/workflow/bin/codex-workflow doctor
```

Run a real Codex smoke in the active task workspace:

```bash
~/.codex/workflow/bin/codex-workflow smoke
```

Record a verification command inside the task artifact directory:

```bash
~/.codex/workflow/bin/codex-workflow verify <task-id> -- <command...>
```

Install Codex Bash hooks for workflow evidence capture:

```bash
~/.codex/workflow/bin/codex-workflow install-hooks
```

Start a team discussion or execution round:

```bash
~/.codex/workflow/bin/codex-workflow team-start <task-id> "<objective>" [--mode discuss|execute] [--agents N] [--claude-review]
~/.codex/workflow/bin/codex-workflow team-status <task-id>
~/.codex/workflow/bin/codex-workflow team-promote <task-id> --to execute|worktree|finish
~/.codex/workflow/bin/codex-workflow team-stop <task-id>
```

Save a durable learning:

```bash
~/.codex/workflow/bin/codex-workflow learn <task-id> "Lesson title" "What to remember"
```

Scaffold a design-fidelity review task plus contract/report/verdict artifacts:

```bash
~/.codex/workflow/bin/codex-design-review init "<title>" "<page url or route>" "<design source>"
```

Lightweight implementation contracts:

- Use `workflow/templates/implementation-contract.md` before non-tiny local
  implementation work when the task changes user-visible behavior, touches
  multiple files, changes UI/API/CLI/background-job behavior, or has meaningful
  edge cases.
- Tiny precise fixes may skip the contract when the acceptance path is obvious.
- The contract records goal, non-goals, acceptance criteria, real validation
  steps, evidence paths, and stop conditions. It is the Atlas workflow
  lightweight counterpart to the full Multica sprint contract.

Refresh the installed local plugin copy after changing a plugin source directory:

```bash
~/.codex/workflow/bin/codex-refresh-local-plugin atlas-workflow
```

## Notes

- Tasks live in `workflow/tasks/` as markdown files.
- Task artifacts live in `workflow/artifacts/<task-id>/`.
- Active task pointer lives in `workflow/state/current-task.json`.
- Design-review artifacts live in `workflow/design-reviews/` by default.
- Local plugin source lives under `plugins/`; installed runtime copies live under `plugins/cache/`.
- Legacy Atlas learnings are stored in `~/Documents/note/codex-memory/learnings/` by default.
- MemPalace is the default long-term memory and semantic recall layer; Atlas recall/learn commands remain for compatibility.
- Use `docs/durable-learning-reuse-playbook.md` as the default extracted checklist layer for environment verification, source-of-truth cleanup, real-path acceptance, and deploy wiring checks.
- The helper also accepts `CODEX_WORKFLOW_ROOT`, `CODEX_WORKFLOW_TEMPLATE_DIR`, and `CODEX_LEARNINGS_DIR` when you need to point it at a temp or alternate location.
