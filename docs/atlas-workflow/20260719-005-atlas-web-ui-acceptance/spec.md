# 执行规格

workflow_id: `20260719-005-ai-ui-intake`

## 目标

交付 Atlas Web UI execution/audit/evidence 薄层与 Sharp Cell 单条 reference scenario，证明真实业务闭环可以被机器证据和人类可读材料共同验证，且不能由 AI、重试、mock 或局部 pass 伪造最终通过。

## 非目标

- 新 acceptance/verdict/evidence 平台。
- Dashboard、常驻服务、低代码编辑器、自动修复平台。
- 完整视觉 AI、Canvas/拖拽通用库、Android、桌面、真实 CNC。
- Sharp Cell 全量 E2E 迁移或第二项目接入。
- 安装态刷新、marketplace mutation、部署、push、PR 或发布。
- Multica 读取业务内容、修改、运行或同步。

## 接口边界

### Core CLI

- `audit`：不依赖完整 project config 扫描 Playwright 源码与配置；JSON 模式 stdout 仅输出单 envelope，人类模式输出中文摘要。
- `run`：创建不可变 run identity，按 project config 调用 adapter phases，保存 attempts 与 evidence。
- `check-run`：验证 required evidence、attempt history、digest、secret policy 和 failure class，输出 technical run result。
- `review`：从已验证 contract/evidence 生成绑定 digest 的中文 scenario 审核卡；不重算 verdict。

### Project Adapter Protocol

- project config 只允许 argv 数组命令，不允许 shell command string。
- Core 以 JSON stdin 提供 protocol version、phase、task/run/scenario identity、project root 和 artifact root。
- adapter 以单个 JSON stdout envelope 返回原始 phase facts、evidence refs、diagnostics 和 project failure facts。
- project config 为 required claim 声明独立 validator argv；validator 绑定 claim/input/evidence digest 并确定性输出 passed/failed。
- 非 JSON stdout、未知字段、协议版本不匹配、绝对逃逸路径、symlink evidence 或 secret diagnostic 均失败关闭。

### BAF Bridge

- Web run result 作为 technical/business evidence 引用进入现有 `business-evidence-map.json`。
- strict `codex-team-artifact-lint --business-acceptance` 继续判断 bundle legality。
- 现有 `business-verdict.json` 是唯一最终业务 verdict；Web CLI 不新增同义状态。

## 验收摘要

- 静态 audit 能检出当前 Sharp Cell 的 API login/cookie 注入、脆弱 locator、route mock、弱后置断言和 retry 风险。
- Core 源码不出现 Sharp Cell 业务/viewport/账号常量。
- 首试失败后重试成功不能通过；缺证据、局部 pass 和 non-claim 不能通过。
- 三次 fresh-seed 新 run 均首次通过后完成 v1。
- Sharp Cell 锚点覆盖 UI 工单发布、LineTask 启动、material chain、适用的 CNC/file readiness、invalid/valid callback 对照和 running 回显。
- 中文审核卡显示参考图与实际截图，且与机器 contract/evidence digest 一致；acceptance owner 对当前 digest 的“符合”判断是 final accepted 必需证据。
- 中文 renderer 依赖由 `20260718-004-atlas` 独立交付；缺失时 Phase 2 记录 `blocked_dependency`，不扩大当前任务。

## 验证

完整验证行和停止条件以 [最终实施合同](./implementation-contract.final.md) 为准。
