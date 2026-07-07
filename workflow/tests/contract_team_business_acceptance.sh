# shellcheck shell=bash
# Sourced by contract.sh. Requires TMP_ROOT, pass, expect_fail, and setup_repo.

previous_codex_workflow_root="$CODEX_WORKFLOW_ROOT"
business_root="$TMP_ROOT/business-workflow"
export CODEX_WORKFLOW_ROOT="$business_root"

validate_json_bin="$ATLAS_FORGE_ROOT/plugins/atlas-workflow/scripts/codex-team-validate-json"
artifact_lint_bin="$ATLAS_FORGE_ROOT/plugins/atlas-workflow/scripts/codex-team-artifact-lint"
business_fixture_dir="$ATLAS_FORGE_ROOT/test/fixtures/team-sdd/business-acceptance"
business_repo="$TMP_ROOT/business-repo"
setup_repo "$business_repo"
business_base="$(git -C "$business_repo" rev-parse HEAD)"

business_valid_fixture() {
  local type="$1"
  local file="$2"
  node "$validate_json_bin" --type "$type" --file "$business_fixture_dir/valid/$file" >/dev/null
}

business_invalid_fixture() {
  local label="$1"
  local type="$2"
  local file="$3"
  expect_fail "$label" node "$validate_json_bin" --type "$type" --file "$business_fixture_dir/invalid/$file"
}

for validator in "$ATLAS_FORGE_ROOT"/plugins/atlas-workflow/contracts/team-sdd/validators/business-*.js; do
  node --check "$validator" >/dev/null
done

node --check "$validate_json_bin" >/dev/null
node --check "$artifact_lint_bin" >/dev/null

node "$validate_json_bin" --help > "$TMP_ROOT/business-validate-json-help.out"
grep -q "business-intent" "$TMP_ROOT/business-validate-json-help.out"
grep -q "business-source-coverage" "$TMP_ROOT/business-validate-json-help.out"
grep -q "business-thread-map" "$TMP_ROOT/business-validate-json-help.out"
grep -q "business-object-state-model" "$TMP_ROOT/business-validate-json-help.out"
grep -q "business-action-rulebook" "$TMP_ROOT/business-validate-json-help.out"
grep -q "business-scenario-card" "$TMP_ROOT/business-validate-json-help.out"
grep -q "business-evidence-map" "$TMP_ROOT/business-validate-json-help.out"
grep -q "business-acceptance-report" "$TMP_ROOT/business-validate-json-help.out"
grep -q "business-deviation-log" "$TMP_ROOT/business-validate-json-help.out"
grep -q "business-regression-scenario" "$TMP_ROOT/business-validate-json-help.out"
grep -q "business-verdict" "$TMP_ROOT/business-validate-json-help.out"

business_valid_fixture business-intent business-intent.json
business_valid_fixture business-source-coverage business-source-coverage.json
business_valid_fixture business-thread-map business-thread-map.json
business_valid_fixture business-object-state-model business-object-state-model.json
business_valid_fixture business-action-rulebook business-action-rulebook.json
business_valid_fixture business-scenario-card business-scenario-card.json
business_valid_fixture business-evidence-map business-evidence-map.json
business_valid_fixture business-acceptance-report business-acceptance-report.json
business_valid_fixture business-deviation-log business-deviation-log-entry.json
business_valid_fixture business-regression-scenario business-regression-scenario.json
business_valid_fixture business-verdict business-verdict.accepted.json
business_valid_fixture business-verdict business-verdict.blocked.json

