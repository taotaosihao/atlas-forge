# Atlas Native Team 业务验收层实施方案

> 来源方案：`docs/atlas-forge-native-team-business-acceptance-review-revised-plan.md`
> workflow task：`20260707-001-atlas-native-team-business-acceptance-implementation-plan`
> 日期：2026-07-07
> 范围：`atlas-forge` / `plugins/atlas-workflow` / `$atlas-workflow:team` / Codex native team

## 1. 轻量 Review

修订版方向成立。它已经把上一版最危险的“平行 BAF 子系统”改成 native team 的业务验收层，并明确：

- 不新增 `codex-business-*`。
- 不新增 `contracts/business-acceptance-first/`。
- 不新增 `workflow/templates/business-acceptance-first/`。
- 不抢占现有 `scorecard`、`evidence-manifest`、`workspace`、`release decision` 语义。
- 不重定义 `reviewer`、`verifier`、`evidence-qa`。
- 业务 verdict 不替代 SDD ledger 的 `run_complete` / `run_failed`。

仍需执行化修正：

- revised plan 把 `team/SKILL.md` 放在 PR1，但 runtime validators、artifact lint 和 tests 尚未就绪。更稳妥的顺序是先做模板和 contracts，再做 lint guard，最后启用 skill mode。
- 11 个 schema/validator 一次落地过大。需要拆成 pre-implementation artifacts 与 post-implementation artifacts 两批。
- `codex-team-artifact-lint` 目前只检查 SDD tree。business acceptance guard 必须 opt-in，不能改变现有 non-business task 的默认 lint 结果。
- revised plan 使用逻辑路径 `workflow/artifacts/<task-id>/...`，实现必须通过现有 `CODEX_WORKFLOW_ROOT` / `workflowRoot()` 解析实际 root，不能假设 repo 内一定存在 `workflow/artifacts/`。
- 触及 plugin runtime 后，必须同步 `/home/gewu/.codex/plugins/atlas-workflow/` 与 active cache，否则 repo 改动不会被当前 Codex runtime 使用。

本实施方案保留 revised plan 的核心设计，但调整落地顺序。

## 2. 实施目标

把 `$atlas-workflow:team` 从技术实现/评审框架扩展为“技术 hard gate + 业务闭环验收”的 native team 框架。

MVP 完成后应具备：

- `workflow/templates/` 有扁平 business acceptance 模板。
- `contracts/team-sdd/` 有 business JSON schemas 与 JS validators。
- `codex-team-validate-json` 能校验 business JSON types。
- `codex-team-artifact-lint` 可在 opt-in business acceptance mode 下检查业务 artifacts 与 verdict consistency。
- `team/SKILL.md` 能指导 main Codex 在合适任务中启用 BAF mode。
- `workflow/tests/contract.sh` 覆盖新增 validators、registry、lint guard 和 plugin refresh。

## 3. 非目标

- 不实现具体 FMS、PLC、CNC、仓储、调度或客户项目。
- 不改 Multica SDLC。
- 不把 business rating 接入现有 `codex-team-scorecard`。
- 不改变现有 SDD ledger event schema。
- 不让 business acceptance 成为所有 team task 的默认强制 gate。
- 不让 subagents 直接写 workflow artifacts；main Codex 仍是 artifact writer。

## 4. 关键架构决策

| 决策 | 结论 |
| --- | --- |
| Artifact root | 逻辑路径仍写 `workflow/artifacts/<task-id>/team/acceptance/`；实现用 `CODEX_WORKFLOW_ROOT` / `workflowRoot()` 定位实际 root。 |
| Business artifacts | 放在 `team/acceptance/`，不放根级 `business/`。 |
| JSON schemas | 放在 `plugins/atlas-workflow/contracts/team-sdd/business-*.schema.json`。 |
| JS validators | 放在 `plugins/atlas-workflow/contracts/team-sdd/validators/business-*.js`，文件名不加 `validate-` 前缀。 |
| CLI registry | 扩展 `codex-team-validate-json` 的 `TYPES`。 |
| Artifact lint | 扩展 `codex-team-artifact-lint`，新增 opt-in 参数 `--business-acceptance`。 |
| Skill activation | runtime 能验证后再更新 `plugins/atlas-workflow/skills/team/SKILL.md`。 |
| Plugin sync | 每个触及 plugin runtime 的 PR 末尾运行 `scripts/update-atlas-workflow-plugin --contract`。 |

