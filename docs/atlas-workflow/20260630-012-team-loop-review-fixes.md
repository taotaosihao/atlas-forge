# team-loop review findings 修复记录

Task: `20260630-012-fix-atlas-managed-team-loop-review-findings`

## 变更

- `team-loop` verifier completion 改为只解析首个非空 sentinel 行；只有 `done=true` 才允许完成。
- `team-start`、`--verify-check` 和 verifier 子步骤都按剩余 `--max-time` deadline 运行；超时返回 `loop-timeout`。
- contract tests 增加 false sentinel、check 失败、timeout 三类回归。
- README、team skill 和 durable docs 更新为当前语义。

## 验收

- verifier 首个非空行为 `done=false` 时，即使后文出现 `done=true`，也不会 `loop-done`。
- verify-check 失败时，即使 verifier 返回 `done=true`，也不会完成。
- 慢 verify-check 超过剩余 deadline 时，loop 以 `loop-timeout` 非零退出。
- `team-loop` 仍不调用 `paseo loop run`。
