# Atlas 单据完整业务流转验收材料最终实施合同

workflow_id: 20260720-001-atlas
task_id: 20260720-001-atlas
title: Atlas 业务流转验收材料增强
contract_status: final
current_authoritative_contract: ./implementation-contract.final.md
created: 2026-07-20
finalized: 2026-07-20
contract_semantics_version: 1
work_type: implementation
first_code_guard: required
first_code_not_applicable_reason:
product_ui_gate: not_applicable
product_ui_not_applicable_reason: 本合同改变的是 headless Web acceptance review CLI、证据协议和 human-first Markdown view，不修改被测产品 UI；真实 served UI 仍是输入 evidence 的硬门禁，由前序 Web acceptance contract 和项目 reference pack 负责。

## Scope

### Goal

在不改变 Atlas BAF v2 machine semantics 和唯一 verdict 的前提下，把当前已登记的 Web run evidence 组织成可供业务验收人直接审阅的完整单据流转材料：同一单据从初始状态开始，依次展示真实 UI 操作、请求与后端结果、关联业务对象的状态前后值、外部输入、必须的反向控制、最终 UI/API/DB/audit 一致性、三次 fresh-seed 收敛及每个节点的可定位证据。支持 accepted durable baseline 的原始材料还必须以版本化 manifest 绑定稳定 locator、内容摘要、敏感级别和 retention policy，并能脱离原本机路径恢复后重新验证。

### Non-goals

- 不追溯改写 `20260719-005-ai-ui-intake` 的 accepted 历史，不把其“框架跑通”扩大为完整产品业务验收。
- 不新增或复制 BAF schema 体系、business facts、evidence authority、scorecard、最终 verdict、签字或发布批准。
- 不让 AI、Markdown、截图、文件名、renderer 或 adapter 自报产生业务事实或 business pass。
- 不建设 Dashboard、常驻报告服务、模板平台、presentation checker、中文报告 digest/freshness/stale/tamper 状态机或自动鉴真平台。
- 不在 Core 写入 Sharp Cell 名称、`WorkOrder`、`LineTask`、`DeviceTask`、assignment、状态值、DOM、账号、URL、port、browser 或 viewport。
- 不提交原始 Trace、视频、HAR、完整日志、API/DB dump、callback raw payload、批量截图或失败中间输出到 Git。
- 不在 Core 实现 S3/OSS/制品库客户端、上传/删除服务、bucket 生命周期管理、组织访问控制或固定 retention 天数；storage provider、credentials、policy 和真实 mutation 属于项目/组织所有。
- 不默认重跑 run29/run30/run31；新真实 run、服务启动或浏览器执行必须在证据缺口确认后获得相应实施授权。
- 不 push、不建 PR、不安装、不刷新 cache/marketplace/workflow runtime、不部署、不发布。
- 不修改、运行、测试、同步、迁移或删除 Multica。

### Files or surfaces likely affected

Atlas Forge owned paths:

- `workflow/bin/codex-web-acceptance`
- `workflow/bin/lib/codex-web-acceptance/review.js`
- `workflow/bin/lib/codex-web-acceptance/contracts/**` 中 review-card v2/flow contract schema 与类型
- `workflow/bin/lib/codex-web-acceptance/contracts/**` 中 provider-neutral artifact manifest/restored-root schema 与类型
- 必要的 domain-neutral Core validator/helper；不得含项目领域常量
- `workflow/templates/web-scenario-review-card.md`
- `workflow/tests/contract_web_acceptance.sh`
- `workflow/tests/contract_team_business_acceptance.sh` 与 `workflow/tests/contract.sh` 的必要回归接入
- `workflow/README.md` 和相关 Atlas plugin reference 文档

Sharp Cell owned paths，仅在 Phase 3 获实施授权后：

- `/home/gewu/work/sharp-cell/acceptance/web/**` 中 project flow contract、BAF bridge 和项目测试
- 不修改产品 UI/API/DB/worker，除非 migration dry-run 证明存在当前材料不可达的证据缺口，并另行获得 focused repair 授权

