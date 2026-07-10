# Phase 2A 结论：JS task repository 只读切片

workflow_id: 20260710-001-atlas-forge-js-first-self-use-workflow-replan
implementation_task: 20260710-007-atlas-forge-js-first-task-list-show-phase-2
phase_status: implemented
created: 2026-07-10

## Keeper outcome

- 新增 `repository.js`，统一 task header parse、required/duplicate/id/status validation、cutoff filter 和 known task lookup。
- 新增 `task/cli.js`，承载 `list/show` 参数、stdout/stderr 和退出码。
- `codex-workflow list/show` 已委托到 JS；删除 list-only Bash helpers、内嵌 Python 和 legacy command handlers。
- `start/done/ready/learn` 继续使用原 Bash validator/writer，本 slice 没有修改 task 状态或文件 schema。

## 兼容性

- 默认 7 天、`--all`、`--days N`、`--days=N` 语义保持。
- malformed header、unknown task、usage 和 invalid-days 文本保持。
- `show` 验证后输出原 Buffer，不补换行或重新编码。
- list 通过 Node `child_process` 调用既有 GNU `sort -V`，保留 exact version ordering，不引入近似 comparator。
- 只过滤 cutoff 之前的 `done`；todo/doing 和非标准日期 ID 继续显示。

## 变更路径

- `workflow/bin/codex-workflow`
- `workflow/bin/lib/codex-workflow/task/repository.js`
- `workflow/bin/lib/codex-workflow/task/cli.js`
- `workflow/tests/js/task-repository.test.js`
- `workflow/tests/contract.sh`

## 验证

| Gate | Result |
| --- | --- |
| Node syntax | passed |
| `node --test workflow/tests/js/*.test.js` | 17/17 passed |
| Public CLI characterization | list/show normal、usage、unknown、malformed 全部 passed |
| `bash workflow/tests/contract_repo.sh` | passed；真实 HOME/Codex/Agents/XDG 隔离 |
| `bash workflow/tests/contract.sh` | passed；repo、host layout、strict doctor、dev sync 全绿 |
| forbidden paths | release/plugin/Multica/`.agents/**` 无 diff |

## 下一步

Phase 2B 迁移 `init-task` 和 lifecycle event/write primitives，再增加 `blocked/archived`；不把 outcome metrics 混入同一 slice。
