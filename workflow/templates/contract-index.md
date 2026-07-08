# Contract Index

workflow_id: {{WORKFLOW_ID}}
contract_status: {{planning|draft|ready-for-implementation|final|implemented|superseded}}
current_authoritative_contract: ./implementation-contract.final.md

contract_rules:
- 同一 workflow 的 durable docs 放在本目录。
- 进入实施前，`current_authoritative_contract` 必须指向 `implementation-contract.final.md`。
- `implementation-contract.final.md` 必须是 clean rewrite，只包含最终定稿要求。
- review history 保留在 `reviews/` 或 `decisions/`，不得混入 final contract 正文。

source_chain:
- intake:
- clarify:
- team decision:
- implementation plan:

supporting_evidence:
- team_decision: ./team-decision.md
- staffing: ./staffing.md
- evidence_index: ./evidence/evidence-index.md
- workflow_team_decision: {{WORKFLOW_TEAM_DECISION_PATH}}
- workflow_team_staffing: {{WORKFLOW_TEAM_STAFFING_PATH}}

evidence_rules:
- Git evidence is the phase conclusion packet, not the raw run archive.
- Default phase files: `phase-review-report.md`, `defect-queue.md`, `evidence-index.md` or `evidence-manifest.json`, and `gate-checklist.md`.
- Keep raw logs, Playwright JSON, traces, videos, HAR, bulk screenshots, full command output, retry logs, debug JSONL, API dumps, port status, and intermediate repair output outside git by default.
- Target each phase at 10 git evidence files or fewer and 1 MB or less; explain exceptions in `phase-review-report.md`.

artifact_categories:
- durable_handoff: repo docs future implementers should read, including this index and the current authoritative contract.
- phase_conclusion: small gate outputs linked from `supporting_evidence` or `evidence/`.
- workflow_working_notes: intake, clarify drafts, analysis, team rounds, loop ledgers, and repair notes kept under `workflow/artifacts/<task-id>/` unless a confirmed summary is promoted.
- temporary_raw_run: raw machine output kept outside git unless required for a blocking gate.

superseded_contracts:
- path:
  reason:
  superseded_by: ./implementation-contract.final.md

review_history:
- path:
  status:
  disposition:

next_action:
- 按 `current_authoritative_contract` 指向的文件进入下一步。
