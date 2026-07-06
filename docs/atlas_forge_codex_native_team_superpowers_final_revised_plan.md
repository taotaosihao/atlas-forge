# Atlas Forge Codex Native Team × Superpowers SDD 完整修订方案

> 目标：把 `atlas-forge` 的 Codex native team 从“能调度 subagent 的团队技能”升级为可恢复、可审计、可验证的 **Codex-native SDD controller**。本版吸收了事实核查后的修正：subagent 不直接写 workflow artifacts，fix loop 有上限，implementer 强制 commit，ledger 进入 MVP，schema 采用无依赖可实现子集，硬编码路径治理按全仓规模处理，全文路径统一为 `$WORKFLOW_ROOT/artifacts/...`。

---

## 0. 本版相对上一版的关键修正

### 0.1 不再把 Superpowers 的 `review-package -C` 作为已落地事实

Superpowers `main` 上的 `skills/subagent-driven-development/scripts/review-package` 仍是：

```bash
review-package BASE HEAD [OUTFILE]
```

并且脚本内部使用裸 `git rev-parse`、`git log`、`git diff`、`git rev-list`，因此实际工作目录仍影响目标仓库解析。Atlas 方案保留 **从第一版实现 `--repo` / `-C`** 的设计，但设计依据改为“当前脚本存在 cwd 依赖”这一代码事实，而不是依赖任何外部 PR 状态。

**Atlas 设计结论保持不变：**

```bash
codex-team-review-package \
  --repo /abs/path/to/target-worktree \
  --base <base-sha> \
  --head <head-sha> \
  --task <task-id> \
  --slice <slice-id>
```

默认输出必须位于：

```text
$WORKFLOW_ROOT/artifacts/<task-id>/team/sdd/slices/<slice-id>/review-package.diff
```

不得要求 controller 通过 `cd <repo> ; helper ...` 这种 compound shell 形态来指向目标 worktree。

### 0.2 硬编码路径治理从“两处”升级为全仓治理

上一版低估了私有绝对路径的范围。修订版将它作为 **PR 0** 单独治理，且不使用简单的 `grep -R` 作为唯一验收，因为 live instructions、测试 fixtures、历史文档、方案文档本身都可能触发误报。

处理原则：

| 类别 | 例子 | 风险 | 处理 |
| --- | --- | --- | --- |
| 可执行代码默认值 | guard 脚本 fallback cwd、scorecard 默认路径 | 高 | 必须参数化；默认值不得指向个人机器路径 |
| agent live instructions | `plugins/**/instructions/*.md`、`.agents/**/instructions/*.md` | 高 | 必须参数化或改成 `$WORKFLOW_ROOT` / `$AGENTS_HOME` / `$MULTICA_STATE_HOME` |
| 测试脚本/fixtures | 测试中固定路径 | 中 | 用临时目录、环境变量或 fixture placeholder |
| docs / 历史记录 | 说明文档、迁移说明 | 低到中 | 用 placeholder，或放入 allowlist 并注明原因 |

验收不写成：

```bash
! grep -R '<private-home-path>' .
```

而应新增专用审计脚本：

```bash
node plugins/atlas-workflow/scripts/audit-private-paths.js \
  --root . \
  --deny-private-home \
  --allow-list docs/audit/private-paths.allow.json \
  --fail-on runtime,instructions,tests
```

最终目标可以升级为 `--fail-on all`，但 PR 0 的最小通过标准应优先覆盖 runtime 与 live instructions。

### 0.3 artifact 写回由 controller 负责，而不是 subagent 直接写

Codex read-only reviewer 无法写 `review-verdict.md/json`。即使 implementer 使用 workspace-write，`$WORKFLOW_ROOT/artifacts/...` 往往也在目标 repo workspace 外，不一定属于可写 root。因此，本版采用：

```text
subagent 读文件 + 修改 repo（仅 implementer/fixer）+ 最终消息返回结构化 JSON
controller 校验 JSON + 写入 workflow artifacts + 更新 ledger
```

这与 Superpowers 的 reviewer 模式一致：reviewer 的最终消息就是报告本身；在 Atlas 中 controller 再把最终消息结构化落盘。

### 0.4 fix loop 有界

Superpowers 的 fix → re-review 可以无限循环；Atlas team 已经要求 bounded loop。因此本方案规定每个 slice 默认：

```json
{
  "max_fix_iterations": 2,
  "max_question_rounds": 2,
  "max_time_minutes": 30
}
```

超过上限后写 ledger：

```json
{"event":"slice_blocked","reason":"fix_loop_exhausted"}
```

随后升级给 controller 或 human，不再继续盲目重试。

### 0.5 implementer 强制 commit

`review-package base..head` 的前置条件是变更已进入 git commit。修订版规定：任何修改文件的 implementer/fixer 必须在 slice 内创建 commit，最终消息返回 `base_sha`、`head_sha`、`commits[]`。没有 commit 的 `DONE` 无效，除非 `commit_policy = "no_change_allowed"` 且返回明确 `no_change_reason`。

### 0.6 ledger 进入 MVP

MVP 不再只做 report → review package → dual verdict。MVP 必须包含 `codex-team-ledger`，因为它是 SDD 对 Atlas 的核心增量：支持 compaction 后恢复、防止重复派发、防止漏审。

### 0.7 schema 改成“扁平 schema + 显式 validator 子集”

不引入 npm 依赖时，不使用需要完整 JSON Schema 引擎的 `$defs` / `$ref` / draft 2020-12 特性。方案中的 schema 文件作为文档与测试 fixture 来源；实际 gate 用无依赖 Node validator 实现以下子集：

- required keys
- primitive type check
- enum
- array item type
- simple regex pattern
- no unknown keys，可按合同开启
- cross-field rules，由显式 JS 函数实现

---

## 1. 设计目标

### 1.1 一句话目标

把 Atlas `team` 技能改造成：

```text
Codex native subagents + Superpowers SDD protocol + Atlas workflow artifacts + bounded loop + resumable ledger + no-dependency validators
```

最终形态不是更多角色，也不是更复杂的 prompt，而是一个 **main Codex/controller 主导的、文件化输入、消息化输出、机器校验、可恢复执行协议**。

### 1.2 成功标准

一次 Atlas team implementation run 应满足：

