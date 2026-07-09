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
   - First run `~/.codex/workflow/bin/codex-workflow scaffold-team <task-id>`.
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

## Concise Phase Evidence

Atlas phase evidence is a conclusion packet, not a raw run archive.

- Git should keep only phase-level conclusions by default. The normal phase
  packet is limited to `phase-review-report.md`, `defect-queue.md`,
  `evidence-index.md` or `evidence-manifest.json`, and `gate-checklist.md`.
- Add `review-checklist.md`, `verification-checklist.md`, final screenshots, or
  customer deliverables only when they are needed to prove acceptance.
- Keep raw logs, Playwright JSON, traces, videos, HAR files, bulk screenshots, full command output, failed retry logs, worker debug JSONL, API dumps, localhost or port status, and intermediate repair output in the temporary run directory by default. Do not add them to git unless a blocking defect or gate dispute requires that exact raw artifact.
- Agent review defaults to the phase conclusion files. Reviewers should open raw
  artifacts only for a blocking defect, a disputed gate, or a missing conclusion
  reference.
- Target each phase's git evidence at 10 files or fewer and 1 MB or less. If a
  phase exceeds either limit, explain why in `phase-review-report.md`.
- Customer-facing HTML, PDF, sign-off files, and final deliverables may be kept
  in git when they are the artifact being delivered.
- Before writing phase conclusion files, run
  `~/.codex/workflow/bin/codex-workflow scaffold-phase <task-id> <phase-id>`.

## Workflow Artifact Categories

Before writing or asking reviewers to inspect Atlas process docs, classify them:

- `durable handoff`: concise repo docs for future implementation or audit,
  usually `README.md`, `clarify.md`, `team-decision.md`, `staffing.md`,
  `contract-index.md`, and `implementation-contract.final.md`.
- `phase conclusion`: small gate outputs that may be committed as evidence,
  usually `phase-review-report.md`, `defect-queue.md`, `evidence-index.md` or
  `evidence-manifest.json`, and `gate-checklist.md`.
- `workflow working notes`: intake notes, early `context.md`, `analysis.md`,
  draft `decision.md`, draft `spec.md`, `team/round-*.md`, loop ledgers, and
  repair notes. Keep these in `workflow/artifacts/<task-id>/` by default and
  mirror only the confirmed summary into durable handoff docs.
- `temporary raw run`: raw logs, traces, videos, HAR, bulk screenshots, command
  full output, dumps, debug JSONL, and retry output. Keep outside git unless a
  blocking gate needs the exact raw artifact.

## Business Acceptance First Mode

Use Business Acceptance First Mode when a `$atlas-workflow:team` task must prove
that an implemented workflow satisfies a business process, stakeholder
expectation, domain rulebook, or scenario-level acceptance contract in addition
to the normal technical SDD gates. This mode is opt-in: do not require business
acceptance artifacts for ordinary native team tasks unless the user request,
PRD, implementation contract, or team decision explicitly calls for business
workflow acceptance.

Activation conditions:

1. The task has business scenarios, domain state transitions, stakeholder
   sign-off, source coverage, or scenario playback as acceptance evidence.
2. Technical correctness alone is insufficient to decide whether the work is
   acceptable.
3. The team decision or implementation contract names business acceptance,
   BAF, business verdict, or `team/acceptance/` artifacts.

Before implementation begins, the main Codex should create or require the
pre-implementation business artifacts under
`workflow/artifacts/<task-id>/team/acceptance/` when they are relevant:

- `business-intent.json`
- `business-source-coverage.json`
- `business-thread-map.json`
- `business-object-state-model.json`
- `business-action-rulebook.json`
- `scenarios/business-scenario-card.<scenario-id>.json`

Before recording a business verdict, the main Codex must have current evidence
for:

- `business-evidence-map.json`
- `business-acceptance-report.json`
- `business-verdict.json`
- `business-deviation-log.jsonl` when deviations exist
- `business-regression-scenario.json` when a deviation creates a future guard

