# pstack 验证导航与业务验收适配 Atlas 实施方案

- 状态：已按 Team 讨论补齐设计、规划与执行的业务验收接入；本轮仅讨论和修订文档，不执行验证，待另行授权实施
- 日期：2026-09-05
- 工作类型：planning / documentation
- 交付目标：non-product；本轮只交付实施方案，不形成可运行能力
- 评估基线：`fa591025dafd1f6ea571ff7b737b0637fb90192e`
- 上游基线：Cursor pstack `0.14.8`，commit `93b00b89ef425a9c1bac0d0b317dfc49c930ac99`
- 当前不授权：源码实施、创建项目 Verification Map、运行真实 Drive、commit、push、PR、安装、部署、发布、cache/marketplace/runtime 刷新或任何外部环境写入
- 本轮按用户要求进行 Team 只读讨论和方案修订，不运行文档检查、合同测试或行为试点；下文验证步骤仅保留为后续实施计划，不表示已经执行或通过。

## 1. 结论

Atlas 不整体移植 pstack，也不引入 pstack、Bun、`cursor-team-kit` 或 Cursor 专属运行时依赖。

本次目标是解决两个关联问题：Agent 不知道用户实际如何启动和使用功能；Agent 按实现自测而非按已确认的业务设计验收，导致用户接手时设计差异大、完整业务无法跑通。不能只增加一份导航文件而保持业务交付行为不变。

吸收《The Complete Guide to pstack Pt. 1》的项目验证导航，同时复用 Atlas 现有业务验收规则，使 Agent 能回答并实际验证：

1. 用户从哪里进入功能；
2. 如何启动、检查前提并驱动真实行为；
3. 当前有效设计要求的页面、交互、业务规则和最终结果是什么；
4. 同一批业务对象能否从合法起点连续经过各步骤，到达用户需要的最终结果；
5. 哪些结果已经观察、哪些设计差异或业务断点仍未解决，以及适用的读回和资源处置。

`$atlas-workflow:project-verification` 提供可选的地图创建、运行与审计入口。地图只组织既有验证入口，不建立第二套 runner、状态机、验收结论或证据内核。

验收要求前移到现有设计和规划流程：Product Design 在对应设计批准前确定业务成功和可见验收标准，Clarify 继承这些标准并补齐实施后如何验证，Task/Team 在执行时使用同一组要求。各入口按当前阶段引用共享 Business Acceptance 指引，不强制调用 `project-verification`，也不另建独立验证合同。已有充分、有效的设计和验证办法时直接复用，小而明确的任务不强制补走 Product Design 或 Clarify。

业务功能交付时，在现有 Task 和 Team 各自的增量验收入口中条件加载同一套“当前设计对照 + 完整业务旅程”指引；直接进入 Team 不依赖 Task 预加载，也不以用户是否显式调用新 skill、是否额外选择业务验收协议、项目是否存在 Map 为前提。业务交付触发共同验收规则，BAF 工件仍只由已选合同触发。已有 Map 时复用；没有时从当前设计、源码和已有工具发现入口，不强制先创建 Map。纯技术维护、库函数、只读诊断等任务仍按其实际目标验证。

项目侧默认只维护一份 `docs/verification-map.md`，v1 试点最多覆盖 5 个长期用户能力或业务旅程。“完整业务”指当前已确认范围内从业务起点到最终结果的链路，不等于全产品、全状态或全视口组合。

本修订替换“只增加显式调用导航即可解决问题”及“只在交付末端补验收”的旧假设；不恢复被取消的要求，不引入强制 Map、全量 BAF 工件或新的审批链。

## 2. 上游事实与适配依据

### 2.1 固定来源

- X 文章：<https://x.com/poteto/status/2094457600259842065>
- pstack 固定源码：<https://github.com/cursor/plugins/tree/93b00b89ef425a9c1bac0d0b317dfc49c930ac99/pstack>
- `create-verification-skill`：<https://github.com/cursor/plugins/blob/93b00b89ef425a9c1bac0d0b317dfc49c930ac99/pstack/skills/create-verification-skill/SKILL.md>
- `maintain-verification-skill`：<https://github.com/cursor/plugins/blob/93b00b89ef425a9c1bac0d0b317dfc49c930ac99/pstack/skills/maintain-verification-skill/SKILL.md>
- Feature Map 示例：<https://github.com/cursor/plugins/blob/93b00b89ef425a9c1bac0d0b317dfc49c930ac99/pstack/skills/create-verification-skill/references/feature-map-example/README.md>
- 许可证：<https://github.com/cursor/plugins/blob/93b00b89ef425a9c1bac0d0b317dfc49c930ac99/pstack/LICENSE>

### 2.2 可吸收的核心

- 验证是 Agent 完成工作的组成部分，不应把观察与判断全部留给用户。
- 验证入口应以用户能完成的能力组织，而不只是列出测试命令。
- 项目需要记录真实入口、驱动方式、可观察终态、已知陷阱和维护触发条件。
- 控制面应可组合、错误清楚、结果可被后续步骤消费。

### 2.3 不能直接移植的部分

