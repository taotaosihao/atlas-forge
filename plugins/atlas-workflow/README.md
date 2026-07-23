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

Atlas has separate default and compatibility team entrypoints. Decide whether
Team is needed from the user's current request, including the requested
collaboration style, latency needs, and risk. Use `$atlas-workflow:team` when
the user asks for multiple agents or when independent lanes or a distinct
specialist/reviewer materially serve those needs; otherwise stay with the main
Codex. Multiple files, behavior changes, and task complexity do not by
themselves require Team.

Inside `$atlas-workflow:team`, Codex native collaboration is the default.
Paseo is an explicit, local opt-in for a whole Team, one lane, or one dispatch;
a review choice does not implicitly select Paseo for implementation. Backend
and fallback policy resolve independently at dispatch, lane, Team, then default
scope. Paseo operational failures default to a Codex attempt in the same
logical lane unless the caller explicitly selected `no-fallback`. The fallback
keeps the original goal, paths, authority, evidence, and provider-perspective
disclosure.

Exact native role/model routing requires the MultiAgentV2 spawn schema. This is
a host capability, not a plugin installation side effect. On Codex 0.145 and
newer, the user-authorized host configuration is:

```toml
[features.multi_agent_v2]
enabled = true
hide_spawn_agent_metadata = false
expose_spawn_agent_model_overrides = true
tool_namespace = "agents"
```

Codex 0.144.x does not expose the
`expose_spawn_agent_model_overrides` setting; omit that line on those hosts.
After changing host configuration, restart the app server and start a new task:
existing tasks do not hot-reload their model-visible tool schema. If the new
task still lacks `agent_type`, `model`, `reasoning_effort`, or `fork_turns`,
Team fails closed to main-only instead of spawning an inherited or generic
child. Host configuration and restart require explicit user authority.

Native Team model routing has two modes. Quality mode is the default and
explicitly routes every admitted Atlas role to Sol with the role's configured
reasoning effort. Saving mode is a non-persistent, per-Team or per-lane choice
that activates only when the user explicitly requests it; it routes
implementation, browser verification, and exploration to Luna, routine review
and verification to Terra, and retains Sol for planning and phase judgment.
Both modes use explicit spawn fields and `fork_turns="none"`; neither relies on
a global default subagent model.

When Paseo is explicitly selected, Atlas discovers provider, model, and callable
mode capability at runtime and never reads Paseo orchestration preferences.
Provider mode IDs are not portable and must not be hardcoded or copied across
providers. Generic routing may recommend only models whose trusted capability
identity is explicitly non-Claude. Any direct or gateway Claude-family model
requires an exact provider/model manually supplied by the user or operator;
Atlas never chooses, completes, upgrades, or substitutes a Claude model.
Unknown model family fails closed as `MODEL_FAMILY_UNVERIFIED`.
Attempts reference a controller-observed capability snapshot rather than
accepting caller-authored family or digest claims. Paseo quiescence likewise
requires a receipt correlated to the exact attempt, launch, and actor before a
writer lease can be released.

Substantive Team review uses complementary perspectives rather than a fixed
role or agent count. Reviewers form independent first-round positions and
remain available for focused follow-up; the main Codex synthesizes and
adjudicates disagreements. Two or three rounds is a convergence target, not a
limit. Persistent material disagreement becomes a concise human decision
packet. For implementation, Atlas may run multiple agents in parallel when
their owned paths are disjoint and an integration owner is explicit; tightly
coupled changes retain one writable owner. A failed Paseo writer must be
quiesced and its diff/worktree evidence preserved before a native writer can
receive a takeover permit.

Durable Team v2 records distinguish configured, resolved, attempted, admitted,
and effective backend. Final decisions use `backend: native|paseo|mixed|none`
matching admitted results and store stable provenance in
`team/backend-v2.json`; strict lint re-derives that sidecar from the task v2
state and checks the current decision, round, and staffing markers. `none`
means no result was admitted and is never a selectable runtime backend; a
record-only compatibility finalization does not invent attempts, admissions,
or consensus. Legacy artifacts retain their historical native/Paseo markers.

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
return conditions. When authority-backed facts make a claim conditional, keep
the goal neutral, place the condition once in the existing contract structure,
and replace stale wording instead of appending exception sections or mirrored
requirements.

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
- `skills/team/SKILL.md`: Codex-native Team entry with explicit local Paseo selection and operational Codex fallback
- `skills/team/references/code-review.md`: optional deliberative code-review perspectives, evidence checks, and synthesis guidance
- `skills/team-v1/SKILL.md`: legacy CLI-backed team entry
- `skills/learn/SKILL.md`: reusable lesson entry
- `skills/design-review/SKILL.md`: design fidelity review entry
- `skills/worktree/SKILL.md`: isolated git worktree entry
- `skills/finish/SKILL.md`: isolated branch completion entry
