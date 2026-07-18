# Atlas 业务验收中文阅读层最终实施合同

workflow_id: 20260718-004-atlas
task_id: 20260718-004-atlas
title: Atlas 业务验收中文阅读层
contract_status: final
current_authoritative_contract: ./implementation-contract.final.md
contract_semantics_version: 1
work_type: implementation
created: 2026-07-18
finalized: 2026-07-18
last_revised: 2026-07-18
revision_workflow_id: 20260718-007-atlas
review_source_workflow_id: 20260718-006-atlas-team-review

first_code_guard: required
first_code_not_applicable_reason:
first_code_slice: 新增 `plugins/atlas-workflow/scripts/codex-team-business-report`，复用现有 strict business artifact lint，从一个有效 standard accepted v2 bundle 确定性输出含四问人工审查摘要的中文 Markdown 到 stdout
first_code_slice_kind: cli
first_code_owner: 单一 Atlas workflow implementer
first_code_verification: `bash workflow/tests/contract_team_business_acceptance.sh`
allowed_contract_gate_only_until: 本合同批准；Phase 1 的首个 keeper diff 必须包含可执行 renderer 行为
stop_if_no_code_by_phase: Phase 1
gate_parallelization_or_deferral_plan: 模板和文档可在 renderer 行为成立后同一逻辑切片完成；完整 stale、presentation、release identity 和全量回归在 Phase 2-3 收敛

product_ui_gate: not_applicable
product_ui_not_applicable_reason: 本任务提供 headless CLI 和生成的 Markdown 阅读物，不提供浏览器、GUI、Dashboard 或 served application
first_operable_user_flow: not_applicable
browser_entrypoint: not_applicable
served_ui_validation_action: not_applicable
ui_data_mode: not_applicable
required_safety_gates: strict BAF v2 artifact lint、renderer 专项测试、plugin integrity、repo/full contract、Multica forbidden-path check
allowed_headless_only_until: task completion
stop_if_no_ui_by_phase: not_applicable

## 验收前先看四件事

从底层看，验收只是在回答四个问题：想达到什么、材料记录了什么、两者是否一致、剩余差距由谁判断是否可接受。

- **要确认什么**：业务验收不是检查“文件有没有交齐”，而是确认约定业务目标在约定范围内是否达到，以及还有什么没有完成。
- **事实从哪里来**：结论只来自验收结论中记录的判断、场景定义、实际结果、环境记录、验收材料和未解决事项。中文报告不创造新事实，只把同一批记录换成容易审查的表达。
- **为什么是这个结论**：系统不重新决定通过或不通过，只核对记录结构和合同明确要求的关系，再把已登记判断、实际结果和剩余问题放到一起解释。记录检查通过，不代表每项材料都支持业务结论，也不代表业务已经同意。
- **人工还要判断什么**：自动检查不核实材料内容；证据提供方负责材料真实性，业务负责人判断目标、范围和剩余风险是否可接受，发布批准另行进行。

## 范围

### 目标

在不改变 BAF v2 machine semantics 的前提下，新增一个可重复验证的中文业务阅读层，使业务人员无需理解 Goal A/B、`evidence_refs`、`integration_path_id`、schema 枚举或命令日志，也能准确判断：

- 本次验收覆盖什么；
- 当前结论属于通过、有条件、失败还是无法验收；
- 基础质量与安全检查是否具备业务验收资格；
- 使用真实环境、批准模拟环境、测试模拟、合成数据还是尚未执行；
- 外部系统/设备链路和业务人员实际操作是否分别闭环；
- 哪些登记材料支持判断，材料不覆盖什么；
- 当前阻断、后续事项和偏差是什么；
- 交付流程是否已重新检查本报告与当前 JSON bundle 一致并具备业务交付完整性。
- 人工审查者能否先用四个通俗问题理解验收原理，再进入场景和证据细节。

### 用户可见行为

- `business-acceptance-report.md` 成为自动生成的唯一业务主入口。
- 报告首屏使用固定中文结论、范围、技术资格和环境表达。
- 一句话结论之后固定提供“验收前先看四件事”，回答目的、事实来源、结论形成方式和人工责任边界。
- conditional 条件信息不足时，“不可作为完整签署依据”必须在任何正向状态和四问摘要之前显示。
- dual-goal 以“外部系统或设备链路”“业务人员实际操作”两个中文区块呈现，各自列出独立证据。
- blocked 和 rejected 仍生成报告并清楚解释原因。
- conditional 缺少签署所需信息时，报告可阅读但明确标记为不可作为完整签署依据。
- 原始字段、枚举、ID、路径、score、failed gates 和 source digest 只出现在技术附录或不可见生成元数据中。

## 非目标

- 不修改 `plugins/atlas-workflow/contracts/team-sdd/business-*.schema.json`。
- 不修改 `plugins/atlas-workflow/contracts/team-sdd/validators/business-*.js` 的现有语义。
- 不重定义 accepted、conditionally accepted、rejected 或 blocked 的 machine legality。
- 不新增 `business-summary`、`conditions`、签署、production-readiness 或 evidence-attestation schema。
- 不从 Markdown playback、日志、命令输出或自由文本推断新业务事实。
- 不自动翻译自由文本，不引入 NLP、模板引擎、npm 包、TypeScript 或 build step。
- 不联网读取 external evidence，不探测 URL 可达性，不执行 evidence 内容。
- 不实现 Web UI、Dashboard、电子签署、多语言系统或正式审批流。
- 不批量迁移或重写历史 v1/v2 artifact 和历史生成报告。
- 不刷新真实 Atlas cache、marketplace snapshot、workflow runtime 或 agent runtime。
- 不修改、运行、测试、同步、bump、迁移或删除 Multica。

## 权威与不变量

1. 完整 BAF JSON/JSONL bundle 是验收事实源；生成 Markdown 不存储独立 verdict 或签署状态。
2. renderer 生成前必须复用 `codex-team-artifact-lint` 的 `strict: true` 和 `businessAcceptance: true` 结果；不复制 schema/validator 或跨文件 closure 逻辑。
3. 现有 `codex-team-artifact-lint` CLI 的参数、stdout、stderr、exit code 和普通 SDD 行为保持兼容。
4. machine lint 只证明结构、引用、状态、路径和证据身份；报告不得声称机器已经鉴定现场真实性。
5. 业务验收不是生产发布批准；报告固定说明其不证明生产就绪。
6. 生成目标固定在当前 task 的 `team/acceptance/business-acceptance-report.md`，不接受调用者提供任意写入路径。
7. 实施合同自身和生成报告都必须先用通俗语言解释底层原理；该摘要不能引入第二套事实、重新计算 verdict 或替代人工判断。

## 目标架构

```text
strict BAF v2 JSON bundle
  -> existing codex-team-artifact-lint exported function
  -> canonical bundle loader
  -> source/evidence digest
  -> deterministic Chinese renderer
  -> stdout | atomic --write | byte-for-byte --check
  -> optional --check --presentation-strict
```

实现保持 CommonJS、`"use strict"`、Node 标准库和 extensionless executable 风格。新增 CLI 可以直接包含 loader、digest、render、check 和 policy 函数；本 MVP 不为单一命令创建新的通用 framework。

## CLI 合同

### 命令

```text
codex-team-business-report --task <task-id>
codex-team-business-report --task <task-id> --write
codex-team-business-report --task <task-id> --check
codex-team-business-report --task <task-id> --check --presentation-strict
codex-team-business-report --help
```

### 参数规则

- `--task` 必填且必须满足现有 safe ID 规则。
- 无 mode flag：把完整 Markdown 输出到 stdout，不写文件。
- `--write`：原子写入固定目标，并输出 `business_report_written: <canonical-path>`。
- `--check`：重新渲染并检查已保存报告，成功输出 `business_report_check: true`。
- `--write` 与 `--check` 互斥。
- `--presentation-strict` 只允许与 `--check` 组合。
- 不新增 `--output`、任意 source path、网络或自动修复参数。

### Exit code

| Code | 含义 |
| --- | --- |
| 0 | render/write/check 成功；允许输出非阻断 warning |
| 1 | bundle、报告一致性或 presentation policy 失败 |
| 2 | CLI 用法、不可安全读取/写入或内部错误 |