business_invalid_fixture "business intent missing schema_version" business-intent missing-schema-version.business-intent.json
business_invalid_fixture "business intent missing task_id" business-intent missing-task-id.business-intent.json
business_invalid_fixture "business intent missing business_goal" business-intent missing-business-goal.business-intent.json
business_invalid_fixture "business intent unknown property" business-intent unknown-property.business-intent.json
business_invalid_fixture "business source coverage missing schema_version" business-source-coverage missing-schema-version.business-source-coverage.json
business_invalid_fixture "business source coverage missing task_id" business-source-coverage missing-task-id.business-source-coverage.json
business_invalid_fixture "business source coverage missing sources" business-source-coverage missing-sources.business-source-coverage.json
business_invalid_fixture "business source coverage unknown property" business-source-coverage unknown-property.business-source-coverage.json
business_invalid_fixture "business thread map missing schema_version" business-thread-map missing-schema-version.business-thread-map.json
business_invalid_fixture "business thread map missing task_id" business-thread-map missing-task-id.business-thread-map.json
business_invalid_fixture "business thread map missing threads" business-thread-map missing-threads.business-thread-map.json
business_invalid_fixture "business thread map unknown property" business-thread-map unknown-property.business-thread-map.json
business_invalid_fixture "business object state model missing schema_version" business-object-state-model missing-schema-version.business-object-state-model.json
business_invalid_fixture "business object state model missing task_id" business-object-state-model missing-task-id.business-object-state-model.json
business_invalid_fixture "business object state model missing objects" business-object-state-model missing-objects.business-object-state-model.json
business_invalid_fixture "business object state model unknown property" business-object-state-model unknown-property.business-object-state-model.json
business_invalid_fixture "business action rulebook missing schema_version" business-action-rulebook missing-schema-version.business-action-rulebook.json
business_invalid_fixture "business action rulebook missing task_id" business-action-rulebook missing-task-id.business-action-rulebook.json
business_invalid_fixture "business action rulebook missing actions" business-action-rulebook missing-actions.business-action-rulebook.json
business_invalid_fixture "business action rulebook unknown property" business-action-rulebook unknown-property.business-action-rulebook.json
business_invalid_fixture "business scenario card missing schema_version" business-scenario-card missing-schema-version.business-scenario-card.json
business_invalid_fixture "business scenario card missing task_id" business-scenario-card missing-task-id.business-scenario-card.json
business_invalid_fixture "business scenario card missing scenario_id" business-scenario-card missing-scenario-id.business-scenario-card.json
business_invalid_fixture "business scenario card unknown property" business-scenario-card unknown-property.business-scenario-card.json
business_invalid_fixture "business evidence map missing schema_version" business-evidence-map missing-schema-version.business-evidence-map.json
business_invalid_fixture "business evidence map missing task_id" business-evidence-map missing-task-id.business-evidence-map.json
business_invalid_fixture "business evidence map missing evidence_refs" business-evidence-map missing-evidence-refs.business-evidence-map.json
business_invalid_fixture "business evidence map unknown property" business-evidence-map unknown-property.business-evidence-map.json
business_invalid_fixture "business acceptance report missing schema_version" business-acceptance-report missing-schema-version.business-acceptance-report.json
business_invalid_fixture "business acceptance report missing task_id" business-acceptance-report missing-task-id.business-acceptance-report.json
business_invalid_fixture "business acceptance report invalid rating level" business-acceptance-report invalid-rating-level.business-acceptance-report.json
business_invalid_fixture "business acceptance report unknown property" business-acceptance-report unknown-property.business-acceptance-report.json
business_invalid_fixture "business deviation log missing schema_version" business-deviation-log missing-schema-version.business-deviation-log-entry.json
business_invalid_fixture "business deviation log missing task_id" business-deviation-log missing-task-id.business-deviation-log-entry.json
business_invalid_fixture "business deviation log missing deviation_type" business-deviation-log missing-deviation-type.business-deviation-log-entry.json
business_invalid_fixture "business deviation log unknown property" business-deviation-log unknown-property.business-deviation-log-entry.json
business_invalid_fixture "business regression scenario missing schema_version" business-regression-scenario missing-schema-version.business-regression-scenario.json
business_invalid_fixture "business regression scenario missing task_id" business-regression-scenario missing-task-id.business-regression-scenario.json
business_invalid_fixture "business regression scenario missing scenario_id" business-regression-scenario missing-scenario-id.business-regression-scenario.json
business_invalid_fixture "business regression scenario unknown property" business-regression-scenario unknown-property.business-regression-scenario.json
business_invalid_fixture "business verdict missing schema_version" business-verdict missing-schema-version.business-verdict.json
business_invalid_fixture "business verdict missing task_id" business-verdict missing-task-id.business-verdict.json
business_invalid_fixture "business verdict invalid verdict" business-verdict invalid-verdict.business-verdict.json
business_invalid_fixture "business verdict unknown property" business-verdict unknown-property.business-verdict.json

expect_fail "business from-message unsupported" node "$validate_json_bin" --type business-intent --from-message "$business_fixture_dir/valid/business-intent.json"

