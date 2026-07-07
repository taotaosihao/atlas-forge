# BAF 方案与现有仓库契合度 · 对抗式评审

> **评审对象**：`docs/atlas-forge-native-team-business-first-acceptance-plan.md`（BAF 验收方案，2136 行）
> **评审日期**：2026-07-07
> **评审范围**：与 `plugins/atlas-workflow/` 现有仓库的契合度——命名、结构、约定、角色、流程是否存在冲突、重复或不一致
> **立场声明**：对抗式批判，findings only。不评 BAF 第一性原理是否成立、不评制造业偏置、不评落地可行性、不给替代架构。每个 finding 仅指出问题与证据，不替作者设计"应该改成什么"。

---

## 结论速览

1. **`scorecard`、`evidence-manifest`、`contract`、`workspace`、`release decision` 五个核心名词均与现有仓库产生语义碰撞**，其中 `scorecard` 和 `evidence-manifest` 是直接同名冲突。
2. **全部 5 个 MVP helper 脚本均有现有近似物**，BAF 方案未论证为何无法复用，也未定义与现有 helper 的调用边界。
3. **§14 草案 schema 全部缺少 `schema_version` 和 `task_id`**，而现有 5 个 schema 均将其列为 required 字段——这是最硬的约定违背。
4. **§5.1（13 个脚本）、§13（MVP 5 个）、§17.1（3 天 MVP 0 个脚本）**三处对 MVP 范围的表述互不一致。
5. **`reviewer`、`verifier`、`evidence-qa`、`business-controller`** 四个角色名直接复用现有名称，但语义被收窄或扩张，将在同一 staffing 上下文中产生歧义。

---

## 一、命名碰撞（Semantic Collisions）

### F1. `scorecard` — 同名异构

- **源文档**：§9（行 996–1041）定义 `Business Acceptance Scorecard`，含 9 个评分维度（`business_outcome_closure`、`process_fidelity` 等），满分 100 分，用于业务验收评级。
- **现有仓库**：
  - `contracts/team-sdd/scorecard.schema.json:1–26`：现有 scorecard 是 SDD slice 遥测事件，字段为 `role`、`model`、`status`、`event`、`duration_ms`——是**技术事件**，不是业务评分。
  - `contracts/team-sdd/validators/scorecard.js:26–53`：`validateScorecardEvent()` 校验 `role`/`model`/`status`/`event` 字段。
  - `scripts/codex-team-scorecard:1–15`：现有 CLI `codex-team-scorecard --task <task-id> append|summary` 写入 SDD slice 遥测事件。
- **碰撞性质**：同名（`scorecard`），完全不同的数据模型和使用场景。如果 BAF 的 `scorecard.schema.json`（§5.1，行 341）和 `acceptance-scorecard.md`（§5.1，行 381）落地，`codex-team-scorecard` 写入的遥测事件与 BAF 的 `acceptance-scorecard.md` 将共享同一名词但无法互操作。
- **证据核实**：`rg scorecard` 在 `contracts/team-sdd/` 下命中的均为现有 SDD 遥测语义，未发现业务评分语义的预先存在。

### F2. `evidence-manifest` — 直接同名冲突

- **源文档**：§5.1（行 340）提议 `evidence-manifest.schema.json`；§5.2（行 417–418）提议 `06-evidence-manifest.md` 和 `06-evidence-manifest.json`。
- **现有仓库**：`scripts/codex-team-brief:19` 已有 `--contract <file> Sprint Contract markdown to compile into evidence-manifest.json`；`:299–300` 写入 `evidence-manifest.json` 并输出 `evidence_manifest:` 路径。
- **碰撞性质**：文件名 `evidence-manifest.json` 完全相同。现有 `codex-team-brief` 已经在 `workflow/artifacts/<task-id>/team/sdd/slices/<slice-id>/evidence-manifest.json` 写入证据清单，BAF 若在 `workflow/artifacts/<task-id>/business/06-evidence-manifest.json` 写入同名文件，两个完全不同的 artifact 将因同名而无法在路径上下文中区分。
- **证据核实**：`rg evidence.manifest` 确认 `codex-team-brief:19,299,300` 三处引用。

