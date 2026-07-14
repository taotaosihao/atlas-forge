#!/usr/bin/env bash
set -euo pipefail

ATLAS_FORGE_ROOT="${ATLAS_FORGE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
BIN="$ATLAS_FORGE_ROOT/plugins/atlas-workflow/scripts/codex-implementation-contract-lint"
FIXTURE_ROOT="$ATLAS_FORGE_ROOT/test/fixtures/implementation-contract"
CURRENT_AUTHORITY="$ATLAS_FORGE_ROOT/docs/atlas-workflow/20260710-003-atlas-forge-release-integrity-governance-plan/implementation-contract.final.md"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/atlas-implementation-contract.XXXXXX")"
trap 'rm -rf -- "$TMP_ROOT"' EXIT

PASS_COUNT=0
CASE_COUNT=0

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  printf 'ok - %s\n' "$1"
}

case_paths() {
  CASE_COUNT=$((CASE_COUNT + 1))
  CASE_STDOUT="$TMP_ROOT/case-$CASE_COUNT.stdout"
  CASE_STDERR="$TMP_ROOT/case-$CASE_COUNT.stderr"
}

show_failure() {
  printf 'contract case failed: %s\n' "$1" >&2
  [[ ! -s "$CASE_STDOUT" ]] || sed -n '1,120p' "$CASE_STDOUT" >&2
  [[ ! -s "$CASE_STDERR" ]] || sed -n '1,120p' "$CASE_STDERR" >&2
  exit 1
}

run_v1_valid() {
  local label="$1" file="$2"
  case_paths
  if ! "$BIN" --strict --file "$file" >"$CASE_STDOUT" 2>"$CASE_STDERR"; then
    show_failure "$label"
  fi
  grep -q '^implementation_contract_lint: true$' "$CASE_STDOUT" || show_failure "$label"
  grep -q '^semantics_version: 1$' "$CASE_STDOUT" || show_failure "$label"
  grep -q '^errors: 0$' "$CASE_STDOUT" || show_failure "$label"
  grep -q '^warnings: 0$' "$CASE_STDOUT" || show_failure "$label"
  [[ ! -s "$CASE_STDERR" ]] || show_failure "$label"
  pass "$label"
}

run_v2_valid() {
  local label="$1" file="$2"
  case_paths
  if ! "$BIN" --strict --file "$file" --authority-slice "$AUTHORITY_SLICE" >"$CASE_STDOUT" 2>"$CASE_STDERR"; then
    show_failure "$label"
  fi
  grep -q '^implementation_contract_lint: true$' "$CASE_STDOUT" || show_failure "$label"
  grep -q '^semantics_version: 2$' "$CASE_STDOUT" || show_failure "$label"
  grep -q '^errors: 0$' "$CASE_STDOUT" || show_failure "$label"
  grep -q '^warnings: 0$' "$CASE_STDOUT" || show_failure "$label"
  [[ ! -s "$CASE_STDERR" ]] || show_failure "$label"
  pass "$label"
}

run_v2_authority_invalid() {
  local label="$1" file="$2" expected_code="$3" authority_slice="${4:-$AUTHORITY_SLICE}"
  local status
  case_paths
  set +e
  "$BIN" --strict --file "$file" --authority-slice "$authority_slice" >"$CASE_STDOUT" 2>"$CASE_STDERR"
  status=$?
  set -e
  [[ "$status" -eq 1 ]] || show_failure "$label (expected rc 1, got $status)"
  grep -q '^implementation_contract_lint: false$' "$CASE_STDOUT" || show_failure "$label"
  grep -q "^ERROR $expected_code " "$CASE_STDERR" || show_failure "$label"
  pass "$label"
}

run_legacy_valid() {
  local label="$1" file="$2"
  case_paths
  if ! "$BIN" --file "$file" >"$CASE_STDOUT" 2>"$CASE_STDERR"; then
    show_failure "$label"
  fi
  grep -q '^implementation_contract_lint: true$' "$CASE_STDOUT" || show_failure "$label"
  grep -q '^semantics_version: legacy$' "$CASE_STDOUT" || show_failure "$label"
  grep -q '^warnings: 1$' "$CASE_STDOUT" || show_failure "$label"
  grep -q '^WARNING LEGACY_CONTRACT_UNVERSIONED ' "$CASE_STDERR" || show_failure "$label"
  pass "$label"
}

run_semantic_invalid() {
  local label="$1" file="$2"
  shift 2
  local expected code field status
  case_paths
  set +e
  "$BIN" --strict --file "$file" >"$CASE_STDOUT" 2>"$CASE_STDERR"
  status=$?
  set -e
  [[ "$status" -eq 1 ]] || show_failure "$label (expected rc 1, got $status)"
  grep -q '^implementation_contract_lint: false$' "$CASE_STDOUT" || show_failure "$label"
  for expected in "$@"; do
    code="${expected%%:*}"
    if [[ "$expected" == *:* ]]; then
      field="${expected#*:}"
      grep -q "^ERROR $code .* field=$field " "$CASE_STDERR" \
        || show_failure "$label (missing $code for $field)"
    else
      grep -q "^ERROR $code " "$CASE_STDERR" || show_failure "$label (missing $code)"
    fi
  done
  ! grep -qE '(^|[[:space:]])at [^ ]+ \(' "$CASE_STDERR" || show_failure "$label (stack trace leaked)"
  pass "$label"
}

run_nonstrict_invalid() {
  local label="$1" file="$2" expected_code="$3" status
  case_paths
  set +e
  "$BIN" --file "$file" >"$CASE_STDOUT" 2>"$CASE_STDERR"
  status=$?
  set -e
  [[ "$status" -eq 1 ]] || show_failure "$label (expected rc 1, got $status)"
  grep -q '^implementation_contract_lint: false$' "$CASE_STDOUT" || show_failure "$label"
  grep -q "^ERROR $expected_code " "$CASE_STDERR" || show_failure "$label"
  pass "$label"
}

run_usage_invalid() {
  local label="$1" expected_code="$2"
  shift 2
  local status
  case_paths
  set +e
  "$BIN" "$@" >"$CASE_STDOUT" 2>"$CASE_STDERR"
  status=$?
  set -e
  [[ "$status" -eq 2 ]] || show_failure "$label (expected rc 2, got $status)"
  grep -q '^implementation_contract_lint: false$' "$CASE_STDERR" || show_failure "$label"
  grep -q "^ERROR $expected_code " "$CASE_STDERR" || show_failure "$label"
  ! grep -qE '(^|[[:space:]])at [^ ]+ \(' "$CASE_STDERR" || show_failure "$label (stack trace leaked)"
  pass "$label"
}

