---
name: team
description: Use the Atlas team flow with Paseo-managed multi-provider agents, with Codex native collaboration only as an explicit fallback.
---

Decide whether Team is needed from the user's current request, including the requested collaboration style, latency needs, and risk. Use `$atlas-workflow:team` when the user asks for multiple agents or when independent lanes or a distinct specialist/reviewer materially serve those needs; otherwise stay with the main Codex. Multiple files, behavior changes, task complexity, or the existence of an implementation contract do not require Team by themselves.

## Language

Write workflow artifacts, project documents, and user-facing summaries in Chinese by default. Preserve commands, paths, identifiers, APIs, proper nouns, and quoted errors when accuracy benefits.

## Default Management Layer

Atlas Team defaults to Paseo as the agent management layer. Do not reuse, invoke, or mirror the Paseo skill workflow. Atlas owns the management rules here and uses Paseo only as a runtime/control plane.

- Discover providers at runtime with `paseo provider ls --json`.
- Discover models for a concrete provider with `paseo provider models <provider> --json`.
- Do not hardcode provider or model availability from repo assumptions.
- Never read or apply Paseo orchestration preferences. Atlas owns provider/model routing; Paseo only manages agent lifecycle.
- An explicit user provider/model request wins. Otherwise, select the latest available stable model from the provider's live model catalog for every lane.
- Record Paseo rounds with `codex-workflow team-record-start ... --backend paseo --providers "<single-line providers>"`.
- The `--providers` field is required for `--backend paseo`, must stay on one line, and should summarize the actual provider/model routing selected for the round.

### Provider Selection Contract

- `codex`: prefer the discovered `codex` provider for Codex CLI; otherwise report that the requested route is unavailable.
- `claude`: prefer the discovered `claude` provider for Claude Code; use another provider only when the user asked for that gateway/model route.
- `deepseek`: prefer the discovered `deepseek` provider for DeepSeek CLI; use another provider only when the user asked for that gateway/model route.
- `glm`: select the first discovered provider whose model list contains the required GLM model family. Do not assume a `glm` provider exists.
- `kimi code cli`: use the `kimi` provider explicitly and discover its available models with `paseo provider models kimi --json`.

Prefer a single concise provider summary line such as `planner=claude/<model-id>; implementer=deepseek/<model-id>; reviewer=<provider>/<glm-model-id>; verifier=kimi/<model-id>`.

### Latest Model Contract

1. If the user specifies a model, use that exact discovered model when available; do not replace it with an Atlas default.
2. Otherwise, query `paseo provider models <provider> --json` immediately before starting the lane. Prefer the catalog entry explicitly marked as latest or current.
3. If the catalog has no latest/current marker, use its first stable, non-preview model. Treat the live catalog order as authoritative instead of comparing hardcoded version strings.
4. Do not select an older, free, preview, compatibility, or fallback model merely because it is cheaper. Use one only when the user requests it or the latest stable model is unavailable, and disclose the fallback.
5. Resolve the model separately for every selected provider. Never copy one provider's model, thinking option, or mode onto another provider.

### Minimal Paseo Control Plane

- Start one bounded lane with `paseo run --detach --json --provider <provider> [--model <model-id>] --cwd <repo> "<prompt>"`. Capture the returned agent and workspace identifiers; reuse the workspace for related lanes instead of creating unrelated workspaces.
- Send focused follow-up work with `paseo send <agent-id> --no-wait --json "<prompt>"`.
- Wait for real completion with `paseo wait <agent-id> --json`; do not busy-poll `paseo ls` or `paseo inspect`.
- Stop a lane that is out of scope, stalled, or no longer useful with `paseo stop <agent-id> --json`. Do not restart the Paseo daemon, delete agents, archive worktrees, or mutate provider configuration without separate authority.
- Provider models, thinking options, and modes are provider-specific. Omit `--mode` and `--thinking` unless their exact IDs have been discovered for that provider; never copy Codex settings onto Claude, DeepSeek, GLM, or Kimi.
- Prompts must carry the repository instructions, owned paths, forbidden paths, authority mode, expected evidence, and stop condition. Paseo manages lifecycle; it does not expand the lane's permissions.

## Explicit Native Fallback

Codex native collaboration is fallback-only. Use it only when the user explicitly asks for native collaboration or when Paseo cannot satisfy the required provider/runtime path and the fallback remains within current authority.

