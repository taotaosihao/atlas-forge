---
name: team
description: Use the Atlas team flow with Codex native collaboration by default and Paseo only when it is explicitly selected for a Team, lane, or dispatch.
---

Decide whether Team is needed from the user's current request, including the requested collaboration style, latency needs, and risk. Use `$atlas-workflow:team` when the user asks for multiple agents or when independent lanes or a distinct specialist/reviewer materially serve those needs; otherwise stay with the main Codex. Multiple files, behavior changes, task complexity, or the existence of an implementation contract do not require Team by themselves.

## Language

Write workflow artifacts, project documents, and user-facing summaries in Chinese by default. Preserve commands, paths, identifiers, APIs, proper nouns, and quoted errors when accuracy benefits.

## Backend Selection

Team selection and backend selection are separate decisions. A request for `$atlas-workflow:team`, multiple agents, parallel work, specialist review, or a difficult task does not select Paseo.

- Outside Team, stay with the main Codex unless Team materially reduces latency or risk.
- Inside Team, default to Codex native collaboration.
- Select Paseo only from an explicit user or operator choice scoped to the Team, a lane, or one dispatch. Resolve backend and fallback policy independently in this order: dispatch, lane, Team, then `backend=native` and `fallback_policy=codex`.
- A review-lane Paseo choice does not transfer to implementation. A Team-level Paseo choice may be overridden by an explicit native lane or dispatch.
- `no-fallback` is an explicit opt-out and normalizes to `fallback_policy=none`; otherwise an operational Paseo failure falls back to Codex in the same logical lane.
- Preserve the resolved backend, policy, authority, goal, paths, and mutation permissions when work starts. Later configuration changes do not rewrite an active dispatch.
- Never read or apply Paseo orchestration preferences. Atlas owns routing; Paseo only manages an explicitly selected runtime lifecycle.

When durable Team state has audit or handoff value, use the v2 Team ledger commands to record controller-attested selection, dispatch, attempt, admission, fallback, and convergence. A free-form provider summary or the presence of Paseo is not proof that Paseo was selected.

## Codex Native Collaboration

Native collaboration is the normal Team backend. Use the smallest useful set of concrete lanes:

- Use the current callable native `spawn_agent` tool for concrete bounded lanes that can run independently. Exact Atlas routing expects `agents.spawn_agent` after activation. A host that exposes only a restricted `collaboration.spawn_agent` remains usable only when its model-visible schema passes the exact-routing preflight below.
- `collaboration.send_message` for information that does not need a new turn.
- `collaboration.followup_task` to reuse an idle agent for a new bounded task.
- `collaboration.wait_agent` only while live work remains.
- `collaboration.list_agents` to inspect current capacity and status.
- `collaboration.interrupt_agent` only to stop work that is still running and should no longer continue.

Start with the main Codex, but prefer parallel native agents when the authorized implementation decomposes into genuinely independent path/module ownership and parallelism materially improves latency. Do not impose a fixed role set or agent count. Tightly coupled changes keep one writable owner; multiple writers require disjoint path ownership, an integration owner, and no overlapping writer lease. Agent completion is evidence, not controller admission.

## Explicit Paseo Lanes

Only after a Team/lane/dispatch has resolved to Paseo:

- Discover providers with `paseo provider ls --json`, and discover models and callable modes from the selected provider's live structured capability.
- Do not hardcode provider/model availability, catalog order, “latest” status, thinking options, or mode IDs, except for the user-required direct Claude Code permission contract below. Never copy a Codex mode or model option to another provider.
- Generic Atlas recommendations may consider only models whose trusted capability identity is explicitly non-Claude. Keep implementer and independent reviewer providers distinct when that perspective matters, but do not create lanes only to achieve provider diversity.
- An explicit provider/model request wins when the exact live capability exists. Do not silently replace an unavailable exact provider/model with another provider/model; apply the recorded Codex fallback policy and disclose the lost perspective.
- Resolve a provider-specific mode that satisfies the lane. If the live capability exposes only a display label or no callable mode ID, treat the Paseo path as unavailable; do not guess `full-access`, `bypass`, `bypassPermissions`, `yolo`, or any other ID. The direct `claude` provider uses the explicit exception below.
- Runtime permission does not grant workflow authority. Review/discuss stays read-only; writable execution still requires explicit user authorization, owned and forbidden paths, acceptance, verification, and a stop condition.
- Prompts carry repository instructions, scope, authority, expected evidence, and stop conditions.

