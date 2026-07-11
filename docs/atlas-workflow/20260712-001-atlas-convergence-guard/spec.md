# 执行规格

## Goal

让 Atlas 对明确任务快速收敛、对完整 roadmap 连续执行，并防止非实施任务误晋级或 reviewer 自动扩大工作面。

## Non-goals

- 不建设宿主 capability、roadmap/scope 状态机、acceptance hash 或预算系统。
- 不设置默认数字型自动停止条件。
- 不修改 Multica、安装 cache、marketplace、runtime 或 release 状态。

## Required Outcomes

1. Execute 缺明确实施消息审计引用时无副作用失败；该引用不验证用户消息语义或宿主权限；discuss 与非 execute promotion 兼容。
2. 用户级规则不再常驻 Atlas 专用 routing/cache 细节。
3. Task/CW 不再把多文件或行为变化自动升级 Team，也不强制普通非 tiny 工作生成完整 artifact 套件。
4. Team 不再常驻 dynamic staffing、逐轮 commit、开放式 clean repair 和无条件 whole-branch review；SDD/BAF 按需加载。
5. Reviewer 发现自由、自动 repair 有限；已授权 full-roadmap 连续执行但持续执行措辞不扩权；commit 适中自动化；checkpoint 单一覆盖写。
6. Checkout、Multica、release 和最小验证边界保持；与 Team 合同耦合的既有用户改动经授权后独立提交。

完整验收与命令见 [权威实现合同](implementation-contract.final.md)。
