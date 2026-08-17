# Atlas Workflow 默认轻量化方案

- 状态：第一阶段源码已实施并完成专项/正式 release authoring-admission 回归；尚未刷新安装态、运行 live-host 行为 smoke、发布或部署
- 日期：2026-08-17
- 评估基线：`f8d59bb`（本地 `main` 与 `origin/main` 一致）
- 目标仓库：`atlas-forge`
- 当前已授权并完成：第一阶段源码实施（Commit A/B 逻辑范围）
- 当前不授权：workflow runtime/schema、安装态、marketplace、Kivo、Beezer、真实 Codex live-host E2E、发布、部署或任何外部环境 mutation

## 实施结果（2026-08-17）

第一阶段已按本方案完成源码实现：

- Commit A 逻辑范围：Clarify 改为默认 main-only；只有具备明确消费者且能实质降低延迟或当前风险的独立证据域/专家视角才创建 read-only child。已选择 planning/review lane 的 frontier model policy 保持不变。
- Commit B 逻辑范围：`required_safety_gates` 从 Product/UI 必填字段中移除；ordinary contract 可完全省略该字段，历史字段继续兼容读取；模板改为将真实风险控制直接绑定 acceptance/edge case。
- 未修改 reviewer/controller、Team runtime、release runtime/schema/Profile/adapter、ledger、receipt、lease 或 event state。
- 已通过 `contract_implementation_contract.sh`（206 cases）、`contract_clarify_parallel_routing.sh`、release certification authoring/admission 与 implementation-contract-vnext admission 共 14 个 Node tests、`contract_release_prompt.sh` 和 `git diff --check`。
- live-host 行为 smoke 尚未运行；仓库约束要求真实 Codex CLI E2E 为显式隔离验证动作，因此不由本次“按方案实施”自动授权。

## 1. 结论

Atlas 当前有两个已经被源码和真实会话直接证明的默认复杂度放大器：

1. **Clarify 自动 staffing**：非 tiny Clarify 默认启动只读 child，把“是否需要第二视角”从价值判断变成默认动作。
2. **ordinary Product/UI 合同强制 safety 显著性**：`required_safety_gates` 是必填字段，且 `none` / `not_applicable` 会被 lint 拒绝，迫使 Agent 为没有额外风险的普通任务寻找或编造 safety gate。

第一阶段只修这两个已证实问题。

**Reviewer/controller 暂不修改。** 当前 SDD 已经机器化约束 `goal-blocker`、`diff-regression` 和 `safety-data-permission-risk` 的 authority；真实问题更可能出现在显式多 Agent 场景下主 Agent 的综合与取舍。先用真实事故场景验证，失败后再修，不预先重复治理。

本轮同时明确：

- 不新增公共 `certify` skill；
- 不新增 `work-contract.md`；
- 不取消已明确选中的 planning/review lane 的 frontier model 路由；
- 不重构 Team 全部 references；
- 不修改 ledger、receipt、lease、event 或 execution runtime；
- 不建设新的 blocker schema、风险评分器或“防过度设计”治理系统。

批准并实施后，本方案取代以下两份文档在“普通工作默认行为”上的权威性：

- `docs/atlas-workflow/20260803-001-atlas-rapid-product-path/implementation-plan.md`
- `docs/atlas-workflow/20260809-001-atlas-clarify-team-bounded-parallel/implementation-plan.md`

严格 `product_release` 认证保持兼容，不在本轮删除或降级。

## 2. 第一性原理

Atlas 的价值标准只有一个：

> 与不使用 Atlas 相比，更快、更可靠地完成用户真实目标。

任何 workflow、Agent、contract、gate、receipt、lease 或 evidence 机制，只有在它降低的当前失败风险大于自身带来的延迟、认知成本、实现复杂度和新故障面时，才应进入当前路径。

普通任务默认顺序应是：

```text
理解目标
  → 直接实现
  → 运行目标行为
  → 做与改动直接相关的检查
  → 汇报真实结果
```

而不是：

```text
发现可能风险
  → 建合同
  → 建 gate
  → 建证据
  → 再证明 gate / 证据 / authority
  → 最后才实现
```

本方案遵守一个额外原则：

> **只修改已经有因果证据的默认行为。** “看起来可能有帮助”的重构不进入第一阶段。

## 3. 已证实根因

### 3.1 Clarify 把第二视角变成默认 staffing

当前 `plugins/atlas-workflow/skills/clarify/SKILL.md` 明确规定：

```text
For non-tiny Clarify, the default is main + at least one read-only child lane
```

对应结构测试还强制该行为存在。

问题不是并行算法本身，而是决策顺序错误：

```text
当前：先判断 non-tiny → 自动创建 child → child 再寻找价值
目标：先证明 child 有独立价值 → 再创建 child
```

自动 child 会自然增加：

- 被调查的风险面；
- reviewer 建议数量；
- 主 Agent 需要综合的候选机制；
- latency 和 token 成本。

因此第一阶段必须取消 Clarify 自动 staffing。

### 3.2 ordinary Product/UI 合同强制 safety gate 显著性

当前 `plugins/atlas-workflow/scripts/codex-implementation-contract-lint` 中：

1. `required_safety_gates` 属于 Product/UI required fields；
2. `product_ui_gate: required` 时必须填写；
3. `cancelsSafetyGates()` 会把以下内容判为非法：

```text
none
not needed
no safety gates
无需安全门禁
安全门禁可选
```

最终产生：

```text
REQUIRED_SAFETY_GATES_INVALID
required_safety_gates cannot be empty or not applicable
```

这不是单纯“lint 太严格”，而是一个机器级设计偏置：

```text
普通 UI 工作
  → 必须看到 required_safety_gates
  → 必须写一个非空 safety gate
  → safety 成为默认设计维度
  → 很容易继续扩张对应机制
```

只把 `none` 改成合法仍不够，因为字段名和 hard-safety boilerplate 仍会持续制造显著性。

第一阶段的目标应是：

> **ordinary 合同里没有额外风险时，`required_safety_gates` 字段可以完全不存在。**

## 4. 已排除的伪根因

### 4.1 Reviewer admission 规则并不缺失

当前 SDD controller resolution 已经具备：

- `goal-blocker`：必须绑定当前 acceptance；
- `diff-regression`：必须绑定当前 slice + 当前 diff；
- `safety-data-permission-risk`：必须绑定 canonical invariant + 当前 diff + 当前 acceptance，并提供实质因果理由。

`team/references/sdd.md` 和 Team 主规则也明确：

- severity / `required_fix` / remediation prose 不授予 scope；
- 只有 controller `current-required` 才进入当前交付；
- 架构优化、相邻清理、历史缺陷默认 follow-up。

因此不能再把“缺少 acceptance-based reviewer rule”作为第一阶段根因。

如果显式多 Agent 场景仍然出现建议叠加，优先调查：

```text
reviewer 正常发现问题
  → main/controller synthesis 过度采纳
```

而不是继续给 reviewer/schema 增加一套重复规则。

### 4.2 Frontier model 不是已证实根因

两个决定必须保持独立：

```text
staffing：是否创建 child / reviewer
model：已选择的 lane 使用什么模型
```

当前证据支持取消的是“自动创建 child”，不支持降低已经明确选中 reviewer 的模型质量。

所以第一阶段：

- 取消 Clarify 默认 child；
- **保留**已明确选择 planning/review lane 后现有 frontier-capable model 路由；
- 不修改 `atlas-agent-model-policy`；
- 不以“轻量化”为理由把高价值 reviewer 降级到低质量模型。

## 5. 目标默认路由

第一阶段后的路由应是：

