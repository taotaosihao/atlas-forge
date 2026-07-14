# shellcheck shell=bash
# Sourced by contract.sh. Requires TMP_ROOT, pass, and expect_fail.

previous_codex_workflow_root="$CODEX_WORKFLOW_ROOT"
sdd_root="$TMP_ROOT/sdd-workflow"
export CODEX_WORKFLOW_ROOT="$sdd_root"
workspace_bin="$ATLAS_FORGE_ROOT/plugins/atlas-workflow/scripts/codex-team-workspace"
ledger_bin="$ATLAS_FORGE_ROOT/plugins/atlas-workflow/scripts/codex-team-ledger"
brief_bin="$ATLAS_FORGE_ROOT/plugins/atlas-workflow/scripts/codex-team-brief"
validate_json_bin="$ATLAS_FORGE_ROOT/plugins/atlas-workflow/scripts/codex-team-validate-json"
controller_resolution_bin="$ATLAS_FORGE_ROOT/plugins/atlas-workflow/scripts/codex-team-controller-resolution"
review_package_bin="$ATLAS_FORGE_ROOT/plugins/atlas-workflow/scripts/codex-team-review-package"
path_lease_bin="$ATLAS_FORGE_ROOT/plugins/atlas-workflow/scripts/codex-team-path-lease"
artifact_lint_bin="$ATLAS_FORGE_ROOT/plugins/atlas-workflow/scripts/codex-team-artifact-lint"
scorecard_bin="$ATLAS_FORGE_ROOT/plugins/atlas-workflow/scripts/codex-team-scorecard"
fixture_dir="$ATLAS_FORGE_ROOT/test/fixtures/team-sdd"

node --check "$workspace_bin" >/dev/null
node --check "$ledger_bin" >/dev/null
node --check "$brief_bin" >/dev/null
node --check "$validate_json_bin" >/dev/null
node --check "$controller_resolution_bin" >/dev/null
node --check "$review_package_bin" >/dev/null
node --check "$path_lease_bin" >/dev/null
node --check "$artifact_lint_bin" >/dev/null
node --check "$scorecard_bin" >/dev/null
node "$workspace_bin" --help >/dev/null
node "$ledger_bin" --help >/dev/null
node "$brief_bin" --help >/dev/null
node "$validate_json_bin" --help >/dev/null
node "$controller_resolution_bin" --help >/dev/null
node "$review_package_bin" --help >/dev/null
node "$path_lease_bin" --help >/dev/null
node "$artifact_lint_bin" --help >/dev/null
node "$scorecard_bin" --help >/dev/null

slice_dir="$(node "$workspace_bin" --task fixture --slice slice-001 --print slice)"
test "$slice_dir" = "$sdd_root/artifacts/fixture/team/sdd/slices/slice-001"
test -d "$slice_dir"
expect_fail "workspace rejects task escape" node "$workspace_bin" --task ../bad --print sdd
expect_fail "workspace rejects slice escape" node "$workspace_bin" --task fixture --slice ../bad --print slice

node "$ledger_bin" --task fixture append --event slice_started --json '{"task_id":"fixture","slice_id":"slice-001"}' >/dev/null
node "$ledger_bin" --task fixture status > "$TMP_ROOT/sdd-ledger-status.out"
grep -q "events: 1" "$TMP_ROOT/sdd-ledger-status.out"
grep -q "slice-001" "$TMP_ROOT/sdd-ledger-status.out"
node "$ledger_bin" --task fixture next-slice > "$TMP_ROOT/sdd-ledger-next.out"
grep -q "^slice-001$" "$TMP_ROOT/sdd-ledger-next.out"
node "$ledger_bin" --task fixture verify > "$TMP_ROOT/sdd-ledger-verify.out"
grep -q "ledger_valid: true" "$TMP_ROOT/sdd-ledger-verify.out"
expect_fail "ledger rejects unknown event" node "$ledger_bin" --task fixture append --event not_real --json '{"task_id":"fixture","slice_id":"slice-002"}'
expect_fail "ledger rejects missing slice id" node "$ledger_bin" --task fixture append --event slice_started --json '{"task_id":"fixture"}'
node "$ledger_bin" --task fixture append --event slice_complete --json '{"task_id":"fixture","slice_id":"slice-001"}' >/dev/null
node "$ledger_bin" --task fixture next-slice > "$TMP_ROOT/sdd-ledger-next-terminal.out"
test ! -s "$TMP_ROOT/sdd-ledger-next-terminal.out"

sdd_repo="$TMP_ROOT/sdd-repo"
setup_repo "$sdd_repo"
sdd_base="$(git -C "$sdd_repo" rev-parse HEAD)"
node "$brief_bin" \
  --task fixture \
  --slice slice-002 \
  --repo "$sdd_repo" \
  --base "$sdd_base" \
  --objective "Implement fixture slice" \
  --acceptance "AC-1" \
  --owned "plugins/atlas-workflow/contracts/team-sdd" \
  --forbidden "plugins/atlas-workflow/skills" \
  --check "workflow/tests/contract.sh" > "$TMP_ROOT/sdd-brief.out"
