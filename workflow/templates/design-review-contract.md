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
- [ ] Desktop viewport defined
- [ ] Mobile viewport defined
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

| Viewport | Width | Required | Notes |
|----------|-------|----------|-------|
| Desktop | 1440 | yes |  |
| Mobile | 390 | yes |  |

## Required States And Interactions

| Item | How To Trigger | Required | Notes |
|------|----------------|----------|-------|
| Default | page load | yes |  |
| Hover | pointer hover | no |  |
| Active | click/tap | no |  |
| Empty/error/loading | direct route or setup | no |  |

## Hard Gates

- [ ] No missing structural sections
- [ ] No incorrect core copy
- [ ] No broken desktop layout
- [ ] No broken mobile layout
- [ ] No missing required interaction/state

## Soft Review Prompts

- Is the visual hierarchy aligned with the design?
- Does spacing feel materially tighter or looser than intended?
- Does the implementation preserve the same overall tone?
