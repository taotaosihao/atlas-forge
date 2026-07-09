# Phase 3 结论：Plugin-scoped Strict Doctor

- task_id: `20260710-004-atlas-forge`
- phase: `3`
- verdict: `passed`
- release mutation: `disabled`
- Multica status: `planned deprecation；未修改`

## 结论

Phase 3 已把 Atlas plugin 安装态漂移收敛为可自动执行的严格门禁。`codex-workflow doctor --strict --json` 始终先生成完整报告，再仅依据六个 plugin integrity section 决定退出码；既有 host/runtime 观察项不参与 strict 成败，legacy `doctor --json` 行为保持兼容。

严格诊断是纯只读能力，不会同步 active task、不追加 runtime event、不调用 Codex CLI 或 Paseo，也不会执行 marketplace upgrade/add。Phase 2 的 release mutation 禁用结论保持不变。

## 严格合同

六个 critical section 为：

- `manifest_compatibility`
- `source_local_cache`
- `marketplace_snapshot`
- `exact_release_cache`
- `version_collision`
- `release_downgrade`

退出语义为：

| 退出码 | 条件 |
| --- | --- |
| `0` | 六个 critical section 全部为 `ok` |
| `1` | 报告完整，但至少一个 critical section 检出漂移、碰撞或降级风险 |
| `2` | CLI 用法、路径边界、配置解析或 integrity helper envelope 无法被可信验证 |

`hooks_runtime=configured_unproven`、`smoke=no_proof`、hooks 缺失或不安全文件类型等非关键观察项不改变 strict gate。严格用法错误同样先输出完整 JSON，再退出 `2`；stderr 保持为空。

## 只读与身份加固

- 所有 source、local cache、marketplace snapshot、exact release cache 与 config 路径均从 canonical `CODEX_HOME_ROOT` 固定推导，不接受调用方重定向。
- Snapshot 必须自有真实 `.git` 目录；Git metadata symlink、external alternates、commondir、worktree config、grafts、replace refs、gitlink 与嵌套 Git metadata均 fail closed。
- Repo-local Git config 在任何 `git -C` 前通过 standalone `git config --no-includes --file` 解析，并只允许 clone 所需的安全 key；include/includeIf、fsmonitor、external excludes/attributes、filter、partial clone 和其他未知执行/外读面均被拒绝。
- Strict 路径不再使用 `git status`。Configured commit 的原始 `ls-tree` 与磁盘 Atlas tree 按 path、mode 和 blob OID 精确比较，独立于 ignore、assume-unchanged、skip-worktree、filter 和 index 状态；`GIT_NO_REPLACE_OBJECTS=1` 固定原始对象语义。
- Marketplace JSON 同样绑定 configured commit；sidecar、origin、ref、last_revision 与 selector identity 必须逐值一致。共享 marketplace 中其他 plugin 的 selector 或工作树变化不进入 Atlas strict gate。
- Git include、source URL 与 hooks command 中的敏感值不会进入报告；报告只保留安全布尔值、计数、状态与结构化错误码。
- 非关键 hooks/source-cache 摘要使用 `lstat`/既有 critical section 派生，不跟随 symlink、不读取 FIFO，因此 hostile 文件类型仍能得到完整 JSON。

## 验证证据

| 验证 | 结果 |
| --- | --- |
| `bash workflow/tests/contract_atlas_doctor.sh` | `35/35`；健康、flag 顺序、text/JSON、active task 零写、六类计划内漂移和 hostile filesystem/Git fixtures 全部通过 |
| `bash workflow/tests/contract_atlas_plugin_integrity.sh` | `36` 条 `ok`；manifest name、release identity、layout 与 doctor helper 回归通过 |
| `bash workflow/tests/integration_atlas_plugin_layout.sh` | `32/32`；Phase 2 stale/collision/downgrade/snapshot ownership 回归通过 |
| `bash workflow/tests/integration_atlas_plugin_dev_sync.sh` | `24/24`；Atlas-only dev channel 与 forbidden sentinels 回归通过 |
| `bash workflow/tests/contract_refresh_local_plugin.sh` | `40/40`；公开 local cache helper 的原子替换与 rollback 回归通过 |
| `bash -n`、`node --check`、`git diff --check` | 全部通过 |
| 独立 syscall 审计 | healthy `rc=0` 与 raw drift `rc=1` 均输出完整六分区 JSON、stderr 为零、fingerprint 不变、成功 write-like syscall 为零、protected-root path syscall 为零 |
| 独立 native review | include/external path/filter、ignored/untracked、assume-unchanged、replace-ref、submodule/gitlink、FIFO 与 symlink 复现全部关闭；最终 verdict 为 `PASS` |

Host 当前安装仍是旧的 9-prompt、moving-ref 状态，因此真实 `doctor --strict --json` 按设计返回 `1`，并报告 manifest、snapshot、exact cache、version collision 等既有漂移。Phase 3 不通过同步、升级或改写真实安装态来制造绿色结果。

兼容聚合入口 `bash workflow/tests/contract.sh` 已运行：Phase 3 新增的 integrity 与 strict doctor suites 全部通过，随后仍在既知的临时 `local-atlas` marketplace 缺失处 fail closed。该 hermetic repo/host suite 拆分属于计划中的 Phase 4 文件边界，不在 Phase 3 扩大修改范围。

## Multica 边界

Multica 只保留 planned deprecation 标记。本阶段未修改 `plugins/multica-sdlc/**`、`.agents/**`、真实 `$HOME/.agents/**`、Multica shim 或 Codex Multica cache；repo tree、immutable runtime、shim 与 Codex cache hard fingerprints继续逐值匹配任务基线。持续运行的外部 listener 易变 guard 文件不纳入硬指纹，也未被停止或修改。

## 下一步

Phase 4 负责把 repo contract 与 host install contract 拆成 hermetic suites，修复兼容聚合入口缺少临时 canonical marketplace 的既知夹具问题，并接入 Atlas-only CI。Phase 4 不修改现有 Multica assertions、fixtures 或 runtime。