### User-visible behavior

- 业务验收人获得一份中文 Markdown，先看到验收对象和单据关联树，再沿时间线逐步核对 actor、操作、预期、实际状态变化和证据。
- 每个关键节点把 UI、network、backend/API、DB、audit/trace、external input 分类展示；没有材料时明确写“未登记”或“当前无法判断”。
- invalid callback 等反向控制与 valid callback 正向路径并排展示，能够确认被拒绝输入未改变关键单据状态。
- 最终截图只是最终 UI readback 的一个证据，不再单独代表业务符合。
- owner 只有在完整 flow material 通过当前引用校验后才能登记判断；材料变化后旧判断自动失效。
- accepted durable baseline 的 evidence link 不再只指向本机 `.codex` 路径；材料显示稳定 locator、retention class 和 sensitivity，并能在恢复演练后证明内容未丢失或被替换。

## First Code Slice Guard

- first_code_slice: 修改 `codex-web-acceptance review` 的命令行行为，使其校验 v2 输入并通过 `--format markdown` 输出至少两个关联单据节点、一个状态转换步骤和对应的当前引用；命令继续只返回校验结果，不产生 verdict。
- first_code_slice_kind: cli
- first_code_owner: 单一 Atlas Forge implementer
- first_code_verification: `bash workflow/tests/contract_web_acceptance.sh` 至少包含 v2 正向 fixture、截图-only 负例、未知 evidence ID 负例、Markdown 关键语义断言和 `business-verdict.json` 零写入断言。
- allowed_contract_gate_only_until: 本合同获明确实施授权之前
- stop_if_no_code_by_phase: Phase 1
- gate_parallelization_or_deferral_plan: flow schema、Sharp Cell 事实映射和 golden 可并行准备，但 Phase 1 必须结束为可运行 review CLI 行为；不得以合同、schema、fixture、文档或 evidence-only 材料替代该切片。
- Ordering rule: schema 和 fixture 只能服务同一 Phase 1 可执行行为，不得扩张成独立平台。
- Safety rule: first code slice 不授权弱化 BAF strict lint、owner current-reference check、secret policy、canonical path、真实 UI evidence 或 forbidden paths。

## Product/UI Acceptance Gate

- reason: 本合同没有被测产品 UI 变更；Markdown 是 headless review CLI 的确定性输出。
- retained_real_ui_boundary: 只有上游 BAF/current evidence 登记 `integration_mode: real` 且真实 served UI hard gates 已通过时，材料才可称“真实运行”。Markdown、schema、fixtures、CLI pass 或截图本身不能替代真实 served UI evidence。
- reverse_guard: 本合同的材料完整性通过不替代项目业务 validator、API/DB/audit join、callback 安全或 Web technical gate。

## Architecture And Protocol

### Authority model

- BAF v2 JSON/JSONL 当前记录继续是唯一 machine facts；现有 schema、validators 和 strict artifact lint 决定 BAF bundle 与 closure 合法性。
- `business-verdict.json` 继续是唯一最终 business verdict；`review`、review-card v2 和 Markdown 都不得产生同义 `finalStatus`、score 或 verdict。
- review-card v2 是当前 BAF/evidence 的结构化 derived view。它只能引用当前 task/scenario 的 evidence ID 和可验证的 structured facts。
- Markdown 使用与 JSON review 相同的 validated in-memory model 确定性生成；不得读取额外文件、调用 AI 或补充未登记陈述。

### Project flow contract

- 项目以版本化 JSON 声明领域中立的 `document_roles`、`required_steps`、允许的有序关系、required evidence categories、negative controls、final consistency 和 convergence 要求。
- Core 只理解通用 role/step/category/claim，不理解项目对象名称或状态机。
- 项目 contract 中的展示 label 可以是 `WorkOrder` 等领域名，但这些值不得进入 Core 源码或默认 fixture。
- 项目 flow contract 只声明预期；实际状态、identity 和结果必须来自已登记 evidence 与独立 validator。