### F3. `workspace` — 仅靠前缀区分

- **源文档**：§5.1（行 356）提议 `codex-business-workspace`；§13.2（行 1318–1340）描述其创建 `workflow/artifacts/<task-id>/business/` 目录。
- **现有仓库**：`scripts/codex-team-workspace:1–101` 现有 `codex-team-workspace --task <task-id> [--slice <slice-id>]`，创建 `workflow/artifacts/<task-id>/team/sdd/` 及 slice 子目录。
- **碰撞性质**：两者语义高度重叠（均为"为 task 创建 artifact 目录结构"），仅通过 `team-` vs `business-` 前缀区分。调用者需要知道何时用哪个 workspace 命令，而 BAF 方案未定义两者的分工边界。
- **证据核实**：`codex-team-workspace:65` 确认现有 workspace 输出 sdd 路径为 `team/sdd`。

### F4. `contract` — 语义稀释

- **源文档**：§1.4（行 129–139）定义五类合同：`Business Intent Contract`、`Business Object State Contract`、`Agent Action Contract`、`Scenario Acceptance Contract`、`Evidence Contract`。"合同"一词在全文出现逾 50 次。
- **现有仓库**：
  - `scripts/codex-team-brief:19`：`--contract <file> Sprint Contract markdown to compile into evidence-manifest.json`
  - `skills/team/SKILL.md:33`：`contract formation`（指 team 任务路由决策）
  - `skills/team/SKILL.md:195`：`contract drift`（reviewer 检查项）
  - `skills/team/SKILL.md:408–410`：`implementation contract`（非平凡本地工作的轻量实现合同）
- **碰撞性质**：现有仓库中 `contract` 有四种既有语义（sprint contract、路由 contract formation、实现合同 contract drift、implementation contract），BAF 新增五种语义。同一代码库中 `contract` 一词将承载至少 9 种不同含义。
- **证据核实**：`rg contract` 在 `plugins/atlas-workflow/` 下命中 16 个文件。

### F5. `release decision` — 概念重叠

- **源文档**：§5.1（行 367）提议 `codex-business-release-decision`；§5.2（行 430）提议 `12-release-decision.md`；§6.10（行 836–843）定义三种结论：`business_accepted` / `conditionally_accepted` / `business_rejected`。
- **现有仓库**：`contracts/team-sdd/ledger-event.schema.json:38–39` 已有 `run_complete` 和 `run_failed` 事件类型——这是技术 run 结束态事件（运行完成/失败的结束态记录），而非 release-state 决策。`validators/ledger-event.js:33–34` 也校验这两个值。
- **碰撞性质**：现有 ledger 的 `run_complete`/`run_failed` 是技术 run 结束态事件，BAF 的 `release decision`（业务验收三态结论 `business_accepted`/`conditionally_accepted`/`business_rejected`）是业务层 release 决策——两者在概念层有重叠（都关乎"一次 run 的最终裁决"），但**非同名碰撞**（名词不同：`run_complete`/`run_failed` vs `release-decision`），与 F1/F2 的同名异构性质不同。BAF 方案未说明与现有 `run_complete`/`run_failed` 的层级关系——是替代、补充、还是并行。
- **证据核实**：`rg run_complete\|run_failed` 确认 ledger-event schema 和 validator 两处引用。

---

## 二、重复造轮子（Duplication）

### F6. 所有 MVP helper 均有现有近似物

