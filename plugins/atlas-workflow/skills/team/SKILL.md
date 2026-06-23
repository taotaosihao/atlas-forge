---
name: team
description: Use the Atlas team flow for multi-agent discussion, review, staffing, and promotion.
---

Use the Atlas team flow for this request.

## 输出语言

- 生成或更新项目文档、需求/方案/分析/交接材料、design-review 报告、team 决策、workflow artifacts 和面向用户的总结时，默认使用中文。
- 命令、文件路径、代码标识符、配置键、API 名称、错误原文和必须保持的模板字段可以保留原文。
- 如果 `codex-workflow` 创建了英文骨架标题，在写入实质内容时改为中文标题；用户明确要求其他语言时，以用户要求为准。

Follow this loop:

1. Run `~/.codex/workflow/bin/codex-workflow list`.
2. Reuse a relevant `doing` task if one already exists. Otherwise create/start one.
3. Record team routing evidence for nontrivial discussion, review, staffing, or promotion:
   - `~/.codex/workflow/bin/codex-workflow route-decision <task-id> --intent team --risk <low|medium|high> --decision use --reason "<why consensus or staffing is needed>"`
4. Read `workflow/artifacts/<task-id>/context.md`, `spec.md`, and `analysis.md` before launching the round.
5. Default to discuss mode with 3 agents:
   - `~/.codex/workflow/bin/codex-workflow team-start <task-id> "<objective>"`
6. Use execute mode when the round should focus on implementation roles:
   - `~/.codex/workflow/bin/codex-workflow team-start <task-id> "<objective>" --mode execute`
7. Use `--claude-review` only when an explicit Claude review lane is wanted.
8. Treat `workflow/artifacts/<task-id>/team/decision.md` as the single main decision file.
9. When a high-risk route or Multica handoff needs consensus evidence, run:
   - `~/.codex/workflow/bin/codex-workflow route-decision <task-id> --intent team --risk high --decision use --reason "<why consensus evidence is required>" --consensus`
10. Use `workflow/artifacts/<task-id>/team/staffing.md` for ownership suggestions.
11. When the team discussion settles an actionable plan, promotion, or staffing handoff, also write a concise project doc:
    - prefer an existing project docs location; otherwise create `docs/atlas-workflow/` under the target project root.
    - name it `docs/atlas-workflow/<task-id>-<short-topic>.md` unless the project already has a stronger naming convention.
    - include the final decision, consensus basis, owner/staffing plan when relevant, acceptance criteria, verification gates, risks, and next execution step.
    - keep `workflow/artifacts/<task-id>/team/decision.md` as the discussion record; the project doc is the durable handoff for the repo.
12. Check status or stop the active round with:
   - `~/.codex/workflow/bin/codex-workflow team-status <task-id>`
   - `~/.codex/workflow/bin/codex-workflow team-stop <task-id>`
13. While `team-status` reports `team_status: running`, inspect the reported `team_round` and `team_temp_dir` paths before deciding the round is stalled. Parent command stdout may stay empty until all lanes finish; do not treat `Pending discussion.` or empty stdout alone as proof that no lane discussion exists.
14. Before promoting to execution, worktree, finish, or Multica handoff, run:
    - `~/.codex/workflow/bin/codex-workflow ready <task-id> --require context,spec,analysis,decision`
    - use a narrower `--require` list only when the missing artifact is intentionally out of scope and explain why.
15. Promote explicitly with:
    - `~/.codex/workflow/bin/codex-workflow team-promote <task-id> --to execute`
    - `~/.codex/workflow/bin/codex-workflow team-promote <task-id> --to worktree`
    - `~/.codex/workflow/bin/codex-workflow team-promote <task-id> --to finish`
16. In the final reply, include the task id, `decision.md` path, staffing path if produced, project doc path if written, readiness result if run, promotion state, and any open decision.
