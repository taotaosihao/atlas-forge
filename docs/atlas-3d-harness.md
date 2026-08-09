# Atlas 3D Harness v0.1 接入合同

本文是 Atlas 3D Harness v0.1 的权威接入说明。当前交付是 Atlas Forge 当前
source checkout 和当前本机 Mac 上的 exploration，不是 installed-ready、
release-ready 或生产工具。首版只支持已冻结的 Apple Silicon Mac 与 Node
`24.15.0`；Docker Linux 只用于仓库合同验证，不代表 harness 支持 Linux。

## 架构

```text
scenario data ─┐
trusted runtime config ─┼─> Atlas 3D facade/worker ─> codex-web-acceptance kernel
checkout adapter code ─┘             │                         │
                                     ├─ Page/Transport facts   ├─ frozen inputs
                                     ├─ Node domain oracles    ├─ run/attempt/evidence
                                     └─ purpose comparator     └─ native check-run
```

3D Harness 是现有 `codex-web-acceptance` 上的 domain pack/thin facade。它直接调用
同 checkout 的 `run()`/`checkRun()`，复用唯一 evidence kernel 的 frozen input、
manifest、attempt、required claims/evidence、SHA-256、secret/path/symlink 检查与
technical status 推导。3D 层只实现 protocol/canonicalizer、owned loopback launcher、
browser transport、bridge、领域 validator 和 comparator，不重新实现 run/check-run。

## 输入信任与能力模型

三类输入不可混合：

1. scenario 是严格、拒绝未知字段的声明式 JSON。它定义 fixture、Expected
   Contract、capability/profile、三个 checkpoint、两个 named view、两个 viewport、
   seed 与 epoch，不能注入 executable path、命令或浏览器参数。
2. trusted runtime config 是操作者审查的 JSON，只能声明 `reviewed-local@1`、受审查
   project root、固定 `http://127.0.0.1:41733`、`current-mac-arm64@1` 和一次 attempt。
3. adapter、validator、launcher、worker 和 Web Acceptance core 必须来自相同 source
   checkout；不得由 scenario、runtime config、PATH 或 installed cache 替换。

基础协议与 `Industrial Kinematics Profile` 分离。所有 scenario 都需要
`scene.graph@1`、`scene.transforms@1`、`timeline.seek@1`、`render.metrics@1`。
base-only fixture 禁止 industrial expected 字段。只有显式激活
`industrial-kinematics@1`，才要求 `kinematics.joints@1`、
`attachments.sockets@1` 并检查 joint/socket/attachment 合同。

## Bridge 与独立 oracle

每个 fresh viewport/context capture sequence 只以冻结 seed/epoch 成功 reset 一次；该
reset 成功后，此前签发的 capture token 全部失效。sequence 内后续 checkpoint 都是
绝对 seek，不再次 reset，A-B-A 的 B 与第二个 A 之间也不 reset。每次 atomic
checkpoint 只有在 quiet/presentation closure 同时满足 `pending == 0` 且
`stateRevision == renderedStateRevision` 时才提交。`renderRevision` 是独立、单调递增
的 presentation revision，不得拿它代替 state/rendered-state closure。checkpoint
transaction 失败时不提交任何新状态或 revision，并保留此前有效的状态与 capture
token。captureTarget、browser geometry 与 PNG 必须来自同一 render revision；截图
前后任何漂移使整个 attempt 失败，不做隐藏重试。

验证保持三层独立：

- Expected Contract：scenario 中对 scene/timeline/view/render，以及可选 industrial
  kinematics 的字面预期；
- Actual Observation：Page 输出 raw matrices/AABB/camera/render facts，Transport 独立
  采集 browser geometry、PNG 与生命周期事实；
- Validator-derived Decision：Node 用不同数学实现、literal expected 和容差 policy
  裁决，adapter 不输出业务 verdict。

base oracle 检查 scene graph、transform、timeline、camera visibility/projection 与
non-empty render。Industrial oracle 额外检查 joint origin/axis/home/limits、socket
local transform、attachment ancestry、non-uniform ancestry policy 与连续运动。这样可
识别“结构合法但 parent、pivot、axis、camera、attachment 或 rendered transform 错误”
的场景。

## 环境与安装

v0.1 preflight 在 server/browser 之前固定检查当前 `darwin/arm64`、macOS/Darwin
build、Node `24.15.0`、当前 40-hex source HEAD、clean Harness tool tree/layout、
lockfile、Playwright browser registry、managed Chromium binary/version/digest。Host、
tool tree 或依赖身份漂移都失败；source HEAD 记录当前已提交 checkout，而不绑定某个
项目基线提交。不 fallback 到系统 Chrome 或用户 Chrome profile。

只有用户明确授权安装与下载后，才从仓库根目录执行：

```bash
node plugins/atlas-workflow/tools/atlas-3d-harness/bin/install-managed-browser.cjs
```