| BAF MVP helper（§13） | 现有近似物 | 重叠程度 |
|---|---|---|
| `codex-business-workspace`（行 1318） | `codex-team-workspace`（`scripts/codex-team-workspace:1–101`） | 高：创建 artifact 目录，仅输出路径不同 |
| `codex-business-contract-check`（行 1342） | `codex-team-validate-json`（`scripts/codex-team-validate-json:1–30`）+ `codex-team-artifact-lint` | 中高：字段校验 + artifact 完整性检查 |
| `codex-business-scenario-check`（行 1358） | `codex-team-validate-json` validators 模式 | 中：检查字段完整性，现有 validators 已覆盖 6 种文档类型 |
| `codex-business-evidence-index`（行 1374） | `codex-team-brief`（`scripts/codex-team-brief:299` 已编译 evidence index） | 高：直接输出 `evidence-manifest.json` |
| `codex-business-release-decision`（行 1388） | ledger `run_complete`/`run_failed`（`ledger-event.schema.json:38–39`） | 中：业务三态 vs 技术二态，但概念层重叠 |

- **源文档中未出现的论证**：方案未论证为何另起 `codex-business-*` 命名空间而非扩展现有 `codex-team-*` 框架。也未论证 `codex-team-validate-json` 的 validate-by-type 模式能否扩展到 BAF 的 schema 类型。

### F7. 10 个 schema + 10 个 validator 复制现有验证模式

- **源文档**：§5.1（行 331–354）提议 `contracts/business-acceptance-first/schemas/` 下 10 个 JSON schema + `validators/` 下 10 个 `validate-*.js` 文件。
- **现有仓库**：`contracts/team-sdd/` 已有 5 个 schema + 6 个 validator（含 `common.js`）。`codex-team-validate-json:1–30` 通过 `TYPES` 注册表按类型分发校验：
  - `brief` → `validateBrief`
  - `implementer-report` → `validateImplementerReport`
  - `review-verdict` → `validateReviewVerdict`
  - `ledger-event` → `validateLedgerEvent`
  - `path-lease` → `validatePathLeaseDocument`
  - `scorecard` → `validateScorecardEvent`
- **重复性质**：BAF 新增的 10 个 schema+validator 是一个独立但结构相同的验证体系。现有 `codex-team-validate-json` 通过 `TYPES` 注册表按类型分发校验（`:13–30`），BAF 提议的 10 个独立 `validate-*.js` 文件与该分发模式不一致——此处仅陈述约定偏离，不对实现方式开处方。

### F8. 15 个模板复制 artifact 生成模式

- **源文档**：§5.1（行 371–387）提议 `workflow/templates/business-acceptance-first/` 下 15 个 `.md` 模板。
- **现有仓库**：`scripts/codex-team-brief` 已实现从 sprint contract 编译 artifact（生成 `brief.md`、`brief.json`、`evidence-manifest.json`）。BAF 的 15 个模板本质上也是 markdown→artifact 的生成链，但 BAF 方案未沿用 `codex-team-brief` 的编译模式。
- **重复性质**：同一种"模板 → 编译 → 写入 artifact"的模式，在两套独立体系中各实现一次。

---

## 三、约定不符（Convention Violations）

### F9. 目录嵌套层级不一致

- **源文档**：§5.1（行 331–354）提议：
  ```
  contracts/business-acceptance-first/
    schemas/          ← schemas 是子目录
      *.schema.json
    validators/       ← validators 是子目录
      validate-*.js
  ```
- **现有仓库**（glob 验证）：
  ```
  contracts/team-sdd/
    brief.schema.json             ← schema 文件与 validators/ 同级
    implementer-report.schema.json
    ledger-event.schema.json
    path-lease.schema.json
    review-verdict.schema.json
    scorecard.schema.json
    validators/                   ← validators 作为 sibling 目录
      brief.js
      common.js
      implementer-report.js
      ledger-event.js
      path-lease.js
      review-verdict.js
      scorecard.js
  ```
- **偏离**：现有模式是 schema 文件与 `validators/` 同级（扁平）。BAF 在 schema 之上多嵌套了一层 `schemas/` 子目录。虽然是可选的结构差异，但与已有约定不一致。

