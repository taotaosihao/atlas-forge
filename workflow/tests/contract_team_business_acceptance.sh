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
business_valid_fixture business-intent business-intent.v2-standard.json
business_valid_fixture business-intent business-intent.v2-dual-goal.json
business_valid_fixture business-verdict business-verdict.v2-standard-accepted.json
business_valid_fixture business-verdict business-verdict.v2-dual-accepted.json
business_valid_fixture business-verdict business-verdict.v2-dual-conditional.json
business_valid_fixture business-verdict business-verdict.v2-dual-blocked.json
business_valid_fixture business-verdict business-verdict.v2-dual-rejected.json

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
business_invalid_fixture "business intent v2 missing closure_mode" business-intent missing-closure-mode.v2.business-intent.json
business_invalid_fixture "business intent v2 invalid closure_mode" business-intent invalid-closure-mode.v2.business-intent.json
business_invalid_fixture "business intent v1 rejects closure_mode" business-intent v1-with-closure-mode.business-intent.json
business_invalid_fixture "business intent rejects unsupported version" business-intent unsupported-version.business-intent.json
business_invalid_fixture "business verdict v2 missing goal_a" business-verdict missing-goal-a.v2.business-verdict.json
business_invalid_fixture "business verdict v2 missing goal_b" business-verdict missing-goal-b.v2.business-verdict.json
business_invalid_fixture "business verdict v2 empty goal evidence" business-verdict empty-goal-evidence.v2.business-verdict.json
business_invalid_fixture "business verdict v2 path mismatch" business-verdict path-mismatch.v2.business-verdict.json
business_invalid_fixture "business verdict v2 accepted blocked goal" business-verdict accepted-blocked-goal.v2.business-verdict.json
business_invalid_fixture "business verdict v2 synthetic accepted path" business-verdict accepted-synthetic-mode.v2.business-verdict.json
business_invalid_fixture "business verdict v2 blocked without blocker" business-verdict blocked-without-blocker.v2.business-verdict.json
business_invalid_fixture "business verdict v2 duplicate goal evidence" business-verdict duplicate-goal-evidence.v2.business-verdict.json
business_invalid_fixture "business verdict v1 rejects goal fields" business-verdict v1-with-goals.business-verdict.json
business_invalid_fixture "business verdict v2 mode mismatch" business-verdict mode-mismatch.v2.business-verdict.json
business_invalid_fixture "business verdict v2 rejects whitespace blocker" business-verdict whitespace-blocker.v2.business-verdict.json
business_invalid_fixture "business verdict v2 rejects placeholder blocker" business-verdict placeholder-blocker.v2.business-verdict.json

node - \
  "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/contracts/team-sdd/business-intent.schema.json" \
  "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/contracts/team-sdd/business-verdict.schema.json" <<'NODE'
const fs = require("fs");
const [intentFile, verdictFile] = process.argv.slice(2);
const intent = JSON.parse(fs.readFileSync(intentFile, "utf8"));
const verdict = JSON.parse(fs.readFileSync(verdictFile, "utf8"));
if (!Array.isArray(intent.oneOf) || intent.oneOf.length !== 2) process.exit(1);
const intentV2 = intent.oneOf.find((branch) => branch.properties.schema_version.enum.includes(2));
if (!intentV2.required.includes("closure_mode")) process.exit(1);
if (intentV2.properties.closure_mode.enum.join(",") !== "standard,dual_goal") process.exit(1);
if (!Array.isArray(verdict.oneOf) || verdict.oneOf.length !== 2) process.exit(1);
const verdictV2 = verdict.oneOf.find((branch) => branch.properties.schema_version.enum.includes(2));
if (!verdictV2.required.includes("blockers")) process.exit(1);
if (verdictV2.properties.goal_a.$ref !== "#/definitions/goal") process.exit(1);
if (verdictV2.properties.goal_b.$ref !== "#/definitions/goal") process.exit(1);
if (!verdictV2.dependencies.goal_a.includes("goal_b")) process.exit(1);
if (!verdictV2.dependencies.goal_b.includes("goal_a")) process.exit(1);
NODE

grep -q "schema_version: 2" "$ATLAS_FORGE_ROOT/workflow/templates/business-intent.md"
grep -q "closure_mode: standard | dual_goal" "$ATLAS_FORGE_ROOT/workflow/templates/business-intent.md"
grep -q "schema_version: 2" "$ATLAS_FORGE_ROOT/workflow/templates/business-verdict.md"
grep -q "goal_a.integration_path_id" "$ATLAS_FORGE_ROOT/workflow/templates/business-verdict.md"
grep -q "goal_b.integration_mode" "$ATLAS_FORGE_ROOT/workflow/templates/business-verdict.md"

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
  "schema_version": 2,
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
  "commit_policy": "logical_outcome",
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

