# Atlas Forge JS-first 自用工作流最终实施合同

workflow_id: 20260710-001-atlas-forge-js-first-self-use-workflow-replan
task_id: 20260710-001-atlas-forge-js-first-self-use-workflow-replan
title: Atlas Forge JS-first 自用工作流渐进迁移
contract_status: final
current_authoritative_contract: ./implementation-contract.final.md
contract_semantics_version: 1
work_type: implementation
created: 2026-07-10
finalized: 2026-07-10

first_code_guard: required
first_code_slice: 实现 `workflow/bin/lib/codex-workflow/task/id.js`，由现有 task-id 生成路径调用，并修复重复前缀 slug
first_code_slice_kind: cli
first_code_owner: Phase 1 workflow implementer
first_code_verification: `node --test workflow/tests/js/task-id.test.js`
allowed_contract_gate_only_until: 本合同批准；Phase 1 不允许先提交纯目录或空 abstraction
stop_if_no_code_by_phase: Phase 1
gate_parallelization_or_deferral_plan: 只读 architecture review 可并行；release、host-install 与全量 team/doctor gate 按 changed surface 延后

product_ui_gate: not_applicable
product_ui_not_applicable_reason: 本任务修改本地 headless CLI、文件状态与报告，不提供浏览器 UI
first_operable_user_flow: not_applicable
browser_entrypoint: not_applicable
served_ui_validation_action: not_applicable
ui_data_mode: not_applicable
required_safety_gates: hermetic task contract、CLI compatibility、Multica forbidden-path check
allowed_headless_only_until: task completion
stop_if_no_ui_by_phase: not_applicable

## 范围

- 在 `workflow/bin/lib/codex-workflow/` 下建立按真实命令逐步增长的 CommonJS 模块。
- 修复新 task 的 slug：剥离一个已有 task-id 前缀、限制长度、对非 ASCII-only title 使用稳定短 SHA-256 token。
- 将 task read/write/lifecycle/current pointer/runtime event 迁移到 JS。
- 增加 `blocked`、`archived`、`block`、`resume`、`archive` 和 derived stale report。
- 增加 evidence-bound `first-code|operable-flow|clean-review` outcome events 和本地 latency report。
- 继续迁移 readiness、artifact、verification 等高频领域，并最终把公开 Bash 入口收缩为薄 façade。
- 对 memory、native team、legacy team 和 doctor 分别做 migrate/retire/keep-shell 决策，不要求机械全量翻译。
- 使用当前 Node `v24.15.0`、CommonJS、Node 标准库和 `node:test`；不新增依赖或 build step。

## 非目标

- 不一次性重写 8,197 行 `codex-workflow`。
- 不创建 npm 工程，不引入 TypeScript、ESM 迁移、第三方 CLI/parser/metrics 库。
- 不建立 Node 多版本、Windows 或多 shell 兼容矩阵。
- 不批量改名、改写或迁移历史 tasks/artifacts。
- 不自动删除 task、artifact、verification、decision 或 runtime events。
- 不用 Git time、mtime、task date 或自由文本回填历史 outcome latency。
- 不做 dashboard、数据库、telemetry 服务、个人/agent 排名或 workflow SLO。
- 不修改、迁移、运行、测试、bump、卸载或删除 Multica。
- 不开放 shared marketplace mutation，不设计/实现 Atlas-only marketplace、exact-SHA rotation 或 release `--execute`。
- 不为语言统一而立即重写稳定的 sync/install/release Bash wrapper。

## 锁定架构

1. 迁移期公开 `workflow/bin/codex-workflow` 仍是可通过 `bash -n` 的 Bash dispatcher。
2. 已迁移命令在 dispatcher 中委托到 `workflow/bin/lib/codex-workflow/**`。
3. 每个领域迁移完成后删除对应 Bash 业务实现；不保留双写或第二套 parser。
4. JS module 使用 CommonJS、`"use strict"`、Node 标准库和当前仓库代码风格。
5. module root 固定在 `workflow/bin/lib/`，沿用现有递归 sync；本合同不新增 `workflow/lib/` managed root。
6. 高频领域迁移完成后，公开入口收缩为只做环境定位和 `exec node` 的 façade。
7. Phase 1 使用 task-ID 专用 delegate；共享 legacy `title_token()` 保留给 `learning_basename()`，直到 memory 领域另行迁移或退役。

## Task 状态合同

持久状态只允许：

<code>to&#100;o</code> | `doing` | `blocked` | `done` | `archived`

