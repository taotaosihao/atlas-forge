# Phase 5 结论：剩余领域边界与 native team JavaScript 迁移

workflow_id: 20260710-001-atlas-forge-js-first-self-use-workflow-replan
implementation_task: 20260710-013-atlas-forge-js-first-remaining-domains-phase-5
phase_status: implemented
created: 2026-07-10

## Keeper commits

- `74af117 docs(workflow): decide remaining domain boundaries`
- `0c86f66 refactor(workflow): move native team records to JavaScript`

## 领域决策

| Domain | Decision | Result |
| --- | --- | --- |
| Native team records | migrate | 六个 record/status/stop/promote 命令进入 `team/` CommonJS 域 |
| Legacy team-v1 | keep-shell | `team-start/team-loop` 的 process、timeout 与 signal 行为原样保留 |
| Memory | keep-shell + partial retire | `learn/dream/recall` 显式保留；task mutation 后的隐式 memory sync 待 Phase 6 direct route 退役 |
| Doctor/install/release | keep-shell | 稳定 host、安装与 release wrapper 不重写 |
| Multica-facing | planned-deprecation keep-shell | handoff/result/packet/feedback 只保留兼容入口，不修改或运行 Multica |

权威决策矩阵见 [phase-5-domain-decisions.md](./phase-5-domain-decisions.md)。本阶段不以 100% JavaScript 为目标，只迁移能缩短高频公共路径且已有明确合同的 native team 状态域。

## Keeper outcome

- `team-record-start`、`team-record-finalize`、`team-loop-record`、`team-status`、`team-stop`、`team-promote` 迁入 `workflow/bin/lib/codex-workflow/team/`。
- 参数形式、错误文本、stdout 行序、task header、`state.json`、`runtime.jsonl` 与现有 Bash 合同保持一致。
- native artifact 继续校验 realpath ownership、`backend: native`、实质内容，以及 staffing 八个章节与三个必需 token。
- 三个 record mutation 继续使用 `${TMPDIR}/codex-workflow-team-locks/<cksum(task-id)>.lock.dir`，与保留的 legacy launcher 共享锁身份。
- 公开 dispatcher 只委派六个 native 命令；Bash 中 637 行独占 validator/handler 被删除。
- 修正 dispatcher 先前错误拦截 `team-promote --to=finish` 的不可达分支；target 枚举不扩大。

## 明确保留

- `ensure_team_lock_dir`、`team_lock_file`、`acquire_lock`、`release_lock` 与 legacy team helper 仍在 Bash 中。
- `team-start/team-loop` 未重写；它们仍由既有 repo contract 覆盖。
- `plugins/multica-sdlc/**`、`.agents/**`、Multica shim、router、listener、tests 与 runtime 均未修改或运行。
- marketplace mutation、shared release mutation、Atlas-only marketplace 与 exact-SHA rotation 仍不开放。

## Review 闭环

- mapper 完成六命令参数、投影、锁、artifact 校验和可删除函数的精确映射。
- 独立 reviewer 对照 `HEAD 74af117` 复核 keeper diff，结论为 `CLEAN`。
- reviewer 确认 native/legacy team 合同、共享 helper 与 forbidden path 边界均满足；未要求修复轮。

## 验证

| Gate | Result |
| --- | --- |
| `node --test workflow/tests/js/team-commands.test.js` | 6/6 passed |
| `node --test workflow/tests/js/*.test.js` | 74/74 passed |
| `bash workflow/tests/contract_repo.sh` | passed，含 native、legacy 与 legacy loop 合同 |
| Bash/Node syntax、`git diff --check` | passed |
| forbidden repo paths | `plugins/multica-sdlc/**`、`.agents/**` diff=0 |
| Bash reduction | `codex-workflow` 4,773 行、26 段 Python heredoc |

完整 `contract.sh`、host install 与 dev-sync 在 Phase 6 façade/legacy layout 完成后统一执行，避免对同一最终布局重复跑高成本门禁。

## 下一步

进入 Phase 6：把当前 Bash 主体原样降为内部 legacy launcher，新增薄 Bash façade 与 34 条 direct JS 精确路由；其余 13 条命令和未知 usage exec 到 legacy。完成后执行 full、host install、dev-sync 与 forbidden-path 最终审计。
