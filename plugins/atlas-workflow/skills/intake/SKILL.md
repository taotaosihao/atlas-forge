---
name: intake
description: Use the Atlas intake/grilling flow to stress-test a plan or design before building, especially when the user asks to grill, pressure-test, stress-test, interview, or resolve ambiguous intent, scope, stakeholders, constraints, success criteria, or decision boundaries.
---

Use the Atlas intake flow in grilling mode for this request.

## Host Note

Codex invokes this flow as `$atlas-workflow:intake`; Claude Code invokes it as `/intake` or by calling the `intake` skill directly. For CLI commands below, prefer the bare `atlas-workflow` command on `PATH`, falling back to the absolute `~/.codex/workflow/bin/codex-workflow` only when no `PATH` command is available.

## 输出语言

- 生成或更新项目文档、需求/方案/分析/交接材料、design-review 报告、team 决策、workflow artifacts 和面向用户的总结时，默认使用中文。
- 面向用户的回复和总结要口语化、通俗易懂：不要把 `canonical scope source`、`staffing_mode`、`release_mode`、`frozen Goal` 这类内部流程术语直接抛给用户，先用平实的中文说清楚意思（例如“本次范围以哪份文档为准”），确有必要时再在括号里附上原术语。
- 命令、文件路径、代码标识符、配置键、API 名称、错误原文和必须保持的模板字段可以保留原文。
- 如果 `codex-workflow` 创建了英文骨架标题，在写入实质内容时改为中文标题；用户明确要求其他语言时，以用户要求为准。

This is the relentless interview layer before execution:

- Use `$atlas-workflow:office-hours` when the question is whether an idea is worth doing.
- Use `$atlas-workflow:brainstorm` when the idea is worth exploring but the solution shape is unclear.
- Use `$atlas-workflow:intake` when a plan or design needs grilling, or when intent, scope, stakeholder, constraints, or success shape is ambiguous.
- Use `$atlas-workflow:clarify` when the direction is chosen and execution boundaries need to be locked.

## Grilling Protocol

Interview the user relentlessly about the plan until there is a shared
understanding. Walk the design tree branch by branch, resolving dependencies
between decisions one at a time.

Rules:

- Ask exactly one question at a time, then wait for the user's answer before
  continuing. Do not bundle multiple questions.
- For each question, provide the recommended answer and a short rationale.
- If a fact can be found by exploring the codebase, look it up instead of asking
  the user. Summarize the evidence with file paths or command output.
- Treat decisions as the user's. Put each decision to the user and wait for
  confirmation or correction.
- Probe assumptions, target users, workflows, non-goals, data and permission
  boundaries, deployment or rollout constraints, validation, failure modes,
  ownership, and stop conditions when they matter to the plan.
- Maintain a visible decision tree in the working artifact: answered decisions,
  open decisions, dependencies, recommended defaults, and rejected paths.
- Do not enact the plan, edit implementation code, or hand off execution until
  the user explicitly confirms that shared understanding has been reached.
- Treat `intake.md` as workflow working notes by default. Do not mirror the full
  interview transcript or decision tree into repo docs; when intake produces a
  durable handoff, write only the confirmed summary, open blockers, and next
  layer recommendation.

## Short Request Intake Gate

Treat one-line or low-information requests as intake candidates by default when
they have multiple plausible meanings, lack a clear acceptance path, or omit
important user, data, permission, deployment, workflow, or ownership boundaries.
Ask the next single blocking question, include the recommended answer, and wait
for feedback before continuing. Include critical feedback about the main
ambiguity, risk, simpler alternative, or stop condition. Do not edit code during
intake.

Direct execution is allowed only through the tiny escape hatch: the affected
surface, expected behavior, validation path, and risk are all clear; the change
does not touch data, permissions, deployment, migration, product strategy, or
architecture boundaries; and the scope is normally a single file or similarly
small. If tiny classification is uncertain, ask one short question first.

Non-tiny requests must produce auditable documentation before coding. Existing
external issues, PRDs, or design docs may count as equivalent evidence only when
the current artifact cites them and fills missing acceptance, verification, risk,
and stop-condition gaps.

Follow this loop:

1. Run `~/.codex/workflow/bin/codex-workflow list`.
2. Reuse a relevant `doing` task if one already exists. Otherwise create/start one.
3. Record routing evidence:
   - `~/.codex/workflow/bin/codex-workflow route-decision <task-id> --intent intake --risk <low|medium|high> --decision use --reason "<why the plan needs grilling or scope must be resolved>"`
4. Read existing `workflow/artifacts/<task-id>/context.md`, `decision.md`, `spec.md`, or `analysis.md` before writing intake notes.
5. Identify facts to look up and decisions to grill:
   - actual user or customer
   - target workflow
   - in-scope and out-of-scope surfaces
   - hard constraints
   - success or failure signal
   - decision owner
   - validation and rollback path
   - data, permission, and deployment boundaries
6. Look up codebase facts before asking about them.
7. Run `~/.codex/workflow/bin/codex-workflow scaffold-intake <task-id>` and
   write the initial decision tree before asking the first question.
8. Ask the next single decision question with a recommended answer. Stop and
   wait for the user's answer before continuing.
9. Update `workflow/artifacts/<task-id>/intake.md`:
   - known facts
   - decision tree
   - answered decisions and accepted recommendations
   - open decisions and their dependencies
   - assumptions that are safe to carry
   - unresolved blockers
   - recommended next layer: office-hours, brainstorm, clarify, task, or multica-handoff
9. Continue one question per turn until shared understanding is reached.
10. Ask the user to confirm shared understanding before recommending execution.
11. If the next layer is already clear after confirmation, record it with `route-decision --decision use` or a skip reason for the omitted layer when non-obvious.
12. Before claiming intake is complete, run:
   - `~/.codex/workflow/bin/codex-workflow ready <task-id> --require context,analysis`
   - or `ready --skip "<reason>"` when `intake.md` is the only intended artifact.
13. In the final reply, include the task id, `intake.md`, routing decision, unresolved blockers, and recommended next layer.

Hard rules:

- Intake does not produce execution-ready specs.
- Do not force `office-hours -> brainstorm -> intake -> clarify` as a mandatory chain.
- If the user already gave a precise implementation request, skip intake and use `$atlas-workflow:task` only when the tiny escape hatch or a complete non-tiny documentation path is satisfied.