grep -q "brief_json:" "$TMP_ROOT/sdd-brief.out"
test -f "$sdd_root/artifacts/fixture/team/sdd/slices/slice-002/brief.json"
test -f "$sdd_root/artifacts/fixture/team/sdd/slices/slice-002/brief.md"
test -f "$sdd_root/artifacts/fixture/team/sdd/global-constraints.md"
node "$validate_json_bin" --type brief --file "$sdd_root/artifacts/fixture/team/sdd/slices/slice-002/brief.json" >/dev/null
node - "$sdd_root/artifacts/fixture/team/sdd/slices/slice-002/brief.json" <<'NODE'
const brief = require(process.argv[2]);
if (brief.schema_version !== 2 || brief.commit_policy !== "logical_outcome") process.exit(1);
if ("max_question_rounds" in brief || "fix_loop_policy" in brief) process.exit(1);
NODE
legacy_brief="$TMP_ROOT/legacy-brief-v1.json"
node - "$fixture_dir/valid/brief-v1.json" "$legacy_brief" "$sdd_repo" "$sdd_base" <<'NODE'
const fs = require("fs");
const [source, target, repo, base] = process.argv.slice(2);
const brief = JSON.parse(fs.readFileSync(source, "utf8"));
brief.repo = repo;
brief.base_sha = base;
fs.writeFileSync(target, `${JSON.stringify(brief, null, 2)}\n`);
NODE
node "$validate_json_bin" --type brief --file "$legacy_brief" >/dev/null
expect_fail "brief rejects relative repo" node "$brief_bin" --task fixture --slice slice-003 --repo relative --base HEAD --objective bad --acceptance AC-1 --owned docs --check true

sprint_contract="$TMP_ROOT/sprint-contract.md"
printf '%s\n' \
  '# Sprint Contract' \
  '' \
  '| id | behavior | required | validation |' \
  '| --- | --- | --- | --- |' \
  '| SC-A1 | Login accepts valid users | yes | pytest tests/auth/test_login.py |' \
  '| SC-A2 | Password reset sends email | yes | pytest tests/auth/test_reset.py |' \
  > "$sprint_contract"
node "$brief_bin" \
  --task fixture-contract \
  --slice slice-001 \
  --repo "$sdd_repo" \
  --base "$sdd_base" \
  --objective "Compile sprint contract row" \
  --contract "$sprint_contract" \
  --acceptance "SC-A1" \
  --owned "plugins/atlas-workflow/contracts/team-sdd" \
  --check "pytest tests/auth/test_login.py" > "$TMP_ROOT/sdd-contract-brief.out"
contract_slice="$sdd_root/artifacts/fixture-contract/team/sdd/slices/slice-001"
node "$validate_json_bin" --type brief --file "$contract_slice/brief.json" >/dev/null
python3 -m json.tool "$contract_slice/evidence-manifest.json" >/dev/null
grep -q "SC-A1" "$contract_slice/evidence-manifest.json"
! grep -q "SC-A2" "$contract_slice/evidence-manifest.json"
grep -q "evidence_manifest:" "$TMP_ROOT/sdd-contract-brief.out"
expect_fail "contract brief rejects unknown acceptance" node "$brief_bin" --task fixture-contract --slice slice-002 --repo "$sdd_repo" --base "$sdd_base" --objective bad --contract "$sprint_contract" --acceptance "SC-MISSING" --owned "plugins/atlas-workflow/contracts/team-sdd" --check true