### F10. Validator 命名前缀不一致

- **源文档**：§5.1（行 345–354）提议 `validate-business-intent.js`、`validate-source-coverage.js`、`validate-business-thread.js` 等——全部带 `validate-` 前缀。
- **现有仓库**（glob 验证）：`validators/brief.js`、`validators/scorecard.js`、`validators/implementer-report.js`、`validators/review-verdict.js`、`validators/path-lease.js`、`validators/ledger-event.js`、`validators/common.js`——**均无 `validate-` 前缀**，以文档类型命名。
- **偏离**：BAF 引入了一个与现有所有 validator 不一致的命名约定。

### F11. §14 Schema 草案全部缺少 `schema_version` 和 `task_id`（Hard Violation）

- **源文档**：§14（行 1409–1538）包含 5 个 JSON schema 草案：
  - Business Intent JSON（行 1413–1430）：无 `schema_version`，无 `task_id`
  - Business Thread JSON（行 1435–1457）：无两者
  - Agent Action Contract JSON（行 1461–1486）：无两者
  - Scenario Card JSON（行 1490–1512）：无两者
  - Scorecard JSON（行 1516–1538）：无两者
- **现有仓库**（逐文件核实）：
  - `brief.schema.json:3–4`：`required: ["schema_version", "task_id", ...]`
  - `implementer-report.schema.json:3–4`：`required: ["schema_version", ..., "task_id", ...]`
  - `ledger-event.schema.json:3`：`required: ["schema_version", "event", "task_id", "timestamp"]`
  - `review-verdict.schema.json:3–4`：`required: ["schema_version", "task_id", ...]`
  - `path-lease.schema.json:3`：`required: ["schema_version", "task_id", "leases"]`
  - `scorecard.schema.json:3–4`：`required: ["schema_version", "task_id", "slice_id", ...]`
  - `validators/scorecard.js:31`：`requireKeys(value, ["schema_version", "task_id", "slice_id", ...], errors)`
- **严重性**：这是所有现有 schema 的**普遍约定**，无一例外。在这 5 个 schema 中强制要求 `schema_version: 1`（`enum: [1]`）和 `task_id`（`pattern: "^[A-Za-z0-9][A-Za-z0-9._-]*$"`）。BAF 全部 5 个 schema 草案均未遵守。如果落地，`codex-team-validate-json` 将无法校验 BAF schema（因为缺少 `schema_version`），BAF schema 也无法通过现有 `codex-team-artifact-lint` 的 artifact 完整性检查。
- **证据核实**：已逐文件通读全部 5 个现有 schema 和 `validators/scorecard.js` 的 `requireKeys` 调用。

### F12. 模板嵌套子目录无现有先例

- **源文档**：§5.1（行 371–387）提议 `workflow/templates/business-acceptance-first/` 嵌套子目录。
- **现有仓库**：顶层 `workflow/templates/` 已存在 6 个扁平独立模板文件——`design-review-contract.md`、`design-review-report.md`、`design-review-verdict.json`、`implementation-contract.md`、`learning.md`、`task.md`；其中 `implementation-contract.md` 使用 `{{TASK_ID}}`/`{{TITLE}}`/`{{CREATED}}` 占位符。即"独立模板文件 + `{{PLACEHOLDER}}` 占位"本身**已有先例**。但现有模板均扁平存放在 `workflow/templates/` 顶层，无嵌套子目录。
- **影响**：BAF 提议的 `workflow/templates/business-acceptance-first/` 嵌套子目录无现有先例（现有模板均为扁平存放），但与现有结构无直接冲突。

---

## 四、范围内部不一致（Internal Inconsistency）

### F13. 三处对 MVP helper 数量的表述不一致

