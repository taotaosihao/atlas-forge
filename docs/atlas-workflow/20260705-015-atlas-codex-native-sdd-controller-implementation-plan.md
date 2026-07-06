# Atlas Codex-native SDD Controller 实施计划

- Task: `20260705-015-atlas-codex-native-sdd-controller-implementation-plan`
- 输入方案: `docs/atlas_forge_codex_native_team_superpowers_unbounded_fix_loop_plan.md`
- 目标: 将 Atlas `team` 从“能调度 native subagent”升级为可恢复、可审计、可验证的 Codex-native SDD controller。
- 本计划状态: 执行前规划；未改功能代码。

## 核心结论

新版方案以 `fix_loop_policy = "unbounded_until_clean_or_terminal"` 为准。后续实现不得恢复 `max_fix_iterations` 或 exhausted-by-iteration stop gate。无上限 fix loop 的安全性来自 ledger、每轮 commit、review package、review verdict、scorecard、artifact lint 和 `fix_progress_stalled` 证据终态，而不是固定次数上限。

同时必须保留 Atlas 现有 Native Bounded Loop。两者语义不同：

| 机制 | 使用场景 | 停止条件 |
| --- | --- | --- |
| Native Bounded Loop | 用户显式要求 bounded repair / babysitting / limited loop | `max_iterations`、`max_time`、done、blocker |
| SDD per-slice unbounded fix loop | implementation slice review failed 后持续修复 | review clean 或真实 terminal state，不用固定次数上限 |

## 实施原则

- Controller 是唯一 workflow artifact writer。
- Implementer / fixer 只改 target repo，写文件必须 commit。
- Reviewer / verifier 默认 read-only，只返回 final-message JSON。
- 所有 SDD artifact 位于 `$WORKFLOW_ROOT/artifacts/<task-id>/team/sdd/`。
- Helper、prompt、tests、live instructions 不得使用个人 home 绝对路径默认值。
- Validator 使用 Node stdlib，无 npm 依赖。
- 默认 writable slices 串行；并行写入必须等 path lease gate 完成。
- 每个非 tiny PR 都先写 lightweight implementation contract。

## 里程碑

| Milestone | 范围 | 完成标准 |
| --- | --- | --- |
| M0 规划锁定 | 本文档、workflow context/decision/spec | readiness 通过 |
| M1 MVP 数据平面 | PR0-PR3 | private path audit、workspace/ledger、contracts/validators、review-package 可用 |
| M2 Team 接入 | PR4-PR5 | `team/SKILL.md` SDD protocol、custom agents、native smoke |
| M3 Hardening | PR6-PR7 | path lease、artifact lint、CI fixture gate |
| M4 集成分析 | PR8-PR9 | Sprint Contract compiler、scorecard analytics |

## PR 0：路径与配置治理

Scope:

- 新增 `plugins/atlas-workflow/scripts/audit-private-paths.js`。
- 新增 `docs/audit/private-paths.allow.json`。
- 清理 runtime、live instructions、tests 中的私有绝对路径默认值。
- 对 docs / history 中的私有绝对路径做分类治理：能替换的统一 placeholder 化；必须保留的进入 allowlist 并写明 allow reason。
- 为 workflow root、agents home、Multica state、guard cwd 增加 env/config 解析。

主要文件:

- `plugins/atlas-workflow/scripts/audit-private-paths.js`
- `docs/audit/private-paths.allow.json`
- `plugins/atlas-workflow/skills/*.md`
- `plugins/multica-sdlc/scripts/*`
- `workflow/bin/codex-workflow`
- `workflow/tests/*`

依赖: 无。必须最先做。

验收命令:

```bash
node plugins/atlas-workflow/scripts/audit-private-paths.js \
  --root . \
  --deny-private-home \
  --allow-list docs/audit/private-paths.allow.json \
  --fail-on runtime,instructions
```

同时必须生成 docs/history 分类报告或 allowlist 记录，证明文档类私有路径不是被遗漏：

```bash
node plugins/atlas-workflow/scripts/audit-private-paths.js \
  --root . \
  --deny-private-home \
  --allow-list docs/audit/private-paths.allow.json \
  --report-only docs,history
```

后续可扩大到:

```bash
node plugins/atlas-workflow/scripts/audit-private-paths.js \
  --root . \
  --deny-private-home \
  --allow-list docs/audit/private-paths.allow.json \
  --fail-on runtime,instructions,tests
```

Stop condition:

- 审计脚本无法稳定分类 runtime / instructions / tests / docs。
- live instructions 仍依赖用户个人路径默认值。
- docs/history 中发现私有路径但既未 placeholder 化，也未进入 allowlist reason。

## PR 1：workspace + ledger MVP

Scope:

- 实现 `codex-team-workspace`。
- 实现 `codex-team-ledger` append/status/next-slice/verify。
- 实现 ledger event validator 的最小子集。
- 定义 SDD artifact root 与 slice directory layout。

主要文件:

- `plugins/atlas-workflow/scripts/codex-team-workspace`
- `plugins/atlas-workflow/scripts/codex-team-ledger`
- `plugins/atlas-workflow/contracts/team-sdd/ledger-event.schema.json`
- `plugins/atlas-workflow/contracts/team-sdd/validators/ledger-event.js`
- `workflow/tests/team-sdd-ledger.test.sh` 或等价 fixture test

依赖: PR0。

验收命令:

```bash
codex-team-workspace --task fixture --slice slice-001 --print slice
codex-team-ledger --task fixture append --event slice_started --json '{"task_id":"fixture","slice_id":"slice-001"}'
codex-team-ledger --task fixture status
codex-team-ledger --task fixture next-slice
codex-team-ledger --task fixture verify
```

Stop condition:

- ledger replay 不能从 JSONL 重建 terminal slice state。
- workspace resolver 允许 path escape 到 `$WORKFLOW_ROOT/artifacts/<task-id>` 之外。

## PR 2：message contracts + validators

Scope:

- 定义 `brief.json`、implementer report、review verdict contract。
- 实现 `codex-team-brief` minimal writer，支持从显式 plan / acceptance refs / owned paths / checks 生成 `brief.md` 与 `brief.json`；完整 Sprint Contract compiler 留到 PR8。
- 实现 final-message fenced JSON extraction。
- 实现 `codex-team-validate-json`。
- 增加 negative fixtures：done-without-commit、needs-context-without-questions、blocked-without-blockers、schema-ref-not-supported。

主要文件:

- `plugins/atlas-workflow/contracts/team-sdd/brief.schema.json`
- `plugins/atlas-workflow/contracts/team-sdd/implementer-report.schema.json`
- `plugins/atlas-workflow/contracts/team-sdd/review-verdict.schema.json`
- `plugins/atlas-workflow/contracts/team-sdd/validators/*.js`
- `plugins/atlas-workflow/scripts/codex-team-brief`
- `plugins/atlas-workflow/scripts/codex-team-validate-json`
- `workflow/tests/team-sdd-validators.test.sh`

依赖: PR1。

验收命令:

```bash
codex-team-brief \
  --task fixture \
  --slice slice-001 \
  --repo "$FIXTURE_REPO" \
  --base "$BASE" \
  --acceptance SC-A1 \
  --owned 'src/auth/**' \
  --check 'pytest tests/auth/test_login.py'
codex-team-validate-json --type brief --file "$WORKFLOW_ROOT/artifacts/fixture/team/sdd/slices/slice-001/brief.json"
codex-team-validate-json --type implementer-report --file test/fixtures/team-sdd/valid/implementer-report.json
codex-team-validate-json --type review-verdict --file test/fixtures/team-sdd/valid/review-verdict.json
! codex-team-validate-json --type implementer-report --file test/fixtures/team-sdd/invalid/done-without-commit.json
! codex-team-validate-json --type implementer-report --file test/fixtures/team-sdd/invalid/needs-context-without-questions.json
```

Stop condition:

- Validator 需要引入 npm package 才能实现。
- `codex-team-brief` 不能稳定写出最小 `brief.md/json`，导致 MVP 无法自动生成 slice brief。
- Cross-field rules 无法表达 commit policy、status、questions/blockers 等约束。

## PR 3：review package helper with `--repo`

Scope:

