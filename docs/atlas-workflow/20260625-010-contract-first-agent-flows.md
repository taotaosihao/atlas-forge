# Contract-first agent flows

Task: `20260625-010-atlas-forge-planner-generator-evaluator-brainstorm`

## 目标

为 atlas-forge 落地两套 contract-first 工作流：

- Multica 完整版：Planner / Generator / Evaluator 合同流，适用于多 agent、PRD implementation、长任务和需要真实 runtime 验证的任务。
- Atlas workflow 轻量版：implementation contract checklist，适用于本地 Codex 工作流和非 tiny 的实现任务。

## 选定方向

Multica 做完整版，Atlas workflow 做轻量版。两者共享合同语言，但流程重量不同。

Multica 的完整流应在 `PLAN` 与 `IMPLEMENT` 之间加入正式或等价的 `CONTRACT` 阶段。Planner 拆分 sprint/slice；Generator 在写代码前提交 proposal；Evaluator/E2E 在写代码前补充真实验证路径和失败标准；Reviewer/Evidence QA 检查合同是否可验证、是否越界、是否能映射到 evidence manifest。

Atlas workflow 的轻量流不新增强制状态机。它通过模板和 skill 指令要求 Codex 在非 tiny 本地任务实现前写清楚目标、非目标、验收标准、真实验证路径、失败条件和需要用户裁决的点。

## 非目标

- 不把 Atlas workflow 改成多 agent harness。
- 不让 tiny task 强制走合同阶段。
- 不重写 Multica agent inventory、repo checkout、final closure 或 evidence manifest 机制。
- 不用最终 E2E 替代实现前合同。

## 决策边界

- Multica 可以新增 `contract` phase 和 sprint contract 模板。
- Atlas workflow 只新增轻量模板和 skill 指令，不新增强制 CLI phase。
- Contract 不得扩大 PRD 范围；遇到范围冲突时交给 leader 或用户裁决。
- Contract 必须可验证，不能只写原则性描述。

## 验收标准

- Multica 文档、角色指令和 workflow template 明确完整 Planner / Generator / Evaluator contract flow。
- Multica 新增 sprint contract 模板，覆盖 generator proposal、evaluator challenge、accepted contract、acceptance rows、evidence refs、failure/stop conditions。
- Atlas workflow 新增 implementation contract 模板，并在相关 skill 中说明触发条件和 tiny task 豁免。
- 两套版本术语一致，且清楚区分“完整版”和“轻量版”。
- 现有插件校验、shell 语法校验和 Multica router self-test 通过。
- 若修改 Atlas workflow skill source，刷新 active cache 并验证 source/cache 一致。

## 验证计划

```bash
python3 -m json.tool .agents/plugins/marketplace.json >/dev/null
python3 /home/gewu/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/atlas-workflow
python3 /home/gewu/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/multica-sdlc
bash -n scripts/bump-plugin-cachebuster.sh
bash -n scripts/codex-plugin-update.sh
bash -n scripts/install-atlas-forge.sh
bash -n scripts/sync-live-agents.sh
bash -n scripts/sync-live-workflow.sh
plugins/multica-sdlc/scripts/self-test-router.sh
rg -n "contract|generator proposal|evaluator challenge|Planner / Generator / Evaluator|implementation contract" plugins/multica-sdlc plugins/atlas-workflow workflow docs
```

Atlas workflow skill 变更后还需要：

```bash
~/.codex/workflow/bin/codex-refresh-local-plugin atlas-workflow
cmp plugins/atlas-workflow/skills/task/SKILL.md /home/gewu/.codex/plugins/cache/atlas-forge/atlas-workflow/*/skills/task/SKILL.md
cmp plugins/atlas-workflow/skills/clarify/SKILL.md /home/gewu/.codex/plugins/cache/atlas-forge/atlas-workflow/*/skills/clarify/SKILL.md
cmp plugins/atlas-workflow/skills/team/SKILL.md /home/gewu/.codex/plugins/cache/atlas-forge/atlas-workflow/*/skills/team/SKILL.md
```

## 下一步

使用 `$atlas-workflow:task` 执行实现。建议先做 Atlas workflow 轻量版，再做 Multica 完整版，最后跑完整校验和 cache 同步。
