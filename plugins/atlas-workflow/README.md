# Atlas Workflow Plugin

This directory is the source for the local `Atlas Workflow` plugin.

## What It Exposes

After the plugin is installed, these entrypoints are available:

- `$atlas-workflow:cw`
- `$atlas-workflow:task`
- `$atlas-workflow:office-hours`
- `$atlas-workflow:brainstorm`
- `$atlas-workflow:analyze`
- `$atlas-workflow:clarify`
- `$atlas-workflow:intake`
- `$atlas-workflow:team`
- `$atlas-workflow:team-v1`
- `$atlas-workflow:learn`
- `$atlas-workflow:design-review`
- `$atlas-workflow:worktree`
- `$atlas-workflow:finish`

Small features and fixes should stay in the current workspace.
Use `$atlas-workflow:worktree` only when the work needs isolation, and default to a separate Docker Compose project for that worktree when the repo uses Compose.
When isolated branch work is complete, use `$atlas-workflow:finish`. By default it waits for user confirmation before merge, PR, discard, or cleanup. Only skip that pause when the user explicitly says to merge straight back to the main branch.

Atlas has separate native and legacy team entrypoints. Use
`$atlas-workflow:team` when the user asks for multiple agents, independent lanes
materially reduce latency, or a distinct specialist/reviewer materially reduces
risk. Multiple files and behavior changes do not by themselves require Team.
Native Team records lifecycle state with `team-record-start`,
`team-record-finalize`, and `team-loop-record`; choose only useful roles and keep
write ownership disjoint.

Legacy entrypoint: use `$atlas-workflow:team-v1` only for compatibility, old
flow debugging, or explicit user acceptance of the CLI-backed team behavior.
Clear, low-risk, verifiable work may use `$atlas-workflow:task` directly even
when it touches several files. Use `$atlas-workflow:intake` only for blocking
intent/scope decisions and `$atlas-workflow:clarify` when a chosen direction
still needs execution boundaries. A short request alone is not a reason to build
a planning or artifact process.

## 输出语言

使用本插件生成或更新项目文档、需求/方案/分析/交接材料、design-review 报告、team 决策、workflow artifacts 和面向用户的总结时，默认使用中文。
命令、文件路径、代码标识符、配置键、API 名称、错误原文和必须保持的模板字段可以保留原文。
如果用户明确要求其他语言，以用户当前要求为准。

## Upstream Design Flow

Use the upstream entries as separate layers, not one merged process:

- `$atlas-workflow:office-hours`: pressure-test product value, target user, timing, and scope before deciding to invest.
- `$atlas-workflow:brainstorm`: explore solution shape, UX, architecture, and tradeoffs after the idea is worth exploring.
- `$atlas-workflow:clarify`: lock a chosen direction into execution boundaries, acceptance criteria, and verification.

They share the same task artifact directory:

- `context.md`: facts, current state, source-of-truth files, assumptions, and risks
- `decision.md`: product/design options, tradeoffs, recommendation, and rejected alternatives
- `spec.md`: goal, non-goals, decision boundaries, acceptance criteria, and verification plan

## Lightweight Implementation Contracts

Use a lightweight contract when ambiguity, risk, cross-session handoff, audit,
or release value justifies the extra artifact. Reuse an existing issue, PRD,
spec, or contract whenever it already supplies the required boundary. Multiple
files alone do not require a new contract or Team round. A contract should stay
small and record only goal, non-goals, acceptance, real validation, and true
return conditions.

## Concise Phase Evidence

Keep Git evidence to the smallest durable conclusion needed for review or
handoff. Raw logs, Playwright output, traces, videos, screenshots, dumps, retry
logs, port status, and intermediate repair output stay outside Git by default.

## Workflow Artifact Categories

Workflow working notes stay under `workflow/artifacts/<task-id>/`. Mirror only a
confirmed summary that future implementers actually need. Do not create
staffing, evidence, checklist, or phase files solely to satisfy a file list.

## Source vs Installed Copy

- `plugins/atlas-workflow/` is the source directory you edit.
- `plugins/cache/` holds the installed local plugin copy that Codex loads in new sessions.

Do not treat `plugins/cache/` as the source of truth.

## Refresh After Changes

Refresh the installed development copy only when the task explicitly includes an
installation-state change. Ordinary source development and hermetic validation
must not mutate cache/runtime state. The explicit refresh command is:

```bash
scripts/update-atlas-workflow-plugin
```

That command syncs the plugin source, workflow helpers, native Codex agents,
and installed runtime cache copies, then verifies source/cache equality.
`codex-refresh-local-plugin atlas-workflow` remains the lower-level cache
primitive used by the update command.

## Layout

- `.codex-plugin/plugin.json`: plugin metadata
- `skills/cw/SKILL.md`: bounded Atlas workflow entry
- `skills/task/SKILL.md`: bounded task entry
- `skills/office-hours/SKILL.md`: upstream product judgment entry
- `skills/brainstorm/SKILL.md`: design exploration entry
- `skills/analyze/SKILL.md`: read-only analysis entry
- `skills/clarify/SKILL.md`: brownfield clarification entry
- `skills/intake/SKILL.md`: grilling-style intake and plan stress-test entry
- `skills/team/SKILL.md`: Codex native subagent team entry
- `skills/team-v1/SKILL.md`: legacy CLI-backed team entry
- `skills/learn/SKILL.md`: reusable lesson entry
- `skills/design-review/SKILL.md`: design fidelity review entry
- `skills/worktree/SKILL.md`: isolated git worktree entry
- `skills/finish/SKILL.md`: isolated branch completion entry
