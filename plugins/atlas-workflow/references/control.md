# Project Control

Control is the small part of a project that states what must hold: confirmed
product intent, architecture and module boundaries, controlled interfaces and
data models, and key acceptance. Everything else is free implementation that
may change as long as Control still holds. A project declares Control with
`control/index.yaml`, referenced from its `AGENTS.md`; an existing
`control/index.yaml` counts as the declaration when that line is not loaded.
Without either, these rules do not apply. Ordinary work never creates
Control; only `$atlas-workflow:control` `init` does, at the user's request.

## Index

Each entry names what it controls, its `source` (`user` or `agent`), the
authority files or `user-message:` reference that hold the requirement, the
paths it governs, the existing checks that verify it, and for an `agent` entry
the basis it was decided on, pointing at an existing decision record or source
rather than restating it. The index references existing requirements,
contracts, interfaces and tests instead of copying them; a requirement with no
other home gets a short `control/<topic>.md`. The authority files, the index
and its declaration line are controlled content.

Admit an entry only when changing it would change a user promise, business
meaning, compatibility or a stated engineering boundary. Internal structure,
helpers, test harnesses and ordinary unit tests stay free. Extend an existing
entry before adding one, and replace a superseded entry in place; git history
keeps the old version. Keep the index short enough to read at the start of
every task.

## Who may change an entry

- A `user` entry records a requirement the user stated or approved. Only a new
  user message changes it.
- An `agent` entry records a decision the agent made. The agent may revise or
  remove it through change step 5 below.

## During work

Writing or committing Control needs the current edit and commit authority.
Without it, put the proposed entry or change in the handoff or report.

1. **Select.** Read the index and take the entries the current goal touches.
   Path matches are hints: follow shared interfaces to their callers. The
   entries constrain the current scope and add no goals.
2. **State.** Say which entries the work keeps and which it changes before
   implementing. A dispatched implementation or review lane receives the
   relevant entry ids and authority paths in its existing packet; this adds no
   brief field.
3. **Resolve conflicts.** If the implementation departs from an entry, fix the
   implementation. If the entry itself is missing, stale or wrong, neither
   bend the code around it nor edit it in passing; change an `agent` entry
   through step 5. Evidence against a `user` entry stops only the work that
   depends on it; continue unaffected work and add the conflict to the
   questions for the user. Record it with `decision-conflict` under the
   [decision supersession protocol](decision-supersession.md) only when it
   blocks the whole goal.
4. **Grow.** Under the admission rule, record without asking: a durable
   requirement the user states in conversation becomes a `user` entry, while a
   task-scoped instruction or an ambiguous remark does not; a major decision
   under the shared [execution discipline](execution-discipline.md) becomes an
   `agent` entry whose basis is that decision's record; a real-use defect caused
   by an unclear entry sharpens an `agent` entry through step 5 and puts a
   `user` entry into the questions for the user. Where Control is silent on a major
   decision, research the established industry practice, decide, and cite it
   as the basis. A new entry goes through the task's ordinary review.
5. **Revise or remove an `agent` entry.** Commit the Control change on its own,
   before the implementation that depends on it. Its reason must stand without
   the implementation: a user requirement, real-use evidence or a cited
   practice; "the code needs it" is not a reason. A reviewer who did not author
   it checks that reason before the dependent implementation proceeds; this is
   not a Team selection. If the reviewer rejects it, keep the old entry and
   return the implementation to it. Only when the host cannot dispatch such a
   reviewer may the change proceed, marked unreviewed in the final report.
6. **Check the result.** A controlled change alters an authority file or the
   behavior an entry controls. Each one needs a matching Control change from
   this task; acceptance tests, interfaces or index entries must not be
   weakened to make a check pass. Editing a governed path while keeping its
   entry needs no Control change, and the entry's `checks` become candidates
   under the [Verification guidance](verification.md), which keeps check
   selection: Control adds no new tests by itself. Report each Control change
   in one line of the final reply.

Return to the user under the existing rules of the Verification guidance and
the execution discipline, plus any change to a `user` entry. Collect those
questions and ask them together while unaffected work continues.
