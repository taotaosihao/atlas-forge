# Atlas Forge Native Team：业务验收优先的通用 Agent 交付框架方案

> 版本：2026-07-07
> 适用范围：`atlas-forge` 的 `atlas-workflow` / `$atlas-workflow:team` / Codex native team 体系
> 方向：通用业务 agent 交付框架，可偏向制造业，但不绑定任何具体 FMS、PLC、CNC、仓储或调度项目细节
> 重要约束：Multica SDLC 后续弃用，本方案不优化、不依赖、不迁移 Multica SDLC；只增强 native team 业务规划与业务验收能力
> 核心原则：**验收重心从技术完成转向业务闭环成立；技术验收从“目标”退到“不可降低的安全地板”，但门槛不下降。**

---

## 0. 总结

上一版方案已经提出了业务闭环协议、业务线程、action contract、scenario card、scorecard 等方向，但从第一性原理审查后，仍有一个结构性问题：

```text
它仍然像是在现有技术交付流程旁边“增加业务文档”，
而不是把 native team 的默认交付判定从“技术验收通过”改成“业务闭环可被证明”。
```

因此，本版方案做三个关键调整：

1. **业务验收前置**：所有实现切片之前，必须先形成业务意图、业务对象、状态迁移、agent 行为合同和验收场景卡。没有业务合同，不能开始非平凡实现。
2. **业务闭环作为最终 release gate**：技术验证通过只说明“系统有资格被业务验收”，不能直接说明“交付完成”。最终完成必须由业务 playback、scorecard、deviation log 和 regression scenario library 支撑。
3. **技术验收门槛不降**：技术验收不再是唯一目标，但变成硬门槛。任何关键技术 gate 失败，都不能被业务高分覆盖；任何缺少 trace、audit、权限、状态一致性、幂等、回归证据的流程，都不能标记为业务可用。

建议将增强协议命名为：

```text
BAF = Business Acceptance First Protocol
```

BAF 不是新插件，而是 `$atlas-workflow:team` 的业务验收优先工作法。它复用 native team 的 orchestrator / subagent / staffing / decision / verification 机制，但重新定义交付完成的判定方式：

```text
原来：
  task -> implementation -> review -> technical verification -> done

调整后：
  business intent -> business closure model -> action contract -> scenario cards
  -> implementation with hard technical gates
  -> business playback -> scorecard -> deviation classification -> regression library
  -> business accepted / rejected / conditionally accepted
```

---

## 1. 第一性原理审查

### 1.1 Agent 交付的本质不是“调用工具”，而是“受控改变业务状态”

从第一性原理看，一个业务 agent 的最小定义不是：

```text
能够理解用户输入并调用多个工具完成任务。
```

而是：

```text
在给定角色、权限、业务对象、当前状态、约束和风险边界下，
选择一个被允许的业务动作，
通过受控技术链路改变业务状态，
并留下足够证据让人类可以验收、追溯和纠偏。
```

因此，多工具调用 agent 的验收不应该停在：

```text
工具能调用
接口能返回
页面能操作
数据库有写入
日志有输出
```

这些只是技术事实。业务交付必须进一步证明：

```text
业务目标是否达成；
流程顺序是否符合真实工作方式；
业务对象状态是否正确迁移；
异常是否按业务风险保守处理；
人是否知道下一步该做什么；
结果是否能被业务负责人接受；
证据是否足以解释为什么这么做。
```

### 1.2 “完成”不是执行成功，而是可验收的业务闭环

业务闭环成立需要同时满足四个条件：

| 条件 | 问题 | 不满足时的表现 |
| --- | --- | --- |
| 业务目标成立 | agent 是否完成了真实业务目的 | 功能都通了，但业务说“不是我要的” |
| 状态迁移成立 | 业务对象是否从正确起点到正确终点 | 页面显示完成，但下游无法接着做 |
| 风险边界成立 | 高风险、不确定、异常是否被保守处理 | agent 自动执行了本该人工确认的动作 |
| 证据链成立 | 是否能复盘每一步为什么发生 | 验收时只能看结果，无法判断对错 |

因此，BAF 的完成定义为：

```text
一个 agent 交付只有在“业务闭环被证据证明”时才算完成。
技术通过是必要条件，业务闭环通过是充分条件。
```

### 1.3 技术验收不是降低，而是从“终点”变成“硬地板”

如果把交付目标从技术验收转向业务验收，容易出现一个误解：技术要求可以放松。这是错误的。

BAF 的原则是：

```text
业务验收决定“是否有业务价值”；
技术验收决定“是否有资格被业务使用”。
```

技术 gate 的地位应更硬，而不是更软：

- 技术 gate 失败时，不允许标记业务通过。
- 业务 reviewer 觉得流程顺，也不能覆盖权限、审计、幂等、状态一致性、回归失败。
- mock / sandbox 通过不能声明生产就绪。
- 无证据不能口头关闭。
- 用户手册不能写入未被证据证明的流程。

### 1.4 Agent 业务能力的关键不在“会规划”，而在“能把业务规划转成可执行合同”

“加强 agent 通用规划业务能力”不应只理解为让 agent 多写计划。计划文档本身没有价值，除非它能约束执行和验收。

BAF 要求业务规划输出必须能落到五类合同：

| 合同 | 作用 |
| --- | --- |
| `Business Intent Contract` | 说明 agent 替谁完成什么业务闭环，不做什么 |
| `Business Object State Contract` | 说明哪些业务对象存在、状态是什么、迁移条件是什么 |
| `Agent Action Contract` | 说明 agent 在什么上下文下能做什么、不能做什么、何时问人 |
| `Scenario Acceptance Contract` | 说明怎么验收，谁验、从哪开始、看什么证据 |
| `Evidence Contract` | 说明技术证据和业务证据分别是什么，缺一不可 |

没有这些合同，所谓业务规划只是描述；有了这些合同，业务规划才能控制实现和验收。

---

## 2. 对上一版方案的审查结论

### 2.1 保留的部分

上一版方案中以下方向是正确的，应保留：

| 保留项 | 原因 |
| --- | --- |
| 只优化 native team，不优化 Multica SDLC | 符合未来弃用方向，避免双轨治理 |
| 增加业务 intent、thread map、action contract、scenario card | 这些是业务 agent 可验收的必要中间产物 |
| 引入 business playback 和 scorecard | 能把“感觉不对”转成可复盘证据 |
| 偏制造业但不绑定具体项目 | 适合成为通用框架，而不是项目专用实施合同 |
| 复用 native team 的 staffing、decision、review、verification | 不推翻已有技术纪律，改造成本低 |

### 2.2 必须修正的部分

| 问题 | 风险 | 本版修正 |
| --- | --- | --- |
| 业务协议像“附加层”，不是主流程 | 实际执行仍可能先开发、后补业务验收 | BAF 改成默认交付路径，业务合同前置 |
| 技术 gate 与业务 gate 关系不够硬 | 可能被理解为更重业务、轻技术 | 引入 `Technical Hard Gate Matrix`，失败即阻断 |
| 缺少 release calculus | 通过/不通过仍可能靠主观判断 | 增加业务评分、一票否决、条件通过、偏差归因 |
| 制造业闭环还偏概念 | 难以落到真实行业场景 | 增加制造业通用对象、线程、异常、证据模型 |
| 没有明确 native team SKILL 改造点 | 难以落地到仓库 | 提供 `team/SKILL.md` 增补草案、目录、模板、validator |
| 技术证据与业务证据混合 | PM 和业务仍不知道看什么 | 拆成 business evidence 与 technical evidence 双证据结构 |
| 没有规定手册和回归库的准入条件 | 可能把未验证流程写入文档 | 用户手册和 regression library 必须引用 evidence run |

---

## 3. BAF 的核心设计

### 3.1 一句话定义

```text
BAF 是 `$atlas-workflow:team` 的业务验收优先协议：
它要求 native team 在实现前先建立业务闭环合同，
在实现中保持技术硬门槛，
在实现后用业务 playback 和 scorecard 证明业务成立。
```

### 3.2 三层验收模型

BAF 将验收分成三层。顺序不能颠倒。

```text
Layer 1: Business Contract Readiness
  先证明“知道要做什么业务闭环”。

Layer 2: Technical Hard Gate
  再证明“技术实现安全、正确、可追溯”。

Layer 3: Business Acceptance
  最后证明“真实业务流程可用、可解释、可交接、可回归”。
```

对应关系：

| 层级 | 目的 | 主要产物 | 失败后果 |
| --- | --- | --- | --- |
| L1 业务合同准备 | 定义真实业务预期 | intent、thread map、state model、action contract、scenario card | 不允许开始非平凡实现 |
| L2 技术硬门槛 | 保证实现可信 | tests、API/DB/log/audit/trace、security、idempotency、e2e | 不允许业务通过 |
| L3 业务验收 | 证明业务闭环成立 | business playback、scorecard、deviation、regression library | 不允许发布为业务可用 |

