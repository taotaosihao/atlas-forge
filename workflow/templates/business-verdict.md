# Business Verdict

task_id: {{TASK_ID}}
created: {{CREATED}}
title: {{TITLE}}
schema_version: 2

## Verdict

- Decision: accepted | conditionally_accepted | rejected | blocked
- Decision owner:
- Decision date:
- Business workflow:
- Technical gate status: passed | failed | blocked | not_run
- Business acceptance status: passed | failed | blocked | not_run
- Blockers: substantive named conditions are required for blocked/rejected; placeholders such as `none`, `TBD`, or `pending` are invalid; accepted/conditionally_accepted must use an empty array
- Required follow-ups:

## Dual-goal Closure

- Include `goal_a` and `goal_b` together only when `business-intent.closure_mode` is `dual_goal`; omit both for `standard`.
- goal_a.status: passed | failed | blocked | not_run
- goal_a.evidence_refs:
- goal_a.integration_path_id:
- goal_a.integration_mode: real | approved_simulator | mock | synthetic | not_run
- goal_b.status: passed | failed | blocked | not_run
- goal_b.evidence_refs:
- goal_b.integration_path_id:
- goal_b.integration_mode: real | approved_simulator | mock | synthetic | not_run
- Dual-goal rule: accepted or conditionally accepted requires both goals passed, independent passed evidence, and the same `real` or `approved_simulator` integration path.

## Basis

- Accepted scenarios:
- Conditional scenarios:
- Rejected scenarios:
- Evidence references:
- Goal A evidence references:
- Goal B evidence references:
- Substitution check: Goal A did not replace Goal B, and Goal B was not proven only by mock protocol logs.

## Conditions

- Blocking condition (must also appear in `blockers` for blocked/rejected):
- Required business follow-up:
- Technical follow-up dependency:
- Deadline:

## Sign-off

- Stakeholder:
- Reviewer:
- Residual risk accepted:
- Final note:
