# Atlas Web 真实 UI 验收薄层最终实施合同

workflow_id: 20260719-005-ai-ui-intake
task_id: 20260719-005-ai-ui-intake
title: Atlas Web 真实 UI 验收薄层与 Sharp Cell Reference Pack
contract_status: final
current_authoritative_contract: ./implementation-contract.final.md
created: 2026-07-19
finalized: 2026-07-19
contract_semantics_version: 1
work_type: implementation
first_code_guard: required
first_code_not_applicable_reason:
product_ui_gate: required
product_ui_not_applicable_reason:

## Scope

### Goal

在不改变 Atlas BAF v2 machine semantics 的前提下，实现一个 dependency-free 的 Web UI execution/audit/evidence 薄层，并在 Sharp Cell 用一条真实业务锚点证明：只有真实 UI 操作、真实后端链路、受控外部设备输入、完整证据和 strict BAF closure 同时成立时，系统才可形成最终业务通过结论。

### Non-goals

- 不新增与 BAF 平行的 acceptance、evidence、scorecard、verdict 或中文事实源。
- 不建设 Dashboard、常驻服务、低代码编辑器、远程测试平台、设备农场或自动修复平台。
- 不实现完整视觉 AI、像素评分、Canvas/拖拽通用操作库、Android、桌面或真实 CNC 验收。
- 不迁移或重写 Sharp Cell 其余 Playwright 用例，不接入第二个项目。
- 不把 Sharp Cell 业务对象、账号、DOM、port、browser 或 viewport 写入 Core。
- 不允许 API/DB 代替用户 UI 操作，不允许内部 transition API、通用 simulator tick 或 DB 直改制造 `running`。
- 不刷新真实 plugin cache、marketplace snapshot、workflow runtime 或 agent runtime，不 push、不建 PR、不部署、不发布。
- 不修改、运行、测试、同步、bump、迁移或删除 Multica。

### Files or surfaces likely affected

Atlas Forge owned paths:

- `workflow/bin/codex-web-acceptance`
- `workflow/bin/lib/codex-web-acceptance/**`
- `workflow/contracts/web-acceptance/**`
- `workflow/tests/contract_web_acceptance.sh`
- `workflow/tests/contract.sh`
- 必要的 `workflow/README.md` 与 Atlas plugin skill/reference 接入说明
- 既有中文阅读层依赖严格受 `../20260718-004-atlas-business-acceptance-readable-report/implementation-contract.final.md` 约束；不得在本合同中复制弱化实现

Sharp Cell owned paths:

- `acceptance/web/**`
- `apps/fms-web/e2e/**` 中单条新 anchor 与专用 helpers
- `apps/fms-web/package.json` 和根 `package.json` 的必要脚本，不新增依赖
- 锚点直接涉及的 Login、WorkOrder、LineTask、DeviceTask UI 与 i18n 文件，仅在真实可测试性或阻断缺陷需要时修改
- `scripts/dev-integration/**` 与既有 Beezer callback fixture 能力，仅做本地 approved simulator 适配
- 锚点直接涉及的 task/callback API 代码，仅允许修复当前闭环 blocker，不做领域重构

### User-visible behavior

- AI 或开发者能运行 Web audit，看到中文风险摘要和机器 JSON，不再以 Playwright 绿色退出码代替业务验收。
- 业务负责人能阅读绑定 contract/evidence digest 的中文 scenario 审核卡，看到业务路径、禁止绕过、参考图、实际截图、证据状态与阻断。
- Sharp Cell reference run 从真实登录开始，最终在 UI 显示同一目标设备任务为“运行中”。

## First Code Slice Guard

- first_code_slice: 实现 `workflow/bin/codex-web-acceptance audit` 的可执行扫描行为，对输入的 Playwright 配置与源码输出稳定 JSON 和中文摘要，至少识别 API login/cookie 注入、`nth()`、深层 CSS、模糊文本、`force`、固定等待、route mock、弱后置断言和 retry 风险。
- first_code_slice_kind: cli
- first_code_owner: 单一 Atlas Forge implementer
- first_code_verification: `bash workflow/tests/contract_web_acceptance.sh`，并对 `/home/gewu/work/sharp-cell/apps/fms-web` 只读运行 audit
- allowed_contract_gate_only_until: 本合同获实施授权之前
- stop_if_no_code_by_phase: Phase 1
- gate_parallelization_or_deferral_plan: BAF readable renderer 依赖和 Sharp Cell adapter 事实核对可并行准备；schema、fixtures、文档和 evidence-only 工作不得取代 Phase 1 的可执行 audit 行为。
- Ordering rule: contract、schema、fixture 和 evidence-only 准备必须在 Phase 1 内结束为可运行 CLI；不得连续扩张准备材料而没有行为 diff。
- Safety rule: first code slice 不授权弱化 BAF strict lint、secret policy、signed callback、真实 UI 或 forbidden-path gates。

## Product/UI Acceptance Gate

- first_operable_user_flow: 计划员从真实登录页登录，通过 served Sharp Cell UI 创建并发布工单；系统形成任务树和资源分配；无效签名 callback 被拒绝且目标任务状态不变；有效 signed Beezer callback 推动同一 `DeviceTask` 到 `running`；计划员在 UI 刷新后看到一致状态。
- browser_entrypoint: http://127.0.0.1:5174/login
- served_ui_validation_action: `page.goto('http://127.0.0.1:5174/login')` 打开真实 Vite-served HTML 与 JS/CSS，使用 planner 在登录表单输入凭据，按项目 contract 经真实菜单和 UI 完成工单路径；不得 fulfill 主文档或 app bundle，不得 API login、cookie 注入或深层 URL 起步。
- ui_data_mode: 隔离 fresh-seed 的真实本地 Web/API/DB/worker/queue；只有外部设备输入使用项目批准的 signed Beezer simulator。
- required_safety_gates: planner 权限与组织 scope、invalid signature fail-closed、no direct task transition、no DB success mutation、secret redaction、attempt immutability、evidence digest、served asset identity、API/DB/audit/trace correlation。
- allowed_headless_only_until: Phase 2 完成 Core audit/run/check-run 行为
- stop_if_no_ui_by_phase: Phase 3
- Served UI evidence: HTML、JS 和 CSS 必须来自真实 HTTP server；backend mock、`page.setContent`、fulfilled main document/app bundle、build/typecheck、fixture-only test 和截图本身都不能满足本锚点。
- Reverse guard: served UI 不替代 signed callback、权限、DB、audit、trace 或 BAF strict evidence。

## Architecture And Protocol

### Core CLI modes

1. `audit`：静态扫描 Playwright 配置与 specs；结果分类为 blocking、warning、approved waiver，不自动改代码。
2. `run`：创建 run identity，冻结 project/contract digest，按 phase 调用 project adapter，保存全部 attempts 和 evidence refs。
3. `check-run`：验证 attempts、required evidence、digest、路径、secret 和 failure class，产生 technical run result；不产生业务 accepted verdict。
4. `review`：从已验证 contract/evidence 确定性生成中文 scenario 审核卡；不推断未登记事实，不覆盖 BAF 报告。

### Project config and adapter protocol

- Core 只接受 schema-valid JSON project config；viewport/browser matrix、角色、入口、scenario、连续成功次数、截图锚点和 adapter command 均来自项目。
- adapter command 使用 argv 数组；禁止 shell command string、隐式 shell expansion 和 Core 直接加载项目 TypeScript。
- stdin envelope 固定包含 protocol version、phase、task ID、scenario ID、run ID、attempt、project root、artifact root 和 contract digest。
- stdout 必须只包含一个 schema-valid JSON envelope；diagnostic 写 stderr。
- adapter 返回 phase facts、evidence refs 和 project failure facts；不能返回或覆盖最终业务 verdict。
- project adapter 可由 TypeScript 实现并使用项目自身工具链；Core 提供 JSON Schema 与 TypeScript type declarations，不提供新的 runtime package。

### Run and evidence invariants

- attempt 1 非 passed 时，同一 run 的 final technical result 只能为 unstable 或 failed；重试只用于诊断。
- required evidence 的 failed、blocked、skipped、missing、non-claim 或 digest mismatch 均失败关闭。
- contract/config digest、attempt history、evidence index 与 failure class 在正式 run 内不可变；修复使用新 run ID。
- evidence path 必须位于 canonical run artifact root，必须是 regular non-symlink file；禁止目录引用和路径逃逸。
- Trace、视频、HAR、完整日志、API/DB dump、callback payload、失败 attempts 与中间输出默认位于 Git 外 workflow/run artifacts。
- evidence 生成与报告必须过滤 credential、token、cookie、HMAC secret、Authorization、数据库 DSN 和带凭据 URL。

