# shellcheck shell=bash
# Sourced by contract.sh. Requires BIN, TMP_ROOT, CODEX_WORKFLOW_ROOT,
# pass, expect_fail, and write_ready_artifacts.

native_id="$($BIN init-task "contract native team records" "native team records")"
$BIN start "$native_id"
write_ready_artifacts "$native_id"
native_team_dir="$CODEX_WORKFLOW_ROOT/artifacts/$native_id/team"
expect_fail "native finalize before start" "$BIN" team-record-finalize "$native_id" --backend native --status complete --round "$native_team_dir/round-missing.md" --decision "$native_team_dir/decision.md" --staffing "$native_team_dir/staffing.md"
expect_fail "native record invalid backend" "$BIN" team-record-start "$native_id" "native objective" --backend external --mode discuss --agents 1 --roles architect
expect_fail "native record invalid mode" "$BIN" team-record-start "$native_id" "native objective" --backend native --mode plan --agents 1 --roles architect
expect_fail "native record invalid agents" "$BIN" team-record-start "$native_id" "native objective" --backend native --mode discuss --agents 0 --roles architect
expect_fail "native record missing task" "$BIN" team-record-start missing-native-task "native objective" --backend native --mode discuss --agents 1 --roles architect
$BIN team-record-start "$native_id" "native objective" --mode discuss --agents 3 --roles "architect,critic,verifier" >/dev/null
$BIN team-status "$native_id" > "$TMP_ROOT/native-status-running.out"
grep -q "team_backend: native" "$TMP_ROOT/native-status-running.out"
grep -q "team_status: running" "$TMP_ROOT/native-status-running.out"
grep -q "team_schema_version: 2" "$TMP_ROOT/native-status-running.out"
grep -q "team_configured_backend: " "$TMP_ROOT/native-status-running.out"
grep -q "team_resolved_requested_backend: native" "$TMP_ROOT/native-status-running.out"
native_round="$native_team_dir/round-native.md"
native_decision="$native_team_dir/decision.md"
native_staffing="$native_team_dir/staffing.md"
printf '%s\n' '# Native Round' '' '- backend: native' '' '## Evidence' 'Native round evidence for record command contract.' '## Inference' 'Native inference.' '## Unknown' '-' '## Recommendation' 'Finalize native record.' > "$native_round"
printf '%s\n' '# Team Decision' '' '- backend: native' '' '## Primary Decision' 'Native decision evidence is substantive enough for readiness.' > "$native_decision"
printf '%s\n' '# Staffing' '' '- backend: native' '' '## Suggested Ownership' 'Native executor owns the patch; verifier owns contract checks.' > "$native_staffing"
expect_fail "native finalize invalid status" "$BIN" team-record-finalize "$native_id" --backend native --status loop-done --round "$native_round" --decision "$native_decision" --staffing "$native_staffing"
expect_fail "native finalize missing artifact" "$BIN" team-record-finalize "$native_id" --backend native --status complete --round "$native_team_dir/missing-round.md" --decision "$native_decision" --staffing "$native_staffing"
printf '%s\n' '# Outside Decision' '' '- backend: native' '' 'Outside artifact should fail current task ownership.' > "$TMP_ROOT/outside-native.md"
expect_fail "native finalize outside artifact" "$BIN" team-record-finalize "$native_id" --backend native --status complete --round "$TMP_ROOT/outside-native.md" --decision "$native_decision" --staffing "$native_staffing"
$BIN team-status "$native_id" > "$TMP_ROOT/native-status-after-failed-finalize.out"
grep -q "team_status: running" "$TMP_ROOT/native-status-after-failed-finalize.out"
$BIN team-record-finalize "$native_id" --backend native --status complete --round "$native_round" --decision "$native_decision" --staffing "$native_staffing" >/dev/null
$BIN team-status "$native_id" > "$TMP_ROOT/native-status-complete.out"
grep -q "team_backend: native" "$TMP_ROOT/native-status-complete.out"
grep -q "team_status: complete" "$TMP_ROOT/native-status-complete.out"
grep -q "team_round: " "$TMP_ROOT/native-status-complete.out"
grep -q "team_staffing: " "$TMP_ROOT/native-status-complete.out"
grep -q "team_effective_backend: none" "$TMP_ROOT/native-status-complete.out"
test -f "$native_team_dir/backend-v2.json"
$BIN ready "$native_id" --require context,spec,analysis,decision >/dev/null
native_loop_id="$($BIN init-task "contract native team loop" "native team loop")"
$BIN start "$native_loop_id"
write_ready_artifacts "$native_loop_id"
$BIN team-record-start "$native_loop_id" "native loop objective" --mode discuss >/dev/null
native_loop_team_dir="$CODEX_WORKFLOW_ROOT/artifacts/$native_loop_id/team"
native_loop="$native_loop_team_dir/loop-native.md"
printf '%s\n' '# Native Team Loop' '' '- backend: native' '- status: loop-done' '' '## Evidence' 'Native loop evidence proves the requested objective completed.' '## Final Status' 'done=true' > "$native_loop"
expect_fail "native loop invalid status" "$BIN" team-loop-record "$native_loop_id" --backend native --status complete --loop "$native_loop" --iterations 1
expect_fail "native loop invalid iterations" "$BIN" team-loop-record "$native_loop_id" --backend native --status loop-done --loop "$native_loop" --iterations 0
expect_fail "native loop missing task" "$BIN" team-loop-record missing-native-task --backend native --status loop-done --loop "$native_loop" --iterations 1
$BIN team-loop-record "$native_loop_id" --backend native --status loop-done --loop "$native_loop" --iterations 1 --max-iterations 2 --max-time 10m >/dev/null
$BIN team-status "$native_loop_id" > "$TMP_ROOT/native-loop-status.out"
grep -q "team_backend: native" "$TMP_ROOT/native-loop-status.out"
grep -q "team_status: loop-done" "$TMP_ROOT/native-loop-status.out"
grep -q "team_loop_status: loop-done" "$TMP_ROOT/native-loop-status.out"
grep -q "team_loop_iteration: 1" "$TMP_ROOT/native-loop-status.out"
grep -q "team_loop_max_iterations: 2" "$TMP_ROOT/native-loop-status.out"
grep -q "team_loop_max_time: 10m" "$TMP_ROOT/native-loop-status.out"

native_template_id="$($BIN init-task "contract native template rejection" "native template rejection")"
$BIN start "$native_template_id"
write_ready_artifacts "$native_template_id"
native_template_dir="$CODEX_WORKFLOW_ROOT/artifacts/$native_template_id/team"
$BIN team-record-start "$native_template_id" "native template objective" --mode discuss --agents 1 --roles architect >/dev/null
printf '%s\n' '# Native Round' '' '- backend: native' '' '## Evidence' 'Native template rejection has substantive round evidence.' > "$native_template_dir/round-native.md"
expect_fail "native finalize template decision" "$BIN" team-record-finalize "$native_template_id" --backend native --status complete --round "$native_template_dir/round-native.md" --decision "$native_template_dir/decision.md" --staffing "$native_template_dir/staffing.md"
$BIN team-status "$native_template_id" > "$TMP_ROOT/native-template-status.out"
grep -q "team_status: running" "$TMP_ROOT/native-template-status.out"

native_roles_id="$($BIN init-task "contract native dynamic roles" "native dynamic roles")"
$BIN start "$native_roles_id"
write_ready_artifacts "$native_roles_id"
$BIN team-record-start "$native_roles_id" "native dynamic role objective" --mode discuss --agents 4 --roles "domain-architect,api-reviewer,ui-verifier,evidence-qa" >/dev/null
$BIN team-status "$native_roles_id" > "$TMP_ROOT/native-dynamic-roles-status.out"
grep -q "team_backend: native" "$TMP_ROOT/native-dynamic-roles-status.out"
grep -q "team_agents: 4" "$TMP_ROOT/native-dynamic-roles-status.out"
grep -q "team_roles: domain-architect,api-reviewer,ui-verifier,evidence-qa" "$TMP_ROOT/native-dynamic-roles-status.out"

native_execute_id="$($BIN init-task "contract native execute admission" "native execute admission")"
$BIN start "$native_execute_id"
write_ready_artifacts "$native_execute_id"
native_execute_state="$CODEX_WORKFLOW_ROOT/artifacts/$native_execute_id/state.json"
native_execute_runtime="$CODEX_WORKFLOW_ROOT/artifacts/$native_execute_id/runtime.jsonl"
native_execute_state_before="$(cksum "$native_execute_state")"
native_execute_runtime_before="$(cksum "$native_execute_runtime")"
native_execute_contract_template="$ATLAS_FORGE_ROOT/test/fixtures/team-sdd/valid/execution-contract-v3.md"
native_execute_contract="$TMP_ROOT/native-execution-contract-v3.md"
[[ "$(grep -Ec '^task_id: fixture-v3$' "$native_execute_contract_template")" -eq 1 ]]
sed "s/^task_id: fixture-v3$/task_id: $native_execute_id/" \
  "$native_execute_contract_template" > "$native_execute_contract"
