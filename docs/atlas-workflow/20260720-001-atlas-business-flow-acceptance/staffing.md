# 实施分工

workflow_id: `20260720-001-atlas`

当前实施继续使用一个单一可写 owner，独立 reviewer/verifier 保持只读；只有需要重新执行真实浏览器场景时才增加 browser-verifier。外部 storage/rehydration 工作已移出 Required，不配置相应实施角色。

| 责任 | Owner | 边界 |
| --- | --- | --- |
| review-card v2、Core validator、Markdown view | 单一可写实施 owner | 只修改 Atlas Web acceptance owned paths，不改 BAF verdict semantics |
| Sharp Cell flow contract 与 granular evidence bridge | 同一单一可写实施 owner | 只提交项目领域 contract/raw refs，不把业务写进 Core；不得形成第二写入 lane |
| 独立协议与 current-reference 复核 | reviewer/verifier | 只读检查完整性、authority、v1 compatibility 和最小确定性负例 |
| 真实浏览器补采 | browser-verifier | 仅在现有 run evidence 缺失且用户明确授权新 run 时启用 |
| 业务符合性判断 | acceptance owner（用户） | 基于当前完整 flow 材料及已登记 evidence refs 登记“符合/不符合/需修改” |
| 集成与范围控制 | 主 Codex | 精确提交；禁止 push、PR、部署、发布、安装刷新与 Multica |