node "$validate_json_bin" --type implementer-report --file "$fixture_dir/valid/implementer-report.json" >/dev/null
node "$validate_json_bin" --type implementer-report --file "$fixture_dir/valid/uncommitted-implementer-report.json" >/dev/null
node "$validate_json_bin" --type implementer-report --from-message "$fixture_dir/valid/implementer-message.md" >/dev/null
node "$validate_json_bin" --type review-verdict --file "$fixture_dir/valid/review-verdict.json" >/dev/null
node "$validate_json_bin" --type review-verdict --from-message "$fixture_dir/valid/review-message.md" >/dev/null
node - "$fixture_dir/valid/review-verdict.json" "$fixture_dir/valid/review-verdict-v1.json" "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/contracts/team-sdd/validators/review-verdict.js" "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/contracts/team-sdd/review-verdict.schema.json" "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/contracts/team-sdd/review-verdict-v1.schema.json" <<'NODE'
const fs = require("fs");
const [fixture, legacyFixture, validator, schemaFile, legacySchemaFile] = process.argv.slice(2);
const { validateReviewVerdict } = require(validator);
const valid = JSON.parse(fs.readFileSync(fixture, "utf8"));
const legacy = JSON.parse(fs.readFileSync(legacyFixture, "utf8"));
const schema = JSON.parse(fs.readFileSync(schemaFile, "utf8"));
const legacySchema = JSON.parse(fs.readFileSync(legacySchemaFile, "utf8"));
if (schema.additionalProperties !== false) process.exit(1);
if (JSON.stringify(schema.properties.schema_version.enum) !== "[2]") process.exit(1);
if (!schema.properties.issues.items.required.includes("finding_id")) process.exit(1);
if (JSON.stringify(legacySchema.properties.schema_version.enum) !== "[1]") process.exit(1);
if (legacySchema.properties.issues.items !== undefined) process.exit(1);
if (valid.schema_version !== 2 || validateReviewVerdict(valid).length !== 0) process.exit(1);
if (legacy.schema_version !== 1 || validateReviewVerdict(legacy).length !== 0) process.exit(1);
if (!validateReviewVerdict({ ...valid, schema_version: 3 }).includes("schema_version must be one of: 1, 2")) process.exit(1);
if (!validateReviewVerdict({ ...valid, controller_resolution: {} }).some((error) => error.includes("unknown key"))) process.exit(1);
const issue = {
  severity: "Important",
  category: "contract",
  path: "brief.json",
  line: 1,
  evidence: "current v1 issue",
  required_fix: "repair if required",
};
const issueWithFutureIdentity = { ...structuredClone(legacy), issues: [{ ...issue, finding_id: "future-id-is-currently-ignored" }] };
if (validateReviewVerdict(issueWithFutureIdentity).length !== 0) process.exit(1);
const emptyRequiredFix = { ...structuredClone(legacy), issues: [{ ...issue, required_fix: "" }] };
if (!validateReviewVerdict(emptyRequiredFix).some((error) => error.includes("required_fix must be a non-empty string"))) process.exit(1);
const nonStringEvidenceGap = { ...legacy, cannot_verify_from_diff: [42] };
if (validateReviewVerdict(nonStringEvidenceGap).length !== 0) process.exit(1);
NODE
grep -q 'New verdicts must use review-verdict schema_version 2' "$ATLAS_FORGE_ROOT/.codex/agents/atlas-sdd-reviewer.toml"
grep -q 'New verdicts must use review-verdict schema_version 2' "$ATLAS_FORGE_ROOT/.codex/agents/atlas-sdd-phase-reviewer.toml"
grep -q 'schema v1 is read-only historical compatibility' "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/skills/team/references/sdd.md"
grep -q 'codex-team-controller-resolution --task' "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/skills/team/references/sdd.md"
expect_fail "missing final message block" node "$validate_json_bin" --type implementer-report --from-message "$fixture_dir/valid/review-message.md"
expect_fail "needs context requires questions" node "$validate_json_bin" --type implementer-report --file "$fixture_dir/invalid/needs-context-without-questions.json"
expect_fail "blocked requires blockers" node "$validate_json_bin" --type implementer-report --file "$fixture_dir/invalid/blocked-without-blockers.json"
expect_fail "schema ref is not supported" node "$validate_json_bin" --type implementer-report --file "$fixture_dir/invalid/schema-ref-not-supported.json"

node "$brief_bin" --task fixture-no-commit --slice slice-001 --repo "$sdd_repo" --base "$sdd_base" --objective "Return an uncommitted patch" --acceptance AC-1 --owned plugins/atlas-workflow --check true --commit-policy changes_allowed_no_commit >/dev/null
node "$brief_bin" --task fixture-no-change --slice slice-001 --repo "$sdd_repo" --base "$sdd_base" --objective "Perform a read-only check" --acceptance AC-1 --owned plugins/atlas-workflow --check true --commit-policy no_change_allowed >/dev/null
logical_report="$TMP_ROOT/logical-outcome-report.json"
no_commit_report="$TMP_ROOT/changes-allowed-no-commit-report.json"
no_change_bad_report="$TMP_ROOT/no-change-bad-report.json"
no_change_good_report="$TMP_ROOT/no-change-good-report.json"
legacy_report="$TMP_ROOT/legacy-required-commit-report.json"
node - "$fixture_dir/valid/uncommitted-implementer-report.json" "$logical_report" "$no_commit_report" "$no_change_bad_report" "$no_change_good_report" "$legacy_report" "$sdd_base" <<'NODE'
const fs = require("fs");
const [source, logical, noCommit, noChangeBad, noChangeGood, legacy, base] = process.argv.slice(2);
const template = JSON.parse(fs.readFileSync(source, "utf8"));
function write(target, task, slice, overrides = {}) {
  fs.writeFileSync(target, `${JSON.stringify({ ...template, task_id: task, slice_id: slice, base_sha: base, head_sha: base, ...overrides }, null, 2)}\n`);
}
write(logical, "fixture", "slice-002");
write(noCommit, "fixture-no-commit", "slice-001");
write(noChangeBad, "fixture-no-change", "slice-001");
write(noChangeGood, "fixture-no-change", "slice-001", { commits: [], changed_files: [], no_change_reason: "The requested verification required no repository change." });
write(legacy, "legacy-brief-fixture", "slice-001");
NODE
node "$validate_json_bin" --type implementer-report --file "$logical_report" --brief "$sdd_root/artifacts/fixture/team/sdd/slices/slice-002/brief.json" >/dev/null
node "$validate_json_bin" --type implementer-report --file "$no_commit_report" --brief "$sdd_root/artifacts/fixture-no-commit/team/sdd/slices/slice-001/brief.json" >/dev/null
node "$validate_json_bin" --type implementer-report --file "$no_change_good_report" --brief "$sdd_root/artifacts/fixture-no-change/team/sdd/slices/slice-001/brief.json" >/dev/null
expect_fail "no-change policy rejects changed files" node "$validate_json_bin" --type implementer-report --file "$no_change_bad_report" --brief "$sdd_root/artifacts/fixture-no-change/team/sdd/slices/slice-001/brief.json"
expect_fail "legacy required commit policy rejects uncommitted changes" node "$validate_json_bin" --type implementer-report --file "$legacy_report" --brief "$legacy_brief"

