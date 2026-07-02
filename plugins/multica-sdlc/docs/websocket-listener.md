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
- 第一版实际写操作实现 `metadata`、显式 opt-in 的 `comment`，以及受限的
  `leader-task`。
- `leader-task` 只在 decision 标记 `leader_required` 时生效，通过
  `POST /api/issues/{id}/rerun` 调起该 issue 当前 assignee/leader 的新任务；它不改
  issue 状态、不清 blocker、不写 waiver、不改合同。

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
  --drop-log-every 50 \
  --observe-log-every 50 \
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

启动和重连回读不是单纯健康检查。listener 会先读取 watched issue 的真实状态、
children 和 PR，再做一次当前状态判定：

- 如果当前状态不需要推进，记录 `listen_current_state`/等待类决策后继续监听后续事件。
- 如果 child 已经是 `in_review`、已有 draft/open PR、或 child 已 terminal 且 parent
  在 watched scope 内，listener 会把它视为 parent leader 可见性问题。
- 如果 SDLC metadata/task fact 足够，listener 使用 router 结果决定是否推进。
- 如果 metadata 缺失但真实 issue/PR 状态已经说明需要继续，listener 会生成
  `decision_source: state_guard` 的受限 continuation decision。
- 如果 watched child 已进入 `in_review`、已有 draft/open PR、或触发
  `pull_request:*`，且 parent 在 watched scope 内，listener 会生成
  `nonterminal_leader_gate`。在 `--apply --allow-action metadata,leader-task` 下，
  guard 会先检查 parent active task；若没有 queued/dispatched/running task，则对
  watched parent 调用 `/rerun`，让 Leader 决定继续下一阶段、等待 review、补合同或声明
  blocker。
- 对于 expected-stage-order epic，child clean gate 后产生的 draft/open PR 是阶段交接信号，
  不是 parent 停止条件。Router 必须读取最新 child issue 和
  `multica issue pull-requests <child>`，确认没有显式 `DECISION_REQUIRED` wait lock 后，
  以 `ROUTE_ONLY` / `block_downstream=false` 继续创建或 promote 下一阶段 child；旧 child
  的 human review、merge 和 post-merge cleanup 继续留在旧 child 上跟踪。
- continuation stall 的去抖使用任意 active parent/child task，而不是只看 blocking task。
- Lark 通知默认开启。guard 在检测到 watched parent 下的子 issue 进入 `in_review` /
  `review` / `done` / `completed`、明确人工 blocker（例如 `HUMAN_DECISION_REQUIRED`、
  `continue_without_user=false`、或 issue 进入 `blocked`），以及 conservative completion audit
  得到 `ALL_COMPLETE` 时通知。默认优先读取个人目录
  `~/.agents/multica-sdlc/lark-notify-config.json` 中的飞书自定义机器人
  `webhook_url` / `webhook_secret` 并发送 webhook；也可用 `LARK_WEBHOOK_URL` /
  `LARK_WEBHOOK_SECRET` 或命令行参数覆盖。未配置 webhook 时才 fallback 到
  `lark-cli im +messages-send`。如果没有任何目标，只写 `lark-notify.jsonl`
  的 `skipped_missing_target`，不阻塞 guard。
  即使当前活跃的是 `ROUTE_ONLY` / `block_downstream=false` control-plane task，listener 也
  不会重复 `/rerun`，避免新任务取消正在读取状态和建下一阶段的 Router。
- 如果 watched child 的 `comment:created`、`task:completed` 或 `task:failed`
  已进入 scope，但缺少 `multica_sdlc.phase`、`multica_sdlc.source_role`、
  `multica_sdlc.result`，listener 会生成 `missing_sdlc_facts` warning decision。
  在 `--apply --allow-action metadata,leader-task` 下，guard 会写 metadata 并 rerun
  watched parent，让 Leader 或 child owner 补齐事实；不会自动改状态、merge PR、刷
  issue comment 或绕过 review。
- 如果同一 watched parent 下的同一异常连续出现 `comment:created`、`task:completed`
  或 `task:failed`，但 `stage`、`phase/source_role/result`、child status、PR/commit
  等关键事实没有变化，listener 会记录 ineffective repair counter。达到
  `--ineffective-repair-threshold` 后，在允许 `leader-task` 时改为
  `ineffective_repair_escalation`，对 watched parent rerun 一次 Leader。该升级只在
  watched parent scope 内生效，不影响单独 `--watch-issue` 的普通监听。
