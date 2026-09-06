---
name: intake
description: Use the Atlas intake/grilling flow to stress-test a plan or design before building, especially when the user asks to grill, pressure-test, stress-test, interview, or resolve ambiguous intent, scope, stakeholders, constraints, success criteria, or decision boundaries.
---

Use the Atlas intake flow for an explicit interview or pressure-test, or when a
material unresolved decision makes that work useful. A clear authorized
implementation request enters its execution flow directly.

## Host Note

Codex invokes this flow as `$atlas-workflow:intake`; Claude Code invokes it as `/intake` or by calling the `intake` skill directly. For CLI commands below, prefer the bare `atlas-workflow` command on `PATH`, falling back to the absolute `~/.codex/workflow/bin/codex-workflow` only when no `PATH` command is available.

## 输出语言

- 生成或更新项目文档、需求/方案/分析/交接材料、design-review 报告、team 决策、workflow artifacts 和面向用户的总结时，默认使用中文。
- 面向用户的回复和总结要口语化、通俗易懂：不要把 `canonical scope source`、`staffing_mode`、`release_mode`、`frozen Goal` 这类内部流程术语直接抛给用户，先用平实的中文说清楚意思（例如“本次范围以哪份文档为准”），确有必要时再在括号里附上原术语。
- 命令、文件路径、代码标识符、配置键、API 名称、错误原文和必须保持的模板字段可以保留原文。
- 如果 `codex-workflow` 创建了英文骨架标题，在写入实质内容时改为中文标题；用户明确要求其他语言时，以用户要求为准。

For a corrected answer or rejected branch, first apply the shared
[decision supersession protocol](../../references/decision-supersession.md).

This is the targeted pressure-test layer when the user explicitly asks to grill,
interview, or stress-test a plan or design:

- Use `$atlas-workflow:office-hours` when the question is whether an idea is worth doing.
- Use `$atlas-workflow:brainstorm` when the idea is worth exploring but the solution shape is unclear.
- Use `$atlas-workflow:intake` when a plan or design needs grilling, or when intent, scope, stakeholder, constraints, or success shape is ambiguous.
- Use `$atlas-workflow:clarify` when the direction is chosen and execution boundaries need to be locked.

## Grilling Protocol

Interview the user about the material decision until there is a shared
understanding. Walk the relevant design tree branch by branch, resolving
dependencies between decisions one at a time. Do not turn this explicit mode
into a default admission gate for every request.

Rules:

- Ask exactly one question at a time, then wait for the user's answer before
  continuing. Do not bundle multiple questions.
- For each question, provide the recommended answer and a short rationale.
- If a fact can be found by exploring the codebase, look it up instead of asking
  the user. Summarize the evidence with file paths or command output.
- Treat decisions as the user's. In explicit grilling, put each new or
  evidence-challenged decision to the user and wait for confirmation or
  correction; reuse unchanged approved decisions without reopening them. After
  the questions, ask once for confirmation of the resulting shared
  understanding when grilling introduced a new decision or an unresolved gap
  remains; when there is no new decision or gap, do not ask for an extra
  confirmation. The grilling request and these confirmations do not grant
  implementation authority; check that authorization separately.
- Probe assumptions, target users, workflows, non-goals, data and permission
  boundaries, deployment or rollout constraints, validation, failure modes,
  ownership, and stop conditions when they matter to the plan.
- Maintain a visible decision tree in the dialogue or selected working artifact: answered decisions,
  open decisions, dependencies, recommended defaults, and rejected paths.
- Do not enact the plan, edit implementation code, or hand off execution until
  the required explicit-grilling confirmations are complete and implementation
  authority is separately present.
- Treat `intake.md` as workflow working notes by default. Do not mirror the full
  interview transcript or decision tree into repo docs; when intake produces a
  durable handoff, write only the confirmed summary, open blockers, and next
  layer recommendation.

## Decide whether intake is useful

Request length, file count, a `tiny` label, or a single-file scope does not decide
whether intake is needed. Use it when the user explicitly requests an interview
or pressure-test, or when available facts leave a material choice about intent,
scope, data, permission, safety, ownership, or acceptance.

A question can be worth asking without blocking the rest of the work. Ask and
record information that could change the recommendation; wait only when
proceeding would overreach authority, make a high-cost choice on weak evidence,
or make later work stale. A clear implementation request with a known outcome,
authority, path, and validation can go directly to Task or Clarify regardless of
file count. Do not require an interview, a decision tree, or a new document
before coding merely because a request is non-tiny. Do not edit code during
intake.

Follow this loop:

1. Decide whether persistence, recovery, audit, or handoff value justifies a
   working record. Keep an explicit pressure-test in the current dialogue when
   it does not.
2. When a durable record is useful, run `~/.codex/workflow/bin/codex-workflow list`,
   reuse a relevant `doing` task, and create/start one only when no relevant
   task exists. Keep `intake.md` as the one current workflow working body; it is
   workflow working notes by default and is not a transcript mirror.
3. When a durable record is used, record routing evidence:
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
7. When a durable record is needed, run
   `~/.codex/workflow/bin/codex-workflow scaffold-intake <task-id>` and write
   the initial decision tree before asking the first question.
8. In explicit grilling mode, ask the next single decision question with a
   recommended answer and stop for its answer. For ordinary ambiguity, ask
   only the valuable question and continue independent work when it is not a
   blocker.
9. When a record is used, update `workflow/artifacts/<task-id>/intake.md`:
   - known facts
   - decision tree
   - answered decisions and accepted recommendations
   - open decisions and their dependencies
   - assumptions that are safe to carry
   - unresolved blockers
   - recommended next layer: office-hours, brainstorm, clarify, task, or multica-handoff
10. Continue one question per turn until shared understanding is reached only in
    explicit grilling mode.
11. Ask the user to confirm shared understanding before recommending execution
    only in explicit grilling mode, and only when a new decision or unresolved
    gap remains after the per-decision confirmations.
12. If a durable record is used and the next layer is clear after the required confirmations, record it with
    `route-decision --decision use` or a skip reason for the omitted layer when
    non-obvious.
13. Before claiming a durable intake record is complete, run:
   - `~/.codex/workflow/bin/codex-workflow ready <task-id> --require context,analysis`
   - or `ready --skip "<reason>"` when `intake.md` is the only intended artifact.
14. In the final reply, include task and `intake.md` paths only when a durable
    record was used, then report the routing decision, unresolved blockers, and
    recommended next layer.

Hard rules:

- Intake does not produce execution-ready specs.
- Do not force `office-hours -> brainstorm -> intake -> clarify` as a mandatory chain.
- If the user already gave a precise implementation request, skip intake and
  use `$atlas-workflow:task` or `$atlas-workflow:clarify`; a tiny/single-file
  classification is neither a required escape hatch nor a general gate.