write_business_acceptance_v2_fixture() {
  local task="$1"
  local closure_mode="$2"
  local verdict="$3"
  local integration_mode="${4:-real}"
  local legacy_mode="$verdict"
  local acceptance_dir="$business_root/artifacts/$task/team/acceptance"
  local integration_path_id="primary-integration"
  local protocol_result="passed"

  if [[ "$verdict" == "conditionally_accepted" ]]; then
    legacy_mode="conditional"
  fi
  if [[ "$integration_mode" == "approved_simulator" ]]; then
    integration_path_id="approved-simulator-path"
  fi
  if [[ "$verdict" == "rejected" ]]; then
    protocol_result="failed"
  fi

  write_business_acceptance_fixture "$task" "$legacy_mode"
  printf '%s\n' '# Protocol evidence' '' 'The protocol action completed on the declared integration path.' > "$acceptance_dir/evidence/protocol.md"
  printf '%s\n' '# UI evidence' '' 'The operator completed the UI workflow against integration-backed state.' > "$acceptance_dir/evidence/ui.md"

  cat > "$acceptance_dir/business-intent.json" <<JSON
{
  "schema_version": 2,
  "task_id": "$task",
  "closure_mode": "$closure_mode",
  "business_goal": "Close the business acceptance loop",
  "agent_responsibility": "Judge business closure without replacing technical SDD gates",
  "excluded_scope": ["Unapproved synthetic integration"],
  "stakeholders": ["operator", "reviewer"],
  "success_definition": ["Scenario evidence maps to the final verdict"],
  "risk_boundaries": ["Technical gates remain blocking"]
}
JSON

  cat > "$acceptance_dir/business-evidence-map.json" <<JSON
{
  "schema_version": 1,
  "task_id": "$task",
  "evidence_refs": [
    {
      "evidence_id": "ev-protocol",
      "scenario_id": "close-loop",
      "source_type": "local",
      "description": "Protocol evidence for Goal A",
      "evidence_path": "team/acceptance/evidence/protocol.md",
      "result": "$protocol_result"
    },
    {
      "evidence_id": "ev-ui",
      "scenario_id": "close-loop",
      "source_type": "local",
      "description": "Operator UI evidence for Goal B",
      "evidence_path": "team/acceptance/evidence/ui.md",
      "result": "passed"
    }
  ]
}
JSON

  if [[ "$closure_mode" == "standard" ]]; then
    cat > "$acceptance_dir/business-verdict.json" <<JSON
{
  "schema_version": 2,
  "task_id": "$task",
  "verdict": "accepted",
  "technical_gate_status": "passed",
  "business_acceptance_status": "passed",
  "required_followups": [],
  "blockers": []
}
JSON
  elif [[ "$verdict" == "accepted" || "$verdict" == "conditionally_accepted" ]]; then
    cat > "$acceptance_dir/business-verdict.json" <<JSON
{
  "schema_version": 2,
  "task_id": "$task",
  "verdict": "$verdict",
  "technical_gate_status": "passed",
  "business_acceptance_status": "passed",
  "required_followups": [],
  "blockers": [],
  "goal_a": {
    "status": "passed",
    "evidence_refs": ["ev-protocol"],
    "integration_path_id": "$integration_path_id",
    "integration_mode": "$integration_mode"
  },
  "goal_b": {
    "status": "passed",
    "evidence_refs": ["ev-ui"],
    "integration_path_id": "$integration_path_id",
    "integration_mode": "$integration_mode"
  }
}
JSON
  elif [[ "$verdict" == "blocked" ]]; then
    cat > "$acceptance_dir/business-verdict.json" <<JSON
{
  "schema_version": 2,
  "task_id": "$task",
  "verdict": "blocked",
  "technical_gate_status": "blocked",
  "business_acceptance_status": "blocked",
  "required_followups": ["Capture Goal B after the integration service is restored"],
  "blockers": ["The operator UI cannot reach integration-backed state"],
  "goal_a": {
    "status": "passed",
    "evidence_refs": ["ev-protocol"],
    "integration_path_id": "$integration_path_id",
    "integration_mode": "$integration_mode"
  },
  "goal_b": {
    "status": "blocked",
    "evidence_refs": [],
    "integration_path_id": null,
    "integration_mode": "not_run"
  }
}
JSON
  else
    cat > "$acceptance_dir/business-verdict.json" <<JSON
{
  "schema_version": 2,
  "task_id": "$task",
  "verdict": "rejected",
  "technical_gate_status": "passed",
  "business_acceptance_status": "failed",
  "required_followups": ["Repair persistence and repeat both goal checks"],
  "blockers": ["Goal A did not persist the expected integration-backed state"],
  "goal_a": {
    "status": "failed",
    "evidence_refs": ["ev-protocol"],
    "integration_path_id": "$integration_path_id",
    "integration_mode": "$integration_mode"
  },
  "goal_b": {
    "status": "not_run",
    "evidence_refs": [],
    "integration_path_id": null,
    "integration_mode": "not_run"
  }
}
JSON
  fi

  printf '%s\n' \
    '{"schema_version":1,"task_id":"'"$task"'","deviation_id":"dev-001","deviation_type":"scope_mismatch","severity":"P3","status":"open","scenario_id":"close-loop","description":"Fixture deviation","owner":"atlas","evidence_refs":["ev-protocol"],"resolution_plan":"Retest after fixture repair"}' \
    > "$acceptance_dir/business-deviation-log.jsonl"
}