grep -Fxq "task_id: $native_execute_id" "$native_execute_contract"
native_execute_brief_bin="$ATLAS_FORGE_ROOT/plugins/atlas-workflow/scripts/codex-team-brief"
native_execute_base="$(git -C "$ATLAS_FORGE_ROOT" rev-parse HEAD)"
node "$native_execute_brief_bin" --task "$native_execute_id" --slice slice-one --repo "$ATLAS_FORGE_ROOT" --base "$native_execute_base" --contract "$native_execute_contract" >/dev/null
native_execute_brief="$CODEX_WORKFLOW_ROOT/artifacts/$native_execute_id/team/sdd/slices/slice-one/brief.json"
expect_fail "native execute start requires grant" "$BIN" team-record-start "$native_execute_id" "execute objective" --mode execute --agents 1 --roles executor --brief "$native_execute_brief" --operation-id native-execute-start
grep -Fq "missing or invalid execute grant_id" "$TMP_ROOT/expect-fail.err"
[[ "$(cksum "$native_execute_state")" == "$native_execute_state_before" ]]
[[ "$(cksum "$native_execute_runtime")" == "$native_execute_runtime_before" ]]
native_authorize_state_before="$(cksum "$native_execute_state")"
native_authorize_runtime_before="$(cksum "$native_execute_runtime")"
expect_fail "native v3 brief is read-only for execute authorization" "$BIN" team-authorize "$native_execute_id" "execute objective" --authorization-ref user-message:execute-contract --brief "$native_execute_brief" --grant-id native-v3-read-only --operation-id native-authorize-v3
grep -Fq "execute mutation requires exact Team brief schema_version 4; legacy 1/2/3 are read-only" "$TMP_ROOT/expect-fail.err"
[[ "$(cksum "$native_execute_state")" == "$native_authorize_state_before" ]]
[[ "$(cksum "$native_execute_runtime")" == "$native_authorize_runtime_before" ]]

native_parity_id="$($BIN init-task "contract native authorization parity" "native authorization parity")"
$BIN start "$native_parity_id"
write_ready_artifacts "$native_parity_id"
native_parity_artifact="$CODEX_WORKFLOW_ROOT/artifacts/$native_parity_id"
native_parity_sdd="$native_parity_artifact/team/sdd"
native_parity_contract="$native_parity_sdd/scope-admission-v5.md"
native_parity_authority="$native_parity_sdd/slices/authority-vnext"
mkdir -p "$native_parity_authority"
sed "s/^task_id: fixture$/task_id: $native_parity_id/" \
  "$ATLAS_FORGE_ROOT/test/fixtures/implementation-contract/valid/scope-admission-v5.md" \
  > "$native_parity_contract"
printf '%s\n' '# Global Constraints' '' '- Keep scope canonical.' > "$native_parity_sdd/global-constraints.md"
printf '%s\n' '# Goal' '' '- REQ-1' > "$native_parity_authority/brief.md"
node - "$native_parity_authority/brief.json" "$native_parity_id" "$ATLAS_FORGE_ROOT" "$native_execute_base" <<'NODE'
const fs = require("fs");
const [file, taskId, repo, baseSha] = process.argv.slice(2);
const brief = {
  schema_version: 2,
  task_id: taskId,
  slice_id: "authority-vnext",
  repo,
  base_sha: baseSha,
  objective: "Provide canonical goal authority for vNext contract admission.",
  requirements_path: "brief.md",
  global_constraints_path: "../../global-constraints.md",
  owned_paths: ["plugins/atlas-workflow"],
  forbidden_paths: ["plugins/multica-sdlc"],
  acceptance_refs: ["REQ-1"],
  required_checks: ["node --test workflow/tests/js/implementation-contract-vnext-admission.test.js"],
  commit_policy: "logical_outcome",
  output_contract: "final_message_json_only",
};
fs.writeFileSync(file, `${JSON.stringify(brief, null, 2)}\n`);
NODE
native_parity_brief_bin="$native_execute_brief_bin"
node "$native_parity_brief_bin" --task "$native_parity_id" --slice slice-vnext --repo "$ATLAS_FORGE_ROOT" --base "$native_execute_base" --contract "$native_parity_contract" --authority-slice "$native_parity_authority" >/dev/null
native_parity_brief="$native_parity_artifact/team/sdd/slices/slice-vnext/brief.json"
node - "$native_parity_brief" <<'NODE'
const fs = require("fs");
const brief = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (brief.schema_version !== 4 || brief.contract?.semantics_version !== 5
  || brief.contract?.execution_plan_schema_version !== 3) process.exit(1);