1. main Codex 是唯一 controller，负责任务拆片、artifact 写入、schema 校验、ledger、最终整合。
2. 每个 implementation slice 都有独立 brief、base/head commit 范围、review package、review verdict、ledger events。
3. implementer/fixer 可以修改 repo，但必须 commit；reviewer/verifier 默认 read-only，只返回最终 JSON，不写文件。
4. Critical / Important findings 必须修复并重审；fix loop 有明确上限。
5. compaction 或中断后可从 ledger 恢复，不依赖主会话记忆。
6. 所有 `$WORKFLOW_ROOT`、repo path、state path、agents path 都可配置，无私有绝对路径默认值。
7. schema gate 不依赖 npm install。
8. Codex native 工具不可用时停止，不静默退回 shell-managed lanes。

---

## 2. 事实基础与迁移边界

### 2.1 Superpowers SDD 可直接吸收的机制

Superpowers SDD 的核心机制适合迁移：

- fresh implementer per task
- task brief 文件化
- implementer report
- review package diff 文件化
- reviewer 一次输出 spec compliance 与 task quality 双 verdict
- 禁止 controller 诱导 reviewer 忽略问题或提前定性 severity
- `NEEDS_CONTEXT` / `BLOCKED` 状态分支
- 不能用 `HEAD~1` 代替 task base
- progress ledger 用于恢复
- 最终 whole-branch review
- continuous execution：除 blocker / 真歧义 / 完成外，不在任务之间停下来询问

### 2.2 不直接照搬的机制

| Superpowers 原机制 | Atlas 修订策略 | 原因 |
| --- | --- | --- |
| `.superpowers/sdd/` scratch dir | 使用 `$WORKFLOW_ROOT/artifacts/<task-id>/team/sdd/` | Atlas 已有 workflow artifact tree；避免 repo-local scratch 和 `git clean -fdx` 风险 |
| implementer 写 report file | implementer 最终消息返回 JSON，controller 写 report | artifact dir 可能在 workspace 外；权限不稳定 |
| reviewer 最终文本报告 | reviewer 最终消息返回结构化 JSON + Markdown summary，controller 写 verdict | 保留 read-only reviewer，不要求写文件 |
| 无限 fix loop | bounded loop，默认最多 2 次 fix | 与 Atlas team bounded loop 哲学一致 |
| `review-package BASE HEAD [OUTFILE]` | `codex-team-review-package --repo/-C --task --slice` | 避免 cwd / allowlist 摩擦 |
| skill prompt 主导约束 | prompt + helper + validator + CI | Atlas 需要机器可验证协议 |

### 2.3 Atlas 现有机制应保留

保留并扩展：

- `atlas-workflow:team` native-only gate。
- `$WORKFLOW_ROOT/artifacts/<task-id>/team/` artifact contract。
- `team-record-start` / `team-record-finalize` / `team-status`。
- `staffing.md` 的 Agent Plan、Active/Omitted Roles、Phase Gates、Commit Boundaries、Concurrency And Write Boundaries、Verification Evidence。
- Native Bounded Loop 的 `max_iterations`、`max_time`、verification gate、terminal status。
- Multica router 作为 phase/join/failure/blocker/clean-gate 的确定性路由器，而不是 LLM reviewer。
- scorecards 与 evidence manifest，但需要 schema 化。

---

## 3. 推荐架构

### 3.1 分层

```text
User / PRD / Sprint Contract
        ↓
Multica SDLC planner/router
        ↓
Atlas team controller: main Codex
        ↓
SDD slice protocol
        ↓
Codex native subagents
  - implementer / fixer: workspace-write, commit required
  - reviewer: read-only, dual verdict JSON in final message
  - verifier: read-only or test-only, result JSON in final message
  - explorer: read-only evidence gathering
        ↓
Controller validators + workflow artifacts + ledger
        ↓
Final whole-branch review + promotion/handoff
```

### 3.2 路径约定

所有 workflow artifacts 使用：

```text
$WORKFLOW_ROOT/artifacts/<task-id>/team/
```

`$WORKFLOW_ROOT` 解析顺序：

```text
1. CODEX_WORKFLOW_ROOT
2. ATLAS_WORKFLOW_ROOT
3. ~/.codex/workflow
```

SDD 子目录：

```text
$WORKFLOW_ROOT/artifacts/<task-id>/team/sdd/
  progress.jsonl
  progress.lock
  global-constraints.md
  slices/
    <slice-id>/
      brief.md
      brief.json
      answers.jsonl
      implementer-report.md
      implementer-report.json
      review-package.diff
      review-verdict.md
      review-verdict.json
      fix-1-report.md
      fix-1-report.json
      re-review-1-package.diff
      re-review-1-verdict.json
      verifier-result.json
      metadata.json
```

不得在 helper、prompt、测试中写死用户 home 绝对路径。文档也应使用 `$WORKFLOW_ROOT`、`$REPO_ROOT`、`$AGENTS_HOME`、`$MULTICA_STATE_HOME`。

### 3.3 Controller 是唯一 artifact writer

主 Codex/controller 的职责：

1. 创建 brief files。
2. spawn native subagent。
3. wait/close subagent。
4. 从 final message 提取 JSON。
5. 校验 JSON。
6. 写入 report/verdict/ledger。
7. 生成 review package。
8. 决定 fix / re-review / blocked / complete。
9. 维护 `team-record-*`。
10. 最终 whole-branch review 与用户总结。

Subagent 的职责：

| 类型 | 可写 repo | 可写 artifacts | 输出方式 |
| --- | --- | --- | --- |
| implementer | 是，受 path lease / commit policy 限制 | 否 | final message JSON |
| fixer | 是，受 findings + path lease 限制 | 否 | final message JSON |
| reviewer | 否 | 否 | final message JSON |
| verifier | 默认否；必要时只运行测试 | 否 | final message JSON |
| explorer | 否 | 否 | final message JSON |

---

## 4. Codex native agent 设计

### 4.1 只定义 archetype，不膨胀业务角色

建议只新增 4 个项目级 custom agents：

```text
.codex/agents/atlas-sdd-implementer.toml
.codex/agents/atlas-sdd-reviewer.toml
.codex/agents/atlas-sdd-verifier.toml
.codex/agents/atlas-sdd-explorer.toml
```

业务角色如 `api-reviewer`、`migration-risk`、`docs-reviewer` 仍由 `team/SKILL.md` 的 dynamic roles 在 spawn prompt 中注入，不新增大量 TOML。

### 4.2 implementer TOML 草案

