# Atlas Clarify 任务膨胀收敛实施计划

workflow_id: `20260720-003-atlas-clarify`
plan_status: `ready-for-implementation`
date: `2026-07-20`
authority: 当前用户确认的修订方案
artifact_category: `implementation_plan`

## 1. 背景与问题定义

最近的 Clarify 调用虽然已经具备 `goal:<ref>`、`current-required:<finding_id>` 和
`follow-up` 等 scope admission 语义，但新产出的合同仍可使用 semantics v1，并且 readiness
主要检查 artifact 是否存在、内容是否非空。这使以下膨胀路径仍然成立：

1. 初始目标在 discovery 前没有冻结为最小结果，discovery finding 随后被直接并入当前目标。
2. 自然语言中的安全、数据或权限担忧不需要证明其对当前目标可达且因果必要，就能成为 Required。
3. Clarify 只有轻量笔记和完整合同两种隐含形态，缺少默认的 Bounded 中间态。
4. 新写合同可以继续使用 semantics v1，避开 v2 authority slice 的归因约束。
5. readiness 只证明“材料存在”，没有证明 Required 范围来自唯一、可验证的授权链。

本计划只收敛 Clarify 新写任务的范围准入和 readiness，不迁移历史合同，也不另建 controller
或 roadmap 状态机。

## 2. 目标

建立一条可由机器检查、同时保持人工判断边界的单一授权链：

```text
discovery 前冻结的 Goal
  -> goal:<requirement-ref> 或 current-required:<finding_id>
  -> semantics v2 implementation contract（如该模式需要）
  -> --strict --new-authoring lint
  -> readiness
```

完成后应满足：

- Clarify 默认进入 `bounded`，不会因出现 contract 或 finding 自动升级为重型交付。
- 新写合同只能使用 semantics v2；历史 v1 合同继续按现有 `--strict` 兼容读取和验证。
- Required 只能来自冻结 Goal，或来自已有 controller resolution 中具备因果证据的
  `current-required` finding。
- discovery 新发现默认进入 `follow-up`；自然语言 review 不能直接扩大 Required。
- readiness 复用 implementation-contract lint，不维护第二套 scope 解释器。
- Tiny、Bounded、Contract 三种模式各自有清晰且可测试的最小 artifact 集。

## 3. 非目标与硬边界

- 不批量迁移、重写或重新签署 semantics v1 历史合同。
- 不改变普通 `--strict` 对已存在 v1/v2 合同的兼容行为。
- 不新增第二套 controller、finding schema、roadmap 或 workflow 状态机。
- 不让机器判断自然语言事实是否真实；机器只验证引用存在、类型正确、绑定完整。
- 不要求 Bounded 因存在 contract、review finding、安全检查或跨文件改动而升级为 Contract。
- 不为同一任务同时维护 clarify、contract、durable handoff 三份重复的完整范围正文。
- 不修改 `plugins/multica-sdlc/**`、`.agents/**`、Multica runtime、真实 marketplace、已安装
  cache 或 `~/.codex/workflow` runtime。
- 不运行 `contract_host_install.sh`，不执行 plugin 安装、marketplace refresh、push、PR、deploy
  或 release。

## 4. 设计决策

### 4.1 单一范围权威

每个 Clarify 任务只选择一个 `canonical_scope_source`：

- Tiny：`clarify.md`。
- Bounded：默认 `clarify.md`；需要机器可检验语义时可改为一份紧凑 semantics v2 contract。
- Contract：semantics v2 implementation contract。

其他 artifact 只能引用该权威源并补充本职信息，不得镜像 Goal、Required、Non-goals、Acceptance
和 Verification 的完整正文。

### 4.2 Goal 先于 discovery 冻结

Clarify 在展开 repo discovery、review 或风险枚举前，先记录“用户要获得的最小可验收结果”，并为其
分配稳定 requirement ref。后续 discovery 只能对 finding 做以下分类：

- `goal:<requirement-ref>`：直接实现已冻结目标。
- `current-required:<finding_id>`：不处理就无法安全或正确交付当前目标，且已有 controller resolution
  及证据绑定。
