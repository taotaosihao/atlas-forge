---
name: multica-agent-plan
description: Plan a task-specific Multica squad and agent configuration before submission. Use when the user asks to decide Multica roles, staffing, model/provider assignment, tool/MCP requirements, validation gates, or to prepare a Multica execution plan without submitting it.
---

# Multica Agent Plan

使用本 skill 为 Multica 任务自动规划小队成员、角色职责、模型约束、工具/MCP、阶段门禁和验收证据。它只产出可审核的 agent 配置方案，不提交任务到 Multica。

本 plugin 还提供可复用动态流程资产：

- `templates/multica-sdlc-workflow.yaml`：默认模板示例，包含 phase、required/optional roles、join policy、repair/blocker/clean-gate owner、next phase、done criteria 和 timeout action。
- `templates/sprint-contract.md`：implementation 模式下的完整 Planner / Generator / Evaluator 合同模板，用于编码前确认 generator proposal、evaluator challenge、accepted contract rows 和证据路径。
- `scripts/multica-next-role-router`：事实型 next-role router，只解释模板和事件 JSON，不做大模型业务判断。
- `instructions/` 与 `generated/`：Multica SDLC 角色说明来源，可用于 agent instruction 配置或审计。

规划输出如果包含 Multica 自动编排，应引用或附上 workflow template，并说明哪些字段由 leader 在 issue 内生成/更新，哪些字段由 specialist 按输出格式交付。

## 适用场景

- 用户要求“让 Multica/DeepSeek 小队继续/实施/开发/测试”，但尚未明确小队配置。
- 用户要求根据 PRD、设计稿、调研包、开发计划或修复任务自动规划 agent。
- 用户要求补充缺失角色、调整 leader/planner/coder/QA/reviewer 的职责或 skill。
- 用户要求确认 vision、browser、chrome-devtools、agy bridge MCP、Playwright、GitHub 等工具应分配给哪些角色。
- 用户只想先审核 Multica 执行方案，还没有批准提交。

如果用户已经给出并批准了完整 agent 配置和任务包，改用 `multica-prd-submit`。

## 输入

尽量收集并引用这些上下文：

- 任务包或 PRD 路径。
- 目标 repo、本地路径、默认分支、是否需要 worktree。
- 任务类型：产品调研/PRD、实现开发、设计/文档评审、排障调查。
- 模型约束：例如只使用 GPT 和 DeepSeek V4 Pro。
- 工具约束：例如 DeepSeek vision 使用 agy bridge MCP。
- 并发要求：例如 coder 和 QA 可多路并行。
- 验收要求：截图、E2E、API 证据、日志、PR、阻塞报告等。
- 动态 workflow template 路径或模板要求；没有时可使用本 plugin 的 `templates/multica-sdlc-workflow.yaml` 作为起点。

缺少非阻塞信息时，做明确假设并在方案中标注；只有缺失信息会改变安全边界、数据风险或任务目标时才向用户提问。

## 规划流程

1. 分类任务模式：
   - `product-research-prd`：研究现有产品/系统并产出 PRD、证据和差距分析，不开发代码。
   - `implementation`：实现已批准的代码、配置或文档变更，并走开发、测试、修复、PR 流程。
   - `design-or-doc-review`：评审、润色或补齐设计/文档，不做实现。
   - `investigation`：收集证据、定位问题、给出后续建议。
2. 先盘点当前已有 agent 和 skill：
   - 读取 Multica 当前 agent：`multica agent list --include-archived --output json`。
   - 对候选 agent 读取详情和 skill：`multica agent get <agent-id> --output json`、`multica agent skills list <agent-id> --output json`。
   - 读取本地可用 instruction/skill 来源：优先使用本 plugin 的 `instructions/*.md`、`generated/*.txt`、`skills/*/SKILL.md`；兼容 live install 路径 `/home/gewu/.agents/multica-sdlc/instructions/*.md`、`/home/gewu/.agents/multica-sdlc/generated/*.txt`、`/home/gewu/.agents/skills/*/SKILL.md`。
   - 输出当前 agent/skill inventory：agent id、名称、状态、模型/runtime、已绑定 skill、适配角色、当前任务占用情况、是否可直接复用。
3. 复用优先，再补齐：
   - 如果现有非 archived agent 的模型、runtime、skill、MCP、instructions 可以满足角色要求，直接加入实施小组，不新增、不改造。
   - 如果只缺少可安全追加的 skill，优先规划 `multica agent skills add <agent-id> ...`，但仍视为改造，必须先完成无活跃任务检查。
   - 如果需要改 instructions、model、runtime、MCP、env、max concurrency、角色定位，视为重新编辑 agent；编辑前必须证明该 agent 当前没有未完成 issue/task。
   - 如果 agent 正在处理 issue/task，不能改造它；应选择另一个可用 agent、新建 agent，或把缺口标为需要用户批准的等待项。
4. 改造/新增安全检查：
   - 改造已有 agent 前，检查 `multica agent tasks <agent-id> --output json` 和 `multica issue list --assignee-id <agent-id> --output json`。
   - 只有当所有相关 task/issue 都是终态（例如 done、cancelled、closed、archived）或为空时，才允许规划对该 agent 的 update、skills set/add、MCP/env/model/instructions 修改。
   - 不确定状态是否终态时，按“有活跃任务”处理，不改造。
   - 新增 agent 时，说明为什么现有 agent/skill 不能满足，以及新 agent 的名称、模型、runtime、skill、MCP、instructions 来源和使用边界。