文章展示的通用 `control-app`、`control-ui` 和 `deslop` 不作为通用运行时包含在 pstack 插件中；它们依赖其他 Cursor 工具。pstack 本身主要提供 Cursor 工作方式和生成项目验证 skill 的说明，并不是可直接嵌入 Atlas 的验证执行器。

以下语义与 Atlas 的权限、证据或最小实现边界冲突，明确不适配：

- `Never Block on Human` 所隐含的自主推进权限；
- sticky mode、`/loop`、`/goal`、Cursor transcript 和 Cursor Plan Mode；
- cloud-first swarm、自动 orchestrate、每功能一个 Agent；
- 自动修复、commit、push、发 PR、merge、shipping；
- 自动安装、下载依赖、登录账号或刷新 cache/runtime；
- Benny、每日全量扫描和自动 Feature Map 维护；
- Graphite、watch-pr、模型映射和供应商专属配置。

## 3. Atlas 现状与真实缺口

Atlas 已经具备以下执行与证据能力：

- Web 行为证据：`workflow/bin/codex-web-acceptance`；
- 3D 行为验证：`plugins/atlas-workflow/skills/3d-harness/`，作为现有 Web Acceptance 内核的薄层；
- 业务验收：现有 BAF 与项目合同；
- 候选身份和工作流结论：现有 workflow receipt、integrity 和验证命令；
- 有界协作：现有 `$atlas-workflow:team`；
- CLI/TUI：目标项目自己的 PTY、tmux、测试 harness 或脚本。

因此 Atlas 不缺通用验证 runner，也不缺另一套结果数据库。

双主机会话显示过普通启动入口与验收入口不一致、旧要求改义、合法状态不可达及局部检查被过度解释等问题。用户本轮又明确指出，Agent 验收与业务设计不一致、完整业务无法跑通。

现有 [Task](../../../plugins/atlas-workflow/skills/task/SKILL.md) 已要求关键用户流端到端完成；[Business Acceptance](../../../plugins/atlas-workflow/skills/team/references/business-acceptance.md) 已区分业务 UI 与协议/设备闭环；[业务场景表](../../../workflow/templates/business-scenario-card.md) 已包含动作、系统响应、业务状态和证据。因此本次不新建业务验收框架，而是补齐普通交付时的触发、设计对照、连续业务数据和结论边界。

现有 [Product Design](../../../plugins/atlas-workflow/skills/product-design/SKILL.md) 的 C/D 已有正常入口、业务成功、持久结果和可见验收，E 是引用与批准索引；[Clarify](../../../plugins/atlas-workflow/skills/clarify/SKILL.md) 及其现有方案/合同已有验收标准和验证计划。本次只补齐共享规则的条件加载及这些载体之间的继承关系，不修改模板结构、设计批准规则或机器合同格式。

Map 能否降低重复发现成本仍是待试点验证的假设，不能把导航文档存在当成业务可用或效率改善的证明。

现有 `product-progress --json` 和 `project-phase-report` 是任务或阶段投影，不是用户能力地图。本方案明确不复用或扩展 `project-phase-report` 来冒充 Verification Map；该方向会混淆任务状态与产品行为，已从方案中排除。

## 4. 设计原则

### 4.1 派生而非权威

Verification Map 是验证入口的派生索引，不是需求、产品、验收、release 或工作流状态的权威源。目标行为服从当前有效用户决定及现有 [decision-supersession 协议](../../../plugins/atlas-workflow/references/decision-supersession.md)；代码说明实际行为，不能自行替代用户确认的设计。被取消或取代的要求不得由仍留存的代码、合同、测试或 Map 恢复。无需为此新建 ledger、workflow task 或批准文档。

Map 与当前来源冲突时必须：

1. 标记 `conflict` 或 `blocked`；
2. 列出冲突的来源引用；
3. 停止推断或执行有风险的 Drive；
4. 不自行选择新的 expected behavior；
5. 不自行降低仍有效的合同或验收要求；也不继续执行已被当前用户决定撤销的要求。

用户纠正、取消或替换设计也是更新触发条件。无写权限时报告受影响条目已不能用于执行；有写权限时原位删除或替换旧义务，不把它保留成未来必测项。

### 4.2 复用单一证据内核

Map 可以引用已获准的项目原生命令、只读入口及其输出，也可引用当前任务选定的 verifier；没有专用 evidence sink 不应阻止合法的普通检查。它不得：

- 创建新的 BAF；
- 创建 verdict 或 receipt；
- 写入新的任务、阶段、slice 或 release 状态；
- 复制 Web Acceptance、3D Harness 或项目原生 harness 的 attempt/evidence/result 结构；
- 用自定义 Markdown 字段替代真实执行证据。

### 4.3 权限逐项解析

Map 记录“怎样做”，不授予“现在可以做”。读取、创建、更新、启动应用、登录、写业务数据、操作外部系统、驱动设备、清理、commit、发布等权限继续分别判断。

### 4.4 先发现再创建

创建 Map 前必须先发现项目内已有的验证文档、skill 和 harness：

