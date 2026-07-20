# Atlas Team Paseo 显式启用与 Codex 连续降级实施方案

workflow_id: `20260720-011-atlas-team-paseo-codex`
plan_status: `implementation-ready`
date: `2026-07-20`
authority: 当前用户确认的 Team 协作与降级方向
canonical_scope_source: 本文件
source_session: `019f7ea0-cc95-74e3-8153-297f18065857`
artifact_category: `implementation_plan`

## 1. 结论

Atlas Team 默认使用 Codex native collaboration；只有用户或操作方为 Team、lane 或 dispatch 明确
选择 Paseo，才启动 Paseo agent。Review 和 implementation 分别解析 backend，互不隐式继承。

显式选择 Paseo 时，运行故障默认在同一 logical lane 降级到 Codex；`no-fallback` 只有显式指定才
生效。降级保留目标、范围、授权、证据与 provenance，不把缺失 provider 视角伪装成共识，也不把
测试失败、代码缺陷或 review finding 当成运行故障。

Team review 使用多角色讨价还价协议：角色和数量按风险推荐，不预设；reviewer 首轮后保持可复用，
主线程归并、裁决并把争议定向返回原角色。通常 2–3 轮收敛，但不是硬上限；证据不再增长且重大
分歧仍会改变结论时，交给人工裁决。

Claude-family model 只能由用户或操作方手工给出精确 model ID。Atlas 不得按角色、provider、catalog、
“latest”或 gateway 猜测/补全 Claude model；无法确定 model family 时 fail closed。

本次修订只关闭 `20260720-013` Team Review 指出的可实施性缺口，不新增产品能力；同一组 reviewer
定向复审已收敛并恢复 `implementation-ready`。本文件不授权代码实施、安装态刷新、live E2E、push
或 release。

## 2. Goal 与非目标

| Ref | Required outcome |
| --- | --- |
| `G-01` | 未请求 Team 时由主 Codex处理；Team 未明确选择 Paseo 时使用 native。 |
| `G-02` | Paseo 可在 Team、lane、dispatch 三层显式选择；review 与 implementation 不互相强制。 |
| `G-03` | Paseo 运行故障默认连续降级到 Codex，且不扩大目标、路径或 mutation 权限。 |
| `G-04` | Review 支持动态角色、独立首轮、主线程裁决、原 reviewer 复议、证据收敛和人工裁决。 |
| `G-05` | 持久状态可唯一说明 configured、resolved、attempted、admitted 和 effective backend。 |
| `G-06` | Paseo writer 失败后，只有取得 takeover permit 的 Codex writer 可以接管既有工作。 |
| `G-07` | 最终交付披露实际 backend、fallback、证据保留和缺失视角。 |
| `G-08` | staffing、轮数和 provider 组合是建议与遥测，不是固定 gate 或完成上限。 |
| `G-09` | Claude-family model 只接受有不可变人工来源的精确 model ID。 |

非目标：

- 不让所有 Team、所有 round 或所有 slice 默认使用 Paseo，也不把 Team 变成普通任务默认工作流。
- 不固定角色、agent/provider 数量或 review 轮数，不因 finding 自动扩展当前 Goal。
- 不读取或修改 Paseo 全局 preferences、凭证、provider/daemon 配置，不执行 broad stop/restart。
- 不把 runtime full-access mode 当作写入授权；`execute` 仍要求当前用户明确授权。
- 不创建统一启动 Paseo/native 的新 runtime wrapper；helper 只管理控制面与事实账本。
- 不修改/调用 Multica forbidden paths、真实 marketplace/cache/runtime，或未获授权的外部系统。

## 3. 选择、人工来源与策略快照

### 3.1 解析优先级

backend 与 fallback policy 分别按以下优先级解析，并在 attempt reserve 时固化：

1. dispatch 显式值；
2. lane 显式值；
3. Team 显式值；
4. 默认 `backend=native`、`fallback_policy=codex`。