## 5. 文件写集总览

MVP 涉及：

- `workflow/templates/business-*.md`
- `plugins/atlas-workflow/contracts/team-sdd/business-*.schema.json`
- `plugins/atlas-workflow/contracts/team-sdd/validators/business-*.js`
- `plugins/atlas-workflow/contracts/team-sdd/validators/common.js`
- `plugins/atlas-workflow/scripts/codex-team-validate-json`
- `plugins/atlas-workflow/scripts/codex-team-artifact-lint`
- `plugins/atlas-workflow/skills/team/SKILL.md`
- `workflow/tests/contract.sh`
- `workflow/tests/contract_team_business_acceptance.sh`
- `test/fixtures/team-sdd/business-acceptance/valid/*.json`
- `test/fixtures/team-sdd/business-acceptance/invalid/*.json`

增强项涉及：

- `workflow/templates/business-manufacturing-closure-canvas.md`
- `workflow/templates/business-manufacturing-scenario-seed.md`
- 可选扩展 `codex-team-workspace`、`codex-team-brief`、`codex-team-ledger`。

## 6. PR Sequence

### Team Review 修订说明

本计划已按 `20260707-002-review-atlas-native-team-business-acceptance-implementation-plan` 的 native team review 修订。关键结论：

- PR1 可以执行，但必须是 templates-only，不能更新 skill、scripts、contracts、README 或任何 runtime discovery 入口。
- PR3 在修订前存在两个阻塞项：`$TMP_ROOT` 验证命令不可复制执行；未定义能同时满足现有 SDD lint 与 business acceptance lint 的 fixture harness。本版已把这两项改成 PR3 必做内容。
- 技术 hard gate 失败时，不仅禁止 `accepted`，也禁止 `conditionally_accepted`。
- PR2A/PR2B 的 fixture 要从 prose 改成逐 type matrix。
- PR1/PR5 的禁用词验证必须用可靠 pass/fail 命令，不使用裸 `rg` 误判“无命中”为失败。

### PR0：Preflight 与实施合同

目的：确认当前 baseline 可测，避免在破损环境上叠加业务验收层。

文件范围：

- `workflow/artifacts/<task-id>/context.md`
- `workflow/artifacts/<task-id>/spec.md`
- `workflow/artifacts/<task-id>/team/decision.md`
- 每个后续 PR 的 `implementation-contract.md`

验证：

```bash
git status --short
bash workflow/tests/contract.sh
scripts/update-atlas-workflow-plugin --dry-run
```

验收：

- baseline contract tests 可运行。
- 后续每个 PR 都有明确写集、AC、验证命令和停止条件。

### PR1：扁平业务模板

目的：先建立文档 artifact 形态，不启用 runtime 行为。

写入边界：

- 只允许新增 `workflow/templates/business-*.md`。
- 不修改 `plugins/atlas-workflow/skills/team/SKILL.md`。
- 不修改 `plugins/atlas-workflow/scripts/*`。
- 不修改 `plugins/atlas-workflow/contracts/*`。
- 不修改 `plugins/atlas-workflow/README.md` 中任何会声明 BAF mode 可运行的入口。
- 不注册、不启用、不引用任何 runtime 行为。

新增文件：