| 位置 | 所述范围 | 脚本数量 | 关键行号 |
|---|---|---|---|
| §5.1 仓库结构建议 | 完整 BAF 脚本清单 | **13 个** `codex-business-*` 脚本 | 行 356–368 |
| §13 最小可行 helper scripts | "不需要一次性写完整平台，先实现五个 helper 即可" | **5 个** | 行 1306–1316 |
| §17.1 MVP 三天落地计划 | Day 1：模板与 SKILL；Day 2：证据与评分（回放、scorecard、deviation）；Day 3：制造业 canvas | **0 个** helper script | 行 1725–1779 |

- **矛盾**：§13 说 MVP 需要 5 个 helper，§17.1 的三天计划完全没有提到任何 helper script 的落地。helper script 被推迟到了 §17.2"两周增强版"的 Week 1 Day 3–4（行 1781–1791）。读者无法确定 MVP 的最小边界：是 5 个 helper 还是 0 个？还是全部 13 个？
- **证据核实**：逐节对照行号范围，确认三处用词和数量确实不同。

### F14. §17 与 §22 两套 PR 切片计划边界不对齐

- **§17 实施路线**（行 1723–1802）：按时间组织——3 天 MVP + 2 周增强版。MVP 阶段只涉及模板/SKILL/证据/制造业 canvas，不涉及 helper script。
- **§22 最小 PR 切片建议**（行 2009–2078）：按 PR 组织——4 个 PR。PR 1 = 模板 + SKILL（≈ §17 Day 1）；PR 2 = workspace + contract-check；PR 3 = scenario-check + evidence-index + release-decision；PR 4 = 制造业 canvas。
- **不对齐点**：
  - §17 的 Day 2–3 产物（playback、scorecard、deviation、manufacturing canvas、regression-library）在 §22 中被分散到 PR 3–4。
  - §17 MVP 不含 helper scripts，但 §22 PR 2–3 全部是 helper scripts——如果 PR 2–3 属于 MVP，则 §17 MVP 缺少它们；如果 PR 2–3 不属于 MVP，则 §22 未标注哪些 PR 是 MVP。
  - 两份计划没有交叉引用，也没有说明哪份计划是 authoritative。

---

## 五、流程重叠（Process Overlap）

### F15. T1 与 SDD Slice Lifecycle 双重治理

- **源文档**：§6.7（行 767–773）声明 T1 阶段"实现必须继续遵守 native team 现有 SDD / review / verifier 纪律，并增加 BAF 的技术硬门槛矩阵"。
- **现有仓库**：`skills/team/SKILL.md:222–373` 定义了完整的 SDD Slice Protocol——controller 负责 brief、ledger、review-package、answers.jsonl、commit policy、fix loop、final whole-branch review。
- **重叠**：T1 要求同时满足 SDD 纪律 + BAF 硬门槛矩阵。但文中没有定义两者的裁决优先级——如果 SDD 的 `slice_complete`（ledger event）符合但 `THG-04 E2E runner` 不符合，slice 是完成还是阻塞？如果 SDD `review_clean` 通过但 `THG-11 state owner guard` 失败，谁有最终否决权？
- **风险**：双向治理在没有明确仲裁规则时，会导致 slice 在两个体系中分别得出不同结论。

### F16. BAF Staffing 新增章节与现有 Phase Gates / Verification Evidence 概念重叠

- **源文档**：§4.5（行 294–319）在 `staffing.md` 中新增 5 个章节：
  - `## Business Acceptance First Classification`（行 296）
  - `## Business Sources`（行 304）
  - `## Business Gates`（行 308–310）：列 `Gate | Owner | Input | Output | Pass Condition | Blocks`
  - `## Technical Hard Gates`（行 312–314）：列 `Gate | Owner | Evidence | Required | Blocks Business Acceptance`
  - `## Business Acceptance Evidence`（行 316–318）：列 `Scenario | Business Evidence | Technical Evidence | Reviewer | Score Threshold`
