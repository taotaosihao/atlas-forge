# 实施分工建议

workflow_id: 20260710-001-atlas-forge-js-first-self-use-workflow-replan
staffing_status: recommended

## 原则

这是本地 CLI 渐进重构，不需要重型 squad。优先使用小 slice、单一写 owner 和独立只读 reviewer。

## Phase 1–3

| 角色 | 职责 | 写入边界 |
| --- | --- | --- |
| 实现者 | JS 模块、Bash delegation、定向测试 | `workflow/bin/codex-workflow`、`workflow/bin/lib/codex-workflow/**`、`workflow/tests/js/**` 和本 slice contract fixture |
| Reviewer | CLI 等价、状态/事件语义、Multica 零修改审查 | 只读；结论写入 phase evidence |

每个 phase 只允许一个 agent 修改 `workflow/bin/codex-workflow`，避免 dispatcher 冲突。

## Phase 4

artifact/evidence 领域可拆成两个路径互斥的实现 slice，但共享 `core` 和 dispatcher 仍由单一 owner 合并：

- Slice A：scaffold、route、checkpoint、source/prompt。
- Slice B：readiness、verify、feedback、gate/outcome report。

## Phase 5–6

- memory、native team、legacy team 和 doctor 分别重新评估 migrate/retire/keep-shell；不预先承诺全部翻译。
- process control、timeout、signal 相关的 legacy team 命令需要独立 reviewer。
- release/install 不进入默认 staffing；只有 trigger 条件成立后另立任务。

## 审查门

- 每个 slice：实现者自测 + reviewer 检查公开 CLI 和文件 schema。
- 每个领域结束：全量 repo contract。
- Phase 3 和 Phase 6：独立 architecture review，判断是否继续迁移或在当前收益点停止。
