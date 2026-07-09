# Native Plan Review

- workflow_id: `20260710-003-atlas-forge`
- backend: native
- review_status: complete

## Review Lanes

| Lane | 结论 |
| --- | --- |
| release-integrity-architect | 必须分离 dev local-atlas 与 release atlas-forge；禁止 latest fallback 和 release cache 直接写入 |
| contract-ci-reviewer | Repo/host tests 必须按责任拆分；semantic lint 采用 versioned envelope 和正反 fixtures |
| scope-risk-verifier | 仅隔离 CODEX_HOME 不够；Multica repo/runtime 都要进入 forbidden set，共享全量 installer/sync 保持冻结 |

## 重要修订

1. 不修改 `install-atlas-forge.sh`、`sync-live-agents.sh` 或 Multica source。
2. Atlas 建立专用 sync、integrity 和 marketplace update helper。
3. 现有 Atlas 专用 `scripts/update-atlas-workflow-plugin` 只允许移除发布 cache/Multica 副作用并委托 Atlas-only sync。
4. Cachebuster 在 release slice 的所有 plugin 内容完成后最后更新；后续 plugin tree 再变必须重新 bump。
5. First-code/UI 和 BAF semantic enforcement 分开实施；outcome metrics 等稳定事件模型后再规划。

## 残余未知项

- Codex CLI marketplace JSON 是否提供完整 resolved commit 和 installed root。
- CI runner 是否能固定兼容 Codex CLI；真实 marketplace E2E 可能保留为本地或 self-hosted gate。
- Prompt 128 字符边界以 runtime 实际行为作为最终判定。
