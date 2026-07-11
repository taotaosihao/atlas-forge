# Implementation Contract：Atlas 工作流收敛减法

task_id: 20260712-001-atlas
title: Atlas 工作流快速收敛与约束减法
created: 2026-07-12
contract_semantics_version: 1
work_type: implementation
first_code_guard: required
first_code_not_applicable_reason:
product_ui_gate: not_applicable
product_ui_not_applicable_reason: 本任务修改 headless workflow CLI、skills、规则和合同测试，不改变用户可见产品 UI 或浏览器流程。

## Scope

- Goal: 用一道 execute 准入和流程减法，阻止非实施任务误晋级，并让明确任务与完整 roadmap 在不扩大目标的前提下尽快收敛。
- Non-goals: 不建设宿主 capability、roadmap/scope 状态机、acceptance hash、合同 digest、review schema 或数字型停止森林；不修改 Multica、cache、marketplace、runtime 或 release 状态。
- Files or surfaces likely affected: `workflow/bin/lib/codex-workflow/team/commands.js`、对应 JS tests、`plugins/atlas-workflow/{README.md,skills/task,skills/cw,skills/team}`、必要的 Team references、`workflow/tests/contract.sh`、用户级与项目级 `AGENTS.md` 及本 bundle。
- User-visible behavior: analyze/review/clarify 没有明确实施消息引用时不能进入 execute；明确工作不再因多文件默认进入 Team；完整 roadmap 连续执行；review/fix、commit 和上下文保持有限。

## First Code Slice Guard

- first_code_slice: 修改 Team command runtime，使两个 execute 入口缺少 `authorization_ref` 时在任何状态写入前拒绝执行。
- first_code_slice_kind: workflow
- first_code_owner: 主 Codex agent。
- first_code_verification: `node --test workflow/tests/js/team-commands.test.js`
- allowed_contract_gate_only_until: 本合同和 clarify artifacts 通过 lint/readiness；之后立即修改 Team commands。
- stop_if_no_code_by_phase: 第一个逻辑成果结束时若 Team command 行为未改变，停止继续扩展文档并回到该入口实现。
- gate_parallelization_or_deferral_plan: 首个行为 patch 由主 agent 独占；规则减法与广泛验证在其专项测试通过后继续。
- Ordering rule: contract, scanner, fixture, and evidence-only preparation must be bounded before the first implementation diff; it cannot remain the only deliverable after the named stop point.
- First-code rule: the first code slice may be fixture-backed, mocked, or in-memory, but it must change the product, runtime, API, CLI, workflow, or contract-owned behavior under test.
- Gate-only non-completion: docs-only artifacts, scanner fixtures, analysis notes, and evidence bundles are not first code slices by themselves. For scanner/tooling tasks, implementing scanner/tool behavior may count; adding fixtures around unchanged behavior does not.
- Safety rule: hard safety gates remain blockers for acceptance and release; starting a bounded code slice never authorizes skipping, weakening, or backfilling named safety gates.
- Versioned stop: semantics version 1 requires `stop_if_no_code_by_phase`. The one-phase default applies only when interpreting an unversioned historical contract.
- Not-applicable boundary: planning, review, audit, and docs-only work. Tiny precise fixes whose acceptance path is already obvious may skip a versioned implementation contract; a version 1 `implementation` contract must use the required guard.

## Product/UI Acceptance Gate

- first_operable_user_flow: not_applicable
- browser_entrypoint: not_applicable
- served_ui_validation_action: not_applicable
- ui_data_mode: not_applicable
- required_safety_gates: Team command tests、plugin validation、repo contract 与 forbidden-path checks。
- allowed_headless_only_until: 整个任务；这是 headless workflow 变更。
- stop_if_no_ui_by_phase: not_applicable
- Ordering rule: for non-tiny user-facing product/UI/browser work, the served operable UI thin slice must precede release, perf, soak, and phase evidence expansion.
- Hard safety rule: the UI thin slice and required hard safety gates must be satisfied together; neither may pass acceptance without the other.
- Served UI evidence: HTML document and JS/CSS app assets must come from a real HTTP server. `page.route` may mock backend/data-plane responses only, not the main document or app bundle.
- UI/product non-evidence: `page.setContent`, synthetic HTML, fulfilled main documents, fulfilled app bundles, headless model tests, scanner fixtures, CLI pass, typecheck/build-only proof, and network allowlist capture without a served UI route.
- Evidence purpose boundary: the non-evidence list applies to UI/product acceptance evidence. Correctly labeled headless/network evidence may still satisfy safety gates.
- Reverse guard: served UI evidence does not replace required hard safety-gate evidence.
- Not-applicable boundary: only genuinely headless CLI/worker/library/scanner work or tiny changes that do not alter user-visible UI behavior. A product task with no served app is not tiny solely because the slice is small.

## Acceptance Criteria

