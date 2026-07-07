# Atlas Forge Native Team：业务验收优先框架方案（评审修订版）

> 版本：2026-07-07 Review Revision
> 适用范围：`atlas-forge` / `plugins/atlas-workflow` / `$atlas-workflow:team` / Codex native team
> 不适用范围：不优化、不迁移、不增强 Multica SDLC
> 框架定位：通用业务 agent 交付框架，可偏向制造业；不绑定任何具体 FMS、PLC、CNC、仓储、调度或客户项目细节
> 修订目标：吸收对抗式评审意见，把上一版“平行 BAF 子系统”调整为“native team 既有框架上的业务验收层”；业务验收优先，但技术门槛不降。

---

## 0. 本轮修订结论

对评审意见的总体裁决：**接受全部 21 个 finding 的行动价值**。

其中：

- F1、F2、F3、F6、F7、F8、F9、F10、F11、F13、F14、F15、F16、F17-F20、F21：完全接受，并在本版直接改结构、命名、流程和落地计划。
- F4：接受。`contract` 一词在现有仓库中已承担多种语义，本版减少新增 `contract` 命名，改用 `brief`、`model`、`rulebook`、`card`、`map`、`report`、`verdict`。
- F5：部分语义上它不是直接同名冲突，但接受其风险判断。本版明确业务验收结论不替代现有 ledger 的 `run_complete` / `run_failed`，而是作为 main Codex 最终 decision 的业务层 verdict。
- F12：嵌套模板目录没有硬冲突，但接受“贴合现有约定优先”。本版改用 `workflow/templates/` 顶层扁平模板。

上一版最大问题不是业务验收理念错误，而是工程形态错误：

```text
上一版：
  在现有 team-sdd / codex-team-* 旁边新增 contracts/business-acceptance-first、codex-business-*、business templates。

本版：
  不新增平行业务子系统。
  业务验收能力作为 atlas-workflow native team 的一组模式、模板、schema 类型、artifact 规则和 hard gate 扩展。
```

本版保留以下原则：

```text
业务验收优先：交付完成由业务闭环是否被证明决定。
技术门槛不降：技术 gate 是业务验收的硬前置，任何 blocking 技术失败都不能被业务评分覆盖。
```

---

## 1. 第一性原理：为什么要从技术验收转到业务验收

### 1.1 Agent 的交付对象不是工具调用，而是业务状态改变

多工具调用 agent 的能力不应被定义为：

```text
能调用工具、接口、页面、数据库并得到返回。
```

它应被定义为：

```text
在给定业务角色、业务对象、业务状态、权限、风险边界和证据要求下，
选择被允许的业务动作，
通过受控技术链路改变业务状态，
并留下足够证据让人类能验收、追溯、复盘和纠偏。
```

因此，技术验收回答的是：

```text
系统有没有按工程要求运行？
```

业务验收回答的是：

```text
agent 是否真的完成了业务闭环？
```

### 1.2 技术验收是资格，不是最终完成

技术验收不能降低，也不能被业务验收替代。它在本方案中的位置是：

```text
技术 gate 通过：说明该交付有资格进入业务验收。
业务验收通过：说明该交付形成可接受的业务闭环。
```

如果出现以下情况，无论业务人员主观上是否觉得流程顺，都不能标记为业务可用：

- build、typecheck、unit、integration、e2e 失败；
- 权限、审计、trace、幂等、状态一致性缺失；
- agent 绕过业务 API 或状态 owner 直接推进状态；
- mock/sandbox 成功被误当成生产就绪；
- 证据包缺失或无法复现；
- 用户手册写入未被测试证据证明的流程。

### 1.3 业务验收优先不是多写文档，而是重定义 done

本方案把 done 改成三层成立：

```text
1. 技术硬门槛成立：系统可以安全、可追踪、可回归地运行。
2. 业务闭环成立：从真实业务起点到终点的对象状态迁移被证明。
3. 验收证据成立：PM、业务、技术可以基于同一证据包得出一致结论。
```

没有业务闭环，功能完成只是局部正确。没有技术硬门槛，业务闭环只是不可上线的演示。

---

## 2. 对抗式评审意见裁决表

| Finding | 是否接受 | 本版处理 |
| --- | --- | --- |
| F1 `scorecard` 同名异构 | 接受 | 不再创建 `scorecard.schema.json`、`acceptance-scorecard.md` 或业务 scorecard CLI；业务评分改名为 `business-acceptance-report`，其中包含 `rating` 字段。现有 `scorecard` 保持 SDD telemetry 语义。 |
| F2 `evidence-manifest` 同名冲突 | 接受 | 不再创建业务 `evidence-manifest.*`；业务证据索引改名为 `business-evidence-map.json/md`。现有 SDD `evidence-manifest.json` 保持不变。 |
| F3 `workspace` 高度重叠 | 接受 | 不新增 `codex-business-workspace`；使用现有 `codex-team-workspace`，业务 artifacts 放在 `workflow/artifacts/<task-id>/team/acceptance/`。 |
| F4 `contract` 语义稀释 | 接受 | 新增 artifact 避免使用 `contract` 命名，改用 `brief`、`model`、`rulebook`、`card`、`map`、`report`、`verdict`。 |
| F5 `release decision` 概念重叠 | 接受处理 | 不新增 `codex-business-release-decision`；业务结论改为 `business-verdict.md/json`。它不替代 ledger 的 `run_complete/run_failed`，只作为最终 decision 的业务层输入。 |
| F6 MVP helpers 重复 | 接受 | 删除全部 `codex-business-*` helper 设想；只扩展现有 `codex-team-*` 或先用模板 + `codex-team-validate-json`。 |
| F7 schema/validator 复制体系 | 接受 | 不新增 `contracts/business-acceptance-first/`；在 `contracts/team-sdd/` 下按现有扁平约定新增 business 类型 schema 与 validators。 |
| F8 模板生成模式重复 | 接受 | 不另建业务模板编译器；先用扁平模板，后续如需生成，扩展 `codex-team-brief` 或 `codex-team-artifact-lint`。 |
| F9 schema 目录层级不一致 | 接受 | schema 文件与 `validators/` 同级，沿用 `contracts/team-sdd/*.schema.json`。 |
| F10 validator 命名前缀不一致 | 接受 | validator 文件按类型命名，如 `business-intent.js`，不使用 `validate-` 前缀。 |
| F11 schema 缺少 `schema_version` / `task_id` | 接受 | 所有新增 JSON schema 必须 required `schema_version` 和 `task_id`。需要关联 slice 的再 required `slice_id`。 |
| F12 模板嵌套无先例 | 接受处理 | 所有新增模板放在 `workflow/templates/` 顶层，使用清晰前缀避免混淆。 |
| F13 MVP helper 数量不一致 | 接受 | 本版只保留一个权威 PR 切片计划，并明确 MVP 边界。 |
| F14 实施路线与 PR 边界不一致 | 接受 | 删除双路线，改为单一 PR sequence，所有 MVP 与增强项只通过 PR 切片表达。 |
| F15 T1 与 SDD 双重治理 | 接受 | 明确仲裁规则：技术 hard gate 一票否决；业务 artifact 不改变 SDD ledger 语义；业务 accepted 需在 SDD clean 后才可成立。 |
| F16 staffing 新章节重叠 | 接受 | 不新增 `Business Gates` / `Business Acceptance Evidence` 章节；业务 gate 写入现有 `## Phase Gates`，业务证据写入现有 `## Verification Evidence`。 |
| F17-F20 角色撞名 | 接受 | 不重定义 `reviewer`、`verifier`、`evidence-qa`；它们保持现有语义。业务新增角色使用不冲突名称，如 `domain-analyst`、`process-modeler`、`scenario-curator`、`acceptance-evaluator`。 |
| F21 测试覆盖断层 | 接受 | 每个新增 schema、validator、artifact lint 规则必须有 success + failure fixture；新增或扩展 `workflow/tests/contract_team_native.sh` / `contract_team_business_acceptance.sh` 并由 `contract.sh` 调用。 |

