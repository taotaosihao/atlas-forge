# Atlas 快速产品通道与后续框架债务修订方案

- 状态：首批已实施并完成源码级验证；尚未安装、刷新或发布
- 日期：2026-08-03
- 权威范围：Atlas Workflow 的产品开发路由、轻量验收、path lease 选择、模型路由与后续优化债务
- 不授权：修改 Kivo、刷新插件/cache/runtime/marketplace、迁移工作流状态、安装、发布或部署；后续债务 D-01 至 D-14 仍未授权实施

## 实施结果（2026-08-03）

RP-01、PL-01、MR-01 已在 Atlas Workflow 源码、说明、模板与合同测试中落地，插件源码版本冻结为 `0.1.0+codex.20260803154844`。独立 reviewer 的第二轮结论为通过；专项合同、严格发布兼容锚点和仓库级 hermetic 合同均已纳入验收。没有修改 Kivo、workflow helper runtime/schema、recorder、ledger、receipt、keeper、工作流状态或安装态。D-01 至 D-14 保留为后续优化 backlog，不因本轮完成而自动获得实施授权。

## 1. 结论

当前最优方案不是立即重构 Atlas 的完整认证和证据系统，而是先提供一条不会误入正式发布认证的快速产品通道，同时对两个直接影响日常执行的耦合做轻量调整：

1. 可内部使用或小范围公测的完整阶段产品，默认作为 `product_increment` 直接实施和验收；只有明确请求正式发布认证时才进入 `product_release`。
2. path lease 由实际写入冲突风险决定，不能因为使用 Team 就自动要求，也不能因为未使用 Team 就忽略真实冲突。
3. Team、模型选择和 Saving Mode 是三个独立决定；Team 不自动提升模型质量，Saving Mode 也不要求创建 Team。

首批只调整 Atlas 的路由政策、skill 指令、说明和相应合同测试。不修改 workflow helper runtime、schema、事件、ledger、receipt、keeper 或 recorder。正式发布认证保持现有严格语义。

## 2. 第一原则

### 2.1 产品可用不等于正式发布认证

每个阶段都可以是一个完整、可使用、可内测或可小范围公测的产品，但这不代表每个阶段都需要生成正式的 `release_decision.status=certified`。

### 2.2 产品事实优先于证据工具

真实关键流程、真实测试结果和实际运行行为决定阶段产品是否正确。recorder、ledger 和 receipt 用于保存、传递或认证证据，不能在普通产品开发中成为产品正确性的唯一来源。

### 2.3 控制成本必须与实际风险成比例

没有真实客户、没有不可恢复生产数据、没有正式发布声明时，不应默认承担发布级审计、恢复、兼容和认证成本。

### 2.4 独立决定独立表达

- 是否使用 Team：由并行价值或专门审查价值决定。
- 是否使用 path lease：由并发写入、接管或写者不确定性决定。
- 使用哪个模型或 Saving Mode：由成本、任务风险和质量需求决定。
- 是否正式认证：由明确发布意图决定。

任何一个决定都不能自动推导出另外三个。

## 3. 已锁定假设

1. 当前没有实际客户，也没有必须保留的生产客户数据。
2. 当前首要目标是尽快形成真实可用的 Kivo MES 阶段产品。
3. 内测和小范围公测允许使用快速产品通道，但公开暴露时仍需完成与访问、数据和回退直接相关的最小安全检查。
4. 现有严格发布认证仍有长期价值，不删除、不降级，也不由快速产品结论冒充。
5. 当前已经进入 execution-v3 的任务不做追溯迁移，不接管主线程正在进行的 recorder 修复。

当这些假设失效，尤其出现真实客户、不可恢复生产数据、合同/监管要求或正式发布声明时，应重新评估并升级验收等级。

## 4. 首批最小实施

首批仍作为一个逻辑切片实施，包含以下三个相互一致的路由调整。

### RP-01：快速产品通道

#### 路由

```text
明确请求正式发布认证、release-ready 或 certified？
  是：product_release → 现有 semantics v4 + Team execution-v3
  否：product_increment → 主 Codex/最轻工作流 + 真实产品检查
```

首批中的 `product_increment` 是路由和报告术语，不加入 release-intent schema，不生成 release decision，也不声称正式认证。

#### 内部使用最小验收

1. 产品能够真实启动。
2. 本阶段最重要的一条用户流程完整跑通。
3. 与变更直接相关的专项检查通过。
4. 没有已观察到的功能、数据、权限或安全阻断。
5. 没有未经授权的部署、发布、共享环境写入或不可逆操作。

