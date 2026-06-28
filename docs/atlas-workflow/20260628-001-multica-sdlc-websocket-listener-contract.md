# Multica SDLC WebSocket Listener 实现契约

Task: `20260628-001-multica-sdlc-websocket-listener`

## 目标

在 `plugins/multica-sdlc` 中实现一个由 Codex 启动并托管的 WebSocket listener。它通过 Multica realtime events 触发、API/CLI 权威状态回读、共享 Node router 决策、journal/dedupe 和受限 `--apply`，补足 GEW-36/GEW-37 这类非 terminal gate 下 parent leader 继续推进的问题。

## 选定方向

采用插件侧 supervisor/listener，不改 Multica runtime。WebSocket frame 只作为触发信号；事实必须回读或从约定化 metadata/comment/task artifact 归一化。路由复用现有 router，不新增第二套路由逻辑。

实现语言切换为 JavaScript/Node.js。Listener 文件为 `plugins/multica-sdlc/scripts/multica-sdlc-listener.js`，wrapper 仍为 `plugins/multica-sdlc/scripts/multica-sdlc-listener`。当前方案优先使用 Node 运行时内置 `fetch` 和全局 `WebSocket`，不新增 npm WebSocket 依赖；验证环境为 Node `v24.15.0`。

## 非目标

- 不持续轮询。
- 不自动 merge PR。
- 不自动 mark done/cancelled。
- 不取消任务或绕过 review。
- 不改权限、模板或 Multica parent/child terminal 语义。
- 不保存 token、cookie、private key、API key、raw secret 到日志。

## 决策边界

- Listener 放在 `plugins/multica-sdlc/scripts/`，文档放在 `plugins/multica-sdlc/docs/`。
- 默认 `dry-run`；`--apply` 必须显式开启并配合 `--allow-action`。
- 第一版 apply 白名单只允许 `comment`、`leader-task`、`metadata`；若 leader task 入口未确认，则只交付 `comment` 和 `metadata`。
- 启动和重连后允许 bounded reconciliation，仅限 watched parent/issue/child/PR/recent task/comment，不扫描整个 workspace。
- 多实例并发不是第一版强保证，必须记录为 residual risk。

## 事实契约

Listener 必须生成与 `plugins/multica-sdlc/scripts/multica-next-role-router` 兼容的 event JSON，并调用共享 router core，不在 listener 内复制第二套路由规则。

| Field | Source priority | Missing behavior |
|-------|-----------------|------------------|
| `issue_id` | WS payload、PR `linked_issue_ids`、API hydrated issue | 无法绑定 watched issue 时丢弃。 |
| `parent_issue_id` | issue detail 或 children API | 禁用 parent-specific correction。 |
| `phase` | `multica_sdlc.phase` metadata、结构化 comment/artifact、dry-run-only classifier | 缺失则 `blocked_unknown_fact`，不 apply。 |
| `source_role` | metadata、agent role map、结构化 comment/artifact | 缺失则 `blocked_unknown_fact`。 |
| `result` | 结构化 comment/artifact、metadata result；不能仅靠 `task:completed` | 缺失则 wait/block，不视为 DONE。 |
| `commit_sha` | metadata、comment/artifact、PR head SHA | 模板要求时缺失则 blocker/dry-run。 |
| `completed_roles` | 同 phase/commit 的 metadata/comment artifacts 聚合 | 缺 required role 则 wait。 |
| `pr_state` | `/api/issues/{id}/pull-requests` | API 失败则禁用 PR correction。 |
| `children` | `/api/issues/{id}/children` 或 batch children API | 读取失败则禁用 barrier classification。 |

## CLI 边界

最小启动形态：

```bash
plugins/multica-sdlc/scripts/multica-sdlc-listener \
  --ws-url wss://.../ws \
  --api-url https://... \
  --workspace-slug sharp-cell \
  --watch-parent GEW-36 \
  --template plugins/multica-sdlc/templates/multica-sdlc-workflow.yaml \
  --journal ~/.agents/multica-sdlc/listener-journal.jsonl \
  --dedupe-store ~/.agents/multica-sdlc/listener-dedupe.jsonl \
  --token-env MULTICA_TOKEN \
  --dry-run
```

必备开关：`--apply`、`--allow-action comment,leader-task,metadata`、`--watch-issue`、`--watch-parent`、`--metadata-filter`、`--agent-allowlist`、`--squad-allowlist`、`--once`、`--max-events`、`--log-json`、`--state-dir`。

## 状态机

```text
disconnected
-> connecting
-> authenticating
-> snapshot_or_reconcile
-> listening
-> event_received
-> filter
-> hydrate_authoritative_facts
-> normalize_router_event
-> route
-> dry_run | apply
-> record_state
-> listening
```

分类码：`terminal_child_barrier`、`nonterminal_leader_gate`、`leader_missing_next_stage`、`unstaged_sibling_barrier`、`stale_commit_or_pr`、`missing_required_role`、`duplicate_action`、`blocked_unknown_fact`。

## 验收标准

- Listener 能连接 WS、首帧 token auth、处理 `auth_ack`、坏帧、auth error、断线重连。
- Listener 在 hydrate 前按 watched parent/issue/metadata/agent/squad 过滤 workspace fanout。
- Listener 能从 issue、children、PR、metadata、task runs/messages 归一化 router-compatible event JSON。
- Listener 调用共享 router core，不复制路由规则。
- `--dry-run` 不做任何写操作。
- `--apply` 只能执行白名单动作，且重复事件被 dedupe。
- 启动/重连 bounded reconciliation 只访问 watched scope。
- journal/stdout redaction 覆盖 bearer token、cookie、private key、API key、raw env-like secrets。

## 验证计划

```bash
plugins/multica-sdlc/scripts/self-test-router.sh
node --check plugins/multica-sdlc/scripts/multica-sdlc-listener.js
plugins/multica-sdlc/scripts/self-test-listener.sh
```

实现时需补充或记录实际测试命令，覆盖：

- listener event normalization；
- fake WS auth/reconnect/malformed frame；
- API mock hydrate；
- dry-run zero-write；
- apply allowlist；
- duplicate dedupe；
- bounded reconciliation；
- journal/stdout redaction。

## 停止条件

- 需要修改 Multica runtime 语义才能达成目标。
- 无法确认稳定 apply 入口。
- 无法避免 token/raw secret 入日志。
- 无法生成 router-compatible facts，需要新增第二套路由逻辑。

## 下一步

用 `$atlas-workflow:task` 进入实现。实现语言使用 JavaScript/Node.js；若目标运行环境没有全局 `WebSocket`，不得擅自引入 broad dependency，应先记录依赖选择并验证。`leader-task` 的稳定 API/CLI 入口未确认时，首版只交付 `dry-run`、`comment` 和 `metadata`。
