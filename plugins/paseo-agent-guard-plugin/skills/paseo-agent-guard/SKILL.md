---
name: paseo-agent-guard
description: Use when creating or continuing Paseo orchestrator workflows, PRD delivery, blocker fixes, validation, audit, PR handoff, or any Paseo child-agent work that must be constrained by researchWorkspace and targetWorkspace contracts.
---

# Paseo Agent Guard

Use this skill whenever a task creates, continues, or reconciles Paseo agents for a project-room workflow.

## Required Inputs

Before creating or continuing agents, establish these values explicitly:

- `room`: Paseo room used as the coordination log.
- `researchWorkspace`: repository or folder where planning, research, PRD synthesis, and orchestration context live.
- `targetWorkspace`: actual project repository where implementation, fixes, validation, audit, and PR work must happen.
- `objective`: durable project-room goal.

If any value is missing and cannot be discovered from an existing guard config, ask the user before launching agents.

## Durable Objective

Use the plugin CLI instead of relying on a single conversation turn:

```bash
node scripts/paseo-guard.mjs init --config <config>
node scripts/paseo-guard.mjs status --config <config>
node scripts/paseo-guard.mjs reconcile --config <config> --dry-run
node scripts/paseo-guard-watch.mjs --config <config>
```

The objective is bound to `projectName + room` and stored under:

```text
~/.paseo-agent-guard/objectives/<project-name>/<room>.json
```

`pause`, `resume`, and `clear` change only the objective state. They do not archive agents, restart Paseo, delete branches, or modify project files.

## Workspace Contract

Planner and orchestrator agents may run in `researchWorkspace`.

Child agents with roles `implementation`, `fix`, `validation`, `audit`, or `pr` must run in `targetWorkspace` or a linked worktree for the target repo. Do not create implementation agents in the research workspace.

Every child agent must include these labels:

- `room`
- `parent`
- `phase`
- `task`
- `role`

After creating a child agent, immediately run:

```bash
paseo inspect <agent-id> --json
```

Verify that `cwd` is the target workspace or target worktree before treating the agent as valid.

## Room Evidence

Every child agent must report to the room using this evidence shape:

```text
SIGNAL agent=<id> cwd=<path> branch=<branch> task=<task-id> labels={room=<room>,parent=<parent-id>,phase=<phase>,task=<task-id>,role=<role>} evidence=<summary>
```

Valid signal families:

- Safe continuation: `PLAN_READY`, `DONE`, `FIXED`, `PASS`.
- Recoverable blocker: `BLOCKED`, `NEEDS_FIX` when configured as recoverable.
- Human gate: `NEEDS_USER_DECISION`, `ERROR`.
- Terminal review gate: `PR_CREATED`, `MERGED`.

If the child agent omits required labels, omits evidence fields, or runs in the wrong workspace, treat it as:

```text
block / delegation_contract_violation
```

## Continuation Rules

When reconciling, continue only if all are true:

- Durable objective status is `active`.
- Orchestrator is idle.
- No child agent is running.
- Latest unhandled signal is safe or configured recoverable.
- Cooldown has passed.
- The next action is not protected, unless `policy.handoffMode` explicitly allows that protected action.

Default mode remains conservative: `PR_CREATED` stops for human review, `MERGED` completes the objective, and merge or new-phase actions are protected unless the user explicitly approves them.

When `policy.handoffMode` is true, the config itself grants approval for this PR handoff flow:

- On `PR_CREATED`, continue the orchestrator through PR review/fix/re-review cycles until all available reviewers report no findings, then merge.
- On `MERGED`, keep the objective active and continue into the next approved project phase from room/project evidence.
- Allow only `merge` and `new project phase` protected-action mentions. Branch deletion, agent deletion/archive, and daemon restart remain protected.

The guard never directly runs git or GitHub merge commands in handoff mode. It sends policy-bound continuation prompts; the orchestrator performs merge and next-phase work through the existing Paseo flow.

Use background or no-wait mode for child-agent work. Post room evidence instead of waiting synchronously.

## Multi-Agent Review Policy

PRD, plan, feature, and PR gates require multi-agent review before they are treated as ready.

Default reviewers are:

- `claude`
- `codex`
- `gemini`
- `mimo`

For every required review gate, try all configured reviewers. If any reviewer or provider is unavailable, record the skipped reviewer in room evidence and continue with the available reviewers.

PRD order is strict:

1. Draft or update the PRD.
2. Run multi-agent review.
3. Fix review findings.
4. Stop for human review.

Do not send PRD work to human review before multi-agent findings are resolved.

Plan, feature, and PR gates default to 3 review rounds. If the user explicitly asks to review until there are no issues, keep running review/fix/re-review cycles until all available reviewers report no findings.

## Human Review Artifacts

Use Markdown when the review artifact is pure text.

Use HTML when the review artifact includes interaction, graphics, complex tables, or complex structure relationships.

For PRD requirements with complex relationships or processes, create an HTML review artifact with diagrams.

For frontend interface requirements, require E2E tester screenshots or recordings and attach the evidence to the HTML review artifact.
