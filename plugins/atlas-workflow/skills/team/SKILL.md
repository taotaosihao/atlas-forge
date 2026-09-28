---
name: team
description: Coordinates multiple agents for Atlas work through the current host's native collaboration, using Paseo lanes only when explicitly selected. Use when the user asks for a team or agents, or when independent lanes, specialist review, or parallel work materially reduce risk or latency.
---

Decide whether Team is needed from the user's current request, including the requested collaboration style, latency needs, and risk. Use `$atlas-workflow:team` when the user asks for multiple agents or when independent lanes or a distinct specialist/reviewer materially serve those needs; otherwise stay with the main Codex. Multiple files, behavior changes, task complexity, or the existence of an implementation contract do not require Team by themselves. Ordinary `$atlas-workflow:task` and `$atlas-workflow:cw` do not auto-upgrade to Team. Once Team is selected, its controller defaults to bounded parallel dispatch over the admitted ready frontier rather than main-first serial exploration; this is a controller policy, not a runtime scheduler invariant. An MVP, Beta, internal test, or small-scope public beta without explicit formal certification is `product_increment`: Team may be selected only for an independent collaboration or review need, while release-intent, v4, immutable Profile, release receipt, and release-decision machinery must be omitted. Reclassify to explicit `product_release` intent before using those release controls.

## Host Note

Codex invokes this flow as `$atlas-workflow:team`; Claude Code invokes it as `/atlas-workflow:team` or by calling the `atlas-workflow:team` skill. "The main Codex" below refers to the current host's root/main session regardless of host — on Claude Code that is the main Claude Code session. See `## Codex Native Collaboration` and the paired `## Claude Native Collaboration` section below for the host-specific dispatch tool mapping; staffing, authority, path ownership, evidence, and release rules apply to both hosts. Select the host before model or tool preflight:

- Claude Code: use only `## Claude Native Collaboration` for native tools and model selection, and do not read `references/codex-model-routing.md`. Its Cross recipe, exact-model routing (including every planning/saving/quality matrix and Routing Scenarios subsection), Codex catalogs, `atlas-agent-model-policy`, `fork_turns`, and `reasoning_effort` are not Claude prerequisites.
- Codex: use `## Codex Native Collaboration`, and read [references/codex-model-routing.md](references/codex-model-routing.md) in full before any model or tool preflight or native dispatch.
- `team-v1` and DeepSeek/ZenMux routes are deprecated. Do not select, recommend, revive, or fall back to them; retained legacy recipes are historical compatibility material, not available routes. This also excludes the DeepSeek-dependent Cross recipe.
- Explicit Paseo lanes retain their own admission and fallback rules; installing or using Claude Code does not select Paseo.

## Independent Staffing, Model, Release, And Lease Decisions

Keep three decisions independent:

- `staffing_mode` is `main` or `team` and answers whether extra agents are
  useful.
- `model_policy` is the current host model, the default frontier route for
  planning and plan/contract review, implementation-only saving routing after
  execute authority, or an explicitly requested per-lane override.
- `release_mode` is `product_increment` or `product_release` and answers the
  acceptance level; only explicit formal certification, `release-ready`, or
  `certified` intent selects `product_release`.

Do not create Team just to obtain a model route. Team does not imply saving or
quality mode, and either model choice does not require Team. The main Codex
keeps the current host model; Atlas does not rewrite the root host model.
Planning/review, implementation-saving, quality, and exact-override selection is
a per-task or per-lane dispatch choice and is not persisted as workflow state.
A lane may choose its own model within the admitted policy, but cannot change
the goal, authority, paths, or acceptance. The Claude-family manual exact-model
gate remains unchanged for explicit Paseo routing; it does not require a new model selection for Claude-native inheritance.

Choose a path lease from actual write-conflict risk, separately from staffing:

- Main-only single writers, read-only analysis, discussion, review, and
  verification have no lease requirement.
- A `product_increment` Team with one isolated writer and no fallback, takeover,
  or external concurrent writer does not require a lease by default.
- That quick-path single writer does not enter execution-vnext or acquire a durable
  writable-attempt solely because Team is available; keep strict execution-vnext
  admission for `product_release` unchanged.
