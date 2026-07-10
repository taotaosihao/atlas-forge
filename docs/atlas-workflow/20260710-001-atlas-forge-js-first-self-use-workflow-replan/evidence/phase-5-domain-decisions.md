# Phase 5 决策：剩余领域 migrate / retire / keep-shell

workflow_id: 20260710-001-atlas-forge-js-first-self-use-workflow-replan
implementation_task: 20260710-013-atlas-forge-js-first-remaining-domains-phase-5
decision_status: approved-for-implementation
created: 2026-07-10

## 决策矩阵

| Domain / Commands | Decision | 理由 | Phase 6 路由 |
| --- | --- | --- | --- |
| native team：`team-record-start/finalize`、`team-loop-record`、`team-status/stop/promote` | migrate | 高频 Atlas team 状态路径；纯 task/artifact/state/runtime；已有完整 contract | direct JS |
| legacy team：`team-start`、`team-loop` | keep-shell | process、timeout、signal、legacy agent launcher；迁移收益低于风险 | legacy fallback |
| memory：`learn/dream/recall` | keep-shell | legacy fallback，非默认事实源；当前没有迁移收益证据 | legacy fallback |
| task mutation 后隐式 memory sync | retire | 它迫使已迁移高频 task 命令加载整个 Bash；显式 memory 命令仍可按需同步 | direct task JS 不触发 |
| `doctor`、`smoke`、`self-test`、`install-hooks` | keep-shell | 外部 process、严格安装/host 合同稳定；不是高频业务规则路径 | legacy fallback |
| release/install/marketplace wrappers | keep-shell / trigger-only | 发布安全优先级降低；既有 fail-closed 不削弱 | 不进入 root JS 迁移 |
| `handoff-envelope`、`result-ingest`、`curated-packet`、`multica-feedback` | planned-deprecation keep-shell | Multica-facing 边界；当前任务禁止迁移、移除或兼容清理 | legacy fallback |
| migrated task/outcome/artifact/verification/feedback | keep JS | 已是单一事实实现 | direct JS |

## Public contract 变化

- task 文件、state、runtime、CLI stdout/stderr 与退出码不变。
- `init-task/start/block/resume/done/archive` 通过 Phase 6 root JS 直接执行后，不再隐式刷新 legacy memory index。
- `learn/dream/recall` 仍可显式运行；`dream`/`learn` 继续触发既有 memory sync。
- 不删除历史 memory、task、artifact 或 verification 数据。

## 实现边界

- Phase 5 只实现 native team CommonJS；其余行只记录决定。
- Phase 6 将公开 façade 与 monolithic legacy launcher 分离；keep-shell command 才启动 legacy Bash。
- 不修改 `plugins/multica-sdlc/**`、`.agents/**`、`~/.agents/**` 或 Multica runtime。
- 不刷新真实 plugin/cache/marketplace，不开放 release mutation。

## 验证门

- `workflow/tests/contract_team_native.sh` 全通过。
- 新增 native team Node tests，覆盖 record/finalize/loop/status/stop/promote。
- repo/full contract、host install、Atlas dev-sync 与 forbidden diff 在 Phase 6 最终执行。
