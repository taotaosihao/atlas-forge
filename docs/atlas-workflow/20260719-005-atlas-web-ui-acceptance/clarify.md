# 执行澄清

workflow_id: `20260719-005-ai-ui-intake`

## 已锁定方向

Atlas BAF v2 继续负责业务事实、strict closure 和最终 verdict。新增 Web 薄层只负责：审计现有 Playwright、编排项目 adapter、保存 attempt/evidence、产生 fail-closed technical run result，并把可验证证据交给 BAF。

项目 adapter 不作为可加载的 Atlas TypeScript 模块。Core 启动项目配置中的 argv 数组命令，以 stdin/stdout JSON envelope 交互；项目可以用自己的 TypeScript 工具链实现该命令。这样不要求 Atlas Forge 增加 npm workspace 或理解项目依赖。

## Core 不变量

- required evidence 缺失、blocked、skipped、missing、non-claim 或 digest mismatch 必须失败关闭。
- attempt 1 非 passed 时，同一 run 即使重试成功也只能为 unstable 或 failed。
- 正式 run 期间 contract、project config、failure class 和 evidence index 不可变。
- adapter 只能提交原始结果和证据引用，不能提交最终业务 verdict，也不能用自身 phase status 证明 required claim。
- required claim 必须由 adapter 之外的确定性 validator 绑定 input/evidence digest 后失败关闭。
- AI、Playwright exit code、重试和中文摘要均不能覆盖 strict BAF verdict。
- secret 不得进入报告、截图元数据、Trace 附件摘要或 Git evidence。

## 项目策略

项目配置 viewport/browser matrix、角色、入口、连续成功次数、业务路径、截图锚点、adapter command、提升环境和证据保留策略。Core 只校验、编排和标识这些值。

## Sharp Cell Reference Pack

- 角色：`planner`。
- 浏览器入口：项目本地真实 `/login`。
- viewport：项目配置 `1366x768`。
- 数据：隔离 fresh seed 的本地 Web/API/DB/worker/queue。
- 设备侧：approved simulator，通过真实 Beezer token/timestamp/HMAC ingress。
- 必经路径：UI 创建/发布工单并启动 LineTask；project config 冻结非 CNC、`plc_report_only` reference target 并提供 CNC/file readiness 不适用证据；signed ingress 完成 material chain。
- 正向终点：目标 `DeviceTask` 为 `running`，UI/API/DB/audit/attempt-1 Trace 一致。
- 反证：无效签名被拒绝且同一任务状态不变。
- 人工门禁：acceptance owner 对绑定当前 digest 的中文审核卡记录“符合”，并通过 Core-owned `acceptance-owner-design-intent` 校验后，才能支持 final accepted。

## 修复归责

- 产品行为、项目环境、seed、locator、项目 adapter/validator：Sharp Cell 仓库。
- runner、通用审计、JSON 协议、证据完整性、BAF bridge：Atlas Forge。
- 关键业务或 design 意图歧义：停止自动修复，生成中文差异卡交用户决定。