### Claude Manual-Only Gate

Claude-family models are never eligible for automatic routing or model recommendation, whether exposed by the direct `claude` provider or through a gateway.

- Use Claude only when the user or operator manually supplies an exact provider and model ID in a controller-attested model-selection event for the current Team run and scope.
- Live catalog discovery may validate that exact selection; it must not choose, complete, upgrade, or substitute a Claude model.
- Classify model identity from trusted structured capability as `claude`, `non-claude`, or `unknown`. A gateway alias or insufficient metadata is `unknown`, not non-Claude.
- Missing exact manual Claude selection returns `CLAUDE_MODEL_SELECTION_REQUIRED`. Unknown family returns `MODEL_FAMILY_UNVERIFIED`. Neither condition starts an agent or counts as an operational fallback.
- For a valid exact selection on the direct `claude` provider, add Paseo's callable Claude mode ID directly to every launch command: `paseo run --provider claude --model "<exact-model-id>" --mode bypassPermissions ... "<prompt>"`. Do not omit the option, shorten it to the display label `bypass`, substitute `default`, `auto`, or `acceptEdits`, or use Claude Code's lower-level `--permission-mode` flag in a Paseo command.
- If a valid manually selected Claude model is unavailable at runtime, preserve the requested perspective and use the recorded Codex fallback policy; never silently choose another Claude model.

### Paseo Lifecycle And Codex Fallback

- Reserve the attempt and any path-scoped writer lease before `paseo run`; bind the returned exact agent/workspace/worktree identity immediately after launch. Use a stable launch operation ID so recovery can reconcile a run/bind crash window without launching a second actor.
- If the runtime cannot reconcile an indeterminate launch, keep the attempt `launch-state-unknown`, retain its writer lease, and return for human handling. Do not retry, fall back, or start a second actor.
- Reuse an existing reviewer with exact-ID `send` and wait for real completion; do not busy-poll. Stop only the exact actor when continued execution would conflict, exceed scope, or waste material resources. Never use broad stop, daemon restart, agent delete, or provider mutation.
- Treat quota/credits, trusted 429/Retry-After, provider/model/mode/auth unavailability, CLI/daemon failure, runtime crash, and timeout with no useful output as operational failures only when a trusted control/runtime observation supports the classification. Task output, tests, code defects, review findings, disagreement, or missing authority are not backend failures.
- An automatic retry is a new append-only attempt, happens at most once for a dispatch, and requires the predecessor to be quiesced. Fallback likewise requires a quiesced Paseo predecessor.
- Before a writable fallback, preserve diff/worktree/base/head/untracked evidence, prove the original writer is quiesced, and obtain a takeover permit and non-overlapping lease. If any fact is unknown, stop the lane instead of starting another writer.
- Atomically record the fallback event and reserve the native attempt in the same logical lane. The native actor continues the same goal, paths, authority, acceptance, and admitted evidence; fallback never widens scope or hides Paseo provenance.

## Native Exact Model Routing

Before the first native fan-out, inspect the model-visible `spawn_agent` schema and require `agent_type`, `model`, `reasoning_effort`, and `fork_turns`. This is a capability check, not authorization to spawn.

- If any required field is absent, classify the native surface as `schema-restricted`, do not start a generic or inherited child, disclose that exact routing is unavailable, and continue main-only.
- If the tool returns a reserved-schema mismatch such as `Function '...' is reserved for use by this model and must match the configured schema`, stop new fan-out and return the exact error plus the version-sensitive MultiAgentV2 remediation to the user. Do not mutate user config or restart a runtime unless the current request explicitly authorizes those operations.
- `task_name` names the child task; it does not select a custom agent. Select the checked-in custom profile only with `agent_type`.
- Every custom-role spawn sets `fork_turns="none"`. Omitting it defaults to a full-history fork, which is incompatible with exact role/model/reasoning overrides on affected MultiAgentV2 versions.
- A fresh child receives a self-contained dispatch packet containing the lane goal, authority, owned and forbidden paths, necessary decisions and context, acceptance, verification commands, stop conditions, and expected output. Do not rely on inherited parent history.