business_json_mutate() {
  local file="$1"
  local operation="$2"
  node - "$file" "$operation" <<'NODE'
const fs = require("fs");
const [file, operation] = process.argv.slice(2);
let value = JSON.parse(fs.readFileSync(file, "utf8"));
switch (operation) {
  case "intent-v1":
    value.schema_version = 1;
    delete value.closure_mode;
    break;
  case "verdict-v1":
    value = {
      schema_version: 1,
      task_id: value.task_id,
      verdict: "accepted",
      technical_gate_status: "passed",
      business_acceptance_status: "passed",
      required_followups: [],
    };
    break;
  case "standard-with-goals":
    value.closure_mode = "standard";
    break;
  case "missing-ref":
    value.goal_a.evidence_refs = ["ev-missing"];
    break;
  case "shared-evidence-id":
    value.goal_b.evidence_refs = ["ev-protocol"];
    break;
  case "same-evidence-path":
    value.evidence_refs[1].evidence_path = value.evidence_refs[0].evidence_path;
    break;
  case "evidence-failed":
    value.evidence_refs[0].result = "failed";
    break;
  case "duplicate-evidence-id":
    value.evidence_refs[1].evidence_id = value.evidence_refs[0].evidence_id;
    break;
  case "evidence-scenario-missing":
    value.evidence_refs[0].scenario_id = "missing-scenario";
    break;
  case "task-mismatch":
    value.task_id = "another-task";
    break;
  case "evidence-directory":
    value.evidence_refs[0].evidence_path = "team/acceptance/evidence";
    break;
  case "evidence-symlink":
    value.evidence_refs[0].evidence_path = "team/acceptance/evidence/protocol-link.md";
    break;
  case "manual-blank":
    value.evidence_refs[1].source_type = "manual";
    value.evidence_refs[1].description = "   ";
    value.evidence_refs[1].evidence_path = "   ";
    break;
  case "manual-local-alias":
    value.evidence_refs[1].source_type = "manual";
    value.evidence_refs[1].evidence_path = value.evidence_refs[0].evidence_path;
    break;
  case "external-javascript":
    value.evidence_refs[1].source_type = "external";
    value.evidence_refs[1].evidence_path = "javascript:alert(1)";
    break;
  case "external-empty-http":
    value.evidence_refs[1].source_type = "external";
    value.evidence_refs[1].evidence_path = "http:";
    break;
  case "manual-javascript":
    value.evidence_refs[1].source_type = "manual";
    value.evidence_refs[1].evidence_path = "javascript:alert(1)";
    break;
  case "external-url-alias":
    value.evidence_refs[0].source_type = "external";
    value.evidence_refs[0].evidence_path = "HTTPS://EXAMPLE.COM:443/a/../proof#goal-a";
    value.evidence_refs[1].source_type = "external";
    value.evidence_refs[1].evidence_path = "https://example.com/proof#goal-b";
    break;
  case "technical-not-run":
    value.technical_gate_status = "not_run";
    break;
  case "business-not-run":
    value.business_acceptance_status = "not_run";
    break;
  case "report-blocking-count":
    value.technical_gate_summary.blocking_failure_count = 1;
    break;
  case "report-rating-mismatch":
    value.rating.level = "conditionally_accepted";
    break;
  case "report-failed-gate-only":
    value.technical_gate_summary.failed_gates = ["critical-gate"];
    break;
  case "scenario-technical-failed":
    value.scenario_results[0].technical_gate_result = "failed";
    break;
  case "scenario-business-failed":
    value.scenario_results[0].business_result = "failed";
    break;
  case "scenario-results-empty":
    value.scenario_results = [];
    break;
  case "scenario-result-ghost":
    value.scenario_results[0].scenario_id = "ghost";
    break;
  case "scenario-result-duplicate":
    value.scenario_results.push({ ...value.scenario_results[0] });
    break;
  case "blocker-none":
    value.blockers = ["none"];
    break;
  case "blocker-tbd":
    value.blockers = ["TBD"];
    break;
  case "blocker-tbd-prefix":
    value.blockers = ["TBD - identify the actual blocking condition"];
    break;
  case "blocker-pending-detail":
    value.blockers = ["Pending vendor approval for production credentials"];
    break;
  case "blocker-unknown-detail":
    value.blockers = ["Unknown upstream API ownership blocks escalation"];
    break;
  case "blocker-placeholder":
    value.blockers = ["placeholder"];
    break;
  case "blocker-not-blocked":
    value.blockers = ["not blocked"];
    break;
  case "blocker-no-condition":
    value.blockers = ["no blocking condition"];
    break;
  case "blocker-there-none":
    value.blockers = ["there are no blockers"];
    break;
  case "blocker-cn-none":
    value.blockers = ["没有阻塞项"];
    break;
  default:
    throw new Error(`unknown mutation: ${operation}`);
}
fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
NODE
}

write_sdd_lint_fixture business-v2-standard-valid
write_business_acceptance_v2_fixture business-v2-standard-valid standard accepted
node "$artifact_lint_bin" --task business-v2-standard-valid --strict --business-acceptance >/dev/null

write_sdd_lint_fixture business-v2-dual-valid
write_business_acceptance_v2_fixture business-v2-dual-valid dual_goal accepted
node "$artifact_lint_bin" --task business-v2-dual-valid --strict --business-acceptance >/dev/null

write_sdd_lint_fixture business-v2-dual-conditional-valid
write_business_acceptance_v2_fixture business-v2-dual-conditional-valid dual_goal conditionally_accepted approved_simulator
node "$artifact_lint_bin" --task business-v2-dual-conditional-valid --strict --business-acceptance >/dev/null

write_sdd_lint_fixture business-v2-dual-blocked-valid
write_business_acceptance_v2_fixture business-v2-dual-blocked-valid dual_goal blocked
node "$artifact_lint_bin" --task business-v2-dual-blocked-valid --strict --business-acceptance >/dev/null

for blocker_case in \
  "business-v2-blocker-pending-detail|blocker-pending-detail" \
  "business-v2-blocker-unknown-detail|blocker-unknown-detail"; do
  blocker_task="${blocker_case%%|*}"
  blocker_mutation="${blocker_case#*|}"
  write_sdd_lint_fixture "$blocker_task"
  write_business_acceptance_v2_fixture "$blocker_task" dual_goal blocked
  business_json_mutate "$business_root/artifacts/$blocker_task/team/acceptance/business-verdict.json" "$blocker_mutation"
  node "$artifact_lint_bin" --task "$blocker_task" --strict --business-acceptance >/dev/null
done

write_sdd_lint_fixture business-v2-dual-rejected-valid
write_business_acceptance_v2_fixture business-v2-dual-rejected-valid dual_goal rejected
node "$artifact_lint_bin" --task business-v2-dual-rejected-valid --strict --business-acceptance >/dev/null

node "$artifact_lint_bin" --task business-acceptance-valid --business-acceptance \
  > "$TMP_ROOT/business-v1-nonstrict.out" 2> "$TMP_ROOT/business-v1-nonstrict.err"
grep -q "artifact_lint: true" "$TMP_ROOT/business-v1-nonstrict.out"
test "$(grep -c "LEGACY_BAF_V1" "$TMP_ROOT/business-v1-nonstrict.err")" -eq 1
expect_fail "strict business lint rejects historical v1" node "$artifact_lint_bin" --task business-acceptance-valid --strict --business-acceptance
grep -q "BAF_V2_REQUIRED" "$TMP_ROOT/expect-fail.err"
node "$artifact_lint_bin" --task business-acceptance-valid > "$TMP_ROOT/business-v1-sdd-only.out" 2> "$TMP_ROOT/business-v1-sdd-only.err"
test ! -s "$TMP_ROOT/business-v1-sdd-only.err"

assert_legacy_v1_compatibility() {
  local task="$1"
  local mutation="$2"
  local acceptance_dir="$business_root/artifacts/$task/team/acceptance"
  write_sdd_lint_fixture "$task"
  write_business_acceptance_fixture "$task" accepted
  if [[ "$mutation" == "evidence-symlink" ]]; then
    printf '%s\n' 'historical outside evidence' > "$TMP_ROOT/$task.outside.md"
    ln -s "$TMP_ROOT/$task.outside.md" "$acceptance_dir/evidence/protocol-link.md"
  fi
  business_json_mutate "$acceptance_dir/business-evidence-map.json" "$mutation"
  node "$artifact_lint_bin" --task "$task" --business-acceptance \
    > "$TMP_ROOT/$task.out" 2> "$TMP_ROOT/$task.err"
  grep -q "artifact_lint: true" "$TMP_ROOT/$task.out"
  grep -q "LEGACY_BAF_V1" "$TMP_ROOT/$task.err"
}

assert_legacy_v1_compatibility business-v1-duplicate-id-compat duplicate-evidence-id
assert_legacy_v1_compatibility business-v1-directory-compat evidence-directory
assert_legacy_v1_compatibility business-v1-symlink-compat evidence-symlink
assert_legacy_v1_compatibility business-v1-task-mismatch-compat task-mismatch

write_sdd_lint_fixture business-v2-mixed-intent-v1
write_business_acceptance_v2_fixture business-v2-mixed-intent-v1 dual_goal accepted
business_json_mutate "$business_root/artifacts/business-v2-mixed-intent-v1/team/acceptance/business-intent.json" intent-v1
expect_fail "business lint rejects v1 intent with v2 verdict" node "$artifact_lint_bin" --task business-v2-mixed-intent-v1 --business-acceptance
grep -q "BAF_VERSION_MISMATCH" "$TMP_ROOT/expect-fail.err"

