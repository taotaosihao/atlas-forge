# 实施分工

workflow_id: `20260720-001-atlas`

当前仅完成 clarification，由主 Codex 负责方案集成；未启动实施 Team。后续实施若获授权，使用一个单一可写 owner，reviewer/verifier 保持只读；只有需要重新执行真实浏览器场景时才增加 browser-verifier。

| 责任 | Owner | 边界 |
| --- | --- | --- |
| review-card v2、Core validator、Markdown view | Atlas Forge implementer | 只修改 Atlas Web acceptance owned paths，不改 BAF verdict semantics |
| Sharp Cell flow contract 与 granular evidence bridge | Sharp Cell implementer | 只提交项目领域 contract/raw refs，不把业务写进 Core |
| 独立协议与 tamper 复核 | reviewer/verifier | 只读检查完整性、authority、v1 compatibility 和负向矩阵 |
| 真实浏览器补采 | browser-verifier | 仅在现有 run evidence 缺失且用户明确授权新 run 时启用 |
| 业务符合性判断 | acceptance owner（用户） | 基于当前完整 flow 材料登记“符合/不符合/需修改” |
| 集成与范围控制 | 主 Codex | 精确提交；禁止 push、PR、部署、发布、安装刷新与 Multica |
