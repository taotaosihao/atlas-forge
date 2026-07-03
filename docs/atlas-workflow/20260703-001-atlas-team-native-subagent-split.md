# Atlas team native subagent 拆分实施方案

Task: `20260703-001-atlas-team-native-subagent-split-clarify`

## 目标

将 Atlas team 拆成两个能力：

- `$atlas-workflow:team-v1`：旧能力，继续使用 `codex-workflow team-start/team-loop` 和 `codex exec` lane。
- `$atlas-workflow:team`：新默认能力，使用 Codex native subagent，由主 Codex 调用 `multi_agent_v1.spawn_agent`、`wait_agent` 和 `close_agent`，并一步到位覆盖 discuss、execute 和 bounded loop。

本方案锁定实施边界、验收标准和最终对比验证口径；实施已按该边界落地。

## 非目标

- 不删除 `team-start`、`team-loop`、`team-status`、`team-stop`、`team-promote`。
- 不把 native subagent spawn 写进 Bash 脚本。
- 不重写 Multica agent 平台。
- 不修改历史 team-loop 文档记录。
- 不默认允许多个 worker 同时写同一文件范围。
- 不把完整 native bounded loop 拆到后续任务。

## 选定方向

新 `$atlas-workflow:team` 必须是真正的 native subagent 入口，不能 silent fallback 到旧实现。若当前环境没有 native subagent 工具，`team` 停止并提示显式使用 `$atlas-workflow:team-v1`。

旧实现作为 `$atlas-workflow:team-v1` 保留。它仍使用 `codex-workflow team-start/team-loop`，适合纯 CLI、兼容旧流程或调试 legacy lane。

## 实施范围

1. 新增 `plugins/atlas-workflow/skills/team-v1/SKILL.md`，从旧 `team` 复制并改名为 legacy flow。
2. 重写 `plugins/atlas-workflow/skills/team/SKILL.md`，要求使用 Codex native subagent。
3. 修改 `workflow/bin/codex-workflow`，新增 native record 命令：
   - `team-record-start`
   - `team-record-finalize`
   - `team-loop-record`
4. 新 `$atlas-workflow:team` 同批实现 native bounded loop 编排：
   - `max_iterations` / `max_time`
   - `verify-check`
   - verifier `done=true|done=false` 等价判定
   - `team/loop-*.md` ledger
   - `loop-done|loop-incomplete|loop-failed|loop-timeout`
5. 更新：
   - `plugins/atlas-workflow/README.md`
   - `plugins/atlas-workflow/.codex-plugin/plugin.json`
   - `plugins/atlas-workflow/skills/cw/SKILL.md`
   - `plugins/atlas-workflow/skills/task/SKILL.md`
   - `plugins/atlas-workflow/skills/analyze/SKILL.md`
   - `plugins/atlas-workflow/skills/clarify/SKILL.md`
6. 刷新 installed cache，并用 `cmp` 验证 source/cache 一致。

## 实施结果

- `plugins/atlas-workflow/skills/team-v1/SKILL.md` 已新增为 legacy 入口，继续指向 `team-start/team-loop` 和 `codex exec` lane。
- `plugins/atlas-workflow/skills/team/SKILL.md` 已改为 Codex native subagent 入口，要求 `multi_agent_v1.spawn_agent`、`wait_agent`、`close_agent`，并明确 native 工具不可用时停止、提示显式使用 `team-v1`。
- `workflow/bin/codex-workflow` 已新增 `team-record-start`、`team-record-finalize`、`team-loop-record`，并在 `team-status` 输出 `team_backend`。
- task markdown/template 增加 `active_team_backend` 摘要字段；`state.json` 同步维护 `active_team.backend`。
- legacy `team-start/team-loop` 保留，并显式记录 `team_backend: legacy`。
- native record 命令校验 backend/mode/status、当前 task team 目录归属、artifact 非模板内容、`backend: native` marker，以及 finalize-before-start。
- contract tests 已覆盖 native record 正向、非法 backend/mode/status/iterations、缺失/越界/template artifact、失败原子性、清理 stale legacy `team_temp_dir`，并保持 legacy `team-start/team-loop` 原测试不变。

## Native team 行为

`discuss` 模式默认创建三个 native subagent：

- `architect`：方案、边界、路径。
- `critic`：风险、回归、遗漏。
- `verifier`：验收、验证命令、证据。

