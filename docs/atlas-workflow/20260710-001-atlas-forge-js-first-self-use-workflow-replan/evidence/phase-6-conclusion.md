# Phase 6 结论：JavaScript 公共入口与最终集成

workflow_id: 20260710-001-atlas-forge-js-first-self-use-workflow-replan
implementation_task: 20260710-014-atlas-forge-js-first-public-entrypoint-phase-6
phase_status: implemented
created: 2026-07-10

## Keeper commits

- `4898ebc refactor(workflow): split the JavaScript public entrypoint`
- `e7c3859 test(workflow): copy the split launcher in doctor fixtures`

## 最终入口

```text
workflow/bin/codex-workflow                 # 5 行公开 Bash façade
workflow/bin/codex-workflow-legacy          # 内部 Bash compatibility launcher
workflow/bin/lib/codex-workflow/cli.js      # 34 条 direct JS 精确路由
```

- 公开 façade 立即 `exec node`，高频命令不再解析 4,775 行 legacy Bash。
- root router 按需加载 task 9、artifact 9、verification 4、outcome 2、feedback 4、native team 6，共 34 条命令。
- handoff/result/packet/Multica feedback、explicit memory、doctor/smoke/self-test/install-hooks、team-v1 共 13 条命令，以及空/未知调用，使用 Node 24 `process.execve` 原样进入 legacy。
- task direct route 不再经过旧 `cmd_init_task/cmd_task_mutation`，因此隐式 memory sync 已从公共 task 路径退役；显式 `learn/dream/recall` 不变。
- legacy 内 `self-test`、`team-loop` 与 `codex-design-review` 继续引用稳定公开 `codex-workflow` 路径，没有 fallback recursion。

## Layout 与合同

- public 与 legacy 均保持 executable；root router 与 domain modules 为普通 CommonJS 文件。
- Atlas scoped sync、host install 与 dev-sync 继续递归管理完整 `workflow/bin/`；local bin 只暴露 public shim。
- root CLI tests 精确断言 34/13 分类，并在缺少 legacy 的临时 layout 中验证 direct command，在 fake legacy 中验证完整 argv/env 与退出码。
- strict doctor 的 inconsistent-helper fixture 首次 aggregate 暴露单文件复制假设；夹具改为复制 public、legacy 与 `lib/` 完整内部 layout 后，doctor 35/35 与 aggregate 均通过。doctor 业务实现未修改。

## Review 闭环

- mapper 完成 34 direct、13 fallback、内部调用、sync/install 与 source-text contract 映射。
- 独立 reviewer 对照 `HEAD b32d196` 审查 keeper diff，结论为 `CLEAN`。
- reviewer 额外实测全部 legacy 分类、空/未知调用、环境与 argv 传播，以及 `SIGTERM` 信号传播；未发现阻断项。

## 验证

| Gate | Result |
| --- | --- |
| `node --test workflow/tests/js/root-cli.test.js` | 4/4 passed |
| `node --test workflow/tests/js/*.test.js` | 78/78 passed |
| `bash workflow/tests/contract_repo.sh` | passed |
| `bash workflow/tests/contract_atlas_doctor.sh` | 35/35 passed |
| `bash workflow/tests/integration_atlas_plugin_dev_sync.sh` | passed，public/legacy mode 与 forbidden sentinels 保持 |
| `bash workflow/tests/contract.sh` | passed，manifest/release、repo、host layout、doctor、local cache 与 dev-sync 全部闭合 |
| Markdown links、Bash/Node syntax、`git diff --check` | passed |

## Multica 与发布边界

五项 Multica hard fingerprint 与任务基线逐值一致：

- repo `plugins/multica-sdlc` tree：`8b87ecd1c5decce18f31e65442747661debfcb5e`
- repo `.agents` tree：`b3a8fdf84d65e709d97769b05aff083843b2047d`
- immutable runtime：`7a35c067526209a6cc9444da140cab4568538c4c38a129e1705bbafc39a22fd4`
- Multica shim：`9c96fa9acd7d7452e321b3c4ee8c017a3f87cf9f2490e1cb1b7775f31c005a83`
- Codex Multica cache：`c89da8d13d136a5dc2a6a7224810dca618ec225616b3adbd996519742516d0ef`
- forbidden working-tree paths：`0`

本阶段没有修改 plugin tree、cachebuster、marketplace 或 release wrapper，也没有执行真实安装、shared release mutation、Codex live E2E 或 Multica runtime。shared marketplace mutation、Atlas-only marketplace 与 exact-SHA rotation 继续留在 trigger-only backlog。

## 最终结论

Phase 1–6 均已完成。JS-first MVP、task hygiene、outcome latency、artifact/verification/feedback 分域、native team 状态域与薄公开入口已经闭环；低价值或 planned-deprecation 命令以显式 internal legacy boundary 保留。本 bundle 的主 CLI 模块化完成定义已满足。
