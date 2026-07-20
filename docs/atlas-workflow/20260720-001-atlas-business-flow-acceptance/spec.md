# 执行规格

workflow_id: `20260720-001-atlas`

## Goal

让业务验收人无需阅读原始 JSON、Trace 或数据库 dump，就能沿同一单据的完整时间线核对初始状态、UI 操作、请求、业务对象变化、外部输入、反向控制、最终状态和证据位置；同时保持 BAF v2 machine facts 与唯一 verdict 不变。

## Non-goals

- 不重跑或追溯改写 `20260719-005-ai-ui-intake` 的既有 accepted 历史。
- 不新增 BAF schema 体系、平行 verdict、业务评分、自动业务判断或签字审批。
- 不建设 Dashboard、报告服务、模板平台、presentation checker、digest/freshness/stale/tamper 状态机或 AI 自由摘要器。
- 不把原始 Trace、HAR、完整日志、API/DB dump 或批量截图提交到 Git。
- 不在 Atlas Core 建设对象存储客户端、上传服务、生命周期管理平台或组织级 retention policy；provider、bucket、权限和保留期限属于项目/组织配置与外部授权。
- 外部 export/retention、provider locator/resolver、fresh-root/hermetic rehydration、DR、长期防篡改和穷举矩阵均为 non-goal/experimental pending，不阻塞本合同完成。
- 不在 Core 写入 Sharp Cell 对象、状态、DOM、viewport、账号或业务路径。
- 实施仅限当前授权的仓库内 Core、项目 bridge、测试、必要文档与本地逻辑提交；不部署、不发布、不刷新安装态，也不修改或运行 Multica。

## Decision Boundaries

- review-card v2 是现有 review contract 的版本升级，不是 BAF machine authority；其全部 actual facts 必须指向当前 BAF evidence map 中同一 scenario 的 evidence ID。
- 项目 flow contract 声明业务对象角色、节点顺序、预期状态和 required evidence categories；Core 只校验结构、引用、完整性和确定性呈现。
- 项目独立 validator 决定 `same-business-object-chain`、状态转换、因果顺序和 no-mutation 等领域 claims；Core 不接受 adapter 自报替代 validator。
- 每个关键步骤至少覆盖 UI action、expected、actual facts、before/after state、result、evidence refs；合同要求的类别缺失时失败关闭。
- `review --format markdown` 与 `--format json` 使用同一个已验证内存模型；Markdown 不读取额外事实，不生成独立结论。
- owner decision 增加规范化 flow 内容 digest。当前引用或 flow 内容变化后，旧 decision validator 必须失败。
- 只有 BAF 当前记录 `integration_mode: real` 时材料才能称“真实运行”；其他模式按原值展示。
- Git 只保留可评审文本、代码、schema/validators、小型脱敏 fixtures/golden 和结论；真实大体积/敏感原件不进入 Git。

## 目标数据结构

review-card v2 至少包含：

- `document_chain`：领域中立的单据/任务节点、当前 run 中的 identity、初始状态和最终状态事实引用；
- `flow_steps`：有序步骤 ID、actor、operation、expected、before/after facts、evidence groups 和单步结果；
- `negative_controls`：被拒绝的输入、预期 no-mutation、实际拒绝与状态不变事实；
- `final_state`：UI、API、DB、audit/trace 的最终一致性引用；
- `convergence`：各 fresh-seed run 的 run ID、attempt、独立 identity 摘要和结果；
- `limitations`：未覆盖、未登记或当前无法判断的事项；
- `owner_decision`：owner、decision、当前 BAF/contract/image/evidence refs 和规范化 flow digest。

actual facts 使用 `evidence_id`、可选的 JSON Pointer/结构化 selector、显示标签和已验证结果；不允许在 card 中写无法由引用重现的自由文本业务结论。

## Acceptance Criteria

