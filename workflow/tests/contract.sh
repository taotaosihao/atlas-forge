#!/usr/bin/env bash
set -euo pipefail

BIN="${CODEX_WORKFLOW_BIN:-/home/gewu/.codex/workflow/bin/codex-workflow}"
REAL_CODEX_HOME="${CODEX_HOME_REAL:-/home/gewu/.codex}"
REAL_AGENTS_HOME="${AGENTS_HOME_REAL:-$HOME/.agents}"
ATLAS_FORGE_ROOT="${ATLAS_FORGE_ROOT:-/home/gewu/work/atlas-forge}"
TMP_ROOT="$(mktemp -d)"
export CODEX_WORKFLOW_ROOT="$TMP_ROOT/workflow"
export CODEX_HOME_ROOT="$TMP_ROOT/codex"
export CODEX_BIN="__missing_codex_for_contract__"
export PASEO_BIN="__missing_paseo_for_contract__"

mkdir -p "$CODEX_HOME_ROOT"

pass() {
  printf 'ok - %s\n' "$1"
}

expect_fail() {
  local label="$1"
  shift
  if "$@" >"$TMP_ROOT/expect-fail.out" 2>"$TMP_ROOT/expect-fail.err"; then
    printf 'expected failure but passed: %s\n' "$label" >&2
    exit 1
  fi
}

write_ready_artifacts() {
  local task_id="$1"
  local artifact_dir="$CODEX_WORKFLOW_ROOT/artifacts/$task_id"
  printf '%s\n' '# Context' '' 'Substantive context.' > "$artifact_dir/context.md"
  printf '%s\n' '# Spec' '' 'Substantive spec.' > "$artifact_dir/spec.md"
  printf '%s\n' '# Analysis' '' 'Substantive analysis.' > "$artifact_dir/analysis.md"
}

setup_repo() {
  local repo="$1"
  mkdir -p "$repo/docs" "$repo/notes"
  git -C "$repo" init -q
  git -C "$repo" config user.email test@example.com
  git -C "$repo" config user.name Test
  printf '%s\n' '# PRD' '' 'Implement the selected behavior.' > "$repo/docs/prd.md"
  printf '%s\n' '# Curated Facts' '' '- Atlas owns PRD fidelity.' '- Multica executes implementation.' > "$repo/notes/context.md"
  git -C "$repo" add .
  git -C "$repo" commit -m init -q
}

bash -n "$BIN"

done_id="$($BIN init-task "contract done gate" "done gate")"
$BIN start "$done_id"
expect_fail "done without verification" "$BIN" done "$done_id"
$BIN verify "$done_id" -- true >/dev/null
$BIN done "$done_id"
pass "done gate"

ready_id="$($BIN init-task "contract readiness" "readiness")"
$BIN start "$ready_id"
expect_fail "fresh readiness" "$BIN" ready "$ready_id"
write_ready_artifacts "$ready_id"
$BIN ready "$ready_id" >/dev/null
expect_fail "template decision readiness" "$BIN" ready "$ready_id" --require context,spec,analysis,decision
printf '%s\n' '# Team Decision' '' 'Substantive decision.' > "$CODEX_WORKFLOW_ROOT/artifacts/$ready_id/team/decision.md"
$BIN ready "$ready_id" --require context,spec,analysis,decision >/dev/null
pass "readiness gate"

team_id="$($BIN init-task "contract team observability" "team observability")"
$BIN start "$team_id"
write_ready_artifacts "$team_id"
expect_fail "team failed lanes" "$BIN" team-start "$team_id" "contract objective" --agents 1
$BIN team-status "$team_id" > "$TMP_ROOT/team-status.out"
grep -q "team_status: failed" "$TMP_ROOT/team-status.out"
grep -q "team_roles: architect" "$TMP_ROOT/team-status.out"
grep -q "team_round: " "$TMP_ROOT/team-status.out"
grep -q "team_temp_dir: " "$TMP_ROOT/team-status.out"
team_round="$(awk -F': ' '/^team_round:/ {print $2}' "$TMP_ROOT/team-status.out")"
grep -q "# Team Round" "$team_round"
grep -q "Team round failed. Inspect the round file" "$CODEX_WORKFLOW_ROOT/artifacts/$team_id/team/decision.md"
pass "team observability"

