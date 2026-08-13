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

loop_id="$($BIN init-task "contract legacy team loop disabled" "legacy team loop disabled")"
$BIN start "$loop_id"
write_ready_artifacts "$loop_id"
loop_state="$CODEX_WORKFLOW_ROOT/artifacts/$loop_id/state.json"
loop_runtime="$CODEX_WORKFLOW_ROOT/artifacts/$loop_id/runtime.jsonl"
loop_state_before="$(cksum "$loop_state")"
loop_runtime_before="$(cksum "$loop_runtime")"
mock_codex="$TMP_ROOT/mock-codex"
mock_codex_called="$TMP_ROOT/mock-codex-called"
cat > "$mock_codex" <<SH
#!/usr/bin/env bash
printf '%s\n' called > "$mock_codex_called"
exit 99
SH
chmod +x "$mock_codex"
set +e
CODEX_BIN="$mock_codex" "$BIN" team-loop "$loop_id" "legacy loop must fail closed" \
  --agents 1 --max-iterations 1 --max-time 1m --verify-check true \
  > "$TMP_ROOT/legacy-team-loop-disabled.out" \
  2> "$TMP_ROOT/legacy-team-loop-disabled.err"
loop_status="$?"
set -e
[[ "$loop_status" -ne 0 ]]
grep -Fxq "legacy team-loop is disabled because it implicitly launches execute mode" \
  "$TMP_ROOT/legacy-team-loop-disabled.err"
[[ ! -e "$mock_codex_called" ]]
[[ "$(cksum "$loop_state")" == "$loop_state_before" ]]
[[ "$(cksum "$loop_runtime")" == "$loop_runtime_before" ]]
node - "$loop_state" <<'NODE'
const fs = require("fs");
const state = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (state.status !== "doing") process.exit(1);
const team = state.active_team && typeof state.active_team === "object" ? state.active_team : {};
for (const key of ["backend", "mode", "status", "decision"]) {
  if ((team[key] || "") !== "") process.exit(1);
}
if (team.schema_version !== undefined || team.team_run_id !== undefined) process.exit(1);
NODE
$BIN team-status "$loop_id" > "$TMP_ROOT/legacy-team-loop-disabled-status.out"
grep -Fxq "status: doing" "$TMP_ROOT/legacy-team-loop-disabled-status.out"
grep -Fxq "team_backend: " "$TMP_ROOT/legacy-team-loop-disabled-status.out"
grep -Fxq "team_status: " "$TMP_ROOT/legacy-team-loop-disabled-status.out"
pass "legacy team loop fail-closed"
