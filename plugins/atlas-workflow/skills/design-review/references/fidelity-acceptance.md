# Fidelity acceptance model

Use this detail when building the design contract or judging an ordinary
design-fidelity review. The scaffolded `contract.md`, `report.md`, and
`verdict.json` remain the record; this model adds no requirement beyond the
approved design, current user decisions, and the project `DESIGN.md`, and it
never changes release-mode rules.

## Authority and inputs

- With an approved D, D and E are the review authority as the skill states.
- Without D (a fidelity review against a design source only), the design
  source, current user decisions, and the project `DESIGN.md` define the
  must-match rules. Record what they leave unspecified as open instead of
  inventing a standard.
- Input quality narrows what can be must-match, in this order: readable design
  specification, annotated design, plain screenshot, verbal description.
- Cover only the viewports and states required by those sources. Do not add
  desktop, tablet, or mobile coverage by default.

## Build the checklist before judging

Turn the sources into contract rows before looking at the implementation:
separate must-match items (structure, core copy, primary action position, key
color, key size and spacing, required layout changes) from allowed tolerances
(shadow, radius, font rendering, minor crop or distance). Give every row an
expectation, tolerance, and severity. Without this step the review drifts into
taste.

## Evidence and judgment

- View the screenshots for each required viewport side by side with the design
  source, or the closest existing page of the same kind when D has no visual
  source, and compare region by region. DOM, text, and geometry locate a
  specific error; geometry, element counts, or check totals alone never prove
  visual fidelity, and screenshots alone never prove interaction.
- Evaluate gates in the skill's order. A high-severity hard failure makes the
  round failing; do not argue it away with soft coherence. A clear departure
  from the design source's style is a hard visual failure, and tolerated
  differences must not accumulate into a visibly different overall impression.
- Write coherence findings as specific sentences naming the region and effect,
  such as "primary button outweighs the title" or "cards still use two columns
  at the required narrow viewport", never "looks similar". Where D and the
  project are silent, use the shared [UI/UX guidance](../../../references/ui-ux.md)
  and the matching sections of [UI patterns](../../../references/ui-patterns.md)
  as soft prompts.
- Every finding records location, evidence, severity, and a suggested fix.
  If a finding cannot be written that way, the evidence is not yet sufficient.

## Interaction evidence

- Before and after each interaction, capture the DOM or accessibility structure
  and a screenshot, and confirm the result before the next step.
- Locate targets from that structure (role, label, or selector), not from
  screenshot estimates; fall back to coordinates only after a structured target
  fails.
- Wait for loading to finish before judging. If an interaction has no visible
  effect, recapture and retry it once; if it still fails, record a finding.
- Classify what you see. A functional defect (no response, wrong destination,
  missing data) or a visual defect (overlap, clipped or unreadable text,
  off-screen or misaligned elements, wrong color) is a finding unless it falls
  within a contract tolerance row. Recheck a transient state (loading,
  animation) after it settles. An expected state (a real empty state, a disabled
  control with its reason, a permission prompt) is not a defect.
- Within the required viewports and states, use the longest real names and the
  fullest data available.

## Blocked versus failing

Replace the scaffold's default `blocked` status with the actual result: only
`passed` when every gate passes, otherwise a non-passing status such as
`failed`. Keep `blocked` only when the entrypoint cannot be reached, a required
state cannot be triggered for an environment or external reason
(`env-blocker`), or the inputs contradict each other; a missing design source
follows the skill's step 3 instead. A state that cannot be triggered because of
an implementation defect, missing coverage, unviewed screenshots, or evidence
that leaves the judgment to guesswork is failing, not blocked.

## Retry

Let the implementer change only open findings, then rerun the affected checks,
viewports, and states as the skill's retry rule requires. Keep implementation and
judgment separate: the implementer never declares its own pass. After repeated
failure, check whether inputs are incomplete or must-match and tolerance rows
were mixed; when a standard is genuinely missing, ask the user. Stopping follows
the skill's retry rule, not an attempt count.
