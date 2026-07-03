# Atlas team native subagent 拆分团队评审

Task: `20260703-001-atlas-team-native-subagent-split-clarify`

## 结论

团队评审给出条件通过，并按用户最新要求调整为一步到位：`$atlas-workflow:team-v1` 保留 legacy `codex exec` lane、`$atlas-workflow:team` 改为 Codex native subagent 的方向可以进入实施准备，但必须先生成轻量 implementation contract，并把本轮 P0 条件转成可验证 validation rows。完整 native bounded loop 必须同批交付，不拆后续任务。

本轮不直接 promote 到 execute。原因是方案方向已经稳定，但 implementation contract 仍需补齐状态模型、live workflow 同步、record 命令负向测试和 skill discovery 验收。

## 共识依据

- `team-v1` 作为 legacy skill 入口，比重命名或删除底层 `team-start/team-loop` 更稳。
- native subagent 编排应留在 skill/主 Codex 层；`workflow/bin/codex-workflow` 不应尝试 spawn `multi_agent_v1`。
- `workflow/bin/codex-workflow` 应新增 record/status artifact 支撑，使 native round 也能被 `team-status`、readiness 和后续 handoff 审计。
- 实施范围应一步到位覆盖 skill 拆分、native team 文档 contract、native discuss/execute、完整 native bounded loop、record/status 支撑、README/plugin metadata/引用更新、source/cache/live 同步。

## P0 合同补强

- `workflow/bin/codex-workflow` record 命令必须同时更新 task markdown 扁平字段和 `state.json` nested `active_team.*` 字段。
- `team-status` 必须输出 `team_backend: native`，并且 native 状态不依赖 legacy `team_temp_dir`。
- 修改 workflow bin 后必须运行 `scripts/sync-live-workflow.sh` 或等价同步，并用 `cmp workflow/bin/codex-workflow /home/gewu/.codex/workflow/bin/codex-workflow` 验证。
- `team-record-start`、`team-record-finalize`、`team-loop-record` 需要成功路径 smoke。
- 完整 native bounded loop 需要成功路径和至少一个负向路径验证，覆盖未完成、失败、超时或迭代上限中的至少一种。
- 最后必须做对比验证：旧/新 skill 语义对比、source/cache/live 文件对比、task markdown/state/status 状态对比。
- record 命令必须覆盖负向测试：非法 backend、非法 mode/status、缺失 task、缺失 artifact、空 artifact。
- native failure/interrupted 也必须有最小非空 round、decision、staffing artifacts；无法生成时停止，不调用 finalize 伪装完成。
- `team-v1` 必须在 cache refresh 后实际可发现；仅验证文件存在不够。
- 新 `team` skill 必须明确 native 工具不可用时停止并提示 `$atlas-workflow:team-v1`，不得 silent fallback。

## Scope Guard

实施时不要做这些事：

- 不重命名或删除 `team-start/team-loop`。
- 不把 native subagent spawn 包装进 Bash。
- 不默认支持多个可写 executor。
- 不把完整 native bounded loop 拆到后续任务；它是本次必交付项。
- 不重写历史 team-loop 文档事实。

## 下一步

进入 `$atlas-workflow:task` 前，先用本 review、用户一步到位要求和 clarify spec 生成 implementation contract。contract 通过后再开始修改 skill、README、plugin metadata、`workflow/bin/codex-workflow` 和相关引用，最后必须完成对比验证。
