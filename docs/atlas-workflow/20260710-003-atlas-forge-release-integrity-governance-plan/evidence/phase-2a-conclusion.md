# Phase 2A 结论：Atlas 本地开发通道隔离

- task_id: `20260710-004-atlas-forge`
- phase: `2A`
- verdict: `passed`
- channel: `development-only`
- release_channel_status: `fail-closed pending Phase 2B`

## 完成内容

- `scripts/update-atlas-workflow-plugin` 只接受 canonical `local-atlas` marketplace 和 `./plugins/atlas-workflow` source，不再写 Git marketplace snapshot、`cache/atlas-forge` 或 `latest` fallback。
- 新增 `scripts/sync-live-atlas-workflow.sh`，仅同步四类 workflow 目录、README/source-root、四个 native Atlas agents 和四个 Atlas shims；不调用 shared/full sync，也不写 legacy agents 或 Multica。
- Plugin source、local cache 和 workflow managed assets 均先完整 staging/verification，再通过 sibling rename 提交；downstream sync 失败会恢复旧 source/cache，避免跨组件 split state。
- 所有 managed roots 在任何 mkdir/copy 前完成 forbidden-root、pairwise-overlap 和 existing symlink-prefix 检查。
- `--contract` 仅运行 Atlas plugin integrity targeted suite，并在任何 runtime 写入前执行；system validator 是可选补充，不能替代 repo integrity gate。

## 隔离矩阵

`workflow/tests/integration_atlas_plugin_dev_sync.sh` 的 24 项检查覆盖：

- canonical success、dry-run 零写和 repo/local source/local cache 完整相等。
- missing/wrong/non-object/duplicate marketplace、wrong source kind/path、path escape 和 source/cache symlink preflight failure。
- snapshot、release cache、legacy agents 与 managed-root overlap 注入均在 local copies 改变前失败。
- source copy、workflow copy 和 updater 第三次 rsync 失败均保留旧 source/cache/workflow/agents/shims。
- managed target symlink 只替换 symlink 本身，不跟随写入 release sentinel。
- FIFO/special source 在任何 runtime 写入前被拒绝。
- unrelated workflow state、native agent、legacy agents 和 Multica shim sentinels 全部保持不变。

## 验证

- `bash workflow/tests/integration_atlas_plugin_dev_sync.sh`：24 项全部通过，主线程和独立 verifier 各运行一次。
- 三个 shell `bash -n`、`git diff --check`、mode `755`：通过。
- 隔离环境真实 `--dry-run` 和安装后 shim direct invocation：通过且零越界写入。
- 可选 validator 缺失时只报告 skipped；注入 exit `17` 时在任何 runtime 写入前失败。
- Changed paths 仅为 updater、新 Atlas-only sync 和 dev integration test。
- Multica hard gates 与 Phase 1 baseline 完全一致：repo plugin tree `8b87ecd1...`、repo `.agents` tree `b3a8fdf8...`、immutable runtime `7a35c067...`、shim `9c96fa9a...`、Codex cache `c89da8d1...`。

## 已知边界与下一步

- 公开 `codex-refresh-local-plugin` direct entrypoint 仍保留旧的 destructive replacement 和路径注入风险；Phase 2A2 必须独立加固后，dev channel 才形成完整闭环。
- Codex CLI `0.144.0` 的隔离 characterization 证明 marketplace upgrade 会在 verifier 前自动刷新 enabled cache，且失败可形成 snapshot/config/cache split-brain。
- 因真实 `atlas-forge` marketplace 同时承载 MemPalace/Multica，Phase 2B release wrapper 必须对当前 shared marketplace fail closed；在 Atlas-only exact-SHA source 可证明前不执行真实 upgrade。
- `workflow/tests/contract.sh` 的旧 dry-run fixture 尚未创建 canonical local marketplace；由 Phase 4 hermetic suite 收敛，不影响本 phase targeted verdict。
