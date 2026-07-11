---
name: team
description: Use the Atlas team flow with Codex native subagents for discussion, execution, review, and focused repair.
---

Use `$atlas-workflow:team` only when the user asks for multiple agents, independent lanes materially reduce latency, or a distinct specialist/reviewer materially reduces risk. Multiple files, behavior changes, or the existence of an implementation contract do not require Team by themselves.

## Language

Write workflow artifacts, project documents, and user-facing summaries in Chinese by default. Preserve commands, paths, identifiers, APIs, proper nouns, and quoted errors when accuracy benefits.

## Native Tool Gate

This skill is native-only. Use the collaboration tools directly:

- `collaboration.spawn_agent` for concrete bounded lanes that can run independently.
- `collaboration.send_message` for information that does not need a new turn.
- `collaboration.followup_task` to reuse an idle agent for a new bounded task.
- `collaboration.wait_agent` only while live work remains.
- `collaboration.list_agents` to inspect current capacity and status.
- `collaboration.interrupt_agent` only to stop work that is still running and should no longer continue.

If native collaboration tools are unavailable, ask for an explicit alternate workflow. Do not silently fall back to legacy CLI lanes.

## Latest Model Policy Gate

Before spawning a native lane that may select an Atlas SDD custom agent, run:

```bash
workflow/bin/atlas-agent-model-policy check
```

- This gate is mandatory before the first such spawn in a native round; record only its conclusion when an artifact already exists.
- The policy resolves the numerically highest stable GPT `major.minor` family from the local Codex model catalog and does not assume that model versions are consecutive.
- Agent roles use semantic capability and thinking profiles: planner=`frontier/high`, reviewer=`frontier/max`, implementer=`fast/max`, verifier=`balanced/high`, browser-verifier=`fast/high`, and explorer=`fast/medium`.
- Route implementation coding to the implementer. Route plans and final acceptance reviews to Sol-backed planner/reviewer roles. Use the Terra-backed verifier for routine commands and evidence checks.
- Add the Luna browser-verifier only for substantial Playwright or visual interaction work. Its result is supporting evidence; every such path must finish with a fresh Sol reviewer pass before acceptance.
- If the catalog or checked-in projection is missing, ambiguous, or incompatible, stop before spawning rather than silently selecting an older model or weaker reasoning level.

## Modes And Authority

### Discuss

- Use discuss for read-only options, architecture, diagnosis, risk review, or a second opinion.
- Discuss does not authorize implementation, commits, deployment, release, or other mutation.
- Keep discuss lanes read-only unless the user explicitly assigns a writable deliverable.

### Execute

- Use execute only after an explicit user implementation request. Do not infer it from a plan, review, decision file, roadmap, or prior discuss round.
- Record native execute start or promotion with the explicit message reference:

```bash
codex-workflow team-record-start <task-id> "<objective>" --backend native --mode execute --agents <N> --roles "<roles>" --authorization-ref <user-message-ref>
codex-workflow team-promote <task-id> --to execute --authorization-ref <user-message-ref>
```

- `authorization_ref` is an audit guard against accidental promotion, not a host capability. Never fabricate it from workflow artifacts.
- Discuss starts and non-execute promotions do not require the reference.

## Minimal Agent Planning

1. Start with the main Codex. Spawn only a concrete bounded lane whose result materially changes latency or risk.
2. Choose roles from the actual task; there is no default role set or required agent count.
3. Use one writable owner for tightly coupled changes. Multiple writable agents require disjoint path/module ownership and an explicit integration owner.
4. Reviewers and verifiers stay read-only unless a focused repair is assigned.
5. Do not create staffing artifacts or omitted-role inventories solely to prove that planning occurred. Record ownership only when handoff, concurrent writes, audit, or risk makes it useful.
6. Agent completion is evidence, not automatic acceptance; the main Codex integrates and verifies the result.

## Goal And Roadmap Continuity

- The current user request and existing authoritative spec define the goal. Do not create a second roadmap/scope state machine.
- Treat "complete implementation" as authorization to cross all internal slices only when the current authorized goal already is the named roadmap or all listed phases. Continue that roadmap without routine confirmation while the goal, authority, and safety boundaries stay unchanged. Persistence wording alone does not expand a narrower goal.
- A roadmap document alone does not authorize implementation. Internal slices are scheduling/checkpoint units, not new permission boundaries.
- Return when the whole authorized goal is complete, continuing needs new authority or a user-owned decision, an external state must change, or safe work can no longer make material progress.
- Elapsed time, rounds, agents, commits, tokens, and tool calls are telemetry, not default semantic stop conditions.

## Review And Focused Repair

- Reviewer discovery is unrestricted. Report real findings at their natural severity.
- Automatically repair only findings that block the current goal, regressions introduced by the current diff, or safety/data/permission problems that make the current delivery unsafe.
- Architecture improvements, adjacent cleanup, historical defects, additional product requirements, and roadmap-external work are follow-ups unless continuing the current delivery would be unsafe.
- After a repair, review the repair diff and relevant integration surface normally; do not ban new regressions, and do not reopen unrelated repository-wide discovery by default.
- Continue repair only while a verifiable implementation or evidence change materially advances the current goal. If progress stalls, record `fix_progress_stalled` and return the concrete blocker instead of generating more lanes or artifacts.
- Run a branch/integration review when parallel writes, cross-module coupling, migration, security, release, or comparable risk justifies it; it is not an unconditional final ritual.

## Commits And Context

- Prefer automatic local commits at moderate logical outcomes that are independently understandable, verified, and reversible.
- Keep one primary reason per commit and include its tests/necessary docs. Do not commit every step, slice, or repair round, and do not accumulate an entire roadmap into one oversized diff.
- Stage only current-task paths or hunks. A commit does not authorize push, PR, deployment, release, cache refresh, or other external mutation.
- For work crossing compaction or handoff, keep one non-Git rolling checkpoint: current goal, completed work, next critical path, diff/verification state, and real blockers/follow-ups. Overwrite it rather than appending a history diary.

## Optional Protocols

Load optional protocol references only when the current contract actually requires them:

- Read `references/sdd.md` for Codex-native SDD JSON contracts, slice ledger, implementer/reviewer reports, or `codex-team-*` helpers.
- Read `references/business-acceptance.md` for business scenario, stakeholder, protocol/device, or dual-goal UI acceptance.
- First-code and Product/UI gates belong to the selected implementation contract and the clarify/task skills; do not duplicate their full rules here.

## Lifecycle Recording

- Use `team-record-start` and `team-record-finalize` only when durable native Team state has handoff or audit value.
- Use `team-loop-record` to record a loop conclusion when an explicit iterative task needs durable telemetry; do not make numeric limits the default goal definition.
- Use `workflow/artifacts/<task-id>/team/decision.md` as the durable decision only when a substantive Team round occurred.
- Keep raw logs and intermediate agent output outside Git. Persist the smallest conclusion required for verification or handoff.

In the final reply, report the task id, actual agents used, integrated outcome, verification, commits, and actionable residual risk.