- `collaboration.spawn_agent` for concrete bounded lanes that can run independently.
- `collaboration.send_message` for information that does not need a new turn.
- `collaboration.followup_task` to reuse an idle agent for a new bounded task.
- `collaboration.wait_agent` only while live work remains.
- `collaboration.list_agents` to inspect current capacity and status.
- `collaboration.interrupt_agent` only to stop work that is still running and should no longer continue.

If native fallback is used, record it with `--backend native`. Do not silently fall back to legacy CLI lanes, and do not treat native fallback as the default.

## Native Fallback Model Preferences And Calibration

Before the first native fallback lane that may select an Atlas SDD custom agent, prefer running:

```bash
workflow/bin/atlas-agent-model-policy check
```

- This check validates the checked-in preference projection; it does not prove the runtime model selected for a spawn.
- The policy resolves the numerically highest stable GPT `major.minor` family from the local Codex model catalog and does not assume that model versions are consecutive.
- Agent roles use semantic capability and thinking profiles: planner=`frontier/medium`, routine-reviewer=`balanced/high`, phase-reviewer=`frontier/medium`, implementer=`fast/max`, verifier=`balanced/high`, browser-verifier=`fast/high`, and explorer=`fast/medium`.
- A small clear task defaults to the main Codex. Use a subagent only when concrete evidence shows that delegation or specialist review materially lowers risk or latency.
- When an implementation lane is useful, prefer GPT-5.6 Luna max. For routine review or command verification, prefer Terra. Add GPT-5.6 Sol medium planner only for planning whose direction is costly or hard to reverse.
- Consider GPT-5.6 Sol medium phase-reviewer only for a completed phase/final integration result where extra judgment is valuable, when explicitly requested, or after a non-mechanical review/verification failure whose cause remains unclear. Formatting, import, typo, port, network, credential, and other mechanical or environmental failures stay on the default path.
- Add GPT-5.6 Luna high browser-verifier only for substantial Playwright or visual interaction work. Route its evidence to the Sol phase-reviewer only when final or phase acceptance benefits from extra judgment; routine UI smoke and regression checks stay with Terra review/verification.
- Preferred profiles are defaults, not fixed staffing or absolute restrictions. If a preferred agent or projection check is unavailable, use a reasonable available fallback and disclose it; do not claim the runtime model is verified.

Runtime metadata is opportunistic calibration, not a daily gate. Record `verified` only when visible evidence supports it; otherwise record `unverified` and continue ordinary work. Calibrate only when the user asks or there are suspicious cost signals such as abnormal token use, unexpected fan-out, or suspected expensive parent-model inheritance. If expensive inheritance or cost loss is confirmed, stop new fan-out, perform only minimal read-only diagnosis, and fall back to the main Codex or fewer subagents. Ask the user only when remediation needs configuration, runtime, installation, log upload, upstream issue, release, or another mutation outside current authority.

### Routing Scenarios

| Scenario ID | Allowed decision | Disallowed decision |
| --- | --- | --- |
| `tiny-clear` | `main-by-default; evidence-backed-specialist-allowed` | `fixed-team-fanout` |
| `routine-implementation` | `luna-max-implementer-when-useful` | `sol-by-default` |
| `routine-review-verify` | `terra-reviewer-or-verifier` | `sol-routine-check` |
| `hard-to-reverse-direction` | `sol-medium-planner-when-useful` | `sol-for-mechanical-or-env-failure` |
| `completed-phase-extra-judgment` | `sol-medium-phase-reviewer` | `phase-reviewer-for-routine-review` |
| `browser-heavy` | `luna-high-browser-verifier` | `sol-throughout-browser-run` |
| `preferred-agent-unavailable` | `disclosed-reasonable-fallback` | `claim-preferred-profile-verified` |
| `metadata-invisible` | `mark-unverified-and-continue` | `runtime-proof-daily-gate` |
| `confirmed-cost-anomaly` | `stop-new-fanout; readonly-diagnosis; reduce-agents` | `continue-fanout-or-mutate-runtime` |

Use this table as a decision contract, not as a fixed sequence of lanes.

## Modes And Authority

### Discuss

- Use discuss for read-only options, architecture, diagnosis, risk review, or a second opinion.
- Discuss does not authorize implementation, commits, deployment, release, or other mutation.
- Keep discuss lanes read-only unless the user explicitly assigns a writable deliverable.

