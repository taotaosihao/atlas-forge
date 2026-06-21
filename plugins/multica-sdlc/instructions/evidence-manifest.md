# Evidence Manifest Contract

Multica must maintain an evidence manifest for every PRD-to-draft-PR run when
there is any required acceptance or validation row.

Recommended path inside the implementation worktree or issue artifact set:

```text
.multica/evidence-manifest.json
```

## Required Top-Level Fields

- `issue_id`
- `repo`
- `base_branch`
- `worktree`
- `commit_sha`
- `canonical_prd`
- `prd_sha256`
- `acceptance_rows`
- `validation_rows`
- `artifacts`
- `runtime_targets`
- `required_status`
- `advisory_status`

## Evidence Record Fields

Each required acceptance or validation row must have one or more evidence
records with:

- `acceptance_row_ids`
- `validation_row_ids`
- `required_or_advisory`
- `commit_sha`
- `validator_agent`
- `command`
- `runtime_target`
- `environment`
- `input_or_viewport`
- `observed_result`
- `artifact_or_log_path`
- `evidence_refs`
- `missing_evidence`
- `fallback_only`
- `wrong_commit`

## Blocking Rules

Draft PR is blocked when any required row is:

- missing evidence
- stale
- fallback-only
- static-only for a UI/user-flow row
- validated on the wrong commit SHA
- validated against a mock that bypasses the real path under test
- skipped or marked not applicable without explicit PRD permission

## Task-Type Profiles

- `ui`: real runtime route, screenshots/video when relevant, DOM/layout metrics,
  console errors, failed network requests, responsive or small-desktop viewport,
  and critical interaction evidence.
- `api`: request/response, status code, payload, auth/context, server log when
  relevant.
- `worker`: job invocation, queue/input payload, worker log, side effect or data
  assertion.
- `migration`: migration command, schema/data assertion, rollback or disposable
  database note when relevant.
- `cli`: local CLI invocation, stdout/stderr, exit code, filesystem or API side
  effect when relevant.
- `library`: package import/API call, unit or integration test, type/build
  evidence when relevant.
- `data-contract`: producer input, consumer path, serialized payload, schema or
  compatibility assertion.
- `mixed`: every changed surface must have its own real runtime target.

## Scorecard Fields

Review and E2E scorecards should include these fields when applicable:

- `acceptance_row_ids`
- `validation_row_ids`
- `evidence_refs`
- `runtime_target`
- `commit_sha`
- `required_or_advisory`
- `missing_evidence`
- `fallback_only`
- `wrong_commit`

The manifest is evidence routing infrastructure. It does not replace the
canonical PRD, implementation plan, review reports, E2E reports, or draft PR
body.
