# 合同索引

workflow_id: 20260710-001-atlas-forge-js-first-self-use-workflow-replan
contract_status: in-implementation
mvp_status: implemented
current_authoritative_contract: ./implementation-contract.final.md

source_chain:
- user_direction: 发布安全优先级降低、纯自用、脚本以 JS 为主
- workflow_context: workflow/artifacts/20260710-001-atlas-forge-js-first-self-use-workflow-replan/context.md
- workflow_brainstorm: workflow/artifacts/20260710-001-atlas-forge-js-first-self-use-workflow-replan/brainstorm.md
- workflow_clarify: workflow/artifacts/20260710-001-atlas-forge-js-first-self-use-workflow-replan/clarify.md
- workflow_decision: workflow/artifacts/20260710-001-atlas-forge-js-first-self-use-workflow-replan/team/decision.md
- implementation_plan: ./implementation-plan.md
- active_implementation_contract: ./implementation-contract.final.md

supporting_evidence:
- team_decision: ./decision.md
- architecture_decision: ./decision.md
- staffing: ./staffing.md
- evidence_index: ./evidence/evidence-index.md
- phase_1_conclusion: ./evidence/phase-1-conclusion.md
- phase_2a_conclusion: ./evidence/phase-2a-conclusion.md
- phase_2b_conclusion: ./evidence/phase-2b-conclusion.md
- phase_3_conclusion: ./evidence/phase-3-conclusion.md
- phase_4a_conclusion: ./evidence/phase-4a-conclusion.md
- phase_4b_conclusion: ./evidence/phase-4b-conclusion.md
- workflow_team_decision: workflow/artifacts/20260710-001-atlas-forge-js-first-self-use-workflow-replan/team/decision.md
- workflow_team_staffing: workflow/artifacts/20260710-001-atlas-forge-js-first-self-use-workflow-replan/team/staffing.md
- prior_release_bundle: ../20260710-003-atlas-forge-release-integrity-governance-plan/contract-index.md

authority_rules:
- `implementation-contract.final.md` 是后续实现的唯一范围与验收权威。
- `implementation-plan.md` 解释阶段顺序与提交切片；如与最终合同冲突，以最终合同为准。
- 上一轮 release bundle 只继续约束已存在的 release/integrity 行为，不决定本轮优先级。
- workflow artifacts 是过程证据，不替代本目录中的版本化合同。

next_action:
- Phase 4 已完成；执行 Phase 5 的 memory/team/doctor/install/release 与 Multica-facing migrate/retire/keep-shell 决策。
