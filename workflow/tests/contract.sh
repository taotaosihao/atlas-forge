#!/usr/bin/env bash
set -euo pipefail

ATLAS_FORGE_ROOT="${ATLAS_FORGE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

if [[ "${ATLAS_CONTRACT_INTERNAL_REPO:-0}" != 1 && "${ATLAS_CONTRACT_LEGACY_HOST:-0}" != 1 ]]; then
  repo_suite="$ATLAS_FORGE_ROOT/workflow/tests/contract_repo.sh"
  host_suite="$ATLAS_FORGE_ROOT/workflow/tests/contract_host_install.sh"
  bash -n "$repo_suite"
  bash -n "$host_suite"
  printf 'suite: manifest-release-integrity\n'
  bash "$ATLAS_FORGE_ROOT/workflow/tests/contract_atlas_plugin_integrity.sh"
  printf 'suite: repo-contract\n'
  ATLAS_FORGE_ROOT="$ATLAS_FORGE_ROOT" KEEP_TEST_TMP="${KEEP_TEST_TMP:-0}" bash "$repo_suite"
  printf 'suite: host-layout-fixtures\n'
  ATLAS_FORGE_ROOT="$ATLAS_FORGE_ROOT" KEEP_TEST_TMP="${KEEP_TEST_TMP:-0}" bash "$host_suite"
  printf 'contract suites passed\n'
  exit 0
fi