write_sdd_lint_fixture business-v2-mixed-verdict-v1
write_business_acceptance_v2_fixture business-v2-mixed-verdict-v1 dual_goal accepted
business_json_mutate "$business_root/artifacts/business-v2-mixed-verdict-v1/team/acceptance/business-verdict.json" verdict-v1
expect_fail "business lint rejects v2 intent with v1 verdict" node "$artifact_lint_bin" --task business-v2-mixed-verdict-v1 --business-acceptance
grep -q "BAF_VERSION_MISMATCH" "$TMP_ROOT/expect-fail.err"

write_sdd_lint_fixture business-v2-standard-with-goals
write_business_acceptance_v2_fixture business-v2-standard-with-goals dual_goal accepted
business_json_mutate "$business_root/artifacts/business-v2-standard-with-goals/team/acceptance/business-intent.json" standard-with-goals
expect_fail "standard closure rejects dual-goal fields" node "$artifact_lint_bin" --task business-v2-standard-with-goals --strict --business-acceptance
grep -q "DUAL_GOAL_FORBIDDEN" "$TMP_ROOT/expect-fail.err"

write_sdd_lint_fixture business-v2-missing-ref
write_business_acceptance_v2_fixture business-v2-missing-ref dual_goal accepted
business_json_mutate "$business_root/artifacts/business-v2-missing-ref/team/acceptance/business-verdict.json" missing-ref
expect_fail "dual-goal rejects missing evidence ref" node "$artifact_lint_bin" --task business-v2-missing-ref --strict --business-acceptance
grep -q "EVIDENCE_REF_NOT_FOUND" "$TMP_ROOT/expect-fail.err"

write_sdd_lint_fixture business-v2-shared-evidence-id
write_business_acceptance_v2_fixture business-v2-shared-evidence-id dual_goal accepted
business_json_mutate "$business_root/artifacts/business-v2-shared-evidence-id/team/acceptance/business-verdict.json" shared-evidence-id
expect_fail "dual-goal rejects shared evidence id" node "$artifact_lint_bin" --task business-v2-shared-evidence-id --strict --business-acceptance
grep -q "must not substitute" "$TMP_ROOT/expect-fail.err"

write_sdd_lint_fixture business-v2-same-evidence-path
write_business_acceptance_v2_fixture business-v2-same-evidence-path dual_goal accepted
business_json_mutate "$business_root/artifacts/business-v2-same-evidence-path/team/acceptance/business-evidence-map.json" same-evidence-path
expect_fail "dual-goal rejects canonical evidence substitution" node "$artifact_lint_bin" --task business-v2-same-evidence-path --strict --business-acceptance
grep -q "EVIDENCE_SUBSTITUTION" "$TMP_ROOT/expect-fail.err"

write_sdd_lint_fixture business-v2-hardlink-substitution
write_business_acceptance_v2_fixture business-v2-hardlink-substitution dual_goal accepted
rm "$business_root/artifacts/business-v2-hardlink-substitution/team/acceptance/evidence/ui.md"
ln "$business_root/artifacts/business-v2-hardlink-substitution/team/acceptance/evidence/protocol.md" \
  "$business_root/artifacts/business-v2-hardlink-substitution/team/acceptance/evidence/ui.md"
expect_fail "dual-goal rejects hardlink evidence substitution" node "$artifact_lint_bin" --task business-v2-hardlink-substitution --strict --business-acceptance
grep -q "EVIDENCE_SUBSTITUTION" "$TMP_ROOT/expect-fail.err"

write_sdd_lint_fixture business-v2-evidence-failed
write_business_acceptance_v2_fixture business-v2-evidence-failed dual_goal accepted
business_json_mutate "$business_root/artifacts/business-v2-evidence-failed/team/acceptance/business-evidence-map.json" evidence-failed
expect_fail "passed goal rejects failed evidence" node "$artifact_lint_bin" --task business-v2-evidence-failed --strict --business-acceptance
grep -q "EVIDENCE_REF_NOT_PASSED" "$TMP_ROOT/expect-fail.err"

write_sdd_lint_fixture business-v2-duplicate-evidence-id
write_business_acceptance_v2_fixture business-v2-duplicate-evidence-id dual_goal accepted
business_json_mutate "$business_root/artifacts/business-v2-duplicate-evidence-id/team/acceptance/business-evidence-map.json" duplicate-evidence-id
expect_fail "business lint rejects duplicate evidence id" node "$artifact_lint_bin" --task business-v2-duplicate-evidence-id --strict --business-acceptance
grep -q "EVIDENCE_ID_DUPLICATE" "$TMP_ROOT/expect-fail.err"

write_sdd_lint_fixture business-v2-missing-evidence-scenario
write_business_acceptance_v2_fixture business-v2-missing-evidence-scenario dual_goal accepted
business_json_mutate "$business_root/artifacts/business-v2-missing-evidence-scenario/team/acceptance/business-evidence-map.json" evidence-scenario-missing
expect_fail "business lint rejects missing evidence scenario" node "$artifact_lint_bin" --task business-v2-missing-evidence-scenario --strict --business-acceptance
grep -q "EVIDENCE_SCENARIO_NOT_FOUND" "$TMP_ROOT/expect-fail.err"