node --check "$BIN"
"$BIN" --help >"$TMP_ROOT/help.stdout"
grep -q -- '--strict' "$TMP_ROOT/help.stdout"
grep -q -- '--authority-slice' "$TMP_ROOT/help.stdout"
grep -q 'Exit codes:' "$TMP_ROOT/help.stdout"
pass 'CLI help and syntax are valid'

run_v1_valid 'required first-code and served UI contract passes' "$FIXTURE_ROOT/valid/required-ui.md"
run_v1_valid 'negative UI safety guarantees do not count as synthetic actions' "$FIXTURE_ROOT/valid/negative-ui-guards.md"
run_v1_valid 'WHATWG-equivalent entrypoint literals bind to the declared URL' "$FIXTURE_ROOT/valid/normalized-entrypoint.md"
run_v1_valid 'a substantive slice may preserve unrelated behavior unchanged' "$FIXTURE_ROOT/valid/substantive-unrelated-unchanged.md"
run_v1_valid 'a real scanner behavior slice may include supporting fixtures' "$FIXTURE_ROOT/valid/first-slice-with-supporting-fixtures.md"
for implementation_slice in \
  'Add regression fixtures and fix scanner behavior.' \
  'Add regression fixtures and update scanner code.' \
  'Add regression fixtures and harden CLI behavior.' \
  'Add scanner fixtures, then enforce scanner rejection behavior.' \
  'Modify scanner fixtures and repair runtime behavior.' \
  'Refactor scanner to reject forbidden paths and add regression tests.' \
  'Fix scanner rejection and add regression fixtures.' \
  'Implement contract-owned behavior with supporting fixtures.' \
  'Implement contract parser behavior with regression tests.' \
  'Implement API endpoint behavior and add tests.' \
  'Update runtime behavior and add regression tests.' \
  'Implement scanner behavior with fixture-backed tests.' \
  '实现并发运行时行为并添加测试。'; do
  implementation_file="$TMP_ROOT/substantive-first-slice-$CASE_COUNT.md"
  sed "s/^- first_code_slice:.*/- first_code_slice: $implementation_slice/" \
    "$FIXTURE_ROOT/valid/first-slice-with-supporting-fixtures.md" > "$implementation_file"
  run_v1_valid "supporting non-code artifacts do not hide an implementation slice: $implementation_slice" "$implementation_file"
done
run_v1_valid 'headless scanner contract passes with UI not applicable' "$FIXTURE_ROOT/valid/headless-scanner.md"
run_v1_valid 'planning/docs contract passes with both gates not applicable' "$FIXTURE_ROOT/valid/not-applicable-docs.md"
run_v1_valid 'planning contract passes with both gates not applicable' "$FIXTURE_ROOT/valid/planning.md"
run_v1_valid 'review contract passes with both gates not applicable' "$FIXTURE_ROOT/valid/review.md"
run_v1_valid 'audit contract passes with both gates not applicable' "$FIXTURE_ROOT/valid/audit.md"
run_v1_valid 'fenced machine-field examples are ignored' "$FIXTURE_ROOT/valid/fenced-examples.md"
scope_v2="$FIXTURE_ROOT/valid/scope-admission-v2.md"
export CODEX_WORKFLOW_ROOT="$TMP_ROOT/workflow"
AUTHORITY_SLICE="$CODEX_WORKFLOW_ROOT/artifacts/fixture/team/sdd/slices/slice-001"
mkdir -p "$AUTHORITY_SLICE"
base_sha="$(git -C "$ATLAS_FORGE_ROOT" rev-parse HEAD)"
node - "$ATLAS_FORGE_ROOT" "$AUTHORITY_SLICE" "$base_sha" <<'NODE'
const fs = require("fs");
const path = require("path");
const [root, sliceDir, baseSha] = process.argv.slice(2);
const { computeGoalRef, digestFile } = require(path.join(
  root,
  "plugins/atlas-workflow/contracts/team-sdd/validators/controller-resolution.js",
));
const brief = {
  schema_version: 2,
  task_id: "fixture",
  slice_id: "slice-001",
  repo: root,
  base_sha: baseSha,
  objective: "Provide canonical authority for implementation-contract lint tests.",
  requirements_path: "brief.md",
  global_constraints_path: "../../global-constraints.md",
  owned_paths: ["plugins/atlas-workflow"],
  forbidden_paths: ["plugins/multica-sdlc"],
  acceptance_refs: ["REQ-1"],
  required_checks: ["bash workflow/tests/contract_implementation_contract.sh"],
  commit_policy: "logical_outcome",
  output_contract: "final_message_json_only",
};
const verdict = {
  schema_version: 2,
  task_id: brief.task_id,
  slice_id: brief.slice_id,
  base_sha: baseSha,
  head_sha: baseSha,
  spec_compliance: "pass",
  task_quality: "pass",
  issues: [
    {
      finding_id: "finding-resolved",
      severity: "Important",
      category: "contract",
      path: "implementation-contract.final.md",
      line: 1,
      evidence: "The finding remains required after repair.",
      required_fix: "Retain the repaired requirement.",
    },
    {
      finding_id: "finding-follow-up",
      severity: "Minor",
      category: "documentation",
      path: "implementation-contract.final.md",
      line: 2,
      evidence: "The suggestion is outside the current goal.",
      required_fix: "Track the suggestion as a follow-up.",
    },
  ],
  cannot_verify_from_diff: [],
  strengths: ["Canonical authority is explicit."],
  reviewed_inputs: { brief_json: "brief.json", diff: "local" },
};
fs.writeFileSync(path.join(sliceDir, "brief.md"), "# Canonical requirements\n\n- REQ-1\n");
fs.writeFileSync(path.join(sliceDir, "brief.json"), `${JSON.stringify(brief, null, 2)}\n`);
fs.writeFileSync(path.join(sliceDir, "review-verdict.json"), `${JSON.stringify(verdict, null, 2)}\n`);
const resolution = {
  schema_version: 2,
  task_id: brief.task_id,
  slice_id: brief.slice_id,
  verdict_digest: digestFile(path.join(sliceDir, "review-verdict.json")),
  goal_ref: computeGoalRef(brief, sliceDir),
  records: [
    {
      finding_id: "finding-resolved",
      disposition: "current-required",
      basis: "goal-blocker",
      authority_refs: ["acceptance:REQ-1"],
      repair_status: "resolved",
      reason: "The current goal still requires the repaired behavior.",
    },
    {
      finding_id: "finding-follow-up",
      disposition: "visible-follow-up",
      basis: "not-current-required",
      authority_refs: [],
      repair_status: "omitted",
      reason: "The suggestion is not required by the current goal.",
    },
  ],
  evidence_gaps: [],
};
fs.writeFileSync(path.join(sliceDir, "controller-resolution.json"), `${JSON.stringify(resolution, null, 2)}\n`);
NODE
run_v2_valid 'scope admission v2 contract passes' "$FIXTURE_ROOT/valid/scope-admission-v2.md"
grep -q 'current-required:finding-resolved' "$FIXTURE_ROOT/valid/scope-admission-v2.md"
pass 'scope admission v2 retains resolved current-required behavior in clean rewrites'
copied_authority="$TMP_ROOT/copied-authority-slice"
cp -R "$AUTHORITY_SLICE" "$copied_authority"
run_v2_authority_invalid \
  'v2 rejects self-consistent authority outside the canonical workflow artifact tree' \
  "$scope_v2" \
  AUTHORITY_SLICE_INVALID \
  "$copied_authority"
case_paths
set +e
"$BIN" --strict --file "$FIXTURE_ROOT/valid/scope-admission-v2.md" >"$CASE_STDOUT" 2>"$CASE_STDERR"
status=$?
set -e
[[ "$status" -eq 1 ]] || show_failure 'v2 strict lint requires canonical authority slices'
grep -q '^ERROR AUTHORITY_SLICE_REQUIRED ' "$CASE_STDERR" || show_failure 'v2 strict lint requires canonical authority slices'
pass 'v2 strict lint requires canonical authority slices'
fake_goal="$TMP_ROOT/v2-fake-goal.md"
sed 's/goal:REQ-1/goal:FAKE-GOAL/' "$scope_v2" > "$fake_goal"
run_v2_authority_invalid 'v2 rejects unknown goal authority' "$fake_goal" GOAL_AUTHORITY_UNKNOWN
fake_finding="$TMP_ROOT/v2-fake-finding.md"
sed 's/current-required:finding-resolved/current-required:fake-finding/g' "$scope_v2" > "$fake_finding"
run_v2_authority_invalid 'v2 rejects unknown current-required authority' "$fake_finding" CURRENT_REQUIRED_AUTHORITY_UNKNOWN
non_required_finding="$TMP_ROOT/v2-non-required-finding.md"
sed 's/current-required:finding-resolved/current-required:finding-follow-up/g' "$scope_v2" > "$non_required_finding"
run_v2_authority_invalid 'v2 rejects a known but non-current-required finding' "$non_required_finding" CURRENT_REQUIRED_AUTHORITY_UNKNOWN
foreign_task="$TMP_ROOT/v2-foreign-task.md"
sed 's/^task_id:.*/task_id: foreign-task/' "$scope_v2" > "$foreign_task"
run_v2_authority_invalid 'v2 rejects authority from another task' "$foreign_task" AUTHORITY_TASK_MISMATCH
cp "$AUTHORITY_SLICE/review-verdict.json" "$TMP_ROOT/review-verdict.backup.json"
node - "$AUTHORITY_SLICE/review-verdict.json" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const value = JSON.parse(fs.readFileSync(file, "utf8"));
value.strengths.push("Changed after controller resolution.");
fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
NODE
run_v2_authority_invalid 'v2 rejects stale verdict authority' "$scope_v2" AUTHORITY_SLICE_INVALID
mv "$TMP_ROOT/review-verdict.backup.json" "$AUTHORITY_SLICE/review-verdict.json"
run_v1_valid 'current authoritative implementation contract passes strict lint' "$CURRENT_AUTHORITY"
run_legacy_valid 'unversioned historical contract passes non-strict with warning' "$FIXTURE_ROOT/valid/legacy-unversioned.md"
run_semantic_invalid 'unversioned historical contract fails strict mode' "$FIXTURE_ROOT/valid/legacy-unversioned.md" SEMANTICS_VERSION_REQUIRED

run_semantic_invalid 'template enum placeholders are rejected' "$FIXTURE_ROOT/invalid/template-enums.md" WORK_TYPE_INVALID FIRST_CODE_GUARD_INVALID PRODUCT_UI_GATE_INVALID
run_semantic_invalid 'missing first-code owner verification stop and gate plan are rejected' "$FIXTURE_ROOT/invalid/missing-first-code-fields.md" \
  REQUIRED_FIELD_MISSING:first_code_owner \
  REQUIRED_FIELD_MISSING:first_code_verification \
  REQUIRED_FIELD_MISSING:stop_if_no_code_by_phase \
  REQUIRED_FIELD_MISSING:gate_parallelization_or_deferral_plan
run_semantic_invalid 'all seven required first-code detail fields are enforced' "$FIXTURE_ROOT/invalid/missing-all-first-code-fields.md" \
  REQUIRED_FIELD_MISSING:first_code_slice \
  REQUIRED_FIELD_MISSING:first_code_slice_kind \
  REQUIRED_FIELD_MISSING:first_code_owner \
  REQUIRED_FIELD_MISSING:first_code_verification \
  REQUIRED_FIELD_MISSING:allowed_contract_gate_only_until \
  REQUIRED_FIELD_MISSING:stop_if_no_code_by_phase \
  REQUIRED_FIELD_MISSING:gate_parallelization_or_deferral_plan
run_semantic_invalid 'docs-only first slice is rejected' "$FIXTURE_ROOT/invalid/docs-only-slice.md" FIRST_CODE_SLICE_NON_IMPLEMENTATION_ONLY
run_semantic_invalid 'fixture-only slice kind and unchanged behavior are rejected' "$FIXTURE_ROOT/invalid/fixture-only-kind.md" FIRST_CODE_SLICE_KIND_INVALID FIRST_CODE_SLICE_NON_IMPLEMENTATION_ONLY
run_semantic_invalid 'evidence-only slice kind and no behavior change are rejected' "$FIXTURE_ROOT/invalid/evidence-only-kind.md" FIRST_CODE_SLICE_KIND_INVALID FIRST_CODE_SLICE_NON_IMPLEMENTATION_ONLY
for variant in 'Add fixtures only.' 'Only add fixtures.' 'Add only fixtures.' '"Add fixtures only."' '仅新增夹具。' '只添加夹具。'; do
  variant_file="$TMP_ROOT/first-slice-$CASE_COUNT.md"
  sed "s/^- first_code_slice:.*/- first_code_slice: $variant/" \
    "$FIXTURE_ROOT/invalid/first-slice-only-fixtures.md" > "$variant_file"
  run_semantic_invalid "fixture-only first slice is rejected: $variant" "$variant_file" \
    FIRST_CODE_SLICE_NON_IMPLEMENTATION_ONLY:first_code_slice