Before the first exact Atlas dispatch, run:

```bash
workflow/bin/atlas-agent-model-policy check
```

This check validates the checked-in default-quality policy/profile projection. It does not prove billing or inference metadata. In default quality mode, the resolved profile and the explicit dispatch values must agree on model and reasoning effort.

### Default Quality Mode

Default to quality mode. Use the following exact-routing matrix only after staffing has established that the lane is useful:

| Lane | `agent_type` | `model` | `reasoning_effort` | `fork_turns` |
| --- | --- | --- | --- | --- |
| Planning whose direction is costly or hard to reverse | `atlas-sdd-planner` | `gpt-5.6-sol` | `max` | `none` |
| Routine implementation | `atlas-sdd-implementer` | `gpt-5.6-sol` | `medium` | `none` |
| Routine review | `atlas-sdd-reviewer` | `gpt-5.6-sol` | `max` | `none` |
| Command or business verification | `atlas-sdd-verifier` | `gpt-5.6-sol` | `high` | `none` |
| Completed phase or final integration judgment | `atlas-sdd-phase-reviewer` | `gpt-5.6-sol` | `medium` | `none` |
| Substantial Playwright or visual interaction verification | `atlas-sdd-browser-verifier` | `gpt-5.6-sol` | `high` | `none` |
| Read-heavy exploration | `atlas-sdd-explorer` | `gpt-5.6-sol` | `medium` | `none` |

A small clear task defaults to the main Codex. Use a subagent only when concrete evidence shows that delegation or specialist review materially lowers risk or latency. The matrix determines how an admitted lane is spawned; it does not require a fixed role set or agent count.

Use the Sol phase-reviewer only for a completed phase/final integration result where extra judgment is valuable, when explicitly requested, or after a non-mechanical review/verification failure whose cause remains unclear. Formatting, import, typo, port, network, credential, and other mechanical or environmental failures stay on the ordinary reviewer/verifier path. Browser evidence reaches the phase-reviewer only when final or phase acceptance benefits from extra judgment; routine UI smoke and regression checks stay with the reviewer/verifier selected by the current mode.

### Explicit Saving Mode

Enter saving mode only when the user explicitly requests saving mode, cost-saving mode, or an equivalent lower-cost routing choice for the current Team or named lanes. Do not infer it from a routine task, token usage, budget pressure, or a suspected cost anomaly, and never automatically enable saving mode. The explicit choice does not persist into later tasks.

In saving mode, keep the same `agent_type`, `fork_turns="none"`, staffing rules, and self-contained dispatch packet, but use the following model and supported reasoning values as explicit per-spawn overrides:

| Lane | `agent_type` | `model` | `reasoning_effort` | `fork_turns` |
| --- | --- | --- | --- | --- |
| Planning | `atlas-sdd-planner` | `gpt-5.6-sol` | `medium` | `none` |
| Implementation | `atlas-sdd-implementer` | `gpt-5.6-luna` | `max` | `none` |
| Review | `atlas-sdd-reviewer` | `gpt-5.6-terra` | `high` | `none` |
| Verification | `atlas-sdd-verifier` | `gpt-5.6-terra` | `high` | `none` |
| Phase or final integration judgment | `atlas-sdd-phase-reviewer` | `gpt-5.6-sol` | `medium` | `none` |
| Browser or visual verification | `atlas-sdd-browser-verifier` | `gpt-5.6-luna` | `high` | `none` |
| Exploration | `atlas-sdd-explorer` | `gpt-5.6-luna` | `medium` | `none` |

The model difference between the Sol default profile and this table is an intentional, user-authorized override. Outside that explicit override, if the profile, policy, model, or reasoning values mismatch, do not spawn until the checked-in configuration is reconciled.

