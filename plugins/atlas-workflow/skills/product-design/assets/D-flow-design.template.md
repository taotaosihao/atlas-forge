---
status: draft
context_ref: ./A-product-context.md
scenario_ref: ./C-critical-scenario.md
approved_context_identity: ""
approved_scenario_identity: ""
approved_flow_identity: ""
source_refs: []
approval_ref: ""
---

# Flow Design

## 1. Flow mapping

## 2. Capability truth

For every primary visible capability, record the user and prerequisite, real
authoritative path or explicitly approved feasible bounded side-effect plan,
durable result, success feedback, failure recovery, and allowed claim. Mocks may
replace data/responses but cannot invent capability. Hide, disable with an
explanation, or mark unavailable anything outside scope; keep this document
draft when API, permission, or safety boundaries conflict.

## 3. Surface responsibility and low-fidelity structure

For each substantive surface, record its entry, primary information, primary
action, exit, information hierarchy, and at most one ASCII floorplan.

- Target form factor / primary viewport:
- Minimum adaptation, overflow, or primary-action-position rule (or
  `desktop-only` / `not applicable` with reason):
- Evidence level (text rehearsal, static layout, interaction prototype, real
  Baseline, or reused reference), with rationale:
- Unresolved assumption, evidence that tests it, and observation that would
  change the design choice:
- Final candidate commit and actual entrypoint (when Baseline applies):
- Allowed engineering adjustments after handoff:

## 4. Necessary states and recovery

Include Default, Success, and the most important Error/recovery. Add other states
only when applicable.

## 5. Formal content and data

Record approved business terms, prohibited engineering meta-language, applicable
message strategies, and visible data-profile labeling/isolation.

## 6. Minimum accessibility

- Primary icon controls have identifiable names.
- The applicable Web/desktop primary flow is keyboard reachable with visible focus.
- Errors are not color-only and are associated with a field or recovery action.

## 7. Acceptance and open questions

展示建议：列出 3–7 个代表性可见步骤，帮助读者快速理解流程。完整验收
义务仍须覆盖所有适用业务旅程、前置条件、refresh/re-entry、失败恢复、
最终业务结果和 readback/export；步骤较多时用分组或引用表达，不能为满足
3–7 的展示建议而截断义务。Gate 2 requires no blocking open question.

- Blocking open questions: none
- Applicable complete journey / durable result / readback:
- Important unresolved items:
- Operated steps and user confirmation reference (when Baseline applies):