持久字段使用 canonical `fallback_policy=codex|none`；`no-fallback` 只是 CLI 输入别名，写入前归一为
`none`。Team 级 Paseo 可被 lane/dispatch 的 native 覆盖；review lane 的 Paseo 不传给 implementation
lane。同一 reviewer 的后续复议沿用原 lane 和 actor，但每次仍创建新 dispatch。

只有以下 controller-attested、不可变 audit event 可登记显式选择：

```json
{
  "event_id": "selection-0001",
  "team_run_id": "run-0001",
  "kind": "backend|model",
  "scope": "team|lane:<id>|dispatch:<id>",
  "authority_kind": "user-message|operator-input",
  "authority_ref": "stable-host-reference",
  "backend": "native|paseo",
  "provider": "optional-exact-provider",
  "model": "optional-exact-model",
  "recorded_at": "timestamp"
}
```

event 创建后不可改写或复用到另一个 `team_run_id`。Atlas recommendation、可编辑 Team 配置、自由
文本 `selection_ref`、provider 可用性和历史默认值都不能生成或冒充 authority event。lane、dispatch
和 attempt 只保存 `selection_event_id`；解析时验证 event 的 run、scope、kind 与调用相符。helper 只
验证 controller attestation 先于 attempt、不可变且 scope 匹配；当前 Codex host/controller 是可信边界，
负责把真实用户消息或当次 operator 输入登记为 event。该机制不是 host-authenticated/密码学证明。
合规 Atlas controller 不得为自动 recommendation/config 生成这种 attestation；普通默认 native 无需
event，显式 native override 则必须引用 scope 匹配的 `backend=native` event。

### 3.2 Claude manual-only gate

model identity 归一为 `claude|non-claude|unknown`：

- direct `claude` provider 或可信 capability metadata 明确属于 Claude 时为 `claude`；
- 可信 metadata 明确排除 Claude 时为 `non-claude`；
- gateway、自定义 alias 或 metadata 不足以判断时为 `unknown`。

Generic Paseo routing 只允许从明确的 `non-claude` 集合推荐。`claude` 必须引用 `kind=model` 的人工
authority event，且 event 内含精确 provider/model；缺失时返回
`CLAUDE_MODEL_SELECTION_REQUIRED`。`unknown` 不得按非 Claude 自动运行，返回
`MODEL_FAMILY_UNVERIFIED`；用户补充精确 model 和可信 identity 后才能继续。

live catalog 对 Claude 只验证人工指定值是否存在，不参与选择。attempt 保存实际采用的 catalog entry
及 capability snapshot digest；digest 证明本次判断输入，不证明 provider 永远可信。已完整人工指定但
运行时不可用属于 `model_unavailable`；缺少人工选择或 family 不明属于 admission/input failure，均
不得伪装成已启动 Paseo 后的 operational fallback。

## 4. Team run、dispatch 与 attempt 状态机

### 4.1 持久实体

schema v2 每次 Team start 创建新的 `team_run_id` 和递增 `generation`，并在同一 task lock 下维护：

- `selection_events[]`：第 3 节的 controller-attested、不可变人工选择记录；
- `lanes[]`：purpose、role、scope、writable paths、状态与 convergence；
- `dispatches[]`：一次请求及其 configured/resolved backend、policy snapshot、required perspective；
- `attempts[]`：一次具体 runtime 尝试的 append-only 生命周期；
- `admissions[]`：controller 对 attempt 产物的接纳/拒绝及证据；
- `fallback_events[]`：从失败 Paseo attempt 到后续 native attempt 的因果关系；
- `takeover_permits[]`：写入接管前对 quiescence、证据和 path ownership 的证明。

dispatch 不能只靠 attempt 反推。聚合状态为
`open -> attempts-active -> attempts-exhausted -> controller-disposed -> closed`；单个 attempt terminal
不会提前终结仍可 retry/fallback 的 dispatch。runtime terminal 只说明 actor 结束，不代表 controller
已接纳结果。lane 只有在所有 required dispatch 均 disposed、重大争议已收敛/转人工且无 reserved/
running attempt 或 writer lease 时才能 close。

### 4.2 Attempt 生命周期与幂等

attempt 正常路径使用以下单向协议：

