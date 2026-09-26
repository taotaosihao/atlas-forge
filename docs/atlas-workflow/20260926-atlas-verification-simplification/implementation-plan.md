# Atlas 验证选择、诊断退出与材料默认行为优化方案

- 日期：2026-09-26
- 状态：用户于 2026-09-26 以“修复”授权后，源码修复与专项验证已完成；最终集成结果由任务 `20260926-002-atlas` 记录。安装、发布和真实模型验证不在授权内。
- 源码基线：`7820313ba38c763bc67d5eb0eda69e9ca99b8f67`
- 目标：修改 Atlas 框架自身，减少以后任务中的无关前检、无消费者测量、重复验证和已结束诊断的持续维护；保持当前必需验收与安全边界。
- 本文是唯一方案正文。讨论与原始会话证据保留在 Git 外，不创建机器合同、配套证据包或新工作流状态。

## 1. 结论与第一性原理

Atlas 应帮助完成用户目标。验证的价值来自它支持的具体判断：当前结果是否满足要求、下一步动作是否安全、某个不确定性是否会改变实现选择。检查数量、报告数量、采样完整度和测试通过率本身都不是交付目标。

本次的核心问题是责任混合：用于解释问题的诊断进入必需验收失败链；随后为保证诊断可靠又增加前检与自测；已经回答的问题仍由当前 runner、历史 hash 和默认测试长期维护。框架已有“最小验证”规则，但选择条件不具体，部分规则到 review 阶段才加载，模板和 helper 还在引导额外材料。

采用三个相连的修改单位：

1. 将验证选择、失败传播、证据复用和诊断退出放在一处短的共同指导中，执行前按需加载，替换已有泛化或重复语句。
2. 删除模板默认的 phase 证据套餐，复用实际选中的结果载体。
3. 修正 Task 无条件建档的入口要求，并让 `ready` 正确支持已有的单份 `clarify.md`。

不建设检查登记、收益评分、诊断生命周期状态机或自动影响分析器。对于任意业务检查是否有价值，框架不能脱离当前目标自动裁决；runtime 只校验它能够可靠判断的材料存在性与格式边界。

## 2. 已观察事实与推断边界

| 事实 | 当前源码或证据 | 对方案的意义 |
| --- | --- | --- |
| FMS 曾有未参与当前性能判定却能阻断整组的初始化 CPU/WAL、重复 sampler、负结果已结束仍锁当前 SQL 的 CTE 实验，以及迁移失败后的额外 SQL 写入 | Git 外报告：`/Users/sihao/.codex/workflow/artifacts/20260925-001-u-051dbef59206/verification-complexity-review-20260926.md`；报告记录的是修改前状态 | 用于提炼 Atlas 执行与 review 应处理的责任，不再以本方案修改 FMS |
| Task 只笼统要求先专项、后按影响扩大；对重复测试与无决策价值实验的具体指导主要在可选 code review reference | [Task](../../../plugins/atlas-workflow/skills/task/SKILL.md)、[code-review](../../../plugins/atlas-workflow/skills/team/references/code-review.md) | 在选择检查和编写 harness 时就提供共同规则，不能只依赖事后 review |
| Task Routing 第一步无条件要求找不到任务就 create/start；同文件和 CW 又要求有价值时才建档 | [Task](../../../plugins/atlas-workflow/skills/task/SKILL.md)、[CW](../../../plugins/atlas-workflow/skills/cw/SKILL.md) | 原位消除入口冲突，不把建档当使用技能的前提 |
| init runtime 生成 context/spec/analysis 骨架；ready 默认检查三件且不接受 clarify，scaffold-clarify 则生成 clarify.md | [task/runtime.js](../../../workflow/bin/lib/codex-workflow/task/runtime.js)、[readiness.js](../../../workflow/bin/lib/codex-workflow/verification/readiness.js)、[scaffold.js](../../../workflow/bin/lib/codex-workflow/artifact/scaffold.js) | 这是确定的工具接口缺口，可以用公开 CLI 的隔离测试证明修复 |
| 两个 implementation-contract 模板预填 phase-review-report 路径，Evidence Budget 与 contract-index 默认列四类 phase 材料和文件数／体积说明 | [草稿模板](../../../workflow/templates/implementation-contract.md)、[最终模板](../../../workflow/templates/implementation-contract.final.md)、[索引模板](../../../workflow/templates/contract-index.md) | 默认示例应指向已选载体，避免把可选输出误作前提 |
| Team quick/formal 操作分流已由 7820313 修复；八月已取消 ordinary required_safety_gates 必填 | [Team](../../../plugins/atlas-workflow/skills/team/SKILL.md)、[八月轻量方案](../20260817-001-atlas-default-lightweight/implementation-plan.md) | 不重复实现已完成改动，不恢复旧 Clarify 固定 staffing 规则 |