#### 小范围公测附加验收

1. 适用的登录、访问控制或匿名访问边界明确。
2. 数据隔离和敏感信息边界满足当前公测范围。
3. 密钥和凭据不暴露。
4. 出现问题时能够关闭、回退或恢复。
5. 在真实公测入口完成一次关键流程 smoke。

#### recorder 故障

- 真实检查已经运行并通过、只是 recorder 无法记录时，`product_increment` 可以完成。
- 最终报告必须列出实际命令、退出结果、关键结论，并注明 `证据采集：降级`。
- 真实检查未运行、失败或结果无法判断时，仍然阻断。
- `product_release` 继续 fail closed，不能用快速路径证据替代正式 receipt。

### PL-01：path lease 与 Team 轻量解耦

#### 首批规则

Team 和 lease 分别做决定：

- 主 Codex 单写者、无外部并发写者：不需要 lease。
- 只读分析、讨论、review 或 verifier：不需要 lease。
- Team 只有一个隔离的写者，且不存在 fallback、接管或外部并发：快速产品路径不默认要求 lease。
- 两个或以上可能并发的写者：每个写者必须有不重叠的路径所有权；现有 lease 能力可用时必须使用。
- fallback、接管、旧写者是否停止不确定、共享工作区存在外部写者：必须保留 lease/quiescence 边界；事实不清时停止新增写者。
- 正式发布认证继续遵守现有 execution-v3 lease 和 admission 规则。

#### 首批不做的部分

首批不把 path lease 重写为一个通用的、Team 外独立运行的 runtime 服务。快速路径一旦发现真实并发写入需求，应选择现有隔离 Team/worktree 能力或停止并返回，而不是在当前切片扩建新的 lease 基础设施。

### MR-01：模型路由、Saving Mode 与 Team 轻量解耦

#### 首批规则

用三个独立概念表达：

- `staffing_mode`：`main` 或 `team`，只回答是否需要额外代理。
- `model_policy`：当前 host 模型、默认节省路由或显式质量路由，只回答用什么模型和推理强度。
- `release_mode`：快速产品或正式认证，只回答需要什么验收等级。

具体行为：

- 小而清晰的工作默认由主 Codex 完成，不为获得 Saving Mode 而创建 Team。
- 主 Codex 使用当前 host/用户已经选择的模型；Atlas 不伪装成能够在任务中途改写根模型。
- 确实需要子代理时，默认使用节省路由；只有用户明确要求质量模式，或当前已授权规则明确要求更高模型时才升级。
- 使用 Team 不自动进入质量模式，选择质量模式也不自动要求 Team。
- Saving/quality 选择不持久化为 workflow 状态，不自动影响后续任务。
- lane 可以有独立模型选择，但不能改变该 lane 的目标、权限、路径和验收。
- Claude-family 手工精确选择和权限边界继续保留。

#### 首批不做的部分

首批不建设独立的全局模型路由服务、不控制 root agent host 模型、不读取账单推理元数据，也不修改 agent runtime 或 provider catalog。

## 5. 首批验收矩阵

| 场景 | 必须得到的结果 |
| --- | --- |
| “完成可内部使用的 MVP” | 进入 `product_increment`；不因 MVP 标签自动要求 v4、Team、receipt 或正式 Profile |
| “完成可小范围公测的 Beta” | 进入 `product_increment`；只增加真实暴露所需的最小检查 |
| 复杂 `tsx -e` 真实执行通过，但 recorder 无法记录 | 可形成阶段产品结论；报告证据采集降级；不得声称认证 |
| 真实检查失败 | 所有路径都阻断 |
| 明确请求正式发布认证 | 保持现有 `product_release`、semantics v4 和 Team execution-v3 |
| 主 Codex 是唯一写者 | 不为形式要求 path lease |
| Team 只做只读 review | 不要求 path lease |
| 多个并发写者或发生接管 | 必须有不重叠所有权、lease/quiescence 保护或停止新增写者 |
| 主 Codex 直接执行普通工作 | 不为使用 Saving Mode 创建 Team，也不声称 Atlas 已改写 host 模型 |
| Team 使用默认节省路由 | 不自动升级质量模式；用户显式选择仍然优先 |

## 6. 后续优化债务清单

本节是跨任务保留的正式 backlog。`延期` 表示方向有价值但不进入首批；`按证据再决定` 表示没有真实需求前不建设。任何后续实施都需单独授权，不能由本文件自动扩大范围。

