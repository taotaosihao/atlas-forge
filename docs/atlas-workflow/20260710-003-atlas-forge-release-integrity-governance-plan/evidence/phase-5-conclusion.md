# Phase 5 结论：Implementation Contract 语义门禁

- task_id: `20260710-004-atlas-forge`
- phase: `5`
- verdict: `passed`
- native_review: `2 x PASS`
- plugin_version: `0.1.0+codex.20260710021709`
- linter_sha256: `79ea264cbeeb4383049904284b7f6d2e16e47fc5e11f42d19ee03f390ca9dc26`
- dedicated_test_sha256: `55b4d89e03f300e038fe67c3e99c0734761c8333ecf005906c6f1cb6f032770f`

## 完成内容

- 新增可执行的 `codex-implementation-contract-lint`，以 Markdown 结构而非全文正则解析权威合同；忽略 fenced code、HTML comment 与缩进代码，支持 ATX/Setext 边界，并对 UTF-8、BOM、CRLF、重复字段、占位符和未知版本给出稳定诊断。
- 定义 `contract_semantics_version: 1`。当前权威合同在 `--strict` 下必须声明工作类型、first-code guard 与 Product/UI gate；实现合同不能把必需门禁降为 `not_applicable`，规划、审阅、审计和 docs-only 合同则必须给出实质性的不适用理由。
- first-code 规则要求首个 slice 改变 product、runtime、API、CLI、workflow、scanner 或 contract-owned behavior；仅文档、证据、夹具或覆盖既有行为的测试不能冒充实现。实现行为可以带配套测试和夹具。
- Product/UI 规则要求 HTTP(S) served entrypoint、与声明入口精确绑定的真实浏览器导航、可执行 acceptance action，以及未取消的安全门禁。`page.setContent`、DOM/asset 注入、`file:`/`data:`、主文档或应用 bundle fulfill 等 synthetic UI 路径均被拒绝。
- fulfilled backend route 只接受 quoted static string/glob literal。RegExp、构造器、predicate、变量、括号表达式、动态 template literal、catch-all、origin-wide 和覆盖入口的 glob 均 fail closed；静态 `/v1/users` 与 `**/api/**` 保持可用。
- 无版本历史合同在非 strict 模式下保留 migration warning 与兼容通过，在 strict 模式下失败；没有批量重写历史合同。
- 三份执行技能从已加载 `SKILL.md` 解析插件根并调用 strict linter，避免依赖目标项目 cwd；两份合同模板和 gate checklist 已采用 v1 字段与语义门禁。
- 新增 67 个正反 fixture 和 189 项专用 TAP 用例，并将专用 suite 接入 `workflow/tests/contract.sh` 的仓库 CI 路径。

## 批准的范围修订

实施中确认并接受两项不扩大产品范围的修订：

- 修改 `workflow/tests/contract.sh`，把新的专用 suite 接入既有聚合入口，并把旧的“缺字段可默认继续一个 gate-only phase”静态断言改为 v1 必填规则。
- 除在 `task`、`clarify`、`team` 增加 lint 命令外，同步修订其旧 stop guidance；否则技能文字会与 v1 的 fail-closed 必填合同直接冲突。历史无版本合同仍保留原回退边界。

## 发布身份

- release base：`a642925`；base version：`0.1.0+codex.20260709185835`。
- current version：`0.1.0+codex.20260710021709`，由 `plugin-creator` 的 cachebuster helper 在内容冻结和双 reviewer PASS 后生成。
- plugin tree：`sha256:d0391f7c79900d9c1707b5d299bd19b80e274fdc7e8d5fadbbe3e1d1c937d0d5`（60 files）变为 `sha256:e1b43482988334afc3719f40403de68b2ab2c86d82420ff58bf70997a5c4903d`（61 files）。
- release gate 证明 `tree_changed=true`、`version_changed=true`，当前版本在 base/HEAD ancestry 中没有历史 collision 或复用。
- 最终 cachebuster 后插件内容未再修改；linter 与专用测试哈希保持冻结值。

## 验证

- `quick_validate.py`：`task`、`clarify`、`team` 三个技能全部通过。
- `validate_plugin.py plugins/atlas-workflow`：通过。
- `atlas-plugin-integrity manifest` 与 `release --base a642925`：`ok=true`。
- `contract_implementation_contract.sh`：`1..189`，`rc=0`；同一冻结哈希在正常环境和最小隔离环境均通过。
- `contract_atlas_plugin_integrity.sh`：`rc=0`。
- `contract_repo.sh`：`rc=0`，在隔离 HOME/CODEX_HOME/AGENTS_HOME/XDG/TMP roots 下完成，并保持真实/poison HOME 访问门禁。
- `contract_host_install.sh`：`rc=0`；layout `32/32`、strict doctor `35/35`、local-cache transaction `40/40`、dev-sync `24/24`。
- `node --check`、`bash -n`、三个技能 quick validation、插件 validation 与 `git diff --check`：全部通过。
- 两名独立只读 reviewer 对同一组冻结 SHA-256 给出 `PASS`；RegExp、predicate、变量、动态 template literal 等 fail-closed 矩阵以及静态 backend matcher 正例均被独立复跑。

仓库聚合测试首次在新语义落地后暴露一条旧 stop-guidance 文案断言。该断言被更新为 v1 必填规则后，专用 suite 哈希保持不变，仓库隔离 suite 复跑通过；这属于批准的 CI 集成修订。

## 安装与运行边界

- 本阶段没有刷新、重装或修改真实 marketplace、真实 Atlas cache 或共享运行态；只在仓库源码和临时安装态夹具中验证。
- 没有运行 `ATLAS_CONTRACT_LEGACY_HOST=1`、真实 Codex CLI E2E、Multica tests、router、listener 或 runtime。
- 安装态兼容由临时 exact-version plugin root、跨 cwd 调用和 host layout fixtures 证明，不把开发源码写入真实发布通道。

## Multica 零修改门禁

Multica 继续仅标记为 planned deprecation。本阶段没有修改或执行其代码、测试、router、listener 或 runtime；hard gate 与任务基线逐值一致：

- repo `plugins/multica-sdlc` tree：`8b87ecd1c5decce18f31e65442747661debfcb5e`
- repo `.agents` tree：`b3a8fdf84d65e709d97769b05aff083843b2047d`
- immutable runtime：`7a35c067526209a6cc9444da140cab4568538c4c38a129e1705bbafc39a22fd4`
- shim：`9c96fa9acd7d7452e321b3c4ee8c017a3f87cf9f2490e1cb1b7775f31c005a83`
- Codex Multica cache：`c89da8d13d136a5dc2a6a7224810dca618ec225616b3adbd996519742516d0ef`
- forbidden working-tree/status paths：`0`

持续运行的外部 listener 易变 guard 文件不属于 hard fingerprint，且未被停止、读取业务内容或修改。

## 已知边界

- v1 是 Markdown machine-field 合同，不是通用自然语言定理证明器；复杂的实现意图仍需要 reviewer 判断，但已知模糊 route matcher 和 synthetic UI 绕过按 fail-closed 处理。
- 历史无版本合同只能在非 strict 兼容路径使用；进入新的执行或发布 gate 前必须迁移为 v1。
- 本阶段证明源码、临时安装态与发布身份一致，不声称真实用户 cache 已更新。