| ID | Criterion | Required | Verification |
|----|-----------|----------|--------------|
| AC-1 | `team-record-start --mode execute` 与 `team-promote --to execute` 缺非空单行 `authorization_ref` 时在写 state、decision 或 runtime event 前失败；discuss 与非 execute promotion 保持兼容 | yes | `node --test workflow/tests/js/team-commands.test.js` |
| AC-2 | 用户级 AGENTS 不再常驻 Atlas 专用 routing/cache 细节，也不要求普通非 tiny 工作默认生成完整 artifacts | yes | focused `rg` 与 diff review |
| AC-3 | Task/CW 不再因多文件或行为变化默认 Team；Team 只在用户明确要求或存在真实独立协作价值时使用 | yes | `workflow/tests/contract.sh` |
| AC-4 | Team 常驻 skill 不再含 dynamic staffing、逐轮 commit、开放式 clean repair 或无条件 whole-branch review；SDD/BAF 按需加载 | yes | focused `rg`、plugin validation、repo contract |
| AC-5 | Reviewer 发现自由、自动 repair 有限、full-roadmap 连续执行、适中自动 commit 和单一滚动 checkpoint 在权威规则中清晰表达 | yes | skill contract assertions |
| AC-6 | 项目 checkout、Multica、release 与最小验证边界保持；项目 commit 规则按逻辑成果而非机械 phase | yes | project AGENTS review 与 repo contract |
| AC-7 | 重复 prose 存在性断言被必要行为/不变量检查替代；活动源码不再出现 `unbounded_until_clean_or_terminal` 或 `max_question_rounds`，SDD commit policy 使用逻辑成果而非逐文件/逐轮提交 | yes | `rg`、Team SDD/native 与全量合同 |
| AC-8 | 预先存在的独立 Agent/model-policy 文件及对应测试 hunks不被覆盖或 stage；与 Team skill 重叠的模型策略语义在减法重写中完整保留并单独审计 | yes | staged diff audit |

## Real Validation Plan

| Row | Target | Command or action | Expected result | Phase conclusion evidence |
|-----|--------|-------------------|-----------------|---------------------------|
| V-1 | Execute admission | `node --test workflow/tests/js/team-commands.test.js` | execute 缺引用无副作用失败，兼容路径通过 | 命令退出状态与首个逻辑 commit |
| V-2 | Team protocols | `bash workflow/tests/contract_team_native.sh`、`bash workflow/tests/contract_team_sdd.sh` | Native 与按需 SDD 行为合同通过 | 命令退出状态与规则减法 commit |
| V-3 | Plugin | 官方 `validate_plugin.py`、`workflow/bin/atlas-plugin-integrity manifest --plugin-root plugins/atlas-workflow` | Plugin 结构与 source identity 通过 | 命令退出状态 |
| V-4 | Repository | `bash workflow/tests/contract_repo.sh`、`bash workflow/tests/contract.sh` | Hermetic repo 与最终集成合同通过 | 最终验证结论 |
| V-5 | Docs/diff | 合同 lint、contract-index lint、relative Markdown links、`git diff --check` | 权威合同、链接和差异格式通过 | 最终验证结论 |

## Evidence Budget

- Git evidence defaults to the compact bundle, verified logical commits, and the final delivery summary; do not create per-round evidence files for this task.
- Optional git evidence is created only when a failed or disputed gate cannot be understood from the final command conclusion.
- Temporary run artifacts outside git by default: raw logs, traces, full command output, failed retry logs, worker debug JSONL, API dumps, port status, and intermediate repair output.
- The single rolling checkpoint lives in workflow runtime, is overwritten rather than appended, and is not committed to Git.

## Edge Cases

| Case | Expected behavior | Required |
|------|-------------------|----------|
| Discuss start without authorization ref | 保持成功 | yes |
| Execute start or promotion without authorization ref | 失败且 state、decision、runtime event 不变 | yes |
| Worktree/finish promotion without authorization ref | 保持现有行为 | yes |
| 用户授权完整 roadmap | 内部 slices 连续执行，不逐 slice 请求确认 | yes |
| Reviewer 发现 roadmap 外优化 | 报告为 follow-up，不自动 fixer | yes |
| Dirty worktree 含用户独立改动 | 精确 stage 本任务 hunks，不覆盖或夹带 | yes |

## Failure And Stop Conditions

- Stop and ask the user when: 继续需要新的外部 mutation/release 权限、用户拥有的产品决策，或无法隔离预先存在用户改动。
- Treat the task as failed when: 非实施任务仍可无明确消息引用进入 execute；旧无界 repair/default Team/机械 commit 语义仍被合同要求；Multica 或派生安装态发生修改。
- Safe fallback: 保留当前用户工作与已验证逻辑 commits，继续所有仍安全且属于当前目标的路径；只有安全路径耗尽时归还。

## Completion Check

- [ ] Scope stayed inside the contract
- [ ] Required acceptance criteria passed
- [ ] Required validation rows have evidence
- [ ] Existing user changes were preserved; standalone user-owned files/hunks were excluded from task commits and overlapping Team semantics were retained
- [ ] Cache, marketplace, runtime, release, and Multica forbidden paths stayed unchanged
- [ ] Residual risks are recorded
