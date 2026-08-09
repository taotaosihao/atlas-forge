# Atlas Clarify 与 Team 有界并行默认策略实施方案

- 状态：已实施并完成独立复审与源码级门禁；未安装、刷新或发布
- 日期：2026-08-09
- 工作类型：implementation
- 交付目标：product_increment
- 权威范围：`$atlas-workflow:clarify` 与已选择 `$atlas-workflow:team` 后的 controller 默认调度策略、对应用户说明、模板和合同测试
- 不授权：把普通 Task/CW 全局改为默认 Team；新增 runtime scheduler、ledger/schema 状态；刷新安装态/cache/marketplace/runtime；push、部署、发布；修改或运行 Multica

## 1. 目标

### CLARIFY-PARALLEL

非 tiny Clarify 默认由 main Codex 与至少一个只读 child agent 协作；存在两个以上独立、已就绪、非重复且有明确消费者的未知簇时，controller 默认并行派发。

### TEAM-PARALLEL

Team 一旦被选择，不再以 main-first 串行探索作为默认；controller 默认并行执行当前 ready frontier 中已 admission 的安全独立 lane。

### SAFE-EFFICIENCY

最大化有效、安全的关键路径并行度，而不是 agent 数。重复工作、未就绪依赖、重叠写入、无消费者输出和不可用 exact route 不占并发。

### COMPATIBILITY

保留现有 exact model routing、Paseo/DeepSeek 例外、single-writer/lease、fallback/quiescence、record-only compatibility 和 product release certification 全部边界。

## 2. 非目标

1. 普通 `$atlas-workflow:task`、`$atlas-workflow:cw` 不因多文件、复杂度或行为变化自动升级 Team。
2. 不新增 `parallel_required`、`frontier_status` 或其他 ledger/schema 字段。
3. 不实现读取 execution plan 并自动创建 actor 的 runtime scheduler、daemon 或 Team-independent lease runtime。
4. 不让 `team-record-finalize` 因 zero-dispatch 失败，不废弃 `effective_backend=none` 和 record-only compatibility。
5. 不改变 agent profiles、默认 saving matrix、显式 quality mode、root host model/provider 或 Claude manual-only gate。
6. 不默认双派 Luna 与 DeepSeek，不通过 native `spawn_agent` 派发 DeepSeek。
7. 不修改 release Profile、adapter、fact schema、receipt 或 `release_decision` authority。
8. 不刷新真实 plugin cache、marketplace、workflow runtime 或 agent runtime，不修改或运行 Multica。

## 3. Tiny 与 lane admission

Tiny 指一个精确目标、一个 owner、一个主要证据域、一个验证路径，并且没有独立的安全、数据、权限、兼容、迁移或发布未知项。判断不清时按 non-tiny 处理。

每个候选 lane 必须具有：

- 已冻结 Goal 或 controller-admitted `current-required` 引用；
- 明确的输出消费者；
- 已就绪输入；
- 只读 evidence domain，或明确 owned/forbidden paths；
- 结构化 expected output；
- authority 与 stop condition；
- 能降低关键路径时间或具名风险的理由。

不 admission：

- 与另一个 lane 的问题、路径、证据源和消费者实质重复；
- 依赖尚未 ready；
- 输出没有当前消费者；
- exact spawn schema、profile、model、reasoning 或 backend route 不可用；
- writer ownership、lease 或 quiescence 不确定；
- 已确认成本异常；
- 仅为了角色齐全、模型多样性、Saving Mode 或表面并行而创建。

## 4. Controller 默认调度

首版采用 controller policy，而不是 runtime invariant。Team 的 wave 公式为：

```text
child_count = min(ready_independent_lanes, host_available_child_slots, 4)
```

Clarify 使用独立的更窄公式：

```text
child_count = min(ready_independent_clusters, host_available_child_slots, 3)
```