以上源码事实不等于完整因果实验。FMS 没有使用这里审查的 formal execution-vnext 准入，不能将正式尺寸门或 receipt freshness 直接写成它的成因。历史样本是目的性选取，不能据此给出事故率或节省百分比。

## 3. 修改单位 A：验证选择与退出的共同责任

在 `plugins/atlas-workflow/references/verification.md` 新增短的宿主中立 reference，作为共同指导的唯一正文。它是现有技能的内部引用，不是新 skill、协议或执行阶段。

Task、直接 Team、Clarify 在选择或继承验证方法时加载它；CW 继续委托 Task。原位替换 Task 的泛化验证句、Team 的对应执行／修复句和 code-review 的重复部分，避免增加第二份完整规则。普通技术任务不因加载此引用而激活 Business Acceptance、BAF 或 release。现有业务旅程规则继续由 Business Acceptance 持有。

当子代理负责选择验证方法、编写或修改测试／harness／诊断代码时，主控在既有自包含任务说明中传递共同 reference 的可解析引用和当前适用边界，要求该 lane 读取；不能依赖父历史。只修改 Team 既有 dispatch 指导，不复制到 agent profile，不增加 brief/schema 字段，也不要求无关的只读事实查询代理加载。

共同指导须表达以下行为，不要求每次逐条打勾、为每条命令写理由或另建表格：

1. **选择检查。** 从当前必需结果、相关实现变更和可达风险选择已有检查。前检只保护即将执行的动作，或先解决一个已有证据表明会使后续运行无效的问题；不默认给环境、fixture、oracle 和每个采样器各加一层预演。
2. **区分失败影响。** 附加诊断缺失只让相应解释不可得，不自动否决独立成立的必需结果。若该测量是性能结论、比较有效性或安全控制的必要输入，失败仍使该结论失败或未知。不能以“诊断”名称吞掉实际失败，不能把记录器故障与业务步骤失败混为一谈。
3. **复用已有结果。** 同一采样、启动／恢复检查或业务运行可被多个适用验收项引用。新 slice、reviewer 或报告名称不构成重新运行的理由。相关源码、配置、身份、环境、数据、测量方法、oracle 或验收含义改变时，重验实际受影响的部分；无法判断适用性时不继承旧通过。正式 receipt 仍遵守既有机器规则。
4. **结束诊断。** 问题已有充分答案、实验已明确结束时，不继续追加样本。本次新增且已无当前用途的临时入口、专用采样及锁定历史实现的测试退出默认执行链；历史源码与负结果继续保留，真正保护产品行为的回归继续保留。不以此自动清理其他任务或用户文件。
5. **诊断不扩大副作用。** 失败时先保留原错误和既有日志。不能仅为补 stderr 隐式再跑迁移、重发设备动作或执行其他写入。已授权恢复流程仍按其条件执行。
6. **按结果收敛。** 回归与 review 用于回答当前问题；相关检查已通过且没有新变化、失败或未解风险时，不机械重复。最终仍完成当前要求的完整旅程与后置条件。检测器自测证明检测器，配置检查证明配置，不能据此增加业务完成项。

权限、数据完整性、资源归属、并发隔离、发送前资格、未知结果不重复发送，以及当前要求的迁移／恢复和真实业务 readback，本身都是具体消费者；无需先发生事故才能保留。已批准要求不会因新版规则自动失效。

Code Review 保留独立反证职责：检查新增测量的消费者、失败传播和临时分支的剩余用途，指出具体调用链。它不新增 verifier 角色、review 轮数或自动修复范围。对普通低影响规则修改，不要求真实模型实验或逐条因果测量。

## 4. 修改单位 B：模板不再默认制造证据套餐

只修改三个现用模板的相关部分：

- `workflow/templates/implementation-contract.md`
- `workflow/templates/implementation-contract.final.md`
- `workflow/templates/contract-index.md`

Real Validation Plan 的证据示例不再预填 `evidence/phase-review-report.md`，改为引用实际选中的 task、scenario、report 或既有协议产物。模板仍保留原有必需表结构；不增加检查价值、测量用途或成本字段。

Evidence Budget／evidence_rules 改为复用既有结论载体，删除默认四件套餐和固定“10 件／1 MB 后另写说明”的规则。原始日志、trace、重试输出等继续默认在 Git 外。显式选择的合同、业务协议、视频手册和 release 所需材料继续保留。

`contract-index.md` 只修改 `evidence_rules` 中的额外默认套餐，保留 `supporting_evidence`。当前 index lint 明确要求 `team_decision`、`staffing`、`evidence_index` 指向存在文件，另有两个 workflow 源键；这些属于显式选择该 bundle 后的要求，本方案不更改。普通任务无需为了应用验证指导而选择该 bundle。

