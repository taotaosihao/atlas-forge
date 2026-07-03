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

Atlas defaults to native Codex subagent collaboration for non-tiny bounded work.
Use `$atlas-workflow:team` before execution when a task changes behavior,
touches multiple files, has meaningful implementation choices, needs
evaluator/reviewer judgment, or should produce a lightweight implementation
contract. `$atlas-workflow:team` requires native subagent tools and records
native rounds with `team-record-start`, `team-record-finalize`, and
`team-loop-record`; it must not silently fall back to the legacy CLI-backed
lanes. Native team uses a Multica-style dynamic Agent Plan: choose active roles
by task shape, list omitted roles, define phase gates, write boundaries,
verification evidence, and concurrency strategy; three roles are only a common
small-round seed, not a limit. Use `$atlas-workflow:team-v1` only for
compatibility, old flow debugging, or when native subagent tools are unavailable
and the user explicitly accepts the legacy `codex-workflow team-start/team-loop`
behavior. Tiny precise fixes may still use direct `$atlas-workflow:task` flow
when scope and verification are obvious, and explicit user requests to avoid
multi-agent should be honored when safe.

## Short Request Intake Gate

One-line or low-information requests are not enough to start coding by default.
First run a short intake check when the request has multiple plausible meanings,
lacks an acceptance path, or omits important user, data, permission, deployment,
or workflow boundaries. Give critical feedback before implementation: name the
main ambiguity, risk, simpler alternative, or stop condition.

Direct execution is allowed only for a tiny escape hatch: the affected surface,
expected behavior, validation path, and risk are all clear; the change does not
touch data, permissions, deployment, migration, product strategy, or architecture
boundaries; and the scope is normally a single file or similarly small. If the
tiny classification is uncertain, ask one short question before coding.

Non-tiny work must have auditable documentation before code changes. Existing
external issues, PRDs, or design docs may count as equivalent evidence, but the
current workflow artifact must cite them and fill any missing acceptance,
verification, risk, and stop-condition gaps. At minimum, use `context.md` and
`spec.md`; for execution-ready changes, also use a project doc or lightweight
implementation contract.

This gate applies to implementation-adjacent Atlas entries, including
`$atlas-workflow:task`, `$atlas-workflow:cw`, and `$atlas-workflow:worktree`.
`$atlas-workflow:intake` asks the blocking boundary questions, and
`$atlas-workflow:clarify` turns the chosen direction into documented execution
boundaries.

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

For non-tiny local implementation work, Atlas workflow uses a lightweight
contract before coding as the implementation artifact that captures the selected
scope, acceptance rows, evidence paths, and stop conditions. For non-tiny work
this contract is normally formed from or checked by `$atlas-workflow:team`;
direct `$atlas-workflow:task` may use it without team only for tiny work or an
explicit safe bypass. Use `workflow/templates/implementation-contract.md` when
the task changes user-visible behavior, touches multiple files, changes
UI/API/CLI/background-job behavior, or has meaningful edge cases. Tiny precise
fixes can skip it when the acceptance path is obvious.

This contract records goal, non-goals, acceptance criteria, real validation
steps, evidence paths, and stop conditions. Multica uses the fuller sprint
contract flow for multi-agent PRD implementation.

## Source vs Installed Copy

- `plugins/atlas-workflow/` is the source directory you edit.
- `plugins/cache/` holds the installed local plugin copy that Codex loads in new sessions.

Do not treat `plugins/cache/` as the source of truth.

## Refresh After Changes

If you change this plugin source, rebuild the installed local copy before starting a new session:

```bash
~/.codex/workflow/bin/codex-refresh-local-plugin atlas-workflow
```

## Layout

- `.codex-plugin/plugin.json`: plugin metadata
- `skills/cw/SKILL.md`: bounded Atlas workflow entry
- `skills/task/SKILL.md`: bounded task entry
- `skills/office-hours/SKILL.md`: upstream product judgment entry
- `skills/brainstorm/SKILL.md`: design exploration entry
- `skills/analyze/SKILL.md`: read-only analysis entry
- `skills/clarify/SKILL.md`: brownfield clarification entry
- `skills/team/SKILL.md`: Codex native subagent team entry
- `skills/team-v1/SKILL.md`: legacy CLI-backed team entry
- `skills/learn/SKILL.md`: reusable lesson entry
- `skills/design-review/SKILL.md`: design fidelity review entry
- `skills/worktree/SKILL.md`: isolated git worktree entry
- `skills/finish/SKILL.md`: isolated branch completion entry