### Review-card v2

必须包含：

- `schema_version: 2`、task/scenario/title、当前 BAF refs/digests 和 `integration_mode`；
- `document_chain`：有序节点，每个节点包含 project role/label、identity fact ref、initial state fact ref 和 final state fact ref；
- `flow_steps`：稳定 step ID、actor、operation、expected、before/after actual facts、result 和按类别分组的 evidence refs；
- `negative_controls`：input/action、expected rejection/no-mutation、actual rejection/no-mutation facts 和证据；
- `final_state`：UI、backend/API、DB、audit/trace 的最终一致性事实引用；
- `convergence`：每次 run 的 run ID、seed/attempt/identity 摘要引用和结果；
- `limitations`：明确未覆盖、未登记和当前无法判断项；
- 可选 `owner_decision`，其引用规则见后文。

actual fact 只能由 `evidence_id` 加可选 JSON Pointer/结构化 selector 定位；显示 label 来自 flow contract，显示 value 来自已验证 evidence。card 不允许携带无法从当前引用重现的自由文本 actual conclusion。

### Evidence categories and completeness

- 通用类别为 `ui_action`、`network`、`backend_api`、`database`、`audit_trace`、`external_input`、`visual`；项目 flow contract 为每个步骤选择 required 子集。
- 图片属于 `visual`，不能单独满足 state transition、object identity、causality 或 no-mutation claim。
- 每个 required step、negative control、final-state join 和 convergence row 必须满足项目声明的 categories；缺失、unknown、跨 scenario 或结果非 passed 时失败关闭，除非该项按合同明确允许显示“未登记/当前无法判断”且不参与 accepted 所需 claim。
- evidence path 必须 canonical、regular、non-symlink 并位于当前 task artifact；现有 run evidence index/digest 继续负责底层文件完整性。

### Evidence lifecycle and storage boundaries

- 三层存储是 required boundary：Git 保存规则、代码、schema、validators、项目 flow contract、小型脱敏 fixtures/golden、artifact manifest/digests 和 phase conclusion；durable artifact storage 保存 accepted 所需真实原件；ephemeral storage 保存失败重试、调试和 migration 中间产物。
- Git 禁止新增真实 run 的 Trace、HAR、video、API/DB dump、callback raw payload、全量日志和批量截图；少量截图或 JSON 只有在脱敏、体积受控且作为稳定 test/reference golden 时才能提交。
- durable storage 必须 immutable 或 versioned、访问受控、支持项目 retention policy，并能按无凭据稳定 locator 取回；Git LFS 不能自动满足 secret、权限、删除和 retention 要求，因此不是默认 raw evidence store。
- Core 不上传、不删除、不选择 provider、不解析 credentials、不配置 bucket lifecycle。真实 export/restore 是独立外部 mutation，必须由项目/组织 owner 提供 target、访问策略、resolver/export argv 和明确授权。
- Core 提供 provider-neutral manifest schema 和 restored-root 校验。没有外部权限时，只能以 hermetic local fixture 验证协议，不能声称 Sharp Cell 已形成 durable baseline。

### Durable artifact manifest

- 每个支持 accepted durable baseline 的 raw evidence 必须有 manifest entry：`evidence_id`、`scenario_id`、`run_id`、`attempt`、`sha256`、`size_bytes`、`media_type`、`artifact_locator`、`sensitivity_class`、`retention_class`、`retention_policy_ref`。
- `artifact_locator` 只定位内容，不产生业务事实；evidence identity/result 仍来自 BAF/evidence，完整性仍由 SHA-256、size、run/attempt 和 strict validators 决定。
- locator scheme allowlist、resolver argv 和 retention class 到实际期限的映射来自 project config；Core 不硬编码 provider 或期限。
- locator 禁止 credentials、query token、home/worktree 绝对路径和指向原 `.codex/workflow`/`.codex/visualizations` 的 `file://`；unknown scheme、空 policy ref、无效 media type、负数/不符 size 或 digest mismatch 均失败关闭。
- `sensitivity_class` 和 `retention_class` 是项目 policy key；Core 只校验它们非空并与当前 project policy/allowlist 对应，不自行决定分类。
- Manifest 本身可进入 Git 或 accepted bundle，但不能包含 credential、临时 signed URL、客户 secret 或原始敏感内容。

