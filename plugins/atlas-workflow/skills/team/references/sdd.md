# Codex-Native SDD Protocol

Load this reference only when the current task explicitly uses Team SDD JSON contracts, slice ledgers, implementer/reviewer reports, or `codex-team-*` helpers. Ordinary Team work does not need this protocol.

## Controller Ownership

- The main Codex is the only writer of workflow artifacts, slice ledgers, review packages, verdict files, and controller state.
- Subagents return structured results; they do not write `workflow/artifacts/**`.
- Create a slice workspace and brief with the existing `codex-team-workspace` and `codex-team-brief` helpers, then validate JSON with `codex-team-validate-json`.
- Use `codex-team-review-package` for the recorded base/head diff and `codex-team-ledger` for lifecycle conclusions when durable SDD state is required.
- In SDD v2, the validated controller resolution is the sole finding-scope authority. Review severity, `required_fix`, affected rows, suggested remediation, and reviewer prose are discovery evidence, not admission decisions.

## Minimal Inputs

Give each role only the current slice brief, owned/forbidden paths, relevant source/diff, required checks, latest applicable verdict, and necessary answers. Do not replay the full task history or duplicate unrelated contract sections.

Implementers and fixers return one `IMPLEMENTER_REPORT_JSON`; reviewers return one `REVIEW_VERDICT_JSON`. `NEEDS_CONTEXT` must contain a concrete blocking question, and controller answers go to `answers.jsonl` only when the SDD protocol is active.

## Review And Repair

1. Validate the implementer report against its brief (`codex-team-validate-json --type implementer-report --file <report> --brief <brief>`) and inspect the current diff.
2. Review against the current user goal, slice acceptance, required checks, and directly affected integration surface.
3. Automatically repair only current-goal blockers, regressions introduced by the current diff, or safety/data/permission issues that make this delivery unsafe.
4. Admit a finding into the current delivery whenever its controller resolution is `disposition: current-required`, retaining both `open` and `resolved` requirements in clean rewrites. Only `repair_status: open` blocks the goal or creates repair feedback. Record `visible-follow-up` and `informational` findings as provenance or follow-ups; they do not create new SDD slices or acceptance.
5. Continue only when the next implementation or evidence change can materially advance the current goal. Use the existing `fix_progress_stalled` terminal when it cannot.
6. When the current authorized goal is the named roadmap or all listed phases, continue to the next internal slice without reapproval. Slice completion is not whole-goal completion, persistence wording does not expand scope, and the controller must not invent slices outside the current goal.

## Commits, Review Scope, And Evidence

- For semantics-v2 implementation contracts, every required acceptance or edge-case row derived from review must cite `current-required:<finding_id>`; goal-derived rows cite `goal:<requirement-ref>`. Project only admitted findings into Goal, Acceptance, Completion, Edge Cases, or Required safe fallback, and keep other findings in `Finding Provenance`.
- Contract lint verifies this structural attribution mechanically. It must not infer admission from natural-language severity, remediation, or review wording.
- Commit at moderate verified logical outcomes, not every repair round.
- Regenerate review input after a repair and inspect new direct regressions normally.
- Run branch/integration review only when integration risk justifies it.
- Keep raw logs, traces, screenshots, dumps, and intermediate repair output outside Git. Keep one rolling runtime checkpoint for cross-compaction continuity instead of replaying all ledgers.
