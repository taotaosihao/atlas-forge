# Implementation slice with supporting fixtures

contract_semantics_version: 1
work_type: implementation
first_code_guard: required
first_code_not_applicable_reason:
product_ui_gate: not_applicable
product_ui_not_applicable_reason: This is a headless scanner implementation.

## First Code Slice Guard

- first_code_slice: Add regression fixtures and implement scanner rejection behavior.
- first_code_slice_kind: scanner_behavior
- first_code_owner: scanner-owner
- first_code_verification: bash scanner-test.sh
- allowed_contract_gate_only_until: Phase 0
- stop_if_no_code_by_phase: Phase 1
- gate_parallelization_or_deferral_plan: Run contract review in parallel.