`scaffold-phase` 是显式生成四件材料的兼容命令，本方案不改它的输出和调用协议。阶段名称本身不再成为调用理由；已经批准的旧合同不由新模板反向减免。

## 5. 修改单位 C：单份范围文档的实际工具支持

### Task 调用端

Routing 第一步改为：已有相关任务时复用；只有跟踪、恢复、交接、审计或已选正式流程确有价值时才 list/create/start。清楚且无需持久化的工作可直接执行。此次不改变 `init-task` 的历史输出，也不删除既有空骨架。

### ready runtime

修改 `workflow/bin/lib/codex-workflow/verification/readiness.js` 及其直接测试：

- 在现有 `--require` 集合中支持 `clarify`，读取同一任务现有 `clarify.md`。
- 新的技能调用明确写 `--require clarify` 或实际已选的既有材料集合。保持 bare `ready` 与原 `context,spec,analysis[,decision]` 的输出和退出语义兼容。
- 没有 helper 材料、使用现有 issue／PRD／仓库合同的任务不需要调用 `ready`，直接使用当前载体的适用审阅／校验。不存在将它们复制成三份或先写 skip 理由的要求。
- 不新增 `--file`、通用文件注册、自动发现、隐式“最权威文档”选择或状态字段。
- 缺失、空文件和未填写的 Clarify 骨架必须 `not-ready`。现有 `substantiveContent` 不能直接复用其结论：元数据、空 `Goal` 槽和空表格目前会被当成内容。仅针对现有模板做最小骨架识别，复用模板来源，排除可变元数据；不新增通用 Markdown parser，不建立验收语义 lint。
- 填写了实际内容的 Clarify 可通过材料检查，检查不读取或要求 context/spec/analysis。`ready` 只表明所选材料存在且不是空骨架，不能表示目标合理、用户批准、实施成功或 release-ready。

代码检索未找到 `readiness.status` 被 formal admission 或 task completion 当作授权依据；其结果由 readiness 模块记录。实施时保留该责任，不能把这次能力补齐变成新的强制准入门。

## 6. 验收方式

验证本方案本身也遵守比例原则。runtime 的确定行为用公开 CLI 与现有隔离 fixture 检查；规则语义用有限案例独立审阅。结构检查不冒充模型行为效果。

| 场景 | 应得到的结果 | 证据方式 |
| --- | --- | --- |
| 已有任务，只有填写过的 clarify.md | `ready --require clarify` 成功，不要求其他三份文件 | 扩展现有 `verification-readiness.test.js`，经公开 dispatcher |
| clarify 缺失／空文件／原样 scaffold，仅变更创建日期或空白 | 明确 not-ready；元数据不构成有效输入 | 同组测试；真实 scaffold 产物参与用例 |
| bare ready、旧 require、decision fallback、unknown requirement | 旧行为保持；未知材料仍拒绝 | 复用原兼容测试，不另造 runner |
| 小型明确任务无持久化需要 | 不因 Task 入口建档；直接 Team 与 Task 获得同一验证指导 | 引用／布局结构检查＋情景审阅 |
| 无消费者初始化 CPU/WAL失败；必需性能 meter 失败 | 前者不否决独立业务结果；后者不伪装为诊断降级 | 对既有 FMS 例证作一次语义审阅，不运行 FMS |
| 重复 sampler；已结束的负结果实验 | 复用实际需要的采样；退出已无用途的活动实验，保留业务回归和历史结果 | 同一情景审阅；不同测量方法的结果不得混合作收益归因 |
| 新验收编号引用同次有效升级／业务旅程 | 复用适用证据；不以空库 E2E 替代升级后实际动作 | 情景审阅 |
| 权限 guard／真实数据路径变更；显式 release 候选变化 | 必要拒绝／readback／同候选验证继续成立，不因最小化被取消 | 情景审阅确认义务未被减免；机器兼容性由本次适用集成合同覆盖，不另造业务或 release 场景 |
| 模板生成与隔离插件布局；harness 子代理不继承父历史 | 没有预置证据套餐；三个入口与相关子代理任务说明可独立解析同一共同引用 | 现有模板／引用与任务说明结构检查，不运行模型 |

扩展现有测试，只覆盖发生变化的接口、模板输出和加载边界。可在现有案例材料中保留上表语义例证，不新建评估数据平台，不把段落逐字匹配当语义证明。

实施时先跑相关专项：

```sh
node --test workflow/tests/js/verification-readiness.test.js
bash workflow/tests/contract_clarify_parallel_routing.sh
bash workflow/tests/contract_team_review.sh
bash workflow/tests/contract_implementation_contract.sh
```

