# 操作手册式验收：本地接入示例

本示例通过现有 `codex-web-acceptance` 运行本地页面，演示输入、提交、等待和重新读取结果。标准模式保持原有流程检查；手册模式同时生成带中文说明的真实录屏和离线 HTML。它不是通用录屏引擎，不证明其他项目或现场系统已通过验收。

前提：本机已有 Node、Playwright Chromium、FFmpeg/FFprobe。默认复用本 checkout 的 3D harness 已安装的 `playwright-core` 包，但不调用或修改 3D harness；也可通过 `ATLAS_GUIDE_PLAYWRIGHT` 指定现有包的绝对路径。没有这些依赖时明确失败，不自动下载或安装。

在仓库根目录运行（`<绝对输出目录>` 应是实际存在或允许新建的、无符号链接的保留目录）：

```sh
workflow/bin/codex-web-acceptance run \
  --project-config workflow/examples/operation-guide/manual.config.json \
  --contract workflow/examples/operation-guide/scenario.json \
  --artifact-root <绝对输出目录> --run-id manual-example --format json
```

改用 `standard.config.json` 即为默认标准模式，不要求视频或手册。`manual` 是该项目 adapter 的参数，不是新增的通用 CLI 选项。每次使用新的 run-id，示例仅绑定回环地址且数据在服务退出时消失。

输出位于 `<绝对输出目录>/manual-example/attempt-1/`。交付 `操作演示.mp4` 和 `操作手册.html` 两件到同一目录即可离线阅读；截图已经内嵌。原始视频、步骤记录和截图保留在本次 evidence 目录供核验，不必一并发给操作员。手册中的本次示例地址在运行结束后失效，复现须重新启动示例。

检查运行记录：

```sh
workflow/bin/codex-web-acceptance check-run \
  --run-root <绝对输出目录>/manual-example --format json
```

接入其他项目时，替换该项目的实际页面与操作驱动，继续用批准的同一场景步骤生产两种材料，并保持 `required_evidence` 的双件要求。独立 validator 使用 `run-context@1` 读取实际文件，检查媒体解码、离线 DOM、步骤覆盖、时间码与来源。不要直接复用本例固定的四步业务断言。最后仍须完整播放视频、阅读手册，确认动作和说明可辨认；机器校验不代表可读性或业务验收批准。

选中手册模式后，缺件、损坏或说明不完整时，功能结果照实保留，材料交付未完成；不得静默回退到标准模式。业务操作权限、认证或发布权限不随交付形式扩大。

完整本地正反例与便携性检查（会启动本地示例、录制约 30 秒）：

```sh
node workflow/tests/operation-guide.test.cjs
```

通过 `ATLAS_GUIDE_OUTPUT` 指定该测试的保留输出目录，方便人工回看。未指定时测试会创建并打印系统临时目录，不能把临时目录作为最终交付位置。
