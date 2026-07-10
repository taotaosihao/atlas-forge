# Phase 2B 结论：JS task lifecycle 与任务卫生

workflow_id: 20260710-001-atlas-forge-js-first-self-use-workflow-replan
implementation_task: 20260710-009-atlas-forge-js-first-task-lifecycle-phase-2b
phase_status: implemented
created: 2026-07-10

## Keeper outcome

- `init-task/start/block/resume/done/archive/stale` 由 CommonJS task CLI/lifecycle 承载。
- task 状态扩展为 `todo|doing|blocked|done|archived`；`done` successful verification 和 `--no-verify` 保持。
- Node 负责 init/per-task/pointer lock、原子 task/state/pointer 写入、runtime scaffold 与 schema-v1 lifecycle JSONL event。
- 默认 list 隐藏 archived，`--all` 显示；stale 只报告 `todo|doing|blocked`，不自动 archive 或删除数据。
- 删除 task-specific Bash token delegate、ID sequence、template render、status update、pointer 和 lifecycle handlers；Bash 只做 command delegation 与现有 memory sync。

## 新增命令与投影

| Command | Transition / output | Durable behavior |
| --- | --- | --- |
| `block <id> --reason` | `doing -> blocked` | `blocked_reason/blocked_at`、清 matching pointer、`task.blocked` |
| `resume <id>` | `blocked -> doing` | `resumed_at`、写 pointer、`task.resumed` |
| `archive <id> --reason` | open/done -> archived | 保留 task/artifacts、清 matching pointer、`task.archived` |
| `stale [--days N]` | tab report | `status,id,last_activity,source,title`；只读 |

每个新 lifecycle event 包含 `schema_version,event_id,task_id,kind,occurred_at,data`。旧 runtime rows 继续保留；stale 只把合法 schema-v1 task event 当精确事件，无事件历史 task 显式使用 `legacy-date`。

## 验证

| Gate | Result |
| --- | --- |
| `node --test workflow/tests/js/task-*.test.js` | 25/25 passed |
| 并行 init lock fixture | passed；ID 唯一，lock/temp 清理 |
| lifecycle fixture | passed；五状态、reason、pointer、event、done gate |
| archive/stale negative fixture | passed；durable sentinel 保留，stale byte-for-byte 只读 |
| `bash workflow/tests/contract_repo.sh` | passed；isolated HOME/CODEX_HOME/AGENTS_HOME/XDG/TMP |
| `bash workflow/tests/integration_atlas_plugin_dev_sync.sh` | passed；递归 sync，所有 forbidden sentinels 不变 |
| `bash workflow/tests/contract.sh` | passed；repo、host、doctor、cache transaction、dev sync 全绿 |
| forbidden paths | release/plugin/Multica/`.agents/**` 无 diff |

## 明确暂留

- readiness、verification、team 仍使用 legacy Bash metadata helpers，按 Phase 4 迁移；它们已接受新合法状态。
- `sync_codex_memory` 仍是 Bash memory-domain 逻辑。blocked 暂不出现在 legacy memory open-task 摘要，但在 task list/stale/state/event 中完整可见。
- 不实现 `unarchive`、破坏性 GC、自动 archive、历史事件回填或跨文件崩溃恢复。

## 下一步

Phase 3 基于本轮 `task.started` schema-v1 event 增加 evidence-bound outcome marker 与 latency report；不从 Git、mtime、task date 或自由文本推测历史 latency。