Visible runtime metadata is optional disclosure, not a daily audit gate. When the tool or UI does not expose trustworthy model evidence, state that billing-level model verification was not performed; do not claim the billing model is verified and do not add persistent runtime-log parsing solely for this workflow. If expensive inheritance or cost loss is confirmed, stop new fan-out, perform only minimal read-only diagnosis, and fall back to main-only. Ask the user only when remediation needs configuration, runtime, installation, log upload, upstream issue, release, or another mutation outside current authority.

### Routing Scenarios

| Scenario ID | Allowed decision | Disallowed decision |
| --- | --- | --- |
| `tiny-clear` | `main-by-default; evidence-backed-specialist-allowed` | `fixed-team-fanout` |
| `routine-implementation` | `default-sol-medium-implementer` | `implicit-saving-model` |
| `routine-review-verify` | `default-sol-max-reviewer-or-sol-high-verifier` | `implicit-saving-model` |
| `hard-to-reverse-direction` | `explicit-sol-max-planner` | `sol-for-mechanical-or-env-failure` |
| `completed-phase-extra-judgment` | `explicit-sol-medium-phase-reviewer` | `phase-reviewer-for-routine-review` |
| `browser-heavy` | `default-sol-high-browser-verifier` | `implicit-saving-model` |
| `saving-mode-explicit` | `luna-implementer-browser-explorer; terra-reviewer-verifier` | `implicit-or-automatic-saving` |
| `schema-restricted` | `main-only; disclose-routing-unavailable` | `generic-inherited-fanout` |
| `profile-mismatch` | `block-spawn; reconcile-policy-profile` | `spawn-with-mismatched-model` |
| `metadata-invisible` | `disclose-unverified; no-billing-proof-required` | `claim-billing-model-verified` |
| `confirmed-cost-anomaly` | `stop-new-fanout; readonly-diagnosis; main-only` | `continue-fanout-or-mutate-runtime` |

Use this table as a decision contract, not as a fixed sequence of lanes.

## Modes And Authority

### Discuss

- Use discuss for read-only options, architecture, diagnosis, risk review, or a second opinion.
- Discuss does not authorize implementation, commits, deployment, release, or other mutation.
- Discuss lanes never acquire writable attempts or writer leases; an explicitly authorized writable deliverable must enter through execute admission.

### Execute

- Use execute only after an explicit user implementation request. Do not infer it from a plan, review, decision file, roadmap, or prior discuss round.
- Record execute start or promotion with the explicit message reference. Native is the default; an explicitly selected Paseo Team also records its controller-attested selection authority:

```bash
codex-workflow team-record-start <task-id> "<objective>" --mode execute --authorization-ref <user-message-ref> --brief <canonical-brief.json> --operation-id <id>
codex-workflow team-record-start <task-id> "<objective>" --backend paseo --mode execute --selection-authority-kind user-message --selection-authority-ref <user-message-ref> --authorization-ref <user-message-ref> --brief <canonical-brief.json> --operation-id <id>
codex-workflow team-promote <task-id> --to execute --authorization-ref <user-message-ref> --brief <canonical-brief.json> --operation-id <id>
```

- `authorization_ref` is an audit guard against accidental promotion, not a host capability. Never fabricate it from workflow artifacts.
- Execute start and promotion require the canonical semantics-v3 `brief.json`; Team revalidates its contract/plan digests, base, dependencies, size gate, permanent checks, and global writer scope while holding the global admission lock.
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
- A roadmap document alone does not authorize implementation. Internal slices are scheduling/checkpoint units, not new permission boundaries or the default product architecture or naming namespace. In implementation objectives and dispatch prompts, make stable domain/capability identity more prominent than task, Gate, phase, slice, or acceptance labels; those delivery labels may remain in workflow metadata and task names.
- Return when the whole authorized goal is complete, continuing needs new authority or a user-owned decision, an external state must change, or safe work can no longer make material progress.
- Elapsed time, rounds, agents, commits, tokens, and tool calls are telemetry, not default semantic stop conditions.

## Deliberative Team Review

