# Multica UI And Real-Chain Validation Implementation Plan

Owner: Multica SDLC Autopilot
Source backlog item: Atlas remaining item 1, "UI/design/real-chain validation harness"
Status: implemented as Multica instruction/evidence contract

## Objective

Make Multica's validation loop produce mandatory, structured evidence for UI,
design, and real-chain behavior before draft PR. Atlas should specify required
validation rows and ingest the result, but Multica owns execution, review, E2E,
repair, and PR-ready evidence.

## Non-Goals

- Do not move large-task UI/E2E execution into Atlas.
- Do not treat static design artifacts, loaded assets, or code inspection as
  sufficient evidence for required UI rows.
- Do not require screenshots for non-UI-only tasks; require the appropriate
  runtime evidence instead.
- Do not merge, deploy, or clean worktrees before human/PR boundary rules allow.

## Phase M1: Evidence Manifest Schema

Output:

- Add a Multica evidence manifest contract, for example
  `.multica/evidence-manifest.json` in the task worktree or an issue artifact.
- Required top-level fields:
  - `issue_id`
  - `repo`
  - `commit_sha`
  - `canonical_prd`
  - `acceptance_rows`
  - `validation_rows`
  - `artifacts`
  - `runtime_targets`
  - `required_status`
  - `advisory_status`

Acceptance:

- Every required acceptance row has one or more evidence records.
- Each evidence record names command, runtime target, environment, observed
  result, artifact/log path, validator agent, and commit SHA.
- Missing, stale, fallback-only, or wrong-commit required evidence blocks the
  PR-ready gate.

Verification:

```bash
python3 -m json.tool .multica/evidence-manifest.json
```

## Phase M2: UI Evidence Collector

Output:

- Add a reusable UI evidence lane for SDLC E2E agents.
- For UI/UX PRDs, collect:
  - screenshot paths
  - GIF/MP4 paths when interaction, animation, responsive behavior, or multi-step flow changed
  - DOM/layout metrics
  - viewport/device coverage, including at least one narrow or small-desktop viewport
  - console errors
  - failed network requests
  - critical interaction results mapped to acceptance rows

Acceptance:

- Required UI rows cannot pass with only asset-load checks or static reasoning.
- For framework apps such as Frappe/ERPNext Desk, evidence must come from the
  real runtime route, not from a static HTML mock.
- If browser automation cannot run, E2E reports a BLOCKER with exact missing
  prerequisites rather than downgrading the row.

Verification:

```bash
rg -n "screenshot|DOM/layout|viewport|console|network|fallback-only" \
  /home/gewu/.agents/multica-sdlc/instructions \
  /home/gewu/.agents/multica-sdlc/generated
```

## Phase M3: Real-Chain Evidence Collector

Output:

- Add task-type validation profiles:
  - `ui`
  - `api`
  - `worker`
  - `migration`
  - `cli`
  - `library`
  - `data-contract`
  - `mixed`
- Each profile maps acceptance rows to real runtime targets.

Acceptance:

- Mock data must trigger the real system path under test. It may not directly
  write final derived state to prove success.
- Backend/API/worker/data changes require command output, request/response,
  server/job/migration log, or data assertion evidence.
- For `gearjob`, `beezer`, and `hive`, local deployment/runtime startup remains
  required before draft PR.

Verification:

```bash
rg -n "runtime target|request/response|job log|migration|database assertion|mock" \
  /home/gewu/.agents/multica-sdlc/instructions \
  /home/gewu/.agents/multica-sdlc/generated
```

## Phase M4: Review/E2E Scorecard Integration

Output:

- Extend scorecards to include:
  - `acceptance_row_ids`
  - `evidence_refs`
  - `runtime_target`
  - `commit_sha`
  - `required_or_advisory`
  - `missing_evidence`
  - `fallback_only`
- Keep writing to `/home/gewu/.agents/multica-sdlc/agent-scorecards.jsonl`
  atomically with the existing lock.

Acceptance:

- Reviewers mark BLOCKING when required evidence is absent, stale, fallback-only,
  static-only, or tied to the wrong commit SHA.
- E2E agents mark FAIL/BLOCKER for skipped required checks.
- Leader can aggregate scorecards into the PR-ready gate.

Verification:

```bash
python3 - <<'PY'
import json
from pathlib import Path
path = Path('/home/gewu/.agents/multica-sdlc/agent-scorecards.jsonl')
if path.exists():
    for raw in path.read_text(encoding='utf-8').splitlines()[-20:]:
        json.loads(raw)
PY
```

## Phase M5: PR-Ready Gate Enforcement

Output:

- Add a PR-ready evidence audit step that reads the evidence manifest and
  scorecards before draft PR creation.
- Draft PR body must include:
  - evidence manifest path
  - required acceptance matrix status
  - UI artifacts when UI work changed
  - runtime artifacts when backend/API/worker/data changed
  - unresolved advisory risks

Acceptance:

- Any required row without evidence blocks draft PR.
- Any required UI row with only static or fallback validation blocks draft PR.
- Any required real-chain row that bypasses the real runtime path blocks draft PR.

Verification:

```bash
rg -n "evidence manifest|PR-ready|fallback-only|wrong commit|required row" \
  /home/gewu/.agents/multica-sdlc
```

## Rollout Order

1. Implement evidence manifest schema and fixture tests.
2. Update leader/planner/reviewer/E2E instructions to require manifest rows.
3. Add UI evidence collector requirements to E2E agents.
4. Add real-chain task-type profiles.
5. Extend scorecard schema.
6. Add PR-ready evidence audit.
7. Run one controlled UI PRD and one controlled backend PRD through the flow.

## Exit Criteria

- Multica can run a UI/UX PRD and produce screenshots, DOM metrics, console/network checks, viewport coverage, and critical interaction evidence on the final commit SHA.
- Multica can run a non-UI PRD and produce appropriate runtime evidence without screenshot requirements.
- A missing required UI or real-chain evidence row blocks draft PR.
- Atlas result ingest can point to the evidence manifest after Multica returns a draft PR or blocker.
