# Product-manager progress reports

Load this reference whenever Task or Team work returns to the user, including
the final reply. Internal checkpoints update only the rolling checkpoint.

Keep the product-manager body to one screen and use this order:

- `完成与验收`: describe verified behavior as “用户现在可以……”, followed by the product manager's action, expected result, actual result, and direct evidence.
- `测试覆盖`: summarize capability, scenario, result, and untested boundary in product language; do not paste agent reports, and a command name or green gate alone is not a capability explanation.
- `未完成与下一验收点`: state uncompleted or unverified behavior, failed checks, product impact, and the next acceptance point. Never present unverified work as complete.

Agent activity, files changed, and slices closed are not product outcomes. Do not lead with paths, commit hashes, schema versions, gate or slice IDs, agent/backend details, JSON, or command lists. Keep those exact facts in a short `技术追溯` section after the acceptance body when they aid audit or handoff. Structured agent output, ledgers, receipts, and raw logs remain internal evidence inputs rather than user-facing report prose.

When a formal execution grant exists, use `codex-workflow product-progress <task-id>` for the read-only current objective, blocker, next acceptance point, and authorization impact; do not infer those facts from `progress.jsonl` or hand-edited task state.

For canonical phase status, run `codex-workflow project-phase-report <task-id> <phase-id>`. The scaffold is only an unprojected sentinel; never hand-author its acceptance coverage, receipt status, or release decision.
