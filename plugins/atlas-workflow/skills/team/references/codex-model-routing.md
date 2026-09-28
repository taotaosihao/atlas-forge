# Codex model routing

Codex-only. Claude Code never loads this file. On Codex, read it in full before
any model or tool preflight or native dispatch; the Team skill keeps authority,
staffing, backend selection, and review rules for both hosts.

## Contents

- Native Exact Model Routing: root/child provider invariant, exact model
  matrices, preflight, and Routing Scenarios
- Cross v1 · Codex-Native Cross-Model Recipe (deprecated; historical
  compatibility material, not an available route)

## Native Exact Model Routing

Codex-only: this section and all its subsections do not apply on Claude Code. Deprecated DeepSeek/ZenMux branches below must not be selected.

### Root Session And Child Provider Invariant

The root Codex session keeps its active model, `model_provider`, authentication,
and catalog unchanged. Atlas never changes the root provider merely to make a
DeepSeek lane available. A DeepSeek route is child-local: only the selected
`atlas-sdd-planner-deepseek`, `atlas-sdd-reviewer-deepseek`,
`atlas-sdd-explorer-deepseek`, or `atlas-sdd-implementer-deepseek` profile may
bind `model_provider = "zenmux"` and `deepseek-v4-pro:deepseek`.

- A `model` override is not a provider switch. Never send
  `deepseek-v4-pro:deepseek` through a built-in `planner`, `reviewer`,
  `explorer`, or `implementer` role, or through a profile whose effective
  provider is not ZenMux.
- If the host exposes model/reasoning overrides but cannot select the
  provider-bound custom profile, classify the DeepSeek route as unavailable at
  the provider-routing layer and fail closed to the resolved fast model or main-only according to
  the lane's fallback rule. Do not retry the same model through the inherited
  provider.
- Every Atlas DeepSeek profile and catalog route uses the exact `max` effort.
  Never lower native `spawn_agent` dispatches to `high`, `medium`, or another
  compatibility value. If the current host rejects `max`, classify that exact
  profile/effort route as host-unavailable and follow the lane fallback policy
  without rewriting the configured effort.
- A DeepSeek child is admitted only when fresh child metadata proves
  `model_provider = "zenmux"` and the exact routed model is
  `deepseek-v4-pro:deepseek`; a ChatGPT-account unsupported-model response or
  an effective `openai` provider is a failed DeepSeek route, not successful
  inference. Preserve the same packet and disclose the lost perspective on
  fallback.

Before the first native fan-out, inspect the model-visible `spawn_agent` schema and require `agent_type`, `model`, `reasoning_effort`, and `fork_turns`. This is a capability check, not authorization to spawn.