```text
reserved -> bound -> running -> terminal -> quiesced
```

- `reserved`：在启动 runtime 前，在 task lock 内分配 attempt ID、dispatch、backend/policy snapshot、
  authority、scope 与稳定 `launch_operation_id`；writable attempt 同时取得 path-scoped writer lease。
- `bound`：runtime 启动成功后写入真实 actor/agent/workspace/worktree/base SHA。启动失败也必须把
  reserved attempt 终结，不能丢弃。
- `running`：runtime 确认接受任务；只有 bound attempt 可进入。
- `terminal`：记录 runtime outcome：`succeeded|operational-failure|semantic-failure|interrupted`。
- `quiesced`：确认 runtime 不再 pending/running/写入；失败或超时不能直接假定 quiesced。

runtime 在 actor 创建前明确拒绝启动时，允许 `reserved -> terminal -> quiesced`；actor 已创建但尚未
确认 running 时允许 `bound -> terminal -> quiesced`。controller 在 run 返回与 bind 之间崩溃时，
adapter 先按 `launch_operation_id` 幂等查询/关联 actor；runtime 不支持 reconcile 或结果不唯一时，
attempt 保持 `reserved/launch-state-unknown` 并继续占有 writer lease。恢复过程不得再次 run，也不得
创建 retry/fallback/第二 actor，只能先精确关联并 bind/quiesce，否则转人工处理。

每个 transition 带稳定 `operation_id`；重复调用返回既有结果，冲突 payload fail closed。controller
crash 后从最后一个持久 transition 恢复，不重复启动 actor。retry/fallback 只允许引用已 quiesced 的
predecessor；writable retry 重新取得 lease。fallback 是一个 registry transaction：在同一 task lock 下
同时消费 takeover permit、创建 fallback event、reserve deterministic native attempt 并取得 lease，
任何 failpoint 重放都不会留下 dangling event 或第二个 native attempt。

### 4.3 Writer lease 与 takeover

v2 registry 沿用现有 Team SDD path-lease 的 workspace-relative POSIX path、前缀重叠和 fail-closed
语义，并在自己的 runtime state 中保存 owner attempt、team run/generation、lease state 与释放原因；
不修改 SDD schema，也不发明另一套路径匹配语义。

- writable attempt 必须在 runtime 启动前持有 lease；不同 lane 的重叠 path 同样互斥。
- 一个 attempt 可持有多个不重叠 path；空前缀、无法确定归属或 wildcard 前缀重叠按冲突处理。
- terminal 不自动释放 lease。只有 runtime `quiesced` 后才可释放。
- fallback writer 还必须持有 takeover permit。permit 引用原 attempt、quiescence evidence、worktree/diff
  fingerprint、未跟踪文件、base/head、继承的 authority/scope 和新 lease。
- 无法证明原 writer quiesced、工作区证据无法保存或目标 worktree 存在不明冲突时，停止该 lane并返回
  人工处理，不并发启动第二 writer。

### 4.4 Controller admission 与 backend 派生

attempt outcome 与 controller disposition 分开：`admitted|rejected|needs-evidence|superseded`。只有
`admitted` 结果参与 effective backend；失败 attempt、未验证输出和仅供上下文的 partial diff 不参与。

- `configured_backend`：Team/lane/dispatch 显式配置；省略为 `null`。
- `resolved_requested_backend`：按第 3.1 节对每个 dispatch 解析；Team 摘要从全部 dispatch 派生。
- `attempted_backends`：从 adapter launch 已调用或已 bound 的 attempts 去重派生；仅 reserve 但从未
  调用 runtime 的记录不算 attempted。
- `effective_backend`：从 admitted results 派生；只含一种 backend 时为该值，同时含两种时为 `mixed`，
  没有 admitted result 时为 `none`。

finalize 必须从 v2 ledger 生成 sidecar 和人类 decision，不接受调用方手填 backend 覆盖派生值。
decision artifact 可标记 `backend: mixed`；task Markdown 的 legacy `active_team_backend` header 只投影
`native|paseo`，真实结果为 mixed/none 时使用兼容值 `native`，并在 v2 sidecar 标记
`effective_backend=mixed|none` 与 `legacy_projection=true`，旧消费者不会反向改变 v2 真相。

