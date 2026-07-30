# Business Acceptance Protocol

Load this reference only when the user request, PRD, selected contract, or Team decision explicitly requires business scenarios, stakeholder acceptance, domain state transitions, protocol/device closure, or `team/acceptance/` artifacts.

## Activation

- Technical checks alone are insufficient to judge the named business workflow.
- The contract names the business scenarios, expected state transitions, evidence sources, and acceptance owner.
- Ordinary library, CLI, refactor, maintenance, and technical Team tasks do not activate this protocol.

## Dual-Goal Work

When a workflow spans both protocol/device integration and a user-facing business UI, keep the goals independent:

- Goal A proves the named real or approved-simulator integration path, action, response/callback, persisted state, and audit evidence.
- Goal B proves that the operator can complete the named UI workflow against integration-backed data and actions.
- Backend/protocol evidence cannot replace UI acceptance, and mock-only UI evidence cannot replace required integration closure.

For a `product_release`, the strict critical journey uses the named real integration path; an approved simulator is valid only when a non-release contract explicitly selects it. Both goals must bind the same final candidate and content-addressed evidence. An accepted release fact permits no conditional status, blockers, unresolved deviations, or acceptance follow-ups.

## Artifacts And Verdict

- Use the existing Team business-acceptance schemas and validators as the exact field contract; do not reproduce their full schema in prompts.
- Create only the scenario/evidence/verdict artifacts required by the selected contract. Do not generate the full BAF set for unused goals.
- A passed or conditional verdict requires current evidence for every required goal. Missing external evidence is a concrete blocker, not permission to invent substitute evidence or expand the roadmap.
- Reviewer findings outside the authorized business goal are follow-ups unless they make the current delivery unsafe.

## Release Fact Boundary

In release mode, this protocol supplies only the Profile-bound `critical-journey` fact through the official Business Acceptance adapter. An unconditional accepted verdict with both required goals and real integration may map to `passed`; rejected or failed acceptance maps to `failed`; conditional, blocked, missing, ambiguous, simulator-only, or unresolved evidence maps to `cannot_verify` according to the adapter contract.

Business Acceptance completion or stakeholder approval never grants certification. Only the Team execution-v3 completion-derived `release_decision.status` may be reported as the source-level release-readiness result, and its `certified`, `denied`, or `cannot_verify` value must be preserved exactly. Even `certified` does not prove or authorize installation, push, deployment, publication, or actual release.
