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
$BIN team-record-start "$native_id" "native objective" --backend native --mode discuss --agents 3 --roles "architect,critic,verifier" >/dev/null
$BIN team-status "$native_id" > "$TMP_ROOT/native-status-running.out"
grep -q "team_backend: native" "$TMP_ROOT/native-status-running.out"
grep -q "team_status: running" "$TMP_ROOT/native-status-running.out"
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
$BIN ready "$native_id" --require context,spec,analysis,decision >/dev/null
native_loop="$native_team_dir/loop-native.md"
printf '%s\n' '# Native Team Loop' '' '- backend: native' '- status: loop-done' '' '## Evidence' 'Native loop evidence proves the requested objective completed.' '## Final Status' 'done=true' > "$native_loop"
expect_fail "native loop invalid status" "$BIN" team-loop-record "$native_id" --backend native --status complete --loop "$native_loop" --iterations 1
expect_fail "native loop invalid iterations" "$BIN" team-loop-record "$native_id" --backend native --status loop-done --loop "$native_loop" --iterations 0
expect_fail "native loop missing task" "$BIN" team-loop-record missing-native-task --backend native --status loop-done --loop "$native_loop" --iterations 1
$BIN team-loop-record "$native_id" --backend native --status loop-done --loop "$native_loop" --iterations 1 --max-iterations 2 --max-time 10m >/dev/null
$BIN team-status "$native_id" > "$TMP_ROOT/native-loop-status.out"
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
$BIN team-record-start "$native_template_id" "native template objective" --backend native --mode discuss --agents 1 --roles architect >/dev/null
printf '%s\n' '# Native Round' '' '- backend: native' '' '## Evidence' 'Native template rejection has substantive round evidence.' > "$native_template_dir/round-native.md"
expect_fail "native finalize template decision" "$BIN" team-record-finalize "$native_template_id" --backend native --status complete --round "$native_template_dir/round-native.md" --decision "$native_template_dir/decision.md" --staffing "$native_template_dir/staffing.md"
$BIN team-status "$native_template_id" > "$TMP_ROOT/native-template-status.out"
grep -q "team_status: running" "$TMP_ROOT/native-template-status.out"

native_roles_id="$($BIN init-task "contract native dynamic roles" "native dynamic roles")"
$BIN start "$native_roles_id"
write_ready_artifacts "$native_roles_id"
$BIN team-record-start "$native_roles_id" "native dynamic role objective" --backend native --mode discuss --agents 4 --roles "domain-architect,api-reviewer,ui-verifier,evidence-qa" >/dev/null
$BIN team-status "$native_roles_id" > "$TMP_ROOT/native-dynamic-roles-status.out"
grep -q "team_backend: native" "$TMP_ROOT/native-dynamic-roles-status.out"
grep -q "team_agents: 4" "$TMP_ROOT/native-dynamic-roles-status.out"
grep -q "team_roles: domain-architect,api-reviewer,ui-verifier,evidence-qa" "$TMP_ROOT/native-dynamic-roles-status.out"
pass "native team record observability"

