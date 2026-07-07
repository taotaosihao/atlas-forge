# Business Acceptance PR1 Implementation Contract

task_id: 20260707-003-fix-business-acceptance-implementation-plan-and-pr1-contract
title: Business Acceptance PR1 templates-only implementation
created: 2026-07-07

## Scope

- Goal: 新增 business acceptance 扁平模板，为后续 BAF/native team 业务验收 artifacts 提供 markdown 模板。
- Non-goals:
  - 不修改 `plugins/atlas-workflow/skills/team/SKILL.md`。
  - 不修改 `plugins/atlas-workflow/scripts/*`。
  - 不修改 `plugins/atlas-workflow/contracts/*`。
  - 不修改 `plugins/atlas-workflow/README.md` 中任何会宣称 BAF mode 可运行的入口。
  - 不新增 `codex-business-*`。
  - 不新增 `contracts/business-acceptance-first/`。
  - 不新增 `workflow/templates/business-acceptance-first/`。
- Files or surfaces likely affected:
  - `workflow/templates/business-intent.md`
  - `workflow/templates/business-source-coverage.md`
  - `workflow/templates/business-thread-map.md`
  - `workflow/templates/business-object-state-model.md`
  - `workflow/templates/business-action-rulebook.md`
  - `workflow/templates/business-scenario-card.md`
  - `workflow/templates/business-evidence-map.md`
  - `workflow/templates/business-playback.md`
  - `workflow/templates/business-acceptance-report.md`
  - `workflow/templates/business-deviation-log.md`
  - `workflow/templates/business-regression-scenario.md`
  - `workflow/templates/business-verdict.md`
- User-visible behavior: 无 runtime 行为变化；只增加未来 workflow 可使用的模板文件。

## Acceptance Criteria

| ID | Criterion | Required | Verification |
|----|-----------|----------|--------------|
| AC-1 | 正好新增 12 个 `workflow/templates/business-*.md` 模板 | yes | `find workflow/templates -maxdepth 1 -name 'business-*.md'` count = 12 |
| AC-2 | 每个模板包含 `{{TASK_ID}}` 与 `{{CREATED}}` | yes | node template lint |
| AC-3 | `business-scenario-card.md`、`business-playback.md`、`business-regression-scenario.md` 包含 `{{SCENARIO_ID}}` | yes | node template lint |
| AC-4 | 每个模板至少包含 6 行实质字段，不能只有标题或空 section | yes | node template lint |
| AC-5 | 模板不使用业务 `scorecard`、业务 `evidence-manifest` 或 `codex-business` 命名 | yes | forbidden-term check |
| AC-6 | 不创建 nested business templates directory | yes | `test ! -d workflow/templates/business-acceptance-first` |
| AC-7 | baseline contract tests 仍通过 | yes | `bash workflow/tests/contract.sh` |

## Real Validation Plan

| Row | Target | Command or action | Expected result | Evidence path |
|-----|--------|-------------------|-----------------|---------------|
| V-1 | Template directory | `test ! -d workflow/templates/business-acceptance-first` | exit 0 | command output |
| V-2 | Template count and substance | node heredoc below | exactly 12 templates; required variables and substantive fields present | command output |
| V-3 | Forbidden names | `! rg -n 'acceptance-scorecard|evidence-manifest|codex-business' workflow/templates/business-*.md` | exit 0, no matches | command output |
| V-4 | Baseline contract | `bash workflow/tests/contract.sh` | all contract checks pass | command output |
| V-5 | Plugin update dry run | `scripts/update-atlas-workflow-plugin --dry-run` | prints planned sync without writing runtime files | command output |
| V-6 | Git scope | `git diff -- workflow/templates docs/atlas-workflow/20260707-003-business-acceptance-pr1-implementation-contract.md` and `git status --short` | only expected template/docs files changed | command output |

Node template lint:

```bash
node <<'NODE'
const fs = require("fs");
const path = require("path");

const dir = path.join(process.cwd(), "workflow", "templates");
const required = [
  "business-intent.md",
  "business-source-coverage.md",
  "business-thread-map.md",
  "business-object-state-model.md",
  "business-action-rulebook.md",
  "business-scenario-card.md",
  "business-evidence-map.md",
  "business-playback.md",
  "business-acceptance-report.md",
  "business-deviation-log.md",
  "business-regression-scenario.md",
  "business-verdict.md",
];
const files = fs.readdirSync(dir).filter((file) => /^business-.*\.md$/.test(file)).sort();
const missing = required.filter((file) => !files.includes(file));
const extra = files.filter((file) => !required.includes(file));
if (files.length !== 12 || missing.length || extra.length) {
  throw new Error(`template set mismatch; files=${files.length}; missing=${missing.join(",")}; extra=${extra.join(",")}`);
}

for (const file of required) {
  const text = fs.readFileSync(path.join(dir, file), "utf8");
  if (!text.includes("{{TASK_ID}}")) throw new Error(`${file}: missing {{TASK_ID}}`);
  if (!text.includes("{{CREATED}}")) throw new Error(`${file}: missing {{CREATED}}`);
  if (/^(business-scenario-card|business-playback|business-regression-scenario)\.md$/.test(file) && !text.includes("{{SCENARIO_ID}}")) {
    throw new Error(`${file}: missing {{SCENARIO_ID}}`);
  }
  const substantive = text.split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !/^[-|: ]+$/.test(line));
  if (substantive.length < 6) throw new Error(`${file}: not enough substantive fields`);
}
NODE
```

## Edge Cases

| Case | Expected behavior | Required |
|------|-------------------|----------|
| A template naturally discusses `scorecard` as a forbidden term | Avoid the term in templates; prohibition belongs in implementation docs, not runtime templates | yes |
| Scenario-specific templates need `{{SCENARIO_ID}}` | Include it in scenario card, playback, regression scenario | yes |
| A template needs slice linkage later | Do not require `{{SLICE_ID}}` globally in PR1; add it only where the template explicitly has slice references | yes |
| Implementation wants to edit `team/SKILL.md` to advertise templates | Stop; PR4 owns skill activation | yes |

## Failure And Stop Conditions

- Stop and return to plan if PR1 needs changes under `plugins/atlas-workflow/`.
- Stop if adding templates requires a helper script, registry entry, schema, validator, or artifact lint rule.
- Stop if the template count differs from 12.
- Stop if `bash workflow/tests/contract.sh` fails for an unrelated baseline reason and cannot be separated from PR1 changes.
- Stop if forbidden business artifact names are needed to make templates coherent.

## Completion Check

- [ ] Scope stayed inside `workflow/templates/business-*.md`.
- [ ] Required acceptance criteria passed.
- [ ] Required validation rows have evidence.
- [ ] Residual risks are recorded.
