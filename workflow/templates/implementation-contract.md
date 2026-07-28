# Implementation Contract

task_id: {{TASK_ID}}
title: {{TITLE}}
created: {{CREATED}}
contract_semantics_version: 3
finding_scope_admission: controller_current_required_only
safe_fallback_authority: none | goal:<requirement-ref> | current-required:<finding_id>
work_type: implementation | planning | review | audit | docs-only
first_code_guard: required | not_applicable
first_code_not_applicable_reason:
product_ui_gate: required | not_applicable
product_ui_not_applicable_reason:
durable_product_naming_gate: required | not_applicable
durable_product_naming_not_applicable_reason:

## Execution Plan

```atlas-execution-plan+json
{
  "schema_version": 1,
  "size_policy": {
    "policy_id": "atlas-slice-size-v2"
  },
  "slices": [
    {
      "slice_id": "slice-001",
      "objective": "Replace with the bounded slice objective.",
      "depends_on": [],
      "keeper_outputs": ["event:slice-001:complete"],
      "owned_paths": ["path/to/owned/**"],
      "forbidden_paths": [],
      "acceptance_refs": ["AC-1"],
      "risk_class": "medium",
      "failure_domain": "bounded-slice",
      "rollback_boundary": "one logical commit",
      "estimate": {
        "estimated_changed_files": 8,
        "estimated_net_loc": 800,
        "target_p90_minutes": 90,
        "serial_dependency_depth": 0,
        "independent_vertical_count": 1
      },
      "budget": {
        "max_changed_files": 12,
        "max_loc": 1200,
        "max_wall_clock_minutes": 120,
        "max_required_checks": 5
      },
      "checks": [
        {
          "check_id": "slice-contract",
          "gate_class": "contract",
          "command": "replace-with-a-reproducible-command",
          "final_only": false,
          "cache_policy": "identity-bound"
        }
      ]
    }
  ]
}
```

## Scope

- Goal:
- Non-goals:
- Files or surfaces likely affected:
- User-visible behavior:

## First Code Slice Guard

- first_code_slice:
- first_code_slice_kind: product | runtime | api | cli | workflow | scanner_behavior
- first_code_owner:
- first_code_verification:
- allowed_contract_gate_only_until:
- stop_if_no_code_by_phase:
- gate_parallelization_or_deferral_plan:
- Ordering rule: contract, scanner, fixture, and evidence-only preparation must be bounded before the first implementation diff; it cannot remain the only deliverable after the named stop point.
- First-code rule: the first code slice may be fixture-backed, mocked, or in-memory, but it must change the product, runtime, API, CLI, workflow, or contract-owned behavior under test.
- Gate-only non-completion: docs-only artifacts, scanner fixtures, analysis notes, and evidence bundles are not first code slices by themselves. For scanner/tooling tasks, implementing scanner/tool behavior may count; adding fixtures around unchanged behavior does not.
- Safety rule: hard safety gates remain blockers for acceptance and release; starting a bounded code slice never authorizes skipping, weakening, or backfilling named safety gates.
- Versioned stop: semantics version 1 requires `stop_if_no_code_by_phase`. The one-phase default applies only when interpreting an unversioned historical contract.
- Not-applicable boundary: planning, review, audit, and docs-only work. Tiny precise fixes whose acceptance path is already obvious may skip a versioned implementation contract; a version 1 `implementation` contract must use the required guard.

## Product/UI Acceptance Gate

