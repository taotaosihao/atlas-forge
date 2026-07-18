# 方案证据索引

workflow_id: `20260718-004-atlas`
artifact_category: phase_conclusion

## Brownfield 证据

- 当前模板暴露机器字段：`workflow/templates/business-acceptance-report.md`、`business-evidence-map.md`、`business-verdict.md`。
- 机器字段被测试固化：`workflow/tests/contract_team_business_acceptance.sh` 与 `workflow/tests/contract.sh`。
- 当前 machine truth：`plugins/atlas-workflow/contracts/team-sdd/business-*.schema.json`、`validators/business-*.js`、`scripts/codex-team-artifact-lint`。
- Phase 6 能力边界：`docs/atlas-workflow/20260710-003-atlas-forge-release-integrity-governance-plan/evidence/phase-6-conclusion.md`。

## 方案阶段验证

- 多 Agent：三个只读席位完成两轮独立审阅和交叉质疑，结论记录于 `../team-decision.md`。

| Gate | 命令或动作 | 结果 |
| --- | --- | --- |
| Markdown links | `scripts/check-relative-markdown-links.py --root .` | 通过；检查 228 个 Markdown 文件和 73 个相对链接 |
| Contract index | `node plugins/atlas-workflow/scripts/codex-contract-index-lint --root docs/atlas-workflow/20260718-004-atlas-business-acceptance-readable-report` | `contract_index_lint: true` |
| Implementation contract | `node plugins/atlas-workflow/scripts/codex-implementation-contract-lint --strict --file docs/atlas-workflow/20260718-004-atlas-business-acceptance-readable-report/implementation-contract.final.md` | semantics v1，0 errors，0 warnings |
| Workflow readiness | `codex-workflow ready 20260718-004-atlas --require context,spec,decision` | `status: ready`，issues 为空 |
| Markdown diff | `git diff --check` | 通过 |
| Forbidden paths | `git diff --exit-code -- plugins/multica-sdlc .agents` | 通过；无 diff |
| Hard fingerprints | 只读 `git rev-parse HEAD:plugins/multica-sdlc HEAD:.agents` | `8b87ecd1c5decce18f31e65442747661debfcb5e` / `3e3f8d512d88d309830ceb180baf694149ffa657` |

## 实施阶段证据预算

- Git 只保留最终代码、测试、必要 golden fixture、权威合同和一个精简 phase conclusion。
- 原始命令输出、临时 BAF bundle、失败重试、完整 diff、hash 中间值和 debug 输出放 Git 外临时目录。
- 本任务不创建截图、视频、HAR、Playwright trace 或浏览器证据；Product/UI gate 不适用。
