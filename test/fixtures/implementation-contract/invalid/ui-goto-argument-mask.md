# page.goto target hidden by another argument

contract_semantics_version: 1
work_type: implementation
first_code_guard: required
first_code_not_applicable_reason:
product_ui_gate: required
product_ui_not_applicable_reason:

## First Code Slice Guard

- first_code_slice: Implement the served editor workflow.
- first_code_slice_kind: product
- first_code_owner: editor-owner
- first_code_verification: npm test -- editor
- allowed_contract_gate_only_until: Phase 0
- stop_if_no_code_by_phase: Phase 1
- gate_parallelization_or_deferral_plan: Run safety review in parallel.

## Product/UI Acceptance Gate

- first_operable_user_flow: Open and save a document.
- browser_entrypoint: http://127.0.0.1:4173/editor
- served_ui_validation_action: page.goto('/generated.html', {referer: browser_entrypoint}); compare the rendered result.
- ui_data_mode: Backend API fixture data
- required_safety_gates: browser network boundary
- allowed_headless_only_until: Phase 0
- stop_if_no_ui_by_phase: Phase 1
