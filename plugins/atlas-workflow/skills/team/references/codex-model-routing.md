# Codex model routing

Codex-only. Claude Code never loads this file. On Codex, read it in full before
any model or tool preflight or native dispatch; the Team skill keeps authority,
staffing, backend selection, and review rules for both hosts.

## Contents

- Native Exact Model Routing: root session invariant, exact model matrices,
  preflight, and Routing Scenarios

## Native Exact Model Routing

Codex-only: this section and all its subsections do not apply on Claude Code. DeepSeek/ZenMux routes and the Cross recipe are removed; any still-installed DeepSeek profile must not be selected.

### Root Session Invariant

The root Codex session keeps its active model, `model_provider`, authentication,
and catalog unchanged; Atlas never changes the root provider to make a lane
available.

- A `model` override is not a provider switch. Never route a model through a
  role or profile whose effective provider does not serve it.

Before the first native fan-out, inspect the model-visible `spawn_agent` schema and require `agent_type`, `model`, `reasoning_effort`, and `fork_turns`. This is a capability check, not authorization to spawn.

- If any required field is absent, classify the native surface as `schema-restricted`, do not start a generic or inherited child, disclose that exact routing is unavailable, and continue main-only.
- If the tool returns a reserved-schema mismatch such as `Function '...' is reserved for use by this model and must match the configured schema`, stop new fan-out and return the exact error plus the version-sensitive MultiAgentV2 remediation to the user. Do not mutate user config or restart a runtime unless the current request explicitly authorizes those operations.
- `task_name` names the child task; it does not select a custom agent. Select the checked-in custom profile only with `agent_type`.
- The planning-review/saving/quality Atlas custom-agent profiles intentionally omit `model`, `model_reasoning_effort`, and `model_provider`. OpenAI custom-agent files take precedence over explicit spawn values, so pinning any of those fields would silently defeat the stage-aware matrices. Every native dispatch supplies the exact model and reasoning values explicitly.
- Every custom-role spawn sets `fork_turns="none"`. Omitting it defaults to a full-history fork, which is incompatible with exact role/model/reasoning overrides on affected MultiAgentV2 versions.
- A fresh child receives a self-contained dispatch packet containing the lane goal, authority, owned and forbidden paths, necessary decisions and context, acceptance, verification commands, stop conditions, selected lightweight or formal workflow, and expected output. Do not rely on inherited parent history. The role does not select formal admission; preserve it when already active and never infer a downgrade from missing material.
- Child creation or provider metadata alone does not prove usable routing. Admission requires the child to receive the task-specific acceptance input and complete the task's meaningful tool/check loop under the expected read-only or writable authority. Report the assignment-transport layer separately from provider/model admission.
- A local `model_catalog_json` can describe a custom model and its normal multi-agent eligibility metadata to Codex, but it cannot bypass the host/model allowlist, entitlement checks, or add missing fields to the model-visible `spawn_agent` schema. Treat a host rejection as unavailable exact routing, not as a catalog problem that Atlas can override.
- When the current official catalog still marks `gpt-5.6-luna` below MultiAgentV2, the user-authorized installed configuration may point its root `model_catalog_json` at the output of `atlas-team-model-catalog`. The helper preserves every official entry and promotes only the exact Luna entry to `multi_agent_version=v2` when needed; until the helper is retired it still requires the isolated DeepSeek catalog input and appends that deprecated entry, which must not be selected. It never edits the official cache, carries credentials, or changes host schema code. Regenerate the projection after either input catalog changes, then start a new task; existing tasks do not hot-reload the allowlist.

Before a planning or plan/contract-review dispatch, run the fail-safe default:

```bash
workflow/bin/atlas-agent-model-policy check
```

This resolves `planning-review` and rejects low-tier native routes. During an
authorized implementation Execute only, validate the lower-cost matrix with
`workflow/bin/atlas-agent-model-policy check --mode saving`. An explicitly
requested frontier implementation route uses `--mode quality`. These checks
validate the checked-in policy/profile projection. They do not prove billing or
inference metadata. The resolved profile and explicit dispatch values must
agree on model and reasoning effort. Run `workflow/bin/atlas-agent-model-policy
resolve --mode <mode>` against the current `codex debug models` catalog for the
dispatch model IDs; the capability descriptions select the model, so the model
values below are capabilities rather than pinned IDs. A
matching catalog entry and supported effort are necessary, but actual host
admission and a useful child tool loop remain separate checks.

### Default Planning And Contract Review Mode

Before implementation Execute authority, default every admitted planning and
formal plan/contract-review lane to a frontier model. The no-argument policy
check resolves this matrix:

| Lane | `agent_type` | `model` | `reasoning_effort` | `fork_turns` |
| --- | --- | --- | --- | --- |
| Planning or replanning | `atlas-sdd-planner` | resolved frontier | `high` | `none` |
| Formal plan or contract review | `atlas-sdd-phase-reviewer` | resolved frontier | `medium` | `none` |
| Additional independent plan or contract review | `atlas-sdd-reviewer` | resolved frontier | `medium` | `none` |

The catalog inspected for this revision resolves GPT-6 Astra for planning/Clarify. Fable or
another high-tier model may replace a named lane only when a current user or
operator explicitly selects the exact provider/model route and that route is
available and admitted. The same exact per-lane authority may explicitly choose
a lower model, but Atlas never infers that exception from cost, task simplicity,
or the existence of Saving mode. An unavailable requested model fails that
exact route closed; it does not fall back to a balanced, fast, or another low-tier
route for planning or contract review.

Use the formal `atlas-sdd-phase-reviewer` for the final review of a plan or
implementation contract. Under the default planning-review matrix this is the
resolved frontier model at medium effort and it keeps the existing `REVIEW_VERDICT_JSON`
machine contract. The routine `atlas-sdd-reviewer` remains available for an
additional independent high-tier read-only review, but its balanced route below
is an implementation-slice route only. Ordinary engineering opinions belong
outside formal admission; missing review material cannot silently downgrade a
formal review to a prose response.

### Implementation-Stage Saving Mode

Saving mode is available only after explicit user implementation authority has
entered Execute. It may reduce cost for implementation work and implementation
evidence loops; it must never author or review a plan or contract, and it must
never be inferred for Discuss. Use this exact-routing matrix only after staffing
has independently established that the lane is useful:

| Lane | `agent_type` | `model` | `reasoning_effort` | `fork_turns` |
| --- | --- | --- | --- | --- |
| Implementation replanning | `atlas-sdd-planner` | resolved frontier | `high` | `none` |
| Routine implementation | `atlas-sdd-implementer` | resolved fast | `max` | `none` |
| Implementation slice review | `atlas-sdd-reviewer` | resolved balanced | `max` | `none` |
| Implementation command or business verification | `atlas-sdd-verifier` | resolved balanced | `high` | `none` |
| Completed phase or final integration judgment | `atlas-sdd-phase-reviewer` | resolved frontier | `medium` | `none` |
| Implementation Playwright or visual interaction verification | `atlas-sdd-browser-verifier` | resolved fast | `xhigh` | `none` |
| Implementation read-heavy exploration | `atlas-sdd-explorer` | resolved fast | `max` | `none` |

A small clear task defaults to the main Codex. Use a subagent only when concrete evidence shows that delegation or specialist review materially lowers risk or latency. The matrix determines how an admitted lane is spawned; it does not require a fixed role set or agent count.

#### Implementation Writers And Exploration

- Keep one writer for a tightly coupled implementation lane. Never send the same writable packet to two implementers, and never use duplicate writers in one shared checkout as cross-validation; cross-check implementation evidence with independent read-only exploration, review, or verification.
- Before retrying or falling back to another implementer, prove the predecessor writer is quiesced, preserve its diff and untracked evidence, and keep the same goal, authority, paths, acceptance, and checks. If writer state or ownership is uncertain, stop instead of starting the replacement.
- Dual exploration of the same question is a per-lane decision, never a default fan-out: use it when the user asks for both perspectives or independent cross-checking materially reduces a concrete risk. Start both from the same self-contained packet, keep their first rounds independent, and the main Codex compares evidence rather than voting.
- Planning and contract discovery use the frontier planning-review matrix unless an exact per-lane override exists. When one of two exploration candidates fails before producing useful evidence, disclose the failed layer and the lost perspective instead of presenting a fallback as independent cross-validation; useful but conflicting output is a disagreement to synthesize, not an availability failure. Never silently merge incompatible claims or let one agent broaden another's authority.
- If the host admits a model but omits the assignment payload, tools, or write semantics for the child, classify that exact layer as unavailable and disclose it. If no resolved route is available, continue main-only; never spawn a generic or inherited child as a substitute.

Use the frontier phase-reviewer by default for formal plan or contract review, and
use it for a completed phase/final integration result where
extra judgment is valuable, when explicitly requested, or after a
non-mechanical implementation review/verification failure whose cause remains
unclear. During implementation, formatting, import, typo, port, network,
credential, and other mechanical or environmental failures stay on the
ordinary reviewer/verifier path selected by the implementation mode. Browser
evidence reaches the phase-reviewer only when final or phase acceptance benefits
from extra judgment; routine implementation UI smoke and regression checks stay
with the browser verifier or reviewer/verifier selected by the implementation
mode and its configured effort.

### Explicit Quality Mode For Implementation