NODE
native_parity_objective="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).objective)' "$native_parity_brief")"
$BIN team-authorize "$native_parity_id" "$native_parity_objective" \
  --authorization-ref user-message:native-authority-parity \
  --brief "$native_parity_brief" \
  --grant-id native-authority-parity-grant \
  --operation-id native-authority-parity-authorize >/dev/null
native_parity_state="$native_parity_artifact/state.json"
native_parity_runtime="$native_parity_artifact/runtime.jsonl"
native_parity_grant="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).execution_authority.grants[0].grant_id)' "$native_parity_state")"
native_parity_scope="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).execution_authority.grants[0].scope_digest)' "$native_parity_state")"
native_parity_state_before="$(cksum "$native_parity_state")"
native_parity_runtime_before="$(cksum "$native_parity_runtime")"
expect_fail "native execute start rejects missing authorization parity" "$BIN" team-record-start "$native_parity_id" "$native_parity_objective" --mode execute --agents 1 --roles executor --grant-id "$native_parity_grant" --scope-digest "$native_parity_scope" --brief "$native_parity_brief" --operation-id native-authority-parity-start
grep -Fq "team.started execution admission differs from its event data: authorization_grant" "$TMP_ROOT/expect-fail.err"
[[ "$(cksum "$native_parity_state")" == "$native_parity_state_before" ]]
[[ "$(cksum "$native_parity_runtime")" == "$native_parity_runtime_before" ]]

native_explicit_id="$($BIN init-task "contract explicit native selection" "explicit native selection")"
$BIN start "$native_explicit_id"
write_ready_artifacts "$native_explicit_id"
expect_fail "explicit native requires selection authority" "$BIN" team-record-start "$native_explicit_id" "explicit native objective" --backend native --mode discuss
$BIN team-record-start "$native_explicit_id" "explicit native objective" --backend native --mode discuss --selection-authority-kind user-message --selection-authority-ref user-message:explicit-native-contract >/dev/null
grep -Eq '"authority_ref":[[:space:]]*"user-message:explicit-native-contract"' "$CODEX_WORKFLOW_ROOT/artifacts/$native_explicit_id/state.json"

native_promote_state="$CODEX_WORKFLOW_ROOT/artifacts/$native_roles_id/state.json"
native_promote_runtime="$CODEX_WORKFLOW_ROOT/artifacts/$native_roles_id/runtime.jsonl"
native_promote_state_before="$(cksum "$native_promote_state")"
native_promote_runtime_before="$(cksum "$native_promote_runtime")"
native_promote_contract="$TMP_ROOT/native-promote-execution-contract-v3.md"
sed "s/^task_id: fixture-v3$/task_id: $native_roles_id/" \
  "$native_execute_contract_template" > "$native_promote_contract"
grep -Fxq "task_id: $native_roles_id" "$native_promote_contract"
node "$native_execute_brief_bin" --task "$native_roles_id" --slice slice-one --repo "$ATLAS_FORGE_ROOT" --base "$native_execute_base" --contract "$native_promote_contract" >/dev/null
native_promote_brief="$CODEX_WORKFLOW_ROOT/artifacts/$native_roles_id/team/sdd/slices/slice-one/brief.json"
expect_fail "native execute promotion requires grant" "$BIN" team-promote "$native_roles_id" --to execute --brief "$native_promote_brief" --operation-id native-promote-execute
grep -Fq "missing or invalid execute grant_id" "$TMP_ROOT/expect-fail.err"
[[ "$(cksum "$native_promote_state")" == "$native_promote_state_before" ]]
[[ "$(cksum "$native_promote_runtime")" == "$native_promote_runtime_before" ]]
pass "native team record observability"