- `follow-up`：有价值但不阻塞当前交付。

不得通过修改 Goal 文案、追加 acceptance 行或使用“更完整”“生产级”“顺便”等描述绕过分类。

### 4.3 安全、数据与权限 finding 的因果门槛

优先复用现有 controller resolution 的 `basis`、`authority_refs` 和 `reason` 字段，不新增平行 schema。
安全、数据或权限 finding 要成为 `current-required`，至少必须绑定：

- 一个 canonical invariant；
- 一个 `acceptance:<ref>`；
- 一个可定位的 path、diff 或 evidence ref；
- 一段非占位 `reason`，说明不处理如何阻断或使当前 acceptance 不安全。

机器只检查字段存在、引用格式、引用目标和 disposition 的一致性。证据是否足以证明因果关系仍由
controller/reviewer 判断。

### 4.4 历史兼容与新写门禁分离

`codex-implementation-contract-lint` 增加 `--new-authoring`：

- `--strict`：保留现状，继续接受合法的 semantics v1 和 v2 合同。
- `--strict --new-authoring`：只接受 semantics v2。
- `--new-authoring` 未同时提供 `--strict` 时 fail closed，避免产生含糊模式。

新写门禁只作用于 Clarify scaffold/readiness 生成或声明的新合同，不反向使历史 v1 artifact 失效。

### 4.5 Authority slice 最小化

v2 authority slice 支持两种合法形态：

| 形态 | 必需文件 | 可授权范围 |
| --- | --- | --- |
| Goal-only | `brief.json`、`brief.md` | 仅 `goal:<requirement-ref>` |
| Finding-aware | Goal-only 文件，加 `review-verdict.json`、`controller-resolution.json` | Goal 与已解决的 `current-required` |

`review-verdict.json` 与 `controller-resolution.json` 必须同时存在或同时不存在。Goal-only slice
不得为任何 `current-required:<finding_id>` 提供 authority。现有 canonical slice 路径规则保持不变。

## 5. 实施切片

### Slice 1：新写合同强制 v2，同时保留历史兼容

主要文件：

- `plugins/atlas-workflow/scripts/codex-implementation-contract-lint`
- `workflow/tests/contract_implementation_contract.sh`
- 必要时的 `test/fixtures/implementation-contract/**`

实施内容：

1. 解析并展示 `--new-authoring`，拒绝重复参数、带值参数和未搭配 `--strict` 的调用。
2. 在新写模式下拒绝 v1，使用稳定、可断言的 diagnostic code。
3. 将 authority slice loader 改为支持 Goal-only 与 Finding-aware 两种形态。
4. 对 verdict/resolution 半套文件、Goal-only 引用 current-required、未知 finding、非
   current-required disposition 建立反向测试。
5. 保留当前 v1 strict fixtures，证明普通 `--strict` 没有兼容性回归。

验收：

- 历史 v1 fixture 在 `--strict` 下继续通过。
- 同一 v1 fixture 在 `--strict --new-authoring` 下失败。
- 仅引用 Goal 的 v2 合同可通过 Goal-only authority slice。
- 任一 `current-required` 引用都必须由完整 Finding-aware slice 支撑。

### Slice 2：Clarify guidance 冻结 Goal 并限制 discovery

主要文件：

- `plugins/atlas-workflow/skills/clarify/SKILL.md`
- `workflow/templates/clarify.md`
- `workflow/tests/contract_implementation_contract.sh`

实施内容：

1. 将“冻结最小 Goal”放到 discovery 之前，并要求稳定 requirement ref。
2. 明确 discovery 只产生 goal、current-required 或 follow-up 分类，不直接改写当前范围。
3. 明确 review finding、建议列表、风险枚举和自然语言“必须”均不构成 authority。
4. 明确只有 controller resolution 能把非 Goal finding 提升为 current-required。
5. 模板保留一处 Goal/Non-goals/Acceptance 权威正文，避免追加式例外章节。

验收：

- Clarify 指引不存在“先全面 discovery、再确定目标”的顺序。
- 合同测试能断言 review finding 不经过 resolution 不能成为 Required authority。
- follow-up 不会被投影进 Required acceptance、required edge case 或 safe fallback。

