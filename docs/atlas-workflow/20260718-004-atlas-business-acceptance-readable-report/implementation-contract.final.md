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

first_code_guard: required
first_code_not_applicable_reason:
first_code_slice: 新增 `plugins/atlas-workflow/scripts/codex-team-business-report`，复用现有 strict business artifact lint，从一个有效 standard accepted v2 bundle 确定性输出中文 Markdown 到 stdout
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

## 范围

### 目标

在不改变 BAF v2 machine semantics 的前提下，新增一个可重复验证的中文业务阅读层，使业务人员无需理解 Goal A/B、`evidence_refs`、`integration_path_id`、schema 枚举或命令日志，也能准确判断：

- 本次验收覆盖什么；
- 当前结论属于通过、有条件、失败还是无法验收；
- 基础质量与安全检查是否具备业务验收资格；
- 使用真实环境、批准模拟器、Mock、合成数据还是尚未执行；
- 外部系统/设备链路和业务人员实际操作是否分别闭环；
- 哪些登记材料支持判断，材料不覆盖什么；
- 当前阻断、后续事项和偏差是什么；
- 本报告是否仍与当前 JSON bundle 一致并具备业务交付完整性。

### 用户可见行为

- `business-acceptance-report.md` 成为自动生成的唯一业务主入口。
- 报告首屏使用固定中文结论、范围、技术资格和环境表达。
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

## 报告结构

可见正文顺序固定：

1. `# 业务验收报告：<business_goal>`
2. `## 一句话结论`
3. `## 本次验收范围`
4. `## 场景结果`
5. dual-goal 时的 `## 两类闭环`
6. `## 验收依据`
7. `## 未解决事项`
8. `## 证据与结论边界`
9. `## 技术明细`

### 一句话结论

首屏必须显示：

- 当前 verdict 的中文表达；
- `technical_gate_status` 的中文状态和业务影响；
- `business_acceptance_status` 的中文状态；
- 验收范围限定语；
- 验证环境或“当前合同未结构化记录验证环境”；
- 固定声明“本报告不等同于生产发布批准”。

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

每部分展示中文状态、环境模式、对应 evidence description 和可查看引用。通过结论使用同一路径的信息以业务语言表述为“两个闭环使用同一条已登记集成链路”，原始 path ID 只在技术明细。

### 验收依据

每项显示：

- description；
- 支持的 goal 或 scenario；
- source type 的中文标签；
- 已登记 result 的中文标签；
- 可安全访问的 local/external link，或 manual 引用说明。

renderer 使用“验收记录登记”“该材料用于支持”措辞，不自动写“已经证明现场事实”。未知 evidence result 显示“未识别结果，原始值见技术明细”，并使 presentation strict 失败。

### 未解决事项

- blockers：显示为阻断原因。
- required followups：显示为后续事项。
- acceptance report 的 open deviations：显示为报告登记偏差。
- deviation log 中 `open`：显示 description、severity、owner 和 resolution plan。
- deviation log 中 `accepted_risk`：单独显示为已接受剩余风险。
- resolved deviation 默认只在技术明细列出。

renderer 不把字符串 followup 猜成 owner、deadline 或风险等级，不把 deviation 与 followup 猜测关联。

### 证据与结论边界

固定声明：

- 报告依据已登记并通过合同检查的验收材料生成；
- 材料内容真实性仍由验收人与证据提供方负责；
- external evidence 未由本工具在线检查；
- 业务验收结论不证明生产环境持续稳定性或发布就绪。

### 技术明细

允许显示：task/schema version、raw verdict/status、closure mode、goal status、evidence IDs、integration path/mode、source type/path/result、scenario score、failed gates、source digest 和 renderer version。

## 固定中文映射

### Verdict

| Machine value | 业务表达 |
| --- | --- |
| `accepted` | 本次范围可以验收 |
| `conditionally_accepted` | 合同记录为有条件验收 |
| `rejected` | 已完成评估，但核心业务流程未达到验收要求 |
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
| `real` | 在真实环境或真实链路中验证 |
| `approved_simulator` | 在经批准的模拟环境中验证，不代表真实生产环境 |
| `mock` | 仅使用 Mock 验证，不能作为真实环境验收 |
| `synthetic` | 仅使用合成数据验证，不能作为真实环境验收 |
| `not_run` | 尚未执行链路验证 |

standard closure 没有结构化 integration mode 时固定显示：“当前合同未结构化记录验证环境；本报告不据此推断真实环境或生产可用。”

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

### Blocking diagnostic

| Diagnostic | 条件 |
| --- | --- |
| `PRESENTATION_CONDITION_MISSING` | verdict 为 conditional，但 `required_followups` 为空 |
| `PRESENTATION_CONDITION_METADATA_UNSTRUCTURED` | conditional 有 followup，但当前合同没有可关联的结构化 owner 与 deadline；当前 v2 因此不能成为完整签署材料 |
| `PRESENTATION_INTERNAL_TERM_LEAK` | `## 技术明细` 前的可见文本出现内部字段、Goal A/B 或原始枚举 |
| `PRESENTATION_EVIDENCE_RESULT_UNKNOWN` | 业务区需要显示 validator 尚未枚举的 evidence result |

### Warning

| Warning | 条件 |
| --- | --- |
| `PRESENTATION_ENVIRONMENT_UNRECORDED` | standard closure 没有结构化环境模式 |
| `PRESENTATION_EXTERNAL_EVIDENCE_UNVERIFIED` | 使用 external evidence；本工具不联网检查 |
| `PRESENTATION_MANUAL_EVIDENCE` | 使用 manual evidence；由人工验收责任链确认 |
| `PRESENTATION_SIMULATOR_SCOPE` | 使用 approved simulator；不得外推生产环境 |

