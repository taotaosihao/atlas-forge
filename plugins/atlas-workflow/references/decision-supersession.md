# Decision supersession

Use this protocol when the user corrects, replaces, confirms, or rejects an
earlier decision, or when evidence challenges a user-confirmed decision.

For a durable `doing` task, record the correction before more forward work:

```bash
codex-workflow decision-record <task-id> --id <new-id> --authority-ref <user-message:ref|operator-input:ref> --statement "<current decision>" [--supersedes <old-id>]... [--reject "<old behavior>"]... [--operation-id <id>]
```

- A correction is replacement, not an additive exception. Do not revive the old
  behavior as an independent requirement, fallback, or reviewer interpretation.
- Name every recorded decision it replaces with `--supersedes`. Use `--reject`
  for superseded behavior that predates the ledger.
- Run `decision-check <task-id>` before code, verification, agent work, handoff,
  or a success claim. `prompt-bundle` includes the short current `decisions.md`.
- A correction makes older prompt bundles, Team generations, execution grants,
  and verification stale. Rebuild, replan, or reverify as applicable.

Evidence can challenge a decision but cannot replace it. Record the conflict:

```bash
codex-workflow decision-conflict <task-id> --id <conflict-id> --decision <active-id> --reason "<conflict>" --evidence <path-or-ref> [--operation-id <id>]
```

`HUMAN_DECISION_REQUIRED` blocks new implementation, verification, Team work,
and success claims. Cleanup remains allowed. Only a new user or operator message
can resolve it, recorded as a decision that both supersedes the challenged
decision and names the conflict:

```bash
codex-workflow decision-record <task-id> --id <resolved-id> --authority-ref <user-message:ref|operator-input:ref> --statement "<resolved decision>" --supersedes <challenged-id> --resolves <conflict-id> [--operation-id <id>]
```

Without a durable task, rewrite the corrected clause in the existing scope,
retain one short “must not return” note, and return contradictory evidence to
the user. Do not create a task only to log a tiny correction.
