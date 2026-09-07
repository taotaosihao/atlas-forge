---
name: project-verification
description: Build, run, or audit an optional project verification map that helps an agent find the real user entrypoint, drive a bounded journey, and read observable outcomes; it does not replace project harnesses, business acceptance, or workflow authority.
---

# Project Verification

Use this skill when a project needs a small, maintained index of how a person
actually starts a capability, drives its important journey, and observes the
result. It is an optional navigation and operating guide, not a new runner,
state machine, evidence kernel, verdict store, or release gate.

For a corrected or evidence-challenged expectation, first apply the shared
[decision supersession protocol](../../references/decision-supersession.md).
The current valid user decision and approved design remain authoritative;
implementation, old code, a stale map, or a passing check cannot recreate a
cancelled or replaced requirement.

## Map boundary

The default project map is one file at `docs/verification-map.md`. A newly
created v1 map may target at most five stable, high-value user capabilities or
business journeys; that limit does not trim existing project documentation or
reduce the number of journeys required by a current business delivery. A map is
a derived index: it points at existing authority, entrypoints, commands,
outputs, and readbacks, but it is not a requirements document or an acceptance
result. Do not create a second map when equivalent project material already
exists.

Design and planning stages may read an existing map as a lightweight reference
to entrypoints and verification methods; that read does not invoke `create`,
`run`, or `audit`, and it does not make an unimplemented path executable.

Each entry should use the fields in
[references/verification-map.template.md](references/verification-map.template.md):

- the user outcome and current behavior/design authority;
- the ordinary entrypoint and the complete journey/drive, not a page checklist;
- the observable outcome and existing evidence reference;
- only the applicable prerequisites, launch/doctor, side-effect readback, and
  resource disposition;
- gotchas, authority boundaries, and update triggers.

Never put `pass`, `done`, or `current` status, task/phase/slice state, receipt,
verdict, release-readiness, or execution claims in a map. Do not use health
checks, HTTP 200, green unit tests, or one screenshot as a substitute for the
user outcome. The map does not record this run's result.

## create

Use `create` only when the current task grants project-file write permission.
Before writing, discover the project's existing verification docs, skills,
harnesses, scripts, and ordinary user entrypoints:

1. Reuse an equivalent map or extend the existing material in place; do not
   create a parallel index, runner, schema, database, or evidence sink.
2. Write only the default `docs/verification-map.md` unless another path is
   explicitly owned. Keep newly added v1 entries to five or fewer stable
   capabilities without deleting or narrowing existing project material.
3. Derive each entry from current user decisions, approved design or contract,
   and actual project behavior. Keep the authority references instead of
   copying a second requirements document.
4. Record a real entrypoint and a complete journey with the same business
   objects and IDs when the capability is a business flow. Distinguish an
   entrypoint that is merely planned from one that was discovered or executed;
   a planned, approved bounded path may be documented as a dependency and plan,
   but a not-yet-implemented path must not be written as a runnable command.
5. Record why an account, business write, temporary resource, or cleanup is not
   applicable when the check is legitimately read-only; never invent data or a
   writer to make a state reachable.

`create` does not install dependencies, browsers, runtimes, adapters, or
accounts; log in; change host configuration; modify product code; write business
data; or update cache, marketplace, deployment, or release state. It cannot
create BAF, receipt, verdict, task, phase, or release artifacts. If a needed
entrypoint is missing or the map conflicts with current authority, report the
gap and leave the product unchanged.

## run

Use `run` to navigate one selected capability through an already approved,
reachable entrypoint. A map describes how; it never grants permission to
start an app, log in, write business data, operate an external service or
device, clean up, commit, deploy, or release. Do not repeat approval for a
normal step that is already explicitly authorised. Resolve these facts for the
actual action before driving it:

- current goal, design/contract authority, and host/instance; bind an exact
  candidate when the request claims precise candidate acceptance;
- instance ownership and the permitted operation scope;
- legal role, account, credentials, and test data where applicable;
- allowed side effects, existing evidence channel, and required checks;
- readback of durable effects and the authorised cleanup or retention
  postcondition.

If the actual host/instance identity, a candidate identity required by the
action, or an action-specific permission, data, side effect, evidence source,
or resource disposition is unknown, keep that action `blocked`. When only the
version is unknown, a read-only observation may proceed with a limited
conclusion. An unrelated precondition is not a blocker: a legal read-only check
in a shared environment or on an approved field instance needs no disposable
instance, and a check with no account or temporary resource can state that the
item is not applicable. An explicitly retained instance must not be destroyed.

For business-function delivery, load the shared
[Business Acceptance](../team/references/business-acceptance.md) rules when
the current design or plan defines business standards. This applies from a
direct Task or Team entrypoint even when Task was not run first; it does not
require this skill, a map, or an extra protocol selection. Execute the same
design requirements as a complete journey over one set of related objects,
including the final business result and applicable readbacks. A BAF artifact is
created only when the selected contract already requires it.

## audit

`audit` is read-only by default. Compare the map with current user decisions,
approved design, code/entrypoints, and the existing verification tools, then
return exactly one of:

```text
clean | drift-found | blocked
```

`clean` means no drift was found within the checked scope; it is not business
acceptance, a passing journey, or release readiness. For `drift-found`, report
the affected capability, the conflicting source references, the fields that
should change, and whether the issue is a product defect or an unavailable
verification entrypoint. A changed user decision, design, code path,
dependency, or launch instruction is an update trigger. If a current decision
is cancelled or replaced, reopen only the affected map entries and do not keep
the old obligation as a future requirement. Do not edit the map unless a
separate write authorization covers that exact change.

## Existing verification surfaces and provenance

Reuse the project's normal surface instead of copying its evidence model:

- Web: `workflow/bin/codex-web-acceptance` and its existing evidence output;
- 3D: `$atlas-workflow:3d-harness` for reviewed-local semantic states;
- business flows: the existing Task/Team Business Acceptance reference and any
  selected contract artifacts;
- CLI/TUI: the project's PTY, tmux, test harness, or stable script;
- field/device: the currently authorised read/control path, or `blocked` when
  no safe real entrypoint is authorised.

Static instructions and this source contract only show that the model is
described; they do not prove that an agent followed the map or that a real
business behavior passed. The upstream pstack adaptation is limited to the
fixed `0.14.8` source at commit
`93b00b89ef425a9c1bac0d0b317dfc49c930ac99`, tree
`ae6fff5803260f38f075feb8c3b008ed68153fa0`, under its MIT license. Atlas does
not add pstack, Bun, `cursor-team-kit`, or Cursor runtime dependencies.
