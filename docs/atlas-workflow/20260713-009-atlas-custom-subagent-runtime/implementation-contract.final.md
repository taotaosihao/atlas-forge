# Atlas custom subagent runtime 路由证明实施合同

task_id: 20260713-009-atlas-custom-subagent-runtime
title: Atlas custom subagent runtime 路由证明与合同收敛
created: 2026-07-13
contract_semantics_version: 1
work_type: implementation
first_code_guard: required
first_code_not_applicable_reason:
product_ui_gate: not_applicable
product_ui_not_applicable_reason: 纯 CLI/runtime smoke、配置和合同测试，无用户界面行为。

## Scope

- Goal: 用隔离 opt-in smoke 证明 stable native runtime 对 Atlas standalone custom agents 的 resolved role/model/effort 绑定；通过后收敛 Team 跨文件合同。
- Non-goals: 不调整 Luna/Terra/Sol 分工，不新增 agent，不自动启用 MultiAgentV2，不修改真实 `~/.codex/config.toml`、安装态、cache、marketplace、workflow runtime、Multica 或发布状态。
- Files or surfaces likely affected: Atlas-scoped smoke runner 与 hermetic tests、`.codex/agents/atlas-sdd-{reviewer,phase-reviewer,planner,implementer,browser-verifier}.toml`、`plugins/atlas-workflow/skills/team/SKILL.md`、专项合同与 `workflow/tests/contract.sh`。
- User-visible behavior: Team 只在可信 runtime proof 成立后宣称命名 agent 使用指定模型；失败或 metadata 不足时返回 failed/inconclusive，不静默继承或伪装成功。

## First Code Slice Guard

- first_code_slice: 实现默认关闭的 Atlas custom-agent runtime smoke CLI，使其执行隔离 probe、解析可信 metadata 并返回 `passed | failed | inconclusive` verdict。
- first_code_slice_kind: workflow
- first_code_owner: 当前主 Codex
- first_code_verification: runner 默认不产生 live 调用；fixture 覆盖 matched、missing metadata、parent-model inheritance、wrong effort、spawn failure、redaction 与 cleanup。
- allowed_contract_gate_only_until: 实施 Phase 1 开始前。
- stop_if_no_code_by_phase: Phase 1 结束时。
- gate_parallelization_or_deferral_plan: Phase 1 必须先交付 runner/parser/tests；Gate A 决定是否进入 Phase 2。文档、fixture 或调查不得替代 runner 行为实现。
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
- required_safety_gates: not_applicable
- allowed_headless_only_until: not_applicable
- stop_if_no_ui_by_phase: not_applicable
- Ordering rule: for non-tiny user-facing product/UI/browser work, the served operable UI thin slice must precede release, perf, soak, and phase evidence expansion.
- Hard safety rule: the UI thin slice and required hard safety gates must be satisfied together; neither may pass acceptance without the other.
- Served UI evidence: HTML document and JS/CSS app assets must come from a real HTTP server. `page.route` may mock backend/data-plane responses only, not the main document or app bundle.
- UI/product non-evidence: `page.setContent`, synthetic HTML, fulfilled main document or app bundle, headless model tests, scanner fixtures, CLI pass, typecheck/build-only proof, and network allowlist capture without a served UI route.
- Evidence purpose boundary: the non-evidence list applies to UI/product acceptance evidence. Correctly labeled headless/network evidence may still satisfy safety gates.
- Reverse guard: served UI evidence does not replace required hard safety-gate evidence.
- Not-applicable boundary: only genuinely headless CLI/worker/library/scanner work or tiny changes that do not alter user-visible UI behavior. A product task with no served app is not tiny solely because the slice is small.

## Acceptance Criteria