---

## 3. 新版核心设计：BAF 不是子系统，而是 native team 的业务验收模式

本版仍保留 `BAF = Business Acceptance First` 这个方法名，但它不再代表独立目录、独立脚本族或独立验证框架。

新的定义：

```text
BAF 是 $atlas-workflow:team 的一种交付模式。
它让 native team 在实现前先形成业务闭环模型，
在实现后用业务证据证明闭环成立，
同时继续遵守原有 SDD、review、verifier、ledger、commit、artifact 纪律。
```

### 3.1 设计边界

| 项 | 决策 |
| --- | --- |
| 是否新建插件 | 否 |
| 是否优化 Multica SDLC | 否 |
| 是否新增 `codex-business-*` | 否 |
| 是否新增平行 `contracts/business-acceptance-first/` | 否 |
| 是否新增平行 `workflow/templates/business-acceptance-first/` | 否 |
| 是否复用 native team orchestrator | 是 |
| 是否复用 SDD slice protocol | 是 |
| 是否提高业务验收权重 | 是 |
| 是否降低技术门槛 | 否 |

### 3.2 与现有 native team 的关系

本方案保持以下既有原则：

- main Codex 是唯一最终整合者；
- subagents 只提供 lane work、review、verification、investigation；
- `workflow/artifacts/<task-id>/team/` 是 native team artifacts 主位置；
- `staffing.md`、`decision.md`、`round-*.md` 仍是团队工作记录；
- SDD slice 继续使用 `codex-team-workspace`、`codex-team-brief`、`codex-team-validate-json`、`codex-team-ledger` 等既有工具；
- subagents 不直接写 workflow artifacts；main Codex 负责写入、整合和最终报告。

BAF 增加的是：

```text
业务闭环 modeling artifacts
业务场景验收 artifacts
业务证据映射 artifacts
业务接受/拒绝 verdict
制造业通用闭环 canvas
技术 hard gate 与业务 verdict 的仲裁规则
```

---

## 4. 新命名规范

### 4.1 禁用或保留给现有语义的名称

| 名称 | 本版规则 | 原因 |
| --- | --- | --- |
| `scorecard` | 不用于业务验收文件、schema、CLI | 已是 SDD telemetry 语义 |
| `evidence-manifest` | 不用于业务证据索引 | 已由 `codex-team-brief` 生成 SDD evidence manifest |
| `codex-business-*` | 不新增 | 与 `codex-team-*` helper 重叠 |
| `workspace` | 不新增业务 workspace CLI | 复用 `codex-team-workspace` |
| `release-decision` | 不作为业务 artifact 名 | 避免和 ledger run end state 概念混淆 |
| `contract` | 尽量不用于新增业务 artifact 名 | 现有语义已多，避免稀释 |

### 4.2 新增业务 artifact 命名

| 业务概念 | 文件名 | JSON type |
| --- | --- | --- |
| 业务意图 | `business-intent.md/json` | `business-intent` |
| 来源覆盖 | `business-source-coverage.md/json` | `business-source-coverage` |
| 业务线程 | `business-thread-map.md/json` | `business-thread-map` |
| 对象状态模型 | `business-object-state-model.md/json` | `business-object-state-model` |
| agent 动作规则 | `business-action-rulebook.md/json` | `business-action-rulebook` |
| 场景验收卡 | `business-scenario-card.<scenario-id>.md/json` | `business-scenario-card` |
| 业务证据映射 | `business-evidence-map.md/json` | `business-evidence-map` |
| 业务回放 | `business-playback.<scenario-id>.md` | markdown only 或 `business-playback` |
| 业务验收报告 | `business-acceptance-report.md/json` | `business-acceptance-report` |
| 偏差日志 | `business-deviation-log.md/jsonl` | `business-deviation-log` |
| 回归场景 | `business-regression-scenario.<scenario-id>.md/json` | `business-regression-scenario` |
| 业务结论 | `business-verdict.md/json` | `business-verdict` |

### 4.3 业务评分术语

可以在中文说明中说“业务评分”，但代码和文件不使用 `scorecard`。统一使用：

```text
business_acceptance_report.rating
```

示例：

```json
{
  "schema_version": 1,
  "task_id": "20260707-native-business-acceptance",
  "rating": {
    "total": 88,
    "level": "conditionally_accepted",
    "blocking_technical_gate_failed": false
  }
}
```

---

## 5. Artifact 路径设计

### 5.1 总原则

所有业务验收 artifacts 都归入现有 native team artifact 树，不另建根级业务目录。

```text
workflow/artifacts/<task-id>/team/
  decision.md
  staffing.md
  round-<n>.md
  acceptance/
    business-intent.md
    business-intent.json
    business-source-coverage.md
    business-source-coverage.json
    business-thread-map.md
    business-thread-map.json
    business-object-state-model.md
    business-object-state-model.json
    business-action-rulebook.md
    business-action-rulebook.json
    scenarios/
      business-scenario-card.<scenario-id>.md
      business-scenario-card.<scenario-id>.json
      business-playback.<scenario-id>.md
    business-evidence-map.md
    business-evidence-map.json
    business-acceptance-report.md
    business-acceptance-report.json
    business-deviation-log.md
    business-deviation-log.jsonl
    regression/
      business-regression-scenario.<scenario-id>.md
      business-regression-scenario.<scenario-id>.json
    business-verdict.md
    business-verdict.json
  sdd/
    slices/
      <slice-id>/
        brief.md
        brief.json
        evidence-manifest.json
        review-package.diff
        review-verdict.json
        answers.jsonl
```

### 5.2 路径含义

| 路径 | 作用 |
| --- | --- |
| `team/acceptance/` | 业务验收层；由 main Codex 写入；subagents 只返回材料 |
| `team/sdd/` | 技术实现与 SDD slice 生命周期；保持现有语义 |
| `team/sdd/slices/*/evidence-manifest.json` | 技术证据清单；不改名、不复用为业务证据 |
| `team/acceptance/business-evidence-map.json` | 业务证据映射；引用技术 evidence manifest、命令输出、截图、业务回放 |

### 5.3 为什么不用 `workflow/artifacts/<task-id>/business/`

不用根级 `business/` 的原因：

- native team 已经把团队 artifacts 放在 `team/` 下；
- BAF 是 native team 的模式，不是独立工作流；
- business artifacts 需要和 `staffing.md`、`decision.md`、`round-*.md`、SDD slices 在同一 task 下互相引用；
- 避免和未来其他 workflow artifact 根目录产生新命名层级。

---

## 6. Schema 与 validator 约定

### 6.1 放置位置

不新增 `contracts/business-acceptance-first/`。

使用现有约定：

```text
plugins/atlas-workflow/contracts/team-sdd/
  business-intent.schema.json
  business-source-coverage.schema.json
  business-thread-map.schema.json
  business-object-state-model.schema.json
  business-action-rulebook.schema.json
  business-scenario-card.schema.json
  business-evidence-map.schema.json
  business-acceptance-report.schema.json
  business-deviation-log.schema.json
  business-regression-scenario.schema.json
  business-verdict.schema.json
  validators/
    business-intent.js
    business-source-coverage.js
    business-thread-map.js
    business-object-state-model.js
    business-action-rulebook.js
    business-scenario-card.js
    business-evidence-map.js
    business-acceptance-report.js
    business-deviation-log.js
    business-regression-scenario.js
    business-verdict.js
```

### 6.2 必须遵守的 schema 约定

所有新增 JSON schema 必须包含：

```json
{
  "schema_version": 1,
  "task_id": "safe-task-id"
}
```

