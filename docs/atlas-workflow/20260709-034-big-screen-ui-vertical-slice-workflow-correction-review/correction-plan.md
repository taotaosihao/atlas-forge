# Correction Plan

workflow_id: 20260709-034-big-screen-ui-vertical-slice-workflow-correction-review
task_id: 20260709-034-big-screen-ui-vertical-slice-workflow-correction-review
status: ready-for-implementation-input
date: 2026-07-09

## 目标

将 `atlas-workflow` 的 Big Screen UI vertical slice 与 first code slice 修正方案收敛为可实施输入，
避免后续实现重复 gate-first drift，同时不削弱既有安全 hard gates，也不覆盖现有 BAF 变更。

## 执行顺序

1. 修正 durable evidence index。
   - 将 `contract-index.md` 的 `evidence_index` 指向真实文件。
   - 使用 `docs/.../evidence/evidence-index.md` 记录 native team、GLM5.2、Claude Sonnet 5 max
     三类复核证据。
   - 验证：`node plugins/atlas-workflow/scripts/codex-contract-index-lint --root <bundle>` 返回 true。

2. 修正 first code slice guard。
   - 明确 non-tiny implementation work 必须声明首个实现 diff、owner、验证命令和 gate-only 准备阶段上限。
   - 明确 contract/scanner/fixture/evidence-only 工作只能为首个代码切片服务，不能越过
     `stop_if_no_code_by_phase` 后继续成为唯一交付物。
   - 明确 scanner/tooling 任务中实现 scanner/tool 行为可以算 first code slice，但只补 fixture/evidence 不算。
   - 明确 hard safety gates 仍是 acceptance/release blocker；first code slice 只能使用 fixture/mock/in-memory 等
     安全薄切片方式前进，不能跳过或回填安全 gate。

3. 修正 UI ordering rule。
   - 明确 UI thin slice 先于 release/perf/soak/phase evidence expansion。
   - 明确 UI thin slice 与 hard safety gates 必须共同满足，任何一方缺失都不能通过 acceptance。
   - 明确 `not an open-ended prerequisite` 只表示 safety gates 不能无限期阻塞 UI slice，绝不表示可以跳过、
     削弱或上线后补安全 gate。

4. 修正 negative evidence guard。
   - Guard 只对声明用于 UI/product acceptance 的证据生效。
   - Headless/network capture 可以继续作为 safety-gate evidence。
   - Served UI evidence 不能自动替代 safety-gate evidence。
   - 增加反向 guard：served UI 存在但 hard safety gate evidence 缺失或过期时，仍不能通过 acceptance。

5. 明确第一批 contract-test 范围。
   - 第一批只验证 guidance/template/checklist/contract-test 中的关键文本与结构存在。
   - 第一批不声明已经实现完整 semantic evidence scanner。
   - 第二阶段再将证据用途标注、semantic lint、schema 强制化。

6. 保留 BAF 变更边界。
   - 第一批不重写现有 BAF 模板。
   - UI gate 与 BAF 的关系先写入独立 UI-gate guidance、team skill、contract 和 checklist。
   - 若后续需要补 BAF 模板，只能做保留现有内容的增量补充，并单独验证 BAF contract tests。

## 实施最小集

- `plugins/atlas-workflow/skills/team/SKILL.md`
- `plugins/atlas-workflow/skills/clarify/SKILL.md`
- `plugins/atlas-workflow/skills/task/SKILL.md`
- `workflow/templates/implementation-contract.md`
- `workflow/templates/implementation-contract.final.md`
- `workflow/templates/team-staffing.md`
- `workflow/templates/gate-checklist.md`
- `workflow/tests/contract.sh`

## 验证

- `git diff --check`
- `bash workflow/tests/contract.sh`
- `node plugins/atlas-workflow/scripts/codex-contract-index-lint --root docs/atlas-workflow/20260709-034-big-screen-ui-vertical-slice-workflow-correction-review`
- `codex-refresh-local-plugin atlas-workflow`
- source/cache `cmp` for edited Atlas skill files
