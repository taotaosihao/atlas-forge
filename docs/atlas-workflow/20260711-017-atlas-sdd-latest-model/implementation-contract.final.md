# Atlas SDD 最新模型实施合同

task_id: 20260711-017-atlas-sdd
title: 禁止 Atlas SDD 调用非最新模型
created: 2026-07-11
contract_semantics_version: 1
work_type: implementation
first_code_guard: required
first_code_not_applicable_reason:
product_ui_gate: not_applicable
product_ui_not_applicable_reason: 纯配置与合同门禁变更，无用户界面。

## Scope

- Goal: 四个 Atlas SDD 自定义 Agent 按职责使用本地 catalog 最新稳定 GPT family 的 frontier/balanced/fast 变体与 thinking 档位；陈旧投影在 spawn 前 fail closed，reviewer 单独显式覆盖。
- Non-goals: 不联网发现模型，不未经审查自动采用新 family，不修改全局配置、Multica、安装态、cache、marketplace 或 scorecard 历史 fixture。
- Files or surfaces likely affected: 单一角色模型策略、catalog 解析/检查工具、`.codex/agents/atlas-sdd-{explorer,implementer,reviewer,verifier}.toml`、`plugins/atlas-workflow/skills/team/SKILL.md`、专项测试与 `workflow/tests/contract.sh`。
- User-visible behavior: 当前 reviewer 使用 `gpt-5.6-sol/max`；implementer 使用 `gpt-5.6-sol/high`；verifier 使用 `gpt-5.6-terra/high`；explorer 使用 `gpt-5.6-luna/medium`。未来 catalog 出现任意数值更高的 family 时，旧 5.6 投影会被阻止启动，直到新投影显式生成和审查；不假设下一版本连续递增。

## First Code Slice Guard

- first_code_slice: 实现无具体版本的角色策略与 catalog-aware 解析/检查工具，并生成当前 5.6 的四个可审计 Agent 投影。
- first_code_slice_kind: workflow
- first_code_owner: 当前主 Agent
- first_code_verification: hermetic 5.6 fixture 解析出预期四角色映射，真实本地 catalog 检查当前投影通过。
- allowed_contract_gate_only_until: 用户批准本合同进入实施之前。
- stop_if_no_code_by_phase: 实施 Phase 1 结束时。
- gate_parallelization_or_deferral_plan: Phase 1 完成策略、解析器和投影；Phase 2 将检查接入 team spawn 并加入非连续更高版本/缺失变体 fixture。任一 phase 不得用文档或 fixture 替代行为实现。
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
| AC-1 | 当前投影为 reviewer=Sol/max、implementer=Sol/high、verifier=Terra/high、explorer=Luna/medium | yes | 真实 catalog 检查与精确 TOML 断言 |
| AC-2 | 角色策略不包含 `5.6` 等具体 family 版本，只包含 frontier/balanced/fast 与 thinking | yes | 策略 schema/fixture 测试 |
| AC-3 | hermetic 非连续更高 catalog 下，5.6 投影被判 stale；生成目标 family 投影后通过 | yes | 专项跨版本测试 |
| AC-4 | 缺少必需变体、thinking 不受支持、catalog 歧义或陈旧时均 fail closed | yes | 专项负例测试 |
| AC-5 | Atlas team 在自定义 Agent spawn 前执行检查，失败时禁止调用，reviewer 有独立断言 | yes | team skill 合同测试 |
| AC-6 | Atlas 仓库合同测试通过 | yes | `bash workflow/tests/contract.sh` |
| AC-7 | 未修改安装态、Multica 或发布派生产物 | yes | `git diff --name-only` |

## Real Validation Plan

| Row | Target | Command or action | Expected result | Phase conclusion evidence |
|-----|--------|-------------------|-----------------|---------------------------|
| V-1 | 当前 catalog 解析 | 运行模型策略检查器指向 `/home/gewu/.codex/models_cache.json` | 四个角色映射与当前投影一致 | 最终回复中的命令结论 |
| V-2 | 跨版本与 fail-closed | 运行专项测试覆盖 5.6、非连续更高 family、缺失变体、非法 thinking、陈旧投影 | 所有正负例符合策略 | 最终回复中的命令结论 |
| V-3 | reviewer 重点门禁 | 检查 reviewer 为最高 family frontier/max，并验证 team spawn 前置规则 | 旧 reviewer 被阻止 | 最终回复中的命令结论 |
| V-4 | 仓库合同 | `bash workflow/tests/contract.sh` | exit 0 | 最终回复中的命令结论 |
| V-5 | diff 完整性 | `git diff --check` 与 `git diff --name-only` | 无格式错误、无 forbidden paths | 最终回复中的 diff 摘要 |

## Evidence Budget

- 不新增大体积 Git evidence；原始命令输出保留在终端或临时目录。
- 本阶段只在最终回复报告验证结论；若出现缺陷，再创建精简 defect queue。
- 临时日志、完整测试输出和调试材料不得默认提交。

## Edge Cases

| Case | Expected behavior | Required |
|------|-------------------|----------|
| 只修改 reviewer | 验收失败；其他三个角色及策略投影必须同步有效 | yes |
| scorecard fixture 含旧模型名 | 允许保留，因为不参与 Agent 选模 | yes |
| catalog 跳到任意更高 family、投影仍为 5.6 | 所有受管 Atlas SDD Agent spawn 被阻止 | yes |
| 最新 family 缺少 Terra/Luna 等必需变体 | 停止并报告，不跨 family 混用或回退 | yes |
| thinking 档位不受目标模型支持 | 停止并报告，不静默降级 thinking | yes |

## Failure And Stop Conditions

- Stop and ask the user when: 需要刷新真实安装态、修改 Multica/cache/marketplace，或 catalog 无法唯一解析最新 stable family 的必需能力档位。
- Treat the task as failed when: team 可在陈旧/歧义策略下继续 spawn、reviewer 不是最新 frontier/max、策略写死具体 family，或合同测试失败。
- Safe fallback: 保持仓库变更未发布并禁止受管 Agent spawn；报告缺失/歧义证据，禁止静默回退任何旧 family。

## Completion Check

- [x] Scope stayed inside the contract
- [x] Required acceptance criteria passed
- [x] Required validation rows have evidence
- [x] Residual risks are recorded