| ID | Criterion | Verification |
| --- | --- | --- |
| AC-01 | review-card v2 能表达有序单据链、状态前后值、正向步骤、反向控制、最终一致性和 convergence | schema/fixture 正向测试 |
| AC-02 | 每个 actual fact 必须引用同一 task/scenario 当前 evidence map 中的 evidence ID；跨场景、未知 ID、path escape、symlink 和 stale digest 均失败 | negative fixtures |
| AC-03 | required flow step 缺少 UI、network/backend、state 或 audit/trace 中项目声明的必需类别时，不得形成业务可验收材料 | completeness matrix |
| AC-04 | 图片不得成为状态转换或因果关系的唯一证据；只提供截图的 flow 必须失败或显示“当前无法判断” | screenshot-only negative fixture |
| AC-05 | invalid callback 等 required negative control 必须同时证明拒绝结果和关键对象 no-mutation | negative-control fixture + Sharp Cell validator |
| AC-06 | domain join 和状态转换仍由独立 project validator 判定；adapter 或 renderer 自报 passed 不能满足 claim | validator tamper tests |
| AC-07 | `review --format markdown` 与 JSON view 来自同一 validated model，展示目标、单据树、完整时间线、逐步预期/实际/证据、反向控制、最终状态、三次收敛和限制 | golden + semantic assertions |
| AC-08 | 缺失事实严格显示“未登记”，记录不足显示“当前无法判断”；不得由 AI 或文件名推断 | missing/unknown fixtures |
| AC-09 | `integration_mode != real` 时不得出现“真实运行/真实业务验收”陈述 | 最小 integration-mode fixtures |
| AC-10 | owner decision 绑定 contract、verdict、evidence map、scenario、图片、实际 evidence refs 和规范化 flow digest；引用或 flow 变化使判断失效 | 最小 current-reference tamper fixtures |
| AC-11 | BAF v2 JSON/JSONL 和 `business-verdict.json` 的 schema/authority 不变，review 命令不产生 verdict | source scan + BAF regression |
| AC-12 | Core 源码不出现 Sharp Cell 领域对象、固定 viewport、DOM 或状态路径；项目 flow contract 决定领域展示 | Core forbidden-value scan |
| AC-13 | Sharp Cell 材料按同一 WorkOrder → LineTask → DeviceTask → assignment 链展示 UI 创建/发布/启动、invalid no-mutation、valid callback、UI running readback | Sharp Cell material review |
| AC-14 | 优先复用 run29/run30/run31；若现有证据无法满足任何 required 节点，材料明确阻断并列出缺口，不补写、不降级 gate | migration dry-run |
| AC-15 | 现有 review-card v1 仍可只读校验，但不得被新流程称为“完整业务流转验收材料” | compatibility tests |
| AC-16 | forbidden paths、Multica fingerprints、secret hygiene 和 artifact canonical-path 规则不变 | final audit |

## Verification Plan

- Atlas focused：扩展 `bash workflow/tests/contract_web_acceptance.sh`，覆盖 v2 schema、完整性、Markdown、missing、mode、tamper、owner flow digest 和 v1 compatibility。
- BAF regression：`bash workflow/tests/contract_team_business_acceptance.sh`、`bash workflow/tests/contract.sh`。
- Sharp Cell：使用复制的 run29/run30/run31 做只读 migration dry-run；运行项目 BAF closure tests 和现有五个 validators，不启动新真实 run，除非实施阶段发现 required evidence 确实未采集且用户另行授权。
- 人工材料验收：acceptance owner 能从 Markdown 找到完整单据树、每个节点的预期/实际/证据、invalid/valid 对照和最终一致性；没有只靠最终图片得出业务结论。
- 文档与范围：implementation-contract strict lint、contract-index lint、relative Markdown links、`git diff --check`、forbidden paths 和 Multica fingerprints。

## 实施阶段

1. Phase 1：实现 review-card v2 最小协议、校验和 Markdown 输出；使用通用 fixture 证明一条两节点业务流，不改 BAF verdict。
2. Phase 2：补齐 evidence pointer、类别完整性、flow digest、owner decision 失效和最小确定性负例；不建设穷举矩阵。
3. Phase 3：Sharp Cell project flow contract/bridge 登记 granular evidence，并从 run29/run30/run31 生成新的无 owner decision、明确 blocked 的 v2 review bundle；缺失节点列出精确缺口，不因存储平台未建设而阻塞材料生成。
4. Phase 4：独立 reviewer 与业务 owner 审阅完整 Markdown；只有 owner 基于当前完整 flow 材料重新登记判断，才改变新 bundle 的业务验收状态。
5. Phase 5：运行 Atlas/Sharp Cell 回归、forbidden-path 审计并形成适中本地逻辑提交；不 push、PR、安装、部署或发布。

## Stop Conditions

- 继续需要修改 BAF v2 machine semantics、创建第二 verdict 或让 Markdown成为新事实源。
- 无法以 domain-neutral 协议表达 Sharp Cell 流程，必须在 Core 硬编码项目对象或状态。
- 现有证据缺少 required 业务节点，而补采需要启动服务、浏览器或改变外部状态且未获授权。
- 业务 owner 对 required 节点、预期状态或允许的业务路径存在未解决歧义。
- 实施结束 Phase 1 仍只有 schema、文档或 fixtures，没有可运行 `review --format markdown` 行为。