Business Gates belong in the existing `Phase Gates` section of `staffing.md`.
Business Acceptance Evidence belongs in the existing `Verification Evidence`
section. Do not add a separate staffing section, do not create a
`business-controller` role, and do not redefine `reviewer`, `verifier`, or
`evidence-qa`. Main Codex remains the only workflow artifact writer; subagents
may provide evidence, review, and verification results, but they must not write
`workflow/artifacts/**` directly.

Technical hard gates are one-way blockers. If the SDD ledger, contract tests,
artifact lint, required CI, or another named technical gate is failed or
blocked, `business-verdict.verdict` must not be `accepted` or
`conditionally_accepted`. A business verdict never replaces SDD ledger terminal
events such as `run_complete` or `run_failed`; it records the business layer's
judgment after technical gates are accounted for.

When validating artifacts locally, use:

```bash
codex-team-validate-json --type business-intent --file <path>
codex-team-validate-json --type business-scenario-card --file <path>
codex-team-artifact-lint --task <task-id> --business-acceptance
```

`codex-team-artifact-lint --business-acceptance` means SDD lint plus business
acceptance lint. Without `--business-acceptance`, existing artifact lint behavior
must remain unchanged.

## Operable UI Vertical Slice Gate

Use the Operable UI Vertical Slice Gate for non-tiny user-facing product,
frontend, dashboard, editor, player, browser, GUI, or site work. This gate is
independent of Business Acceptance First Mode and independent of security hard
gates: it proves the product has a real operable user entrypoint, while hard
safety gates continue to prove the entrypoint stays inside the permitted
runtime and network boundaries.

Ordering and safety rules:

- A served operable UI thin slice must precede release, perf, soak, and phase
  evidence expansion.
- The UI thin slice and required hard safety gates must be satisfied together;
  neither may pass acceptance without the other.
- `no-data-plane-direct`, `no-cloud-runtime`, Provider credential, and browser
  network boundary gates must not be skipped, weakened, or deferred after
  release.
- Safety gates must not become an open-ended prerequisite that indefinitely
  blocks the first UI slice. This never means those gates can be bypassed or
  backfilled later.

When the gate applies, the team decision, implementation contract, staffing, or
gate checklist must name:

- `Product/UI gate: required | not_applicable`
- `first_operable_user_flow`
- `browser_entrypoint`
- `served_ui_validation_action`
- `ui_data_mode`
- `required_safety_gates`
- `allowed_headless_only_until`
- `stop_if_no_ui_by_phase`

Evidence rules:

- Served UI means the HTML document and JS/CSS app assets come from a real HTTP
  server such as a dev server, preview server, static served bundle, or project
  route.
- `page.route` may mock backend or data-plane responses, but must not mock the
  main document or app bundle for UI/product acceptance evidence.
- `page.setContent`, synthetic HTML, fulfilled main documents, fulfilled app
  bundles, headless model tests, scanner fixtures, CLI pass, typecheck-only
  proof, build-only proof, or network allowlist capture without a served UI
  route are not UI/product acceptance by themselves.
- The non-evidence list applies to evidence claiming UI/product acceptance.
  Headless model tests, network capture, allowlist capture, and scanner evidence
  can remain valid safety-gate evidence when labeled and reviewed as safety
  evidence.
- Served UI evidence does not satisfy hard safety gates by itself. If the UI
  exists but required hard safety-gate evidence is missing, stale, or out of
  scope, acceptance fails.

Tiny and not-applicable rules:

- `not_applicable` is allowed for genuinely headless CLI, worker, library, or
  scanner work, and for tiny changes that do not alter user-visible UI behavior.
- A product task with no served app cannot be classified as tiny solely because
  the requested slice is small.

If the gate is required and `stop_if_no_ui_by_phase` is omitted, default to
stopping before release, perf, soak, or P0G-style evidence. Stop expanding
headless scanners/evidence and return to clarify/team unless the user explicitly
approves deferral.

When Business Acceptance First Mode also applies, served UI evidence does not
automatically satisfy BAF Goal B. BAF Goal B still needs business scenario
evidence. First-patch guidance should record this relationship in UI-gate
guidance, team decisions, contracts, staffing, and checklists without rewriting
existing BAF artifacts.

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
11. Initial staffing is a starting hypothesis, not a frozen runtime contract.
    Do not try to pre-plan every future implementation role, model, or thinking
    effort in early staffing or in the implementation contract.
12. `staffing.md` must include these sections when the team is non-tiny:
    - `## Agent Plan`
    - `## Active Roles`
    - `## Omitted Roles`
    - `## Runtime Staffing Adjustments`
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

## Runtime Staffing Adjustments

| Trigger | Role Change | Model | Reasoning Effort | Why Now | Ledger/Event |
| --- | --- | --- | --- | --- | --- |

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
- Phase conclusion files:
- Temporary raw run directory:
- Browser/API/runtime evidence kept in git:
- Artifact paths:
- Stop conditions:
```

## Dynamic Runtime Staffing During Implementation

Use this rule only after an implementation contract is selected and actual
implementation is underway. The implementation contract defines scope,
acceptance rows, validation, evidence, and stop conditions; it does not need to
and should not freeze every future subagent role, model, or thinking effort.

Runtime staffing rules:

1. Before each implementation slice, fix round, blocker investigation, verifier
   pass, or final integration review, reassess the current problem using the
   latest code diff, review verdict, failed command, missing evidence, user
   correction, or blocker report.
2. Dynamically add, remove, merge, split, or replace roles when the actual
   implementation problem changes. Examples: add a database reviewer after a
   migration issue appears, add a browser verifier after a layout risk appears,
   drop a reviewer whose domain is no longer touched, or split one worker into
   two only when write scopes are provably disjoint.
3. Choose a runtime profile for each spawned subagent from the current task
   difficulty and risk. Record at least:
   - `model`
   - `reasoning_effort` / thinking effort
   - role
   - trigger
   - why that profile is appropriate now
4. Do not let implementation subagents silently inherit the parent agent
   runtime profile. If the native spawn tool supports model or reasoning-effort
   arguments, pass them explicitly. If the tool does not expose those arguments,
   write the requested runtime profile into the prompt and record it in
   `staffing.md`, the slice ledger, or the loop ledger.
5. Use cheaper/lower-effort profiles for narrow mechanical checks, formatting,
   fixture updates, and already-understood one-file repairs. Use stronger/higher
   reasoning profiles for ambiguous failures, cross-module design choices,
   security/data/permission/migration changes, conflicting review findings,
   business acceptance gates, final integration review, and repeated failed
   repair loops.
6. Every runtime role/model/thinking adjustment must be append-only evidence:
   record it under `## Runtime Staffing Adjustments` in `staffing.md`, or in the
   relevant slice/loop ledger when the adjustment is local to that slice.
7. The controller may change the role mix during implementation without
   revising the implementation contract when the change stays inside contract
   scope. If the needed role change expands scope, changes acceptance, changes
   deployment/data safety, or contradicts the contract, stop and return to
   clarify/team review instead.

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

## Codex-Native SDD Slice Protocol

Use this protocol when the team flow is acting as a Codex-native SDD controller
for implementation slices. This protocol is separate from the Native Bounded
Loop below: SDD repair uses `fix_loop_policy:
unbounded_until_clean_or_terminal` and stops only on a clean review or a real
terminal state such as `NEEDS_CONTEXT`, `BLOCKED`, `fix_progress_stalled`,
`slice_superseded`, or `slice_abandoned`.

Controller responsibilities:

1. The main Codex is the only workflow artifact writer. Subagents must not write
   `workflow/artifacts/**`, SDD ledger files, review packages, verdict files, or
   controller state directly.
2. Create the slice workspace with `codex-team-workspace`, write `brief.md` and
   `brief.json` with `codex-team-brief`, and validate all JSON contracts with
   `codex-team-validate-json`.
