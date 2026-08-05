---
name: team
description: Use the Atlas team flow with Codex native collaboration by default and Paseo only when it is explicitly selected for a Team, lane, or dispatch.
---

Decide whether Team is needed from the user's current request, including the requested collaboration style, latency needs, and risk. Use `$atlas-workflow:team` when the user asks for multiple agents or when independent lanes or a distinct specialist/reviewer materially serve those needs; otherwise stay with the main Codex. Multiple files, behavior changes, task complexity, or the existence of an implementation contract do not require Team by themselves. An MVP, Beta, internal test, or small-scope public beta without explicit formal certification is `product_increment`: Team may be selected only for an independent collaboration or review need, while release-intent, v4, immutable Profile, release receipt, and release-decision machinery must be omitted. Reclassify to explicit `product_release` intent before using those release controls.

## Independent Staffing, Model, Release, And Lease Decisions

Keep three decisions independent:

- `staffing_mode` is `main` or `team` and answers whether extra agents are
  useful.
- `model_policy` is the current host model, default saving routing after a
  useful lane has been admitted, or an explicitly requested quality route.
- `release_mode` is `product_increment` or `product_release` and answers the
  acceptance level; only explicit formal certification, `release-ready`, or
  `certified` intent selects `product_release`.

Do not create Team just to obtain Saving Mode. Team does not imply quality mode,
and quality mode does not require Team. The main Codex keeps the current host
model; Atlas does not rewrite the root host model. Saving/quality selection is a
per-task or per-lane dispatch choice and is not persisted as workflow state. A
lane may choose its own model within the admitted policy, but cannot change the
goal, authority, paths, or acceptance. The Claude-family manual exact-model gate
remains unchanged.

Choose a path lease from actual write-conflict risk, separately from staffing:

- Main-only single writers, read-only analysis, discussion, review, and
  verification have no lease requirement.
- A `product_increment` Team with one isolated writer and no fallback, takeover,
  or external concurrent writer does not require a lease by default.
- That quick-path single writer does not enter execution-v3 or acquire a durable
  writable-attempt solely because Team is available; keep strict execution-v3
  admission for `product_release` unchanged.
- Two or more possible writers require non-overlapping path ownership; use the
  existing lease/quiescence boundary when available. Fallback, takeover,
  uncertain old-writer quiescence, or a shared-workspace external writer must
  retain that boundary, and uncertainty stops new writers.
- Formal `product_release` execution continues to use the existing execution-v3
  lease and admission rules. Do not create a general Team-independent lease
  runtime in the quick path.

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
- Generic Atlas recommendations may consider only models whose trusted capability identity is explicitly non-Claude, including exact providers in Atlas's controlled direct-provider identity map. Unknown gateway aliases are never eligible for automatic recommendation. Keep implementer and independent reviewer providers distinct when that perspective matters, but do not create lanes only to achieve provider diversity.
- An explicit provider/model request wins when the exact live capability exists. An unknown gateway identity also requires an exact controller-attested model-selection event and remains disclosed as unverified; it is not silently promoted to non-Claude. Do not silently replace an unavailable exact provider/model with another provider/model; apply the recorded Codex fallback policy and disclose the lost perspective.
- Resolve a provider-specific mode that satisfies the lane. If the live capability exposes only a display label or no callable mode ID, treat the Paseo path as unavailable; do not guess `full-access`, `bypass`, `bypassPermissions`, `yolo`, or any other ID. The direct `claude` provider uses the explicit exception below.
- Runtime permission does not grant workflow authority. Review/discuss stays read-only; writable execution still requires explicit user authorization, owned and forbidden paths, acceptance, verification, and a stop condition.
- Prompts carry repository instructions, scope, authority, expected evidence, and stop conditions.

### Claude Manual-Only Gate

Claude-family models are never eligible for automatic routing or model recommendation, whether exposed by the direct `claude` provider or through a gateway.

