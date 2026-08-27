---
name: learn
description: Use the legacy Atlas learning flow to save a manual archival lesson.
---

Use the local learning helper only when a user explicitly wants a legacy Atlas lesson file. MemPalace is the default long-term memory and semantic recall layer.

## Host Note

Codex invokes this flow as `$atlas-workflow:learn`; Claude Code invokes it as `/learn` or by calling the `learn` skill directly. For CLI commands below, prefer the bare `atlas-workflow` command on `PATH`, falling back to the absolute `~/.codex/workflow/bin/codex-workflow` only when no `PATH` command is available.

## 输出语言

- 生成或更新项目文档、需求/方案/分析/交接材料、design-review 报告、team 决策、workflow artifacts 和面向用户的总结时，默认使用中文。
- 面向用户的回复和总结要口语化、通俗易懂：不要把 `canonical scope source`、`staffing_mode`、`release_mode`、`frozen Goal` 这类内部流程术语直接抛给用户，先用平实的中文说清楚意思（例如“本次范围以哪份文档为准”），确有必要时再在括号里附上原术语。
- 命令、文件路径、代码标识符、配置键、API 名称、错误原文和必须保持的模板字段可以保留原文。
- 如果 `codex-workflow` 创建了英文骨架标题，在写入实质内容时改为中文标题；用户明确要求其他语言时，以用户要求为准。

Follow this loop:

1. Prefer searching MemPalace first to avoid saving the same lesson twice.
2. Run `~/.codex/workflow/bin/codex-workflow list`.
3. Prefer the task id provided by the user. If none is provided, find the most relevant `done` task. If that is not clear, ask one short question.
4. Use `~/.codex/workflow/bin/codex-workflow show <task-id>` if you need the task details before saving the lesson.
5. Only save a lesson for a task that is already `done`.
6. Save the lesson with:
   - `~/.codex/workflow/bin/codex-workflow learn <task-id> "<lesson title>" "<lesson>"`
7. In the final reply, include the task id, lesson title, learning path or id, and whether MemPalace already had related content.
