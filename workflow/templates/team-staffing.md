# Staffing

task_id: {{TASK_ID}}
created: {{CREATED}}
artifact_category: workflow_working_notes
backend: native

## Agent Plan

| Role | Agent Type | Count | Read/Write | Owned Scope | Tools | Deliverable | Join Gate |
| --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |

## Active Roles

| Role | Why Active | Agent Type | Count | Read/Write | Owned Scope |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |

## Omitted Roles

| Role | Omission Reason |
| --- | --- |
|  |  |

## Runtime Staffing Adjustments

| Trigger | Role Change | Model | Reasoning Effort | Why Now | Ledger/Event |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |

## Phase Gates

| Phase | Owner | Input | Output | Required Gate | Commit Boundary |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |

## Product/UI Gate Staffing

| Field | Owner | Evidence |
| --- | --- | --- |
| Product/UI gate classification |  |  |
| first_operable_user_flow |  |  |
| browser_entrypoint |  |  |
| served_ui_validation_action |  |  |
| ui_data_mode |  |  |
| required_safety_gates |  |  |
| stop_if_no_ui_by_phase |  |  |

Served UI evidence and hard safety-gate evidence are separate acceptance inputs.
Served UI evidence does not replace `no-data-plane-direct`, `no-cloud-runtime`,
Provider credential, or browser network boundary evidence. Correctly labeled
headless/network evidence may satisfy safety gates, but not UI/product
acceptance by itself.

## Commit Boundaries

- Each implementation step or acceptance slice that changes files:
- Verification required before each commit:
- Commit owner:
- Allowed no-commit exceptions:

## Concurrency And Write Boundaries

- Writable workers:
- Disjoint write sets:
- Main Codex integration owner:

## Verification Evidence

- Commands:
- Phase conclusion files:
- Temporary raw run directory:
- Browser/API/runtime evidence kept in git:
- Artifact paths:
- Stop conditions:
