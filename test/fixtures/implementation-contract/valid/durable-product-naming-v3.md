# Durable product naming v3 contract

task_id: fixture
contract_semantics_version: 3
finding_scope_admission: controller_current_required_only
safe_fallback_authority: none
work_type: implementation
first_code_guard: required
first_code_not_applicable_reason:
product_ui_gate: not_applicable
product_ui_not_applicable_reason: This fixture changes a headless contract linter only.
durable_product_naming_gate: required
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
      "slice_id": "slice-naming",
      "objective": "Enforce stable product naming in newly authored contracts.",
      "depends_on": [],
      "keeper_outputs": ["event:durable-product-naming:complete"],
      "owned_paths": ["plugins/atlas-workflow/**"],
      "forbidden_paths": ["plugins/multica-sdlc/**"],
      "acceptance_refs": ["REQ-1"],
      "risk_class": "medium",
      "failure_domain": "contract-authoring",
      "rollback_boundary": "one logical commit",
      "estimate": {
        "estimated_changed_files": 6,
        "estimated_net_loc": 300,
        "target_p90_minutes": 60,
        "serial_dependency_depth": 0,
        "independent_vertical_count": 1
      },
      "budget": {
        "max_changed_files": 8,
        "max_loc": 600,
        "max_wall_clock_minutes": 90,
        "max_required_checks": 3
      },
      "checks": [
        {
          "check_id": "naming-contract",
          "gate_class": "contract",
          "command": "bash workflow/tests/contract_implementation_contract.sh",
          "final_only": false,
          "cache_policy": "identity-bound"
        }
      ]
    }
  ]
}
```

## First Code Slice Guard

- first_code_slice: Implement durable product naming validation in the workflow linter.
- first_code_slice_kind: workflow
- first_code_owner: Atlas workflow contract linter
- first_code_verification: Run the implementation contract regression suite.
- allowed_contract_gate_only_until: Before the linter behavior changes.
- stop_if_no_code_by_phase: Stop before fixture expansion if the linter has no implementation diff.
- gate_parallelization_or_deferral_plan: Update the linter before adding regression fixtures.

## Durable Product Naming Boundary

- stable_product_terms: durable product naming, implementation contract, contract linter
- delivery_only_terms: task IDs, ticket IDs, Gate labels, phase labels, slice IDs, and agent names
- compatibility_bound_names: none
- naming_verification: Inspect new durable identifiers and run the implementation contract regression suite.

## Acceptance Criteria

| ID | Criterion | Required | Verification | Authority |
|----|-----------|----------|--------------|-----------|
| AC-1 | New contract authoring declares a durable product naming boundary. | yes | structural lint | goal:REQ-1 |

## Edge Cases

| Case | Expected behavior | Required | Admission |
|------|-------------------|----------|-----------|
| Compatibility-bound identifier | Require an explicit exception rather than a mechanical rename. | no | optional |

## Failure And Stop Conditions

- Stop and ask the user when: a compatibility rename needs product-owner authority.
- Treat the task as failed when: a required naming field is missing but new authoring passes.
- Required safe fallback: not_applicable
- Optional fallback notes: preserve compatibility-bound identifiers.

## Finding Provenance

| Finding ID | Disposition | Source | Follow-up |
|------------|-------------|--------|-----------|
| naming-history | informational | target conversation | Existing identifiers are not renamed by this contract. |