### BAF authority

- Web technical run result 只能作为现有 `business-evidence-map.json` 引用的 evidence。
- strict `codex-team-artifact-lint` 继续校验 BAF bundle、evidence identity 和 closure。
- `business-verdict.json` 是唯一最终业务 verdict；不得新增 `finalStatus` 同义业务结论。
- 中文业务主报告复用 `20260718-004-atlas` 合同规定的 `codex-team-business-report`；Web review card 是场景材料，不是第二 verdict。

## Phases

### Phase 1 — Executable audit

- 实现第一代码切片和专项正负 fixtures。
- 对 Sharp Cell 现有 specs 只读运行，证明已知 API login/cookie、locator、route mock、弱断言和 retry 风险被识别。
- 不在此阶段修复或迁移 Sharp Cell 全量测试。

### Phase 2 — Run protocol, evidence and readable dependency

- 实现 project config、adapter envelope、run/check-run、attempt immutability、evidence digest、path/secret guards 和 BAF bridge。
- 按既有独立合同完成或确认可用 `codex-team-business-report`；不得复制其 machine semantics。
- 实现无 verdict 权限的中文 Web scenario review card。

### Phase 3 — Sharp Cell operable UI slice

- 新增 Sharp Cell project config、adapter 和单条 anchor。
- 使用真实 Vite app、planner UI login、真实 Web/API/DB/worker/queue 和 signed Beezer callback。
- 先证明 invalid signature 被拒绝且状态不变，再证明 valid callback 推进同一 task 到 running。
- 若 Phase 3 结束无真实 served UI evidence，停止，不扩张 scanners、fixtures、release、perf 或 soak。

### Phase 4 — Convergence and stop

- 在项目配置的 `1366x768` 下完成连续 3 个 fresh-seed 新 run，每个 attempt 1 通过。
- 完成 BAF strict closure、中文审核卡、关联证据、专项/回归/forbidden-path 检查。
- 达成合同即停止；不迁移其他用例、不实现第二项目、不进入发布或安装刷新。

## Acceptance Criteria

| ID | Criterion | Required | Verification |
| --- | --- | --- | --- |
| AC-01 | `audit` 是可执行 CLI 行为，并稳定输出 JSON 与中文摘要 | yes | `bash workflow/tests/contract_web_acceptance.sh` |
| AC-02 | audit fixtures 与 Sharp Cell 只读扫描覆盖 API login/cookie、nth/deep CSS/fuzzy text/force/fixed wait、route mock、弱后置断言和 retry 风险 | yes | 专项 fixture assertions + `workflow/bin/codex-web-acceptance audit --project /home/gewu/work/sharp-cell --config acceptance/web/project.config.json` |
| AC-03 | project config、adapter envelope、run result 和 evidence index 均有严格 schema 与 TypeScript type declarations | yes | schema positive/negative fixtures、`node --check` 与 type-shape assertions |
| AC-04 | Core 源码无 Sharp Cell 名称、WorkOrder/DeviceTask/Beezer、账号、固定 port、browser 或 viewport 常量 | yes | 专项 forbidden constant scan；fixture 值只存在测试数据和 Sharp Cell project config |
| AC-05 | adapter 只通过 argv 数组与 JSON stdin/stdout 交互；shell string、未知字段、协议错版和非 JSON stdout 失败关闭 | yes | adapter protocol negative matrix |
| AC-06 | attempt 1 失败后 retry passed 的 run 只能为 unstable/failed；新 run 才可重新争取 passed | yes | attempt history fixtures 与 end-to-end CLI test |
| AC-07 | required evidence 的 failed/blocked/skipped/missing/non-claim、digest mismatch、path escape、symlink 和 secret diagnostic 均失败关闭 | yes | tamper/path/secret negative fixtures |
| AC-08 | Web CLI 不产生最终业务 accepted verdict；BAF bridge 复用 strict artifact lint 和现有 business verdict | yes | BAF fixture integration + `bash workflow/tests/contract.sh` |
| AC-09 | 中文业务报告依赖按 `20260718-004-atlas` 合同可用，Web review card 绑定 contract/evidence digest 且不重算 verdict | yes | renderer `--check --presentation-strict`、Web review golden/tamper tests |
| AC-10 | Sharp Cell viewport/browser/role/URL/连续运行次数只存在项目 config；Core 不写死 | yes | project config schema + Core source scan |
| AC-11 | Sharp Cell anchor 从真实 `/login` 用 planner 登录，不使用 API login、cookie 注入、systemadmin 或深层 URL 起步 | yes | Playwright Trace、route manifest、actor session evidence |
| AC-12 | 工单通过 UI 创建并发布，task tree、assignment、occupancy 与目标 DeviceTask 真实持久化 | yes | UI checkpoints + API/DB readback evidence |
| AC-13 | 无效签名 callback 经真实 ingress 被拒绝且目标状态不变 | yes | HTTP receipt、before/after API/DB snapshot、audit/trace evidence |
| AC-14 | 有效 signed callback 与本次 device/task/assignment/trace 关联并推进同一 DeviceTask 到 running | yes | callback receipt、API/DB/audit/trace join evidence |
| AC-15 | UI 刷新后显示 running，并与 API/DB/callback/audit/trace 一致 | yes | Playwright assertion、截图、join guard |
| AC-16 | Anchor 无未经批准的 nth/deep CSS/fuzzy text/force click；每个关键动作有唯一 locator、actionability 和后置断言 | yes | audit blocking rules + anchor source/Trace inspection |
| AC-17 | 中文审核卡并排显示项目参考图/AI 效果图与 `1366x768` 实际关键截图，支持用户符合/不符合判断 | yes | generated Markdown/HTML 或 app-supported image links、digest check、人工可读性确认 |
| AC-18 | Sharp Cell 连续 3 个 fresh-seed 新 run 在 attempt 1 通过；任一失败重新从新 run 计数 | yes | immutable run index 与三份 strict BAF evidence bundle |
| AC-19 | 达成 AC-18 后停止 v1，不迁移其他 E2E、不接第二项目、不执行安装刷新或发布 | yes | final diff/path audit 与 phase conclusion |
| AC-20 | Atlas 与 Sharp Cell 现有相关测试通过，forbidden paths 和 Multica hard fingerprints 不变 | yes | Real Validation Plan 全部 required rows |

## Real Validation Plan

| Row | Target | Command or action | Expected result | Phase conclusion evidence |
| --- | --- | --- | --- | --- |
| V-01 | Atlas Web专项 | `bash workflow/tests/contract_web_acceptance.sh` | audit/protocol/run/evidence/review 正负合同通过 | `evidence/phase-review-report.md` |
| V-02 | Atlas BAF | `bash workflow/tests/contract.sh` | strict BAF 与 Web bridge 集成通过 | 同上 |
| V-03 | Atlas hermetic repo | `bash workflow/tests/contract_repo.sh` | hermetic repository contract 通过 | 同上 |
| V-04 | Atlas plugin | 官方 `validate_plugin.py plugins/atlas-workflow` | plugin valid | 同上 |
| V-05 | Atlas identity | `workflow/bin/atlas-plugin-integrity manifest --plugin-root plugins/atlas-workflow` | manifest identity valid | 同上 |
| V-06 | Sharp Cell static | `corepack pnpm --filter fms-web typecheck` 与相关目标测试 | 通过 | Sharp Cell phase conclusion |
| V-07 | Sharp Cell anchor | 项目 config 驱动 `codex-web-acceptance run`，真实打开 `http://127.0.0.1:5174/login` | 完成 AC-11 至 AC-17 | Git 外 run artifacts + 精简 evidence index |
| V-08 | Fresh-run convergence | 连续执行 3 个新 run ID，每次 fresh seed、attempt 1 通过 | immutable run index 显示 3/3 | final gate checklist |
| V-09 | BAF/readable | strict artifact lint、`codex-team-business-report --check --presentation-strict` | machine verdict 合法、中文报告新鲜且未手改 | final evidence index |
| V-10 | Docs | `scripts/check-relative-markdown-links.py --root .`、contract-index lint、implementation-contract lint | 全部通过 | clarify conclusion |
| V-11 | Diff | 两仓库分别执行 `git diff --check` 和 owned/forbidden path audit | 无格式或越界变更 | final conclusion |
| V-12 | Multica | 只读比较 `HEAD:plugins/multica-sdlc` 与 `HEAD:.agents` fingerprints | 与实施前一致 | final conclusion |

## Evidence Budget

- Git evidence 只保留 phase conclusion、defect queue、evidence index、gate checklist、必要 golden 和少量最终审核截图。
- 原始 Playwright JSON、Trace、视频、HAR、批量截图、完整命令输出、worker/debug JSONL、API/DB dump、callback raw body、port/process 状态和失败重试只存 Git 外 run artifacts。
- 每 phase 目标不超过 10 个 Git evidence 文件和 1 MB；例外必须在 phase review 中说明。

## Edge Cases

| Case | Expected behavior | Required |
| --- | --- | --- |
| attempt 1 失败、attempt 2 通过 | run 为 unstable/failed，不得被 BAF 接受为 passed technical gate | yes |
| 页面能打开但工单未持久化 | UI gate failed | yes |
| API/DB 正确但 UI 未显示 running | business/user-path gate failed | yes |
| UI 显示 running 但 callback/DB/audit/trace 断链 | technical gate failed | yes |
| invalid signature 返回非成功但状态发生变化 | safety gate failed | yes |
| adapter 输出业务 accepted | protocol rejected | yes |
| contract 或 project config 在 run 中变化 | run blocked by digest mismatch | yes |
| 视觉对照缺参考图或实际截图 | design review not complete；不得伪装为符合 | yes |
| 中文报告被手改或 source digest 陈旧 | presentation check failed | yes |
| Core 需要项目特有常量才能继续 | 停止并修正 adapter boundary | yes |

## Implementation Notes

- 保持 Atlas Forge 现有 Node 标准库、CommonJS 或项目当前 CLI 风格；不引入 npm dependency 或 build step。
- 项目 adapter 的 TypeScript 由项目自身执行环境负责；Core 只拥有 schema、type declarations 和 JSON protocol。
- 对现有 Playwright 的静态审计允许启发式 warning，但 blocking 规则和 waiver 必须有稳定 rule ID 与项目内理由。
- 若修改 `plugins/atlas-workflow/**`，先冻结内容与 review，再最后运行 `scripts/bump-plugin-cachebuster.sh atlas-workflow`；cachebuster 后不得继续改 plugin tree，若修改则重新 review 并生成新版本。
- 开发验证不运行真实 marketplace/cache/workflow runtime 刷新，不绕过 fail-closed marketplace wrapper。
- Atlas 与 Sharp Cell 各自形成适中、可回退的 Conventional Commit；是否 commit 由实施授权与当时 dirty worktree 决定，commit 不授权 push。

## Failure And Stop Conditions

- Stop and ask the user when:
  - 继续需要修改 BAF v2 machine semantics、创建平行 verdict 或弱化 readable-report 合同；
  - 继续需要真实 CNC、生产/共享数据库、部署、push、PR、安装态刷新或 marketplace mutation；
  - 关键业务/design 意图存在歧义，且无法从已批准中文差异卡确定；
  - 两仓库 dirty worktree 与 owned paths 重叠且无法安全隔离；
  - 失败无法确定归属为项目、Core 或用户决策。
- Treat the task as failed when:
  - Phase 1 结束没有可执行 audit CLI 行为；
  - Phase 3 结束没有真实 served UI anchor；
  - required gate 被 AI、retry、waiver、mock、API/DB bypass 或局部 pass 覆盖；
  - 三次 convergence 依赖旧数据、共享状态或非首次 attempt；
  - secret 进入 Git evidence 或业务报告；
  - Multica 或 forbidden paths 发生变化。
- Required safe fallback: 保留本合同、已完成的独立逻辑成果与失败证据；不宣称 v1 完成，不自动扩大范围。

## Provenance

- Based on:
  - 用户确认的 workflow intake `20260719-005-ai-ui-intake`
  - `../20260710-003-atlas-forge-release-integrity-governance-plan/implementation-contract.final.md`
  - `../20260718-004-atlas-business-acceptance-readable-report/implementation-contract.final.md`
  - `/home/gewu/work/sharp-cell/AGENTS.md`
  - `/home/gewu/work/sharp-cell/apps/fms-web/e2e/follow-up-work-order-business-closure.spec.ts`
- Supersedes: none.
- Review history: 用户逐分支确认 intake；main-agent brownfield clarification；未使用 multi-agent review。

## Final Contract Cleanliness Gate

- [x] This is a clean rewrite of the final agreed requirements.
- [x] Superseded requirements are not included as executable instructions.
- [x] Review notes are linked in provenance, not pasted into the body.
- [x] Required acceptance criteria and validation rows are complete.
- [x] Git evidence stays within the phase evidence budget or the exception is explained.
- [x] Residual risks and stop conditions are recorded.