默认 render 的 stdout 只能包含 Markdown；diagnostic 写 stderr，便于 pipe 和 golden test。

## 现有 artifact lint 的最小复用改造

`plugins/atlas-workflow/scripts/codex-team-artifact-lint` 只允许以下结构调整：

```js
if (require.main === module) main();
module.exports = { lint, workflowRoot };
```

- 现有 CLI 的 `main()`、usage、参数、diagnostic 和成功输出不变。
- renderer 直接调用 exported `lint({ task, strict: true, businessAcceptance: true })`。
- lint errors 阻止任何正向 render/write；warnings 原样转成有前缀的 stderr warning。
- 不让 artifact lint 反向依赖 renderer，避免循环依赖。

## 输入 bundle

renderer 只支持 strict BAF v2，并在当前 workflow root 的 canonical task 目录读取：

```text
team/acceptance/business-intent.json
team/acceptance/scenarios/business-scenario-card.*.json
team/acceptance/business-evidence-map.json              # 合同允许缺失时保持缺失
team/acceptance/business-acceptance-report.json          # 合同允许缺失时保持缺失
team/acceptance/business-verdict.json
team/acceptance/business-deviation-log.jsonl             # 可选
business-evidence-map.json 引用的 local evidence files   # 存在时纳入 digest
```

- historical v1 继续使用既有非 strict lint，不由新 renderer 生成报告。
- mixed v1/v2、task mismatch、missing scenario、invalid evidence 或 strict lint failure 直接失败。
- renderer 不解析 `business-playback.md`、`business-verdict.md` 或其他手写 Markdown 作为事实。
- external/manual evidence 不联网获取；其 URI、description、result 和 source type 已由 JSON 内容进入 source digest。

## Source digest 与生成身份

### Digest 输入

- 固定 `report_format_version: 1`。
- 所有参与渲染的 JSON/JSONL 文件，以 artifact-relative POSIX path 排序，记录 path 与文件内容 SHA-256。
- evidence map 引用的每个 local canonical regular file，以 artifact-relative POSIX path 排序，记录 path 与文件内容 SHA-256。
- 不包含绝对 workflow root、生成时间、mtime、inode 或目标 Markdown，因此相同内容在不同 canonical root 仍产生相同输出。

### 生成元数据

Markdown 顶部包含不可见 HTML comment：

```text
generated_by: codex-team-business-report
report_format_version: 1
task_id: <task-id>
source_digest: sha256:<64-lowercase-hex>
do_not_edit: true
```

- 元数据不属于业务可见术语扫描范围。
- 报告不写当前时间，保证相同输入逐字节相同。
- local evidence 内容变化必须改变 digest；external/manual 内容真实性不在本工具能力范围。

## 安全读写

- 所有输入必须在现有 artifact lint 通过后读取。
- 已存在的目标必须是 canonical regular non-symlink file；目录、symlink 或逃逸路径失败。
- `--write` 在 acceptance 目录内使用唯一临时文件、完整写入后原子 rename；失败时只清理由本次命令创建的临时文件。
- 不删除、覆盖或移动 JSON、evidence、其他 Markdown 或目录。
- 动态文本统一转义 Markdown table、link label 和 HTML 控制字符；换行规范化，不允许输入注入新的 heading、HTML 或 link target。
- local link 转成从报告到 evidence 的规范相对路径；external 使用校验后的 credential-free HTTP(S) URL；manual evidence 显示为不可点击的人工材料引用。

## 业务摘要 view-model

renderer 必须先从已校验 bundle 构造以下只读 view-model，再生成任何中文摘要。字段来源和缺失语义唯一确定：

| View-model field | 唯一来源 | 值与缺失语义 |
| --- | --- | --- |
| `verdict_value` | `verdict.verdict` | v2 总判断枚举；renderer 只映射，不重新决定 |
| `technical_gate_status` | `verdict.technical_gate_status` | v2 技术状态枚举；renderer 只映射 |
| `business_acceptance_status` | `verdict.business_acceptance_status` | v2 业务状态枚举；renderer 只映射 |
| `scenario_card_count` | 已加载的 scenario card 数组长度 | 非空整数；strict bundle 至少为 1 |
| `scenario_result_count` | `acceptanceReport.scenario_results.length` | report 缺失为 `null`；文件存在且数组为空才是 `0` |
| `scenario_result_alignment` | scenario card ID 集合与 `scenario_results[]` | report 缺失时为 `null`；存在时记录 `complete`、`matched_business_status_counts`、`ghost_result_record_count`、`duplicate_result_id_count` 和 `missing_scenario_id_count` |
| `business_failure_signal_relation` | `business_acceptance_status` 与 alignment complete 时的 `matched_business_status_counts.failed` | `unknown`、`consistent_failed`、`scenario_failed_status_not_failed`、`status_failed_without_scenario_failure` 或 `no_explicit_scenario_failure`；只比较已登记失败信号，不重算总状态 |
| `evidence_entry_count` | `evidenceMap.evidence_refs.length` | map 缺失为 `null`；文件存在且数组为空才是 `0` |
| `unknown_evidence_result_count` | evidence map 中 renderer 不认识的 result 值 | map 缺失为 `null`；存在时按条目计数，只用于展示完整性检查 |
| `verdict_blocker_count` | `verdict.blockers.length` | v2 必为整数，不与其他来源合并 |
| `verdict_followup_count` | `verdict.required_followups.length` | v2 必为整数，不从自由文本补写 |
| `report_open_deviation_count` | `acceptanceReport.open_deviations.length` | report 缺失为 `null`；存在时按原数组计数 |
| `deviation_log_open_count` | deviation log 中 `status: open` 的记录数 | log 缺失为 `null`；存在时按记录计数 |
| `deviation_log_accepted_risk_count` | deviation log 中 `status: accepted_risk` 的记录数 | log 缺失为 `null`；存在时按记录计数 |
| `deviation_log_open_severity_counts` | deviation log 中 `status: open` 的 `severity` | log 缺失为 `null`；存在时为 P0/P1/P2/P3 各自计数 |
| `deviation_log_accepted_risk_severity_counts` | deviation log 中 `status: accepted_risk` 的 `severity` | log 缺失为 `null`；存在时为 P0/P1/P2/P3 各自计数 |
| `deviation_log_high_attention_severity` | 上述两组 severity counts | log 缺失为 `null`；任一 open/accepted-risk 为 P0 时取 `P0`，否则任一为 P1 时取 `P1`，否则取 `none` |
| `remaining_items_state` | 上述五类剩余事项计数 | `present`、`none_registered` 或 `source_missing`；只归纳是否需要关注，不生成问题总数 |
| `environment_relation` | closure mode 以及 dual-goal 两侧的 mode/path | standard 为 `unavailable`；dual 先分 `both_not_run`、`one_not_run`，仅两侧都已执行时再分 `same_mode_same_path`、`same_mode_different_path`、`different_mode_same_path` 或 `different_mode_different_path` |
| `conditional_warning_kind` | verdict 与 `required_followups.length` | 非 conditional 为 `none`；conditional 为 `condition_missing` 或 `responsibility_metadata_missing` |

- `null` 固定表达为“未登记”，绝不能渲染成 `0`；`0` 只表示对应文件存在且明确记录为空。
- 不在 renderer 中对 scenario result、evidence、deviation 或 risk 跨来源去重、补全或推断机器闭环。
- `matched_business_status_counts` 的四个键固定为 `passed`、`failed`、`blocked`、`not_run`，唯一读取 `scenario_results[].business_result`；不得读取或混入 `technical_gate_result`。它只统计 `scenario_id` 在场景定义中存在且在实际结果中恰好出现一次的记录。
- alignment 计数单位固定：`ghost_result_record_count` 是 `scenario_id` 不在场景定义集合中的**结果记录条数**；`duplicate_result_id_count` 是结果中出现次数大于 1 的**不同 scenario ID 数**；`missing_scenario_id_count` 是在结果中出现次数为 0 的**不同场景定义 ID 数**。重复 ghost ID 同时贡献 ghost 记录数和 duplicate ID 数。report 存在且三者全为 0 时 `complete: true`，否则为 `false`；report 缺失时整个 alignment 为 `null`。这只是展示层对应关系归纳，不改变 machine verdict。
- `business_failure_signal_relation` 仅在 report 存在且 alignment complete 时比较失败信号：场景与总业务状态都显示失败为 `consistent_failed`；场景有明确失败但总状态不是 failed 为 `scenario_failed_status_not_failed`；总状态为 failed 但场景没有明确失败为 `status_failed_without_scenario_failure`；两侧都没有失败信号为 `no_explicit_scenario_failure`；其他情况为 `unknown`。
- `evidence_entry_count` 只称为“材料登记条目数”；详细章节固定说明“数量不代表真实性、充分性或与业务结论的完整对应”。
- blockers、followups、report open deviations、deviation-log open 和 accepted risk 分来源表达，不生成一个虚假的“剩余问题总数”。
- `accepted_risk` 只表述为“记录状态标记为已接受的风险”，固定说明其级别与状态都只是登记值，不代表正式签署或发布批准。
- `remaining_items_state` 的推导顺序固定：任一已知计数大于 0 为 `present`；否则 report 或 deviation log 任一缺失为 `source_missing`；其余为 `none_registered`。它不掩盖五类来源的独立明细。