- If any required field is absent, classify the native surface as `schema-restricted`, do not start a generic or inherited child, disclose that exact routing is unavailable, and continue main-only.
- If the tool returns a reserved-schema mismatch such as `Function '...' is reserved for use by this model and must match the configured schema`, stop new fan-out and return the exact error plus the version-sensitive MultiAgentV2 remediation to the user. Do not mutate user config or restart a runtime unless the current request explicitly authorizes those operations.
- `task_name` names the child task; it does not select a custom agent. Select the checked-in custom profile only with `agent_type`.
- The planning-review/saving/quality Atlas custom-agent profiles intentionally omit `model`, `model_reasoning_effort`, and `model_provider`. OpenAI custom-agent files take precedence over explicit spawn values, so pinning any of those fields would silently defeat the stage-aware matrices. The provider-bound DeepSeek equivalent profiles are the explicit exception and must match their checked-in `zenmux`/model/`max` policy exactly. Every native dispatch supplies the exact model and reasoning values explicitly.
- Every custom-role spawn sets `fork_turns="none"`. Omitting it defaults to a full-history fork, which is incompatible with exact role/model/reasoning overrides on affected MultiAgentV2 versions.
- A fresh child receives a self-contained dispatch packet containing the lane goal, authority, owned and forbidden paths, necessary decisions and context, acceptance, verification commands, stop conditions, selected lightweight or formal workflow, and expected output. Do not rely on inherited parent history. The role does not select formal admission; preserve it when already active and never infer a downgrade from missing material.
- For any native DeepSeek custom role, write that exact packet through stdin to the stable logical-role slot `atlas-native-agent-inbox put atlas_sdd_planner`, `atlas-native-agent-inbox put atlas_sdd_reviewer`, `atlas-native-agent-inbox put atlas_sdd_explorer`, or `atlas-native-agent-inbox put atlas_sdd_implementer` before calling `spawn_agent`, and also pass the same packet as `message`. The inbox is a narrow compatibility transport for hosts that omit the task message or expose its dynamic payload only as OpenAI-encrypted content to a custom provider; it does not create or run the child and is not a Paseo fallback. The helper accepts only a packet slot matching `[a-z0-9_]+`, refuses overwrite, stores no credentials, and requires the Codex home, inbox, and packet modes to remain 700, 700, and 600 respectively.
- The equivalent profile reads only its own stable logical-role slot, and only when the native task message is absent or has an empty visible Payload plus encrypted content. A host that delivers plaintext remains authoritative and does not use the compatibility packet. An occupied slot blocks another affected dispatch of the same logical role, so DeepSeek planner, reviewer, explorer, and implementer attempts are serialized independently until the host delivers custom-provider assignments normally; an OpenAI peer with a normal plaintext message, including a fast-model peer, may still run concurrently. After the attempt is terminal and quiesced, delete the corresponding role slot. For a follow-up turn on an affected host, first delete the old packet, put the complete follow-up packet into the same role slot, and then call `followup_task`. If packet creation, exact-slot retrieval, or cleanup cannot be proven, fail the DeepSeek route closed instead of guessing or scanning the inbox.
- Child creation, provider metadata, or the inbox `get` alone does not prove usable routing. Admission requires the child to receive the task-specific acceptance input and complete the task's meaningful tool/check loop under the expected read-only or writable authority. Report the assignment-transport layer separately from provider/model admission.
- A local `model_catalog_json` can describe a custom model and its normal multi-agent eligibility metadata to Codex, but it cannot bypass the host/model allowlist, entitlement checks, or add missing fields to the model-visible `spawn_agent` schema. Treat a host rejection as unavailable exact routing, not as a catalog problem that Atlas can override.
- When the current official catalog still marks `gpt-5.6-luna` below MultiAgentV2, the user-authorized installed configuration may point its root `model_catalog_json` at the output of `atlas-team-model-catalog`. The helper preserves every official entry, promotes only the exact Luna entry to `multi_agent_version=v2` when needed, and appends the verified `deepseek-v4-pro:deepseek` entry as v2. It never edits the official cache, carries credentials, or changes host schema code. Regenerate the projection after the official model cache or DeepSeek catalog changes, then start a new task; existing tasks do not hot-reload the allowlist.

Before a planning or plan/contract-review dispatch, run the fail-safe default:

```bash
workflow/bin/atlas-agent-model-policy check
```

This resolves `planning-review` and rejects low-tier native routes. During an
authorized implementation Execute only, validate the lower-cost matrix with
`workflow/bin/atlas-agent-model-policy check --mode saving`. An explicitly
requested frontier implementation route uses `--mode quality`. These checks
validate the checked-in policy/profile projection, including applicable
provider-bound DeepSeek equivalent profiles. They do not prove billing or
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

The catalog inspected for this revision resolves GPT-6 Astra for planning/Clarify. Cross Plan's exact
DeepSeek V4 Pro planner/reviewer profiles are also high-tier routes. Fable or
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
| Implementation replanning (ZenMux alternative) | `atlas-sdd-planner-deepseek` | `deepseek-v4-pro:deepseek` | `max` | `none` |
| Routine implementation | `atlas-sdd-implementer` | resolved fast | `max` | `none` |
| Routine implementation (ZenMux alternative) | `atlas-sdd-implementer-deepseek` | `deepseek-v4-pro:deepseek` | `max` | `none` |
| Implementation slice review | `atlas-sdd-reviewer` | resolved balanced | `max` | `none` |
| Implementation slice review (ZenMux alternative) | `atlas-sdd-reviewer-deepseek` | `deepseek-v4-pro:deepseek` | `max` | `none` |
| Implementation command or business verification | `atlas-sdd-verifier` | resolved balanced | `high` | `none` |
| Completed phase or final integration judgment | `atlas-sdd-phase-reviewer` | resolved frontier | `medium` | `none` |
| Implementation Playwright or visual interaction verification | `atlas-sdd-browser-verifier` | resolved fast | `xhigh` | `none` |
| Implementation read-heavy exploration | `atlas-sdd-explorer` | resolved fast | `max` | `none` |
| Implementation read-heavy exploration (ZenMux alternative) | `atlas-sdd-explorer-deepseek` | `deepseek-v4-pro:deepseek` | `max` | `none` |

A small clear task defaults to the main Codex. Use a subagent only when concrete evidence shows that delegation or specialist review materially lowers risk or latency. The matrix determines how an admitted lane is spawned; it does not require a fixed role set or agent count.

#### Fast Model And DeepSeek V4 Pro Implementation

