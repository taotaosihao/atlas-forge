# Business Acceptance Implementation Plan Team Review

> task_id: `20260707-002-review-atlas-native-team-business-acceptance-implementation-plan`
> reviewed: `docs/atlas-workflow/20260707-001-atlas-native-team-business-acceptance-implementation-plan.md`
> backend: native
> verdict: conditional go for PR1 only; no-go for full PR1-PR4 execution as written

## 结论

实施方案的总体方向正确：它把 BAF 从平行子系统收回到 native team / `team-sdd` / `codex-team-*` 体系内，避免了上一版最严重的命名碰撞和重复造轮子问题。

但当前文档不能直接作为完整 PR1-PR4 execution contract。两个阻塞问题都集中在 PR3：验证命令不可复制执行，且没有定义能通过现有 SDD lint 的 business acceptance fixture harness。

因此本轮 team review 的判断是：

- PR1 可以有条件执行，但必须保持 templates-only。
- PR2A/PR2B/PR3/PR4 之前应先修订计划或在各自 implementation contract 中补齐本 review 的阻塞项和重要项。

## Blocker

### B1. PR3 的 `$TMP_ROOT` 验证命令不可复制执行

证据：

- `docs/atlas-workflow/20260707-001-atlas-native-team-business-acceptance-implementation-plan.md:285-289` 使用 `CODEX_WORKFLOW_ROOT="$TMP_ROOT/business-workflow" ...`。
- `workflow/tests/contract.sh:8-9` 才创建并导出 `TMP_ROOT` / `CODEX_WORKFLOW_ROOT`。

影响：

- 该命令不是普通 shell 下可执行的验收命令。
- 如果实现者照抄，可能指向错误路径并在没有 fixture 的情况下失败。

修正要求：

- 把该验证改成 `contract_team_business_acceptance.sh` 内部 fixture，由 `bash workflow/tests/contract.sh` 覆盖。
- 或写成完全自包含命令：创建 `TMP_ROOT`、创建 SDD + acceptance fixture tree，再调用 lint。

### B2. PR3 未定义可通过现有 SDD lint 的 fixture harness

证据：

- `plugins/atlas-workflow/scripts/codex-team-artifact-lint:225-240` 现有 lint 会先要求 `team/sdd` 和 `team/sdd/slices`。
- 实施方案要求 `--business-acceptance` 在现有 SDD checks 外再检查 `team/acceptance/`，但没有说明 happy path fixture 如何生成合法 SDD tree。

影响：

- business acceptance happy path 可能先死在 missing `team/sdd`。
- 实现者可能误把 `--business-acceptance` 做成 business-only lint，破坏“技术 hard gate 是业务验收前置”的设计。

修正要求：

- PR3 计划中增加 `write_sdd_lint_fixture <task>` 与 `write_business_acceptance_fixture <task> <mode>` 之类测试 helper。
- 明确 MVP `--business-acceptance` 的语义是 `SDD + acceptance`，不是 business-only。

## Important

### I1. `conditionally_accepted` 也必须受 technical hard gate 一票否决

当前计划只明确技术失败时禁止 `accepted`，没有同等禁止 `conditionally_accepted`。这会让 failed/blocked technical gate 被业务条件通过绕开。

修正要求：

- `technical_gate_status=failed|blocked` 时禁止 `business-verdict.verdict=accepted|conditionally_accepted`。
- `business-acceptance-report.rating.blocking_technical_gate_failed=true` 时也禁止 `accepted|conditionally_accepted`。
- 增加对应 failure fixtures。

### I2. PR2A/PR2B 需要逐 type fixture matrix

PR2A 只点名两个 valid fixtures，却计划新增 6 个 pre-implementation types。PR2B 的 5 个 post types 差异更大，也需要逐项覆盖。

修正要求：

每个 JSON type 至少列出：

- minimum valid fixture
- missing `schema_version`
- missing `task_id`
- missing type-specific required field
- unknown property
- type-specific enum/path/reference failure

### I3. PR1 validation 不能证明模板质量

当前 PR1 validation 只列文件、跑禁用词 grep、跑 contract，不能证明：

- 模板数量正好 12 个；
- 每个模板含实质字段；
- 模板不是标题空壳；
- forbidden terms 检查不会因 `rg` exit code 误报。

修正要求：

- 断言 `workflow/templates/business-*.md` 数量正好 12。
- 增加模板 substance check：至少包含模板变量、多个非标题字段行、无空壳模板。
- 用 `! rg` 或更精确 pattern 表达“禁止出现”。

### I4. Evidence path 解析根未定义

PR3 要求 `business-evidence-map.json` 引用的本地 evidence path 必须存在，但没有说明路径基准。

修正要求：

- 明确 local evidence path 是 artifact-root-relative、task-root-relative、repo-relative 还是 absolute。
- 禁止 path traversal。
- external/manual evidence 必须显式标记 `source_type=external|manual` 并提供说明字段。

### I5. Business JSON type 是否支持 `--from-message` 尚未定义

当前 `codex-team-validate-json` 支持从 message 中提取 labeled JSON block。计划只展示 business types 的 `--file` 用法。

修正要求：

- MVP 明确 business types 只支持 `--file`。
- 或为每个 business type 定义稳定 label，例如 `BUSINESS_INTENT_JSON`、`BUSINESS_VERDICT_JSON`。

## Minor

- PR5 的 `rg 'FMS|PLC|CNC'` 过粗，可能误伤“不得绑定这些专项字段”的说明语境。
- 固定 active cache version 的 `cmp` 示例容易过期，应改成动态 latest cache lookup。
- PR2A/PR2B 的 `node --check` 应覆盖所有新增 `business-*.js` validators。
- `codex-team-validate-json --help` 包含新增 types 是验收项，但验证命令缺少相应 grep。

## PR1 可执行边界

PR1 可以推进，但只在以下边界内：

- 只新增 `workflow/templates/business-*.md`。
- 不修改 `plugins/atlas-workflow/skills/team/SKILL.md`。
- 不修改 `plugins/atlas-workflow/scripts/*`。
- 不修改 `plugins/atlas-workflow/README.md` 中任何会宣称 BAF mode 可运行的入口。
- implementation contract 必须加入模板数量、模板实质内容、禁用词可靠检查。

## 建议下一步

优先选一条：

1. 先修订 `docs/atlas-workflow/20260707-001-atlas-native-team-business-acceptance-implementation-plan.md`，把上述 Blocker 和 Important 全部写入计划，再进入 PR1。
2. 如果要尽快动手，则只做 PR1 templates-only，并在 PR1 implementation contract 中显式记录本 review 的 PR1 gate；PR2A 之前再修订整份计划。