- `workflow/templates/business-intent.md`
- `workflow/templates/business-source-coverage.md`
- `workflow/templates/business-thread-map.md`
- `workflow/templates/business-object-state-model.md`
- `workflow/templates/business-action-rulebook.md`
- `workflow/templates/business-scenario-card.md`
- `workflow/templates/business-evidence-map.md`
- `workflow/templates/business-playback.md`
- `workflow/templates/business-acceptance-report.md`
- `workflow/templates/business-deviation-log.md`
- `workflow/templates/business-regression-scenario.md`
- `workflow/templates/business-verdict.md`

模板要求：

- 每个模板必须包含 `{{TASK_ID}}` 与 `{{CREATED}}`。
- `business-scenario-card.md`、`business-playback.md`、`business-regression-scenario.md` 必须包含 `{{SCENARIO_ID}}`。
- 可按模板需要使用 `{{TITLE}}`、`{{SLICE_ID}}` 等补充变量。
- 每个模板必须包含实质字段，不能只有标题。
- 不新增嵌套目录。
- 不出现 `scorecard`、`evidence-manifest` 作为业务 artifact 名。

验证：

```bash
test ! -d workflow/templates/business-acceptance-first
test "$(find workflow/templates -maxdepth 1 -name 'business-*.md' | wc -l | tr -d ' ')" = "12"
node <<'NODE'
const fs = require("fs");
const path = require("path");
const dir = path.join(process.cwd(), "workflow", "templates");
const files = fs.readdirSync(dir).filter((file) => /^business-.*\.md$/.test(file)).sort();
if (files.length !== 12) throw new Error(`expected 12 business templates, got ${files.length}`);
for (const file of files) {
  const text = fs.readFileSync(path.join(dir, file), "utf8");
  if (!text.includes("{{TASK_ID}}")) {
    throw new Error(`${file}: missing {{TASK_ID}}`);
  }
  if (!text.includes("{{CREATED}}")) {
    throw new Error(`${file}: missing {{CREATED}}`);
  }
  if (/^(business-scenario-card|business-playback|business-regression-scenario)\.md$/.test(file) && !text.includes("{{SCENARIO_ID}}")) {
    throw new Error(`${file}: missing {{SCENARIO_ID}}`);
  }
  const substantive = text.split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !/^[-|: ]+$/.test(line));
  if (substantive.length < 6) throw new Error(`${file}: not enough substantive fields`);
}
NODE
! rg -n 'acceptance-scorecard|evidence-manifest|codex-business' workflow/templates/business-*.md
bash workflow/tests/contract.sh
scripts/update-atlas-workflow-plugin --dry-run
```

验收：

- 12 个扁平模板存在。
- 每个模板含 `{{TASK_ID}}` 与 `{{CREATED}}`，场景类模板含 `{{SCENARIO_ID}}`，并有实质字段，不是标题空壳。
- 禁用业务 artifact 名不出现：`acceptance-scorecard`、`evidence-manifest`、`codex-business`。
- `scripts/update-atlas-workflow-plugin --contract` 不作为 PR1 必跑项；PR1 不触及 plugin runtime，只做 `--dry-run`。

### PR2A：Pre-implementation business schemas 与 validators

目的：让进入实现前必须冻结的业务建模 artifacts 可被机器校验。

新增 schema：

- `business-intent.schema.json`
- `business-source-coverage.schema.json`
- `business-thread-map.schema.json`
- `business-object-state-model.schema.json`
- `business-action-rulebook.schema.json`
- `business-scenario-card.schema.json`

新增 validator：

- `validators/business-intent.js`
- `validators/business-source-coverage.js`
- `validators/business-thread-map.js`
- `validators/business-object-state-model.js`
- `validators/business-action-rulebook.js`
- `validators/business-scenario-card.js`

修改：

- `validators/common.js` 可增加小型通用 helper，例如 `expectObjectArray`，仅在至少两个 business validators 复用时添加。
- `scripts/codex-team-validate-json` 注册上述 6 个 `--type`。

Fixture：

每种 type 必须有独立 valid fixture 和至少 4 类 invalid fixture。最小矩阵：

