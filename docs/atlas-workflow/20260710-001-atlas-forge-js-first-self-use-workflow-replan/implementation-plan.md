# Atlas Forge JS-first 自用工作流实施计划

workflow_id: 20260710-001-atlas-forge-js-first-self-use-workflow-replan
plan_status: approved
mvp_status: implemented
created: 2026-07-10

## 1. 目标与完成定义

本计划把近期工程目标调整为：在不破坏现有 CLI 使用方式的前提下，将 Atlas 高频 workflow 逻辑逐域迁移到 JavaScript，并先解决每天可见的 task ID、任务卫生和 outcome feedback 问题。

“完成”分两层：

- **JS-first MVP**：Phase 1–3 完成。新 task slug 正确；task 生命周期和事件由 JS 管理；可以报告新任务的 outcome latency。
- **主 CLI 模块化完成**：Phase 4–6 完成。高频 task/artifact/verification 领域不再由 Bash 单体承载；公开入口只保留薄 façade。低价值 legacy/release 命令可以明确保留或退役，不以“100% JS 行数”作为完成指标。

## 2. 当前基线

### 2.1 实现基线

- `workflow/bin/codex-workflow`：8,197 行 Bash，约 174 个函数、41 个顶层命令。
- 内部混用 44 段 Python heredoc、Perl、awk 和 sed；大量 JSON/Markdown writer 实际已超出 Shell 的合适边界。
- `workflow/bin/atlas-plugin-integrity`：1,895 行 CommonJS/Node 标准库，证明无依赖 Node CLI 已是项目内成熟模式。
- `plugins/atlas-workflow/scripts/*` 与 team validators 大量使用 CommonJS。
- 仓库没有 npm manifest/lockfile；当前运行环境 Node 为 `v24.15.0`。

### 2.2 运行与同步基线

- Atlas scoped sync 递归同步、比较整个 `workflow/bin/`。
- legacy sync 同样复制 `workflow/bin/.`。
- 因此 `workflow/bin/lib/codex-workflow/` 是最小改动的 JS module root。
- 公开调用路径是 `~/.codex/workflow/bin/codex-workflow` 和对应 local shim；该路径必须保持。

### 2.3 用户问题基线

- live task inventory 当前约为 `doing=15`、`done=464`、`todo=2`。
- 存在多项长期 `doing`，缺少 blocked/archive 语义。
- 至少 10 个历史 task ID 出现 `YYYYMMDD-NNN-YYYYMMDD-NNN-title` 重复前缀。
- 现有 gate metrics 只能回答 gate 使用/耗时，不能回答首个 keeper code、首个 operable flow 或首次 clean review 何时发生。

## 3. 实施原则

1. **首个 slice 必须产生用户可见行为**：不先提交空目录、框架或通用 abstraction。
2. **按命令域迁移**：不按行机械拆分；task、artifact、verification、team 各自保持内聚。
3. **一个事实源**：迁移完成的领域必须删除 Bash 业务实现；允许短期 delegation，不允许永久双写。
4. **CommonJS + 标准库**：不引入 package manager、第三方 parser、CLI framework 或 transpiler。
5. **当前环境优先**：只验证 Node 24.15.0；不投入跨 Node 版本、Windows 或额外 shell 兼容。
6. **验证按改动面分层**：task 改动不默认运行 release E2E；完整回归在领域边界运行。
7. **冻结 release，保护 local state**：停止新增发布安全投资，但保留 task lock、原子写入和现有 release fail-closed。
8. **Multica 零修改**：它是 planned deprecation，不属于迁移对象。

## 4. 目标架构

```text
workflow/bin/codex-workflow
  └── migration-time Bash dispatcher
      ├── migrated command -> Node domain CLI
      └── not-yet-migrated command -> existing Bash implementation

workflow/bin/lib/codex-workflow/
├── core/
│   ├── paths.js
│   ├── atomic-file.js
│   ├── lock.js
│   └── event-store.js
├── task/
│   ├── id.js
│   ├── header.js
│   ├── repository.js
│   ├── lifecycle.js
│   └── cli.js
├── outcome/
│   ├── schema.js
│   ├── marker.js
│   └── report.js
├── artifact/
├── verification/
├── memory/
└── team/
```

模块只在真实命令迁移时创建；上图不是预先创建空文件的要求。

## 5. Phase 1：JS task-id 与 slug 垂直切片

phase_status: implemented

### 5.1 目标

用最小真实行为建立 JS 模块、测试和 Bash delegation 路径，修复新建 task 的重复 slug。

