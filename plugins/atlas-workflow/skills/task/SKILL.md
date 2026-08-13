---
name: task
description: Use the Atlas task flow for bounded work.
---

Use the local task helper for bounded implementation, diagnosis, or maintenance.

## Language

Write workflow artifacts, project documents, and user-facing summaries in Chinese by default. Preserve commands, paths, identifiers, APIs, proper nouns, and quoted errors where that improves accuracy.

## Routing

1. Run `~/.codex/workflow/bin/codex-workflow list` and reuse a relevant `doing` task; create/start one only when none exists.
2. Execute clear, low-risk, verifiable work directly. Multiple files or a behavior change do not by themselves require Team, a worktree, or a new documentation bundle.
3. Use `$atlas-workflow:intake` only when unresolved intent, scope, stakeholder, safety, permission, data, deployment, or ownership decisions block safe progress.
4. Use `$atlas-workflow:product-design` when a direction is chosen for a user-visible feature but the primary scenario or user-operable flow lacks current approval. Keep pure backend, migration, CLI, no-interaction, and tiny precise work in Task or Clarify.
5. Use `$atlas-workflow:clarify` when a current Design Handoff exists but still needs explicit execution boundaries and acceptance before implementation.
6. Decide whether Team is needed from the user's current request, including the requested collaboration style, latency needs, and risk. Use `$atlas-workflow:team` when the user asks for multiple agents or when independent lanes or a distinct specialist/reviewer materially serve those needs; otherwise stay with the main Codex. Do not infer Team from task complexity, file count, or a default process.
7. Use `$atlas-workflow:worktree` only when isolation has concrete value. Use `$atlas-workflow:finish` for integration or cleanup decisions after isolated work.
8. For nontrivial direct execution that deliberately bypasses a plausible higher-risk planning layer, record one concise `route-decision` in an existing durable task when one exists; otherwise record the rationale once in the current canonical document or final report and do not initialize workflow merely to log it. Tiny or already-documented work needs no duplicate routing artifact.

## Parallel Routing Boundary

The bounded-parallel controller policy belongs to non-tiny Clarify and to a
Team after the request has been routed to Team. Ordinary `$atlas-workflow:task`
and `$atlas-workflow:cw` remain bounded main/lightweight routes and do not
automatically upgrade to Team because a task has multiple files, complexity, or
potentially independent work. Task/CW do not create Clarify child lanes or use
the Team `child_count` wave rule unless the request is routed to the relevant
flow; all existing authority, model, lease, and release boundaries remain in
force.

## Release Target Routing

Classify the requested target deliverable independently from the current work type:

- Use `product_release` only when the request explicitly asks for formal release certification, `release-ready`, `certified`, or an equivalent source-level release conclusion. Planning or review that directly authors or gates a named externally usable candidate retains `product_release` only when that explicit formal intent is present; otherwise it routes to `product_increment`.
- Use `product_increment` for an MVP, Beta, internal test/dogfood, or small-scope public beta when formal certification or release-ready intent was not requested. This is a routing and reporting term only: it does not enter release-intent schema, create a `release_decision`, bind an immutable Profile, require Team execution-vnext, or support a `certified`/release-ready claim.
- Use `exploration` only for an explicit spike, prototype, or demo. Keep it isolated from production identity, data, runtime, distribution, and release claims; promotion to a usable product increment requires fresh `product_increment` authoring and verification, while formal certification requires fresh `product_release` authoring and verification.
- Use `non_product` only for a standalone deliverable such as analysis, documentation, or review whose current contract governs no release candidate, and record a substantive reason. Do not relabel an unsupported or incomplete product as non-product.
- Work type and delivery target are orthogonal: planning or review that directly authors or gates a named externally usable candidate retains `product_release` only when the request explicitly asks for formal certification, `release-ready`, or `certified`; otherwise it is `product_increment`. Merely mentioning a product without governing a release candidate remains `non_product`.
- Release certification supports a pure Web UI through immutable Profile `web-ui-v1`. Strict contract authoring, admission, and structural recomputation support the exact `web_ui` + `api` + `worker` + `database` + `external_integration` combination through immutable Profile `integrated-app-v1`; the public CLI does not register its trusted producer in this release, so structurally passing mixed-surface facts remain `cannot_verify` unless a separately delivered workflow-bound host producer is present. API-only, worker-only, CLI, different mixed combinations, and unknown product surfaces fail authoring/admission; report the requested release conclusion as `cannot_verify` without inventing a completion `release_decision`, forcing them through a non-applicable Profile, or relabeling them.

