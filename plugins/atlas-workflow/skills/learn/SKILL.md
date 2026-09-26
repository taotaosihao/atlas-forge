---
name: learn
description: Saves a manual legacy Atlas lesson file for a completed task. Use only when the user explicitly asks to record a lesson; MemPalace, where the host provides it, is the default memory layer.
---

Use the local learning helper only when a user explicitly wants a legacy Atlas lesson file. MemPalace, where the current host provides it, is the default long-term memory and semantic recall layer.

## Host Note

Codex invokes this flow as `$atlas-workflow:learn`; Claude Code invokes it as `/learn` or by calling the `learn` skill directly. Other `$atlas-workflow:<name>` references below follow the same per-host pattern. Commands below are written as bare Atlas command names (`atlas-workflow`, `codex-design-review`, and so on); run them through the current host's entry: `~/.codex/workflow/bin/<command>` on Codex, and `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/bin/<command>` (or the `LOCAL_BIN_ROOT` chosen at install) on Claude Code, whose entry sets the runtime root, so do not call the runtime copy under `workflow/bin` there. A bare `PATH` lookup is acceptable only when `command -v <command>` does not resolve into the other host's directory, because a machine with both hosts can put either first.

## 输出语言

- 生成或更新项目文档、需求/方案/分析/交接材料、design-review 报告、team 决策、workflow artifacts 和面向用户的总结时，默认使用中文。
- 面向用户的回复和总结要口语化、通俗易懂：不要把 `canonical scope source`、`staffing_mode`、`release_mode`、`frozen Goal` 这类内部流程术语直接抛给用户，先用平实的中文说清楚意思（例如“本次范围以哪份文档为准”），确有必要时再在括号里附上原术语。
- 命令、文件路径、代码标识符、配置键、API 名称、错误原文和必须保持的模板字段可以保留原文。
- 如果 `atlas-workflow` 创建了英文骨架标题，在写入实质内容时改为中文标题；用户明确要求其他语言时，以用户要求为准。

Follow this loop:

1. When MemPalace is available, search it first to avoid saving the same lesson twice.
2. Run `atlas-workflow list`.
3. Prefer the task id provided by the user. If none is provided, find the most relevant `done` task. If that is not clear, ask one short question.
4. Use `atlas-workflow show <task-id>` if you need the task details before saving the lesson.
5. Only save a lesson for a task that is already `done`.
6. Save the lesson with:
   - `atlas-workflow learn <task-id> "<lesson title>" "<lesson>"`
7. In the final reply, include the task id, lesson title, learning path or id, and whether MemPalace already had related content or was unavailable.
