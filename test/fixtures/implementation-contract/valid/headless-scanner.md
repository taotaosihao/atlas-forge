# Valid headless scanner implementation

contract_semantics_version: 1
work_type: implementation
first_code_guard: required
first_code_not_applicable_reason:
product_ui_gate: not_applicable
product_ui_not_applicable_reason: The deliverable is a headless scanner CLI with no browser product surface.

## 首个代码切片门禁

- first_code_slice: Implement scanner behavior that rejects a forbidden runtime path.
- first_code_slice_kind: scanner_behavior
- first_code_owner: scanner-owner
- first_code_verification: node scanner.test.js --case forbidden-runtime
- allowed_contract_gate_only_until: Step 1 schema agreement
- stop_if_no_code_by_phase: Step 2
- gate_parallelization_or_deferral_plan: Develop the scanner behavior while a read-only reviewer checks the rule matrix.

## 产品/UI 验收门禁

- first_operable_user_flow: not_applicable
- browser_entrypoint: not_applicable
- served_ui_validation_action: not_applicable
- ui_data_mode: not_applicable
- required_safety_gates: filesystem read boundary and no-follow path handling
- allowed_headless_only_until: task completion
- stop_if_no_ui_by_phase: not_applicable
