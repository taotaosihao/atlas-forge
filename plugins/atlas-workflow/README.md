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
- `$atlas-workflow:3d-harness` (source-checkout exploration only)

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

Clarify and Team use a bounded-parallel controller policy. A non-tiny Clarify
defaults to `main + at least one read-only child lane`; when two or more
independent, ready, non-duplicate unknown clusters have explicit consumers,
the controller dispatches them in parallel (the first Clarify wave has at most
three child lanes). Once Team is selected, the controller dispatches the
admitted ready frontier in bounded waves with
`child_count = min(ready independent lanes, host available child slots, 4)`.
The soft wave cap is not a completion or stop condition. This is controller
policy, not a runtime scheduler invariant. Tiny work, duplicate lanes,
dependency-not-ready inputs, unavailable exact routes, and confirmed cost
anomalies fail closed; the main Codex remains the sole canonical writer and
final synthesizer. `record-only` and `effective_backend=none` remain valid
compatibility outcomes but are not parallel evidence. Ordinary `$atlas-workflow:task`
and `$atlas-workflow:cw` do not auto-upgrade to Team.

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

Native Team model routing is downstream of staffing, not a reason to create
staffing. A small clear task stays on the main Codex; after a Team or subagent
lane is independently justified, Saving mode is the non-persistent default and
routes implementation, browser verification, and exploration to Luna, routine
review and verification to Terra, and planning/phase judgment to Sol. Quality
mode is a separate per-Team or per-lane choice that activates only when the user
explicitly requests it and routes admitted roles to Sol with their configured
reasoning effort. Neither mode rewrites the root host model, persists saving or
quality into workflow state, or changes the lane's goal, paths, authority, or
acceptance. Both modes use explicit spawn fields and `fork_turns="none"`; neither
relies on a global default subagent model.

Native Atlas custom-agent profiles intentionally leave `model`,
`model_reasoning_effort`, and `model_provider` unset. Codex gives values pinned in
a custom-agent file precedence over explicit spawn values, which would otherwise
silently disable either Saving mode or all-Sol Quality mode. The model-policy
checker resolves the Saving matrix from the current catalog and fails when a
native profile pins any of those routing fields; each admitted native dispatch
must supply its exact matrix values explicitly. Run
`atlas-agent-model-policy check --mode quality` before an all-Sol dispatch to
validate the Sol role matrix and its reasoning levels against that same catalog.

The root-session provider is also unchanged. Atlas routes a selected DeepSeek
Flash alternative through Paseo's direct `deepseek` provider with model
`deepseek-v4-flash:deepseek` and thinking `max`; Team never sends that model
through native `spawn_agent`. The checked-in native DeepSeek profiles and
isolated Codex catalog remain manual diagnostic compatibility surfaces only.
They do not authorize a Team dispatch or a fallback through the inherited root
provider.

Routine implementation keeps Luna as the default native single writer and
offers a Paseo `deepseek/deepseek-v4-flash:deepseek` attempt as an
availability-gated alternative with the exact same goal, authority, owned
paths, acceptance inputs, checks, stop condition, and report contract. Atlas
never sends the same writable packet to both candidates
or uses a shared checkout for duplicate-writer cross-validation. Concurrent
Luna and DeepSeek implementation is allowed only for explicitly authorized,
disjoint path ownership with an integration owner and the applicable
lease/quiescence boundary. A writable fallback starts only after the previous
writer is proven quiesced and its diff/untracked evidence is preserved.

For read-heavy exploration, the same Paseo DeepSeek route is an
availability-gated alternative to Luna with the same read-only authority,
input, and expected evidence contract. Paseo's direct provider currently
exposes `auto` rather than an enforced Codex read-only sandbox, so Atlas uses
Luna whenever technical read-only isolation is required and rejects any
mutation from a DeepSeek exploration attempt. Atlas keeps Luna as the ordinary
single-dispatch default, selects DeepSeek only for an explicit non-OpenAI
perspective after a live route preflight, and dispatches both only when
independent cross-checking materially lowers a named risk or the user
explicitly requests it. Dual dispatch is never a fixed fan-out; the main Codex
reconciles evidence and discloses any lost provider perspective.