### 5.2 计划改动

- 新增 `workflow/bin/lib/codex-workflow/task/id.js`。
- 新增 `workflow/tests/js/task-id.test.js`。
- 新增 task-ID 专用 `task_id_title_token()` delegate，只替换 `next_task_id()` 的两个调用点；共享 `title_token()` 继续服务 `learning_basename()`。
- 同日序号扫描、锁和文件写入暂留 Bash。
- 如测试需要，新增一个仅内部使用的 Node CLI 入口；不新增面向用户的永久命令。

### 5.3 Slug 规则

1. 保持 task ID 外形 `YYYYMMDD-NNN-slug`。
2. title 原文照常写入 task 文件。
3. title 先执行 NFC + trim；生成 slug 前只剥离开头的一个 `YYYYMMDD-NNN-`。
4. ASCII letters/numbers 继续 lower-kebab；连续符号折叠为单个 `-`。
5. slug 截断到 64 个 ASCII 字符，并去除尾部 `-`。
6. 没有 ASCII token 时，使用 `crypto.createHash("sha256")` 生成 `u-<前 12 位 hex>`。
7. 不引入中文转写，不放宽 safe task-id 字符集，不重命名历史文件。
8. 不改变 learn/memory 的 legacy `title_token()` 和 learning basename。

### 5.4 验证

```bash
node --check workflow/bin/lib/codex-workflow/task/id.js
node --test workflow/tests/js/task-id.test.js
bash -n workflow/bin/codex-workflow
bash workflow/tests/contract_repo.sh
bash workflow/tests/integration_atlas_plugin_dev_sync.sh
```

测试至少覆盖普通英文、已有 ID 前缀、全中文、连续标点、超长标题、非法多行 title、同日序号与碰撞。CLI fixture 必须证明 `init-task` stdout 仍只包含 task ID。

### 5.5 完成门

- 新创建任务不再重复前缀。
- 普通 ASCII title 的既有结果不变。
- 非 ASCII fallback 不依赖外部 `cksum`。
- `workflow/bin/lib/` 已通过真实 dev sync equality。

### 5.6 停止条件

如果完成 slug 必须同时迁移 task state、memory 或 team，则缩回只迁移 token 生成；不扩大首个 slice。

## 6. Phase 2：Task repository、生命周期与任务卫生

phase_status: implemented

### 6.1 目标

将 task 文件解析、状态更新、current pointer 和 lifecycle event 收敛到 JS，为 metrics 提供可靠时间源。

### 6.2 迁移顺序

1. `list`、`show`：已在 Phase 2A 迁移到 JS，header parser、路径、GNU version sort 和输出等价通过完整 contract。
2. `init-task`：已在 Phase 2B 迁移锁、序号、模板渲染、runtime scaffold 与 `task.created`。
3. `start`、`block`、`resume`、`archive`：已在 Phase 2B 建立五状态转换、pointer 投影与 schema-v1 事件。
4. `done`：已迁移到 JS，successful verification 与 `--no-verify` gate 保持。
5. `stale`：已实现只读报告，优先 schema-v1 lifecycle event，历史任务标记 `legacy-date`。
6. `ready` 保留到 Phase 4 artifact 域，避免 task phase 同时吞入 readiness 规则。

### 6.3 状态模型

| 当前状态 | 命令 | 新状态 | 关键行为 |
| --- | --- | --- | --- |
| `todo` | `start` | `doing` | 写 current pointer 与 `task.started` |
| `doing` | `block --reason` | `blocked` | 清 current pointer，写 reason/event |
| `blocked` | `resume` | `doing` | 恢复 current pointer，写 event |
| `doing` | `done` | `done` | 继续要求 successful verification |
| `todo|doing|blocked|done` | `archive --reason` | `archived` | 清 pointer，保留 task/artifacts |

首版不提供 `unarchive`；需要恢复时另立小变更，避免提前设计完整撤销状态机。

### 6.4 Stale 与自动整理

- `stale [--days N]` 默认阈值 7 天。
- 以最后一个结构化 lifecycle event 的时间为主；无新事件的历史 task 退回 `updated` 日期并明确标记 `legacy-date`，但不用于 outcome metrics。
- stale 只报告，不改变持久状态。
- `list` 默认隐藏 `archived`，继续隐藏超过既有窗口的 `done`；`--all` 显示全部。
- 可提供 `archive --stale --days N --reason ...` 的显式批量动作，但必须由用户调用。
- 自动任务只可清理已释放 lock/temp/cache；不删除 task、artifact、runtime 或 verification。

