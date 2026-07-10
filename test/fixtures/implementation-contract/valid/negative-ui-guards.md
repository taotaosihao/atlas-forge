# Valid negative UI safety guarantees

contract_semantics_version: 1
work_type: implementation
first_code_guard: required
first_code_not_applicable_reason:
product_ui_gate: required
product_ui_not_applicable_reason:

## First Code Slice Guard

- first_code_slice: Implement the served editor workflow and its persisted state transition.
- first_code_slice_kind: product
- first_code_owner: editor-runtime-owner
- first_code_verification: npm test -- editor-served-flow
- allowed_contract_gate_only_until: Phase 0 contract approval
- stop_if_no_code_by_phase: Phase 1
- gate_parallelization_or_deferral_plan: Run browser isolation review in parallel and block release until it passes.

## Product/UI Acceptance Gate

- first_operable_user_flow: Open the editor, create a document, save it, and reload the persisted result.
- browser_entrypoint: http://127.0.0.1:4173/editor
- served_ui_validation_action: Never call page.setContent; never navigate file: URLs; never navigate data: URLs; never use synthetic HTML; page.route('/api/**', route => route.fulfill({json: fixture})), never fulfill the main document or app bundle; page.goto(browser_entrypoint); create, save, and reload the document.
- ui_data_mode: Backend API fixture responses behind a real served document and application assets
- required_safety_gates: No safety gates are skipped; browser network boundary, credential isolation, and served-asset provenance remain required
- allowed_headless_only_until: Phase 0 contract approval
- stop_if_no_ui_by_phase: Phase 1
