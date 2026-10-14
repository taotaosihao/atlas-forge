---
name: control
description: Set up, audit, or change a project's Control index, the small project-owned set of confirmed intent, boundaries, controlled interfaces and key acceptance that implementation must keep. Use to create control/index.yaml, check a change against it, or revise an entry; ordinary Task and Team work reads an existing index without invoking this skill.
---

# Control

The shared [Project Control](../../references/control.md) rules define the
index, who may change an entry and how ordinary work reads it. This skill holds
the three explicit actions. Write project documents in Chinese by default.

## init

Use `init` only when the user asks to set up Control for a project that has
none, with project-file write permission.

1. Read the project's instructions and its existing authority: requirements,
   approved designs, contracts, interface and data definitions, acceptance
   tests, `docs/verification-map.md` and decision records.
2. Take the constraints whose violation would be costly and that meet the
   admission rule. Start small; a first index normally has no more than about a
   dozen entries.
3. Mark an entry `user` when its authority records a user statement or
   approval, and `agent` otherwise. Current code shows how the system runs, not
   what it must do, so code alone never makes an entry.
4. When sources disagree, a newer explicit user decision wins over older
   material. Leave two conflicting `user` sources out of the index and collect
   them into one question for the user; do not stop the rest.
5. Write `control/index.yaml` and its one-line declaration in the project
   `AGENTS.md` as one Control commit, without touching other work in the tree,
   then run `scripts/atlas-control-lint --repo <project> --base <commit before
   it>` from this plugin, two directories above this skill, until it reports
   `consistent`.

```yaml
version: 1
entries:
  - id: <stable-kebab-id>
    controls: <one sentence: what must hold>
    source: user | agent
    authority: [<path or user-message:ref>]
    paths: [<governed path or glob>]
    checks: [<existing acceptance test file, or command plus its test files>]
    basis: <agent only: decision, evidence or cited practice>
```

`init` does not change product code, add tests, install anything, or configure
CI, CODEOWNERS or merge protection. Recommend those only when the project wants
merges blocked mechanically.

## check

Read-only. For committed changes, first run this plugin's
`scripts/atlas-control-lint --repo <project> --base <merge base>` and include
its findings; it covers commits only, so judge uncommitted edits by reading them.
Then apply step 6 of the shared rules to a named diff or the current change,
including changes to the index itself. Return exactly one of:

```text
consistent | drift-found | blocked
```

For `drift-found`, give each affected entry id, the conflicting files and
evidence, and whether the implementation or the entry needs to change.
`blocked` names the missing input, such as an unknown base or an unreadable
authority file.

## change

Revise an entry under the shared rules: an `agent` entry through step 5, a
`user` entry only with the user message that changes it. State the old and
new requirement, the reason, the affected paths and checks, and any acceptance
adjustment, then commit the Control change on its own.