- 已有等价材料时，停止创建第二份；
- 已有部分材料时，只在明确写权限下最小补齐；
- 某项没有合法可达入口时，报告该能力或验收要求的冲突并交回当前所有者；不新增业务 writer、测试后门或伪造“已验证”路径，也不阻止其他已获准的独立检查。

## 5. v1 文件范围

未来实施仅允许以下源码变更；本次仍只修改本方案：

1. 新建 `plugins/atlas-workflow/skills/project-verification/SKILL.md`；
2. 新建 `plugins/atlas-workflow/skills/project-verification/references/verification-map.template.md`；
3. 更新 `plugins/atlas-workflow/README.md`；
4. 新建 `workflow/tests/contract_project_verification_skill.mjs`；
5. 在 `workflow/tests/contract.sh` 中接入该专项合同。
6. 在 `plugins/atlas-workflow/skills/task/SKILL.md` 的既有增量验收段补一条条件引用：交付业务功能时按现有 Business Acceptance reference 继承当前设计/方案的验收要求、走通所需业务旅程；没有前置设计或方案工件的明确小任务在当前任务说明中确定适用要求，不强制补走流程；普通技术任务不触发。
7. 在 `plugins/atlas-workflow/skills/team/references/business-acceptance.md` 补齐第 7.4、7.5 节的共同规则，并同步开头加载条件及 Activation：相关业务设计/规划阶段制定标准和验证办法，业务交付阶段执行，不要求额外显式选择协议；BAF 工件仍仅由已选合同触发。不改 BAF schema、validator、release producer 或强制生成工件。
8. 在 `plugins/atlas-workflow/skills/team/SKILL.md` 的既有增量验收段补同一条业务交付条件引用，并对齐 Optional Protocols 的加载条件，覆盖未经 Task 预加载的直接 Team 入口；仅修改这两处接入文字。
9. 在 `plugins/atlas-workflow/skills/product-design/SKILL.md` 的既有准备、Build D 和 Create E 位置补阶段性条件引用与交接要求：在 C/D 现有段落确定验收标准，E 只引用；不改变原有设计路由、批准或 Baseline 规则。
10. 在 `plugins/atlas-workflow/skills/clarify/SKILL.md` 的既有验收和收敛交接位置补业务规划条件引用，覆盖轻量方案与机器合同两条路径；只在既有载体中操作化验收要求，不要求新合同类型或提前运行验证。

第 6 至 10 项是本次验收接入的有限范围，替换旧方案对 Task、Team 验收入口及 Clarify/Product Design 接入文字的禁改约束；不得恢复“必须先经 Task 或显式选择协议才适用”的遗漏路径，也不建立必经的多阶段流程。不修改 Task 路由、Team 调度、模型策略或执行 runtime；不修改 Product Design 的 method-adapter、C/D/E 模板，Clarify 的 contract-authoring reference、方案/合同模板，或任何 schema。

内容和 reviewer 结论冻结后，最后运行：

```bash
scripts/bump-plugin-cachebuster.sh atlas-workflow
```

cachebuster 更新后不得再修改 plugin tree；如必须修改，需要重新 review 并重新生成版本。

末尾 cachebuster 允许更新以下三份源码 manifest 的版本字段：

- `plugins/atlas-workflow/.codex-plugin/plugin.json` 的 `version`；
- `plugins/atlas-workflow/.claude-plugin/plugin.json` 的 `version`；
- `.claude-plugin/marketplace.json` 的 `metadata.version` 及 Atlas 条目的 `version`。

这是源码版本更新，不是写入真实安装态或 shared marketplace。其余条目及语义不得改变；实施前若脚本实际写路径已漂移，应先重新确认范围，而不是扩大授权。

v1 不新增：

- 通用 runner 或 Control CLI；
- schema、数据库或状态字段；
- daemon、scheduler 或 automation；
- agent profile 或模型策略；
- 新 evidence kernel、verdict 或 receipt 类型；
- adapter 生成器；
- 多文件 Feature Map 目录；
- pstack、Bun 或其他新增依赖。

## 6. 项目 Verification Map 合同

### 6.1 默认位置与规模

项目默认只维护：

```text
docs/verification-map.md
```

v1 新建 Map 的试点最多记录 5 个高价值、长期稳定的用户能力或业务旅程，不裁剪已有文档，也不以该数量上限减少当前业务验收范围。先试一个普通真实入口；扩容依据实际使用中的发现工作与维护成本，不建设指标平台。需要观察：

- 新 Agent 的验证冷启动时间确实下降；
- false-complete 或遗漏确实减少；
- Map 的维护成本低于重复发现成本。

### 6.2 能力字段

每项能力必须提供当前目标/设计来源、用户实际入口/驱动方式、可观察结果；其他信息按行为适用，不机械填满无关字段：

```markdown
### Capability ID

- User outcome:
- Behavior authority/source refs:
- Entry and journey/drive refs:
- Observable outcome and evidence refs:
- Applicable prerequisites, launch and doctor:
- Applicable side-effect readback and resource disposition:
- Gotchas, authority boundaries and update triggers:
```

字段约束：