review_repo="$TMP_ROOT/sdd-review-repo"
setup_repo "$review_repo"
review_base="$(git -C "$review_repo" rev-parse HEAD)"
printf '%s\n' 'first review package change' >> "$review_repo/docs/prd.md"
git -C "$review_repo" add docs/prd.md
git -C "$review_repo" commit -m "first review package change" -q
printf '%s\n' 'second review package change' > "$review_repo/docs/review-package.md"
git -C "$review_repo" add docs/review-package.md
git -C "$review_repo" commit -m "second review package change" -q
review_head="$(git -C "$review_repo" rev-parse HEAD)"
(
  cd "$TMP_ROOT"
  node "$review_package_bin" \
    --repo "$review_repo" \
    --base "$review_base" \
    --head "$review_head" \
    --task fixture \
    --slice slice-003 > "$TMP_ROOT/sdd-review-package.out"
)
review_diff="$sdd_root/artifacts/fixture/team/sdd/slices/slice-003/review-package.diff"
test -f "$review_diff"
grep -q "first review package change" "$review_diff"
grep -q "second review package change" "$review_diff"
grep -q "review_package:" "$TMP_ROOT/sdd-review-package.out"
expect_fail "review package rejects bad sha" node "$review_package_bin" --repo "$review_repo" --base "$review_base" --head bad-sha --task fixture --slice slice-003
expect_fail "review package rejects out escape" node "$review_package_bin" --repo "$review_repo" --base "$review_base" --head "$review_head" --task fixture --slice slice-003 --out ../escape.diff
expect_fail "review package requires base by default" node "$review_package_bin" --repo "$review_repo" --head "$review_head" --task fixture --slice slice-004
node "$review_package_bin" \
  -C "$review_repo" \
  --head "$review_head" \
  --task fixture \
  --slice slice-004 \
  --allow-head-parent >/dev/null
test -f "$sdd_root/artifacts/fixture/team/sdd/slices/slice-004/review-package.diff"

node "$path_lease_bin" --task fixture --slice slice-001 acquire --paths 'src/**' >/dev/null
expect_fail "path lease detects parent child overlap" node "$path_lease_bin" --task fixture --slice slice-002 acquire --paths 'src/auth/**'
expect_fail "path lease check detects conflict" node "$path_lease_bin" --task fixture --slice slice-002 check --paths 'src/auth/**'
node "$path_lease_bin" --task fixture --slice slice-001 release >/dev/null
node "$path_lease_bin" --task fixture --slice slice-002 acquire --paths 'src/auth/**' >/dev/null
node "$validate_json_bin" --type path-lease --file "$sdd_root/artifacts/fixture/team/sdd/path-leases.json" >/dev/null
expect_fail "path lease rejects escape" node "$path_lease_bin" --task fixture --slice slice-003 acquire --paths '../escape/**'
expect_fail "path lease rejects absolute path" node "$path_lease_bin" --task fixture --slice slice-003 acquire --paths '/tmp/escape/**'
node "$path_lease_bin" \
  --task fixture \
  --slice slice-005 \
  acquire \
  --paths 'plugins/atlas-workflow/contracts/team-sdd/**' \
  --brief "$sdd_root/artifacts/fixture/team/sdd/slices/slice-002/brief.json" >/dev/null
expect_fail "path lease enforces brief owned paths" node "$path_lease_bin" --task fixture --slice slice-006 acquire --paths 'plugins/multica-sdlc/**' --brief "$sdd_root/artifacts/fixture/team/sdd/slices/slice-002/brief.json"
expect_fail "path lease enforces brief forbidden paths" node "$path_lease_bin" --task fixture --slice slice-006 acquire --paths 'plugins/atlas-workflow/skills/**' --brief "$sdd_root/artifacts/fixture/team/sdd/slices/slice-002/brief.json"

