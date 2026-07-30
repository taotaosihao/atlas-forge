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

Implementers and fixers return one `IMPLEMENTER_REPORT_JSON`; reviewers return one `REVIEW_VERDICT_JSON`. New reviewer verdicts use schema v2 with a verdict-local unique `finding_id` per issue and `{gap_id, description}` objects for `cannot_verify_from_diff`; schema v1 is read-only historical compatibility and must not be authored for a new review. Reviewers never write admission fields. `NEEDS_CONTEXT` must contain a concrete blocking question, and controller answers go to `answers.jsonl` only when the SDD protocol is active.

## Review And Repair

1. Validate the implementer report against its brief (`codex-team-validate-json --type implementer-report --file <report> --brief <brief>`) and inspect the current diff.
2. Review against the current user goal, slice acceptance, required checks, and directly affected integration surface.
3. Automatically repair only current-goal blockers, regressions introduced by the current diff, or safety/data/permission issues that make this delivery unsafe.
4. Admit a finding into the current delivery whenever its controller resolution is `disposition: current-required`, retaining both `open` and `resolved` requirements in clean rewrites. Only `repair_status: open` blocks the goal or creates repair feedback. Record `visible-follow-up` and `informational` findings as provenance or follow-ups; they do not create new SDD slices or acceptance.
   - Write controller decisions as a temporary JSON object containing exactly `records` and `evidence_gaps`, with exactly one entry for every verdict finding and evidence gap.
   - Run `codex-team-controller-resolution --task <task-id> --slice <slice-id> --decisions <json-file>`. The helper derives `verdict_digest` and `goal_ref`, validates full coverage and authority binding, and atomically writes the canonical `controller-resolution.json`; do not hand-author its envelope.
5. Continue only when the next implementation or evidence change can materially advance the current goal. Use the existing `fix_progress_stalled` terminal when it cannot.
6. When the current authorized goal is the named roadmap or all listed phases, continue to the next internal slice without reapproval. Slice completion is not whole-goal completion, persistence wording does not expand scope, and the controller must not invent slices outside the current goal.

## Commits, Review Scope, And Evidence

- For semantics-v2 implementation contracts, every required acceptance or edge-case row derived from review must cite `current-required:<finding_id>`; goal-derived rows cite `goal:<requirement-ref>`. Project only admitted findings into Goal, Acceptance, Completion, Edge Cases, or Required safe fallback, and keep other findings in `Finding Provenance`.
- Strict semantics-v2 contract lint verifies this attribution against one or more canonical SDD slice directories supplied with repeated `--authority-slice`; it validates each brief, verdict, controller resolution, task binding, goal ref, and `current-required` finding instead of trusting token shape or natural-language severity/remediation.
- Execution-v3 verifies and accepts the exact admitted HEAD plus the current
  worktree tree, so do not commit a slice before its required verification,
  acceptance, and whole-goal `done`. After successful `done`, the integration
  owner commits exactly the accepted tree and archives the task; archive records
  `completion.final_commit_link` and fails closed on tree drift, a commit-tree
  mismatch, or a non-descendant commit. `logical_outcome` does not force a
  pre-verification or per-slice commit. Outside execution-v3, keep using moderate
  verified logical commits rather than one commit per repair round.
- Regenerate review input after a repair and inspect new direct regressions normally.
- Run branch/integration review only when integration risk justifies it.
- Keep raw logs, traces, screenshots, dumps, and intermediate repair output outside Git. Keep one rolling runtime checkpoint for cross-compaction continuity instead of replaying all ledgers.

## Product Release Certification

Release-readiness invariant: only a Team execution-v3 product_release whose immutable Profile final sweep binds one unchanged candidate and yields the completion-derived release_decision.status=certified may be called source-level release-ready; it never proves or authorizes installation, push, deployment, publication, or actual release. Task/slice/agent/review completion, passing tests, screenshots, Business Acceptance, design approval, or MVP/Beta labels never grant release-ready status.

- For an admitted `product_release`, brief schema version 3 preserves the exact semantics-v4 release intent, execution-plan schema version 2, immutable Profile digest, component digests, and final-only check definitions.
- Put all Profile checks in one terminal release-certification slice that transitively depends on every other executable slice. Attach each recomputed typed fact to its required-gate receipt, and require every receipt to bind the same final candidate manifest and final repository tree.
- Implementers, reviewers, verifiers, subagents, and the controller may supply raw inputs, reports, facts, or receipts only through their assigned contracts. They never author `release_decision`; completion derives `certified`, `denied`, or `cannot_verify` after validating the whole sweep.
- Slice completion, review approval, a passing command, and whole-task completion without a derived decision are not release readiness. Missing, stale, malformed, mixed-candidate, or unsupported evidence must remain inadmissible or `cannot_verify`, never a synthesized pass.