Release-readiness invariant: only a Team execution-vnext product_release whose immutable Profile final sweep binds one unchanged candidate and yields the completion-derived release_decision.status=certified may be called source-level release-ready; it never proves or authorizes installation, push, deployment, publication, or actual release. Task/slice/agent/review completion, passing tests, screenshots, Business Acceptance, design approval, or MVP/Beta labels never grant release-ready status.

When the authorized target is a `product_release`, route its execution and certification through Team execution-vnext. Direct Task work may implement or verify only a contributing, non-certification scope; it must not close the product-release goal. In the final reply, report an existing completion-derived `release_decision.status` exactly. When no decision exists, keep `release_decision` absent and report the readiness assessment as `cannot_verify`; only a separately established current failed fact supports saying the candidate is not release-ready.

Release-bearing execution requires `target_delivery_authority_ref` to equal the current controller-recordable `user-message:` or `operator-input:` authorization exactly; unresolved `goal:` and `current-required:` references fail closed. A self-authored report, raw file, content hash, stdout, or exit-zero command is not a trusted producer; without workflow-bound producer provenance, the corresponding release fact is `cannot_verify`.

## Product Increment Acceptance

For `product_increment`, use the main Codex or the lightest applicable Task flow by
default. Team is permitted only when an independent collaboration or review need
warrants it. The increment must omit release-intent, v4, immutable Profile,
release receipt, and release-decision machinery; if those are needed, reclassify
the request as explicit `product_release` intent. The minimum real acceptance is:

1. The product starts in the intended environment.
2. The most important user flow for this increment completes end to end.
3. Checks directly related to the change run and pass.
4. No observed feature, data, permission, or security blocker remains.
5. No unauthorized deployment, publication, shared-environment write, or
   irreversible operation occurred.

For a small public beta, also make the applicable access boundary, data/sensitive
information isolation, credential handling, rollback/close path, and one real
entrypoint smoke explicit. Report the actual commands, exit results, and key
conclusions. If real checks passed but the recorder or evidence collector failed,
the increment may complete with `证据采集：降级` and the reason recorded. A real
check that failed, was not run, or has an unknown result still blocks. Never turn
this degraded evidence into `certified` or `release-ready`, and never use it to
weaken the fail-closed `product_release` path.

## Independent Staffing, Lease, And Model Choices

Keep three decisions separate: `staffing_mode` (`main` or `team`) answers whether
extra agents are useful; `model_policy` answers which current host,
default-frontier planning/review, implementation-only saving, or explicitly
requested exact/quality route to use; `release_mode` answers `product_increment`
versus `product_release`. A model route does not justify creating a Team, Team
does not imply saving or quality mode, and none of these choices changes the
target, authority, paths, or acceptance. The main Codex uses the current host
model; Atlas does not rewrite the root host model. Model selection is per task
or lane and is not persisted as workflow state. Planning and plan/contract
review default to a frontier model; only an explicitly specified lane may
override that default, and low-tier Saving routes are otherwise limited to an
authorized implementation Execute. The Claude-family manual exact-model gate
remains unchanged.

Choose a path lease from actual write-conflict risk, independently of Team:

- Main-only single writer, read-only analysis, discussion, review, and verifier
  work do not need a lease.
- A `product_increment` Team with one isolated writer and no fallback, takeover,
  or external concurrent writer does not require a lease by default.
- Two or more possible writers require non-overlapping ownership; use the
  existing lease/quiescence boundary when available. Fallback, takeover, an
  uncertain old writer, or an external shared-workspace writer requires that
  boundary, and uncertainty stops new writers.