### Slice 3：current-required 增加可达性与因果证据

主要文件：

- `plugins/atlas-workflow/contracts/team-sdd/validators/controller-resolution.js`
- 与 controller resolution 写入/读取直接相关的现有脚本
- `workflow/tests/contract_team_sdd.sh`
- `workflow/tests/js/team-sdd-admission.test.js`
- `workflow/tests/js/feedback-commands.test.js`

实施内容：

1. 在不新增平行数据模型的前提下，收紧安全、数据、权限类 current-required 的现有字段约束。
2. 校验 canonical invariant、acceptance ref、path/diff/evidence ref 与 substantive reason 均存在。
3. 让缺失、悬空或格式错误的引用 fail closed；不对 reason 的自然语言真伪做启发式判定。
4. 保持普通目标 finding 与 follow-up 的现有表达能力，不把所有 review finding 都强制为重型证据包。

验收：

- “可能有风险”但没有 acceptance 与代码/证据路径的 finding 不能成为 current-required。
- 有完整绑定的真实安全阻断项可以成为 current-required。
- follow-up finding 不因风险类别而自动升级。

### Slice 4：Tiny / Bounded / Contract 模式与 readiness

主要文件：

- `workflow/bin/lib/codex-workflow/artifact/cli.js`
- `workflow/bin/lib/codex-workflow/artifact/scaffold.js`
- `workflow/bin/lib/codex-workflow/verification/readiness.js`
- `workflow/templates/clarify.md`
- `workflow/tests/js/artifact-scaffold.test.js`
- `workflow/tests/js/root-cli.test.js`
- `workflow/tests/js/verification-readiness.test.js`

CLI 合同：

```text
codex-workflow scaffold-clarify <task-id> --mode tiny|bounded|contract
```

未指定 `--mode` 时默认 `bounded`。生成的 Clarify metadata 至少包括：

```text
authoring_mode: tiny|bounded|contract
canonical_scope_source: <task-relative-path>
goal_authority_slice: <path-or-none>
implementation_contract: <path-or-none>
```

模式规则：

| 模式 | 合同规则 | Readiness 规则 |
| --- | --- | --- |
| Tiny | 禁止 implementation contract 和 durable bundle | 只校验轻量 Goal、Non-goals、Acceptance、Verification |
| Bounded | contract 可选；如使用则为单一权威的紧凑 v2 contract | 无 contract 时校验 clarify；有 contract 时运行 `--strict --new-authoring` |
| Contract | 必须有单一 v2 contract 与 authority slice | 必须通过 `--strict --new-authoring` 和 authority 校验 |

readiness 必须调用既有 lint，而不是复制 contract semantics。`--skip` 可以跳过普通 artifact readiness，
但不能绕过已声明 contract 的版本、authority 或 scope admission 失败。没有 `authoring_mode` 的历史任务保留
原 artifact-only readiness 行为，但不能用来建立新的 contract readiness。

验收：

- 默认 scaffold 产出 Bounded，而不是完整 bundle。
- Bounded 可以没有 contract，也可以使用紧凑 v2 contract；两者都不会自动升级为 Contract。
- Tiny 声明 contract 时 readiness 失败。
- Contract 缺少 contract 或 authority slice 时 readiness 失败。
- `--skip` 不能将无效新写合同标记为 ready/skipped-success。

### Slice 5：Beezer 身份任务回归夹具

主要文件：

- `test/fixtures/implementation-contract/**`
- `workflow/tests/contract_implementation_contract.sh`
- 必要时 `workflow/tests/js/verification-readiness.test.js`

以 Beezer 硬件身份统一任务建立一组只表达 scope admission 的最小 fixture。冻结 Goal：

```text
REQ-BEEZER-ID：以 gateway UUID 作为 Beezer 运行与业务关联的统一身份，并移除当前交付中仍可到达的旧身份路径。
```

允许进入 `current-required` 的已证明阻断项：

- operation store 拒绝 UUID；
- production Nuitka CLI 仍走旧身份路径；
- server/worker 存在会破坏统一身份写入的 multiwriter 路径。

没有当前可达性或因果证明时必须保留为 follow-up 的项目：

- 每条命令独立 timeout；
- 通用 nofollow/TOCTOU 框架；
- 通用 fsync framework；
- log canary；
- 强硬件资质校验；
- 三次 candidate recreate。

mutation tests 逐项删除或篡改 authority、acceptance ref、path/evidence ref、reason 与 disposition，证明
只有真实绑定的当前阻断项能进入 Required。

## 6. 依赖顺序与提交边界

```text
Slice 1（新写 v2 + authority slice）
  -> Slice 2（Goal 冻结与 discovery 分类）
  -> Slice 3（current-required 因果证据）
  -> Slice 4（模式与 readiness 统一门禁）
  -> Slice 5（真实任务回归）
  -> reviewer 冻结
  -> plugin cachebuster
  -> 最终验证
```

建议形成三个适中、可独立回退的逻辑提交：

1. `fix(atlas): require v2 for new contract authoring`
2. `fix(atlas): bind scope expansion to causal authority`
3. `refactor(atlas): add bounded clarify authoring`

Beezer fixture 与其验证的行为放在对应提交内，不单独形成“测试补丁”提交。实际提交划分以最终 diff
的单一变更理由为准，不按 slice 机械切分。

## 7. 验证矩阵

先运行专项验证：

```bash
bash workflow/tests/contract_implementation_contract.sh
node --test workflow/tests/js/team-sdd-admission.test.js
node --test workflow/tests/js/feedback-commands.test.js
node --test workflow/tests/js/artifact-scaffold.test.js
node --test workflow/tests/js/root-cli.test.js
node --test workflow/tests/js/verification-readiness.test.js
scripts/check-relative-markdown-links.py --root .
git diff --check
```

内容和 reviewer 结论冻结后，最后更新 Atlas plugin release identity：

```bash
scripts/bump-plugin-cachebuster.sh atlas-workflow
```

cachebuster 完成后不得再修改 `plugins/atlas-workflow/**`；如必须修改，应重新 review 并再次生成新版本。
随后执行仓库要求的最终验证：

```bash
python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/plugin-creator/scripts/validate_plugin.py" plugins/atlas-workflow
workflow/bin/atlas-plugin-integrity manifest --plugin-root plugins/atlas-workflow
bash workflow/tests/contract_repo.sh
bash workflow/tests/contract.sh
```

最终额外核对：

- `git diff --name-only` 不命中 forbidden paths。
- Multica source/runtime hard fingerprint 未变化。
- 未执行安装态、marketplace、cache refresh 或 live-host contract。
- cachebuster 之后 plugin tree 只有预期的 version identity 变化。

## 8. 完成条件

仅当以下条件全部满足，实施任务才可完成：

- 新写合同只能用 v2，历史 v1 strict 兼容测试仍通过。
- Goal-only 与 Finding-aware authority slice 均有正反向测试。
- Clarify 默认 Bounded，三种模式的 artifact/readiness 规则可由机器验证。
- Bounded 的紧凑 v2 contract 不会触发隐式 Contract 升级。
- 安全、数据、权限类 current-required 具备 acceptance 与 path/diff/evidence 因果绑定。
- Beezer fixture 证明真实阻断项进入 Required、推测性强化项留在 follow-up。
- 专项、plugin、repo 和跨域合同测试全部通过。
- Atlas plugin cachebuster 在内容冻结后完成，且之后未再修改 plugin tree。

## 9. 返回条件与残留风险

实施过程中仅在以下情况返回用户决策：

- 现有 controller resolution 字段无法在不改 schema 的情况下表达必要因果证据；
- readiness 无法复用现有 lint，必须引入新的跨层公共 API 或数据迁移；
- 历史无 `authoring_mode` 任务的兼容行为与当前运行约束发生冲突；
- 变更必须触及 forbidden paths、真实安装态或 release mutation。

以下内容不阻塞本计划，可作为后续独立工作：

- 历史 v1 合同迁移；
- 对自然语言因果充分性的自动判定；
- 通用安全证据 taxonomy；
- 安装态或真实 Codex CLI E2E。
