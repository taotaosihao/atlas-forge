# Staffing

task_id: {{TASK_ID}}
created: {{CREATED}}
artifact_category: workflow_working_notes
backend: native

## Backend And Fallback Plan

- Default backend: native
- Explicit Paseo selection authority, if any:
- Fallback policy: codex
- Required provider/model perspective, if any:
- Missing perspective disclosure:
- Controller scheduling policy: bounded parallel for admitted ready lanes; this note
  records policy inputs and is not a runtime scheduler guarantee.
- Initial automatic wave soft cap: 4 child lanes (not a completion or stop limit)

## Agent Plan

List only roles that materially help the current task. Omit this section when a
single owner is enough.

### Admitted Lanes

Record only lanes that passed controller admission. Every lane needs a frozen
Goal or `current-required` reference, a ready input, a named consumer, a
read/write authority boundary, a structured output, a stop condition, and a
benefit or risk-reduction reason. Coalesce duplicate work and defer lanes whose
dependencies are not ready.

| Lane | Admission | Goal / finding ref | Consumer | Ready input / dependencies | Authority and paths | Expected output | Stop condition | Benefit / risk reason |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |

- Ready frontier at admission:
- Host-available child slots:
- Dispatch width used: `min(ready independent lanes, available child slots, 4)`
- Deferred or rejected lanes and reason (duplicate, dependency, overlap,
  unavailable exact route, writer/lease uncertainty, cost anomaly, or no
  consumer):

## Ownership

- Writable owner and scope:
- Writer lease paths:
- Read-only reviewers, if any:
- Integration owner:
- Canonical scope/artifact writer: main Codex
- Additional writers (only when paths are disjoint and an integration owner plus
  applicable lease/quiescence boundary are recorded):

## Record-Only Compatibility

- Dispatch admitted: yes / no
- If no dispatch is admitted, `effective_backend=none` remains a legal Team v2
  record-only compatibility result. It must not be represented as successful
  multi-agent parallel execution, and `team-record-finalize` must not fail merely
  because dispatch count is zero.
- If a lane or route is unavailable, disclose the lost perspective and continue
  only through the explicitly permitted main-only or same-authority fallback.

## Verification

- Required checks or evidence:
