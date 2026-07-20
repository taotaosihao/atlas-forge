---
name: clarify
description: Use the Atlas clarify flow to convert a chosen direction into execution-ready context and spec artifacts.
---

Use the Atlas clarify flow for this request.

## 输出语言

- 生成或更新项目文档、需求/方案/分析/交接材料、design-review 报告、team 决策、workflow artifacts 和面向用户的总结时，默认使用中文。
- 命令、文件路径、代码标识符、配置键、API 名称、错误原文和必须保持的模板字段可以保留原文。
- 如果 `codex-workflow` 创建了英文骨架标题，在写入实质内容时改为中文标题；用户明确要求其他语言时，以用户要求为准。

This is the execution clarification layer:

- Use `$atlas-workflow:office-hours` when product value, user, or scope is still unsettled.
- Use `$atlas-workflow:brainstorm` when the idea is worth exploring but the solution shape still needs options and tradeoffs.
- Use `$atlas-workflow:clarify` when the direction is chosen and the task needs explicit non-goals, decision boundaries, acceptance criteria, and verification before execution.

## Short Request Clarification

When clarifying a one-line or low-information request, explicitly turn the short
request into an implementable plan before any coding starts. The clarification
should include:

- Original request.
- Restated requirement.
- Critical feedback: ambiguity, risk, simpler alternative, rejected path, or stop condition.
- Tiny escape decision, including why direct execution is or is not allowed.
- Goal and non-goals.
- Decision boundaries.
- Acceptance criteria.
- Verification plan.
- Required documentation source: workflow artifacts, project doc, lightweight implementation contract, or an existing external issue, PRD, or design doc cited from the current artifact.

Non-tiny work must have auditable documentation before code changes. Existing
external issues, PRDs, or design docs may count as equivalent evidence only when
the current artifact cites them and fills missing acceptance, verification, risk,
and stop-condition gaps. If tiny classification is uncertain, ask one short
question before coding.

Follow this loop:

1. Run `~/.codex/workflow/bin/codex-workflow list`.
2. Reuse a relevant `doing` task if one already exists. Otherwise create/start one.
3. For nontrivial execution clarification, record routing evidence:
   - `~/.codex/workflow/bin/codex-workflow route-decision <task-id> --intent clarify --risk <low|medium|high> --decision use --reason "<why boundaries must be locked>"`
   - If office-hours or brainstorm is intentionally skipped because the direction is already chosen, record a separate skip reason only when that choice is non-obvious.
4. Read any existing `workflow/artifacts/<task-id>/context.md`, `decision.md`, `spec.md`, or `analysis.md` before writing new boundaries.
5. Freeze the smallest user-visible Goal before brownfield discovery. Give each required outcome a stable requirement ref, and do not use discovery, review wording, or generic completeness language to broaden it.
6. Collect brownfield facts after the Goal is frozen. Classify every discovered item as `goal:<requirement-ref>`, controller-resolved `current-required:<finding_id>`, or non-executable `follow-up`. Discovery cannot rewrite the frozen Goal; only a validated controller resolution can admit a non-Goal finding into the current delivery.
7. Ask one blocking question only when a missing fact would make the spec unsafe. Prefer ordinary dialogue; use structured choice tools only when available and helpful. Do not block when `AskUserQuestion` or `request_user_input` is unavailable.
8. Select one canonical scope source. Reuse a substantive existing issue, PRD, design, or contract when it already contains the locked scope. When implementation-contract value is already known, author that contract as the canonical source instead of first creating a duplicate `clarify.md`; otherwise run `~/.codex/workflow/bin/codex-workflow scaffold-clarify <task-id>` and make `workflow/artifacts/<task-id>/clarify.md` canonical. Do not create or update `context.md`, `spec.md`, `decision.md`, or a repo document merely to mirror the same scope. Any necessary supporting note must cite the canonical source instead of repeating it.
9. Keep the canonical scope source compact but execution-ready:
   - Goal and stable requirement refs
   - Non-goals and decision boundaries
   - Accepted assumptions
   - Acceptance criteria and verification
   - Critical feedback and stop conditions