write_lint_fixture() {
  local task="$1"
  local mode="$2"
  local artifact="$sdd_root/artifacts/$task"
  local slice_dir="$artifact/team/sdd/slices/slice-001"
  node "$brief_bin" \
    --task "$task" \
    --slice slice-001 \
    --repo "$sdd_repo" \
    --base "$sdd_base" \
    --objective "Lint fixture" \
    --acceptance "AC-1" \
    --owned "plugins/atlas-workflow/contracts/team-sdd" \
    --check "workflow/tests/contract.sh" >/dev/null
  printf '%s\n' \
    '{"schema_version":1,"timestamp":"2026-07-06T00:00:00.000Z","event":"slice_started","task_id":"'"$task"'","slice_id":"slice-001"}' \
    '{"schema_version":1,"timestamp":"2026-07-06T00:00:01.000Z","event":"review_package_written","task_id":"'"$task"'","slice_id":"slice-001"}' \
    '{"schema_version":1,"timestamp":"2026-07-06T00:00:02.000Z","event":"review_clean","task_id":"'"$task"'","slice_id":"slice-001"}' \
    > "$artifact/team/sdd/progress.jsonl"
  mkdir -p "$artifact/team"
  if [[ "$mode" == "missing-native" ]]; then
    printf '%s\n' '# Round' '' 'This artifact has substantive review notes but no native backend metadata.' > "$artifact/team/round-missing.md"
  elif [[ "$mode" == "placeholder" ]]; then
    printf '%s\n' '# Round' '' 'TODO' > "$artifact/team/round-placeholder.md"
  else
    printf '%s\n' '# Round' '' 'backend: native' '' 'Substantive native round evidence for artifact lint fixture.' > "$artifact/team/round-valid.md"
  fi
  if [[ "$mode" != "missing-review-package" ]]; then
    printf '%s\n' 'diff --git a/example b/example' '+lint fixture diff' > "$slice_dir/review-package.diff"
  fi
  if [[ "$mode" == "critical" || "$mode" == "important" ]]; then
    severity="Critical"
    if [[ "$mode" == "important" ]]; then
      severity="Important"
    fi
    printf '%s\n' \
      '{"schema_version":1,"task_id":"'"$task"'","slice_id":"slice-001","base_sha":"1111111111111111111111111111111111111111","head_sha":"2222222222222222222222222222222222222222","spec_compliance":"fail","task_quality":"fail","issues":[{"severity":"'"$severity"'","category":"contract","path":"brief.json","line":1,"evidence":"unresolved issue","required_fix":"resolve issue"}],"cannot_verify_from_diff":[],"strengths":[],"reviewed_inputs":{"brief_json":"brief.json","review_package_diff":"review-package.diff"}}' \
      > "$slice_dir/review-verdict.json"
  elif [[ "$mode" == "cannot-verify" ]]; then
    printf '%s\n' \
      '{"schema_version":1,"task_id":"'"$task"'","slice_id":"slice-001","base_sha":"1111111111111111111111111111111111111111","head_sha":"2222222222222222222222222222222222222222","spec_compliance":"cannot_verify","task_quality":"pass","issues":[],"cannot_verify_from_diff":["runtime check unavailable"],"strengths":[],"reviewed_inputs":{"brief_json":"brief.json","review_package_diff":"review-package.diff"}}' \
      > "$slice_dir/review-verdict.json"
  else
    printf '%s\n' \
      '{"schema_version":1,"task_id":"'"$task"'","slice_id":"slice-001","base_sha":"1111111111111111111111111111111111111111","head_sha":"2222222222222222222222222222222222222222","spec_compliance":"pass","task_quality":"pass","issues":[],"cannot_verify_from_diff":[],"strengths":["lint fixture"],"reviewed_inputs":{"brief_json":"brief.json","review_package_diff":"review-package.diff"}}' \
      > "$slice_dir/review-verdict.json"
  fi
}

