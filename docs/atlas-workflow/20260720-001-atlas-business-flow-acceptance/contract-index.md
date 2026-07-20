# 合同索引

workflow_id: 20260720-001-atlas
contract_status: ready-for-implementation
current_authoritative_contract: ./implementation-contract.final.md

source_chain:
- user_request: 业务验收材料必须包含单据完整业务流转流程证据，使业务人员能清晰判断是否符合预期
- predecessor_framework: ../20260719-005-atlas-web-ui-acceptance/implementation-contract.final.md
- predecessor_evidence: ../20260719-005-atlas-web-ui-acceptance/evidence/evidence-index.md
- baf_machine_authority: ../20260710-003-atlas-forge-release-integrity-governance-plan/implementation-contract.final.md
- active_implementation_contract: ./implementation-contract.final.md

supporting_evidence:
- team_decision: ./clarify.md
- staffing: ./staffing.md
- evidence_index: ./evidence/evidence-index.md
- workflow_team_decision: not_applicable; clarification used main Codex only
- workflow_team_staffing: not_applicable; no implementation Team started

authority_rules:
- `implementation-contract.final.md` 是后续实施范围、验收、验证与停止条件的唯一权威。
- 前序 `20260719-005` 的实现与 accepted bundle 保持历史有效，不由本方案追溯改写。
- BAF v2 JSON/JSONL 继续是唯一 machine facts，`business-verdict.json` 继续是唯一最终 verdict。
- review-card v2 和 Markdown 是当前 BAF/evidence 的确定性 human-first 视图，不是平行事实源、鉴真、签字或 verdict。
- `clarify.md` 与 `spec.md` 只解释背景，不得扩展最终合同。

next_action:
- 等待用户明确授权实施；本方案不自动授权代码修改、commit、push、PR、安装、部署或发布。
