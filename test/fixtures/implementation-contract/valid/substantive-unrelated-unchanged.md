# Substantive slice with an unrelated preservation clause

contract_semantics_version: 1
work_type: implementation
first_code_guard: required
first_code_not_applicable_reason:
product_ui_gate: not_applicable
product_ui_not_applicable_reason: This command has no browser product surface.

## First Code Slice Guard

- first_code_slice: Implement the editor save command; preserve unchanged runtime behavior in an unrelated API.
- first_code_slice_kind: cli
- first_code_owner: editor-cli-owner
- first_code_verification: npm test -- editor-save-command
- allowed_contract_gate_only_until: Phase 0
- stop_if_no_code_by_phase: Phase 1
- gate_parallelization_or_deferral_plan: Run API compatibility review in parallel.
