---
name: design-review
description: Use the Atlas design-review flow for design fidelity or formal Web UI evidence verification.
---

Use the Atlas design-review flow for this request.

## Host Note

Codex invokes this flow as `$atlas-workflow:design-review`; Claude Code invokes it as `/design-review` or by calling the `design-review` skill directly. For CLI commands below, prefer the bare `atlas-workflow` command on `PATH`, falling back to the absolute `~/.codex/workflow/bin/codex-workflow` only when no `PATH` command is available.

## 输出语言

- 生成或更新项目文档、需求/方案/分析/交接材料、design-review 报告、team 决策、workflow artifacts 和面向用户的总结时，默认使用中文。
- 面向用户的回复和总结要口语化、通俗易懂：不要把 `canonical scope source`、`staffing_mode`、`release_mode`、`frozen Goal` 这类内部流程术语直接抛给用户，先用平实的中文说清楚意思（例如“本次范围以哪份文档为准”），确有必要时再在括号里附上原术语。
- 命令、文件路径、代码标识符、配置键、API 名称、错误原文和必须保持的模板字段可以保留原文。
- 如果 `codex-workflow` 创建了英文骨架标题，在写入实质内容时改为中文标题；用户明确要求其他语言时，以用户要求为准。

For a corrected or evidence-challenged design, first apply the shared
[decision supersession protocol](../../references/decision-supersession.md).

## Release Boundary

An ordinary design-fidelity review is not automatically a `product_release`. When the selected contract uses immutable Profile `web-ui-v1`, this flow may emit the Profile-bound formal Web UI facts assigned to the official adapter, but it never emits or upgrades a release decision.

Its report, verdict, screenshots, hashes, and adapter consistency are still claims, not trusted producer provenance. Without a workflow-bound producer receipt tied to the immutable candidate, the release fact is `cannot_verify`.

Release-readiness invariant: only a Team execution-vnext product_release whose immutable Profile final sweep binds one unchanged candidate and yields the completion-derived release_decision.status=certified may be called source-level release-ready; it never proves or authorizes installation, push, deployment, publication, or actual release. Task/slice/agent/review completion, passing tests, screenshots, Business Acceptance, design approval, or MVP/Beta labels never grant release-ready status.

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
5. For an applicable Web UI review, read the approved D and E, D's bound
   candidate commit and entrypoint, the current candidate and relevant diff, D
   section 7, and optional screenshots. Treat D's form factor/viewport, states,
   and interactions as the review authority. Mark mobile not applicable when D
   specifies desktop-only Web. Review the current candidate by default; replay a
   historical Baseline only for a named dispute.
6. Build a design contract before judging:
   - must-match rules
   - allowed tolerances
   - target viewports
   - required states and interactions
   - for release mode, separately verify that the admitted Team check binds the final candidate manifest digest, content-addressed surface inventory, accountable human owner, and content-addressed owner-decision evidence
7. Collect evidence from the implementation with real tools:
   - the served current candidate from D's entrypoint and representative screenshots for D's required viewports
   - DOM/text structure
   - computed styles and geometry for critical elements
   - interaction evidence for required states
   - keep bulk screenshots, Playwright JSON, traces, videos, HAR, command full
     output, and retry logs in the temporary run directory by default
   - if a real browser cannot operate the entrypoint, keep the review non-passing
8. Evaluate gates in this order:
   - input completeness
   - structure and copy
   - hard visual/layout rules
   - multi-viewport behavior
   - interaction coverage
   - overall visual coherence
   - in release mode, record only the four typed formal Web UI facts assigned by the immutable Profile and official adapter, and bind every fact to the unchanged candidate; dead controls, happy-path-only coverage, engineering/meta content leakage, missing owner acceptance, or missing stable evidence fail or remain `cannot_verify` as the adapter contract specifies
9. Write the ordinary result into the scaffolded `report.md` and generic `verdict.json`. In release mode, additionally write the canonical `formal-web-ui-v1@1` raw adapter input under the task `release/raw/` artifact path and bind that exact file through the admitted check's `verify --input`; never replace or reinterpret the generic verdict as release evidence. Screenshots and model judgment alone never prove interaction behavior, owner acceptance, or release readiness.
10. Port the useful Reflection ideas, not the OpenCode runtime hooks:
   - prefer evidence over claims
   - keep implementation and judgment separate
   - use explicit gates
   - keep retries bounded
11. If the verdict is incomplete but the remaining work is agent-actionable, continue with targeted fixes, rerun the failed checks, then rerun D's applicable viewports and interactions. After 3 failed loops, stop and report the blocker clearly.
12. Before reporting success, verify with real commands and tools, then read
    `verdict.json.status` without translation. Only the literal value `passed`
    permits a passing claim. Missing, unknown, unparsable, or any other value
    stays non-passing; task `done`, build/test results, and screenshots cannot
    infer or replace it. In release mode, report each formal fact as `passed`,
    `failed`, or `cannot_verify`; do not write `certified`.
13. When the review work is actually finished, run `~/.codex/workflow/bin/codex-workflow done <task-id>`. Review-task completion is not product-release certification and cannot change the verdict status.
14. Let MemPalace hooks/mining capture reusable context by default; use `codex-workflow learn` only for legacy manual archival.
15. In the final reply, include the task id, the verdict file path and its exact status, the release raw-input file path and candidate identity when release mode was active, verification commands and results, and any remaining fidelity risks. State these in plain Chinese (for example “评审结论写在 `<verdict.json path>`”) instead of surfacing internal terms such as `generic verdict` or `canonical raw adapter input`. Mention a release decision only when a separate Team completion-derived record was supplied, and quote its status exactly.