```text
目标清晰、可直接验证？
  是 → Direct / Task
  否 ↓

是否存在会改变行为、数据、权限、部署目标或验收结果的真实未决边界？
  是 → Clarify（默认 main-only）
  否 → Direct / Task

是否已经证明独立第二视角会明显降低延迟或风险，或用户明确要求多 Agent？
  是 → 创建对应 child / Team lane

用户明确要求 formal certification / release-ready / certified？
  是 → 进入现有严格 product_release 路径
```

补充规则：

- 文件多不能单独触发 Team；
- 任务复杂不能单独触发 Team；
- 用户描述短不能单独触发 child；
- 制造业不能单独触发 safety gate；
- MVP、Beta、客户验证、现场调试、生产构建、部署本身都不等于正式源码认证；
- 用户明确要求多 Agent 时必须尊重，但 Agent 数量本身不授予新 scope，也不提高门禁等级。

## 6. 风险控制原则

不建立新的固定风险等级、行业矩阵或 blocker schema。

新增一个控制前只回答四个问题：

1. 不加它，当前目标或当前交付会出现什么具体失败？
2. 失败路径在当前执行条件下是否真实可达？
3. 是否已有更简单的预防、事务、幂等、readback 或恢复方式？
4. 该控制是否服务当前消费者，而不是潜在未来？

无法回答，就不进入当前实现。

典型示例：

| 当前动作 | 通常足够的最小控制 |
| --- | --- |
| 普通 API/UI/本地逻辑修改 | 相关测试 + 关键流程验证 |
| 生产或共享环境写入 | 精确目标 + 明确 execute authority + 定向 readback |
| 不可逆删除或数据库 migration | 可验证备份/恢复路径 + 单一执行 owner |
| 可能驱动设备物理运动 | 当前设备安全状态确认 + 监督或隔离测试 |
| 凭据、权限或身份边界变化 | Secret 不泄露 + 最小权限 + scope 核对 |

这些只是例子，不形成新的封闭分类系统。

重大风险也不要求必须由当前 diff 新增。若当前部署、操作或暴露会使一个既有危险路径变得可达或显著放大，它仍然是当前交付必须处理的问题。

## 7. Clarify：只取消自动 staffing

### 7.1 新默认

```text
Clarify 默认 main-only
```

只有满足以下条件之一，才创建 read-only child：

- 用户明确要求多 Agent / reviewer；
- 存在一个独立证据域，其结果会改变当前方案；
- 存在一个专门视角，能够明显降低当前已识别风险；
- 并行调查能实质缩短关键路径，且 lane 输入和消费者明确。

“non-tiny”本身不再构成 child admission。

### 7.2 不修改模型质量策略

如果一个 planning/review child 已经被明确选择：

- 继续使用当前 frontier planning/review model policy；
- 不因本轮轻量化降级其模型；
- 不修改 Team 的模型路由、Saving/Quality policy 或 provider runtime。

### 7.3 必改位置

预计至少同步：

- `plugins/atlas-workflow/skills/clarify/SKILL.md`
- `plugins/atlas-workflow/skills/task/SKILL.md` 中对 Clarify bounded-parallel default 的描述
- `plugins/atlas-workflow/README.md`
- `plugins/atlas-workflow/.codex-plugin/plugin.json` 的 compact/default prompt 对应语义
- `workflow/tests/contract_clarify_parallel_routing.sh`

若 Claude 插件或 command 文档重复声明 Clarify 自动 child，只同步该声明，不扩张到其他 Team/model 行为。

### 7.4 暂不修改

- `workflow/bin/atlas-agent-model-policy`
- Team 已选 planning/review lane 的 frontier routing
- Paseo/Cross/provider policy
- Team scheduler/runtime

## 8. ordinary Product/UI contract：真正移除 safety 必填

### 8.1 目标语义

对于普通 semantics v5 implementation：

```text
没有额外风险控制
  → required_safety_gates 字段可以完全省略
  → 不需要写 none / not_applicable

有当前真实风险
  → 把最小控制直接绑定到对应 acceptance / edge case
```