### 环境摘要

环境摘要只转述记录，不鉴定现场真实性。四问中使用短句，完整差异说明在“两个闭环”正文显示：

- standard closure 固定写：“本报告无法从可核对的验收记录中确认本次验证环境，因此不判断使用了哪种环境，也不推断真实环境或生产可用。”
- dual-goal 两侧都为 not-run/null 时优先进入 `both_not_run`，四问写“两类闭环都尚未执行，当前无法比较集成链路”，正文固定写：“两类闭环都尚未执行，当前没有可用于判断是否同一集成链路的记录。”禁止出现“使用同一条已登记集成链路”等肯定结论。
- dual-goal 只有一侧为 not-run/null 时优先进入 `one_not_run`，四问写“至少一类闭环尚未执行，当前无法比较集成链路”，正文固定写：“至少一类闭环尚未执行，当前不能比较两类闭环是否使用同一集成链路。”禁止出现肯定的同链路结论。
- dual-goal 两侧都不是 not-run，且两个 path 都为非空合法 ID 并相等、mode 也相同时，才进入 `same_mode_same_path`；四问写“两类闭环登记为同一环境类型和同一集成链路”，正文写“两类闭环的环境记录均为 `<模式中文表达>`，并使用同一条已登记集成链路”。
- dual-goal mode 相同、path 不同时，四问写“两类闭环环境类型相同但集成链路不同”，正文在分别显示两侧环境后固定写：“两类闭环记录的环境类型相同，但使用的集成链路不同，不能视为同一条端到端业务链路。”
- dual-goal mode 不同、path 相同时，四问写“两类闭环环境类型不同”，正文在分别显示两侧环境后固定写：“两类闭环记录的环境类型不同，不能把一侧的环境结论用于另一侧；即使链路标识相同，也不能据此认定端到端闭环完成。”
- dual-goal mode 与 path 都不同时，四问写“两类闭环环境类型和集成链路均不同”，正文在分别显示两侧环境后固定写：“两类闭环记录的环境类型和集成链路都不同，不能视为同一条端到端业务链路。”
- approved simulator 的中文表达固定包含：“本报告未核实批准人、批准范围和有效期。”
- 不把 real、simulator、mock、synthetic 或 not-run 中任一侧外推到另一侧，也不从环境记录推导生产就绪。

### 结论原因摘要

`reason_summary` 不用 verdict 自身证明 verdict，而是按已登记状态生成固定因果说明：

| Verdict branch | 固定规则 |
| --- | --- |
| accepted | strict lint 已保证技术状态、业务状态和全部场景结果为 passed；写“基础检查和所有已登记实际场景均通过，总判断没有阻断。” |
| conditionally accepted | strict lint 已保证技术状态、业务状态和全部场景结果为 passed；写“基础检查和所有已登记实际场景均通过，但验收记录为有条件验收。”；签署信息不足只由结论首行警告完整说明，不在四问重复 |
| rejected，且 report 缺失 | 写“验收记录结论为未通过，但实际结果未登记，不能说明评估已经完成”；同时展示技术状态和业务状态 |
| rejected，且 report 存在但结果数组为空 | 写“验收结果文件已登记，但实际结果为 0 项，不能说明评估已经完成”；同时展示技术状态和业务状态 |
| rejected，且 `scenario_result_alignment.complete: false` | 写“实际结果与场景定义未完整对应，不能据此认定评估完成”；同时展示技术状态和业务状态 |
| rejected，且 failure relation 为 `consistent_failed` | 写“至少一项与场景一一对应的业务结果明确未通过。”；同时展示技术状态和业务状态，不声称总体评估已完成 |
| rejected，且 failure relation 为 `scenario_failed_status_not_failed` | 写“至少一项与场景一一对应的业务结果明确未通过，但总业务状态登记为‘`<状态中文>`’；两类记录给出的失败信号不一致，不能认定总体评估已完成。” |
| rejected，且 failure relation 为 `status_failed_without_scenario_failure` | 写“总业务状态登记为‘已执行但未通过’，但一一对应的场景结果没有明确失败；两类记录给出的失败信号不一致，不能认定总体评估已完成。” |
| rejected，且 failure relation 为 `no_explicit_scenario_failure`，matched business 的 blocked 与 not_run 都大于 0 | 写“已登记业务结果包含执行被阻断和尚未执行的场景，不能据此认定评估完成”；同时展示技术状态和业务状态 |
| rejected，且 failure relation 为 `no_explicit_scenario_failure`，matched business 的 blocked 大于 0、not_run 为 0 | 写“已登记业务结果存在执行被阻断的场景，不能据此认定评估完成”；同时展示技术状态和业务状态 |
| rejected，且 failure relation 为 `no_explicit_scenario_failure`，matched business 的 not_run 大于 0、blocked 为 0 | 写“已登记业务结果存在尚未执行的场景，不能据此认定评估完成”；同时展示技术状态和业务状态 |
| 其他 rejected | 写“验收记录结论为未通过，但一一对应的场景结果没有明确失败，不能说明评估已经完成”；同时展示技术状态和业务状态 |
| blocked | 写“基础检查、业务执行或材料存在已登记阻断，当前无法完成验收”；同时展示技术状态和业务状态 |

`reason_summary` 后只追加 `remaining_items_state` 的短句和高严重度提示；五类精确计数下沉到“未解决事项”：

- `present`：写“另有已登记阻断、后续、偏差或标记风险，详见‘未解决事项’。”
- `none_registered`：写“各来源均未登记阻断、后续、开放偏差或标记风险。”
- `source_missing`：写“部分剩余事项来源未登记，不能据此判断没有问题。”
- `deviation_log_high_attention_severity` 为 P0 时紧跟“其中存在最高严重度的开放偏差或标记风险；级别和状态仅为登记值，本报告未完成正式批准。”；为 P1 时写“其中存在高严重度的开放偏差或标记风险；级别和状态仅为登记值，本报告未完成正式批准。”；为 `none` 或 `null` 时不追加。原始 P0/P1/P2/P3 分布只在“未解决事项”和技术明细显示。

## 报告结构

可见正文顺序固定：

1. `# 业务验收报告：<business_goal>`
2. `## 一句话结论`
3. `## 验收前先看四件事`
4. `## 本次验收范围`
5. `## 场景结果`
6. dual-goal 时的 `## 两类闭环`
7. `## 验收依据`
8. `## 未解决事项`
9. `## 证据与结论边界`
10. `## 技术明细`

### 一句话结论

- conditional 且 followup 为空时，第一行固定显示：“**不可签署：验收记录为有条件验收，但具体条件未登记，本报告不可作为完整签署依据。**”
- conditional 且 followup 非空时，第一行固定显示：“**不可签署：验收记录没有按可核对方式登记条件责任人和完成期限，本报告不可作为完整签署依据。**”
- 上述警告必须先于 verdict、状态、四问和任何正向措辞；普通 render/write/check 也必须写入正文，不能只写 stderr。
- 警告之后只显示固定单行：“当前结论：`<verdict 中文>`；基础检查：`<technical status 中文>`；业务状态：`<business status 中文>`。”`reason_summary` 不在此重复，只在紧随其后的四问第三项出现一次。
- 一句话结论不重复原因、范围、环境、证据责任或生产发布边界。
- rejected 的失败事实由 `business_failure_signal_relation` 决定：有唯一匹配的明确业务失败时必须承认；总业务状态给出不同信号时必须同时显示不一致说明；report 缺失、空数组、alignment 不完整或没有明确业务失败时不得虚构失败。所有 rejected 分支都禁止正向声称“评估已完整完成”。

