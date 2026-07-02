# Daily Agent Benchmark MVP Implementation Plan

Task: `20260702-003-daily-agent-benchmark-mvp`

## Goal

在当前 `atlas-forge` 仓库中实现一个轻量、本地、私有优先的 daily-agent benchmark MVP。

第一版只做 scaffold、脱敏示例、校验脚本、run packet、手工评分汇总和文档。它不是完整数据集，也不是自动 agent runner。

## Non-Goals

- 不实现完整 30-case 数据集。
- 不自动驱动 Codex 或其他 agent。
- 不接入 OpenAI Evals、Inspect AI、Terminal-Bench、Docker、WebArena、OSWorld 或公开 leaderboard。
- 不做 LLM-as-judge。
- 不提交 raw private snapshots、真实客户日志、生产凭据、browser/session data、合同、tokens、cookies 或个人信息。
- 不改 plugin runtime、installer、workflow helper runtime、Multica assets。

## Selected Direction

将 committed scaffold 放在：

```text
tools/daily-agent-benchmark/
docs/daily-agent-benchmark.md
```

真实私有样本默认进入 ignored 路径，例如：

```text
tools/daily-agent-benchmark/cases/private-*/
tools/daily-agent-benchmark/local-cases/
```

真实 run outputs 默认只保留本地，不提交：

```text
tools/daily-agent-benchmark/runs/*
```

## Required Layout

```text
tools/daily-agent-benchmark/
  README.md
  cases/
    README.md
    example-code-review/
      case.yaml
      prompt.md
      oracle.md
      check.sh
      snapshot/
    example-data-check/
      case.yaml
      prompt.md
      oracle.md
      check.sh
      snapshot/
  rubrics/
    code-review.md
    bugfix.md
    ops-debug.md
    data-check.md
    doc-sync.md
    product-reasoning.md
  scripts/
    validate_cases.py
    run_case.sh
    summarize_runs.py
  runs/
    .gitkeep
docs/
  daily-agent-benchmark.md
```

## Case Schema

Every committed case must include:

```yaml
id: daily-example-code-review
title: short human-readable title
category: code-review
source_type: sanitized-synthetic
difficulty: small
privacy: sanitized
requires_network: false
prompt_file: prompt.md
oracle_file: oracle.md
snapshot_dir: snapshot
snapshot_manifest:
  - path: input.txt
    description: sanitized description
check:
  type: none | script | hybrid
  command: optional relative command
redaction_notes:
  - explicit note
scoring:
  total_points: 20
  dimensions:
    correctness: 8
    evidence: 4
    recommendation: 4
    communication: 4
```

Rules:

- 所有文件引用必须是 case 目录内相对路径。
- `source_type` 使用 `sanitized-synthetic`、`sanitized-realistic`、`workflow-derived` 或 `manual`。
- `difficulty` 使用 `small`、`medium` 或 `large`。
- `redaction_notes` 必填且不能为空。
- committed example 不允许使用 `privacy: private`。
- committed example 的 `requires_network` 必须为 `false`。
- `check.type` 使用 `none`、`script` 或 `hybrid`。
- `scoring.total_points` 必须为 20，`dimensions` 分数合计也必须为 20。
- `oracle.md` 必须存在。
- `snapshot_manifest` 必须列出相对 `snapshot_dir` 的必需 snapshot 文件。

## Oracle And Scoring

`oracle.md` 是真实正确性的主锚点，必须包含：

- expected answer or expected findings；
- acceptable variants；
- required evidence；
- disallowed shortcuts；
- hard-fail conditions；
- scoring notes。

`check.sh` 只是 supporting evidence。除非 case 完全可执行验证，否则不得把脚本通过等同于最终正确。

## Acceptance Criteria