- Use Claude only when the user or operator manually supplies an exact provider and model ID in a controller-attested model-selection event for the current Team run and scope.
- Live catalog discovery may validate that exact selection; it must not choose, complete, upgrade, or substitute a Claude model.
- Classify model identity from trusted structured capability or Atlas's controlled direct-provider identity map as `claude`, `non-claude`, or `unknown`. A gateway alias or insufficient metadata outside that map is `unknown`, not non-Claude.
- Missing exact manual Claude selection returns `CLAUDE_MODEL_SELECTION_REQUIRED`. An unknown family without an exact controller-attested provider/model selection returns `MODEL_FAMILY_UNVERIFIED`. An exact attested unknown selection may proceed while remaining visibly unverified. Rejected admission does not start an agent or count as an operational fallback.
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

### Root Session And Child Provider Invariant

The root Codex session keeps its active model, `model_provider`, authentication,
and catalog unchanged. Atlas never changes the root provider merely to make a
DeepSeek lane available. A DeepSeek route is child-local: only the selected
`atlas-sdd-explorer-deepseek` or `atlas-sdd-implementer-deepseek` profile may
bind `model_provider = "zenmux"` and `deepseek-v4-flash:deepseek`.

- A `model` override is not a provider switch. Never send
  `deepseek-v4-flash:deepseek` through the built-in `explorer` or `implementer`
  role, or through a profile whose effective provider is not ZenMux.
- If the host exposes model/reasoning overrides but cannot select the
  provider-bound custom profile, classify the DeepSeek route as unavailable at
  the provider-routing layer and fail closed to Luna or main-only according to
  the lane's fallback rule. Do not retry the same model through the inherited
  provider.
- If the host rejects the selected DeepSeek profile's `max` effort, classify
  that exact profile/effort route as host-unavailable. Do not silently lower it
  to `high`, rewrite the Atlas default, or claim that a different effort proved
  the configured `max` route.
- A DeepSeek child is admitted only when fresh child metadata proves
  `model_provider = "zenmux"` and the exact routed model is
  `deepseek-v4-flash:deepseek`; a ChatGPT-account unsupported-model response or
  an effective `openai` provider is a failed DeepSeek route, not successful
  inference. Preserve the same packet and disclose the lost perspective on
  fallback.

Before the first native fan-out, inspect the model-visible `spawn_agent` schema and require `agent_type`, `model`, `reasoning_effort`, and `fork_turns`. This is a capability check, not authorization to spawn.

- If any required field is absent, classify the native surface as `schema-restricted`, do not start a generic or inherited child, disclose that exact routing is unavailable, and continue main-only.
- If the tool returns a reserved-schema mismatch such as `Function '...' is reserved for use by this model and must match the configured schema`, stop new fan-out and return the exact error plus the version-sensitive MultiAgentV2 remediation to the user. Do not mutate user config or restart a runtime unless the current request explicitly authorizes those operations.
- `task_name` names the child task; it does not select a custom agent. Select the checked-in custom profile only with `agent_type`.
- Every custom-role spawn sets `fork_turns="none"`. Omitting it defaults to a full-history fork, which is incompatible with exact role/model/reasoning overrides on affected MultiAgentV2 versions.
- A fresh child receives a self-contained dispatch packet containing the lane goal, authority, owned and forbidden paths, necessary decisions and context, acceptance, verification commands, stop conditions, and expected output. Do not rely on inherited parent history.
- A local `model_catalog_json` can describe a custom model and its normal multi-agent eligibility metadata to Codex, but it cannot bypass the host/model allowlist, entitlement checks, or add missing fields to the model-visible `spawn_agent` schema. Treat a host rejection as unavailable exact routing, not as a catalog problem that Atlas can override.
- When the current official catalog still marks `gpt-5.6-luna` below MultiAgentV2, the user-authorized installed configuration may point its root `model_catalog_json` at the output of `atlas-team-model-catalog`. The helper preserves every official entry, promotes only the exact Luna entry to `multi_agent_version=v2` when needed, and appends the verified `deepseek-v4-flash:deepseek` entry as v2. It never edits the official cache, carries credentials, or changes host schema code. Regenerate the projection after the official model cache or DeepSeek catalog changes, then start a new task; existing tasks do not hot-reload the allowlist.

