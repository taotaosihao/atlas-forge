# Daily Agent Benchmark

This benchmark is a local, private-first way to measure whether an agent helps with the work that actually appears in daily practice: review, debugging, data checks, documentation drift, and product reasoning. The first version is intentionally small. It gives the repository a stable case format, two sanitized examples, validation scripts, run packets, and summary tooling.

## Goals

- Turn recurring daily tasks into reproducible benchmark cases.
- Preserve the context an agent would normally need: prompt, snapshot, oracle.md, rubric, and optional support checks.
- Keep scoring human-reviewable. A support script can catch objective facts, but it is not the final judge for reasoning-heavy work.
- Make private cases and generated runs ignored by default.

## Non-goals

- Do not implement the full 30-case dataset in v1.
- Do not add an automatic Codex runner, cross-agent runner, leaderboard, LLM judge, or external eval runtime.
- Do not connect OpenAI Evals, Inspect AI, Terminal-Bench, Docker, WebArena, OSWorld, or a public benchmark service.
- Do not commit raw private snapshots, production logs, browser/session exports, contracts, credentials, tokens, cookies, or customer data.

## Layout

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
  scripts/
    validate_cases.py
    run_case.sh
    summarize_runs.py
  runs/
    .gitkeep
```

## Case Schema

Each case lives in its own directory with a `case.yaml`, `prompt.md`, `oracle.md`, optional `check.sh`, and a `snapshot/` directory. The validator enforces the v1 schema:

- `id`: kebab-case id matching the case directory name.
- `title`: short human-readable title.
- `category`: one of `code-review`, `bugfix`, `ops-debug`, `data-check`, `doc-sync`, or `product-reasoning`.
- `source_type`: one of `sanitized-synthetic`, `sanitized-realistic`, `workflow-derived`, or `manual`.
- `difficulty`: one of `small`, `medium`, or `large`.
- `privacy`: `sanitized` or `public` for committed cases. Local private cases should live under an ignored `private-*` directory.
- `requires_network`: `false` for committed v1 cases.
- `prompt_file`, `oracle_file`, `snapshot_dir`: relative paths inside the case directory.
- `snapshot_manifest`: relative file references that must exist under the snapshot directory.
- `check`: `type` is `none`, `script`, or `hybrid`; `command` is required for `script` and `hybrid`.
- `redaction_notes`: non-empty notes explaining why the committed snapshot is safe.
- `scoring`: `total_points: 20` and dimensions that sum to 20.

## Privacy And Redaction

Only commit public or sanitized material. A good benchmark snapshot is small, frozen, explainable, and stripped of live identifiers. Replace real names, hostnames, IDs, account references, and sensitive strings with synthetic equivalents before a case enters the repository.

Use these paths for material that should not be committed:

- `tools/daily-agent-benchmark/cases/private-*`
- `tools/daily-agent-benchmark/local-cases/`
- `tools/daily-agent-benchmark/runs/`

The committed examples are synthetic. They are shaped like real daily tasks, but they do not come from real workflow artifacts, customer systems, browser state, contracts, or production logs.

## Scoring

Every case scores out of 20 points. The case `oracle.md` states the expected answer, acceptable alternatives, hard-fail conditions, and scoring guidance. The generated `scorecard.md` separates:

- `auto_check_status`: result from the support script, if present.
- `human_score_total`: reviewer-entered score after reading the agent response.
- `hard_fail`: reviewer-entered flag for unsafe, fabricated, or scope-breaking answers.

For code review, debugging, and product reasoning, `check.sh` is only supporting evidence. It should verify objective fixture properties or deterministic calculations, not replace the human rubric.

## Run Flow

Validate committed cases:

```bash
python3 tools/daily-agent-benchmark/scripts/validate_cases.py tools/daily-agent-benchmark/cases
```

Create a manual run packet:

```bash
bash tools/daily-agent-benchmark/scripts/run_case.sh tools/daily-agent-benchmark/cases/example-code-review
```

Give the agent the generated run packet prompt and snapshot, write its answer to `agent_response.md`, fill `scorecard.md`, then summarize runs:

```bash
python3 tools/daily-agent-benchmark/scripts/summarize_runs.py tools/daily-agent-benchmark/runs
```

## Follow-on Sampling

Do not sample only from workflow records. That would overfit to tasks that already became formal workflow tasks. A broader follow-on dataset should sample from:

- code review comments and bugfix notes;
- documentation syncs and stale examples;
- data checks and report reconciliation tasks;
- ops/debugging transcripts after redaction;
- product decisions and tradeoff memos;
- repeated manual chores that currently live outside workflow.

The next milestone should build a candidate pool, redact and snapshot each candidate, then select a balanced 10-case set before expanding toward 30. Keep v1 small until the schema and scoring loop feel reliable.
