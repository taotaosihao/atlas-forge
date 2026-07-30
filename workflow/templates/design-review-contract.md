# Formal Web UI Review Contract

task_id: {{TASK_ID}}
title: {{TITLE}}
page: {{PAGE}}
design_source: {{DESIGN_SOURCE}}
created: {{CREATED}}

## Decision Boundary

- Review target: one served Web UI candidate, not synthetic HTML or a screenshot-only mockup.
- Release mode: bind the final `candidate_manifest_digest` and content-addressed surface inventory before review.
- Decision owner: name the accountable human owner and content-address the decision evidence.
- Release rule: `passed` requires stable evidence and an unconditional owner `accepted` decision. Conditional, missing, disputed, or model-only judgment is `cannot_verify`.
- Scope boundary: this review emits typed facts only for `capability-truth`, `surface-states`, `formal-content-ia`, and `accessibility-quality`; it does not replace Business Acceptance, production-data, security, or operability evidence.

## Required Inputs

- [ ] Candidate manifest digest is fixed and matches the served route.
- [ ] Surface inventory ref and digest cover every released Web UI route.
- [ ] Desktop and mobile target viewports are defined.
- [ ] Primary roles, critical actions, destructive actions, permissions, and recovery paths are listed.
- [ ] Applicable loading, empty, error, disabled, long-content, and viewport states are triggerable.
- [ ] Evidence refs are content-addressed and identify the same candidate.
- [ ] Human owner identity and decision evidence are recorded.

## Formal Dimensions

| Profile dimension | Required release assertion | Minimum evidence | Known hard failure |
|---|---|---|---|
| capability-truth | Every visible or claimed affordance performs its represented behavior or is explicitly unavailable. | Served interaction traces plus resulting state or business effect. | Dead, decorative, misleading, or unimplemented control. |
| surface-states | Every applicable state is operable and comprehensible at target viewports. | Triggered loading, empty, error, permission, disabled, destructive, recovery, long-content, desktop, and mobile states. | Happy-path-only review or an untested applicable state. |
| formal-content-ia | Information architecture and content use approved product/business language. | DOM/text inventory and rendered review of released routes. | Demo, placeholder, acceptance, implementation, debug, or engineering meta-narrative exposed as product content. |
| accessibility-quality | Keyboard, focus, semantics, readability, viewport behavior, and declared quality budgets pass. | Keyboard/focus trace, accessibility evidence, target viewport screenshots, and named quality results. | Missing stable evidence, material accessibility failure, or viewport breakage. |

## Required Failure Checks

| Check | Status | Evidence | Notes |
|---|---|---|---|
| Dead controls | cannot_verify |  | Must be `passed` for capability truth. |
| Happy-path-only coverage | cannot_verify |  | Must be `passed` for surface states. |
| Engineering/meta content leakage | cannot_verify |  | Must be `passed` for formal content and IA. |

## Owner Decision

- Owner:
- Status: accepted | rejected | cannot_verify
- Content-addressed evidence ref:
- Candidate manifest digest:
- Surface inventory ref/digest:

## Output Contract

Complete `verdict.json` using schema version 2. Each dimension records `passed`, `failed`, or `cannot_verify`, a substantive summary, content-addressed evidence refs, and unresolved finding codes. Do not write `certified`; the release fact adapter and completion admission derive later decisions.
