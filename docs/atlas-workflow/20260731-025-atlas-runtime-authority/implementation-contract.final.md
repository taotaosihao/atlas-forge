# Atlas 通用验证输出、发布认证分层与权威时间修复实施合同（外部 authority）

workflow_id: atlas-release-runtime-repair
task_id: 20260731-025-atlas-runtime-authority
title: Atlas 通用验证输出、发布认证分层与权威时间修复（外部 authority）
contract_status: final
current_authoritative_contract: ./implementation-contract.final.md
created: 2026-07-31
finalized: 2026-07-31
contract_semantics_version: 3
finding_scope_admission: controller_current_required_only
safe_fallback_authority: none
work_type: implementation
first_code_guard: required
first_code_not_applicable_reason:
product_ui_gate: not_applicable
product_ui_not_applicable_reason: 本任务只修改 headless Atlas workflow verification 和 admission runtime，不产生或改变任何用户可见 Web、GUI 或浏览器表面。

## Execution Plan

```atlas-execution-plan+json
{
  "schema_version": 1,
  "size_policy": {
    "policy_id": "atlas-slice-size-v2"
  },
  "slices": [
    {
      "slice_id": "atlas-release-runtime-repair",
      "objective": "建立不感知产品与发布语义的通用 controller-owned verification output 原语，在其上修复 Atlas 发布认证的多切片准入、typed-fact 消费分层与 runner 权威时间绑定，同时保持 terminal sweep、completion 三态派生和稳定输入 identity fail-closed 语义。",
      "depends_on": [],
      "keeper_outputs": [
        "runtime:release-slice-layering",
        "runtime:verification-created-at",
        "runtime:verification-controller-owned-outputs",
        "runtime:release-output-consumption"
      ],
      "owned_paths": [
        "workflow/bin/lib/codex-workflow/verification/runner.js",
        "workflow/bin/lib/codex-workflow/verification/identity.js",
        "workflow/bin/lib/codex-workflow/verification/required-gates.js",
        "workflow/bin/lib/codex-workflow/verification/release-certification.js",
        "workflow/tests/js/verification-runner.test.js",
        "workflow/tests/js/release-certification-layering-output.test.js",
        "workflow/tests/js/release-certification-runtime.test.js",
        "docs/atlas-workflow/20260731-025-atlas-runtime-authority/implementation-contract.final.md"
      ],
      "forbidden_paths": [
        "plugins/**",
        ".agents/**",
        "scripts/**",
        "test/fixtures/**",
        "workflow/templates/**",
        "workflow/bin/lib/codex-workflow/core/**",
        "workflow/bin/lib/codex-workflow/team/**"
      ],
      "acceptance_refs": [
        "AC-LAYER-1",
        "AC-TIME-1",
        "AC-OUTPUT-CORE",
        "AC-OUTPUT-RELEASE",
        "AC-COMPLETION-1",
        "AC-ISOLATION-1",
        "AC-SOURCE-REVIEW-1",
        "EC-PARTIAL-RELEASE-SWEEP",
        "EC-TIMESTAMP-SPOOF",
        "EC-OUTPUT-BOUNDARY",
        "EC-OUTPUT-ENV-SPOOF"
      ],
      "risk_class": "high",
      "failure_domain": "release-certification-admission-and-verification-runtime",
      "rollback_boundary": "一个只含四个 verification 生产文件、三个测试文件和本合同的 Conventional Commit；本 task 不刷新安装态，回滚只需 revert 该提交。",
      "estimate": {
        "estimated_changed_files": 8,
        "estimated_net_loc": 700,
        "target_p90_minutes": 120,
        "serial_dependency_depth": 0,
        "independent_vertical_count": 1
      },
      "budget": {
        "max_changed_files": 8,
        "max_loc": 850,
        "max_wall_clock_minutes": 240,
        "max_required_checks": 5
      },
      "checks": [
        {
          "check_id": "release-runtime-focused-tests",
          "gate_class": "unit",
          "command": "node --test workflow/tests/js/verification-runner.test.js workflow/tests/js/release-certification-layering-output.test.js workflow/tests/js/release-certification-runtime.test.js",
          "final_only": false,
          "cache_policy": "identity-bound"
        },
        {
          "check_id": "release-runtime-repo-contract",
          "gate_class": "contract",
          "command": "bash workflow/tests/contract_repo.sh",
          "final_only": false,
          "cache_policy": "identity-bound"
        },
        {
          "check_id": "release-runtime-host-install-contract",
          "gate_class": "contract",
          "command": "bash workflow/tests/contract_host_install.sh",
          "final_only": false,
          "cache_policy": "identity-bound"
        },
        {
          "check_id": "release-runtime-full-contract",
          "gate_class": "contract",
          "command": "bash workflow/tests/contract.sh",
          "final_only": false,
          "cache_policy": "identity-bound"
        },
        {
          "check_id": "release-runtime-diff-policy",
          "gate_class": "lint",
          "command": "git diff --check",
          "final_only": true,
          "cache_policy": "fresh-executed"
        }
      ]
    }
  ]
}
```

