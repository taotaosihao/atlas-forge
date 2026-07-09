# Claude Sonnet 5 Max Advisor Review

workflow_id: 20260709-034-big-screen-ui-vertical-slice-workflow-correction-review
task_id: 20260709-034-big-screen-ui-vertical-slice-workflow-correction-review
reviewer: Claude Sonnet 5 max advisor
provider: claude/claude-sonnet-5
thinking: max
agent_ids:
- 6e272bd3-cb17-4fdc-a701-dd5607f290e8
- c3145948-4dfa-44c1-865b-96dc7aa13ffb
date: 2026-07-09
scope: atlas-workflow UI vertical slice gate correction

## Verdict

当前文档和权威合同可以作为第一批 implementation patch 的需求输入，但不能原样进入实现。进入实现前必须先修复
durable evidence index，并收紧 ordering rule 与 negative evidence guard 的语义边界。

## 阻断问题

`contract-index.md` 中的 `evidence_index: none` 会导致 `codex-contract-index-lint` 失败：

```text
contract_index_lint: false
supporting evidence path must point to a durable file: evidence_index
EXIT_CODE=1
```

这与本次修正的核心原则冲突：workflow 不能用非 durable 或 synthetic 证据冒充 acceptance。修正方案应将
`evidence_index` 指向真实存在的 evidence index 文件。

## 必须修正的语义风险

### Ordering Rule

当前 ordering rule 容易被误读成安全 gate 可以为了 UI 让路。修正后应区分两种关系：

- UI thin slice 必须先于 release、perf、soak、phase evidence expansion。
- UI thin slice 与 required hard safety gates 必须共同满足；任何一方缺失都不能通过 acceptance。

`not an open-ended prerequisite` 只能表示 safety gates 不得无限期阻塞 UI slice；它绝不表示可以跳过、削弱或上线后补
`no-data-plane-direct`、`no-cloud-runtime`、Provider credential/browser boundary 等 hard gates。

### Negative Evidence Guard

Negative evidence guard 应按证据声明用途生效：

- 证据若声明用于 UI/product acceptance，synthetic/headless-only evidence 不合格。
- 证据若声明用于 safety-gate acceptance，headless model、network capture、allowlist capture 可以继续作为合法安全证据。
- 真实 served UI 会话中产生的 network assertions 可以同时支持 UI evidence 和 safety evidence。
- 纯 safety evidence 不能扩大解释为 UI evidence。

同时应增加反向 guard：served UI 已存在但 hard safety gate evidence 缺失或过期时，仍不能通过 acceptance。

### Contract Test Scope

第一批 guidance/template/contract-test 应明确只验证关键文本和结构存在，不声明已经实现完整 semantic evidence scanner。
第二阶段再把 evidence-purpose 标注、semantic lint、schema enforcement 做成机器强制。

## BAF 边界

UI gate 与 BAF 的互补关系需要写清楚，但第一批不能重写现有 BAF dirty changes。推荐第一批将该关系写入独立
UI-gate guidance、team skill、contract 和 checklist；后续若补 BAF 模板，应作为保留现有内容的增量改动，并单独跑
BAF contract tests。

## Recommendation

修正顺序：

1. 修复 `contract-index.md` 的 `evidence_index` 并跑通 `codex-contract-index-lint`。
2. 重写 ordering rule，将 UI/evidence expansion 的先后关系与 UI/safety gate 的共同满足关系分开。
3. 修正 negative evidence guard 的适用范围，并增加 served UI 不替代 hard safety gate evidence 的反向 guard。
4. 明确第一批 contract-test 是结构/关键文本 guard，semantic evidence scanner 属于第二阶段。

完成以上修正后，文档包可以作为第一批 implementation patch 的输入。
