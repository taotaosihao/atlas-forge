---
name: multica-dynamic-workflow
description: Use template-driven Multica SDLC workflow routing with join gates, repair/blocker owners, clean-gate handoff, and hook integration guidance. Use when defining, auditing, or running Multica next-role routing without hardcoding a fixed coder-reviewer-e2e-leader flow.
---

# Multica Dynamic Workflow

Use this skill when a Multica task needs reusable SDLC orchestration driven by a
workflow template instead of a fixed role chain.

## Core Rule

The router and hooks only interpret facts and template fields. They do not make
LLM business judgments about PRD quality, code correctness, or whether evidence
is truly sufficient. The leader owns template generation or updates, phase/join
gate decisions, final closure, PR-ready gates, and blocker reports. Specialist
agents own their assigned output schema and evidence.

## Template Contract

Templates must define these fields for each phase:

- `phase`
- `artifact_type`
- `required_roles`
- `optional_roles`
- `join_policy`
- `repair_owner`
- `blocker_owner`
- `clean_gate_owner`
- `next_phase`
- `done_criteria`
- `timeout_action`

Supported join semantics:

- `all_required`: every required role must produce a passing result for the
  same phase/commit before the join completes.
- `any_blocker`: any `BLOCKER` result routes to the blocker owner immediately.
- Optional roles do not block completion when missing, but available
  `FAIL`/`BLOCKER` results still block or repair-route according to the
  template.
- Timeout handling is template-defined through `timeout_action`.
- Commit SHA and phase are part of routing and idempotency; commit mismatches
  should not be treated as clean joins.

## Routing Expectations

Do not route every event to the leader. Route to the leader only when:

- a phase/join has completed and the template says a clean gate or next-phase
  decision belongs to the leader;
- the event is a `BLOCKER`, the repair owner is absent, or the owner is
  unknowable from facts;
- the template explicitly names `leader` for the next action;
- final closure, PR-ready gate, or blocked report is required.

Common implementation-mode defaults are encoded in
`templates/multica-sdlc-workflow.yaml` as a reusable example:

- implementation/coder completion with commit evidence routes to validation
  roles such as review, E2E, and QA.
- review clean while E2E is missing waits.
- E2E pass while review is missing waits.
- review/E2E fail routes to the repair owner.
- blocker routes to the blocker owner.
- all required validation roles passing routes to leader clean-gate.
- repair completion routes back to validation roles.

## Router Script

Run a dry route:

```bash
plugins/multica-sdlc/scripts/multica-next-role-router \
  --template plugins/multica-sdlc/templates/multica-sdlc-workflow.yaml \
  --event plugins/multica-sdlc/examples/router-events/coder-done.json
```

The script outputs JSON with:

- `action`: `dispatch`, `wait`, `duplicate`, or `error`
- `next_phase`
- `next_roles`
- `leader_required`
- `reason_code`
- `facts`
- `dedupe_key`
- `dedupe_fields`

Idempotency uses:

```text
issue id + phase + commit SHA + source comment/run id + next roles hash
```

Hooks can pass `--dedupe-store <path> --record-dedupe` to persist dispatch keys
and avoid repeated loops.

## Hook Integration Boundary

Claude usually supports `Stop` and `SessionEnd` hooks from
`~/.claude/settings.json`, so Claude-side Multica tasks can call the router
after a specialist finishes.

Codex integration is different. Multica Codex tasks use per-task `CODEX_HOME`;
current Multica runtime setup may copy only `config.json`, `config.toml`, and
`instructions.md` into that per-task home. Do not assume global
`~/.codex/hooks.json` is present inside a Multica Codex task. For Codex, use
one of these explicit integration paths:

- inject a per-task hook config into the task `CODEX_HOME`;
- wrap Codex task launch with a supervisor that calls the router after each
  agent run;
- install this plugin inside the per-task Codex environment and call
  `scripts/multica-next-role-router` from Multica runtime orchestration.

This plugin documents the hook boundary and ships router assets, but it does
not modify Multica product runtime code.