ordinary Product/UI gate 继续验证真正有产品价值的内容，例如：

- 首个可操作用户流程；
- 真实 served HTTP(S) entrypoint；
- 实际浏览器验证动作；
- 当前 UI data mode；
- 直接相关的 stop boundary。

但“不存在额外 safety gate”不再是一种需要解释或证明的异常状态。

### 8.2 具体修改原则

第一阶段应：

1. 从 ordinary Product/UI 必填字段集合中移除 `required_safety_gates`；
2. ordinary contract 完全缺少该字段时 lint 合法；
3. 历史合同仍可包含该字段，继续兼容读取；
4. 删除 ordinary template 中无条件要求 hard safety gate 与 UI thin slice 共同满足的 boilerplate；
5. 若有真实风险控制，优先进入对应 Acceptance / Edge Case，而不是创建独立 safety 清单；
6. 不新增 `risk_controls` schema，不把旧必填字段换成一个新的必填字段。

### 8.3 正式 product_release

正式 release safety floor 已由 immutable Profile、release intent、same-candidate final sweep、trusted producer 和 release decision 等严格机制承担。

因此 free-text `required_safety_gates` 不应成为第二套 release authority。

第一阶段必须证明：

```text
ordinary v5 不再要求 free-text safety field
AND
formal v6 Profile / authoring / admission 语义不退化
```

历史 v5/v6 合同保持可读，不做迁移。

### 8.4 预计修改位置

- `plugins/atlas-workflow/scripts/codex-implementation-contract-lint`
- `workflow/templates/implementation-contract.md`
- `workflow/templates/implementation-contract.final.md`
- 直接相关 implementation-contract fixtures/tests

不在本轮重写整个 implementation contract schema。

## 9. Reviewer/controller：第一阶段只验证，不修改

第一阶段不修改：

- Codex/Claude reviewer instructions；
- planner / phase-reviewer instructions；
- `team/references/sdd.md` admission 规则；
- controller-resolution schema/validator；
- finding basis 枚举。

原因：现有机器规则已经具备 scope admission 边界，继续加规则很可能只是重复治理。

### 9.1 必须新增的高信号行为场景

用最近真实事故模式验证：

```text
用户明确要求多个 subagent
+ 明确要求克制
+ 当前目标是现场业务问题/故障修复
```

期望：

- 确实使用多个 Agent；
- 每个 lane 只解决一个明确业务问题；
- reviewer 可以自由发现风险；
- main/controller 不把所有合理建议自动叠加成当前架构；
- 只采用满足当前目标或当前交付安全所需的最小修复；
- 不因为“多 Agent”自动引入 receipt、immutable authority、exactly-once、maintenance fence 等体系。

### 9.2 只有场景失败后才允许修改 synthesis

若该场景仍出现建议叠加，第二步才定位 main/controller synthesis。

届时 blocker 判断应是：

```text
blocking =
  explicit current acceptance fails
  OR current diff causes a reachable regression in the affected surface
  OR current delivery/deployment/operation exposes or materially worsens a reachable major risk
```

每个 blocking finding 必须能说明：

```text
证据
失败路径
当前影响
满足当前目标的最小修复
为什么更简单方案不足
```

无法做到时进入 follow-up。

这属于**失败后修正**，不是第一阶段预授权实施范围。

## 10. 正式认证：继续兼容，默认不扩张

当前严格 release certification 保留现有 runtime/schema/Profile/adapter。

第一阶段不新增：

```text
$atlas-workflow:certify
/certify
certification-contract.md
新的 public manifest entry
新的 release 状态机
```

普通 skill 只需维持最短必要边界：普通产品增量不能自述 `certified`；明确 formal certification 时进入现有严格路径。

是否未来增加独立认证入口，等至少一个真实项目实际产生并消费 workflow 派生的 `certified` 后再决定。