- Two or more possible writers require non-overlapping path ownership; use the
  existing lease/quiescence boundary when available. Fallback, takeover,
  uncertain old-writer quiescence, or a shared-workspace external writer must
  retain that boundary, and uncertainty stops new writers.
- Formal `product_release` execution continues to use the existing execution-vnext
  lease and admission rules. Do not create a general Team-independent lease
  runtime in the quick path.

## Bounded-Parallel Controller Policy

For a corrected or evidence-challenged decision, first apply the shared
[decision supersession protocol](../../references/decision-supersession.md).

Once Team is selected, the controller first freezes the admitted Goal and
constructs dependency and ownership information, then dispatches the current
ready frontier. Run useful independent child lanes alongside main integration
work; when the frontier contains two or more admitted, independent,
ready lanes, they run in the same bounded wave by default. Once their outputs are consumed,
continue with the sole writer when no useful independent lane remains; Team
selection does not require continuous delegation. This is controller
policy, not a runtime scheduler invariant, and it does not add a ledger or schema
field.

- A lane is admitted only with a frozen Goal or controller-admitted
  `current-required` reference, a named output consumer, ready input, a
  read-only evidence domain or disjoint owned/forbidden paths, consumer-appropriate output,
  authority and stop condition, and a reason tied to critical-path time, root
  context cost or a named risk. Duplicate lanes, dependency-not-ready lanes, outputs without a
  current consumer, uncertain writer lease/quiescence, unavailable exact
  spawn/profile/model/reasoning/backend routes, and confirmed cost anomalies
  fail closed instead of creating fan-out.
- Compute each soft wave with
  `child_count = min(ready independent lanes, host available child slots, 4)`.
  The `4` is an initial soft wave cap, not a completion or stop condition;
  synthesize the current wave, recompute the frontier, and continue with another
  wave while admitted lanes remain ready. A user-authorized wider frontier may
  expand the wave only while routing, authority, writer, and release gates stay
  intact.
- The main Codex remains the integration owner, controller authority, sole
  canonical writer for shared scope/artifacts, and final acceptance owner.
  Parallel writers are allowed only for explicitly disjoint owned paths with an
  integration owner and the applicable lease/quiescence boundary; tightly
  coupled implementation remains single-writer. Keep the root context small:
  when such a lane is admitted, give long journeys, iterative diagnosis and
  large-output inspection to a child that cannot modify the candidate under
  test, and take back its
  conclusion, failure signature and evidence paths. At an acceptance point the
  root rereads the raw result itself, including the pass marker, exit status
  and resource cleanup. Child findings never broaden
  the Goal or silently create workflow artifacts.
- `record-only` compatibility and `effective_backend=none` remain legal
  zero-dispatch outcomes, but neither is evidence of admitted dispatch or
  parallel completion. A missing exact route, schema-restricted/profile-mismatch
  surface, or cost anomaly therefore stays main-only/fail-closed; do not use a
  generic or inherited child as a substitute for an unavailable exact route. Claude-native model inheritance is its admitted default, not such a substitution.

## Language

Write workflow artifacts, project documents, and user-facing summaries in Chinese by default. Preserve commands, paths, identifiers, APIs, proper nouns, and quoted errors when accuracy benefits.

Keep user-facing replies and summaries in plain, conversational language. Do not surface internal process jargon such as `canonical scope source`, `staffing_mode`, `release_mode`, or `frozen Goal` to the user; explain the idea in everyday Chinese first (for example “本次范围以哪份文档为准”), adding the original term in parentheses only when it is genuinely needed.

## Backend Selection

Team selection and backend selection are separate decisions. A request for `$atlas-workflow:team`, multiple agents, parallel work, specialist review, or a difficult task does not select Paseo.

- Outside Team, stay with the main Codex unless Team materially reduces latency or risk.
- Inside Team, default to the current host native collaboration: Codex tools on Codex, Claude tools on Claude Code. Deprecated DeepSeek/ZenMux profiles are not selectable.
- Select Paseo only from an explicit user or operator choice scoped to the Team, a lane, or one dispatch. Resolve backend and fallback policy independently in this order: dispatch, lane, Team, then `backend=native` and `fallback_policy=codex`.
- A review-lane Paseo choice does not transfer to implementation. A Team-level Paseo choice may be overridden by an explicit native lane or dispatch.
- `no-fallback` is an explicit opt-out and normalizes to `fallback_policy=none`; otherwise an operational Paseo failure falls back to Codex in the same logical lane.
- Preserve the resolved backend, policy, authority, goal, paths, and mutation permissions when work starts. Later configuration changes do not rewrite an active dispatch.
- Never read or apply Paseo orchestration preferences. Atlas owns routing; Paseo only manages an explicitly selected runtime lifecycle.

