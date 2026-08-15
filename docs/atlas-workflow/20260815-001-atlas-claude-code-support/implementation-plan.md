# Atlas Workflow 支持 Claude Code（双宿主并存）实施方案

- 状态：已实施并完成源码级验证；未安装、刷新或发布
- 日期：2026-08-15
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

## 4. 已知限制

- Claude 侧 6 个命令、7 个 agents 均未安装到真实 `~/.claude`，仅完成源码级布局与语法验证；端到端安装验证需要用户在临时 `CLAUDE_CONFIG_DIR` 下手动执行（见验证记录）。
- `claudePluginCacheCandidates()` 依赖真实 Claude 安装后的 cache 目录结构；本机当前没有已安装的 `atlas-workflow` Claude 插件，因此该函数在本机返回空数组，只在合成 fixture 下验证过其排序与容错行为。

## 5. 验证记录

- `node --check` 全部修改的 JS 文件：`core/paths.js`、5 处 `pluginCandidates()` 调用点、`lane-registry.js`、`commands.js`、`team-commands.test.js`：全部通过。
- `node --test workflow/tests/js/team-commands.test.js`：81/81 通过（含新增 `main-claude` 场景与既有 grok 不影响的 `non-claude` 断言）。
- `node --test workflow/tests/js/task-lifecycle.test.js`：15/15 通过（`paths.js` 改动后的回归检查）。
- `bash workflow/tests/integration_atlas_plugin_dev_sync.sh`：全部 25 项 `ok`（含扩展后的 `atlas-workflow` shim 断言）。
- `bash workflow/tests/contract_refresh_local_plugin.sh`：全部通过，无意外回归。
- `claudePluginCacheCandidates()` 手动函数测试：真实主机路径（空数组，无已安装插件）、合成 `.in_use` 排序、缺失目录容错，三种场景均按预期返回。
- `claude-hook-launcher` 手动测试：仓库相对路径命中真实 hook（高风险命令告警正确触发）、无任何候选路径可达时静默 `exit 0`（模拟 Claude 隔离 cache 场景）。
