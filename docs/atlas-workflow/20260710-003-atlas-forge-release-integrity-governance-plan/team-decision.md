# Team Decision

- workflow_id: `20260710-003-atlas-forge`
- backend: native
- status: complete

## 主决策

采用 Atlas-only、发布完整性优先、开发/发布通道分离的路线：

- Dev channel 只更新 repo local source、`local-atlas` cache、Atlas workflow helpers 和 `.codex/agents`。
- Release channel 只接受 clean、pushed、version-bumped Git commit；Codex CLI 是 marketplace snapshot 和 `atlas-forge/<exact-version>` cache 的唯一 writer。
- 自定义 release helper 只执行 preflight/postflight 校验，不直接 rsync 修补 Git marketplace snapshot 或 release cache。
- Multica 保留现有兼容态并标记 `planned deprecation`，本方案不修改它。

## 采纳的复核意见

- P0 拆分为 release identity、channel separation/anti-rollback、strict doctor 三个回滚单元。
- 隔离测试同时设置 `HOME`、`CODEX_HOME`、`CODEX_HOME_ROOT`、`CODEX_WORKFLOW_ROOT`、`AGENTS_HOME` 和 `LOCAL_BIN_ROOT`。
- Repo contract 与 host-install integration 按责任拆分，而不是继续用 cache override 掩盖真实 HOME 依赖。
- Semantic lint 先做 first-code/Product UI，再做 BAF v2；保留历史 v1 兼容。
- Outcome metrics、旧 task 状态扩展和模块化延后。

## 拒绝的路径

- 直接覆盖旧 marketplace checkout 或 release cache。
- 修复 Multica 双源漂移。
- 用一个大提交完成全部 P0/P1。
- 新增 npm/YAML 框架；沿用 Node/Python 标准库和现有 Markdown/JSON contract。
- 在 P0 完成前继续增加大段同义 skill guidance。
