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
4. Use `$atlas-workflow:clarify` when a chosen direction still needs explicit boundaries and acceptance before implementation.
5. Decide whether Team is needed from the user's current request, including the requested collaboration style, latency needs, and risk. Use `$atlas-workflow:team` when the user asks for multiple agents or when independent lanes or a distinct specialist/reviewer materially serve those needs; otherwise stay with the main Codex. Do not infer Team from task complexity, file count, or a default process.
6. Use `$atlas-workflow:worktree` only when isolation has concrete value. Use `$atlas-workflow:finish` for integration or cleanup decisions after isolated work.
7. For nontrivial direct execution that deliberately bypasses a plausible higher-risk planning layer, record one concise `route-decision`; tiny or already-documented work needs no duplicate routing artifact.

## Release Target Routing

Classify the requested target deliverable independently from the current work type:

- Use `product_release` when the target is an externally usable product candidate at any product stage. `MVP`, `Beta`, limited release, GA, and scaled operation change scope or maturity, never the formal-quality floor.
- Use `exploration` only for an explicit spike, prototype, or demo. Keep it isolated from production identity, data, runtime, distribution, and release claims; promotion requires fresh product-release authoring and verification.
- Use `non_product` only for a standalone deliverable such as analysis, documentation, or review whose current contract governs no release candidate, and record a substantive reason. Do not relabel an unsupported or incomplete product as non-product.
- Work type and delivery target are orthogonal: planning or review that directly authors or gates a named externally usable candidate retains `product_release`, but its own completion is not candidate evidence or certification. Merely mentioning a product without governing a release candidate remains `non_product`.
- Release certification v1 supports only a pure Web UI through immutable Profile `web-ui-v1`. API, CLI, worker, mixed, and unknown product surfaces fail authoring/admission; report the requested release conclusion as `cannot_verify` without inventing a completion `release_decision`, forcing them through this Profile, or relabeling them.

Release-readiness invariant: only a Team execution-v3 product_release whose immutable Profile final sweep binds one unchanged candidate and yields the completion-derived release_decision.status=certified may be called source-level release-ready; it never proves or authorizes installation, push, deployment, publication, or actual release. Task/slice/agent/review completion, passing tests, screenshots, Business Acceptance, design approval, or MVP/Beta labels never grant release-ready status.

When the authorized target is a `product_release`, route its execution and certification through Team execution-v3. Direct Task work may implement or verify only a contributing, non-certification scope; it must not close the product-release goal. In the final reply, report an existing completion-derived `release_decision.status` exactly. When no decision exists, keep `release_decision` absent and report the readiness assessment as `cannot_verify`; only a separately established current failed fact supports saying the candidate is not release-ready.

Release-bearing execution requires `target_delivery_authority_ref` to equal the current controller-recordable `user-message:` or `operator-input:` authorization exactly; unresolved `goal:` and `current-required:` references fail closed. A self-authored report, raw file, content hash, stdout, or exit-zero command is not a trusted producer; without workflow-bound producer provenance, the corresponding release fact is `cannot_verify`.

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