| ID | Criterion | Required | Verification |
|----|-----------|----------|--------------|
| AC-1 | live smoke 默认关闭，必须显式 `ATLAS_AGENT_RUNTIME_SMOKE=1` | yes | hermetic CLI tests |
| AC-2 | smoke 使用 `mktemp` 隔离 CODEX_HOME/session/log；临时认证权限 `0600` 且退出删除，输出无凭据 | yes | cleanup/redaction tests + inspection |
| AC-3 | 精确命名 `atlas-sdd-reviewer` 与 `atlas-sdd-phase-reviewer`，specialized mission 自包含且不使用 full-history fork | yes | runner input/event evidence |
| AC-4 | reviewer metadata 匹配 Terra/high，phase reviewer 匹配 Sol/medium | yes | opt-in live smoke |
| AC-5 | role、model、effort 任一缺失/不匹配、继承父模型或 spawn 失败均不得 passed | yes | negative fixtures + live verdict |
| AC-6 | Gate A 未 passed 时，不进入或宣称 Team runtime guarantee；形成版本、feature、日志和最小复现摘要 | yes | gate test |
| AC-7 | Team 精确点名 custom agents，默认模型不等于固定 staffing；难以撤销方向先用 planner；明确环境 blocker 不升级 Sol | yes | cross-file contract assertions |
| AC-8 | 视觉 Sol review 只在 phase/final acceptance；旧 `after substantial browser or visual verification` 被禁止 | yes | positive/negative assertions |
| AC-9 | implementer 服从 controller 的适中逻辑 commit boundary，不强制每个 slice 独立提交 | yes | cross-file assertion |
| AC-10 | Atlas plugin/repo 验证通过，未修改 forbidden paths、Multica、真实配置或安装态 | yes | required validation commands |

## Real Validation Plan

| Row | Target | Command or action | Expected result | Phase conclusion evidence |
|-----|--------|-------------------|-----------------|---------------------------|
| V-1 | runner hermetic contract | 运行新增 smoke 专项测试 | opt-in、fixtures、redaction、cleanup 全通过 | Phase 1 conclusion |
| V-2 | static model policy | `bash workflow/tests/contract_agent_model_policy.sh` | 七角色投影与 family gate 通过 | Phase 1 conclusion |
| V-3 | stable runtime binding | `ATLAS_AGENT_RUNTIME_SMOKE=1 <runner>` | 两个命名 profile 的可信 role/model/effort 均匹配 | Gate A report |
| V-4 | plugin validity | 官方 `validate_plugin.py` 与 `atlas-plugin-integrity manifest` | exit 0 | final conclusion |
| V-5 | repo contracts | `bash workflow/tests/contract_repo.sh` | exit 0 | final conclusion |
| V-6 | diff boundaries | `git diff --check`、staged diff、forbidden paths | 无格式错误、无越界路径 | final conclusion |

## Evidence Budget

- Git 只保留 smoke 结论、必要的 sanitized metadata 摘要和合同测试；目标不超过 10 个 evidence 文件、1 MB。
- 原始 Codex logs、session JSONL、完整输出、临时认证副本和失败重试保存在 `mktemp` 目录并在退出时删除。
- 若需上游 issue，另行授权后生成最小、脱敏复现，不提交真实 session dump。

## Edge Cases

| Case | Expected behavior | Required |
|------|-------------------|----------|
| custom agent 能 spawn 但无可信 model metadata | `inconclusive`，不得 passed | yes |
| child 显示正确 nickname 但继承 parent model | failed | yes |
| UI badge 与 session/log metadata 冲突 | `inconclusive`，记录上游 provenance 问题 | yes |
| stable runtime 不支持精确 profile 选择 | failed，停止 Phase 2 runtime guarantee | yes |
| full-history fork 拒绝或继承 override | 使用 self-contained non-full-history probe；不得放宽判定 | yes |
| 需要 MultiAgentV2 workaround | 停止，请求独立实验授权 | yes |
| 认证无法安全复制或清理 | 跳过 live smoke并报告 blocker | yes |

## Failure And Stop Conditions

- Stop and ask the user when: 需要修改真实用户配置、启用 MultiAgentV2、刷新安装态、发布、上传日志、提交上游 issue，或临时认证无法安全处理。
- Treat the task as failed when: runtime proof 被 agent 自报/UI 单一信息替代、metadata 不匹配仍通过、full-history inheritance 被当作专门 profile、凭据进入输出/Git，或合同/仓库测试失败。
- Safe fallback: 保留现有静态 custom-agent 配置，但将 Team 表述降级为“目标 profile”，不宣称 runtime 已保证；返回 sanitized 最小复现与版本/feature 状态。

## Completion Check

- [ ] Scope stayed inside the contract
- [ ] Required acceptance criteria passed
- [ ] Required validation rows have evidence
- [ ] Residual risks are recorded