write_sdd_lint_fixture() {
  local task="$1"
  local artifact="$business_root/artifacts/$task"
  local sdd_dir="$artifact/team/sdd"
  local slice_dir="$sdd_dir/slices/slice-001"
  mkdir -p "$slice_dir"
  printf '%s\n' \
    '{"schema_version":1,"timestamp":"2026-07-07T00:00:00.000Z","event":"slice_started","task_id":"'"$task"'","slice_id":"slice-001"}' \
    > "$sdd_dir/progress.jsonl"
  cat > "$slice_dir/brief.json" <<JSON
{
  "schema_version": 1,
  "task_id": "$task",
  "slice_id": "slice-001",
  "repo": "$business_repo",
  "base_sha": "$business_base",
  "objective": "Business acceptance lint fixture",
  "requirements_path": "docs/prd.md",
  "global_constraints_path": "team/sdd/global-constraints.md",
  "owned_paths": ["plugins/atlas-workflow/contracts/team-sdd"],
  "forbidden_paths": ["plugins/atlas-workflow/skills"],
  "acceptance_refs": ["AC-1"],
  "required_checks": ["workflow/tests/contract.sh"],
  "commit_policy": "required_for_file_changes",
  "max_question_rounds": 1,
  "fix_loop_policy": "unbounded_until_clean_or_terminal",
  "output_contract": "final_message_json_only"
}
JSON
}

write_business_acceptance_fixture() {
  local task="$1"
  local mode="$2"
  local artifact="$business_root/artifacts/$task"
  local acceptance_dir="$artifact/team/acceptance"
  local scenarios_dir="$acceptance_dir/scenarios"
  local evidence_dir="$acceptance_dir/evidence"
  local verdict="accepted"
  local technical_gate_status="passed"
  local blocking_gate_failed="false"

  mkdir -p "$scenarios_dir" "$evidence_dir"
  printf '%s\n' '# Playback evidence' '' 'Business playback confirms the required scenario.' > "$evidence_dir/playback.md"

  if [[ "$mode" == "conditional" ]]; then
    verdict="conditionally_accepted"
  elif [[ "$mode" == "rejected" ]]; then
    verdict="rejected"
  elif [[ "$mode" == "blocked" ]]; then
    verdict="blocked"
    technical_gate_status="blocked"
    blocking_gate_failed="true"
  elif [[ "$mode" == "failed-technical-gate" ]]; then
    technical_gate_status="failed"
    blocking_gate_failed="true"
  elif [[ "$mode" == "conditional-failed-technical-gate" ]]; then
    verdict="conditionally_accepted"
    technical_gate_status="failed"
    blocking_gate_failed="true"
  fi

  if [[ "$mode" != "missing-intent" ]]; then
    cat > "$acceptance_dir/business-intent.json" <<JSON
{
  "schema_version": 1,
  "task_id": "$task",
  "business_goal": "Close the business acceptance loop",
  "agent_responsibility": "Judge business closure without replacing technical SDD gates",
  "excluded_scope": ["Customer-specific implementation"],
  "stakeholders": ["operator", "reviewer"],
  "success_definition": ["Scenario evidence maps to the final verdict"],
  "risk_boundaries": ["Technical gates remain blocking"]
}
JSON
  fi

  if [[ "$mode" != "missing-scenario" ]]; then
    cat > "$scenarios_dir/business-scenario-card.close-loop.json" <<JSON
{
  "schema_version": 1,
  "task_id": "$task",
  "scenario_id": "close-loop",
  "business_goal": "Close loop scenario",
  "entry_role": "operator",
  "initial_state": ["Implementation evidence is ready"],
  "trigger": "Implementation evidence is ready",
  "expected_agent_behavior": ["Review source refs", "Map evidence", "Record verdict"],
  "expected_business_state": ["Business acceptance can be judged"],
  "technical_hard_gates": ["workflow/tests/contract.sh"],
  "business_evidence_required": ["ev-playback"],
  "technical_evidence_required": ["contract output"],
  "pass_criteria": ["Verdict is backed by evidence"],
  "fail_criteria": ["Missing scenario evidence"]
}
JSON
  fi

  if [[ "$mode" != "missing-evidence-map" ]]; then
    cat > "$acceptance_dir/business-evidence-map.json" <<JSON
{
  "schema_version": 1,
  "task_id": "$task",
  "evidence_refs": [
    {
      "evidence_id": "ev-playback",
      "scenario_id": "close-loop",
      "source_type": "local",
      "description": "Playback evidence for the close loop scenario",
      "evidence_path": "team/acceptance/evidence/playback.md",
      "result": "passed"
    },
    {
      "evidence_id": "ev-manual",
      "scenario_id": "close-loop",
      "source_type": "manual",
      "description": "Manual stakeholder confirmation",
      "evidence_path": "manual://stakeholder-confirmation",
      "result": "passed"
    }
  ]
}
JSON
  fi

  cat > "$acceptance_dir/business-acceptance-report.json" <<JSON
{
  "schema_version": 1,
  "task_id": "$task",
  "scenario_results": [
    {
      "scenario_id": "close-loop",
      "business_result": "$technical_gate_status",
      "technical_gate_result": "$technical_gate_status",
      "score": 90
    }
  ],
  "technical_gate_summary": {
    "blocking_failure_count": $([[ "$blocking_gate_failed" == "true" ]] && printf '1' || printf '0'),
    "failed_gates": []
  },
  "rating": {
    "total": 90,
    "level": "$verdict",
    "blocking_technical_gate_failed": $blocking_gate_failed
  },
  "open_deviations": []
}
JSON

  cat > "$acceptance_dir/business-verdict.json" <<JSON
{
  "schema_version": 1,
  "task_id": "$task",
  "verdict": "$verdict",
  "technical_gate_status": "$technical_gate_status",
  "business_acceptance_status": "$technical_gate_status",
  "required_followups": []
}
JSON

  printf '%s\n' \
    '{"schema_version":1,"task_id":"'"$task"'","deviation_id":"dev-001","deviation_type":"scope_mismatch","severity":"P3","status":"open","scenario_id":"close-loop","description":"Fixture deviation","owner":"atlas","evidence_refs":["ev-playback"],"resolution_plan":"Retest after fixture repair"}' \
    > "$acceptance_dir/business-deviation-log.jsonl"
}

