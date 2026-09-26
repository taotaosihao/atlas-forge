# Atlas Workflow 支持 Claude Code（双宿主并存）实施方案

- 状态：已实施并完成源码级验证；未安装、刷新或发布
- 日期：2026-08-15；2026-09-24 补齐独立 runtime 与 Team 宿主分流
- 工作类型：implementation
- 交付目标：product_increment
- 权威范围：`plugins/atlas-workflow/` 的 Claude Code 插件清单、命令、agents、hooks；`workflow/bin/lib/codex-workflow/core/paths.js` 与 5 处 `pluginCandidates()` 的宿主中性候选路径；`team/commands.js` 的 grok/xai provider family 预置；`team/SKILL.md` 的 Claude Native Collaboration 映射与 `lane-registry.js` 自绑定哨兵扩容
- 不授权：把 Claude model 变成 Codex 主控 Team 里可自动调度的 Paseo 跨供应商后端；`~/.grok/config.toml` 注入；对 5 处 `pluginCandidates()` 做提取重构；刷新真实 marketplace/cache/workflow runtime；发布

## 1. 目标

Atlas Forge 原本是 Codex-only 的插件市场 + workflow runtime。本方案让 `atlas-workflow` 在 Claude Code 里可安装、可用（`/task`、`/team` 等斜杠命令，或直接按 skill 名调用），同时保持 Codex 行为逐字节不变——双宿主并存（additive），而非替换或分叉。

参考 `~/work/opencodex` 的宿主接入范式（ownership marker、host-neutral 路径解析、additive 注入），但 Atlas 是插件仓库而非常驻代理，因此只借用模式，不搬运其代理/注入代码。

## 2. 非目标

1. 不把 Claude model 变成 Codex 主控 Team 里可自动调度的 Paseo 跨供应商后端；`### Claude Manual-Only Gate` 原样保留，措辞不动。
2. 不做 `~/.grok/config.toml` 注入——Grok Build 没有 skills/agents/commands 加载面，其全部集成只是配置文件里的一段 fenced model 块；Grok 支持在本方案中仅指 provider family 预置。
3. 不复制 Codex 专属的 DeepSeek 兼容 inbox transport（`atlas-native-agent-inbox`）到 Claude 侧——那是恢复隐藏在 OpenAI 加密 payload 后面任务内容的兼容手段，Claude Code 的 `Agent`/`SendMessage` 以明文传递 prompt，没有对应问题。
4. 不重构已存在于 5 个模块中的重复 `pluginCandidates()` 辅助函数。
5. 不刷新真实 marketplace、cache、workflow runtime 或 agent runtime，不执行发布。
6. 不新增 `~/.codex/workflow/bin/codex-workflow` 之外的强制路径——该路径是文档声明的公开路径，必须保留；新增的 `atlas-workflow` 中性 alias 是纯粹的 additive 补充。

## 3. 已完成的变更

### 3.1 Claude 插件清单与市场（宿主分发）

- 新增 `plugins/atlas-workflow/.claude-plugin/plugin.json`：极简格式（`name`/`version`/`description`/`author`），`version` 与 `.codex-plugin/plugin.json` 保持一致。
- 新增仓库根 `.claude-plugin/marketplace.json`（不能放进 `.agents/**`，那是冻结区）。
- 扩展 `scripts/bump-plugin-cachebuster.sh`：在原有把 `.codex-plugin/plugin.json` 的 version 同步到 legacy `plugin.json` 的逻辑基础上，追加同步到 `.claude-plugin/plugin.json` 与仓库根 `marketplace.json` 的对应 plugin entry + metadata。

### 3.2 Skills 宿主中性化

15 个 SKILL.md 里，14 个引用了 Codex 专属的 `~/.codex/workflow/bin/codex-workflow` 路径或 `$atlas-workflow:<name>` 语法（`3d-harness` 是 source-checkout-only 技能，两者都不涉及，未改动）。为每个受影响 skill 的入口段落追加一条 `## Host Note`，说明 Codex 用 `$atlas-workflow:<name>`、Claude Code 用 `/<name>` 或直接调用同名 skill，且 CLI 优先用 `atlas-workflow`（PATH 上的中性 alias），否则回退绝对路径。原有 42+ 处绝对路径引用和 52+ 处 `$atlas-workflow:` 语法保持不变（additive 说明，不做逐条替换）。

