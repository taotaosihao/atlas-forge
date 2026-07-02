# Multica GPT 常驻 Leader 去瓶颈团队评审

任务 ID：`20260629-001-multica-gpt-always-on-leader-bottleneck-team-review`

## 结论

团队一致认为：当前“常驻 Leader 非阻塞 + clean-gate arbiter 分片”方向正确，但不能保持现状。若 `SDLC GPT Workflow Leader Clean Gate` 在每个 issue 全程在线，只靠自然语言协议仍可能让它继续成为同步瓶颈。

建议先做 live prompt/config 级加固；只有验证确认 runtime 硬等待 Leader task completion 时，才升级修改 listener/router。

## 阻塞问题

1. 如果底层 listener/router 等待常驻 Leader turn completion，协议文字无法消除瓶颈。
2. `decision_lock_owner` 缺少机械分配、`gate_round_id`、TTL、version/CAS 或冲突拒绝语义，存在双重 final verdict 风险。
3. 旧 `Workflow Leader Clean Gate` 指令仍可能保留强 leader/closure 语义，与 `OBSERVE_ONLY` 冲突。
4. Arbiter 分片若没有固定 hash 或 Registry 统一签发 owner，A/B 可能重复领取同一 final gate。

## 推荐修正

- 压缩 `Workflow Leader Clean Gate`：默认 `OBSERVE_ONLY` 快速退出；禁止 routine dispatch、phase join、review wave、E2E 分配；只有持有 `decision_lock_owner` 时才做 final decision。
- 强化 `Workflow Router` 和 `Gate Registry Coordinator`：由它们机械签发 `gate_round_id`、`decision_lock_owner`、`lock_expires_at`、`shard_key`、`block_downstream`。
- 固定 arbiter 分片：默认 `hash(issue_id + gate_round_id) % arbiter_count`，TTL 过期后才允许 Registry 改派并记录 supersedes。
- 增加 lock/watchdog 字段：`lock_scope`、`lock_acquired_at`、`lock_ttl`、`fallback_owner`、`lock_release_reason`、`lock_version`。
- 做多 issue 并发验证：若 routine coding/review/E2E/evidence/repair/docs 仍等待 Leader completion，再改 listener/router。

## 下一步

建议进入执行：更新 live Multica 角色指令和共享协议，让非阻塞语义从“建议”变成更机械的锁与分片规则。
