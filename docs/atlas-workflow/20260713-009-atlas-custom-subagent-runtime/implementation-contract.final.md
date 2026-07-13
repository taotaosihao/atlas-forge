# Atlas Team 相对降本实施合同

task_id: 20260713-009-atlas-custom-subagent-runtime
title: Atlas Team 相对降本路由
created: 2026-07-13
contract_semantics_version: 1
work_type: implementation
first_code_guard: required
first_code_not_applicable_reason:
product_ui_gate: not_applicable
product_ui_not_applicable_reason: 纯 Team/custom-agent workflow 与合同测试变更，无用户界面。

## Scope

- Goal: 通过按需 staffing、Luna/Terra 优先和 Sol 关键点升级，相对降低 Team 成本，同时保持关键判断质量。
- Non-goals: 不固定角色集，不保证每次 spawn 的实际模型可被证明，不建设 runtime runner、metadata parser、Gate A、动态 router、风险矩阵或成本 dashboard；不修改真实用户配置、MultiAgentV2、安装态、cache、marketplace、Multica 或发布状态。
- Files or surfaces likely affected: `.codex/agents/atlas-sdd-*.toml`、`plugins/atlas-workflow/skills/team/SKILL.md`、专项合同测试与 `workflow/tests/contract.sh`。
- User-visible behavior: 小任务默认主 Agent；角色按需启用；模型不可确认时标记 `unverified`；确认成本异常时停止新增 fan-out 并安全降级。

## First Code Slice Guard

- first_code_slice: 修改 Team 与 custom-agent prompt 的软路由行为。
- first_code_slice_kind: workflow
- first_code_owner: 当前主 Codex
- first_code_verification: Team 与 custom-agent 正负合同断言通过。
- allowed_contract_gate_only_until: 里程碑 1（路由行为修改）开始前。
- stop_if_no_code_by_phase: 里程碑 1 完成时。
- gate_parallelization_or_deferral_plan: 里程碑 1 修改行为；里程碑 2 补齐跨文件测试与仓库验证。条件性 runtime 校准不是必需里程碑。
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

| Scenario | Required behavior | Forbidden behavior |
|----------|-------------------|--------------------|
| 小而清晰的任务 | 默认主 Agent；有具体降风险或降延迟证据时可用 subagent | 机械启动固定角色集 |
| 常规实现 | 需要 implementer 时优先 GPT-5.6 Luna max | 无理由使用 Sol |
| 常规 review/verify | 需要该角色时优先 Terra | 用 Sol 代替常规检查 |
| 难撤销的方案方向 | 需要 planner 时优先 GPT-5.6 Sol medium | 把机械或环境问题升级给 Sol |
| 已完成阶段需要额外判断 | 需要 phase reviewer 时优先 GPT-5.6 Sol medium | 用 phase reviewer 代替 routine review |
| 大量浏览器/视觉操作 | 优先 GPT-5.6 Luna high；最终额外判断有价值时再用 Sol medium phase reviewer | 全程默认 Sol |
| preferred agent 不可用 | 合理回退并披露 | 虚构 preferred profile 已生效 |
| metadata 不可见或冲突 | 标记 `unverified` 并继续普通任务 | 虚报 `verified` 或设为日常门禁 |
| 确认昂贵继承或异常 fan-out | 停止新增 fan-out、最小只读诊断并降级 | 继续扩张或擅自修改配置/runtime |

未来测试必须把场景投影为允许/禁止动作的正负断言，不能只检查关键词。

## Real Validation Plan

| Row | Target | Command or action | Expected result | Phase conclusion evidence |
|-----|--------|-------------------|-----------------|---------------------------|
| V-1 | model policy | `bash workflow/tests/contract_agent_model_policy.sh` | 角色偏好与 family gate 通过 | final conclusion |
| V-2 | soft routing | Team/custom-agent 场景正负断言 | staffing、升级、fallback 与 blocker 边界一致 | final conclusion |
| V-3 | conditional calibration | 仅在疑似成本信号或用户明确要求时检查可用 metadata | 被触发时记录 `verified`/`unverified`；未触发无需证据 | conditional note |
| V-4 | repository | 官方 plugin validator、`atlas-plugin-integrity manifest`、`contract_repo.sh`、`git diff --check` | 全部通过且无越界路径 | final conclusion |

## Evidence Budget

- Git 只保留合同、测试和必要结论；原始 logs/session 输出放临时目录。
- `unverified` 不阻塞普通任务；不为证明模型新增 runner 或认证复制。

## Edge Cases

| Case | Expected behavior | Required |
|------|-------------------|----------|
| typo/import/端口/网络/凭据失败 | 直接修复、诊断或报告，不升级 Sol | yes |
| 需要配置、MultiAgentV2、安装、日志上传、上游 issue 或发布 mutation | 停止并请求用户授权 | yes |

## Failure And Stop Conditions

- Stop new fan-out and diagnose when: 确认昂贵模型继承、异常 fan-out 或明显成本失控；只做最小只读诊断并安全降级。
- Stop and ask the user when: 修复需要配置、runtime、MultiAgentV2、安装、日志上传、上游 issue、发布或其他未授权 mutation。
- Treat the task as failed when: 机械启动角色、无理由升级 Sol、环境 blocker 被升级给 Sol、虚报 `verified`，或必需验证失败。
- Safe fallback: 主 Agent 或更少 subagent 继续；保留模型偏好并如实标记 `unverified`。

## Completion Check

- 条件性 V-3 只在触发时需要证据。
- [ ] Scope stayed inside the contract
- [ ] Required acceptance criteria passed
- [ ] Required validation rows have evidence
- [ ] Residual risks are recorded