write_sdd_lint_fixture business-v2-task-mismatch
write_business_acceptance_v2_fixture business-v2-task-mismatch dual_goal accepted
business_json_mutate "$business_root/artifacts/business-v2-task-mismatch/team/acceptance/business-evidence-map.json" task-mismatch
expect_fail "business lint rejects cross-task evidence" node "$artifact_lint_bin" --task business-v2-task-mismatch --strict --business-acceptance
grep -q "TASK_ID_MISMATCH" "$TMP_ROOT/expect-fail.err"

write_sdd_lint_fixture business-v2-evidence-directory
write_business_acceptance_v2_fixture business-v2-evidence-directory dual_goal accepted
business_json_mutate "$business_root/artifacts/business-v2-evidence-directory/team/acceptance/business-evidence-map.json" evidence-directory
expect_fail "business lint rejects evidence directory" node "$artifact_lint_bin" --task business-v2-evidence-directory --strict --business-acceptance
grep -q "EVIDENCE_PATH_INVALID" "$TMP_ROOT/expect-fail.err"

write_sdd_lint_fixture business-v2-evidence-symlink
write_business_acceptance_v2_fixture business-v2-evidence-symlink dual_goal accepted
printf '%s\n' 'outside evidence' > "$TMP_ROOT/business-evidence-outside.md"
ln -s "$TMP_ROOT/business-evidence-outside.md" "$business_root/artifacts/business-v2-evidence-symlink/team/acceptance/evidence/protocol-link.md"
business_json_mutate "$business_root/artifacts/business-v2-evidence-symlink/team/acceptance/business-evidence-map.json" evidence-symlink
expect_fail "business lint rejects evidence symlink" node "$artifact_lint_bin" --task business-v2-evidence-symlink --strict --business-acceptance
grep -q "EVIDENCE_PATH_INVALID" "$TMP_ROOT/expect-fail.err"

write_sdd_lint_fixture business-v2-manual-blank
write_business_acceptance_v2_fixture business-v2-manual-blank dual_goal accepted
business_json_mutate "$business_root/artifacts/business-v2-manual-blank/team/acceptance/business-evidence-map.json" manual-blank
expect_fail "business lint rejects blank manual evidence" node "$artifact_lint_bin" --task business-v2-manual-blank --strict --business-acceptance
grep -q "external/manual evidence requires description" "$TMP_ROOT/expect-fail.err"
grep -q "EVIDENCE_PATH_INVALID" "$TMP_ROOT/expect-fail.err"

write_sdd_lint_fixture business-v2-manual-local-alias
write_business_acceptance_v2_fixture business-v2-manual-local-alias dual_goal accepted
business_json_mutate "$business_root/artifacts/business-v2-manual-local-alias/team/acceptance/business-evidence-map.json" manual-local-alias
expect_fail "business lint rejects manual evidence disguised as local path" node "$artifact_lint_bin" --task business-v2-manual-local-alias --strict --business-acceptance
grep -q "EVIDENCE_PATH_INVALID" "$TMP_ROOT/expect-fail.err"

write_sdd_lint_fixture business-v2-external-url-alias
write_business_acceptance_v2_fixture business-v2-external-url-alias dual_goal accepted
business_json_mutate "$business_root/artifacts/business-v2-external-url-alias/team/acceptance/business-evidence-map.json" external-url-alias
expect_fail "dual-goal rejects canonical external URL substitution" node "$artifact_lint_bin" --task business-v2-external-url-alias --strict --business-acceptance
grep -q "EVIDENCE_SUBSTITUTION" "$TMP_ROOT/expect-fail.err"

for uri_case in \
  "business-v2-external-javascript|external-javascript" \
  "business-v2-external-empty-http|external-empty-http" \
  "business-v2-manual-javascript|manual-javascript"; do
  uri_task="${uri_case%%|*}"
  uri_mutation="${uri_case#*|}"
  write_sdd_lint_fixture "$uri_task"
  write_business_acceptance_v2_fixture "$uri_task" dual_goal accepted
  business_json_mutate "$business_root/artifacts/$uri_task/team/acceptance/business-evidence-map.json" "$uri_mutation"
  expect_fail "business lint rejects unsafe or unverifiable evidence URI: $uri_mutation" node "$artifact_lint_bin" --task "$uri_task" --strict --business-acceptance
  grep -q "EVIDENCE_PATH_INVALID" "$TMP_ROOT/expect-fail.err"
done

write_sdd_lint_fixture business-v2-technical-not-run
write_business_acceptance_v2_fixture business-v2-technical-not-run dual_goal accepted
business_json_mutate "$business_root/artifacts/business-v2-technical-not-run/team/acceptance/business-verdict.json" technical-not-run
expect_fail "accepted v2 requires passed technical gate" node "$artifact_lint_bin" --task business-v2-technical-not-run --strict --business-acceptance
grep -q "TECHNICAL_GATE_NOT_PASSED" "$TMP_ROOT/expect-fail.err"