| Type | Valid fixture | Missing schema_version | Missing task_id | Missing type-specific required | Unknown property |
| --- | --- | --- | --- | --- | --- |
| `business-intent` | `valid/business-intent.json` | `invalid/missing-schema-version.business-intent.json` | `invalid/missing-task-id.business-intent.json` | `invalid/missing-business-goal.business-intent.json` | `invalid/unknown-property.business-intent.json` |
| `business-source-coverage` | `valid/business-source-coverage.json` | `invalid/missing-schema-version.business-source-coverage.json` | `invalid/missing-task-id.business-source-coverage.json` | `invalid/missing-sources.business-source-coverage.json` | `invalid/unknown-property.business-source-coverage.json` |
| `business-thread-map` | `valid/business-thread-map.json` | `invalid/missing-schema-version.business-thread-map.json` | `invalid/missing-task-id.business-thread-map.json` | `invalid/missing-threads.business-thread-map.json` | `invalid/unknown-property.business-thread-map.json` |
| `business-object-state-model` | `valid/business-object-state-model.json` | `invalid/missing-schema-version.business-object-state-model.json` | `invalid/missing-task-id.business-object-state-model.json` | `invalid/missing-objects.business-object-state-model.json` | `invalid/unknown-property.business-object-state-model.json` |
| `business-action-rulebook` | `valid/business-action-rulebook.json` | `invalid/missing-schema-version.business-action-rulebook.json` | `invalid/missing-task-id.business-action-rulebook.json` | `invalid/missing-actions.business-action-rulebook.json` | `invalid/unknown-property.business-action-rulebook.json` |
| `business-scenario-card` | `valid/business-scenario-card.json` | `invalid/missing-schema-version.business-scenario-card.json` | `invalid/missing-task-id.business-scenario-card.json` | `invalid/missing-scenario-id.business-scenario-card.json` | `invalid/unknown-property.business-scenario-card.json` |

MVP 的 `codex-team-validate-json` business types 只承诺 `--file` 输入。`--from-message` / `--stdin` 支持不属于 PR2A；若后续要支持，必须先定义稳定 labels，例如 `BUSINESS_INTENT_JSON`、`BUSINESS_SCENARIO_CARD_JSON`。

验证：

```bash
node --check plugins/atlas-workflow/scripts/codex-team-validate-json
for f in plugins/atlas-workflow/contracts/team-sdd/validators/business-*.js; do node --check "$f"; done
node plugins/atlas-workflow/scripts/codex-team-validate-json --type business-intent --file test/fixtures/team-sdd/business-acceptance/valid/business-intent.json
node plugins/atlas-workflow/scripts/codex-team-validate-json --type business-scenario-card --file test/fixtures/team-sdd/business-acceptance/valid/business-scenario-card.json
node plugins/atlas-workflow/scripts/codex-team-validate-json --help | rg 'business-intent|business-source-coverage|business-thread-map|business-object-state-model|business-action-rulebook|business-scenario-card'
bash workflow/tests/contract.sh
scripts/update-atlas-workflow-plugin --contract
```

验收：

- 每个新增 schema required `schema_version` 与 `task_id`。
- `business-scenario-card` additionally required `scenario_id`。
- unknown additional property 被拒绝。
- `codex-team-validate-json --help` 包含新增 types。
- `--from-message` / `--stdin` 未声明支持 business types 时不得作为验收路径。

### PR2B：Post-implementation business schemas 与 validators

目的：让回放、证据映射、验收报告、偏差和 verdict 可被机器校验。

新增 schema：

- `business-evidence-map.schema.json`
- `business-acceptance-report.schema.json`
- `business-deviation-log.schema.json`
- `business-regression-scenario.schema.json`
- `business-verdict.schema.json`

新增 validator：

- `validators/business-evidence-map.js`
- `validators/business-acceptance-report.js`
- `validators/business-deviation-log.js`
- `validators/business-regression-scenario.js`
- `validators/business-verdict.js`