## 5. Paseo capability 与生命周期

实现参考 Paseo skill 的精确 agent/workspace ID、send/wait/stop、worktree ownership 和通知式等待；
Atlas 不读取其 orchestration preferences，也不复制 provider-specific model/mode 参数。

仅在 dispatch 已解析为 Paseo 且通过 selection/model admission 后，查询 live provider/model/mode：

- provider/model 必须匹配实时 capability；不可用时不静默替换 provider/model。
- 可调用 `runtime_mode_id` 必须来自结构化 live capability，不能从展示 label 或历史常量猜测。
- `execute` 没有可验证的 writable mode 时记为 `mode_unavailable`；review/discuss 即便 provider 暴露
  更宽 mode，prompt、scope 和 authority 仍保持只读。
- 当前 Paseo 版本若只暴露展示 mode 而无结构化可调用 ID，则真实 write attempt 不具备启动前置条件，
  按 policy 转 Codex；fake adapter 不能把这一 live 缺口证明为已解决。

reserve 必须先于 `paseo run`；run 后 bind 精确 ID。复议只对原 agent 精确 `send`，用 `wait` 获取完成，
只有冲突/越界/浪费已被证明时才 stop 精确 ID。禁止 `stop --all`、按 cwd broad stop、agent delete、
daemon restart 或 provider mutation。

## 6. 运行故障、retry 与 fallback

### 6.1 Source-aware failure envelope

分类器只接受 Paseo observation adapter 生成并持久化的 control/runtime envelope：

```json
{
  "command": "paseo wait",
  "source": "paseo-cli|paseo-daemon|provider|adapter-watchdog",
  "channel": "control|runtime",
  "exit_code": 0,
  "status": "error",
  "code": "optional-structured-code",
  "http_status": 429,
  "retry_after_ms": 1000,
  "message": "redacted single-line summary",
  "observed_at": "timestamp",
  "raw_evidence_ref": "artifact-relative-path-and-digest"
}
```

agent 正文、review finding、test/lint 输出、生成代码和普通 stderr 文本不能单独触发 operational
fallback。分类优先结构化 code/status/http status；受控 message pattern 只在可信 source/channel 内
补充。ledger/fallback 命令只接受 adapter 持久化的 observation ID，不接受调用方自由提交
source/channel/code/message。source 不可信或证据不足归类 `unknown`，不自动 retry/fallback。

允许的 operational class 保持最小集合：`quota_exhausted`、`rate_limited`、
`provider_unavailable`、`model_unavailable`、`mode_unavailable`、`authentication_failed`、
`cli_unavailable`、`daemon_unavailable`、`runtime_crashed`、`timeout_no_useful_output`。

测试失败、代码 bug、`REQUEST_CHANGES`、证据分歧、scope/authority conflict、Claude 人工选择缺失、
model family unknown 和用户决策均是 semantic/input/authority outcome，不触发 fallback。

### 6.2 Retry 与 fallback 顺序

同一 dispatch 最多一次自动 retry，只在可信 `Retry-After` 或明确瞬态恢复证据与当前等待预期相容时
发生。retry 是新 attempt，字段至少包括 `origin=retry`、`retry_of`、`retry_ordinal`、`reason_class`、
`retry_after_ms`，原 attempt 保持不变。eligible retry 尚未消费时不能先 fallback；retry predecessor
必须 quiesced，retry 失败或不 eligible 后才能解析 fallback policy。

fallback 顺序固定为：

1. terminal 并保存失败 Paseo attempt 的 envelope、输出、diff/worktree 与 evidence refs；
2. 必要时精确 stop，确认 quiesced；writable lane 同时取得 takeover permit；
3. 读取 reserve 时已固化的 `fallback_policy`；`none` 则写入 `backend-unavailable` controller disposition，
   再关闭 dispatch并披露 unavailable；
4. 以单个原子 registry operation 创建 fallback event 和 native reservation，后者记录
   `origin=fallback`、`fallback_from=<paseo-attempt>`；
