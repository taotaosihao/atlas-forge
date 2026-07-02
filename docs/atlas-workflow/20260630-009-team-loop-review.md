# Atlas team-loop 团队评审

Task: `20260630-009-team-review-atlas-team-loop-changes`

## 结论

本轮使用 Atlas `team` 方式 review 早期 `team-loop` 集成。team round 被手动中断，但 architect lane 已完成可用 review，结论是当时的 Paseo-backed 改动不应直接接受为完成态。后续修复方向是移除 Paseo loop CLI 依赖，把 loop 能力内建到 Atlas team。

## Findings

### High: 未跟踪或停止真实 Paseo loop

早期实现只根据 Paseo loop CLI 的退出码写 `loop-started`，没有保存 loop id，也没有让 `team-status` / `team-stop` 对接真实后台 loop。这会导致 Atlas 状态和后台 loop 生命周期脱节。后续修复不再使用 Paseo loop，而是同步运行 Atlas-managed loop。

### High: worker prompt 固定 live workflow 路径

worker prompt 硬编码 `~/.codex/workflow/bin/codex-workflow`，在 repo 脚本、测试 root、临时 workflow root 或未同步安装缓存下会操作错误的 workflow 状态。

### Medium: 测试对 lifecycle 假阳性

早期 `workflow/tests/contract.sh` 的 mock 只校验 Paseo 参数和 `loop-started`，没有覆盖内建 loop 的 ledger、status、verifier 和失败路径。

### Medium: 文档没有说明异步生命周期

README、team skill 和集成文档曾描述为持续修到目标，但没有说明早期命令只是启动 bounded Paseo loop。后续文档应明确为 Atlas-managed synchronous loop。

## 建议

修复方向：移除 Paseo loop lifecycle 依赖，使用当前 workflow 脚本和环境运行每轮 `team-start`，补 contract tests 和文档。