- **现有仓库**：`skills/team/SKILL.md:113–163` 已经要求 `staffing.md` 包含：
  - `## Phase Gates`（行 140–143）：列 `Phase | Owner | Input | Output | Required Gate | Commit Boundary`
  - `## Verification Evidence`（行 158–163）：列命令、证据路径、停止条件
- **重叠分析**：
  - `Business Gates`（BAF）vs `Phase Gates`（现有）：同属 staffing.md 的 gate 概念，但列结构不同（`Pass Condition | Blocks` vs `Required Gate | Commit Boundary`）。staffing.md 中将出现两个 gates 章节，读者需要理解两者的差异和互补关系。
  - `Business Acceptance Evidence`（BAF）vs `Verification Evidence`（现有）：都是证据清单概念。BAF 按 scenario 组织（含业务 + 技术双证据），现有按命令/路径/停止条件组织。两套证据在同一个 staffing.md 中并存。
- **证据核实**：已读 `team/SKILL.md:113–163` 确认章节要求。

---

## 六、角色撞名（Role Name Overlap）

### F17–F20：四个角色名直接复用现有名称

| BAF 角色（§4.4） | 行号 | 现有角色 | 现有位置 | 语义差异 |
|---|---|---|---|---|
| `reviewer`："评审实现是否偏离合同" | 287 | `reviewer`："reviews the implementation for regressions, contract drift, and missing tests" | `team/SKILL.md:195` | BAF 收窄：只看合同偏离；现有 reviewer 看回归 + 合同漂移 + 测试缺失 |
| `verifier`："运行或定义技术与业务验收证据" | 288 | `verifier`："runs or specifies checks and judges whether acceptance criteria are met" | `team/SKILL.md:196` | BAF 增加业务证据维度，但核心语义高度重叠 |
| `evidence-qa`："检查 evidence 是否完整、可复现、可被手册引用" | 289 | `evidence-qa`：作为可选角色，当"task risk justifies them"时添加 | `team/SKILL.md:102–103, 179` | BAF 给了一个精确定义而现有仅提及名称 |
| `business-controller`："总控业务合同、最终整合、release decision" | 279 | orchestrator (main Codex)："owns final synthesis, file integration, and final user reporting" | `team/SKILL.md:27, 233` | BAF 的 `business-controller` 声明的职责（最终整合、release decision）与现有 orchestrator 完全重叠，仅增加了"业务合同"维度 |

- **核心问题**：在同一个 `staffing.md` 中，如果 BAF mode 激活，`reviewer` 是指 SDD reviewer（审查回归+合同漂移+测试缺失）还是 BAF reviewer（仅审查合同偏离）？同一个名词在同一文档中将有两种不同的职责描述。
- **证据核实**：`team/SKILL.md:47,102–103,174,179,195–196` 确认角色名称和定义。

---

## 七、测试覆盖断层（Test Coverage Gap）

### F21. BAF 新增 artifacts 无测试策略

- **现有模式**（已核实）：`workflow/tests/contract.sh`（19690 字节）位于顶层 `workflow/tests/`，与 `contract_team_sdd.sh`、`contract_team_legacy.sh`、`contract_team_native.sh` 同目录。`contract.sh:16` 定义 `pass()`、`:20` 定义 `expect_fail()`——即成功/失败 fixture 模式；`:68–70` 用 `bash -n` 对三个 team 脚本做语法检查，`:71–73` 用 `source` 加载它们。该模式对每个 helper/schema 跑 success+failure fixture。
- **源文档**：§17（行 1723–1802）和 §22（行 2009–2078）只描述"创建什么文件"，未提及任何测试策略。整个 BAF 方案 2136 行中，没有出现 "test fixture"、"contract validation test"、"coverage" 或任何测试覆盖率相关的讨论。
- **断层**：现有测试模式对每个 helper/schema 跑 success+failure fixture；BAF 新增的 10 个 schema + 10 个 validator + 5 个 helper 在 §17 和 §22 中完全未提测试策略，显著低于现有测试覆盖标准。
- **核实状态**：已核实——`workflow/tests/contract.sh` 及 `contract_team_sdd.sh` / `contract_team_legacy.sh` / `contract_team_native.sh` 均存在于顶层 `workflow/tests/`（前次评审误在 `plugins/atlas-workflow/` 下搜索，故未命中）。

