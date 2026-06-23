---
name: cw
description: Use the Atlas local workflow helper for bounded work.
---

Use the local workflow helper for this request.

## 输出语言

- 生成或更新项目文档、需求/方案/分析/交接材料、design-review 报告、team 决策、workflow artifacts 和面向用户的总结时，默认使用中文。
- 命令、文件路径、代码标识符、配置键、API 名称、错误原文和必须保持的模板字段可以保留原文。
- 如果 `codex-workflow` 创建了英文骨架标题，在写入实质内容时改为中文标题；用户明确要求其他语言时，以用户要求为准。

Follow this loop:

1. Search MemPalace for relevant prior decisions, sessions, and legacy Atlas lessons.
2. Run `~/.codex/workflow/bin/codex-workflow list`.
3. Reuse a relevant `doing` task if one already exists. Otherwise create a new bounded task with:
   - `~/.codex/workflow/bin/codex-workflow init-task "<short title>" "<clear done condition>"`
   - then `~/.codex/workflow/bin/codex-workflow start <task-id>`
4. Treat `~/.codex/workflow/bin/codex-workflow recall "<task title or topic>"` as a legacy fallback only when MemPalace is unavailable.
5. Use `$atlas-workflow:analyze` for read-only cross-file evidence synthesis when the next step is still diagnosis.
6. Use `$atlas-workflow:clarify` when brownfield facts need to become `context.md` and `spec.md`.
7. Use `$atlas-workflow:team` when the task needs discussion, staffing, or promotion before execution.
8. Keep small features and fixes in the current workspace. Only switch to `$atlas-workflow:worktree` when the work clearly needs isolation.
9. If isolated branch work reaches completion, switch to `$atlas-workflow:finish` instead of merging, discarding, or cleaning up automatically.
10. Keep the task scope small and use `~/.codex/workflow/bin/codex-workflow show <task-id>` when you need to inspect the task file.
11. Before reporting success, verify the work with real commands.
12. When one feature or fix is complete, create a dedicated git commit for that single piece of work using `type[optional scope]: <description>`. If the change is larger, add a clear body that explains what changed and what it affects.
13. When the work is actually finished, run `~/.codex/workflow/bin/codex-workflow done <task-id>`.
14. Let MemPalace hooks/mining capture reusable context by default; use `codex-workflow learn` only for legacy manual archival.
15. In the final reply, include the task id, changed files or artifact paths, verification commands and results, and any blockers or unverified assumptions.