`atlas-sdd-implementer` and `atlas-sdd-implementer-deepseek` are native alternative implementations of the same logical writable implementation role. Give either candidate the same goal, execution authority, owned and forbidden paths, acceptance criteria, required checks, commit policy, stop condition, and selected workflow. Formal SDD or a required SDD machine consumer retains the canonical brief and `IMPLEMENTER_REPORT_JSON` contract; lightweight work uses the self-contained assignment and concise result. Their profiles preserve the exact same developer instructions and inherit the same host/task sandbox semantics; provider or model choice never grants write authority.

DeepSeek V4 Pro supports the configured `low` / `high` / `max` capability set. Atlas always selects `max` for both the isolated ZenMux catalog and Codex-native DeepSeek child profiles. Do not use compatibility aliases such as `medium`, `xhigh`, or `auto`, and never downshift to `high` when the host rejects `max`; classify the exact route as unavailable instead.

- For a single implementation dispatch, honor an exact user-selected candidate only when its current writable route is available. Otherwise use the resolved fast model by default; choose DeepSeek V4 Pro only after the exact ZenMux alias, custom profile, host admission, assignment delivery, tool loop, and required write/check behavior have passed under the implementer role. Direct-profile inference or a standalone tool call does not prove the native writable child route.
- Keep one writer for a tightly coupled implementation lane. Never send the same writable packet to both the fast-model role and DeepSeek, and never use duplicate writers in one shared checkout as implementation cross-validation. Use independent read-only exploration, review, or verification to cross-check implementation evidence.
- Run fast-model and DeepSeek implementers concurrently only for explicitly authorized, genuinely independent lanes with disjoint owned paths, a named integration owner, and the applicable lease/quiescence boundary. Model diversity alone does not justify a second writer.
- Before retrying or falling back from either implementer to the other, prove the predecessor writer is quiesced, preserve its diff and untracked evidence, and keep the same goal, authority, paths, acceptance, and checks. If writer state or ownership is uncertain, stop instead of starting the replacement.
- If the host admits the model but omits the assignment payload, tools, or write semantics for the child, classify that exact layer as unavailable and disclose it. Do not interpret child creation, an idle response, or direct-provider success as completed implementation routing.

#### Fast Model And DeepSeek V4 Pro Implementation Exploration

During an authorized implementation Execute, `atlas-sdd-explorer` and
`atlas-sdd-explorer-deepseek` are native alternative implementations of the
same logical read-only exploration role. They receive the same lane goal,
authority, forbidden paths, acceptance input, verification request, stop
condition, and expected evidence shape. Their profiles preserve the same
read-only sandbox and developer-instruction semantics; provider or model choice
never changes mutation authority. Planning and contract discovery instead use
the frontier planning-review matrix unless an exact per-lane override exists.

- For a single exploration dispatch, honor an exact user-selected candidate when it is currently available. Otherwise use the resolved fast model by default; choose DeepSeek V4 Pro only when a current availability preflight passed and the lane explicitly values a non-OpenAI perspective. Do not use catalog order, price, an inferred slug, or a prior successful text reply as the selector.
- DeepSeek V4 Pro is currently available only when the live ZenMux `/models` response contains the exact non-deprecated upstream ID `deepseek/deepseek-v4-pro`, the Codex catalog maps the exact routed alias `deepseek-v4-pro:deepseek`, the custom profile is discovered, and the current host admits that exact provider/model route. Do not substitute either identifier for the other at its boundary. A plain completion proves inference only; claim full agent/tool-loop availability only after the assigned agent completes at least one tool call under the expected role and authority.
- The fast-model route likewise requires profile discovery and host admission of the resolved `atlas-sdd-explorer` model at `max` effort. Do not infer availability solely from the parent model or catalog presence.
- Dispatch both candidates only when the user explicitly requests both perspectives or independent cross-validation materially reduces a concrete risk. This is a per-lane decision, never a default fan-out. Start both from the same self-contained packet and keep their results independent until both first-round reports are complete.
- The main Codex compares evidence, identifies agreement and material disagreement, verifies disputed facts when feasible, and makes the final synthesis. Do not decide by majority, silently merge incompatible claims, or let one agent broaden the other's authority.
- If one candidate fails before producing useful evidence because its provider, model, auth, catalog, schema, quota, or tool loop is unavailable, disclose the failed layer. A single-candidate lane may retry the same packet once on the other currently available candidate; a requested dual-perspective lane reports the lost perspective rather than pretending fallback preserved independent cross-validation. Useful but conflicting output is not an availability failure and must be synthesized as disagreement.
- If neither resolved route is available, continue main-only and disclose the missing perspective. Never spawn a generic or inherited child as a substitute.

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
| `routine-implementation` | `default-fast-model-or-explicit-available-deepseek-single-writer` | `implicit-quality-model-or-default-dual-writer` |
| `implementation-fallback` | `same-authority-takeover-after-writer-quiescence` | `overlapping-or-uncertain-writer-takeover` |
| `plan-or-contract-review` | `default-frontier-medium-formal-reviewer-or-explicit-exact-override` | `implicit-low-tier-or-saving-route` |
| `implementation-review-verify` | `default-balanced-reviewer-max-or-verifier-high` | `saving-route-before-execute-authority` |
| `hard-to-reverse-direction` | `default-frontier-high-planner` | `implicit-low-tier-planner` |
| `completed-phase-extra-judgment` | `default-frontier-medium-phase-reviewer` | `phase-reviewer-for-routine-review` |
| `implementation-browser-heavy` | `default-fast-xhigh-browser-verifier` | `low-tier-browser-route-before-execute-authority` |
| `implementation-exploration-single` | `fast-model-or-deepseek-by-live-availability-and-explicit-route` | `default-dual-fanout-or-pre-execute-saving` |
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