### 3.3 两类证据必须同时存在

| 证据类型 | 谁看 | 回答什么 |
| --- | --- | --- |
| 业务证据 | PM、业务负责人、现场/一线代表 | 这条流程是否像真实业务？下游能不能接？异常是否合理？ |
| 技术证据 | 研发、QA、安全、架构负责人 | 状态是否一致？权限是否正确？接口是否可靠？是否可追溯、可回归？ |

任何场景的完成判定必须同时具备：

```text
business-playback.md
technical-evidence/
scorecard.md/json
deviation-log.jsonl
trace/index
```

缺少任何一项，不允许声明完成。

---

## 4. 与当前 Atlas Forge native team 的结合方式

### 4.1 当前能力基线

当前 `atlas-forge` 是一个 Git-backed Codex plugin marketplace，包含 `atlas-workflow`、`mempalace`、`multica-sdlc` 等插件；其中 `atlas-workflow` 的定位是任务路由、规划、workflow gates、design review、team handoff 和 bounded local work。BAF 只增强 `atlas-workflow`，不增强 Multica SDLC。

当前 `$atlas-workflow:team` 已经具备以下纪律：

- native-only：必须使用 Codex native subagents；不可用时停止，不能替换成其他非 native 编排。
- 主 Codex 是 orchestrator：subagents 提供 lane work、review、verification，最终整合由主 Codex 负责。
- 有 team artifacts：`round-*.md`、`decision.md`、`staffing.md`。
- lane 输出要求区分 `Evidence`、`Inference`、`Unknown`、`Recommendation`。
- Agent Plan 要 inventory first、reuse first、dynamic roles、phase gates、write boundaries、evidence requirements。
- 高风险跨模块工作要主动规划 reviewer 和 verifier。
- SDD slice protocol 已经强调 controller、brief、review package、ledger、commit policy、review/fix loop 和 final whole-branch review。

BAF 不替换这些机制，而是在它们前后加业务 gate。

### 4.2 改造后的 native team 主路径

```text
用户任务
  -> task setup / route decision
  -> BAF mode classification
  -> source inventory
  -> business contract formation
  -> business scenario acceptance design
  -> implementation slice planning
  -> implementation / review / technical verification
  -> business playback generation
  -> scorecard and deviation classification
  -> regression scenario library update
  -> release decision
```

### 4.3 BAF 新增 team modes

在 `$atlas-workflow:team` 中新增或识别以下模式：

| Mode | 何时使用 | 主要输出 |
| --- | --- | --- |
| `business-contract` | 有业务需求、SOP、流程图、客户 case，需要形成实现前合同 | business intent、thread map、state model、action contract |
| `business-acceptance` | 功能已完成或接近完成，需要验收业务闭环 | scenario card、playback、scorecard、deviation |
| `business-implementation` | 业务合同已完成，需要实现 | implementation slices + technical hard gates |
| `business-loop-repair` | 业务验收失败，需要修复并回归 | deviation fix plan、bounded repair loop、regression rerun |
| `manufacturing-closure-review` | 制造业相关业务 agent，需要审查物理世界、质量、异常、追溯闭环 | manufacturing closure canvas、risk matrix |

### 4.4 BAF 下的 role 规划

BAF 不固定角色数量，遵循 native team 现有动态 staffing 原则。建议 role pool 如下：

| Role | Agent Type | 读写 | 作用 |
| --- | --- | --- | --- |
| `business-controller` | main Codex | write | 总控业务合同、最终整合、release decision |
| `source-explorer` | explorer | read-only | 梳理 SOP、PRD、流程图、聊天记录、历史 case 来源覆盖 |
| `domain-modeler` | explorer/default | read-only 或 bounded write | 建模业务对象、状态、迁移 |
| `process-critic` | explorer/default | read-only | 挑战流程是否像真实业务、是否有隐性规则缺口 |
| `action-contract-designer` | default | bounded write | 编写 agent action contract |
| `manufacturing-risk-critic` | explorer/default | read-only | 审查制造业约束：物料、设备、质量、安全、异常、追溯 |
| `technical-gatekeeper` | explorer/default | read-only | 定义不可降低的技术 gate |
| `implementation-worker` | worker | bounded write | 只在业务合同通过后实现特定切片 |
| `reviewer` | explorer/default | read-only | 评审实现是否偏离合同 |
| `verifier` | explorer/default | read-only | 运行或定义技术与业务验收证据 |
| `evidence-qa` | explorer/default | read-only | 检查 evidence 是否完整、可复现、可被手册引用 |
| `business-playback-writer` | default | bounded write | 把运行结果转成业务语言复盘 |

### 4.5 staffing.md 新增字段

在 native team 的 `staffing.md` 中新增以下章节：

```markdown
## Business Acceptance First Classification
- baf_mode:
- business_domain:
- manufacturing_bias: yes|no
- business_release_required: yes|no
- technical_gate_floor: standard|high|regulated

## Business Sources
| Source | Type | Owner | Freshness | Coverage | Open Questions |
| --- | --- | --- | --- | --- | --- |

## Business Gates
| Gate | Owner | Input | Output | Pass Condition | Blocks |
| --- | --- | --- | --- | --- | --- |

## Technical Hard Gates
| Gate | Owner | Evidence | Required | Blocks Business Acceptance |
| --- | --- | --- | --- | --- |

## Business Acceptance Evidence
| Scenario | Business Evidence | Technical Evidence | Reviewer | Score Threshold |
| --- | --- | --- | --- | --- |
```

---

## 5. 仓库结构建议

### 5.1 新增目录

建议在 `atlas-forge` 内新增：

```text
plugins/atlas-workflow/
  contracts/
    business-acceptance-first/
      schemas/
        business-intent.schema.json
        source-coverage.schema.json
        business-thread.schema.json
        object-state-model.schema.json
        action-contract.schema.json
        scenario-card.schema.json
        evidence-manifest.schema.json
        scorecard.schema.json
        deviation.schema.json
        regression-scenario.schema.json
      validators/
        validate-business-intent.js
        validate-source-coverage.js
        validate-business-thread.js
        validate-object-state-model.js
        validate-action-contract.js
        validate-scenario-card.js
        validate-evidence-manifest.js
        validate-scorecard.js
        validate-deviation.js
        validate-regression-scenario.js
  scripts/
    codex-business-workspace
    codex-business-intent
    codex-business-source-coverage
    codex-business-thread
    codex-business-state-model
    codex-business-action-contract
    codex-business-scenario-card
    codex-business-evidence-manifest
    codex-business-scorecard
    codex-business-playback
    codex-business-deviation
    codex-business-regression
    codex-business-acceptance-gate

workflow/
  templates/
    business-acceptance-first/
      business-intent.md
      source-coverage-ledger.md
      business-thread-map.md
      object-state-model.md
      agent-action-contract.md
      scenario-acceptance-card.md
      business-evidence-manifest.md
      technical-hard-gate-matrix.md
      business-playback.md
      acceptance-scorecard.md
      deviation-log.md
      regression-scenario.md
      manufacturing-closure-canvas.md
      manufacturing-risk-matrix.md
```

### 5.2 运行时 artifact 结构

每个 task 在 `workflow/artifacts/<task-id>/business/` 下生成：

```text
workflow/artifacts/<task-id>/
  context.md
  spec.md
  analysis.md
  decision.md
  team/
    staffing.md
    decision.md
    round-<timestamp>.md
  business/
    00-business-intent.md
    00-business-intent.json
    01-source-coverage-ledger.md
    02-business-thread-map.md
    02-business-thread-map.json
    03-object-state-model.md
    03-object-state-model.json
    04-action-contracts/
      <action-id>.md
      <action-id>.json
    05-scenario-cards/
      <scenario-id>.md
      <scenario-id>.json
    06-evidence-manifest.md
    06-evidence-manifest.json
    07-technical-hard-gate-matrix.md
    08-business-playbacks/
      <run-id>.md
    09-scorecards/
      <run-id>.md
      <run-id>.json
    10-deviations/
      deviations.jsonl
      summary.md
    11-regression-library.md
    12-release-decision.md
```

### 5.3 Artifact 准入规则

| Artifact | 何时必须存在 | 缺失后果 |
| --- | --- | --- |
| `business-intent` | 所有非纯技术任务 | 不能开始业务实现 |
| `source-coverage-ledger` | 需求来自 SOP/PRD/客户 case/聊天记录 | 不能声称覆盖真实业务 |
| `business-thread-map` | 所有业务闭环 agent | 不能拆实现切片 |
| `object-state-model` | 涉及业务对象状态变化 | 不能创建 action contract |
| `action-contracts` | agent 会自动/半自动执行动作 | 不能实现 agent 执行 |
| `scenario-cards` | 需要验收 | 不能进入业务验收 |
| `technical-hard-gate-matrix` | 所有实现任务 | 技术 gate 不清晰，不能标记完成 |
| `business-playback` | 每次验收 run | 不能向业务 reviewer 交付 |
| `scorecard` | 每次业务验收 | 不能给通过/不通过结论 |
| `deviation-log` | 任何失败或条件通过 | 不能进入修复循环 |
| `regression-library` | 任何通过或失败场景沉淀 | 后续不可回归 |