When durable Team state has audit or handoff value, use the v2 Team ledger commands to record controller-attested selection, dispatch, attempt, admission, fallback, and convergence. A free-form provider summary or the presence of Paseo is not proof that Paseo was selected.

## Codex Native Collaboration

Before any Codex dispatch, read [references/codex-model-routing.md](references/codex-model-routing.md) in full.
Native collaboration is the normal Team backend. Use the smallest useful set of concrete lanes:

- Use the current callable native `spawn_agent` tool for concrete bounded lanes that can run independently. Exact Atlas routing expects `agents.spawn_agent` after activation. A host that exposes only a restricted `collaboration.spawn_agent` remains usable only when its model-visible schema passes the exact-routing preflight in [references/codex-model-routing.md](references/codex-model-routing.md).
- `collaboration.send_message` for information that does not need a new turn.
- `collaboration.followup_task` to reuse an idle agent for a new bounded task.
- `collaboration.wait_agent` only while live work remains.
- `collaboration.list_agents` to inspect current capacity and status.
- `collaboration.interrupt_agent` only to stop work that is still running and should no longer continue.

Freeze the minimum Goal and ready frontier with the main Codex, then prefer
parallel native agents for admitted independent lanes when parallelism materially
improves latency or lowers risk; do not make main-first serial exploration the
Team default. Do not impose a fixed role set or agent count beyond the bounded
wave policy above. Tightly coupled changes keep one writable owner; multiple
writers require disjoint path ownership, an integration owner, and no overlapping
writer lease. Agent completion is evidence, not controller admission.

## Claude Native Collaboration

On Claude Code, use the callable `Agent` tool and the seven plugin profiles under `agents/*.md`. Use the exact profile identifier exposed by the host (including a plugin namespace when present), not a guessed Codex `agent_type`. If `Agent` or the required profile is unavailable, stay main-only and disclose the missing capability.

- Leave the model override unset. Atlas's Claude profiles do not pin `model`; the host resolves the model from the user's session/configuration. Inheritance is the default and does not require an exact-provider selection event, a Codex catalog, or `atlas-agent-model-policy check`. An explicitly requested different model must be supported by the current Claude tool/configuration; do not silently substitute it or rewrite the root model. Do not claim model/provider diversity merely from separate agents.
- Pass a self-contained task prompt with the goal, authority, active decisions, owned and forbidden paths, acceptance, checks, stop conditions, and expected output. Use the current `Agent` schema; never send Codex-only `agent_type`, `reasoning_effort`, or `fork_turns` fields.
- Keep the returned agent/task identifier. Use `SendMessage` for follow-up only when available for that agent; otherwise use the host's exposed resume mechanism. Receive foreground completion directly; for background work use the host completion notification or `Read` on the returned output path (`TaskOutput` only when exposed by that host). Use `TaskStop` only when the host exposes it for the running task. Missing lifecycle tools do not justify inventing calls or starting a replacement writer before the old one is quiesced.
- `TaskList` / `TaskGet` describe tracked work items, not a complete inventory of live agents. Determine available capacity and completion from actual dispatch results and host status; do not treat an empty task list as proof that no writer is running.
- Planner, formal reviewer, implementation, ordinary reviewer, verifier, browser verifier, and explorer roles keep the same authority and output contracts. Use `atlas-sdd-phase-reviewer` for formal plan/contract review and retain `REVIEW_VERDICT_JSON`; model inheritance does not relax review independence, path ownership, leases, or release acceptance.
- Do not use the deprecated DeepSeek/ZenMux profiles or `atlas-native-agent-inbox` transport. Use `main-claude` when a main-session `runtime_agent_id` sentinel is needed for independent-perspective bookkeeping.