### 报告中的“验收前先看四件事”

该区块紧跟“一句话结论”，固定为四个 bullet，不使用表格、代码块、原始 ID、路径、命令、内部字段或机器枚举：

1. **要确认什么**：指向报告标题和下一节的业务目标与范围，不在摘要中重复长段自由文本。
2. **事实从哪里来**：分别显示场景定义数、实际结果登记状态、材料是否登记和环境记录，不把计划场景说成实际结果；材料精确条目数和边界下沉到“验收依据”。
3. **为什么是这个结论**：只在此处显示一次 `reason_summary`、剩余事项三态和高严重度提示；五类精确计数与原始严重度下沉到“未解决事项”，不使用总判断自身作为原因，也不合并成“问题总数”。
4. **人工还要判断什么**：明确自动检查只覆盖已登记结构及合同明确要求的关系，不核实材料内容，也不保证每项材料都支持业务结论；证据提供方负责真实性，业务负责人负责判断，发布批准另行进行。

输出使用以下固定骨架；尖括号只能由上方 view-model 的固定分支替换：

```text
- **要确认什么**：确认本报告标题和“本次验收范围”列出的业务目标，在约定范围内是否达到。
- **事实从哪里来**：本次验收定义了 <scenario_card_count> 个场景；<实际结果登记分支>；<材料登记分支>；<环境短句>。
- **为什么是这个结论**：<reason_summary>；<剩余事项三态短句><高严重度提示分支>
- **人工还要判断什么**：自动检查核对已登记结构和合同明确要求的关系，但不核实材料内容，也不保证每项材料都能支持业务结论；证据提供方负责真实性，业务负责人判断目标、范围和剩余风险是否可接受，发布批准另行进行。
```

分支文本固定如下：

- actual result：`null` → “实际结果未登记”；整数 → “已登记 `<n>` 个实际结果”。
- evidence：`null` → “验收材料未登记”；`0` → “验收材料已登记但没有条目”；大于 `0` → “验收材料已登记，条目数见‘验收依据’”。
- remaining items：使用上方 `remaining_items_state` 三个固定短句；不得在四问串联五类精确计数。
- high severity：使用 `deviation_log_high_attention_severity` 对应的“最高严重度/高严重度”固定提示；`none` 或 `null` 为空串，不能把 `null` 当作没有高严重度事项。

摘要完整性不使用自然语言“句数”或开放式可读性判断，而是验证固定 heading、四个加粗标签、固定顺序、固定骨架和允许的 view-model 分支。摘要不是新的结论来源；任何输入缺失都使用对应“未登记”分支，不省略问题、不补猜事实。字符计数先从每行删除固定的 `- **<标签>**：` 前缀，再以 `Array.from(body).length` 计算 Unicode code point；每个 bullet 正文最多 `180` 个，四个正文合计最多 `520` 个。最大长度分支必须由 golden 测试验证，超出即 `PRESENTATION_PRINCIPLE_SUMMARY_INVALID`。

整个首屏另设总预算：从 `## 一句话结论` heading 起，到 `## 本次验收范围` heading 前为止，去除 heading/bullet/bold 等 Markdown 控制标记和换行后，以 `Array.from(visibleText).length` 计数，最多 `540` 个 Unicode code point。该范围包含“一句话结论”标题、conditional 警告、结论状态行、四问 heading、四个标签和正文；超出即 `PRESENTATION_FIRST_SCREEN_TOO_LONG`。测试必须遍历 verdict、环境关系、剩余事项和高严重度提示的最大组合，而不是只量一份 accepted golden。

### 本次验收范围

从 intent 忠实展示 business goal、stakeholders、success definition、excluded scope 和 risk boundaries。自由文本不自动改写；只进行安全转义。

### 场景结果

按 `scenario_id` 稳定排序，展示：

- 场景业务目标；
- 验收角色；
- 起始状态；
- 触发操作；
- 预期业务状态；
- acceptance report 登记的 business result 与 technical gate result。

报告不能把 expected state 改写成 observed fact。acceptance report 缺失时明确显示“当前结论未登记场景结果报告”。score 只进入技术明细。

### 两类闭环

仅在 `closure_mode: dual_goal` 时展示：

- 外部系统或设备链路；
- 业务人员实际操作。

每部分展示中文状态、环境模式、对应 evidence description 和可查看引用。通过结论使用同一路径的信息以业务语言表述为“两个闭环使用同一条已登记集成链路”，原始 path ID 只在技术明细。非通过分支必须按 `environment_relation` 显示“环境类型相同/不同”“集成链路相同/不同”和“是否尚未执行”的固定差异句，不能只重复两侧模式名称。

### 验收依据

本节开头按 `evidence_entry_count` 固定显示：`null` → “验收材料未登记”；`0` → “验收材料已登记但没有条目”；大于 `0` → “验收材料登记 `<n>` 项；数量不代表真实性、充分性或与业务结论的完整对应”。有条目时，每项显示：

- description；
- 支持的 goal 或 scenario；
- source type 的中文标签；
- 已登记 result 的中文标签；
- 可安全访问的 local/external link，或 manual 引用说明。

renderer 使用“验收记录登记”“该材料用于支持”措辞，不自动写“已经证明现场事实”。未知 evidence result 显示“未识别结果，原始值见技术明细”，并使 presentation strict 失败。

### 未解决事项

本节先分来源显示固定计数，绝不合成总数：总判断中的 blocker/followup；验收结果中的 open deviation（report 缺失写“未登记”）；偏差日志中的 open/accepted-risk（log 缺失写“未登记”）。偏差日志存在时，open 与 accepted-risk 分别显示“最高严重度（P0）/高严重度（P1）/中等严重度（P2）/较低严重度（P3）”四级计数；`0` 只表示日志存在且该级别没有记录。

- blockers：显示为阻断原因。
- required followups：显示为后续事项。
- acceptance report 的 open deviations：显示为报告登记偏差。
- deviation log 中 `open`：显示 description、severity、owner 和 resolution plan。
- deviation log 中 `accepted_risk`：单独显示为“记录状态标记为已接受的风险”，同时显示 severity、owner 和 resolution plan，并固定说明“级别和状态均为登记值，不代表风险已正式接受、完成签署或获得发布批准”。
- resolved deviation 默认只在技术明细列出。

renderer 不把字符串 followup 猜成 owner、deadline 或风险等级，不把 deviation 与 followup 猜测关联。

### 证据与结论边界

固定声明：

- 报告依据已登记并通过合同规定检查的验收材料生成；
- 自动检查核对已登记结构和合同明确要求的引用关系，但不核实材料内容，也不保证每项材料都能支持对应业务结论；
- 证据提供方负责材料真实性，业务负责人判断目标、范围和剩余风险是否可接受；
- external evidence 未由本工具在线检查；
- 业务验收结论不证明生产环境持续稳定性或发布就绪；
- 仅凭本文件不能确认它仍是最新版本；交付方必须在交付前完成一致性与业务展示检查，并在交付说明中提供检查结果。

### 技术明细

允许显示：task/schema version、raw verdict/status、closure mode、goal status、evidence IDs、integration path/mode、source type/path/result、scenario score、failed gates、source digest 和 renderer version。

## 固定中文映射

### Verdict

| Machine value | 业务表达 |
| --- | --- |
| `accepted` | 本次范围可以验收 |
| `conditionally_accepted` | 验收记录为有条件验收 |
| `rejected` | 验收记录结论为未通过 |
| `blocked` | 当前无法完成验收 |

### Status

| Machine value | 业务表达 |
| --- | --- |
| `passed` | 已通过 |
| `failed` | 已执行但未通过 |
| `blocked` | 被前置条件阻断 |
| `not_run` | 尚未执行 |

### Integration mode