`team-v1`（legacy，依赖 `codex exec` 子进程）额外注明其后端是 Codex-only，Claude Code 上应改用 `team`（host-neutral 原生协作）。

2026-09-26 补充：上面“绝对路径保持不变”的做法已被替代。Claude-only 环境里没有 `~/.codex`，而 agent 会照字面执行正文中的命令。因此，除 `team-v1` 外，各 skill 正文改用不带路径的命令名（`atlas-workflow`、`codex-design-review`）；Host Note 分宿主给出命令入口：Codex 用 `~/.codex/workflow/bin/<command>`，Claude Code 用 `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/bin/<command>`（或安装时指定的 `LOCAL_BIN_ROOT`）。其中 Claude 侧的 shim 负责设置 runtime root，所以不能直接调用 runtime 目录里的副本。两个宿主装在同一台机器上时，PATH 里的顺序无法区分两套 runtime，所以只有当 `command -v` 解析到的不是另一个宿主的目录时，才可以直接用 PATH 上的命令。其他改动：
- worktree 的默认位置、clarify reference 中的模板目录都按宿主分别给出；
- MemPalace 相关步骤改为宿主提供时才使用，缺失时明确降级；
- `system-message-design` 随插件分发，两个宿主都能用。

静态约束由 `workflow/tests/contract_host_neutral_skills.sh` 检查。

### 3.3 运行时路径中立

- `workflow/bin/lib/codex-workflow/core/paths.js`：`workflowRoot()`/`codexHomeRoot()` 增加 `ATLAS_WORKFLOW_ROOT`/`ATLAS_HOME_ROOT` 作为最高优先级的中性别名，原有 `CODEX_WORKFLOW_ROOT`/`CODEX_HOME_ROOT`/`CODEX_HOME` 解析顺序和语义不变。
- 新增 `claudePluginCacheCandidates()`：扫描 `<CLAUDE_CONFIG_DIR>/plugins/cache/<marketplace>/atlas-workflow/<version>`（`.in_use` 标记的版本优先），供 5 处 `pluginCandidates()` 调用点在候选列表追加真实 Claude 安装态的插件路径。
- 新增中性 CLI alias `workflow/bin/atlas-workflow`（与 `codex-workflow` 同形的 5 行 shim），并登记进 `scripts/sync-live-atlas-workflow.sh` 的 `ATLAS_COMMAND_NAMES` 数组；同步扩展 `workflow/tests/integration_atlas_plugin_dev_sync.sh` 的对应断言。

### 3.4 Hooks

- 新增 `plugins/atlas-workflow/hooks/hooks.json`（PreToolUse/PostToolUse，matcher: Bash）。
- 新增 `plugins/atlas-workflow/scripts/claude-hook-launcher`：按 `ATLAS_WORKFLOW_ROOT` → `CODEX_WORKFLOW_ROOT` → 仓库相对路径 → `~/.codex/workflow` 的优先级定位真实的 `workflow/hooks/{pre,post}-tool-use`；找不到时静默 `exit 0`，绝不阻塞会话。`workflow/hooks/*` 本身零改动——它们已经 fallback 到通用 `TOOL_*` 环境变量并递归遍历 stdin JSON。

### 3.5 原生 agents 映射

`.codex/agents/*.toml` 中 7 个不依赖 Codex custom-provider 路由的角色（explorer/planner/reviewer/phase-reviewer/implementer/verifier/browser-verifier）映射为 `plugins/atlas-workflow/agents/*.md`。字段映射：`name`/`description` 直接对应；`developer_instructions` 转为正文；`nickname_candidates` 丢弃；`sandbox_mode` 转译为 `tools:` 列表（`read-only` → 无 Edit/Write）。生成的 agent 不写 `model:` 字段，继承父会话模型（Claude Manual-Only Gate 要求）。

4 个 `*-deepseek` 变体（依赖 Codex 专属的 `[model_providers.zenmux]` 自定义供应商表和 `model_catalog_json`）未映射——Claude 侧没有等价的自定义 provider 路由基础设施，生成一个声称走 DeepSeek/ZenMux 但实际无法路由的 agent 会产生误导。