- 如果 watched parent 下存在多个 child 且任一 child 缺少 `stage`，listener 会生成
  `unstaged_sibling_barrier` warning decision。该 warning 说明 terminal-child wake
  可能被所有 unstaged siblings 阻塞；guard 会 rerun watched parent，要求 Leader 补
  stage 或不要依赖平台自动 parent wake。
- 如果 watched child 进入 `blocked`，listener 会生成
  `blocked_issue_leader_decision`。在 `--apply --allow-action metadata,leader-task`
  下，guard 会写 metadata 并对该 blocked child 调用 `/rerun`，让 Leader/assignee
  做显式 blocker disposition 或修复计划；guard 自身不得清 block。
- 对必须分阶段完成的父任务，可传入 `--expected-stage-order`。如果 watched parent
  已有若干 child 进入 review/terminal、父子 issue 都没有 active task、且下一阶段 child
  未出现，listener 会记录 `codex_intervention_required` / `continuation_stalled`。
  该信号会写 stdout、listener journal 和 `codex-wake.jsonl`；在
  `--apply --allow-action metadata,leader-task` 下，listener 还会对 watched parent
  调用 `/rerun`，让 Multica Leader 决定是否创建下一阶段、要求 PR review、补合同或声明
  blocker。它不会向 issue 写 comment，也不会替 Leader 创建 child、改状态或合并 PR。
- `task:message` 是 observe-only 事件：无结构化 `multica_sdlc` JSON 时只写
  `task_message_observed` journal，不执行写操作；如果消息中包含结构化
  `multica_sdlc` JSON，则复用同一事实归一化路径进入正常判定。
- `--watch-parent GEW-36` / `--watch-issue GEW-37` 可以使用 issue key；listener 会在
  启动快照中解析 API 返回的 UUID，后续用 key 或 UUID 都能命中同一 watched scope。
- 在 `--dry-run` 下只写 stdout/journal；在 `--apply --allow-action metadata` 下写
  `multica_listener.*` metadata。`decision_source: state_guard` 默认不写 issue comment；
  只有显式传入 `--listener-comments` 且允许 `comment` action 时才会写结构化
listener comment；`state_guard` 类 comment 还必须显式传入 `--state-guard-comments`。
- listener 默认使用 `CODEX_THREAD_ID` 作为 `owner_session_id`，并在 `state-dir` 下维护
  `listener-owner-session.json`。同一 parent 的多个 guard 同时存在时，只有 owner session
  的 guard 可以执行 `metadata`、`leader-task`、`subagent` 等写/诊断动作；非 owner guard
  只记录 `owner-session:blocked`。如果 owner 心跳超过 `--session-takeover-seconds` 或
  owner 进程已退出，新启动或仍运行的 guard 可以接管。
- owner lease heartbeat 由 `--session-heartbeat-seconds` 控制，建议保持短周期，例如 15
  秒，用于快速 stale takeover。会话/日志 keepalive 是独立的
  `--session-keepalive-seconds`，默认 1800 秒，只用于低频可观测性，不应用来替代 owner
  lease heartbeat。
- 需要脱离 Codex PTY 时，使用 `scripts/multica-sdlc-guard-launch`。该启动器通过
  `setsid + nohup` 启动 listener，将 stdout/stderr 写入 state dir，并默认传入
  `--exit-if-not-owner` 和 `--session-keepalive-seconds 1800`，避免重复 guard 长期占用资源。

## Apply

默认 dry-run：

```bash
plugins/multica-sdlc/scripts/multica-sdlc-listener ... --dry-run
```

受限 apply：

```bash
plugins/multica-sdlc/scripts/multica-sdlc-listener ... \
  --apply \
  --allow-action metadata,leader-task
```

带阶段顺序的 guard：

```bash
plugins/multica-sdlc/scripts/multica-sdlc-guard-launch ... \
  --apply \
  --allow-action metadata,leader-task,subagent \
  --expected-stage-order 1A-2,1B,2A,2B,2C,2D,3A,3B/3C,4,5,6,7 \
  --owner-session-id "$CODEX_THREAD_ID" \
  --session-takeover-seconds 180 \
  --session-heartbeat-seconds 15 \
  --session-keepalive-seconds 1800 \
  --leader-task-retry-seconds 300 \
  --ineffective-repair-threshold 2 \
  --escalation-cooldown-seconds 300 \
  --subagent-command plugins/multica-sdlc/scripts/multica-sdlc-guard-subagent
```

`multica-sdlc-guard-launch` 要求传入 `--state-dir`，并会写入：