| Machine value | 业务表达 |
| --- | --- |
| `real` | 验收记录标记为真实环境或真实链路；本报告不鉴定现场真实性 |
| `approved_simulator` | 验收记录标记为经批准的模拟环境；本报告未核实批准人、批准范围和有效期，也不代表真实生产环境 |
| `mock` | 验收记录标记为仅使用测试模拟，未连接真实外部系统或设备；不能作为真实环境验收 |
| `synthetic` | 验收记录标记为仅使用合成数据；不能作为真实环境验收 |
| `not_run` | 验收记录标记为尚未执行链路验证 |

standard closure 没有可供 renderer 读取的结构化 integration mode 时固定显示：“本报告无法从可核对的验收记录中确认本次验证环境，因此不判断使用了哪种环境，也不推断真实环境或生产可用。”这只说明当前报告的读取能力，不断言截图、录屏或自由文本中完全没有环境信息。

## Freshness 与 tamper contract

`--check` 顺序：

1. strict lint 当前 bundle；
2. 重新计算 current source digest；
3. 安全读取目标 Markdown；
4. 解析生成元数据；
5. 重渲染 expected bytes；
6. 比较 digest 与全文。

诊断规则：

| Diagnostic | 条件 |
| --- | --- |
| `BUSINESS_REPORT_MISSING` | 目标文件不存在 |
| `BUSINESS_REPORT_TARGET_UNSAFE` | 目标不是 canonical regular file |
| `BUSINESS_REPORT_STALE` | 元数据 source digest 与当前 bundle 不同 |
| `BUSINESS_REPORT_TAMPERED` | digest 相同但全文不同，或生成元数据缺失/非法 |
| `BUSINESS_REPORT_SOURCE_INVALID` | strict bundle lint、JSON/JSONL 或 evidence 读取失败 |

stale 与 tampered 都是 exit 1；`--check` 不自动修复，调用者必须显式运行 `--write`。

## Presentation strict policy

`--check --presentation-strict` 在 freshness 通过后增加业务交付检查。它不修改 JSON verdict，也不回写任何 source。

### 可测试的摘要 policy

新 CLI 使用 `require.main` guard，并导出以下纯函数供 focused test 使用：

```js
module.exports = {
  buildBusinessReportViewModel,
  renderOneLineConclusion,
  renderReasonSummary,
  renderPrincipleSummary,
  validatePrincipleSummary,
  validateBusinessReportPresentation,
};
```

- `renderOneLineConclusion(viewModel)` 只使用 view-model 返回完整“一句话结论”区块；它唯一决定 conditional 警告和 verdict/technical/business 三个状态表达，不包含 `reason_summary`。
- `renderReasonSummary(viewModel)` 按本合同的 verdict/alignment/failure-relation 分支返回唯一原因短句；rejected 的明确失败事实、失败信号不一致和保守分支都由该函数决定。
- `renderPrincipleSummary(viewModel)` 只接受本合同定义的 view-model，返回完整四问区块。
- `validatePrincipleSummary(markdown, viewModel)` 规范化换行，在“一句话结论”与“本次验收范围”之间定位唯一的 `## 验收前先看四件事` heading，只提取该 heading 及其四个 bullet，并与 `renderPrincipleSummary(viewModel)` 的预期字节逐字比较。
- `validateBusinessReportPresentation(markdown, viewModel)` 是所有 renderer-owned 展示不变量的纯入口；它按 terminal priority 依次检查 conditional 首行与相对顺序、rejected 原因强度、`540` 首屏预算、四问 policy、内部术语、未知 evidence result 和 conditional source readiness，并返回首个 `PRESENTATION_*` diagnostic 或 `null`。
- rejected 原因检查只在四问 heading 和第三个固定标签都可唯一定位时提取 renderer-owned 的 `<reason_summary>` 槽，并与 `renderReasonSummary(viewModel)` 比较；无法唯一提取时跳过本项并由后续 principle diagnostic 处理。它不扫描业务目标、材料 description 或其他业务自由文本。该检查位于四问逐字节比较之前，因此修改内存中的 rejected 原因能稳定得到 `PRESENTATION_REJECTED_ASSESSMENT_OVERCLAIM`，其他结构错误才得到 principle diagnostic。
- validator 同时要求 heading 恰好出现一次、四个加粗标签恰好各一次且顺序固定，对 renderer-owned 固定文本执行实现词扫描，并按 Unicode code point 校验 `180/520` 四问预算和 `540` 首屏预算。
- 不做自然语言句数、分词、相似度或可读性推断；简洁度由固定骨架、有限分支、字符预算和 golden bytes 保证。
- 缺失、重复、乱序、空项和实现词泄漏的负例直接调用纯函数，期望 `PRESENTATION_PRINCIPLE_SUMMARY_INVALID`；不得通过手改已保存报告来制造该 diagnostic。
- conditional 警告删除/后移和 rejected 原因否认、遗漏不一致提示或过度强化的负例直接修改内存 Markdown，再调用 `validateBusinessReportPresentation`；不得手改已保存报告来制造对应 diagnostic。
- CLI 中手改已保存报告仍优先得到 `BUSINESS_REPORT_TAMPERED`。只有 freshness 已通过、当前 expected report 自身违反展示 policy 时，CLI 才输出具体 `PRESENTATION_*`；focused tests 可直接通过纯函数稳定覆盖这些分支。

### Terminal diagnostic 优先级

每次 check 以以下顺序返回首个 terminal diagnostic；测试不得依赖其他顺序：

1. CLI usage / internal / unsafe invocation（exit 2）；
2. `BUSINESS_REPORT_SOURCE_INVALID`；
3. `BUSINESS_REPORT_TARGET_UNSAFE`；
4. `BUSINESS_REPORT_MISSING`；
5. `BUSINESS_REPORT_STALE`；
6. `BUSINESS_REPORT_TAMPERED`；
7. `PRESENTATION_CONDITION_WARNING_ORDER_INVALID`；
8. `PRESENTATION_REJECTED_ASSESSMENT_OVERCLAIM`；
9. `PRESENTATION_FIRST_SCREEN_TOO_LONG`；
10. `PRESENTATION_PRINCIPLE_SUMMARY_INVALID`；
11. `PRESENTATION_INTERNAL_TERM_LEAK`；
12. `PRESENTATION_EVIDENCE_RESULT_UNKNOWN`；
13. `PRESENTATION_CONDITION_MISSING`；
14. `PRESENTATION_CONDITION_METADATA_UNSTRUCTURED`。

### Blocking diagnostic

| Diagnostic | 条件 |
| --- | --- |
| `PRESENTATION_CONDITION_MISSING` | verdict 为 conditional，但 `required_followups` 为空 |
| `PRESENTATION_CONDITION_METADATA_UNSTRUCTURED` | conditional 有 followup，但当前合同没有可关联的结构化 owner 与 deadline；当前 v2 因此不能成为完整签署材料 |
| `PRESENTATION_CONDITION_WARNING_ORDER_INVALID` | conditional 的固定不可签署警告不是“一句话结论”标题后的第一条可见内容，或位于 verdict、状态、reason 或四问之后 |
| `PRESENTATION_REJECTED_ASSESSMENT_OVERCLAIM` | rejected 的四问 `<reason_summary>` 不等于 `renderReasonSummary(viewModel)`：包括否认已登记的明确业务失败、在无唯一匹配失败时虚构失败、遗漏总状态与场景失败信号不一致说明，或正向声称总体评估已完成 |
| `PRESENTATION_FIRST_SCREEN_TOO_LONG` | 可唯一定位“一句话结论”与“本次验收范围”heading，且两者之间的首屏超过 `540` 个 Unicode code point；计数包含两个首屏 heading、conditional 警告、状态行、四问标签/正文；边界 heading 不唯一时跳过本项，由 principle diagnostic 处理 |
| `PRESENTATION_INTERNAL_TERM_LEAK` | `## 技术明细` 前的可见文本出现内部字段、Goal A/B 或原始枚举 |
| `PRESENTATION_EVIDENCE_RESULT_UNKNOWN` | 业务区需要显示 validator 尚未枚举的 evidence result |
| `PRESENTATION_PRINCIPLE_SUMMARY_INVALID` | 当前 expected report 的四问区块不等于 view-model 对应的固定输出，或 heading/四个加粗标签/顺序/实现词 policy 失败 |

### Warning

