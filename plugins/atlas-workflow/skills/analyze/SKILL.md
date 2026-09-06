---
name: analyze
description: Use the Atlas analyze flow for read-only cross-file synthesis.
---

Use the Atlas analyze flow for this request.

## Host Note

Codex invokes this flow as `$atlas-workflow:analyze`; Claude Code invokes it as `/analyze` or by calling the `analyze` skill directly. For the CLI commands below, prefer the bare `atlas-workflow` command on `PATH`, falling back to the absolute `~/.codex/workflow/bin/codex-workflow` only when no `PATH` command is available.

## 输出语言

- 生成或更新项目文档、需求/方案/分析/交接材料、design-review 报告、team 决策、workflow artifacts 和面向用户的总结时，默认使用中文。
- 面向用户的回复和总结要口语化、通俗易懂：不要把 `canonical scope source`、`staffing_mode`、`release_mode`、`frozen Goal` 这类内部流程术语直接抛给用户，先用平实的中文说清楚意思（例如“本次范围以哪份文档为准”），确有必要时再在括号里附上原术语。
- 命令、文件路径、代码标识符、配置键、API 名称、错误原文和必须保持的模板字段可以保留原文。
- 如果 `codex-workflow` 创建了英文骨架标题，在写入实质内容时改为中文标题；用户明确要求其他语言时，以用户要求为准。

For a corrected or evidence-challenged decision, first apply the shared
[decision supersession protocol](../../references/decision-supersession.md).

Follow this loop:

1. Decide whether persistence, recovery, audit, or handoff value justifies a
   workflow record. A short read-only synthesis can stay in the current
   response; do not create a task or artifact just because this entrypoint was
   selected.
2. When a durable record is useful, run `~/.codex/workflow/bin/codex-workflow list`,
   reuse a relevant `doing` task, and create/start one only when no relevant
   task exists. Keep one current authoritative analysis body for the result.
3. Read only the current authoritative inputs needed before exploring. When a
   workflow record is used, inspect its existing task and relevant artifacts:
   - `~/.codex/workflow/bin/codex-workflow show <task-id>`
   - `workflow/artifacts/<task-id>/context.md`
   - `workflow/artifacts/<task-id>/spec.md`
   - `workflow/artifacts/<task-id>/analysis.md`
   Do not create parallel `context`, `spec`, decision, or repository-bundle
   copies merely to mirror the same analysis.
4. Keep this step read-only.
5. Treat the selected direction as a current hypothesis, not proof of its
   supporting premises. Gather existing facts that could change the
   recommendation before settling it:
   - commands
   - file paths
   - call sites
   - config values
   - actual outputs
6. When a durable record is useful, write or update the one current
   `workflow/artifacts/<task-id>/analysis.md` with:
   - `## 证据`
   - `## 推断`
   - `## 未知项`
   - `## 综合排序`
   Record the key assumption, the evidence that tests it, and what observation
   would change the recommendation. Do not mirror the same conclusion into a
   second workflow or repository document.
7. Keep inference and unknown separate.
8. Route by the actual gap: switch to `$atlas-workflow:office-hours` when evidence challenges product value, the target user, or investment scope; switch to `$atlas-workflow:brainstorm` when the solution shape or choice is unsettled; and switch to `$atlas-workflow:clarify` when the direction still holds but execution boundaries remain unclear. When new evidence does not challenge the existing direction, keep it and do not redo exploration.
9. Use `$atlas-workflow:team` only when a remaining gap explicitly requires bounded coordination and passes Team's admission rules. Ordinary discussion or a staffing consideration does not switch layers, create a formal Team run, or claim formal machine review. Team uses Codex native collaboration by default. Use Paseo only when the user or operator explicitly selects it for the Team, lane, or dispatch; an operational Paseo failure follows the recorded Codex fallback policy without expanding scope or authority.
10. When a durable record is used, before calling the analysis material available as input for further
    discussion or planning for a specific next step—clarification, an explicitly
    admitted Team discussion, a real handoff, or execution planning—run:
    - `~/.codex/workflow/bin/codex-workflow ready <task-id> --require analysis`
    `ready` checks only that the named material is present as input for further
    discussion or planning; it does not prove semantic sufficiency,
    implementation authority, or execution readiness. If it is handed directly
    to an implementer, cite the current authoritative scope's required behavior,
    permissions, and applicable acceptance; when any are missing, name the
    concrete gap instead of claiming implementation-ready.
11. If a real handoff is requested, point to the current Goal, confirmed
    decisions, and remaining gaps; label recommendations separately from
    approvals and do not copy the scope or impose a fixed checklist. If the
    artifact is intentionally partial or exploratory, do not claim execution
    readiness; report the remaining unknowns instead.
12. In the final reply, include the task id and `analysis.md` path only when a
    durable record was used, then report evidence sources reviewed, readiness
    result if run, and remaining unknowns.