write_sdd_lint_fixture business-v2-business-not-run
write_business_acceptance_v2_fixture business-v2-business-not-run dual_goal accepted
business_json_mutate "$business_root/artifacts/business-v2-business-not-run/team/acceptance/business-verdict.json" business-not-run
expect_fail "accepted v2 requires passed business acceptance" node "$artifact_lint_bin" --task business-v2-business-not-run --strict --business-acceptance
grep -q "BUSINESS_ACCEPTANCE_NOT_PASSED" "$TMP_ROOT/expect-fail.err"

write_sdd_lint_fixture business-v2-report-blocking-count
write_business_acceptance_v2_fixture business-v2-report-blocking-count dual_goal accepted
business_json_mutate "$business_root/artifacts/business-v2-report-blocking-count/team/acceptance/business-acceptance-report.json" report-blocking-count
expect_fail "accepted v2 rejects blocking report count" node "$artifact_lint_bin" --task business-v2-report-blocking-count --strict --business-acceptance
grep -q "TECHNICAL_GATE_NOT_PASSED" "$TMP_ROOT/expect-fail.err"

write_sdd_lint_fixture business-v2-report-rating-mismatch
write_business_acceptance_v2_fixture business-v2-report-rating-mismatch dual_goal accepted
business_json_mutate "$business_root/artifacts/business-v2-report-rating-mismatch/team/acceptance/business-acceptance-report.json" report-rating-mismatch
expect_fail "accepted v2 requires matching report rating" node "$artifact_lint_bin" --task business-v2-report-rating-mismatch --strict --business-acceptance
grep -q "rating.level must match" "$TMP_ROOT/expect-fail.err"

write_sdd_lint_fixture business-v2-report-failed-gate-only
write_business_acceptance_v2_fixture business-v2-report-failed-gate-only dual_goal accepted
business_json_mutate "$business_root/artifacts/business-v2-report-failed-gate-only/team/acceptance/business-acceptance-report.json" report-failed-gate-only
expect_fail "accepted v2 rejects non-empty failed_gates" node "$artifact_lint_bin" --task business-v2-report-failed-gate-only --strict --business-acceptance
grep -q "TECHNICAL_GATE_NOT_PASSED" "$TMP_ROOT/expect-fail.err"
grep -q "TECHNICAL_GATE_SUMMARY_MISMATCH" "$TMP_ROOT/expect-fail.err"

write_sdd_lint_fixture business-v2-scenario-technical-failed
write_business_acceptance_v2_fixture business-v2-scenario-technical-failed dual_goal accepted
business_json_mutate "$business_root/artifacts/business-v2-scenario-technical-failed/team/acceptance/business-acceptance-report.json" scenario-technical-failed
expect_fail "accepted v2 rejects failed scenario technical gate" node "$artifact_lint_bin" --task business-v2-scenario-technical-failed --strict --business-acceptance
grep -q "TECHNICAL_GATE_NOT_PASSED" "$TMP_ROOT/expect-fail.err"

write_sdd_lint_fixture business-v2-scenario-business-failed
write_business_acceptance_v2_fixture business-v2-scenario-business-failed dual_goal accepted
business_json_mutate "$business_root/artifacts/business-v2-scenario-business-failed/team/acceptance/business-acceptance-report.json" scenario-business-failed
expect_fail "accepted v2 rejects failed scenario business result" node "$artifact_lint_bin" --task business-v2-scenario-business-failed --strict --business-acceptance
grep -q "BUSINESS_ACCEPTANCE_NOT_PASSED" "$TMP_ROOT/expect-fail.err"

write_sdd_lint_fixture business-v2-scenario-results-empty
write_business_acceptance_v2_fixture business-v2-scenario-results-empty dual_goal accepted
business_json_mutate "$business_root/artifacts/business-v2-scenario-results-empty/team/acceptance/business-acceptance-report.json" scenario-results-empty
expect_fail "accepted v2 rejects an empty scenario report" node "$artifact_lint_bin" --task business-v2-scenario-results-empty --strict --business-acceptance
grep -q "requires at least one scenario result" "$TMP_ROOT/expect-fail.err"

write_sdd_lint_fixture business-v2-scenario-result-ghost
write_business_acceptance_v2_fixture business-v2-scenario-result-ghost dual_goal accepted
business_json_mutate "$business_root/artifacts/business-v2-scenario-result-ghost/team/acceptance/business-acceptance-report.json" scenario-result-ghost
expect_fail "accepted v2 rejects phantom scenario result" node "$artifact_lint_bin" --task business-v2-scenario-result-ghost --strict --business-acceptance
grep -q "references a missing scenario card" "$TMP_ROOT/expect-fail.err"

write_sdd_lint_fixture business-v2-scenario-result-duplicate
write_business_acceptance_v2_fixture business-v2-scenario-result-duplicate dual_goal accepted
business_json_mutate "$business_root/artifacts/business-v2-scenario-result-duplicate/team/acceptance/business-acceptance-report.json" scenario-result-duplicate
expect_fail "accepted v2 rejects duplicate scenario result" node "$artifact_lint_bin" --task business-v2-scenario-result-duplicate --strict --business-acceptance
grep -q "must not contain duplicate scenario_id" "$TMP_ROOT/expect-fail.err"

