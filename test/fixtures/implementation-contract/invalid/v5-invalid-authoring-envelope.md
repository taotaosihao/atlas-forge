# Invalid v5 authoring envelope

task_id: fixture
contract_semantics_version: 5
finding_scope_admission: controller_current_required_only
safe_fallback_authority: none
work_type: planning
first_code_not_applicable_reason: This fixture deliberately omits first_code_guard.
product_ui_gate: not_applicable
product_ui_not_applicable_reason: This fixture has no user interface behavior.

## Execution Plan

```atlas-execution-plan+json
{
  "schema_version": 3,
  "size_policy": {
    "policy_id": "atlas-slice-size-v2"
  },
  "slices": [
    {
      "slice_id": "slice-vnext-invalid",
      "objective": "Prove full semantic lint cannot be bypassed by the brief builder.",
      "depends_on": [],
      "keeper_outputs": ["event:scope-admission-v5-invalid:complete"],
      "owned_paths": ["plugins/atlas-workflow/scripts/**"],
      "forbidden_paths": ["plugins/multica-sdlc/**"],
      "acceptance_refs": ["REQ-1"],
      "risk_class": "medium",
      "failure_domain": "contract-authority",
      "rollback_boundary": "one logical commit",
      "estimate": {
        "estimated_changed_files": 4,
        "estimated_net_loc": 300,
        "target_p90_minutes": 60,
        "serial_dependency_depth": 0,
        "independent_vertical_count": 1
      },
      "budget": {
        "max_changed_files": 6,
        "max_loc": 500,
        "max_wall_clock_minutes": 90,
        "max_required_checks": 2
      },
      "checks": [
        {
          "check_id": "implementation-contract-vnext-invalid",
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

## Acceptance Criteria

| ID | Criterion | Required | Verification | Authority |
|----|-----------|----------|--------------|-----------|
| AC-VNEXT | Preserve the current authorized goal. | yes | structural lint | goal:REQ-1 |

## Edge Cases

| Case | Expected behavior | Required | Admission |
|------|-------------------|----------|-----------|
| Optional review suggestion | Keep it out of executable scope. | no | optional |

## Failure And Stop Conditions

- Stop and ask the user when: current authority cannot be established.
- Treat the task as failed when: a required validation row fails.
- Required safe fallback: not_applicable
- Optional fallback notes: retain non-required suggestions in finding provenance.

## Finding Provenance

| Finding ID | Disposition | Source | Follow-up |
|------------|-------------|--------|-----------|
| finding-vnext | visible-follow-up | review-verdict.json | Track outside this contract. |
