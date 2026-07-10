# Evidence-only kind

contract_semantics_version: 1
work_type: implementation
first_code_guard: required
first_code_not_applicable_reason:
product_ui_gate: not_applicable
product_ui_not_applicable_reason: This is a headless workflow change.

## First Code Slice Guard

- first_code_slice: Collect evidence without changing behavior.
- first_code_slice_kind: evidence-only
- first_code_owner: evidence-owner
- first_code_verification: bash evidence-check.sh
- allowed_contract_gate_only_until: Phase 0
- stop_if_no_code_by_phase: Phase 1
- gate_parallelization_or_deferral_plan: Defer no required implementation work.
