---
name: multica-prd-submit
description: Submit an already-approved PRD, design packet, research packet, implementation plan, and optional approved Multica agent/staffing plan to Multica. Use only for the submission step after task scope and agent configuration are approved; use multica-agent-plan first when staffing or execution roles still need to be planned.
---

# Multica PRD Submit

使用本 skill 将已经审核通过的任务包提交到 Multica。它只负责提交，不负责重新规划小队成员。

如果用户要求“先规划小队/角色/agent 配置/模型和 MCP/并发策略”，或当前任务还没有批准过 agent 配置，先使用 `multica-agent-plan`。

如果任务使用动态 Multica workflow，应把已批准或 leader 可更新的 workflow template 作为 attachment 或提交信封事实源。模板应来自本 plugin 的 `templates/multica-sdlc-workflow.yaml` 或由批准的 staffing plan 明确替换，不要在提交时临时写死固定流程。

## 本 skill 做什么

通过本地 wrapper 创建 Multica issue：

```bash
~/.agents/bin/multica-prd-submit \
  --repo <repo-path> \
  --title "<title>" \
  --staffing-plan <approved-agent-plan.md> \
  --attachment <source-or-reference-file> \
  <prd.md|prd.html>
```

任务包是事实源。可选的 staffing plan 是 Multica agent 配置事实源。提交时不要让 Multica 临时推断已经规划过的角色、模型、工具或门禁。

## 输入

必需：

- 一个已批准的 PRD/任务包，扩展名为 `.md`、`.markdown`、`.html` 或 `.htm`。

可选但推荐：

- `--repo <path>`：目标仓库路径。
- `--title "<issue title>"`：清晰的 Multica issue 标题。
- `--staffing-plan <path>`：已批准的 Multica agent 配置方案。
- `--attachment <path>`：PRD 引用的 PDF、截图、接口文档、数据样例、设计稿、验收证据等。可重复使用。
- `--attachment <workflow-template.yaml>`：动态 Multica workflow template，推荐用于包含 next-role routing、join gate、repair/blocker owner 或 timeout/escalation 要求的任务。

如果用户只在聊天中提供 PRD 文本，先把它保存为文件，通常放在目标 repo 的 `docs/plans/YYYY-MM-DD-short-title.md`，再提交该文件。

## 仓库选择

优先读取 `$MULTICA_STATE_HOME/local-repos.md` 中的本地 repo 注册信息。

常见本地 repo：

- gearjob: `$GEARJOB_REPO`
- beezer: `$BEEZER_REPO`
- hive: `$HIVE_REPO`

不要默认要求 Multica 重新 clone 这些 repo。除非本地路径不存在、不可读、明确过期，或任务明确要求干净 checkout，否则使用本地路径。

## 提交流程

1. 确认 PRD/任务包存在，且扩展名受支持。
2. 确认目标 repo 路径。PRD 位于 git repo 内时，默认使用该 repo，除非用户另行指定。
3. 确认是否已有用户批准的 agent/staffing plan：
   - 有：使用 `--staffing-plan <path>` 附加。
   - 没有且用户要求自动规划：停止提交，先使用 `multica-agent-plan`。
   - 没有但用户明确要求直接提交：在最终回复中说明“未附 staffing plan，Multica leader 只应在 issue 内记录缺口或请求补充，不应把提交 skill 当作规划来源”。
4. 如果任务来自 Atlas，并且存在 task id，提交前运行必要门禁：

```bash
~/.codex/workflow/bin/codex-workflow ready <task-id> --require context,spec,analysis,decision
~/.codex/workflow/bin/codex-workflow handoff-envelope <task-id> \
  --prd <prd-path> \
  --repo <repo-path> \
  --base <base-branch> \
  --acceptance "<id>|<requirement>|<required|advisory>" \
  --validation "<id>|<surface>|<required|advisory>|<evidence>"
```

只有小型、明确、低风险交接可以使用 `ready --skip "<reason>"`，并在回复中说明原因。

5. 运行提交命令：

```bash
~/.agents/bin/multica-prd-submit \
  --repo <repo-path> \
  --title "<Run PRD research: concise title>" \
  --staffing-plan <approved-agent-plan.md> \
  --attachment <source-or-reference-file> \
  <prd-path>
```

实现类任务使用类似 `Implement PRD: concise title` 的标题；调研/PRD 类任务使用类似 `Run PRD research: concise title` 的标题。

6. 解析 JSON 输出，向用户报告 Multica issue id、url、title。
7. 如果 Multica 返回 draft PR 或 blocker，并且存在 Atlas task，记录结果：

```bash
~/.codex/workflow/bin/codex-workflow result-ingest <task-id> \
  --issue <url-or-id> \
  --outcome draft-pr|blocker \
  --commit <sha-or-unknown> \
  --worktree <path-or-none> \
  --evidence <path-or-url> \
  [--draft-pr <url>] \
  [--blocker <path-or-url>]
```

产品调研产物完成时，报告 Multica issue 和交付文件路径即可；不要伪造不支持的 result-ingest outcome。

## 重要规则

- Markdown 和 HTML PRD 都有效。HTML 文件本身就是完整 PRD，不要用摘要替代。
- 必须附加 PRD 文件；不要只把 PRD 摘要粘到 issue 描述里。
- PRD 明确引用的 PDF、截图、设计稿、接口资料、数据样例等必须作为 attachment 附上。
- 已批准的 staffing plan 必须作为 attachment 附上，并在提交描述里声明它是 agent 配置事实源。
- 已批准的 workflow template 如果存在，必须作为 attachment 附上，并在提交描述里声明它是 next-role routing 的事实源；router/hook 只能解释模板和事件事实，不能替代 leader 做 clean-gate/PR-ready 判断。
- DeepSeek 小队默认 assignee 为 `SDLC Autopilot DeepSeek`，可显式传 `--assignee "SDLC Autopilot DeepSeek"`。
- 本 skill 不负责发明角色、补齐 planner/leader/coder/QA 指令，相关工作归 `multica-agent-plan`。
- 不要 merge、deploy 或执行生产变更。实现类任务的常规输出是 draft PR 或 blocker report；研究类任务的常规输出是最终文档或 blocker report。

## 直接 CLI 兜底

只有在 `~/.agents/bin/multica-prd-submit` 缺失或损坏时，才直接创建 issue：

```bash
multica issue create \
  --title "<title>" \
  --description-file <submission-envelope.md> \
  --attachment <prd-path> \
  --attachment <approved-agent-plan.md> \
  --attachment <source-or-reference-file> \
  --assignee "SDLC Autopilot DeepSeek" \
  --status todo \
  --priority high \
  --output json
```

兜底描述文件也只能承载提交信封：事实源、附件、repo、base branch、提交者 commit、已批准 staffing plan。不要在兜底描述里重新内置一套动态组队策略。
