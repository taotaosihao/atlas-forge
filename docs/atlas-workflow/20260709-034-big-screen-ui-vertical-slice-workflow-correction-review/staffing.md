# Staffing

- backend: native
- task_id: 20260709-034-big-screen-ui-vertical-slice-workflow-correction-review
- artifact_category: durable handoff

## Agent Plan

| Role | Agent Type | Count | Read/Write | Owned Scope | Deliverable |
| --- | --- | --- | --- | --- | --- |
| workflow-architect | explorer | 1 | read-only | atlas-workflow skill/template rules | 规则落点与最小动面 |
| product-acceptance-critic | explorer | 1 | read-only | 用户验收与 BAF 缺口 | UI acceptance 触发/阻断/证据定义 |
| implementation-verifier | explorer | 1 | read-only | 测试、cache、未提交改动风险 | 验证命令和改动风险 |

## Execution Staffing

若进入 execute patch，建议 main Codex 直接集成；不需要并行 writable workers。原因是第一批改动横跨少量 skill/template/test 文本，写集合互相耦合，单 owner 更安全。

建议只在 patch 完成后增加一个只读 reviewer/verifier：

| Role | When Active | Scope | Gate |
| --- | --- | --- | --- |
| workflow reviewer | guidance patch 完成后 | skill/template 语义、tiny exception、BAF 边界 | review findings none/accepted |
| verifier | cache refresh 后 | `git diff --check`、`bash workflow/tests/contract.sh`、`cmp` | all pass |

## Phase Gates

| Phase | Owner | Input | Output | Required Gate | Commit Boundary |
| --- | --- | --- | --- | --- | --- |
| guidance patch | Main Codex | team decision | skill/template/test patch | `git diff --check`、`bash workflow/tests/contract.sh`、cache `cmp` | one keeper commit |
| executable lint follow-up | future | guidance patch usage | schema/lint/fixtures | compatibility decision + business tests | separate commit |

## Verification Evidence

- Commands:
  - `git diff --check`
  - `bash workflow/tests/contract.sh`
  - `codex-refresh-local-plugin atlas-workflow`
  - `cmp` repo skill/source skill/cache skill
- Stop conditions:
  - patch weakens safety hard gates;
  - patch overwrites existing BAF diff;
  - product/UI gate becomes optional reminder only;
  - cache cannot be synchronized.