## Cross v1 · Codex-Native Cross-Model Recipe

Cross v1 is a **generation-local, controller-enforced, non-crash-resumable,
non-certification-gate** Team recipe. The user must explicitly select Cross for
the current Team generation; it is never a global default or an implicit
upgrade from Saving. The main Codex owns dispatch, disagreement extraction,
convergence, and disclosure. Cross keeps the selected runtime agent ids,
profiles, route/effort facts, degradation marker, and convergence conclusion
only in the current controller context (or an existing rolling checkpoint or
decision file when one is already required). It does not add Cross state,
bindings, events, schema, candidate certificates, continuation attempts, or a
machine-enforced slice-completion gate.

### Cross Plan

The default panel sends the same self-contained packet to an OpenAI
`atlas-sdd-planner` at `gpt-6-astra` / `high` and a DeepSeek
`atlas-sdd-planner-deepseek` at `deepseek-v4-pro:deepseek` / `max`, with
`fork_turns="none"`. Their first-round plans are independent and are not
shown to each other. The main Codex extracts only material disagreements about
scope, risk, acceptance, or implementation direction, then uses
`followup_task` on the original planner runtime id for targeted reconsideration;
it never creates a new actor to impersonate a planner. The main Codex compares
the evidence and converges one plan as `CONSENSUS`,
`CONSENSUS_WITH_RESERVATIONS`, or `HUMAN_DECISION_REQUIRED`.

If the exact DeepSeek route is unavailable, Cross may use two OpenAI planner
runtime ids that are different actors, from the same self-contained packet and
with independent first rounds. Record `cross-plan-perspective-missing` and do
not claim multi-supplier consensus; the highest convergence outcome is
`CONSENSUS_WITH_RESERVATIONS`. If the required planner actor, packet, or useful
discussion is unavailable, fail Cross closed.

### Cross Execute

The default pair is an OpenAI `atlas-sdd-implementer` on Saving Luna `max` and
a DeepSeek `atlas-sdd-reviewer-deepseek` on `deepseek-v4-pro:deepseek` / `max`.
When the user explicitly selects a DeepSeek writer, pair
`atlas-sdd-implementer-deepseek` with the OpenAI `atlas-sdd-reviewer` on Sol
`xhigh`. Both reviewer profiles are hard `sandbox_mode = "read-only"`. Cross
Execute keeps this reviewer high-tier because its mandatory pre-review examines
the real brief and contract before implementation starts; the implementation
stage does not require a downgrade merely because Saving is allowed there.

Before a writer starts, the selected reviewer must complete a meaningful
read-only pre-review of the real brief, repository, owned scope, acceptance
criteria, and verification boundary. A missing reviewer route, incomplete
pre-review, or untrusted read-only boundary prevents writer startup. Each
execute slice has exactly one implementer. After the writer returns its report
and stops writing, send the actual diff, checks, and current acceptance to the
same reviewer runtime id with `followup_task`. Actionable current-goal repair
findings go back to the original implementer with `followup_task`; rereview
always goes back to the original reviewer. Never introduce a second writer,
automatic rotation, or a replacement actor when actor identity, route/profile,
quiescence, or review delivery drifts; any such drift fails Cross closed.

The user may explicitly switch to ordinary Saving Team when Cross is
unavailable, but that new route is not Cross and must not be reported as Cross
success. Cross has no Paseo fallback, Claude or Fable runtime/config/fallback,
or release-certification authority. It proves only the configured native
profiles, requested routes, runtime actor identities, and useful outputs; it
does not provide cryptographic provider or billing attestation, and it never
creates or substitutes formal release certification.

DeepSeek's `:deepseek` suffix identifies the model supplier in the routed model
name; `zenmux` identifies the transport/provider configuration. Keep those
concepts separate and bind both exactly in the provider-bound profiles. Do not
infer a supplier registry, billing proof, or a future Grok/Kimi route from this
recipe; add another supplier only after its exact model, transport, auth, and
capability are independently verified.