修改：

- `scripts/codex-team-validate-json` 注册上述 5 个 `--type`。

重点规则：

- `business-acceptance-report.rating.level` 只允许 `accepted`、`conditionally_accepted`、`rejected`、`blocked`。
- `business-verdict.verdict` 与上述枚举一致。
- `business-verdict.technical_gate_status=failed|blocked` 时，单文件 validator 可允许该 JSON 存在，但 PR3 的 artifact lint 必须禁止 `verdict=accepted|conditionally_accepted`。
- `business-deviation-log` 如采用 JSONL，单文件 schema 只定义单行 event；lint 负责逐行读取。

Fixture matrix：

| Type | Valid fixture | Missing schema_version | Missing task_id | Type-specific failure | Unknown property |
| --- | --- | --- | --- | --- | --- |
| `business-evidence-map` | `valid/business-evidence-map.json` | `invalid/missing-schema-version.business-evidence-map.json` | `invalid/missing-task-id.business-evidence-map.json` | `invalid/missing-evidence-refs.business-evidence-map.json` | `invalid/unknown-property.business-evidence-map.json` |
| `business-acceptance-report` | `valid/business-acceptance-report.json` | `invalid/missing-schema-version.business-acceptance-report.json` | `invalid/missing-task-id.business-acceptance-report.json` | `invalid/invalid-rating-level.business-acceptance-report.json` | `invalid/unknown-property.business-acceptance-report.json` |
| `business-deviation-log` | `valid/business-deviation-log-entry.json` | `invalid/missing-schema-version.business-deviation-log-entry.json` | `invalid/missing-task-id.business-deviation-log-entry.json` | `invalid/missing-deviation-type.business-deviation-log-entry.json` | `invalid/unknown-property.business-deviation-log-entry.json` |
| `business-regression-scenario` | `valid/business-regression-scenario.json` | `invalid/missing-schema-version.business-regression-scenario.json` | `invalid/missing-task-id.business-regression-scenario.json` | `invalid/missing-scenario-id.business-regression-scenario.json` | `invalid/unknown-property.business-regression-scenario.json` |
| `business-verdict` | `valid/business-verdict.accepted.json` and `valid/business-verdict.blocked.json` | `invalid/missing-schema-version.business-verdict.json` | `invalid/missing-task-id.business-verdict.json` | `invalid/invalid-verdict.business-verdict.json` | `invalid/unknown-property.business-verdict.json` |

Cross-artifact semantics reserved for PR3 fixtures:

- `business-evidence-map` local evidence path exists / missing.
- external/manual evidence has explicit `source_type`.
- `business-verdict.verdict=accepted|conditionally_accepted` with `technical_gate_status=failed|blocked` fails in artifact lint.
- `business-acceptance-report.rating.blocking_technical_gate_failed=true` with accepted/conditional verdict fails in artifact lint.
- invalid JSONL line in `business-deviation-log.jsonl` fails in artifact lint.

MVP 的 post business types 也只承诺 `--file` 输入；message extraction labels 留到后续增强。

验证：

```bash
for f in plugins/atlas-workflow/contracts/team-sdd/validators/business-*.js; do node --check "$f"; done
node plugins/atlas-workflow/scripts/codex-team-validate-json --type business-evidence-map --file test/fixtures/team-sdd/business-acceptance/valid/business-evidence-map.json
node plugins/atlas-workflow/scripts/codex-team-validate-json --type business-acceptance-report --file test/fixtures/team-sdd/business-acceptance/valid/business-acceptance-report.json
node plugins/atlas-workflow/scripts/codex-team-validate-json --type business-verdict --file test/fixtures/team-sdd/business-acceptance/valid/business-verdict.accepted.json
node plugins/atlas-workflow/scripts/codex-team-validate-json --help | rg 'business-evidence-map|business-acceptance-report|business-deviation-log|business-regression-scenario|business-verdict'
bash workflow/tests/contract.sh
scripts/update-atlas-workflow-plugin --contract
```