### Execute

- Use execute only after an explicit user implementation request. Do not infer it from a plan, review, decision file, roadmap, or prior discuss round.
- Record execute start or promotion with the explicit message reference:

```bash
codex-workflow team-record-start <task-id> "<objective>" --backend paseo --mode execute --agents <N> --roles "<roles>" --providers "<providers>" --authorization-ref <user-message-ref>
codex-workflow team-promote <task-id> --to execute --authorization-ref <user-message-ref>
```

- `authorization_ref` is an audit guard against accidental promotion, not a host capability. Never fabricate it from workflow artifacts.
- Discuss starts and non-execute promotions do not require the reference.

## Minimal Agent Planning

1. Start with the main Codex. Spawn only a concrete bounded lane whose result materially changes latency or risk.
2. Choose roles from the actual task; there is no default role set or required agent count. Do not add lanes merely to follow the model preference table.
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
- A review finding's severity, `required_fix`, affected rows, or remediation prose does not grant implementation scope. In SDD v2, every validated controller resolution with `disposition: current-required` remains part of the current delivery whether its `repair_status` is `open` or `resolved`; only `repair_status: open` blocks or creates repair feedback.
- When authoring or rewriting an implementation contract from review results, project only those controller-admitted findings into executable requirements. Preserve `visible-follow-up` and `informational` findings in provenance or follow-up records, never as blocking acceptance, completion, edge-case, or safe-fallback obligations.
- When authority-backed facts determine an environment, status, verification level, or conclusion, state the goal neutrally and place the condition once in an existing invariant, acceptance row, or edge case. If review invalidates an overbroad or stale claim, replace it in place; do not retain it and append exception sections, parallel requirements, per-value matrices, or mirrored prose.
- Automatically repair only findings that block the current goal, regressions introduced by the current diff, or safety/data/permission problems that make the current delivery unsafe.
- Architecture improvements, adjacent cleanup, historical defects, additional product requirements, and roadmap-external work are follow-ups unless continuing the current delivery would be unsafe.
- After a repair, review the repair diff and relevant integration surface normally; do not ban new regressions, and do not reopen unrelated repository-wide discovery by default.
- Continue repair only while a verifiable implementation or evidence change materially advances the current goal. If progress stalls, record `fix_progress_stalled` and return the concrete blocker instead of generating more lanes or artifacts.
- Run a branch/integration review when parallel writes, cross-module coupling, migration, security, release, or comparable risk justifies it; it is not an unconditional final ritual.

## Commits And Context

- Match commit timing to the work phase: commit a solution/contract as one logical outcome when it is finally confirmed; during authorized implementation, prefer moderate logical commits that are independently understandable, verified, and reversible.
- Keep one primary reason per commit and include its tests/necessary docs. Do not commit every step, slice, or repair round, and do not accumulate an entire roadmap into one oversized diff.
- Stage only current-task paths or hunks. A commit does not authorize push, PR, deployment, release, cache refresh, or other external mutation.
- For work crossing compaction or handoff, keep one non-Git rolling checkpoint: current goal, completed work, next critical path, diff/verification state, and real blockers/follow-ups. Overwrite it rather than appending a history diary.

## Optional Protocols

Load optional protocol references only when the current contract actually requires them:

- Read `references/sdd.md` for Codex-native SDD JSON contracts, slice ledger, implementer/reviewer reports, or `codex-team-*` helpers.
- Read `references/business-acceptance.md` for business scenario, stakeholder, protocol/device, or dual-goal UI acceptance.
- First-code and Product/UI gates belong to the selected implementation contract and the clarify/task skills; do not duplicate their full rules here.

## Lifecycle Recording

- Use `team-record-start` and `team-record-finalize` only when durable Team state has handoff or audit value.
- Use `team-loop-record` to record a loop conclusion when an explicit iterative task needs durable telemetry; do not make numeric limits the default goal definition.
- Use `workflow/artifacts/<task-id>/team/decision.md` as the durable decision only when a substantive Team round occurred.
- Team round, decision, staffing, and loop artifacts must include a backend marker matching the current backend: `backend: paseo` for Paseo rounds and `backend: native` for explicit native fallback rounds.
- Keep raw logs and intermediate agent output outside Git. Persist the smallest conclusion required for verification or handoff.

In the final reply, report the task id, actual agents used, integrated outcome, verification, commits, and actionable residual risk.