## Scope

- Goal：在 `/home/gewu/.codex` 之外、以 `a9a8330` 为 HEAD 的独立 worktree 中，建立不感知 Kivo、Profile、typed fact 或发布路径的通用 controller-owned verification output 原语；再由发布认证层消费该原语，恢复多 slice `product_release` 的合法执行次序，并让 release collector 获得与 receipt 完全相同的 controller-authoritative `createdAt`，而不破坏稳定输入或候选 snapshot。task022 仅提供问题复现和实现参考，不作为 task025 候选身份或 Review 结论的替代证据。
- Delivery classification：`non_product`。本合同交付的是本地 workflow/runtime 修复，不直接治理或认证一个外部产品候选；Kivo 的 `product_release` 认证继续由独立 task `20260731-011-kivo-web-ui-web` 管理。
- Non-goals：不让通用 runner/identity 层解释 Kivo、`web-ui-v1`、typed fact、Profile 或产品路径；不改变 Profile、adapter、fact schema、三态决定优先级、trusted producer、delivery authority、candidate atomicity、event store、Team ledger、plugin、skill、agent、marketplace、Multica 或 Kivo 产品事实；不把普通稳定输入放宽为可变文件；不刷新安装态、不恢复 Kivo task、不声明产品发布认证。
- Files or surfaces likely affected：仅 execution plan 中的八个 owned paths；当前基线 `a9a8330` 已包含 task `20260730-020` 交付的 `integrated-app-v1` 与发布认证行为，本任务必须保留这些行为且不得修改 plugin tree。
- User-visible behavior：无 UI 变化；可观察行为仅为任意 `verify` 可声明本轮 controller-owned canonical outputs，非 terminal release slice 正常接纳、terminal sweep 继续 fail closed，且 collector 可读取唯一权威时间。通用输出原语不对输出内容赋予发布或产品含义。

## First Code Slice Guard

- first_code_slice: Implement generic controller-owned verification outputs, release-specific output consumption/admission layering, and authoritative timestamp injection in `atlas-release-runtime-repair`.
- first_code_slice_kind: workflow
- first_code_owner: 一个 writable `atlas-sdd-implementer` 独占全部 owned paths；controller 只写 workflow artifacts，reviewer/verifier 只读。
- first_code_verification: `node --test workflow/tests/js/verification-runner.test.js workflow/tests/js/release-certification-layering-output.test.js workflow/tests/js/release-certification-runtime.test.js` 必须 fresh PASS，并包含三个缺陷在修复前会失败的正、负回归用例；既有 release runtime fixture 必须迁移为 child-generated output，不能保留 input-fact 兼容路径。五项 Gate 之后必须由只读 `atlas-sdd-phase-reviewer` 对 task025 实际八文件完整 diff 做一次 fresh 阻塞式源码 Review，不继承 task022 的 Review verdict。
- allowed_contract_gate_only_until: 本合同通过严格 new-authoring lint 和只读合同 Review；之后不得新增 gate-only、fixture-only 或 evidence-only slice。
- stop_if_no_code_by_phase: `atlas-release-runtime-repair` writable lane 结束时四个 production verification 文件没有产生合同内行为变化即停止，不以测试或文档冒充完成。
- gate_parallelization_or_deferral_plan: 不启用并行 writers；合同 lint 与 Review 在代码前串行完成，hermetic/full gates 在 focused tests 后运行；安装态 refresh 明确移交后续独立 authority。

## Product/UI Acceptance Gate

本任务没有用户可见界面，Product/UI gate 按顶层 `product_ui_not_applicable_reason` 不适用；不得用这一结论削弱 workflow runtime、host-install、source/install equality 或 Kivo 后续中文 Web 认证门禁。

## Acceptance Criteria