### 6.5 事件模型基础

每个新 lifecycle event 至少包含：

```json
{
  "schema_version": 1,
  "event_id": "...",
  "task_id": "...",
  "kind": "task.started",
  "occurred_at": "2026-07-10T00:00:00.000Z",
  "data": {}
}
```

- JSONL append 是事实源。
- task Markdown/state JSON 是可读投影；两者仍保持现有用户可见字段兼容。
- 使用注入 clock 测试，不依赖 sleep。

### 6.6 验证

```bash
node --test workflow/tests/js/task-*.test.js
bash workflow/tests/contract_repo.sh
bash workflow/tests/contract.sh
```

定向 fixture 覆盖并行 init、状态转换、done gate、archive 保留 artifacts、pointer 清理、stale 只读、malformed header 和历史 task 兼容。

### 6.7 完成门

- [x] task 生命周期由 JS 单一实现。
- [x] Bash 中 task-specific ID/render/status/lifecycle 业务已删除；未迁移领域的 metadata helpers 明确保留。
- [x] 当前公开输出和退出码兼容；新增命令有稳定 usage。
- [x] 现有 open tasks 可通过 stale report 盘点，命令不自动改写或删除 durable data。

Phase 2B 使用 `core/paths|atomic-file|lock|event-store` 与 `task/runtime|lifecycle` 承载真实行为；`codex-workflow` 减少约 316 行 task-specific Bash。blocked 暂不进入 legacy memory open-task 摘要，留待 Phase 5 memory-domain 决策，不影响 task list/stale 事实源。

## 7. Phase 3：Outcome events 与 latency report

phase_status: implemented

### 7.1 目标

用最小、可验证的事件模型衡量 workflow 从 `task.started` 到真实结果的时间，而不是继续把 gate duration 当 outcome。

### 7.2 新命令

```text
codex-workflow outcome-mark <task-id> \
  --kind first-code|operable-flow|clean-review \
  --evidence <path-or-url> \
  [--not-applicable "<reason>"]

codex-workflow outcome-report [--days N] [--json]
```

### 7.3 事件语义

- `first-code`：首个最终保留的 implementation slice。evidence 指向 diff、commit 或通过的 slice verification。
- `operable-flow`：首个真实可操作用户流。headless task 使用 not-applicable，不以 synthetic fixture 替代。
- `clean-review`：首个结构化 review verdict 为 clean 的证据。
- 同 kind 重复标记时，以最早的有效事件作为 latency 终点；撤销语义不在首版实现，错误标记通过显式修正任务处理。

### 7.4 报告语义

- 只扫描 schema v1 事件上线后的任务。
- 输出每个 kind 的 applicable count、known count、coverage 和 median duration。
- 同时输出 open stale task count，但不混入 outcome latency。
- 历史 task 或缺失事件显示 unknown。
- 不从 Git commit time、文件 mtime、task date 或自由文本 `detail` 推断。
- 不计算 active time、个人排名、agent 排名、SLO 或 dashboard。

### 7.5 验证

```bash
node --test workflow/tests/js/outcome-*.test.js
bash workflow/tests/contract_repo.sh
bash workflow/tests/contract.sh
```

使用注入时钟覆盖正常顺序、乱序文件行、not-applicable、缺失 start、重复 kind 和历史 unknown。这里只处理会影响正确结果的最小情况，不扩展为通用 telemetry 平台。

### 7.6 JS-first MVP 门

- [x] `outcome-mark` 只写 evidence-bound schema-v1 outcome event。
- [x] `outcome-report` 从合法 `task.created/task.started` 与 outcome event 计算 raw wall-clock latency。
- [x] historical unknown、prospective unknown、not-applicable 与 applicable coverage 分开报告。
- [x] Markdown/JSON 共用一个 report model；stale count 与 gate metrics 不混入 latency。
- [x] Phase 1–3 的 JS-first MVP 验证全部通过。

Phase 3 分成 marker `01e5526` 与 report `f35f87f` 两个独立 keeper commit；12/12 outcome tests、37/37 全部 JS tests、repo contract、dev-sync 与完整 contract 均通过。实现不从 Git、mtime、task date 或 legacy `detail` 推测历史结果；缺少合法 `task.created` 的任务只进入 `historical_unknown_count`，合法 prospective task 缺少 start 或 outcome 时按 kind 显示 unknown。Phase 4–6 继续按实际维护收益推进，不把 Bash 单体尚未完全消失视为 MVP 阻塞。

