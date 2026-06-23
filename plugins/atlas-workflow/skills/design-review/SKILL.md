---
name: design-review
description: Use the Atlas design-review flow for design fidelity verification.
---

Use the Atlas design-review flow for this request.

## 输出语言

- 生成或更新项目文档、需求/方案/分析/交接材料、design-review 报告、team 决策、workflow artifacts 和面向用户的总结时，默认使用中文。
- 命令、文件路径、代码标识符、配置键、API 名称、错误原文和必须保持的模板字段可以保留原文。
- 如果 `codex-workflow` 创建了英文骨架标题，在写入实质内容时改为中文标题；用户明确要求其他语言时，以用户要求为准。

Follow this loop:

1. Search MemPalace for related prior decisions, sessions, design reviews, and legacy Atlas lessons.
2. Run `~/.codex/workflow/bin/codex-workflow list`.
3. Reuse a relevant `doing` task if one already exists. Otherwise prefer:
   - `~/.codex/workflow/bin/codex-design-review init "<short title>" "<page url or route>" "<design source>"`
   - This creates and starts a bounded task and scaffolds:
     - `contract.md`
     - `report.md`
     - `verdict.json`
   - If the page or design source is missing, create a normal bounded task instead and ask one short blocking question.
4. Read `docs/design-fidelity-verification-playbook.md` if you need the detailed acceptance model.
5. Build a design contract before judging:
   - must-match rules
   - allowed tolerances
   - target viewports
   - required states and interactions
6. Collect evidence from the implementation with real tools:
   - per-viewport screenshots
   - DOM/text structure
   - computed styles and geometry for critical elements
   - interaction evidence for required states
7. Evaluate gates in this order:
   - input completeness
   - structure and copy
   - hard visual/layout rules
   - multi-viewport behavior
   - interaction coverage
   - overall visual coherence
8. Write the result into the scaffolded `report.md` and `verdict.json`.
9. Port the useful Reflection ideas, not the OpenCode runtime hooks:
   - prefer evidence over claims
   - keep implementation and judgment separate
   - use explicit gates
   - keep retries bounded
10. If the verdict is incomplete but the remaining work is agent-actionable, continue with targeted fixes, rerun the failed checks, then rerun the full desktop and mobile review. After 3 failed loops, stop and report the blocker clearly.
11. Before reporting success, verify with real commands and tools. Do not claim design fidelity based only on “looks right”.
12. When the work is actually finished, run `~/.codex/workflow/bin/codex-workflow done <task-id>`.
13. Let MemPalace hooks/mining capture reusable context by default; use `codex-workflow learn` only for legacy manual archival.
14. In the final reply, include the task id, verdict path, evidence artifacts, verification commands and results, and any remaining fidelity risks.
