---
name: team
description: Use the Atlas team flow with Codex native subagents for discussion, execution, review, staffing, promotion, and bounded loops.
---

Use the Atlas native team flow for this request.

`$atlas-workflow:team` is the default Atlas team entrypoint. It must use Codex
native subagents through `multi_agent_v1.spawn_agent`,
`multi_agent_v1.wait_agent`, and `multi_agent_v1.close_agent`. This skill is a
native-only contract: if native subagent tools are unavailable, stop instead of
substituting another orchestration implementation.

## 输出语言

- 生成或更新项目文档、需求/方案/分析/交接材料、design-review 报告、team 决策、workflow artifacts 和面向用户的总结时，默认使用中文。
- 命令、文件路径、代码标识符、配置键、API 名称、错误原文和必须保持的模板字段可以保留原文。
- 如果 `codex-workflow` 创建了英文骨架标题，在写入实质内容时改为中文标题；用户明确要求其他语言时，以用户要求为准。

## Native Tool Gate

1. Confirm native subagent tools are callable.
   - If `multi_agent_v1.spawn_agent`, `multi_agent_v1.wait_agent`, and `multi_agent_v1.close_agent` are already available, use them directly.
   - If they are not available but `tool_search` is available, search for `multi_agent_v1 spawn_agent wait_agent close_agent` and use the exposed tools.
   - If the native tools still are not callable, stop and tell the user that `$atlas-workflow:team` requires Codex native subagents; ask for an explicit alternate workflow before proceeding.
2. Never replace a requested native team run with shell-managed lanes, background processes, or another non-native delegate mechanism.
3. Keep the main Codex as orchestrator. Subagents provide lane work, implementation slices, review, or verification; the main Codex owns final synthesis, file integration, and final user reporting.

## Task Setup

1. Run `~/.codex/workflow/bin/codex-workflow list`.
2. Reuse a relevant `doing` task if one already exists. Otherwise create/start one.
3. Record team routing evidence for nontrivial discussion, review, staffing, contract formation, execution, loop, or promotion:
   - `~/.codex/workflow/bin/codex-workflow route-decision <task-id> --intent team --risk <low|medium|high> --decision use --reason "<why native subagent collaboration is needed>"`
4. Read `workflow/artifacts/<task-id>/context.md`, `spec.md`, and `analysis.md` before spawning any subagent. If a required planning artifact is intentionally absent, state why and keep the spawn prompt bounded to the available artifact set.
5. Before promotion, handoff, or implementation readiness, run:
   - `~/.codex/workflow/bin/codex-workflow ready <task-id> --require context,spec,analysis,decision`
   - use a narrower `--require` list only when the missing artifact is intentionally out of scope and explain why.

## Shared Artifact Contract

For every native round:

1. Create or update these files under `workflow/artifacts/<task-id>/team/`:
   - `round-<timestamp>.md`: lane prompts, lane results, subagent ids or nicknames when available, evidence, exit state, and synthesis inputs.
   - `decision.md`: single main decision record.
   - `staffing.md`: owner/reviewer/verifier responsibilities and write-scope boundaries.
   - Every native team artifact must include `- backend: native` or `backend: native` metadata and substantive content beyond headings/template text.
2. Start the native record before spawning:
   - `~/.codex/workflow/bin/codex-workflow team-record-start <task-id> "<objective>" --backend native --mode discuss|execute --agents <N> --roles "<comma-separated roles>"`
3. Finalize the native record after writing non-empty artifacts:
   - `~/.codex/workflow/bin/codex-workflow team-record-finalize <task-id> --backend native --status complete|failed|interrupted --round <round-file> --decision <decision-file> --staffing <staffing-file>`
4. Use `~/.codex/workflow/bin/codex-workflow team-status <task-id>` for observability. Native status must show `team_backend: native`; only native record fields and native artifacts count as team evidence.
5. All lane outputs must contain exactly these top-level sections:
   - `## Evidence`
   - `## Inference`
   - `## Unknown`
   - `## Recommendation`
6. Separate facts from conclusions. Put source paths, command output, user constraints, and observed behavior in Evidence; put derived conclusions in Inference; put unresolved questions in Unknown.

## Native Agent Planning

Before spawning native subagents, produce a task-specific Agent Plan. Follow the
same planning discipline as Multica staffing: inventory first, reuse first,
dynamic roles, explicit omissions, phase gates, write boundaries, and evidence
requirements. Do not treat three roles as a limit. Three roles are only a
common seed for small or ordinary rounds.

Agent planning rules:

1. Classify the team mode:
   - `planning-review`: options, architecture, risk review, staffing, contract formation.
   - `implementation`: code/config/docs changes with reviewer and verifier coverage.
   - `investigation`: evidence gathering and diagnosis without implementation.
   - `design-or-doc-review`: design, copy, docs, or product artifact review without code changes.
   - `loop-repair`: bounded repeated implementation/review/verification cycles.