---

## 6. BAF 工作流

### 6.1 阶段总览

```text
B0 任务识别与来源清点
B1 业务意图冻结
B2 业务对象与状态建模
B3 业务线程与 action contract
B4 验收场景卡与证据合同
T1 技术实现与硬门槛验证
B5 业务 playback
B6 scorecard 与偏差归因
B7 修复循环或 release decision
B8 回归库和用户手册准入
```

### 6.2 B0：任务识别与来源清点

目的：防止 agent 在业务事实不明时直接开始设计或实现。

输入：

```text
用户需求
SOP
流程图
PRD
客户 case
聊天记录
历史工单
系统日志
接口文档
现有代码
```

输出：

```text
source-coverage-ledger.md
```

模板：

```markdown
# Source Coverage Ledger

## Sources
| ID | Source | Type | Owner | Date/Freshness | Trust Level | Used For | Gaps |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Coverage By Business Question
| Question | Covered By | Confidence | Open Gap | Decision |
| --- | --- | --- | --- | --- |
| Who performs the task? | | | | |
| What object changes state? | | | | |
| What is the start state? | | | | |
| What is the accepted end state? | | | | |
| What exceptions matter? | | | | |
| What must be manual? | | | | |
| What must be automatic? | | | | |
| What evidence proves closure? | | | | |
```

通过门槛：

```text
每个核心业务问题至少有一个来源；
无来源的问题必须进入 Open Questions；
Open Questions 若影响安全、状态、权限、资金、生产、质量或合规，不能进入实现。
```

### 6.3 B1：业务意图冻结

目的：明确 agent 的“岗位职责”，而不是功能清单。

输出：

```text
business-intent.md/json
```

模板：

```markdown
# Business Intent Contract

## Agent Role
- agent_name:
- acts_for_role:
- does_not_act_for:

## Business Closure
- business_goal:
- start_trigger:
- accepted_end_state:
- downstream_consumer:
- business_owner:

## Boundaries
- automatic_allowed:
- confirmation_required:
- approval_required:
- forbidden_actions:
- external_system_boundaries:

## Risk Policy
- high_risk_conditions:
- fail_closed_conditions:
- human_handoff_conditions:
- audit_required:

## Acceptance Definition
- business_success:
- technical_success_floor:
- evidence_required:
- manual_or_user_doc_allowed_after:
```

通过门槛：

```text
业务负责人/PM 能用一句话说明 agent 替谁完成什么闭环；
禁止动作和人工确认边界明确；
业务成功和技术成功分开定义。
```

### 6.4 B2：业务对象与状态建模

目的：避免 agent 直接从自然语言规划跳到工具调用。

输出：

```text
business-thread-map.md/json
object-state-model.md/json
```

业务对象模板：

```markdown
# Object State Model

## Objects
| Object | Description | State Owner | Created By | Consumed By | Evidence |
| --- | --- | --- | --- | --- | --- |

## States
| Object | State | Meaning | Entry Conditions | Exit Conditions | Forbidden Transitions |
| --- | --- | --- | --- | --- | --- |

## State Transition Rules
| From | Action | To | Preconditions | Actor | Evidence | Failure State |
| --- | --- | --- | --- | --- | --- | --- |

## Invariants
| Invariant | Applies To | Violation Handling | Evidence |
| --- | --- | --- | --- |
```

业务线程模板：

```markdown
# Business Thread Map

## Threads
| Thread | Business Goal | Start | End | Roles | Objects | Critical States | Exceptions |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Thread Steps
| Step | Role | Object | Current State | Action | Expected Next State | Human Decision | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
```

通过门槛：

```text
所有 agent action 都能映射到业务对象状态迁移；
所有终态都有 owner；
所有异常都有保守处理路径；
没有“工具成功 = 业务成功”的隐性假设。
```

### 6.5 B3：Agent Action Contract

目的：把 agent 的业务规划能力约束到可执行、可审计的动作。

模板：

```markdown
# Agent Action Contract: <action_id>

## Business Purpose
- purpose:
- business_thread:
- object:
- state_transition:

## Trigger
- allowed_trigger_sources:
- allowed_roles:
- allowed_modes:
- rate_limit_or_locking:

## Required Context
| Context Item | Source | Freshness | Required | Missing Behavior |
| --- | --- | --- | --- | --- |

## Decision Rules
| Rule | Condition | Decision | Evidence | Risk Level |
| --- | --- | --- | --- | --- |

## Allowed Technical Capabilities
| Capability | API/Tool | Boundary | Evidence |
| --- | --- | --- | --- |

## Forbidden Capabilities
| Capability | Reason | Violation Severity |
| --- | --- | --- |

## Human Gate
- confirmation_required_when:
- approval_required_when:
- human_handoff_payload:

## Success Contract
- technical_success:
- business_success:
- downstream_visible_result:
- evidence_required:

## Failure Contract
| Failure | Expected Behavior | Retry | Human Handoff | Evidence |
| --- | --- | --- | --- | --- |

## Audit And Trace
- trace_id_required: true
- audit_required: true
- idempotency_required: true
- replay_policy:
```

通过门槛：

```text
每个自动或半自动 action 都有 contract；
contract 中必须区分 technical_success 与 business_success；
任何外部系统 side effect 都必须有权限、幂等、trace、audit 和失败路径；
禁止直接绕过业务状态 owner 改终态。
```

### 6.6 B4：验收场景卡与证据合同

目的：让 PM 和业务人员知道从哪里开始验、看什么、怎么判定。

模板：

```markdown
# Scenario Acceptance Card: <scenario_id>

## Scenario Metadata
- scenario_id:
- title:
- priority: P0|P1|P2
- business_thread:
- business_owner:
- product_reviewer:
- technical_reviewer:
- manufacturing_bias: yes|no

## Business Goal
- goal:
- accepted_end_state:
- downstream_user:

## Initial Conditions
| Item | Required State | Seed / Setup | Evidence |
| --- | --- | --- | --- |

## Actor Path
| Step | Actor | Entry Point | User/System Action | Expected Business Observation |
| --- | --- | --- | --- | --- |

## Agent Decision Expectations
| Step | Required Context | Expected Decision | Forbidden Decision | Human Gate |
| --- | --- | --- | --- | --- |

## Expected State Changes
| Object | Before | After | Owner | Evidence |
| --- | --- | --- | --- | --- |

## Technical Evidence Required
| Evidence | Path / Command | Required | Blocks Acceptance |
| --- | --- | --- | --- |

## Business Evidence Required
| Evidence | Reviewer | Required | Blocks Acceptance |
| --- | --- | --- | --- |

## Exception Branches
| Exception | Expected Behavior | Human Handoff | Evidence |
| --- | --- | --- | --- |

## Pass / Fail
- pass_condition:
- fail_condition:
- one_vote_veto:
```

通过门槛：

```text
每个验收场景都能被 PM 独立执行；
每个场景都清楚指定角色、入口、初始数据、预期观察点、技术证据、业务证据；
没有 scenario card 的功能不能进入业务验收。
```

### 6.7 T1：技术实现与硬门槛验证

目的：保证“偏业务验收”不会变成“轻技术验证”。

实现必须继续遵守 native team 现有 SDD / review / verifier 纪律，并增加 BAF 的技术硬门槛矩阵。

详见第 8 章。

### 6.8 B5：业务 Playback

目的：把一次运行结果转成业务人员能读懂的复盘，而不是只提供日志。

模板：

```markdown
# Business Playback: <run_id>

## Scenario
- scenario_id:
- run_id:
- run_time:
- environment:
- actor:

## Plain-Language Playback
1.
2.
3.

## Business Timeline
| Time | Role/System | Business Event | Object State | Evidence |
| --- | --- | --- | --- | --- |

## Agent Decisions
| Decision | Context Used | Why This Decision | Alternative Rejected | Evidence |
| --- | --- | --- | --- | --- |

## Human Handoffs
| Handoff | Reason | Payload | Accepted By | Evidence |
| --- | --- | --- | --- | --- |

## Final Business State
| Object | Expected | Actual | Match | Evidence |
| --- | --- | --- | --- | --- |

## Technical Evidence Index
| Evidence | Path | Result |
| --- | --- | --- |

## Deviations
| Deviation | Type | Severity | Owner | Next Action |
| --- | --- | --- | --- | --- |
```