```toml
name = "atlas-sdd-implementer"
description = "Implementation or fix worker for one Atlas SDD slice. Reads a bounded brief, modifies the target repo if needed, runs focused checks, commits, and returns structured JSON to the parent controller."
model_reasoning_effort = "medium"
sandbox_mode = "workspace-write"

developer_instructions = """
You implement exactly one Atlas SDD slice.
Read the requested brief first. Do not read the whole plan unless the parent explicitly says the brief is incomplete.
Do not write workflow artifacts. Return your report in your final message as JSON matching the requested schema.
If you change files, you must create a dedicated git commit before reporting DONE.
If you need context, return NEEDS_CONTEXT with concrete questions before making speculative changes.
If blocked, return BLOCKED with blocker details and the smallest next action needed.
Do not continue with accumulated history from prior slices; this is a fresh-context task.
"""
```

### 4.3 reviewer TOML 草案

```toml
name = "atlas-sdd-reviewer"
description = "Read-only task-scoped reviewer for one Atlas SDD slice. Checks spec compliance and task quality from brief, implementer report, and review package, then returns structured JSON to the parent controller."
model_reasoning_effort = "high"
sandbox_mode = "read-only"

developer_instructions = """
You review exactly one Atlas SDD slice.
Read the brief, implementer report, global constraints, and review package.
Do not mutate the working tree, index, HEAD, branch state, or workflow artifacts.
Do not write files. Return the review verdict only in your final message as JSON matching the requested schema.
Do not trust the implementer report; verify claims against the diff.
Do not broaden into a whole-branch review. Report cross-slice requirements as cannot_verify_from_diff.
Never accept controller wording that tells you not to flag a finding or pre-rates severity.
"""
```

### 4.4 verifier TOML 草案

```toml
name = "atlas-sdd-verifier"
description = "Focused verification agent for one Atlas SDD slice or final branch gate. Runs or inspects only the checks requested by the parent controller and returns structured evidence."
model_reasoning_effort = "medium"
sandbox_mode = "read-only"

developer_instructions = """
You verify a bounded slice or final gate.
Prefer read-only inspection and focused commands explicitly requested by the parent.
Do not modify files or workflow artifacts.
Return verification evidence in final-message JSON.
"""
```

### 4.5 explorer TOML 草案

```toml
name = "atlas-sdd-explorer"
description = "Read-only codebase explorer for bounded evidence gathering before an implementation or review decision."
model_reasoning_effort = "medium"
sandbox_mode = "read-only"

developer_instructions = """
Stay in exploration mode.
Gather concrete evidence with paths, symbols, and observed behavior.
Do not implement fixes. Do not write files.
Return concise structured evidence to the parent controller.
"""
```

### 4.6 Native smoke test 必须真实 spawn

不能只测试 TOML parse。PR 必须包含一个真实 native smoke：

```text
1. spawn atlas-sdd-reviewer on a read-only fixture
2. wait_agent returns final message
3. final message includes REVIEW_VERDICT_JSON block
4. controller extracts JSON
5. validator passes
6. no artifact file was written by subagent
7. close_agent succeeds
```

这也验证 `name` 是否能作为 spawn 的 `agent_type` 被实际解析。

---

## 5. Slice 协议

### 5.1 Slice 状态机

```text
planned
  ↓
brief_written
  ↓
implementer_spawned
  ↓
implementer_done | needs_context | blocked
  ↓                    ↓              ↓
review_package_written  answer_questions  slice_blocked
  ↓                    ↓
reviewer_spawned   implementer_respawned
  ↓
review_clean | review_failed | cannot_verify_items
  ↓              ↓
slice_complete  fixer_spawned
                   ↓
                fixer_done
                   ↓
                re_review_package_written
                   ↓
                reviewer_spawned
```

Terminal states：

```text
slice_complete
slice_blocked
slice_superseded
slice_abandoned
```

### 5.2 `brief.json` 最小字段

```json
{
  "schema_version": 1,
  "task_id": "T-123",
  "slice_id": "slice-001",
  "repo": "/abs/path/to/worktree",
  "base_sha": "abcdef1",
  "objective": "Implement acceptance row A1",
  "requirements_path": "brief.md",
  "global_constraints_path": "../../global-constraints.md",
  "owned_paths": ["src/auth/**", "tests/auth/**"],
  "forbidden_paths": ["src/billing/**"],
  "acceptance_refs": ["SC-A1", "SC-A2"],
  "required_checks": ["pytest tests/auth/test_login.py"],
  "commit_policy": "required_for_file_changes",
  "max_question_rounds": 2,
  "max_fix_iterations": 2,
  "max_time_minutes": 30,
  "output_contract": "final_message_json_only"
}
```

Validator rules：

- `task_id`、`slice_id`、`repo`、`base_sha`、`objective` 必填。
- `repo` 必须是绝对路径且存在。
- `base_sha` 必须能在 `repo` 中 `git rev-parse --verify`。
- `owned_paths` 和 `forbidden_paths` 是数组。
- `commit_policy` enum：`required_for_file_changes`、`required_always`、`no_change_allowed`。
- `max_fix_iterations`、`max_question_rounds` 是正整数，默认 2。

### 5.3 Implementer final message contract

Subagent 最终消息必须包含一个 fenced JSON block：

````markdown
IMPLEMENTER_REPORT_JSON
```json
{
  "schema_version": 1,
  "status": "DONE",
  "task_id": "T-123",
  "slice_id": "slice-001",
  "base_sha": "abcdef1",
  "head_sha": "1234567",
  "commits": ["1234567"],
  "changed_files": ["src/auth/login.py", "tests/auth/test_login.py"],
  "checks": [
    {
      "command": "pytest tests/auth/test_login.py",
      "status": "passed",
      "summary": "12 passed"
    }
  ],
  "self_review": "No known issues after focused review.",
  "concerns": [],
  "questions": [],
  "blockers": [],
  "no_change_reason": null
}
```
````

Status enum：

```text
DONE
DONE_WITH_CONCERNS
NEEDS_CONTEXT
BLOCKED
```

Validation：

- `DONE` / `DONE_WITH_CONCERNS` 且 `changed_files.length > 0` 时，`head_sha` 和 `commits[]` 必须非空。
- `head_sha` 必须包含 `base_sha..head_sha` 的 commit。
- `commit_policy = required_always` 时，即使没有 changed files 也必须有 commit 或返回 `BLOCKED`。
- `NEEDS_CONTEXT` 必须有 `questions[]`。
- `BLOCKED` 必须有 `blockers[]`。
- `changed_files` 必须落在 path lease 允许范围内。

### 5.4 Reviewer final message contract