如果 artifact 属于某个 implementation slice，必须增加：

```json
{
  "slice_id": "safe-slice-id"
}
```

如果 artifact 属于某个业务场景，必须增加：

```json
{
  "scenario_id": "safe-scenario-id"
}
```

ID pattern 建议与既有 safe id 约定一致：

```text
^[A-Za-z0-9][A-Za-z0-9._-]*$
```

### 6.3 `codex-team-validate-json` 扩展方式

不新增 `codex-business-contract-check` 或 `codex-business-scenario-check`。

在现有 validator registry 中追加类型：

```text
business-intent
business-source-coverage
business-thread-map
business-object-state-model
business-action-rulebook
business-scenario-card
business-evidence-map
business-acceptance-report
business-deviation-log
business-regression-scenario
business-verdict
```

调用形态保持：

```bash
codex-team-validate-json --type business-intent --file workflow/artifacts/<task-id>/team/acceptance/business-intent.json
codex-team-validate-json --type business-scenario-card --file workflow/artifacts/<task-id>/team/acceptance/scenarios/business-scenario-card.order-to-plan.json
codex-team-validate-json --type business-verdict --file workflow/artifacts/<task-id>/team/acceptance/business-verdict.json
```

### 6.4 schema 最小样例

#### 6.4.1 `business-intent.schema.json`

```json
{
  "type": "object",
  "required": [
    "schema_version",
    "task_id",
    "business_goal",
    "agent_responsibility",
    "excluded_scope",
    "stakeholders",
    "success_definition",
    "risk_boundaries"
  ],
  "properties": {
    "schema_version": { "type": "integer", "enum": [1] },
    "task_id": { "type": "string", "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]*$" },
    "business_goal": { "type": "string", "minLength": 1 },
    "agent_responsibility": { "type": "string", "minLength": 1 },
    "excluded_scope": { "type": "array", "items": { "type": "string" } },
    "stakeholders": { "type": "array", "items": { "type": "string" } },
    "success_definition": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
    "risk_boundaries": { "type": "array", "items": { "type": "string" } }
  },
  "additionalProperties": false
}
```

#### 6.4.2 `business-scenario-card.schema.json`

```json
{
  "type": "object",
  "required": [
    "schema_version",
    "task_id",
    "scenario_id",
    "business_goal",
    "entry_role",
    "initial_state",
    "trigger",
    "expected_agent_behavior",
    "expected_business_state",
    "technical_hard_gates",
    "business_evidence_required",
    "technical_evidence_required",
    "pass_criteria",
    "fail_criteria"
  ],
  "properties": {
    "schema_version": { "type": "integer", "enum": [1] },
    "task_id": { "type": "string", "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]*$" },
    "scenario_id": { "type": "string", "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]*$" },
    "slice_id": { "type": ["string", "null"] },
    "business_goal": { "type": "string" },
    "entry_role": { "type": "string" },
    "initial_state": { "type": "array", "items": { "type": "string" } },
    "trigger": { "type": "string" },
    "expected_agent_behavior": { "type": "array", "items": { "type": "string" } },
    "expected_business_state": { "type": "array", "items": { "type": "string" } },
    "technical_hard_gates": { "type": "array", "items": { "type": "string" } },
    "business_evidence_required": { "type": "array", "items": { "type": "string" } },
    "technical_evidence_required": { "type": "array", "items": { "type": "string" } },
    "pass_criteria": { "type": "array", "items": { "type": "string" } },
    "fail_criteria": { "type": "array", "items": { "type": "string" } }
  },
  "additionalProperties": false
}
```

#### 6.4.3 `business-acceptance-report.schema.json`

```json
{
  "type": "object",
  "required": [
    "schema_version",
    "task_id",
    "scenario_results",
    "technical_gate_summary",
    "rating",
    "open_deviations"
  ],
  "properties": {
    "schema_version": { "type": "integer", "enum": [1] },
    "task_id": { "type": "string", "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]*$" },
    "scenario_results": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["scenario_id", "business_result", "technical_gate_result", "score"],
        "properties": {
          "scenario_id": { "type": "string" },
          "business_result": { "type": "string", "enum": ["passed", "failed", "blocked", "not_run"] },
          "technical_gate_result": { "type": "string", "enum": ["passed", "failed", "blocked", "not_run"] },
          "score": { "type": "integer", "minimum": 0, "maximum": 100 }
        },
        "additionalProperties": false
      }
    },
    "technical_gate_summary": {
      "type": "object",
      "required": ["blocking_failure_count", "failed_gates"],
      "properties": {
        "blocking_failure_count": { "type": "integer", "minimum": 0 },
        "failed_gates": { "type": "array", "items": { "type": "string" } }
      },
      "additionalProperties": false
    },
    "rating": {
      "type": "object",
      "required": ["total", "level", "blocking_technical_gate_failed"],
      "properties": {
        "total": { "type": "integer", "minimum": 0, "maximum": 100 },
        "level": { "type": "string", "enum": ["accepted", "conditionally_accepted", "rejected", "blocked"] },
        "blocking_technical_gate_failed": { "type": "boolean" }
      },
      "additionalProperties": false
    },
    "open_deviations": { "type": "array", "items": { "type": "string" } }
  },
  "additionalProperties": false
}
```

#### 6.4.4 `business-verdict.schema.json`

```json
{
  "type": "object",
  "required": [
    "schema_version",
    "task_id",
    "verdict",
    "technical_gate_status",
    "business_acceptance_status",
    "required_followups"
  ],
  "properties": {
    "schema_version": { "type": "integer", "enum": [1] },
    "task_id": { "type": "string", "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]*$" },
    "verdict": { "type": "string", "enum": ["accepted", "conditionally_accepted", "rejected", "blocked"] },
    "technical_gate_status": { "type": "string", "enum": ["passed", "failed", "blocked", "not_run"] },
    "business_acceptance_status": { "type": "string", "enum": ["passed", "failed", "blocked", "not_run"] },
    "required_followups": { "type": "array", "items": { "type": "string" } }
  },
  "additionalProperties": false
}
```

---

## 7. Template 设计

### 7.1 放置位置

所有模板平铺在 `workflow/templates/`，不建嵌套目录。

```text
workflow/templates/
  business-intent.md
  business-source-coverage.md
  business-thread-map.md
  business-object-state-model.md
  business-action-rulebook.md
  business-scenario-card.md
  business-evidence-map.md
  business-playback.md
  business-acceptance-report.md
  business-deviation-log.md
  business-regression-scenario.md
  business-verdict.md
```

### 7.2 模板字段规则

所有模板使用现有风格占位符：

```text
{{TASK_ID}}
{{TITLE}}
{{CREATED}}
{{SCENARIO_ID}}
{{SLICE_ID}}
```

模板必须包含实质字段，不能只有标题。业务模板的最小要求：

```text
- task_id
- created
- owner
- source refs
- business purpose
- gate / pass / fail criteria
- evidence paths
- unresolved unknowns
```

---

## 8. Native team 运行流程

### 8.1 总流程

```text
A0 任务路由与 native team setup
A1 业务意图冻结
A2 来源覆盖与业务线程建模
A3 对象状态模型与动作规则
A4 场景验收卡
A5 SDD implementation slices
A6 技术 hard gate 验证
A7 业务回放与证据映射
A8 业务验收报告与偏差归因
A9 业务 verdict 与回归库沉淀
```

### 8.2 A0：任务路由与 native team setup

沿用 `$atlas-workflow:team` 既有流程：

```bash
~/.codex/workflow/bin/codex-workflow list
~/.codex/workflow/bin/codex-workflow route-decision --intent team --risk <risk> --decision use --reason "business acceptance first"
~/.codex/workflow/bin/codex-workflow ready <task-id> --require context,spec,analysis,decision
```

`staffing.md` 使用现有章节，不新增重复章节：

