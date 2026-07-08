# Implementation Contract

task_id: {{TASK_ID}}
title: {{TITLE}}
created: {{CREATED}}

## Scope

- Goal:
- Non-goals:
- Files or surfaces likely affected:
- User-visible behavior:

## Acceptance Criteria

| ID | Criterion | Required | Verification |
|----|-----------|----------|--------------|
| AC-1 |  | yes |  |

## Real Validation Plan

| Row | Target | Command or action | Expected result | Phase conclusion evidence |
|-----|--------|-------------------|-----------------|---------------------------|
| V-1 |  |  |  | `evidence/phase-review-report.md` |

## Evidence Budget

- Git evidence defaults to phase conclusions: `phase-review-report.md`, `defect-queue.md`, `evidence-index.md` or `evidence-manifest.json`, and `gate-checklist.md`.
- Optional git evidence: `review-checklist.md`, `verification-checklist.md`, final screenshots, or customer-facing HTML/PDF/sign-off deliverables when needed.
- Temporary run artifacts outside git by default: raw logs, Playwright JSON, traces, videos, HAR, bulk screenshots, full command output, failed retry logs, worker debug JSONL, API dumps, localhost/port status, and intermediate repair output.
- Target per phase: 10 git evidence files or fewer and 1 MB or less. Explain exceptions in `phase-review-report.md`.

## Edge Cases

| Case | Expected behavior | Required |
|------|-------------------|----------|
|  |  | yes |

## Failure And Stop Conditions

- Stop and ask the user when:
- Treat the task as failed when:
- Safe fallback:

## Completion Check

- [ ] Scope stayed inside the contract
- [ ] Required acceptance criteria passed
- [ ] Required validation rows have evidence
- [ ] Residual risks are recorded
