# Contract Index

workflow_id: 20260710-003-atlas-forge
contract_status: implemented
current_authoritative_contract: ./implementation-contract.final.md

source_chain:
- planning_analysis: workflow/artifacts/20260710-002-atlas-forge/analysis.md
- planning_clarify: workflow/artifacts/20260710-003-atlas-forge/spec.md
- planning_team_decision: workflow/artifacts/20260710-003-atlas-forge/team/decision.md
- planning_implementation_plan: ./implementation-plan.md
- active_implementation_contract: ./implementation-contract.final.md
- active_implementation_task: workflow/artifacts/20260710-004-atlas-forge/spec.md

supporting_evidence:
- team_decision: ./team-decision.md
- staffing: ./staffing.md
- evidence_index: ./evidence/evidence-index.md
- native_review: ./reviews/native-plan-review.md
- workflow_team_decision: workflow/artifacts/20260710-003-atlas-forge/team/decision.md
- workflow_team_staffing: workflow/artifacts/20260710-003-atlas-forge/team/staffing.md

artifact_categories:
- durable_handoff: `README.md`、`implementation-plan.md`、`team-decision.md`、`staffing.md` 和本索引。
- phase_conclusion: 后续每个实施 phase 的 review、defect queue、gate checklist 和 evidence index。
- workflow_working_notes: workflow artifacts、native round 和实现期间的临时分析。
- temporary_raw_run: 隔离安装目录、命令全量输出和失败重试日志，不进入 Git。

next_action:
- Phase 0-7 已完成；后续变更按当前合同执行 release identity、hermetic verification 和 Multica 零修改门禁。
