#!/usr/bin/env bash
set -euo pipefail

ATLAS_FORGE_ROOT="${ATLAS_FORGE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
BIN="$ATLAS_FORGE_ROOT/workflow/bin/codex-web-acceptance"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/atlas-web-audit.XXXXXX")"

cleanup() {
  rm -rf -- "$TMP_ROOT"
}
trap cleanup EXIT

expect_exit() {
  local expected="$1"
  shift
  local actual
  set +e
  "$@" >"$TMP_ROOT/command.out" 2>"$TMP_ROOT/command.err"
  actual=$?
  set -e
  [[ "$actual" == "$expected" ]] || {
    printf 'expected exit %s, got %s: %s\n' "$expected" "$actual" "$*" >&2
    return 1
  }
}

node --check "$BIN"
node --check "$ATLAS_FORGE_ROOT/workflow/bin/lib/codex-web-acceptance/audit.js"
test -x "$BIN"

project="$TMP_ROOT/project"
mkdir -p "$project/e2e"
cat > "$project/playwright.config.ts" <<'EOF'
export default {
  retries: process.env.CI ? 2 : 0,
  use: { trace: 'on-first-retry' },
};
EOF
cat > "$project/e2e/risky.spec.ts" <<'EOF'
test('risks', async ({ page, request }) => {
  await request.post(
    '/api/auth/login',
    { data: credentials },
  );
  await page.context().addCookies([]);
  await page.locator(
    '.table > tbody tr',
  ).nth(0).click({ force: true });
  await expect(page.locator(
    '[data-ui="page-body"] h1',
  )).toBeVisible();
  await page.getByText(
    'Publish',
  ).click();
  await page.waitForTimeout(500);
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
});
EOF

expect_exit 2 "$BIN" audit --project "$project" --playwright-config playwright.config.ts --format json
cp "$TMP_ROOT/command.out" "$TMP_ROOT/risky-first.json"
node - "$TMP_ROOT/command.out" <<'NODE'
const fs = require('fs');
const value = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (value.schema_version !== 1 || value.tool !== 'codex-web-acceptance' || value.command !== 'audit' || value.ok) process.exit(1);
const ids = new Set(value.findings.map((finding) => finding.rule_id));
for (const id of ['AUTH_API_LOGIN', 'AUTH_COOKIE_INJECTION', 'LOCATOR_NTH', 'LOCATOR_DEEP_CSS', 'LOCATOR_FUZZY_TEXT', 'ACTION_FORCE', 'WAIT_FIXED_TIMEOUT', 'ROUTE_MOCK', 'ASSERTION_WEAK_POSTCONDITION', 'CONFIG_RETRY_RISK', 'CONFIG_TRACE_RETRY_ONLY']) {
  if (!ids.has(id)) throw new Error(`missing rule ${id}`);
}
const attributeSelector = value.findings.find((finding) => finding.rule_id === 'LOCATOR_DEEP_CSS' && finding.line === 10);
if (!attributeSelector) throw new Error('multiline attribute-selector deep CSS was not reported at its call site');
if (!value.findings.every((finding, index, all) => {
  if (index === 0) return true;
  const previous = all[index - 1];
  return finding.path > previous.path || (finding.path === previous.path &&
    (finding.line > previous.line || (finding.line === previous.line &&
    (finding.column > previous.column || (finding.column === previous.column && finding.rule_id >= previous.rule_id)))));
})) throw new Error('findings are not stable-sorted');
NODE
[[ "$(wc -l < "$TMP_ROOT/command.out")" == 1 ]]
grep -Fq 'Atlas Web UI 静态审计' "$TMP_ROOT/command.err"

expect_exit 2 "$BIN" audit --project "$project" --playwright-config playwright.config.ts --format json
cmp -s "$TMP_ROOT/risky-first.json" "$TMP_ROOT/command.out"

cat > "$project/waivers.json" <<'EOF'
{
  "schema_version": 1,
  "waivers": [
    { "rule_id": "LOCATOR_FUZZY_TEXT", "path": "e2e/risky.spec.ts", "reason": "文案在此隔离 fixture 中唯一" }
  ]
}
EOF
expect_exit 2 "$BIN" audit --project "$project" --playwright-config playwright.config.ts --waiver-file waivers.json --format json
node - "$TMP_ROOT/command.out" <<'NODE'
const fs = require('fs');
const value = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const waiver = value.findings.find((finding) => finding.rule_id === 'LOCATOR_FUZZY_TEXT');
if (!waiver || waiver.category !== 'approved_waiver' || !waiver.waiver_reason) process.exit(1);
NODE