`execute` 模式默认只允许一个 `executor` worker 写文件，`reviewer` 和 `verifier` 默认只读。多个 worker 并发必须有互不重叠的 write set。

所有 lane 输出必须包含：

```markdown
## Evidence
## Inference
## Unknown
## Recommendation
```

主 Codex 负责汇总并写入：

- `workflow/artifacts/<task-id>/team/round-*.md`
- `workflow/artifacts/<task-id>/team/decision.md`
- `workflow/artifacts/<task-id>/team/staffing.md`

`codex-workflow` 只负责记录 metadata 和 task state，不负责 spawn subagent。

## Native bounded loop 行为

新 `$atlas-workflow:team` 的 bounded loop 必须一步到位实现。主 Codex 负责编排 native subagents，旧 `codex-workflow team-loop` 只保留给 `$atlas-workflow:team-v1`。

Loop 必须：

- 始终有 `max_iterations` 和/或 `max_time`。
- 每轮最多一个可写 `executor` worker。
- 支持本地 `verify-check` 并记录 stdout/stderr/exit code。
- 由 verifier 给出 `done=true` 或 `done=false` 等价判定。
- 写入 `team/loop-*.md` ledger。
- 通过 `team-loop-record` 记录 `loop-done`、`loop-incomplete`、`loop-failed` 或 `loop-timeout`。

## 验收标准

- `team` 和 `team-v1` 两个 skill frontmatter 名称正确。
- `team-v1` 文档仍指向 legacy `team-start/team-loop`。
- `team` 文档明确使用 `multi_agent_v1.spawn_agent`，且 native 工具不可用时停止。
- `workflow/bin/codex-workflow` 新增 record 命令，且不破坏旧 `team-start/team-loop`。
- 新 `$atlas-workflow:team` 同批覆盖 native bounded loop，不调用旧 `team-loop` 启动 native lane。
- README、plugin.json、cw/task/analyze/clarify 对新旧能力描述一致。
- native artifacts 标明 `backend: native`。
- 刷新插件 cache 后，source/cache 的 `team` 与 `team-v1` skill 内容一致。
- 最终对比验证证明旧/新语义分离、source/cache/live 文件一致、task markdown/state/status 输出一致。

## 验证计划

```bash
bash -n workflow/bin/codex-workflow
```

```bash
rg -n "^name: team$|^name: team-v1$" plugins/atlas-workflow/skills/*/SKILL.md
```

```bash
rg -n "multi_agent_v1|spawn_agent|team-v1|team-start|team-loop" \
  plugins/atlas-workflow workflow/bin/codex-workflow
```

```bash
~/.codex/workflow/bin/codex-workflow team-record-start <task-id> \
  "native record smoke" \
  --backend native \
  --mode discuss \
  --agents 3 \
  --roles "architect,critic,verifier"
```

```bash
~/.codex/workflow/bin/codex-workflow team-record-finalize <task-id> \
  --backend native \
  --status complete \
  --round <round.md> \
  --decision <decision.md> \
  --staffing <staffing.md>
```

```bash
~/.codex/workflow/bin/codex-workflow team-loop-record <task-id> \
  --backend native \
  --status loop-done \
  --loop <loop.md> \
  --iterations 1 \
  --max-iterations 2 \
  --max-time 10m
```

```bash
~/.codex/workflow/bin/codex-refresh-local-plugin atlas-workflow
```

```bash
cmp plugins/atlas-workflow/skills/team/SKILL.md \
  /home/gewu/.codex/plugins/cache/atlas-forge/atlas-workflow/*/skills/team/SKILL.md
```

```bash
cmp plugins/atlas-workflow/skills/team-v1/SKILL.md \
  /home/gewu/.codex/plugins/cache/atlas-forge/atlas-workflow/*/skills/team-v1/SKILL.md
```

## 停止条件

- 无法确认 native subagent 工具语义时，不继续实现 `team` 的可执行细节。
- source/cache 无法同步时，不声称完成。
- record 命令破坏旧 `team-start/team-loop` 时，先恢复兼容。
- 插件发现机制不识别 `team-v1` 时，先验证 skill discovery。
- smoke test 无法证明 `active_team.backend=native` 等状态写入时，停止并报告 blocker。

## 下一步

完成 source/cache/live 同步和最终对比验证后，本任务可进入 finish/验收。
