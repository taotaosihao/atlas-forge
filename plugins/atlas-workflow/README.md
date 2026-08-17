# Atlas Workflow Plugin

This directory is the source for the local `Atlas Workflow` plugin.

## Dual-Host Layout

This plugin installs into both Codex and Claude Code from the same tree, additively:

- `.codex-plugin/plugin.json` and `.claude-plugin/plugin.json` are separate manifests for each host; their `version` fields are kept in sync by `scripts/bump-plugin-cachebuster.sh`.
- `skills/` is shared verbatim — `SKILL.md` frontmatter (`name` + `description`) is already host-neutral.
- `commands/` (6 files) and `agents/` (7 files) exist only for Claude Code; Codex uses `$atlas-workflow:<name>` skill invocation and `.codex/agents/*.toml` instead, both unchanged.
- `hooks/hooks.json` exists only for Claude Code and forwards to the same `workflow/hooks/{pre,post}-tool-use` scripts Codex installs directly via `~/.codex/hooks.json`, through the `claude-hook-launcher` path-resolution shim in `scripts/`.

Codex behavior is unchanged by any of this; see
[`docs/atlas-workflow/20260815-001-atlas-claude-code-support/implementation-plan.md`](../../docs/atlas-workflow/20260815-001-atlas-claude-code-support/implementation-plan.md)
for the full scope.

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

Clarify is main-only by default. It creates a read-only child only when an
independent evidence domain or specialist perspective has a concrete consumer
and material latency/risk value; task size, file count, a short request, or a
non-tiny label do not justify fan-out by themselves. When two or more such
independently justified lanes are ready, Clarify may dispatch them in parallel
with at most three child lanes in a wave. Once Team is selected, the controller
dispatches the admitted ready frontier in bounded waves with
`child_count = min(ready independent lanes, host available child slots, 4)`.
The soft wave caps are not completion or stop conditions. These are controller
policies, not runtime scheduler invariants. Duplicate lanes,
dependency-not-ready inputs, unavailable exact routes, and confirmed cost
anomalies do not create substitute fan-out; the main Codex remains the sole
canonical writer and final synthesizer. `record-only` and
`effective_backend=none` remain compatibility outcomes but are not parallel
evidence. Ordinary `$atlas-workflow:task` and `$atlas-workflow:cw` do not
auto-upgrade to Clarify fan-out or Team.

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
lane is independently justified, planning and formal plan/contract review use
the non-persistent `planning-review` frontier route by default. The current
native mapping uses Sol, including `xhigh` formal review; an explicitly selected
and admitted Fable or another high-tier exact route may replace a named lane.
Only an explicit user/operator per-lane selection may choose a lower model
before implementation. Saving mode is available only after explicit Execute
authority and routes implementation, its browser verification and exploration
to Luna, and implementation-slice review and verification to Terra. Quality
mode remains an explicit all-Sol implementation choice. None of these modes
rewrites the root host model, persists into workflow state, or changes the
lane's goal, paths, authority, or acceptance. Every mode uses explicit spawn
fields and `fork_turns="none"`; none relies on a global default subagent model.

The planning-review/saving/quality Atlas custom-agent profiles intentionally
leave `model`, `model_reasoning_effort`, and `model_provider` unset. Codex gives
values pinned in a custom-agent file precedence over explicit spawn values,
which would otherwise silently disable the stage-aware matrices. The
provider-bound DeepSeek equivalent profiles are the explicit exception and must
match their checked-in ZenMux/model/`max` policy. The model-policy checker uses
`planning-review` when `--mode` is omitted, rejects routing pins, and validates
the applicable pinned equivalent profiles; each admitted native dispatch must
supply its exact matrix values explicitly. Run `atlas-agent-model-policy check
--mode saving` only for authorized implementation Execute, and use `--mode
quality` before an explicitly selected all-Sol implementation dispatch.

The root-session provider is also unchanged. DeepSeek V4 Pro is a child-local
ZenMux route only: `model_provider = "zenmux"` belongs in the selected DeepSeek
custom-agent profile, not in the root session. A bare DeepSeek `model` override
on the inherited `explorer` or `implementer` role does not switch providers and
must fail closed when the child metadata does not prove the ZenMux route. Every
Atlas DeepSeek profile and catalog route uses `max`; Atlas never silently lowers
the requested effort to `high` or another compatibility value. If the current
host rejects native `max`, the exact DeepSeek child route is unavailable and
falls back according to the lane policy without changing its configured effort.