Planning and plan/contract review already default to high-tier routing. During
implementation, enter quality mode only when the user explicitly requests
quality mode, frontier routing, or an equivalent higher-quality routing choice
for the current Team or named lanes. Do not infer a frontier implementation
route from task difficulty, a failed check, reviewer disagreement, or available
budget. The explicit choice does not persist into later tasks.

Before the first quality-mode dispatch, run `workflow/bin/atlas-agent-model-policy check --mode quality` against the same current catalog and unpinned native profiles.

In quality mode, keep the same `agent_type`, `fork_turns="none"`, staffing rules, and self-contained dispatch packet, but use the following resolved model and supported reasoning values as explicit per-spawn overrides:

| Lane | `agent_type` | `model` | `reasoning_effort` | `fork_turns` |
| --- | --- | --- | --- | --- |
| Planning | `atlas-sdd-planner` | resolved frontier | `max` | `none` |
| Implementation | `atlas-sdd-implementer` | resolved frontier | `medium` | `none` |
| Review | `atlas-sdd-reviewer` | resolved frontier | `xhigh` | `none` |
| Verification | `atlas-sdd-verifier` | resolved frontier | `medium` | `none` |
| Phase or final integration judgment | `atlas-sdd-phase-reviewer` | resolved frontier | `xhigh` | `none` |
| Browser or visual verification | `atlas-sdd-browser-verifier` | resolved frontier | `medium` | `none` |
| Exploration | `atlas-sdd-explorer` | resolved frontier | `high` | `none` |

The model difference between implementation Saving mode and this table is an
intentional, user-authorized override. Outside that explicit override, if the
dispatch, policy, model, or reasoning values mismatch, do not spawn until the
checked-in configuration is reconciled.

Visible runtime metadata is optional disclosure, not a daily audit gate. When the tool or UI does not expose trustworthy model evidence, state that billing-level model verification was not performed; do not claim the billing model is verified and do not add persistent runtime-log parsing solely for this workflow. If expensive inheritance or cost loss is confirmed, stop new fan-out, perform only minimal read-only diagnosis, and fall back to main-only. Ask the user only when remediation needs configuration, runtime, installation, log upload, upstream issue, release, or another mutation outside current authority.

### Routing Scenarios

| Scenario ID | Allowed decision | Disallowed decision |
| --- | --- | --- |
| `tiny-clear` | `main-by-default; evidence-backed-specialist-allowed` | `fixed-team-fanout` |
| `routine-implementation` | `default-fast-model-single-writer` | `implicit-quality-model-or-default-dual-writer` |
| `implementation-fallback` | `same-authority-takeover-after-writer-quiescence` | `overlapping-or-uncertain-writer-takeover` |
| `plan-or-contract-review` | `default-frontier-medium-formal-reviewer-or-explicit-exact-override` | `implicit-low-tier-or-saving-route` |
| `implementation-review-verify` | `default-balanced-reviewer-max-or-verifier-high` | `saving-route-before-execute-authority` |
| `hard-to-reverse-direction` | `default-frontier-high-planner` | `implicit-low-tier-planner` |
| `completed-phase-extra-judgment` | `default-frontier-medium-phase-reviewer` | `phase-reviewer-for-routine-review` |
| `implementation-browser-heavy` | `default-fast-xhigh-browser-verifier` | `low-tier-browser-route-before-execute-authority` |
| `implementation-exploration-single` | `fast-model-by-live-availability-or-explicit-route` | `default-dual-fanout-or-pre-execute-saving` |
| `implementation-exploration-cross-check` | `same-input-dual-dispatch-when-risk-reduced-or-explicit` | `different-authority-or-implicit-fanout` |
| `quality-mode-explicit` | `all-frontier-with-role-specific-reasoning` | `implicit-or-automatic-quality` |
| `schema-restricted` | `main-only; disclose-routing-unavailable` | `generic-inherited-fanout` |
| `profile-mismatch` | `block-spawn; reconcile-policy-profile` | `spawn-with-mismatched-model` |
| `metadata-invisible` | `disclose-unverified; no-billing-proof-required` | `claim-billing-model-verified` |
| `confirmed-cost-anomaly` | `stop-new-fanout; readonly-diagnosis; main-only` | `continue-fanout-or-mutate-runtime` |
| `single-ready-lane` | `dispatch-one-admitted-lane` | `fan-out-unadmitted-or-duplicate` |
| `duplicate-lane` | `coalesce-duplicate-no-fanout` | `duplicate-cross-check-by-default` |
| `dependency-not-ready` | `defer-until-dependency-ready` | `dispatch-before-dependency-ready` |
| `ready-frontier-bounded` | `bounded-parallel-ready-frontier` | `unbounded-or-not-ready-fanout` |
| `record-only-compatibility` | `effective_backend-none-legal-no-parallel-evidence` | `reject-zero-dispatch-finalize` |

Use this table as a decision contract, not as a fixed sequence of lanes.
