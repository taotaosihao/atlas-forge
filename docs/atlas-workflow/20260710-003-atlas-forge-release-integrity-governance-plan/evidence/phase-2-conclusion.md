# Phase 2 结论：开发与发布通道隔离

日期：2026-07-10

## 结论

Phase 2 已完成开发通道隔离、公开 local cache helper 加固，以及 release install 的只读证明能力。开发命令只写 `local-atlas` 与 Atlas 自有运行面；release helper 只开放 preflight 和 installed verification。真实 release mutation 继续 fail closed，`--execute` 固定返回 `MUTATION_DISABLED`。

这不是功能缺失，而是对隔离实测结果的安全收敛：`codex-cli 0.144.0` 在 marketplace upgrade 时会自动刷新已启用插件，失败时还可能形成 snapshot、config 与 cache 的 split-brain；当前共享 `atlas-forge` marketplace 又同时包含 Atlas、MemPalace 与 Multica。因此，在 Atlas-only marketplace 和受支持的 exact-SHA rotation 协议得到独立证明前，不能满足“先验证、再写 exact cache”和 Multica 零修改边界。

## 已实现行为

- Dev channel 使用 canonical local marketplace，只同步 repo Atlas source、`local-atlas/atlas-workflow/local`、Atlas workflow helpers、原生 Atlas agents 与 Atlas shims。
- `codex-refresh-local-plugin` 使用 staged copy、精确 tree 验证、原子替换、signal-safe rollback，并拒绝 selector、路径、symlink 与 ownership 注入。
- Release preflight 验证 clean repo、完整 SHA、`HEAD == origin/main == expected`、base ancestry、release identity、版本单调性、Atlas-only marketplace、exact ref、cache manifest 与 downgrade/collision/latest 规则。
- Installed verification 进一步验证 Atlas selector enabled、snapshot 自有真实 Git worktree、clean snapshot、sidecar、exact cache，以及 source/snapshot/cache 的 version、tree 与 commit 同一性。
- Release wrapper 在任何 Codex CLI lookup 前拒绝 `--execute`；shared marketplace 也在只读 preflight 中拒绝。
- 真实 Codex CLI 门禁仅在显式 opt-in、精确版本 pin、临时 HOME/XDG/六类 runtime root、隔离 Git 配置、本地 SSH/bare fixture 和 required `strace` 下运行。

## 验证证据

| 验证 | 结果 |
| --- | --- |
| `bash workflow/tests/integration_atlas_plugin_dev_sync.sh` | 24 项通过；release cache、legacy agents 与 Multica sentinels 不变 |
| `bash workflow/tests/contract_refresh_local_plugin.sh` | 40 项通过；no-op、失败注入、symlink、root ownership 与真实 SIGTERM rollback 通过 |
| `bash workflow/tests/integration_atlas_plugin_layout.sh` | 32 项通过；stale、collision、downgrade、missing exact、invalid cache manifest、snapshot/config 类型与 symlink 反例全部 fail closed |
| `ATLAS_REAL_CLI_E2E=1 ATLAS_EXPECTED_CODEX_VERSION='codex-cli 0.144.0' bash workflow/tests/integration_atlas_plugin_install.sh` | 7 项通过；exact-SHA add、base install、preflight、upgrade、postflight 与 protected-path 审计通过 |
| `bash workflow/tests/contract_atlas_plugin_integrity.sh` | 35 项回归通过 |
| 独立 syscall 审计 | healthy preflight/installed 无 repo、snapshot、config、cache 或 `.git/index.lock` 写入 |
| 独立 native review | blocker/major/minor 均为零；只读 verifier 与 fail-closed wrapper 可接受 |

真实 CLI gate 将 `marketplace add`、`marketplace upgrade` 与 `plugin add` 的必需 JSON 字段和值锁定到 `codex-cli 0.144.0`，允许未来增加字段，但不接受已有语义漂移。默认 hosted 路径明确 TAP skip；固定版本的 local/self-hosted 发布前环境必须显式开启。

## Multica 边界

Multica 只保留 planned deprecation 状态，不参与本阶段实现、验证或修复。Repo Multica tree、repo `.agents` tree、immutable runtime、Multica shim 与 Codex Multica cache 的 hard fingerprints 均须与任务基线逐值一致；外部 listener 的易变 guard 文件不属于硬指纹，也未被停止或修改。

## 保留约束

- 不得把本阶段描述为“自动 release update 已启用”。
- 不得在共享 `atlas-forge` marketplace 上绕过 wrapper 运行 upgrade/add。
- E2E 中对临时 config exact ref 的改写只用于隔离 characterization，不是生产 rotation 协议。
- Phase 3 strict doctor 必须复用只读 install 事实，不得重新开放 release mutation。