BIN="${CODEX_WORKFLOW_BIN:-$ATLAS_FORGE_ROOT/workflow/bin/codex-workflow}"
LEGACY_BIN="$ATLAS_FORGE_ROOT/workflow/bin/codex-workflow-legacy"
REAL_CODEX_HOME="${CODEX_HOME_REAL:-${CODEX_HOME:-$HOME/.codex}}"
REAL_AGENTS_HOME="${AGENTS_HOME_REAL:-$HOME/.agents}"
TMP_ROOT="${ATLAS_CONTRACT_TMP_ROOT:-$(mktemp -d)}"
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
bash -n "$LEGACY_BIN"
test -x "$BIN"
test -x "$LEGACY_BIN"
node --test "$ATLAS_FORGE_ROOT"/workflow/tests/js/*.test.js >/dev/null
pass "workflow JavaScript contracts"

if [[ "${ATLAS_CONTRACT_INTERNAL_REPO:-0}" != 1 ]]; then
  bash -n "$ATLAS_FORGE_ROOT/workflow/tests/contract_atlas_plugin_integrity.sh"
  bash "$ATLAS_FORGE_ROOT/workflow/tests/contract_atlas_plugin_integrity.sh"
  pass "atlas plugin integrity contract"

  bash -n "$ATLAS_FORGE_ROOT/workflow/tests/contract_atlas_doctor.sh"
  bash "$ATLAS_FORGE_ROOT/workflow/tests/contract_atlas_doctor.sh"
  pass "atlas strict doctor contract"
fi

prefixed_slug_id="$($BIN init-task "20260709-003-contract slug prefix" "slug prefix")"
[[ "$prefixed_slug_id" =~ ^[0-9]{8}-[0-9]{3}-contract-slug-prefix$ ]] || {
  printf 'unexpected prefixed task slug: %s\n' "$prefixed_slug_id" >&2
  exit 1
}
unicode_slug_id="$($BIN init-task "纯中文标题" "unicode slug")"
[[ "$unicode_slug_id" =~ ^[0-9]{8}-[0-9]{3}-u-e1e4b2c89617$ ]] || {
  printf 'unexpected Unicode task slug: %s\n' "$unicode_slug_id" >&2
  exit 1
}
grep -Fxq 'title: 纯中文标题' "$CODEX_WORKFLOW_ROOT/tasks/$unicode_slug_id.md"
expect_fail "multiline task title" "$BIN" init-task $'bad\ntitle' "invalid title"
grep -q 'unsafe title: titles must be a single line' "$TMP_ROOT/expect-fail.err"
pass "task id slug behavior"

$BIN list --all > "$TMP_ROOT/task-list.out"
grep -Fxq $'todo\t'"$unicode_slug_id"$'\t纯中文标题' "$TMP_ROOT/task-list.out"
$BIN show "$unicode_slug_id" > "$TMP_ROOT/task-show.out"
cmp -s "$CODEX_WORKFLOW_ROOT/tasks/$unicode_slug_id.md" "$TMP_ROOT/task-show.out"
expect_fail "list invalid days" "$BIN" list --days 0
grep -Fxq 'invalid days: 0' "$TMP_ROOT/expect-fail.err"
expect_fail "list unknown option" "$BIN" list --unknown
grep -Fxq 'usage: codex-workflow list [--all|--days <n>|--days=<n>]' "$TMP_ROOT/expect-fail.err"
expect_fail "show unknown task" "$BIN" show missing-task
grep -Fxq 'unknown task: missing-task' "$TMP_ROOT/expect-fail.err"
grep -Fxq 'known tasks:' "$TMP_ROOT/expect-fail.err"
printf '%s\n' 'id: broken' > "$CODEX_WORKFLOW_ROOT/tasks/broken.md"
expect_fail "list malformed task" "$BIN" list --all
grep -Fq "malformed task file: $CODEX_WORKFLOW_ROOT/tasks/broken.md missing title status created updated" "$TMP_ROOT/expect-fail.err"
rm -f "$CODEX_WORKFLOW_ROOT/tasks/broken.md"
pass "task list and show JavaScript behavior"

done_id="$($BIN init-task "contract done gate" "done gate")"
$BIN start "$done_id"
expect_fail "done without verification" "$BIN" done "$done_id"
$BIN verify "$done_id" -- true >/dev/null
$BIN done "$done_id"
pass "done gate"

lifecycle_id="$($BIN init-task "contract lifecycle" "blocked archive stale")"
$BIN start "$lifecycle_id"
$BIN block "$lifecycle_id" --reason "waiting locally"
grep -Fxq 'status: blocked' "$CODEX_WORKFLOW_ROOT/tasks/$lifecycle_id.md"
grep -Fxq 'blocked_reason: waiting locally' "$CODEX_WORKFLOW_ROOT/tasks/$lifecycle_id.md"
[[ ! -f "$CODEX_WORKFLOW_ROOT/state/current-task.json" ]]
$BIN resume "$lifecycle_id"
grep -Fq "\"task_id\": \"$lifecycle_id\"" "$CODEX_WORKFLOW_ROOT/state/current-task.json"
printf '%s\n' 'durable sentinel' > "$CODEX_WORKFLOW_ROOT/artifacts/$lifecycle_id/keep.txt"
$BIN archive "$lifecycle_id" --reason="superseded"
grep -Fxq 'status: archived' "$CODEX_WORKFLOW_ROOT/tasks/$lifecycle_id.md"
grep -Fxq 'archived_reason: superseded' "$CODEX_WORKFLOW_ROOT/tasks/$lifecycle_id.md"
grep -Fxq 'durable sentinel' "$CODEX_WORKFLOW_ROOT/artifacts/$lifecycle_id/keep.txt"
[[ ! -f "$CODEX_WORKFLOW_ROOT/state/current-task.json" ]]
if $BIN list | grep -Fq "$lifecycle_id"; then
  printf 'archived task leaked into default list: %s\n' "$lifecycle_id" >&2
  exit 1
fi
$BIN list --all | grep -Fxq $'archived\t'"$lifecycle_id"$'\tcontract lifecycle'
grep -Fq '"schema_version":1' "$CODEX_WORKFLOW_ROOT/artifacts/$lifecycle_id/runtime.jsonl"
grep -Fq '"kind":"task.archived"' "$CODEX_WORKFLOW_ROOT/artifacts/$lifecycle_id/runtime.jsonl"
expect_fail "block requires doing" "$BIN" block "$unicode_slug_id" --reason "not started"
grep -Fxq "task must be doing before block: $unicode_slug_id" "$TMP_ROOT/expect-fail.err"
expect_fail "archive requires reason" "$BIN" archive "$unicode_slug_id"
grep -Fxq 'usage: codex-workflow archive <task-id> --reason "<reason>"' "$TMP_ROOT/expect-fail.err"

legacy_stale_id="19990101-001-legacy-stale"
legacy_stale_file="$CODEX_WORKFLOW_ROOT/tasks/$legacy_stale_id.md"
printf '%s\n' \
  "id: $legacy_stale_id" \
  'title: Legacy stale' \
  'status: todo' \
  'created: 1999-01-01' \
  'updated: 1999-01-02' \
  '' \
  '## Success Criteria' \
  'legacy' > "$legacy_stale_file"
cp "$legacy_stale_file" "$TMP_ROOT/legacy-stale.before"
$BIN stale --days 7 | grep -Fxq $'todo\t'"$legacy_stale_id"$'\t1999-01-02\tlegacy-date\tLegacy stale'
cmp -s "$legacy_stale_file" "$TMP_ROOT/legacy-stale.before"
expect_fail "stale invalid days" "$BIN" stale --days 0
grep -Fxq 'invalid days: 0' "$TMP_ROOT/expect-fail.err"
pass "task lifecycle and stale behavior"

$BIN outcome-mark "$lifecycle_id" --kind first-code --evidence "commit:contract" >/dev/null
$BIN outcome-mark "$lifecycle_id" --kind operable-flow --evidence "docs/headless.md" --not-applicable "headless CLI" >/dev/null
grep -Fq '"kind":"outcome.first-code"' "$CODEX_WORKFLOW_ROOT/artifacts/$lifecycle_id/runtime.jsonl"
grep -Fq '"evidence":"commit:contract"' "$CODEX_WORKFLOW_ROOT/artifacts/$lifecycle_id/runtime.jsonl"
grep -Fq '"not_applicable_reason":"headless CLI"' "$CODEX_WORKFLOW_ROOT/artifacts/$lifecycle_id/runtime.jsonl"
expect_fail "outcome marker invalid kind" "$BIN" outcome-mark "$lifecycle_id" --kind speed --evidence bad
grep -Fxq 'invalid outcome kind: speed' "$TMP_ROOT/expect-fail.err"
expect_fail "outcome marker missing evidence" "$BIN" outcome-mark "$lifecycle_id" --kind clean-review
grep -Fxq 'missing required argument: --evidence' "$TMP_ROOT/expect-fail.err"
pass "outcome marker behavior"

$BIN outcome-report --days 1 --json > "$TMP_ROOT/outcome-report.json"
python3 - "$TMP_ROOT/outcome-report.json" "$lifecycle_id" <<'PY'
import json
import sys

report = json.load(open(sys.argv[1], encoding="utf-8"))
task_id = sys.argv[2]
assert report["schema_version"] == 1
assert report["window_days"] == 1
assert report["historical_unknown_count"] >= 1
task = next(row for row in report["tasks"] if row["task_id"] == task_id)
assert task["outcomes"]["first-code"]["status"] == "known"
assert task["outcomes"]["operable-flow"]["status"] == "not-applicable"
first_code = next(row for row in report["outcomes"] if row["kind"] == "first-code")
assert first_code["known_count"] >= 1
PY
$BIN outcome-report --days=1 > "$TMP_ROOT/outcome-report.md"
grep -Fxq '# Outcome Latency Report' "$TMP_ROOT/outcome-report.md"
grep -Fq '| first-code |' "$TMP_ROOT/outcome-report.md"
grep -Fq 'historical_unknown_tasks:' "$TMP_ROOT/outcome-report.md"
expect_fail "outcome report invalid days" "$BIN" outcome-report --days 0
grep -Fxq 'invalid days: 0' "$TMP_ROOT/expect-fail.err"
pass "outcome latency report"

learning_basename="$($BIN learn "$done_id" "纯中文学习" "legacy learning token remains stable")"
[[ "$learning_basename" =~ ^${done_id}-u[0-9]+$ ]] || {
  printf 'unexpected learning basename: %s\n' "$learning_basename" >&2
  exit 1
}
pass "learning basename keeps legacy title token"

ready_id="$($BIN init-task "contract readiness" "readiness")"
$BIN start "$ready_id"
expect_fail "fresh readiness" "$BIN" ready "$ready_id"
write_ready_artifacts "$ready_id"
$BIN ready "$ready_id" >/dev/null
expect_fail "template decision readiness" "$BIN" ready "$ready_id" --require context,spec,analysis,decision
printf '%s\n' '# Team Decision' '' 'Substantive decision.' > "$CODEX_WORKFLOW_ROOT/artifacts/$ready_id/team/decision.md"
$BIN ready "$ready_id" --require context,spec,analysis,decision >/dev/null
pass "readiness gate"

scaffold_id="$($BIN init-task "contract process scaffolds" "process scaffolds")"
$BIN start "$scaffold_id"
$BIN scaffold-intake "$scaffold_id" >/dev/null
$BIN scaffold-brainstorm "$scaffold_id" >/dev/null
$BIN scaffold-clarify "$scaffold_id" >/dev/null
$BIN scaffold-team "$scaffold_id" >/dev/null
$BIN scaffold-phase "$scaffold_id" phase-1 >/dev/null
scaffold_dir="$CODEX_WORKFLOW_ROOT/artifacts/$scaffold_id"
grep -q "artifact_category: workflow_working_notes" "$scaffold_dir/intake.md"
grep -q "artifact_category: workflow_working_notes" "$scaffold_dir/brainstorm.md"
grep -q "artifact_category: workflow_working_notes" "$scaffold_dir/clarify.md"
grep -q "## Agent Plan" "$scaffold_dir/team/staffing.md"
grep -q "## Runtime Staffing Adjustments" "$scaffold_dir/team/staffing.md"
grep -q "## Commit Boundaries" "$scaffold_dir/team/staffing.md"
grep -q "## Concurrency And Write Boundaries" "$scaffold_dir/team/staffing.md"
grep -q "Tools" "$scaffold_dir/team/staffing.md"
grep -q "Read/Write" "$scaffold_dir/team/staffing.md"
grep -q "artifact_category: phase_conclusion" "$scaffold_dir/evidence/phase-1/phase-review-report.md"
grep -q "Evidence Budget" "$scaffold_dir/evidence/phase-1/phase-review-report.md"
printf '%s\n' 'KEEP-ME' >> "$scaffold_dir/intake.md"
$BIN scaffold-intake "$scaffold_id" >/dev/null
grep -q "KEEP-ME" "$scaffold_dir/intake.md"
expect_fail "invalid scaffold phase id" "$BIN" scaffold-phase "$scaffold_id" "../bad"
pass "process scaffold commands"

bash -n "$ATLAS_FORGE_ROOT/workflow/tests/contract_team_native.sh"
bash -n "$ATLAS_FORGE_ROOT/workflow/tests/contract_team_legacy.sh"
bash -n "$ATLAS_FORGE_ROOT/workflow/tests/contract_team_sdd.sh"
bash -n "$ATLAS_FORGE_ROOT/workflow/tests/contract_team_business_acceptance.sh"
bash -n "$ATLAS_FORGE_ROOT/workflow/tests/contract_implementation_contract.sh"
source "$ATLAS_FORGE_ROOT/workflow/tests/contract_team_native.sh"
source "$ATLAS_FORGE_ROOT/workflow/tests/contract_team_legacy.sh"
source "$ATLAS_FORGE_ROOT/workflow/tests/contract_team_sdd.sh"
source "$ATLAS_FORGE_ROOT/workflow/tests/contract_team_business_acceptance.sh"
bash "$ATLAS_FORGE_ROOT/workflow/tests/contract_implementation_contract.sh"
pass "implementation contract semantic lint"

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

if [[ "${ATLAS_CONTRACT_INTERNAL_REPO:-0}" != 1 ]]; then
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
fi

$BIN install-hooks >/dev/null
$BIN doctor --json > "$TMP_ROOT/doctor.json"
python3 -m json.tool "$TMP_ROOT/doctor.json" >/dev/null
python3 -c "import json,sys; data=json.load(open(sys.argv[1], encoding=\"utf-8\")); required={\"install\",\"source_cache\",\"hooks_config\",\"hooks_runtime\",\"smoke\"}; assert required <= set(data)" "$TMP_ROOT/doctor.json"
python3 -c "import json,sys; data=json.load(open(sys.argv[1], encoding=\"utf-8\")); assert data[\"hooks_config\"][\"status\"] == \"ok\"; assert data[\"hooks_config\"][\"features.hooks\"] == \"true\"" "$TMP_ROOT/doctor.json"
pass "doctor json"

source_skills_root="${ATLAS_SOURCE_SKILLS_DIR:-$ATLAS_FORGE_ROOT/plugins/atlas-workflow/skills}"
cache_skills_root="${ATLAS_CACHE_SKILLS_DIR:-}"
cache_plugin_root="${ATLAS_CACHE_PLUGIN_ROOT:-}"
if [[ "${ATLAS_CONTRACT_INTERNAL_REPO:-0}" == 1 ]]; then
  cache_plugin_root="$CODEX_HOME_ROOT/plugins/atlas-workflow"
  cache_skills_root="$cache_plugin_root/skills"
elif [[ -z "$cache_skills_root" ]]; then
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
done
for skill in analyze office-hours brainstorm intake clarify team-v1 worktree; do
  rg -q "codex-workflow ready" "$source_skills_root/$skill/SKILL.md"
done
cmp -s "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/README.md" "$cache_plugin_root/README.md"
cmp -s "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/.codex-plugin/plugin.json" "$cache_plugin_root/.codex-plugin/plugin.json"
if [[ "${ATLAS_CONTRACT_INTERNAL_REPO:-0}" != 1 ]]; then
  rg -q "Preserve authority" "$REAL_CODEX_HOME/AGENTS.md"
  rg -q "Do not default to multi-agent execution" "$REAL_CODEX_HOME/AGENTS.md"
  rg -q "rolling checkpoint" "$REAL_CODEX_HOME/AGENTS.md"
  rg -q "Prefer local automatic commits" "$REAL_CODEX_HOME/AGENTS.md"
  ! rg -q "Atlas Intent Routing|codex-refresh-local-plugin|atlas-workflow:(intake|task|cw|clarify|worktree)" "$REAL_CODEX_HOME/AGENTS.md"
fi
rg -q "Multiple files and behavior changes do not by themselves require Team" "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/README.md"
rg -q "A short request alone is not a reason" "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/README.md"
rg -q 'atlas-workflow:intake' "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/README.md"
rg -q 'atlas-workflow:team-v1' "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/README.md"
rg -q 'atlas-workflow:intake' "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/.codex-plugin/plugin.json"
rg -q 'stress-test' "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/.codex-plugin/plugin.json"
rg -q 'atlas-workflow:team-v1' "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/.codex-plugin/plugin.json"
rg -q "collaboration.spawn_agent" "$source_skills_root/team/SKILL.md"
rg -q "collaboration.wait_agent" "$source_skills_root/team/SKILL.md"
rg -q "collaboration.send_message" "$source_skills_root/team/SKILL.md"
rg -q "collaboration.followup_task" "$source_skills_root/team/SKILL.md"
rg -q "collaboration.list_agents" "$source_skills_root/team/SKILL.md"
rg -q "collaboration.interrupt_agent" "$source_skills_root/team/SKILL.md"
! rg -q 'multi_agent_v1\.|close_agent|tool_search' "$source_skills_root/team/SKILL.md"
rg -q "Multiple files, behavior changes.*do not require Team" "$source_skills_root/team/SKILL.md"
rg -q "no default role set or required agent count" "$source_skills_root/team/SKILL.md"
rg -q "ask for an explicit alternate workflow" "$source_skills_root/team/SKILL.md"
! rg -q "team-v1|legacy|team-start|team_temp_dir" "$source_skills_root/team/SKILL.md"
! rg -q "codex-workflow team-loop([[:space:]\"']|$)" "$source_skills_root/team/SKILL.md"
rg -q "team-record-start" "$source_skills_root/team/SKILL.md"
rg -q "team-loop-record" "$source_skills_root/team/SKILL.md"
rg -q -- "--authorization-ref" "$source_skills_root/team/SKILL.md"
rg -q "full-roadmap" "$source_skills_root/team/SKILL.md"
rg -q "Reviewer discovery is unrestricted" "$source_skills_root/team/SKILL.md"
rg -q "fix_progress_stalled" "$source_skills_root/team/SKILL.md"
rg -q "moderate logical outcomes" "$source_skills_root/team/SKILL.md"
rg -q "rolling checkpoint" "$source_skills_root/team/SKILL.md"
rg -q "references/sdd.md" "$source_skills_root/team/SKILL.md"
rg -q "references/business-acceptance.md" "$source_skills_root/team/SKILL.md"
test -f "$source_skills_root/team/references/sdd.md"
test -f "$source_skills_root/team/references/business-acceptance.md"
rg -q "IMPLEMENTER_REPORT_JSON" "$source_skills_root/team/references/sdd.md"
rg -q "Goal A" "$source_skills_root/team/references/business-acceptance.md"
! rg -q "unbounded_until_clean_or_terminal|Dynamic Runtime Staffing During Implementation|final whole-branch review" "$source_skills_root/team/SKILL.md" "$source_skills_root/team/references/sdd.md"
test -f "$ATLAS_FORGE_ROOT/.codex/agents/atlas-sdd-implementer.toml"
test -f "$ATLAS_FORGE_ROOT/.codex/agents/atlas-sdd-reviewer.toml"
test -f "$ATLAS_FORGE_ROOT/.codex/agents/atlas-sdd-verifier.toml"
test -f "$ATLAS_FORGE_ROOT/.codex/agents/atlas-sdd-explorer.toml"
test -f "$ATLAS_FORGE_ROOT/.codex/agents/model-policy.json"
test -x "$ATLAS_FORGE_ROOT/workflow/bin/atlas-agent-model-policy"
rg -q 'name = "atlas-sdd-implementer"' "$ATLAS_FORGE_ROOT/.codex/agents/atlas-sdd-implementer.toml"
rg -q 'name = "atlas-sdd-reviewer"' "$ATLAS_FORGE_ROOT/.codex/agents/atlas-sdd-reviewer.toml"
rg -q 'name = "atlas-sdd-verifier"' "$ATLAS_FORGE_ROOT/.codex/agents/atlas-sdd-verifier.toml"
rg -q 'name = "atlas-sdd-explorer"' "$ATLAS_FORGE_ROOT/.codex/agents/atlas-sdd-explorer.toml"
rg -q 'model = "gpt-5.6-sol"' "$ATLAS_FORGE_ROOT/.codex/agents/atlas-sdd-implementer.toml"
rg -q 'model_reasoning_effort = "high"' "$ATLAS_FORGE_ROOT/.codex/agents/atlas-sdd-implementer.toml"
rg -q 'model = "gpt-5.6-sol"' "$ATLAS_FORGE_ROOT/.codex/agents/atlas-sdd-reviewer.toml"
rg -q 'model_reasoning_effort = "max"' "$ATLAS_FORGE_ROOT/.codex/agents/atlas-sdd-reviewer.toml"
rg -q 'model = "gpt-5.6-terra"' "$ATLAS_FORGE_ROOT/.codex/agents/atlas-sdd-verifier.toml"
rg -q 'model_reasoning_effort = "high"' "$ATLAS_FORGE_ROOT/.codex/agents/atlas-sdd-verifier.toml"
rg -q 'model = "gpt-5.6-luna"' "$ATLAS_FORGE_ROOT/.codex/agents/atlas-sdd-explorer.toml"
rg -q 'model_reasoning_effort = "medium"' "$ATLAS_FORGE_ROOT/.codex/agents/atlas-sdd-explorer.toml"
! rg -q 'gpt-5\.4' "$ATLAS_FORGE_ROOT"/.codex/agents/atlas-sdd-*.toml
rg -q 'atlas-agent-model-policy check' "$source_skills_root/team/SKILL.md"
rg -q 'does not assume that model versions are consecutive' "$source_skills_root/team/SKILL.md"
rg -q 'reviewer=`frontier/max`' "$source_skills_root/team/SKILL.md"
bash "$ATLAS_FORGE_ROOT/workflow/tests/contract_agent_model_policy.sh"
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
rg -q "Grilling Protocol" "$source_skills_root/intake/SKILL.md"
rg -q "Ask exactly one question at a time" "$source_skills_root/intake/SKILL.md"
rg -q "Short Request Intake Gate" "$source_skills_root/worktree/SKILL.md"
rg -q "Short Request Clarification" "$source_skills_root/clarify/SKILL.md"
rg -q "tiny escape hatch" "$source_skills_root/worktree/SKILL.md"
rg -q "Critical Feedback" "$source_skills_root/clarify/SKILL.md"
rg -q "external issues, PRDs, or design docs" "$source_skills_root/worktree/SKILL.md"
rg -q "Multiple files or a behavior change do not by themselves require Team" "$source_skills_root/task/SKILL.md"
rg -q "Follow .*atlas-workflow:task.*authoritative execution policy" "$source_skills_root/cw/SKILL.md"
rg -q "Prefer automatic local commits at moderate logical outcomes" "$source_skills_root/task/SKILL.md"
rg -q "rolling checkpoint" "$source_skills_root/task/SKILL.md" "$source_skills_root/cw/SKILL.md"
! rg -q "Default to .*atlas-workflow:team|Non-tiny work must have auditable documentation|tiny escape hatch" "$source_skills_root/task/SKILL.md" "$source_skills_root/cw/SKILL.md"
rg -q "workflow docs bundle" "$source_skills_root/brainstorm/SKILL.md"
rg -q "workflow docs bundle" "$source_skills_root/clarify/SKILL.md"
rg -q "workflow docs bundle" "$source_skills_root/team-v1/SKILL.md"
rg -q "supporting evidence links" "$source_skills_root/brainstorm/SKILL.md"
rg -q "supporting evidence links" "$source_skills_root/clarify/SKILL.md"
rg -q "supporting evidence links" "$source_skills_root/team-v1/SKILL.md"
rg -q "phase conclusion files" "$source_skills_root/team-v1/SKILL.md"
rg -q "raw logs.*outside Git" "$source_skills_root/task/SKILL.md"
rg -q "Evidence Budget" "$ATLAS_FORGE_ROOT/workflow/templates/implementation-contract.md"
rg -q "raw logs, Playwright JSON, traces, videos, HAR" "$ATLAS_FORGE_ROOT/workflow/templates/implementation-contract.final.md"
rg -q "First-code guard" "$source_skills_root/clarify/SKILL.md"
rg -q "first_code_slice" "$ATLAS_FORGE_ROOT/workflow/templates/implementation-contract.md"
rg -q "first_code_owner" "$ATLAS_FORGE_ROOT/workflow/templates/implementation-contract.md" "$ATLAS_FORGE_ROOT/workflow/templates/team-staffing.md"
rg -q "first_code_verification" "$ATLAS_FORGE_ROOT/workflow/templates/implementation-contract.md" "$ATLAS_FORGE_ROOT/workflow/templates/implementation-contract.final.md"
rg -q "allowed_contract_gate_only_until" "$ATLAS_FORGE_ROOT/workflow/templates/implementation-contract.final.md"
rg -q "stop_if_no_code_by_phase" "$ATLAS_FORGE_ROOT/workflow/templates/implementation-contract.md" "$ATLAS_FORGE_ROOT/workflow/templates/implementation-contract.final.md" "$ATLAS_FORGE_ROOT/workflow/templates/team-staffing.md"
rg -q "gate_parallelization_or_deferral_plan" "$ATLAS_FORGE_ROOT/workflow/templates/team-staffing.md"
rg -q "semantics version 1 requires.*stop_if_no_code_by_phase" "$ATLAS_FORGE_ROOT/workflow/templates/implementation-contract.md" "$ATLAS_FORGE_ROOT/workflow/templates/implementation-contract.final.md"
rg -q "docs-only artifacts" "$ATLAS_FORGE_ROOT/workflow/templates/implementation-contract.md"
rg -q "not first code slices by themselves" "$ATLAS_FORGE_ROOT/workflow/templates/implementation-contract.md" "$ATLAS_FORGE_ROOT/workflow/templates/implementation-contract.final.md"
rg -q "adding fixtures .*unchanged" "$ATLAS_FORGE_ROOT/workflow/templates/implementation-contract.md" "$ATLAS_FORGE_ROOT/workflow/templates/implementation-contract.final.md"
rg -q "First implementation diff completed before gate/evidence expansion" "$ATLAS_FORGE_ROOT/workflow/templates/gate-checklist.md"
rg -q "Product/UI gate" "$source_skills_root/clarify/SKILL.md"
rg -q "first_operable_user_flow" "$ATLAS_FORGE_ROOT/workflow/templates/implementation-contract.md"
rg -q "browser_entrypoint" "$ATLAS_FORGE_ROOT/workflow/templates/implementation-contract.final.md"
rg -q "served_ui_validation_action" "$ATLAS_FORGE_ROOT/workflow/templates/team-staffing.md"
rg -q "page.setContent" "$ATLAS_FORGE_ROOT/workflow/templates/implementation-contract.md"
rg -q "synthetic HTML" "$ATLAS_FORGE_ROOT/workflow/templates/implementation-contract.final.md"
rg -q "Evidence purpose boundary" "$ATLAS_FORGE_ROOT/workflow/templates/implementation-contract.md"
rg -q "Correctly labeled headless/network evidence may still satisfy safety gates" "$ATLAS_FORGE_ROOT/workflow/templates/implementation-contract.final.md"
rg -q "Served UI evidence does not replace" "$ATLAS_FORGE_ROOT/workflow/templates/team-staffing.md" "$ATLAS_FORGE_ROOT/workflow/templates/gate-checklist.md"
rg -q "Goal A" "$source_skills_root/team/references/business-acceptance.md"
rg -q "Goal B" "$source_skills_root/team/references/business-acceptance.md"
rg -q "Goal A protocol/device integration closure status" "$ATLAS_FORGE_ROOT/workflow/templates/business-acceptance-report.md"
rg -q "Goal B business UI acceptance closure" "$ATLAS_FORGE_ROOT/workflow/templates/business-evidence-map.md"
rg -q "Dual-goal rule" "$ATLAS_FORGE_ROOT/workflow/templates/business-verdict.md"
rg -q "evidence_rules" "$ATLAS_FORGE_ROOT/workflow/templates/contract-index.md"
rg -q "Raw Run Artifacts" "$ATLAS_FORGE_ROOT/workflow/templates/design-review-report.md"
rg -q "Concise Phase Evidence" "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/README.md"
rg -q "workflow working notes by default" "$source_skills_root/intake/SKILL.md"
rg -q "classify process docs before mirroring" "$source_skills_root/clarify/SKILL.md"
rg -q "artifact_categories" "$ATLAS_FORGE_ROOT/workflow/templates/contract-index.md"
rg -q "Workflow working notes stay" "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/README.md"
rg -q '"scaffold-intake"' "$ATLAS_FORGE_ROOT/workflow/bin/lib/codex-workflow/cli.js"
rg -q "scaffold-brainstorm" "$source_skills_root/brainstorm/SKILL.md"
rg -q "scaffold-clarify" "$source_skills_root/clarify/SKILL.md"
test -f "$ATLAS_FORGE_ROOT/workflow/templates/intake.md"
test -f "$ATLAS_FORGE_ROOT/workflow/templates/phase-review-report.md"
rg -q "clean rewrite" "$source_skills_root/clarify/SKILL.md"
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
test -x "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/scripts/codex-implementation-contract-lint"
if [[ "${ATLAS_CONTRACT_INTERNAL_REPO:-0}" == 1 ]]; then
  test -x "$ATLAS_FORGE_ROOT/scripts/check-relative-markdown-links.py"
  "$ATLAS_FORGE_ROOT/scripts/check-relative-markdown-links.py" --root "$ATLAS_FORGE_ROOT" \
    > "$TMP_ROOT/relative-markdown-links.out"
  rg -q '^markdown_files_checked=[1-9][0-9]*$' "$TMP_ROOT/relative-markdown-links.out"
  rg -q '^relative_markdown_links_checked=[1-9][0-9]*$' "$TMP_ROOT/relative-markdown-links.out"

  link_fixture_repo="$TMP_ROOT/relative-markdown-link-fixture"
  setup_repo "$link_fixture_repo"
  printf '%s\n' '# Relative links' '[inline](target.md)' '![image](image.png)' \
    '[balanced](guide_(v2).md)' '[reference]: target.md' '```markdown' \
    '[fenced](missing-fenced.md)' '```' \
    > "$link_fixture_repo/links.md"
  printf '%s\n' '# Target' > "$link_fixture_repo/target.md"
  printf '%s\n' '# Balanced target' > "$link_fixture_repo/guide_(v2).md"
  printf '%s\n' 'image fixture' > "$link_fixture_repo/image.png"
  "$ATLAS_FORGE_ROOT/scripts/check-relative-markdown-links.py" --root "$link_fixture_repo" >/dev/null
  for broken_link in \
    '[inline](missing-inline.md)' \
    '![image](missing-image.png)' \
    '[balanced](missing_(v2).md)' \
    '    - [nested](missing-nested.md)' \
    '[reference]: missing-reference.md'; do
    printf '%s\n' '# Broken link' "$broken_link" > "$link_fixture_repo/broken.md"
    expect_fail "relative Markdown link rejects missing target: $broken_link" \
      "$ATLAS_FORGE_ROOT/scripts/check-relative-markdown-links.py" --root "$link_fixture_repo"
    grep -q 'missing:' "$TMP_ROOT/expect-fail.out"
  done
  printf '%s\n' '# Indented code' '    ```' '    [literal](missing-literal.md)' '' \
    '[real](missing-real.md)' > "$link_fixture_repo/broken.md"
  expect_fail "relative Markdown link does not treat indented code as a fence" \
    "$ATLAS_FORGE_ROOT/scripts/check-relative-markdown-links.py" --root "$link_fixture_repo"
  grep -q 'missing-real.md' "$TMP_ROOT/expect-fail.out"
  rm "$link_fixture_repo/broken.md"
  pass "relative Markdown link gate"
  printf 'repo source contract passed\n'
  exit 0
fi
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
