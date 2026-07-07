# Atlas Workflow 文档目录与最终合同定稿实施方案

> workflow task: `20260707-006-atlas-workflow-docs-folder-and-final-contract-normalization-plan`
> 日期：2026-07-07
> 状态：实施方案

## 1. 背景

当前 Atlas workflow 从 intake、clarify、team review 到最终 implementation contract，常会生成多个项目文档。它们散落在 `docs/atlas-workflow/` 根目录时，用户和执行 agent 都需要靠文件名、时间和上下文判断哪一份是最终合同。

更严重的问题是：多轮 review 后，最终合同有时会变成“旧合同正文 + review 修订意见 + 追加说明”的堆叠物。执行 agent 会同时看到已被推翻的旧要求和新要求，必须自行判断优先级。这会降低可执行性，也容易造成错误实施。

## 2. 实施目标

建立一套新的 Atlas workflow 文档规则：

- 同一 workflow 的 repo durable docs 必须放入同一个目录。
- 每个 workflow docs bundle 必须有 `contract-index.md` 指向当前权威合同。
- 最终实施合同必须是 clean final rewrite，只包含最终定稿要求。
- review 历史必须保留，但只能作为 history/provenance，不得混入 final contract 正文。
- 执行 agent 只读取 `contract-index.md` 指向的 `implementation-contract.final.md` 作为实施合同。

## 3. 非目标

- 不迁移所有历史 `docs/atlas-workflow/*.md`。
- 不改变 `~/.codex/workflow/artifacts/<task-id>/` 的运行时工作记录位置。
- 不要求 intake 或 brainstorm 直接生成 implementation contract。
- 不新增复杂数据库、索引服务或外部依赖。
- 不让 final contract 失去 provenance；只是不把 review 原文混入执行正文。

## 4. 目标目录结构

新 workflow 的 durable docs 使用目录结构：

```text
docs/atlas-workflow/<workflow-id>-<short-topic>/
  README.md
  contract-index.md
  intake.md
  clarify.md
  implementation-contract.draft.md
  implementation-contract.final.md
  reviews/
    001-plan-review.md
    002-contract-review.md
  decisions/
    team-decision.md
  evidence/
    validation-summary.md
```

不是每个文件都必须存在。最低要求：

- 只做 intake：至少有 `README.md` 或 `intake.md`。
- 进入实施准备：必须有 `contract-index.md`。
- 进入执行：必须有 `implementation-contract.final.md`，并被 `contract-index.md` 指向。

## 5. 文件语义

| 文件 | 语义 | 是否可执行 |
| --- | --- | --- |
| `README.md` | workflow bundle 摘要、当前状态、导航 | no |
| `contract-index.md` | 当前权威合同指针、版本状态、superseded 列表 | yes, as pointer |
| `intake.md` | intake 阶段事实与 blocker | no |
| `clarify.md` | clarify 后的边界、AC、验证计划 | no, unless promoted |
| `implementation-contract.draft.md` | 草稿合同 | no |
| `implementation-contract.final.md` | 干净定稿实施合同 | yes |
| `reviews/*.md` | review 历史 | no |
| `decisions/*.md` | team/user decision 历史 | no |
| `evidence/*.md` | 验证摘要 | no |

## 6. `contract-index.md` 规范

示例：

```markdown
# Contract Index

workflow_id: 20260707-006-docs-folder-final-contract-normalization
contract_status: ready-for-implementation
current_authoritative_contract: ./implementation-contract.final.md

contract_rules:
- 执行只读取 current_authoritative_contract 指向的合同。
- reviews/ 与 decisions/ 是历史证据，不是执行要求。
- final contract 必须是 clean rewrite，不得堆叠旧正文和修订意见。

superseded_contracts:
- path: ./implementation-contract.draft.md
  reason: 被 review findings 折叠进 final contract

review_history:
- ./reviews/001-plan-review.md

next_action:
- 按 ./implementation-contract.final.md 进入 task/team/worktree 实施
```

## 7. Final Contract Cleanliness Gate

`implementation-contract.final.md` 必须满足：

- 不包含 `TODO`、`TBD`、`待定`、`占位`。
- 不包含“修订意见如下”“review 建议”“旧方案”“原计划但现在改为”等历史堆叠语句。
- 不保留已被 review 判定为 blocker 的旧命令、旧路径或旧 scope。
- 不同时包含两个互斥的 PR sequence、validation command 或 acceptance criteria。
- 每个有效 review finding 都已折叠进正文的 scope、non-goals、AC、validation plan 或 stop condition。
- rejected / out-of-scope finding 只在 `reviews/` 或 `decisions/` 中保留。
- provenance 只能以链接形式出现，不能把 review 原文贴入 final contract。

允许的 provenance 示例：

