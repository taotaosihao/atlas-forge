# Atlas Clarify 任务膨胀收敛实施计划

workflow_id: `20260720-003-atlas-clarify`
plan_status: `implementation-in-progress`
date: `2026-07-20`
authority: 当前用户确认的收缩方案
artifact_category: `implementation_plan`

## 1. 目标

用最小改动切断 Clarify 的两个实际膨胀入口：

1. 新写合同仍可使用 semantics v1，绕开 v2 scope admission。
2. Clarify 默认要求 workflow notes、repo docs bundle、`contract-index.md`、staffing 和 evidence 等镜像材料。

完成后形成以下最短授权链：

```text
discovery 前冻结的最小 Goal
  -> goal:<requirement-ref> 或 controller-resolved current-required:<finding_id>
  -> 单一 canonical scope source
  -> 新写合同需要时执行 --strict --new-authoring
```

## 2. 非目标

- 不引入 Tiny / Bounded / Contract 三态 CLI。
- 不增加 `authoring_mode`、模式迁移或历史任务生命周期兼容逻辑。
- 不让 readiness 直接调用 contract lint，不改变 `--skip` 通用优先级。
- 不增加 Beezer、UUID、Nuitka、multiwriter 等业务专用 fixture。
- 不迁移或批量重写历史 semantics v1 合同。
- 不新增 controller、finding schema、roadmap 或 scope 状态机。
- 不修改 `plugins/multica-sdlc/**`、`.agents/**`、真实 marketplace、cache 或 runtime。
- 不运行安装态 E2E、`contract_host_install.sh`、push、PR、deploy 或 release。

## 3. 逻辑成果 A：新写 v2 与轻量 authority

### 3.1 Linter

在 `codex-implementation-contract-lint` 增加 `--new-authoring`：

- 普通 `--strict` 保留历史行为，继续接受合法 semantics v1 和 v2。
- `--strict --new-authoring` 只接受 semantics v2。
- `--new-authoring` 未同时提供 `--strict` 时 fail closed。
- 重复参数或带值参数按 CLI usage error 处理。

Authority slice 支持两种最小形态：

| 形态 | 文件 | 可授权范围 |
| --- | --- | --- |
| Goal-only | `brief.json`、`brief.md` | 仅 `goal:<requirement-ref>` |
| Finding-aware | Goal-only，加 `review-verdict.json`、`controller-resolution.json` | Goal 与已解决的 `current-required` |

`review-verdict.json` 和 `controller-resolution.json` 必须同时存在或同时不存在。Goal-only slice
不能为任何 `current-required:<finding_id>` 提供 authority。

### 3.2 Clarify 顺序与单一权威

Clarify 必须：

1. 在 brownfield discovery 前冻结用户要获得的最小 Goal，并分配稳定 requirement ref。
2. 将 discovery finding 分类为 `goal`、controller-resolved `current-required` 或 `follow-up`。
3. 默认将新 finding 保留为 follow-up；review severity、`required_fix` 或自然语言“必须”不构成 authority。
4. 只选择一个 `canonical_scope_source`。优先复用已有 issue、PRD、design 或 contract；缺失时使用
   `clarify.md`。
5. 不为镜像同一范围而创建或更新 `context.md`、`spec.md`、`decision.md` 或 repo doc。
6. 只有明确的 handoff、audit、release 或既有项目文档权威需要时，才创建 repo docs bundle、
   `contract-index.md`、staffing 或 durable evidence index。
7. 新写 implementation contract 必须运行 `--strict --new-authoring`；历史 v1 继续使用普通
   `--strict`。

### 3.3 文件边界

- `plugins/atlas-workflow/scripts/codex-implementation-contract-lint`
- `plugins/atlas-workflow/skills/clarify/SKILL.md`
- `workflow/tests/contract_implementation_contract.sh`
- 仅在确有必要时修改 `workflow/templates/clarify.md`

### 3.4 验收

- 历史 v1 fixture 在普通 `--strict` 下继续通过。
- 同一 v1 fixture 在 `--strict --new-authoring` 下失败。
- Goal-only v2 contract 通过 Goal-only authority slice。
- Goal-only slice 引用 current-required 时失败。
- verdict/resolution 只存在一份时失败。
- Clarify guidance 明确 Goal-before-discovery、finding 默认 follow-up、单一 canonical scope source
  和按价值创建 bundle。

## 4. 逻辑成果 B：Safety admission 的最小缺口

现有 `safety-data-permission-risk` 已要求：

- canonical safety/data/permission invariant；
- 当前 diff；
- canonical `global-constraints.md`；
- constraints SHA 绑定。

本次只补：

- 至少一个当前 `acceptance:<ref>`；
- `reason` 必须非空且不是 `TBD`、`TODO`、`placeholder`、`-`、`待定` 等占位值。

机器只验证引用存在、格式和绑定，不判断 reason 的自然语言真伪，不新增“因果充分性”模型。

### 4.1 文件边界

- `plugins/atlas-workflow/contracts/team-sdd/validators/controller-resolution.js`
- `workflow/tests/js/team-sdd-admission.test.js`
- 现有合同测试中只增加直接覆盖 guidance 的最小断言

### 4.2 验收

- 保留现有 invariant、current diff、constraints path/SHA 正反向测试。
- 缺少当前 acceptance ref 的 safety current-required 失败。
- 空白或占位 reason 失败。
- 简短但真实、非占位的 reason 通过，不设置任意最小字数。
- 通用 follow-up 不因 safety 分类而自动进入 Required。

## 5. Follow-up

以下内容移出当前 Required，仅在独立证据和授权下再做：

- Tiny / Bounded / Contract CLI 三态；
- `authoring_mode` 和历史模式兼容；
- readiness 直接调用 lint；
- `--skip` 与 contract gate 的通用优先级；
- Beezer 专用 fixture 或 mutation matrix；
- 历史 v1 迁移；
- 安装态或真实 Codex CLI E2E。

## 6. 验证与发布身份

先运行专项检查：

```bash
bash workflow/tests/contract_implementation_contract.sh
node --test workflow/tests/js/team-sdd-admission.test.js
scripts/check-relative-markdown-links.py --root .
git diff --check
```

内容和 review 结论冻结后，最后更新 Atlas plugin release identity：

```bash
scripts/bump-plugin-cachebuster.sh atlas-workflow
```

cachebuster 后不得再修改 `plugins/atlas-workflow/**`。随后运行：

```bash
python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/plugin-creator/scripts/validate_plugin.py" plugins/atlas-workflow
workflow/bin/atlas-plugin-integrity manifest --plugin-root plugins/atlas-workflow
bash workflow/tests/contract_repo.sh
bash workflow/tests/contract.sh
```

最终确认 diff 不命中 forbidden paths，且未修改 Multica source/runtime 或真实安装态。

## 7. 完成条件

- 逻辑成果 A、B 的专项测试全部通过。
- Clarify 默认只维护一个 canonical scope source，完整 bundle 不再是非 tiny 工作的默认要求。
- 新写合同必须使用 v2，历史 v1 兼容保持不变。
- Safety current-required 在既有门禁上补齐 acceptance 和非占位 reason。
- plugin cachebuster 在内容冻结后完成，之后 plugin tree 无内容改动。
- 官方 validator、manifest、`contract_repo.sh` 和 `workflow/tests/contract.sh` 全部通过。
