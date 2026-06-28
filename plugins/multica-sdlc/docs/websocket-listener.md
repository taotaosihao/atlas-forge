# Multica SDLC WebSocket Listener

`scripts/multica-sdlc-listener` 是 Codex 托管的 Multica SDLC 监听器。它使用
Node.js 运行，不引入 npm 依赖；当前验证环境是 Node `v24.15.0`，依赖 Node
内置 `fetch` 和全局 `WebSocket`。

## 职责边界

- WebSocket frame 只作为触发信号。
- 事实必须通过 Multica HTTP API 回读，或从约定化 metadata/comment/task
  artifact 归一化。
- 路由使用 `scripts/multica-next-role-router-core.js`，与
  `scripts/multica-next-role-router` 共用同一份规则。
- 默认 `dry-run`，只输出 stdout 和 journal，不执行写操作。
- `--apply` 必须配合 `--allow-action`。
- 第一版实际写操作只实现 `comment` 和 `metadata`。
- `leader-task` 入口未确认，传入 `--allow-action leader-task` 时只记录
  `leader-task:blocked`。

禁止动作：自动 merge PR、自动 mark done/cancelled、取消任务、绕过 review、改权限、
改模板、从事件内容执行 shell、写入 token/cookie/private key/API key/raw secret。

## 启动示例

```bash
export MULTICA_TOKEN=...

plugins/multica-sdlc/scripts/multica-sdlc-listener \
  --ws-url wss://multica.example/ws \
  --api-url https://multica.example \
  --workspace-slug sharp-cell \
  --watch-parent GEW-36 \
  --template plugins/multica-sdlc/templates/multica-sdlc-workflow.yaml \
  --journal ~/.agents/multica-sdlc/listener-journal.jsonl \
  --dedupe-store ~/.agents/multica-sdlc/listener-dedupe.jsonl \
  --token-env MULTICA_TOKEN \
  --dry-run
```

`--ws-url` 不携带 token。listener 会在 WebSocket 打开后发送首帧
`{"type":"auth","payload":{"token":"..."}}`，stdout/journal 会做脱敏。

## Watch Filter

必须至少提供一个 watch filter：

- `--watch-parent GEW-36`
- `--watch-issue GEW-37`
- `--metadata-filter multica_sdlc.phase=implementation`
- `--agent-allowlist agent-id`
- `--squad-allowlist squad-id`

listener 会先用原始 frame 做粗过滤，再 hydrate issue/children/PR/metadata/task
messages 后确认 watched scope。粗过滤识别顶层 `issue_id`、`parent_issue_id`、
`linked_issue_ids`、`payload.issue.id`、`payload.issue.parent_id`、
`payload.issue.parent_issue_id`、`payload.comment.issue_id` 和
`payload.pull_request.*` 中的 issue 引用。workspace fanout 中无关事件会被记录为
`watch_filter_miss` 并跳过。若使用 `--watch-parent` 且 frame 未携带 parent 引用
（例如 task/comment 事件通常只有 child issue id），listener 会做一次 bounded hydrate
后再用权威 parent 判断。

## Bounded Reconciliation

listener 不持续轮询。它只在这些时机做有界回读：

- 启动后；
- WebSocket 重连后；
- 测试时显式传入 `--reconcile-only`。

回读范围只包括 watched parent/issue、对应 children 和 linked PR。第一版不会扫描整个
workspace。

## Apply

默认 dry-run：

```bash
plugins/multica-sdlc/scripts/multica-sdlc-listener ... --dry-run
```

受限 apply：

```bash
plugins/multica-sdlc/scripts/multica-sdlc-listener ... \
  --apply \
  --allow-action comment,metadata
```

`comment` 会向 watched parent/issue 追加结构化 listener comment。`metadata` 只写
`multica_listener.*` primitive metadata。重复事件通过本地 JSONL dedupe 抑制；多实例并发
仍可能重复写，建议一个 workspace/parent 只保留一个 owner session。

## Journal

journal 是 JSONL，默认路径：

```text
~/.agents/multica-sdlc/listener-journal.jsonl
```

核心字段包括：`event_type`、`issue_id`、`parent_issue_id`、`classification`、
`router_decision`、`apply_mode`、`apply_action`、`apply_result` 和 `redactions`。

## 验证

```bash
node --check plugins/multica-sdlc/scripts/multica-sdlc-listener.js
plugins/multica-sdlc/scripts/self-test-router.sh
plugins/multica-sdlc/scripts/self-test-listener.sh
```

`self-test-listener.sh` 使用 Node fake API 和 fake WebSocket，覆盖首帧 auth、
malformed frame、dry-run zero-write、apply allowlist、duplicate dedupe、
bounded reconciliation 和 journal redaction。
