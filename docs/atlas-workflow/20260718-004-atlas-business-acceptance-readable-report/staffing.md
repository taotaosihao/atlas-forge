# 实施分工

workflow_id: `20260718-004-atlas`

## 方案阶段

- integration owner：main Codex。
- 业务可读性讨论：`business_reader`。
- 合同架构讨论：`contract_architect`。
- 反向风险审查：`adversarial_reviewer`。

## 后续实施

| 责任 | Owner 形态 | 路径或结果 |
| --- | --- | --- |
| renderer 与 artifact-lint 复用 | 单一 writable implementer | `plugins/atlas-workflow/scripts/**` |
| 模板、Team reference 与 README | 同一 writable implementer | 与 renderer 同一语义切片，避免双写 |
| 专项与回归测试 | implementer，verifier 只读复跑 | `workflow/tests/contract_team_business_acceptance.sh`、`workflow/tests/contract.sh` |
| 冻结 diff 语义审查 | 独立 read-only reviewer | 四态、环境、证据边界、兼容、presentation fail-closed |
| Plugin identity | main Codex | reviewer 通过后最后 cachebuster；其后 plugin tree 不再变化 |
| 最终集成 | main Codex | 验证、精确 stage、一个 Conventional Commit，不推送、不刷新运行态 |

## 协作约束

- 紧耦合文件只有一个 writer；不拆成多个并发写入 lane。
- reviewer 可以发现其他问题，但只有当前合同 blocker、当前 diff regression 或安全/权限/数据风险进入当前修复。
- 是否启用原生子 Agent 由实施时风险决定，不建立固定 Team。
