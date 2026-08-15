---
name: team-v1
description: Use the legacy Atlas team flow backed by codex-workflow team-start/team-loop and codex exec lanes.
---

Use the legacy Atlas team flow for this request.

`$atlas-workflow:team-v1` is the legacy Atlas team entrypoint. It uses
`codex-workflow team-start`, `codex-workflow team-loop`, and child `codex exec`
lane processes. Use it only when the user explicitly asks for legacy behavior,
explicitly accepts legacy behavior, or when you need to reproduce/debug old
`team-start` / `team-loop` behavior.

## Host Note

Codex invokes this flow as `$atlas-workflow:team-v1`; on Claude Code it is reachable as `/team-v1` or the `team-v1` skill, but its lane processes shell out to `codex exec` and require a Codex CLI on `PATH` — this legacy backend is Codex-only regardless of which host loaded the skill. On Claude Code, prefer `$atlas-workflow:team` (native collaboration, host-neutral) instead of this legacy entrypoint.

## 输出语言

- 生成或更新项目文档、需求/方案/分析/交接材料、design-review 报告、team 决策、workflow artifacts 和面向用户的总结时，默认使用中文。
- 命令、文件路径、代码标识符、配置键、API 名称、错误原文和必须保持的模板字段可以保留原文。
- 如果 `codex-workflow` 创建了英文骨架标题，在写入实质内容时改为中文标题；用户明确要求其他语言时，以用户要求为准。

Follow this loop:

1. Run `~/.codex/workflow/bin/codex-workflow list`.
2. Reuse a relevant `doing` task if one already exists. Otherwise create/start one.
3. Treat this as the legacy Atlas collaboration layer for bounded work that must stay on the old CLI-backed implementation:
   - Use `$atlas-workflow:team-v1` only for compatibility, old flow debugging, or explicit user acceptance of this legacy entrypoint.
   - Tiny precise fixes may skip team when scope and verification are obvious.
4. Record team routing evidence for nontrivial discussion, review, staffing, contract formation, or promotion:
   - `~/.codex/workflow/bin/codex-workflow route-decision <task-id> --intent team --risk <low|medium|high> --decision use --reason "<why legacy team is needed>"`
5. Read `workflow/artifacts/<task-id>/context.md`, `spec.md`, and `analysis.md` before launching the round.
6. Legacy discuss mode defaults to 3 agents:
   - `~/.codex/workflow/bin/codex-workflow team-start <task-id> "<objective>"`
   - In legacy `team-v1`, 3 is the default, not a hard limit. Use `--agents N` when a legacy round needs more lanes; lanes beyond the named seed roles are recorded as `lane-4`, `lane-5`, and so on.
7. Use execute mode when the round should focus on implementation roles:
   - `~/.codex/workflow/bin/codex-workflow team-start <task-id> "<objective>" --mode execute`
   - Lead product implementation objectives with stable domain/capability identity and actual responsibility. Keep task, Gate, phase, slice, and acceptance labels as delivery metadata rather than using them as the default product architecture or naming namespace.
8. Use the legacy Atlas-managed bounded team loop when the user wants the old CLI-backed loop:
   - `~/.codex/workflow/bin/codex-workflow team-loop <task-id> "<objective>" --max-iterations 5 --max-time 1h`
   - Add `--verify-check "<command>"` when a shell command can objectively prove the goal.
   - Use this legacy loop only when `$atlas-workflow:team-v1` is intentional.
   - The legacy loop runs inside Atlas workflow: each iteration launches `team-start --mode execute`, runs checks, asks a verifier to put `done=true` or `done=false` on the first non-empty message line, and writes a `team/loop-*.md` ledger.
   - `--max-time` is enforced across team/check/verifier substeps; a substep that exceeds the remaining deadline stops the loop with `loop-timeout`.
   - Do not use open-ended loops. Always keep `--max-iterations` and/or `--max-time` bounded.
9. Use `--claude-review` only when an explicit Claude review lane is wanted.
10. Treat `workflow/artifacts/<task-id>/team/decision.md` as the single main decision file.
11. When a high-risk route or Multica handoff needs consensus evidence, run:
    - `~/.codex/workflow/bin/codex-workflow route-decision <task-id> --intent team --risk high --decision use --reason "<why consensus evidence is required>" --consensus`