`4` 与 `3` 都是对应 flow 的自动 wave 软上限，不是完成或停止条件。当前 wave 综合后重新计算 frontier；仍有 ready lane 时继续下一 wave。Team 在用户显式要求更宽并行或已授权 execution plan 具有更宽 frontier 时可以扩大，但不得降低 writer、routing、authority 或 release gate；Clarify 保持 `3`，Team 的 `4` 不得反向扩大 Clarify wave。

这是 controller 的默认调度策略，不是 Team v2 ledger/helper 强制执行的 runtime invariant。`effective_backend=none` 继续表示没有 admitted dispatch 的合法 record-only compatibility 状态，但不能作为“已完成多 agent 并行”的证据。

## 5. Clarify 默认行为

1. main Codex 先冻结最小 Goal、non-goals、authority 和 acceptance 草案。
2. 非 tiny Clarify 默认启动至少一个只读 child lane，同时 main 编写 canonical scope outline。
3. 存在两个以上独立 ready 未知簇时默认并行；首波最多三个 child lane。
4. brownfield topology、risk/authority challenge、verification design、hard-to-reverse decision 和 UI/browser acceptance 是候选职责，不是固定角色表。
5. child agent 不得写 canonical scope、workflow artifacts 或项目文档，不得把 discovery 直接升级为 Goal。
6. main Codex 是唯一 scope 裁决者、canonical writer、冲突综合者和最终验收 owner。
7. 冲突按证据核验，不按多数投票；丢失一个视角必须披露，不能伪装为双重审查完成。
8. 普通 Clarify fan-out 不自动创建 workflow task、Team ledger 或 staffing artifact。

## 6. Team 默认行为

1. Team 被选择后，controller 先构造依赖与 ownership，再调度当前 ready frontier。
2. 至少一个有效 child lane 时，child 与 main integration 工作并行。
3. 当前 frontier 有两个以上 admitted、独立且 ready 的 lane 时默认同波并发。
4. reviewer/verifier 的输入未 ready 时不提前启动；依赖完成后进入下一 frontier。
5. 同一问题的重复 lane 合并；只有用户明确要求双视角或具名高风险需要独立交叉验证时，才允许同输入双派。
6. main Codex 始终保留 integration owner、controller authority 与最终验收责任。

### 写入边界

| 场景 | 默认行为 |
| --- | --- |
| 紧耦合实现或共享核心文件 | 一个 writer |
| 真正独立且 owned paths 不相交 | 明确 integration owner 和适用 lease 后可并行 writer |
| 普通 product increment 且无可靠 lease/quiescence 边界 | 一个 writer；只读探索和验证规划可并行 |
| fallback/takeover | 前任 quiesced、diff/untracked evidence 已保留后才能接管 |
| writer 状态未知 | 停止新 writer |
| 同一 writable packet 给 Luna 与 DeepSeek | 禁止 |
| product release | 保持 execution-v3、semantics v4、immutable Profile 和唯一 terminal sweep |

## 7. 模型与 backend 不变量

- native roles 继续使用当前 checked-in saving matrix，并显式设置 `fork_turns="none"`。
- DeepSeek Flash implementation/exploration 只经 Paseo direct `deepseek/deepseek-v4-flash:deepseek`、thinking `max`；不通过 native `spawn_agent`。
- 非 DeepSeek Paseo 继续要求用户或 operator 的范围化显式选择。
- quality mode 仅在用户明确要求时启用，不因并行默认自动切换全 Sol。
- schema-restricted、profile mismatch、reserved schema mismatch 和 confirmed cost anomaly 继续 fail closed；不能用 generic/inherited child 补位。

## 8. 实施路径所有权

### Policy writer

- `plugins/atlas-workflow/skills/clarify/SKILL.md`
- `plugins/atlas-workflow/skills/team/SKILL.md`
- `plugins/atlas-workflow/skills/task/SKILL.md`
- `plugins/atlas-workflow/README.md`
- `plugins/atlas-workflow/.codex-plugin/plugin.json`

