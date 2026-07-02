# Daily Agent Benchmark

This directory contains a small local benchmark scaffold for daily agent work. It is designed for sanitized cases first: prompt, snapshot, oracle, rubric, optional support check, manual response, and manual scorecard.

## Quick Start

```bash
python3 tools/daily-agent-benchmark/scripts/validate_cases.py tools/daily-agent-benchmark/cases
bash tools/daily-agent-benchmark/scripts/run_case.sh tools/daily-agent-benchmark/cases/example-code-review
bash tools/daily-agent-benchmark/scripts/run_case.sh tools/daily-agent-benchmark/cases/example-data-check
python3 tools/daily-agent-benchmark/scripts/summarize_runs.py tools/daily-agent-benchmark/runs
```

Generated run packets are written under `runs/`, which is ignored except for `.gitkeep`.

## What A Case Contains

- `case.yaml`: metadata, schema, privacy notes, scoring dimensions, and optional check command.
- `prompt.md`: the exact prompt to give the agent.
- `snapshot/`: the frozen sanitized files the agent may inspect.
- `oracle.md`: reviewer-only expected answer and scoring guide.
- `check.sh`: optional support check for deterministic fixture facts.

Use `cases/private-*` or `local-cases/` for local-only material. Those paths are ignored by git.

## Review Loop

1. Validate cases before running them.
2. Generate a run packet with `run_case.sh`.
3. Give the agent only the generated prompt and snapshot. Keep `oracle.md` for scoring.
4. Write the agent output to `agent_response.md`.
5. Fill `scorecard.md`.
6. Run `summarize_runs.py` to compare auto checks and human scores.

Keep the benchmark boring on purpose. The value comes from stable cases, explicit rubrics, and careful redaction, not from a large dataset on day one.