2. Inventory available execution surfaces:
   - native subagent tools available in this session;
   - repo/worktree state and files likely touched;
   - required local tools, browser/MCP/runtime targets, credentials, or external blockers;
   - existing workflow artifacts and acceptance rows.
3. Choose only the roles the task needs, and list omitted roles with reasons.
4. There is no hard agent-count cap in the skill. Set `--agents <N>` to the
   number of active native roles/subagents actually planned. Keep the number
   small enough to integrate safely, but scale up when the task has separable
   domains or independent evidence lanes.
5. For each active role, define:
   - role name;
   - native `agent_type` (`explorer`, `worker`, `default`, or another available role);
   - read/write permission;
   - owned files, modules, or evidence surfaces;
   - required tools or runtime access;
   - expected deliverable;
   - join condition;
   - stop/blocker condition.
6. Prefer reuse of the main Codex for tight integration work. Spawn a subagent
   only when the role is bounded, material, and can run without duplicating the
   main Codex's immediate work.
7. Add writable workers only when write scopes are disjoint. Multiple writable
   workers must have explicit non-overlapping file/module ownership in
   `staffing.md`.
8. Add separate reviewer, verifier, browser/UI, evidence QA, docs, or risk
   roles when the task risk justifies them. Do not force those roles when they
   are not useful.
9. For high-risk, cross-module, UI/backend/API/data/permission/deployment work,
   actively plan reviewer and verification roles instead of relying only on
   executor self-checks.
10. Decide active roles, omitted roles, `--agents <N>`, and `--roles` before
    `team-record-start`; those CLI fields must reflect the planned native
    subagents. Write at least `## Agent Plan`, `## Active Roles`, and
    `## Omitted Roles` in `staffing.md` before `team-record-start`, then fill or
    refine the remaining staffing sections before spawning.
11. `staffing.md` must include these sections when the team is non-tiny:
    - `## Agent Plan`
    - `## Active Roles`
    - `## Omitted Roles`
    - `## Phase Gates`
    - `## Commit Boundaries`
    - `## Concurrency And Write Boundaries`
    - `## Verification Evidence`

Recommended `staffing.md` table shape:

```markdown
## Agent Plan

| Role | Agent Type | Count | Read/Write | Owned Scope | Tools | Deliverable | Join Gate |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Active Roles

| Role | Why Active | Agent Type | Count | Read/Write | Owned Scope |
| --- | --- | --- | --- | --- | --- |

## Omitted Roles

| Role | Omission Reason |
| --- | --- |

## Phase Gates

| Phase | Owner | Input | Output | Required Gate | Commit Boundary |
| --- | --- | --- | --- | --- | --- |

## Commit Boundaries

- Each implementation step or acceptance slice that changes files:
- Verification required before each commit:
- Commit owner:
- Allowed no-commit exceptions:

## Concurrency And Write Boundaries

- Writable workers:
- Disjoint write sets:
- Main Codex integration owner:

## Verification Evidence

- Commands:
- Browser/API/runtime evidence:
- Artifact paths:
- Stop conditions:
```

## Discuss Mode

Use discuss mode when the task needs options, architecture, risk review, staffing, implementation contract formation, or promotion advice before code changes.

Seed roles for small discuss rounds:

1. `architect`: propose the implementation path, boundaries, and simplest viable structure.
2. `critic`: challenge risks, regressions, data safety, scope creep, and missing acceptance criteria.
3. `verifier`: define concrete checks, evidence paths, and stop conditions.

These are seed roles, not a required set and not a maximum. Add, split, merge,
or omit roles according to the Agent Plan. Examples: `domain-architect`,
`api-reviewer`, `ui-verifier`, `security-critic`, `docs-reviewer`,
`migration-risk`, or `evidence-qa`.

Run planned discuss roles as native subagents, normally `agent_type: explorer`
or `default` depending on the task. Keep prompts read-only unless the user
explicitly asks a discuss lane to edit files. After all lanes finish or a
bounded timeout/interruption occurs, synthesize `decision.md` and `staffing.md`.

If a lane fails or is interrupted, do not pretend consensus exists. Write the partial evidence into `round-*.md`, mark the record `failed` or `interrupted`, and only proceed when the remaining evidence is enough and the risk is low enough to justify direct main-agent action.

## Execute Mode

Use execute mode when the native team is expected to help implement.

Seed roles for small execute rounds:

1. `executor`: owns the primary patch or a clearly bounded implementation slice.
2. `reviewer`: reviews the implementation for regressions, contract drift, and missing tests.
3. `verifier`: runs or specifies checks and judges whether acceptance criteria are met.

These are seed roles, not a required set and not a maximum. A larger execution
plan may split executor roles by module, add dedicated E2E/browser/API
verification, add migration or security review, or omit reviewer/verifier only
when the task is tiny and the main Codex owns equivalent evidence.

Execution ownership rules:

- Prefer one writable `worker` subagent for the primary implementation. The main Codex may also implement directly when it owns integration.
- Use additional writable workers only when write scopes are disjoint and explicitly documented in `staffing.md`; there is no fixed maximum when scopes and integration gates are clear.
- Tell writable workers that they are not alone in the codebase, must not revert user or other-agent changes, and must list changed file paths in their final message.
- Keep reviewer and verifier lanes read-only unless a repair is explicitly assigned to them after integration.
- The main Codex must inspect and integrate subagent changes before finalizing. Native subagent completion is evidence, not automatic acceptance.
- Treat commits as implementation step boundaries. Each completed implementation
  step, phase, or acceptance slice that changes files must receive a dedicated
  git commit after its verification gate passes and before the next
  implementation step starts.
- Do not batch multiple completed steps into one commit unless the user
  explicitly asks for that batching. Record any no-commit exception in the
  workflow artifact, and only use it for read-only steps, failed/abandoned
  attempts, or user-directed no-commit work.
- Use the `commit-work` skill for each commit. The commit message should
  describe the behavior or workflow boundary completed by that step, not the
  mechanics of the patch.

## Native Bounded Loop

Use a native bounded loop when the user asks for team implementation to keep fixing until the objective is met, such as "keep trying", "未达标反复修", PR/check babysitting, repeated review/repair, or explicit loop wording.

Native loop requirements:

1. Execute bounded repair loops with native subagents only. Use the native loop ledger and `team-loop-record` for terminal status recording.
2. Define both:
   - `max_iterations` as a positive integer.
   - `max_time` as a bounded wall-clock target when practical.
3. Define at least one verification gate:
   - shell command, static check, file comparison, browser check, human acceptance row, or explicit reason why no automatic gate exists.
4. Maintain `workflow/artifacts/<task-id>/team/loop-<timestamp>.md` as the loop ledger.
   - The loop ledger must include `- backend: native` or `backend: native` metadata and substantive evidence beyond headings/template text before `team-loop-record` is called.
5. Each iteration must:
   - spawn or reuse a native executor only for the bounded repair task;
   - run reviewer/verifier native lanes or main-agent verification as appropriate;
   - record commands, changed files, artifacts, and unresolved blockers;
   - create a dedicated commit for the verified iteration step when files changed
     and `done=true` or the iteration produced a keeper repair;
   - judge completion using an explicit sentinel equivalent: `done=true` or `done=false`.
6. Stop immediately when verification proves `done=true`, when `max_iterations` is exhausted, when `max_time` is reached, or when a blocker makes more iterations unsafe.
7. Record terminal loop status with:
   - `~/.codex/workflow/bin/codex-workflow team-loop-record <task-id> --backend native --status loop-done|loop-incomplete|loop-failed|loop-timeout --loop <loop-file> --iterations <N>`
8. Use `loop-done` only when the acceptance evidence is concrete and current. Use `loop-incomplete` when iterations or user-approved time run out without proof. Use `loop-failed` for failed native agents, invalid artifacts, or blocked verification. Use `loop-timeout` for time-budget exhaustion.
9. Close completed subagents with `multi_agent_v1.close_agent` when their results have been integrated or recorded.

## Decision And Promotion

1. Treat `workflow/artifacts/<task-id>/team/decision.md` as the single main decision file.
2. When a high-risk route or Multica handoff needs consensus evidence, run:
   - `~/.codex/workflow/bin/codex-workflow route-decision <task-id> --intent team --risk high --decision use --reason "<why consensus evidence is required>" --consensus`
3. Use `workflow/artifacts/<task-id>/team/staffing.md` for ownership suggestions.
4. When promoting to execution, record whether the next implementation needs a lightweight implementation contract:
   - Use it for non-tiny local work with UI/API/CLI/background-job behavior, cross-file changes, or meaningful edge cases.
   - The contract owner is the main implementer unless the team explicitly assigns a separate reviewer.
   - The contract must preserve the team decision and must not add new scope.
   - For Multica handoff, prefer the Multica sprint contract rather than the Atlas lightweight template.
5. When the team discussion settles an actionable plan, promotion, or staffing handoff, also write a concise project doc:
   - prefer an existing project docs location; otherwise create `docs/atlas-workflow/` under the target project root.
   - name it `docs/atlas-workflow/<task-id>-<short-topic>.md` unless the project already has a stronger naming convention.
   - include the final decision, consensus basis, owner/staffing plan when relevant, acceptance criteria, verification gates, risks, and next execution step.
   - keep `workflow/artifacts/<task-id>/team/decision.md` as the discussion record; the project doc is the durable handoff for the repo.
6. Promote explicitly with:
   - `~/.codex/workflow/bin/codex-workflow team-promote <task-id> --to execute`
   - `~/.codex/workflow/bin/codex-workflow team-promote <task-id> --to worktree`
   - `~/.codex/workflow/bin/codex-workflow team-promote <task-id> --to finish`
7. In the final reply, include the task id, `decision.md` path, staffing path if produced, project doc path if written, readiness result if run, promotion state, native backend status, loop status when relevant, and any open decision.