- 实现 `codex-team-review-package --repo/-C --base --head --task --slice`。
- 默认输出到 `$WORKFLOW_ROOT/artifacts/<task-id>/team/sdd/slices/<slice-id>/review-package.diff`。
- 禁止生产路径用 `HEAD~1` 代替 recorded base；仅测试 fixture 可显式 `--allow-head-parent`。
- 覆盖 bad cwd、多 commit、bad sha、out path escape。

主要文件:

- `plugins/atlas-workflow/scripts/codex-team-review-package`
- `workflow/tests/team-sdd-review-package.test.sh`
- `test/fixtures/team-sdd/repo-*` 或 workflow test 临时 repo fixture

依赖: PR1；建议 PR2 已有 validator 后合并。

验收命令:

```bash
codex-team-review-package \
  --repo "$FIXTURE_REPO" \
  --base "$BASE" \
  --head "$HEAD" \
  --task fixture \
  --slice slice-001
```

Stop condition:

- helper 仍依赖 caller cwd 判断 target repo。
- output path 可以写出 slice artifact dir。

## PR 4：`team/SKILL.md` SDD section + prompt templates

Scope:

- 在 `plugins/atlas-workflow/skills/team/SKILL.md` 新增 Codex-native SDD Slice Protocol。
- 加入 implementer/reviewer/fixer prompt templates。
- 明确 questions loop、fresh context discipline、continuous execution、controller-only artifact writer、final whole-branch review。
- 明确 SDD unbounded fix loop 与 Native Bounded Loop 的区别。
- 写入 reviewer prompt safety：不得诱导忽略或降级 finding。
- 刷新 local plugin cache 并验证 source/cache 一致。

主要文件:

- `plugins/atlas-workflow/skills/team/SKILL.md`
- installed cache under `$CODEX_HOME/plugins/cache/.../atlas-workflow/.../skills/team/SKILL.md`
- `workflow/tests/contract_team_native.sh` 或新增 skill text lint

依赖: PR1-PR3。

验收命令:

```bash
~/.codex/workflow/bin/codex-refresh-local-plugin atlas-workflow
cmp plugins/atlas-workflow/skills/team/SKILL.md "$ATLAS_CACHE_SKILLS_DIR/team/SKILL.md"
workflow/tests/contract.sh
rg -n "unbounded_until_clean_or_terminal|fix_progress_stalled|Controller responsibilities" plugins/atlas-workflow/skills/team/SKILL.md
rg -n "NEEDS_CONTEXT|answers.jsonl|max_question_rounds|Fresh context|Continuous execution|Do not write workflow artifacts|final whole-branch review" plugins/atlas-workflow/skills/team/SKILL.md
! rg -n "max_fix_iterations|exhausted-by-iteration" plugins/atlas-workflow/skills/team/SKILL.md
```

Stop condition:

- Skill 文本仍把 SDD loop 描述为 bounded `max_iterations`。
- Skill 文本遗漏 questions loop、fresh context、continuous execution 或 controller-only artifact writer。
- Reviewer prompt 出现 “do not flag”、“at most Minor”、“ignore” 等诱导性措辞。

## PR 5：custom agents + native smoke

Scope:

- 新增四个 archetype custom agents。
- 实现真实 native smoke：spawn reviewer、wait final message、extract JSON、validate、确认 reviewer 不写 artifact、close agent。
- 确认 custom `name` 可作为 `agent_type` 使用。

主要文件:

- `.codex/agents/atlas-sdd-implementer.toml`
- `.codex/agents/atlas-sdd-reviewer.toml`
- `.codex/agents/atlas-sdd-verifier.toml`
- `.codex/agents/atlas-sdd-explorer.toml`
- `workflow/tests/native-agent-smoke.*` 或可手动运行的 smoke harness

依赖: PR2、PR4。

验收证据:

```text
1. spawn atlas-sdd-reviewer on read-only fixture
2. wait_agent returns REVIEW_VERDICT_JSON
3. codex-team-validate-json --type review-verdict passes
4. artifact dir is unchanged until controller writes verdict
5. close_agent succeeds
```

Stop condition:

- 当前 Codex native subagent tools 不可用。
- Custom agent `name` 不能作为 spawn target。

## PR 6：path lease

Scope:

- 实现 `codex-team-path-lease`。
- 支持 acquire/release/check。
- Node stdlib 实现 glob overlap，fail closed。
- 接入 staffing / brief owned_paths 与 forbidden_paths。

主要文件:

- `plugins/atlas-workflow/scripts/codex-team-path-lease`
- `plugins/atlas-workflow/contracts/team-sdd/path-lease.schema.json`
- `plugins/atlas-workflow/contracts/team-sdd/validators/path-lease.js`
- `workflow/tests/team-sdd-path-lease.test.sh`

依赖: PR1、PR2。

验收命令:

```bash
codex-team-path-lease --task fixture --slice slice-001 acquire --paths 'src/**'
! codex-team-path-lease --task fixture --slice slice-002 acquire --paths 'src/auth/**'
codex-team-path-lease --task fixture --slice slice-001 release
! codex-team-path-lease --task fixture --slice slice-003 acquire --paths '../escape/**'
```

Stop condition:

- Parent/child glob overlap 无法可靠识别。
- Absolute path 或 `..` escape 未被拒绝。

## PR 7：artifact lint + CI gate

Scope:

- 实现 `codex-team-artifact-lint`。
- 检查 required files、JSON contracts、ledger references、controller-only artifact writing、review package before verdict、unresolved Critical/Important、cannot_verify resolution、team round `backend: native` metadata、placeholder-only artifacts。
- 增加 CI/contract fixture gate。

主要文件:

- `plugins/atlas-workflow/scripts/codex-team-artifact-lint`
- `workflow/tests/team-sdd-artifact-lint.test.sh`
- `test/fixtures/team-sdd/invalid/*`

依赖: PR1-PR3；建议 PR6 后加强 path lease 校验。

验收命令:

```bash
codex-team-artifact-lint --task fixture --strict
! codex-team-artifact-lint --task fixture-critical-unresolved --strict
! codex-team-artifact-lint --task fixture-missing-review-package --strict
! codex-team-artifact-lint --task fixture-missing-native-backend-metadata --strict
! codex-team-artifact-lint --task fixture-placeholder-only-artifact --strict
```

Unbounded loop 专项验收:

```bash
codex-team-artifact-lint --task fixture-fix-loop-unbounded --strict
rg -n '"event":"fix_started".*"iteration":3' "$WORKFLOW_ROOT/artifacts/fixture-fix-loop-unbounded/team/sdd/progress.jsonl"
! rg -n "exhausted-by-iteration|max_fix_iterations" "$WORKFLOW_ROOT/artifacts/fixture-fix-loop-unbounded/team/sdd"
```

Stop condition:

- Lint 无法阻止 unresolved Critical / Important 被标记 complete。
- `cannot_verify_from_diff` 没有 controller resolution 也能通过。
- Lint 不能识别缺失 `backend: native` metadata 或 placeholder-only artifacts。

## PR 8：Multica Sprint Contract compiler

Scope:

- 扩展 PR2 的 `codex-team-brief` minimal writer，将 Sprint Contract acceptance rows 编译为 SDD `brief.md/json`。
- 保留 Multica router 的确定性职责，不让 router 做 LLM review。
- 输出 evidence manifest。
- 接入 clean-gate / failure / blocker routing。

主要文件:

- `plugins/atlas-workflow/scripts/codex-team-brief`
- `plugins/multica-sdlc/scripts/*` 中必要的 router integration
- `workflow/tests/team-sdd-sprint-contract.test.sh`

依赖: PR1-PR7，尤其依赖 PR2 的 minimal writer 已存在。

验收命令:

```bash
codex-team-brief \
  --task fixture \
  --slice slice-001 \
  --repo "$FIXTURE_REPO" \
  --base "$BASE" \
  --contract "$SPRINT_CONTRACT" \
  --acceptance SC-A1 \
  --owned 'src/auth/**' \
  --check 'pytest tests/auth/test_login.py'
codex-team-validate-json --type brief --file "$WORKFLOW_ROOT/artifacts/fixture/team/sdd/slices/slice-001/brief.json"
```

Stop condition:

- Compiler 输出不稳定，导致同一 Sprint Contract 多次生成不同 slice IDs。
- Router 开始承担 LLM review 职责。

## PR 9：scorecard analytics

Scope:

- 定义 scorecard JSONL schema。
- 每个 subagent final message 解析后追加 scorecard。
- 支持 summary by role/model/status、review fail rates、fix loop counts。
- 并发 append 使用 lock 或 atomic append。

主要文件:

- `plugins/atlas-workflow/contracts/team-sdd/scorecard.schema.json`
- `plugins/atlas-workflow/scripts/codex-team-scorecard`
- `workflow/tests/team-sdd-scorecard.test.sh`

依赖: PR1、PR2、PR7。

验收命令:

```bash
codex-team-scorecard --task fixture append --json "$SCORECARD_EVENT"
codex-team-scorecard --task fixture summary
```

Stop condition:

- 并发 append 可能损坏 JSONL。
- Summary 不能区分 review_failed、fix_progress_stalled、review_clean。

## MVP 范围

MVP 到 PR5 为止才算可试运行：

1. `$WORKFLOW_ROOT` path resolver。
2. `codex-team-ledger`。
3. `brief.json/md` minimal writer。
4. Implementer final-message JSON contract + validator。
5. Reviewer final-message JSON contract + validator。
6. `codex-team-review-package --repo --task --slice`。
7. Controller writes report/verdict artifacts。
8. Unbounded fix loop：每轮 fix 必须 commit + re-review，不设置固定次数上限字段。
9. `NEEDS_CONTEXT` branch。
10. Per-slice commit required for changed files。
11. Final whole-branch review placeholder/gate。
12. Native custom agent smoke。

## 后续 Implementation Contract 要求

每个 PR 开始编码前填写 lightweight implementation contract，至少包含：

- 本 PR 的 source of truth：新版方案与本文档。
- Scope / non-goals。
- 需要新增或修改的文件列表。
- Acceptance rows，对应本计划每个 PR 的验收命令。
- Verification evidence path。
- Stop conditions。
- Cache sync 要求：凡修改 `plugins/atlas-workflow/skills/`，必须执行 `~/.codex/workflow/bin/codex-refresh-local-plugin atlas-workflow` 并验证 source/cache 一致。
- Unbounded loop 专项：相关 PR 必须证明第 3 次 fix 仍继续 re-review，且不存在 `max_fix_iterations` 或 exhausted-by-iteration stop event。

## 全局验证矩阵

| Area | Command / Evidence |
| --- | --- |
| private path | `node plugins/atlas-workflow/scripts/audit-private-paths.js --root . --deny-private-home --allow-list docs/audit/private-paths.allow.json --fail-on runtime,instructions,tests` |
| workflow contracts | `workflow/tests/contract.sh` |
| ledger | `codex-team-ledger --task fixture verify` |
| validators | `codex-team-validate-json --type implementer-report --file valid.json` and invalid fixture failures |
| review package | `codex-team-review-package --repo "$FIXTURE_REPO" --base "$BASE" --head "$HEAD" --task T --slice S` |
| unbounded fix loop | fixture with at least 3 fix iterations, review clean at end, no exhausted-by-iteration event |
| native smoke | spawn/wait/close `atlas-sdd-reviewer`, validate `REVIEW_VERDICT_JSON`, confirm no subagent artifact write |
| artifact lint | `codex-team-artifact-lint --task fixture --strict` |
| cache sync | `cmp plugins/atlas-workflow/skills/team/SKILL.md "$ATLAS_CACHE_SKILLS_DIR/team/SKILL.md"` |

## 残余风险

- 无上限 fix loop 会增加成本，必须通过 scorecard、ledger visibility 和 `fix_progress_stalled` 降低空转风险。
- Native custom agent smoke 依赖当前 Codex runtime 暴露 spawn/wait/close；若运行环境没有 native tools，只能停止并让用户选择替代工作流。
- PR0 私有路径治理可能触发历史文档误报，因此必须有 allowlist，并注明 allow reason。
- 如果 helper 暴露方式不清晰，PR1-PR3 需要先决定脚本放在 plugin scripts 还是 workflow bin；默认从 plugin scripts 开始，避免过早扩大 workflow CLI。

## 下一步

进入实现前，建议从 PR0 的 implementation contract 开始，先锁定 audit script 分类规则、allowlist 格式和最小验收命令。PR0 通过后再推进 PR1 workspace + ledger。