该命令使用 `npm ci --ignore-scripts` 和 bundle-local Playwright CLI，把 Chromium
下载到 `.tmp/atlas-3d-harness/playwright-browsers`。skill 与普通运行不会自动执行该
命令，也不会刷新 plugin/cache、修改 host config、发布或部署。

## CLI 接入

```bash
HARNESS="plugins/atlas-workflow/tools/atlas-3d-harness/bin/atlas-3d-harness.cjs"
```

校验 scenario：

```bash
node "$HARNESS" validate --scenario /absolute/path/to/scenario.json
```

运行：

```bash
node "$HARNESS" run \
  --scenario /absolute/path/to/scenario.json \
  --runtime-config /absolute/path/to/runtime-config.json \
  --artifact-root /absolute/path/to/empty-artifact-root \
  --run-id atlas-3d-example-001
```

运行时只服务 owned loopback 目标，真实 main document、scene module、Three.js 和 page
adapter 均由受审查文件提供；route 不合成应用资源。launcher 拥有 server/worker
进程组，fresh BrowserContext 拒绝外联、WebSocket、Service Worker、storage、额外
page/frame、download、dialog、file chooser 和意外 navigation。退出、失败、timeout
或 interrupt 后必须无残留。这里的 browser isolation 不等于 OS-level sandbox 或
malware containment。

复验：

```bash
node "$HARNESS" check-run --run-root /absolute/path/to/run-root
```

native `codex-web-acceptance check-run` 必须先验证完整 evidence closure 和 technical
status；3D check 才读取 capture-set 并运行领域 oracle。3D 层只收窄，不会把
incomplete、failed、unstable、tampered、symlink/path escape、secret、缺文件或重复
run id 升级为 pass。

比较：

```bash
node "$HARNESS" compare --left /absolute/path/to/left-run-root \
  --right /absolute/path/to/right-run-root --purpose semantic-state

node "$HARNESS" compare --left /absolute/path/to/left-run-root \
  --right /absolute/path/to/right-run-root --purpose render-review
```

compare 只接收两个 native + 3D check 均通过的完整 roots。

- `semantic-state` 要求 protocol、numeric policy、Expected Contract、fixture/seed/epoch、
  capability/profile、input set 与 resource asset set 等 hard identity 一致，再比较
  canonical state，结果为 `equal` 或有界差异。
- `render-review` 要求 scenario/fixture、input set 和 render target 可配对，输出左右
  PNG path/SHA-256 给人工审阅；implementation/browser/GPU/headless 等 soft drift 形成
  warning，不产生视觉质量或 pixel verdict。

pixel/performance purpose 不受支持，也不能把 PNG 当作跨 GPU 真值。

## Evidence 合同

固定矩阵为 2 viewport × 2 named view × 3 checkpoint，共 12 个 capture。每个 capture
包含 raw observation、canonical state、transport facts 与 same-render PNG；另有一个
capture-set manifest，所以 existing kernel 的 required evidence 正好为 25 refs。

相同 fixture、seed、epoch、checkpoint 和输入必须在 fresh A、A-B-A、第二次 fresh A
中得到相同 canonical digest。capture token 只存在于 Page RPC 和 adapter memory；
持久 evidence 使用无 secret、结构化 hash 的 binding。run root、attempt 和 evidence
仍由 existing kernel 创建与复验。

## 安全、资源上限与失败语义

只运行显式确认、digest 闭合的 `reviewed-local@1`。实现联合限制 capture/evidence
数量、pixel、PNG、raw/canonical/HTTP response、console/lifecycle event、临时文件与
bytes、worker stdout/stderr、inner/outer timeout；任何超限 fail closed。outer
watchdog 终止完整 PGID 后不会由 facade 补写控制文件，不完整 root 必须由 native
check-run 拒绝。

source tree 中的 tool-local `node_modules/`、`.local/`、`runs/`、`artifacts/`、本地
runtime config/log 和 repo `.tmp/atlas-3d-harness` cache 都是派生状态。它们不得进入
Git、开发同步目标或 plugin cache；开发同步测试只在隔离 fixture 验证排除规则，本
交付不运行真实 refresh。

## 明确限制

- 仅当前 source checkout 和当前冻结 Mac；不声明 installed-ready、其他 Mac、Linux、
  Windows 或 Intel Mac 支持。
- 仅 reviewed-local reference/adapter integration；不访问远程、生产、登录态或客户
  页面，不处理未知或恶意代码。
- 不提供资产生成、编辑器、物理引擎、AI visual verdict、pixel regression、性能基准、
  `interaction.hit-test@1`、OS network sandbox 或 release/deploy。
- skill 调用、测试通过、截图或 reviewer 接受都不授权安装、cache refresh、commit、
  push、PR、发布或部署。

工具级命令与证据说明见 [runtime README](../plugins/atlas-workflow/tools/atlas-3d-harness/README.md)，
skill 入口为 `$atlas-workflow:3d-harness`。
