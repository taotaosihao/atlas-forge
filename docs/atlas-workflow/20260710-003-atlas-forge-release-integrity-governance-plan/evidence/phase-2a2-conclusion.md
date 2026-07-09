# Phase 2A2 结论：公开 Local Cache Helper 加固

- task_id: `20260710-004-atlas-forge`
- phase: `2A2`
- verdict: `passed`
- channel: `development-only direct entrypoint`

## 完成内容

- `codex-refresh-local-plugin` 从 generic destructive copier 收敛为只接受 `atlas-workflow` 的结构化 Atlas-only 命令。
- Marketplace、source 和 target 均固定为 canonical `local-atlas` 路径；selector、marketplace name、source path、cache root 与 marketplace file不再参与目标路径拼接。
- 所有输入在任何 mkdir/copy 前完成 absolute/canonical、existing symlink component、forbidden root 与 ownership overlap检查。
- Source manifest 由同目录 `atlas-plugin-integrity manifest` 强制验证；source 与 existing cache只允许 regular directory/file tree，tree identity包含相对路径、类型、mode、size和SHA-256。
- 刷新事务使用 sibling stage、source/marketplace/target稳定性复核、backup/rename和postflight；existing/absent target失败均恢复原状态并清理transaction-created parents。
- 完全相等的cache返回 `action=noop`，不创建stage，也不替换目录inode。
- Bash wrapper通过 `exec python3`让公开helper PID就是事务进程；`SIGINT`/`SIGTERM`进入同一rollback路径，不再留下后台orphan mutation。

## 验证

- `bash workflow/tests/contract_refresh_local_plugin.sh`：40项全部通过，主线程与独立verifier各运行一次。
- 正向覆盖first install、replace、hidden/executable mode、canonical explicit override、true no-op、`CODEX_HOME` fallback、installed-location inference和repo direct fail closed。
- 负向覆盖selector、JSON/name/duplicate/source path/kind、cache/marketplace override、special entry、component symlink、legacy/release双向重叠、workflow/local-bin/Codex-agent ownership重叠。
- Copy/install/postverify failure对existing和absent target均回滚；first install失败恢复完整CODEX root fingerprint。
- Backup出现后真实发送`SIGTERM`：退出1、JSON `REFRESH_INTERRUPTED`、旧tree与inode恢复、无stage/backup debris。
- Phase 2A `integration_atlas_plugin_dev_sync.sh` 24项回归继续全部通过。
- `bash -n`、`git diff --check`、两个文件mode `755`、changed-path gate：通过。
- Multica repo trees、immutable runtime、shim和Codex cache五项hard fingerprints全部逐值匹配baseline。

## 已知边界

- `SIGKILL`、断电或filesystem损坏无法获得数据库式全局原子性；普通exception、测试注入、`SIGINT`和`SIGTERM`已有rollback证明。
- Source内部symlink整体被拒绝；当前Atlas plugin无symlink，此策略有意保持fail closed。
- Test-only failpoint/pause必须显式testing mode才可启用，且只能制造安全失败或最多60秒暂停，不能改变ownership路径。
- Phase 2B release通道仍未关闭；shared marketplace upgrade的pre-verifier mutation和split-brain风险不受本slice改变。