done
for variant in \
  'Add regression scanner fixtures for existing behavior.' \
  'Create scanner fixtures around the current implementation.' \
  'Modify scanner fixtures to reflect new parser behavior.' \
  'Collect release evidence without changing runtime behavior.' \
  'Implement scanner fixtures for existing behavior.' \
  'Implement documentation for the current workflow.' \
  'Prepare regression scanner fixtures for existing behavior.' \
  'Build regression fixtures around current implementation.' \
  'Produce release evidence without modifying runtime behavior.' \
  'Add runtime tests for existing behavior.' \
  'Add API tests for the current implementation.' \
  'Implement parser tests for unchanged behavior.' \
  'Add runtime behavior tests for existing behavior.' \
  '实现扫描器夹具以覆盖现有行为。' \
  '准备现有行为的扫描器夹具。' \
  '添加运行时测试以覆盖现有行为。' \
  '新增接口测试验证当前实现。'; do
  variant_file="$TMP_ROOT/first-slice-expanded-$CASE_COUNT.md"
  sed "s/^- first_code_slice:.*/- first_code_slice: $variant/" \
    "$FIXTURE_ROOT/invalid/first-slice-regression-fixtures.md" > "$variant_file"
  run_semantic_invalid "expanded non-implementation first slice is rejected: $variant" "$variant_file" \
    FIRST_CODE_SLICE_NON_IMPLEMENTATION_ONLY:first_code_slice
done
run_semantic_invalid 'non-HTTP browser entrypoint is rejected' "$FIXTURE_ROOT/invalid/ui-non-http.md" BROWSER_ENTRYPOINT_INVALID
run_semantic_invalid 'credential-bearing browser entrypoint is rejected' "$FIXTURE_ROOT/invalid/ui-credential-url.md" BROWSER_ENTRYPOINT_INVALID
run_semantic_invalid 'browser navigation must target the declared entrypoint' "$FIXTURE_ROOT/invalid/ui-entrypoint-mismatch.md" SERVED_UI_NAVIGATION_MISSING
run_semantic_invalid 'natural-language navigation rejects an entrypoint URL prefix' "$FIXTURE_ROOT/invalid/ui-entrypoint-prefix.md" SERVED_UI_NAVIGATION_MISSING
natural_entrypoint="$TMP_ROOT/ui-natural-entrypoint.md"
sed "s|The browser opens http://127.0.0.1:4173/editor-malicious and validates the page.|The browser opens browser_entrypoint. Create, save, and reload a document.|" \
  "$FIXTURE_ROOT/invalid/ui-entrypoint-prefix.md" > "$natural_entrypoint"
run_v1_valid 'natural-language navigation accepts a terminated entrypoint identifier' "$natural_entrypoint"
natural_entrypoint_chinese="$TMP_ROOT/ui-natural-entrypoint-chinese.md"
sed "s|The browser opens http://127.0.0.1:4173/editor-malicious and validates the page.|浏览器打开 browser_entrypoint，并验证页面。|" \
  "$FIXTURE_ROOT/invalid/ui-entrypoint-prefix.md" > "$natural_entrypoint_chinese"
run_v1_valid 'natural-language navigation accepts Chinese continuation punctuation' "$natural_entrypoint_chinese"
natural_expression="$TMP_ROOT/ui-natural-entrypoint-expression.md"
sed "s|The browser opens http://127.0.0.1:4173/editor-malicious and validates the page.|The browser opens browser_entrypoint + '/other' and validates the page.|" \
  "$FIXTURE_ROOT/invalid/ui-entrypoint-prefix.md" > "$natural_expression"
run_semantic_invalid 'natural-language navigation rejects an entrypoint expression' "$natural_expression" SERVED_UI_NAVIGATION_MISSING
run_semantic_invalid 'page.goto rejects a transformed entrypoint expression' "$FIXTURE_ROOT/invalid/ui-entrypoint-transform.md" SERVED_UI_NAVIGATION_MISSING
for expression in "browser_entrypoint + '/other'" 'browser_entrypoint || otherUrl'; do
  transformed_file="$TMP_ROOT/ui-entrypoint-expression-$CASE_COUNT.md"
  sed "s@browser_entrypoint.replace('/editor', '/other')@$expression@" \
    "$FIXTURE_ROOT/invalid/ui-entrypoint-transform.md" > "$transformed_file"
  run_semantic_invalid "page.goto rejects non-scalar entrypoint expression: $expression" "$transformed_file" SERVED_UI_NAVIGATION_MISSING
done
run_semantic_invalid 'all seven required Product/UI detail fields are enforced' "$FIXTURE_ROOT/invalid/missing-all-product-ui-fields.md" \
  REQUIRED_FIELD_MISSING:first_operable_user_flow \
  REQUIRED_FIELD_MISSING:browser_entrypoint \
  REQUIRED_FIELD_MISSING:served_ui_validation_action \
  REQUIRED_FIELD_MISSING:ui_data_mode \
  REQUIRED_FIELD_MISSING:required_safety_gates \
  REQUIRED_FIELD_MISSING:allowed_headless_only_until \
  REQUIRED_FIELD_MISSING:stop_if_no_ui_by_phase
run_semantic_invalid 'page.setContent and synthetic HTML are rejected' "$FIXTURE_ROOT/invalid/ui-set-content.md" SYNTHETIC_UI_SET_CONTENT SYNTHETIC_UI_HTML SERVED_UI_NAVIGATION_MISSING
run_semantic_invalid 'page.setContent method indirection is rejected' "$FIXTURE_ROOT/invalid/ui-set-content-reference.md" SYNTHETIC_UI_SET_CONTENT
setcontent_comment="$TMP_ROOT/ui-set-content-comment.md"
sed 's|page\.setContent\.call(page, html)|page.setContent /\* synthetic \*/ (html)|' \
  "$FIXTURE_ROOT/invalid/ui-set-content-reference.md" > "$setcontent_comment"