### Rehydration gate

- accepted durable baseline 必须从 manifest locators 取回到一个新建、canonical、非 symlink、非源 artifact 子目录的临时 restored root；禁止通过 bind/symlink 或回退原本机路径伪造恢复。
- 项目/组织 resolver 负责外部读取；Core 只在 restored root 逐文件核对 evidence ID、run/attempt、relative layout、SHA-256、size 和 media type，并重新运行 review-card v2、项目 required validators 与 strict closure。
- 恢复测试必须在原 `.codex/workflow` 和 `.codex/visualizations` 路径不可作为输入的条件下通过；只检查 locator 可访问、HTTP 200 或对象存在不能满足门禁。
- export 成功但 restore/digest/strict review 失败时，durable baseline 为 blocked；不得用仍存在的本地源副本兜底判定通过。

### Deterministic Markdown view

- `review --format json` 输出结构化 validation result；`review --format markdown` 输出中文 human-first material。两者先运行同一 validator。
- Markdown 固定包含：场景与范围、单据关联树、初始状态、完整流转时间线、逐节点预期/实际/证据、反向控制、最终一致性、三次 convergence、限制、当前 BAF 状态和 owner decision。
- 每个 evidence link 显示 evidence ID、类别、结果和 bundle 内相对路径；不内嵌 secret 或大体积 raw data。
- durable evidence link 同时显示稳定 locator、retention class 和 sensitivity；临时 signed URL、credential 或本机绝对路径不得进入 Markdown。
- 缺失写“未登记”，证据不足写“当前无法判断”；不得用“通过”“符合”掩盖局部缺口。
- 非 `real` integration mode 必须如实显示具体模式，禁止称真实运行、真实链路或真实系统验收。

### Owner decision binding

- owner decision 继续只接受“符合”“不符合”“需修改”，只确认人工判断已针对当前引用登记；Core 不替 owner 判断业务。
- v2 decision 除现有 contract/verdict/evidence-map/scenario/image/evidence refs 外，必须绑定规范化 `flow_digest`。
- `flow_digest` 只覆盖 owner 判断前的结构化业务 flow 内容，不包含 owner decision 自身，避免自引用。
- flow step、document identity/state、negative control、final state、convergence、limitations 或引用任一变化后，旧 decision 必须以 digest mismatch 失败。
- 从 v1 升级到 v2 不继承旧 owner decision。新的 review bundle 初始必须 blocked，待 owner 查看完整 Markdown 后重新登记。

### Compatibility

- review-card v1 保持只读验证兼容，避免破坏历史 bundle。
- v1 输出必须明确标识 `material_completeness: legacy_summary_only`，不得称为完整业务流转验收材料。
- v2 是新业务验收材料的 required version；不得自动把 v1 card 升级为已判断的 v2 card。

## Phases

### Phase 1 — 可运行 v2 review thin slice

- 实现最小 schema/version dispatch、v2 validator 和 Markdown 输出。
- 通用 fixture 至少包含两节点 document chain、一个状态转换和多类别 evidence。
- 保持 BAF verdict 零写入，v1 compatibility 不回归。

### Phase 2 — 完整性与 owner 绑定

- 完成 fact pointer、canonical path、category completeness、negative controls、final consistency、convergence 和 missing/unknown 语义。
- 实现规范化 flow digest 与 owner decision current-reference 验证。
- 完成 tamper、cross-scenario、screenshot-only、mode、secret 和 stale reference 负向矩阵。

### Phase 3 — Artifact lifecycle thin slice