````markdown
REVIEW_VERDICT_JSON
```json
{
  "schema_version": 1,
  "task_id": "T-123",
  "slice_id": "slice-001",
  "base_sha": "abcdef1",
  "head_sha": "1234567",
  "spec_compliance": "pass",
  "task_quality": "pass",
  "issues": [],
  "cannot_verify_from_diff": [],
  "strengths": ["Focused change with direct test coverage."],
  "reviewed_inputs": {
    "brief": "brief.md",
    "implementer_report": "implementer-report.json",
    "review_package": "review-package.diff"
  }
}
```
````

`spec_compliance` enum：

```text
pass
fail
cannot_verify
```

`task_quality` enum：

```text
pass
fail
```

Issue shape：

```json
{
  "severity": "Important",
  "category": "spec_missing",
  "path": "src/auth/login.py",
  "line": 42,
  "evidence": "The new login branch never checks disabled users.",
  "required_fix": "Reject disabled users before creating a session."
}
```

Severity enum：

```text
Critical
Important
Minor
```

Rules：

- Any Critical or Important issue blocks `slice_complete`.
- Any `spec_compliance = fail` blocks even if issue severity is Minor.
- `cannot_verify_from_diff[]` does not automatically block, but controller must resolve it before completion.
- Reviewer cannot use design rationale in implementer report to downgrade severity.
- Reviewer prompt cannot contain phrases that pre-judge severity or suppress findings.

### 5.5 Questions loop

When implementer returns `NEEDS_CONTEXT`:

1. Controller writes ledger event `needs_context` with the exact questions.
2. Controller answers all questions in `answers.jsonl`.
3. Controller re-spawns implementer with the same `brief.md/json` plus `answers.jsonl`.
4. No accumulated prior-task summary is pasted.
5. If question rounds exceed `max_question_rounds`, write `slice_blocked` with reason `question_loop_exhausted`.

`answers.jsonl` example：

```jsonl
{"round":1,"question":"Should disabled users be rejected before or after password verification?","answer":"Before session creation, after password verification, to avoid leaking account status."}
```

### 5.6 Fresh context discipline

Every implementer/fixer/reviewer spawn receives only:

- one-line scene setting;
- `brief.md/json` path;
- `global-constraints.md` path;
- previous interface decisions needed by this slice only;
- `answers.jsonl` path if applicable;
- exact output JSON contract;
- model / reasoning / sandbox selection.

Never paste accumulated “state after slices 1-N” histories. If a prior slice created a real interface dependency, put that dependency into `global-constraints.md` or a bounded `interfaces.md`, then pass the file path.

### 5.7 Continuous execution

When the user asks Atlas team to execute a plan, controller should not stop between slices to ask “是否继续”。Stop only when:

- `BLOCKED` cannot be resolved;
- real ambiguity prevents safe execution;
- fix/question loop is exhausted;
- all slices complete;
- user explicitly requested human checkpoints.

---

## 6. Helper scripts

### 6.1 `codex-team-workspace`

Purpose：resolve and create task/slice artifact directories.

```bash
codex-team-workspace --task <task-id> [--slice <slice-id>] [--print sdd|slice|team|root]
```

Rules：

- Resolve `$WORKFLOW_ROOT` via env order.
- Create required directories.
- Refuse to resolve outside `$WORKFLOW_ROOT/artifacts/<task-id>`.
- Print absolute path.
- No repo mutation.

### 6.2 `codex-team-brief`

Purpose：create `brief.md` and `brief.json` from Sprint Contract / plan / acceptance row.

```bash
codex-team-brief \
  --task <task-id> \
  --slice <slice-id> \
  --repo /abs/path/to/worktree \
  --base <base-sha> \
  --contract workflow/artifacts/<task-id>/sprint-contract.md \
  --acceptance SC-A1,SC-A2 \
  --owned 'src/auth/**' \
  --check 'pytest tests/auth/test_login.py'
```

Outputs：

```text
.../slices/<slice-id>/brief.md
.../slices/<slice-id>/brief.json
```

### 6.3 `codex-team-review-package`

Purpose：generate commit list + diff stat + `git diff -U10` for `base..head`.

```bash
codex-team-review-package \
  --repo /abs/path/to/worktree \
  --base <base-sha> \
  --head <head-sha> \
  --task <task-id> \
  --slice <slice-id> \
  [--out <path>]
```

Rules：

- `--repo` or `-C` required unless current cwd is explicitly confirmed target repo.
- `--out` default is slice artifact dir.
- If `--out` is provided, it must resolve under `$WORKFLOW_ROOT/artifacts/<task-id>/team/sdd/slices/<slice-id>/`.
- Reject `HEAD~1` unless user explicitly passes `--allow-head-parent` for a test fixture. Production path must use recorded `base_sha`.
- Validate both SHAs exist in repo.
- Validate `base..head` has at least one commit when commit policy requires commit.
- Generate:

```markdown
# Review package: <base>..<head>

## Commits
...

## Files changed
...

## Diff
...
```

### 6.4 `codex-team-ledger`

Purpose：append-only durable JSONL state.

```bash
codex-team-ledger --task <task-id> append --event slice_started --json '<json>'
codex-team-ledger --task <task-id> status
codex-team-ledger --task <task-id> next-slice
codex-team-ledger --task <task-id> verify
```

Implementation：

- Node stdlib。
- Use lock file or atomic append strategy。
- Validate event shape before append。
- `status` rebuilds current state by replaying JSONL。
- `next-slice` returns first planned slice not terminal。

Event enum：

```text
run_started
preflight_clean
preflight_conflict
slice_planned
slice_started
brief_written
path_lease_acquired
implementer_spawned
implementer_done
needs_context
context_answered
implementer_blocked
review_package_written
reviewer_spawned
review_clean
review_failed
cannot_verify_recorded
fix_started
fix_done
re_review_started
slice_complete
slice_blocked
slice_superseded
final_review_started
final_review_clean
final_review_failed
escalated_human
run_complete
run_failed
```

### 6.5 `codex-team-artifact-lint`

Purpose：validate all artifacts for a task.

```bash
codex-team-artifact-lint --task <task-id> [--slice <slice-id>] [--strict]
```

Checks：

- required files exist for current state;
- JSON contracts validate;
- ledger references existing artifact files;
- report/verdict files were written by controller after subagent final message, not by reviewer;
- `backend: native` metadata exists in team round artifacts;
- no placeholder-only artifacts;
- `review-package.diff` exists before reviewer verdict;
- Critical/Important issues are not marked complete without fix/re-review;
- `cannot_verify_from_diff` items have controller resolution before completion.