run_semantic_invalid 'page.setContent with an intervening comment is rejected' "$setcontent_comment" SYNTHETIC_UI_SET_CONTENT
run_semantic_invalid 'direct DOM and inline application asset injection are rejected' "$FIXTURE_ROOT/invalid/ui-dom-asset-injection.md" SYNTHETIC_UI_DOM_INJECTION SYNTHETIC_UI_ASSET_INJECTION
run_semantic_invalid 'file URL UI action is rejected' "$FIXTURE_ROOT/invalid/ui-file-action.md" SYNTHETIC_UI_FILE_URL
run_semantic_invalid 'data URL UI action is rejected' "$FIXTURE_ROOT/invalid/ui-data-action.md" SYNTHETIC_UI_DATA_URL
run_semantic_invalid 'fulfilled main document and app bundle are rejected' "$FIXTURE_ROOT/invalid/ui-fulfilled-document.md" SYNTHETIC_UI_MAIN_DOCUMENT_FULFILL SYNTHETIC_UI_APP_BUNDLE_FULFILL
run_semantic_invalid 'fulfilling the declared entrypoint with raw HTML is rejected' "$FIXTURE_ROOT/invalid/ui-fulfilled-entrypoint.md" SYNTHETIC_UI_MAIN_DOCUMENT_FULFILL
for route_target in \
  "browser_entrypoint + '?synthetic=1'" \
  'new RegExp(browser_entrypoint)' \
  "'**/editor'" \
  "'**/editor?synthetic=1'" \
  "'http://127.0.0.1:4173/editor?synthetic=1'"; do
  route_file="$TMP_ROOT/ui-fulfilled-derived-route-$CASE_COUNT.md"
  sed "s|page.route(browser_entrypoint,|page.route($route_target,|" \
    "$FIXTURE_ROOT/invalid/ui-fulfilled-entrypoint.md" > "$route_file"
  run_semantic_invalid "fulfilling an entrypoint-derived route is rejected: $route_target" "$route_file" SYNTHETIC_UI_MAIN_DOCUMENT_FULFILL
done
run_semantic_invalid 'fulfilled HTML MIME is rejected despite a backend label' "$FIXTURE_ROOT/invalid/ui-fulfilled-mime.md" SYNTHETIC_UI_MAIN_DOCUMENT_FULFILL
for mime in application/javascript text/css; do
  mime_file="$TMP_ROOT/ui-fulfilled-mime-$CASE_COUNT.md"
  sed "s|text/html|$mime|" "$FIXTURE_ROOT/invalid/ui-fulfilled-mime.md" > "$mime_file"
  run_semantic_invalid "fulfilled application asset MIME is rejected: $mime" "$mime_file" SYNTHETIC_UI_APP_BUNDLE_FULFILL
done
app_bundle_body="$TMP_ROOT/ui-fulfilled-app-bundle-body.md"
sed "s|headers: {'content-type': 'text/html'}, body: rawDocument|body: appBundle|" \
  "$FIXTURE_ROOT/invalid/ui-fulfilled-mime.md" > "$app_bundle_body"
run_semantic_invalid 'fulfilled appBundle body is rejected despite a backend label' "$app_bundle_body" SYNTHETIC_UI_APP_BUNDLE_FULFILL
run_semantic_invalid 'fulfilling a vendor JavaScript asset is rejected' "$FIXTURE_ROOT/invalid/ui-fulfilled-vendor-asset.md" SYNTHETIC_UI_APP_BUNDLE_FULFILL
for asset in '/assets/chunk.3fa92c.js' '/assets/theme.css' '/assets/vendor.mjs' '/assets/vendor.cjs'; do
  asset_file="$TMP_ROOT/ui-fulfilled-asset-$CASE_COUNT.md"
  sed "s|/assets/vendor.js|$asset|" "$FIXTURE_ROOT/invalid/ui-fulfilled-vendor-asset.md" > "$asset_file"
  run_semantic_invalid "fulfilling an application asset is rejected: $asset" "$asset_file" SYNTHETIC_UI_APP_BUNDLE_FULFILL
done
run_semantic_invalid 'forbidden document and bundle targets remain linked after a comma' "$FIXTURE_ROOT/invalid/ui-fulfilled-after-comma.md" SYNTHETIC_UI_MAIN_DOCUMENT_FULFILL SYNTHETIC_UI_APP_BUNDLE_FULFILL
run_semantic_invalid 'broad negation prefixes cannot hide positive document or bundle fulfillment' "$FIXTURE_ROOT/invalid/ui-fulfill-negation-prefix.md" SYNTHETIC_UI_MAIN_DOCUMENT_FULFILL SYNTHETIC_UI_APP_BUNDLE_FULFILL
run_semantic_invalid 'ambiguous route fulfillment fails closed' "$FIXTURE_ROOT/invalid/ui-ambiguous-fulfill.md" UI_FULFILL_TARGET_UNPROVEN
backend_glob="$TMP_ROOT/ui-backend-glob.md"
sed "s|'/api/\*\*'|'**/api/**'|" "$FIXTURE_ROOT/valid/required-ui.md" > "$backend_glob"
run_v1_valid 'an explicitly API-scoped glob may fulfill backend responses' "$backend_glob"
narrow_backend_route="$TMP_ROOT/ui-narrow-backend-route.md"
sed "s|'/api/\*\*'|'/v1/users'|" "$FIXTURE_ROOT/valid/required-ui.md" > "$narrow_backend_route"
run_v1_valid 'backend prose may qualify a narrow literal route' "$narrow_backend_route"
backend_regex="$TMP_ROOT/ui-backend-regex.md"
sed "s|'/api/\*\*'|/\\\\/api\\\\//|" "$FIXTURE_ROOT/valid/required-ui.md" > "$backend_regex"
run_semantic_invalid 'fulfilled RegExp routes fail closed even when API-scoped' "$backend_regex" UI_FULFILL_TARGET_UNPROVEN
for matcher in \
  "'**/*'" "'**'" "'*'" \
  '/.*/' '/.+/' '/^https?:\/\/.*$/' \
  '/editor/' '/\/editor$/' \
  '/^http:\/\/127\.0\.0\.1:4173\/editor$/' \
  '/^http:\/\/127\.0\.0\.1:4173\/.*$/' \
  '/(?:editor|api)/' '/editor|api/' '/(?:api)?editor/' \
  '/(?:api|\/editor$)/' '/(?:graphql|editor)/' \
  '/(?:backend|editor)/' '/(?:data-plane|editor)/' \
  '(/editor|api/)' "new RegExp('editor|api')" "RegExp('editor|api')" \
  '`/api/${path}`' \
  '() => true'; do
  catch_all_file="$TMP_ROOT/ui-catch-all-route-$CASE_COUNT.md"
  sed "s@page.route('/api/\*\*'@For the backend API, page.route($matcher@" \
    "$FIXTURE_ROOT/valid/required-ui.md" > "$catch_all_file"
  run_semantic_invalid "backend prose cannot justify a catch-all fulfilled route: $matcher" "$catch_all_file" UI_FULFILL_TARGET_UNPROVEN
done
for matcher in \
  "'http://**'" \
  "'**://**'" \
  "'http://127.0.0.1:4173/**'" \
  "'http://127.0.0.1:4173/*'" \
  "'**/editor*'" \
  "'**/{editor,api}'" \
  "'http://127.0.0.1:4173/{editor,api}'" \
  "'**/{foo,editor}'" \
  "'**/{api,editor}*'"; do
  entrypoint_glob_file="$TMP_ROOT/ui-entrypoint-glob-$CASE_COUNT.md"
  sed "s|page.route('/api/\*\*'|For the backend API, page.route($matcher|" \
    "$FIXTURE_ROOT/valid/required-ui.md" > "$entrypoint_glob_file"
  run_semantic_invalid "a glob covering the declared entrypoint is rejected: $matcher" "$entrypoint_glob_file" SYNTHETIC_UI_MAIN_DOCUMENT_FULFILL