loop_id="$($BIN init-task "contract team loop" "team loop")"
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
$BIN team-status "$loop_id" > "$TMP_ROOT/team-loop-status.out"
grep -q "team_status: loop-done" "$TMP_ROOT/team-loop-status.out"
grep -q "team_loop_status: loop-done" "$TMP_ROOT/team-loop-status.out"
grep -q "team_loop_iteration: 1" "$TMP_ROOT/team-loop-status.out"
team_loop_file="$(awk -F': ' '/^team_loop_file:/ {print $2}' "$TMP_ROOT/team-loop-status.out")"
case "$team_loop_file" in
  /*) team_loop_path="$team_loop_file" ;;
  *) team_loop_path="$CODEX_HOME_ROOT/$team_loop_file" ;;
esac
grep -q "# Team Loop" "$team_loop_path"
grep -q "Verify Check 1" "$team_loop_path"
grep -q "done=true" "$team_loop_path"
! grep -qi "paseo" "$team_loop_path"
pass "team loop atlas-managed wrapper"

loop_false_id="$($BIN init-task "contract team loop false sentinel" "team loop false sentinel")"
$BIN start "$loop_false_id"
write_ready_artifacts "$loop_false_id"
set +e
MOCK_CODEX_VERIFIER_MODE="false_then_true" \
CODEX_BIN="$mock_codex" \
  "$BIN" team-loop "$loop_false_id" "do not stop on later done=true" \
    --agents 1 \
    --max-iterations 1 \
    --max-time 10m \
    --verify-check true > "$TMP_ROOT/team-loop-false.out"
loop_false_status="$?"
set -e
[[ "$loop_false_status" -ne 0 ]]
grep -q "status: loop-incomplete" "$TMP_ROOT/team-loop-false.out"
$BIN team-status "$loop_false_id" > "$TMP_ROOT/team-loop-false-status.out"
grep -q "team_loop_status: loop-incomplete" "$TMP_ROOT/team-loop-false-status.out"
loop_false_file="$(awk -F': ' '/^team_loop_file:/ {print $2}' "$TMP_ROOT/team-loop-false-status.out")"
case "$loop_false_file" in
  /*) loop_false_path="$loop_false_file" ;;
  *) loop_false_path="$CODEX_HOME_ROOT/$loop_false_file" ;;
esac
grep -q "sentinel: false" "$loop_false_path"
pass "team loop ignores later done true"

loop_check_id="$($BIN init-task "contract team loop failed check" "team loop failed check")"
$BIN start "$loop_check_id"
write_ready_artifacts "$loop_check_id"
set +e
CODEX_BIN="$mock_codex" \
  "$BIN" team-loop "$loop_check_id" "failed check keeps looping" \
    --agents 1 \
    --max-iterations 1 \
    --max-time 10m \
    --verify-check false > "$TMP_ROOT/team-loop-check-failed.out"
loop_check_status="$?"
set -e
[[ "$loop_check_status" -ne 0 ]]
grep -q "status: loop-incomplete" "$TMP_ROOT/team-loop-check-failed.out"
$BIN team-status "$loop_check_id" > "$TMP_ROOT/team-loop-check-failed-status.out"
grep -q "team_loop_status: loop-incomplete" "$TMP_ROOT/team-loop-check-failed-status.out"
pass "team loop failed check blocks done"

loop_timeout_id="$($BIN init-task "contract team loop timeout" "team loop timeout")"
$BIN start "$loop_timeout_id"
write_ready_artifacts "$loop_timeout_id"
set +e
CODEX_BIN="$mock_codex" \
  "$BIN" team-loop "$loop_timeout_id" "timeout slow check" \
    --agents 1 \
    --max-iterations 1 \
    --max-time 3s \
    --verify-check "sleep 5" > "$TMP_ROOT/team-loop-timeout.out"
loop_timeout_status="$?"
set -e
[[ "$loop_timeout_status" -ne 0 ]]
grep -q "status: loop-timeout" "$TMP_ROOT/team-loop-timeout.out"
$BIN team-status "$loop_timeout_id" > "$TMP_ROOT/team-loop-timeout-status.out"
grep -q "team_loop_status: loop-timeout" "$TMP_ROOT/team-loop-timeout-status.out"
pass "team loop enforces max time"

repo="$TMP_ROOT/repo"
setup_repo "$repo"

handoff_id="$($BIN init-task "contract handoff" "handoff")"
$BIN start "$handoff_id"
$BIN handoff-envelope "$handoff_id" \
  --prd "$repo/docs/prd.md" \
  --repo "$repo" \
  --base main \
  --acceptance "A1|feature works|required" \
  --validation "V1|unit|required|command output" >/dev/null
grep -q "PRD SHA256" "$CODEX_WORKFLOW_ROOT/artifacts/$handoff_id/multica-handoff-envelope.md"
pass "handoff envelope"

result_id="$($BIN init-task "contract result ingest" "result ingest")"
$BIN start "$result_id"
$BIN result-ingest "$result_id" \
  --issue issue-1 \
  --outcome draft-pr \
  --draft-pr https://example.invalid/pr/1 \
  --commit deadbee \
  --worktree none \
  --evidence "$TMP_ROOT/evidence.txt" >/dev/null
grep -q "result_outcome: draft-pr" "$CODEX_WORKFLOW_ROOT/tasks/$result_id.md"
expect_fail "blocker without blocker pointer" "$BIN" result-ingest "$result_id" --issue issue-2 --outcome blocker --commit unknown --worktree none --evidence evidence
pass "result ingest"

route_id="$($BIN init-task "contract route" "route")"
$BIN start "$route_id"
printf '%s\n' '# Team Decision' '' '## Planner' 'Use route evidence.' '' '## Architect' 'Keep state structured.' '' '## Critic' 'Reject template consensus.' > "$CODEX_WORKFLOW_ROOT/artifacts/$route_id/team/decision.md"
$BIN route-decision "$route_id" \
  --intent multica-handoff \
  --risk high \
  --decision use \
  --reason "handoff needs routing evidence" \
  --assumption "PRD approved" \
  --consensus >/dev/null
test -f "$CODEX_WORKFLOW_ROOT/artifacts/$route_id/consensus-plan.md"
$BIN route-decision "$route_id" \
  --layer task \
  --risk medium \
  --decision skip \
  --reason "legacy layer alias remains accepted" >/dev/null
grep -q "route_intent: task" "$CODEX_WORKFLOW_ROOT/tasks/$route_id.md"
$BIN route-decision --help >/dev/null
$BIN route-decision "$route_id" \
  --intent analyze \
  --risk low \
  --decision use \
  --reason "read-only synthesis is the selected route" >/dev/null
grep -q "route_intent: analyze" "$CODEX_WORKFLOW_ROOT/tasks/$route_id.md"
expect_fail "invalid route intent" "$BIN" route-decision "$route_id" --intent unknown --risk low --decision use --reason bad
expect_fail "route external issue key" "$BIN" route-decision GEW-30 --intent multica-handoff --risk high --decision use --reason handoff
grep -q "unknown route-decision task id: GEW-30" "$TMP_ROOT/expect-fail.err"
grep -q "not an external issue key" "$TMP_ROOT/expect-fail.err"
pass "route decision"

packet_id="$($BIN init-task "contract packet" "packet")"
$BIN start "$packet_id"
$BIN curated-packet "$packet_id" \
  --prd "$repo/docs/prd.md" \
  --repo "$repo" \
  --base main \
  --source "$repo/notes/context.md" >/dev/null
packet="$CODEX_WORKFLOW_ROOT/artifacts/$packet_id/multica-memory-packet.md"
$BIN curated-packet --lint "$packet" >/dev/null
printf '%s\n' '# Bad' 'packet_version: 1' > "$TMP_ROOT/bad-packet.md"
expect_fail "bad packet lint" "$BIN" curated-packet --lint "$TMP_ROOT/bad-packet.md"
$BIN curated-packet "$packet_id" --skip "packet not needed for tiny handoff" >/dev/null
grep -q "packet_status: skipped" "$CODEX_WORKFLOW_ROOT/tasks/$packet_id.md"
pass "curated packet"

p2_id="$($BIN init-task "contract p2 commands" "p2 commands")"
$BIN start "$p2_id"
printf '%s\n' '# P2 Source' '' 'P2 command contract source.' > "$TMP_ROOT/p2-source.md"
$BIN checkpoint "$p2_id" --phase plan --summary "plan cycle ready" --branch main --worktree none --next "verify p2 commands" >/dev/null
grep -q "current_phase: plan" "$CODEX_WORKFLOW_ROOT/tasks/$p2_id.md"
$BIN source-snapshot "$p2_id" --source "$TMP_ROOT/p2-source.md" --used-for "contract provenance" --authority canonical --freshness fresh >/dev/null
grep -q "contract provenance" "$CODEX_WORKFLOW_ROOT/artifacts/$p2_id/provenance.md"
$BIN prompt-bundle "$p2_id" --include "$TMP_ROOT/p2-source.md" --skill atlas-workflow:task --agent atlas --bundle-id p2-contract >/dev/null
python3 -m json.tool "$CODEX_WORKFLOW_ROOT/artifacts/$p2_id/prompt-bundle.json" >/dev/null
set +e
$BIN verify "$p2_id" --outcome failed --trajectory reproduced --evaluator local-command --failure-attribution code --evidence "$TMP_ROOT/p2-source.md" -- bash -lc 'exit 3' >/dev/null
verify_status=$?
set -e
test "$verify_status" -eq 3
grep -q "failure_attribution: code" "$CODEX_WORKFLOW_ROOT/artifacts/$p2_id"/verification/*.md
$BIN trace-promote "$p2_id" --from latest --type regression --reason "contract failed command" --owner atlas >/dev/null
test -d "$CODEX_WORKFLOW_ROOT/artifacts/$p2_id/regressions"
$BIN multica-feedback "$p2_id" --issue issue-2 --commit unknown --round 1 --status repair-needed --review review.md --blocking-finding "A1 failed" >/dev/null
grep -q "multica_feedback_status: repair-needed" "$CODEX_WORKFLOW_ROOT/tasks/$p2_id.md"
expect_fail "repair feedback without finding" "$BIN" multica-feedback "$p2_id" --issue issue-3 --commit unknown --round 1 --status repair-needed
$BIN feedback-cycle "$p2_id" --source multica-review --finding "A1 failed" --severity high --classification implementation-bug --route repair --affected-row A1 --evidence review.md >/dev/null
grep -q "Active plan cycle: 1" "$CODEX_WORKFLOW_ROOT/artifacts/$p2_id/return-to-plan.md"
$BIN lesson-candidate "$p2_id" --trigger multica-feedback --lesson "Feed required validation failures back to plan" --evidence review.md >/dev/null
grep -q "Feed required validation" "$CODEX_WORKFLOW_ROOT/artifacts/$p2_id/lesson-candidates.md"
$BIN learning-decision "$p2_id" --decision skip --reason "single contract candidate" --candidate L1 >/dev/null
grep -q "Decision: skip" "$CODEX_WORKFLOW_ROOT/artifacts/$p2_id/learning-decision.md"
$BIN gate-metric "$p2_id" --gate feedback-cycle --action used --reason "required row failed" --duration-ms 12 >/dev/null
$BIN gate-report --days 1 > "$TMP_ROOT/gate-report.md"
grep -q "feedback-cycle" "$TMP_ROOT/gate-report.md"
expect_fail "invalid gate metric" "$BIN" gate-metric "$p2_id" --gate unknown --action used --reason bad
pass "p2 commands"

$BIN install-hooks >/dev/null
$BIN doctor --json > "$TMP_ROOT/doctor.json"
python3 -m json.tool "$TMP_ROOT/doctor.json" >/dev/null
python3 -c "import json,sys; data=json.load(open(sys.argv[1], encoding=\"utf-8\")); required={\"install\",\"source_cache\",\"hooks_config\",\"hooks_runtime\",\"smoke\"}; assert required <= set(data)" "$TMP_ROOT/doctor.json"
python3 -c "import json,sys; data=json.load(open(sys.argv[1], encoding=\"utf-8\")); assert data[\"hooks_config\"][\"status\"] == \"ok\"; assert data[\"hooks_config\"][\"features.hooks\"] == \"true\"" "$TMP_ROOT/doctor.json"
pass "doctor json"

source_skills_root="${ATLAS_SOURCE_SKILLS_DIR:-$ATLAS_FORGE_ROOT/plugins/atlas-workflow/skills}"
cache_skills_root="${ATLAS_CACHE_SKILLS_DIR:-}"
cache_plugin_root="${ATLAS_CACHE_PLUGIN_ROOT:-}"
if [[ -z "$cache_skills_root" ]]; then
  latest_atlas_cache="$(find "$REAL_CODEX_HOME/plugins/cache/atlas-forge/atlas-workflow" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -V | tail -1 || true)"
  cache_plugin_root="$latest_atlas_cache"
  cache_skills_root="$cache_plugin_root/skills"
elif [[ -z "$cache_plugin_root" ]]; then
  cache_plugin_root="$(cd "$cache_skills_root/.." && pwd)"
fi
for skill in analyze office-hours brainstorm intake clarify team task cw worktree; do
  src="$source_skills_root/$skill/SKILL.md"
  cache="$cache_skills_root/$skill/SKILL.md"
  cmp -s "$src" "$cache"
  rg -q "codex-workflow ready" "$src"
done
cmp -s "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/README.md" "$cache_plugin_root/README.md"
cmp -s "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/.codex-plugin/plugin.json" "$cache_plugin_root/.codex-plugin/plugin.json"
rg -q "route-decision" "$REAL_CODEX_HOME/AGENTS.md"
rg -q "atlas-workflow:intake" "$REAL_CODEX_HOME/AGENTS.md"
rg -q "atlas-workflow:task" "$REAL_CODEX_HOME/AGENTS.md"
rg -q "atlas-workflow:cw" "$REAL_CODEX_HOME/AGENTS.md"
rg -q "atlas-workflow:clarify" "$REAL_CODEX_HOME/AGENTS.md"
rg -q "atlas-workflow:worktree" "$REAL_CODEX_HOME/AGENTS.md"
rg -q "Short Request Intake Gate" "$REAL_CODEX_HOME/AGENTS.md"
rg -q "tiny escape hatch" "$REAL_CODEX_HOME/AGENTS.md"
rg -q "Non-tiny work must have auditable documentation" "$REAL_CODEX_HOME/AGENTS.md"
rg -q "critical feedback" "$REAL_CODEX_HOME/AGENTS.md"
rg -q "Short Request Intake Gate" "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/README.md"
rg -q 'atlas-workflow:intake' "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/README.md"
rg -q 'atlas-workflow:intake' "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/.codex-plugin/plugin.json"
rg -q "Short Request Intake Gate" "$source_skills_root/intake/SKILL.md"
rg -q "Short Request Intake Gate" "$source_skills_root/task/SKILL.md"
rg -q "Short Request Intake Gate" "$source_skills_root/cw/SKILL.md"
rg -q "Short Request Intake Gate" "$source_skills_root/worktree/SKILL.md"
rg -q "Short Request Clarification" "$source_skills_root/clarify/SKILL.md"
rg -q "tiny escape hatch" "$source_skills_root/task/SKILL.md"
rg -q "tiny escape hatch" "$source_skills_root/cw/SKILL.md"
rg -q "tiny escape hatch" "$source_skills_root/worktree/SKILL.md"
rg -q "Critical Feedback" "$source_skills_root/clarify/SKILL.md"
rg -q "external issues, PRDs, or design docs" "$source_skills_root/task/SKILL.md"
rg -q "external issues, PRDs, or design docs" "$source_skills_root/cw/SKILL.md"
rg -q "external issues, PRDs, or design docs" "$source_skills_root/worktree/SKILL.md"
rg -q "handoff-envelope" "$REAL_AGENTS_HOME/skills/multica-prd-submit/SKILL.md"
rg -q "name: multica-agent-plan" "$REAL_AGENTS_HOME/skills/multica-agent-plan/SKILL.md"
rg -q "Agent / Skill Inventory" "$REAL_AGENTS_HOME/skills/multica-agent-plan/SKILL.md"
rg -q "inventory-first and reuse-first" "$REAL_AGENTS_HOME/multica-sdlc/instructions/leader.md"
rg -q "multica agent tasks <agent-id> --output json" "$REAL_AGENTS_HOME/multica-sdlc/instructions/planner.md"
cmp -s "$REAL_AGENTS_HOME/multica-sdlc/instructions/leader.md" "$REAL_AGENTS_HOME/multica-sdlc/generated/leader-source-instructions.txt"
cmp -s "$REAL_AGENTS_HOME/multica-sdlc/instructions/planner.md" "$REAL_AGENTS_HOME/multica-sdlc/generated/planner-source-instructions.txt"
rg -q -- "--staffing-plan" "$REAL_AGENTS_HOME/bin/multica-prd-submit"
rg -q "Evidence Manifest Contract" "$REAL_AGENTS_HOME/multica-sdlc/instructions/evidence-manifest.md"
rg -q "evidence manifest" "$REAL_AGENTS_HOME/multica-sdlc/instructions/leader.md"
rg -q "evidence manifest" "$REAL_AGENTS_HOME/multica-sdlc/generated/leader-source-instructions.txt"
pass "skill adoption"

printf 'contract tests passed\n'
