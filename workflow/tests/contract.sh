#!/usr/bin/env bash
set -euo pipefail

ATLAS_FORGE_ROOT="${ATLAS_FORGE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
BIN="${CODEX_WORKFLOW_BIN:-$ATLAS_FORGE_ROOT/workflow/bin/codex-workflow}"
REAL_CODEX_HOME="${CODEX_HOME_REAL:-${CODEX_HOME:-$HOME/.codex}}"
REAL_AGENTS_HOME="${AGENTS_HOME_REAL:-$HOME/.agents}"
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

bash -n "$ATLAS_FORGE_ROOT/workflow/tests/contract_team_native.sh"
bash -n "$ATLAS_FORGE_ROOT/workflow/tests/contract_team_legacy.sh"
bash -n "$ATLAS_FORGE_ROOT/workflow/tests/contract_team_sdd.sh"
bash -n "$ATLAS_FORGE_ROOT/workflow/tests/contract_team_business_acceptance.sh"
source "$ATLAS_FORGE_ROOT/workflow/tests/contract_team_native.sh"
source "$ATLAS_FORGE_ROOT/workflow/tests/contract_team_legacy.sh"
source "$ATLAS_FORGE_ROOT/workflow/tests/contract_team_sdd.sh"
source "$ATLAS_FORGE_ROOT/workflow/tests/contract_team_business_acceptance.sh"

update_plugin_script="$ATLAS_FORGE_ROOT/scripts/update-atlas-workflow-plugin"
if [[ -x "$update_plugin_script" ]]; then
  bash -n "$update_plugin_script"
  "$update_plugin_script" --dry-run > "$TMP_ROOT/update-atlas-workflow-plugin.out"
  grep -q "would sync workflow helpers" "$TMP_ROOT/update-atlas-workflow-plugin.out"
  grep -q "would sync native Codex agents" "$TMP_ROOT/update-atlas-workflow-plugin.out"
  grep -q "would sync atlas-workflow source to local plugin source" "$TMP_ROOT/update-atlas-workflow-plugin.out"
  grep -q "would refresh installed local plugin cache" "$TMP_ROOT/update-atlas-workflow-plugin.out"
  pass "local plugin update dry run"
else
  pass "local plugin update dry run skipped without source checkout"
fi

audit_script="$ATLAS_FORGE_ROOT/plugins/atlas-workflow/scripts/audit-private-paths.js"
audit_allow="$ATLAS_FORGE_ROOT/docs/audit/private-paths.allow.json"
node "$audit_script" --help >/dev/null
node "$audit_script" --root "$ATLAS_FORGE_ROOT" --deny-private-home --allow-list "$audit_allow" --fail-on runtime,instructions >/dev/null
node "$audit_script" --root "$ATLAS_FORGE_ROOT" --deny-private-home --allow-list "$audit_allow" --report-only docs,history >/dev/null
bad_private_pattern="/home/gew""u"
printf '{"entries":[{"path":"*","pattern":"%s","categories":["docs"]}]}\n' "$bad_private_pattern" > "$TMP_ROOT/bad-private-path-allow.json"
expect_fail "private path audit allowlist requires reason" node "$audit_script" --root "$ATLAS_FORGE_ROOT" --deny-private-home --allow-list "$TMP_ROOT/bad-private-path-allow.json" --report-only docs
pass "private path audit"

contract_index_lint="$ATLAS_FORGE_ROOT/plugins/atlas-workflow/scripts/codex-contract-index-lint"
node --check "$contract_index_lint" >/dev/null
node "$contract_index_lint" --help >/dev/null

planning_bundle="$TMP_ROOT/contract-index-planning"
mkdir -p "$planning_bundle"
printf '%s\n' \
  '# Contract Index' \
  '' \
  'workflow_id: planning-fixture' \
  'contract_status: planning' \
  'current_authoritative_contract: ./implementation-plan.md' \
  > "$planning_bundle/contract-index.md"
printf '%s\n' '# Implementation Plan' '' 'Plan is the current authority before final contract.' > "$planning_bundle/implementation-plan.md"
node "$contract_index_lint" --root "$planning_bundle" >/dev/null