done
for route_actor in context browserContext; do
  alternate_actor="$TMP_ROOT/ui-alternate-route-actor-$CASE_COUNT.md"
  sed "s/page.route(browser_entrypoint/$route_actor.route(browser_entrypoint/" \
    "$FIXTURE_ROOT/invalid/ui-fulfilled-entrypoint.md" > "$alternate_actor"
  run_semantic_invalid "fulfilling the entrypoint through $route_actor.route is rejected" "$alternate_actor" SYNTHETIC_UI_MAIN_DOCUMENT_FULFILL
done
direct_fulfill="$TMP_ROOT/ui-direct-entrypoint-fulfill.md"
sed "s|^- served_ui_validation_action:.*|- served_ui_validation_action: backend API route.fulfill browser_entrypoint with body fixtureDocument; page.goto(entrypoint).|" \
  "$FIXTURE_ROOT/invalid/ui-fulfilled-entrypoint.md" > "$direct_fulfill"
run_semantic_invalid 'directly fulfilling browser_entrypoint is rejected despite a backend label' "$direct_fulfill" SYNTHETIC_UI_MAIN_DOCUMENT_FULFILL
direct_fulfill_call="$TMP_ROOT/ui-direct-entrypoint-fulfill-call.md"
sed "s|^- served_ui_validation_action:.*|- served_ui_validation_action: backend API route.fulfill(browser_entrypoint); page.goto(entrypoint).|" \
  "$FIXTURE_ROOT/invalid/ui-fulfilled-entrypoint.md" > "$direct_fulfill_call"
run_semantic_invalid 'directly calling fulfill on browser_entrypoint is rejected' "$direct_fulfill_call" SYNTHETIC_UI_MAIN_DOCUMENT_FULFILL
run_semantic_invalid 'negated backend and API labels cannot justify route fulfillment' "$FIXTURE_ROOT/invalid/ui-ambiguous-fulfill-negated-label.md" UI_FULFILL_TARGET_UNPROVEN
backend_not_involved="$TMP_ROOT/ui-backend-not-involved.md"
sed 's/route.fulfill a local fixture, never a backend or API response/backend is not involved, then route.fulfill a local fixture/' \
  "$FIXTURE_ROOT/invalid/ui-ambiguous-fulfill-negated-label.md" > "$backend_not_involved"
run_semantic_invalid 'a backend-is-not-involved clause cannot justify route fulfillment' "$backend_not_involved" UI_FULFILL_TARGET_UNPROVEN
run_semantic_invalid 'build-only UI action is rejected' "$FIXTURE_ROOT/invalid/ui-no-navigation.md" SERVED_UI_NAVIGATION_MISSING
run_semantic_invalid 'relative UI navigation without a served target is rejected' "$FIXTURE_ROOT/invalid/ui-relative-navigation.md" SERVED_UI_NAVIGATION_MISSING
run_semantic_invalid 'a later page.goto option cannot mask a relative first argument' "$FIXTURE_ROOT/invalid/ui-goto-argument-mask.md" SERVED_UI_NAVIGATION_MISSING
goto_comment="$TMP_ROOT/ui-goto-comment-mask.md"
sed "s|page.goto('/generated.html', {referer: browser_entrypoint})|page.goto(/\* browser_entrypoint \*/ '/generated.html')|" \
  "$FIXTURE_ROOT/invalid/ui-goto-argument-mask.md" > "$goto_comment"
run_semantic_invalid 'a page.goto comment cannot mask a relative first argument' "$goto_comment" SERVED_UI_NAVIGATION_MISSING
run_semantic_invalid 'curl output cannot masquerade as browser navigation' "$FIXTURE_ROOT/invalid/ui-curl-only.md" SERVED_UI_NAVIGATION_MISSING
run_semantic_invalid 'browser and Playwright nouns cannot make curl into navigation' "$FIXTURE_ROOT/invalid/ui-curl-browser-words.md" SERVED_UI_NAVIGATION_MISSING
run_semantic_invalid 'assigning page.goto is not a browser navigation call' "$FIXTURE_ROOT/invalid/ui-goto-assignment.md" SERVED_UI_NAVIGATION_MISSING
run_semantic_invalid 'negated browser navigation cannot prove served acceptance' "$FIXTURE_ROOT/invalid/ui-negated-navigation.md" SERVED_UI_NAVIGATION_MISSING
run_semantic_invalid 'not-applicable gates require substantive reasons' "$FIXTURE_ROOT/invalid/missing-reasons.md" \
  NOT_APPLICABLE_REASON_REQUIRED:first_code_not_applicable_reason \
  NOT_APPLICABLE_REASON_REQUIRED:product_ui_not_applicable_reason
run_semantic_invalid 'quoted not-applicable tokens cannot masquerade as reasons' "$FIXTURE_ROOT/invalid/quoted-reasons.md" \
  NOT_APPLICABLE_REASON_REQUIRED:first_code_not_applicable_reason \
  NOT_APPLICABLE_REASON_REQUIRED:product_ui_not_applicable_reason
run_semantic_invalid 'non-implementation work cannot require implementation or UI gates' "$FIXTURE_ROOT/invalid/work-type-conflict.md" FIRST_CODE_GUARD_WORK_TYPE_CONFLICT PRODUCT_UI_GATE_WORK_TYPE_CONFLICT
run_semantic_invalid 'versioned implementation cannot bypass first-code guard' "$FIXTURE_ROOT/invalid/implementation-first-not-applicable.md" FIRST_CODE_GUARD_WORK_TYPE_CONFLICT
run_semantic_invalid 'required gates reject not-applicable reasons' "$FIXTURE_ROOT/invalid/required-reason-conflict.md" \
  REASON_CONFLICTS_WITH_REQUIRED_GATE:first_code_not_applicable_reason \
  REASON_CONFLICTS_WITH_REQUIRED_GATE:product_ui_not_applicable_reason