write_lint_fixture fixture-artifact-lint-valid valid
node "$artifact_lint_bin" --task fixture-artifact-lint-valid --strict >/dev/null
write_lint_fixture fixture-critical-unresolved critical
expect_fail "artifact lint rejects unresolved critical" node "$artifact_lint_bin" --task fixture-critical-unresolved --strict
printf '%s\n' '{"status":"resolved","reason":"any truthy v1 controller resolution currently clears the whole verdict"}' > "$sdd_root/artifacts/fixture-critical-unresolved/team/sdd/slices/slice-001/controller-resolution.json"
node "$artifact_lint_bin" --task fixture-critical-unresolved --strict >/dev/null
write_lint_fixture fixture-important-unresolved important
expect_fail "artifact lint rejects unresolved important" node "$artifact_lint_bin" --task fixture-important-unresolved --strict
printf '%s\n' '{"status":"follow-up","reason":"v1 lint currently checks only truthy status and reason"}' > "$sdd_root/artifacts/fixture-important-unresolved/team/sdd/slices/slice-001/controller-resolution.json"
node "$artifact_lint_bin" --task fixture-important-unresolved --strict >/dev/null
write_lint_fixture fixture-cannot-verify cannot-verify
expect_fail "artifact lint rejects unresolved cannot verify" node "$artifact_lint_bin" --task fixture-cannot-verify --strict
printf '%s\n' '{"status":"terminal","reason":"v1 resolution also clears cannot-verify with no evidence-gap identity"}' > "$sdd_root/artifacts/fixture-cannot-verify/team/sdd/slices/slice-001/controller-resolution.json"
node "$artifact_lint_bin" --task fixture-cannot-verify --strict >/dev/null

write_v2_lint_fixture() {
  local task="$1"
  local mode="$2"
  local artifact="$sdd_root/artifacts/$task"
  local slice_dir="$artifact/team/sdd/slices/slice-001"
  node "$brief_bin" \
    --task "$task" \
    --slice slice-001 \
    --repo "$sdd_repo" \
    --base "$sdd_base" \
    --objective "V2 admission lint fixture" \
    --acceptance "AC-1" \
    --owned "plugins/atlas-workflow/contracts/team-sdd" \
    --check "workflow/tests/contract_team_sdd.sh" >/dev/null
  printf '%s\n' \
    '{"schema_version":1,"timestamp":"2026-07-06T00:00:00.000Z","event":"slice_started","task_id":"'"$task"'","slice_id":"slice-001"}' \
    '{"schema_version":1,"timestamp":"2026-07-06T00:00:01.000Z","event":"review_package_written","task_id":"'"$task"'","slice_id":"slice-001"}' \
    '{"schema_version":1,"timestamp":"2026-07-06T00:00:02.000Z","event":"review_clean","task_id":"'"$task"'","slice_id":"slice-001"}' \
    > "$artifact/team/sdd/progress.jsonl"
  printf '%s\n' '# Round' '' 'backend: native' '' 'Substantive v2 admission lint fixture.' > "$artifact/team/round-valid.md"
  printf '%s\n' 'diff --git a/example b/example' '+v2 admission fixture diff' > "$slice_dir/review-package.diff"
  node - "$task" "$slice_dir" "$mode" "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/contracts/team-sdd/validators/controller-resolution.js" <<'NODE'
const fs = require("fs");
const path = require("path");
const [taskId, sliceDir, mode, controllerModule] = process.argv.slice(2);
const { computeGoalRef, digestFile } = require(controllerModule);
const brief = JSON.parse(fs.readFileSync(path.join(sliceDir, "brief.json"), "utf8"));
const verdict = {
  schema_version: 2,
  task_id: taskId,
  slice_id: "slice-001",
  base_sha: "1".repeat(40),
  head_sha: "2".repeat(40),
  spec_compliance: "cannot_verify",
  task_quality: "fail",
  issues: [{
    finding_id: "finding-critical",
    severity: "Critical",
    category: "contract",
    path: "brief.json",
    line: 1,
    evidence: "critical issue evidence",
    required_fix: "conditional repair",
  }],
  cannot_verify_from_diff: [{ gap_id: "gap-runtime", description: "runtime unavailable" }],
  strengths: [],
  reviewed_inputs: { brief_json: "brief.json", review_package_diff: "review-package.diff" },
};
const verdictFile = path.join(sliceDir, "review-verdict.json");
fs.writeFileSync(verdictFile, `${JSON.stringify(verdict, null, 2)}\n`);
if (mode === "missing-resolution") process.exit(0);
const required = mode === "required-open" || mode === "required-resolved";
const informational = mode === "informational";
const resolution = {
  schema_version: 2,
  task_id: taskId,
  slice_id: "slice-001",
  verdict_digest: digestFile(verdictFile),
  goal_ref: computeGoalRef(brief, sliceDir),
  records: [{
    finding_id: "finding-critical",
    disposition: required ? "current-required" : informational ? "informational" : "visible-follow-up",
    basis: required ? "goal-blocker" : informational ? "no-action" : "not-current-required",
    authority_refs: required ? ["acceptance:AC-1"] : [],
    repair_status: required ? (mode === "required-resolved" ? "resolved" : "open") : "omitted",
    reason: required ? "finding blocks AC-1" : "finding is outside the current goal",
  }],
  evidence_gaps: [{
    gap_id: "gap-runtime",
    status: mode === "gap-open" ? "open" : mode === "gap-terminal" ? "terminal-blocker" : "resolved",
    evidence_refs: mode === "gap-open" ? [] : ["evidence:runtime"],
    reason: "explicit evidence-gap conclusion",
  }],
};
if (mode === "wrong-goal") resolution.goal_ref = "f".repeat(64);
fs.writeFileSync(path.join(sliceDir, "controller-resolution.json"), `${JSON.stringify(resolution, null, 2)}\n`);
NODE
}

