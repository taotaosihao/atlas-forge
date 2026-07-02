# Atlas-managed team-loop

Task: `20260630-010-extract-loop-capability-into-atlas-team`

## 决策

`team-loop` 不再调用 Paseo loop CLI。Atlas workflow 直接实现 bounded loop：

1. 每轮运行 `team-start --mode execute`。
2. 运行可选 `--verify-check` shell checks。
3. 调用 `CODEX_BIN exec` verifier，要求首个非空行返回 `done=true` 或 `done=false`。
4. checks 全通过且 verifier 首个非空 sentinel 是 `done=true` 时结束；否则继续到 `--max-iterations` 或 `--max-time`。

## 行为

- loop 是同步命令，不会留下不可见的后台 Paseo loop。
- 每轮的 `team-start`、`--verify-check` 和 verifier 子步骤都受剩余 `--max-time` deadline 约束；超时会以 `loop-timeout` 结束。
- 每次运行写入 `team/loop-*.md` ledger，包含 team round、check 输出和 verifier 结论。
- `team-status` 展示 `team_loop_status`、`team_loop_file`、`team_loop_iteration`、`team_loop_max_iterations`、`team_loop_max_time`。
- `--archive` 作为兼容参数保留；Atlas team artifacts 始终保留。

## 验证

- `workflow/tests/contract.sh` 使用 mock `CODEX_BIN` 覆盖 internal loop 成功路径、false sentinel、check 失败和 timeout 回归。
- 负向 grep 确认 `team-loop` 代码和文档入口不再包含 Paseo loop wrapper/provider 参数。
- live workflow、active cache 和 local plugin cache 已同步。

## 使用示例

```bash
~/.codex/workflow/bin/codex-workflow team-loop <task-id> "<objective>" \
  --agents 3 \
  --max-iterations 5 \
  --max-time 1h \
  --verify-check "<command>"
```