Before a DeepSeek Paseo dispatch, Atlas reads the user orchestration preferences
and requires the Atlas-specific implementation or research key to resolve to
`deepseek/deepseek-v4-flash:deepseek`. It then checks the live provider/model
catalog for the direct `deepseek` provider, exact model, `max`, and a callable
mode. Implementation uses `full-access` only after write authorization;
exploration uses `auto` with an explicit read-only contract. Agent creation or a
text reply is only preflight; usable routing requires task-specific tool/check
evidence. The exact `Invalid assistant message: content or tool_calls must be
set` failure poisons that Paseo history, so Atlas never sends a follow-up to the
same agent and instead quiesces it before one fresh attempt or Luna/main
fallback.

`atlas-team-model-catalog` remains a credential-free native Codex catalog
projection for Luna eligibility and manual diagnostics. It cannot authorize a
DeepSeek Team route, bypass host allowlists, or replace Paseo capability
discovery.

When Paseo is selected, Atlas reads Paseo orchestration preferences and then
discovers provider, model, thinking, and callable mode capability at runtime.
Provider mode IDs are not portable and must not be hardcoded or copied across
providers. Generic routing may recommend only models whose trusted capability
identity is explicitly non-Claude, including providers in Atlas's controlled
direct-provider identity map. Unknown gateway aliases are never automatically
recommended. Any direct or gateway Claude-family model requires an exact
provider/model manually supplied by the user or operator; Atlas never chooses,
completes, upgrades, or substitutes a Claude model. An unknown identity requires
an exact controller-attested provider/model selection; without one it fails as
`MODEL_FAMILY_UNVERIFIED`, while an attested attempt remains visibly unverified.
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
- `$atlas-workflow:product-design`: turn a chosen user-visible direction into an approved critical scenario and minimal flow-and-surface Design Handoff.
- `$atlas-workflow:clarify`: lock a chosen direction into execution boundaries, acceptance criteria, and verification.

They share the same task artifact directory:

- `context.md`: facts, current state, source-of-truth files, assumptions, and risks
- `decision.md`: product/design options, tradeoffs, recommendation, and rejected alternatives
- `spec.md`: goal, non-goals, decision boundaries, acceptance criteria, and verification plan

Product Design is the narrow layer between direction selection and execution
clarification for user-visible features. It produces A/C/D/E artifacts covering
one critical scenario, capability truth, surface responsibilities, necessary
states, formal content/data behavior, three primary-flow accessibility baselines,
and one conditional viewport rule. It is not a complete visual designer, Design
System, WCAG certification, or responsive matrix. Route “critical scenario”,
“user flow”, “screen flow”, “flow-and-surface”, and “Design Handoff” requests
here when direction is already chosen; keep pure backend, migration, CLI, and
tiny no-interaction changes in Task or Clarify. Design approval, passing checks,
and a handoff do not certify, install, deploy, publish, or release a product.

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

## Product Release Certification

Atlas classifies the target governed by a contract separately from the current
work type. A request explicitly asking for formal release certification,
`release-ready`, or `certified` is `product_release`; without that formal intent,
an MVP, Beta, internal test/dogfood, or small-scope public beta is
`product_increment`. Planning or review that directly authors or gates a named
externally usable candidate retains `product_release` only with that explicit
intent. An explicit spike, prototype, or demo is `exploration` and must remain
isolated from production identity, data, runtime, distribution, and
release-readiness claims. A standalone analysis, document, or review that
governs no candidate may use `non_product` with a substantive reason.

### Product Increment (快速产品通道)