| Warning | 条件 |
| --- | --- |
| `PRESENTATION_ENVIRONMENT_UNRECORDED` | standard closure 没有可供 renderer 读取的结构化环境值；不推断其他材料是否提到环境 |
| `PRESENTATION_EXTERNAL_EVIDENCE_UNVERIFIED` | 使用 external evidence；本工具不联网检查 |
| `PRESENTATION_MANUAL_EVIDENCE` | 使用 manual evidence；由人工验收责任链确认 |
| `PRESENTATION_SIMULATOR_SCOPE` | 使用 approved simulator；不得外推生产环境 |

### 业务区术语检查

扫描算法固定为：规范化为 LF；删除 HTML comments 和 fenced code；截取 `## 技术明细` 之前的可见文本；对 ASCII token 使用 `toLowerCase()` 后执行 literal substring `includes`。扫描范围包含“验收前先看四件事”，至少禁止以下 token：

```text
Goal A
Goal B
goal_a
goal_b
dual_goal
evidence_refs
integration_path_id
integration_mode
closure_mode
technical_gate_status
business_acceptance_status
schema_version
conditionally_accepted
approved_simulator
not_run
--check
presentation-strict
```

技术附录不应用该禁令，否则会损害审计和可复现能力。

“验收前先看四件事”另做结构检查；其固定说明不得出现 `JSON`、`JSONL`、`schema`、`validator`、`lint`、`artifact`、`digest`、`CLI` 等实现词。摘要不复制业务自由文本，因此该检查可以只针对确定性生成内容执行；报告标题和详细范围仍忠实展示业务原文，并继续受现有业务区术语门禁约束。

## 模板和 Team 使用规则

- `workflow/templates/business-acceptance-report.md` 改为“自动生成报告说明与固定可见结构”，不再作为手填结论模板。
- 模板说明和 Team reference 必须把“验收前先看四件事”列为首屏固定部分，不允许调用者删除、后移到技术明细或改为自由发挥的手工摘要。
- `business-evidence-map.md` 和 `business-verdict.md` 保留兼容文件名，但顶部明确标记为内部技术编制材料，业务人员应阅读生成报告。
- `plugins/atlas-workflow/skills/team/references/business-acceptance.md` 增加 human-first handoff：
  1. 业务 artifact 最终冻结后运行 `--write`；
  2. 交付业务人员前运行 `--check --presentation-strict`；
  3. final response 优先链接生成报告，原始 JSON 和技术索引按需提供；
  4. final response 同时报告刚刚执行的 presentation check 结论与当前 source digest；仅链接 Markdown 不足以声明最新；
  5. presentation failure 不改变 machine verdict，但阻止声称材料已可签署。
- `plugins/atlas-workflow/README.md` 记录 CLI 用法、能力边界和 v2-only 规则。

## 文件边界

### 允许修改

```text
plugins/atlas-workflow/scripts/codex-team-business-report           # new
plugins/atlas-workflow/scripts/codex-team-artifact-lint             # require.main/export only
plugins/atlas-workflow/skills/team/references/business-acceptance.md
plugins/atlas-workflow/README.md
plugins/atlas-workflow/.codex-plugin/plugin.json                    # final cachebuster only
workflow/templates/business-acceptance-report.md
workflow/templates/business-evidence-map.md
workflow/templates/business-verdict.md
workflow/tests/contract_team_business_acceptance.sh
workflow/tests/contract.sh
test/fixtures/team-sdd/business-acceptance/**                        # only required report fixture
docs/README.md
docs/atlas-workflow/20260718-004-atlas-business-acceptance-readable-report/**
```

### 禁止修改

```text
plugins/atlas-workflow/contracts/team-sdd/business-*.schema.json
plugins/atlas-workflow/contracts/team-sdd/validators/business-*.js
plugins/multica-sdlc/**
.agents/**
scripts/install-atlas-forge.sh
scripts/sync-live-workflow.sh
scripts/sync-live-agents.sh
真实 ~/.codex plugin cache、marketplace snapshot、workflow runtime 和 agent runtime
```

如实现必须超出允许路径，停止并请求新的用户授权；不要把新路径作为“顺手修复”加入当前 diff。

## First Code Slice Guard

- Phase 1 的首个 keeper behavior 是 CLI 从 strict-valid standard accepted v2 fixture 输出中文报告到 stdout。
- 首个 stdout 报告必须已经包含完整四问摘要；不得把这项人工审查入口延迟到文档收尾阶段。
- 首个代码切片可以同时加入 artifact-lint export guard 和最小 test，但不能只包含模板、fixture、文档或空 CLI 骨架。
- 在 renderer 行为成立前，不扩展 stale、presentation、README、cachebuster 或全量证据。
- hard safety gate 不因 first-code slice 延后或削弱；无效 bundle 必须从第一切片起 fail closed。

## Product/UI Acceptance Gate

- `not_applicable`：没有 served UI、浏览器入口或 GUI。
- 用户可见行为通过 deterministic Markdown golden、stdout、file bytes 和 CLI diagnostics 验证。
- headless acceptance 不替代 strict BAF machine lint、plugin integrity 或 repo/full contract。

## 分阶段实施

| Phase | Keeper outcome | 主要路径 | Required verification |
| --- | --- | --- | --- |
| 1 | strict-valid v2 bundle 可确定性输出含四问摘要的中文报告到 stdout；invalid bundle fail closed | new CLI、artifact-lint export、focused fixture | `node --check`、business acceptance focused test |
| 2 | digest、local evidence identity、atomic write、stale/tamper、四态/环境/dual-goal、presentation strict 完成 | CLI、focused tests、必要 golden fixture | focused test 全矩阵、artifact-lint compatibility |
| 3 | 模板/Team reference/README 收敛，冻结审查，最后 cachebuster，完成全量集成 | templates、skill、README、manifest | plugin validate/integrity、contract_repo、contract.sh、docs/forbidden checks |

Phase 是调度边界，不新增 scope 或授权。全部实施可以在一个经过审查和验证的 Conventional Commit 中提交；方案文档提交与代码提交分开。

## 测试矩阵

### Focused renderer tests