按实际修改的模板消费者补跑已有 index/scaffold 专项，避免对无变化模块扩展测试。随后按 [AGENTS.md](../../../AGENTS.md) 运行官方 `validate_plugin.py`、`atlas-plugin-integrity manifest` 及必要集成检查。本方案涉及 plugin＋workflow 最终集成时使用 `bash workflow/tests/contract.sh`，它已包含 `contract_repo.sh`，不先单独跑一遍 repo suite 再机械重复。使用现有隔离路径，不开启 legacy host 或单独运行 Multica tests/runtime；保留 forbidden-path／Multica 只读树指纹边界。未发生新变化或失败不循环重跑整套。

真实 Codex／Claude 模型对照、付费评测、安装态或现场验证不属于本方案默认验收。没有这些证据时，只报告源码规则、模板行为与 helper 行为改善，不能声称未来会话已经稳定减少前检。安装后可从自然任务观察复发情况；不自动创建监控或跟踪任务。

## 7. 实施顺序与边界

确认本方案后，先完成 A＋B 这一完整逻辑成果，再完成 C 的 runtime 与兼容用例；最后按实际影响做一次必要集成检查。按项目约束形成适中的本地逻辑提交，不按单个文件或 review 轮次提交。

预计拥有路径仅为共同 reference、Task／Team／Clarify／code-review 的对应条款、三个模板、readiness 与直接测试，以及必要的文档和现有测试断言。CW、Business Acceptance、agent profiles 和 manifest 没有当前冲突时不改。确认后才在文档索引登记本方案，届时仅覆盖本文明确修改的行为，不取代其他已批准合同。

本轮不实施以下内容：

- FMS 业务、测试或验证代码，亦不回滚上轮 FMS 改动。
- 正式 `atlas-slice-size-v2` 的 1.5 倍估计、DAG 深度或多 vertical 硬门。它们有明确版本语义；不能以修复文案静默改变。
- 跨源码候选的 formal receipt 复用。现有 retain-compatible 不是任意源码变化后的测试缓存；安全放宽需要可信依赖范围与候选规则的独立设计，不能关闭全仓 identity。
- scope／permission 状态机、自动分析检查消费者、新的验证平台、全仓测试清理或框架全面重写。
- 实际 runtime／cache／marketplace／agent 安装、版本 bump、push、部署、发布、远端或 Multica mutation。

正式尺寸和 freshness 是已确认的独立债务，保留为后续议题；它们不阻止本方案先解决普通任务的选择、模板与材料接口问题。前述排除不表示其现状合理，也不将其描述为本次已经修复。

## 8. 方案完成与尚待观察的结果

方案阶段完成于：三条修改链均有确切源码位置、责任边界和可判别验收；独立视角的实质异议已经处理；没有以新材料套餐或新验证平台解决材料和验证过多。

本轮使用三个只读工程视角独立提出选项，再讨论 runtime 兼容、共享指导归属与最小验收。最终一致性审阅补齐了无父历史子代理的指导传递、集成套件结果复用，以及安全反例不触发额外业务验收的边界。没有剩余会改变当前实施范围或安全验收的分歧；这不是 formal machine-contract 准入或真实模型效果证明。

源码实施完成后可以直接确认：模板不再推荐默认套餐，单份 Clarify 可被 helper 正确检查，普通入口没有无条件建档要求，直接 Team 与 Task 复用同一验证指导。诊断选择是否在真实会话中长期改善仍需实际使用证据，不能用本方案、静态 PASS 或 Team 共识替代。

## 9. 源码实施记录

三项修改已落实，共同规则位于 [verification.md](../../../plugins/atlas-workflow/references/verification.md)，readiness 使用配置的真实 Clarify 模板识别骨架，保留旧材料路径。原样模板、元数据／空白变化和新增空 AC 行不会被判为实质内容；已填写的单份文档可以从公开 CLI 检查通过，且不生成实施授权或三份镜像材料。

专项结果：readiness 7/7，`contract_clarify_parallel_routing.sh`、`contract_team_review.sh`、`contract_implementation_contract.sh`（216 项）、官方 plugin validator、manifest 完整性与 Markdown 链接检查均通过。新增 CLI 用例在改动前因不支持 clarify 而失败，修复后通过。两个原方案只读工程视角完成源码复核；其中新增空 AC 行的反例已修复并复核闭合。

`atlas-agent-model-policy check --mode saving` 因当前模型目录 `latest family 5.6 resolves 0 models for capability frontier` 未通过；未派发该路由或修改模型配置。复用的原工程视角不代表该 Saving 路由可用。

最终集成命令为 `bash workflow/tests/contract.sh`，包含 repo suite 与隔离 host fixture；当前任务结果和原始日志保存在 Git 外：`/Users/sihao/.codex/workflow/artifacts/20260926-002-atlas/`。这次不运行真实模型或刷新安装态，formal size/freshness 和 FMS 保持本轮未修改。