- first_operable_user_flow:
- browser_entrypoint:
- served_ui_validation_action:
- ui_data_mode:
- required_safety_gates:
- allowed_headless_only_until:
- stop_if_no_ui_by_phase:
- Ordering rule: for non-tiny user-facing product/UI/browser work, the served operable UI thin slice must precede release, perf, soak, and phase evidence expansion.
- Hard safety rule: the UI thin slice and required hard safety gates must be satisfied together; neither may pass acceptance without the other.
- Served UI evidence: HTML document and JS/CSS app assets must come from a real HTTP server. `page.route` may mock backend/data-plane responses only, not the main document or app bundle.
- UI/product non-evidence: `page.setContent`, synthetic HTML, fulfilled main document or app bundle, headless model tests, scanner fixtures, CLI pass, typecheck/build-only proof, and network allowlist capture without a served UI route.
- Evidence purpose boundary: the non-evidence list applies to UI/product acceptance evidence. Correctly labeled headless/network evidence may still satisfy safety gates.
- Reverse guard: served UI evidence does not replace required hard safety-gate evidence.
- Not-applicable boundary: only genuinely headless CLI/worker/library/scanner work or tiny changes that do not alter user-visible UI behavior. A product task with no served app is not tiny solely because the slice is small.

## Durable Product Naming Boundary

- stable_product_terms:
- delivery_only_terms:
- compatibility_bound_names: none | <explicit identifiers and rationale>
- naming_verification:
- Stable-name rule: new or renamed durable product files, directories, exported or internal symbols, APIs, schemas, and capability identifiers use domain or capability language that remains true after the current delivery phase ends.
- Delivery-name rule: task IDs, ticket IDs, roadmap gates, phases, slices, agent names, and acceptance-stage labels stay in workflow/evidence artifacts and purpose-built verifier names; they do not become durable product names merely for implementation traceability.
- Existing-precedent rule: a neighboring legacy name is evidence to inspect, not automatic authority to copy a delivery-only term into a new durable name.
- Compatibility boundary: historical migrations, persisted schema/protocol identifiers, receipts, and evidence namespaces may retain delivery terms only when listed in `compatibility_bound_names`; do not mechanically rename them with ordinary product code.
- Not-applicable boundary: no durable product identifier is created or renamed. A substantive reason is required; a small implementation slice is not sufficient by itself.

## Acceptance Criteria

| ID | Criterion | Required | Verification | Authority |
|----|-----------|----------|--------------|-----------|
| AC-1 |  | yes |  | goal:<requirement-ref> |

## Real Validation Plan

| Row | Target | Command or action | Expected result | Phase conclusion evidence |
|-----|--------|-------------------|-----------------|---------------------------|
| V-1 |  |  |  | `evidence/phase-review-report.md` |

## Evidence Budget

- Git evidence defaults to phase conclusions: `phase-review-report.md`, `defect-queue.md`, `evidence-index.md` or `evidence-manifest.json`, and `gate-checklist.md`.
- Optional git evidence: `review-checklist.md`, `verification-checklist.md`, final screenshots, or customer-facing HTML/PDF/sign-off deliverables when needed.
- Temporary run artifacts outside git by default: raw logs, Playwright JSON, traces, videos, HAR, bulk screenshots, full command output, failed retry logs, worker debug JSONL, API dumps, localhost/port status, and intermediate repair output.
- Target per phase: 10 git evidence files or fewer and 1 MB or less. Explain exceptions in `phase-review-report.md`.

## Edge Cases

| Case | Expected behavior | Required | Admission |
|------|-------------------|----------|-----------|
|  |  | no | optional |

## Failure And Stop Conditions

- Stop and ask the user when:
- Treat the task as failed when:
- Required safe fallback: not_applicable
- Optional fallback notes:

## Finding Provenance

Keep discovery visible here without turning it into executable scope. Only controller records admitted as `current-required` may appear as required Goal, Acceptance, Completion, Edge Case, or safe-fallback behavior.

| Finding ID | Disposition | Source | Follow-up |
|------------|-------------|--------|-----------|
|  | visible-follow-up |  |  |

## Completion Check

- [ ] Scope stayed inside the contract
- [ ] Required acceptance criteria passed
- [ ] Required validation rows have evidence
- [ ] New or renamed durable product identifiers satisfy the Durable Product Naming Boundary
- [ ] Every finding-derived executable requirement cites `current-required:<finding_id>`
- [ ] Visible follow-up and informational findings remain provenance only
- [ ] Residual risks are recorded
