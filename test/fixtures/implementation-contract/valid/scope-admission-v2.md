# Scope admission v2 contract

contract_semantics_version: 2
finding_scope_admission: controller_current_required_only
safe_fallback_authority: none
work_type: planning
first_code_guard: not_applicable
first_code_not_applicable_reason: This fixture validates planning contract structure only.
product_ui_gate: not_applicable
product_ui_not_applicable_reason: This fixture has no user interface behavior.

## Acceptance Criteria

| ID | Criterion | Required | Verification | Authority |
|----|-----------|----------|--------------|-----------|
| AC-1 | Preserve the current authorized goal. | yes | structural lint | goal:REQ-1 |
| AC-2 | Preserve the already repaired required behavior in clean rewrites. | yes | structural lint | current-required:finding-resolved |
| AC-3 | Retain a review suggestion as provenance only. | no | not executable | follow-up:finding-2 |

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
| finding-2 | visible-follow-up | review-verdict.json | Track outside this contract. |
| finding-resolved | current-required (resolved) | controller-resolution.json | Retain as executable scope. |