| Action | From | To | Required behavior |
| --- | --- | --- | --- |
| `start` | <code>to&#100;o</code> | `doing` | 写 current pointer 和 `task.started` |
| `block --reason` | `doing` | `blocked` | 清 pointer，保留 reason，写 event |
| `resume` | `blocked` | `doing` | 恢复 pointer，写 event |
| `done` | `doing` | `done` | successful verification gate 保持 |
| `archive --reason` | <code>to&#100;o|doing|blocked|done</code> | `archived` | 清 pointer；保留 task/artifacts；不要求 verification |

- `stale` 是派生属性，不写入 status。
- 默认 stale threshold 为 7 天，可通过命令参数覆盖。
- `list` 默认隐藏 archived，`--all` 显示；既有 tab 输出、排序和 done 时间窗保持兼容。
- 首版不提供 paused/canceled/abandoned/unarchive。
- 自动整理只可删除当前命令拥有的 temp、已释放 lock 或可重建 cache，不得删除 durable evidence。

## Slug 合同

- 只影响合同实施后的新 task。
- task ID 保持 `YYYYMMDD-NNN-slug`。
- 原始 title 原样保留。
- title 先执行 NFC + trim；生成 slug 前剥离开头最多一个 `YYYYMMDD-NNN-`。
- ASCII slug 保持 lower-kebab，最大 64 个字符。
- 没有 ASCII token 时使用 `u-` 加标准化 title 的 SHA-256 前 12 位 hex。
- 不做中文拼音、不允许 Unicode task ID、不改名历史 task。
- 同日序号和并行创建继续由锁保护，不允许产生相同 ID。
- learn/memory basename 继续使用 legacy title token，本 phase 不改变其文件名。

## Outcome event 合同

每个新事件至少包含：

```text
schema_version
event_id
task_id
kind
occurred_at
data
```

Outcome kind：

- `first-code`：首个最终保留的 implementation slice，必须带 evidence ref。
- `operable-flow`：首个真实可操作用户流；headless 明确 not-applicable。
- `clean-review`：首个结构化 clean verdict，不能搜索自然语言代替。

Latency report：

- 起点固定为结构化 `task.started`。
- 终点为上述 outcome 的首个有效事件。
- 第一版只输出 applicable count、known count、coverage 和 median raw wall time。
- 只统计 schema 上线后的 prospective task。
- 旧任务或缺少精确事件时输出 unknown；不得推测回填。
- `gate-metric` 保持 gate 使用/耗时语义，不与 outcome event 合并。

## 验收标准

| ID | Criterion | Required | Verification |
| --- | --- | --- | --- |
| AC-01 | 新业务逻辑使用 CommonJS/Node 标准库，无 npm manifest、依赖或 build step | yes | JS source/manifest audit + `node --check` |
| AC-02 | slug 剥离重复 task-id 前缀、限制长度、稳定处理非 ASCII；普通 ASCII 行为兼容 | yes | `node --test workflow/tests/js/task-id.test.js` + init-task CLI fixture |
| AC-03 | 只影响新 task，不改名或改写历史 task/artifact | yes | before/after task tree fingerprint |
| AC-04 | migrated command 的公开路径、既有 flags、stdout/stderr、exit code 和文件投影兼容 | yes | per-command characterization/differential tests |
| AC-05 | <code>to&#100;o|doing|blocked|done|archived</code> 转换、pointer 和 verification gate 符合合同 | yes | task lifecycle unit + CLI contract |
| AC-06 | stale 只读；archive 保留 task 和 artifacts；无 durable automatic deletion | yes | stale/archive negative fixtures |
| AC-07 | task lifecycle 与 outcome 使用结构化、版本化 JSONL event | yes | schema/event-store tests |
| AC-08 | outcome report 只从 started 和 evidence-bound outcome event 计算 | yes | injected-clock report fixtures |
| AC-09 | 历史缺失事件显示 unknown，不使用 Git/mtime/date/detail 回填 | yes | legacy/negative report fixtures |
| AC-10 | 每个已迁移领域删除 Bash 业务实现，不存在双写 | yes | source audit + mutation fixture |
| AC-11 | `workflow/bin/lib/` 通过现有 Atlas dev sync 和 source/install equality | yes | `integration_atlas_plugin_dev_sync.sh` |
| AC-12 | repo/full contract 在隔离 root 通过，不读取真实 HOME | yes | `contract_repo.sh` + `contract.sh` |
| AC-13 | release/marketplace 行为未改变，shared mutation 继续 fail closed | yes | changed-path audit；仅相关改动运行 release contract |
| AC-14 | Multica 和 `.agents/**` 零修改、零 runtime 调用 | yes | forbidden-path diff/fingerprint |
| AC-15 | Phase 1–3 形成可独立停止的 JS-first MVP | yes | phase conclusions + architecture review |

