# Implementation Contract

task_id: {{TASK_ID}}
title: {{TITLE}}
created: {{CREATED}}
contract_semantics_version: 5
finding_scope_admission: controller_current_required_only
safe_fallback_authority: none
work_type: implementation | planning | review | audit | docs-only
first_code_guard: required | not_applicable
first_code_not_applicable_reason:
product_ui_gate: required | not_applicable
product_ui_not_applicable_reason:

## Release Intent

Choose the target deliberately. A `product_increment` (MVP, Beta, internal
test/dogfood, or small-scope public beta without explicit formal certification),
`exploration`, or `non_product` uses ordinary semantics-v5. The default below
omits the `atlas-release-intent+json` section, every Profile/release binding, and
the terminal release-certification slice. Do not create a `release_decision`.

Only an explicit formal certification, `release-ready`, or `certified` request
uses `product_release`: set `contract_semantics_version: 6`, add exactly one
canonical `atlas-release-intent+json` block and use execution-plan schema version 4.
Do not add a fourth release-intent schema branch for `product_increment`.

For a product release that will enter execution, bind the exact controller-recordable
`user-message:` or `operator-input:` authorization supplied to Team start, for example
`"target_delivery_authority_ref": "user-message:<message-id>"`.
`goal:` and `current-required:` remain valid authoring references but are not resolvable release-execution authority for either Profile.

For a pure Web UI release use release-intent schema version 1 and Profile `web-ui-v1`.
For strict mixed-surface authoring/admission, use schema version 2, Profile `integrated-app-v1`, and the exact ordered surface set `web_ui`, `api`, `worker`, `database`, `external_integration`. Obtain `profile_sha256` from the bundled Profile through `loadBundledProfile()` plus `profileBinding()` and project all 12 immutable requirements exactly once. The public CLI does not register this Profile's trusted producer in this release, so a structurally passing final sweep remains `cannot_verify` unless the host separately supplies a workflow-bound trusted producer.

## Execution Plan

All newly authored ordinary contracts use semantics v5 and execution-plan schema
version 3: no `release` object and no `release_requirement` checks. Use the actual
bounded implementation and acceptance locations instead of the example values below.

For `product_release`, semantics v6 uses execution-plan schema version 4. Bind
`release` with `releasePlanBinding(intent)` and project every immutable Profile
requirement with `releaseRequirementProjection(profile, binding, requirement)`.
Place those final-only, fresh-executed checks in one terminal release-certification
slice that transitively depends on every other executable slice.

Historical semantics-v3 / plan v1 and semantics-v4 / plan v2 remain read-only
compatibility, not new-authoring alternatives.

```atlas-execution-plan+json
{
  "schema_version": 3,
  "size_policy": {
    "policy_id": "atlas-slice-size-v2"
  },
  "slices": [
    {
      "slice_id": "slice-001",
      "objective": "Replace with the bounded slice objective.",
      "depends_on": [],
      "keeper_outputs": [
        "event:slice-001:complete"
      ],
      "owned_paths": [
        "path/to/owned/**"
      ],
      "forbidden_paths": [],
      "acceptance_refs": [
        "AC-1"
      ],
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
        "max_required_checks": 12
      },
      "checks": [
        {
          "check_id": "slice-contract",
          "gate_class": "contract",
          "command": "replace-with-a-reproducible-verification-command",
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
- first_code_stop_before_slice:
- allowed_contract_gate_only_until:
- stop_if_no_code_by_phase:
- gate_parallelization_or_deferral_plan:
- Ordering rule: contract, scanner, fixture, and evidence-only preparation must be bounded before the first implementation diff; it cannot remain the only deliverable after the named stop point.
- First-code rule: for semantics v5/v6, `first_code_slice`, `first_code_verification`, and `first_code_stop_before_slice` are exact execution-plan IDs (`task-completion` is the terminal stop sentinel). The first code slice may be fixture-backed, mocked, or in-memory, but it must change the product, runtime, API, CLI, workflow, or contract-owned behavior under test.
- Gate-only non-completion: docs-only artifacts, scanner fixtures, analysis notes, and evidence bundles are not first code slices by themselves. For scanner/tooling tasks, implementing scanner/tool behavior may count; adding fixtures around unchanged behavior does not.
- Versioned stop: semantics version 1 requires `stop_if_no_code_by_phase`. The one-phase default applies only when interpreting an unversioned historical contract.
- Not-applicable boundary: planning, review, audit, and docs-only work. Tiny precise fixes whose acceptance path is already obvious may skip a versioned implementation contract; a version 1 `implementation` contract must use the required guard.

## Product/UI Acceptance Gate

- first_operable_user_flow:
- browser_entrypoint:
- served_ui_validation_action:
- ui_data_mode:
- allowed_headless_only_until:
- stop_if_no_ui_by_phase:
- Ordering rule: for non-tiny user-facing product/UI/browser work, the served operable UI thin slice must precede release, perf, soak, and phase evidence expansion.
- Risk-control rule: when a concrete reachable risk would make current acceptance unsafe, bind the minimum necessary control to the relevant acceptance row or edge case. No separate safety-gate field is required when no such risk exists.
- Served UI evidence: HTML document and JS/CSS app assets must come from a real HTTP server. `page.route` may mock backend/data-plane responses only, not the main document or app bundle.
- UI/product non-evidence: `page.setContent`, synthetic HTML, fulfilled main document or app bundle, headless model tests, scanner fixtures, CLI pass, typecheck/build-only proof, and network allowlist capture without a served UI route.
- Not-applicable boundary: only genuinely headless CLI/worker/library/scanner work or tiny changes that do not alter user-visible UI behavior. A product task with no served app is not tiny solely because the slice is small.
- Release boundary: this gate proves an early real served UI slice and never grants `certified`; product release requires the immutable Profile, same-candidate final sweep, and completion-derived release decision.

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
- [ ] Every finding-derived executable requirement cites `current-required:<finding_id>`
- [ ] Visible follow-up and informational findings remain provenance only
- [ ] Residual risks are recorded
