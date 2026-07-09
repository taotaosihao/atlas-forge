# Phase 4 结论：Hermetic Contracts 与 Atlas-only CI

- task_id: `20260710-004-atlas-forge`
- phase: `4`
- verdict: `passed`
- native_review: `2 x PASS`
- hosted_runner_contract: `ubuntu-latest / Ubuntu 24.04 current image`

## 完成内容

- 新增 `contract_repo.sh`，以 `env -i` 和彼此分离的 HOME、Codex、Agents、XDG、Git、GNUPG、TMP roots 运行纯仓库合同；整个 internal source contract 受 `strace -f -e trace=%file` 审计。
- 新增 `contract_host_install.sh`，只运行 Atlas layout、strict doctor、local-cache transaction 与 development sync 四套临时安装态夹具。
- `contract.sh` 成为兼容聚合入口，明确输出 manifest、repo、host 三个 suite；原 live-host 与 Multica assertions 保留在显式 `ATLAS_CONTRACT_LEGACY_HOST=1` 路径，不进入默认开发检查或 CI。
- repo、host、layout 三层临时根均由固定前缀 `mktemp` 创建，带 ownership marker、symlink/basename 检查并保留原退出码；`KEEP_TEST_TMP=1` 保留并打印可复查路径。
- host wrapper 对子 suite 失败输出 label、suite path、expected/actual exit、suite-source expected/actual hash、stdout/stderr path 与 hash；layout 异常路径同时从 verifier JSON 提取 root/path/tree/version/commit/present 等 case 级诊断。
- 新增 `.github/workflows/atlas-integrity.yml`，并行执行 `manifest-release-integrity`、`repo-contract`、`host-layout-fixtures`、`docs-links`。权限仅 `contents: read`，checkout 固定 v7.0.0 完整 commit 且不保留凭据。
- Hosted repo job 显式安装 `ripgrep`、`strace`，host job 显式安装 `ripgrep`；不依赖开发机 Codex 工具路径，不调用真实 Codex CLI 或 marketplace install。

## 隔离与边界证明

- poison HOME 中存在 stale Atlas cache、agent 和 SSH sentinels；repo suite 仍返回 `0`，前后 fingerprint 不变。
- syscall trace 未命中 poison `$HOME/.codex`、poison `$HOME/.ssh` 或原始用户的 `.codex`、`.agents`、`.ssh`、`.gnupg`、`.gitconfig`、`.config/git`。
- repo internal 路径继续覆盖 done/readiness/scaffold、native team、Atlas `team-v1`、SDD/business validators、dry-run updater、private-path audit、contract-index、legacy non-strict doctor 与纯 source assertions；在真实 cache/Agents/Multica host assertions 前退出。
- host 默认只执行四套 hermetic Atlas fixtures；`integration_atlas_plugin_install.sh` 保持独立、显式、固定 CLI 版本的 release gate，未进入 hosted CI。
- CI 不使用 `pull_request_target`、write permissions、secrets、OIDC、真实 HOME、legacy-host、Multica self-test/router/listener/runtime。

## 验证

- `bash workflow/tests/contract.sh`：`rc=0`，manifest、repo、host 顺序完整，默认 cleanup 后无 suite root 残留。
- `bash workflow/tests/contract_repo.sh`：`rc=0`，poison/真实 HOME pathname syscall 为零。
- `bash workflow/tests/contract_host_install.sh`：`rc=0`；layout `32/32`、strict doctor `35/35`、local-cache `40/40`、dev-sync `24/24`。
- `KEEP_TEST_TMP=1`：repo 保留 syscall trace；host 保留 8 份 suite stdout/stderr 与嵌套 layout case JSON；验证后临时证据已人工清理。
- 注入子 suite 失败：返回原始非零，诊断包含 label/path/expected/actual/hash；注入必需输出缺失：返回 `1` 并报告 expected output 与实际 stdout hash。
- stale snapshot、missing exact cache、same-version tree collision 的保留 JSON 均含预期 path/commit/tree/present 证据。
- Manifest/release gate、YAML 解析、四个 shell `bash -n`、contract-index lint、19 个非冻结相对 Markdown links 和 `git diff --check`：全部通过。
- 两名独立只读 reviewer 最终均为 `PASS`，无 blocker；没有运行 legacy-host、真实 CLI E2E 或 Multica tests/runtime。

## Multica 零修改门禁

Multica 继续仅保留 planned deprecation 标记；本阶段没有修改或执行其代码、测试、router、listener 或 runtime。Phase 结束时 hard gate 与任务基线逐值一致：

- repo `plugins/multica-sdlc` tree：`8b87ecd1c5decce18f31e65442747661debfcb5e`
- repo `.agents` tree：`b3a8fdf84d65e709d97769b05aff083843b2047d`
- immutable runtime：`7a35c067526209a6cc9444da140cab4568538c4c38a129e1705bbafc39a22fd4`
- shim：`9c96fa9acd7d7452e321b3c4ee8c017a3f87cf9f2490e1cb1b7775f31c005a83`
- Codex Multica cache：`c89da8d13d136a5dc2a6a7224810dca618ec225616b3adbd996519742516d0ef`
- forbidden working-tree paths：`0`

持续运行的外部 listener 易变 guard 文件仍不纳入 hard fingerprint，且未被停止或修改。

## 已知边界

- repo suite 明确依赖 Linux `strace`；非 Linux 本地环境不能直接提供同等级 pathname syscall 证明。
- Hosted apt mirror 或移动 runner image 的基础设施故障可能使 CI 在测试前失败；这不降低合同本身的 fail-closed 语义。
- 文档门禁当前只检查非冻结 Markdown 的 inline relative links，不验证 anchors、reference-style links、图片或外部 URL；Phase 7 只做已批准的最小文档治理。
- `SIGKILL` 无法触发 shell trap；正常成功、失败、usage error 与 KEEP 路径均已验证。
