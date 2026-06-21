# SDLC Agent Scorecards

Review agents append one JSON object per reviewed agent-produced artifact to:

`/home/gewu/.agents/multica-sdlc/agent-scorecards.jsonl`

Use:

```sh
flock /home/gewu/.agents/multica-sdlc/agent-scorecards.lock -c 'printf "%s\n" "$SCORECARD_JSON" >> /home/gewu/.agents/multica-sdlc/agent-scorecards.jsonl'
```

Required keys:

- `timestamp`: ISO-8601 timestamp.
- `issue_id`: Multica issue ID when known.
- `repo`: repository path or name.
- `commit_sha`: reviewed commit SHA when applicable.
- `artifact_type`: `plan`, `code`, `repair`, `test`, `e2e`, `docs`, `pr_body`, or `other`.
- `artifact_ref`: short pointer to the reviewed comment, file, commit, or report.
- `evaluated_agent`: object with `id`, `name`, `role`, `model`, `runtime_id`.
- `reviewer_agent`: object with `id`, `name`, `role`, `model`, `runtime_id`.
- `score`: integer or decimal from 0 to 10.
- `result`: `CLEAN`, `BLOCKED`, `PASS`, `FAIL`, or `INFO`.
- `reason`: one short sentence.
- `strength`: one short sentence or `null`.
- `gap`: one short sentence or `null`.

The score is for later capability analysis across agent types. It does not replace the SDLC clean gate.