通过门槛：

```text
不看源码、不看数据库的人，也能通过 playback 判断流程是否成立；
playback 中每个关键判断都能回链到 technical evidence；
业务 reviewer 可以在 playback 上签字、驳回或条件接受。
```

### 6.9 B6：Scorecard 与偏差归因

目的：把“不是我要的”变成可处理的分类。

详见第 9 章和第 10 章。

### 6.10 B7：修复循环或 release decision

根据 scorecard 和 deviation log，输出三种结论之一：

| 结论 | 条件 | 后续动作 |
| --- | --- | --- |
| `business_accepted` | 技术硬门槛全通过；业务分数达标；无一票否决 | 进入回归库和用户手册 |
| `conditionally_accepted` | 技术硬门槛全通过；业务核心目标达成；仅有低风险体验/文案/非阻断偏差 | 记录条件，进入受限发布或下一迭代修复 |
| `business_rejected` | 技术硬门槛失败，或业务核心目标失败，或存在一票否决 | 进入 business-loop-repair |

### 6.11 B8：回归库和用户手册准入

任何流程进入用户手册前必须满足：

```text
有 scenario card；
有至少一次通过的 evidence run；
有 business playback；
有 scorecard；
无阻断 deviation；
技术硬门槛全通过；
手册步骤能引用 evidence path、screenshot、trace 或 runId。
```

---

## 7. 业务验收优先，不等于技术验收降低

### 7.1 双门禁原则

```text
Gate A: Technical Hard Gate
  判断能不能被业务验收。

Gate B: Business Acceptance Gate
  判断能不能被业务使用。
```

通过关系：

| 技术硬门槛 | 业务验收 | 结论 |
| --- | --- | --- |
| 失败 | 通过 | 不成立；业务通过无效，不能发布 |
| 失败 | 失败 | 拒绝，先修技术 |
| 通过 | 失败 | 技术合格但业务不合格，修业务语义或体验 |
| 通过 | 通过 | 可进入 release decision |

### 7.2 技术 gate 的优先级

技术 gate 分三类：

| 类别 | 含义 | 失败后果 |
| --- | --- | --- |
| T0 Blocking Gate | 安全、数据、权限、状态、幂等、审计、核心 e2e | 直接阻断业务验收 |
| T1 Required Gate | 回归、性能、UI、兼容、可观测性 | 阻断 release，除非明确降级且不影响业务闭环 |
| T2 Advisory Gate | 非核心优化、开发者体验、重构质量 | 不阻断业务验收，但进入 backlog |

### 7.3 业务高分不能覆盖的技术失败

以下情况一票否决：

```text
缺少权限验证；
缺少审计；
缺少 trace；
缺少幂等或重放保护；
业务状态由多个 owner 直接写入；
工具成功被误当成业务成功；
绕过业务 API 或状态机直接写终态；
外部系统 side effect 没有安全 gate；
mock/sandbox 结果被标记为生产就绪；
异常、超时、失败没有可恢复路径；
用户手册写入未被证据证明的流程；
技术证据无法复现或缺少 run index。
```

---

## 8. Technical Hard Gate Matrix

这张矩阵是 BAF 的“技术地板”。它不因业务验收优先而降低。

```markdown
# Technical Hard Gate Matrix

| Gate ID | Gate | Required For | Evidence | Blocking | Notes |
| --- | --- | --- | --- | --- | --- |
| THG-01 | Build / typecheck / lint 基础通过 | 所有实现 | command output | yes | 无法构建不能验收 |
| THG-02 | Unit tests 覆盖核心规则 | 状态机、action、策略 | test report | yes | 规则不能只靠 E2E |
| THG-03 | Integration tests 覆盖 API/worker/external adapter | 多工具调用、异步流程 | test report + logs | yes | 必须覆盖跨边界行为 |
| THG-04 | E2E / scenario runner 可重复运行 | 业务闭环 | run artifact | yes | 没有 runner 不能声称闭环 |
| THG-05 | API contract / schema diff 可解释 | API/DTO | OpenAPI/schema diff | yes | 破坏性变更需批准 |
| THG-06 | DB migration / rollback / seed 验证 | 数据模型变化 | migration log + rollback note | yes | 数据不可逆风险阻断 |
| THG-07 | 权限与角色 scope 验证 | 业务动作 | security test + audit | yes | 未授权不能触发动作 |
| THG-08 | Audit 全链路记录 | 业务动作、异常、审批 | audit export | yes | 无审计不可验收 |
| THG-09 | Trace / correlation id 全链路贯通 | 多工具、多服务 | trace.json | yes | 无法复盘不可验收 |
| THG-10 | Idempotency / replay / duplicate event | 异步、回调、重试 | replay test | yes | 重放不能重复推进状态 |
| THG-11 | State owner / state transition guard | 业务对象状态变化 | DB assertions + code review | yes | 不允许多源写终态 |
| THG-12 | Failure / timeout / retry / dead-letter | 外部系统或异步动作 | failure matrix | yes | 失败必须可诊断 |
| THG-13 | Observability evidence index | 每次验收 run | evidence index | yes | 没 index 的证据无效 |
| THG-14 | UI smoke / accessibility / viewport baseline | 前端验收 | screenshots + test | required | 可按项目分级 |
| THG-15 | No raw external capability leakage | 外部系统集成 | code search + architecture review | yes | agent 不直接碰裸能力 |
| THG-16 | Secrets / credentials / environment guard | 集成/部署 | security scan/checklist | yes | 凭据泄漏阻断 |
| THG-17 | Performance / latency budget | 高吞吐或现场流程 | benchmark result | required when relevant | 超阈值需业务确认 |
| THG-18 | Documentation evidence mapping | 用户手册/交付文档 | doc evidence refs | yes for release | 未验证流程不能写入手册 |
```

### 8.1 技术门槛执行规则

```text
THG-01 到 THG-13 是默认 blocking；
THG-14 到 THG-18 根据项目性质可能升级为 blocking；
制造业、金融、医疗、合规或真实外部系统 side effect 场景中，THG-14 到 THG-18 应默认 blocking；
任何 blocking gate 失败，release_decision 只能是 rejected 或 technical_blocked。
```

### 8.2 技术证据包结构

```text
evidence/<task-id>/<scenario-id>/<run-id>/
  index.json
  summary.md
  commands.log
  test-results/
  api-responses/
  db-assertions.md
  worker-or-job-log.txt
  external-adapter-events.jsonl
  audit-export.json
  trace.json
  screenshots/
  failure-matrix.md
  security-check.md
  performance.md
  business-playback.md
  scorecard.md
  deviation-log.jsonl
```

### 8.3 Evidence index 最小字段

```json
{
  "task_id": "",
  "scenario_id": "",
  "run_id": "",
  "environment": "local|mock|staging|production-shadow",
  "generated_at": "",
  "commit_sha": "",
  "commands": [],
  "technical_gates": [],
  "business_gates": [],
  "trace_ids": [],
  "artifacts": [],
  "blocking_failures": [],
  "release_candidate": false
}
```

---

## 9. Business Acceptance Scorecard

### 9.1 评分维度

业务验收 scorecard 采用 100 分，但必须和技术硬门槛分离。

```markdown
# Business Acceptance Scorecard

| Dimension | Weight | Score | Evidence | Notes |
| --- | ---: | ---: | --- | --- |
| Business Outcome Closure | 25 | | | 业务目标是否达成，终态是否可被下游使用 |
| Process Fidelity | 15 | | | 顺序、角色、节奏是否符合真实流程 |
| Object State Correctness | 15 | | | 业务对象状态是否正确、唯一、一致 |
| Agent Decision Quality | 10 | | | 是否读取必要上下文，是否做出正确判断 |
| Exception And Risk Handling | 10 | | | 异常是否保守、可恢复、可交接 |
| Human Handoff Quality | 8 | | | 需要人时是否给出足够上下文和选项 |
| Business Evidence Quality | 7 | | | 业务 playback 是否清楚、证据是否可理解 |
| Technical Evidence Linkage | 5 | | | 业务结论是否能回链到技术证据 |
| User Experience Fit | 5 | | | 页面/输出/提示是否符合实际角色语言 |
| Total | 100 | | | |
```

### 9.2 通过标准

| 场景级别 | 分数要求 | 额外要求 |
| --- | ---: | --- |
| P0 主流程 | >= 90 | 无一票否决，无 blocking 技术失败 |
| P1 重要流程 | >= 85 | 无一票否决，无 blocking 技术失败 |
| P2 辅助流程 | >= 80 | 无 blocking 技术失败，可有低风险体验偏差 |
| Shadow / exploratory | 不设硬分 | 只能用于发现问题，不能作为 release 证据 |

### 9.3 业务一票否决项