write_v2_lint_fixture fixture-v2-visible-follow-up visible
controller_decisions="$TMP_ROOT/controller-decisions.json"
cat > "$controller_decisions" <<'JSON'
{
  "records": [{
    "finding_id": "finding-critical",
    "disposition": "visible-follow-up",
    "basis": "not-current-required",
    "authority_refs": [],
    "repair_status": "omitted",
    "reason": "finding is outside the current goal"
  }],
  "evidence_gaps": [{
    "gap_id": "gap-runtime",
    "status": "resolved",
    "evidence_refs": ["evidence:runtime"],
    "reason": "runtime evidence supplied"
  }]
}
JSON
rm "$sdd_root/artifacts/fixture-v2-visible-follow-up/team/sdd/slices/slice-001/controller-resolution.json"
node "$controller_resolution_bin" --task fixture-v2-visible-follow-up --slice slice-001 --decisions "$controller_decisions" > "$TMP_ROOT/controller-resolution.out"
grep -q '^controller_resolution:' "$TMP_ROOT/controller-resolution.out"
grep -Eq '^verdict_digest: [0-9a-f]{64}$' "$TMP_ROOT/controller-resolution.out"
grep -Eq '^goal_ref: [0-9a-f]{64}$' "$TMP_ROOT/controller-resolution.out"
node "$artifact_lint_bin" --task fixture-v2-visible-follow-up --strict >/dev/null
node "$validate_json_bin" --type controller-resolution --file "$sdd_root/artifacts/fixture-v2-visible-follow-up/team/sdd/slices/slice-001/controller-resolution.json" >/dev/null
controller_resolution_file="$sdd_root/artifacts/fixture-v2-visible-follow-up/team/sdd/slices/slice-001/controller-resolution.json"
cp "$controller_resolution_file" "$TMP_ROOT/foreign-controller-resolution.json"
rm "$controller_resolution_file"
ln -s "$TMP_ROOT/foreign-controller-resolution.json" "$controller_resolution_file"
expect_fail "artifact lint rejects symlinked v2 controller authority" node "$artifact_lint_bin" --task fixture-v2-visible-follow-up --strict
rm "$controller_resolution_file"
cp "$TMP_ROOT/foreign-controller-resolution.json" "$controller_resolution_file"
controller_before="$(sha256sum "$sdd_root/artifacts/fixture-v2-visible-follow-up/team/sdd/slices/slice-001/controller-resolution.json")"
printf '%s\n' '{"records":[],"evidence_gaps":[]}' > "$TMP_ROOT/controller-decisions-incomplete.json"
expect_fail "controller helper rejects incomplete finding and gap coverage" node "$controller_resolution_bin" --task fixture-v2-visible-follow-up --slice slice-001 --decisions "$TMP_ROOT/controller-decisions-incomplete.json"
controller_after="$(sha256sum "$sdd_root/artifacts/fixture-v2-visible-follow-up/team/sdd/slices/slice-001/controller-resolution.json")"
test "$controller_before" = "$controller_after"
duplicate_resolution="$TMP_ROOT/duplicate-controller-resolution.json"
node - "$sdd_root/artifacts/fixture-v2-visible-follow-up/team/sdd/slices/slice-001/controller-resolution.json" "$duplicate_resolution" <<'NODE'
const fs = require("fs");
const [source, target] = process.argv.slice(2);
const value = JSON.parse(fs.readFileSync(source, "utf8"));
value.records.push(structuredClone(value.records[0]));
value.evidence_gaps.push(structuredClone(value.evidence_gaps[0]));
fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
NODE
expect_fail "validate-json rejects duplicate controller identities" node "$validate_json_bin" --type controller-resolution --file "$duplicate_resolution"
write_v2_lint_fixture fixture-v2-informational informational
node "$artifact_lint_bin" --task fixture-v2-informational --strict >/dev/null
write_v2_lint_fixture fixture-v2-required-open required-open
expect_fail "v2 artifact lint blocks current-required open" node "$artifact_lint_bin" --task fixture-v2-required-open --strict
write_v2_lint_fixture fixture-v2-required-resolved required-resolved
node "$artifact_lint_bin" --task fixture-v2-required-resolved --strict >/dev/null
write_v2_lint_fixture fixture-v2-gap-open gap-open
expect_fail "v2 artifact lint blocks open evidence gap" node "$artifact_lint_bin" --task fixture-v2-gap-open --strict
write_v2_lint_fixture fixture-v2-gap-terminal gap-terminal
expect_fail "v2 artifact lint blocks terminal evidence gap" node "$artifact_lint_bin" --task fixture-v2-gap-terminal --strict
write_v2_lint_fixture fixture-v2-missing-resolution missing-resolution
expect_fail "v2 artifact lint requires complete admission coverage" node "$artifact_lint_bin" --task fixture-v2-missing-resolution --strict
write_v2_lint_fixture fixture-v2-wrong-goal wrong-goal
expect_fail "v2 artifact lint rejects stale goal admission" node "$artifact_lint_bin" --task fixture-v2-wrong-goal --strict
write_lint_fixture fixture-missing-review-package missing-review-package
expect_fail "artifact lint rejects missing review package" node "$artifact_lint_bin" --task fixture-missing-review-package --strict
write_lint_fixture fixture-missing-native-backend-metadata missing-native
expect_fail "artifact lint rejects missing native backend metadata" node "$artifact_lint_bin" --task fixture-missing-native-backend-metadata --strict
write_lint_fixture fixture-placeholder-only-artifact placeholder
expect_fail "artifact lint rejects placeholder artifact" node "$artifact_lint_bin" --task fixture-placeholder-only-artifact --strict
write_lint_fixture fixture-fix-loop-unbounded valid
printf '%s\n' \
  '{"schema_version":1,"timestamp":"2026-07-06T00:00:00.000Z","event":"slice_started","task_id":"fixture-fix-loop-unbounded","slice_id":"slice-001"}' \
  '{"schema_version":1,"timestamp":"2026-07-06T00:00:01.000Z","event":"fix_started","task_id":"fixture-fix-loop-unbounded","slice_id":"slice-001","iteration":1}' \
  '{"schema_version":1,"timestamp":"2026-07-06T00:00:02.000Z","event":"fix_started","task_id":"fixture-fix-loop-unbounded","slice_id":"slice-001","iteration":3}' \
  '{"schema_version":1,"timestamp":"2026-07-06T00:00:03.000Z","event":"review_clean","task_id":"fixture-fix-loop-unbounded","slice_id":"slice-001"}' \
  > "$sdd_root/artifacts/fixture-fix-loop-unbounded/team/sdd/progress.jsonl"