```markdown
## Agent Plan
## Active Roles
## Omitted Roles
## Phase Gates
## Commit Boundaries
## Concurrency And Write Boundaries
## Verification Evidence
```

### 8.3 A1：业务意图冻结

输出：

```text
team/acceptance/business-intent.md
team/acceptance/business-intent.json
```

必须回答：

```text
agent 替谁工作？
完成哪个业务闭环？
不完成什么？
哪些动作可以自动做？
哪些动作必须人工确认？
哪些情况必须拒绝、暂停、降级或转人工？
业务完成的可观察结果是什么？
```

没有 `business-intent`，不得进入非平凡 implementation slice。

### 8.4 A2：来源覆盖与业务线程建模

输出：

```text
team/acceptance/business-source-coverage.md/json
team/acceptance/business-thread-map.md/json
```

来源类型：

```text
SOP
流程图
制度文档
客户需求
历史聊天记录
工单/订单/操作日志
业务访谈
现有系统截图或导出
```

业务线程不是功能列表，而是：

```text
从一个真实业务触发开始，
经过角色、对象、状态和动作，
到达一个可验收终点的业务链。
```

线程字段：

```text
thread_id
business_trigger
actor_role
business_objects
start_state
allowed_actions
blocked_actions
expected_state_transitions
exception_paths
human_handoff_points
evidence_required
```

### 8.5 A3：对象状态模型与动作规则

输出：

```text
team/acceptance/business-object-state-model.md/json
team/acceptance/business-action-rulebook.md/json
```

对象状态模型回答：

```text
业务对象是什么？
状态有哪些？
谁拥有状态 owner？
哪些动作允许迁移状态？
外部工具结果是否可以直接推进业务终态？
状态冲突时如何 fail closed？
```

动作规则回答：

```text
agent 在什么角色、权限、业务状态、风险等级、上下文完整度下可以执行动作？
动作前必须读取哪些上下文？
动作可以调用哪些业务 API？
禁止调用哪些底层工具或外部能力？
动作成功后的状态是什么？
动作失败后的状态是什么？
需要哪些 trace、audit、idempotency、evidence？
```

### 8.6 A4：场景验收卡

输出：

```text
team/acceptance/scenarios/business-scenario-card.<scenario-id>.md/json
```

每张场景卡必须让 PM 可以直接验收：

```text
打开哪里？
用哪个角色？
用哪份初始数据？
第一步做什么？
agent 应该判断什么？
agent 应该调用什么业务动作？
agent 不允许做什么？
中间状态应该是什么？
最终状态应该是什么？
技术证据在哪里？
业务证据怎么看？
什么算通过？
什么算失败？
```

### 8.7 A5：SDD implementation slices

继续使用现有 SDD slice protocol。

每个 implementation slice 的 `brief.md/json` 必须引用相关业务 artifacts：

```text
acceptance_refs:
  - BA-SCENARIO-001
  - BA-ACTION-RULE-003
  - BA-OBJECT-STATE-002

required_checks:
  - existing technical checks
  - business scenario evidence generation
```

不改变 SDD 的角色与 ledger 语义。

### 8.8 A6：技术 hard gate 验证

实现完成后先跑技术 hard gate。任何 blocking failure 都让业务验收状态变为 `blocked`，不是 `failed`，因为业务尚无资格评估。

### 8.9 A7：业务回放与证据映射

输出：

```text
team/acceptance/scenarios/business-playback.<scenario-id>.md
team/acceptance/business-evidence-map.md/json
```

业务回放使用业务语言，不要求业务人员读代码、DB 或 worker log。

示例结构：

```markdown
# Business Playback: <scenario-id>

## 起点

## 业务执行过程

## agent 关键判断

## 人工确认/接管点

## 业务对象状态变化

## 最终结果

## 技术证据索引

## 未关闭偏差
```

`business-evidence-map.json` 负责把业务判断映射到技术证据：

```text
scenario_id -> business observation -> technical evidence path -> trace/audit/test command -> result
```

### 8.10 A8：业务验收报告与偏差归因

输出：

```text
team/acceptance/business-acceptance-report.md/json
team/acceptance/business-deviation-log.md/jsonl
```

偏差必须归类，不能只写“业务不满意”：

| 类型 | 说明 | 处理 |
| --- | --- | --- |
| `implementation_defect` | 技术实现没有达到已定义行为 | 修 bug |
| `technical_gate_failure` | 测试、权限、审计、trace、幂等、状态 owner 等失败 | 阻断，先修技术 gate |
| `business_rule_gap` | 业务规则没有定义或定义不完整 | 回到 A2/A3 更新模型和规则 |
| `process_fidelity_gap` | 流程顺序或角色分工不像真实业务 | 更新 thread / scenario |
| `ux_operability_gap` | 页面或输出导致业务人员不知道下一步 | 更新交互/文案/看板 |
| `evidence_gap` | 业务或技术证据不足 | 补证据 map 或 runner |
| `source_conflict` | SOP、聊天记录、客户需求互相冲突 | 业务决策后再实现 |
| `scope_mismatch` | 用户期望超出本次业务意图 | 更新 scope 或开新 task |

### 8.11 A9：业务 verdict 与回归库

输出：

```text
team/acceptance/business-verdict.md/json
team/acceptance/regression/business-regression-scenario.<scenario-id>.md/json
```

verdict 取值：

```text
accepted
conditionally_accepted
rejected
blocked
```

判断规则：

| verdict | 条件 |
| --- | --- |
| `accepted` | 所有 blocking 技术 gate 通过；核心业务场景达到阈值；无 P0/P1 未关闭偏差 |
| `conditionally_accepted` | 技术 gate 通过；核心业务闭环成立；仅有低风险、明确 owner 和截止时间的偏差 |
| `rejected` | 技术 gate 通过，但业务闭环不成立或关键场景失败 |
| `blocked` | blocking 技术 gate 失败，或证据不足导致无法业务验收 |

---

## 9. 仲裁规则：避免 SDD 与 BAF 双重治理冲突

### 9.1 基本原则

```text
SDD ledger 管技术执行生命周期。
Business verdict 管业务验收结论。
技术 hard gate 是业务 verdict 的前置资格。
```

### 9.2 冲突处理表

| 情况 | 结论 |
| --- | --- |
| SDD review clean，但技术 hard gate 失败 | 不允许业务 accepted；slice 需 repair 或标记 blocked |
| SDD run_complete，但业务场景没有跑 | 技术 run 完成；业务 verdict = blocked 或 not ready |
| 业务人员认为可用，但 audit/trace/permission 失败 | verdict = blocked；技术 gate 一票否决 |
| 技术全部通过，但业务流程不像真实业务 | verdict = rejected 或 conditionally_accepted；偏差类型为业务语义/流程保真 |
| mock 通过，但 staging/UAT 未跑 | 只能声明 sandbox accepted；不能声明 production accepted |
| 业务评分高，但缺 evidence map | verdict = blocked；无证据不验收 |
| 业务 rejected，但 SDD 技术 clean | 不回滚 SDD ledger；开修复 slice 或更新业务模型 |

### 9.3 ledger 关系

`run_complete` / `run_failed` 仍表示一次技术 run 的结束态，不表示业务接受。

`business-verdict` 是最终 `decision.md` 的业务层结论输入。

建议在 `decision.md` 中同时记录：

```markdown
## Technical Run Status
- SDD ledger status:
- Blocking hard gates:
- Required checks:

## Business Acceptance Verdict
- business-verdict:
- scenario coverage:
- open deviations:
- production readiness:
```

---

## 10. 技术 Hard Gate Matrix

技术 hard gate 是不可降低的安全地板。任何 `blocking=yes` 的 gate 失败，业务验收不得通过。