write_sdd_lint_fixture business-acceptance-valid
write_business_acceptance_fixture business-acceptance-valid accepted
node "$artifact_lint_bin" --task business-acceptance-valid --business-acceptance >/dev/null
node "$artifact_lint_bin" --task business-acceptance-valid >/dev/null

write_sdd_lint_fixture business-acceptance-missing-intent
write_business_acceptance_fixture business-acceptance-missing-intent missing-intent
expect_fail "business lint rejects missing intent" node "$artifact_lint_bin" --task business-acceptance-missing-intent --business-acceptance

write_sdd_lint_fixture business-acceptance-missing-scenario
write_business_acceptance_fixture business-acceptance-missing-scenario missing-scenario
expect_fail "business lint rejects missing scenario" node "$artifact_lint_bin" --task business-acceptance-missing-scenario --business-acceptance

write_sdd_lint_fixture business-acceptance-missing-evidence-map
write_business_acceptance_fixture business-acceptance-missing-evidence-map missing-evidence-map
expect_fail "business lint rejects accepted without evidence map" node "$artifact_lint_bin" --task business-acceptance-missing-evidence-map --business-acceptance
node "$artifact_lint_bin" --task business-acceptance-missing-evidence-map >/dev/null

write_sdd_lint_fixture business-acceptance-failed-gate
write_business_acceptance_fixture business-acceptance-failed-gate failed-technical-gate
expect_fail "business lint rejects accepted with failed technical gate" node "$artifact_lint_bin" --task business-acceptance-failed-gate --business-acceptance

write_sdd_lint_fixture business-acceptance-conditional-failed-gate
write_business_acceptance_fixture business-acceptance-conditional-failed-gate conditional-failed-technical-gate
expect_fail "business lint rejects conditional with failed technical gate" node "$artifact_lint_bin" --task business-acceptance-conditional-failed-gate --business-acceptance

write_sdd_lint_fixture business-acceptance-missing-local-evidence
write_business_acceptance_fixture business-acceptance-missing-local-evidence accepted
rm "$business_root/artifacts/business-acceptance-missing-local-evidence/team/acceptance/evidence/playback.md"
expect_fail "business lint rejects missing local evidence path" node "$artifact_lint_bin" --task business-acceptance-missing-local-evidence --business-acceptance

write_sdd_lint_fixture business-acceptance-invalid-jsonl
write_business_acceptance_fixture business-acceptance-invalid-jsonl accepted
printf '%s\n' '{not-json' >> "$business_root/artifacts/business-acceptance-invalid-jsonl/team/acceptance/business-deviation-log.jsonl"
expect_fail "business lint rejects invalid deviation jsonl" node "$artifact_lint_bin" --task business-acceptance-invalid-jsonl --business-acceptance

export CODEX_WORKFLOW_ROOT="$previous_codex_workflow_root"
pass "business acceptance validators and artifact lint"
