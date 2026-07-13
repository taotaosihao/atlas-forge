# Atlas custom subagent 相对降本路由实施合同

task_id: 20260713-009-atlas-custom-subagent-runtime
title: Atlas custom subagent 相对降本路由与合同收敛
created: 2026-07-13
contract_semantics_version: 1
work_type: implementation
first_code_guard: required
first_code_not_applicable_reason:
product_ui_gate: not_applicable
product_ui_not_applicable_reason: 纯 custom-agent 配置、Team 路由合同与测试变更，无用户界面行为。

## Scope

- Goal: 通过按需 staffing、Luna/Terra 优先、Sol 关键点升级和低频抽样校准，相对降低 Atlas Team 模型成本，同时保持关键判断质量。
- Non-goals: 不保证每次 spawn 的 model/effort 都可被绝对证明；不禁止合理回退；不建设 runtime smoke CLI、认证复制、metadata parser、Gate A、动态 router、风险矩阵或成本 dashboard；不修改真实 `~/.codex/config.toml`、MultiAgentV2、安装态、cache、marketplace、workflow runtime、Multica 或发布状态。
- Files or surfaces likely affected: `.codex/agents/atlas-sdd-{reviewer,phase-reviewer,planner,implementer,browser-verifier}.toml`、`plugins/atlas-workflow/skills/team/SKILL.md`、专项合同与 `workflow/tests/contract.sh`。
- User-visible behavior: Team 将模型分配表述为优先配置而非绝对限制；小任务不机械 spawn；metadata 不可见时标记 `unverified` 并继续；只有确认昂贵模型继承、异常 fan-out 或明显成本失控时停止新的 fan-out。

## First Code Slice Guard

- first_code_slice: 修改 Team 与 custom-agent prompt 的路由行为，使默认模型仅在相应角色确有需要时生效，并实现软升级、环境 blocker 排除和适中提交边界。
- first_code_slice_kind: workflow
- first_code_owner: 当前主 Codex
- first_code_verification: Team、planner、phase reviewer、browser verifier、implementer 的静态正负合同断言通过。
- allowed_contract_gate_only_until: 实施 Phase 1 开始前。
- stop_if_no_code_by_phase: Phase 1 结束时。
- gate_parallelization_or_deferral_plan: Phase 1 完成路由与 agent prompt 行为修改；Phase 2 补齐跨文件合同测试与可选抽样校准说明。文档或 fixture 不得替代 Team/custom-agent 行为修改。
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
| AC-1 | 实现、routine review/verify、planning/phase review 的模型为优先配置，不使用绝对限制措辞 | yes | Team/custom-agent contract assertions |
| AC-2 | 默认模型不等于固定 staffing；小而清晰的任务允许主 Agent 直接完成，不机械 spawn 三角色 | yes | Team positive assertion |
| AC-3 | 需要实现角色时优先 Luna；需要常规 review/verify 时优先 Terra；规划或关键判断确有价值时优先 Sol | yes | model policy + Team assertions |
| AC-4 | 难以撤销的是方案方向时优先 Sol planner；完成阶段或集成结果时才使用 Sol phase reviewer | yes | cross-file assertions |
| AC-5 | 一次非机械失败只有在疑似实现/决策错误且根因不明时才考虑升级 Sol；明确环境/基础设施 blocker 不升级 | yes | positive/negative assertions |
| AC-6 | 大量浏览器操作优先 Luna high；只有 phase/final acceptance 的额外判断有价值时才使用 Sol phase reviewer | yes | Team、browser、phase reviewer assertions |
| AC-7 | implementer 服从 controller 的适中逻辑 commit boundary，不强制每个 slice 独立提交 | yes | cross-file assertion |
| AC-8 | runtime metadata 可见时记录 `verified`；不可见或冲突时记录 `unverified` 并允许普通任务继续 | yes | Team calibration assertion |
| AC-9 | Codex 版本/agent 配置变化、token 异常或疑似父模型继承时才抽样校准；不建设长期 runner | yes | Team/docs assertion + absence check |
| AC-10 | 只有确认昂贵父模型继承、异常 fan-out 或明显成本失控时才停止新的 fan-out 并调查 | yes | Team stop assertion |
| AC-11 | Atlas plugin/repo 验证通过，未修改 forbidden paths、Multica、真实配置或安装态 | yes | required validation commands |

## Real Validation Plan

| Row | Target | Command or action | Expected result | Phase conclusion evidence |
|-----|--------|-------------------|-----------------|---------------------------|
| V-1 | static model policy | `bash workflow/tests/contract_agent_model_policy.sh` | 七角色投影与 family gate 通过 | final conclusion |
| V-2 | soft routing contract | 运行 Team/custom-agent 专项正负断言 | 默认模型、按需 staffing、升级和 blocker 边界一致 | final conclusion |
| V-3 | optional calibration | 版本/配置变化或成本异常时，点名一个低成本角色与一个 Sol 角色，检查当时可用 thread/status/log metadata | 记录 `verified` 或 `unverified`；后者不阻塞普通任务 | temporary calibration note |
| V-4 | plugin validity | 官方 `validate_plugin.py` 与 `atlas-plugin-integrity manifest` | exit 0 | final conclusion |
| V-5 | repo contracts | `bash workflow/tests/contract_repo.sh` | exit 0 | final conclusion |
| V-6 | diff boundaries | `git diff --check`、staged diff、forbidden paths | 无格式错误、无越界路径 | final conclusion |

## Evidence Budget

- Git 只保留合同、测试和必要的简短校准结论；不新增 runtime smoke 基础设施或大体积 evidence。
- 抽样校准的原始 logs/session 输出保存在临时目录，不进入 Git；无需复制认证到新 CODEX_HOME。
- metadata 不可见时记录 `unverified` 即可，不为普通任务追加调查成本。

## Edge Cases

| Case | Expected behavior | Required |
|------|-------------------|----------|
| 小而清晰的单 Agent 工作 | 不启动 Team lanes，主 Agent 直接完成 | yes |
| preferred custom agent 不可用 | 允许合理回退并如实说明，不宣称已 verified | yes |
| custom agent 能 spawn 但 model metadata 不可见 | `unverified`，普通任务继续 | yes |
| UI badge 与 log metadata 冲突 | `unverified`；仅在成本异常时继续调查 | yes |
| 确认普通 lane 使用昂贵父模型 | 停止新的 fan-out，减少 subagent并调查配置/runtime | yes |
| 明确端口、网络、凭据或服务 blocker | 诊断或报告 blocker，不升级 Sol reviewer | yes |
| 默认路径一次失败但原因是简单机械错误 | 保持原 profile，完成直接修复 | yes |
| 需要 MultiAgentV2 workaround | 停止，请求独立实验授权 | yes |

## Failure And Stop Conditions

- Stop and ask the user when: 确认昂贵模型继承、异常 fan-out、明显成本失控，或需要修改真实用户配置、启用 MultiAgentV2、刷新安装态、发布、上传日志、提交上游 issue。
- Treat the task as failed when: Team 机械启动不必要角色、普通任务无理由使用 Sol、明确环境 blocker 被升级给 Sol、`unverified` 被虚假报告为 `verified`，或合同/仓库测试失败。
- Safe fallback: 减少或停止 subagent fan-out，由主 Agent 直接完成当前任务；保留 preferred profile 配置并如实标记 runtime model `unverified`。

## Completion Check

- [ ] Scope stayed inside the contract
- [ ] Required acceptance criteria passed
- [ ] Required validation rows have evidence
- [ ] Residual risks are recorded