ready_bundle="$TMP_ROOT/contract-index-ready"
mkdir -p "$ready_bundle/evidence"
printf '%s\n' \
  '# Contract Index' \
  '' \
  'workflow_id: ready-fixture' \
  'contract_status: ready-for-implementation' \
  'current_authoritative_contract: ./implementation-contract.final.md' \
  '' \
  'supporting_evidence:' \
  '- team_decision: ./team-decision.md' \
  '- staffing: ./staffing.md' \
  '- evidence_index: ./evidence/evidence-index.md' \
  '- workflow_team_decision: workflow/artifacts/ready-fixture/team/decision.md' \
  '- workflow_team_staffing: workflow/artifacts/ready-fixture/team/staffing.md' \
  > "$ready_bundle/contract-index.md"
printf '%s\n' \
  '# Final Implementation Contract' \
  '' \
  '## Scope' \
  '' \
  '- Goal: implement the selected behavior.' \
  '' \
  '## Acceptance Criteria' \
  '' \
  '| ID | Criterion | Required | Verification |' \
  '|----|-----------|----------|--------------|' \
  '| AC-1 | Feature works | yes | command passes |' \
  > "$ready_bundle/implementation-contract.final.md"
printf '%s\n' '# Team Decision' '' 'Decision evidence.' > "$ready_bundle/team-decision.md"
printf '%s\n' '# Staffing' '' 'Staffing evidence.' > "$ready_bundle/staffing.md"
printf '%s\n' '# Evidence Index' '' 'Supporting evidence index.' > "$ready_bundle/evidence/evidence-index.md"
node "$contract_index_lint" --root "$ready_bundle" >/dev/null

missing_final_bundle="$TMP_ROOT/contract-index-missing-final"
mkdir -p "$missing_final_bundle"
printf '%s\n' \
  '# Contract Index' \
  '' \
  'workflow_id: missing-final-fixture' \
  'contract_status: ready-for-implementation' \
  'current_authoritative_contract: ./implementation-contract.final.md' \
  > "$missing_final_bundle/contract-index.md"
expect_fail "missing final contract" node "$contract_index_lint" --root "$missing_final_bundle"
grep -q "authoritative contract does not exist" "$TMP_ROOT/expect-fail.err"

stale_final_bundle="$TMP_ROOT/contract-index-stale-final"
mkdir -p "$stale_final_bundle"
printf '%s\n' \
  '# Contract Index' \
  '' \
  'workflow_id: stale-final-fixture' \
  'contract_status: ready-for-implementation' \
  'current_authoritative_contract: ./implementation-contract.final.md' \
  > "$stale_final_bundle/contract-index.md"
printf '%s\n' '# Final Implementation Contract' '' '修订意见如下：把旧合同正文追加在这里。' > "$stale_final_bundle/implementation-contract.final.md"
expect_fail "stale final contract markers" node "$contract_index_lint" --root "$stale_final_bundle"
grep -q "stale final contract marker found" "$TMP_ROOT/expect-fail.err"

missing_support_bundle="$TMP_ROOT/contract-index-missing-support"
mkdir -p "$missing_support_bundle/evidence"
printf '%s\n' \
  '# Contract Index' \
  '' \
  'workflow_id: missing-support-fixture' \
  'contract_status: ready-for-implementation' \
  'current_authoritative_contract: ./implementation-contract.final.md' \
  '' \
  'supporting_evidence:' \
  '- team_decision: ./team-decision.md' \
  '- evidence_index: ./evidence/evidence-index.md' \
  '- workflow_team_decision: workflow/artifacts/missing-support-fixture/team/decision.md' \
  '- workflow_team_staffing: workflow/artifacts/missing-support-fixture/team/staffing.md' \
  > "$missing_support_bundle/contract-index.md"
printf '%s\n' '# Final Implementation Contract' '' 'Clean final contract.' > "$missing_support_bundle/implementation-contract.final.md"
printf '%s\n' '# Team Decision' '' 'Decision evidence.' > "$missing_support_bundle/team-decision.md"
printf '%s\n' '# Evidence Index' '' 'Supporting evidence index.' > "$missing_support_bundle/evidence/evidence-index.md"
expect_fail "missing staffing support key" node "$contract_index_lint" --root "$missing_support_bundle"
grep -q "missing supporting evidence key: staffing" "$TMP_ROOT/expect-fail.err"