`.codex/agents/**` 源文件本身未改动。

### 3.6 Team 原生协作按宿主拆分

`skills/team/SKILL.md` 的 `## Codex Native Collaboration` 旁新增 `## Claude Native Collaboration` 小节，把同一组语义动作映射到 Claude 的 `Agent`/`SendMessage`/`TaskList`+`TaskGet`/`TaskOutput`/`TaskStop`。`Agent` 的 `subagent_type` 对应 3.5 节生成的 `agents/*.md` 名字。`### Claude Manual-Only Gate` 措辞不动——它管的是"Codex 主控 Team 要不要把 Claude 模型当 Paseo 跨供应商路由"，与"Claude Code 自己跑 Team 调度自己的 Claude subagent"是两条独立轴线。

`workflow/bin/lib/codex-workflow/team/lane-registry.js` 的自绑定哨兵正则从 `/^(main-codex|controller).../i` 扩容为 `/^(main-codex|main-claude|controller).../i`，纯粹的黑名单扩容,不改变任何现有调用行为。`workflow/tests/js/team-commands.test.js` 的 "required perspective admission requires an independently bound actor" 测试新增 `main-claude` 场景，验证同样被拒绝。

### 3.7 Claude commands（6 个）

`plugins/atlas-workflow/commands/{task,team,clarify,intake,finish,cw}.md`：`description`/`argument-hint`/`allowed-tools` frontmatter，正文引用 `$ARGUMENTS` 并转交同名 skill 的完整规则（不复制 skill 内容,只做入口转发）。`team.md` 的 `allowed-tools` 额外包含 `Agent, SendMessage, TaskList, TaskGet, TaskOutput, TaskStop`。其余 9 个 skill 靠 Claude Code 的 skill 自动发现进入,不生成对应命令。

### 3.8 Grok provider family 预置

`workflow/bin/lib/codex-workflow/team/commands.js` 的 `DIRECT_PROVIDER_MODEL_FAMILIES` 增加 `grok`/`xai` → `non-claude`，附代码注释说明这是 family 分类而非供应商准入。Paseo 当前不暴露 grok provider（仅 claude/codex/deepseek/zenmux/kimi），因此该改动今天不产生任何可用路由，只是让未来出现 grok 路由时不会因 `MODEL_FAMILY_UNVERIFIED` 直接 fail-closed。`skills/team/SKILL.md` 中"不要从 DeepSeek/ZenMux 配方推断未来 Grok/Kimi 路由"的措辞未改动。

## 4. 当前补齐范围与限制（2026-09-24）

- `scripts/sync-live-atlas-workflow.sh --host claude` 复用原子同步与回滚，默认将 runtime 安装到 `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/workflow`，命令 shim 安装到并列的 `bin`。保留 tasks/state/artifacts，不安装 Codex agents，不调用 Claude/Codex 模型，不修改 marketplace/cache。安装步骤以根 README 为准。
- Claude hook launcher 可定位此独立 runtime；共享 pre-tool hook 优先读取 `tool_input.command`，避免把 `tool_name: Bash` 误当命令。
- Claude 原生 Team 使用当前宿主的 `Agent` schema 和用户会话/配置解析的模型，不执行 Codex catalog/model-policy 检查，也不要求 `reasoning_effort` 或 `fork_turns`。Paseo 的模型准入门禁仅用于显式 Paseo 派发，公共权限、独立审查、写入边界及验收要求保留。
- `team-v1` 与 DeepSeek/ZenMux 已弃用，不再视为可选路由；本次不迁移或恢复，也不进行全仓 legacy 清理。
- 专项 `workflow/tests/contract_claude_host.sh` 使用临时 HOME、含空格的 `CLAUDE_CONFIG_DIR`、模拟 cache 布局、CLI 禁用桩与 hook JSON 验证。它接入 `contract_host_install.sh`，不调用 Claude 模型。
- 真实 Claude 模型调用、实际插件发现及宿主事件派发不在本次测试范围；静态规则与合成 payload 通过不证明真实模型行为或安装态生效。多版本 cache 的精确绑定仍属于单独的后续项。