- `Capability ID` 是稳定产品能力标识，不使用 task、phase 或 slice 名称；
- `Behavior authority/source refs` 引用当前有效的用户决定、设计或合同；代码、已有 harness 和测试是实际行为与验证入口的辅助证据。业务设计不复制成第二份需求正文；
- `Doctor` 只证明启动和依赖前提，不代表功能通过；
- 驱动方式引用普通用户实际启动、进入及操作路径；业务能力以完整旅程而非页面检查清单组织；
- 结果必须是当前设计要求的可观察业务结果，不能倒过来把现有实现当成通过标准；
- 有持久副作用时必须读回；没有账号、业务写入或临时资源时，可给出理由并标明不适用；
- 证据引用既有输出或已选证据通道，不因缺少专用收集器而创建新内核；
- 资源处置遵从实际授权：无需清理时说明原因；要求保留实例时核对保留状态；有清理权限时验证清理后置条件；
- 更新触发包括用户决定变更、设计调整、代码或入口变化。Map 不保存本次验收结果。

以下字段或语义禁止进入 Map：

- `pass`、`done`、`current`；
- 当前 task、phase 或 slice 状态；
- receipt、verdict 或 release readiness；
- “已修复”“已部署”“已发布”等执行性断言；
- 用健康检查、HTTP 200、绿色单测或单张截图替代用户行为结论。

## 7. 验证导航与业务验收接入合同

### 7.1 `create`

用途：发现现有验证材料，创建或最小补齐 Verification Map。

约束：

- 需要明确的项目文件写权限；
- 默认只写 `docs/verification-map.md`；
- 其他验证脚本必须已被当前任务明确拥有；
- 项目本身损坏时只报告，不修改产品代码；
- 不自动添加依赖、安装浏览器、下载 runtime、登录账号或修改用户 cache；
- 默认单文件、最多 5 个能力；拆目录或新增生成器需要单独审批。

### 7.2 `run`

用途：按 Map 驱动一个已选定能力，并把证据引用返回当前任务控制器。

执行前按本次动作解析，不为已明确、已授权的正常步骤重复审批：

1. 当前目标、有效设计与实际宿主/实例；声称精确候选验收时需绑定对应版本，版本未知的只读观察只能作受限结论；
2. 实例所有权及获准操作范围；合法共享环境或现场只读不要求可丢弃实例；
3. 涉及登录或业务数据时的账号、凭据和数据范围；不涉及则说明不适用；
4. 允许发生哪些副作用；
5. 已有证据输出或所选 verifier；正式合同选定的证据要求继续满足，普通检查不强制专用 sink；
6. 本次创建或修改资源的处置及读回；按授权清理、保留或说明不适用。

当前动作实际需要的身份、权限、数据、副作用或资源处置不清楚时，该动作保持 `blocked`；无关项不适用不构成阻塞：

- 当前目标与实际实例身份；
- 实例所有权；
- 账号、凭据或测试数据合法性；
- 业务、外部服务或设备副作用；
- 所需证据是否可获得；
- 适用的清理或保留后置条件是否可靠。

Map 本身不能创建或写入 BAF、verdict、receipt、任务状态或 release 状态。生产数据、客户系统、外部账号、业务状态切换、设备和物理动作仍需分别获得明确授权。

### 7.3 `audit`

用途：检查 Map 是否与当前有效用户决定、设计及验证入口漂移。`clean` 只表示检查范围内未发现地图漂移，不表示业务已经通过验收。

默认只读，结果限定为：

```text
clean | drift-found | blocked
```

发现漂移时只报告：

- 哪个能力条目已过期；
- 当前有效决定、设计、代码或合同证据；
- 建议修改哪些字段；
- 是否存在产品缺陷或验证入口缺失。

没有额外写授权时不更新 Map，也不修改产品实现。

### 7.4 按设计完成业务验收

这一规则服务当前请求涉及的业务功能交付，不是全仓库审计，也不以 Map 存在为前提。既有 Task 和 Team 的增量验收入口均按业务交付条件加载共享指引，继承第 7.5 节所述当前设计/方案的验收要求，不要求先走另一入口或额外点名业务验收协议；普通任务在现有报告中记录结果，只有当前合同已要求 BAF 时才使用其工件和 validator。

**先从当前设计确定验收，而不是从实现反推需求。** 复用当前有效的设计稿、流程说明、业务规则和用户决定；只有确实影响结果的设计缺口才交回用户，不因为没有指定格式文件就重走设计审批。需要比对的包括设计明确规定的布局/内容、关键交互、角色权限、业务规则和状态反馈，不自行追加视觉体系、视口矩阵或未要求的功能。

**验证单位是完整业务旅程。** 先确定角色、普通启动入口、合法起始数据、所需步骤和最终业务结果。对当前范围要求的每条关键旅程，用同一批对象及其关联 ID 连续执行；多角色交接、API、Worker、回调、持久化、下游页面或导出只在这条旅程确实涉及时纳入。不能把不同候选、不同实例或互不关联的种子数据拼成一个“全流程通过”。

本方案只选一条旅程试点，是验证 Atlas 指引的有界方式；未来业务任务若要求多条旅程，仍须逐条验收，不能选择一条最容易的正常路径代替其余所需流程。