```text
业务目标达错；
下游角色无法继续工作；
agent 在不该自动时自动执行；
agent 在必须停止时继续执行；
异常被吞掉或被标记为成功；
业务对象终态错误；
关键质量、安全、合规 gate 被绕过；
人工接管没有足够上下文；
业务 reviewer 无法根据 playback 判断发生了什么；
场景无法复跑。
```

### 9.4 技术一票否决项

详见第 7.3 节。技术一票否决项优先级高于业务分数。

---

## 10. Deviation Taxonomy

验收失败时，必须归因。否则团队会继续停留在“差一点”的主观层面。

```markdown
# Deviation Taxonomy

| Code | Category | Meaning | Typical Fix Owner |
| --- | --- | --- | --- |
| B0 | Business Intent Mismatch | agent 解决的不是业务真正要解决的问题 | PM / Business Owner |
| B1 | Process Fidelity Gap | 步骤顺序或角色分工不像真实业务 | PM / Domain Expert |
| B2 | Object State Gap | 业务对象状态错误或状态 owner 不清 | Domain Modeler / Backend |
| B3 | Agent Decision Gap | agent 没有读取必要上下文或判断错误 | Agent Designer / Backend |
| B4 | Human Handoff Gap | 该问人时没问，或问人信息不足 | PM / UX / Agent Designer |
| B5 | Exception Handling Gap | 异常、超时、失败处理不符合业务风险 | Backend / QA / Risk Critic |
| B6 | Evidence Gap | 业务或技术证据不足以验收 | Verifier / Evidence QA |
| B7 | Experience Fit Gap | 输出、页面、提示不符合现场语言 | UX / PM |
| T0 | Build/Test Failure | 构建、测试、类型、lint 失败 | Engineering |
| T1 | Contract/API Failure | API/schema/DTO/接口契约失败 | Engineering |
| T2 | Permission/Security Failure | 权限、scope、secret、安全失败 | Security / Backend |
| T3 | State/Idempotency Failure | 状态一致性、幂等、重放失败 | Backend / Architect |
| T4 | Observability Failure | trace/audit/log/evidence 缺失 | Platform / Engineering |
| T5 | Integration Failure | 外部系统、worker、adapter、callback 失败 | Integration / Backend |
```

Deviation 记录模板：

```json
{
  "deviation_id": "",
  "scenario_id": "",
  "run_id": "",
  "category": "B0|B1|...|T5",
  "severity": "critical|important|minor",
  "business_impact": "",
  "technical_impact": "",
  "evidence": [],
  "owner": "",
  "fix_strategy": "",
  "requires_new_scenario": true,
  "blocks_release": true
}
```

---

## 11. 制造业通用闭环模型

本方案偏制造业，但不绑定某个 FMS 项目。制造业 agent 的共性不是某个设备或协议，而是：

```text
物料、工单、工序、设备、人、质量、异常、追溯之间存在强状态约束；
现实世界有延迟、不确定、并发、质量风险和安全边界；
工具调用成功不等于生产业务成功。
```

### 11.1 制造业通用业务对象

| Object | Description | Typical States | Evidence |
| --- | --- | --- | --- |
| `CustomerOrder` | 客户订单或需求 | received, confirmed, changed, cancelled, fulfilled | order record, approval |
| `ProductionOrder` | 生产订单 | planned, released, in_progress, paused, completed, closed | ERP/MES record |
| `WorkOrder` | 作业/派工单 | pending, ready, assigned, running, reported, closed | dispatch log |
| `Operation` | 工序 | not_started, ready, running, completed, rejected, rework | route, report |
| `MaterialLot` | 物料批次 | available, reserved, issued, consumed, quarantined | lot trace |
| `WIPUnit` | 在制品单元 | created, queued, processing, inspected, held, completed | traveler, scan |
| `WorkCenter` | 工作中心 | available, busy, down, maintenance, blocked | capacity snapshot |
| `Equipment` | 设备 | ready, running, alarm, offline, maintenance | equipment event |
| `ToolingFixture` | 工装夹具 | available, assigned, worn, blocked, maintenance | tool life record |
| `QualityCheck` | 质检 | pending, passed, failed, waived, rework_required | inspection record |
| `ExceptionCase` | 异常 | open, triaged, assigned, recovering, resolved, closed | exception log |
| `TraceRecord` | 追溯记录 | collecting, complete, locked, exported | trace chain |
| `ShipmentUnit` | 交付单元 | packed, inspected, released, shipped | shipment record |

### 11.2 制造业通用业务线程

| Thread | Business Goal | Start | Accepted End | Key Risk |
| --- | --- | --- | --- | --- |
| `order-to-plan` | 把客户需求转成可执行生产计划 | order confirmed | plan released | 需求变更、产能不足 |
| `plan-to-dispatch` | 把计划拆成可执行工单 | plan released | work orders ready | 工艺/BOM/资源不匹配 |
| `material-to-line` | 确保物料可用并发到正确地点 | work order ready | material issued/reserved | 错料、缺料、批次不符 |
| `operation-to-report` | 工序执行并报工 | operation ready | operation reported | 设备异常、人员漏报、状态漂移 |
| `quality-to-release` | 质量判定并释放/返工/隔离 | inspection required | pass/rework/quarantine | 质量 gate 被绕过 |
| `exception-to-recovery` | 异常被发现、分派、恢复、关闭 | exception detected | recovery verified | 异常误关闭、重复发生 |
| `trace-to-audit` | 形成完整追溯链 | production started | trace exported/locked | 批次断链、证据不全 |
| `change-to-replan` | 需求/工艺/设备变化后重排 | change event | new feasible plan | 旧计划未冻结、下游不知情 |

### 11.3 制造业 action contract 的特殊要求

制造业 action contract 应默认增加以下字段：

```markdown
## Manufacturing Constraints
- material_identity_required:
- equipment_state_required:
- quality_gate_required:
- human_safety_relevant:
- traceability_required:
- irreversible_side_effect:
- downstream_station_impact:
- inventory_or_wip_locking:
- rework_or_scrap_policy:
```

### 11.4 制造业场景卡必须覆盖的异常

制造业验收不能只跑 happy path，至少应覆盖：

| Exception Type | Expected Behavior |
| --- | --- |
| 缺料 | 不继续推进工序，生成缺料待处理或补料动作 |
| 错料/批次不符 | fail closed，转人工确认或质量隔离 |
| 设备不可用 | 不派工或转资源重排 |
| 质量未检/不合格 | 不允许进入释放、入库或发运终态 |
| 工序顺序冲突 | 拒绝状态迁移，生成异常 |
| 重复扫描/重复回调 | 幂等消费，不重复报工或消耗物料 |
| 并发锁冲突 | 跳过、排队或重试，不破坏唯一占用 |
| 计划变更 | 冻结受影响对象，通知下游，重新确认 |
| 人工 override | 必须具备权限、原因、审批、审计、trace |
| 外部系统不可用 | 降级、排队、人工接管，不伪造成功 |

### 11.5 制造业闭环验收 Canvas

```markdown
# Manufacturing Closure Canvas

## Business Thread
- thread_id:
- business_goal:
- start_state:
- accepted_end_state:

## Manufacturing Objects
| Object | Identity | State | Owner | Evidence |
| --- | --- | --- | --- | --- |

## Physical / Operational Constraints
| Constraint | Required Observation | Freshness | Failure Behavior |
| --- | --- | --- | --- |

## Quality And Traceability
| Gate | Required Before | Evidence | Failure Behavior |
| --- | --- | --- | --- |

## Agent Decisions
| Decision | Context Required | Allowed Action | Forbidden Action | Human Gate |
| --- | --- | --- | --- | --- |

## Business Acceptance
| Acceptance Item | Reviewer | Evidence | Pass/Fail |
| --- | --- | --- | --- |

## Technical Hard Gates
| Gate | Evidence | Pass/Fail |
| --- | --- | --- |
```

---

## 12. `$atlas-workflow:team/SKILL.md` 增补草案

下面内容可增补到 `plugins/atlas-workflow/skills/team/SKILL.md`。这是概念级 patch，不要求一次性完整实现所有 helper script。