## 4.1 Claude 侧架构与 prompt 补齐（2026-09-27）

依据 Anthropic 官方材料：[Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)、[Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)、[Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps)、[Scaling Managed Agents](https://www.anthropic.com/engineering/managed-agents)，以及 Claude Code 的 skills、hooks、permissions 文档。

- **Team 渐进披露。** 官方建议 SKILL.md 正文不超过 500 行，只在 Codex 用到的内容拆到按需读取的 reference。`team/SKILL.md` 原有 642 行，其中精确模型路由和 Cross v1 只对 Codex 有用，现已移到 `team/references/codex-model-routing.md`：Codex 在做模型或工具预检之前必须完整读取，Claude Code 不读。SKILL.md 降到 360 行，原文逐行保留，没有删改。
- **会话开始时的固定动作。** 对应 harness 文章里“每个会话开始先读进度、看 git 状态”的做法。插件新增 `SessionStart` hook，在 startup、resume、clear 和 compact 时注入 `hooks/session-baseline.md`，即 Codex home `AGENTS.md` 里 Atlas 规则的 Claude 版本，并明确用户和项目自己的指令优先。Claude runtime 中有当前任务时，hook 还会提示重读任务记录、产物、checkpoint 和 git 状态。只有状态为 doing 或 blocked 的任务才会提示，措辞也是“若当前请求在延续该任务”，因为 current-task 指针是整个 runtime 共用的，不区分项目。hook 只读 Claude runtime，任何失败都不阻塞会话。
- **命令预授权收窄。** 按文档，`allowed-tools` 的作用是在本轮免去权限确认，并不限制可用工具。原先预授权的 `Bash(git:*)` 会让 `git push` 等操作无需确认就执行，与 Atlas 的授权边界冲突。现在只预授权 Atlas CLI，但这只对 PATH 上的裸命令生效，用完整路径调用时仍按用户的权限设置处理；只读的 git 命令本来就在 Claude Code 内置的免确认清单里。
- **skill description。** 官方要求 description 同时写明“做什么”和“何时用”，它是自动触发的唯一依据。已补全 analyze、task、cw、design-review、learn、worktree、team 这 7 个过于简短的 description，并给 team-v1 标注已弃用；所有插件 skill 都可以用 `/atlas-workflow:<name>` 直接调用。Codex 也按 description 自动选择 skill，所以这项改动同样影响 Codex 的路由；新写法沿用 Codex 全局规则中的路由分工，例如 analyze 注明压力测试方案时改用 intake。
- **暂不改写 prompt 措辞。** 官方建议先做评估：先观察真实的 Claude 行为，再补说明。目前还没有 Claude 的行为证据，所以 skill 正文措辞不做推测性改写，待真实运行后再根据观察调整。
- **Codex 全局基线与 Claude 版本并存。** 两者目前是两个来源，Claude 版只保留 Atlas 相关的子集；以后修改其中一份时，需要同步核对另一份。

## 5. 初次适配验证记录（2026-08-15）

- `node --check` 全部修改的 JS 文件：`core/paths.js`、5 处 `pluginCandidates()` 调用点、`lane-registry.js`、`commands.js`、`team-commands.test.js`：全部通过。
- `node --test workflow/tests/js/team-commands.test.js`：81/81 通过（含新增 `main-claude` 场景与既有 grok 不影响的 `non-claude` 断言）。
- `node --test workflow/tests/js/task-lifecycle.test.js`：15/15 通过（`paths.js` 改动后的回归检查）。
- `bash workflow/tests/integration_atlas_plugin_dev_sync.sh`：全部 25 项 `ok`（含扩展后的 `atlas-workflow` shim 断言）。
- `bash workflow/tests/contract_refresh_local_plugin.sh`：全部通过，无意外回归。
- `claudePluginCacheCandidates()` 手动函数测试：真实主机路径（空数组，无已安装插件）、合成 `.in_use` 排序、缺失目录容错，三种场景均按预期返回。
- `claude-hook-launcher` 手动测试：仓库相对路径命中真实 hook（高风险命令告警正确触发）、无任何候选路径可达时静默 `exit 0`（模拟 Claude 隔离 cache 场景）。