- 实现 provider-neutral manifest schema、Git/durable/ephemeral 分类校验、locator policy 和 restored-root digest/identity 校验。
- 使用 hermetic fixture 在新的临时目录完成 restore rehearsal；不连接、不创建也不修改真实外部 storage。
- staged diff gate 阻止 raw Trace/HAR/video/API/DB/callback/log/bulk screenshot 意外进入 Git。

### Phase 4 — Sharp Cell reference migration

- 项目维护 flow contract 和 granular evidence bridge；Core 零 Sharp Cell 常量。
- 只读解析 run29/run30/run31，登记同一 WorkOrder → LineTask → DeviceTask → assignment 链、UI 操作、invalid no-mutation、valid callback 和 UI running readback。
- 生成无 owner decision 的新 blocked bundle、Markdown 和 durable manifest；旧 accepted bundle可恢复归档，不追溯修改。
- 任一 required 节点缺失时列出具体 evidence gap 并停止，不补写、不把旧总 run pass 当成节点证据。
- 若用户尚未选择 storage target 或授权 export，材料保持 `durability_status: pending_external_authority`，不得称 accepted durable baseline。

### Phase 5 — Durable export、独立复核与人工判断

- 只有在 storage target、access policy 和外部写权限明确后才执行真实 export；export 完成后从新的临时目录 restore，并在不引用源路径的情况下重跑 digest、v2 review、项目 validators 和 strict closure。
- 独立只读 reviewer 检查 authority、领域隔离、材料完整性、正反路径和历史保留。
- 只有在 acceptance owner 实际查看当前完整 Markdown 后，才可登记新的 v2 decision。
- owner 未判断、判断“不符合/需修改”或任何引用变化均保持 blocked/rejected，不得 accepted。

### Phase 6 — 回归与收口

- 运行所有 required validation rows、forbidden-path 审计和 Multica fingerprints。
- Atlas 与 Sharp Cell 分别形成适中、可回退的本地逻辑提交；没有 push、PR、安装、部署或发布授权。

## Acceptance Criteria

| ID | Criterion | Required | Verification |
| --- | --- | --- | --- |
| AC-01 | review-card v2 表达有序 document chain、flow steps、negative controls、final state、convergence 和 limitations | yes | schema/positive fixtures |
| AC-02 | actual facts 只能引用当前 task/scenario 已登记 evidence；unknown、cross-scenario、stale、path escape、symlink 均失败 | yes | negative matrix |
| AC-03 | 项目声明的 required evidence categories 缺失时失败关闭 | yes | completeness fixtures |
| AC-04 | screenshot-only 不得满足 identity、transition、causality 或 no-mutation | yes | screenshot-only fixture |
| AC-05 | required negative control 同时证明 rejection 和关键状态 no-mutation | yes | invalid-input fixtures + project validator |
| AC-06 | domain join/transition/causality 由 adapter 外独立 validator 判定 | yes | validator spoof/tamper tests |
| AC-07 | JSON 与 Markdown 使用同一 validated model，Markdown包含完整业务流转所需章节 | yes | golden semantic assertions |
| AC-08 | 缺失/不足严格显示“未登记/当前无法判断”，无 AI 推断或自由 actual conclusion | yes | missing/unknown tests + source scan |
| AC-09 | 非 real 模式不得称真实运行或真实业务验收 | yes | integration-mode matrix |
| AC-10 | owner decision 绑定规范化 flow digest；flow 或当前引用变化使旧判断失败 | yes | owner tamper matrix |
| AC-11 | BAF v2 semantics 和唯一 `business-verdict.json` 不变，review 零 verdict 写入 | yes | BAF regression + write audit |
| AC-12 | Core 无 Sharp Cell 领域、DOM、账号、URL、browser 或 viewport 常量 | yes | forbidden-value source scan |
| AC-13 | Sharp Cell v2 材料展示同一单据链的 UI 创建/发布/启动、invalid no-mutation、valid callback 和 UI running readback | yes | migration material review |
| AC-14 | 优先复用 run29/run30/run31；缺 required evidence 时明确 blocked，不补写或降级 gate | yes | migration dry-run |
| AC-15 | v1 历史只读兼容并标识 legacy summary，不自动继承 owner decision | yes | compatibility fixtures |
| AC-16 | secret、canonical path、forbidden paths 和 Multica fingerprints 不回归 | yes | security/range audit |
| AC-17 | Git 只保留规则、manifest/digest、结论和小型脱敏 fixtures/golden；真实 raw Trace/HAR/video/API/DB/callback/log/bulk screenshots 不进入 Git | yes | staged path/type/size/secret audit |
| AC-18 | durable manifest entry 完整记录 evidence/scenario/run/attempt identity、digest、size、media type、稳定 locator、sensitivity、retention class 和 policy ref | yes | manifest schema/negative fixtures |
| AC-19 | locator credentials、本机绝对路径、home/worktree `file://`、unknown scheme、无 policy、digest/size mismatch 均失败 | yes | locator/manifest negative matrix |
| AC-20 | 从 locator 恢复到新临时目录后，不依赖源路径即可通过逐文件完整性、v2 review、项目 validators 和 strict closure | yes | hermetic rehydration + Sharp restore rehearsal |
| AC-21 | Core 不实现 provider upload/delete/lifecycle，实际 external export 只有获得 target/access/权限后执行 | yes | source scan + authorization audit |