| Gate ID | Gate | Blocking | 验证证据 |
| --- | --- | --- | --- |
| THG-01 | build / typecheck 通过 | yes | command output |
| THG-02 | unit tests 通过 | yes | test report |
| THG-03 | integration tests 通过 | yes | test report |
| THG-04 | e2e 或 scenario runner 可重复运行 | yes | run log + run id |
| THG-05 | schema / migration 有断言与回滚策略 | yes for data-changing work | migration log + db assertions |
| THG-06 | API / DTO / OpenAPI 或接口契约一致 | yes for API work | API diff / response samples |
| THG-07 | 权限、scope、角色校验明确 | yes | auth tests / audit samples |
| THG-08 | audit 覆盖关键动作 | yes | audit export |
| THG-09 | traceId 可贯穿用户动作、API、worker、外部调用 | yes | trace file / logs |
| THG-10 | 幂等、重试、失败恢复有证据 | yes for side-effect work | retry tests / dead-letter evidence |
| THG-11 | 业务状态 owner 单一，外部工具结果不能直接推进业务终态 | yes | code review + tests |
| THG-12 | agent 只能调用业务 action/API，不能绕过到裸底层能力 | yes | code search / adapter review |
| THG-13 | mock/sandbox 只能模拟外部 I/O，不能直接写成功状态 | yes | runner review |
| THG-14 | realtime / outbox / worker 事件一致 | yes if async | worker logs / outbox checks |
| THG-15 | 前端关键流程可操作且无控制台错误 | yes for UI work | screenshots / browser evidence |
| THG-16 | evidence map 引用的文件存在且可复现 | yes | artifact lint |
| THG-17 | 用户手册只引用已验证流程 | yes for docs release | manual evidence references |
| THG-18 | 安全、隐私、密钥、环境配置无泄漏 | yes | scan / review |
| THG-19 | 回归场景加入 regression library | yes for accepted flows | regression artifact |
| THG-20 | 生产就绪声明必须经过目标环境证据 | yes | staging/UAT evidence |

---

## 11. 业务验收报告评分模型

文件名：

```text
business-acceptance-report.md/json
```

不是 `scorecard`。

### 11.1 评分维度

| 维度 | 分值 | 说明 |
| --- | ---: | --- |
| 业务目标闭环 | 20 | 是否达成业务起点到终点的真实目的 |
| 流程保真 | 15 | 是否符合 SOP、流程图、真实业务顺序 |
| 对象状态一致 | 15 | 页面、业务对象、DB、trace、审计是否一致 |
| agent 决策质量 | 15 | 是否读取上下文、判断权限/风险、选择正确 action |
| 异常与降级 | 10 | 不确定、冲突、失败时是否保守处理 |
| 可操作性 | 8 | 业务人员是否知道下一步怎么做 |
| 可解释性 | 7 | 是否能解释每一步为什么发生 |
| 证据完整性 | 10 | 业务证据与技术证据是否能互相映射 |

总分 100。

### 11.2 评分与 verdict 的关系

评分不能覆盖 hard gate。

| 条件 | verdict |
| --- | --- |
| blocking technical gate failed | `blocked` |
| total >= 90 且无 P0/P1 deviation | `accepted` |
| total 80-89 且只有低风险 deviation | `conditionally_accepted` |
| total < 80 且技术 gate 通过 | `rejected` |
| 证据不足无法评分 | `blocked` |

### 11.3 一票否决项

无论总分多少，出现以下任一情况即 `blocked` 或 `rejected`：

```text
绕过业务状态 owner
绕过权限/审计
缺 trace
该人工确认时自动执行
外部工具结果直接推进业务终态
mock 直接写成功状态
没有 scenario card 却验收
没有 business playback 却声称业务闭环
用户手册写入未验证流程
真实环境证据缺失却声明 production ready
```

---

## 12. 制造业通用闭环模型

本方案偏向制造业，但不绑定具体 FMS 细节。制造业业务验收的核心不是“某个设备怎么接”，而是下面这些通用闭环是否成立。

### 12.1 制造业七类通用闭环

| 闭环 | 起点 | 终点 | 关键问题 |
| --- | --- | --- | --- |
| `order-to-plan` | 客户需求 / 销售订单 / 预测 | 可执行生产计划 | 需求是否被正确拆解、优先级是否合理 |
| `plan-to-dispatch` | 生产计划 / 工单 | 工序任务被派发到资源 | 资源、能力、约束、优先级是否正确 |
| `material-to-line` | 物料需求 | 物料到达可生产位置 | 批次、替代料、齐套、先进先出是否正确 |
| `operation-to-report` | 工序任务开始 | 报工、完工、WIP 更新 | 数量、时间、人员、设备、异常是否一致 |
| `quality-to-release` | 检验需求 / 质量事件 | 放行、返工、报废、隔离 | 检验规则、判定、处置是否正确 |
| `exception-to-recovery` | 异常、停机、缺料、质量问题 | 恢复、转人工、关闭异常 | 异常是否保守处理、是否可追溯 |
| `trace-to-audit` | 任意业务动作 | 可追溯链路 | 人、物、机、法、环、测是否有证据 |

### 12.2 制造业通用对象

| 对象 | 常见状态 | 验收关注点 |
| --- | --- | --- |
| CustomerOrder / Demand | draft / confirmed / allocated / closed | 需求来源、优先级、交期 |
| ProductionOrder / WorkOrder | planned / released / in_progress / completed / cancelled / held | 拆单、排程、状态 owner |
| Route / Operation | pending / ready / running / done / skipped / blocked | 工艺顺序、前后置约束 |
| MaterialLot / Batch | available / reserved / consumed / quarantined / expired | 批次、追溯、替代料、保质期 |
| WIP Unit | waiting / processing / inspected / rework / scrap / released | WIP 位置、数量、状态一致 |
| WorkCenter / Resource | available / busy / down / maintenance / constrained | 能力、负载、状态可用性 |
| Equipment | ready / running / fault / offline / maintenance | 设备状态只作为业务判断输入，不直接代表业务完成 |
| Tooling / Fixture | available / mounted / worn / blocked | 工装匹配和寿命 |
| QualityInspection | required / sampling / passed / failed / waived | 放行规则、质量 gate |
| Nonconformance / Exception | open / acknowledged / contained / resolved / closed | 风险等级、责任人、恢复路径 |
| ShipmentUnit / PackUnit | packed / staged / shipped / held | 发运闭环、追溯 |

### 12.3 制造业 agent 动作分类

| 动作类 | 示例 | 规则 |
| --- | --- | --- |
| 计划类 | 创建/调整计划、拆单、排程建议 | 不能绕过业务审批和产能约束 |
| 派发类 | 释放工单、分配工序任务 | 必须检查资源、物料、质量 gate |
| 物料类 | 预留、叫料、替代料建议 | 必须保留批次和追溯 |
| 执行类 | 开工、暂停、完工、报工 | 必须区分人工确认、系统候选、外部信号 |
| 质量类 | 触发检验、判定建议、隔离 | 不能自动放行高风险不合格 |
| 异常类 | 创建异常、升级、恢复、重试 | fail closed，保守处理 |
| 追溯类 | 查询、导出、审计 | 不改变业务状态 |

### 12.4 制造业 scenario card 基准集

通用制造业框架至少应沉淀以下基准验收场景：

| Scenario ID | 场景 | 覆盖闭环 |
| --- | --- | --- |
| MFG-001 | 订单需求转生产计划 | order-to-plan |
| MFG-002 | 生产计划释放到工序任务 | plan-to-dispatch |
| MFG-003 | 物料齐套检查与叫料 | material-to-line |
| MFG-004 | 工序开工、报工、WIP 更新 | operation-to-report |
| MFG-005 | 质量检验失败后的隔离/返工 | quality-to-release |
| MFG-006 | 设备或资源不可用时的调度降级 | exception-to-recovery |
| MFG-007 | 批次追溯与审计导出 | trace-to-audit |
| MFG-008 | 高风险动作需要人工确认 | cross-cutting risk |
| MFG-009 | 外部系统回调重复或延迟 | idempotency / async |
| MFG-010 | mock/sandbox 通过但生产证据不足 | environment readiness |

