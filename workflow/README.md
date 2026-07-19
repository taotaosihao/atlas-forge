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

Start a legacy CLI-backed team discussion or execution round:

```bash
~/.codex/workflow/bin/codex-workflow team-start <task-id> "<objective>" [--mode discuss|execute] [--agents N] [--claude-review]
~/.codex/workflow/bin/codex-workflow team-status <task-id>
~/.codex/workflow/bin/codex-workflow team-promote <task-id> --to execute|worktree|finish
~/.codex/workflow/bin/codex-workflow team-stop <task-id>
```

Record a Codex native subagent team round. Native subagents are spawned by
Codex, while `codex-workflow` records auditable task state and artifacts:

```bash
~/.codex/workflow/bin/codex-workflow team-record-start <task-id> "<objective>" --backend native --mode discuss|execute --agents N --roles "<roles>"
~/.codex/workflow/bin/codex-workflow team-record-finalize <task-id> --backend native --status complete|failed|interrupted --round <file> --decision <file> --staffing <file>
~/.codex/workflow/bin/codex-workflow team-loop-record <task-id> --backend native --status loop-done|loop-incomplete|loop-failed|loop-timeout --loop <file> --iterations N [--max-iterations N] [--max-time <duration>]
```

Native round, decision, staffing, and loop files must live under the current
task's `team/` artifact directory, include `backend: native` metadata, and
contain substantive content beyond template headings.

Run a legacy Atlas-managed bounded team implementation loop when the old
CLI-backed team should keep fixing until the objective and verification command
pass:

```bash
~/.codex/workflow/bin/codex-workflow team-loop <task-id> "<objective>" [--agents N] [--max-iterations N] [--max-time <duration>] [--verify-check "<command>"]... [--verify "<prompt>"] [--archive]
```

`team-loop` runs inside Atlas workflow: each iteration launches
`team-start --mode execute`, records a `team/loop-*.md` ledger, runs optional
`--verify-check` commands, and asks a verifier to put `done=true` or
`done=false` on the first non-empty message line. Each team/check/verifier
substep runs under the remaining `--max-time` deadline; timed-out substeps stop
the loop with `loop-timeout`. Keep loops bounded with `--max-iterations` and
`--max-time`.

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

Web UI acceptance uses the dependency-free `codex-web-acceptance` thin layer:

```bash
workflow/bin/codex-web-acceptance audit --project <root> --playwright-config <file> --format json
workflow/bin/codex-web-acceptance run --project-config <config.json> --contract <contract> --artifact-root <run-root> --format json
workflow/bin/codex-web-acceptance check-run --run-root <run-directory> --format json
workflow/bin/codex-web-acceptance review --baf-root <team/acceptance> --card <review-card.json> [--contract <contract> --check-owner-decision] --format json
```

Project adapters and independent claim validators exchange one JSON envelope on
stdin/stdout and are always launched as argv arrays without a shell. Runtime
contracts and TypeScript declarations live under
`workflow/bin/lib/codex-web-acceptance/contracts/`. `run` and `check-run`
produce only a technical result; BAF v2 remains the machine-fact authority and
`business-verdict.json` remains the sole final verdict. The concise Chinese
handoff template is `workflow/templates/web-scenario-review-card.md`; missing
facts must stay explicit and only BAF `integration_mode: real` may be described
as a real run.

Refresh Atlas workflow after changing plugin source, workflow helper source, or
native Codex agent source from the Atlas Forge checkout:

```bash
scripts/update-atlas-workflow-plugin
```

Refresh only the installed local plugin copy when you are intentionally using
the low-level cache primitive:

```bash
~/.codex/workflow/bin/codex-refresh-local-plugin atlas-workflow
```

## Notes

- Tasks live in `workflow/tasks/` as markdown files.
- Task artifacts live in `workflow/artifacts/<task-id>/`.
- Active task pointer lives in `workflow/state/current-task.json`.
- Design-review artifacts live in `workflow/design-reviews/` by default.
- Local Atlas plugin source lives under `$CODEX_HOME_ROOT/plugins/atlas-workflow`;
  the installed development copy lives under
  `$CODEX_HOME_ROOT/plugins/cache/local-atlas/atlas-workflow/local`.
- Legacy Atlas learnings are stored in `~/Documents/note/codex-memory/learnings/` by default.
- MemPalace is the default long-term memory and semantic recall layer; Atlas recall/learn commands remain for compatibility.
- The helper also accepts `CODEX_WORKFLOW_ROOT`, `CODEX_WORKFLOW_TEMPLATE_DIR`, and `CODEX_LEARNINGS_DIR` when you need to point it at a temp or alternate location.