| ID | 状态 | 后续问题 | 当前为何不做 | 重新启动条件 | 未来完成标准 |
| --- | --- | --- | --- | --- | --- |
| D-01 | 延期 | 开发验收、阶段验收、发布认证的完整三级机器模型 | 当前两条路已经解除主要阻断；增加第三级需要新状态、schema 和迁移 | 出现真实客户、多个并行产品线或阶段结论需要跨团队审计 | 三个等级有独立输入、完成条件和升级规则；低等级不能伪造高等级结论 |
| D-02 | 延期 | `product_increment`、exposure 和风险等级的结构化 schema | 首批使用政策和报告术语即可，机器化会扩大实现面 | 快速通道被稳定使用，且误路由或跨会话歧义实际发生 | schema 可向后兼容；不要求 release Profile；能可靠区分内部使用、公测和正式认证 |
| D-03 | 延期 | required check 从 shell 字符串迁移为结构化 argv；统一命令身份、转义与安全边界 | 快速通道绕过 recorder 后不再阻断产品；当前严格路径可保留兼容修复 | 正式认证再次被复杂命令阻断，或发现命令身份/注入风险 | argv、cwd、env、inputs 分字段；禁止二次 shell 猜测；旧字符串合同有明确迁移器 |
| D-04 | 延期 | recorder/ledger/receipt 的正式 transparent degraded mode | 首批直接报告降级，不为普通开发建设第二套证据协议 | recorder 故障频繁、跨会话证据丢失或阶段结论需要机器消费 | 降级证据有来源、完整性、时效和限制；阶段可降级，正式发布仍 fail closed |
| D-05 | 延期 | receipt 可信等级以及 ledger 与产品结论解耦 | 快速路径不使用它们；现在重构收益低 | 同一结果反复因 recorder/ledger 工具故障被否定 | 产品 outcome 与 evidence-capture outcome 分字段；工具故障不能覆盖真实失败或真实通过 |
| D-06 | 延期 | keeper、slice acceptance、dependency admission 解耦；引入轻量 dependency outcome manifest | 首批直接绕开 execution-v3，不改其内部合同 | 大量非发布 Team 工作仍因依赖 receipt/keeper 阻断 | 下游依赖稳定输出和验证摘要，而不是上游完整内部 ledger；严格发布可继续要求完整链 |
| D-07 | 延期 | 通用的 Team 外 path lease/runtime ownership 服务 | 首批只按风险选择现有 lease；新服务会引入状态和恢复问题 | 主 Codex、外部工具和多工作区经常并发写同一仓库 | lease 与 Team 生命周期独立；支持冲突检测、到期、接管、恢复和明确所有权 |
| D-08 | 延期 | Team 外的全局模型路由和成本/质量策略服务 | 首批只改选择语义；Atlas 当前不能可靠改写 root host 模型 | 多入口、多个 provider 或成本治理需要统一策略 | staffing、model、quality、provider 四类决定独立；能力来自可信实时发现；无隐式升级 |
| D-09 | 按证据再决定 | 自动风险评分器、完整 Beta Profile、强制 reviewer/verifier 矩阵 | 现在风险简单，人工规则成本更低 | 误判风险明显增加、监管要求出现或团队规模扩大 | 评分可解释、可覆盖、不会因文件数或“产品”标签自动升级；验收成本与实际暴露匹配 |
| D-10 | 延期 | 长运行事件流、rolling checkpoint、state/event 文件压缩、快照和恢复 | 与当前产品阻断无直接关系 | 事件文件影响性能、恢复或跨会话连续性 | 有有界 checkpoint、可验证 replay、压缩保留链路完整性、崩溃后恢复测试 |
| D-11 | 延期 | 插件 source、installed cache、workflow runtime、marketplace 和会话生命周期简化 | 当前明确禁止安装态变更；重构操作风险高 | 刷新错误、版本漂移或会话重启反复发生 | 开发源与派生产物单向清晰；exact version/SHA 激活；无隐式 latest fallback；可回滚 |
| D-12 | 按证据再决定 | 既有任务/合同迁移、兼容适配器和双写 | 首批不追溯迁移；双写会增加复杂度 | 必须让大量长期任务进入新语义，且不能自然结束旧任务 | 一次性可验证迁移优先；无必要不双写；旧严格发布决定保持可审计 |
| D-13 | 延期 | API-only、CLI、worker 和更多 mixed-surface 的正式 release Profile 与可信 producer | 与快速推出当前产品无关，且正式 producer 成本高 | 这些表面真正需要 source-level release certification | 每个 Profile 有不可变策略、可信 producer、同候选绑定和完整认证回归 |
| D-14 | 按证据再决定 | 全阶段强制独立 reviewer/verifier 和固定角色编制 | 默认编制会增加延迟且不等于质量 | 法规、客户合同或事故数据证明必须强制分权 | 只对明确风险触发；角色独立性可验证；普通低风险工作仍可单人完成 |