验收：

- 5 个 post artifacts 可校验。
- failure fixtures 覆盖 missing `schema_version`、missing `task_id`、unknown property、非法 verdict/rating level。

### PR3：Business acceptance artifact lint 与 verdict guard

目的：建立跨文件验收规则，而不是只校验单个 JSON shape。

修改文件：

- `plugins/atlas-workflow/scripts/codex-team-artifact-lint`
- `workflow/tests/contract_team_business_acceptance.sh`
- `workflow/tests/contract.sh`

CLI 设计：

```bash
codex-team-artifact-lint --task <task-id> --business-acceptance
codex-team-artifact-lint --task <task-id> --strict --business-acceptance
```

向后兼容要求：

- 不传 `--business-acceptance` 时，现有 SDD lint 行为不变。
- 传 `--business-acceptance` 时，除现有 SDD checks 外，再检查 `team/acceptance/`。
- MVP 中 `--business-acceptance` 的语义是 **SDD + acceptance**，不是 business-only lint。业务 verdict 只能在现有 `team/sdd` artifact tree 存在且可 lint 后产生。

Business checks：

- missing `team/acceptance/business-intent.json` fails。
- missing at least one `scenarios/business-scenario-card.*.json` fails。
- `business-verdict.json` 存在且 verdict 为 `accepted` / `conditionally_accepted` 时，必须存在 `business-evidence-map.json` 与 `business-acceptance-report.json`。
- `technical_gate_status=failed|blocked` 时，`verdict=accepted|conditionally_accepted` fails。
- `business-acceptance-report.rating.blocking_technical_gate_failed=true` 时，`verdict=accepted|conditionally_accepted` fails。
- evidence map 引用的本地 evidence path 必须存在。
- local evidence path 只能是 artifact-root-relative path，解析根为 `workflowRoot()/artifacts/<task-id>`；禁止 absolute path 与 `..` path traversal。
- 外部 URL 或手工证据必须显式标记 `source_type=external|manual`，并提供 `description`。
- JSONL deviation log 必须逐行合法。

Test harness 要求：

`workflow/tests/contract_team_business_acceptance.sh` 由 `workflow/tests/contract.sh` source，不能独立依赖用户 shell 中的 `$TMP_ROOT`。该测试文件必须至少提供两个 helper：

```bash
write_sdd_lint_fixture <task-id>
write_business_acceptance_fixture <task-id> <accepted|conditional|rejected|blocked|missing-intent|missing-scenario|missing-evidence-map|failed-technical-gate>
```

`write_sdd_lint_fixture` 必须创建能通过现有 `codex-team-artifact-lint --task <task-id>` 的最小 SDD artifact tree，包括：

```text
$CODEX_WORKFLOW_ROOT/artifacts/<task-id>/team/sdd/progress.jsonl
$CODEX_WORKFLOW_ROOT/artifacts/<task-id>/team/sdd/slices/<slice-id>/brief.json
```

如 fixture 包含 `review-verdict.json`，必须同时创建 `review-package.diff`，避免被现有 SDD lint 拦截。business acceptance happy path 必须先通过 existing SDD lint，再通过 `--business-acceptance` lint。

验证：

```bash
bash -n workflow/tests/contract_team_business_acceptance.sh
bash workflow/tests/contract.sh
scripts/update-atlas-workflow-plugin --contract
```

验收：

- `accepted` happy path fixture 通过。
- missing intent、missing scenario card、missing evidence map、failed technical gate + accepted verdict 均失败。
- failed/blocked technical gate + `conditionally_accepted` verdict 也失败。
- default artifact lint 对旧 fixture 不新增 business requirement。
- `contract.sh` source `workflow/tests/contract_team_business_acceptance.sh`，并覆盖 syntax + success/failure fixtures。