### 6.6 `codex-team-validate-json`

Purpose：no-dependency validator entrypoint.

```bash
codex-team-validate-json --type implementer-report --file implementer-report.json
codex-team-validate-json --type review-verdict --file review-verdict.json
codex-team-validate-json --type ledger-event --stdin
```

Use explicit JS validators rather than full JSON Schema engine.

### 6.7 `codex-team-path-lease`

Purpose：machine-checkable write-scope ownership.

```bash
codex-team-path-lease --task <task-id> --slice <slice-id> acquire --paths 'src/auth/**,tests/auth/**'
codex-team-path-lease --task <task-id> --slice <slice-id> release
codex-team-path-lease --task <task-id> check --paths 'src/auth/login.py'
```

Implementation language：Node stdlib，不用 bash glob。原因：`src/**` vs `src/auth/**` 这种父子 overlap 在 shell 中容易误判。

Overlap rules：

- Normalize to POSIX-style relative paths。
- Reject absolute paths。
- Reject `..` escape。
- Treat exact same path as overlap。
- Treat parent directory glob as overlapping child glob。
- Treat `**` as recursive wildcard。
- If unsure，fail closed and require controller to narrow lease。

---

## 7. `team/SKILL.md` 修订草案

建议不是重写整个 `team/SKILL.md`，而是在 Native Implementation / Native Bounded Loop 附近新增一节：

```markdown
## Codex-native SDD Slice Protocol

Use this protocol for implementation mode when the task has a plan, Sprint Contract, or acceptance rows that can be split into mostly independent slices.

### Controller responsibilities

The main Codex is the only workflow artifact writer. Subagents read bounded files and return structured JSON in their final messages. The controller validates JSON, writes reports/verdicts, updates the ledger, and decides the next state.

### Fresh context

Each implementation slice uses a fresh subagent. Do not paste accumulated history from earlier slices. Give the subagent only the brief path, global constraints path, required interfaces for this slice, answers from the questions loop, and the JSON output contract.

### Required per-slice flow

1. Resolve `$WORKFLOW_ROOT` and task artifact directory.
2. Read existing SDD ledger; skip terminal slices.
3. Create or update `staffing.md` with Agent Plan, Commit Boundaries, Concurrency And Write Boundaries, and Verification Evidence.
4. Write `brief.md` and `brief.json` for one slice.
5. Acquire path lease for writable implementation work.
6. Record `base_sha` before spawning implementer.
7. Spawn `atlas-sdd-implementer` or `worker` with explicit model/reasoning/sandbox.
8. If status is `NEEDS_CONTEXT`, answer all questions, write `answers.jsonl`, and respawn. Stop after `max_question_rounds`.
9. If status is `BLOCKED`, classify blocker and either adjust context/model/slice size or escalate.
10. If files changed, require a dedicated commit and validate returned `head_sha`.
11. Generate review package with `codex-team-review-package --repo --base --head --task --slice`.
12. Spawn read-only `atlas-sdd-reviewer` with brief/report/diff paths.
13. Validate reviewer JSON. Critical/Important or spec fail requires fix.
14. Run fix loop with `max_fix_iterations`; each fix must commit and re-review.
15. Resolve `cannot_verify_from_diff` items before completion.
16. Append `slice_complete` only after spec and quality pass.
17. Continue to next slice without asking the user unless blocked, ambiguous, loop-exhausted, or all slices are complete.
18. After all slices, run final whole-branch review from merge base to HEAD.

### Reviewer prompt safety

Never tell a reviewer not to flag an issue. Never pre-rate severity. Never include wording equivalent to "do not flag", "at most Minor", or "the plan chose". If a finding conflicts with the plan text, record the conflict and escalate rather than dismissing the finding.

### Bounded loop

Every SDD slice inherits Atlas bounded loop discipline: `max_fix_iterations`, `max_time`, and explicit verification gates. Exhaustion records `slice_blocked` and `escalated_human` ledger events.
```

---

## 8. Prompt templates

### 8.1 Implementer prompt template

```text
You are implementing one Atlas SDD slice.

Scene: <one sentence explaining where this slice fits>.

Read first:
- Brief JSON: <brief.json>
- Brief Markdown: <brief.md>
- Global constraints: <global-constraints.md>
- Answers, if present: <answers.jsonl>

Repo:
- Target repo/worktree: <repo>
- Base SHA recorded before your work: <base_sha>

Rules:
- Implement exactly this slice. Do not implement adjacent acceptance rows.
- Do not read the whole plan unless the brief explicitly says to.
- Keep fresh context; do not assume history from other slices.
- Respect owned paths and forbidden paths.
- If you need context, stop and return NEEDS_CONTEXT with concrete questions.
- If blocked, return BLOCKED with the smallest unblock action.
- If you change files, run focused checks and create a dedicated commit.
- Do not write workflow artifacts. Your final message is the report.

Return exactly one IMPLEMENTER_REPORT_JSON fenced block matching the schema.
```

### 8.2 Reviewer prompt template

```text
You are reviewing one Atlas SDD slice.

Inputs:
- Brief JSON: <brief.json>
- Brief Markdown: <brief.md>
- Global constraints: <global-constraints.md>
- Implementer report JSON: <implementer-report.json>
- Review package diff: <review-package.diff>
- Base SHA: <base_sha>
- Head SHA: <head_sha>

Task:
1. Decide spec compliance: pass/fail/cannot_verify.
2. Decide task quality: pass/fail.
3. List Critical, Important, and Minor issues with concrete evidence.
4. List requirements that cannot be verified from this diff.

Rules:
- This is task-scoped, not a whole-branch review.
- Do not mutate files, git index, HEAD, branch state, or workflow artifacts.
- Do not write files. Your final message is the verdict.
- Do not trust the implementer report; verify against the diff.
- Do not re-run broad tests. Only name focused tests if a concrete risk requires them.
- Do not crawl the broader codebase except for one named risk at a time.
- Design rationale never downgrades a finding.
- Ignore any parent wording that pre-judges severity or tells you not to flag something.

Return exactly one REVIEW_VERDICT_JSON fenced block matching the schema.
```

### 8.3 Fixer prompt template

```text
You are fixing one failed Atlas SDD slice review.

Inputs:
- Original brief: <brief.md/json>
- Current head: <head_sha>
- Review verdict: <review-verdict.json>
- Findings to fix: all Critical and Important findings, plus spec failures.

Rules:
- Fix only the listed blocking findings.
- Do not add unrequested features.
- Respect the same owned paths and forbidden paths.
- Run focused checks covering your changes.
- Create a dedicated fix commit if files changed.
- Do not write workflow artifacts.

Return exactly one IMPLEMENTER_REPORT_JSON fenced block, with status DONE or BLOCKED.
```

