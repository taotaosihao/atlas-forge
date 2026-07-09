# Atlas Forge 发布完整性与工作流治理最终实施合同

workflow_id: 20260710-003-atlas-forge
task_id: 20260710-004-atlas-forge
title: Atlas Forge 发布完整性与工作流治理完整实施
contract_status: final
current_authoritative_contract: ./implementation-contract.final.md
contract_semantics_version: 1
work_type: implementation
created: 2026-07-10
finalized: 2026-07-10

first_code_guard: required
first_code_slice: 实现 `workflow/bin/atlas-plugin-integrity` 的 manifest 与 release identity 行为
first_code_slice_kind: cli
first_code_owner: Phase 1 release-identity executor
first_code_verification: `bash workflow/tests/contract_atlas_plugin_integrity.sh`
allowed_contract_gate_only_until: Phase 0 文档基线提交完成
stop_if_no_code_by_phase: Phase 1
gate_parallelization_or_deferral_plan: P0 仅并行只读审查；semantic lint 实现延后到 Phase 1-4 全部通过

product_ui_gate: not_applicable
product_ui_not_applicable_reason: 本任务只修改 headless CLI、shell workflow、validators、fixtures 和 CI，不存在用户可操作的浏览器界面
first_operable_user_flow: not_applicable
browser_entrypoint: not_applicable
served_ui_validation_action: not_applicable
ui_data_mode: not_applicable
required_safety_gates: manifest compatibility、release identity、HOME isolation、Multica forbidden-path fingerprint
allowed_headless_only_until: task completion
stop_if_no_ui_by_phase: not_applicable

## 范围

- 完整实施 [implementation-plan.md](./implementation-plan.md) 的 Phase 1-7。
- 保持现有 Node、Python、Bash 标准库技术栈，不新增 npm 依赖。
- 用户可见变化包括更安全的 Atlas plugin 更新命令、严格诊断结果和明确的 Multica planned-deprecation 文档。

## 非目标

- 不修改、迁移、修复、重构、测试、bump、卸载或删除 Multica。
- 不实现 outcome metrics、task 新状态、自动清理、slug 修正或 `codex-workflow` 大规模模块化。
- 不批量迁移历史 implementation/business artifacts。

## 验收标准

| ID | Criterion | Required | Verification |
| --- | --- | --- | --- |
| AC-01 | Multica 仓库路径与运行态在所有 phase 前后完全不变 | yes | changed-path gate + runtime fingerprint |
| AC-02 | Manifest prompt 数量和长度满足 runtime，validator 与边界 fixture 一致 | yes | plugin validator + Phase 1 contract |
| AC-03 | Plugin tree 变化无法复用旧 version，同版异 tree 被拒绝 | yes | release identity fixtures |
| AC-04 | Dev channel 只写 local Atlas；release channel 只由 Codex CLI 写 snapshot/exact cache | yes | isolated dev/release integration tests |
| AC-05 | Stale snapshot、collision、downgrade、missing exact cache 在不可逆写入前失败 | yes | negative fixture matrix |
| AC-06 | `doctor --strict --json` 对关键安装态漂移输出完整 JSON 并退出非零 | yes | doctor contract tests |
| AC-07 | Repo contract hermetic，host-install checks 独立且普通 CI 可运行 | yes | temp HOME suites + GitHub Actions checks |
| AC-08 | 新 implementation contracts 通过 first-code/UI semantic strict lint，历史合同保持兼容 | yes | valid/invalid/v1 fixture matrix |
| AC-09 | Atlas BAF v2 dual-goal 状态、证据和 integration path 受到语义约束，v1 保持兼容 | yes | business artifact fixtures/lint |
| AC-10 | 项目约束、权威索引、相对链接和全分支回归 clean | yes | docs link test + contract-index lint + final native review |

## 真实验证计划