---

## 13. Agent Planning 增强方式

### 13.1 不重定义现有角色

现有 `reviewer`、`verifier`、`evidence-qa` 保持原语义。本方案不把它们改写成业务专属角色。

### 13.2 可新增的业务角色名称

| 角色 | 用途 | 写权限 |
| --- | --- | --- |
| `domain-analyst` | 提取业务目标、角色、对象、规则、隐性约束 | 通常只读，输出建议给 main Codex |
| `process-modeler` | 将 SOP/流程图/聊天记录转成 thread map 和 object state model | 通常只读 |
| `scenario-curator` | 把客户 case 改成可验收 scenario card | 通常只读 |
| `acceptance-evaluator` | 按 playback 和 evidence map 评估业务闭环 | 只读 |
| `manufacturing-risk-reviewer` | 识别制造业场景中的质量、物料、设备、追溯风险 | 只读 |
| `ux-operability-reviewer` | 检查业务人员能否理解下一步动作 | 只读 |

main Codex 仍是：

```text
唯一 artifact writer
最终整合者
最终用户报告作者
```

不要引入 `business-controller`，避免和 orchestrator 职责重叠。

### 13.3 staffing.md 写法

只使用现有章节。业务验收内容写入现有章节中。

示例：

```markdown
## Agent Plan
| Role | Agent Type | Count | Read/Write | Owned Scope | Tools | Deliverable | Join Gate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| domain-analyst | explorer | 1 | read-only | SOP, user cases | file search | business intent findings | intent questions closed |
| process-modeler | explorer | 1 | read-only | workflow docs | file search | thread/state model findings | model conflicts listed |
| scenario-curator | explorer | 1 | read-only | customer cases | file search | scenario card draft | scenarios mapped |
| reviewer | explorer | 1 | read-only | implementation diff | repo tools | existing review verdict | review clean or findings |
| verifier | explorer | 1 | read-only | checks/evidence | commands/browser | verification evidence | hard gates resolved |

## Phase Gates
| Phase | Owner | Input | Output | Required Gate | Commit Boundary |
| --- | --- | --- | --- | --- | --- |
| Business Intent | main Codex | sources | business-intent.md/json | schema valid + no P0 unknown | no commit unless docs changed |
| Business Modeling | main Codex | intent + sources | thread/state/action artifacts | conflicts classified | commit after docs validation |
| Scenario Acceptance | main Codex | model + cases | scenario cards | cards validate + PM runnable | commit after validation |
| Implementation Slice | executor/main | scenario refs | code/docs changes | SDD review + hard gates | commit per slice |
| Business Playback | main Codex | run evidence | playback + evidence map | business evidence complete | commit evidence if repo-scoped |
| Business Verdict | main Codex | report + deviations | business-verdict | technical gate pass + rating rule | final decision |

## Verification Evidence
- Commands:
  - codex-team-validate-json --type business-intent --file ...
  - project build/typecheck/test/e2e commands
- Browser/API/runtime evidence:
  - scenario run logs
  - screenshots
  - API responses
  - audit/trace files
- Artifact paths:
  - workflow/artifacts/<task-id>/team/acceptance/business-evidence-map.json
  - workflow/artifacts/<task-id>/team/sdd/slices/<slice-id>/evidence-manifest.json
- Stop conditions:
  - blocking technical hard gate failure
  - missing business scenario card
  - missing evidence map
  - source conflict affecting state owner
```

---

## 14. 业务 artifacts 模板内容

### 14.1 `business-intent.md`

```markdown
# Business Intent

task_id: {{TASK_ID}}
created: {{CREATED}}
owner: main Codex

## Business Goal

## Agent Responsibility

## Excluded Scope

## Stakeholders

## Success Definition

## Risk Boundaries

## Human Confirmation Required

## Stop / Escalation Conditions

## Open Unknowns
```

### 14.2 `business-source-coverage.md`

```markdown
# Business Source Coverage

task_id: {{TASK_ID}}
created: {{CREATED}}

| Source | Type | Freshness | Used For | Confidence | Conflict |
| --- | --- | --- | --- | --- | --- |

## Missing Sources

## Source Conflicts

## Decisions Required
```

### 14.3 `business-thread-map.md`

```markdown
# Business Thread Map

task_id: {{TASK_ID}}
created: {{CREATED}}

| Thread ID | Business Trigger | Actor | Start State | End State | Objects | Happy Path | Exception Path | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

## Thread Notes
```

### 14.4 `business-object-state-model.md`

```markdown
# Business Object State Model

task_id: {{TASK_ID}}
created: {{CREATED}}

| Object | State Owner | States | Allowed Transitions | Forbidden Transitions | External Inputs | Evidence |
| --- | --- | --- | --- | --- | --- | --- |

## State Owner Rules

## Conflict Handling

## Fail-Closed Rules
```

### 14.5 `business-action-rulebook.md`

```markdown
# Business Action Rulebook

task_id: {{TASK_ID}}
created: {{CREATED}}

| Action | Business Purpose | Allowed Roles | Preconditions | Required Context | Allowed APIs | Forbidden Calls | Confirmation | Success State | Failure State | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

## High Risk Actions

## Automated Action Rules

## Human Handoff Rules
```

### 14.6 `business-scenario-card.md`

```markdown
# Business Scenario Card

task_id: {{TASK_ID}}
scenario_id: {{SCENARIO_ID}}
created: {{CREATED}}

## Business Goal

## Entry Role

## Initial Data

## Initial Business State

## Trigger

## Expected Agent Behavior

## Forbidden Behavior

## Expected Intermediate States

## Expected Final Business State

## Technical Hard Gates

## Business Evidence Required

## Technical Evidence Required

## Pass Criteria

## Fail Criteria

## Human Reviewer Notes
```

### 14.7 `business-evidence-map.md`

```markdown
# Business Evidence Map

task_id: {{TASK_ID}}
created: {{CREATED}}

| Scenario | Business Claim | Business Evidence | Technical Evidence | Existing SDD Evidence Manifest | Trace/Audit | Result |
| --- | --- | --- | --- | --- | --- | --- |

## Missing Evidence

## Evidence Integrity Notes
```

### 14.8 `business-acceptance-report.md`

```markdown
# Business Acceptance Report

task_id: {{TASK_ID}}
created: {{CREATED}}

## Technical Gate Summary

| Gate | Result | Evidence | Blocking |
| --- | --- | --- | --- |

## Scenario Results

| Scenario | Business Result | Technical Gate Result | Score | Deviations |
| --- | --- | --- | ---: | --- |

## Rating

| Dimension | Score | Evidence | Notes |
| --- | ---: | --- | --- |

## Open Deviations

## Recommendation
```

### 14.9 `business-verdict.md`

```markdown
# Business Verdict

task_id: {{TASK_ID}}
created: {{CREATED}}

## Verdict

accepted | conditionally_accepted | rejected | blocked

## Technical Gate Status

## Business Acceptance Status

## Required Follow-ups

## Production Readiness Statement

## Decision Notes
```

---

## 15. 证据模型

### 15.1 双层证据

| 证据层 | 面向对象 | 例子 |
| --- | --- | --- |
| 技术证据 | 研发、QA、reviewer、verifier | command output、test report、API response、DB assertion、worker log、audit export、trace、e2e run |
| 业务证据 | PM、业务专家、最终用户 | business playback、页面截图、业务状态说明、异常处理记录、人工确认点、下一步操作说明 |

### 15.2 证据映射原则

每个业务判断必须可以追到技术证据。

示例：