## Real Validation Plan

| Row | Target | Command or action | Expected result | Phase conclusion evidence |
| --- | --- | --- | --- | --- |
| V-01 | Atlas review focused | `bash workflow/tests/contract_web_acceptance.sh` | v1/v2 正负协议、Markdown、flow digest、mode 与 tamper 全部通过 | `evidence/phase-review-report.md` |
| V-02 | BAF regression | `bash workflow/tests/contract_team_business_acceptance.sh` | BAF schema、strict lint 与唯一 verdict 无回归 | 同上 |
| V-03 | Atlas integration | `bash workflow/tests/contract.sh` | 全合同通过 | 同上 |
| V-04 | Core isolation | 扫描 Core owned paths 中 Sharp Cell 名称、对象、状态、`1366x768`、DOM/URL 常量 | 零项目常量 | 同上 |
| V-05 | Markdown semantics | 对 v2 golden 断言固定章节、单据树、逐节点 expected/actual/evidence、negative control、final state、convergence 和 limitations | 全部存在且来自 validated model | 同上 |
| V-06 | Sharp migration | 使用 run29/run30/run31 的复制 artifacts 运行只读 migration dry-run | 完整则生成 blocked v2 bundle；不完整则精确列 evidence gaps | Git 外 migration artifact + concise index |
| V-07 | Sharp validators | 运行既有 Core `check-run`、五个独立 validators 和项目 BAF closure tests | 既有 technical authority 不回归 | Sharp phase conclusion |
| V-08 | Owner current refs | 对 flow、scenario、verdict、map、image、evidence refs 分别做单点 tamper | 所有 stale decision 失败 | focused test output |
| V-09 | Human review | acceptance owner 从 Markdown 定位同一单据全链、invalid/valid 对照和每个 evidence link | owner 能据此判断；判断仍由 owner 本人登记 | owner decision evidence |
| V-10 | Docs | implementation-contract strict lint、contract-index lint、relative Markdown links | 全部通过 | clarify/final conclusion |
| V-11 | Diff | Atlas/Sharp 分别 `git diff --check` 与 owned/forbidden path audit | 无越界或格式问题 | final conclusion |
| V-12 | Multica | 只读比较 `HEAD:plugins/multica-sdlc` 与 `HEAD:.agents` fingerprints | 与实施前一致且未运行 tests/runtime | final conclusion |
| V-13 | Git evidence boundary | staged path/type/size/secret audit，并对 raw evidence patterns 做负向 fixture | 真实 raw evidence 未进入 Git | phase/final conclusion |
| V-14 | Manifest/locator | 对缺字段、credential URL、local/home path、unknown scheme、policy/digest/size mismatch 运行矩阵 | 全部失败关闭 | focused test output |
| V-15 | Rehydration | 从 hermetic locator 恢复到 `mktemp -d` 后校验；真实 Sharp export 获权后做同类 rehearsal | 不引用源路径仍通过 digest/v2 review/validators/strict closure | restored artifact + concise conclusion |

