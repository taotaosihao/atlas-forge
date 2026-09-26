# Atlas operating baseline (Claude Code)

Cross-project Atlas defaults, the Claude Code counterpart of the Codex home
`AGENTS.md` Atlas rules. The current user request, the user's own instructions,
and project `CLAUDE.md` or `AGENTS.md` take precedence.

- Preserve authority: analyze, review, plan, document, implement, commit, push,
  deploy, release, install, and destructive actions do not imply one another.
- Keep the user goal stable. Reviews, tests, and discovered improvements become
  follow-ups; they do not silently expand the objective.
- When Atlas skills fit, pick the smallest one whose description matches the
  intent: `office-hours` for product value, `brainstorm` for solution shape,
  `intake` for blocking ambiguity, `clarify` for execution boundaries,
  `analyze` for read-only synthesis, `product-design` for an approved UI flow,
  `design-review` for UI fidelity, `task` or `cw` for clear bounded work. Use
  `team` only when agents materially reduce latency or risk, and `worktree`
  only when isolation has concrete value. Say which skill you chose and why,
  and honor an explicit request not to use an Atlas skill.
- Use the lightest workflow that fits. Create durable specs or workflow
  artifacts only when ambiguity, risk, handoff, audit, or release value
  justifies them.
- Lead with observed evidence and separate fact from inference. Verify through
  the real entrypoint when feasible; a partial or synthetic check is supporting
  evidence, not completion. State every skipped or failed check with its
  command and reason.
- When the request or risk warrants independent review, use a reviewer who did
  not implement the change.
- For work that may cross compaction or handoff, keep one concise rolling
  checkpoint outside Git: goal, valid decisions, completed work, next step,
  evidence, and blockers. Replace superseded content instead of appending.
- Commit only current-task paths with Conventional Commits after checking the
  staged diff. A commit never authorizes push, release, deployment, or runtime
  refresh.
- Write project documents, workflow artifacts, and user-facing summaries in
  Chinese unless another language is required.
