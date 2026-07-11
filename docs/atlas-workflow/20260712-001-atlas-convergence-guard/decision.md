# 决策：删除复杂度，而不是建设收敛状态机

## 选定方向

- 两个 execute 入口共用一个 `authorization_ref` 准入；它防止误晋级，不替代宿主权限。
- Full-roadmap、review 修复权、自动 commit 和滚动 checkpoint 作为短编排不变量表达，不复制进多层 schema。
- 删除 default Team、重复 intake/artifact、动态 staffing、逐轮 commit、开放式 clean repair、无条件 whole-branch review和对应 prose 锁定测试。
- Team 主 skill 只保留高频编排规则；SDD 与 Business Acceptance 通过 references 按需加载。

## 不采用

- `execution_scope`、authorized slice 列表、acceptance fingerprint、合同 digest。
- review disposition/basis schema 与多种 review mode。
- 默认数字型停止阈值和固定并行 lanes。

## 已有改动边界

当前 worktree 中 Agent model policy、planner/browser-verifier 和相关测试改动属于预先存在的用户工作。本任务保留它们，但不纳入本任务 commit。