### PR4：`team/SKILL.md` 接入 BAF mode

目的：在 runtime 已可验证后，正式让 `$atlas-workflow:team` 暴露业务验收模式。

修改文件：

- `plugins/atlas-workflow/skills/team/SKILL.md`
- 必要时更新 `plugins/atlas-workflow/README.md`

插入位置：

- 在 `Shared Artifact Contract` 之后或 `Native Agent Planning` 之前添加 `Business Acceptance First Mode`。
- 不覆盖现有 role 语义。
- 不新增独立 staffing 章节；要求把业务 gate 写入现有 `Phase Gates`，业务证据写入现有 `Verification Evidence`。

必须写清：

- activation conditions。
- required artifacts before implementation。
- required artifacts before business verdict。
- technical hard gates 一票否决。
- verdict 与 SDD ledger 的分层关系。
- main Codex 是唯一 workflow artifact writer。

验证：

```bash
rg -n 'Business Acceptance First Mode|business-verdict|team/acceptance' plugins/atlas-workflow/skills/team/SKILL.md
rg -n 'Business Gates|Business Acceptance Evidence|business-controller' plugins/atlas-workflow/skills/team/SKILL.md
bash workflow/tests/contract.sh
scripts/update-atlas-workflow-plugin --contract
```

验收：

- `team/SKILL.md` 不重定义 `reviewer`、`verifier`、`evidence-qa`。
- skill 不要求用户运行不存在的 helper。
- 本地 plugin source 与 active cache 已同步。

### PR5：制造业通用 canvas 与 seed examples

目的：把制造业偏置做成可选模板，而不是把 FMS 细节写进核心框架。

新增文件：

- `workflow/templates/business-manufacturing-closure-canvas.md`
- `workflow/templates/business-manufacturing-scenario-seed.md`

内容要求：

- 覆盖 `order-to-plan`、`plan-to-dispatch`、`material-to-line`、`operation-to-report`、`quality-to-release`、`exception-to-recovery`、`trace-to-audit`。
- 不出现具体客户、FMS、PLC、CNC 专项字段作为必填。
- seed 可被人工转成 `business-scenario-card`。

验证：

```bash
rg -n 'order-to-plan|plan-to-dispatch|material-to-line|operation-to-report|quality-to-release|exception-to-recovery|trace-to-audit' workflow/templates/business-manufacturing-*.md
! rg -n 'required.*(FMS|PLC|CNC)|(FMS|PLC|CNC).*required|必填.*(FMS|PLC|CNC)|(FMS|PLC|CNC).*必填' workflow/templates/business-manufacturing-*.md
bash workflow/tests/contract.sh
```

验收：

- 制造业模板保持通用，不绑定客户实现。

### PR6：可选 ergonomics

该 PR 不属于 MVP。只有当前 4 个 PR 被真实使用后，再决定是否实施。

候选增强：

- `codex-team-workspace --print acceptance` 或等价输出，创建 `team/acceptance/`。
- `codex-team-brief` 支持 `--business-acceptance-ref`，把 business scenario refs 写入 SDD brief。
- `codex-team-ledger` metadata 记录 `business-verdict` path，但不改变 ledger event semantics。

停止条件：

- 如果增强需要新增 `codex-business-*`，停止。
- 如果增强需要改变 `scorecard` 或 `evidence-manifest` 语义，停止。

## 7. Validator 实现规则

JS validators 是实际 enforcement，JSON schema 是结构文档与 fixture 参考。每个 validator 必须：

- `requireObject(value, errors)`。
- `requireKeys(value, KEYS, errors)`。
- `rejectUnknownKeys(value, KEYS, errors)`。
- 检查 `schema_version === 1`。
- 对 `task_id`、`scenario_id`、`slice_id` 使用 safe id。
- 对 enum 字段使用 `expectEnum`。
- 对数组字段使用已有 helper；只有重复需求出现时才扩展 `common.js`。