- `listener-launch.pid`
- `listener.out.log`
- `listener.err.log`
- `listener-owner-session.json`
- `listener-lifecycle.jsonl`

`metadata` 只写 `multica_listener.*` primitive metadata。`comment` 会向 watched
parent/issue 追加结构化 listener comment，但不建议用于常驻 guard；即使传入
`--allow-action comment`，默认也会记录为 `comment:suppressed` 而不真正写评论。
重复事件通过本地 JSONL dedupe 抑制；多实例并发仍可能重复写，建议一个
workspace/parent 只保留一个 owner session。

`decision_source: state_guard` 的修复提示使用状态级 dedupe，而不是逐事件源 dedupe。
例如同一个 child 同时触发 `comment:created` 和 `task:completed`，但都只是缺少同一组
`multica_sdlc.*` facts 时，listener 只写一次修复 metadata；后续事件仍完整写入 journal，
stdout 按 observe/drop 规则节流。

`leader-task` 也走同一个 JSONL dedupe。常驻 guard 可以开启
`--allow-action metadata,leader-task`；`blocked_issue_leader_decision` 会 rerun blocked
child，`continuation_stalled`、`nonterminal_leader_gate` 和 `terminal_child_barrier` 会
rerun watched parent；`missing_sdlc_facts`、`unstaged_sibling_barrier` 和
`stale_commit_or_pr` 也会 rerun watched parent。guard 不能代替 Leader 做 required-row
waiver、contract extension、issue status mutation 或 PR 合并。如果 blocker 是合同范围外
的基础设施债务，agent task 的职责是产出显式 disposition/re-contract/独立 infra issue，
而不是静默绕过。

`terminal_child_barrier` 唤醒 parent 只表示父级需要一次 `ROUTE_ONLY` 观察/续航回合，
不是最终 review。listener 写入的 `multica_listener.last_decision` 会携带
`status_guard.forbid_parent_in_review=true` 与
`required_parent_status_while_child_active=in_progress`。只要仍有 child implementation、
repair、validation、evidence 或 PR 工作未完成，Router/Leader 不应在这种 routine
control-plane turn 末尾执行 `multica issue status <parent> in_review`；若已误设，应恢复
为 `in_progress`。

创建 leader task 前，listener 会先读取 `/api/issues/{id}/active-task`。如果该 issue
已经有 `queued`、`dispatched` 或 `running` task，且该 task 不是显式非阻塞的
control-plane 观察/路由任务，`leader-task` 记录为 `leader-task:active`，不会再调用
`/rerun`。这避免 guard 和 comment mention 同时唤醒真实执行 owner 时产生重复任务。

如果 issue metadata 或 task 摘要明确包含 `control_plane_handoff`、`OBSERVE_ONLY`、
`ROUTE_ONLY`、`NOT_MY_GATE`、`block_downstream=false`、`continuity_snapshot` 或
`continuity_handoff`，并且没有 `DECISION_REQUIRED`、`block_downstream=true`、
`decision_lock_owner` 或 `gate_round_id` 指示的 active final lock，listener 会把
Workflow Router、Workflow Leader Clean Gate、Gate Registry Coordinator 和 Clean Gate
Arbiter 这类 control-plane active task 视为 side-channel observer，不把它们当成
下游同步阻塞。coder、repair、review、E2E、evidence 等真实执行 task 仍然会阻止重复
rerun。

`leader-task` 的 dedupe 默认不是永久锁：`--leader-task-retry-seconds` 控制同一状态
再次 rerun 的冷却时间。冷却期内同一状态写 `leader-task:duplicate`；冷却期后，如果
parent/child 没有 active task 且状态仍卡住，guard 可以再次 rerun Leader。

ineffective repair escalation 使用单独的 epoch/cooldown 语义：

- 计数 key 为 `parent_issue + target_issue + reason_code + normalized_missing_facts/barrier`。
- 达到阈值后，dedupe key 会加入 `escalation_epoch`，避免永久 duplicate。
- 同一 epoch 只允许创建一次 parent leader task，即使 `--leader-task-retry-seconds 0`
  也不会重复刷同一升级。
- `--escalation-cooldown-seconds` 控制下一 epoch；冷却期内同一异常记录为
  `ineffective_repair_cooldown`，不会退回普通 reason 再 rerun。
- 如果关键状态发生变化，计数重新开始，后续再次无效时可以进入新的 epoch。