| Business Claim | Technical Evidence |
| --- | --- |
| 工单已释放到正确工序 | API response + DB assertion + audit |
| 物料批次被正确预留 | reservation record + trace + batch state |
| 高风险动作进入人工确认 | action status + audit + UI screenshot |
| 质量失败后进入隔离 | quality event + state transition + exception log |
| agent 没有自动执行禁止动作 | action log + code/API boundary review |

### 15.3 evidence map 与 existing evidence-manifest 的关系

```text
business-evidence-map.json
  -> 引用一个或多个 SDD slice evidence-manifest.json
  -> 引用业务 playback
  -> 引用截图、trace、audit、test report
  -> 汇总业务 claim 是否被证据支持
```

不复制、不重命名、不覆盖现有 `evidence-manifest.json`。

---

## 16. 测试策略

评审指出上一版没有测试覆盖策略。本版规定：任何新增 schema、validator、artifact lint、template 约束都必须进入 contract tests。

### 16.1 测试位置

优先扩展现有测试体系：

```text
workflow/tests/
  contract.sh
  contract_team_native.sh
  contract_team_sdd.sh
  contract_team_legacy.sh
  contract_team_business_acceptance.sh   # 可新增，由 contract.sh source
```

如果不新增文件，也可以把 business acceptance tests 放进 `contract_team_native.sh`。但一旦业务验收类型超过 3 个，建议单独拆出 `contract_team_business_acceptance.sh`，仍由顶层 `contract.sh` 调用。

### 16.2 每个 schema 必须有 success/failure fixture

每个新增 JSON type 至少两类 fixture：

```text
success: 最小合法 JSON 通过
failure: 缺 schema_version 或 task_id 必须失败
failure: 类型专属 required 字段缺失必须失败
failure: unknown additional property 必须失败（如 schema 设置 additionalProperties=false）
```

### 16.3 helper 扩展测试

如果扩展 `codex-team-validate-json` registry：

```text
- unknown type fails
- each business type validates success fixture
- each business type rejects missing schema_version
- each business type rejects missing task_id
```

如果扩展 `codex-team-artifact-lint`：

```text
- missing business-intent fails
- missing scenario card fails when business acceptance mode is enabled
- missing evidence map fails before business verdict
- failed hard gate prevents accepted verdict
```

### 16.4 business verdict 测试

必须覆盖：

```text
technical_gate_status=failed + verdict=accepted -> fail
technical_gate_status=passed + score high + no deviations -> pass
technical_gate_status=passed + open P0 deviation + verdict=accepted -> fail
technical_gate_status=passed + open minor deviations + verdict=conditionally_accepted -> pass
missing evidence map + verdict=accepted -> fail
```

---

## 17. 唯一权威落地计划

上一版同时出现 13 个 helper、5 个 MVP helper、3 天 MVP 0 helper，造成范围不一致。本版只保留以下 PR sequence。

### 17.1 MVP 定义

MVP = PR1 + PR2 + PR3。

MVP 完成后必须具备：

```text
1. team/SKILL.md 知道 business acceptance mode。
2. workflow/templates/ 有扁平业务模板。
3. contracts/team-sdd/ 有业务 JSON schema 与 validators。
4. codex-team-validate-json 能校验新增业务类型。
5. contract tests 覆盖 success/failure fixtures。
6. 不存在 codex-business-* 新脚本。
7. 不存在平行 contracts/business-acceptance-first/。
8. 不存在平行 workflow/templates/business-acceptance-first/。
```

### 17.2 PR1：文档与模板

范围：

```text
plugins/atlas-workflow/skills/team/SKILL.md
workflow/templates/business-intent.md
workflow/templates/business-source-coverage.md
workflow/templates/business-thread-map.md
workflow/templates/business-object-state-model.md
workflow/templates/business-action-rulebook.md
workflow/templates/business-scenario-card.md
workflow/templates/business-evidence-map.md
workflow/templates/business-playback.md
workflow/templates/business-acceptance-report.md
workflow/templates/business-deviation-log.md
workflow/templates/business-regression-scenario.md
workflow/templates/business-verdict.md
```

验收：

```text
- bash / markdown lint 如仓库已有
- SKILL.md 中不新增重复 staffing 章节
- 模板平铺，无 nested business templates directory
- 无 codex-business-* 引用
```

### 17.3 PR2：schema / validator / validate-json registry

范围：

```text
plugins/atlas-workflow/contracts/team-sdd/business-*.schema.json
plugins/atlas-workflow/contracts/team-sdd/validators/business-*.js
plugins/atlas-workflow/scripts/codex-team-validate-json
```

验收：

```text
- 所有新增 schema required schema_version/task_id
- validator 命名无 validate- 前缀
- codex-team-validate-json 支持新增 --type
- success/failure fixtures 通过
```

### 17.4 PR3：business acceptance artifact lint / verdict guard

范围：

```text
现有 codex-team-artifact-lint 或 equivalent team artifact guard
workflow/tests/contract_team_business_acceptance.sh
```

验收：

```text
- missing business-intent blocks business verdict
- missing scenario card blocks business verdict
- missing evidence map blocks accepted verdict
- failed technical hard gate blocks accepted verdict
- accepted / conditionally_accepted / rejected / blocked 四种 verdict fixture 覆盖
```

如果仓库当前没有可扩展的 artifact lint，PR3 不新增 `codex-business-*`，而是在现有 `codex-team-*` 命名空间中新增或扩展一个 team artifact guard。

### 17.5 PR4：制造业通用 canvas 与 examples

范围：

```text
workflow/templates/business-manufacturing-closure-canvas.md
workflow/templates/business-manufacturing-scenario-seed.md
plugins/atlas-workflow/skills/team/SKILL.md 制造业偏置说明
```

验收：

```text
- 不包含 FMS 专项业务细节
- 覆盖 order-to-plan / plan-to-dispatch / material-to-line / operation-to-report / quality-to-release / exception-to-recovery / trace-to-audit
- scenario seed 可转成 business-scenario-card
```

### 17.6 PR5：可选增强

范围：

```text
codex-team-brief optional support for business acceptance refs
codex-team-workspace optional acceptance directory creation
codex-team-ledger metadata linking to business-verdict path
```

约束：

```text
- 仍然不新增 codex-business-* 命名空间
- 仍然不改变 existing scorecard/evidence-manifest/ledger 语义
- 所有新增参数必须向后兼容
```

---

## 18. `team/SKILL.md` 增补草案

以下是建议新增到 `$atlas-workflow:team` 的业务验收模式说明。写入时需根据现有文档位置调整，但不得覆盖 existing role semantics。

