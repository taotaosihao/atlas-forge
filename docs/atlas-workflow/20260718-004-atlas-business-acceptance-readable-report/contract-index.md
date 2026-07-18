# 合同索引

workflow_id: 20260718-004-atlas
contract_status: ready-for-implementation
current_authoritative_contract: ./implementation-contract.final.md

source_chain:
- user_request: 业务验收门禁和证据需要让业务人员看懂；先多 Agent 讨论，再形成可实施方案
- followup_user_request: 实施合同和验收结果都必须提供从底层原理出发、通俗简要的人工审查部分
- prior_machine_contract: ../20260710-003-atlas-forge-release-integrity-governance-plan/implementation-contract.final.md
- prior_phase_evidence: ../20260710-003-atlas-forge-release-integrity-governance-plan/evidence/phase-6-conclusion.md
- team_consensus: ./team-decision.md
- active_implementation_contract: ./implementation-contract.final.md

supporting_evidence:
- team_decision: ./team-decision.md
- staffing: ./staffing.md
- evidence_index: ./evidence/evidence-index.md
- workflow_team_decision: external workflow task `20260718-004-atlas` team decision working record
- workflow_team_staffing: external workflow task `20260718-004-atlas` staffing working record

authority_rules:
- `implementation-contract.final.md` 是后续实现范围、验收、验证和停止条件的唯一权威。
- 合同和报告中同名的“给人工审查者的底层原理摘要”都是强制合同，不是可选文案。
- 既有 Phase 6 合同继续决定 BAF v2 machine semantics；本 bundle 只增加派生阅读层和 presentation policy。
- `team-decision.md` 解释取舍，不得扩展最终合同范围。
- workflow artifacts 是 Git 外工作记录，不替代本 bundle。

next_action:
- 等待用户明确授权实施；获准后从合同指定的 first-code slice 开始，不先扩展 schema、模板体系或证据治理。