run_semantic_invalid 'duplicate machine fields are rejected' "$FIXTURE_ROOT/invalid/duplicate-field.md" FIELD_DUPLICATE
run_semantic_invalid 'versioned envelope fields must stay top-level' "$FIXTURE_ROOT/invalid/envelope-in-section.md" FIELD_LOCATION_INVALID
run_semantic_invalid 'detail fields cannot move into an arbitrary appendix' "$FIXTURE_ROOT/invalid/detail-in-appendix.md" FIELD_LOCATION_INVALID
run_semantic_invalid 'a new H1 closes the first-code machine section' "$FIXTURE_ROOT/invalid/detail-after-h1.md" FIELD_LOCATION_INVALID:first_code_owner
run_semantic_invalid 'an H3 section closes the versioned envelope' "$FIXTURE_ROOT/invalid/envelope-after-h3.md" FIELD_LOCATION_INVALID:contract_semantics_version
run_semantic_invalid 'a Setext H2 closes the versioned envelope' "$FIXTURE_ROOT/invalid/envelope-after-setext-h2.md" FIELD_LOCATION_INVALID:contract_semantics_version
run_semantic_invalid 'a second H1 closes the versioned envelope' "$FIXTURE_ROOT/invalid/envelope-after-second-h1.md" FIELD_LOCATION_INVALID:contract_semantics_version
run_semantic_invalid 'an empty H2 closes the versioned envelope' "$FIXTURE_ROOT/invalid/envelope-after-empty-h2.md" FIELD_LOCATION_INVALID:contract_semantics_version
run_semantic_invalid 'prefixed TODO placeholder is rejected' "$FIXTURE_ROOT/invalid/placeholder-prefix.md" REQUIRED_FIELD_PLACEHOLDER:first_code_owner
run_semantic_invalid 'empty template placeholder is rejected' "$FIXTURE_ROOT/invalid/placeholder-empty-braces.md" REQUIRED_FIELD_PLACEHOLDER:first_code_owner
run_semantic_invalid 'empty and punctuation-only required scalars are rejected' "$FIXTURE_ROOT/invalid/placeholder-empty-scalars.md" \
  REQUIRED_FIELD_PLACEHOLDER:first_code_owner \
  REQUIRED_FIELD_PLACEHOLDER:first_code_verification \
  REQUIRED_FIELD_PLACEHOLDER:required_safety_gates
run_semantic_invalid 'unknown semantics version is rejected in strict mode' "$FIXTURE_ROOT/invalid/unsupported-version.md" SEMANTICS_VERSION_UNSUPPORTED
run_nonstrict_invalid 'unknown semantics version cannot fall back to legacy mode' "$FIXTURE_ROOT/invalid/unsupported-version.md" SEMANTICS_VERSION_UNSUPPORTED

scope_v2="$FIXTURE_ROOT/valid/scope-admission-v2.md"
missing_scope_policy="$TMP_ROOT/v2-missing-scope-policy.md"
sed '/^finding_scope_admission:/d' "$scope_v2" > "$missing_scope_policy"
run_semantic_invalid 'v2 requires finding scope admission policy' "$missing_scope_policy" REQUIRED_FIELD_MISSING:finding_scope_admission
bad_scope_policy="$TMP_ROOT/v2-bad-scope-policy.md"
sed 's/^finding_scope_admission:.*/finding_scope_admission: reviewer_severity/' "$scope_v2" > "$bad_scope_policy"
run_semantic_invalid 'v2 rejects reviewer-owned scope admission' "$bad_scope_policy" FINDING_SCOPE_ADMISSION_INVALID:finding_scope_admission
missing_provenance="$TMP_ROOT/v2-missing-provenance.md"
sed '/^## Finding Provenance$/,$d' "$scope_v2" > "$missing_provenance"
run_semantic_invalid 'v2 requires visible finding provenance section' "$missing_provenance" FINDING_PROVENANCE_MISSING
bad_acceptance_authority="$TMP_ROOT/v2-bad-acceptance-authority.md"
sed 's/| AC-1 | Preserve the current authorized goal\. | yes | structural lint | goal:REQ-1 |/| AC-1 | Preserve the current authorized goal. | yes | structural lint | optional |/' "$scope_v2" > "$bad_acceptance_authority"
run_semantic_invalid 'v2 required acceptance needs goal or current-required authority' "$bad_acceptance_authority" REQUIRED_ROW_AUTHORITY_INVALID
bad_edge_admission="$TMP_ROOT/v2-bad-edge-admission.md"
sed 's/| Optional review suggestion | Keep it out of executable scope\. | no | optional |/| Required failure mode | Handle it. | yes | optional |/' "$scope_v2" > "$bad_edge_admission"
run_semantic_invalid 'v2 required edge case needs goal or current-required admission' "$bad_edge_admission" REQUIRED_ROW_AUTHORITY_INVALID
bad_fallback="$TMP_ROOT/v2-bad-fallback.md"
sed 's/^- Required safe fallback: not_applicable/- Required safe fallback: retry forever/' "$scope_v2" > "$bad_fallback"
run_semantic_invalid 'v2 none fallback authority forbids required fallback behavior' "$bad_fallback" SAFE_FALLBACK_AUTHORITY_CONFLICT
run_semantic_invalid 'UI acceptance rejects a sentence that declares no safety gates' "$FIXTURE_ROOT/invalid/ui-safety-none.md" REQUIRED_SAFETY_GATES_INVALID:required_safety_gates
run_semantic_invalid 'UI acceptance rejects a direct not-required safety declaration' "$FIXTURE_ROOT/invalid/ui-safety-cancelled.md" REQUIRED_SAFETY_GATES_INVALID:required_safety_gates
safety_subject_cancelled="$TMP_ROOT/ui-safety-subject-cancelled.md"
sed 's/required_safety_gates: not required for this task/required_safety_gates: safety gates are not required for this task/' \
  "$FIXTURE_ROOT/invalid/ui-safety-cancelled.md" > "$safety_subject_cancelled"
run_semantic_invalid 'UI acceptance rejects a subject-first not-required safety declaration' "$safety_subject_cancelled" REQUIRED_SAFETY_GATES_INVALID:required_safety_gates
run_semantic_invalid 'UI acceptance rejects a no-security-gates-required declaration' "$FIXTURE_ROOT/invalid/ui-safety-security-none.md" REQUIRED_SAFETY_GATES_INVALID:required_safety_gates
for cancelled_safety in \
  'security gates are not required for this task' \
  'safety gates are not needed for this task' \
  'there are no security gates required for this task' \
  'we require no safety gates for this task' \
  'security gates: none' \
  'all safety gates are optional' \
  'safety checks can be skipped' \
  'security controls may be omitted' \
  'all safety gates can be bypassed' \
  'we do not require any safety gates' \
  '无需安全门禁。'; do
  cancelled_file="$TMP_ROOT/ui-safety-cancellation-$CASE_COUNT.md"
  sed "s/^- required_safety_gates:.*/- required_safety_gates: $cancelled_safety/" \
    "$FIXTURE_ROOT/invalid/ui-safety-security-none.md" > "$cancelled_file"
  run_semantic_invalid "UI acceptance rejects cancellation wording: $cancelled_safety" "$cancelled_file" REQUIRED_SAFETY_GATES_INVALID:required_safety_gates
