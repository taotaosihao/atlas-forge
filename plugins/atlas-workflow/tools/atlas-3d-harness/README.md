# Atlas 3D Harness v0.1

Atlas 3D Harness 是当前 Atlas Forge source checkout 中的 3D 验收领域包。它是
既有 `codex-web-acceptance` 的 thin facade：`run` 和 native `check-run` 继续使用
同一套冻结输入、run manifest、attempt、evidence、SHA-256、secret/path/symlink
检查与状态推导；本工具只补充 3D protocol、浏览器 adapter、领域 oracle 和
purpose-specific comparator，不建设第二套 evidence kernel。

当前版本仅用于这台已冻结身份的 Apple Silicon Mac：`darwin/arm64`、Node
`24.15.0`、Playwright-managed Chromium 和当前 source checkout。它不是安装态
产品，也不支持 Linux、Windows、Intel Mac、系统 Chrome、生产/登录态页面、
未知代码、恶意代码 containment、pixel regression、performance 或 release。

## 分层合同

输入和执行代码必须分离：

- scenario 是严格 schema 校验的声明式数据，包含 fixture、expected contract、
  capabilities/profiles、checkpoint、view、viewport、seed 和 epoch；不能注入命令、
  adapter 或 validator。
- trusted runtime config 是操作者审查的运行输入，只允许
  `reviewed-local@1`、显式 project root、固定 `http://127.0.0.1:41733`、
  `current-mac-arm64@1` 和单 attempt。
- adapter、validator、launcher 与 worker 只能来自同一 checkout 的冻结路径，
  scenario/runtime config 不得替换它们。
- provenance 记录当前已提交 checkout 的 40-hex HEAD，并要求 Harness tool tree
  相对该 HEAD clean；它不写死某个项目或历史基线提交。

基础协议与领域 profile 分离。base 协议提供 `scene.graph@1`、
`scene.transforms@1`、`timeline.seek@1`、`render.metrics@1` 以及 reset、checkpoint、
revision 和 capture 生命周期。只有 scenario 显式激活
`industrial-kinematics@1` 时，才要求 `kinematics.joints@1`、
`attachments.sockets@1` 并运行 joint/socket/attachment oracle。

Expected Contract、Actual Observation 与 Validator-derived Decision 也保持独立：
fixture 说明应该发生什么；Page/Transport 采集 raw matrices、AABB、camera、浏览器
geometry 和 PNG；Node oracle 使用独立数学实现裁决。Page 和 adapter 不输出业务
verdict。

## 安装前置项

工具不会自动安装、下载、刷新 plugin/cache 或修改系统 Chrome。只有获得明确的
安装/下载授权后，才从仓库根目录运行：

```bash
node plugins/atlas-workflow/tools/atlas-3d-harness/bin/install-managed-browser.cjs
```

该入口先以 `npm ci --ignore-scripts` 安装 lockfile 中的精确依赖，再通过 bundle
内 Playwright CLI 下载 managed Chromium 到
`.tmp/atlas-3d-harness/playwright-browsers`。它固定要求当前 Mac、Node 版本、仓库
布局与真实路径，禁用 shell、`with-deps` 和系统/用户 Chrome fallback。

`node_modules/`、`.local/`、`runs/`、`artifacts/`、本地日志以及 repo `.tmp` 浏览器
缓存都是派生运行态，不得进入 Git、plugin 开发同步或发布物。

## CLI

所有命令都从仓库根目录调用 source entrypoint：

```bash
HARNESS="plugins/atlas-workflow/tools/atlas-3d-harness/bin/atlas-3d-harness.cjs"
```

严格校验 scenario，不启动 server/browser：

```bash
node "$HARNESS" validate \
  --scenario plugins/atlas-workflow/tools/atlas-3d-harness/examples/basic-three/scenario.json
```

运行受审查本地页面：

```bash
node "$HARNESS" run \
  --scenario /absolute/path/to/scenario.json \
  --runtime-config /absolute/path/to/runtime-config.json \
  --artifact-root /absolute/path/to/empty-artifact-root \
  --run-id atlas-3d-example-001
```

每次使用新的 `run-id`。launcher 在 browser 前完成 host、source、driver 和输入
preflight，只拥有 `127.0.0.1:41733` 的进程组，并在成功、失败、timeout 或中断后
清理。fresh BrowserContext 拒绝外联、额外 page/frame、storage、download、dialog、
file chooser 和意外 navigation；这些限制不是 OS network sandbox。

复验完整 run root：

```bash
node "$HARNESS" check-run --run-root /absolute/path/to/run-root
```

native `codex-web-acceptance check-run` 必须先通过；3D check 只会收窄结果。缺文件、
tamper、symlink、path escape、secret、重复 run id、failed/unstable 或 incomplete root
都不能被 3D facade 升级为 pass。

比较两个均已通过 native + 3D check 的完整 roots：

```bash
node "$HARNESS" compare \
  --left /absolute/path/to/left-run-root \
  --right /absolute/path/to/right-run-root \
  --purpose semantic-state

node "$HARNESS" compare \
  --left /absolute/path/to/left-run-root \
  --right /absolute/path/to/right-run-root \
  --purpose render-review
```

`semantic-state` 在 hard semantic identity 一致时比较 canonical state，输出
`equal` 或有界字段差异。`render-review` 只在 scenario/fixture、输入集合和 render
target 可配对时列出左右 PNG，供人工审阅；soft environment drift 只形成 warning。
不支持的 purpose、pixel 或 performance 比较会拒绝。

## Bridge、capture 与证据

每个 fresh viewport/context capture sequence 只用冻结 seed/epoch 成功 reset 一次；
reset 成功会使此前 capture token 失效。之后所有 checkpoint 都是绝对 seek，A-B-A
中间不 reset。atomic checkpoint 只有在 quiet/presentation closure 同时满足
`pending == 0` 与 `stateRevision == renderedStateRevision` 时提交；`renderRevision`
是独立单调的 presentation revision。transaction 失败不提交新状态或 revision，并
保留此前有效状态和 capture token。两次 captureTarget 和截图前后 geometry 必须
绑定同一 render revision，发生漂移时整个 attempt 失败且不隐藏重试。

v0.1 的固定矩阵为两个 viewport × 两个命名 view × 三个 checkpoint，共 12 个
capture。每个 capture 同时生成 canonical/raw JSON 与 same-render PNG，另有一个
capture-set manifest，因此 existing kernel 中正好登记 25 个 evidence refs。run root
仍由 Web Acceptance kernel 冻结、hash 并闭合；3D capture token 不持久化，持久化
的是 scanner-safe binding。

base oracle 检查 scene graph、transform、timeline、camera projection 与 non-empty
render；Industrial Kinematics Profile 额外检查 joint origin/axis/limits、socket、
attachment ancestry 与连续性。canonical replay 要求 fresh A、A-B-A、第二次 fresh A
在相同 fixture/seed/epoch/checkpoint 下 digest 一致。

## 资源与失败边界

实现对 capture 数、evidence refs、pixel、PNG/raw/canonical/response/log、临时文件、
stdout/stderr 和 timeout 设置联合上限，任何超限都 fail closed。outer watchdog 终止
完整进程组后不会补写控制文件；不完整 root 必须被 native check-run 拒绝。

权威接入与限制见 [仓库文档](../../../../docs/atlas-3d-harness.md)。该链接和本文件
描述的都是 source-checkout exploration，不代表安装、刷新、发布或部署授权。