3. Record lifecycle events in `codex-team-ledger` before and after slice work,
   review, fix rounds, terminal states, and final whole-branch review.
4. Generate `review-package.diff` with `codex-team-review-package --repo/-C
   --base --head --task --slice`; use the recorded base and head for the slice.
5. Append controller-authored answers to `answers.jsonl` when a subagent returns
   `NEEDS_CONTEXT`, and enforce `max_question_rounds` from `brief.json`.
6. Do not write workflow artifacts from implementer, reviewer, fixer, verifier,
   or explorer subagents. Their final messages are the input; the controller
   validates, records, and writes artifacts.
7. Apply Dynamic Runtime Staffing During Implementation before each slice,
   review, fix, blocker, verifier, or final whole-branch review spawn. Record
   the actual role mix, model, reasoning effort, and trigger in `staffing.md` or
   the slice ledger.

Fresh context discipline:

- Give every implementer, reviewer, and fixer the current `brief.json`,
  `brief.md`, global constraints, relevant `answers.jsonl` entries, owned paths,
  forbidden paths, base/head commits, and the latest review verdict.
- Do not assume a subagent remembers earlier rounds. Restate the current slice
  state, required checks, commit policy, and terminal conditions in each prompt.
- For reviewers, provide the review package and relevant source files or diff
  context. They should report evidence-backed findings at their natural
  severity and must not soften a finding to keep the loop moving.

Continuous execution:

- Once a slice starts, keep the controller loop moving until the ledger reaches
  a clean or terminal state.
- A `NEEDS_CONTEXT` report pauses implementation only long enough for the
  controller to answer or record that the question cannot be resolved.
- A `BLOCKED` report must name blockers. A `fix_progress_stalled` terminal state
  needs evidence that the latest fix round did not materially change the review
  outcome or that continuing would be unsafe.
- Each implementation or fix round that changes files must create a dedicated
  commit before review. Record any no-commit exception in the slice artifacts.

Implementer prompt template:

```text
You are the SDD implementer for one slice.

Inputs:
- brief_json: <path>
- brief_md: <path>
- global_constraints: <path>
- answers_jsonl: <path or none>
- runtime_profile: <model and reasoning_effort selected for this slice>
- repo: <absolute repo path>
- base_sha: <sha>
- owned_paths: <paths>
- forbidden_paths: <paths>
- required_checks: <commands>

Rules:
- Modify only the target repo and only within owned paths.
- Do not write workflow artifacts.
- Preserve user and other-agent work.
- Commit file changes before reporting DONE or DONE_WITH_CONCERNS.
- Return exactly one IMPLEMENTER_REPORT_JSON fenced block.

If you need clarification, return NEEDS_CONTEXT with concrete questions.
If you are blocked, return BLOCKED with concrete blockers.
```

Reviewer prompt template:

```text
You are the SDD reviewer for one slice.

Inputs:
- brief_json: <path>
- review_package_diff: <path>
- runtime_profile: <model and reasoning_effort selected for this review>
- repo: <absolute repo path>
- base_sha: <sha>
- head_sha: <sha>
- acceptance_refs: <refs>
- required_checks: <commands and results when available>

Rules:
- Read only; do not modify files.
- Do not write workflow artifacts.
- Judge spec compliance and task quality from phase conclusion files first.
- Open raw logs, traces, videos, HAR, bulk screenshots, JSONL, or full command
  output only when a blocking defect, disputed gate, or missing conclusion
  reference requires it.
- Report Critical, Important, and Minor issues according to impact.
- Return exactly one REVIEW_VERDICT_JSON fenced block.
```

Fixer prompt template:

```text
You are the SDD fixer for one failed slice review.

Inputs:
- brief_json: <path>
- latest_review_verdict: <path or pasted JSON>
- review_package_diff: <path>
- answers_jsonl: <path or none>
- runtime_profile: <model and reasoning_effort selected for this fix round>
- repo: <absolute repo path>
- head_sha: <sha>

Rules:
- Fix only the issues assigned by the controller.
- Modify only the target repo and only within owned paths.
- Do not write workflow artifacts.
- Commit file changes before reporting DONE or DONE_WITH_CONCERNS.
- If the same review result persists and no safe progress remains, report
  BLOCKED with evidence for controller evaluation.
- Return exactly one IMPLEMENTER_REPORT_JSON fenced block.
```

Question loop:

1. A subagent may return `NEEDS_CONTEXT` only with non-empty `questions`.
2. The controller answers from current repo/user context when safe, appends a
   structured entry to `answers.jsonl`, records the ledger event, and respawns
   the role with fresh context.
3. When `max_question_rounds` is reached, the controller records a terminal
   state instead of continuing to ask the same unresolved question.

Review and fix loop:

1. Implementer returns a valid implementer report.
2. Controller validates the report, checks commit policy, records ledger state,
   and builds a review package from recorded base/head.
3. Reviewer returns a valid review verdict.
4. If verdict is clean, record `slice_complete`.
5. If verdict has unresolved Critical or Important issues, assign a fixer round,
   require a new commit for file changes, regenerate the review package, and
   review again.
6. Continue until clean or a terminal state is evidenced. Do not use a fixed
   iteration count as the SDD repair stop condition.

Final whole-branch review:

- After all slices are clean or intentionally terminal, run a final
  whole-branch review over the integrated branch before reporting completion.
- The final reviewer receives the branch-level diff, slice ledger summary,
  outstanding terminal states, and required checks.
- The controller writes the final synthesis and user report only after this
  final whole-branch review is accounted for.

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
   - reassess runtime staffing, model, and reasoning effort for the current
     failure before spawning the executor/reviewer/verifier;
   - run reviewer/verifier native lanes or main-agent verification as appropriate;
   - record commands, changed files, phase conclusion artifacts, the temporary
     raw run directory when relevant, and unresolved blockers;
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
   - After review, the final implementation contract must be a clean rewrite of the settled requirements in `implementation-contract.final.md`; keep review history in `reviews/` or `decisions/`, not appended to the final contract body.
   - Maintain `contract-index.md` so the next implementer can find the current authoritative contract without reading older drafts first.
   - For Multica handoff, prefer the Multica sprint contract rather than the Atlas lightweight template.
5. When the team discussion settles an actionable plan, promotion, or staffing handoff, also write a concise project doc:
   - prefer an existing project docs location; otherwise create `docs/atlas-workflow/` under the target project root.
   - create or reuse one workflow docs bundle for the same workflow: `docs/atlas-workflow/<workflow-id>-<short-topic>/`.
   - use stable files inside the bundle, such as `README.md`, `team-decision.md`, `staffing.md`, `contract-index.md`, `implementation-contract.draft.md`, `implementation-contract.final.md`, `reviews/`, `decisions/`, and `evidence/`; do not create scattered sibling markdown files for the same workflow.
   - make `contract-index.md` the bundle entrypoint: besides `current_authoritative_contract`, include supporting evidence links for `team_decision`, `staffing`, `evidence_index`, `workflow_team_decision`, and `workflow_team_staffing` so later implementers can find staffing and evidence without relying on the final reply.
   - include the final decision, consensus basis, owner/staffing plan when relevant, acceptance criteria, verification gates, risks, and next execution step.
   - keep `workflow/artifacts/<task-id>/team/decision.md` as the discussion record; the project doc is the durable handoff for the repo.
6. Promote explicitly with:
   - `~/.codex/workflow/bin/codex-workflow team-promote <task-id> --to execute`
   - `~/.codex/workflow/bin/codex-workflow team-promote <task-id> --to worktree`
   - `~/.codex/workflow/bin/codex-workflow team-promote <task-id> --to finish`
7. In the final reply, include the task id, `decision.md` path, staffing path if produced, workflow docs bundle path if written, authoritative contract path if produced, readiness result if run, promotion state, native backend status, loop status when relevant, and any open decision.