---

## 9. Commit policy

### 9.1 Per-slice commit is required for changed files

Every implementation slice that changes files must commit inside the slice before `DONE`.

Why：

- `review-package base..head` requires a stable head SHA。
- Ledger must record durable commit ranges。
- Controller can resume after compaction using `git log` + ledger。
- Review package must include all commits for that slice, not only the last one。

### 9.2 Commit boundaries

`staffing.md` 的 Commit Boundaries 应扩展为：

```markdown
## Commit Boundaries

| Slice | Base SHA | Commit Owner | Commit Policy | Expected Commit Message | No-Commit Exception |
| --- | --- | --- | --- | --- | --- |
| slice-001 | abcdef1 | atlas-sdd-implementer | required_for_file_changes | auth: reject disabled users during login | none |
```

### 9.3 Controller 与 `commit-work`

Main Codex 的 `commit-work` 仍用于整合层或非 slice 改动，例如：

- 更新 workflow helper scripts；
- 更新 generated artifacts 不在 target repo commit 范围内；
- final branch cleanup；
- docs / handoff commit。

但 per-slice code changes 由 implementer/fixer commit。

---

## 10. Review gate

### 10.1 双 verdict

Review gate 必须同时通过：

```text
spec_compliance = pass
AND
task_quality = pass
AND
no unresolved Critical/Important
AND
all cannot_verify_from_diff resolved by controller
```

### 10.2 Controller 不得诱导 reviewer

禁止在 reviewer prompt 中出现以下语义：

```text
do not flag ...
don't treat ... as defect
at most Minor
the plan chose ...
ignore ...
```

如果 controller 认为 reviewer 可能误判，也不能预先压制；应让 reviewer 输出 finding，然后在 ledger 中记录 adjudication 或升级 human。

### 10.3 cannot_verify_from_diff 的处理

Reviewer 不能为了验证跨 slice 需求而漫游全仓。它可以返回：

```json
{
  "requirement": "All auth entrypoints must reject disabled users.",
  "reason": "The diff modifies login only; signup and token refresh are unchanged code paths."
}
```

Controller 必须在 completion 前做一项：

- 用 explorer/verifier 做 focused check；
- 查明该 requirement 属于后续 slice 并记录 dependency；
- 判定为真实 gap，派 fix；
- 升级 human。

---

## 11. Bounded fix loop

### 11.1 默认上限

```json
{
  "max_fix_iterations": 2,
  "max_question_rounds": 2,
  "max_time_minutes": 30
}
```

### 11.2 Loop ledger

每次 fix loop 写事件：

```jsonl
{"event":"fix_started","task_id":"T-123","slice_id":"slice-001","iteration":1,"findings":["I-1","I-2"]}
{"event":"fix_done","task_id":"T-123","slice_id":"slice-001","iteration":1,"head_sha":"fedcba9"}
{"event":"re_review_started","task_id":"T-123","slice_id":"slice-001","iteration":1}
{"event":"review_clean","task_id":"T-123","slice_id":"slice-001","iteration":1}
```

Exhausted：

```jsonl
{"event":"slice_blocked","task_id":"T-123","slice_id":"slice-001","reason":"fix_loop_exhausted","max_fix_iterations":2}
{"event":"escalated_human","task_id":"T-123","slice_id":"slice-001","reason":"blocking findings remain after bounded loop"}
```

### 11.3 Same subagent vs new fixer

Codex native team 可以 spawn 新 fixer，也可以继续 steer 原 implementer thread；推荐默认 **new fixer subagent**，原因：

- fresh context；
- fix prompt 只包含 blocking findings；
- 避免 implementer 自我辩护影响修复。

但必须 close 已完成 subagent threads，避免 thread 泄漏。

---

## 12. Schema 与 validator 策略

### 12.1 文件结构

```text
plugins/atlas-workflow/contracts/team-sdd/
  brief.schema.json
  implementer-report.schema.json
  review-verdict.schema.json
  ledger-event.schema.json
  path-lease.schema.json
  validators/
    brief.js
    implementer-report.js
    review-verdict.js
    ledger-event.js
    path-lease.js
    common.js
```

### 12.2 Schema 文件是文档，不是完整 JSON Schema 引擎输入

允许字段：

```json
{
  "type": "object",
  "required": ["schema_version", "status"],
  "properties": {
    "status": {"type": "string", "enum": ["DONE", "DONE_WITH_CONCERNS", "NEEDS_CONTEXT", "BLOCKED"]}
  },
  "additionalProperties": false
}
```

不使用：

```json
{"$defs": {}, "$ref": "#/..."}
```

Cross-field rules 写 JS：

```js
if ((status === 'DONE' || status === 'DONE_WITH_CONCERNS') && changedFiles.length > 0 && commits.length === 0) {
  error('commits required when changed_files is non-empty');
}
```

### 12.3 Negative fixtures

```text
test/fixtures/team-sdd/invalid/
  reviewer-writes-file.md
  done-without-commit.json
  critical-marked-complete.jsonl
  head-parent-review-package.json
  path-lease-overlap-parent-child.json
  needs-context-without-questions.json
  blocked-without-blockers.json
  schema-ref-not-supported.json
```

---

## 13. Path lease

### 13.1 为什么需要

Atlas `team/SKILL.md` 已要求 writable workers 只能在 disjoint write sets 中并行。为了把 Markdown 约束变成机器 gate，需要 path lease。

### 13.2 默认策略

- Implementation slices 默认串行，不并行写。
- Read-only exploration/review/verifier 可以并行。
- 只有在 Sprint Contract 明确拆出不重叠 paths 时，才允许多个 writable workers 并行。
- Any overlap → fail closed。

### 13.3 Lease 文件

```json
{
  "schema_version": 1,
  "task_id": "T-123",
  "leases": [
    {
      "slice_id": "slice-001",
      "owner": "atlas-sdd-implementer",
      "paths": ["src/auth/**", "tests/auth/**"],
      "state": "active",
      "created_at": "2026-07-05T00:00:00Z"
    }
  ]
}
```

---

## 14. Multica 集成

### 14.1 Multica router 不做 LLM review

保持分工：

