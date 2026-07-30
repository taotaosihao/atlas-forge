---
name: design-review
description: Use the Atlas design-review flow for design fidelity or formal Web UI evidence verification.
---

Use the Atlas design-review flow for this request.

## 输出语言

- 生成或更新项目文档、需求/方案/分析/交接材料、design-review 报告、team 决策、workflow artifacts 和面向用户的总结时，默认使用中文。
- 命令、文件路径、代码标识符、配置键、API 名称、错误原文和必须保持的模板字段可以保留原文。
- 如果 `codex-workflow` 创建了英文骨架标题，在写入实质内容时改为中文标题；用户明确要求其他语言时，以用户要求为准。

## Release Boundary

An ordinary design-fidelity review is not automatically a `product_release`. When the selected contract uses immutable Profile `web-ui-v1`, this flow may emit the Profile-bound formal Web UI facts assigned to the official adapter, but it never emits or upgrades a release decision.

Release-readiness invariant: only a Team execution-v3 product_release whose immutable Profile final sweep binds one unchanged candidate and yields the completion-derived release_decision.status=certified may be called source-level release-ready; it never proves or authorizes installation, push, deployment, publication, or actual release. Task/slice/agent/review completion, passing tests, screenshots, Business Acceptance, design approval, or MVP/Beta labels never grant release-ready status.

Follow this loop:

1. Search MemPalace for related prior decisions, sessions, design reviews, and legacy Atlas lessons.
2. Run `~/.codex/workflow/bin/codex-workflow list`.
3. Reuse a relevant `doing` task if one already exists. Otherwise prefer:
   - `~/.codex/workflow/bin/codex-design-review init "<short title>" "<page url or route>" "<design source>"`
   - This creates and starts a bounded ordinary design-fidelity task and scaffolds:
     - `contract.md`
     - `report.md`
     - `verdict.json`
   - If the page or design source is missing, create a normal bounded task instead and ask one short blocking question.
4. Read `docs/design-fidelity-verification-playbook.md` if you need the detailed acceptance model. The scaffolded contract and verdict remain the generic fidelity record. Release-mode evidence exists only inside an admitted Team release check: load the immutable Profile, write the canonical formal Web UI raw adapter input under the task `release/raw/` artifact path, and bind that exact file through the admitted check's `verify --input` instead of redefining the generic verdict.
5. Build a design contract before judging:
   - must-match rules
   - allowed tolerances
   - target viewports
   - required states and interactions
   - for release mode, separately verify that the admitted Team check binds the final candidate manifest digest, content-addressed surface inventory, accountable human owner, and content-addressed owner-decision evidence
6. Collect evidence from the implementation with real tools:
   - the served final candidate and representative screenshots for the required viewports
   - DOM/text structure
   - computed styles and geometry for critical elements
   - interaction evidence for required states
   - keep bulk screenshots, Playwright JSON, traces, videos, HAR, command full
     output, and retry logs in the temporary run directory by default
7. Evaluate gates in this order:
   - input completeness
   - structure and copy
   - hard visual/layout rules
   - multi-viewport behavior
   - interaction coverage
   - overall visual coherence
   - in release mode, record only the four typed formal Web UI facts assigned by the immutable Profile and official adapter, and bind every fact to the unchanged candidate; dead controls, happy-path-only coverage, engineering/meta content leakage, missing owner acceptance, or missing stable evidence fail or remain `cannot_verify` as the adapter contract specifies
8. Write the ordinary result into the scaffolded `report.md` and generic `verdict.json`. In release mode, additionally write the canonical `formal-web-ui-v1@1` raw adapter input under the task `release/raw/` artifact path and bind that exact file through the admitted check's `verify --input`; never replace or reinterpret the generic verdict as release evidence. Screenshots and model judgment alone never prove interaction behavior, owner acceptance, or release readiness.
9. Port the useful Reflection ideas, not the OpenCode runtime hooks:
   - prefer evidence over claims
   - keep implementation and judgment separate
   - use explicit gates
   - keep retries bounded
10. If the verdict is incomplete but the remaining work is agent-actionable, continue with targeted fixes, rerun the failed checks, then rerun the full desktop and mobile review. After 3 failed loops, stop and report the blocker clearly.
11. Before reporting success, verify with real commands and tools. Do not claim design fidelity based only on “looks right”. In release mode, report each formal fact as `passed`, `failed`, or `cannot_verify`; do not write `certified`.
12. When the review work is actually finished, run `~/.codex/workflow/bin/codex-workflow done <task-id>`. Review-task completion is not product-release certification.
13. Let MemPalace hooks/mining capture reusable context by default; use `codex-workflow learn` only for legacy manual archival.
14. In the final reply, include the task id, generic verdict path, canonical raw-input path and candidate identity when release mode was active, verification commands and results, and any remaining fidelity risks. Mention a release decision only when a separate Team completion-derived record was supplied, and quote its status exactly.
