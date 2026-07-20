---
name: analyze
description: Use the Atlas analyze flow for read-only cross-file synthesis.
---

Use the Atlas analyze flow for this request.

## 输出语言

- 生成或更新项目文档、需求/方案/分析/交接材料、design-review 报告、team 决策、workflow artifacts 和面向用户的总结时，默认使用中文。
- 命令、文件路径、代码标识符、配置键、API 名称、错误原文和必须保持的模板字段可以保留原文。
- 如果 `codex-workflow` 创建了英文骨架标题，在写入实质内容时改为中文标题；用户明确要求其他语言时，以用户要求为准。

Follow this loop:

1. Run `~/.codex/workflow/bin/codex-workflow list`.
2. Reuse a relevant `doing` task if one already exists. Otherwise create/start one.
3. Read the task file and the current artifact inputs before exploring:
   - `~/.codex/workflow/bin/codex-workflow show <task-id>`
   - `workflow/artifacts/<task-id>/context.md`
   - `workflow/artifacts/<task-id>/spec.md`
   - `workflow/artifacts/<task-id>/analysis.md`
4. Keep this step read-only.
5. Gather evidence from the real repo.
   - commands
   - file paths
   - call sites
   - config values
   - actual outputs
6. Write `workflow/artifacts/<task-id>/analysis.md` with:
   - `## 证据`
   - `## 推断`
   - `## 未知项`
   - `## 综合排序`
7. Keep inference and unknown separate.
8. If the boundary is still unclear, switch to `$atlas-workflow:clarify`.
9. If discussion or staffing is the next step, switch to `$atlas-workflow:team`. Team uses Codex native collaboration by default. Use Paseo only when the user or operator explicitly selects it for the Team, lane, or dispatch; an operational Paseo failure follows the recorded Codex fallback policy without expanding scope or authority.
10. Before claiming the analysis artifact is ready for clarification, team discussion, handoff, or execution planning, run:
    - `~/.codex/workflow/bin/codex-workflow ready <task-id> --require analysis`
11. If the artifact is intentionally partial or exploratory, do not claim execution readiness; report the remaining unknowns instead.
12. In the final reply, include the task id, `analysis.md` path, evidence sources reviewed, readiness result if run, and remaining unknowns.
