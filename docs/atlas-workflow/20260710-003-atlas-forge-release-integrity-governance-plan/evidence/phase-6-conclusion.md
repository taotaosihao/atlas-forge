# Phase 6 结论：BAF v2 Dual-goal 语义门禁

- task_id: `20260710-004-atlas-forge`
- phase: `6`
- verdict: `passed`
- native_review: `2 x PASS`
- plugin_version: `0.1.0+codex.20260710031301`
- business_intent_validator_sha256: `c3249ef78d7906fb2c9d778afde5acec1c53c5b1c3f4454b79f39ab9391fcc49`
- business_verdict_validator_sha256: `e9a52826ff04653db881f3823f401694a3fb5e61d9cba0d3dd2be1952436ae4e`
- artifact_lint_sha256: `d57d1a17502193b0b33e4b96d310b09c53197e58698e82fe9233505222416a00`
- dedicated_test_sha256: `3055a71b6976681efd2d52213de619a73f54a6a7cb7457b5e0debbdddaeae2ef`

## 完成内容

- `business-intent` 和 `business-verdict` 增加 JSON Schema/validator v2 分支；v1 分支和既有 v1 fixtures 保持不变。v2 intent 必须声明 `closure_mode: standard | dual_goal`，v2 verdict 必须声明 `blockers`。
- `dual_goal` verdict 同时记录 Goal A/Goal B 的 `status`、`evidence_refs`、`integration_path_id` 和 `integration_mode`。`standard` 禁止 goal 字段，`dual_goal` 要求两侧同时存在。
- `accepted` / `conditionally_accepted` 要求两目标均 passed、顶层 technical/business 状态均 passed、两侧证据非空且不可互相替代，并使用同一 `real` 或 `approved_simulator` integration path；`blocked` / `rejected` 要求明确的 named blocker。
- evidence closure 会拒绝缺失或失败的引用、重复 evidence ID、缺失 scenario、task mismatch、目录、symlink、hardlink alias 和同一 canonical local/HTTP(S) 证据替代。manual/external URI 受类型和无凭据边界约束。
- acceptance report 会拒绝 blocking gate、计数不一致、失败 scenario、空结果、phantom/duplicate result、遗漏 scenario 和重复 scenario-card ID。
- v1 artifact 在非 strict `--business-acceptance` 路径保持通过并只给一次 `LEGACY_BAF_V1` warning；strict v1 与 v1/v2 mixed bundle fail closed。不传 business acceptance 开关时既有 SDD-only 行为不变。
- 三份业务模板改为写入 v2 字段；没有批量改写历史 artifact。

## 发布身份

- release base：`4c58e8f`；base version：`0.1.0+codex.20260710021709`。
- current version：`0.1.0+codex.20260710031301`，由 `plugin-creator` cachebuster helper 在内容冻结和双 reviewer PASS 后生成。
- plugin tree：`sha256:e1b43482988334afc3719f40403de68b2ab2c86d82420ff58bf70997a5c4903d`（61 files）变为 `sha256:44ef63f879fcdb1fa5ced9462d018e0e786b7b9c636a4eb238612300da4e135a`（61 files）。
- release gate 证明 `tree_changed=true`、`version_changed=true`，当前版本在 base/HEAD ancestry 中没有历史 collision 或复用。
- cachebuster 后插件内容未再修改，四个冻结 SHA-256 保持不变。

## 验证

- 两名独立只读 reviewer 对同一组四个冻结 SHA-256 给出 `PASS`；分别复跑 v1/v2 schema、strict/non-strict、Goal A/B、evidence substitution、report/scenario closure 和合法 blocker 回归。
- `bash workflow/tests/contract.sh`：`rc=0`；manifest/release、repo source、189 项 implementation semantic suite、host layout、strict doctor、local-cache transaction 和 dev-sync 全部通过。
- `bash workflow/tests/contract_repo.sh`：独立 reviewer 复跑 `rc=0`，隔离 HOME/CODEX_HOME/AGENTS_HOME/XDG/TMP 边界通过。
- `validate_plugin.py plugins/atlas-workflow`：通过。
- `atlas-plugin-integrity manifest` 与 `release --base 4c58e8f`：`ok=true`。
- `node --check`、`bash -n`、JSON Schema Draft 7 检查和 `git diff --check`：通过。

## 安装与运行边界

- 本阶段没有刷新、重装或修改真实 marketplace、真实 Atlas cache 或共享运行态；只验证仓库源码和隔离临时安装态。
- 没有运行 `ATLAS_CONTRACT_LEGACY_HOST=1`、真实 Codex CLI E2E、Multica tests、router、listener 或 runtime。
- 本门禁验证机器可观察的结构、引用、状态和证据身份，不声称证明 evidence 内容真实性，也不在线探测 external evidence 可达性。
- 自由文本无限同义词枚举和 integration path 命名质量不属于本阶段批准 AC，保留为可选后续增强。

## Multica 零修改门禁

Multica 继续仅标记为 planned deprecation。本阶段没有修改或执行其代码、测试、router、listener 或 runtime；hard gate 与任务基线逐值一致：

- repo `plugins/multica-sdlc` tree：`8b87ecd1c5decce18f31e65442747661debfcb5e`
- repo `.agents` tree：`b3a8fdf84d65e709d97769b05aff083843b2047d`
- immutable runtime：`7a35c067526209a6cc9444da140cab4568538c4c38a129e1705bbafc39a22fd4`
- shim：`9c96fa9acd7d7452e321b3c4ee8c017a3f87cf9f2490e1cb1b7775f31c005a83`
- Codex Multica cache：`c89da8d13d136a5dc2a6a7224810dca618ec225616b3adbd996519742516d0ef`
- forbidden working-tree/status paths：`0`

## 结论

Phase 6 已满足批准的 dual-goal、v1 compatibility、证据不可替代和 report/scenario 闭环条件，可作为独立 keeper commit 提交。下一步仅执行 Phase 7 最小文档治理和最终分支审计。