**UI 与后端不能互相代替。** 如果设计要求用户通过页面操作，必须实际点击该入口；API 仅可用于明确允许的前置准备或读回，不能绕过缺失/损坏 UI 后宣称用户流程已通。需要真实集成的链路不能由 mock 回调替代；明确批准的模拟环境只支撑其限定结论。纯后端目标不凭空增加 UI 验收。

在既有场景卡或本次报告中使用一张简短对照表，不另建结果数据库：

| 当前设计/业务要求 | 用户动作与同一业务对象 | 预期页面、业务状态或数据 | 实际结果与证据 | 差异/断点 |
| --- | --- | --- | --- | --- |

表格跟随实际步骤展开，不只勾选页面是否可打开。必须在旅程末端核对用户最终结果；若范围包含报表/导出，核对导出与该批业务数据及前面配置一致。重要异常分支只覆盖设计要求或当前改动直接影响的分支，不做全状态笛卡尔积。

**完成结论不可用局部通过代替。** 设计仍有未获批准的差异、任一所需步骤未跑/失败/未知、最终数据不一致，均不得报告完整业务验收通过。准确区分源码检查、设计对照和业务旅程结果；部分通过不能累计或平均成整体通过。只在实际业务检查已经通过、单纯证据记录器故障时沿用现有“证据采集降级”规则，不能把未执行的业务步骤称为采集降级。

断点可在当前实施授权内修复时，修复后重跑受影响的完整旅程；需要新增能力、改变设计、现场写入或其他额外权限时，报告断点并等待对应决定。只读验收不授权修产品。合法入口无法产生要求状态时，交回当前范围/验收所有者，不新增 writer、bypass 或伪造数据完成验收。

交付时给用户同一候选的实际启动入口、所需角色/数据、可复现步骤、已经完成的设计对照、完整旅程结果和残留断点。用户复验是确认结果，不应首次发现核心步骤从未被 Agent 执行；Agent 自测也不冒充用户最终认可。

### 7.5 设计与规划阶段制定验收要求

Product Design、Clarify、Task/Team 和新 skill 共同引用现有 `team/references/business-acceptance.md`，由该 reference 按当前阶段区分“制定标准与办法”和“执行并取得证据”。不新增第四个 planning 模式，不把读取共同规则解释为调用 `create/run/audit`，也不把业务规划自动升级为 BAF 或机器合同。

| 当前入口 | 负责确定或完成什么 | 复用载体与交接 |
| --- | --- | --- |
| Product Design | 当前角色、正常入口、完整业务路径、设计必须满足的可见行为、持久结果及关键失败恢复 | C 既有场景及 D 的流程、能力真实性、验收部分；在对应设计批准前形成标准，E 的 Visible acceptance 只引用当前 C/D 条目 |
| Clarify | 将上述要求落实为适用环境、合法角色/数据前提、必要动作、预期结果、读回与证据取得办法 | 轻量方案的 Acceptance Criteria / Verification Plan；已选择机器合同时使用现有 Acceptance Criteria / Real Validation Plan，不另建平行合同 |
| Task / Team | 在当前候选上执行同一组验收要求，报告实际结果、证据及断点 | 当前任务/合同及既有验收报告；不能实现后另挑易通过标准，设计本身变化时回到对应决定 |
| Project Verification | 提供可复用的启动、驱动和读回导航 | 设计/规划阶段默认只读参考已有项目材料或 Map；另有明确授权时，仍可使用原有可选 `create/run/audit` |

**从要求到验证办法，不复制需求权威。** 在既有验收条目中关联“当前设计要求 → 用户动作与同一业务对象 → 预期可观察结果 → 证据取得方式”。设计阶段确定标准，Clarify 补必要的执行细节；实施后的实际观察只写入既有结果载体，不提前填入通过证据。只补执行办法时引用当前 C/D，不改写其已批准语义；E、Map 和验证计划不能成为偷偷新增、删除或降低业务要求的位置。确有业务语义变化时，沿用既有用户决定与设计批准失效规则，仅重开受影响部分，不因接入 skill 批量重写既有已批文档。

**现有入口、本次拟建入口与外部依赖分开表达。** 现有入口引用已读的源码或项目材料，并区分“已发现”与“已执行”。本次批准目标本身需要新增的页面、命令或动作，可按现有规则记录可行、有界的实施计划及完成后的验证办法；不能冒充当前已存在、可运行或已验证。尚未实现的路径不写成 Map 中现在即可执行的指令。未知业务规则、冲突的权限/安全边界或不明合法路径不能伪装成普通实施依赖，也不允许为造出验收状态而新增未获准的 writer、adapter、后门或业务能力。

**交付规划不等于执行就绪或验证通过。** 业务含义已确定、办法与依赖清楚时，可交付带明确未验证边界的规划结果，不要求产品在规划阶段已经建成或提前执行。账号、目标实例、外部运行授权等未满足时，对应动作仍不可执行；改变业务含义、安全或权限范围的缺口按现有规则阻塞受影响决定。既有 E 身份/批准和机器合同准入要求不变，不能把“方案已写好”标为已满足这些要求。

