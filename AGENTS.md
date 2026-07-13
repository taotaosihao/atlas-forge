# Atlas Forge 项目约束

## 权威源

- 当前 Git checkout 是插件、workflow helper、测试和文档的唯一开发源。
- Atlas 插件源码位于 `plugins/atlas-workflow/`，workflow helper 源码位于 `workflow/`；已安装 cache、marketplace snapshot 和 `~/.codex/workflow` 都是派生产物，不能反向作为修改源。
- 文档权威级别以 [docs/README.md](docs/README.md) 为准；实现行为冲突时，以当前源码、schema、测试和 manifest 为准。

## 开发与发布边界

- 默认只修改当前任务明确拥有的路径，不顺带刷新真实 marketplace、cache、workflow runtime 或 agent runtime。
- 本地开发刷新使用 `scripts/update-atlas-workflow-plugin`；除非任务明确要求安装态变更，否则只运行 hermetic 验证，不执行刷新。
- 修改 `plugins/atlas-workflow/**` 的 release slice 必须在内容和 reviewer 结论冻结后，最后运行 `scripts/bump-plugin-cachebuster.sh atlas-workflow`。版本更新后不得再修改该 plugin tree；若必须修改，重新 review 并生成新版本。
- 发布身份使用 `workflow/bin/atlas-plugin-integrity manifest` 和 `release --base <phase-base>` 验证；禁止复用历史版本或依赖 `latest` cache fallback。
- `scripts/update-atlas-workflow-marketplace --execute` 当前必须保持 fail closed；禁止绕过 wrapper、手工写 shared snapshot/exact cache，或运行 `scripts/codex-plugin-update.sh atlas-workflow`、`codex plugin marketplace upgrade atlas-forge`、`codex plugin add atlas-workflow@atlas-forge`。真正开放 mutation 必须另有 Atlas-only marketplace 与 exact-SHA rotation 批准方案。
- 真实 Codex CLI E2E 和兼容 live-host contract 都是显式、隔离的验证动作，不属于普通开发验证，也不授权 release mutation。

## Multica Planned Deprecation

- `multica-sdlc` 仅标记为 planned deprecation；移除、迁移或兼容清理必须使用单独批准的方案。
- 禁止修改 `plugins/multica-sdlc/**`、`.agents/**`、`~/.agents/**`、Multica shim、Codex Multica cache，以及 router、listener、generated instructions、tests 和 runtime state。
- 禁止为普通 Atlas 变更运行 Multica tests、router、listener、legacy host 或 runtime。允许在不读取业务内容的前提下做只读 tree/hash fingerprint，用于证明零修改。
- 不得通过共享全量 sync/install 入口间接写入 Multica；Atlas 开发和验证只使用 Atlas-scoped、隔离路径。

## 目标与收敛

- 当前用户请求与已有权威规格共同定义授权目标，不另建 roadmap/scope 状态机。
- 只有当“完整实施”明确指向当前已授权 roadmap 或其全部已列 phases 时，才连续跨内部 slices 执行；“完成”“不要停”等持续执行措辞本身不扩大较窄目标。
- 在目标、权限和安全边界不变时不因内部 phase/slice 例行暂停；roadmap 文件仅是调度材料，不能自行授权实施。

## 沟通与回复

- 默认简洁回复：结论优先，只报告关键改动、验证结果和需要用户行动的残留问题。
- 除非用户明确要求详细说明，不逐项复述执行过程、完整合同、已知上下文或无须行动的检查结果。
- 简洁不得省略失败验证、授权边界、真实风险或需要用户决定的事项。

## 最小验证矩阵

| 变更范围 | 最小验证 |
| --- | --- |
| 仅 Markdown 文档 | `scripts/check-relative-markdown-links.py --root .`、`git diff --check`；合同 bundle 另跑 `codex-contract-index-lint` |
| Atlas plugin 源码或 manifest | 官方 `validate_plugin.py`、`atlas-plugin-integrity manifest`、对应专项测试、`contract_repo.sh` |
| 发布、安装、doctor 或 cache 行为 | 上述检查加 `contract_host_install.sh` 和 release identity gate |
| 跨域或最终集成 | `bash workflow/tests/contract.sh`，并核对 forbidden paths 与 Multica hard fingerprints |

- 先运行最小专项检查，再按影响面扩大；无法运行的命令必须记录具体原因。
- 默认倾向按适中、可独立理解/验证/回退的逻辑成果创建 Conventional Commit；不按每个 step、slice 或 fix round 机械提交，也不把整个 roadmap 堆成超大 diff。只 stage 当前任务拥有的 paths/hunks，提交前检查 staged diff、`git diff --cached --check` 和 forbidden paths；commit 不推导出 push、release 或安装态 mutation 权限。