The [Claude subagent documentation](https://code.claude.com/docs/en/sub-agents) and [tools reference](https://code.claude.com/docs/en/tools-reference) describe the host surfaces. The current callable schema remains the authority for available fields and lifecycle tools.

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

This gate applies only to the explicitly selected Paseo lanes in this section, not to Claude Code native agents inheriting the host model.

Claude-family models are never eligible for automatic routing or model recommendation, whether exposed by the direct `claude` provider or through a gateway.

- Use Claude only when the user or operator manually supplies an exact provider and model ID in a controller-attested model-selection event for the current Team run and scope.
- Live catalog discovery may validate that exact selection; it must not choose, complete, upgrade, or substitute a Claude model.
- Classify model identity from trusted structured capability or Atlas's controlled direct-provider identity map as `claude`, `non-claude`, or `unknown`. A gateway alias or insufficient metadata outside that map is `unknown`, not non-Claude.
- Missing exact manual Claude selection returns `CLAUDE_MODEL_SELECTION_REQUIRED`. An unknown family without an exact controller-attested provider/model selection returns `MODEL_FAMILY_UNVERIFIED`. An exact attested unknown selection may proceed while remaining visibly unverified. Rejected admission does not start an agent or count as an operational fallback.
- For a valid exact selection on the direct `claude` provider, add Paseo's callable Claude mode ID directly to every launch command: `paseo run --provider claude --model "<exact-model-id>" --mode bypassPermissions ... "<prompt>"`. Do not omit the option, shorten it to the display label `bypass`, substitute `default`, `auto`, or `acceptEdits`, or use Claude Code's lower-level `--permission-mode` flag in a Paseo command.
- If a valid manually selected Claude model is unavailable at runtime, preserve the requested perspective and use the recorded Codex fallback policy; never silently choose another Claude model.

### Paseo Lifecycle And Codex Fallback

- Reserve the attempt and any path-scoped writer lease before `paseo run`; bind the returned exact agent/workspace/worktree identity immediately after launch. Use a stable launch operation ID so recovery can reconcile a run/bind crash window without launching a second actor.
- Replaying a pending launch claim may execute only `paseo ls --global --label <exact-label>`. An exact match records the factual receipt and permits bind; missing or ambiguous results record reconciliation evidence, keep the attempt `launch-state-unknown`, retain its writer lease, and never replay `paseo run`.
- Resolve `launch-state-unknown` only with `team-attempt-record --action=resolve-launch` targeting the exact pending claim and launch operation, `--disposition=no-actor-confirmed`, a canonical `user-message:` or `operator-input:` authority ref, a single-line reason, and non-empty canonical task-artifact evidence. This records an indeterminate claim and interrupted unlaunched attempt; quiesce with evidence before retry or fallback. Never use it as a broad reset.
- If a verification command claim survives controller termination, do not run its argv again. `verify-resolve` may mark only the exact pending operation and claim `indeterminate` with a new operation ID, canonical controller authority, reason, and task-artifact evidence. It records no verification receipt or required-gate pass; replan or failed/cancelled closure must remain explicit.
- Reuse an existing reviewer with exact-ID `send` and wait for real completion; do not busy-poll. Stop only the exact actor when continued execution would conflict, exceed scope, or waste material resources. Never use broad stop, daemon restart, agent delete, or provider mutation.
- Treat quota/credits, trusted 429/Retry-After, provider/model/mode/auth unavailability, CLI/daemon failure, runtime crash, and timeout with no useful output as operational failures only when a trusted control/runtime observation supports the classification. Task output, tests, code defects, review findings, disagreement, or missing authority are not backend failures.
- An automatic retry is a new append-only attempt, happens at most once for a dispatch, and requires the predecessor to be quiesced. Fallback likewise requires a quiesced Paseo predecessor.
- Before a writable fallback, preserve diff/worktree/base/head/untracked evidence, prove the original writer is quiesced, and obtain a takeover permit and non-overlapping lease. If any fact is unknown, stop the lane instead of starting another writer.
- Atomically record the fallback event and reserve the native attempt in the same logical lane. The native actor continues the same goal, paths, authority, acceptance, and admitted evidence; fallback never widens scope or hides Paseo provenance.

## Codex Model Routing

Codex-only. Before any model or tool preflight or native dispatch on Codex, read
[references/codex-model-routing.md](references/codex-model-routing.md) in full: it
holds the exact-model rules, the planning/saving/quality matrices, the Routing
Scenarios, and the deprecated Cross v1 recipe. Claude Code does not load it.

## Modes And Authority

When choosing or inheriting checks, measurements or diagnostic code, including
direct Team entry, load the shared
[Verification guidance](../../references/verification.md). For a child selecting
verification methods or changing tests, harnesses or diagnostics, include a
resolvable reference and the applicable boundaries in its existing self-contained
dispatch packet and require it to read them; do not depend on parent history.
Unrelated read-only fact-finding lanes need no such load. This adds no brief field
or agent role and does not alter formal admission or required gates.

### Discuss

- Use discuss for read-only options, architecture, diagnosis, risk review, or a second opinion.
- Discuss does not authorize implementation, commits, deployment, release, or other mutation.
- Discuss lanes never acquire writable attempts or writer leases; an explicitly authorized writable deliverable follows the applicable Execute path below.

The dispatch packet states the already selected lightweight or formal path.
Ordinary discussion, review, and quick-path implementation use the existing
self-contained assignment and a result suited to its consumer; do not create
formal briefs, review packages, or SDD JSON solely for an agent role. Active
formal admission or a required SDD machine consumer retains its exact input and
output contracts, including for `product_increment`. Missing formal material
is a gap, not permission to downgrade. This does not change model routing.

### Execute

- Use execute only after an explicit user implementation request. Do not infer it from a plan, review, decision file, roadmap, or prior discuss round.
- For the single-writer quick path described under [Independent Staffing, Model, Release, And Lease Decisions](#independent-staffing-model-release-and-lease-decisions), use the current scope, owned paths, related checks, and applicable business acceptance without creating a formal grant or receipt. Reassess writer isolation when its stated conditions change.
- The CLI admission steps below apply only after formal execution admission has been selected; they do not select it for a lightweight task. Record that execute start or promotion with the explicit message reference. Native is the default; an explicitly selected Paseo Team also records its controller-attested selection authority:

```bash
codex-workflow team-record-start <task-id> "<objective>" --mode execute --authorization-ref <user-message-ref> --brief <canonical-brief.json> --operation-id <id>
codex-workflow team-record-start <task-id> "<objective>" --backend paseo --mode execute --selection-authority-kind user-message --selection-authority-ref <user-message-ref> --authorization-ref <user-message-ref> --brief <canonical-brief.json> --operation-id <id>
codex-workflow team-promote <task-id> --to execute --authorization-ref <user-message-ref> --brief <canonical-brief.json> --operation-id <id>
```

- `authorization_ref` is an audit guard against accidental promotion, not a host capability. Never fabricate it from workflow artifacts.
- Formal execute start and promotion require canonical brief schema v4 binding an admitted contract semantics v5 or v6. Before compilation, `codex-team-brief` runs the same full semantic validator and canonical authority-slice checks as strict new-authoring lint, binds a sorted and duplicate-free snapshot of every authority input file into the brief, and performs a stable recheck before writing. Team recomputes those identities from the current canonical files and binds them into the exact scope/grant digest on authorize, replay, admission, verification, acceptance, completion, and replan; task mismatch, missing files, symlinks, or byte/existence drift fail closed. Team also revalidates contract/plan digests, the exact v5→execution-plan v3 or v6→execution-plan v4 mapping, release policy when present, base, dependencies, size gate, permanent checks, and global writer scope while holding the global admission lock. Historical semantics v3/v4 and brief schema v3 remain read-only discussion compatibility.
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

For a business-function delivery, conditionally load the shared
[Business Acceptance](references/business-acceptance.md) rules and inherit the
current approved design or plan's requirements before executing that flow. The
same condition applies to a direct Team entry when Task did not preload the
reference; it does not require `$atlas-workflow:project-verification`, an
existing map, or an extra protocol selection. Use one related set of business
objects through every required step, perform required UI actions through the UI,
and check the final business result and applicable readbacks. Record the actual
design comparison, evidence, and breakpoints in the existing task/contract,
scenario, or report carrier. Ordinary technical, library, CLI, maintenance, and
read-only Team tasks do not activate this rule; BAF artifacts remain limited to
contracts that already require them.

For an explicit video-and-manual request, including an ordinary technical task
or direct Team entry, load only the **Optional operation-guide delivery** section
of the shared [Business Acceptance](references/business-acceptance.md) reference
and carry the choice in the current verification plan. This material-only
selection does not activate business-object, UI, BAF or release requirements.

## Release Certification

Release-readiness invariant: only a Team execution-vnext product_release whose immutable Profile final sweep binds one unchanged candidate and yields the completion-derived release_decision.status=certified may be called source-level release-ready; it never proves or authorizes installation, push, deployment, publication, or actual release. Task/slice/agent/review completion, passing tests, screenshots, Business Acceptance, design approval, or MVP/Beta labels never grant release-ready status.

- Classify target delivery independently from work type. Planning or review that directly authors or gates a named externally usable candidate retains `product_release` only when the request explicitly asks for formal certification, `release-ready`, or `certified`; without that intent it is `product_increment`. Neither completion can certify by prose alone. Only standalone work whose contract governs no release candidate may be `non_product` with a substantive reason. Explicit demo/prototype/spike work is `exploration`, remains isolated, and cannot make product-stage or release-readiness claims.
- A newly authored explicit `product_release` uses contract semantics v6, execution-plan schema version 4, brief schema version 4, and the exact immutable Profile binding. Release-bearing `execution-vnext` admission and completion require the hash-bound `work_type=implementation`. Historical semantics-v4 planning/review briefs may retain `product_release` only as read-only `discuss-v3` compatibility. When formal release intent is explicit, `MVP`, `Beta`, limited release, GA, and scaled operation share the same Profile floor; those labels alone route to `product_increment`.
- Its `target_delivery_authority_ref` must exactly equal the current controller-recordable `user-message:` or `operator-input:` execution authorization. Unresolved `goal:` and `current-required:` references cannot enter release certification.
- Every Profile check belongs to one terminal release-certification slice that transitively depends on all other executable slices. Its fresh receipts must bind the same final source, artifact, surface inventory, config, runtime, data, intent, policy, and final worktree candidate.
- The release collector reloads the digest-pinned official adapters, recomputes typed facts from raw inputs, and compares them before completion derives the decision. Adapter consistency, self-authored raw data, content hashes, stdout, and arbitrary passing commands are not producer authority; missing workflow-bound producer provenance makes the fact `cannot_verify`. Agents, reviewers, verifiers, and controller-authored prose cannot create or overwrite `release_decision`.
- Report a completion-derived `certified`, `denied`, or `cannot_verify` exactly. Missing, stale, mixed-candidate, or malformed final-sweep evidence is never promoted to a pass. Release certification supports pure Web UI under `web-ui-v1`; strict contract authoring, admission, and structural recomputation support the exact `web_ui` + `api` + `worker` + `database` + `external_integration` combination under `integrated-app-v1`. The public CLI does not register its trusted producer in this release, so structurally passing mixed-surface facts remain `cannot_verify` unless a separately delivered workflow-bound host producer is present. API-only, worker-only, CLI, different mixed combinations, and unknown product surfaces fail before release admission, so report their requested release conclusion as `cannot_verify` without inventing a completion `release_decision`.
- When no completion decision exists, keep `release_decision` absent: report the readiness assessment as `cannot_verify` unless a separately established current failed fact proves the candidate is not release-ready. Never convert an inadmissible sweep into a derived `cannot_verify` decision.

## Minimal Agent Planning

1. Freeze the minimum Goal and construct the dependency/ownership ready frontier with the main Codex. In a selected Team, dispatch admitted independent lanes in bounded parallel waves by default; spawn only concrete bounded lanes whose results materially change latency or risk.
2. Choose roles from the actual task; there is no default role set or required agent count. Do not add lanes merely to follow the model preference table.
3. Use one writable owner for tightly coupled changes. Multiple writable agents require disjoint path/module ownership and an explicit integration owner.
4. Reviewers and verifiers stay read-only unless a focused repair is assigned.
5. Do not create staffing artifacts or omitted-role inventories solely to prove that planning occurred. Record ownership only when handoff, concurrent writes, audit, or risk makes it useful.
6. Agent completion is evidence, not automatic acceptance; the main Codex integrates and verifies the result.

## Goal And Roadmap Continuity

- The current user request and existing authoritative spec define the goal. Do not create a second roadmap/scope state machine.
- Treat "complete implementation" as authorization to cross all internal slices only when the current authorized goal already is the named roadmap or all listed phases. Continue that roadmap without routine confirmation while the goal, authority, and safety boundaries stay unchanged. Persistence wording alone does not expand a narrower goal.
- A roadmap document alone does not authorize implementation. Internal slices are scheduling/checkpoint units, not new permission boundaries or the default product architecture or naming namespace. In implementation objectives and dispatch prompts, make stable domain/capability identity more prominent than task, Gate, phase, slice, or acceptance labels; those delivery labels may remain in workflow metadata and task names.
- Return when the whole authorized goal is complete, continuing needs new authority or a user-owned decision, or an external state must change. A stalled or repeating repair loop follows the shared verification guidance's design-signal rule.
- Elapsed time, rounds, agents, commits, tokens, and tool calls are telemetry, not default semantic stop conditions; journey rerun counts trigger replanning under that rule.

## Product-Manager Progress Reports

For every meaningful implementation checkpoint and the final reply, the main Codex translates internal Team evidence into a one-screen product-manager body in this order:

- `完成与验收`: describe verified behavior as “用户现在可以……”, followed by the product manager's action, expected result, actual result, and direct evidence.
- `测试覆盖`: summarize capability, scenario, result, and untested boundary in product language; do not paste agent reports or use a command name or green gate as the explanation.
- `未完成与下一验收点`: state uncompleted or unverified behavior, failed checks, product impact, and the next acceptance point. Never present unverified work as complete.

Agent activity, files changed, and slices closed are not product outcomes. Do not lead with paths, commit hashes, schema versions, gate or slice IDs, agent/backend details, JSON, or command lists. Keep those exact facts in a short `技术追溯` section after the acceptance body when they aid audit or handoff. Structured agent output, ledgers, receipts, and raw logs remain internal evidence inputs rather than user-facing report prose.

Generate canonical phase status with `codex-workflow project-phase-report <task-id> <phase-id>`. The scaffold is only an unprojected sentinel; do not hand-write acceptance coverage, receipt results, or a release decision into it.

## Deliberative Team Review

For a substantive Team review, first define the actual review scope: the working tree, commit range, pull request, phase, or named files; the applicable goal and authoritative contract; and the evidence or checks already available.

Formal plan or contract review keeps the existing machine consumer: the formal
reviewer must receive the required materials and emit `REVIEW_VERDICT_JSON`.
Ordinary review opinions may be supplied outside formal admission, but missing
materials never authorize an automatic format downgrade.

- Recommend complementary review perspectives and agent count from the actual task. There is no required council shape. Two or three perspectives are often useful, but this is guidance rather than a staffing gate. When the risk justifies it, include a perspective that owns the strongest evidence-backed counterargument or tradeoff instead of duplicating another general reviewer.
- Let each selected reviewer form an independent first-round position before seeing the other reviewers' conclusions. Findings should state the affected path and line when applicable, the concrete evidence, impact, and recommendation; uncertainty belongs in an explicit evidence gap rather than a clean verdict.
- Keep useful review agents available after their initial findings. The main Codex integrates the first-round results, combines duplicates without erasing provenance or dissent, makes an evidence-backed interim ruling, and sends only the material objections and ruling back to the same relevant agents with `paseo send` or native `followup_task`. Do not replay the full history or involve every role in every finding.
- Review discussion should normally converge within two or three rounds. This is an operating target, not a hard semantic limit. Continue beyond it only while a material disagreement remains and another focused exchange or verification can add evidence or change the final recommendation. Apply the shared verification guidance when selecting repair checks. The main Codex may adjudicate ordinary duplication, wording, severity, and scope differences from the user goal, authoritative contract, and repository evidence.
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
- Review repairs at each independently deliverable outcome, covering the repair diff and relevant integration surface; do not ban new regressions, and do not reopen unrelated repository-wide discovery by default. Review a repair immediately when it touches permission, identity, lock order, transaction boundaries, final-send eligibility or data provenance.
- Continue repair only while a verifiable implementation or evidence change materially advances the current goal. A repeating repair loop follows the shared verification guidance's design-signal rule; record `fix_progress_stalled` and return the concrete blocker only when that analysis cannot continue without a person, instead of generating more lanes or artifacts.
- Run a branch/integration review when parallel writes, cross-module coupling, migration, security, release, or comparable risk justifies it; it is not an unconditional final ritual.

## Commits And Context

- Match commit timing to the work phase: commit a solution/contract as one logical outcome when it is finally confirmed; during authorized implementation, prefer moderate logical commits that are independently understandable, verified, and reversible.
- Keep one primary reason per commit and include its tests/necessary docs. Do not commit every step, slice, or repair round, and do not accumulate an entire roadmap into one oversized diff.
- When an independently understandable result meets its acceptance, consume its review and verification, reconcile its diff and ownership, and update the existing handoff state before expanding the next delivery batch. Commit only when authorized and safely isolatable; mixed prior work is not a reason to force a commit or block unrelated authorized work. This adds no approval or artifact gate.
- Stage only current-task paths or hunks. A commit does not authorize push, PR, deployment, release, cache refresh, or other external mutation.
- For work crossing compaction or handoff, keep one non-Git rolling checkpoint: current goal, active constraints, completed work, next critical path, diff/verification state, and real blockers/follow-ups. Replace each capability's old conclusion, remaining gap, and next action together; remove superseded blockers and link historical evidence. Retain identities, resources, and failures in the current text only when the next action depends on them, and keep active safety constraints in their own section. For a tracked task, record each checkpoint update with `codex-workflow checkpoint` and act on its budget warnings by pruning, an authorized verified commit (execution-vnext commits only after `done`) or a narrower batch; the warnings never force a commit. Engineering results cannot overwrite user decisions.

## Optional Protocols

Load optional protocol references when the current contract actually requires
them or when a business-function delivery needs the shared business acceptance
rules. This conditional load also covers a direct Team entry and does not depend
on Task having preloaded a reference, a Project Verification Map, or an explicit
protocol choice:

- Read `references/sdd.md` for Codex-native SDD JSON contracts, slice ledger, implementer/reviewer reports, or `codex-team-*` helpers.
- Read `references/business-acceptance.md` for business scenario, stakeholder, protocol/device, dual-goal UI acceptance, or any business-function delivery whose current design/plan defines acceptance requirements.
- Read `references/code-review.md` when a substantive code or merge-readiness review needs the optional perspective menu, evidence checklist, focused deliberation prompts, or synthesis shape.
- First-code and Product/UI gates belong to the selected implementation contract and the clarify/task skills; do not duplicate their full rules here. Execute admission binds their production identities, and reaching the exact first-code stop before acceptance durably pauses the grant until explicit replan.

## Final Disclosure

When Paseo was selected or a fallback occurred, report the selection scope and authority, configured/resolved/attempted/effective backend, actual provider/model/mode when verified, operational failure class, controlled retry, fallback actor, and preserved output/diff/worktree evidence. State any lost provider perspective or reduction in independent evidence, the review convergence state, and concrete human choices. Mark unavailable live capability as unverified; a fake or hermetic adapter never proves a real provider is usable.

## Lifecycle Recording

- Use `team-record-start` and `team-record-finalize` only when durable Team state has handoff or audit value.
- Use `team-loop-record` to record a loop conclusion when an explicit iterative task needs durable telemetry; do not make numeric limits the default goal definition.
- Use `workflow/artifacts/<task-id>/team/decision.md` as the durable decision only when a substantive Team round occurred.
- Team decision artifacts use `backend: native|paseo|mixed|none` matching admitted results; `none` means no result was admitted and is never a selectable runtime backend. A v2 finalization writes stable provenance to `team/backend-v2.json`; mixed results remain traceable to admitted native and Paseo attempts. Legacy artifacts without that sidecar retain their historical native/Paseo marker contract.
- Keep raw logs and intermediate agent output outside Git. Persist the smallest conclusion required for verification or handoff.

In the final reply, follow the product-manager structure above. Put the task id, agents/backends used, paths, exact commands, and commits in `技术追溯`; keep actionable residual product risk in the acceptance body.