node "$artifact_lint_bin" --task fixture-fix-loop-unbounded --strict >/dev/null
rg -n '"event":"fix_started".*"iteration":3' "$sdd_root/artifacts/fixture-fix-loop-unbounded/team/sdd/progress.jsonl" >/dev/null
! rg -n "exhausted-by-iteration|max_fix_iterations" "$sdd_root/artifacts/fixture-fix-loop-unbounded/team/sdd" >/dev/null

node "$scorecard_bin" --task fixture-scorecard append --json '{"slice_id":"slice-001","role":"reviewer","model":"gpt-5.4","status":"DONE","event":"review_clean","duration_ms":10,"metadata":{"round":1}}' >/dev/null
node "$scorecard_bin" --task fixture-scorecard append --json '{"slice_id":"slice-002","role":"reviewer","model":"gpt-5.4","status":"DONE_WITH_CONCERNS","event":"review_failed","duration_ms":20,"metadata":{"round":1}}' >/dev/null
node "$scorecard_bin" --task fixture-scorecard append --json '{"slice_id":"slice-002","role":"fixer","model":"gpt-5.4-mini","status":"BLOCKED","event":"fix_progress_stalled","duration_ms":30,"metadata":{"round":2}}' >/dev/null
node "$scorecard_bin" --task fixture-scorecard append --json '{"slice_id":"slice-002","role":"fixer","model":"gpt-5.4-mini","status":"DONE","event":"fix_started","duration_ms":40,"metadata":{"round":3}}' >/dev/null
node -e 'const fs=require("fs"); for (const line of fs.readFileSync(process.argv[1],"utf8").trim().split(/\n/)) JSON.parse(line)' "$sdd_root/artifacts/fixture-scorecard/team/sdd/scorecard.jsonl"
node "$scorecard_bin" --task fixture-scorecard summary > "$TMP_ROOT/scorecard-summary.out"
grep -q "review_failed: 1" "$TMP_ROOT/scorecard-summary.out"
grep -q "review_clean: 1" "$TMP_ROOT/scorecard-summary.out"
grep -q "fix_progress_stalled: 1" "$TMP_ROOT/scorecard-summary.out"
grep -q "review_fail_rate: 0.5000" "$TMP_ROOT/scorecard-summary.out"
grep -q "fix_loop_count: 2" "$TMP_ROOT/scorecard-summary.out"
grep -q "reviewer: 2" "$TMP_ROOT/scorecard-summary.out"
grep -q "gpt-5.4-mini: 2" "$TMP_ROOT/scorecard-summary.out"
expect_fail "scorecard rejects missing slice id" node "$scorecard_bin" --task fixture-scorecard append --json '{"role":"reviewer","model":"gpt-5.4","status":"DONE","event":"review_clean"}'

export CODEX_WORKFLOW_ROOT="$previous_codex_workflow_root"
pass "sdd workspace ledger, message contracts, review package, path lease, artifact lint, and scorecard"