Routine implementation keeps Luna as the default native single writer and
offers `atlas-sdd-implementer-deepseek` / `deepseek-v4-pro:deepseek` as an
availability-gated native ZenMux alternative with the exact same implementer
instructions, inherited sandbox semantics, owned paths, acceptance inputs, and
report contract. Atlas never sends the same writable packet to both candidates
or uses a shared checkout for duplicate-writer cross-validation. Concurrent
Luna and DeepSeek implementation is allowed only for explicitly authorized,
disjoint path ownership with an integration owner and the applicable
lease/quiescence boundary. A writable fallback starts only after the previous
writer is proven quiesced and its diff/untracked evidence is preserved.

For read-heavy implementation exploration, the native
`atlas-sdd-explorer-deepseek` / `deepseek-v4-pro:deepseek` route is an
availability-gated alternative to Luna with the same read-only role contract.
Its upstream ZenMux `/models` identity remains
`deepseek/deepseek-v4-pro`; Atlas validates both boundaries and never guesses
or interchanges the identifiers. During Execute, Atlas keeps Luna as the
ordinary single-dispatch default, selects DeepSeek only for an explicit
non-OpenAI perspective after a live route preflight, and dispatches both only
when independent cross-checking materially lowers a named risk or the user
explicitly requests it. Planning and contract discovery stays on the frontier
planning-review route unless an exact per-lane override exists. Dual dispatch
is never a fixed fan-out; the main Codex reconciles evidence and discloses any
lost provider perspective.

The DeepSeek profiles keep provider metadata in the managed custom-agent files
but obtain authentication through `atlas-zenmux-bearer-token`, which reads the
existing `~/.codex/zenmux-deepseek.config.toml` only when `CODEX_HOME` has mode
700 and that profile has mode 600. Agent files and model catalogs contain no
credential. For Codex hosts that deliver a native custom-provider child an
empty visible Payload plus OpenAI-encrypted content, Atlas writes the same
self-contained packet to `atlas-native-agent-inbox` before the native
`spawn_agent` call. The equivalent profiles read only the stable slot for their
logical role when no plaintext assignment is visible; this is a 700/600
assignment-transport compatibility path, not a child runner or Paseo fallback.
Atlas deletes the packet only after the attempt is terminal and quiesced.
Refuse-overwrite slots safely serialize affected DeepSeek attempts of the same
role, while Luna and DeepSeek may still cross-check the same packet concurrently.
Atlas still requires task-specific tool/check evidence before calling the route
usable.

`atlas-team-model-catalog` builds a credential-free root catalog projection from
the official cache plus the isolated DeepSeek catalog. It preserves every
official entry, promotes the exact Luna entry to `multi_agent_version=v2` only
while the official catalog has not done so, and adds
`deepseek-v4-pro:deepseek` as v2. The isolated entry must declare the configured
`low`, `high`, and `max` efforts exactly once and use `max` as Atlas's default.
Point the user-level `model_catalog_json` at
`~/.codex/model-catalogs/atlas-team.json`, regenerate it after either input
catalog changes, and start a new task. This supplies normal catalog eligibility
metadata; it does not bypass host allowlists, entitlement, or schema validation.

When Paseo is explicitly selected, Atlas discovers provider, model, thinking,
and callable mode capability at runtime and does not read Paseo orchestration
preferences.
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
`product_release` execution-vnext lease and admission remain unchanged; Atlas does
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

A newly authored `product_release` uses contract semantics v6, execution-plan
schema version 4, brief schema version 4, and Team execution-vnext. Every Profile
check runs in one terminal slice that depends on all implementation slices and
binds the same final source, artifact, surface inventory, config, runtime, and
data candidate. Official digest-pinned adapters recompute typed facts from raw
evidence; passing commands, screenshots, design approval, Business Acceptance,
or agent/reviewer approval cannot write the decision.

Brief v4 and persistent execution authority also bind the contract's exact
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

- `.codex-plugin/plugin.json`: Codex plugin metadata
- `.claude-plugin/plugin.json`: Claude Code plugin metadata
- `agents/*.md`: Claude Code agent definitions, mapped from `.codex/agents/*.toml` (DeepSeek/ZenMux custom-provider variants have no Claude Code equivalent and are not mapped)
- `commands/*.md`: Claude Code slash commands for the 6 highest-frequency entrypoints (task, team, clarify, intake, finish, cw); the remaining skills are reachable by name through Claude Code's own skill discovery
- `hooks/hooks.json`: Claude Code hook registration; forwards to `workflow/hooks/*` via `scripts/claude-hook-launcher`
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