5. native 接管同一 lane/goal/scope/authority，controller 再独立 admission。

需要独立 reviewer 时优先 native subagent；不需要独立性或 native capacity 不可用时由主 Codex继续，
但不得声称独立 consensus。fallback 不重建 roadmap、不覆盖 Paseo history，也不重新触发未授权 mutation。

## 7. 多角色讨价还价式 Review

### 7.1 动态 staffing 与交换

主线程按真实分歧面推荐互补视角，例如行为、兼容、安全/权限、数据、运维、测试证据或最强反方。
两到三个角色通常足够但不是限制；低风险可一个，高风险可更多，不为凑数创建重复 reviewer。

1. 冻结 review scope、commit range/文件、Goal 与已有证据。
2. reviewer 在看见他人结论前独立首轮；finding 包含 ID、位置、证据、影响、建议和 evidence gap。
3. controller 去重但保留作者、严重度、异议和 provenance，并给出
   `accept|reject|narrow|needs-evidence|human-decision` 临时裁决。
4. 只把相关异议、对方最强证据和裁决发回原 reviewer；原 agent 保持可复用，不广播全部历史。
5. controller 或合适角色补最小证据，再发给仍有实质异议者。
6. 通常 2–3 轮收敛；若一次聚焦交换仍可能改变重大分歧就继续。证据不再增长或属于 intent、风险、
   兼容、权限/所有权时，生成简短人工裁决包。

角色在首轮后不得自动关闭。仅当其 finding 已收敛/被证据裁决、已转人工且无需再输入，或 runtime
故障要求精确 stop/fallback 时关闭。

### 7.2 Paseo reviewer 失败与收敛

首轮前失败时由 native reviewer 只拿原始 scope 接替；已有局部证据则标注完整性并传递未答问题。
明确 provider 视角缺失时最多为 `CONSENSUS_WITH_RESERVATIONS`；该视角是风险决策必要条件时为
`HUMAN_DECISION_REQUIRED`。仅主 Codex自审只能称 best-effort controller review。

最终状态只有：

- `CONSENSUS`：无会改变建议的未决分歧，且声称的独立证据已取得；
- `CONSENSUS_WITH_RESERVATIONS`：主结论可执行，但有已披露的视角/evidence gap；
- `HUMAN_DECISION_REQUIRED`：需要用户决定重大分歧或关键证据无法取得。

人工裁决包只包含一致事实、剩余分歧、双方最强证据、controller 推荐、选项与影响。用户裁决后，仅
在需要最终一致性检查时把新 authority 返回相关原 reviewer。

## 8. Implementation 接管合同

implementation lane 启动前必须具备 `execute` authorization、owned/forbidden paths、acceptance、验证
命令和 stop condition，并为本 lane/dispatch 显式解析 Paseo。review 选择不能隐式授权 implementation。

Paseo implementer 只在已记录 worktree/workspace 修改；controller 检查 status、diff、untracked、
base/head、越界路径和测试后才能 admission。部分写入后失败时按第 4.3 与 6.2 节取得 quiescence、
证据和 takeover permit，native writer 先审阅既有 diff 再补缺口，不从头覆盖 provenance。

任何 test/code failure 进入正常 repair loop；只自动修复当前 Goal blocker、当前 diff 回归或使交付不安全
的安全/数据/权限问题。相邻重构、历史缺陷和 roadmap 外增强保留为 follow-up。

## 9. v1/v2/legacy 兼容合同

所有 Team mutation 使用同一 task lock，并先判定 generation：

| Existing state | v2 read | v2 mutation/finalize |
| --- | --- | --- |
| 无 Team state | 空视图 | 可创建新 generation。 |
| v1 completed native/Paseo | 只读派生旧 backend/status | 新 Team start 创建新 generation；不改旧 artifact。 |
| v1 running native/Paseo | 只读显示 `legacy-running` | fail closed；只能用原 v1 finalize/stop 结束后新建 v2 generation。 |
| legacy CLI completed | 只读 legacy 摘要 | 可创建新 generation，保留旧 runtime event。 |
| legacy CLI running/不确定 | 显示 `legacy-running|legacy-unknown` | fail closed；原 owner 完成/停止并确认 quiescence 后才能新建 v2 generation。 |
| v2 active | 以 ledger/materialized state 为准 | 只允许同 `team_run_id/generation` 的合法 transition。 |

