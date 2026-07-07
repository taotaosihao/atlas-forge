# Contract Index

workflow_id: 20260707-006-docs-folder-final-contract-normalization
contract_status: planning
current_authoritative_contract: ./implementation-plan.md

contract_rules:
- 同一 workflow 的 durable docs 放在本目录。
- 后续进入实施前，必须新增或生成 `implementation-contract.final.md`，并把 `current_authoritative_contract` 指向它。
- final contract 必须是 clean rewrite，不得把旧合同和 review 修订意见堆叠在正文里。

source_chain:
- clarify task: 20260707-006-atlas-workflow-docs-folder-and-final-contract-normalization-plan
- implementation plan: ./implementation-plan.md

superseded_contracts: []

review_history: []

next_action:
- 按 ./implementation-plan.md 的 PR sequence 实施 skill 规则和模板。
