# JS-first 自用工作流架构决策

workflow_id: 20260710-001-atlas-forge-js-first-self-use-workflow-replan
decision_status: accepted
decided_at: 2026-07-10

## 决策摘要

采用“按命令域绞杀式迁移”：现有 `workflow/bin/codex-workflow` 在迁移期继续作为 Bash 兼容入口；新增业务逻辑和逐步迁移的领域进入 `workflow/bin/lib/codex-workflow/` 下的 CommonJS 模块。每个迁移 slice 必须同时删除对应的 Bash 业务实现，避免两套逻辑永久并存。

## 已评估方案

| 方案 | 收益 | 代价 | 结论 |
| --- | --- | --- | --- |
| 一次性 Node 重写 | 最终目录最整齐，一次消除混合语言 | 8,197 行、41 个命令与隐含 schema 同时变化；首个结果最慢；回归定位困难 | 拒绝 |
| 永久 Bash 主体 + JS sidecar | 新功能最快 | 两套 task parser、event writer 和 path resolution 长期漂移 | 拒绝作为终态；仅允许首两个 slice 临时桥接 |
| 按领域渐进迁移 | 可逐 slice 交付和回退；保留现有 CLI；适配现有 sync | 迁移期间同时存在 Bash/JS | 采用 |

## 目录决策

首阶段使用：

```text
workflow/bin/
├── codex-workflow
└── lib/codex-workflow/
    ├── core/
    ├── task/
    ├── outcome/
    ├── artifact/
    ├── verification/
    ├── memory/
    └── team/
```

不新建顶层 `workflow/lib/`。当前 Atlas scoped sync、legacy sync 和 equality test 都已递归管理 `workflow/bin/`；使用 `workflow/bin/lib/` 可以避免先修改安装事务、rollback、host fixtures 和 live layout。等 Bash 主体收缩后，如确有可读性收益，再单独做目录搬迁。

## 语言与运行时

- CommonJS：匹配现有 `atlas-plugin-integrity`、plugin scripts 和 validators。
- Node 标准库：文件系统、crypto、child process、test runner 足以覆盖当前需求。
- Node `v24.15.0`：本轮唯一验收环境；不承诺其他版本，不做版本矩阵。
- 无 `package.json`、无 lockfile、无第三方依赖、无 transpile/build step。
- 新增业务规则不得写成 Python heredoc；既有 heredoc 随所属领域迁移逐步删除。
- Bash 允许保留在公开 façade、环境引导、`exec` 和少量天然 shell 编排中。

## Task 状态决策

持久状态锁定为：

```text
todo -> doing -> done
  \       |  \
   \      |   -> archived
    -> archived

doing -> blocked -> doing
blocked -> archived
```

- `blocked`：真实外部或环境阻塞；需要 reason，清理 current pointer。
- `archived`：任务不再继续，但不满足 done verification；需要 reason，保留全部文件。
- `stale`：由最后结构化事件时间派生，不写入持久状态。
- 不增加 `paused`、`canceled`、`abandoned`；这些语义分别用 `todo`、`archived` 和 reason 表达。
- `done` 继续保留 verification gate。

## 自动整理决策

“自动清理”首版收敛为无损行为：

- 默认 list 隐藏旧 `done` 和全部 `archived`，`--all` 可见。
- `stale` 命令报告长期未活动的 `todo|doing|blocked`。
- 支持显式单个或批量 archive。
- 只允许自动删除本命令拥有的临时文件、已释放锁和可重建 cache。
- 不按时间自动删除或改名 task、artifact、verification、decision 或 runtime event。

这是对纯自用场景的简化，不是发布级恢复系统；由于 Markdown/JSONL 数据量很小，破坏性 GC 没有足够收益。

## Outcome metrics 决策

现有 `gate-metric` 不承担 outcome latency。新增版本化 outcome event：

- `first-code`：首个最终保留的 implementation slice，并带 evidence ref。
- `operable-flow`：首个真实可操作用户流；headless 任务标记 not-applicable。
- `clean-review`：首个结构化 clean verdict。

报告只统计 `task.started` 到这些事件的 raw wall time，输出样本数、median 和 coverage。首版不做 active-time 扣除、不做 dashboard、不建数据库、不回填旧任务、不从 Git 时间或自由文本推断。

## 发布优先级决策

- 现有 shared mutation fail-closed、integrity checker、strict doctor 与 release tests 保留。
- 不设计或实现 Atlas-only marketplace、exact-SHA rotation、release `--execute`。
- 普通 workflow slice 不运行 release E2E；只有 release/marketplace 文件变化时才触发。
- 未来出现任一触发条件时重新立项：第二个实际使用者、第二台长期运行机器、自动分发需求、需要可回滚正式发布。

## Multica 决策

Multica 维持 planned deprecation：

- 不修改 `plugins/multica-sdlc/**`、`.agents/**` 或 Multica runtime。
- 不将其现有 JS 脚本算入 JS-first 迁移完成度。
- 不运行 Multica router/listener/tests 来验证 Atlas 改动。
- 仅允许只读 changed-path/fingerprint 证明零修改。