`workflow/bin/lib/codex-workflow/task/runtime.js` 在 schema v2 下不得用 Markdown header 回灌/覆盖
backend、mode、status、decision；header 只由 v2 派生用于旧读者。schema v1 仍维持现有兼容读取，直到
旧 run terminal 后创建新 generation；不导入 running/unknown runtime，也不批量迁移历史任务。

## 10. Helper 与实施文件边界

### 10.1 CLI 与内部模型

保留 `team-record-start|finalize|loop-record|status|stop|promote`，并做以下兼容调整：

- start 的 `--backend` 省略时为 native。首次 Team 级 Paseo 由 start 在同一 task lock 内原子创建
  run/generation 与 controller-attested backend event，要求 `--selection-authority-kind` 和
  `--selection-authority-ref`；不会出现 event/run 循环依赖。`--agents/roles/providers` 变为 planning
  hint，不再要求预先冻结 staffing；execute 继续要求 `authorization_ref`。
- finalize/loop 的 backend 从 v2 admission 派生；旧显式 backend 仅供 v1 兼容并校验，不能覆盖 v2。
- status 显示 team_run/generation、configured/resolved/attempted/effective、dispatch/attempt、fallback、
  writer lease、convergence 和 legacy projection。

新增最小公共命令面：

```text
codex-workflow team-selection-record <task-id> --event-id <id>
  --operation-id <id>
  --kind backend|model --scope team|lane:<id>|dispatch:<id>
  --authority-kind user-message|operator-input --authority-ref <stable-ref>
  [--backend native|paseo] [--provider <exact-id>] [--model <exact-id>]

codex-workflow team-lane-record <task-id> --operation-id <id> --action open|close --lane <id> ...
codex-workflow team-dispatch-record <task-id> --operation-id <id>
  --action open|dispose|close --dispatch <id> --lane <id> ...
codex-workflow team-attempt-record <task-id>
  --operation-id <id> --action reserve|bind|running|terminal|quiesced
  --attempt <id> --dispatch <id> ...
codex-workflow team-fallback-record <task-id> --operation-id <id>
  --from-attempt <id> --to-attempt <id> ...
```

每个命令通过 action-specific validator，仅接受该 transition 的必要字段，并要求 `operation_id`；不接受
任意 JSON 覆盖 state。`team-attempt-record reserve` 固化 backend/policy/authority 并取得 writer lease；
dispatch `dispose` 同时写 controller admission/disposition 与 evidence，bind 后才能推进启动后的状态；
fallback 使用同一 task lock 原子创建 event、target reservation 和 lease。

### 10.2 文件范围

Atlas plugin：

- `plugins/atlas-workflow/skills/team/SKILL.md`：native default、Paseo opt-in、协商 review、fallback、
  writer takeover、Claude manual-only 与 disclosure。
- `plugins/atlas-workflow/skills/analyze/SKILL.md`、`skills/clarify/SKILL.md`：移除隐式 Paseo 路由。
- `plugins/atlas-workflow/README.md`、`.codex-plugin/plugin.json`：同步用户合同并删除自动 Claude 映射。
- `plugins/atlas-workflow/scripts/codex-team-artifact-lint`：读取 v2 sidecar，校验 mixed provenance。

Workflow helper：

- `workflow/bin/lib/codex-workflow/team/commands.js`、`team/cli.js`、根 `cli.js`：命令、锁与兼容路由。
- `workflow/bin/lib/codex-workflow/team/lane-registry.js`：v2 entity/transition、派生、lease 与幂等。
  registry 沿用现有 Team SDD path-lease 的 path normalization/overlap 测试向量，但不迁移或扩展 SDD
  schema，避免把 backend 控制面膨胀为一次 SDD 升级。