## 8. Phase 4：Artifact、readiness 与 verification 分域

phase_status: implemented

### 8.1 目标

迁移 Bash→Python 参数桥接最密集的纯数据领域，显著减少 `codex-workflow` 体积。

### 8.2 Slice 4A：Artifact planning commands

slice_status: implemented

- scaffold intake/brainstorm/clarify/team/phase。
- route-decision。
- checkpoint。
- source-snapshot。
- prompt-bundle。

推荐模块：

```text
artifact/paths.js
artifact/markdown.js
artifact/scaffold.js
artifact/routing.js
artifact/checkpoint.js
```

实施结果：

- [x] scaffold intake/brainstorm/clarify/team/phase 使用 CommonJS template renderer，Bash/Perl 实现已删除。
- [x] route-decision、checkpoint、source-snapshot、prompt-bundle 使用 CommonJS parser/writer。
- [x] task header、state、artifact 与 legacy runtime event 投影保持兼容。
- [x] 4A1 `1d08a5b`、4A2 `e3e8202`；artifact tests 12/12、all JS 49/49、repo/full contract 通过。
- [x] `codex-workflow` 收缩到 6,628 行，Python heredoc 收缩到 36 段。

### 8.3 Slice 4B：Readiness、feedback 与 verification

slice_status: implemented

- [x] ready/evaluate readiness。
- [x] verify、verification record 与 smoke 共用 record writer。
- [x] gate metric/report 保持独立 gate 语义，不与 outcome report 合并。
- [x] generic trace/feedback/lesson/learning decision。
- [x] handoff/result ingest/curated packet/Multica feedback 明确保留 Shell，不纳入本 slice。

实施结果：

- [x] 4B1 `19e6667`、4B2 `5dc5951`、4B3 `162f8b4`、4B4 `99bc7e9`。
- [x] targeted tests 19/19、全部 JS 68/68、repo/full contract 与 dev-sync sentinel 通过。
- [x] `codex-workflow` 收缩到 5,407 行，Python heredoc 收缩到 28 段。
- [x] `write_multica_feedback`/`cmd_multica_feedback` 与 Phase 4B 基线 function block diff=0。

### 8.4 验证

- 每个命令先建立迁移前 characterization fixture。
- 对 stdout、stderr、exit code、Markdown/JSON/JSONL 归一化结果做 differential test。
- 每个 slice 跑 repo contract；Phase 4 结束跑 full contract。
- 不一次性补齐 41 个命令的快照，只覆盖正在迁移的命令。

### 8.5 完成门

- [x] 所属 Python heredoc 已删除。
- [x] JS 与 Bash 不再双写同一个 artifact。
- [x] readiness 和 verify 的已有 gate 行为不变。
- [x] Multica-facing/计划弃用命令有明确 keep-shell 边界。

Phase 4 共完成 artifact、verification 与 feedback 三个 CommonJS 域；4B reviewers 全部 CLEAN（4B2 修复一项 quoting P2 后复审 CLEAN）。handoff/result/packet/Multica feedback 不为追求 JS 百分比强迁移，转入 Phase 5 的显式 keep-shell/planned-deprecation 决策。

## 9. Phase 5：剩余领域的 migrate/retire/keep-shell 决策

phase_status: implemented

authoritative_decision: ./evidence/phase-5-domain-decisions.md

### 9.1 Memory

- [x] `learn/dream/recall` 决定 keep-shell；它们是非默认 legacy fallback。
- [x] retire task mutation 后的隐式 memory sync，使高频 task command 可直接走 JS。
- [x] 不改变或删除历史 memory 文件；显式 `dream/learn` 继续运行既有 sync。

### 9.2 Team

- [x] native team record/finalize/loop-record/status/stop/promote 迁入 CommonJS。
- plugin 内已有 Node team tools 继续复用，不复制实现。
- [x] team-v1 `team-start/team-loop` 涉及 process、timeout、signal，决定 keep-shell。
- 不运行或修改 Multica team/router/listener。

### 9.3 Doctor/install/release

- [x] doctor/smoke/self-test/install-hooks 决定 keep-shell，避免重写稳定 host/process 合同。
- [x] `codex-refresh-local-plugin`、sync/install/release wrappers 继续 Bash/trigger-only。
- `atlas-plugin-integrity` 已是 JS，不重写。
- marketplace mutation、Atlas-only marketplace、exact-SHA rotation 不属于本 phase。