`product_increment` is a routing and reporting term, not a fourth release-intent
schema branch. It normally uses the main Codex or the lightest applicable Task
flow. Team may be selected only for an independent collaboration or review need;
the increment must omit release-intent, v4, immutable Profile, release receipt,
and release-decision machinery. Reclassify to explicit `product_release` intent
before using those release controls. Validate the product with real
startup, its most important end-to-end user flow, related checks that actually
ran and passed, and an explicit review for feature, data, permission, and
security blockers. Do not perform unauthorized deployment, publication,
shared-environment writes, or irreversible operations.

For a small public beta, also make access control/anonymous boundaries, data and
sensitive-information isolation, credential handling, rollback or close path,
and one real-entrypoint smoke explicit. Report the exact commands, exits, and
key conclusions. If real checks passed but recorder/evidence collection failed,
the product increment may complete with `证据采集：降级` and the reason. Failed,
unrun, or unknown real checks still block. A product increment never creates a
`release_decision`, and its evidence cannot be called `certified` or
release-ready or substituted for the fail-closed release path.

Staffing, Team, path lease, model choice, and release mode are independent
decisions. A
main-only single writer and read-only/review/verifier work do not need a path
lease; one isolated product-increment Team writer without fallback, takeover, or
external concurrency does not require one by default. Concurrent writers,
fallback/takeover, uncertain quiescence, or an external shared writer require
non-overlapping ownership plus the existing lease/quiescence boundary. Strict
`product_release` execution-v3 lease and admission remain unchanged; Atlas does
not build a general lease runtime for the quick path.

When formal release intent is explicit, `MVP`, `Beta`, limited release, GA, and
scaled operation change scope or maturity, not the formal-quality floor; those
labels alone select `product_increment`. Release certification supports a pure
Web UI through immutable Profile `web-ui-v1`. Strict contract authoring,
admission, and structural recomputation support the exact
`web_ui` + `api` + `worker` + `database` + `external_integration` combination
through immutable Profile `integrated-app-v1`. The public CLI does not register
a trusted producer for that Profile in this release, so structurally passing
mixed-surface facts remain `cannot_verify` unless a separately delivered,
workflow-bound trusted producer is supplied by the host. API-only, worker-only,
CLI, different mixed combinations, and unknown product surfaces fail
authoring/admission until an exact dedicated Profile exists; report their
release-readiness assessment as `cannot_verify` without inventing a completion
decision or relabeling the product.

A newly authored `product_release` uses contract semantics v4, execution-plan
schema version 2, brief schema version 3, and Team execution-v3. Every Profile
check runs in one terminal slice that depends on all implementation slices and
binds the same final source, artifact, surface inventory, config, runtime, and
data candidate. Official digest-pinned adapters recompute typed facts from raw
evidence; passing commands, screenshots, design approval, Business Acceptance,
or agent/reviewer approval cannot write the decision.

Brief v3 and persistent execution authority also bind the contract's exact
`work_type`. Planning and review may continue to govern a `product_release` in
Team discuss mode, but release-bearing execution and completion require the
hash-bound value `implementation`; no other work type can derive a release
decision.

Only the completion-derived `release_decision.status=certified` supports a
source-level release-ready claim. `denied` means an admissible same-candidate
sweep contains a failed fact; `cannot_verify` means such a sweep contains an
unresolved fact. Without Team authority, or with an inadmissible, mixed, or
stale sweep, the system produces no decision. Certification never authorizes
installation, push, deployment, publication, or actual release.

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

`$atlas-workflow:3d-harness` is currently available only from this Atlas Forge
source checkout on its frozen Apple Silicon Mac/Node profile. It reuses the
existing `codex-web-acceptance` evidence kernel and never installs dependencies,
downloads Chromium, refreshes cache, or makes release claims automatically. See
[`tools/atlas-3d-harness/README.md`](tools/atlas-3d-harness/README.md).

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
- `skills/3d-harness/SKILL.md`: source-checkout-only reviewed-local 3D acceptance entry
- `tools/atlas-3d-harness/README.md`: 3D runtime CLI, evidence, safety, and host limits