**不借验收前移扩大权限或流程。** Product Design 的 Baseline 仍只操作已获准的无真实写副作用候选，不用于代替完整真实业务验收；规划本身不授予启动、登录、业务写入或设备操作权限。已有有效设计和充分验证办法时直接复用，明确的小任务可以在 Task 中形成适用验收，不强制经过 Product Design、Clarify、Map 或新审批。

## 8. 现有验证入口映射

| 目标表面 | 复用入口 | 本方案新增内容 |
| --- | --- | --- |
| Web | `workflow/bin/codex-web-acceptance` | 只记录如何进入、驱动以及读取既有 evidence |
| 3D | `$atlas-workflow:3d-harness` | 只记录场景入口和语义终态，不复制 manifest/attempt/result |
| 业务流 | 既有 Task 验收、Business Acceptance reference、当前设计/合同 | 按设计对照并连续走通旅程；已要求 BAF 时沿用其工件 |
| CLI/TUI | 项目原生 PTY、tmux、测试 harness | 只记录稳定命令和可观察结果 |
| 现场或设备 | 当前获准的现场读取与控制入口 | 无授权则 `blocked`，不降级成合成验证 |
| 多角色验证 | `$atlas-workflow:team` | 只在独立工作确实降低延迟或风险时使用 |

真实 UI 或服务器 Drive 默认由一个协调者串行执行，避免多个 Agent 竞争同一个浏览器、端口、账号或数据实例。

## 9. 实施步骤

### Phase A：冻结实现前提

在开始编码前确定下面的边界并记录必要基线；事后复核在验证完成后进行，不要求编码前提供事后结果：

- 当前 HEAD 和任务拥有路径；
- 现有脏文件；
- 上游固定 commit、版本和许可证；
- 选定验证宿主、实际可用的 Node、官方 validator 和既有验证入口；
- 一个已有、安全隔离的业务旅程试点及其当前设计、普通启动方式、合法前置和最终结果；若只能选择简化 fixture，应明确其证明范围，不能冒充目标项目完整业务；
- 临时根目录；
- 本次允许的副作用及适用的清理/保留后置条件；
- 与本次动作相关的精确受保护路径、已有脏路径及项目要求的 Multica hard fingerprints。复用现有隔离合同，不扫描整个 HOME、不比较双主机指纹相等；不读取 Multica 业务内容。

试点入口或必要权限不可获得时，说明具体缺口；不能为使方案可验收而安装工具、改造产品或新增 adapter。源码指令可以形成源码级结果，但不能声称业务行为已验证。

### Phase B：实现最小 skill 与模板

只实现第 5 节列出的源码范围。Product Design/Clarify 补齐设计与规划的阶段性引用和交接，Task/Team 补齐业务交付引用与继承，共同规则放在现有 reference 中；不修改 Analyze、Team 调度、Finish、Web Acceptance、3D Harness、现有设计/合同模板、批准或准入机制、BAF schema 或 workflow runtime。

### Phase C：源码合同验证

专项合同使用 Node.js ESM 和标准库实现，不引入测试依赖：

```bash
node workflow/tests/contract_project_verification_skill.mjs
```

该合同至少验证：

- skill frontmatter 和发现路径正确；
- `create`、`run`、`audit` 权限被明确分离；
- Map 被定义为派生、非权威索引；
- 当前有效用户决定优先，取消/替换会使受影响 Map 条目不能继续用于执行；不得从旧代码反推当前期望；
- 没有状态、receipt、verdict 或 release 字段；
- 健康检查、HTTP 200、绿色单测和截图不能单独代表通过；
- 身份/权限/实际副作用不明时阻塞；无账号、无临时资源的合法只读检查允许不适用，授权保留资源不强制清理；
- `audit` 默认零写入；
- 复用项目原生命令、读取输出及已选 verifier，不要求普通任务新增专用 evidence sink；
- Task 和 Team 两个实际入口均按业务交付条件加载同一套规则，检查其适用条件而非仅检查链接存在；直接 Team 不依赖 Task 预加载、Map 或额外显式选择协议，普通技术任务不被强制业务化，BAF 工件仍仅由已选合同触发；
- Product Design 和 Clarify 的实际入口按设计/规划阶段加载共同规则；Clarify 的轻量与机器合同分支均被覆盖，不要求调用 `project-verification`、创建 Map 或提前运行验证；
- C/D 承载设计验收、E 只引用，执行办法沿用既有方案/合同；禁止只在 E/Map 偷换已批准标准，禁止为完整业务验收让设计 Baseline 接真实写入；拟建入口、已发现入口和已执行结果明确区分，规划交付不冒充 E/合同准入；
- 设计期望、同一对象连续步骤、最终业务结果必须对照；局部通过、API 绕过 UI、mock 替代真实集成或不同数据拼接均不能支持完整业务通过；
- `audit clean` 不能被解释为业务已验收，静态指令检查不能证明模型必然遵循；
- 上游 pstack 身份固定且不存在运行时依赖；
- `create/audit` 不自行开启产品修复；业务断点修复仍受当前实施授权限制，不能推导 commit、push、PR、merge、安装或刷新运行态权限。

