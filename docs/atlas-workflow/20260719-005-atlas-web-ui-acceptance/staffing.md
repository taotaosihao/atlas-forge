# 实施分工

workflow_id: `20260719-005-ai-ui-intake`

本 clarify 未使用多 Agent，后续实施也不预设固定 Team。主 Codex 是集成 owner；是否增加只读 reviewer 由实施时风险和用户授权决定。

| 责任 | Owner | 路径或结果 |
| --- | --- | --- |
| Atlas Web audit/runner/protocol | Atlas Forge implementer | `workflow/bin/**`、`workflow/contracts/web-acceptance/**`、专项测试 |
| BAF bridge 与中文阅读依赖 | Atlas Forge implementer | 复用既有 BAF；中文 renderer 按 `20260718-004-atlas` 合同实施 |
| Sharp Cell project config/adapter/scenario | Sharp Cell implementer | `acceptance/web/**`、目标 E2E 与必要产品可测试性改动 |
| 业务/design 关键变化 | 用户 | 中文验收卡或差异卡确认 |
| 最终集成与范围控制 | 主 Codex | 跨仓库验证、精确提交、无 push/部署/安装刷新 |

## 写入规则

- 同一紧耦合文件只有一个 writer。
- Atlas 与 Sharp Cell 分开形成可回退的逻辑成果；不把两个仓库放进同一 Git commit。
- reviewer 发现的非当前目标问题只记录 follow-up，不自动扩展实施。
