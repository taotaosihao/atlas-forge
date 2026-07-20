# shellcheck shell=bash
# Sourced by contract.sh or a minimal contract harness. Requires BIN, TMP_ROOT,
# CODEX_WORKFLOW_ROOT, pass, expect_fail, and write_ready_artifacts.

paseo_id="$($BIN init-task "contract paseo team records" "paseo team records")"
$BIN start "$paseo_id"
write_ready_artifacts "$paseo_id"
paseo_team_dir="$CODEX_WORKFLOW_ROOT/artifacts/$paseo_id/team"
expect_fail "paseo record missing providers" "$BIN" team-record-start "$paseo_id" "paseo objective" --backend paseo --mode discuss --agents 2 --roles planner,reviewer
expect_fail "paseo record invalid providers" "$BIN" team-record-start "$paseo_id" "paseo objective" --backend paseo --mode discuss --agents 2 --roles planner,reviewer --providers $'codex=gpt-5.6\nclaude=sonnet-4'
$BIN team-record-start "$paseo_id" "paseo objective" --backend paseo --mode discuss --agents 5 --roles "planner,implementer,reviewer,verifier,integrator" --providers "codex=gpt-5.6 via openai; claude=sonnet-4 via anthropic; deepseek=deepseek-coder via volcengine; glm=glm-4.5 via zhipu; kimi=kimi-k3 via kimi" >/dev/null
$BIN team-status "$paseo_id" > "$TMP_ROOT/paseo-status-running.out"
grep -q "team_backend: paseo" "$TMP_ROOT/paseo-status-running.out"
grep -q "team_status: running" "$TMP_ROOT/paseo-status-running.out"
grep -q "team_providers: codex=gpt-5.6 via openai; claude=sonnet-4 via anthropic; deepseek=deepseek-coder via volcengine; glm=glm-4.5 via zhipu; kimi=kimi-k3 via kimi" "$TMP_ROOT/paseo-status-running.out"
paseo_round="$paseo_team_dir/round-paseo.md"
paseo_decision="$paseo_team_dir/decision.md"
paseo_staffing="$paseo_team_dir/staffing.md"
printf '%s\n' '# Paseo Round' '' '- backend: paseo' '' '## Evidence' 'Paseo round evidence for record command contract.' '## Inference' 'Paseo inference.' '## Unknown' '-' '## Recommendation' 'Finalize paseo record.' > "$paseo_round"
printf '%s\n' '# Team Decision' '' '- backend: paseo' '' '## Primary Decision' 'Paseo decision evidence is substantive enough for readiness.' > "$paseo_decision"
printf '%s\n' '# Staffing' '' '- backend: paseo' '' '## Suggested Ownership' 'Paseo integration owner writes the patch; verifier owns contract checks.' > "$paseo_staffing"
printf '%s\n' '# Wrong Staffing' '' '- backend: native' '' '## Suggested Ownership' 'Wrong backend marker must fail.' > "$CODEX_WORKFLOW_ROOT/artifacts/$paseo_id/team/staffing-native.md"
expect_fail "paseo finalize native marker" "$BIN" team-record-finalize "$paseo_id" --backend paseo --status complete --round "$paseo_round" --decision "$paseo_decision" --staffing "$CODEX_WORKFLOW_ROOT/artifacts/$paseo_id/team/staffing-native.md"
$BIN team-record-finalize "$paseo_id" --backend paseo --status complete --round "$paseo_round" --decision "$paseo_decision" --staffing "$paseo_staffing" >/dev/null
$BIN team-status "$paseo_id" > "$TMP_ROOT/paseo-status-complete.out"
grep -q "team_backend: paseo" "$TMP_ROOT/paseo-status-complete.out"
grep -q "team_status: complete" "$TMP_ROOT/paseo-status-complete.out"
grep -q "team_staffing: " "$TMP_ROOT/paseo-status-complete.out"
paseo_loop="$paseo_team_dir/loop-paseo.md"
wrong_paseo_loop="$paseo_team_dir/loop-native.md"
printf '%s\n' '# Wrong Paseo Team Loop' '' '- backend: native' '' '## Evidence' 'A native marker cannot close a Paseo loop.' > "$wrong_paseo_loop"
expect_fail "paseo loop native marker" "$BIN" team-loop-record "$paseo_id" --backend paseo --status loop-done --loop "$wrong_paseo_loop" --iterations 1
printf '%s\n' '# Paseo Team Loop' '' '- backend: paseo' '- status: loop-done' '' '## Evidence' 'Paseo loop evidence proves the requested objective completed.' '## Final Status' 'done=true' > "$paseo_loop"
$BIN team-loop-record "$paseo_id" --backend paseo --status loop-done --loop "$paseo_loop" --iterations 2 --max-time 12m >/dev/null
$BIN team-status "$paseo_id" > "$TMP_ROOT/paseo-loop-status.out"
grep -q "team_backend: paseo" "$TMP_ROOT/paseo-loop-status.out"
grep -q "team_status: loop-done" "$TMP_ROOT/paseo-loop-status.out"
grep -q "team_loop_iteration: 2" "$TMP_ROOT/paseo-loop-status.out"
grep -q "team_loop_max_time: 12m" "$TMP_ROOT/paseo-loop-status.out"
grep -q "team_providers: codex=gpt-5.6 via openai; claude=sonnet-4 via anthropic; deepseek=deepseek-coder via volcengine; glm=glm-4.5 via zhipu; kimi=kimi-k3 via kimi" "$TMP_ROOT/paseo-loop-status.out"
pass "paseo team record observability"
