# 实施分工

workflow_id: `20260719-005-ai-ui-intake`

最终合同已使用 native Team 做只读对抗评审，并按用户“修正”授权由主 Codex 收敛。后续实施不预设固定 Team；主 Codex 是集成 owner，是否增加 reviewer 由实施时风险和用户要求决定。

| 责任 | Owner | 路径或结果 |
| --- | --- | --- |
| Atlas Web audit/runner/protocol | Atlas Forge implementer | `workflow/bin/**`、内置 contracts、sync/shim 边界与专项测试 |
| BAF bridge、owner decision validator 与精简中文 handoff | Atlas Forge implementer | 复用既有 BAF；提供 human-first review card；实现 Core-owned `acceptance-owner-design-intent`，只校验当前引用对应关系和人工判断登记，不实现 renderer 平台 |
| Sharp Cell project config/adapter/validator/scenario | Sharp Cell implementer | `acceptance/web/**`、planner provisioning、目标 E2E 与必要产品可测试性改动 |
| 业务/design 最终符合性 | acceptance owner（用户） | 按场景操作、对照预期与实际/运行证据，并对当前引用对应的中文审核卡记录“符合/不符合/需修改” |
| 最终集成与范围控制 | 主 Codex | 跨仓库验证、精确提交、无 push/部署/安装刷新 |

## 写入规则

- 同一紧耦合文件只有一个 writer。
- Atlas 与 Sharp Cell 分开形成可回退的逻辑成果；不把两个仓库放进同一 Git commit。
- reviewer 发现的非当前目标问题只记录 follow-up，不自动扩展实施。
