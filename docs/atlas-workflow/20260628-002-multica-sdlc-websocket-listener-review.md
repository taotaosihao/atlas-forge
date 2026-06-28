# Multica SDLC WebSocket Listener 实现 Review

- task_id: `20260628-002-multica-sdlc-websocket-listener-implementation-team-review`
- review date: 2026-06-28
- decision: **暂不提交/推广，先修 P1 阻塞。**

## 结论

JS/Node 实现方向正确：listener、共享 router core、默认 dry-run、journal、`--apply` allowlist、`leader-task` 阻塞策略和自测都已经具备。但当前 listener 对 Multica 真实事件 payload 的 issue id 提取不完整，会在 watch pre-filter 阶段丢弃关键事件，挡住 GEW-37 进入 `in_review` 后推动 GEW-36 的主路径。

## P1 阻塞

`plugins/multica-sdlc/scripts/multica-sdlc-listener.js` 的 `extractIssueIds()` 只读取顶层 `issue_id`、`id`、`parent_issue_id`、`linked_issue_ids` 和 `payload.pull_request.*`。Multica 真实事件中：

- `issue:updated` / `issue:created` 使用 `payload.issue`。
- `comment:created` 使用 `payload.comment`。

证据路径：

- `/home/gewu/work/atlas-forge/plugins/multica-sdlc/scripts/multica-sdlc-listener.js:346`
- `/home/gewu/work/atlas-forge/plugins/multica-sdlc/scripts/multica-sdlc-listener.js:381`
- `/home/gewu/work/multica/packages/core/types/events.ts:91`
- `/home/gewu/work/multica/packages/core/types/events.ts:165`
- `/home/gewu/work/multica/server/internal/handler/issue.go:2551`
- `/home/gewu/work/multica/server/internal/handler/comment.go:1254`

复现结果：真实形状 `issue:updated` 和 `comment:created` 在 `--watch-issue GEW-37` 下都会输出 `watch_filter_miss`，不会进入 hydrate/route/journal 的有效决策路径。

## 修复门槛

- `extractIssueIds()` 支持 `payload.issue.id`、`payload.issue.parent_id`、`payload.issue.parent_issue_id`。
- `extractIssueIds()` 支持 `payload.comment.issue_id`。
- 保留现有 `issue_metadata issue_id`、task 顶层 `issue_id`、`linked_issue_ids`、`payload.pull_request.*` 支持。
- 补充 listener self-test 或 fixtures 覆盖真实 nested `issue:updated` 和 `comment:created`。
- 修复后复现不再输出 `watch_filter_miss`。

## 非阻塞风险

- `--watch-parent` 粗过滤过宽，会对无关 issue 事件先 hydrate 再丢弃，可能造成 API 放大和 journal 噪声。
- Node runtime 依赖全局 `fetch` / `WebSocket`；发布说明需要明确最低 Node 版本或 fallback 策略。
- 旧 Python router 已删除，本轮只验证 smoke parity，未做完整历史输出 diff。

## 已通过验证

- `node --version` -> `v24.15.0`
- `node --check plugins/multica-sdlc/scripts/multica-sdlc-listener.js`
- `node --check plugins/multica-sdlc/scripts/multica-next-role-router-core.js`
- `node --check plugins/multica-sdlc/scripts/multica-next-role-router.js`
- `plugins/multica-sdlc/scripts/self-test-router.sh`
- `plugins/multica-sdlc/scripts/self-test-listener.sh`

## 下一步

先修 P1，再做短 review。P1 清除且验证通过后，可进入提交/推广。