5. 判断风险和执行边界：
   - 是否需要 dedicated git worktree。
   - 是否涉及 UI、后端、API、数据迁移、权限、安全、部署或外部集成。
   - 是否存在真实数据、设备、账号、网络、浏览器或 MCP 阻塞。
6. 动态组队：
   - 不把“9 个角色组”理解为 agent 数量上限。
   - coder、QA、reviewer 可以按功能域并发拆分多个 agent。
   - 只启用任务需要的角色，并列出明确省略的角色及原因。
   - Active Roles 中必须区分 `reuse-existing`、`edit-existing`、`create-new`，并写明依据。
7. 分配模型和工具：
   - 根据用户约束选择 GPT 或 DeepSeek V4 Pro。
   - 除非用户另有明确覆盖，`gpt-5.4` 只允许作为 coder 或 E2E 角色的 fallback；不得用于 leader、planner、reviewer、Evidence QA、docs summary、clean-gate 或 PR-ready-gate owner。
   - 需要视觉理解、截图审查、UI 对比、网页状态判断时，为对应角色配置 vision。
   - DeepSeek 角色需要 vision 时，优先配置 agy bridge MCP。
   - 需要浏览器实操、网络面板、DOM、控制台、登录态或有头浏览器时，配置 chrome-devtools/browser/Playwright 能力。
8. 设计门禁：
   - 规划门禁：任务边界、假设、角色矩阵、依赖、阻塞项。
   - 合同门禁：implementation slice 在编码前完成 sprint contract，至少包含 generator/coder proposal、evaluator/E2E challenge、accepted contract rows、真实 runtime target、evidence refs、stop conditions；tiny slice 可由 leader 明确豁免。
   - 开发门禁：worktree、实现分工、代码审查、E2E、修复循环。
   - 证据门禁：截图、录屏、API 请求/响应、日志、测试命令、数据断言。
   - 交付门禁：最终产物、阻塞报告、PR 或无需 PR 的说明。

## 推荐输出格式

输出一个可直接提交审核的 Markdown 方案，至少包含：

```markdown
# Multica Agent 配置方案

## 任务分类
- 模式：
- 理由：
- 是否需要提交前人工审核：

## 关键假设
- ...

## Active Roles
| 角色组 | Agent | 复用/改造/新增 | 模型 | Skill/MCP | 负责范围 | 交付物 |
| --- | --- | --- | --- | --- | --- | --- |

## Agent / Skill Inventory
| Agent | 状态 | 当前任务 | 已有 Skill | 适配结论 |
| --- | --- | --- | --- | --- |

## Agent Mutation Plan
| Agent | 动作 | 无活跃 issue/task 证据 | 原因 | 风险 |
| --- | --- | --- | --- | --- |

## Omitted Roles
| 角色 | 省略原因 |
| --- | --- |

## 阶段与门禁
| 阶段 | Owner | 输入 | 输出 | 必过门禁 |
| --- | --- | --- | --- | --- |

## Dynamic Workflow Template
- 模板路径：
- phase / artifact type：
- required roles：
- optional roles：
- join policy：
- repair owner：
- blocker owner：
- clean-gate owner：
- next phase：
- done criteria：
- timeout action：
- next-role routing dry-run：

## 并发策略
- Coder 并发：
- QA 并发：
- Review 并发：

## Vision / Browser / MCP 配置
- ...

## 验收证据
- ...

## Multica 提交准备度
- 可以提交 / 暂不提交：
- 必须附加文件：
- 建议提交标题：
- 提交命令草案：
```

## 规则

- 本 skill 不调用 `multica issue create`，不提交任务。
- 本 skill 不创建分支、不修改业务代码、不打开 PR，除非用户明确把当前任务改为实现工作。
- 方案要让 Multica leader 和 planner 能直接执行，避免让后续开发靠缺省补全。
- 不要把 `coder -> reviewer/e2e -> leader` 写死为唯一流程；普通下一跳必须来自模板字段，leader 只负责 clean-gate、PR-ready/final closure、blocker 或模板显式要求的决策。
- 动态规划必须先读取当前已有 agent 及对应 skill；能满足任务的现有 agent 必须优先直接复用。
- 重新编辑已有 agent 前必须确认该 agent 当前没有未完成 issue/task；不能确认时不得改造，应新增 agent、选择其他 agent，或标记为需要人工批准的阻塞项。
- `gpt-5.4` 只允许规划为 coder 或 E2E fallback；不要把 `gpt-5.4` 规划给 leader、planner、reviewer、Evidence QA、docs summary、clean-gate 或 PR-ready-gate owner。
- 对高风险、跨模块、UI/后端/API/权限/数据流任务，主动配置 reviewer 和 QA，而不是只靠 coder 自测。
- 对存在阻塞项的任务，规划负责解阻的 agent、工具、证据和 fallback，而不是简单停止。
- 只有方案经用户批准后，才使用 `multica-prd-submit` 提交。