| ID | Criterion | Required | Verification | Authority |
|----|-----------|----------|--------------|-----------|
| AC-LAYER-1 | `contract.release` 存在但当前 brief 没有任何 `release_requirement` check 时，`requiredGateAdmission` 只验证当前 slice 自身 gates 和既有 delivery authority，不调用完整 Profile sweep；结果不含 `releaseDecision`。 | yes | `release-certification-layering-output.test.js` 构造两 slice 合同并证明 harness 可接纳、terminal 仍受完整 sweep 约束。 | goal:AC-LAYER-1 |
| AC-TIME-1 | `runVerification` 在 child spawn 前只生成一次规范化秒级 `createdAt`，覆盖注入同值 `ATLAS_VERIFICATION_CREATED_AT`，最终 receipt `created_at` 复用该值。 | yes | `verification-runner.test.js` 由 child 写出所见环境值，并与 identity record 精确比较。 | goal:AC-TIME-1 |
| AC-OUTPUT-CORE | 任意 verification 可重复使用显式 `--output <path>` 声明零个或多个 controller-owned outputs；通用 runner 在 spawn 前将每个路径解析为当前 task artifact 根内唯一 canonical target，要求 canonical parent 已存在且 target 尚不存在，并覆盖注入含同一绝对路径数组的 `ATLAS_VERIFICATION_OUTPUTS_JSON`。child 成功后，每个声明输出必须是 regular non-symlink file，runner 捕获 requested path、canonical path、mode、size 与 SHA-256 到 receipt `result.outputs`，并提供共享的 captured-output revalidation。outputs 参与 `record_id`，但稳定 inputs、worktree、toolchain 与环境仍按原 pre/post identity 比较。 | yes | `verification-runner.test.js` 真实执行普通非 release child 生成多个 outputs，证明内容寻址、record binding、inputs stability，以及重复、预存、越界、symlink parent/target、缺失、非 regular 或消费前漂移的 output fail closed。 | goal:AC-OUTPUT-CORE |
| AC-OUTPUT-RELEASE | 发布认证层只能把稳定 `identity.inputs` 与本轮内容寻址且在消费时重新验证未漂移的 `result.outputs` 合并用于 evidence lookup；每个 release receipt 恰有一个 typed fact，且该 fact 必须来自当前 `result.outputs` 并位于当前 task canonical `release/` 根。candidate manifest、raw collector input、candidate components 与 fact evidence 仍必须是稳定 inputs。通用 runner/identity 不包含 Kivo、Profile、typed fact 或发布路径知识；不存在接受预存 input fact 的兼容分支。 | yes | 新 layering/output test 与迁移后的 `release-certification-runtime.test.js` 证明 typed fact 仅来自本轮 output、其他材料仍为 stable inputs、release 根越界、output 漂移和零/多个 typed fact fail closed，同时保留 certified/denied/cannot_verify、同候选与 completion 权威回归。 | goal:AC-OUTPUT-RELEASE |
| AC-COMPLETION-1 | 含 release requirements 的 terminal slice 仍要求完整、同候选、fresh sweep；completion 仍独占 `certified`、`denied`、`cannot_verify` 的派生权。 | yes | layering 回归测试与 `contract_repo.sh`、`contract.sh`。 | goal:AC-COMPLETION-1 |
| AC-ISOLATION-1 | 所有修改来自位于 `/home/gewu/.codex` 之外、以当前已发布基线 `a9a8330` 为 HEAD 的隔离 worktree，forbidden paths 不变；实现保留该基线的 `integrated-app-v1` 行为，本 task 不改变安装态。 | yes | `git status --short`、`git diff --name-only a9a8330`、`release-certification-runtime.test.js` 集成回归、`contract_repo.sh` 与 `contract.sh` 的正式 required-gate 收据。 | goal:AC-ISOLATION-1 |
| AC-SOURCE-REVIEW-1 | task025 的实际八文件候选必须在五项 required checks 通过后接受一次 fresh、完整、只读源码 Review；reviewer 直接检查 task025 diff、测试与 Gate 证据，task022 的未提交候选、报告或 verdict 只作背景，不得替代本次 Review。 | yes | 一名 `atlas-sdd-phase-reviewer` 对 task025 full diff 做严重阻塞 Review，P0/P1、当前验收失败、认证根信任或隔离问题必须修复并复验。 | goal:AC-SOURCE-REVIEW-1 |

## Real Validation Plan