| 层 | 职责 |
| --- | --- |
| Multica Leader / Planner | PRD 分解、Sprint Contract、role staffing、acceptance rows |
| Multica Router | phase/join/failure/blocker/repair/clean gate 的确定性路由 |
| Atlas Team Controller | Codex native subagent orchestration、SDD slice execution、artifact writing、ledger |
| SDD Reviewer | 单 slice spec + quality gate |
| Final Reviewer | whole-branch review |

### 14.2 Sprint Contract → SDD slices

Sprint Contract 每个 acceptance row 编译为一个或多个 `brief.json`：

```text
Sprint Contract Row
  → slice objective
  → owned_paths
  → required_checks
  → acceptance_refs
  → runtime target
  → evidence requirements
  → commit policy
```

### 14.3 Multica guard 的位置

`multica-sdlc-guard-subagent` 是 external supervisor/guard，不属于 Codex native team subagent path。修订策略：

- 保留 `codex exec --sandbox read-only` 的 external guard 模式。
- 去掉私有 cwd 默认值；改为 required env 或 repo auto-discovery。
- degraded mode 必须记录 `degraded_reason` 和 `recommended_action`。
- guard 输出 JSON 也走 validator。
- guard 不写 PR、不写 workflow artifacts，除非 parent supervisor 明确接收并落盘。

---

## 15. Scorecard 与 evidence

### 15.1 Scorecard 事件

每个 subagent 最终消息被 controller 解析后，追加 scorecard JSONL：

```json
{
  "schema_version": 1,
  "task_id": "T-123",
  "slice_id": "slice-001",
  "agent_role": "reviewer",
  "agent_type": "atlas-sdd-reviewer",
  "model": "<model>",
  "status": "completed",
  "verdict": "review_failed",
  "blocking_issues": 2,
  "tokens_known": false,
  "latency_ms_known": false,
  "artifact": "team/sdd/slices/slice-001/review-verdict.json"
}
```

### 15.2 Evidence manifest

每个 slice 自动生成 evidence manifest：

```json
{
  "schema_version": 1,
  "task_id": "T-123",
  "slice_id": "slice-001",
  "brief": "brief.md",
  "report": "implementer-report.json",
  "review_package": "review-package.diff",
  "review_verdict": "review-verdict.json",
  "commits": ["1234567"],
  "checks": ["pytest tests/auth/test_login.py"],
  "ledger_events": [10, 11, 12, 13]
}
```

---

## 16. CI / 测试矩阵

### 16.1 Unit tests

| Test | 验证 |
| --- | --- |
| `codex-team-workspace.test.js` | `$WORKFLOW_ROOT` 解析、目录创建、path escape 拒绝 |
| `review-package.test.sh` | `--repo`、bad sha、multi-commit range、output dir gate |
| `ledger.test.js` | append/replay/next-slice/terminal state |
| `validators.test.js` | valid/invalid JSON contracts |
| `path-lease.test.js` | exact overlap、parent/child glob overlap、escape path |
| `artifact-lint.test.js` | missing verdict、critical unresolved、placeholder artifact |
| `private-path-audit.test.js` | runtime/instructions 私有路径 fail，allowlist 生效 |

### 16.2 Integration tests

| Test | 验证 |
| --- | --- |
| `team-sdd-mvp.fixture` | slice brief → implementer JSON → commit → review package → reviewer JSON → ledger complete |
| `reviewer-read-only-no-write.fixture` | reviewer 不写 artifact，controller 写 verdict |
| `needs-context.fixture` | questions loop、answers.jsonl、respawn |
| `fix-loop-exhausted.fixture` | 两次 fix 后 blocked + escalated_human |
| `cannot-verify.fixture` | controller resolution required before complete |
| `multi-commit-slice.fixture` | review package 包含多个 commits，禁止 `HEAD~1` 截断 |
| `native-agent-smoke.fixture` | custom agent name 可 spawn，wait/close 正常 |

### 16.3 Manual smoke

在真实 Codex native 环境中：

```text
1. 创建一个小型 fixture repo。
2. 启动 atlas-workflow:team implementation mode。
3. 生成 1 个 slice。
4. spawn atlas-sdd-implementer。
5. implementer 修改文件、测试、commit、返回 JSON。
6. controller 写 report。
7. review package 生成。
8. spawn atlas-sdd-reviewer read-only。
9. reviewer 返回 JSON，不写文件。
10. controller 写 verdict + ledger。
11. team-record-finalize 显示 backend: native。
```

---

## 17. PR 拆分路线图

### PR 0：路径与配置治理

Scope：

- 新增 `audit-private-paths.js`。
- 清理 runtime 与 live instructions 中的私有绝对路径。
- 为 guard、scorecard、workflow root、agents home 加 env/config 解析。
- 文档统一 placeholder。

Acceptance：

```bash
node plugins/atlas-workflow/scripts/audit-private-paths.js \
  --root . \
  --deny-private-home \
  --allow-list docs/audit/private-paths.allow.json \
  --fail-on runtime,instructions
```

### PR 1：workspace + ledger MVP

Scope：

- `codex-team-workspace`
- `codex-team-ledger`
- ledger validators
- replay/status/next-slice

Acceptance：

```bash
codex-team-ledger --task fixture append --event slice_started --json '{...}'
codex-team-ledger --task fixture status
codex-team-ledger --task fixture verify
```

### PR 2：message contracts + validators

Scope：

- implementer report contract
- review verdict contract
- brief contract
- no-dependency validators
- extraction from fenced final-message JSON

Acceptance：

```bash
codex-team-validate-json --type implementer-report --file valid.json
codex-team-validate-json --type review-verdict --file valid.json
! codex-team-validate-json --type implementer-report --file done-without-commit.json
```

### PR 3：review package helper with `--repo`

Scope：

- `codex-team-review-package --repo/-C`
- output path enforcement using `--task --slice`
- multi-commit fixture
- bad cwd fixture

Acceptance：

```bash
codex-team-review-package --repo "$FIXTURE_REPO" --base "$BASE" --head "$HEAD" --task T --slice S
```

No compound `cd ; helper` is needed.

### PR 4：team skill SDD section + prompt templates

Scope：

- Add Codex-native SDD section to `team/SKILL.md`。
- Add implementer/reviewer/fixer prompt templates。
- Specify questions loop、fresh context、continuous execution、bounded fix loop。

Acceptance：

- Native-only gate still intact。
- Existing contract tests pass。
- New text forbids reviewer writing artifacts。

### PR 5：custom agents + native smoke

Scope：

