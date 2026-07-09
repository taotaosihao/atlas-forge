# Staffing

- workflow_id: `20260710-003-atlas-forge`
- artifact_category: durable handoff

## 默认实施模型

- 每个 phase 一个 writable owner，main Codex 负责集成。
- 实现完成后启用只读 reviewer 和 verifier。
- 不设置 Multica role，不使用 Multica handoff。
- 多个 phase 不并行写同一脚本或 contract surface。

## Phase Ownership

| Phase | Primary Owner | Read-only Review | Required Gate | Commit Boundary |
| --- | --- | --- | --- | --- |
| 1 Manifest/release identity | Atlas release owner | manifest/release reviewer | limits、version/tree gate、validator | one commit，cachebuster 最后写入 |
| 2 Channel separation | Atlas install owner | rollback/scope reviewer | stale/collision/downgrade fixtures、Multica fingerprint unchanged | one commit |
| 3 Strict doctor | workflow CLI owner | diagnostics verifier | positive/negative JSON/exit-code fixtures | one commit |
| 4 Tests/CI | test owner | CI reviewer | clean HOME repo contract、host layout fixtures | one or two commits |
| 5 First-code/UI lint | Atlas contract owner | compatibility reviewer | valid/invalid fixture matrix | one commit |
| 6 BAF v2 lint | business contract owner | business evidence reviewer | v1 compatibility、dual-goal fixtures | one commit |
| 7 Docs hygiene | docs owner | link verifier | link check、authority index | one commit |

## Forbidden Ownership

没有角色可以写入：

- `plugins/multica-sdlc/**`
- `.agents/**`
- Multica router/listener/generated/templates/fixtures/self-tests
- `$HOME/.agents/**`
- `$HOME/.local/bin/multica-prd-submit`
- `$HOME/.codex/**/multica-sdlc/**`

## Verification Evidence

- 每个 phase 保存小型 phase conclusion，不提交 raw install trees 或全量日志。
- 发布相关验证必须记录 source commit、manifest version、source/snapshot/cache tree hash 和 exact cache path。
- 实施前后记录 Multica runtime fingerprint；必须完全不变。