done
for retained_safety in \
  'No security checks are skipped; browser network and credential gates remain required.' \
  'Safety gates must not be bypassed; browser network and credential gates remain required.'; do
  retained_file="$TMP_ROOT/ui-safety-retained-$CASE_COUNT.md"
  sed "s/^- required_safety_gates:.*/- required_safety_gates: $retained_safety/" \
    "$FIXTURE_ROOT/valid/negative-ui-guards.md" > "$retained_file"
  run_v1_valid "negative wording preserves required safety gates: $retained_safety" "$retained_file"
done
run_semantic_invalid 'quoted not-applicable UI safety gate is rejected' "$FIXTURE_ROOT/invalid/quoted-ui-safety.md" REQUIRED_FIELD_PLACEHOLDER:required_safety_gates

run_semantic_invalid 'unresolved draft template is rejected by strict lint' "$ATLAS_FORGE_ROOT/workflow/templates/implementation-contract.md" WORK_TYPE_INVALID FIRST_CODE_GUARD_INVALID PRODUCT_UI_GATE_INVALID

bom_crlf="$TMP_ROOT/bom-crlf.md"
{
  printf '\357\273\277'
  sed 's/$/\r/' "$FIXTURE_ROOT/valid/not-applicable-docs.md"
} > "$bom_crlf"
run_v1_valid 'UTF-8 BOM and CRLF input are accepted' "$bom_crlf"

invalid_utf8="$TMP_ROOT/invalid-utf8.md"
printf '\377\n' > "$invalid_utf8"
run_usage_invalid 'invalid UTF-8 is an input error' INPUT_INVALID --strict --file "$invalid_utf8"
run_usage_invalid 'missing file is an input error' INPUT_INVALID --strict --file "$TMP_ROOT/missing.md"
run_usage_invalid 'missing --file is a usage error' CLI_USAGE --strict
run_usage_invalid 'missing --file value before another option is a usage error' CLI_USAGE --file --strict
run_usage_invalid 'short option cannot be consumed as a --file value' CLI_USAGE --file -h
run_usage_invalid 'unknown option is a usage error' CLI_USAGE --wat
run_usage_invalid 'duplicate --file is a usage error' CLI_USAGE --file "$CURRENT_AUTHORITY" --file "$CURRENT_AUTHORITY"

for template in implementation-contract.md implementation-contract.final.md; do
  file="$ATLAS_FORGE_ROOT/workflow/templates/$template"
  grep -q '^contract_semantics_version: 2$' "$file"
  grep -q '^finding_scope_admission: controller_current_required_only$' "$file"
  grep -q '^safe_fallback_authority: none | goal:<requirement-ref> | current-required:<finding_id>$' "$file"
  grep -q '^work_type: implementation | planning | review | audit | docs-only$' "$file"
  grep -q '^first_code_not_applicable_reason:$' "$file"
  grep -q '^product_ui_not_applicable_reason:$' "$file"
  grep -q 'first_code_slice_kind: product | runtime | api | cli | workflow | scanner_behavior' "$file"
  grep -q 'Versioned stop: semantics version 1 requires `stop_if_no_code_by_phase`' "$file"
  ! grep -q 'Default stop:' "$file"
  ! grep -q '^- First-code guard:' "$file"
  ! grep -q '^- Product/UI gate:' "$file"
  grep -q '^## Edge Cases$' "$file"
  grep -q '^| Case | Expected behavior | Required | Admission |$' "$file"
  grep -q '^|  |  | no | optional |$' "$file"
  grep -q '^- Required safe fallback: not_applicable$' "$file"
  grep -q '^- Optional fallback notes:$' "$file"
  grep -q '^## Finding Provenance$' "$file"
done
grep -q 'Versioned implementation contract strict lint passed' "$ATLAS_FORGE_ROOT/workflow/templates/gate-checklist.md"
grep -q 'ATLAS_WORKFLOW_PLUGIN_ROOT/scripts/codex-implementation-contract-lint' "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/skills/clarify/SKILL.md"
grep -q -- '--authority-slice <canonical-sdd-slice-dir>' "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/skills/clarify/SKILL.md"
grep -q 'two directories above the containing skill directory' "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/skills/clarify/SKILL.md"
grep -q 'implementation-contract.final.md.*clean rewrite of the final agreed requirements' "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/skills/clarify/SKILL.md"
grep -q 'do not append old contract text, rejected requirements, or review notes' "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/skills/clarify/SKILL.md"
grep -q 'every validated controller finding with `disposition: current-required` remains an executable requirement' "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/skills/clarify/SKILL.md"
grep -q 'every validated controller resolution with `disposition: current-required` remains part of the current delivery' "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/skills/team/SKILL.md"
grep -q 'validated controller resolution is the sole finding-scope authority' "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/skills/team/references/sdd.md"
grep -q 'repeated `--authority-slice`' "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/skills/team/references/sdd.md"
grep -q 'strict lint can validate attribution without interpreting natural language' "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/skills/clarify/SKILL.md"
grep -q 'every validated controller finding with `disposition: current-required` remains projected into executable requirements' "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/skills/team-v1/SKILL.md"
pass 'templates and authoring skills adopt required-only scope admission and strict semantic lint'

resolved_plugin_root="$(cd "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/skills/task/../.." && pwd)"
(cd "$TMP_ROOT" && node "$resolved_plugin_root/scripts/codex-implementation-contract-lint" \
  --strict --file "$CURRENT_AUTHORITY" >"$TMP_ROOT/non-repo-cwd.stdout" 2>"$TMP_ROOT/non-repo-cwd.stderr")
grep -q '^implementation_contract_lint: true$' "$TMP_ROOT/non-repo-cwd.stdout"
[[ ! -s "$TMP_ROOT/non-repo-cwd.stderr" ]] || show_failure 'installed plugin root command emitted diagnostics'
pass 'plugin-root-resolved lint runs outside the Atlas Forge checkout cwd'

authority_before="$(sha256sum "$CURRENT_AUTHORITY")"
"$BIN" --strict --file "$CURRENT_AUTHORITY" >"$TMP_ROOT/read-only.stdout" 2>"$TMP_ROOT/read-only.stderr"
authority_after="$(sha256sum "$CURRENT_AUTHORITY")"
[[ "$authority_before" == "$authority_after" ]] || show_failure 'lint mutates the input contract'
[[ ! -s "$TMP_ROOT/read-only.stderr" ]] || show_failure 'read-only lint emitted diagnostics'
pass 'strict lint leaves the input contract byte-for-byte unchanged'

printf '1..%s\n' "$PASS_COUNT"
