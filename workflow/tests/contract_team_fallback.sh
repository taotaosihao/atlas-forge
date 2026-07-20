# shellcheck shell=bash
# Sourced by contract.sh. Requires BIN, TMP_ROOT, CODEX_WORKFLOW_ROOT,
# pass, expect_fail, and write_ready_artifacts.

fake_paseo="$TMP_ROOT/fake-paseo"
tee "$fake_paseo" >/dev/null <<'SH'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == provider && "${2:-}" == models ]]; then
  printf '%s\n' '[{"id":"gpt-5.6","provider":"openai","model_family":"non-claude"}]'
  exit 0
fi
if [[ "${1:-}" == provider && "${2:-}" == ls ]]; then
  printf '%s\n' '[{"provider":"openai","status":"available","defaultMode":"default"}]'
  exit 0
fi
if [[ "${1:-}" == ls ]]; then
  printf '%s\n' '[]'
  exit 0
fi
if [[ "${1:-}" == run ]]; then
  if [[ " $* " == *" quota exhausted "* ]]; then
    printf '%s\n' '{"status":"error","actor_created":false,"error":{"code":"QUOTA_EXHAUSTED","message":"quota exhausted"}}' >&2
    exit 44
  fi
  printf '%s\n' '{"status":"error","actor_created":false,"error":{"code":"PROVIDER_UNAVAILABLE","message":"provider unavailable"}}' >&2
  exit 43
fi
printf '%s\n' '{"status":"error","error":{"code":"UNKNOWN_ACTION","message":"unsupported"}}' >&2
exit 2
SH
chmod +x "$fake_paseo"

fallback_id="$($BIN init-task "contract paseo native fallback" "paseo native fallback")"
$BIN start "$fallback_id"
write_ready_artifacts "$fallback_id"
fallback_team_dir="$CODEX_WORKFLOW_ROOT/artifacts/$fallback_id/team"
$BIN team-record-start "$fallback_id" "review with Paseo and native fallback" \
  --backend paseo --mode discuss \
  --selection-authority-kind user-message \
  --selection-authority-ref user-message:fallback-contract >/dev/null
$BIN team-lane-record "$fallback_id" --operation-id fallback-lane-open \
  --action open --lane review >/dev/null
$BIN team-dispatch-record "$fallback_id" --operation-id fallback-dispatch-open \
  --action open --lane review --dispatch review-dispatch >/dev/null
PASEO_BIN="$fake_paseo" $BIN team-selection-record "$fallback_id" --operation-id fallback-capability-op \
  --event-id fallback-capability --kind capability \
  --authority-ref controller-observation:fallback \
  --provider openai --model gpt-5.6 >/dev/null
$BIN team-attempt-record "$fallback_id" --operation-id paseo-reserve \
  --action reserve --dispatch review-dispatch --attempt paseo-review \
  --provider openai --model gpt-5.6 --capability-snapshot fallback-capability \
  --launch-operation-id launch-paseo-review >/dev/null
PASEO_BIN="$fake_paseo" $BIN team-attempt-record "$fallback_id" --operation-id paseo-observe \
  --action observe --attempt paseo-review --observation-id provider-unavailable \
  --observer-action run --observer-args-json '["provider unavailable"]' >/dev/null
$BIN team-attempt-record "$fallback_id" --operation-id paseo-terminal \
  --action terminal --attempt paseo-review --outcome operational-failure \
  --failure-class provider_unavailable --observation-id provider-unavailable \
  --launch-invoked true \
  --evidence-refs team/observation-provider-unavailable.json >/dev/null
printf '%s\n' '{"status":"quiesced"}' > "$fallback_team_dir/paseo-quiesced.json"
$BIN team-attempt-record "$fallback_id" --operation-id paseo-quiesced \
  --action quiesced --attempt paseo-review --observation-id provider-unavailable \
  --evidence-refs team/paseo-quiesced.json >/dev/null
$BIN team-fallback-record "$fallback_id" --operation-id native-fallback \
  --from-attempt paseo-review --to-attempt native-review \
  --launch-operation-id launch-native-review \
  --evidence-refs team/paseo-quiesced.json >/dev/null
$BIN team-attempt-record "$fallback_id" --operation-id native-terminal \
  --action terminal --attempt native-review --outcome succeeded \
  --launch-invoked true --evidence-refs team/native-review.md >/dev/null
printf '%s\n' '{"status":"quiesced"}' > "$fallback_team_dir/native-quiesced.json"
$BIN team-attempt-record "$fallback_id" --operation-id native-quiesced \
  --action quiesced --attempt native-review \
  --evidence-refs team/native-quiesced.json >/dev/null
$BIN team-dispatch-record "$fallback_id" --operation-id fallback-dispatch-dispose \
  --action dispose --dispatch review-dispatch --disposition admitted \
  --admitted-attempts native-review --evidence-refs team/native-review.md >/dev/null
$BIN team-dispatch-record "$fallback_id" --operation-id fallback-dispatch-close \
  --action close --dispatch review-dispatch >/dev/null
$BIN team-lane-record "$fallback_id" --operation-id fallback-lane-close \
  --action close --lane review --convergence CONSENSUS >/dev/null
printf '%s\n' '# Round' '' '- backend: native' '' \
  'Paseo failed operationally and native completed the review.' > "$fallback_team_dir/round-native.md"
printf '%s\n' '# Decision' '' '- backend: native' '' \
  'Native fallback evidence was admitted after preserving Paseo history.' > "$fallback_team_dir/decision.md"