write_sdd_lint_fixture business-v2-scenario-card-duplicate
write_business_acceptance_v2_fixture business-v2-scenario-card-duplicate dual_goal accepted
cp "$business_root/artifacts/business-v2-scenario-card-duplicate/team/acceptance/scenarios/business-scenario-card.close-loop.json" \
  "$business_root/artifacts/business-v2-scenario-card-duplicate/team/acceptance/scenarios/business-scenario-card.duplicate.json"
expect_fail "v2 rejects duplicate scenario card id" node "$artifact_lint_bin" --task business-v2-scenario-card-duplicate --strict --business-acceptance
grep -q "BUSINESS_SCENARIO_DUPLICATE" "$TMP_ROOT/expect-fail.err"

write_sdd_lint_fixture business-v2-blocker-none
write_business_acceptance_v2_fixture business-v2-blocker-none dual_goal blocked
business_json_mutate "$business_root/artifacts/business-v2-blocker-none/team/acceptance/business-verdict.json" blocker-none
expect_fail "blocked v2 rejects no-blocker declaration" node "$artifact_lint_bin" --task business-v2-blocker-none --strict --business-acceptance
grep -q "substantive named blocking conditions" "$TMP_ROOT/expect-fail.err"

write_sdd_lint_fixture business-v2-blocker-tbd
write_business_acceptance_v2_fixture business-v2-blocker-tbd dual_goal blocked
business_json_mutate "$business_root/artifacts/business-v2-blocker-tbd/team/acceptance/business-verdict.json" blocker-tbd
expect_fail "blocked v2 rejects placeholder blocker" node "$artifact_lint_bin" --task business-v2-blocker-tbd --strict --business-acceptance
grep -q "substantive named blocking conditions" "$TMP_ROOT/expect-fail.err"

write_sdd_lint_fixture business-v2-blocker-tbd-prefix
write_business_acceptance_v2_fixture business-v2-blocker-tbd-prefix dual_goal blocked
business_json_mutate "$business_root/artifacts/business-v2-blocker-tbd-prefix/team/acceptance/business-verdict.json" blocker-tbd-prefix
expect_fail "blocked v2 rejects placeholder blocker prefix" node "$artifact_lint_bin" --task business-v2-blocker-tbd-prefix --strict --business-acceptance
grep -q "substantive named blocking conditions" "$TMP_ROOT/expect-fail.err"

for blocker_case in \
  "business-v2-blocker-placeholder|blocker-placeholder" \
  "business-v2-blocker-not-blocked|blocker-not-blocked" \
  "business-v2-blocker-no-condition|blocker-no-condition" \
  "business-v2-blocker-there-none|blocker-there-none" \
  "business-v2-blocker-cn-none|blocker-cn-none"; do
  blocker_task="${blocker_case%%|*}"
  blocker_mutation="${blocker_case#*|}"
  write_sdd_lint_fixture "$blocker_task"
  write_business_acceptance_v2_fixture "$blocker_task" dual_goal blocked
  business_json_mutate "$business_root/artifacts/$blocker_task/team/acceptance/business-verdict.json" "$blocker_mutation"
  expect_fail "blocked v2 rejects placeholder blocker: $blocker_mutation" node "$artifact_lint_bin" --task "$blocker_task" --strict --business-acceptance
  grep -q "substantive named blocking conditions" "$TMP_ROOT/expect-fail.err"
done

write_sdd_lint_fixture business-v2-missing-evidence-map
write_business_acceptance_v2_fixture business-v2-missing-evidence-map dual_goal accepted
rm "$business_root/artifacts/business-v2-missing-evidence-map/team/acceptance/business-evidence-map.json"
expect_fail "accepted v2 requires evidence map" node "$artifact_lint_bin" --task business-v2-missing-evidence-map --strict --business-acceptance

write_sdd_lint_fixture business-v2-missing-acceptance-report
write_business_acceptance_v2_fixture business-v2-missing-acceptance-report dual_goal accepted
rm "$business_root/artifacts/business-v2-missing-acceptance-report/team/acceptance/business-acceptance-report.json"
expect_fail "accepted v2 requires acceptance report" node "$artifact_lint_bin" --task business-v2-missing-acceptance-report --strict --business-acceptance

write_sdd_lint_fixture business-v2-null-intent
write_business_acceptance_v2_fixture business-v2-null-intent dual_goal accepted
printf '%s\n' 'null' > "$business_root/artifacts/business-v2-null-intent/team/acceptance/business-intent.json"
expect_fail "business lint rejects JSON null intent" node "$artifact_lint_bin" --task business-v2-null-intent --strict --business-acceptance
grep -q "value must be an object" "$TMP_ROOT/expect-fail.err"

export CODEX_WORKFLOW_ROOT="$previous_codex_workflow_root"
pass "business acceptance validators and artifact lint"