## 11. 第一阶段实施范围

第一阶段只有两个实施切片，建议放在同一个 PR 中，但分成两个独立逻辑 commit，逐个验证因果。

### Commit A：取消 Clarify 自动 child

建议 commit：

```text
fix(atlas-workflow): make clarify main-only by default
```

只改变 staffing 默认，不改变已选择 reviewer 的 model policy。

完成 A 后立即运行 A 的专项测试和行为 smoke；不要等待 B 完成后才一起判断。

### Commit B：移除 ordinary safety 必填

建议 commit：

```text
fix(atlas-workflow): make ordinary safety controls optional
```

目标不是允许：

```text
required_safety_gates: none
```

而是允许 ordinary contract 完全没有该字段。

完成 B 后单独验证 v5 ordinary 和 v6 release authoring/admission。

### 第一阶段明确没有 Commit C

Reviewer/controller 改动只有在显式多 Agent 事故场景失败后才新开后续切片，不预先进入当前 PR。

Release context 深度搬迁、Team references 全量拆分也不进入第一阶段。

## 12. 第一阶段行为验收

必须覆盖四个场景：

| 场景 | 期望 | 不应自动出现 |
| --- | --- | --- |
| 普通 API 读取错误 | Direct/Task，主 Agent 直接修复验证 | Team、lease、receipt、release Profile |
| 普通 UI 增量 | Task；确有未决边界时 main-only Clarify | 自动 child、强制 safety 清单 |
| 本地产物传现场验证，生产仍走 CNB | 最短 build/copy/start/smoke 路径 | ReleaseEnvelope 重构、本地生产签名、认证状态机 |
| 用户明确要求多 subagent + 要求克制 | 使用多个窄 lane，main 只采用当前必要修复 | 因 Agent 多而扩张 receipt/authority/exactly-once 等治理体系 |

另设一个严格兼容场景：

| 场景 | 期望 |
| --- | --- |
| 明确要求 release-ready / certified | 现有正式 product_release 路径仍 fail closed，不允许普通 Task 自述认证 |

## 13. 成功指标

优先观察真实结果，不以文案关键词数量作为主要指标：

- 到首个可运行结果的轮次；
- 永久新增文件数；
- 永久新增 LOC；
- 新增长期机制数量；
- blocking finding 数量；
- 用户纠偏次数；
- 关键用户流程是否实际通过；
- 显式多 Agent 场景是否出现建议叠加；
- 正式 release 兼容是否保持。

第一阶段通过条件：

1. 普通 Clarify 不自动创建 child；
2. 已明确选择的 review lane 仍保持现有高质量 model policy；
3. ordinary Product/UI contract 可以完全省略 `required_safety_gates`；
4. 没有真实风险时不需要生成 safety 清单；
5. 正式 v6 release Profile / authoring / admission 无回归；
6. 显式多 Agent + 克制场景若已收敛，则不修改 reviewer/controller；
7. 第一阶段没有增加新的公共 skill、contract 类型、ledger、receipt、schema 或 runtime 状态。

## 14. 最小验证

### Commit A

至少运行：

1. `bash workflow/tests/contract_clarify_parallel_routing.sh`
2. 与 Clarify/defaultPrompt 直接相关的 plugin contract test
3. `git diff --check`

保留已选 planning/review lane 的 frontier policy 相关测试，不应为了 A 去修改 model-policy runtime。

### Commit B

至少运行：

1. `bash workflow/tests/contract_implementation_contract.sh`
2. `bash workflow/tests/contract_release_prompt.sh`
3. `node --test workflow/tests/js/implementation-contract-vnext-admission.test.js`
4. `node --test workflow/tests/js/release-certification-authoring.test.js`
5. `node --test workflow/tests/js/release-certification-admission.test.js`
6. `git diff --check`

原因：v5/v6 共用部分 implementation contract validation 链，虽然不修改 release runtime，B 仍直接影响正式 release authoring/admission。