printf '%s\n' '# Staffing' '' '- backend: native' '' \
  'Paseo was attempted; the native reviewer completed the same lane.' > "$fallback_team_dir/staffing.md"
$BIN team-record-finalize "$fallback_id" --backend native --status complete \
  --round "$fallback_team_dir/round-native.md" \
  --decision "$fallback_team_dir/decision.md" \
  --staffing "$fallback_team_dir/staffing.md" >/dev/null
$BIN team-status "$fallback_id" > "$TMP_ROOT/fallback-status.out"
grep -q "team_attempted_backends: native,paseo" "$TMP_ROOT/fallback-status.out"
grep -q "team_effective_backend: native" "$TMP_ROOT/fallback-status.out"
grep -Eq '"from_attempt_id":[[:space:]]*"paseo-review"' \
  "$CODEX_WORKFLOW_ROOT/artifacts/$fallback_id/state.json"

no_fallback_id="$($BIN init-task "contract paseo no fallback" "paseo no fallback")"
$BIN start "$no_fallback_id"
write_ready_artifacts "$no_fallback_id"
no_fallback_team_dir="$CODEX_WORKFLOW_ROOT/artifacts/$no_fallback_id/team"
$BIN team-record-start "$no_fallback_id" "review with no fallback" \
  --backend paseo --mode discuss --fallback-policy none \
  --selection-authority-kind user-message \
  --selection-authority-ref user-message:no-fallback-contract >/dev/null
$BIN team-lane-record "$no_fallback_id" --operation-id no-fallback-lane-open \
  --action open --lane review >/dev/null
$BIN team-dispatch-record "$no_fallback_id" --operation-id no-fallback-dispatch-open \
  --action open --lane review --dispatch review-dispatch >/dev/null
PASEO_BIN="$fake_paseo" $BIN team-selection-record "$no_fallback_id" --operation-id no-fallback-capability-op \
  --event-id no-fallback-capability --kind capability \
  --authority-ref controller-observation:no-fallback \
  --provider openai --model gpt-5.6 >/dev/null
$BIN team-attempt-record "$no_fallback_id" --operation-id no-fallback-reserve \
  --action reserve --dispatch review-dispatch --attempt paseo-unavailable \
  --provider openai --model gpt-5.6 --capability-snapshot no-fallback-capability \
  --launch-operation-id launch-paseo-unavailable >/dev/null
PASEO_BIN="$fake_paseo" $BIN team-attempt-record "$no_fallback_id" --operation-id no-fallback-observe \
  --action observe --attempt paseo-unavailable --observation-id quota-exhausted \
  --observer-action run --observer-args-json '["quota exhausted"]' >/dev/null
$BIN team-attempt-record "$no_fallback_id" --operation-id no-fallback-terminal \
  --action terminal --attempt paseo-unavailable --outcome operational-failure \
  --failure-class quota_exhausted --observation-id quota-exhausted \
  --launch-invoked true >/dev/null
$BIN team-attempt-record "$no_fallback_id" --operation-id no-fallback-quiesced \
  --action quiesced --attempt paseo-unavailable \
  --observation-id quota-exhausted >/dev/null
expect_fail "explicit no-fallback rejects native fallback" \
  "$BIN" team-fallback-record "$no_fallback_id" --operation-id forbidden-native-fallback \
    --from-attempt paseo-unavailable --to-attempt native-forbidden \
    --launch-operation-id launch-native-forbidden
$BIN team-dispatch-record "$no_fallback_id" --operation-id no-fallback-dispose \
  --action dispose --dispatch review-dispatch --disposition backend-unavailable \
  --evidence-refs team/observation-quota.json >/dev/null
$BIN team-dispatch-record "$no_fallback_id" --operation-id no-fallback-close \
  --action close --dispatch review-dispatch >/dev/null
$BIN team-lane-record "$no_fallback_id" --operation-id no-fallback-lane-close \
  --action close --lane review --convergence CONSENSUS_WITH_RESERVATIONS >/dev/null
printf '%s\n' '# Round' '' '- backend: none' '' \
  'Paseo was unavailable and fallback was explicitly disabled.' > "$no_fallback_team_dir/round-none.md"
printf '%s\n' '# Decision' '' '- backend: none' '' \
  'No attempt result was admitted for this provider-specific lane.' > "$no_fallback_team_dir/decision.md"
printf '%s\n' '# Staffing' '' '- backend: none' '' \
  'The requested Paseo perspective remains unavailable.' > "$no_fallback_team_dir/staffing.md"
$BIN team-record-finalize "$no_fallback_id" --backend native --status failed \
  --round "$no_fallback_team_dir/round-none.md" \
  --decision "$no_fallback_team_dir/decision.md" \
  --staffing "$no_fallback_team_dir/staffing.md" >/dev/null
$BIN team-status "$no_fallback_id" > "$TMP_ROOT/no-fallback-status.out"
grep -q "team_backend: native" "$TMP_ROOT/no-fallback-status.out"
grep -q "team_effective_backend: none" "$TMP_ROOT/no-fallback-status.out"
node - "$no_fallback_team_dir/backend-v2.json" <<'NODE'
const sidecar = require(process.argv[2]);
if (sidecar.effective_backend !== "none" || sidecar.legacy_projection !== true) process.exit(1);
if (!Array.isArray(sidecar.lanes) || sidecar.lanes.length !== 0) process.exit(1);
NODE

pass "team Paseo fallback and no-fallback disclosure"
