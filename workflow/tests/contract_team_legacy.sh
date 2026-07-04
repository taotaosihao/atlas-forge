# shellcheck shell=bash
# Sourced by contract.sh. Requires BIN, TMP_ROOT, CODEX_WORKFLOW_ROOT,
# CODEX_HOME_ROOT, pass, expect_fail, and write_ready_artifacts.

team_id="$($BIN init-task "contract legacy team observability" "legacy team observability")"
$BIN start "$team_id"
write_ready_artifacts "$team_id"
expect_fail "legacy team failed lanes" "$BIN" team-start "$team_id" "contract objective" --agents 1
$BIN team-status "$team_id" > "$TMP_ROOT/legacy-team-status.out"
grep -q "team_backend: legacy" "$TMP_ROOT/legacy-team-status.out"
grep -q "team_status: failed" "$TMP_ROOT/legacy-team-status.out"
grep -q "team_roles: architect" "$TMP_ROOT/legacy-team-status.out"
grep -q "team_round: " "$TMP_ROOT/legacy-team-status.out"
grep -q "team_temp_dir: " "$TMP_ROOT/legacy-team-status.out"
team_round="$(awk -F': ' '/^team_round:/ {print $2}' "$TMP_ROOT/legacy-team-status.out")"
grep -q "# Team Round" "$team_round"
grep -q "Team round failed. Inspect the round file" "$CODEX_WORKFLOW_ROOT/artifacts/$team_id/team/decision.md"
pass "legacy team observability"

loop_id="$($BIN init-task "contract legacy team loop" "legacy team loop")"
$BIN start "$loop_id"
write_ready_artifacts "$loop_id"

mock_codex="$TMP_ROOT/mock-codex"
cat > "$mock_codex" <<'SH'
#!/usr/bin/env bash
out=""
prev=""
for arg in "$@"; do
  if [[ "$prev" == "--output-last-message" ]]; then
    out="$arg"
    break
  fi
  prev="$arg"
done
last_arg="${!#}"
if [[ -z "$out" ]]; then
  echo "missing --output-last-message" >&2
  exit 2
fi
if [[ "$last_arg" == *"Atlas-managed team loop"* ]]; then
  case "${MOCK_CODEX_VERIFIER_MODE:-done_true}" in
    done_true)
      printf '%s\n' 'done=true' '' 'Evidence: mock verifier accepted README.md check and team artifacts.' > "$out"
      ;;
    false_then_true)
      printf '%s\n' 'done=false' '' 'The expected successful sentinel would be:' 'done=true' > "$out"
      ;;
    *)
      echo "unknown MOCK_CODEX_VERIFIER_MODE: ${MOCK_CODEX_VERIFIER_MODE:-}" >&2
      exit 2
      ;;
  esac
else
  printf '%s\n' '## Evidence' 'Mock lane evidence.' '## Inference' 'Mock lane inference.' '## Unknown' '-' '## Recommendation' 'Proceed.' > "$out"
fi
printf 'mock codex ok\n'
SH
chmod +x "$mock_codex"
CODEX_BIN="$mock_codex" \
PASEO_BIN="__missing_paseo_for_team_loop_contract__" \
  "$BIN" team-loop "$loop_id" "drive team to done" \
    --agents 2 \
    --max-iterations 2 \
    --max-time 10m \
    --verify-check "test -f README.md" \
    --archive >/dev/null