---

## 八、方法学注记

F1（命名碰撞）、F9–F11（约定不符）、F6–F8（重复造轮子）三者存在因果链：**BAF 方案引入了一个与现有结构平行的完整子系统**（`contracts/business-acceptance-first/` + `workflow/templates/business-acceptance-first/` + `codex-business-*` 脚本族），而不是在现有 `contracts/team-sdd/` + `codex-team-*` 框架上扩展。三个 finding 类别实际上是同一根本问题的三种症状：

- **命名碰撞**（F1–F5）：如果能复用现有框架，这些名字就不需要重新定义。
- **约定不符**（F9–F11）：如果能按 `team-sdd` 的模式扩展，就不会有新约定。
- **重复造轮子**（F6–F8）：如果 helper/schema/validator 以现有 `codex-team-*` 框架为载体，就不会有独立的新系统。

同时，F13（MVP 范围不一致）+ F14（PR 计划不对齐）+ F16（staffing 章节重叠）之间存在因果链：**方案在 scope 和执行计划上尚未收敛**，因此无法在现有 staffing/artifact/gate 框架上精确定义 BAF 的新增点。

---

## Finding 统计

| 类别 | Finding 编号 | 数量 |
|---|---|---|
| 命名碰撞 | F1–F5 | 5 |
| 重复造轮子 | F6–F8 | 3 |
| 约定不符 | F9–F12 | 4 |
| 范围内部不一致 | F13–F14 | 2 |
| 流程重叠 | F15–F16 | 2 |
| 角色撞名 | F17–F20 | 4 |
| 测试覆盖断层 | F21 | 1 |
| **合计** | | **21** |

---

## 核实记录

| 核实方式 | 涉及 finding |
|---|---|
| `Glob plugins/atlas-workflow/contracts/**/*` + 逐文件 Read（6 个 schema，7 个 validator） | F1, F7, F9, F10, F11 |
| `Glob plugins/atlas-workflow/scripts/codex-team-*`（8 个脚本命中） | F3, F6, F8 |
| `Read codex-team-brief:1–300` | F2, F4, F6, F8 |
| `Read codex-team-workspace:1–101` | F3, F6 |
| `Read codex-team-scorecard:1–30` | F1, F6 |
| `Read codex-team-validate-json:1–30` | F6, F7 |
| `Read team/SKILL.md:1–419`（全文） | F15, F16, F17–F20 |
| `Grep scorecard / evidence.manifest / run_complete / run_failed / contract / staffing` | F1, F2, F4, F5 |
| `Glob workflow/templates/*` + `grep '{{' implementation-contract.md`（6 个扁平模板，含 `{{TASK_ID}}`/`{{TITLE}}`/`{{CREATED}}` 占位） | F12 |
| `ls workflow/tests/` + `sed -n '15,75p' contract.sh`（`contract.sh:16 pass()`、`:20 expect_fail()`、`:68–73 bash -n + source 三个 contract_team_*.sh`） | F21（已核实） |
| 源文档行号对照（逐节阅读 2136 行） | F13, F14 |

**标注"未核实"的点**：无。前次评审误标 F21 的 `contract.sh` / `contract_team_sdd.sh` 为"未在仓库中找到"，系搜索路径错误（误搜 `plugins/atlas-workflow/`），已更正为已核实——文件实存于顶层 `workflow/tests/`。F12 的"独立模板文件尚无先例"亦已更正：顶层 `workflow/templates/` 已有 6 个扁平独立模板，仅嵌套子目录无先例。