```markdown
## Business Acceptance First Protocol

Use this protocol when the task involves a business agent, business workflow, SOP, customer scenario, manufacturing workflow, approval process, operational process, or any agent that changes business state.

BAF changes the acceptance order:

1. Business contract readiness comes before implementation.
2. Technical verification remains a hard floor and cannot be weakened.
3. Final completion requires business playback and acceptance scorecard, not only tests.

### BAF Mode Classification

Before spawning subagents, classify whether the task needs BAF:

- `business-contract`: business sources must be converted into intent, thread map, object state model, action contracts, and scenario cards.
- `business-implementation`: implementation may start only after the required business contracts exist or are explicitly out of scope.
- `business-acceptance`: validate completed work against scenario cards, playback, scorecard, and technical hard gates.
- `business-loop-repair`: repair deviations until accepted, blocked, or explicitly deferred.
- `manufacturing-closure-review`: use when manufacturing objects, shopfloor operations, quality, WIP, equipment, material, traceability, or physical side effects are involved.

### Required Business Artifacts

For non-tiny business work, create or update:

- `workflow/artifacts/<task-id>/business/00-business-intent.md`
- `workflow/artifacts/<task-id>/business/01-source-coverage-ledger.md`
- `workflow/artifacts/<task-id>/business/02-business-thread-map.md`
- `workflow/artifacts/<task-id>/business/03-object-state-model.md`
- `workflow/artifacts/<task-id>/business/04-action-contracts/*.md`
- `workflow/artifacts/<task-id>/business/05-scenario-cards/*.md`
- `workflow/artifacts/<task-id>/business/06-evidence-manifest.md`
- `workflow/artifacts/<task-id>/business/07-technical-hard-gate-matrix.md`

Before final completion, also create or update:

- `workflow/artifacts/<task-id>/business/08-business-playbacks/<run-id>.md`
- `workflow/artifacts/<task-id>/business/09-scorecards/<run-id>.md`
- `workflow/artifacts/<task-id>/business/10-deviations/deviations.jsonl`
- `workflow/artifacts/<task-id>/business/11-regression-library.md`
- `workflow/artifacts/<task-id>/business/12-release-decision.md`

### Technical Gate Rule

Business acceptance cannot override failed technical hard gates. If a blocking technical gate fails, the release decision must be `technical_blocked` or `business_rejected`, even when the business playback appears acceptable.

Blocking gates include, at minimum:

- build/typecheck/lint when applicable;
- unit and integration tests for changed logic;
- scenario/e2e runner for claimed business closure;
- API/schema compatibility or explicit approved diff;
- DB migration, seed, and rollback evidence when data changes;
- permissions and role scope;
- audit;
- trace/correlation id;
- idempotency/replay protection;
- state owner and state transition guards;
- failure/timeout/retry/dead-letter behavior for async or external effects;
- evidence index for each acceptance run;
- no raw external capability leakage;
- no user manual step without evidence.

### BAF Staffing Additions

When BAF is active, `staffing.md` must include:

- `## Business Acceptance First Classification`
- `## Business Sources`
- `## Business Gates`
- `## Technical Hard Gates`
- `## Business Acceptance Evidence`

Use native subagents as needed:

- source-explorer
- domain-modeler
- process-critic
- action-contract-designer
- manufacturing-risk-critic
- technical-gatekeeper
- implementation-worker
- reviewer
- verifier
- evidence-qa
- business-playback-writer

The main Codex remains the only final integrator and release decision owner.
```

---

## 13. Helper script 设计

### 13.1 最小可行 helper scripts

不需要一次性写完整平台，先实现五个 helper 即可：

```text
codex-business-workspace
codex-business-contract-check
codex-business-scenario-check
codex-business-evidence-index
codex-business-release-decision
```

### 13.2 `codex-business-workspace`

作用：创建 BAF artifact 目录和模板。

命令示例：

```bash
codex-business-workspace <task-id> --domain manufacturing --mode business-contract
```

生成：

```text
workflow/artifacts/<task-id>/business/
  00-business-intent.md
  01-source-coverage-ledger.md
  02-business-thread-map.md
  03-object-state-model.md
  04-action-contracts/.gitkeep
  05-scenario-cards/.gitkeep
  06-evidence-manifest.md
  07-technical-hard-gate-matrix.md
```

### 13.3 `codex-business-contract-check`

作用：检查实现前业务合同是否足够。

检查项：

```text
business intent 是否有 acts_for_role、business_goal、accepted_end_state；
source coverage 是否列出来源和缺口；
thread map 是否至少有一个线程；
object state model 是否有状态 owner；
action contract 是否区分 technical_success 与 business_success；
高风险动作是否有 human gate；
技术硬门槛是否存在。
```

### 13.4 `codex-business-scenario-check`

作用：检查 scenario card 是否可执行。

检查项：

```text
是否有初始条件；
是否有 actor path；
是否有 agent decision expectations；
是否有 expected state changes；
是否有 business evidence 和 technical evidence；
是否有 pass/fail；
是否有 exception branches。
```

### 13.5 `codex-business-evidence-index`

作用：把一次运行的技术证据和业务证据汇总成 index。

命令示例：

```bash
codex-business-evidence-index \
  --task <task-id> \
  --scenario <scenario-id> \
  --run <run-id> \
  --evidence-dir evidence/<task-id>/<scenario-id>/<run-id>
```

### 13.6 `codex-business-release-decision`

作用：根据技术硬门槛、业务 scorecard 和 deviation log 给出 release decision。

伪逻辑：

```text
if any blocking_technical_gate_failed:
  release_decision = technical_blocked
elif any one_vote_veto:
  release_decision = business_rejected
elif score >= threshold and no critical deviation:
  release_decision = business_accepted
elif score >= threshold and only minor deviations:
  release_decision = conditionally_accepted
else:
  release_decision = business_rejected
```

---

## 14. Schema 草案

### 14.1 Business Intent JSON

```json
{
  "task_id": "",
  "agent_name": "",
  "acts_for_role": "",
  "business_goal": "",
  "start_trigger": "",
  "accepted_end_state": "",
  "downstream_consumer": "",
  "business_owner": "",
  "automatic_allowed": [],
  "confirmation_required": [],
  "approval_required": [],
  "forbidden_actions": [],
  "fail_closed_conditions": [],
  "evidence_required": [],
  "technical_success_floor": []
}
```

### 14.2 Business Thread JSON

```json
{
  "thread_id": "",
  "business_goal": "",
  "start_state": "",
  "accepted_end_state": "",
  "roles": [],
  "objects": [],
  "steps": [
    {
      "step_id": "",
      "role": "",
      "object": "",
      "current_state": "",
      "action": "",
      "expected_next_state": "",
      "human_decision": "",
      "evidence": []
    }
  ],
  "exceptions": []
}
```

### 14.3 Agent Action Contract JSON

```json
{
  "action_id": "",
  "business_purpose": "",
  "business_thread": "",
  "object": "",
  "state_transition": {
    "from": "",
    "to": ""
  },
  "allowed_trigger_sources": [],
  "allowed_roles": [],
  "required_context": [],
  "decision_rules": [],
  "allowed_capabilities": [],
  "forbidden_capabilities": [],
  "confirmation_required_when": [],
  "approval_required_when": [],
  "technical_success": [],
  "business_success": [],
  "failure_contract": [],
  "audit_required": true,
  "trace_id_required": true,
  "idempotency_required": true
}
```

### 14.4 Scenario Card JSON

```json
{
  "scenario_id": "",
  "title": "",
  "priority": "P0",
  "business_thread": "",
  "business_owner": "",
  "product_reviewer": "",
  "technical_reviewer": "",
  "business_goal": "",
  "accepted_end_state": "",
  "initial_conditions": [],
  "actor_path": [],
  "agent_decision_expectations": [],
  "expected_state_changes": [],
  "technical_evidence_required": [],
  "business_evidence_required": [],
  "exception_branches": [],
  "pass_condition": "",
  "fail_condition": "",
  "one_vote_veto": []
}
```

### 14.5 Scorecard JSON

```json
{
  "scenario_id": "",
  "run_id": "",
  "technical_hard_gates_passed": false,
  "blocking_technical_failures": [],
  "business_scores": {
    "business_outcome_closure": 0,
    "process_fidelity": 0,
    "object_state_correctness": 0,
    "agent_decision_quality": 0,
    "exception_and_risk_handling": 0,
    "human_handoff_quality": 0,
    "business_evidence_quality": 0,
    "technical_evidence_linkage": 0,
    "user_experience_fit": 0
  },
  "total_score": 0,
  "one_vote_veto": [],
  "deviations": [],
  "release_decision": "business_accepted|conditionally_accepted|business_rejected|technical_blocked"
}
```

---

## 15. Native subagent prompt 模板

### 15.1 Source Explorer

```text
You are the source-explorer for a Business Acceptance First team round.

Read only. Do not modify files.

Inputs:
- user request
- available SOP/PRD/flow/chat/case files
- existing workflow artifacts

Task:
- identify business sources;
- classify source type, owner, freshness, trust level;
- map sources to business questions;
- list gaps that block implementation or acceptance.

Return exactly these sections:
## Evidence
## Inference
## Unknown
## Recommendation
```

### 15.2 Domain Modeler

```text
You are the domain-modeler for a Business Acceptance First team round.

Read only unless the main Codex explicitly gives you a bounded artifact path.

Task:
- identify business objects;
- define state owners;
- define valid and forbidden state transitions;
- identify where tool success may be confused with business success;
- propose invariants and evidence requirements.

Return exactly:
## Evidence
## Inference
## Unknown
## Recommendation
```

### 15.3 Manufacturing Risk Critic

```text
You are the manufacturing-risk-critic.

Read only. Focus on general manufacturing constraints, not project-specific FMS details.

Check:
- material identity;
- WIP state;
- equipment readiness;
- quality gates;
- human safety;
- exception recovery;
- traceability;
- irreversible side effects;
- external system side effects;
- manual override and audit.

Return exactly:
## Evidence
## Inference
## Unknown
## Recommendation
```

### 15.4 Technical Gatekeeper

```text
You are the technical-gatekeeper.

Read only unless explicitly assigned.

Task:
- define blocking technical gates for the requested business workflow;
- make sure business acceptance cannot bypass technical failures;
- specify command evidence, artifact paths, trace/audit/idempotency requirements;
- identify any missing test, runner, schema, security, or observability evidence.

Return exactly:
## Evidence
## Inference
## Unknown
## Recommendation
```

### 15.5 Business Playback Writer

```text
You are the business-playback-writer.

You may write only the assigned playback artifact.

Inputs:
- scenario card
- evidence index
- technical logs and screenshots
- scorecard draft

Task:
- produce a plain-language business playback;
- map each key business event to evidence;
- state deviations without hiding technical failures;
- separate business conclusion from technical evidence.

Return exactly:
## Evidence
## Inference
## Unknown
## Recommendation
```

---

## 16. PM / 业务 / 技术三方验收方式

### 16.1 PM 的验收职责

PM 不应只面对“系统已经做完，请验收”。PM 应按 scenario card 逐条执行：

```text
1. 选择一个 scenario card。
2. 确认初始条件和 seed。
3. 使用指定角色和入口触发流程。
4. 观察业务对象状态和页面/输出。
5. 阅读 business playback。
6. 检查 scorecard。
7. 确认 technical hard gates 是否全通过。
8. 将偏差归类到 deviation taxonomy。
9. 给出 accepted / conditionally accepted / rejected。
```

### 16.2 业务 reviewer 的验收职责

业务 reviewer 不需要读接口日志。业务 reviewer 主要回答：

```text
这个流程像不像真实业务？
这个角色在这个状态下是否应该这样操作？
agent 什么时候自动、什么时候问人，是否合理？
异常处理是否保守？
下游是否能接着做？
playback 是否能解释发生了什么？
```

### 16.3 技术 reviewer 的验收职责

技术 reviewer 负责确认：

```text
状态 owner 是否正确；
权限是否正确；
审计是否完整；
trace 是否贯通；
幂等和重放是否正确；
失败和超时是否可恢复；
外部系统能力是否被封装；
技术证据是否可复现；
手册引用的证据是否真实存在。
```

### 16.4 三方签字模型

| Role | Can Approve | Cannot Override |
| --- | --- | --- |
| PM | 业务场景是否达标、体验是否可接受 | 技术 blocking gate |
| Business Reviewer | 流程是否符合真实业务 | 技术安全/权限/审计失败 |
| Technical Reviewer | 技术门槛是否通过 | 业务目标不成立 |

最终 release decision 必须三方信息齐全，但不要求三方都看同一类材料。

---

## 17. 实施路线

### 17.1 MVP：三天内可落地

目标：先不写复杂 validator，先让 native team 输出业务验收 artifacts。

#### Day 1：模板与 SKILL 增补

改动：

```text
workflow/templates/business-acceptance-first/*.md
plugins/atlas-workflow/skills/team/SKILL.md
```

完成标准：

```text
team skill 能识别 BAF 模式；
staffing.md 有 Business Acceptance First Classification；
能生成 business-intent、thread-map、scenario-card、technical-hard-gate-matrix 模板。
```

#### Day 2：证据与评分

改动：

```text
business-playback.md
acceptance-scorecard.md
deviation-log.md
technical-hard-gate-matrix.md
```

完成标准：

```text
一次业务验收 run 能产出 playback、scorecard、deviation；
scorecard 能明确 technical_blocked 与 business_rejected。
```

#### Day 3：制造业 canvas 与回归库

改动：

```text
manufacturing-closure-canvas.md
manufacturing-risk-matrix.md
regression-scenario.md
```

完成标准：

```text
制造业业务 agent 可用 canvas 建模订单、工单、物料、工序、质量、异常、追溯；
通过/失败场景可沉淀到 regression-library。
```

### 17.2 两周增强版

| 时间 | 目标 | 交付 |
| --- | --- | --- |
| Week 1 Day 1-2 | 模板和 SKILL 改造 | BAF mode、artifact contract |
| Week 1 Day 3-4 | helper scripts MVP | workspace、contract-check、scenario-check |
| Week 1 Day 5 | evidence index | evidence-index、release-decision |
| Week 2 Day 1-2 | JSON schema + validators | schemas、validator scripts |
| Week 2 Day 3 | native subagent prompt pack | source/domain/risk/gate/playback roles |
| Week 2 Day 4 | sample manufacturing scenarios | 通用制造业示例，不绑定 FMS |
| Week 2 Day 5 | dogfood 与回归 | 用一个真实业务 agent 任务跑完整 BAF |

### 17.3 不建议一开始做的事情

```text
不要一开始做复杂 UI；
不要一开始接入所有制造业系统；
不要把 BAF 做成外部平台；
不要先写 validator 再定义业务材料；
不要用大而全行业 ontology 替代项目级业务合同；
不要把 business scorecard 当成主观满意度问卷。
```

---

## 18. Definition of Done

### 18.1 BAF 框架本身的 DoD

```text
[ ] `team/SKILL.md` 能识别 BAF 任务并要求业务 artifact。
[ ] 模板目录完整。
[ ] staffing.md 增加 BAF classification、business gates、technical hard gates。
[ ] 至少一个通用业务任务能生成 intent、thread map、state model、action contract、scenario card。
[ ] 至少一个制造业偏向任务能生成 manufacturing closure canvas。
[ ] 技术 hard gate matrix 能阻断业务 release。
[ ] playback + scorecard + deviation 能支持 accepted/rejected 判断。
[ ] regression-library 能沉淀通过和失败场景。
```

### 18.2 业务 agent 交付的 DoD

```text
[ ] 有 Business Intent Contract。
[ ] 有 Source Coverage Ledger。
[ ] 有 Business Thread Map。
[ ] 有 Object State Model。
[ ] 所有自动/半自动动作都有 Agent Action Contract。
[ ] 所有 P0/P1 场景都有 Scenario Acceptance Card。
[ ] 每个场景有 Technical Hard Gate Matrix。
[ ] 每个验收 run 有 evidence index。
[ ] Blocking technical gates 全通过。
[ ] 有 Business Playback。
[ ] 有 Acceptance Scorecard。
[ ] 无业务或技术一票否决项。
[ ] 所有偏差已归因。
[ ] 已通过场景进入 Regression Scenario Library。
[ ] 用户手册只引用已验证 evidence run。
```

---

## 19. Release Decision 模板

```markdown
# Release Decision

## Summary
- task_id:
- release_decision: business_accepted | conditionally_accepted | business_rejected | technical_blocked
- decided_at:
- decided_by:

## Business Acceptance
| Scenario | Priority | Score | Result | Playback | Scorecard |
| --- | --- | ---: | --- | --- | --- |

## Technical Hard Gates
| Gate | Result | Evidence | Blocking |
| --- | --- | --- | --- |

## Deviations
| ID | Category | Severity | Blocks Release | Owner | Fix Plan |
| --- | --- | --- | --- | --- | --- |

## Conditions For Conditional Acceptance
| Condition | Owner | Due | Evidence Required |
| --- | --- | --- | --- |

## Regression Library Updates
| Scenario | Added/Updated | Reason |
| --- | --- | --- |

## User Manual Eligibility
| Flow | Eligible | Evidence Run | Notes |
| --- | --- | --- | --- |

## Final Decision Rationale

```

---

## 20. 示例：通用制造业主流程场景卡

以下示例不绑定任何具体 FMS 项目，只用于说明 BAF 结构。

```markdown
# Scenario Acceptance Card: MFG-P0-OPERATION-REPORT

## Scenario Metadata
- scenario_id: MFG-P0-OPERATION-REPORT
- title: 工序执行完成后形成可追溯报工
- priority: P0
- business_thread: operation-to-report
- business_owner: production operations owner
- product_reviewer: PM
- technical_reviewer: engineering verifier
- manufacturing_bias: yes

## Business Goal
- goal: 在工序具备执行条件后，agent 协助完成工序执行状态确认、报工候选生成、人工/系统确认和追溯记录。
- accepted_end_state: Operation reported, WIP state advanced, trace record complete, downstream operation can start.
- downstream_user: next operation owner / production supervisor / quality reviewer

## Initial Conditions
| Item | Required State | Seed / Setup | Evidence |
| --- | --- | --- | --- |
| ProductionOrder | released | seed or fixture | DB/API |
| Operation | ready | seed or fixture | DB/API |
| MaterialLot | issued/reserved | seed or fixture | inventory evidence |
| Equipment | ready or not required | simulated or real status | equipment snapshot |
| QualityGate | not blocking | quality config | quality evidence |

## Actor Path
| Step | Actor | Entry Point | User/System Action | Expected Business Observation |
| --- | --- | --- | --- | --- |
| 1 | operator/system | work queue | select ready operation | operation context visible |
| 2 | agent | action contract | read context and validate gates | missing gates trigger handoff |
| 3 | agent/system | report action | create report candidate or execute allowed action | operation moves toward reported state |
| 4 | operator/quality if needed | confirmation | confirm or reject | trace and audit update |
| 5 | downstream user | next queue | sees next operation ready | downstream can continue |

## Agent Decision Expectations
| Step | Required Context | Expected Decision | Forbidden Decision | Human Gate |
| --- | --- | --- | --- | --- |
| gate check | material, equipment, operation, quality | proceed only if all required gates valid | report completion with missing material or quality block | required on missing/conflict |
| report | operation status, WIP identity | create report with trace | duplicate report on replay | required on discrepancy |

## Expected State Changes
| Object | Before | After | Owner | Evidence |
| --- | --- | --- | --- | --- |
| Operation | ready/running | reported/completed | domain service | DB/API/trace |
| WIPUnit | processing | completed or next_ready | domain service | DB/API/trace |
| TraceRecord | collecting | complete/updated | trace service | trace export |

## Technical Evidence Required
| Evidence | Path / Command | Required | Blocks Acceptance |
| --- | --- | --- | --- |
| unit tests | test command | yes | yes |
| integration/e2e | scenario runner | yes | yes |
| audit | audit export | yes | yes |
| trace | trace.json | yes | yes |
| idempotency replay | replay test | yes | yes |

## Business Evidence Required
| Evidence | Reviewer | Required | Blocks Acceptance |
| --- | --- | --- | --- |
| business playback | PM/business reviewer | yes | yes |
| downstream visibility | business reviewer | yes | yes |
| exception handling branch | PM/QA | yes | yes for P0 |

## Exception Branches
| Exception | Expected Behavior | Human Handoff | Evidence |
| --- | --- | --- | --- |
| material mismatch | reject report and create exception | yes | exception + audit |
| quality gate missing | block release/report | yes | quality evidence |
| duplicate callback/retry | idempotent no duplicate report | no unless conflict | replay evidence |
| equipment status unknown | fail closed or ask human | yes | status snapshot |

## Pass / Fail
- pass_condition: business end state reached, downstream can continue, technical gates pass, score >= 90.
- fail_condition: missing trace/audit, duplicate report, missing quality gate, downstream blocked, score < 90.
- one_vote_veto: report with missing material, quality gate bypass, no audit, no trace, non-idempotent duplicate report.
```

---

## 21. 将现有技术验收框架迁移到业务验收优先的方式

### 21.1 不应该做的迁移

```text
不要删除技术 verifier；
不要减少测试；
不要把 scorecard 替代 test；
不要把业务 reviewer 的主观判断替代技术证据；
不要让 PM 只看最终 demo；
不要在实现后再补业务合同。
```

### 21.2 正确迁移方式

```text
技术验收保留为 hard gate；
业务验收成为 release gate；
业务 artifact 成为 implementation input；
技术 evidence 成为 business playback 的支撑；
scorecard 成为 release decision 的业务依据；
deviation log 成为修复循环入口；
regression library 成为后续持续验收资产。
```

### 21.3 迁移前后对照

| 维度 | 原技术验收导向 | BAF 业务验收优先 |
| --- | --- | --- |
| 起点 | spec / task / implementation plan | business intent / source coverage |
| 任务拆解 | module / file / API / test | business thread / object state / action contract |
| 实现依据 | 技术需求 | 业务合同 + 技术需求 |
| 验收入口 | 运行测试、看 demo | scenario card |
| 证据 | test/log/API/DB | business playback + technical evidence |
| 完成判定 | verifier 通过 | technical gates 通过 + business score 达标 |
| 失败描述 | bug / test fail | deviation taxonomy |
| 沉淀资产 | tests / docs | tests + business regression scenarios + manual evidence |

---

## 22. 最小 PR 切片建议

### PR 1：BAF 文档和模板

改动：

```text
workflow/templates/business-acceptance-first/*.md
plugins/atlas-workflow/skills/team/SKILL.md
```

验收：

```text
模板存在；
SKILL 中说明 BAF 触发条件、业务 artifacts、技术 hard gates；
不影响现有 native team 普通执行。
```

### PR 2：Business workspace helper

改动：

```text
plugins/atlas-workflow/scripts/codex-business-workspace
plugins/atlas-workflow/scripts/codex-business-contract-check
```

验收：

```text
能创建 business artifact 目录；
能检查关键字段缺失；
输出 machine-readable result。
```

### PR 3：Scenario / Evidence / Release helper

改动：

```text
codex-business-scenario-check
codex-business-evidence-index
codex-business-release-decision
```

验收：

```text
缺少技术 blocking gate 时 release_decision = technical_blocked；
业务分数不足时 release_decision = business_rejected；
通过时写入 regression-library。
```

### PR 4：制造业 canvas 和样例

改动：

```text
manufacturing-closure-canvas.md
manufacturing-risk-matrix.md
sample-mfg-scenario-cards/*.md
```

验收：

```text
覆盖 order-to-plan、plan-to-dispatch、material-to-line、operation-to-report、quality-to-release、exception-to-recovery、trace-to-audit；
不出现具体 FMS 项目细节。
```

---

## 23. 最终建议

Atlas Forge native team 的优势是已经有明确的 orchestrator、subagent、evidence、review、verification、bounded loop 和 SDD 纪律。不要推翻这套技术基础。

真正要改的是默认交付心智：

```text
不是“技术做完后找业务验收”，
而是“业务闭环合同先定义，技术实现只是在合同约束下完成状态迁移”。
```

最终框架应坚持：

```text
业务验收优先，技术门槛不降；
业务合同前置，技术证据硬门槛；
业务 playback 给人看，技术 evidence 给系统和审计看；
scorecard 判断是否可用，technical hard gates 判断是否有资格可用；
deviation log 负责修复归因，regression library 负责长期稳定。
```

这样 native team 的能力会从“会组织 agent 做技术任务”升级为：

```text
会组织 agent 把真实业务流程变成可执行、可验证、可追溯、可回归的业务闭环。
```


---

## 附录 A：设计依据与抽象原则

本方案基于以下事实和原则进行抽象，不引入具体项目业务细节。

### A.1 Atlas Forge / Native Team 事实依据

- `atlas-forge` 当前是 Git-backed Codex plugin marketplace，包含 `atlas-workflow`、`mempalace`、`multica-sdlc`，其中本方案只增强 `atlas-workflow`。
- `atlas-workflow` 的用途包括 task routing、planning、workflow gates、design review、team handoff 和 bounded local work。
- `$atlas-workflow:team` 当前是 native-only contract：native subagent 工具不可用时应停止，而不是替换为非 native 编排。
- 主 Codex 是 orchestrator，subagents 只提供 lane work、review、verification，最终 synthesis、file integration 和 user reporting 由主 Codex 负责。
- 当前 team flow 已经要求 `staffing.md`、`decision.md`、`round-*.md`、phase gates、write boundaries、verification evidence、reviewer/verifier 和 SDD slice discipline。

### A.2 从既有实施合同抽象出的原则

用户提供的既有实施合同虽然是具体项目文档，但其中有几条原则应抽象进通用 BAF：

1. **运行态证据是退出门禁**：缺少证据不一定阻塞初始 readiness，但会阻塞切片关闭和最终完成判定。
2. **没有证据包不能标记完成**：任一流程缺少证据包，不能写入最终用户手册。
3. **业务状态 owner 必须清晰**：外部执行状态或工具状态不能直接改业务终态；只能作为业务状态机判断输入。
4. **mock 只能模拟外部 I/O**：mock 不能绕过 API、状态机、outbox、worker、审计、realtime 或真实证据链。
5. **真实外部 side effect 必须有安全 gate**：未确认地址、权限、幂等、审计、trace、失败路径前，不能进入真实生产写入。
6. **工具成功不等于业务成功**：技术调用成功只是证据的一部分，业务完成必须由业务状态机、业务规则和验收证据共同证明。

这些原则被本方案抽象为：`Technical Hard Gate Matrix`、`Evidence Index`、`Business Playback`、`Scorecard`、`Deviation Taxonomy` 和 `User Manual Eligibility`。