### Contract-test writer

- `workflow/templates/team-staffing.md`
- `workflow/tests/contract_team_cost_routing.sh`
- `workflow/tests/contract_clarify_parallel_routing.sh`
- `workflow/tests/contract.sh`

### Integration owner

main Codex 独占本方案、`docs/README.md`、最终整合、review finding admission、最后 cachebuster、staging 和 commit。两个 writer 完成并 quiesced 前，integration owner 不修改它们的 owned paths。

## 9. 验收标准

1. 非 tiny Clarify 明确默认使用 main + 至少一个 child agent。
2. Clarify 存在两个以上独立 ready 未知簇时明确默认并行。
3. Team 对当前 admitted ready frontier 明确默认有界并行，不再 main-first。
4. tiny、单 lane、重复 lane 和 dependency-not-ready 不制造虚假 fan-out。
5. lane 具有 Goal、消费者、authority、输入、输出和 stop condition。
6. main 是唯一 canonical scope/artifact writer 和最终 synthesizer。
7. agent findings 不得自动扩大 Goal。
8. 紧耦合实现保持单 writer；多 writer 仅在 disjoint paths、integration owner 和 lease/quiescence 成立时并行。
9. 不默认 Luna/DeepSeek 双派，不自动启用 quality mode。
10. schema-restricted/profile mismatch/cost anomaly 保持 fail closed。
11. record-only Team v2 与 `effective_backend=none` 继续合法，但不再被描述为多 agent 成功证据。
12. product release 的 semantics v4、immutable Profile、execution-plan v2、同候选唯一 terminal certification slice 与 completion-derived decision authority 不变。
13. README、manifest prompt、Task、Clarify、Team、模板和测试没有默认语义冲突。
14. Multica hard fingerprint 不变，未发生安装、cache/runtime 刷新、push、部署或发布。

## 10. 验证计划

专项 policy 与兼容合同：

```bash
bash workflow/tests/contract_clarify_parallel_routing.sh
bash workflow/tests/contract_team_cost_routing.sh
bash workflow/tests/contract_agent_model_policy.sh
bash workflow/tests/contract_agent_model_catalog.sh
bash workflow/tests/contract_team_review.sh
bash workflow/tests/contract_implementation_contract.sh
```

`workflow/tests/contract_team_native.sh` 是由 `contract.sh` source 的合同片段，
通过 hermetic `contract_repo.sh` / 最终 `contract.sh` 覆盖，不单独执行。

Plugin 与仓库验证：

```bash
/usr/bin/python3 /home/gewu/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/atlas-workflow
workflow/bin/atlas-plugin-integrity manifest --plugin-root plugins/atlas-workflow
bash workflow/tests/contract_repo.sh
scripts/check-relative-markdown-links.py --root .
git diff --check
```

最终集成：

```bash
bash workflow/tests/contract.sh
```

只读核对 forbidden paths 与 Multica hard fingerprints；不运行 Multica tests、router、listener、legacy host 或 runtime。

若本次作为 Atlas plugin release slice，内容和 reviewer 结论冻结后最后运行 `scripts/bump-plugin-cachebuster.sh atlas-workflow`。此后不得再修改 `plugins/atlas-workflow/**`；若必须修改，重新 review 并生成新版本。仍不执行真实 marketplace/cache/runtime refresh。

## 11. Stop conditions

- 用户目标扩展为所有 Task/CW 默认 Team；
- 需要新增 runtime scheduler、schema 或 durable Team-independent lease 服务；
- writer ownership、lease、quiescence 或外部共享 workspace actor 状态不确定；
- exact native/Paseo route 无法满足已选择 lane 且没有已批准的安全 fallback；
- 需要弱化 release decision authority、Profile 或 terminal sweep；
- 需要安装、cache/runtime refresh、push、部署、发布或 Multica 修改；
- 必须覆盖或纳入已有未跟踪用户工作。
