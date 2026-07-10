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
5. Collect brownfield facts before proposing boundaries.
6. Ask one blocking question only when a missing fact would make the spec unsafe. Prefer ordinary dialogue; use structured choice tools only when available and helpful. Do not block when `AskUserQuestion` or `request_user_input` is unavailable.
7. Run `~/.codex/workflow/bin/codex-workflow scaffold-clarify <task-id>`, then
   write `workflow/artifacts/<task-id>/clarify.md` and update `context.md`.
   - current state
   - confirmed facts
   - source of truth files
   - known risks
8. Preserve or update `workflow/artifacts/<task-id>/decision.md` when the chosen approach matters for execution.
   - selected direction
   - rejected alternatives
   - assumptions inherited from brainstorm or office-hours
9. Write `workflow/artifacts/<task-id>/spec.md`.
   - Goal
   - Non-goals
   - Decision Boundaries
   - Acceptance Criteria
   - Verification Plan
   - Critical Feedback
   - Tiny Escape Decision
   - Stop Conditions
10. Make acceptance criteria command-verifiable or user-visible.
11. When the next step is non-tiny implementation, include an implementation-contract expectation:
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
   - when an implementation contract is finalized after review, write `implementation-contract.final.md` as a clean rewrite of the final agreed requirements; do not append old contract text, rejected requirements, or review notes into the final contract body
   Keep this lightweight for local Atlas work; do not require a Multica-style multi-agent contract unless the user explicitly asks for Multica handoff.
12. Because clarify turns a chosen direction into an execution-ready plan, also write a concise project doc:
   - prefer an existing project docs location; otherwise create `docs/atlas-workflow/` under the target project root.
   - create or reuse one workflow docs bundle for the same workflow: `docs/atlas-workflow/<workflow-id>-<short-topic>/`.
   - use stable files inside the bundle, such as `README.md`, `clarify.md`, `spec.md`, `contract-index.md`, `implementation-contract.draft.md`, `implementation-contract.final.md`, `reviews/`, `decisions/`, and `evidence/`; do not create scattered sibling markdown files for the same workflow.
   - classify process docs before mirroring: draft `context.md`, `analysis.md`, `decision.md`, and `spec.md` are workflow working notes until confirmed; durable repo docs should contain the locked boundaries, accepted assumptions, verification plan, and next step, not the full clarification trail.
   - keep `evidence/` concise: prefer `phase-review-report.md`, `defect-queue.md`, `evidence-index.md` or `evidence-manifest.json`, and `gate-checklist.md`; target 10 git evidence files or fewer and 1 MB or less per phase, with exceptions explained in `phase-review-report.md`.
   - include the goal, non-goals, selected direction, decision boundaries, acceptance criteria, verification plan, assumptions, and next execution step.
   - if the clarify output becomes the current implementation authority, update `contract-index.md` to point at that file; when execution is ready, point it at `implementation-contract.final.md`.
   - keep `contract-index.md` as the bundle entrypoint by adding supporting evidence links when those files exist or are created: `team_decision`, `staffing`, `evidence_index`, `workflow_team_decision`, and `workflow_team_staffing`; if a non-team flow has no staffing owner, create a brief `staffing.md` that says not applicable and names the human/main-agent owner.
   - keep `workflow/artifacts/<task-id>/` as the working record; the project doc is the durable handoff for the repo.
13. Self-review artifacts before reporting:
   - no placeholders such as `TBD` or `TODO`
   - no contradictions between context, decision, spec, and the project doc
   - assumptions are labelled
   - acceptance criteria match the verification plan
   - resolve `ATLAS_WORKFLOW_PLUGIN_ROOT` from this loaded `SKILL.md`: it is two directories above the containing skill directory; do not assume the target project's current working directory contains an Atlas Forge checkout
   - run `node "$ATLAS_WORKFLOW_PLUGIN_ROOT/scripts/codex-implementation-contract-lint" --strict --file <implementation-contract.final.md>` before calling a versioned final contract execution-ready
14. Before claiming the artifacts are execution-ready, run:
    - `~/.codex/workflow/bin/codex-workflow ready <task-id> --require context,spec`
    - add `decision` to `--require` when the selected direction or rejected alternatives matter for execution.
15. Use `$atlas-workflow:team` when the task should go through Codex native subagent discussion or promotion before execution. If native subagent tools are unavailable, stop and ask whether to use explicit legacy `$atlas-workflow:team-v1`; do not silently fall back to legacy CLI lanes.
16. In the final reply, include the task id, `context.md`, `decision.md` if used, `spec.md`, project doc path, readiness result, locked assumptions, and verification plan.

Hard rules:

- Do not re-open product strategy or design exploration unless execution safety depends on it.
- Do not implement code from this skill unless the user explicitly changes the request to implementation after the spec is locked.
- Keep exploratory or unstable notes in `workflow/artifacts/<task-id>/`; execution-ready specs must also be mirrored into the workflow docs bundle described above.