$BIN team-status "$loop_id" > "$TMP_ROOT/legacy-team-loop-status.out"
grep -q "team_status: loop-done" "$TMP_ROOT/legacy-team-loop-status.out"
grep -q "team_loop_status: loop-done" "$TMP_ROOT/legacy-team-loop-status.out"
grep -q "team_loop_iteration: 1" "$TMP_ROOT/legacy-team-loop-status.out"
team_loop_file="$(awk -F': ' '/^team_loop_file:/ {print $2}' "$TMP_ROOT/legacy-team-loop-status.out")"
case "$team_loop_file" in
  /*) team_loop_path="$team_loop_file" ;;
  *) team_loop_path="$CODEX_HOME_ROOT/$team_loop_file" ;;
esac
grep -q "# Team Loop" "$team_loop_path"
grep -q "Verify Check 1" "$team_loop_path"
grep -q "done=true" "$team_loop_path"
! grep -qi "paseo" "$team_loop_path"
pass "legacy team loop atlas-managed wrapper"

loop_false_id="$($BIN init-task "contract legacy team loop false sentinel" "legacy team loop false sentinel")"
$BIN start "$loop_false_id"
write_ready_artifacts "$loop_false_id"
set +e
MOCK_CODEX_VERIFIER_MODE="false_then_true" \
CODEX_BIN="$mock_codex" \
  "$BIN" team-loop "$loop_false_id" "do not stop on later done=true" \
    --agents 1 \
    --max-iterations 1 \
    --max-time 10m \
    --verify-check true > "$TMP_ROOT/legacy-team-loop-false.out"
loop_false_status="$?"
set -e
[[ "$loop_false_status" -ne 0 ]]
grep -q "status: loop-incomplete" "$TMP_ROOT/legacy-team-loop-false.out"
$BIN team-status "$loop_false_id" > "$TMP_ROOT/legacy-team-loop-false-status.out"
grep -q "team_loop_status: loop-incomplete" "$TMP_ROOT/legacy-team-loop-false-status.out"
loop_false_file="$(awk -F': ' '/^team_loop_file:/ {print $2}' "$TMP_ROOT/legacy-team-loop-false-status.out")"
case "$loop_false_file" in
  /*) loop_false_path="$loop_false_file" ;;
  *) loop_false_path="$CODEX_HOME_ROOT/$loop_false_file" ;;
esac
grep -q "sentinel: false" "$loop_false_path"
pass "legacy team loop ignores later done true"

loop_check_id="$($BIN init-task "contract legacy team loop failed check" "legacy team loop failed check")"
$BIN start "$loop_check_id"
write_ready_artifacts "$loop_check_id"
set +e
CODEX_BIN="$mock_codex" \
  "$BIN" team-loop "$loop_check_id" "failed check keeps looping" \
    --agents 1 \
    --max-iterations 1 \
    --max-time 10m \
    --verify-check false > "$TMP_ROOT/legacy-team-loop-check-failed.out"
loop_check_status="$?"
set -e
[[ "$loop_check_status" -ne 0 ]]
grep -q "status: loop-incomplete" "$TMP_ROOT/legacy-team-loop-check-failed.out"
$BIN team-status "$loop_check_id" > "$TMP_ROOT/legacy-team-loop-check-failed-status.out"
grep -q "team_loop_status: loop-incomplete" "$TMP_ROOT/legacy-team-loop-check-failed-status.out"
pass "legacy team loop failed check blocks done"

loop_timeout_id="$($BIN init-task "contract legacy team loop timeout" "legacy team loop timeout")"
$BIN start "$loop_timeout_id"
write_ready_artifacts "$loop_timeout_id"
set +e
CODEX_BIN="$mock_codex" \
  "$BIN" team-loop "$loop_timeout_id" "timeout slow check" \
    --agents 1 \
    --max-iterations 1 \
    --max-time 3s \
    --verify-check "sleep 5" > "$TMP_ROOT/legacy-team-loop-timeout.out"
loop_timeout_status="$?"
set -e
[[ "$loop_timeout_status" -ne 0 ]]
grep -q "status: loop-timeout" "$TMP_ROOT/legacy-team-loop-timeout.out"
$BIN team-status "$loop_timeout_id" > "$TMP_ROOT/legacy-team-loop-timeout-status.out"
grep -q "team_loop_status: loop-timeout" "$TMP_ROOT/legacy-team-loop-timeout-status.out"
pass "legacy team loop enforces max time"
