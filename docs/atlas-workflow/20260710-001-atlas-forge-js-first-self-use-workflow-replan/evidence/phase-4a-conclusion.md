# Phase 4A 结论：Artifact planning commands JavaScript 迁移

workflow_id: 20260710-001-atlas-forge-js-first-self-use-workflow-replan
implementation_task: 20260710-011-atlas-forge-js-first-artifact-planning-phase-4a
phase_status: implemented
created: 2026-07-10

## Keeper commits

- `1d08a5b refactor(workflow): move artifact scaffolds to JavaScript`
- `e3e8202 refactor(workflow): move artifact planning to JavaScript`

## Keeper outcome

- `scaffold-intake|brainstorm|clarify|team|phase` 由 `artifact/scaffold.js` 渲染 template；existing substantive files 保留，team exact placeholder 才允许 replacement。
- `route-decision` 保留 `--intent/--layer`、consensus evidence、assumptions 与 task/state/runtime 投影。
- `checkpoint` 保留 ledger JSONL、最近 20 条 lifecycle table、current phase 与环境投影。
- `source-snapshot` 保留本地文件 SHA-256/mtime ns、URL source、最近 50 条 provenance table。
- `prompt-bundle` 保留 file hashes/bytes、skills、agent、bundle manifest 与 provenance。
- 公开 Bash dispatcher 对九个命令只做 Node delegation；对应 Bash parser/handler、四段 Python writer 和 Perl workflow template renderer 已删除。

## 迁移边界

| Boundary | Result |
| --- | --- |
| CLI | usage、help、alias、`--flag value`/`--flag=value`、stdout/stderr 保持 |
| Artifact | Markdown、JSON、JSONL 文件名与字段保持 |
| Projection | task header、`state.json`、legacy `runtime.jsonl` 同步迁移 |
| Existing files | 普通已有文件不覆盖；非 regular target 失败且不记录成功 event |
| Dependencies | CommonJS + Node 标准库，无 npm/build step |
| Bash reduction | `codex-workflow` 当前 6,628 行；Python heredoc 36 段 |

## Review 闭环

- 4A1 初审 P2：同名目录被误报为 existing scaffold；修复为 regular-file guard，并新增 runtime byte-for-byte negative fixture。复审 `CLEAN`。
- 4A2 reviewer 对 CLI、artifact、task/state/runtime、hash/mtime、consensus 与 Bash 删除边界逐项核对，verdict `CLEAN`。
- `~other-user` 展开未作为当前 self-use 合同，按用户要求不增加低价值边界实现。

## 验证

| Gate | Result |
| --- | --- |
| `node --test workflow/tests/js/artifact-*.test.js` | 12/12 passed |
| `node --test workflow/tests/js/*.test.js` | 49/49 passed |
| `bash workflow/tests/contract_repo.sh` | passed |
| `bash workflow/tests/contract.sh` | passed |
| Atlas dev-sync in full contract | passed；release/Multica/workflow sentinels unchanged |
| `bash -n workflow/bin/codex-workflow` | passed |
| forbidden paths | release/plugin/Multica/`.agents/**` 无 diff |

## 暂留

- readiness、handoff/result ingest、trace/feedback/lesson/gate metrics、verify/gate-report 留在 Phase 4B。
- team、memory、doctor/install 的 migrate/retire/keep-shell 决策留在 Phase 5。
- 不刷新真实插件安装态，不开放 marketplace mutation，不运行或修改 Multica。

## 下一步

执行 Phase 4B，优先把 readiness 与 verification record 迁移到 CommonJS，再按共享投影关系处理 feedback/gate 命令。
