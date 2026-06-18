---
name: design-review
description: Use the Atlas design-review flow for design fidelity verification.
---

Use the Atlas design-review flow for this request.

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