### 9.4 Multica-facing commands

- [x] handoff/result ingest/curated packet/Multica feedback 标记 planned-deprecation keep-shell。
- [x] 不迁移、不删除、不运行对应 Multica plugin/router/listener/tests/runtime。

### 9.5 决策门

领域决策已记录在 [phase-5-domain-decisions.md](./evidence/phase-5-domain-decisions.md)。Phase 5 唯一代码 slice 是 native team；其余领域以明确 keep-shell/retire 决定关闭，不追求形式上的全 JS。

实施结果：

- [x] keeper commits：领域决策 `74af117`；native team `0c86f66`。
- [x] native team targeted tests 6/6、全部 JS tests 74/74、repo contract 通过。
- [x] native/legacy team 独立 reviewer `CLEAN`；forbidden repo paths diff=0。
- [x] `codex-workflow` 收缩到 4,773 行、26 段 Python heredoc。

## 10. Phase 6：公开入口收缩与最终回归

phase_status: pending

### 10.1 前置条件

- task、outcome、artifact、readiness、verification 高频领域已由 JS 单一实现。
- 剩余 Shell 命令已被明确归类为独立 launcher 或退役项。
- 入口不再需要加载大段 Bash 函数才能执行高频命令。

### 10.2 目标入口

```bash
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/lib/codex-workflow/cli.js" "$@"
```

最终实现可进一步使用 POSIX `sh`，但只有现有测试和 shim 不依赖 Bash 时才做；本计划不把 shebang 变化设为必要目标。

### 10.3 最终验证

```bash
node --check workflow/bin/lib/codex-workflow/cli.js
node --test workflow/tests/js/*.test.js
bash workflow/tests/contract_repo.sh
bash workflow/tests/contract_host_install.sh
bash workflow/tests/contract.sh
bash workflow/tests/integration_atlas_plugin_dev_sync.sh
git diff --exit-code -- plugins/multica-sdlc .agents
```

release integration 只在最终 diff 触及 release/marketplace 相关路径时运行。

## 11. 验证分层

| 层级 | 何时运行 | 内容 |
| --- | --- | --- |
| Fast | 每个实现循环 | `node --check`、相关 `node --test`、单命令 fixture |
| Domain | 每个 slice 完成 | `contract_repo.sh` + domain contract |
| Full | 每个 phase 完成 | `contract.sh` |
| Layout | 新增/移动 managed files 或改 sync/install | dev-sync + host-install |
| Release | 仅改 release/marketplace/integrity | release integration/strict doctor |
| Forbidden | 每个 phase 前后 | Multica/.agents changed-path check |

此分层是本轮加速的核心：不删除重要门禁，只让无关门禁退出日常关键路径。

## 12. 提交切片

建议每个 slice 一个可回退 Conventional Commit：

1. `feat(workflow): generate task slugs in JavaScript`
2. `refactor(workflow): move task reads to JavaScript`
3. `feat(workflow): add blocked and archived task lifecycle`
4. `feat(workflow): record structured outcome events`
5. `feat(workflow): report outcome latency`
6. 后续 artifact/evidence 按命令组独立提交。

不要把目录重排、行为变化和全量格式化放进同一提交。

## 13. 全局停止条件

出现以下任一情况时停止当前 slice 并缩小范围：

- 为迁移 task/metrics 被迫修改 team、doctor、release 或 marketplace 领域。
- 新 Bash 代码继续承载业务规则，而不只是 delegation/exec。
- 需要第三方 npm 依赖或 build step。
- migrated command 的既有 CLI、文件 schema 或退出码发生未批准破坏。
- 需要批量改名或重写历史 task/artifact。
- outcome metrics 只能依赖自由文本、Git 时间或推测回填。
- 一个 slice 同时跨两个无直接依赖的领域。
- hermetic contract 读取真实 HOME 或修改真实 runtime。
- `plugins/multica-sdlc/**`、`.agents/**` 或 Multica runtime 出现任何写入/diff。
- 为 JS-first 需要开放 shared marketplace mutation 或削弱现有 fail-closed。

## 14. Trigger-only 发布 backlog

以下事项从近期 roadmap 移除：

- shared marketplace release mutation。
- Atlas-only marketplace。
- safe exact-SHA rotation。
- release `--execute`。

只有出现第二使用者、第二台长期机器、自动分发或正式 rollback 需求时，才创建新的 architecture/clarify task。届时以前一轮 release integrity bundle 为安全基线，本计划不提前设计其协议。