missing_support_file_bundle="$TMP_ROOT/contract-index-missing-support-file"
mkdir -p "$missing_support_file_bundle/evidence"
printf '%s\n' \
  '# Contract Index' \
  '' \
  'workflow_id: missing-support-file-fixture' \
  'contract_status: ready-for-implementation' \
  'current_authoritative_contract: ./implementation-contract.final.md' \
  '' \
  'supporting_evidence:' \
  '- team_decision: ./team-decision.md' \
  '- staffing: ./staffing.md' \
  '- evidence_index: ./evidence/evidence-index.md' \
  '- workflow_team_decision: workflow/artifacts/missing-support-file-fixture/team/decision.md' \
  '- workflow_team_staffing: workflow/artifacts/missing-support-file-fixture/team/staffing.md' \
  > "$missing_support_file_bundle/contract-index.md"
printf '%s\n' '# Final Implementation Contract' '' 'Clean final contract.' > "$missing_support_file_bundle/implementation-contract.final.md"
printf '%s\n' '# Team Decision' '' 'Decision evidence.' > "$missing_support_file_bundle/team-decision.md"
printf '%s\n' '# Evidence Index' '' 'Supporting evidence index.' > "$missing_support_file_bundle/evidence/evidence-index.md"
expect_fail "missing staffing support file" node "$contract_index_lint" --root "$missing_support_file_bundle"
grep -q "supporting evidence does not exist: staffing=./staffing.md" "$TMP_ROOT/expect-fail.err"
pass "contract index lint"

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
$BIN route-decision --help >/dev/null 2>&1
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
for skill in analyze office-hours brainstorm intake clarify team team-v1 task cw worktree; do
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
rg -q 'atlas-workflow:team-v1' "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/README.md"
rg -q "separate team entrypoints with separate rule sets" "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/README.md"
rg -q 'atlas-workflow:intake' "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/.codex-plugin/plugin.json"
rg -q 'atlas-workflow:team-v1' "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/.codex-plugin/plugin.json"
rg -q "multi_agent_v1.spawn_agent" "$source_skills_root/team/SKILL.md"
rg -q "Native Agent Planning" "$source_skills_root/team/SKILL.md"
rg -q "Agent Plan" "$source_skills_root/team/SKILL.md"
rg -q "Active Roles" "$source_skills_root/team/SKILL.md"
rg -q "Omitted Roles" "$source_skills_root/team/SKILL.md"
rg -q "Runtime Staffing Adjustments" "$source_skills_root/team/SKILL.md"
rg -q "Dynamic Runtime Staffing During Implementation" "$source_skills_root/team/SKILL.md"
rg -q "Initial staffing is a starting hypothesis, not a frozen runtime contract" "$source_skills_root/team/SKILL.md"
rg -q "Do not let implementation subagents silently inherit the parent agent" "$source_skills_root/team/SKILL.md"
rg -q "model" "$source_skills_root/team/SKILL.md"
rg -q "reasoning_effort" "$source_skills_root/team/SKILL.md"
rg -q "thinking effort" "$source_skills_root/team/SKILL.md"
rg -q "runtime_profile" "$source_skills_root/team/SKILL.md"
rg -q "actual role mix, model, reasoning effort, and trigger" "$source_skills_root/team/SKILL.md"
rg -q "Phase Gates" "$source_skills_root/team/SKILL.md"
rg -q "Commit Boundaries" "$source_skills_root/team/SKILL.md"
rg -q "Treat commits as implementation step boundaries" "$source_skills_root/team/SKILL.md"
rg -q "Each completed implementation" "$source_skills_root/team/SKILL.md"
rg -q "Concurrency And Write Boundaries" "$source_skills_root/team/SKILL.md"
rg -q "Verification Evidence" "$source_skills_root/team/SKILL.md"
rg -q "Seed roles for small discuss rounds" "$source_skills_root/team/SKILL.md"
rg -q "Seed roles for small execute rounds" "$source_skills_root/team/SKILL.md"
rg -q "not a hard limit|not a maximum|no hard agent-count cap" "$source_skills_root/team/SKILL.md"
rg -q "not a required set and not a maximum" "$source_skills_root/team/SKILL.md"
! rg -q "^Default lanes:" "$source_skills_root/team/SKILL.md"
rg -q "native-only contract" "$source_skills_root/team/SKILL.md"
rg -q "ask for an explicit alternate workflow" "$source_skills_root/team/SKILL.md"
! rg -q "team-v1|legacy|team-start|team_temp_dir" "$source_skills_root/team/SKILL.md"
! rg -q "codex-workflow team-loop([[:space:]\"']|$)" "$source_skills_root/team/SKILL.md"
rg -q "team-record-start" "$source_skills_root/team/SKILL.md"
rg -q "team-loop-record" "$source_skills_root/team/SKILL.md"
rg -q "Codex-Native SDD Slice Protocol" "$source_skills_root/team/SKILL.md"
rg -q "unbounded_until_clean_or_terminal" "$source_skills_root/team/SKILL.md"
rg -q "fix_progress_stalled" "$source_skills_root/team/SKILL.md"
rg -q "Controller responsibilities" "$source_skills_root/team/SKILL.md"
rg -q "IMPLEMENTER_REPORT_JSON" "$source_skills_root/team/SKILL.md"
rg -q "REVIEW_VERDICT_JSON" "$source_skills_root/team/SKILL.md"
rg -q "NEEDS_CONTEXT" "$source_skills_root/team/SKILL.md"
rg -q "answers.jsonl" "$source_skills_root/team/SKILL.md"
rg -q "max_question_rounds" "$source_skills_root/team/SKILL.md"
rg -q "Fresh context" "$source_skills_root/team/SKILL.md"
rg -q "Continuous execution" "$source_skills_root/team/SKILL.md"
rg -q "Do not write workflow artifacts" "$source_skills_root/team/SKILL.md"
rg -q "final whole-branch review" "$source_skills_root/team/SKILL.md"
! rg -q "max_fix_iterations|exhausted-by-iteration|do not flag|at most Minor" "$source_skills_root/team/SKILL.md"
test -f "$ATLAS_FORGE_ROOT/.codex/agents/atlas-sdd-implementer.toml"
test -f "$ATLAS_FORGE_ROOT/.codex/agents/atlas-sdd-reviewer.toml"
test -f "$ATLAS_FORGE_ROOT/.codex/agents/atlas-sdd-verifier.toml"
test -f "$ATLAS_FORGE_ROOT/.codex/agents/atlas-sdd-explorer.toml"
rg -q 'name = "atlas-sdd-implementer"' "$ATLAS_FORGE_ROOT/.codex/agents/atlas-sdd-implementer.toml"
rg -q 'name = "atlas-sdd-reviewer"' "$ATLAS_FORGE_ROOT/.codex/agents/atlas-sdd-reviewer.toml"
rg -q 'name = "atlas-sdd-verifier"' "$ATLAS_FORGE_ROOT/.codex/agents/atlas-sdd-verifier.toml"
rg -q 'name = "atlas-sdd-explorer"' "$ATLAS_FORGE_ROOT/.codex/agents/atlas-sdd-explorer.toml"
rg -q 'model = "gpt-5.4"' "$ATLAS_FORGE_ROOT/.codex/agents/atlas-sdd-implementer.toml"
rg -q 'model = "gpt-5.4"' "$ATLAS_FORGE_ROOT/.codex/agents/atlas-sdd-reviewer.toml"
rg -q 'model = "gpt-5.4"' "$ATLAS_FORGE_ROOT/.codex/agents/atlas-sdd-verifier.toml"
rg -q 'model = "gpt-5.4"' "$ATLAS_FORGE_ROOT/.codex/agents/atlas-sdd-explorer.toml"
rg -q "IMPLEMENTER_REPORT_JSON" "$ATLAS_FORGE_ROOT/.codex/agents/atlas-sdd-implementer.toml"
rg -q "REVIEW_VERDICT_JSON" "$ATLAS_FORGE_ROOT/.codex/agents/atlas-sdd-reviewer.toml"
rg -q "legacy Atlas team entrypoint" "$source_skills_root/team-v1/SKILL.md"
rg -q "explicitly accepts" "$source_skills_root/team-v1/SKILL.md"
rg -q "not a hard limit" "$source_skills_root/team-v1/SKILL.md"
rg -q "team-start" "$source_skills_root/team-v1/SKILL.md"
rg -q "team-loop" "$source_skills_root/team-v1/SKILL.md"
! rg -q "Codex native|native subagent|default Codex native" "$source_skills_root/team-v1/SKILL.md"
! rg -q "instead of a full multi-agent harness" "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/README.md"
rg -q "Short Request Intake Gate" "$source_skills_root/intake/SKILL.md"
rg -q "Short Request Intake Gate" "$source_skills_root/task/SKILL.md"
rg -q "Treat commits as implementation step boundaries" "$source_skills_root/task/SKILL.md"
rg -q "each completed step, phase, or acceptance slice" "$source_skills_root/task/SKILL.md"
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
rg -q "workflow docs bundle" "$source_skills_root/brainstorm/SKILL.md"
rg -q "workflow docs bundle" "$source_skills_root/clarify/SKILL.md"
rg -q "workflow docs bundle" "$source_skills_root/team/SKILL.md"
rg -q "workflow docs bundle" "$source_skills_root/team-v1/SKILL.md"
rg -q "supporting evidence links" "$source_skills_root/brainstorm/SKILL.md"
rg -q "supporting evidence links" "$source_skills_root/clarify/SKILL.md"
rg -q "supporting evidence links" "$source_skills_root/team/SKILL.md"
rg -q "supporting evidence links" "$source_skills_root/team-v1/SKILL.md"
rg -q "complete bundle entrypoint" "$source_skills_root/task/SKILL.md"
rg -q "contract-index.md" "$source_skills_root/task/SKILL.md"
rg -q "implementation-contract.final.md" "$source_skills_root/task/SKILL.md"
rg -q "Concise Phase Evidence" "$source_skills_root/team/SKILL.md"
rg -q "phase-review-report.md" "$source_skills_root/team/SKILL.md"
rg -q "temporary run directory by default" "$source_skills_root/team/SKILL.md"
rg -q "Agent review defaults to the phase conclusion files" "$source_skills_root/team/SKILL.md"
rg -q "10 files or fewer and 1 MB or less" "$source_skills_root/team/SKILL.md"
rg -q "phase conclusion files first" "$source_skills_root/team/SKILL.md"
rg -q "phase conclusion files" "$source_skills_root/team-v1/SKILL.md"
rg -q "temporary run directory" "$source_skills_root/task/SKILL.md"
rg -q "Evidence Budget" "$ATLAS_FORGE_ROOT/workflow/templates/implementation-contract.md"
rg -q "raw logs, Playwright JSON, traces, videos, HAR" "$ATLAS_FORGE_ROOT/workflow/templates/implementation-contract.final.md"
rg -q "evidence_rules" "$ATLAS_FORGE_ROOT/workflow/templates/contract-index.md"
rg -q "Raw Run Artifacts" "$ATLAS_FORGE_ROOT/workflow/templates/design-review-report.md"
rg -q "phase evidence concise" "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/.codex-plugin/plugin.json"
rg -q "clean rewrite" "$source_skills_root/clarify/SKILL.md"
rg -q "clean rewrite" "$source_skills_root/team/SKILL.md"
rg -q "clean rewrite" "$source_skills_root/team-v1/SKILL.md"
test -f "$ATLAS_FORGE_ROOT/workflow/templates/contract-index.md"
test -f "$ATLAS_FORGE_ROOT/workflow/templates/implementation-contract.final.md"
rg -q "current_authoritative_contract" "$ATLAS_FORGE_ROOT/workflow/templates/contract-index.md"
rg -q "superseded_contracts" "$ATLAS_FORGE_ROOT/workflow/templates/contract-index.md"
rg -q "review_history" "$ATLAS_FORGE_ROOT/workflow/templates/contract-index.md"
rg -q "supporting_evidence" "$ATLAS_FORGE_ROOT/workflow/templates/contract-index.md"
rg -q "team_decision" "$ATLAS_FORGE_ROOT/workflow/templates/contract-index.md"
rg -q "staffing" "$ATLAS_FORGE_ROOT/workflow/templates/contract-index.md"
rg -q "evidence_index" "$ATLAS_FORGE_ROOT/workflow/templates/contract-index.md"
rg -q "Final Contract Cleanliness Gate" "$ATLAS_FORGE_ROOT/workflow/templates/implementation-contract.final.md"
test -x "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/scripts/codex-contract-index-lint"
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