## 7. 原则上不再建设的默认行为

除非未来出现新的明确权威或法规要求，以下行为不应重新引入：

1. 因为交付物叫 MVP 或 Beta 就自动进入正式发布认证。
2. 因为任务复杂、文件多或使用 Team 就自动要求所有 ceremony。
3. 因为使用 Team 就自动要求 path lease；因为未使用 Team就忽略真实写入冲突。
4. 因为使用 Team 就自动升级模型质量，或为了节省模型成本而创建无价值的 Team。
5. 将 recorder、ledger、receipt 或任何单一工具作为普通产品正确性的唯一来源。
6. 每个阶段都强制生成正式 release decision。
7. 自动刷新真实 cache/runtime/marketplace 或把派生产物反向当作开发源。
8. 自动持久化 Saving/quality 选择并传播到后续无关任务。

## 8. 本次 incident 与长期债务的对应关系

| 观察 | 分类 | 本方案处理 |
| --- | --- | --- |
| 完整可用的 MVP 被自动视为正式发布候选 | 本次 incident 暴露的直接设计错误 | RP-01 首批修正 |
| recorder 无法记录复杂但固定的 `tsx -e` 命令 | 本次 incident 暴露、长期命令合同债务 | 快速路径绕开；D-03、D-04 保留根治项 |
| receipt/keeper/dependency admission 让工具故障阻断产品 | 本次 incident 暴露、长期 execution-v3 耦合债务 | 快速路径绕开；D-05、D-06 延期 |
| Team、path lease、模型路由和 Saving Mode 被概念性捆绑 | 长期框架债务 | PL-01、MR-01 做轻量首批调整；D-07、D-08 保留完整重构 |
| event/state 增长和恢复复杂 | 长期运行债务，非本次直接原因 | D-10 延期 |
| source/cache/runtime/marketplace 生命周期复杂 | 长期操作债务，非本次直接原因 | D-11 延期 |

## 9. 实施边界和停止条件

### 首批允许修改的逻辑范围

- Atlas plugin 默认路由提示。
- `task`、`clarify`、`product-design`、`team` 等直接相关 skill 规则。
- Atlas plugin 和 workflow helper 的说明文档。
- 与这些路由语义直接对应的合同测试。

### 首批禁止扩张

- 不修改 Kivo。
- 不修改 workflow helper runtime、事件、schema、ledger、receipt、keeper、recorder 或 release adapter。
- 不迁移已有 execution-v3 任务。
- 不刷新 cache/runtime/marketplace，不安装、不发布、不部署。
- 不把 D-01 至 D-14 中的项目顺带实施。

### 必须停止并重新确认的情况

1. 只有修改 runtime/schema 才能防止快速产品误入正式认证。
2. path lease 的轻量规则无法在不迁移状态的情况下表达。
3. 模型路由调整需要更改 root host 模型、provider 配置或 agent runtime。
4. 严格 `product_release` 的 fail-closed、同候选绑定或 release decision 被削弱。
5. 实施需要触碰 Kivo、真实安装态、marketplace 或其他未授权外部状态。

## 10. 验证计划

实施时按影响面从小到大运行：

1. `bash workflow/tests/contract_release_prompt.sh`
2. `bash workflow/tests/contract_product_design_skill.sh`
3. 对 Team/path lease/model 路由新增或更新最小合同断言
4. 官方 `validate_plugin.py`
5. `workflow/bin/atlas-plugin-integrity manifest`
6. `bash workflow/tests/contract_repo.sh`
7. `git diff --check`

若形成插件 release slice，内容和 review 结论冻结后才最后执行 cachebuster bump；bump 后不得继续修改 plugin tree。真实安装、刷新和发布仍需单独授权。

## 11. 阶段产品报告模板

快速产品完成时使用最小、诚实的结论：

```text
阶段产品状态：可用于内部测试 / 可用于小范围公测
关键用户流程：通过 / 未通过
专项检查：通过 / 未通过 / 未运行（原因）
证据采集：正常 / 降级（原因）
正式发布认证：未请求
```

该报告不是 release certificate，不能产生或替代 `release_decision`。