| Row | Target | Command or action | Expected result | Phase conclusion evidence |
|-----|--------|-------------------|-----------------|---------------------------|
| V-1 | 缺陷专项 | `node --test workflow/tests/js/verification-runner.test.js workflow/tests/js/release-certification-layering-output.test.js workflow/tests/js/release-certification-runtime.test.js` | 时间注入、伪值覆盖、通用多 output、release 消费分层、non-terminal layering、terminal fail-closed、既有 release 三态/completion 语义和 child-generated typed fact E2E 全部 PASS。 | 非 Git verification receipts 与 implementer report |
| V-2 | 仓库隔离合同 | `bash workflow/tests/contract_repo.sh` | 隔离 HOME/Codex/agent/Git 环境下 repo contract PASS。 | 非 Git verification receipt |
| V-3 | 安装布局合同 | `bash workflow/tests/contract_host_install.sh` | 临时 host layout、development sync、doctor 和 local cache contract PASS。 | 非 Git verification receipt |
| V-4 | 全量 workflow | `bash workflow/tests/contract.sh` | 全量 Atlas workflow contract PASS，Multica runtime 未被调用。 | 非 Git verification receipt |
| V-5 | Diff 与范围 | `git diff --check`、`git diff --name-only a9a8330` 与 budget 统计。 | 仅八个 owned paths，无 whitespace error，不超过 850 LOC。 | 非 Git verification receipt 与 controller checkpoint |
| V-6 | Fresh source Review | 对 task025 实际八文件完整 diff 与 V-1 至 V-5 证据运行一名只读 `atlas-sdd-phase-reviewer`。 | 不依赖 task022 verdict；无 P0/P1、当前验收失败、认证根信任或隔离 blocker。 | task025 review verdict 与 controller resolution（如有 finding） |

## Evidence Budget

- Git 中只保留本合同、四个 production verification 文件和三个必要测试文件，不创建证据目录或过程日记。
- Raw test logs、Team 消息、hash 明细、refresh 输出和 Kivo terminal evidence 留在 `~/.codex/workflow/artifacts/<task-id>/`，不加入 Git。
- 本 slice Git 文件上限 8 个、Atlas churn 上限 850 LOC；超出即停止并重切合同，不使用 size exception。

## Edge Cases

| Case | Expected behavior | Required | Admission |
|------|-------------------|----------|-----------|
| 调用方预置错误的 `ATLAS_VERIFICATION_CREATED_AT` | Runner 必须覆盖而不是信任该值；child 所见值与最终 receipt 相同。 | yes | goal:EC-TIMESTAMP-SPOOF |
| 当前 slice 只有部分或单个 `release_requirement` | 因该 slice 已进入 release sweep，Profile 缺项必须 fail closed；不得按非 terminal harness 放行。 | yes | goal:EC-PARTIAL-RELEASE-SWEEP |
| `--output` 重复、已存在、位于当前 task artifact 根之外、parent/target 穿越 symlink、child 未生成或生成非 regular file | 通用 runner 在记录成功 receipt 前 fail closed；不得覆盖旧文件、跟随间接路径或把 stdout/child 自述当作 output identity。发布层另外拒绝 task `release/` 根之外的 typed fact。 | yes | goal:EC-OUTPUT-BOUNDARY |
| 调用方预置伪造的 `ATLAS_VERIFICATION_OUTPUTS_JSON` | Runner 必须以 controller 声明的规范化绝对路径数组覆盖该值；未声明 output 时不得把调用方值传给 child。 | yes | goal:EC-OUTPUT-ENV-SPOOF |
| 普通 verification 不带 release requirement | 继续执行和记录；权威时间注入不得改变 exit code、stdout/stderr、snapshot stability、identity schema 或 `last_verified_at`。 | no | optional |
| 时间源返回无效日期 | 继续由 `timestampSeconds` 在 spawn 前抛错，collector 不启动且不写伪 receipt。 | no | optional |

## Implementation Notes

