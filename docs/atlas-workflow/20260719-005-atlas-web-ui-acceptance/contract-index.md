# 合同索引

workflow_id: 20260719-005-ai-ui-intake
contract_status: ready-for-implementation
current_authoritative_contract: ./implementation-contract.final.md

source_chain:
- user_request: 继续 AI 测试框架讨论并形成可处理真实 UI、设计意图和跨项目开发的通用方案
- confirmed_intake: external workflow task `20260719-005-ai-ui-intake` intake working record
- baf_machine_authority: ../20260710-003-atlas-forge-release-integrity-governance-plan/implementation-contract.final.md
- readable_report_dependency: ../20260718-004-atlas-business-acceptance-readable-report/implementation-contract.final.md
- active_implementation_contract: ./implementation-contract.final.md

supporting_evidence:
- team_decision: ./clarify.md
- staffing: ./staffing.md
- evidence_index: ./evidence/evidence-index.md
- workflow_team_decision: not applicable; user-confirmed intake and main-agent clarify were used
- workflow_team_staffing: not applicable; no multi-agent execution was requested

authority_rules:
- `implementation-contract.final.md` 是本 v1 后续实施范围、验收、验证与停止条件的唯一权威。
- BAF machine semantics 继续由既有 release integrity bundle 决定；本合同只增加 Web execution/audit/evidence 薄层。
- 中文业务报告能力必须复用既有 readable-report 合同，不在本合同中弱化或平行实现。
- `clarify.md` 与 `spec.md` 解释背景，不得扩展最终合同。
- workflow artifacts 是 Git 外工作记录，不替代本 bundle。

next_action:
- 等待用户明确授权实施当前最终合同；clarify 完成不授权代码、commit、push、安装刷新、部署或发布。