- `workflow/bin/lib/codex-workflow/team/backend-failures.js`：source-aware 纯分类器。
- `workflow/bin/lib/codex-workflow/team/paseo-observer.js`：窄的 Paseo observation/correlation adapter，负责
  捕获精确 run/wait/stop 的 exit/status/JSON、launch_operation_id 与 evidence digest；不做 routing、
  retry/fallback 决策，也不是通用 agent runtime wrapper。
- `workflow/bin/lib/codex-workflow/task/runtime.js`：禁止 header 覆盖 v2。
- `workflow/templates/team-decision.md`、`team-staffing.md`：native 默认和 v2 provenance。
- `workflow/README.md`：公共 CLI、legacy projection、live/fake 证据边界。

Tests/fixtures：

- `workflow/tests/js/team-commands.test.js`：v2 transitions、selection provenance、policy snapshot、writer
  lease、takeover、retry/fallback、admission/aggregation、Claude gate、generation/legacy matrix。
- `workflow/tests/js/team-backend-failures.test.js`：可信 observation、调用方/content spoof rejection、
  Retry-After、unknown。
- `workflow/tests/js/root-cli.test.js`：更新 exact route 数量/列表并证明新命令不落到 legacy launcher。
- `workflow/tests/fixtures/fake-team-runtime.js`：实现 observer 接口，确定性模拟
  reserve/bind/run/crash/quiesce；只证明 adapter 顺序。
- `workflow/tests/contract_team_native.sh`、`contract_team_paseo.sh`、新增
  `contract_team_fallback.sh`：默认、显式选择、fallback 与 disclosure。
- `workflow/tests/contract_team_legacy.sh`：v1 native/Paseo running/completed、legacy interlock/finalize。
- `workflow/tests/contract.sh`、`contract_repo.sh`：source/README/manifest/routes/forbidden paths 集成。

不新增 `codex-workflow-legacy` runtime lane。只有兼容测试证明其 usage/路由必须同步时才做最小修改。

## 11. 实施切片与提交策略

### Slice A：控制面与兼容

先写失败 envelope、selection provenance、state transition、lease/takeover 和 legacy matrix 测试，再实现
registry、CLI、task/runtime projection、fake adapter 和 workflow README。形成一个可回退提交：
`feat(workflow): make team fallback durable`。

### Slice B：Atlas 合同

修改 Team/Analyze/Clarify、plugin README/manifest 和 artifact lint；更新 shell contracts。内容与
reviewer 结论冻结后再做 plugin cachebuster，形成提交：
`feat(atlas): make Paseo opt-in with Codex fallback`。

两个 slice 都只实现 `G-01..G-09`；不顺带抽象通用 agent runtime、重构无关 Team SDD、迁移全部旧
artifact 或处理 reviewer 发现的相邻改进。commit 不授权 push、安装态刷新、live E2E 或 release。

## 12. 验收与证据映射

