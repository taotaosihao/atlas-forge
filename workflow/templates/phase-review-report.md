# 阶段验收汇报（未投影）

task_id: {{TASK_ID}}
phase_id: {{PHASE_ID}}
created: {{CREATED}}
artifact_category: phase_projection_sentinel

> Canonical 状态：未投影。此文件不能作为验收或 release 证据。

请在权威 slice acceptance 或 completion 更新后运行：

```bash
codex-workflow project-phase-report {{TASK_ID}} {{PHASE_ID}}
```

投影命令会使用绑定后的 implementation contract、权威 slice acceptance、verification events 与 `completion.release_decision` 原子覆盖本文件。人工编辑不会改变任何权威状态。

## 投影后将包含

- 产品经理可理解的已完成能力与验收方法；
- 已测试能力及其权威 receipt；
- 未完成项和下一验收点；
- 与阶段验收严格分离的 release decision。
