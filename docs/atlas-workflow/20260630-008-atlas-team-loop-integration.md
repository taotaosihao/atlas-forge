# Atlas team-loop 集成

Task: `20260630-008-atlas-team-loop-integration`

## 决策

Atlas workflow 新增显式 `team-loop` 命令，把 worker/verifier/check/limit 这类 loop 能力内建到 Atlas team。它不调用 Paseo loop CLI；当用户要求 team 负责实施且“未达标反复修”时，使用：

```bash
~/.codex/workflow/bin/codex-workflow team-loop <task-id> "<objective>" --max-iterations 5 --max-time 1h --verify-check "<command>"
```

保留 `team-start` 的 one-shot 行为，避免已有讨论/评审流程被隐式改成循环。

## 行为

- 每轮运行 `team-start <task-id> "<objective>" --mode execute`。
- 每轮结果写入 `team/loop-*.md` ledger。
- 可选 `--verify-check` 命令先做客观检查；检查失败时不得 done。
- verifier 通过 `CODEX_BIN exec` 判断并返回 `done=true` 或 `done=false`；如果只有建议、没有验证、实现缺失或 blocker 未解，继续循环。

## 验收与验证

- CLI 新增 `team-loop` usage 和参数解析。
- `workflow/tests/contract.sh` 增加 mock Codex 测试，覆盖 Atlas-managed loop 成功路径、ledger 和 status。
- `plugins/atlas-workflow/skills/team/SKILL.md` 说明 bounded execution loops，避免被误解为只有 review。
- `workflow/README.md` 记录 `team-loop` 用法和边界。

## 风险

`team-loop` 仍依赖 objective 和 `--verify-check` 的质量。复杂任务必须设置明确验收命令和较小的 `--max-iterations` / `--max-time`，避免循环消耗过大。