Before the first exact Atlas dispatch, run:

```bash
workflow/bin/atlas-agent-model-policy check
```

This check validates the checked-in default-saving policy/profile projection. It does not prove billing or inference metadata. In default saving mode, the resolved profile and the explicit dispatch values must agree on model and reasoning effort.

### Default Saving Mode

Default to saving mode. Use the following exact-routing matrix only after staffing has established that the lane is useful:

| Lane | `agent_type` | `model` | `reasoning_effort` | `fork_turns` |
| --- | --- | --- | --- | --- |
| Planning | `atlas-sdd-planner` | `gpt-5.6-sol` | `medium` | `none` |
| Routine implementation | `atlas-sdd-implementer` | `gpt-5.6-luna` | `max` | `none` |
| Routine implementation (ZenMux alternative) | `atlas-sdd-implementer-deepseek` | `deepseek-v4-flash:deepseek` | `max` | `none` |
| Routine review | `atlas-sdd-reviewer` | `gpt-5.6-terra` | `high` | `none` |
| Command or business verification | `atlas-sdd-verifier` | `gpt-5.6-terra` | `high` | `none` |
| Completed phase or final integration judgment | `atlas-sdd-phase-reviewer` | `gpt-5.6-sol` | `medium` | `none` |
| Substantial Playwright or visual interaction verification | `atlas-sdd-browser-verifier` | `gpt-5.6-luna` | `high` | `none` |
| Read-heavy exploration | `atlas-sdd-explorer` | `gpt-5.6-luna` | `medium` | `none` |
| Read-heavy exploration (ZenMux alternative) | `atlas-sdd-explorer-deepseek` | `deepseek-v4-flash:deepseek` | `max` | `none` |

A small clear task defaults to the main Codex. Use a subagent only when concrete evidence shows that delegation or specialist review materially lowers risk or latency. The matrix determines how an admitted lane is spawned; it does not require a fixed role set or agent count.

#### Luna And DeepSeek Flash Implementation

`atlas-sdd-implementer` and `atlas-sdd-implementer-deepseek` are alternative implementations of the same logical writable implementation role. Give either candidate the same goal, execution authority, owned and forbidden paths, canonical brief, acceptance criteria, required checks, commit policy, stop condition, and `IMPLEMENTER_REPORT_JSON` contract. Their profiles preserve the exact same developer instructions and inherit the same host/task sandbox semantics; provider or model choice never grants write authority.

The DeepSeek Flash profiles use its native `max` effort. Keep the isolated DeepSeek catalog aligned with the current official `low` / `high` / `max` capability set and `max` as the Atlas default; do not use compatibility aliases such as `medium` or `xhigh` as profile values.

- For a single implementation dispatch, honor an exact user-selected candidate only when its current writable route is available. Otherwise use Luna by default; choose DeepSeek Flash only after the exact ZenMux alias, custom profile, host admission, assignment delivery, tool loop, and required write/check behavior have passed under the implementer role. Direct-profile inference or a standalone tool call does not prove the native writable child route.
- Keep one writer for a tightly coupled implementation lane. Never send the same writable packet to both Luna and DeepSeek, and never use duplicate writers in one shared checkout as implementation cross-validation. Use independent read-only exploration, review, or verification to cross-check implementation evidence.
- Run Luna and DeepSeek implementers concurrently only for explicitly authorized, genuinely independent lanes with disjoint owned paths, a named integration owner, and the applicable lease/quiescence boundary. Model diversity alone does not justify a second writer.
- Before retrying or falling back from either implementer to the other, prove the predecessor writer is quiesced, preserve its diff and untracked evidence, and keep the same goal, authority, paths, acceptance, and checks. If writer state or ownership is uncertain, stop instead of starting the replacement.
- If the host admits the model but omits the assignment payload, tools, or write semantics for the child, classify that exact layer as unavailable and disclose it. Do not interpret child creation, an idle response, or direct-provider success as completed implementation routing.

