---
name: brainstorm
description: Use the Atlas brainstorm flow to turn a rough idea into design options, tradeoffs, and a recommended direction before execution clarification.
---

Use the Atlas brainstorm flow for this request.

## 输出语言

- 生成或更新项目文档、需求/方案/分析/交接材料、design-review 报告、team 决策、workflow artifacts 和面向用户的总结时，默认使用中文。
- 命令、文件路径、代码标识符、配置键、API 名称、错误原文和必须保持的模板字段可以保留原文。
- 如果 `codex-workflow` 创建了英文骨架标题，在写入实质内容时改为中文标题；用户明确要求其他语言时，以用户要求为准。

This is the design exploration layer:

- Use `$atlas-workflow:office-hours` first when the core question is whether the idea is worth doing.
- Use `$atlas-workflow:brainstorm` when the idea is worth exploring but the feature shape, UX, architecture, or scope is not settled.
- Use `$atlas-workflow:clarify` next when a direction is chosen and needs execution-ready boundaries.

Follow this loop:

1. Run `~/.codex/workflow/bin/codex-workflow list`.
2. Reuse a relevant `doing` task if one already exists. Otherwise create/start one.
3. For nontrivial design exploration, record routing evidence:
   - `~/.codex/workflow/bin/codex-workflow route-decision <task-id> --intent brainstorm --risk <low|medium|high> --decision use --reason "<why solution shape is unsettled>"`
   - If office-hours was plausible but intentionally skipped because the idea is already worth exploring, record a separate `--intent office-hours --decision skip` reason.
4. Gather project context before asking detailed questions:
   - current user request and conversation
   - project instructions and existing docs
   - relevant code, UI, tests, or prior Atlas artifacts
   - established user preferences when available
5. Ask one clarifying question at a time only when the answer changes the recommended design, scope, or acceptance criteria. Prefer ordinary dialogue; use structured choice tools only when available and helpful. Do not block when `AskUserQuestion` or `request_user_input` is unavailable.
6. Propose 2-3 approaches with tradeoffs:
   - lead with the recommended approach
   - explain why it fits the goal and current codebase
   - name what each alternative gives up
7. Present the design in sections scaled to complexity:
   - user outcome
   - workflow or interaction model
   - architecture or data flow
   - key components
   - error and edge cases
   - verification strategy
8. For UI or visual product work, offer visual exploration only when seeing options would be materially clearer than text. If accepted, use the available browser or image workflow; otherwise continue text-only.
9. Write `workflow/artifacts/<task-id>/context.md` when the factual base changes:
   - current state
   - confirmed facts
   - source-of-truth files
   - relevant user preferences
   - risks and unknowns
10. Write or update `workflow/artifacts/<task-id>/decision.md`:
   - options considered
   - tradeoffs
   - recommendation
   - rejected alternatives and why
   - open decisions
11. If the user approves the direction, either:
   - write `workflow/artifacts/<task-id>/spec.md` directly when the scope is simple and the facts are stable, or
   - switch to `$atlas-workflow:clarify` when explicit non-goals, decision boundaries, and acceptance criteria still need to be locked.
12. When the discussion has become actionable enough for clarify, team, task, or Multica handoff, also write a concise project doc:
    - prefer an existing project docs location; otherwise create `docs/atlas-workflow/` under the target project root.
    - create or reuse one workflow docs bundle for the same workflow: `docs/atlas-workflow/<workflow-id>-<short-topic>/`.
    - use stable files inside the bundle, such as `README.md`, `brainstorm.md`, `decision.md`, `contract-index.md`, and later `implementation-contract.final.md`; do not create scattered sibling markdown files for the same workflow.
    - include the chosen direction, rejected alternatives, assumptions, acceptance shape, verification strategy, and next execution step.
    - if the handoff names an authoritative implementation contract, keep `contract-index.md` pointed at the current authoritative file.
    - keep `contract-index.md` as the bundle entrypoint by adding supporting evidence links when those files exist or are created: `team_decision`, `staffing`, `evidence_index`, `workflow_team_decision`, and `workflow_team_staffing`.
    - keep `workflow/artifacts/<task-id>/` as the working record; the project doc is the durable handoff for the repo.
13. Self-review artifacts before reporting:
   - no placeholders such as `TBD` or `TODO`
   - no contradictions between context, decision, spec, and any project doc
   - assumptions are labelled
   - scope is small enough for the next execution step
14. Before claiming the recommendation or spec is ready for clarify, team, task, or Multica handoff, run:
    - `~/.codex/workflow/bin/codex-workflow ready <task-id> --require context,decision`
    - include `spec` in `--require` when this skill wrote an execution spec directly.
15. For pure option exploration, do not run readiness and do not write project docs; report the open decisions instead.
16. Do not implement code from this skill unless the user explicitly changes the request to implementation after approving the direction.
17. In the final reply, include the task id, artifact paths, project doc path if written, recommendation, readiness result if run, open decisions, and the recommended next Atlas skill.

Hard rules:

- Do not skip design because the idea looks simple. For tiny changes, the brainstorm can be a short paragraph plus a clear recommendation.
- Do not over-question clear engineering fixes. If the user already gave a precise implementation request, use `$atlas-workflow:task` or `$atlas-workflow:clarify` instead.
- Keep confirmed facts separate from inferences and assumptions.
- Do not make routing evidence a ceremony for tiny explicit fixes; route only when a planning layer choice was meaningful.
- Keep exploratory or unstable notes in `workflow/artifacts/<task-id>/`; once a solution is actionable, mirror the durable handoff into the workflow docs bundle described above.