- Layering 判定以当前 brief 的 projected checks 是否含 `release_requirement` 为准，不用 slice 名、keeper 名或路径启发式判断 terminal 身份。
- `createdAt` 是 runner 内部 controller value；effective child environment 应以该值覆盖调用方同名键，但不得把环境全文或秘密持久化进 receipt。
- `--output` 是可重复的通用 controller CLI metadata，不要求 `release_requirement`，也不由 child 的 stdout 或环境自述声明。Runner 只知道当前 task artifact 根、规范路径、文件类型和内容 identity，不解释输出的业务含义。
- Runner 以保留环境键 `ATLAS_VERIFICATION_OUTPUTS_JSON` 覆盖注入 canonical absolute path JSON array；调用方不能仅靠环境变量声明输出。没有 `--output` 时删除调用方伪造的同名键。
- Output entries 放在 receipt `result.outputs`，参与最终 `record_id`；`snapshot_stable` 仍只比较 worktree、toolchain、环境 allowlist和 pre-existing stable inputs。Release evaluator 才把 outputs 加入内容寻址 evidence lookup，并要求 typed fact 来自本轮恰好一个 output；manifest、raw source、candidate components 和 fact evidence 仍来自 stable inputs。
- `result.outputs` 不是永久可信自述；release evaluator 每次消费都必须用共享 identity helper 重新确认 canonical regular non-symlink path、mode、size 与 SHA-256仍匹配 receipt，漂移后拒绝整个 sweep。
- 既有 `release-certification-runtime.test.js` 的 release fixture 必须迁移为 child 读取 controller output protocol 后本轮写 fact，并保留现有三态、trusted producer、同候选、completion 与 drift 断言；不得通过 production fallback 接受预存 input fact。
- Kivo harness 只消费通用 `ATLAS_VERIFICATION_OUTPUTS_JSON` 协议，在 Kivo 侧要求恰好一个路径并验证自己的 `release/facts` 边界；Atlas 通用层不得包含 Kivo 名称、路径、`web-ui-v1` 或产品规则。
- 不改变 `executionCompletionAdmission` 的跨 accepted slices 聚合和 release decision 派生逻辑。
- Plugin tree 完全不变，因此本任务不运行 `scripts/bump-plugin-cachebuster.sh atlas-workflow`。

## Failure And Stop Conditions

- Stop and ask the user when：修复必须修改 Profile/adapter/fact schema、plugin tree、delivery authority、event store、Team ledger、Multica 或 marketplace；若需要改变安装态或 Kivo 产品事实，则停止当前 task 并移交既有后续 authority，不在本合同中扩范围。
- Treat the task as failed when：non-terminal 放行跳过自身 gate/authority/candidate/dependency/keeper 检查；partial release sweep 被错误放行；时间只能靠猜测、回填或事后修改；输出无法在不放宽 stable inputs、candidate snapshot 或 content-addressing 的前提下捕获；任一 required check 或 severe-blocker Review 失败且无法在 owned paths 内修复。
- Required safe fallback: not_applicable
- Optional fallback notes：保持当前安装态；本 task 的代码回滚只允许 revert 单一 Conventional Commit，不手工改 cache/runtime 文件。

## Provenance

- Based on：Kivo task `20260731-011-kivo-web-ui-web` 的可复现 admission/timestamp 阻塞；task `20260731-022-atlas-runtime-a9a8330-replan` 提供的问题复现、实现参考和 Review 关注点；该 task 因 worktree 位于 protected-HOME 前缀而无法生成规范 repo/full required-gate 收据。task025 在外部 worktree 重建 authority，并对自己的完整候选重新执行 Gate 与阻塞式源码 Review，不继承 task022 的候选身份或 verdict。
- Supersedes：不取代 task `20260730-020-atlas-release-certification`；其已进入 `a9a8330` 的 `integrated-app-v1` 与发布认证行为作为当前稳定基线保留。
- Review history：合同必须先经一名只读 `atlas-sdd-reviewer` 审查实施充分性、准入绕过、候选身份和时间根信任，再进入 execute；实现和五项 Gate 完成后，task025 完整候选必须重新接受一名只读 `atlas-sdd-phase-reviewer` 的阻塞式源码 Review。

## Finding Provenance

本合同没有从 reviewer prose 预先提升的 executable finding；后续 Review 发现由 controller resolution 决定是否成为 `current-required`。

| Finding ID | Disposition | Source | Follow-up |
|------------|-------------|--------|-----------|
| atlas-release-integrated-baseline | informational | Atlas Forge `a9a8330` 已发布基线 | 保留 task `20260730-020` 已交付的 `integrated-app-v1` 行为；本任务只修改 execution plan 拥有的 workflow verification/runtime 路径。 |

## Final Contract Cleanliness Gate

- [x] 这是当前授权与已确认运行时缺陷的干净实施合同。
- [x] 没有保留被拒绝或已替代的 executable requirement。
- [x] Review 结论只在 provenance 中引用，不复制到正文。
- [x] Required acceptance 与 validation rows 完整且可执行。
- [x] 每个 required row 都使用 canonical brief 可验证的 `goal:<ref>`。
- [x] Informational finding 不进入 executable acceptance。
- [x] Git evidence 在预算内；raw logs 留在 workflow artifacts。
- [x] 当前残留风险仅是 source/install refresh 与 Kivo 后续真实认证事实，均有明确 Gate。