### PR 集成

再运行：

1. 官方 `validate_plugin.py`
2. `workflow/bin/atlas-plugin-integrity manifest`
3. `bash workflow/tests/contract_repo.sh`
4. `scripts/check-relative-markdown-links.py --root .`
5. `git diff --check`

只有直接修改 release runtime/schema/adapter 时才扩大到完整 release runtime suite；本方案不预授权这些修改。

## 15. 第二阶段启动条件

第一阶段完成后必须先看行为结果。

只有出现以下证据才进入第二阶段：

### 15.1 显式多 Agent 场景仍叠加设计

才允许修改 main/controller synthesis；不优先修改已经有 admission 约束的 reviewer schema。

### 15.2 普通任务仍因 release 上下文产生治理设计

才评估将 Team 中完整 release certification 文字移到内部按需 reference。

### 15.3 Team 本身上下文仍明显污染普通协作

才评估拆分：

- model routing；
- Cross；
- Paseo；
- SDD；
- business acceptance。

但每次只拆有行为证据的部分。

如果第一阶段已经明显收敛，**停止，不继续做第二阶段。**

## 16. runtime 清理的启动条件

只有在上游轻量化后仍出现以下事实，才单独制定 runtime 删除方案：

- 普通路径被 ledger/receipt/lease runtime 实际阻塞；
- `outcome_unknown` 或 immutable lock 在非适用路径仍被自动创建；
- 旧 runtime 本身成为高频现场失败来源；
- 已确认没有必要消费者，并且删除收益明显高于兼容成本。

本方案不授权任何 runtime/schema 删除。

## 17. 明确不做

第一阶段不做：

- reviewer/controller 新 schema 或新 predicate 实现；
- 新公共 `certify` skill；
- 新 `/certify` command；
- 新 `work-contract.md`；
- 新 certification contract 类型；
- 新 `risk_controls` schema；
- 新风险评分器；
- 新 lightweight ledger/receipt；
- outcome_unknown 通用状态机；
- exactly-once 框架；
- Team 全量 references 重构；
- frontier reviewer 模型降级；
- 全仓 runtime 重写；
- 自动 reviewer 委员会；
- 批量删除 release runtime；
- 修改 Kivo、Beezer 或其他业务项目；
- 为证明“已经简化”再建设一套证据系统。

## 18. 停止条件

实施中出现以下任一情况，停止扩张并重新审查：

1. Commit A 需要修改 agent runtime/provider 才能做到 main-only；
2. Commit B 必须增加新 schema 或迁移状态才能让 ordinary safety field 可省略；
3. 旧合同兼容要求双写或新迁移状态机；
4. v6 release Profile、same-candidate、trusted producer 或 admission 语义出现回归；
5. A/B 已经解决普通行为问题，但实现仍准备顺带修改 reviewer、Team 或 runtime；
6. 为“轻量化”新增的长期机制数量开始大于删除的默认机制数量；
7. 显式多 Agent 场景没有失败证据，却准备提前修改 controller synthesis。

## 19. 预期结果

第一阶段完成后的 Atlas 应是：

```text
普通任务
  → 直接做
  → 跑关键流程
  → 跑相关检查
  → 简短汇报

确实缺边界
  → main-only Clarify
  → 必要时复用现有 clarify.md
  → 实施

用户明确要求或确实需要第二视角
  → 创建对应 child / Team lane
  → 已选 review lane 保持高质量模型
  → main 只综合当前目标所需结果

普通 Product/UI 合同
  → 无额外风险时没有 safety 字段
  → 有真实风险时把最小控制绑定到具体 acceptance / edge case

明确正式认证
  → 现有严格 product_release 路径
```

本方案的目标不是建设一套“防止过度设计”的新系统，而是删除两个已经被证实会自动制造复杂度的默认行为，然后用真实场景判断还需不需要继续改。