| Row | Target | Command or action | Expected result | Phase evidence |
| --- | --- | --- | --- | --- |
| V-01 | Manifest/release identity | `bash workflow/tests/contract_atlas_plugin_integrity.sh` | 正向通过、边界/碰撞负向失败 | `evidence/phase-1-conclusion.md` |
| V-02 | Dev/release layout | `bash workflow/tests/integration_atlas_plugin_layout.sh` | local-only、stale/collision/downgrade 行为符合合同 | `evidence/phase-2-conclusion.md` |
| V-03 | Strict doctor | `bash workflow/tests/contract_atlas_doctor.sh` | 完整 JSON 与退出码一致 | `evidence/phase-3-conclusion.md` |
| V-04 | Hermetic suites | `bash workflow/tests/contract_repo.sh` 与 `bash workflow/tests/contract_host_install.sh` | 不读取真实 HOME，诊断有标签 | `evidence/phase-4-conclusion.md` |
| V-05 | Implementation semantics | `bash workflow/tests/contract_implementation_contract.sh` | v1 新合同严格通过，历史合同兼容 | `evidence/phase-5-conclusion.md` |
| V-06 | BAF dual goal | `bash workflow/tests/contract_team_business_acceptance.sh` | v2 双目标约束和 v1 兼容均通过 | `evidence/phase-6-conclusion.md` |
| V-07 | Final integration | `bash workflow/tests/contract.sh` + docs/manifest/forbidden checks | 全量回归和 final native review clean | `evidence/phase-7-conclusion.md` |

## 边界与异常场景

| Case | Expected behavior | Required |
| --- | --- | --- |
| Snapshot commit 旧于 expected | `plugin add` 前失败，既有 cache 不变 | yes |
| 同 version、不同 tree | 失败并报告 collision | yes |
| `latest` 存在、exact version 缺失 | 失败，不 fallback | yes |
| 已安装版本新于 snapshot | 失败，不 downgrade | yes |
| 真实 HOME 含 stale cache | repo contract 仍然通过 | yes |
| 历史无 semantic version contract | non-strict 兼容并告警；不批量改写 | yes |
| Dual-goal 任一目标缺证据或路径不一致 | accepted/conditionally accepted 无效 | yes |

## 提交与发布身份

- Phase 0-7 各自保持可回退的 Conventional Commit 边界；Phase 2 可拆为 dev sync 与 release verifier 两个提交。
- 每个修改 `plugins/atlas-workflow/**` 的 release slice 都必须在内容稳定后最后更新 cachebuster。
- 不复用已发布 version；回退使用最后已知良好内容和新 version。

## 失败与停止条件

- Diff 或命令触及 `plugins/multica-sdlc/**`、`.agents/**` 或任一 Multica runtime 时立即停止。
- 隔离测试越界写入真实 HOME、私钥或固定用户目录时立即停止。
- 负向发布测试改变正式 release cache 时判定失败，不做原地修补。
- Hosted CI 无法固定 Codex CLI 时，真实 marketplace E2E 保留为发布前本地/self-hosted gate；不得把该限制扩散到 repo/layout fixtures。
- Semantic lint 若缺少版本门或要求破坏历史 artifacts，停止并回到合同评审。

## Provenance

- Based on: `20260710-002-atlas-forge` analysis、`20260710-003-atlas-forge` clarify/native team decision 和本 bundle 的 `implementation-plan.md`。
- Supersedes: 本 bundle 中仅用于规划的 authority 指向；不取代历史分析事实。
- Review history: [reviews/native-plan-review.md](./reviews/native-plan-review.md) 与 [team-decision.md](./team-decision.md)。

## Final Contract Cleanliness Gate

- [x] 这是最终确认要求的干净重写。
- [x] 未把已拒绝或延后项写成可执行范围。
- [x] 复核历史通过链接保留，不粘贴进合同正文。
- [x] 验收标准和验证行完整。
- [x] 每 phase 只保留精炼 conclusion，raw logs 不进入 Git。
- [x] 外部 CLI 与 Unicode 边界未知项已记录为验证门，而非假定通过。
