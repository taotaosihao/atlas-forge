---
name: clarify
description: Clarify execution boundaries for a chosen direction, reusing approved decisions and comparing engineering options when material tradeoffs remain.
---

# Clarify

Turn chosen user outcomes into the missing execution boundaries: what to change,
what to leave alone, the necessary engineering decisions, and reachable acceptance.
Keep the user's goal and authority stable while allowing the implementation to change.

## Host Note

Codex invokes this flow as `$atlas-workflow:clarify`; Claude Code invokes it as `/clarify` or by calling the `clarify` skill directly. For CLI commands, prefer `atlas-workflow` on `PATH`, falling back to `~/.codex/workflow/bin/codex-workflow`.

## 输出语言

默认用通俗中文编写实质内容和回复，保留准确的命令、路径、标识符与模板字段。
内部编排、合同版本与身份摘要留在必要的工程材料中，不进入用户界面或常规回复。
不要把工作流骨架、空栏目或调试说明当作交付内容。

## Route by the actual gap

- Use `$atlas-workflow:office-hours` for unsettled product value, user, or investment scope.
- Use `$atlas-workflow:brainstorm` when the product direction or overall solution shape still needs exploration.
- Use `$atlas-workflow:product-design` when a chosen user-visible feature still lacks an approved scenario or flow. Missing handoff files alone do not mean the business design is undecided; use the reuse rules below.
- Keep engineering alternatives within an approved outcome in Clarify. Do not freeze the main agent's first implementation idea as a requirement.
- Clear, bounded work with adequate context can go directly to `$atlas-workflow:task` after implementation authority exists; task size or file count does not require a planning process.

## Clarify only what is missing

For a corrected or evidence-challenged decision, first apply the shared
[decision supersession protocol](../../references/decision-supersession.md).

1. Read the request, current conversation, existing decisions and relevant artifacts before asking questions. Reuse the current task and source of scope when they already exist.
2. Before brownfield discovery or any fan-out, freeze the smallest user-visible Goal, non-goals, authority and acceptance draft from that evidence. Preserve requirement meanings, not just their IDs; delivery labels are not the product behavior. Engineering assumptions remain revisable.
3. Check the relevant current code, call paths and dependencies. Discovery or review cannot expand the Goal: admit a non-Goal requirement only through the existing controller `current-required` rules when the selected contract uses them; keep unrelated improvements as follow-ups.
4. Ask one blocking question only when an unresolved choice changes behavior, scope, data, safety, permissions or acceptance and cannot be learned from available evidence. A short request or uncertain tiny/non-tiny label is not itself such a choice. Use ordinary dialogue when structured question tools are unavailable.
5. State only the missing boundaries, material assumptions and engineering decisions needed for this task. Prefer the minimum complete implementation, including necessary safety and quality; do not add a framework, state matrix or roadmap without a current need.
6. Make acceptance command-verifiable or user-visible, with legal, reachable prerequisites. Do not invent an unauthorized write path to construct a test state, treat mocks as real capabilities, or report unknown data as a real value.

A one-line request with complete context needs no fixed checklist, repeated
restatement, extra questions or new workflow artifacts. Output length follows
the actual decisions, not the length of the request.

## Engineering perspectives when useful

For a larger task with material engineering tradeoffs, automatically start
read-only multi-perspective discussion before the contract is drafted. Briefly
explain the decision and useful perspectives; do not ask for per-run permission.
Examples include interacting modules, complex business states, data or permission
boundaries, and choices with significantly different implementation or maintenance costs.

Choose perspectives for that decision. Long-term evolution and current delivery
are a common pair, not a fixed roster or a proxy for business/developer/test roles.
Both propose complete options and may revise them; neither more architecture nor
the smallest diff wins by default. Repetitive bulk work may benefit from parallel
fact-finding without a stance debate. File count, request length and a non-tiny
label alone do not justify discussion. Honor an explicit user collaboration request.

Before dispatch, read [references/collaboration.md](references/collaboration.md).
Use existing native collaboration; this does not require a full Team execution
workflow, a machine contract before discussion, a new role catalog or a scheduler.

## Reuse design decisions without inventing approval

Pure backend, migration, CLI, no-interaction and tiny precise work need no Design
Handoff. For a user-visible handoff, read the
[Product Design adapter](../product-design/references/method-adapter.md) in full
and use the current A/C/D/E from the same task:

- With valid current approval and unchanged bindings, reuse the design without reopening it.
- When explicitly approved business content only lacks structure, organize only that content using the existing Product Design artifacts. Do not add missing business semantics, manufacture approval references or carry a stale identity forward. Formatting can change an identity: if a valid binding is still missing, report that specific gap and keep the handoff non-executable instead of redesigning the whole feature.
- For new or changed semantics, return only the affected decision to Product Design and obtain the required current approval. Text, silence, tests and agent agreement are not approval.

Accept `E-design-handoff.md` only after recomputing current A `context_identity`,
C `content_identity` and D flow identity. Require E to match all three, D to store
all three approved identities, current C and D approval references, and no blocker.
A `product_release` also requires explicit current-user Flow Approval. If a check
fails, report the exact missing or stale binding and route that gap to
[Product Design](../product-design/SKILL.md); do not copy A/C/D into a second scope
body or claim executable clarification while handoff admission is unresolved.

## Keep one useful scope document

Create durable artifacts only for real tracking, recovery, handoff, audit or
release value. When needed, run `codex-workflow list`, reuse a relevant `doing`
task and its substantive scope document; create a task only when none fits.
Record a non-obvious routing choice once, not a process diary.

Reuse an adequate issue, PRD, design or contract. If a new scope document is
needed, use `codex-workflow scaffold-clarify <task-id>`; if machine-contract value
is already established, author that contract directly. Do not mirror scope into
`context.md`, `spec.md`, `decision.md` or a repo bundle to satisfy readiness.

Only when machine-checkable admission, cross-session handoff, audit or release
value requires an implementation contract, read
[references/contract-authoring.md](references/contract-authoring.md) in full.
Multi-role discussion alone does not require a machine contract. Once selected,
its required fields, authority bindings and validation remain mandatory.

All references resolve relative to this loaded plugin, not the target project's
checkout. `ATLAS_WORKFLOW_PLUGIN_ROOT` is two directories above the containing
skill directory; do not assume an Atlas Forge checkout in the current directory.

## Converge and hand off

Compare final clauses with the user's original intent, approved decisions and
discussion results. Finish when meanings are stable, implementation and
dependencies have concrete locations, acceptance is reachable, and delivery-changing
disagreements are resolved. Do not wait for a fixed round count or unanimous preference.
Report a real evidence gap when further discussion cannot resolve it.

Return the necessary decisions, remaining assumptions, verification and the one
scope document/task id when they exist. Do not list nonexistent supporting artifacts.
Run `codex-workflow ready` only for an already chosen artifact set; readiness and
structural lint do not prove semantic fidelity or successful implementation.

Clarify does not authorize coding, commit, installation, deployment or release.
Enter Task only after an explicit implementation request. MVP/Beta/internal or
small public beta without formal certification remains `product_increment`.
Only explicit formal certification, `release-ready` or `certified` intent selects
`product_release`; before authoring or handing off that path read
[Team's release rules](../team/SKILL.md) and retain its exact approval, Profile
and execution-vnext admission. No clarification, review or passing checks may
claim `release_decision.status=certified` or authorize an external release.
