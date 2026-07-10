# Phase 1 结论：JS task-id 与 slug

workflow_id: 20260710-001-atlas-forge-js-first-self-use-workflow-replan
implementation_task: 20260710-006-atlas-forge-js-first-task-slug-phase-1
phase_status: implemented
created: 2026-07-10

## Keeper outcome

- 新增 `workflow/bin/lib/codex-workflow/task/id.js`，使用 CommonJS、Node 标准库和 NFC normalization。
- 新 task title 开头已有一个 `YYYYMMDD-NNN-` 时不再重复进入 slug。
- 普通 ASCII title 保持 lower-kebab；最大 64 字符。
- 无 ASCII token 时使用 `u-<SHA-256 前 12 位>`，不再依赖 `cksum`。
- 原始 task title 保持不变；历史 task 不改名。

## 范围收窄

只读 reviewer 发现共享 `title_token()` 同时服务 `learning_basename()`。实施因此采用 task-ID 专用 `task_id_title_token()`，仅替换 `next_task_id()` 的两个调用点；legacy learn/memory basename 保持原行为。

## 变更路径

- `workflow/bin/codex-workflow`
- `workflow/bin/lib/codex-workflow/task/id.js`
- `workflow/tests/js/task-id.test.js`
- `workflow/tests/contract.sh`

## 验证

| Gate | Result |
| --- | --- |
| `node --check` | passed |
| `node --test workflow/tests/js/task-id.test.js` | 7/7 passed |
| `bash -n workflow/bin/codex-workflow workflow/tests/contract.sh` | passed |
| `bash workflow/tests/contract_repo.sh` | passed；真实 HOME/Codex/Agents/XDG 隔离 |
| `bash workflow/tests/integration_atlas_plugin_dev_sync.sh` | passed；新 `bin/lib` 同步且 release/Multica sentinels 不变 |
| `bash workflow/tests/contract.sh` | passed；repo、host layout、strict doctor 与 dev sync 全绿 |
| `git diff --exit-code -- plugins/multica-sdlc .agents` | passed；零修改 |

## 下一步

Phase 2 从只读 `list/show` 迁移开始，复用本 phase 的 CommonJS 与 `node:test` 基线；不在同一 slice 中同时迁移 lifecycle 写路径。
