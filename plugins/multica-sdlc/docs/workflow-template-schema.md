# Dynamic Workflow Template Schema

The default example is `templates/multica-sdlc-workflow.yaml`.

Each `workflow.phases[]` entry is a routing unit. A phase must define:

| Field | Purpose |
| --- | --- |
| `phase` | Stable phase id used by Multica events. |
| `artifact_type` | Expected artifact class, such as `commit`, `validation-report`, or `gate-decision`. |
| `required_roles` | Role groups that must produce passing results for the phase join. |
| `optional_roles` | Role groups that may participate without blocking when absent. |
| `join_policy` | `all_required` or `any_blocker`. |
| `repair_owner` | Role group that receives repair tasks for failures. |
| `blocker_owner` | Role group that receives blockers or unknowable repair ownership. |
| `clean_gate_owner` | Role group that owns clean-gate decisions. |
| `next_phase` | Phase to enter after normal completion. |
| `next_roles` | Role groups to dispatch after normal completion. |
| `done_criteria` | Human-readable completion evidence expectation. |
| `timeout_action` | Routing action when the phase/join times out. |

`workflow.role_groups` is advisory metadata for leaders, planners, and external
dispatch systems. The bundled router does not expand group aliases today; it
treats `required_roles`, `optional_roles`, `next_roles`, owner fields, and event
`role_results` keys as literal role names. If a template needs multiple concrete
agents in a join, name the concrete role keys directly in the phase or have the
leader/external dispatcher map the group before calling the router.

Optional routing blocks override the defaults:

- `on_join_wait`
- `on_join_complete`
- `on_failure`
- `on_blocker`

The default SDLC template includes a `contract` phase before implementation.
That phase uses `artifact_type: sprint-contract` and joins the generator/coder
proposal with the evaluator/E2E challenge before code is written. Optional
reviewer or Evidence QA output may tighten the contract; available failures or
blockers still route through the template failure/blocker owners.

Each routing block may define:

| Field | Purpose |
| --- | --- |
| `action` | `dispatch` or `wait`. |
| `phase` | Next phase id. |
| `roles` | Explicit next role groups. |
| `roles_from` | Name of a phase owner field, such as `repair_owner`. |
| `reason` | Short reason included in router JSON output. |

## Join Semantics

For `all_required`, every required role must have a passing result on the same
phase and commit SHA. Optional roles do not block when absent. If an optional
role returns `FAIL` or `BLOCKER`, the router treats it as available evidence and
routes repair/blocker according to the phase.

For `any_blocker`, the router routes only when a blocker is observed; otherwise
it waits.

The default result sets are:

- success: `DONE`, `PASS`, `CLEAN`, `READY`
- failure: `FAIL`, `FAILED`, `BLOCKED`, `ERROR`
- blocker: `BLOCKER`, `MISROUTED_ROLE`

Phases can override success by role with `success_results`, for example
`reviewer: ["CLEAN"]` and `e2e: ["PASS"]`.

## Idempotency

The router computes:

```text
issue id + phase + commit SHA + source comment/run id + next roles hash
```

as `dedupe_key`. Hooks should persist this key before dispatching next roles.
Passing `--dedupe-store <path> --record-dedupe` makes the bundled router append
dispatch keys to a JSONL store and return `duplicate` when the same route is
seen again.

## Leader Boundary

Templates should route to `leader` only when the leader actually owns the
decision:

- clean-gate or next-phase adjudication after a completed join;
- blocker or unknown repair owner;
- template-explicit leader action;
- final closure, PR-ready gate, or blocked report.

Routine implementation, validation, and repair hops should route to the next
specialist role group named in the template.