| ID | Criterion | Verification |
| --- | --- | --- |
| AC-1 | `.gitignore` 保护 private cases 和 real runs。 | `git check-ignore -q tools/daily-agent-benchmark/runs/example-output.txt` and `git check-ignore -q tools/daily-agent-benchmark/cases/private-sample/case.yaml` |
| AC-2 | docs 解释 goal、non-goals、layout、schema、privacy、snapshot、scoring、run flow、30-case 后续采样。 | `rg -q "privacy|redaction|oracle.md|30" docs/daily-agent-benchmark.md` |
| AC-3 | README 和 cases README 说明如何加 case，以及禁止 snapshot 的内容。 | `test -f tools/daily-agent-benchmark/README.md` and `test -f tools/daily-agent-benchmark/cases/README.md` |
| AC-4 | 两个脱敏 example case 存在。 | `test -f` case files and `test -d snapshot` |
| AC-5 | example case schema 合法，文件存在，scoring 总分 20。 | `python3 tools/daily-agent-benchmark/scripts/validate_cases.py tools/daily-agent-benchmark/cases` |
| AC-6 | validator 拒绝 malformed cases。 | `python3 tools/daily-agent-benchmark/scripts/validate_cases.py --self-test` |
| AC-7 | `run_case.sh` 能为两个 example 生成 run packet。 | run both example cases |
| AC-8 | `summarize_runs.py` 能汇总 run packet，并区分 auto check 与 human score。 | `python3 tools/daily-agent-benchmark/scripts/summarize_runs.py tools/daily-agent-benchmark/runs` |
| AC-9 | 不引入 raw private data 或明显 fake secrets。 | sensitive-term scan and manual classification |
| AC-10 | 文档与 workflow artifacts 不矛盾：v1 不做完整 30-case、不做自动 runner、不接外部 eval runtime。 | `rg` 检查 docs/spec 中的 non-goals |

## Verification Plan

Implementation handoff must run at least:

```bash
git status --short
python3 tools/daily-agent-benchmark/scripts/validate_cases.py tools/daily-agent-benchmark/cases
python3 tools/daily-agent-benchmark/scripts/validate_cases.py --self-test
bash tools/daily-agent-benchmark/scripts/run_case.sh tools/daily-agent-benchmark/cases/example-code-review
bash tools/daily-agent-benchmark/scripts/run_case.sh tools/daily-agent-benchmark/cases/example-data-check
python3 tools/daily-agent-benchmark/scripts/summarize_runs.py tools/daily-agent-benchmark/runs
git check-ignore -q tools/daily-agent-benchmark/runs/example-output.txt
git check-ignore -q tools/daily-agent-benchmark/cases/private-sample/case.yaml
if git check-ignore tools/daily-agent-benchmark/runs/.gitkeep >/tmp/dab-gitkeep-ignore.txt 2>/tmp/dab-gitkeep-ignore.err; then exit 1; else test $? -eq 1; fi
rg -n "password|token|secret|cookie|客户|身份证|合同|生产日志" tools/daily-agent-benchmark docs/daily-agent-benchmark.md
```

Additionally scan committed benchmark files for obvious sensitive fixtures. Policy text may mention banned words; committed realistic secrets or raw private data must not appear.

## Stop Conditions

Stop and ask before implementation continues if:

- a useful example requires unsanitized real private data;
- implementation would need plugin/runtime/installer/workflow helper behavior changes;
- schema constraints conflict with user decisions;
- committed examples require network, external services, or logged-in browser state;
- `.gitignore` cannot protect private cases/runs without hiding committed examples;
- generated snapshots or run outputs contain sensitive data.

## Follow-On Sampling Plan

After scaffold validation, create a separate task for approximately 30 cases:

- workflow artifacts: 12
- chat/Codex directories: 6
- manual daily tasks: 4
- browser/admin-console tasks: 3
- docs/sheets/report tasks: 3
- data verification/report audit tasks: 2

This is a target distribution, not an MVP blocker.

## Implementation Status

Implementation contract 已经补齐，scaffold 已按以下边界实施：

> committed harness + docs + sanitized examples + validation commands; no raw private dataset; no full automation.

## Second Team Review

A second team review was run after `$atlas-workflow:clarify` converted the plan into an execution-ready spec.

Result: go for implementation after a lightweight implementation contract is filled.

No blocking issue was found. The review called out these non-blocking implementation risks:

- `.gitignore` does not yet protect benchmark private cases or real run outputs; AC-1 must add and verify that protection.
- This project handoff is a summary; workflow `spec.md` remains the authoritative acceptance source.
- Privacy scanning in v1 is policy-level and regex-based; future hardening can add pre-commit or secret scanning.
- Manual scoring consistency is not solved in v1; revisit after real benchmark cases exist.

Implementation must still stop if examples require unsanitized private data, external services, logged-in browser state, runtime/plugin changes, or generated artifacts containing sensitive data.

## Post-Implementation Team Review

Post-implementation review lanes verified the implementation commands and found one real documentation mismatch: this handoff and the workflow spec still contained the earlier draft schema. That mismatch has been corrected here so the durable repo handoff, implementation docs, and validator use the same v1 schema.

No code-level blocking finding remains from the review evidence. Residual risks:

- real daily-task case selection is still future work;
- privacy scanning is regex/manual review only in v1;
- manual scoring consistency needs calibration once real cases exist.