```markdown
## Business Acceptance First Mode

Use Business Acceptance First mode when a task is a business agent, workflow automation, multi-tool agent, or product delivery where “technical checks pass” is not enough to prove real business usability.

BAF mode is not a separate workflow system. It reuses the native team flow, existing staffing.md sections, SDD slice protocol, codex-team-* helpers, and main Codex artifact ownership.

### When To Activate

Activate BAF mode when any of these are true:

- The user asks for business workflow validation, agent business planning, UAT, acceptance, or operational closure.
- The task touches roles, permissions, business states, approvals, exceptions, audit, or cross-system side effects.
- The output must be accepted by product managers, operators, business users, or domain experts.
- A multi-tool agent could complete technical actions while still failing business intent.

### Required Business Artifacts

Write BAF artifacts under:

workflow/artifacts/<task-id>/team/acceptance/

Required before nontrivial implementation:

- business-intent.md/json
- business-source-coverage.md/json
- business-thread-map.md/json
- business-object-state-model.md/json
- business-action-rulebook.md/json
- at least one business-scenario-card.<scenario-id>.md/json

Required before business acceptance:

- business-playback.<scenario-id>.md for each accepted scenario
- business-evidence-map.md/json
- business-acceptance-report.md/json
- business-deviation-log.md/jsonl when deviations exist
- business-verdict.md/json

### Staffing

Do not add separate Business Gates or Business Evidence sections to staffing.md.
Use the existing sections:

- Agent Plan
- Active Roles
- Omitted Roles
- Phase Gates
- Commit Boundaries
- Concurrency And Write Boundaries
- Verification Evidence

Do not redefine reviewer, verifier, or evidence-qa. They retain their existing native team meanings.
Add domain-specific roles only when useful, such as domain-analyst, process-modeler, scenario-curator, acceptance-evaluator, manufacturing-risk-reviewer, or ux-operability-reviewer.

### Technical Hard Gates

Business acceptance cannot pass when a blocking technical hard gate fails. A business-friendly demo is not acceptance unless the required technical evidence exists.

Blocking examples:

- build/typecheck/test/e2e failure
- missing permission, audit, trace, idempotency, or rollback evidence
- external tool result directly mutates business final state
- mock/sandbox directly writes success state
- missing business-evidence-map
- user manual references unverified flow

### Verdict

Business verdict values:

- accepted
- conditionally_accepted
- rejected
- blocked

The business verdict does not replace SDD ledger run_complete/run_failed. Ledger records technical lifecycle; business-verdict records business acceptance outcome.
```

---

## 19. PM 与业务验收方式

### 19.1 PM 验收顺序

PM 不应该面对“系统做好了，你来验吧”。PM 应该按 scenario card 验收。

```text
1. 选择 scenario card
2. 确认 initial data / initial state
3. 用指定 role 进入指定入口
4. 触发第一步
5. 观察 agent 判断与动作
6. 对照 expected intermediate states
7. 查看 business playback
8. 查看 business evidence map
9. 查看 technical gate summary
10. 记录 deviation
11. 形成 business acceptance report
12. 输出 business verdict
```

### 19.2 业务专家参与方式

业务专家不需要看 schema、DB、worker log。业务专家看：

```text
business-intent
business-thread-map
business-scenario-card
business-playback
页面截图 / 录屏
business-deviation-log
```

问业务专家的问题应该是：

```text
这个流程是否像真实业务？
这个状态下 agent 是否应该继续自动做？
这个动作是否应该人工确认？
异常处理是否保守？
业务人员是否知道下一步做什么？
结果是否能被下游接住？
```

不要问：

```text
接口是否正确？
schema 是否合理？
trace 是否完整？
worker retry 是否幂等？
```

这些属于技术 reviewer/verifier。

---

## 20. 制造业业务验收 Checklist

### 20.1 业务闭环 Checklist

- [ ] 是否明确订单/计划/工单/工序/物料/WIP/质量/异常/追溯中的主对象？
- [ ] 是否明确每个对象的状态 owner？
- [ ] 是否明确外部系统/设备/工具结果只是输入，不直接代表业务终态？
- [ ] 是否明确计划、派工、叫料、报工、质检、异常、追溯的业务终点？
- [ ] 是否覆盖高风险动作的人工确认？
- [ ] 是否覆盖缺料、设备不可用、质量失败、数据冲突、外部回调延迟？
- [ ] 是否有业务 playback 让非技术人员能复盘？
- [ ] 是否有 evidence map 让技术人员能追溯？

### 20.2 技术硬门槛 Checklist

- [ ] build/typecheck 通过。
- [ ] unit/integration/e2e 或 scenario runner 通过。
- [ ] 权限、scope、audit、trace、idempotency 通过。
- [ ] 业务 action/API 边界清晰，agent 不能绕过到底层工具。
- [ ] 状态 owner 单一，无双写终态。
- [ ] mock/sandbox 不直接写成功状态。
- [ ] evidence map 引用文件存在。
- [ ] 用户手册不写未验证流程。
- [ ] production readiness 有目标环境证据。

### 20.3 验收结论 Checklist

- [ ] `business-acceptance-report.json` 校验通过。
- [ ] `business-verdict.json` 校验通过。
- [ ] `business-verdict` 未与 technical gate status 冲突。
- [ ] 所有 P0/P1 deviation 已关闭或 verdict 不为 accepted。
- [ ] 核心场景进入 regression library。

---

## 21. 从上一版方案迁移到本版

需要删除或改名的内容：

| 旧项 | 新项 |
| --- | --- |
| `contracts/business-acceptance-first/` | `contracts/team-sdd/business-*.schema.json` + `contracts/team-sdd/validators/business-*.js` |
| `workflow/templates/business-acceptance-first/` | `workflow/templates/business-*.md` 扁平模板 |
| `codex-business-workspace` | 不新增；使用 `codex-team-workspace` |
| `codex-business-contract-check` | 不新增；扩展 `codex-team-validate-json` |
| `codex-business-scenario-check` | 不新增；扩展 `codex-team-validate-json` |
| `codex-business-evidence-index` | 不新增；使用 `business-evidence-map` artifact + 现有 technical evidence manifest |
| `codex-business-release-decision` | 不新增；使用 `business-verdict.md/json` |
| `acceptance-scorecard.md/json` | `business-acceptance-report.md/json` |
| `evidence-manifest` 业务用法 | `business-evidence-map` |
| `Business Gates` staffing 章节 | 写入现有 `Phase Gates` |
| `Business Acceptance Evidence` staffing 章节 | 写入现有 `Verification Evidence` |
| `business-controller` 角色 | main Codex orchestrator，不另命名 |

---

## 22. 完成定义

### 22.1 框架改造完成定义

框架改造完成需要：

```text
- 无 codex-business-* 新脚本。
- 无 contracts/business-acceptance-first 平行目录。
- 无 workflow/templates/business-acceptance-first 嵌套目录。
- 所有新增 schema 位于 contracts/team-sdd/ 扁平层级。
- 所有新增 validator 位于 validators/ 且无 validate- 前缀。
- 所有新增 JSON schema required schema_version/task_id。
- codex-team-validate-json 支持业务类型。
- contract tests 覆盖 success/failure fixtures。
- team/SKILL.md 中 BAF mode 不重定义 reviewer/verifier/evidence-qa。
- staffing.md 只使用既有章节。
- business verdict 与 ledger run status 层级关系写清。
```

### 22.2 单个业务 agent 交付完成定义

单个业务 agent 交付完成需要：

```text
- business-intent 已冻结。
- source coverage 已记录。
- thread map、object state model、action rulebook 已形成。
- 核心 scenario cards 已形成。
- implementation slices 通过 SDD review。
- 技术 hard gates 通过。
- business playback 完成。
- business evidence map 完成。
- business acceptance report 完成。
- deviation log 关闭或被 verdict 接收。
- business verdict 为 accepted 或 conditionally_accepted。
- regression scenario library 已更新。
```

---

## 23. 最终建议

本轮评审意见应接受，因为它指出的是工程契合度问题，而不是业务验收理念问题。上一版将 BAF 做成了与现有 `team-sdd` 并行的完整子系统，因此产生了命名碰撞、重复造轮子、约定不符、范围不一致、流程重叠和测试断层。

修订后的路线是：

```text
不新建业务子系统；
不新增 codex-business-*；
不抢占 scorecard / evidence-manifest / workspace / release decision 既有语义；
不重定义 reviewer / verifier / evidence-qa；
不降低任何技术 gate；
把业务验收 artifacts 嵌入 native team 的 team/acceptance/；
把 schema/validator 嵌入 team-sdd 现有验证框架；
把业务 gate 写入现有 staffing Phase Gates；
把业务证据写入现有 Verification Evidence；
用 business-acceptance-report 和 business-verdict 重新定义业务完成。
```

这样，Atlas Forge 的 native team 会从“技术实现与评审框架”升级为“业务验收优先的 agent 交付框架”，同时保持现有工程纪律、命名约定和测试门槛。