10. Make acceptance criteria command-verifiable or user-visible.
11. Create an implementation contract only when machine-checkable scope admission, cross-session handoff, audit, or release value justifies it. When a contract is required:
   - if `clarify.md` was previously canonical, promote the finalized implementation contract to the sole canonical scope source and reduce `clarify.md` to links plus non-duplicated background; do not retain two scope bodies
   - whether `workflow/templates/implementation-contract.md` should be filled before coding
   - whether the project docs bundle should include `contract-index.md` and `implementation-contract.final.md`
   - which acceptance criteria become required validation rows
   - which commands, browser paths, API calls, CLI invocations, or runtime targets must produce phase conclusion evidence
   - where raw logs, Playwright JSON, traces, videos, HAR, bulk screenshots, full command output, debug JSONL, API dumps, port status, and intermediate repair output should live as temporary run artifacts outside git by default
   - what failure or ambiguity should stop implementation and return to the user
   - for non-tiny implementation work that could spend early phases on
     contracts, scanners, fixtures, headless models, research, or evidence
     before changing the requested behavior, whether `First-code guard` is
     `required` or `not_applicable`
   - when `First-code guard` is required, the contract must name
     `first_code_slice`, `first_code_owner`, `first_code_verification`,
     `allowed_contract_gate_only_until`, `stop_if_no_code_by_phase`, and
     `gate_parallelization_or_deferral_plan`
   - contract, scanner, fixture, and evidence-only preparation must be bounded
     by phase or step; the first code slice may be fixture-backed, mocked, or
     in-memory, but it must change the product, runtime, API, CLI, workflow, or
     contract-owned behavior under test
   - a semantics version 1 contract with a required First-code guard must name
     `stop_if_no_code_by_phase`; the one-phase default for an omitted field
     applies only when interpreting an unversioned historical contract
   - for non-tiny user-facing product, frontend, dashboard, editor, player,
     browser, GUI, or site work, whether `Product/UI gate` is `required` or
     `not_applicable`
   - when `Product/UI gate` is required, the contract must name
     `first_operable_user_flow`, `browser_entrypoint`,
     `served_ui_validation_action`, `ui_data_mode`, `required_safety_gates`,
     `allowed_headless_only_until`, and `stop_if_no_ui_by_phase`
   - served UI evidence must open a real app entrypoint whose HTML document and
     JS/CSS assets are served by a real HTTP server; synthetic HTML,
     `page.setContent`, fulfilled main documents, fulfilled app bundles,
     headless model tests, scanner fixtures, build-only proof, and network
     allowlist capture without a served UI route do not satisfy UI/product
     acceptance by themselves
   - the UI thin slice must precede release, perf, soak, and phase evidence
     expansion, while hard safety gates must be satisfied together with the UI
     slice and must not be skipped, weakened, or backfilled
   - the non-evidence list applies to UI/product acceptance evidence; correctly
     labeled headless/network evidence may still satisfy safety gates, and
     served UI evidence never replaces required hard safety-gate evidence
   - when an implementation contract is finalized after review, write `implementation-contract.final.md` as a clean rewrite of the final agreed requirements; do not append old contract text, rejected requirements, or review notes into the final executable contract body
   - when authority-backed facts determine an environment, status, verification level, or conclusion, state the goal neutrally and place the condition once in an existing invariant, acceptance row, or edge case. If review invalidates an overbroad or stale claim, replace it in place; do not retain it and append exception sections, parallel requirements, per-value matrices, or mirrored prose
   - review severity, `required_fix`, affected rows, and remediation prose do not grant scope; for SDD v2, every validated controller finding with `disposition: current-required` remains an executable requirement whether `repair_status` is `open` or `resolved`, while only `open` findings block or create repair feedback
   - a safety, data-integrity, or permission finding may become `current-required` only when its controller resolution binds a canonical invariant, a current `acceptance:<ref>`, the current diff or equivalent path/evidence, and a substantive reason explaining why omission blocks or makes that acceptance unsafe; machine validation checks these bindings, not the truth of the prose
   - project those admitted findings only into Goal, Acceptance, Completion, Edge Cases, or Required safe fallback; retain `visible-follow-up` and `informational` findings only in `Finding Provenance` or follow-up records
   - in semantics-v2 contracts, mark required acceptance and edge-case rows with `goal:<requirement-ref>` or `current-required:<finding_id>` so strict lint can validate attribution without interpreting natural language
   Keep this lightweight for local Atlas work; do not require a Multica-style multi-agent contract unless the user explicitly asks for Multica handoff.
12. Create a repo docs bundle, `contract-index.md`, staffing file, or durable evidence index only when explicit handoff, audit, release, or existing project-document authority requires it. A non-tiny task, a review finding, or the mere presence of an implementation contract is not sufficient reason. Keep one canonical scope body and use links from supporting artifacts.
13. Self-review the canonical scope source before reporting:
   - no placeholders such as `TBD` or `TODO`
   - no contradictory or mirrored scope in supporting artifacts
   - assumptions are labelled
   - acceptance criteria match the verification plan
   - resolve `ATLAS_WORKFLOW_PLUGIN_ROOT` from this loaded `SKILL.md`: it is two directories above the containing skill directory; do not assume the target project's current working directory contains an Atlas Forge checkout
   - for a newly authored final contract, run `node "$ATLAS_WORKFLOW_PLUGIN_ROOT/scripts/codex-implementation-contract-lint" --strict --new-authoring --file <implementation-contract.final.md> --authority-slice <canonical-sdd-slice-dir>` and repeat `--authority-slice` for every slice whose goal or `current-required` authority is cited; new authoring requires semantics v2, while the lint must validate contract `task_id`, goal refs, and finding refs against those canonical artifacts before the contract is execution-ready
   - semantics-v1 final contracts continue to use `node "$ATLAS_WORKFLOW_PLUGIN_ROOT/scripts/codex-implementation-contract-lint" --strict --file <implementation-contract.final.md>`
14. Run `codex-workflow ready` only when the chosen canonical workflow already uses its requested artifact set; do not create mirrored `context.md` or `spec.md` solely to satisfy readiness. A newly authored implementation contract must pass the strict new-authoring lint above before it is execution-ready.
15. Use `$atlas-workflow:team` when the task should go through Atlas-managed Paseo multi-provider discussion or promotion before execution. Use Codex native collaboration only as an explicit fallback when Paseo cannot satisfy the required provider/runtime path within current authority.
16. In the final reply, include the task id, canonical scope source, locked assumptions, verification plan, and only the supporting artifacts that materially exist.

Hard rules:

- Do not re-open product strategy or design exploration unless execution safety depends on it.
- Do not implement code from this skill unless the user explicitly changes the request to implementation after the spec is locked.
- Keep exploratory or unstable notes outside the canonical scope source; do not mirror an execution-ready scope into a repo bundle unless handoff, audit, release, or existing project authority requires it.
