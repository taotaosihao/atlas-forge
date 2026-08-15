---
name: finish
description: Use the Atlas finish flow when isolated branch work is complete and needs confirmation, integration, or cleanup.
---

Use the Atlas finish flow for this request.

## Host Note

Codex invokes this flow as `$atlas-workflow:finish`; Claude Code invokes it as `/finish` or by calling the `finish` skill directly. For CLI commands below, prefer the bare `atlas-workflow` command on `PATH`, falling back to the absolute `~/.codex/workflow/bin/codex-workflow` only when no `PATH` command is available.

## 输出语言

- 生成或更新项目文档、需求/方案/分析/交接材料、design-review 报告、team 决策、workflow artifacts 和面向用户的总结时，默认使用中文。
- 命令、文件路径、代码标识符、配置键、API 名称、错误原文和必须保持的模板字段可以保留原文。
- 如果 `codex-workflow` 创建了英文骨架标题，在写入实质内容时改为中文标题；用户明确要求其他语言时，以用户要求为准。

Follow this loop:

1. Start from the active Atlas task when possible.
   - Run `~/.codex/workflow/bin/codex-workflow list`.
   - Reuse the relevant `doing` task or inspect it with `~/.codex/workflow/bin/codex-workflow show <task-id>`.
2. Verify the work before discussing next actions.
   - Run the real project test or validation commands from the current branch or worktree.
   - If a dedicated Docker Compose project was used, also confirm it is healthy with `docker compose -p "$compose_project" ps`.
   - If verification fails, stop and fix that first. Do not present finish options on a failing state.
3. Determine the intended base branch.
   - Prefer the repo's documented default branch.
   - If nothing documents it, prefer `main`, then `master`.
   - If still ambiguous, ask one short blocking question before any merge action.
4. Default to user confirmation.
   - Unless the user already said the equivalent of "don't ask, merge straight back to the main branch," stop and ask what to do next.
   - Present these four options:
     - `1. Merge back to <base-branch> locally`
     - `2. Push branch and create a pull request`
     - `3. Keep the branch and worktree as-is for later`
     - `4. Discard this branch and worktree`
5. If the user explicitly already said to skip confirmation and merge straight back to the main branch without confirmation, you may execute Option 1 directly after verification passes.
6. Execute the chosen path.
   - Option 1:
     - merge into the base branch locally
     - rerun the same verification on the merged result
     - stop the dedicated Compose project if one was used
     - remove the worktree if one was used
     - delete the finished local feature branch
   - Option 2:
     - push the branch and create the pull request
     - unless the user asked to preserve the local setup, stop the dedicated Compose project and remove the local worktree afterward
   - Option 3:
     - keep the branch and worktree
     - unless the user explicitly asked to keep containers running, stop the dedicated Compose project and report the restart command
   - Option 4:
     - require an explicit typed confirmation such as `discard`
     - after confirmation, stop the dedicated Compose project if one was used
     - remove the worktree if one was used
     - delete the branch
7. Never do these things without either explicit user choice or the explicit "skip confirmation and merge" instruction:
   - merge to the base branch
   - create a PR
   - delete the branch
   - remove the worktree
   - shut down the dedicated Compose project
8. Report the result clearly:
   - which option ran
   - whether confirmation was requested or intentionally skipped
   - branch state
   - worktree state
   - dedicated Compose project state if relevant
   - verification commands and results before and after any integration action
