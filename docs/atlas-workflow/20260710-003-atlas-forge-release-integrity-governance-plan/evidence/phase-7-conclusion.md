# Phase 7 结论：最小文档治理与最终审计

- task_id: `20260710-004-atlas-forge`
- phase: `7`
- verdict: `passed`
- native_review: `2 x PASS`
- phase_base: `0b4ea53`
- plugin_tree: `da878005ef8c36af582f9f903f10673ff184a59e`（与 Phase 6 commit 完全一致）
- relative_link_lint_sha256: `9d1a1a30d5c775cdb494792dbbecce89352dd2ff86b234cd03cfb839b9eb68c3`
- repo_contract_sha256: `d9c2e1c77eba38da27da0753230aeff67229cd6970d0e6d455330e2597567279`

## 完成内容

- 新增根级 `AGENTS.md`，明确 Git checkout/source of truth、local-atlas 开发路径、内容冻结后最后 bump cachebuster、release mutation fail closed、最小验证矩阵和提交边界。
- Multica 保持 planned deprecation；项目约束禁止修改或执行其 source、`.agents` mirror、tests、router、listener、generated instructions、shim、cache 和 runtime。legacy/full-stack 部署只保留兼容语义，不是 Atlas dev/release 路径。
- 新增 `docs/README.md`，建立 Authoritative、Superseded 和 Historical 阅读优先级；历史 plan/review 不覆盖当前约束、权威 bundle、源码、schema 或测试。
- 修正根 README 的 Atlas source/cache 实际路径，删除 Multica cachebuster 与 legacy generic publish/update 指引，并明确 `update-atlas-workflow-marketplace --execute` 固定 fail closed。
- 修正 `workflow/README.md` 的 local-atlas 路径，并删除不存在的 `docs/durable-learning-reuse-playbook.md` 引用；没有虚构替代文档。
- 新增可复用 `scripts/check-relative-markdown-links.py`，检查 tracked/未忽略 untracked Markdown 中的 inline link、image 和 reference definition；支持 fenced code、平衡括号、URL decode、仓库 containment 和 missing target。
- CI `docs-links` 与 repo-only contract 复用同一 checker。临时 Git fixture 覆盖 inline/image/reference、balanced-parenthesis、fenced content、假 fence、缺失目标和嵌套/缩进文本；installed/live self-test 不依赖 repo-only 脚本。
- 当前治理 bundle 和 contract index 更新为 `implemented`，Phase 0-7 evidence 闭环。

## 验证

- `scripts/check-relative-markdown-links.py --root .`：通过；最终检查 `188` 个 Markdown 文件、`35` 个相对目标。
- `codex-contract-index-lint`：`contract_index_lint: true`。
- `bash workflow/tests/contract_repo.sh`：`rc=0`；189 项 implementation semantic suite、BAF v2、link checker 正负 fixture 和隔离 HOME/CODEX_HOME/AGENTS_HOME/XDG/TMP 边界通过。
- `bash workflow/tests/contract_host_install.sh`：`rc=0`；layout `32/32`、strict doctor `35/35`、local-cache transaction 和 Atlas development sync 通过。
- `bash workflow/tests/contract.sh`：`rc=0`；manifest/release、repo 和 host 三段最终 aggregate 全部通过。
- Python compile、`bash -n`、GitHub Actions YAML 静态检查、`git diff --check` 和 staged diff 审计：通过。
- 两名独立只读 reviewer 对最终候选给出 `PASS`；plugin tree 自 `0b4ea53` 零变化，forbidden repo/worktree paths 均为零。

## 最终分支审计

从 `28a4d8f` 到本阶段共形成 Phase 0-7 独立 keeper commits。Phase 1-6 已分别闭合 release identity、dev/release 隔离、strict doctor、hermetic CI、Implementation Contract semantic lint 和 BAF v2 dual-goal semantic lint；Phase 7 未修改 plugin tree，因此没有生成新的 cachebuster。

真实 marketplace、真实 Atlas cache 和 shared runtime 均未刷新。`--execute`、legacy host、真实 Codex CLI mutation 和 Multica runtime 未运行。

## Multica 零修改门禁

最终 hard gate 与任务基线逐值一致：

- repo `plugins/multica-sdlc` tree：`8b87ecd1c5decce18f31e65442747661debfcb5e`
- repo `.agents` tree：`b3a8fdf84d65e709d97769b05aff083843b2047d`
- immutable runtime：`7a35c067526209a6cc9444da140cab4568538c4c38a129e1705bbafc39a22fd4`
- shim：`9c96fa9acd7d7452e321b3c4ee8c017a3f87cf9f2490e1cb1b7775f31c005a83`
- Codex Multica cache：`c89da8d13d136a5dc2a6a7224810dca618ec225616b3adbd996519742516d0ef`
- committed forbidden paths：`0`
- working-tree forbidden paths：`0`

## 已知边界

- 相对链接 checker 是 bounded repository gate，不是完整 CommonMark renderer；不验证 anchors、HTML links、footnote semantics 或 external URL 可达性。新增语法形态时应先增加最小 fixture，不在本阶段继续扩 parser。
- shared marketplace mutation 仍禁用；开放发布写路径需要单独证明 Atlas-only marketplace 与 safe exact-SHA rotation。
- 计划中的 outcome metrics、task 状态、自动清理、slug 修正和 workflow 模块化仍按原方案延后。

## 结论

Phase 0-7 的批准范围、验证、证据和 Multica 零修改门禁均已闭合。当前分支可作为完整实施结果交付；后续发布或延后项必须单独授权。