owner session lock 是写动作的第一道门。建议同一 GEW parent 只从一个 Codex 会话启动
常驻 guard；如果用户切换到新的 Codex 会话，应从新会话重启 guard。旧会话的 guard 在
心跳仍新鲜时会阻止其他会话写动作；心跳过期或进程消失后，新会话自动接管。journal 中的
`owner_session_id` 和 `owner_active` 用于追踪到底是谁发起了 guard 动作。

listener 同时写 `listener-lifecycle.jsonl`，记录 `started`、`lease_acquired`、
`lease_rejected`、`stale_owner_reclaimed`、`startup_reconcile`、`websocket_open`、
`websocket_close`、`keepalive`、`signal_exit` 和异常退出信息。`keepalive` 默认每 1800 秒
写一次；如果 listener 由 Codex PTY 直接启动，该输出可能出现在会话输出中，因此长期运行
优先使用 `multica-sdlc-guard-launch`。

`codex_intervention_required` 会通过 `codex-wake.jsonl` 记录本地唤醒，同时复用
`leader-task` 的 active-task 检查和 JSONL dedupe。这个路径专门处理“Multica 没有
active task，但按外部阶段合同还没有完成”的异常：guard 只负责把父 issue 重新交给
Multica Leader，不直接替 Leader 创建下一阶段 child、补 waiver 或改 PR 状态。

强监督模式可以增加 `subagent` action。启用 `--subagent-command` 后，guard 会把当前
normalized issue state、router/state decision 和已执行动作结果作为 JSON 传给只读子代理；
默认 helper `scripts/multica-sdlc-guard-subagent` 使用 `codex exec --sandbox read-only`
给出下一步判断。subagent 输出只写 listener journal 的 `subagent:result`，不直接改
Multica issue、comment、PR 或本地文件。默认触发原因包括 `missing_sdlc_facts`、
`unstaged_sibling_barrier`、`stale_commit_or_pr` 和 `leader_task_duplicate`；可用
`--subagent-on` 覆盖。

如果本机 `codex exec` 不可用或调用失败，默认 helper 会输出 `degraded: true` 的 fallback
JSON。listener 会记录 `subagent:degraded`，不会把该结果当成真实深度判断 `ok`。

如确需让普通 router decision 写 issue comment，必须显式开启：

```bash
plugins/multica-sdlc/scripts/multica-sdlc-listener ... \
  --apply \
  --allow-action comment,metadata \
  --listener-comments
```

如确需让 `state_guard` 也写 issue comment，必须使用更强的显式开关：

```bash
plugins/multica-sdlc/scripts/multica-sdlc-listener ... \
  --apply \
  --allow-action comment,metadata \
  --state-guard-comments
```

## Journal

journal 是 JSONL，默认路径：

```text
~/.agents/multica-sdlc/listener-journal.jsonl
```

核心字段包括：`event_type`、`issue_id`、`parent_issue_id`、`classification`、
`router_decision`、`apply_mode`、`apply_action`、`apply_result` 和 `redactions`。

stdout 面向 Codex 实时观察，不作为完整审计源。`event_type_ignored`、
`watch_filter_miss`、`self_generated_event` 等 drop 类事件会完整写入 journal，但 stdout
默认只输出同一 `classification/event_type/source` 组合的首条记录，并在之后每
`--drop-log-every` 次输出一次摘要，避免 `task:queued`、`task:running`、
`task:progress` 等高频平台事件淹没真正的纠偏信号。`--drop-log-every 0` 表示只输出
首次 drop；需要排查事件风暴时可调小该值。

`task:message` 这类 observe-only decision 同样会完整写入 journal，但 stdout 默认只输出
同一 `event_type/classification/issue_id` 组合的首条记录，并在之后每
`--observe-log-every` 次输出一次摘要。`--observe-log-every 0` 表示只输出首次
observe-only decision。

## 验证

```bash
node --check plugins/multica-sdlc/scripts/multica-sdlc-listener.js
plugins/multica-sdlc/scripts/self-test-router.sh
plugins/multica-sdlc/scripts/self-test-listener.sh
```

`self-test-listener.sh` 使用 Node fake API 和 fake WebSocket，覆盖首帧 auth、
malformed frame、dry-run zero-write、apply allowlist、duplicate dedupe、
bounded reconciliation、missing SDLC facts correction、unstaged sibling barrier
warning、continuation stalled Codex wake、task message observe-only、watched parent 下
sibling 不被 `--watch-issue` 误拦截、重复 ignored event 和 observe-only event stdout
节流但 journal 全量保留，以及 journal redaction。
