# Execution discipline

Apply these rules during authorized implementation in Task or Team. They change
the order of work and who plans it; they do not change the goal, authority,
paths, acceptance, or the repair scope of review findings.

## Primary flow first

- Make the current goal's primary flow work end to end, through its real
  entrypoint check, before fixing other paths.
- A defect is blocking only when it stops the primary flow or its verification,
  or makes the delivery unsafe (safety, data, permission). Fix blocking defects
  at once.
- Record each non-blocking defect once in the existing task, checkpoint, or
  report carrier (symptom, location, evidence) and keep going. Do not detour
  into it, and do not drop it silently.
- After the primary flow passes, review the recorded defects. Fix those inside
  the current goal and rerun the affected checks; the rest stay follow-ups
  under the existing review repair rules. Completion requires every recorded
  defect to be fixed or listed as a follow-up.

## Major decisions

- A decision is major when it is costly to reverse or changes architecture,
  data or interface contracts, compatibility, or the approach after a
  design-signal replan.
- Before a major decision, the main session may gather several independent
  read-only perspectives (explorers, planners, or reviewers) and compare them.
  This is discussion, not Clarify fan-out or a Team selection, and it
  authorizes no mutation.
- Record the decision once in the existing durable carrier (task
  `route-decision`, contract, Team `decision.md`, checkpoint, or final report):
  options considered, key evidence, choice and reason, and any dissent.
- When every option stays within the current contract (goal, acceptance,
  authority, and owned paths unchanged) and the discussion reaches consensus
  without a material reservation, record the decision and continue
  implementation without waiting for user confirmation.
- Return to the user with a concise decision packet when material
  disagreement persists, or when the decision needs new authority or is
  user-owned (product intent, risk acceptance, compatibility the contract
  does not settle, permission, ownership).

## Separate planning

- The main session drives the work: dispatch, integration, verification, and
  records. It does not author the implementation plan itself.
- When work needs a plan or replan (multi-step implementation, slice or
  ownership boundaries, or a design-signal replan), dispatch one separate
  `atlas-sdd-planner` lane on a frontier model and execute from its plan. One
  planning dispatch is not a Team selection. Clear single-step work needs no
  planner.
- Codex resolves the planner route from the planning matrix in the Team
  [model routing reference](../skills/team/references/codex-model-routing.md).
  Claude Code inherits the session model when it is the host's frontier tier,
  and otherwise passes a frontier `model` override that the current `Agent`
  schema supports.
- If no planner can be dispatched, disclose the missing capability, keep the
  plan minimal in the main session, and do not present it as independent
  planning.