随后运行以下检查。官方 validator 路径在所选宿主上解析为已经存在的安装，不复制本机用户名路径，也不因缺工具自动安装：

```bash
python3 "$ATLAS_VALIDATOR_PATH" plugins/atlas-workflow
workflow/bin/atlas-plugin-integrity manifest --plugin-root plugins/atlas-workflow
bash workflow/tests/contract_repo.sh
python3 scripts/check-relative-markdown-links.py --root .
git diff --check
bash workflow/tests/contract.sh
```

源码合同和 manifest 通过只允许报告 `source contract ready`，不能证明真实 Agent 行为已经改善。

`ATLAS_VALIDATOR_PATH` 是实施时解析并核对过的官方 `validate_plugin.py` 绝对路径。命令不可用时记录具体宿主、命令和缺口，不伪造通过或把本机结果推广到远端。版本更新后按仓库要求，以冻结 base 完成 release identity gate；这只是源码身份检查，不授权发布。

### Phase D：隔离行为试点

使用 Phase A 选定的普通启动入口与一个完整业务旅程，复用既有 harness；不为了本次 skill 新建演示业务系统。试点覆盖：

在同一有界案例中补充设计/规划交接情形：观察普通 Product Design/Clarify 请求能否在没有 Map、未运行产品时用既有载体形成标准与验证办法，并将未实现入口如实列为依赖；已有批准内容直接复用，不为试点重开设计。使用现有脱敏材料检查 E/Map 偷换标准及 Baseline 真实写入建议是否被拒绝，不实际执行越权动作，不新增测试平台或模板矩阵。

1. 优先从普通 Task/Team 业务请求进入无 Map 的新上下文；直接 Team 不经 Task 预加载，提示中不额外要求调用新 skill 或业务验收协议，观察是否主动加载共同规则。Map 的可选导航试点不得成为这项验收的前提。
2. 新上下文从用户普通启动方式进入，按当前设计、同一批业务对象连续走到最终结果，对照关键 UI/交互和下游数据；同时记录实际发现入口与维护地图的工作，不先宣称节省成本。
3. 在获准的可丢弃试点中使用已有故障/偏差样本，验证“页面可打开、局部测试通过，但中间步骤断裂或界面偏离设计”会被报告为业务未通过。后端成功但必需 UI 不可用、对象关联断裂或最终输出不一致不能被掩盖。
4. 随后进行可选导航试点：`create` 先复用已有材料，必要时生成单文件 Map。入口变更时，只读 `audit` 报告 `drift-found`；用户撤销要求而代码尚未变化时，也不能继续执行旧 Map。`clean` 不表示业务通过。
5. 合法的无账号、无业务写入检查可注明不适用；缺少实际需要的权限/数据时保持 `blocked`；需保留实例时不得自行销毁。不可达状态交回验收所有者，不伪造通过。
6. 验证适用的资源后置条件，并复核精确受保护路径。指纹只能说明对应范围前后净变化，零写入判断还须依赖已有隔离/写入观察证据。

上述反例优先复用现有 fixture、历史案例的脱敏输入和原生测试方式；未获得可执行环境的部分明确列为未验证，不扩成新的评测平台、跨主机矩阵或客户环境改造。

真实 Codex fresh-session E2E 仍需另行明确的隔离验证授权。手工代跑或静态合同不能替它证明 Agent 会主动遵循业务验收规则。在该验证之前，不得宣称：

- Agent 行为已经改善；
- false-complete 已减少；
- Map 维护成本已被证明合理；
- 具备 release 质量。

### Phase E：冻结、复审与 cachebuster

内容和行为试点结论冻结后进行最终 reviewer 检查。只有 reviewer 无当前目标阻断项，才运行 Atlas 专用 cachebuster，并在此后保持 plugin tree 不变。

本 Phase 不授权安装、真实安装态/shared marketplace 更新、共享 cache 写入、运行时刷新或发布；第 5 节明确列出的源码版本字段更新除外。

## 10. 验收标准

实施只有同时满足以下条件才可完成：

1. `$atlas-workflow:project-verification` 能被源码级发现；
2. skill 只提供 `create/run/audit` 三个明确入口；
3. 默认 Map 是单文件且最多 5 个能力/旅程；没有 Map 不是业务验收的阻塞条件；
4. Map 明确为派生、非权威索引；
5. 当前有效用户决定优先；冲突只暂停受影响动作，不复活被取消要求，也不自行改写设计；
6. `run` 不从 Map 推导执行权限；
7. `audit` 默认零写入；
8. 业务交付从现有 Task 或直接 Team 入口加载按设计的完整旅程验收规则，不依赖 Map、Task 预加载或额外显式选择协议；技术检查不被错误升级，BAF 工件仅由已选合同触发；Web、3D、业务和 CLI 继续复用既有入口；
9. 没有新增 runner、schema、状态机、daemon、agent profile 或运行时依赖；
10. `.mjs` 专项合同和适用的仓库合同全部通过；
11. 行为试点覆盖普通启动、设计对照、同对象完整旅程及设计偏差/业务断点拒绝；仅有源码或局部结果时不能报告整体完成；
12. 条件化前提、只读审计、当前决定变更及适用资源后置条件有对应验证；受保护路径复核与已有隔离证据分别如实报告；
13. 最终 reviewer 针对实际 diff 给出无阻断结论。
14. Product Design 在现有 C/D 中形成设计验收标准、E 只引用，Clarify 在轻量方案或已选合同中制定相应验证办法，Task/Team 继承执行；无强制 Map、新合同或额外阶段，拟建入口及未满足的执行条件不冒充已验证或执行就绪。