- CLI help、必填参数、未知参数、互斥 mode、presentation flag 组合。
- standard accepted v2 stdout 与一份完整 golden Markdown。
- golden 首屏包含固定 heading、四个加粗标签、固定顺序、view-model 分支和无实现术语的四问摘要；最大分支逐 bullet 不超过 180 个、四问合计不超过 520 个、整个首屏不超过 540 个 Unicode code point。
- view-model table：scenario card 数固定；acceptance report/evidence map/deviation log 分别覆盖 missing、present-empty 和 present-nonempty，断言 `null` 显示“未登记”、空数组显示 `0`；alignment、failure signal relation、environment relation、remaining state 和 severity 分布逐字段断言。
- alignment 精确单位 fixtures：cards `[A]` + results `[G,G]` → ghost records `2`、duplicate IDs `1`、missing IDs `1`；`[G,G,G]` → `3/1/1`；cards `[A,B]` + results `[A,A]` → `0/1/1`；cards `[A,B]` + results `[A]` → `0/0/1`。重复 ghost 同时计入 ghost 与 duplicate。
- 计划场景数与实际结果数分别断言；不得把 scenario card 数写成实际结果数。
- evidence 精确条目数下沉“验收依据”，固定说明仅为登记条目数、不代表真实性、充分性或对业务结论的完整支持。
- dual accepted real：两个闭环、独立 evidence、同链路业务表达。
- dual accepted approved simulator：明确模拟环境且没有真实/生产通过表述。
- dual rejected/blocked mixed mode/path：覆盖同 mode/不同非空 path、不同 mode/同一非空 path、mode/path 都不同、双侧 not-run/null 和单侧 not-run/null；双侧未执行固定说明没有可比较链路，单侧未执行固定说明不能比较，二者都负向断言不出现“使用同一条已登记集成链路”“登记为同一环境类型和同一集成链路”等肯定句。
- conditional empty followups：所有 render mode 首行先显示不可签署警告；fresh check 后 presentation strict 报 `PRESENTATION_CONDITION_MISSING`。
- conditional non-empty followup：所有 render mode 首行先显示责任人/期限不完整警告；fresh check 后 presentation strict 报 `PRESENTATION_CONDITION_METADATA_UNSTRUCTURED`。
- conditional 测试断言不可签署警告位于 verdict、正向状态和四问之前；缺失或乱序时报 `PRESENTATION_CONDITION_WARNING_ORDER_INVALID`。
- rejected 与 blocked 使用不同中文结论；rejected × technical/business 四态 × report missing/present × `business_result` passed/failed/blocked/not-run × matched/ghost/duplicate/partial coverage table。alignment complete 且业务结果明确 failed 时必须承认该事实；总业务状态不是 failed 时还必须显示失败信号不一致，不得反写“没有明确失败”。
- rejected 增加 `business_result: passed`/`technical_gate_result: failed` 和反向组合，断言强化谓词只读取 `matched_business_status_counts.failed`；再以同一 matched business failed 分别搭配 aggregate passed/failed/blocked/not-run，非 failed aggregate 必须显示不一致说明。
- rejected 原因删改/强化通过内存 Markdown 调用 `validateBusinessReportPresentation`，期望 `PRESENTATION_REJECTED_ASSESSMENT_OVERCLAIM`；检查范围只限四问第三项的 renderer-owned `reason_summary` 槽。
- goal/status 为 failed、blocked、not run 的各分支。
- evidence source 为 local、external、manual；unknown result 的 strict failure；另加 standard accepted + ghost extra evidence、dual accepted + unreferenced ghost evidence，断言业务区不出现“引用均已对应”“所有材料已关联”等过强措辞。
- standard environment warning 只说明报告无法确认环境，不断言所有材料都未记录环境。
- blockers/followups 都为 0、但 report/deviation log 存在 open deviation 或 accepted risk 时，四问提示仍有事项且精确计数下沉“未解决事项”；不得写成没有剩余问题。
- accepted/conditional + P0/P1 open deviation、accepted-risk fixtures：首屏用“最高严重度/高严重度”业务词提示，详细章节显示完整 P0/P1/P2/P3；禁止“风险已正式接受”“已完成批准”等强化措辞。
- visible business section 内部术语泄漏 failure；技术附录允许原始字段。
- `validatePrincipleSummary` 纯函数 table 覆盖四问缺失、重复、乱序、空项、字符超限和固定说明泄漏实现词，期望 `PRESENTATION_PRINCIPLE_SUMMARY_INVALID`。
- `validateBusinessReportPresentation` 纯函数 table 覆盖 conditional warning order、rejected reason、first-screen 540 超限、principle、internal term、unknown evidence result 与 conditional readiness，并断言首个 diagnostic 遵循 terminal priority。
- CLI diagnostic precedence 单测覆盖 source-invalid、unsafe、missing、stale、tampered 和所有 presentation diagnostics；手改摘要/警告/结论固定报 tampered，不期望 presentation diagnostic。
- 同一输入重复 render bytes 相同。
- `--write` 后 `--check` 通过。
- 修改 JSON 或 local evidence 后 stale；重新 `--write` 后恢复。
- 手改 Markdown 且 digest 未变时 tampered。
- target symlink、directory 或非 canonical target 失败。
- invalid/missing/mixed/task-mismatch bundle 不生成正向 stdout 或目标文件。

### Compatibility tests

- 既有 strict/non-strict v1/v2 business fixtures 全部保留。
- 不传 `--business-acceptance` 的普通 SDD lint 输出保持不变。
- artifact-lint CLI help、成功 stdout 和失败 stderr 保持现状。
- 原强制 Markdown 暴露字段的 grep 改为：generated-only 主入口存在、内部模板标记正确、业务可见区无内部字段、技术附录保留可追溯信息。

测试优先扩展现有 `workflow/tests/contract_team_business_acceptance.sh`，复用其 SDD/BAF fixture builder，不复制第二套临时 workspace 生成器。仅保留一份完整 golden，其余状态用 table-driven assertion 覆盖。

## 验收标准

| ID | Criterion | Required | Verification |
| --- | --- | --- | --- |
| AC-01 | 无效、缺失、task mismatch 或 mixed-version bundle fail closed，且不写报告 | yes | focused invalid fixture matrix |
| AC-02 | 相同 bundle 和 local evidence 内容产生逐字节相同的 Markdown | yes | double-render comparison + golden |
| AC-03 | JSON/JSONL/local evidence 变化判 stale，手改报告判 tampered | yes | negative write/check fixtures |
| AC-04 | accepted、conditional、rejected、blocked 四态准确区分；rejected 忠实承认一一对应的明确业务失败，顶层状态给出不同信号时醒目标明不一致，未执行/阻断/不对应不声称评估完成 | yes | verdict/status/report-presence/alignment/failure-signal table |
| AC-05 | technical gate 总状态和业务影响首屏可见 | yes | failed/blocked/not-run fixtures |
| AC-06 | integration mode 五态使用“验收记录标记”措辞；dual 非通过明确区分 mode/path 和未执行状态，null path 不冒充同一链路，approved simulator 不冒充真实环境或生产就绪 | yes | executed four-way relation + one/both-not-run exact phrases |
| AC-07 | dual-goal 两个闭环分别展示独立 evidence，并用业务语言说明同一路径 | yes | dual accepted golden + evidence assertions |
| AC-08 | evidence 使用保守措辞，首屏只声明已实现的结构及必要引用检查，不保证每项材料支持业务结论，并说明真实性责任、external 可达性和发布边界 | yes | golden responsibility + ghost/unreferenced evidence negative assertions |
| AC-09 | 技术附录前无内部 token，技术附录保留 machine traceability | yes | visible-section leakage scanner |
| AC-10 | conditional 缺条件或可核对责任信息时，正文先显示不可签署警告且 presentation strict 失败 | yes | two conditional fixtures + relative-order assertions |
| AC-11 | write target canonical、non-symlink、固定、原子；source 和其他 artifact 不变 | yes | target safety and before/after tree assertions |
| AC-12 | v1/non-business/artifact-lint CLI 兼容行为不变 | yes | existing regression suite |
| AC-13 | skill 和模板把生成报告设为唯一业务 handoff，不再要求业务人员阅读原始 JSON/技术 Markdown | yes | source assertions + relative links |
| AC-14 | plugin 内容冻结后生成唯一新 cachebuster，manifest/release identity 通过 | yes | official validate + integrity manifest/release gate |
| AC-15 | repo/full contract、docs、forbidden paths 与 Multica hard fingerprints 通过 | yes | final validation matrix |
| AC-16 | 实施合同自身含通俗四问摘要；生成报告首屏由唯一 view-model 生成同结构短摘要，并由 pure policy validator 强制固定骨架、四问 180/520、全首屏 540 与术语边界 | yes | contract source assertion + maximum-branch table/golden + pure-function negatives |
| AC-17 | 场景定义/实际结果及其唯一对应单位、材料、五类剩余事项及偏差严重度均有唯一来源；missing 与 empty 分别表达，不合并风险总数 | yes | exact alignment-count fixtures + missing/empty/nonempty + severity fixtures |
| AC-18 | CLI terminal diagnostic 优先级固定；手改报告报 tampered，所有 renderer-owned presentation diagnostic（含首屏长度）都有纯函数测试入口 | yes | CLI precedence + pure presentation policy tables |
| AC-19 | 可见正文说明文件不能自证最新；handoff 报告刚运行的 presentation check 和 source digest | yes | golden disclaimer + Team reference source assertions |
| AC-20 | 原因只在四问出现一次，精确计数和原始 severity 下沉明细，首屏用业务词突出高严重度事项且整体不超过 540 个字符 | yes | maximum-branch matrix + accepted/conditional severity fixtures |
| AC-21 | 业务失败计数只读取 `business_result`，不混入 technical result；总业务状态与明确场景失败信号不同时如实提示 | yes | inverted business/technical results + aggregate four-state fixtures |

## Edge Cases