### 业务区术语检查

扫描范围是去除 HTML comments 和 fenced code 后、`## 技术明细` 之前的可见文本，至少禁止以下 case-insensitive token：

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
```

技术附录不应用该禁令，否则会损害审计和可复现能力。

## 模板和 Team 使用规则

- `workflow/templates/business-acceptance-report.md` 改为“自动生成报告说明与固定可见结构”，不再作为手填结论模板。
- `business-evidence-map.md` 和 `business-verdict.md` 保留兼容文件名，但顶部明确标记为内部技术编制材料，业务人员应阅读生成报告。
- `plugins/atlas-workflow/skills/team/references/business-acceptance.md` 增加 human-first handoff：
  1. 业务 artifact 最终冻结后运行 `--write`；
  2. 交付业务人员前运行 `--check --presentation-strict`；
  3. final response 优先链接生成报告，原始 JSON 和技术索引按需提供；
  4. presentation failure 不改变 machine verdict，但阻止声称材料已可签署。
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
| 1 | strict-valid v2 bundle 可确定性输出中文报告到 stdout；invalid bundle fail closed | new CLI、artifact-lint export、focused fixture | `node --check`、business acceptance focused test |
| 2 | digest、local evidence identity、atomic write、stale/tamper、四态/环境/dual-goal、presentation strict 完成 | CLI、focused tests、必要 golden fixture | focused test 全矩阵、artifact-lint compatibility |
| 3 | 模板/Team reference/README 收敛，冻结审查，最后 cachebuster，完成全量集成 | templates、skill、README、manifest | plugin validate/integrity、contract_repo、contract.sh、docs/forbidden checks |

Phase 是调度边界，不新增 scope 或授权。全部实施可以在一个经过审查和验证的 Conventional Commit 中提交；方案文档提交与代码提交分开。

## 测试矩阵

### Focused renderer tests

- CLI help、必填参数、未知参数、互斥 mode、presentation flag 组合。
- standard accepted v2 stdout 与一份完整 golden Markdown。
- dual accepted real：两个闭环、独立 evidence、同链路业务表达。
- dual accepted approved simulator：明确模拟环境且没有真实/生产通过表述。
- conditional empty followups：普通 render/check 可读；presentation strict 报 `PRESENTATION_CONDITION_MISSING`。
- conditional non-empty followup：普通 render/check 可读；presentation strict 报 `PRESENTATION_CONDITION_METADATA_UNSTRUCTURED`。
- rejected 与 blocked 使用不同中文结论和技术资格说明。
- goal/status 为 failed、blocked、not run 的各分支。
- evidence source 为 local、external、manual；unknown result 的 strict failure。
- standard environment warning。
- visible business section 内部术语泄漏 failure；技术附录允许原始字段。
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
| AC-04 | accepted、conditional、rejected、blocked 四态准确区分 | yes | table-driven verdict assertions |
| AC-05 | technical gate 总状态和业务影响首屏可见 | yes | failed/blocked/not-run fixtures |
| AC-06 | integration mode 五态固定映射，approved simulator 不冒充真实环境或生产就绪 | yes | mode matrix + negative phrase assertions |
| AC-07 | dual-goal 两个闭环分别展示独立 evidence，并用业务语言说明同一路径 | yes | dual accepted golden + evidence assertions |
| AC-08 | evidence 使用保守措辞，固定说明内容真实性和 external 可达性边界 | yes | golden disclaimer assertions |
| AC-09 | 技术附录前无内部 token，技术附录保留 machine traceability | yes | visible-section leakage scanner |
| AC-10 | conditional 缺条件或结构化责任信息时 presentation strict 失败 | yes | two conditional negative fixtures |
| AC-11 | write target canonical、non-symlink、固定、原子；source 和其他 artifact 不变 | yes | target safety and before/after tree assertions |
| AC-12 | v1/non-business/artifact-lint CLI 兼容行为不变 | yes | existing regression suite |
| AC-13 | skill 和模板把生成报告设为唯一业务 handoff，不再要求业务人员阅读原始 JSON/技术 Markdown | yes | source assertions + relative links |
| AC-14 | plugin 内容冻结后生成唯一新 cachebuster，manifest/release identity 通过 | yes | official validate + integrity manifest/release gate |
| AC-15 | repo/full contract、docs、forbidden paths 与 Multica hard fingerprints 通过 | yes | final validation matrix |

## Edge Cases

| Case | Expected behavior | Required |
| --- | --- | --- |
| standard closure 没有 environment mode | 中文声明未结构化记录；warning，不推断真实环境 | yes |
| blocked/rejected 缺 acceptance report 或 evidence map，但 machine lint 允许 | 仍生成保守报告，明确哪些材料未登记 | yes |
| conditional 无 followup | 报告可读，presentation strict failure | yes |
| conditional 有 followup但无结构化责任信息 | 原文展示且声明缺失，presentation strict failure | yes |
| external/manual evidence | 不联网、不鉴真，显示边界 warning | yes |
| evidence result 为 validator 允许但 renderer 未识别的字符串 | 显示未识别，presentation strict failure | yes |
| local evidence 内容在报告生成后变化 | source digest 变化，check stale | yes |
| Markdown 被人工修改 | check tampered，不解析修改内容回写 JSON | yes |
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
- [x] 文件范围、测试矩阵、release identity、停止条件和禁写路径明确。
- [x] 没有把 schema v3、签署、production readiness 或历史迁移夹带进当前目标。
- [x] 没有授权发布、安装、cache refresh、marketplace mutation 或 Multica 操作。