#### Luna And DeepSeek Flash Exploration

`atlas-sdd-explorer` and `atlas-sdd-explorer-deepseek` are alternative implementations of the same logical read-only exploration role. They receive the same lane goal, authority, forbidden paths, acceptance input, verification request, stop condition, and expected evidence shape. Their profiles preserve the same read-only sandbox and developer-instruction semantics; provider or model choice never changes mutation authority.

- For a single exploration dispatch, honor an exact user-selected candidate when it is currently available. Otherwise use Luna by default; choose DeepSeek Flash only when a current availability preflight passed and the lane explicitly values a non-OpenAI perspective. Do not use catalog order, price, an inferred slug, or a prior successful text reply as the selector.
- DeepSeek Flash is currently available only when the live ZenMux `/models` response contains the exact non-deprecated upstream ID `deepseek/deepseek-v4-flash`, the Codex catalog maps the exact routed alias `deepseek-v4-flash:deepseek`, the custom profile is discovered, and the current host admits that exact provider/model route. Do not substitute either identifier for the other at its boundary. A plain completion proves inference only; claim full agent/tool-loop availability only after the assigned agent completes at least one tool call under the expected role and authority.
- Luna availability likewise requires profile discovery and host admission of the exact `atlas-sdd-explorer` / `gpt-5.6-luna` / `medium` route. Do not infer availability solely from the parent model or catalog presence.
- Dispatch both candidates only when the user explicitly requests both perspectives or independent cross-validation materially reduces a concrete risk. This is a per-lane decision, never a default fan-out. Start both from the same self-contained packet and keep their results independent until both first-round reports are complete.
- The main Codex compares evidence, identifies agreement and material disagreement, verifies disputed facts when feasible, and makes the final synthesis. Do not decide by majority, silently merge incompatible claims, or let one agent broaden the other's authority.
- If one candidate fails before producing useful evidence because its provider, model, auth, catalog, schema, quota, or tool loop is unavailable, disclose the failed layer. A single-candidate lane may retry the same packet once on the other currently available candidate; a requested dual-perspective lane reports the lost perspective rather than pretending fallback preserved independent cross-validation. Useful but conflicting output is not an availability failure and must be synthesized as disagreement.
- If neither exact route is available, continue main-only and disclose the missing perspective. Never spawn a generic or inherited child as a substitute.

Use the Sol phase-reviewer only for a completed phase/final integration result where extra judgment is valuable, when explicitly requested, or after a non-mechanical review/verification failure whose cause remains unclear. Formatting, import, typo, port, network, credential, and other mechanical or environmental failures stay on the ordinary reviewer/verifier path. Browser evidence reaches the phase-reviewer only when final or phase acceptance benefits from extra judgment; routine UI smoke and regression checks stay with the reviewer/verifier selected by the current mode.

### Explicit Quality Mode

Enter quality mode only when the user explicitly requests quality mode, all-Sol routing, or an equivalent higher-quality routing choice for the current Team or named lanes. Do not infer it from task difficulty, a failed check, reviewer disagreement, or available budget, and never automatically enable quality mode. The explicit choice does not persist into later tasks.

In quality mode, keep the same `agent_type`, `fork_turns="none"`, staffing rules, and self-contained dispatch packet, but use the following model and supported reasoning values as explicit per-spawn overrides:

