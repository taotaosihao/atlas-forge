# Valid implementation with served UI

contract_semantics_version: 1
work_type: implementation
first_code_guard: required
first_code_not_applicable_reason:
product_ui_gate: required
product_ui_not_applicable_reason:

## First Code Slice Guard

- first_code_slice: Implement the saved editor workflow and its runtime state transition.
- first_code_slice_kind: product
- first_code_owner: editor-runtime-owner
- first_code_verification: npm test -- editor-saved-flow
- allowed_contract_gate_only_until: Phase 0 contract approval
- stop_if_no_code_by_phase: Phase 1
- gate_parallelization_or_deferral_plan: Run safety-gate analysis in parallel and block release until both paths pass.

## Product/UI Acceptance Gate

- first_operable_user_flow: Open the editor, create a document, save it, and reload the persisted result.
- browser_entrypoint: http://127.0.0.1:4173/editor
- served_ui_validation_action: page.route('/api/**', route => route.fulfill({json: fixture})); never fulfill the main document or app bundle; page.goto(entrypoint); create, save, and reload the document.
- ui_data_mode: API fixture data served behind the real application document and assets
- required_safety_gates: browser network boundary, credential isolation, and separately labeled headless network-capture evidence
- allowed_headless_only_until: Phase 0 contract approval
- stop_if_no_ui_by_phase: Phase 1