- `.codex/agents/atlas-sdd-*.toml`
- real spawn/wait/close smoke fixture
- verify custom `name` works as spawn target

Acceptance：

- reviewer smoke returns JSON final message。
- no write side effect by reviewer。
- close_agent invoked。

### PR 6：path lease

Scope：

- `codex-team-path-lease`
- Node glob overlap checker
- staffing.md integration

Acceptance：

- `src/**` conflicts with `src/auth/**`。
- disjoint paths pass。
- path escape fails。

### PR 7：artifact lint + CI gate

Scope：

- `codex-team-artifact-lint`
- CI task for fixture artifacts
- negative fixtures

Acceptance：

- unresolved Critical fails。
- missing review package fails。
- reviewer verdict written by controller passes。

### PR 8：Multica Sprint Contract compiler

Scope：

- contract rows → slice briefs
- acceptance refs
- evidence manifest
- router clean-gate integration

Acceptance：

- fixture Sprint Contract yields deterministic slices。
- router remains deterministic and does not perform LLM review。

### PR 9：scorecard analytics

Scope：

- scorecard JSONL schema
- append helper
- summary command by role/model/status

Acceptance：

- scorecards survive concurrent appends。
- summary command reports reviewer fail rates and fix loop counts。

---

## 18. MVP 范围

MVP 必须包含：

1. `$WORKFLOW_ROOT` path resolver。
2. `codex-team-ledger`。
3. `brief.json/md` minimal writer。
4. implementer final-message JSON contract + validator。
5. reviewer final-message JSON contract + validator。
6. `codex-team-review-package --repo --task --slice`。
7. controller writes report/verdict artifacts。
8. bounded fix loop default 2。
9. `NEEDS_CONTEXT` branch。
10. per-slice commit required for changed files。
11. final whole-branch review placeholder/gate。

Not in MVP：

- full Sprint Contract compiler；
- scorecard analytics；
- advanced path lease parallel writable workers；
- deep Multica router integration；
- complete private-path docs cleanup beyond runtime/instructions。

---

## 19. 风险与缓解

| 风险 | 后果 | 缓解 |
| --- | --- | --- |
| reviewer read-only 却要求写 verdict | 流程卡死 | subagent 最终消息返回 JSON，controller 写文件 |
| artifact dir 不在 workspace-write root | implementer report 写失败 | implementer/fixer 不写 artifacts |
| fix loop 无限 | 成本失控 | `max_fix_iterations` + ledger escalation |
| implementer 不 commit | 无法生成 base..head review package | commit policy 强制；validator 拒绝 DONE |
| cwd 指错 repo | diff 错、review 错 | helper 必须 `--repo`; 不依赖 cwd |
| schema 太复杂 | 无依赖 validator 返工 | 扁平 schema + explicit JS rules |
| 私有路径散落 live instructions | 他人机器不可用 | PR 0 全仓审计 + env/config 参数化 |
| business-role TOML 膨胀 | 维护困难 | 仅 4 archetype，业务角色动态注入 |
| parallel writes 冲突 | 合并冲突、覆盖代码 | 默认串行；path lease fail-closed |
| controller 诱导 reviewer | review 失效 | prompt lint + reviewer safety clause |
| compaction 后重复派发 | 重复成本、状态错乱 | ledger replay 是恢复源 |

---

## 20. 推荐最终工作流

```text
1. main Codex 进入 atlas-workflow:team。
2. Native tool gate：确认 spawn/wait/close 可用，否则停止。
3. Resolve $WORKFLOW_ROOT and task id。
4. Read context/spec/analysis/decision/Sprint Contract。
5. Preflight scan：计划冲突、review rubric 冲突、路径/权限风险。
6. Start team record backend:native。
7. Build Agent Plan and staffing.md。
8. Replay SDD ledger；跳过已完成 slice。
9. For each slice:
   a. create brief.md/json
   b. acquire path lease
   c. record base_sha
   d. spawn implementer with fresh context
   e. handle NEEDS_CONTEXT or BLOCKED
   f. validate commit/head_sha
   g. controller writes implementer report artifacts
   h. generate review package with --repo
   i. spawn read-only reviewer
   j. controller writes review verdict artifacts
   k. resolve cannot_verify_from_diff
   l. fix Critical/Important/spec failures with bounded loop
   m. append slice_complete
10. Release leases。
11. Generate final branch review package from merge-base..HEAD。
12. Spawn final reviewer / verifier as needed。
13. Finalize team record。
14. Update scorecards/evidence manifest。
15. Produce final user report in Chinese by default。
```

---

## 21. 结论

Atlas Forge 不需要简单复制 Superpowers SDD，也不应该继续扩大 subagent 角色数量。最稳的方向是：

```text
Superpowers 的 SDD 质量门思想
+
Atlas 的 workflow artifact tree 与 native-only team contract
+
Codex 原生 subagent 的 final-message 聚合模型
+
无依赖 validators / ledger / path lease
```

本修订版最重要的架构变化是：**subagent 不写 workflow artifacts；controller 写。** 这同时解决 read-only reviewer、artifact root 权限、schema 校验归属、compaction 恢复和审计链路问题。

落地优先级应是：

```text
PR 0 private path/config cleanup
→ PR 1 ledger/workspace
→ PR 2 message contracts/validators
→ PR 3 review-package --repo
→ PR 4 team skill SDD section
→ PR 5 native smoke
→ PR 6+ path lease / Multica compiler / scorecards
```

这样 Atlas 的 Codex native team 会从“多 agent 协作说明”升级为真正可执行、可恢复、可审计的 **Codex-native engineering protocol**。

---

## 22. 参考源

- Superpowers SDD skill: https://raw.githubusercontent.com/obra/superpowers/main/skills/subagent-driven-development/SKILL.md
- Superpowers task reviewer prompt: https://raw.githubusercontent.com/obra/superpowers/main/skills/subagent-driven-development/task-reviewer-prompt.md
- Superpowers review-package script: https://github.com/obra/superpowers/blob/main/skills/subagent-driven-development/scripts/review-package
- Atlas Forge team skill: https://github.com/taotaosihao/atlas-forge/blob/main/plugins/atlas-workflow/skills/team/SKILL.md
- Atlas Forge Multica guard script: https://github.com/taotaosihao/atlas-forge/blob/main/plugins/multica-sdlc/scripts/multica-sdlc-guard-subagent
- OpenAI Codex subagents docs: https://developers.openai.com/codex/subagents
- OpenAI Codex subagent concepts: https://developers.openai.com/codex/concepts/subagents