## 分阶段交付

| Phase | Keeper outcome | Required verification | Completion effect |
| --- | --- | --- | --- |
| 1 | JS task-id module + slug fix | `node:test`、repo contract、dev sync | 首个真实 JS 行为 |
| 2 | JS task repository/lifecycle + blocked/archive/stale | task unit/CLI、repo/full contract | task hygiene 和可靠事件基础 |
| 3 | outcome-mark/report | outcome tests、repo/full contract | JS-first MVP 完成 |
| 4 | artifact/readiness/verification domains | per-command differential、full contract | 删除主要 Python heredoc 桥接 |
| 5 | memory/team/doctor migrate-retire decisions | domain-specific | 只保留有价值的 legacy |
| 6 | thin public façade | full/layout/forbidden checks | 主 CLI 模块化完成 |

## 真实验证计划

| Row | Target | Command or action | Expected result |
| --- | --- | --- | --- |
| V-01 | JS syntax/unit | `node --check <changed-js>`；`node --test workflow/tests/js/*.test.js` | 当前 slice 语义通过 |
| V-02 | Bash façade | `bash -n workflow/bin/codex-workflow` | 迁移期入口仍是有效 Bash |
| V-03 | Hermetic repo | `bash workflow/tests/contract_repo.sh` | 不读取真实 HOME，迁移命令通过 |
| V-04 | Full workflow | `bash workflow/tests/contract.sh` | phase 结束全回归通过 |
| V-05 | Managed layout | `bash workflow/tests/integration_atlas_plugin_dev_sync.sh` | `bin/lib` 被递归同步且 equality 通过 |
| V-06 | Host layout | `bash workflow/tests/contract_host_install.sh` | 只在 layout/sync 改动时运行并通过 |
| V-07 | Release | release/integrity contracts | 只在 release surface 变化时运行；普通 slice 跳过 |
| V-08 | Forbidden paths | `git diff --exit-code -- plugins/multica-sdlc .agents` | 无 Multica/.agents diff |
| V-09 | Docs/contract | relative-link checker + strict implementation-contract lint | bundle 可追踪且执行就绪 |

## 失败与停止条件

- Phase 1 在没有 keeper behavior 的情况下只提交框架、目录或 abstraction。
- 为 task/metrics slice 必须修改 team、doctor、release 或 marketplace 领域。
- 需要第三方 npm 包、package manager、build step 或新的 runtime service。
- 既有命令的 CLI/schema/exit code 发生未批准 breaking change。
- 同一领域仍由 Bash 与 JS 双写，无法确定事实源。
- 需要批量改名、重写或推测回填历史 task/artifact。
- outcome report 只能从自由文本、Git 时间、mtime 或 task date 推断。
- hermetic test 读取/写入真实 HOME、Codex cache 或私钥目录。
- 修改触及 `plugins/multica-sdlc/**`、`.agents/**` 或任一 Multica runtime。
- 为实现 JS-first 需要开放 shared marketplace mutation、删除 fail-closed 或削弱既有 release integrity。
- 单个 slice 扩展到两个无直接依赖的领域；此时必须拆分后再继续。

## 发布与验证优先级

- 发布安全从 P0 降为 trigger-only；现有 guard 不删除。
- 日常 task/workflow slice 只跑 Fast + Domain gate。
- phase 结束跑 Full gate。
- layout/sync 改动才跑 host/layout gate。
- release surface 改动才跑 release gate。

## Provenance

- Based on: 用户 2026-07-10 的纯自用、JS-first 与发布降级决策；本任务 brainstorm、clarify 和双只读审查。
- Continues: 上一轮 release-integrity bundle 已实现的 fail-closed、integrity 与 doctor 行为。
- Supersedes: 上一轮计划中 marketplace/exact-SHA/outcome/task/module backlog 的优先级与执行顺序。
- Does not supersede: 已实施 release 保护的行为合同。

## Final Contract Cleanliness Gate

- [x] 首个代码切片是 task slug 真实行为，不是纯准备工作。
- [x] JS-first、状态、metrics、模块化与 release 降级边界均已锁定。
- [x] 未把 shared mutation、Atlas-only marketplace 或 exact-SHA 写入当前执行范围。
- [x] 未把 Multica 纳入实现、测试、发布或迁移范围。
- [x] 验收标准、验证层级、停止条件和 phase outcome 完整。
- [x] 自动整理不包含 durable data deletion。
- [x] 历史 outcome 缺失被定义为 unknown，不做伪造回填。
