# Atlas-managed team-loop 重新 review

Task: `20260630-011-team-review-atlas-managed-team-loop`

## 结论

本次 review 使用 Atlas `team` flow。team round 中断后，根据 partial output、代码复查和独立 `/tmp` 复现合成结论：`team-loop` 已经不再使用 `paseo loop run`，但当前实现仍有一个必须修的完成判定 bug，并且 `--max-time` 的实际语义不是硬 wall-clock 上限。

## Findings

1. Blocking: `workflow/bin/codex-workflow:6448` 用 `grep` 扫描整份 verifier message，只要后续任意行出现 `done=true` 就会判定完成。复现显示首行 `done=false`、后文出现 `done=true` 时，命令仍返回 `loop-done` 和 `exit=0`。

2. Risk: `--max-time` 只在每轮开始前检查，`team-start`、`verify-check`、verifier 调用没有被 `timeout` 包裹。复现显示 `--max-time 1s --verify-check "sleep 2"` 用时约 3 秒，最终是 `loop-incomplete`，不是硬中断。

3. Test gap: `workflow/tests/contract.sh:86-132` 只覆盖成功路径，缺少 verifier 负例、check 失败、max-iterations、max-time 语义测试。

4. Low risk: `--archive` 是兼容参数，当前没有实际归档行为；文档需要持续明确 Atlas artifacts 始终保留。

## 建议

优先修复 `done` sentinel 解析，只允许 verifier message 首行或首个非空行精确为 `done=true` 时完成，并补充负向 contract test。然后二选一处理 `--max-time`：要么为每个子步骤加硬 timeout，要么在 README、team skill 和 durable doc 中明确它只是轮次边界上的软上限。

## 跟进状态

Task `20260630-012-fix-atlas-managed-team-loop-review-findings` 选择实现硬 timeout：`team-start`、`--verify-check` 和 verifier 子步骤都在剩余 `--max-time` deadline 下运行。`done` sentinel 改为只解析首个非空行，contract tests 覆盖 false sentinel、check 失败和 timeout 回归。

## 验证证据

- `workflow/tests/contract.sh` 当前全量通过，但属于 happy path 覆盖。
- 独立 `/tmp` parser 复现：首行 `done=false`、后文 `done=true` 仍返回 `loop-done`。
- 独立 `/tmp` timeout 复现：`--max-time 1s` 未中断 `sleep 2` verify-check，最终 `elapsed=3`。