12. Use `workflow/artifacts/<task-id>/team/staffing.md` for ownership suggestions.
13. When promoting to execution, record whether the next implementation needs a lightweight implementation contract:
    - Use it for non-tiny local work with UI/API/CLI/background-job behavior, cross-file changes, or meaningful edge cases.
    - The contract owner is the main implementer unless the team explicitly assigns a separate reviewer.
    - The contract must preserve the team decision and must not add new scope.
    - After review, the final implementation contract must be a clean rewrite of the settled requirements in `implementation-contract.final.md`; keep review history in `reviews/` or `decisions/`, not appended to the final executable contract body.
    - When authority-backed facts determine an environment, status, verification level, or conclusion, state the goal neutrally and place the condition once in an existing invariant, acceptance row, or edge case. If review invalidates an overbroad or stale claim, replace it in place; do not retain it and append exception sections, parallel requirements, per-value matrices, or mirrored prose.
    - Review severity, `required_fix`, affected rows, and remediation prose do not grant scope. For SDD v2, every validated controller finding with `disposition: current-required` remains projected into executable requirements whether `repair_status` is `open` or `resolved`; only `open` findings block or create repair feedback.
    - Keep `visible-follow-up` and `informational` findings in provenance or follow-up records. In semantics-v2 contracts, required acceptance and edge-case rows cite `goal:<requirement-ref>` or `current-required:<finding_id>`.
    - Maintain `contract-index.md` so the next implementer can find the current authoritative contract without reading older drafts first.
    - For Multica handoff, prefer the Multica sprint contract rather than the Atlas lightweight template.
14. When the team discussion settles an actionable plan, promotion, or staffing handoff, also write a concise project doc:
    - prefer an existing project docs location; otherwise create `docs/atlas-workflow/` under the target project root.
    - create or reuse one workflow docs bundle for the same workflow: `docs/atlas-workflow/<workflow-id>-<short-topic>/`.
    - use stable files inside the bundle, such as `README.md`, `team-decision.md`, `staffing.md`, `contract-index.md`, `implementation-contract.draft.md`, `implementation-contract.final.md`, `reviews/`, `decisions/`, and `evidence/`; do not create scattered sibling markdown files for the same workflow.
    - make `contract-index.md` the bundle entrypoint: besides `current_authoritative_contract`, include supporting evidence links for `team_decision`, `staffing`, `evidence_index`, `workflow_team_decision`, and `workflow_team_staffing` so later implementers can find staffing and evidence without relying on the final reply.
    - include the final decision, consensus basis, owner/staffing plan when relevant, acceptance criteria, verification gates, risks, and next execution step.
    - keep `workflow/artifacts/<task-id>/team/decision.md` as the discussion record; the project doc is the durable handoff for the repo.
    - keep phase git evidence concise: default to `phase-review-report.md`, `defect-queue.md`, `evidence-index.md` or `evidence-manifest.json`, and `gate-checklist.md`; keep raw logs, Playwright JSON, traces, videos, HAR, bulk screenshots, command full output, debug JSONL, API dumps, port status, and intermediate repair output in the temporary run directory unless a blocking defect or gate dispute requires that raw artifact.
    - reviewers inspect phase conclusion files first and open raw artifacts only for blocking defects, disputed gates, or missing conclusion references; target each phase at 10 git evidence files or fewer and 1 MB or less, with any exception explained in `phase-review-report.md`.
15. Check status or stop the active round with:
   - `~/.codex/workflow/bin/codex-workflow team-status <task-id>`
   - `~/.codex/workflow/bin/codex-workflow team-stop <task-id>`
16. While `team-status` reports `team_status: running`, inspect the reported `team_round` and `team_temp_dir` paths before deciding the round is stalled. Parent command stdout may stay empty until all lanes finish; do not treat `Pending discussion.` or empty stdout alone as proof that no lane discussion exists.
17. If the round is interrupted, stalled, or produces empty lane stdout:
    - inspect `team-status`, the `team_round` file, and the lane files in `team_temp_dir` before deciding whether any substantive partial output exists.
    - if partial output is enough to act on, replace the template/interrupted `team/decision.md` with a synthesized decision that says it was synthesized from partial output, lists evidence checked, blocking findings, non-blocking risks, and the recommended next step.
    - run `~/.codex/workflow/bin/codex-workflow ready <task-id> --require context,spec,analysis,decision` after writing the synthesized decision.
    - continue with direct execution only when the synthesized decision has no unresolved blocking issue and the validation path is clear; record the direct-execution rationale with `route-decision --intent task`.
    - ask the user or rerun `team-start` when partial output is insufficient, the task is high-risk, or the next action would change scope, data safety, deployment, credentials, or external systems.
18. Before promoting to execution, worktree, finish, or Multica handoff, run:
    - `~/.codex/workflow/bin/codex-workflow ready <task-id> --require context,spec,analysis,decision`
    - use a narrower `--require` list only when the missing artifact is intentionally out of scope and explain why.
19. Promote explicitly with:
    - `~/.codex/workflow/bin/codex-workflow team-promote <task-id> --to execute --authorization-ref <user-message-ref> --brief <canonical-brief.json> --operation-id <id>`
    - `~/.codex/workflow/bin/codex-workflow team-promote <task-id> --to worktree`
    - `~/.codex/workflow/bin/codex-workflow team-promote <task-id> --to finish`
20. In the final reply, include the task id, `decision.md` path, staffing path if produced, workflow docs bundle path if written, authoritative contract path if produced, readiness result if run, promotion state, and any open decision.