| Lane | `agent_type` | `model` | `reasoning_effort` | `fork_turns` |
| --- | --- | --- | --- | --- |
| Planning | `atlas-sdd-planner` | `gpt-5.6-sol` | `max` | `none` |
| Implementation | `atlas-sdd-implementer` | `gpt-5.6-sol` | `medium` | `none` |
| Review | `atlas-sdd-reviewer` | `gpt-5.6-sol` | `max` | `none` |
| Verification | `atlas-sdd-verifier` | `gpt-5.6-sol` | `high` | `none` |
| Phase or final integration judgment | `atlas-sdd-phase-reviewer` | `gpt-5.6-sol` | `medium` | `none` |
| Browser or visual verification | `atlas-sdd-browser-verifier` | `gpt-5.6-sol` | `high` | `none` |
| Exploration | `atlas-sdd-explorer` | `gpt-5.6-sol` | `medium` | `none` |

The model difference between the default saving profiles and this table is an intentional, user-authorized override. Outside that explicit override, if the profile, policy, model, or reasoning values mismatch, do not spawn until the checked-in configuration is reconciled.

Visible runtime metadata is optional disclosure, not a daily audit gate. When the tool or UI does not expose trustworthy model evidence, state that billing-level model verification was not performed; do not claim the billing model is verified and do not add persistent runtime-log parsing solely for this workflow. If expensive inheritance or cost loss is confirmed, stop new fan-out, perform only minimal read-only diagnosis, and fall back to main-only. Ask the user only when remediation needs configuration, runtime, installation, log upload, upstream issue, release, or another mutation outside current authority.

### Routing Scenarios

| Scenario ID | Allowed decision | Disallowed decision |
| --- | --- | --- |
| `tiny-clear` | `main-by-default; evidence-backed-specialist-allowed` | `fixed-team-fanout` |
| `routine-implementation` | `default-luna-or-explicit-available-deepseek-single-writer` | `implicit-quality-model-or-default-dual-writer` |
| `implementation-fallback` | `same-authority-takeover-after-writer-quiescence` | `overlapping-or-uncertain-writer-takeover` |
| `routine-review-verify` | `default-terra-high-reviewer-or-verifier` | `implicit-quality-model` |
| `hard-to-reverse-direction` | `default-sol-medium-planner` | `automatic-quality-upgrade` |
| `completed-phase-extra-judgment` | `default-sol-medium-phase-reviewer` | `phase-reviewer-for-routine-review` |
| `browser-heavy` | `default-luna-high-browser-verifier` | `implicit-quality-model` |
| `exploration-single` | `luna-or-deepseek-by-live-availability-and-explicit-route` | `default-dual-fanout` |
| `exploration-cross-check` | `same-input-dual-dispatch-when-risk-reduced-or-explicit` | `different-authority-or-implicit-fanout` |
| `quality-mode-explicit` | `all-sol-with-role-specific-reasoning` | `implicit-or-automatic-quality` |
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
- Execute start and promotion require canonical brief schema v3 binding an admitted contract semantics v3 or v4; Team revalidates its contract/plan digests, release policy when present, base, dependencies, size gate, permanent checks, and global writer scope while holding the global admission lock.
- Discuss starts and non-execute promotions do not require the reference.

### Product Increment Evidence

When `release_mode=product_increment`, use the actual product behavior as the
truth: startup, one critical end-to-end user flow, related checks that ran and
passed, no observed feature/data/permission/security blocker, and no
unauthorized deployment, publication, shared-environment write, or irreversible
operation. A small public beta also records its applicable access, data,
credential, rollback/close, and real-entrypoint smoke boundaries. If those real
checks pass but recorder/evidence capture fails, report `证据采集：降级` and the
reason; failed, unrun, or unknown real checks still block. This path never writes
or implies `release_decision`, `certified`, or source-level release-ready, and it
never substitutes for the strict release path below.

## Release Certification

Release-readiness invariant: only a Team execution-v3 product_release whose immutable Profile final sweep binds one unchanged candidate and yields the completion-derived release_decision.status=certified may be called source-level release-ready; it never proves or authorizes installation, push, deployment, publication, or actual release. Task/slice/agent/review completion, passing tests, screenshots, Business Acceptance, design approval, or MVP/Beta labels never grant release-ready status.