fuzzy="$TMP_ROOT/fuzzy"
mkdir -p "$fuzzy/e2e"
printf '%s\n' 'export default { retries: 0 };' > "$fuzzy/playwright.config.ts"
printf '%s\n' "test('fuzzy', async ({ page }) => { await expect(page.getByText('Status')).toBeVisible(); });" > "$fuzzy/e2e/fuzzy.spec.ts"
expect_exit 2 "$BIN" audit --project "$fuzzy" --playwright-config playwright.config.ts --format json
cat > "$fuzzy/waivers.json" <<'EOF'
{"schema_version":1,"waivers":[{"rule_id":"LOCATOR_FUZZY_TEXT","path":"e2e/fuzzy.spec.ts","reason":"隔离 fixture 中的唯一稳定文案"}]}
EOF
expect_exit 0 "$BIN" audit --project "$fuzzy" --playwright-config playwright.config.ts --waiver-file waivers.json --format json
node - "$TMP_ROOT/command.out" <<'NODE'
const fs = require('fs');
const value = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!value.ok || value.summary.blocking !== 0 || value.summary.approved_waiver !== 1) process.exit(1);
NODE

clean="$TMP_ROOT/clean"
mkdir -p "$clean/specs"
printf '%s\n' 'export default { retries: 0 };' > "$clean/playwright.config.ts"
cat > "$clean/specs/clean.spec.ts" <<'EOF'
test('clean', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
EOF
expect_exit 0 "$BIN" audit --project "$clean" --playwright-config playwright.config.ts --source-root specs --format human
grep -Fq '阻断: 0，警告: 0，已批准豁免: 0' "$TMP_ROOT/command.out"
[[ ! -s "$TMP_ROOT/command.err" ]]

warning="$TMP_ROOT/warning"
mkdir -p "$warning/e2e"
printf '%s\n' 'export default { retries: 0 };' > "$warning/playwright.config.ts"
printf '%s\n' "test('warning', async ({ page }) => { await page.getByRole('button', { name: 'Open' }).click(); });" > "$warning/e2e/warning.spec.ts"
expect_exit 0 "$BIN" audit --project "$warning" --playwright-config playwright.config.ts --format json
node - "$TMP_ROOT/command.out" <<'NODE'
const fs = require('fs');
const value = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!value.ok || value.summary.blocking !== 0 || value.summary.warning !== 1) process.exit(1);
NODE

expect_exit 1 "$BIN" audit --project "$clean" --format json
grep -Fq '缺少必需选项: --playwright-config' "$TMP_ROOT/command.err"
expect_exit 1 "$BIN" audit --project "$clean" --playwright-config ../escape.ts --format json
grep -Fq 'Playwright 配置必须位于项目目录内' "$TMP_ROOT/command.err"
printf '%s\n' '{"schema_version":1,"waivers":[{"rule_id":"UNKNOWN","path":"*","reason":"no"}]}' > "$clean/bad-waivers.json"
expect_exit 1 "$BIN" audit --project "$clean" --playwright-config playwright.config.ts --source-root specs --waiver-file bad-waivers.json --format json
grep -Fq '未知 rule_id' "$TMP_ROOT/command.err"

forbidden_pattern="sharp[ -]?cell|workorder|devicetask|beezer|1366x768|127\\.0\\.0\\.1:5174|desktop chrome|chromium|planner|systemadmin|operator|plc_report_only|[\\\"']/login[\\\"']"
if rg -n -i "$forbidden_pattern" "$BIN" "$ATLAS_FORGE_ROOT/workflow/bin/lib/codex-web-acceptance"; then
  printf 'Core contains a project-specific value\n' >&2
  exit 1
fi
cat > "$TMP_ROOT/forbidden-sentinel.js" <<'EOF'
const projectName = "Sharp Cell";
const domainObjects = ["WorkOrder", "DeviceTask", "Beezer", "plc_report_only"];
const viewport = "1366x768";
const entrypoint = "http://127.0.0.1:5174/login";
const browser = "Desktop Chrome";
const roles = ["planner", "systemadmin", "operator"];
EOF
[[ "$(rg -o -i "$forbidden_pattern" "$TMP_ROOT/forbidden-sentinel.js" | wc -l)" -ge 10 ]] || {
  printf 'Core forbidden-value guard did not reject its positive fixture\n' >&2
  exit 1
}

printf 'web acceptance audit contract passed\n'