| Ref | Acceptance | Required evidence |
| --- | --- | --- |
| `AC-01` | Team 未指定 backend 时为 native；首次 Paseo start 原子创建 run+attestation；显式 native override 可表达。 | team unit + native/Paseo contracts |
| `AC-02` | dispatch > lane > Team > defaults 正确；effective policy 在 reserve 后不受配置变化影响。 | precedence/snapshot unit |
| `AC-03` | 动态 lane/role/count 可用，不需预先固定 staffing。 | team unit + review contract |
| `AC-04` | 正常/启动失败边合法；launch operation 可 reconcile，未知时阻断；crash resume 不重复启动。 | registry unit + fake runtime |
| `AC-05` | 跨 lane 重叠 writer 被拒；quiescence、证据和 permit 齐备后才可 fallback writer。 | lease/takeover unit + fake runtime |
| `AC-06` | runtime terminal 与 controller admission 分离；lane convergence 和 mixed/none finalize 唯一派生。 | aggregation/finalize unit + artifact lint |
| `AC-07` | observer 的 quota/429/provider/model/mode/auth/CLI/daemon/crash/timeout observation 分类确定。 | observer/failure fixture unit |
| `AC-08` | 自由伪造 source、agent/test/review 内容、semantic/input/authority outcome 不触发 fallback。 | spoof/negative fixtures |
| `AC-09` | retry 为 append-only attempt；默认 Codex fallback 与显式 none 均遵守快照和顺序。 | retry/fallback unit + fallback contract |
| `AC-10` | review 可复用原 reviewer，2–3 轮非上限，重大分歧产出人工裁决包。 | Team skill contract + review shell contract |
| `AC-11` | provider 视角缺失或仅 controller 自审不会声称完整 consensus。 | review/disclosure fixtures |
| `AC-12` | execute、retry、fallback/takeover 均不扩大 authorization 或 owned paths。 | authority/lease negative unit |
| `AC-13` | v1 native/Paseo running/completed 与 legacy/v2 generation matrix fail closed；running 不导入 v2。 | legacy contract + task runtime unit |
| `AC-14` | root route、workflow/plugin README、manifest 与 native default 一致。 | root-cli + repo contracts |
| `AC-15` | Claude only manual；gateway identity unknown fail closed；generic recommendation 只选 non-Claude。 | model identity unit + Paseo contract |
| `AC-16` | fake adapter 证明控制顺序；真实 Paseo 只在结构化 capability 可得且另行授权时标记 live verified。 | fake runtime + optional isolated live report |
| `AC-17` | forbidden paths、Multica、真实 cache/marketplace/runtime 无修改。 | changed-path audit + hard fingerprints |

## 13. 验证与 release identity 顺序

先跑专项 hermetic 验证：

```bash
node --test workflow/tests/js/team-commands.test.js
node --test workflow/tests/js/team-backend-failures.test.js
node --test workflow/tests/js/root-cli.test.js
bash workflow/tests/contract_team_native.sh
bash workflow/tests/contract_team_paseo.sh
bash workflow/tests/contract_team_fallback.sh
bash workflow/tests/contract_team_legacy.sh
```

内容 review 收敛后，按项目要求把 cachebuster 作为 plugin tree 最后一次修改：

```bash
scripts/bump-plugin-cachebuster.sh atlas-workflow
python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/plugin-creator/scripts/validate_plugin.py" plugins/atlas-workflow
workflow/bin/atlas-plugin-integrity manifest --plugin-root plugins/atlas-workflow
bash workflow/tests/contract_repo.sh
bash workflow/tests/contract.sh
scripts/check-relative-markdown-links.py --root .
git diff --check
```

cachebuster 后若再改 `plugins/atlas-workflow/**`，必须重新 review、重新 bump 并从官方 validator 起重跑。
每阶段核对 changed paths、实际 manifest identity 与 Multica hard fingerprints。

fake adapter 只验证命令顺序、ID、幂等、quiescence 和 fallback，不证明真实 provider/model/mode 可用。
live Paseo E2E 仅在用户另行授权后于隔离 worktree 运行；未运行时实现可标记 hermetic contract complete，
但必须披露 `live-provider=unverified`，真实 dispatch 仍按 capability prerequisite 或 Codex fallback 处理。

## 14. 最终 disclosure、停止条件与完成定义

实际使用 Paseo 或发生 fallback 时，最终摘要披露 selection authority、configured/resolved/attempted/
effective backend、真实 provider/model/mode（可验证时）、retry/failure、接管者、保留 diff/worktree/evidence、
缺失视角、review convergence 和 `live-provider` 状态。Claude attempt 额外披露 model selection event。

遇到以下情况停止相关 lane并返回用户：需要改变 Paseo opt-in/Codex fallback 语义；需要修改 Paseo
全局配置、Multica 或外部状态；无法证明旧 writer quiesced/保存证据；legacy 来源不确定；缺少 Claude
精确人工选择；重大 review 分歧需风险/产品/权限裁决；完成依赖未授权 live E2E、安装、push 或 release。

只有 `G-01..G-09`、`AC-01..AC-17` 均有对应证据，定向复审恢复 `implementation-ready`，两个实施
slice 验证通过，plugin identity 顺序正确，且最终 diff 未命中 forbidden paths/真实安装态，后续实现
才能标记完成。