- Classify target delivery independently from work type. Planning or review that directly authors or gates a named externally usable candidate retains `product_release` only when the request explicitly asks for formal certification, `release-ready`, or `certified`; without that intent it is `product_increment`. Neither completion can certify by prose alone. Only standalone work whose contract governs no release candidate may be `non_product` with a substantive reason. Explicit demo/prototype/spike work is `exploration`, remains isolated, and cannot make product-stage or release-readiness claims.
- A newly authored explicit `product_release` uses contract semantics v4, execution-plan schema version 2, brief schema version 3, and the exact immutable Profile binding. Planning/review briefs may retain `product_release` and enter `discuss-v3`, but release-bearing `execution-v3` admission and completion require the hash-bound `work_type=implementation`. When formal release intent is explicit, `MVP`, `Beta`, limited release, GA, and scaled operation share the same Profile floor; those labels alone route to `product_increment`.
- Its `target_delivery_authority_ref` must exactly equal the current controller-recordable `user-message:` or `operator-input:` execution authorization. Unresolved `goal:` and `current-required:` references cannot enter release certification.
- Every Profile check belongs to one terminal release-certification slice that transitively depends on all other executable slices. Its fresh receipts must bind the same final source, artifact, surface inventory, config, runtime, data, intent, policy, and final worktree candidate.
- The release collector reloads the digest-pinned official adapters, recomputes typed facts from raw inputs, and compares them before completion derives the decision. Adapter consistency, self-authored raw data, content hashes, stdout, and arbitrary passing commands are not producer authority; missing workflow-bound producer provenance makes the fact `cannot_verify`. Agents, reviewers, verifiers, and controller-authored prose cannot create or overwrite `release_decision`.
- Report a completion-derived `certified`, `denied`, or `cannot_verify` exactly. Missing, stale, mixed-candidate, or malformed final-sweep evidence is never promoted to a pass. Release certification supports pure Web UI under `web-ui-v1`; strict contract authoring, admission, and structural recomputation support the exact `web_ui` + `api` + `worker` + `database` + `external_integration` combination under `integrated-app-v1`. The public CLI does not register its trusted producer in this release, so structurally passing mixed-surface facts remain `cannot_verify` unless a separately delivered workflow-bound host producer is present. API-only, worker-only, CLI, different mixed combinations, and unknown product surfaces fail before release admission, so report their requested release conclusion as `cannot_verify` without inventing a completion `release_decision`.
- When no completion decision exists, keep `release_decision` absent: report the readiness assessment as `cannot_verify` unless a separately established current failed fact proves the candidate is not release-ready. Never convert an inadmissible sweep into a derived `cannot_verify` decision.

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

## Product-Manager Progress Reports

For every meaningful implementation checkpoint and the final reply, the main Codex translates internal Team evidence into a one-screen product-manager body in this order:

- `完成与验收`: describe verified behavior as “用户现在可以……”, followed by the product manager's action, expected result, actual result, and direct evidence.
- `测试覆盖`: summarize capability, scenario, result, and untested boundary in product language; do not paste agent reports or use a command name or green gate as the explanation.
- `未完成与下一验收点`: state uncompleted or unverified behavior, failed checks, product impact, and the next acceptance point. Never present unverified work as complete.

Agent activity, files changed, and slices closed are not product outcomes. Do not lead with paths, commit hashes, schema versions, gate or slice IDs, agent/backend details, JSON, or command lists. Keep those exact facts in a short `技术追溯` section after the acceptance body when they aid audit or handoff. Structured agent output, ledgers, receipts, and raw logs remain internal evidence inputs rather than user-facing report prose.

Generate canonical phase status with `codex-workflow project-phase-report <task-id> <phase-id>`. The scaffold is only an unprojected sentinel; do not hand-write acceptance coverage, receipt results, or a release decision into it.

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

In the final reply, follow the product-manager structure above. Put the task id, agents/backends used, paths, exact commands, and commits in `技术追溯`; keep actionable residual product risk in the acceptance body.
