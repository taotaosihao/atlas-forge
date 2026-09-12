# Design Review Contract

task_id: {{TASK_ID}}
title: {{TITLE}}
page: {{PAGE}}
design_source: {{DESIGN_SOURCE}}
created: {{CREATED}}

## Scope

- Review target:
- Included views:
- Included states:
- Excluded areas:

## Required Inputs

- [ ] Design source is accessible
- [ ] Review page is accessible
- [ ] Target viewports and required states follow the approved design and current user decisions
- [ ] Required states/interactions listed

## Must-Match Rules

| Area | Expectation | Severity | Evidence Source |
|------|-------------|----------|-----------------|
| Structure |  | high | design + DOM |
| Copy |  | high | design + text |
| Layout |  | high | design + geometry |
| Visual |  | medium | design + screenshot |
| Interaction |  | high | design + interaction trace |

## Allowed Tolerances

| Area | Allowed Difference | Notes |
|------|--------------------|-------|
| Shadow |  |  |
| Radius |  |  |
| Typography rendering |  |  |

## Target Viewports

List only the viewports required by the approved design and current user decisions, with their source references. Do not add desktop or mobile coverage by default. Resolve missing required dimensions before judging layout.

| Viewport | Width | Required | Notes |
|----------|-------|----------|-------|
|  |  |  |  |

## Required States And Interactions

Derive the required states and interactions from the same sources; the scaffold does not decide which recovery or interaction is optional.

| Item | How To Trigger | Required | Notes |
|------|----------------|----------|-------|
|  |  |  |  |

## Hard Gates

- [ ] No missing structural sections
- [ ] No incorrect core copy
- [ ] No broken layout at any required viewport
- [ ] No missing required interaction/state

## Soft Review Prompts

- Is the visual hierarchy aligned with the design?
- Does spacing feel materially tighter or looser than intended?
- Does the implementation preserve the same overall tone?