```markdown
## Provenance

- Based on: ./implementation-contract.draft.md
- Reviewed by: ./reviews/001-plan-review.md
- Supersedes: ./implementation-contract.reviewed-v1.md
```

## 8. 合同修订流程

每次 review 后执行 contract normalization：

1. 读取上一版 contract、review findings、用户决策和新增约束。
2. 删除或移动被 superseded 的旧要求。
3. 把有效 findings 折叠进对应正文 section。
4. 把 rejected findings 放入 review history，不进入 final contract。
5. 重写 `implementation-contract.final.md`，确保它可以独立执行。
6. 更新 `contract-index.md` 的 `current_authoritative_contract` 和 `superseded_contracts`。
7. 运行 Final Contract Cleanliness Gate。

关键原则：

```text
Implementation contract finalization is a rewrite, not an append.
```

## 9. PR Sequence

### PR1：更新 skill 输出规则

修改：

- `plugins/atlas-workflow/skills/brainstorm/SKILL.md`
- `plugins/atlas-workflow/skills/clarify/SKILL.md`
- `plugins/atlas-workflow/skills/team/SKILL.md`
- `plugins/atlas-workflow/skills/team-v1/SKILL.md`
- 必要时补充 `plugins/atlas-workflow/skills/task/SKILL.md`

要求：

- 把 `docs/atlas-workflow/<task-id>-<short-topic>.md` 改为 `docs/atlas-workflow/<workflow-id>-<short-topic>/...`。
- 明确同一 workflow 的 durable docs 进入同一目录。
- 明确 final contract 必须 clean rewrite。
- 明确 final reply 要报告 workflow docs bundle directory 和 authoritative contract path。

验证：

```bash
rg -n "contract-index|implementation-contract.final|workflow docs bundle|同一 workflow" plugins/atlas-workflow/skills
bash workflow/tests/contract.sh
scripts/update-atlas-workflow-plugin --contract
```

### PR2：新增模板

新增：

- `workflow/templates/contract-index.md`
- `workflow/templates/implementation-contract.final.md`

要求：

- `contract-index.md` 包含 current authoritative contract、superseded contracts、review history、next action。
- `implementation-contract.final.md` 包含 Final Contract Cleanliness Gate 提示。
- 模板不能鼓励追加 review 附录。

验证：

```bash
test -f workflow/templates/contract-index.md
test -f workflow/templates/implementation-contract.final.md
rg -n "current_authoritative_contract|superseded_contracts|review_history" workflow/templates/contract-index.md
rg -n "clean rewrite|Final Contract Cleanliness" workflow/templates/implementation-contract.final.md
bash workflow/tests/contract.sh
```

### PR3：新增轻量 lint

新增或扩展：

- 可选：`plugins/atlas-workflow/scripts/codex-contract-index-lint`
- 或先把检查放入 `workflow/tests/contract.sh` 的 fixture 测试。

首版检查：

- `contract-index.md` 指向的 final contract 文件存在。
- final contract 不包含明显 stale markers。
- final contract 不包含明显历史堆叠语句。
- reviews 文件存在时，不能被标为 authoritative contract。

验证：

```bash
node plugins/atlas-workflow/scripts/codex-contract-index-lint --root docs/atlas-workflow/<bundle>
bash workflow/tests/contract.sh
```

### PR4：示例迁移

只迁移一个近期 workflow 作为示例，不做全量历史迁移。

候选：

- `20260707-006-docs-folder-final-contract-normalization/`

要求：

- 保持旧文档可通过 redirect 或 README 指向新目录。
- 不大规模重命名历史文档。

验证：

```bash
find docs/atlas-workflow/20260707-006-docs-folder-final-contract-normalization -maxdepth 3 -type f | sort
```

## 10. 验收标准

- 新 workflow 有明确 bundle directory。
- `contract-index.md` 能唯一指出 authoritative final contract。
- final contract 是干净定稿版，不包含旧合同正文和 review 附录堆叠。
- review history 保留在 `reviews/` 或 `decisions/`。
- skill 文档指导后续 Codex 按新结构输出。
- contract tests 和 plugin sync 通过。

## 11. 停止条件

- 如果实现需要迁移全部历史文档，停止并拆出迁移任务。
- 如果 lint 误伤大量合法 provenance，先降级为 advisory，不做 hard gate。
- 如果某个 workflow 没有进入实施阶段，不强制生成 final contract。
- 如果用户明确要求单文件交付，可以生成单文件摘要，但仍应在 bundle 目录中维护 authoritative contract 指针。

## 12. 下一步

下一步进入 `$atlas-workflow:task` 或 `$atlas-workflow:team` 实施 PR1 + PR2。PR3 lint 可在规则稳定后实施；PR4 只做一个示例迁移，不迁移历史全集。