For a substantive Team review, first define the actual review scope: the working tree, commit range, pull request, phase, or named files; the applicable goal and authoritative contract; and the evidence or checks already available.

- Recommend complementary review perspectives and agent count from the actual task. There is no required council shape. Two or three perspectives are often useful, but this is guidance rather than a staffing gate. When the risk justifies it, include a perspective that owns the strongest evidence-backed counterargument or tradeoff instead of duplicating another general reviewer.
- Let each selected reviewer form an independent first-round position before seeing the other reviewers' conclusions. Findings should state the affected path and line when applicable, the concrete evidence, impact, and recommendation; uncertainty belongs in an explicit evidence gap rather than a clean verdict.
- Keep useful review agents available after their initial findings. The main Codex integrates the first-round results, combines duplicates without erasing provenance or dissent, makes an evidence-backed interim ruling, and sends only the material objections and ruling back to the same relevant agents with `paseo send` or native `followup_task`. Do not replay the full history or involve every role in every finding.
- Review discussion should normally converge within two or three rounds. This is an operating target, not a hard semantic limit. Continue beyond it only while a material disagreement remains and another focused exchange or verification can add evidence or change the final recommendation. The main Codex may adjudicate ordinary duplication, wording, severity, and scope differences from the user goal, authoritative contract, and repository evidence.
- If a material disagreement persists after several useful exchanges, or the decision depends on product intent, risk acceptance, compatibility, permissions, ownership, or another user choice, stop the internal loop and return a concise human decision packet: agreed facts, the remaining disagreement, each side's strongest evidence, the main Codex's recommendation, and the concrete options. After the user decides, return that authority to the relevant agents only when a final consistency check is useful.
- Silence, timeout, an unavailable reviewer, or unsupported agreement is not consensus. Replace a missing perspective when useful or disclose that independent review is unavailable; the main Codex may inspect and adjudicate evidence but must not present itself as the missing independent reviewer.
- Convergence means no unresolved disagreement remains that would materially change the final recommendation, not that every role shares the same design preference. Use `CONSENSUS`, `CONSENSUS_WITH_RESERVATIONS`, or `HUMAN_DECISION_REQUIRED` when those labels make the outcome clearer.
- Lead the final synthesis with the recommendation, convergence state, blockers, material reservations, and unresolved evidence. An open current-goal blocker or material evidence gap prevents approval; non-blocking watch items and follow-ups remain visible; approval requires adequate independent evidence for the review that was actually claimed.

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
- Read `references/code-review.md` when a substantive code or merge-readiness review needs the optional perspective menu, evidence checklist, focused deliberation prompts, or synthesis shape.
- First-code and Product/UI gates belong to the selected implementation contract and the clarify/task skills; do not duplicate their full rules here.

## Final Disclosure

When Paseo was selected or a fallback occurred, report the selection scope and authority, configured/resolved/attempted/effective backend, actual provider/model/mode when verified, operational failure class, controlled retry, fallback actor, and preserved output/diff/worktree evidence. State any lost provider perspective or reduction in independent evidence, the review convergence state, and concrete human choices. Mark unavailable live capability as unverified; a fake or hermetic adapter never proves a real provider is usable.

## Lifecycle Recording

- Use `team-record-start` and `team-record-finalize` only when durable Team state has handoff or audit value.
- Use `team-loop-record` to record a loop conclusion when an explicit iterative task needs durable telemetry; do not make numeric limits the default goal definition.
- Use `workflow/artifacts/<task-id>/team/decision.md` as the durable decision only when a substantive Team round occurred.
- Team decision artifacts use `backend: native|paseo|mixed|none` matching admitted results; `none` means no result was admitted and is never a selectable runtime backend. A v2 finalization writes stable provenance to `team/backend-v2.json`; mixed results remain traceable to admitted native and Paseo attempts. Legacy artifacts without that sidecar retain their historical native/Paseo marker contract.
- Keep raw logs and intermediate agent output outside Git. Persist the smallest conclusion required for verification or handoff.

In the final reply, report the task id, actual agents used, integrated outcome, verification, commits, and actionable residual risk.