## Evidence Budget

- Git 只保留代码、schema、必要 fixtures/golden、项目 flow contract、phase conclusion、evidence index、gate checklist 和一份示例 human-first Markdown。
- 原始 run JSON、Trace、video、HAR、network、日志、API/DB dump、callback payload 和批量截图放 Git 外 durable artifacts；失败 retry、调试和 migration 中间输出放 ephemeral artifacts。
- Git 中的 accepted evidence manifest 只包含无 secret 的 metadata、digest、稳定 locator 和 policy keys；不包含临时 signed URL 或访问凭据。
- 每 phase 目标不超过 10 个 Git evidence 文件和 1 MB；例外必须在 phase review 中解释。

## Edge Cases

| Case | Expected behavior | Required |
| --- | --- | --- |
| 只有最终截图和 run passed | 不得称完整业务流转验收；缺口明确显示 | yes |
| document identity 来自不同 run 或 scenario | join validation failed | yes |
| 状态 after 正确但没有 before/causal evidence | transition claim failed 或当前无法判断 | yes |
| invalid callback 被拒绝但没有 no-mutation evidence | negative control incomplete | yes |
| UI running 与 DB/API/audit 任一不一致 | final consistency failed | yes |
| Markdown 文本被手改 | 重新生成或 digest/current-reference validation failed | yes |
| flow contract 增加 required step | 旧 card/owner decision stale，重新生成并判断 | yes |
| v1 card 历史读取 | 可校验但标识 legacy summary，不升级为 v2 accepted | yes |
| 现有三次 run 缺少 required evidence | migration blocked；新 run 需另行授权 | yes |
| raw Trace/HAR/video 被 staged | Git evidence boundary failed | yes |
| locator 只指向当前本机绝对路径 | durability gate failed | yes |
| export 完成但新目录 restore digest mismatch | durable baseline blocked；不回退源副本 | yes |
| retention class 没有 project policy mapping | manifest invalid | yes |
| 用户未选择 storage target/权限 | 实施可完成 hermetic 协议，但 Sharp durable export 停止等待授权 | yes |

## Failure And Stop Conditions

- 需要修改 BAF v2 machine semantics、创建第二 verdict 或让 Markdown成为权威事实源。
- 需要在 Core 硬编码项目对象、状态或 DOM 才能表达流程。
- Phase 1 结束仍没有可执行 v2 review/Markdown 行为。
- Sharp migration 发现 required evidence 未采集，继续需要启动真实服务、浏览器、新 run 或外部状态变化但没有相应授权。
- Sharp durable export 需要 storage provider/target、credentials/access policy、retention mapping 或外部写入，但尚未由用户/组织 owner 提供和授权。
- acceptance owner 对 required 业务节点、预期状态或允许路径存在未解决歧义。
- 实施需要 push、PR、安装、刷新 runtime/cache/marketplace、部署、发布或 Multica 变更。
- Required safe fallback: 缺失事实保持 blocked，并输出“未登记/当前无法判断”和精确 evidence gap；不得自动降级为 summary pass。

## Completion Check

- [ ] Scope stayed inside the contract
- [ ] Phase 1 delivered executable review-card v2 and Markdown behavior
- [ ] Required acceptance criteria passed
- [ ] Required validation rows have evidence
- [ ] Sharp Cell material shows the complete same-document flow or explicitly blocks on gaps
- [ ] Any v2 accepted verdict uses a fresh owner decision bound to current flow digest
- [ ] Git contains no prohibited raw evidence and the accepted manifest contains no credential or temporary signed URL
- [ ] Durable baseline was restored into a new directory and revalidated without source-path fallback
- [ ] Historical v1/accepted artifacts remain recoverable and unmodified
- [ ] Residual risks are recorded