## 11. 停止条件

出现以下情形时收缩或停止受影响工作，而不是扩张实现：

- 项目已有 harness 已提供相同的冷启动信息；
- 实际试点显示 Map 维护成本不低于重新发现成本时，停止扩张 Map；业务验收要求本身仍由当前用户目标决定；
- 必须复制 Web Acceptance、BAF、receipt 或其他状态内核才能工作；
- 所请求的实际执行动作没有安全、合法、获准的真实入口；不以缺少可丢弃实例拒绝合法的共享环境只读，拟建入口的规划按第 7.5 节处理；
- 价值主要依赖 cloud swarm、自动 PR、外部写入或生产账号；
- 需要新增 runner、schema、daemon 或项目级状态机才能维持。

需要新增通用 adapter 时，本方案不能自动扩权；必须先用真实试点证明缺口，再单独提出项目级最小 adapter 方案。

缺少效果对照时只报告收益未知，不以少量任务未出现 false-complete 推断 Map 有效或无效。完整业务验收的范围来自当前设计和请求，不来自观察次数或任意全量矩阵。

## 12. 许可证与来源处理

实施优先重写为 Atlas 自己的权限和证据语言，不直接复制大段 pstack 文本或代码。源码和文档中记录固定的上游 commit、tree、版本及 MIT 来源；如果实际复制了具有实质性的文本或代码，保留对应版权和许可证通知。

Atlas 不把 pstack、Cursor、Bun 或 `cursor-team-kit` 变成运行时依赖。

## 13. 修订依据与当前证据边界

修订前的方案探索与审查经过三条独立路径：

- 上游解析：确认 pstack 的真实内容、外部依赖和 Cursor 专属语义；
- Atlas 差距映射：确认真正缺口是用户视角验证导航，而不是新的 runner 或阶段报告；
- 对抗审查：检查第二事实源、未授权写入、重复 evidence kernel、范围膨胀和不可验证声明。

此前的双主机会话对抗审查读取了本机与 `gewu-office` 各 5 个独立任务，结论为 `REQUEST_CHANGES`，取代此前对旧文本的 `APPROVE`。方案已按用户指令落实：

1. 当前有效用户决定及既有纠正规则优先，旧 Map/代码/失效合同不能复活撤销义务；
2. `run` 前提按实际行为适用，合法只读及获准保留实例不受无关门槛阻塞；
3. 补齐 cachebuster 的三份源码 manifest 范围，保持安装态禁写；
4. 指纹限定精确范围、前后时序和净变化证明，宿主与 fixture 结论不外推；
5. 根据用户新增痛点，把按设计完成业务旅程接入现有 Task/Team 业务验收路径，而非只交付可选导航。

随后第一性原理 Team 审查经两条独立视角及定向复议，收敛为 `REQUEST_CHANGES`，仅保留“直接 Team 普通业务交付可能不加载新增规则”这一阻断。上次已按用户要求原位修订：将 Team 的条件引用纳入范围、同步共享指引激活条件，并明确后续 `.mjs` 检查与无 Map 普通请求试点的实际入口。不新增验收框架、冻结表、owner 流程或审批工件；Map 保持可选，不删除原始导航适配范围。

本轮用户进一步要求在 Product Design/Clarify 制定方案时形成验证要求。Team 分别讨论设计批准交接与 Clarify 轻量/机器合同接入，经定向复议收敛为：只新增两个 skill 的有限接入路径，复用共享 reference 及现有载体，不改模板、method-adapter、contract-authoring 或 schema。方案据此增加第 7.5 节，并原位替换此前排除 Clarify/Product Design 接入的范围约束。

当前只有修订方案，没有实际 skill、验收指引或测试实现；试点项目/旅程、exact fixture 及 fresh-session 执行仍未选定或执行。历史样本证明具体入口和验收问题存在，不证明 Map 的总体效益、问题频率或修订后的 Agent 行为。本轮按用户要求仅完成只读讨论和文档修订，未运行任何验证；Team 对接入方向的收敛不等于落文后的独立复审、实现通过或行为效果证明。

## 14. 下一次授权边界

如用户批准实施，下一次任务只执行第 5 节文件范围以及第 9 节 Phase A 至 Phase E；发现相邻问题时仅报告，不自动扩大范围。

实施授权仍不包含：

- commit、push、PR 或 merge；
- 安装或刷新真实 Atlas plugin；
- 真实安装态/shared marketplace、共享 cache 或 runtime mutation；
- 部署、发布或真实客户环境操作；
- 生产账号、外部系统、业务数据或设备写入。

这些动作如有需要，分别等待明确授权。
