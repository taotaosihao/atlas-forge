# Cases

Each committed case must be sanitized, reproducible, and small enough for a reviewer to score quickly. The first two examples are synthetic fixtures that model common daily work without using private project data.

## Add A Case

1. Create `cases/<kebab-case-id>/`.
2. Add `case.yaml`, `prompt.md`, `oracle.md`, and `snapshot/`.
3. Add `check.sh` only when a deterministic support check is useful.
4. Keep all file references relative to the case directory.
5. Set `scoring.total_points` to `20`, and make dimension points sum to `20`.
6. Write clear `redaction_notes`.
7. Run `python3 tools/daily-agent-benchmark/scripts/validate_cases.py tools/daily-agent-benchmark/cases`.

## What Not To Snapshot

Do not commit credentials, tokens, cookies, private browser state, customer data, contracts, production logs, raw workflow transcripts, real account IDs, API keys, or hostnames from live systems. Replace them with synthetic values before a case is committed.

For private experiments, use one of the ignored locations:

- `cases/private-*`
- `../local-cases/`

The validator skips `private-*` case directories so local private experiments do not block committed example validation.