不要引入外部 npm dependency。

## 8. Fixture 目录规范

建议目录：

```text
test/fixtures/team-sdd/business-acceptance/
  valid/
    business-intent.json
    business-source-coverage.json
    business-thread-map.json
    business-object-state-model.json
    business-action-rulebook.json
    business-scenario-card.json
    business-evidence-map.json
    business-acceptance-report.json
    business-deviation-log-entry.json
    business-regression-scenario.json
    business-verdict.accepted.json
    business-verdict.blocked.json
  invalid/
    missing-schema-version.business-intent.json
    missing-task-id.business-intent.json
    missing-business-goal.business-intent.json
    unknown-property.business-intent.json
    ...
    missing-scenario-id.business-scenario-card.json
    invalid-verdict.business-verdict.json
    accepted-with-failed-technical-gate.business-verdict.json
    conditionally-accepted-with-failed-technical-gate.business-verdict.json
```

规则：

- `valid/` 必须覆盖所有 business JSON types。
- `invalid/` 必须按 PR2A/PR2B matrix 覆盖每个 type 的 missing `schema_version`、missing `task_id`、type-specific required 缺失和 unknown property。
- 跨文件 lint fixtures 不放入 repo 静态目录；由 `contract_team_business_acceptance.sh` 动态创建到 `contract.sh` 提供的 `$TMP_ROOT` / `$CODEX_WORKFLOW_ROOT` 中。
- `contract_team_business_acceptance.sh` 必须由顶层 `workflow/tests/contract.sh` source；不要设计成独立可运行脚本。

## 9. 后续每个 PR 的通用验证门槛

每个 PR 最少运行：

```bash
git status --short
node --check <changed-js-files>
bash workflow/tests/contract.sh
scripts/update-atlas-workflow-plugin --contract
```

触及 only docs/templates 且不触及 plugin runtime 时，`scripts/update-atlas-workflow-plugin --contract` 可换成：

```bash
scripts/update-atlas-workflow-plugin --dry-run
```

触及 `plugins/atlas-workflow/skills/team/SKILL.md` 时必须额外确认：

```bash
cmp plugins/atlas-workflow/skills/team/SKILL.md /home/gewu/.codex/plugins/atlas-workflow/skills/team/SKILL.md
cache_root="$(find /home/gewu/.codex/plugins/cache/atlas-forge/atlas-workflow -mindepth 1 -maxdepth 1 -type d | sort -V | tail -1)"
test -n "$cache_root"
cmp /home/gewu/.codex/plugins/atlas-workflow/skills/team/SKILL.md "$cache_root/skills/team/SKILL.md"
```

如果 active cache version 变化，以上动态 `cache_root` 取最新目录，不硬编码版本号。

## 10. 停止条件

实现过程中出现以下情况必须暂停回到方案层：

- 需要新增 `codex-business-*` 才能完成。
- 需要改变现有 `scorecard`、`evidence-manifest`、`run_complete`、`run_failed` 语义。
- `codex-team-artifact-lint --business-acceptance` 无法做到默认向后兼容。
- business artifact root 无法通过 `CODEX_WORKFLOW_ROOT` / `workflowRoot()` 正确解析。
- 任一新增 JSON type 无法写出 success + failure fixtures。
- `scripts/update-atlas-workflow-plugin --contract` 失败，或 repo source、local source、active cache 不一致。
- `team/SKILL.md` 的 BAF mode 要求运行尚未实现的 helper 或引用不存在的 artifact。

## 11. 建议的下一步

PR1 已拆成单独 implementation contract：

- `/home/gewu/work/atlas-forge/docs/atlas-workflow/20260707-003-business-acceptance-pr1-implementation-contract.md`

下一步按该 contract 只实施 `workflow/templates/business-*.md`，不改 skill、不改 validators、不改 artifact lint。PR1 验收通过后再进入 PR2A。这样每一步都有单独可 review、可回滚、可验证的边界。