- Formal `product_release` execution keeps all existing execution-vnext lease and
  admission rules. Do not build a general lease runtime in the quick path.

## Execution Authority

- Review, analysis, planning, clarification, and documentation do not authorize implementation. Enter execute only after an explicit user implementation request; when a Team promotion is recorded, cite that message with `--authorization-ref`.
- Treat the current user goal and existing authoritative spec as the scope. Do not create a second roadmap/scope state machine.
- For product implementation, make the stable domain or capability identity prominent in the execution objective and name new long-lived files and symbols from that identity plus their actual responsibility. Task, Gate, phase, slice, and acceptance labels are delivery metadata unless the object itself is delivery-scoped; do not copy a nearby delivery-prefixed implementation as a naming precedent solely because it is similar or recent.
- Treat "complete implementation" as authorization to cross all internal slices only when the current authorized goal already is the named roadmap or all listed phases. Continue that roadmap without routine confirmation while scope and authority remain unchanged. Persistence wording alone does not expand a narrower goal.

## Artifacts And Context

- Create durable documentation only when ambiguity, risk, handoff, audit, or release value justifies it. Reuse existing issues, PRDs, specs, or contracts instead of mirroring them.
- A lightweight contract should name goal, non-goals, acceptance, real verification, and true return conditions. Do not add staffing/evidence files solely to satisfy a file checklist.
- When authority-backed facts determine an environment, status, verification level, or conclusion, state the goal neutrally and place the condition once in an existing invariant, acceptance row, or edge case. If review invalidates an overbroad or stale claim, replace it in place; do not retain it and append exception sections, parallel requirements, per-value matrices, or mirrored prose.
- Keep raw logs, traces, screenshots, dumps, retry output, and intermediate repair output outside Git by default.
- Long work crossing compaction or handoff uses one non-Git rolling checkpoint that is overwritten rather than appended.

## Product-Manager Progress Reports

For every meaningful implementation checkpoint and the final reply, keep the product-manager body to one screen and use this order:

When a formal execution grant exists, use `codex-workflow product-progress <task-id>` for the read-only current objective, blocker, next acceptance point, and authorization impact; do not infer those facts from `progress.jsonl` or hand-edited task state.

- `完成与验收`: describe verified behavior as “用户现在可以……”, followed by the product manager's action, expected result, actual result, and direct evidence.
- `测试覆盖`: summarize capability, scenario, result, and untested boundary in product language; a command name or green gate alone is not a capability explanation.
- `未完成与下一验收点`: state uncompleted or unverified behavior, failed checks, product impact, and the next acceptance point. Never present unverified work as complete.

Files changed and slices closed are not product outcomes. Do not lead with paths, commit hashes, schema versions, gate or slice IDs, agent JSON, or command lists. Put exact engineering details in a short `技术追溯` section after the acceptance body when they aid audit or handoff.

For canonical phase status, run `codex-workflow project-phase-report <task-id> <phase-id>`. The scaffold is only an unprojected sentinel; never hand-author its acceptance coverage, receipt status, or release decision.

## Review, Commits, And Completion

- Reviewer discovery is unrestricted. Automatically repair only current-goal blockers, regressions introduced by the current diff, or safety/data/permission issues that make this delivery unsafe. Other findings are follow-ups.
- Match commit timing to the work phase: commit a solution/contract as one logical outcome when it is finally confirmed; during authorized implementation, prefer moderate logical commits that are independently understandable, verified, and reversible. Do not commit every step, slice, or fix round, include unrelated user changes, or infer push/PR/release authority.
- Run focused verification first and broaden with blast radius. If a check cannot run, record the exact command and reason.
- Continue while safe work is materially advancing the current goal. Finish when acceptance is met; return earlier only for new authority, a user-owned decision, external-state dependency, or evidenced lack of material progress.
- Run `~/.codex/workflow/bin/codex-workflow done <task-id>` only when the whole authorized goal is actually complete.

In the final reply, follow the product-manager structure above. Put the task id, paths, exact commands, and commits in `技术追溯`; keep actionable residual product risk in the acceptance body.