| Case | Expected behavior | Required |
| --- | --- | --- |
| standard closure 没有 environment mode | 中文只声明本报告无法确认验证环境；warning，不断言其他材料未提到环境 | yes |
| blocked/rejected 缺 acceptance report 或 evidence map，但 machine lint 允许 | 仍生成保守报告，明确哪些材料未登记 | yes |
| acceptance report/evidence map/deviation log 缺失 | 对应 view-model 为 `null` 并写“未登记”；不得写成 `0` | yes |
| 对应文件存在但数组为空 | 明确显示 `0`；不得写成“未登记” | yes |
| dual rejected/blocked 两侧 mode 或 path 不同 | 两类闭环分别显示各自环境记录，并明确 mode/path 哪个维度不同；不聚合、不外推 | yes |
| dual 两侧都 not-run/null | 声明两侧均未执行且没有可比较链路；禁止把两个 null 说成同一集成链路 | yes |
| rejected 搭配 not-run/blocked、ghost、duplicate、partial coverage 或缺 report | 使用对应保守分支，不能说明评估已经完成 | yes |
| rejected 有唯一匹配 business failed，但总业务状态不是 failed | 承认场景失败，同时提示两类记录的失败信号不一致；不得说没有明确失败 | yes |
| business 与 technical scenario result 相反 | 业务失败原因只读取 business result；technical result 单独显示，不得混算 | yes |
| blockers/followups 为 0，但存在 open deviation/accepted risk | 首屏用业务词提示仍有事项和最高/高严重度，明细分来源显示计数与原始 severity；不得呈现为没有剩余问题 | yes |
| conditional 无 followup | 正文首行不可签署警告；报告可读，presentation strict failure | yes |
| conditional 有 followup但无可核对责任信息 | 正文首行不可签署警告；原文展示且 presentation strict failure | yes |
| external/manual evidence | 不联网、不鉴真，显示边界 warning | yes |
| evidence result 为 validator 允许但 renderer 未识别的字符串 | 显示未识别，presentation strict failure | yes |
| local evidence 内容在报告生成后变化 | source digest 变化，check stale | yes |
| Markdown 被人工修改 | check tampered，不解析修改内容回写 JSON | yes |
| 手改四问结构 | 仍按 diagnostic precedence 报 tampered；pure validator 负例另行测试 principle diagnostic | yes |
| 动态文本包含 Markdown/HTML 控制字符 | 只显示转义文本，不能改变报告结构 | yes |
| 目标是 symlink 或 directory | fail closed，不覆盖目标 | yes |
| evidence 文件很大 | 使用 Node 标准库流式或分块 SHA-256，避免一次性把全部 evidence 读入内存 | yes |

## 真实验证计划

| Row | Target | Command or action | Expected result | Phase conclusion evidence |
| --- | --- | --- | --- | --- |
| V-01 | JS syntax | `node --check plugins/atlas-workflow/scripts/codex-team-artifact-lint` 与新 CLI | syntax pass | final verification summary |
| V-02 | Business report | `bash workflow/tests/contract_team_business_acceptance.sh` | renderer、BAF 与 compatibility matrix pass | focused command conclusion |
| V-03 | Plugin manifest | 官方 `validate_plugin.py plugins/atlas-workflow` | plugin valid | final verification summary |
| V-04 | Plugin identity | `workflow/bin/atlas-plugin-integrity manifest --plugin-root plugins/atlas-workflow` | `ok=true` | identity conclusion |
| V-05 | Release identity | 使用实施开始时记录的 base SHA 运行 `atlas-plugin-integrity release` | plugin tree 与新 version 唯一对应 | identity conclusion |
| V-06 | Repo contract | `bash workflow/tests/contract_repo.sh` | hermetic repo contract pass | final verification summary |
| V-07 | Full integration | `bash workflow/tests/contract.sh` | full Atlas contract pass | final verification summary |
| V-08 | Docs | relative Markdown link checker、contract-index lint、strict implementation-contract lint | docs bundle valid | docs conclusion |
| V-09 | Diff | `git diff --check`、staged diff review、`git diff --cached --check` | no whitespace or unintended paths | commit conclusion |
| V-10 | Forbidden paths | `git diff --exit-code -- plugins/multica-sdlc .agents` 与 before/after hard fingerprints | zero change | forbidden-path conclusion |

不运行真实 Codex CLI E2E、live-host compatibility、marketplace mutation、plugin install、cache refresh、Multica test/router/listener/runtime；这些行为不属于本合同验证。

## Release identity 与提交

1. 实施开始时记录 `implementation_base_sha`。
2. renderer、tests、templates、skill 和 README 完成后运行独立只读 review。
3. 若 review 需要修改，完成修复并重新 review。
4. 内容和 reviewer 结论冻结后，最后运行 `scripts/bump-plugin-cachebuster.sh atlas-workflow`。
5. cachebuster 后不得再修改 `plugins/atlas-workflow/**`；若必须修改，重新执行冻结、review 和新 cachebuster。
6. 运行 plugin manifest/release identity 与 repo/full contract。
7. 只 stage 当前合同允许路径，检查 staged diff 后创建一个 `feat(atlas): ...` Conventional Commit。
8. 不 push、不创建 PR、不部署、不刷新安装态。

## Evidence Budget

- Git：代码、测试、最多一份完整 golden、必要模板/skill/docs、最终 phase conclusion。
- Git 外：临时 workflow root、完整生成报告矩阵、hash manifest、命令全量输出、失败重试、review raw output 和中间 diff。
- 方案和每个实施 phase 的 Git evidence 文件目标不超过 10 个且单文件不超过 1 MB；本 headless 任务不生成浏览器证据。

## Failure And Stop Conditions

- 必须修改既有 business schema/validator 才能实现 renderer MVP。
- 无法通过最小 export 复用 artifact lint，必须复制 machine validation。
- 需要从自由文本推断 owner、deadline、环境、风险、签署或生产就绪。
- 需要让 Markdown 成为可独立编辑的 verdict 或签署事实源。
- artifact-lint CLI、v1 compatibility 或普通 SDD 路径发生 breaking change。
- 无法区分 rejected/blocked、real/simulator 或两类独立 evidence。
- 无法从唯一 view-model 区分场景定义与实际结果、business/technical result、精确 alignment 计数单位、顶层/场景失败信号、`null` 与 `0`、未执行/环境/链路差异，或不同来源和严重度的偏差与风险。
- conditional 不可签署警告无法稳定出现在任何正向措辞之前，或任一 renderer-owned presentation diagnostic 在既定优先级下没有纯函数测试入口。
- atomic target safety、source digest 或 tamper check 无法 fail closed。
- 实现需要第三方依赖、网络、浏览器或新 runtime service。
- diff 命中 forbidden path、真实 cache/marketplace/runtime 或 Multica。
- plugin tree 在 cachebuster 后发生变化。
- required verification 任一失败且无法在当前合同范围内修复。

required safe fallback: not_applicable

本任务没有安全的“手工摘要”或“跳过 presentation check”回退；停止并返回具体 blocker。

## 延期的版本化合同工作

以下问题保留为独立后续，不影响本 MVP 完成：

- `conditions[]` 结构化 description、business impact、owner、due date、status、retest。
- accepted 与 conditional 的更强 machine transition rule。
- rating 阈值、open deviations 与 deviation log 的机器闭环。
- evidence observed time、observer、environment、content digest、attestation 与有效期。
- approved simulator 的批准人、范围、版本、差异和有效期。
- 正式签署、撤销、重验和 production readiness 合同。
- structured playback、Web UI、Dashboard 和国际化。

## Final Contract Cleanliness Gate

- [x] 唯一事实源、派生报告和 presentation policy 职责清楚。
- [x] 首个代码切片改变真实 CLI 行为，不是纯准备工作。
- [x] machine BAF v2 与业务阅读层的兼容边界锁定。
- [x] 四态、环境、双目标证据、conditional 和证据真实性边界可验证。
- [x] 实施合同和生成报告都提供同结构、通俗、原因不重复、受四问与全首屏字符预算约束且可测试的人工审查摘要。
- [x] 场景、business/technical 结果边界、alignment 单位、失败信号、材料、环境/链路、偏差和风险严重度都有唯一 view-model 来源；missing 与 empty 不混淆。
- [x] rejected 未执行/阻断/不对应/状态冲突分支、dual 空链路与混合环境/链路、conditional 首屏警告都有固定分支与负向测试。
- [x] tamper 与 presentation policy 职责、通用纯函数测试层和 terminal diagnostic 优先级闭合。
- [x] 文件范围、测试矩阵、release identity、停止条件和禁写路径明确。
- [x] 没有把 schema v3、签署、production readiness 或历史迁移夹带进当前目标。
- [x] 没有授权发布、安装、cache refresh、marketplace mutation 或 Multica 操作。
