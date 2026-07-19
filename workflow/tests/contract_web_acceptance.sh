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

# Phase 2: strict argv JSON protocol, immutable run/evidence closure, and retry semantics.
protocol="$TMP_ROOT/protocol"
mkdir -p "$protocol"
printf '%s\n' 'authoritative contract fixture' > "$protocol/contract.md"
cat > "$protocol/adapter.js" <<'NODE'
const crypto = require('crypto');
const fs = require('fs');
let input = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', c => input += c); process.stdin.on('end', () => {
  const value = JSON.parse(input); const mode = fs.existsSync('mode') ? fs.readFileSync('mode', 'utf8').trim() : 'pass';
  if (mode === 'non-json') return process.stdout.write('diagnostic on stdout\n');
  if (mode === 'secret') return process.stdout.write(JSON.stringify({protocol_version:'1',phase:value.phase,facts:{token:'exposed'},evidence_refs:[],failure_facts:[]})+'\n');
  if (mode === 'mutate-config') fs.appendFileSync('project.json', ' ');
  const status = mode === 'fail-first' && value.attempt === 1 ? 'failed' : ['failed','blocked','skipped','missing'].includes(mode) ? mode : 'passed';
  const body = mode === 'secret-evidence' ? JSON.stringify({token:'exposed'}) : JSON.stringify({observed:true,attempt:value.attempt}); let file = `evidence-${value.phase}.json`; fs.writeFileSync(`${value.artifact_root}/${file}`, body);
  if (mode === 'escape') file='../outside.json';
  if (mode === 'symlink') { fs.writeFileSync(`${value.artifact_root}/target.json`, body); fs.unlinkSync(`${value.artifact_root}/${file}`); fs.symlinkSync('target.json', `${value.artifact_root}/${file}`); }
  const output={protocol_version:mode==='wrong-protocol'?'2':'1',phase:value.phase,facts:{observed:true},evidence_refs:[{id:'ui-proof',claim_id:mode==='non-claim'?null:'ui-claim',status,path:file,sha256:mode==='bad-digest'?'0'.repeat(64):crypto.createHash('sha256').update(body).digest('hex')}],failure_facts:[]}; if(mode==='unknown-field')output.extra=true;
  process.stdout.write(JSON.stringify(output)+'\n');
});
NODE
cat > "$protocol/validator.js" <<'NODE'
const fs=require('fs');let input=''; process.stdin.setEncoding('utf8'); process.stdin.on('data',c=>input+=c); process.stdin.on('end',()=>{const value=JSON.parse(input),mode=fs.existsSync('validator-mode')?fs.readFileSync('validator-mode','utf8').trim():'pass';process.stdout.write(JSON.stringify({protocol_version:'1',validator_id:mode==='wrong-id'?'other':value.validator_id,claim_id:value.claim_id,input_digest:value.input_digest,evidence_digest:value.evidence_digest,status:mode==='failed'?'failed':'passed',reason:mode==='secret'?JSON.stringify({token:'exposed'}):'deterministic fixture validation'})+'\n');});
NODE
cat > "$protocol/project.json" <<JSON
{"schema_version":1,"protocol_version":"1","task_id":"web-fixture","scenario_id":"scenario-one","project_root":".","adapter":{"argv":["node","$protocol/adapter.js"]},"phases":["execute"],"validators":[{"id":"fixture-validator","claim_id":"ui-claim","argv":["node","$protocol/validator.js"]}],"required_evidence":[{"id":"ui-proof","claim_id":"ui-claim"}]}
JSON
expect_exit 0 "$BIN" run --project-config "$protocol/project.json" --contract "$protocol/contract.md" --artifact-root "$protocol/runs" --run-id clean-run --format json
node - "$TMP_ROOT/command.out" <<'NODE'
const value=JSON.parse(require('fs').readFileSync(process.argv[2])); if(value.result.technical_status!=='passed'||value.result.attempts.length!==1||!value.run_root.endsWith('/clean-run'))process.exit(1);
NODE
expect_exit 0 "$BIN" check-run --run-root "$protocol/runs/clean-run" --format json
node - "$TMP_ROOT/command.out" <<'NODE'
const value=JSON.parse(require('fs').readFileSync(process.argv[2])); if(!value.ok||value.technical_status!=='passed'||'verdict' in value||'accepted' in value)process.exit(1);
NODE

printf '%s\n' fail-first > "$protocol/mode"
expect_exit 2 "$BIN" run --project-config "$protocol/project.json" --contract "$protocol/contract.md" --artifact-root "$protocol/runs" --run-id retry-run --attempts 2 --format json
node - "$TMP_ROOT/command.out" <<'NODE'
const value=JSON.parse(require('fs').readFileSync(process.argv[2])); if(value.result.technical_status!=='unstable'||value.result.attempts[0].status!=='failed'||value.result.attempts[1].status!=='passed')process.exit(1);
NODE
expect_exit 2 "$BIN" check-run --run-root "$protocol/runs/retry-run" --format json
rm "$protocol/mode"

cp -a "$protocol/runs/retry-run" "$protocol/runs/tampered-reason"
node - "$protocol/runs/tampered-reason" <<'NODE'
const fs=require('fs'),p=require('path'),root=process.argv[2],file=p.join(root,'attempt-1/attempt.json'),value=JSON.parse(fs.readFileSync(file));value.reason='forged reason';fs.writeFileSync(file,JSON.stringify(value)+'\n');
NODE
expect_exit 1 "$BIN" check-run --run-root "$protocol/runs/tampered-reason" --format json
grep -Fq 'reason 与证据闭包不一致' "$TMP_ROOT/command.err"

cp -a "$protocol/runs/retry-run" "$protocol/runs/secret-reason"
node - "$protocol/runs/secret-reason" <<'NODE'
const c=require('crypto'),fs=require('fs'),p=require('path'),root=process.argv[2],attempt=p.join(root,'attempt-1/attempt.json'),index=p.join(root,'evidence-index.json'),result=p.join(root,'run-result.json'),a=JSON.parse(fs.readFileSync(attempt)),i=JSON.parse(fs.readFileSync(index)),r=JSON.parse(fs.readFileSync(result));a.reason='{"hmacSecret":"exposed"}';i.attempts[0].reason=a.reason;fs.writeFileSync(attempt,JSON.stringify(a)+'\n');fs.writeFileSync(index,JSON.stringify(i)+'\n');r.attempts[0].reason=a.reason;r.evidence_index_digest=c.createHash('sha256').update(fs.readFileSync(index)).digest('hex');fs.writeFileSync(result,JSON.stringify(r)+'\n');
NODE
expect_exit 1 "$BIN" check-run --run-root "$protocol/runs/secret-reason" --format json
grep -Fq '疑似 secret' "$TMP_ROOT/command.err"

# Deletion/rewrite of required validator closure must fail even if the attacker recomputes the index digest.
cp -a "$protocol/runs/clean-run" "$protocol/runs/tampered-validator"
node - "$protocol/runs/tampered-validator" <<'NODE'
const crypto=require('crypto'),fs=require('fs'),path=require('path'),root=process.argv[2]; const index=path.join(root,'evidence-index.json'); const value=JSON.parse(fs.readFileSync(index)); value.validators=[]; fs.writeFileSync(index,JSON.stringify(value)+'\n'); const result=JSON.parse(fs.readFileSync(path.join(root,'run-result.json'))); result.run_id='clean-run'; result.evidence_index_digest=crypto.createHash('sha256').update(fs.readFileSync(index)).digest('hex'); fs.writeFileSync(path.join(root,'run-result.json'),JSON.stringify(result)+'\n');
NODE
expect_exit 1 "$BIN" check-run --run-root "$protocol/runs/tampered-validator" --format json
grep -Fq 'validator 数量无效' "$TMP_ROOT/command.err"

for control_path in manifest.json run-result.json evidence-index.json frozen-project-config.json attempt-1/attempt.json; do
  case_name="symlink-control-$(printf '%s' "$control_path" | tr '/.' '--')"
  cp -a "$protocol/runs/clean-run" "$protocol/runs/$case_name"
  mv "$protocol/runs/$case_name/$control_path" "$protocol/runs/$case_name/$control_path.real"
  ln -s "$(basename "$control_path").real" "$protocol/runs/$case_name/$control_path"
  expect_exit 1 "$BIN" check-run --run-root "$protocol/runs/$case_name" --format json
  grep -Fq 'canonical regular non-symlink file' "$TMP_ROOT/command.err"
done

printf '%s\n' secret > "$protocol/mode"
expect_exit 2 "$BIN" run --project-config "$protocol/project.json" --contract "$protocol/contract.md" --artifact-root "$protocol/runs" --run-id secret-run --format json
grep -Fq '疑似敏感信息已拒绝' "$protocol/runs/secret-run/attempt-1/attempt.json"
expect_exit 2 "$BIN" check-run --run-root "$protocol/runs/secret-run" --format json
rm "$protocol/mode"
printf '%s\n' non-json > "$protocol/mode"
expect_exit 2 "$BIN" run --project-config "$protocol/project.json" --contract "$protocol/contract.md" --artifact-root "$protocol/runs" --run-id non-json-run --format json
grep -Fq 'stdout 不是合法 JSON' "$protocol/runs/non-json-run/attempt-1/attempt.json"
expect_exit 2 "$BIN" check-run --run-root "$protocol/runs/non-json-run" --format json
rm "$protocol/mode"

cp "$protocol/project.json" "$protocol/project.before-mutation.json"
printf '%s\n' mutate-config > "$protocol/mode"
expect_exit 2 "$BIN" run --project-config "$protocol/project.json" --contract "$protocol/contract.md" --artifact-root "$protocol/runs" --run-id config-mutation-run --format json
mv "$protocol/project.before-mutation.json" "$protocol/project.json"
rm "$protocol/mode"
expect_exit 2 "$BIN" check-run --run-root "$protocol/runs/config-mutation-run" --format json

# Shell strings, unknown fields and missing independent claim validators fail closed.
node - "$protocol/project.json" "$protocol/bad-config.json" <<'NODE'
const fs=require('fs'); const value=JSON.parse(fs.readFileSync(process.argv[2])); value.adapter.argv='node adapter.js'; fs.writeFileSync(process.argv[3],JSON.stringify(value));
NODE
expect_exit 1 "$BIN" run --project-config "$protocol/bad-config.json" --contract "$protocol/contract.md" --artifact-root "$protocol/runs" --run-id bad-config --format json
grep -Fq 'argv 字符串数组' "$TMP_ROOT/command.err"
for empty_field in validators required_evidence; do
  node - "$protocol/project.json" "$protocol/empty-$empty_field.json" "$empty_field" <<'NODE'
const fs=require('fs'),value=JSON.parse(fs.readFileSync(process.argv[2]));value[process.argv[4]]=[];fs.writeFileSync(process.argv[3],JSON.stringify(value));
NODE
  expect_exit 1 "$BIN" run --project-config "$protocol/empty-$empty_field.json" --contract "$protocol/contract.md" --artifact-root "$protocol/runs" --run-id "empty-$empty_field" --format json
  grep -Fq '必须是非空数组' "$TMP_ROOT/command.err"
done

for schema in project-config adapter-input adapter-envelope validator-input validator-envelope run-result evidence-index; do
  node -e 'const s=require(process.argv[1]); if(s.additionalProperties!==false||!Array.isArray(s.required))process.exit(1)' "$ATLAS_FORGE_ROOT/workflow/bin/lib/codex-web-acceptance/contracts/$schema.schema.json"
done
node - "$ATLAS_FORGE_ROOT/workflow/bin/lib/codex-web-acceptance" "$protocol" <<'NODE'
const fs=require('fs'),path=require('path'),crypto=require('crypto'),lib=process.argv[2],project=process.argv[3],{validateSchemaFile}=require(path.join(lib,'schema-validator')),root=path.join(project,'runs/clean-run'),read=f=>JSON.parse(fs.readFileSync(f)),attempt=read(path.join(root,'attempt-1/attempt.json')),index=read(path.join(root,'evidence-index.json'));
const values={
  'project-config':read(path.join(project,'project.json')),
  'adapter-input':{protocol_version:'1',phase:'execute',task_id:'web-fixture',scenario_id:'scenario-one',run_id:'clean-run',attempt:1,project_root:project,artifact_root:path.join(root,'attempt-1'),contract_digest:'0'.repeat(64)},
  'adapter-envelope':attempt.phases[0],
  'validator-input':{protocol_version:'1',validator_id:'fixture-validator',claim_id:'ui-claim',input_digest:index.validators[0].input_digest,evidence_digest:index.validators[0].evidence_digest,facts:attempt.phases.map(x=>x.facts),evidence_refs:attempt.phases.flatMap(x=>x.evidence_refs)},
  'validator-envelope':Object.fromEntries(Object.entries(index.validators[0]).filter(([key])=>key!=='attempt')),
  'run-result':read(path.join(root,'run-result.json')),
  'evidence-index':index,
};
for(const [name,value] of Object.entries(values)){const schema=path.join(lib,'contracts',`${name}.schema.json`);validateSchemaFile(schema,value);for(const mutation of ['unknown','missing','version']){const bad=structuredClone(value);if(mutation==='unknown')bad.__unknown=true;else if(mutation==='missing')delete bad[JSON.parse(fs.readFileSync(schema)).required[0]];else if('protocol_version'in bad)bad.protocol_version='invalid';else if('schema_version'in bad)bad.schema_version=999;else continue;let rejected=false;try{validateSchemaFile(schema,bad)}catch{rejected=true}if(!rejected)throw new Error(`${name} accepted ${mutation} fixture`);}}
const nested=[['project-config',values['project-config'],v=>v.adapter.extra=true],['project-config',values['project-config'],v=>v.validators[0].argv='shell string'],['adapter-envelope',values['adapter-envelope'],v=>v.evidence_refs[0].extra=true],['adapter-envelope',values['adapter-envelope'],v=>delete v.evidence_refs[0].sha256],['validator-envelope',values['validator-envelope'],v=>v.status='unknown'],['run-result',values['run-result'],v=>v.attempts[0].reason='passed reason forbidden'],['evidence-index',values['evidence-index'],v=>v.validators[0].extra=true]];
for(const [name,source,mutate] of nested){const bad=structuredClone(source);mutate(bad);let rejected=false;try{validateSchemaFile(path.join(lib,'contracts',`${name}.schema.json`),bad)}catch{rejected=true}if(!rejected)throw new Error(`${name} accepted nested negative`);}
NODE
grep -Fq 'interface ProjectConfigV1' "$ATLAS_FORGE_ROOT/workflow/bin/lib/codex-web-acceptance/contracts/types.d.ts"
grep -Fq 'interface EvidenceIndexV1' "$ATLAS_FORGE_ROOT/workflow/bin/lib/codex-web-acceptance/contracts/types.d.ts"
grep -Fq 'type FailureClass = "project"|"environment"|"safety"|"protocol"|"internal"' "$ATLAS_FORGE_ROOT/workflow/bin/lib/codex-web-acceptance/contracts/types.d.ts"
grep -Fq 'ValidatorInputV1' "$ATLAS_FORGE_ROOT/workflow/bin/lib/codex-web-acceptance/contracts/types.d.ts"
! grep -Fq 'unknown[]' "$ATLAS_FORGE_ROOT/workflow/bin/lib/codex-web-acceptance/contracts/types.d.ts"

for bad_mode in failed blocked skipped missing non-claim bad-digest escape symlink secret-evidence wrong-protocol unknown-field; do
  printf '%s\n' "$bad_mode" > "$protocol/mode"
  expect_exit 2 "$BIN" run --project-config "$protocol/project.json" --contract "$protocol/contract.md" --artifact-root "$protocol/runs" --run-id "negative-$bad_mode" --format json
  expect_exit 2 "$BIN" check-run --run-root "$protocol/runs/negative-$bad_mode" --format json
done
rm "$protocol/mode"
for validator_mode in wrong-id failed secret; do
  printf '%s\n' "$validator_mode" > "$protocol/validator-mode"
  expect_exit 2 "$BIN" run --project-config "$protocol/project.json" --contract "$protocol/contract.md" --artifact-root "$protocol/runs" --run-id "validator-$validator_mode" --format json
  expect_exit 2 "$BIN" check-run --run-root "$protocol/runs/validator-$validator_mode" --format json
done
rm "$protocol/validator-mode"

baf="$TMP_ROOT/baf/task/team/acceptance"
mkdir -p "$baf/scenarios" "$baf/card"
cat > "$baf/scenarios/business-scenario-card.flow.json" <<'JSON'
{"schema_version":1,"task_id":"web-fixture","scenario_id":"flow","business_goal":"按场景核对页面结果","entry_role":"reviewer","initial_state":["材料已登记"],"trigger":"打开已登记系统","expected_agent_behavior":["按步骤操作页面"],"expected_business_state":["页面显示预期结果"],"technical_hard_gates":["technical run"],"business_evidence_required":["ev-ui"],"technical_evidence_required":["run result"],"pass_criteria":["当前证据支持对照"],"fail_criteria":["材料缺失"]}
JSON
cat > "$baf/business-evidence-map.json" <<'JSON'
{"schema_version":1,"task_id":"web-fixture","evidence_refs":[{"evidence_id":"ev-ui","scenario_id":"flow","source_type":"local","description":"页面运行截图","evidence_path":"team/acceptance/card/actual.png","result":"passed"},{"evidence_id":"ev-owner","scenario_id":"flow","source_type":"local","description":"Acceptance owner 当前引用判断","evidence_path":"team/acceptance/card/review-card.json","result":"passed"},{"evidence_id":"ev-other","scenario_id":"other","source_type":"local","description":"其他场景证据","evidence_path":"team/acceptance/other.png","result":"passed"}]}
JSON
cat > "$baf/business-verdict.json" <<'JSON'
{"schema_version":2,"task_id":"web-fixture","verdict":"accepted","technical_gate_status":"passed","business_acceptance_status":"passed","required_followups":[],"blockers":[],"goal_a":{"status":"passed","evidence_refs":["ev-ui"],"integration_path_id":"path-one","integration_mode":"real"},"goal_b":{"status":"passed","evidence_refs":["ev-owner"],"integration_path_id":"path-one","integration_mode":"real"}}
JSON
printf '%s\n' reference > "$baf/card/reference.png"
printf '%s\n' actual > "$baf/card/actual.png"
node "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/scripts/codex-team-validate-json" --type business-scenario-card --file "$baf/scenarios/business-scenario-card.flow.json" >/dev/null
node "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/scripts/codex-team-validate-json" --type business-evidence-map --file "$baf/business-evidence-map.json" >/dev/null
node "$ATLAS_FORGE_ROOT/plugins/atlas-workflow/scripts/codex-team-validate-json" --type business-verdict --file "$baf/business-verdict.json" >/dev/null
node - "$baf" "$protocol/contract.md" <<'NODE'
const c=require('crypto'),fs=require('fs'),p=require('path'),root=process.argv[2],contract=process.argv[3],sha=f=>c.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const card={schema_version:1,task_id:'web-fixture',scenario_id:'flow',title:'按场景核对页面结果',baf_refs:{verdict:'accepted',technical_status:'passed',business_status:'passed',evidence_refs:['ev-ui'],verdict_digest:sha(p.join(root,'business-verdict.json')),evidence_map_digest:sha(p.join(root,'business-evidence-map.json')),scenario_digest:sha(p.join(root,'scenarios/business-scenario-card.flow.json'))},integration_mode:'real',steps:[{operation:'按步骤操作页面',expected:'页面显示预期结果',actual:'页面运行截图（结果：passed）',evidence_refs:['ev-ui']}],reference_images:['reference.png'],actual_screenshots:['actual.png'],limitations:['当前无法判断']};
card.owner_decision={decision:'符合',owner:'acceptance-owner',decision_evidence_id:'ev-owner',contract_digest:sha(contract),verdict_digest:card.baf_refs.verdict_digest,evidence_map_digest:card.baf_refs.evidence_map_digest,scenario_digest:card.baf_refs.scenario_digest,reference_digests:[sha(p.join(root,'card/reference.png'))],actual_digests:[sha(p.join(root,'card/actual.png'))],evidence_refs:['ev-ui']}; fs.writeFileSync(p.join(root,'card/review-card.json'),JSON.stringify(card)+'\n');
NODE
expect_exit 0 "$BIN" review --baf-root "$baf" --card "$baf/card/review-card.json" --contract "$protocol/contract.md" --check-owner-decision --format json
node - "$TMP_ROOT/command.out" <<'NODE'
const value=JSON.parse(require('fs').readFileSync(process.argv[2])); if(!value.ok||value.evidence_validation.validator_id!=='acceptance-owner-design-intent'||value.evidence_validation.status!=='passed'||'verdict' in value)process.exit(1);
NODE
node - "$baf/card/review-card.json" "$baf/card/cross-scenario.json" <<'NODE'
const fs=require('fs'),v=JSON.parse(fs.readFileSync(process.argv[2]));v.steps[0].evidence_refs=['ev-other'];v.steps[0].actual='其他场景证据（结果：passed）';fs.writeFileSync(process.argv[3],JSON.stringify(v));
NODE
expect_exit 1 "$BIN" review --baf-root "$baf" --card "$baf/card/cross-scenario.json" --format json
grep -Fq '未登记 evidence' "$TMP_ROOT/command.err"

node - "$baf/card/review-card.json" "$baf/card/no-owner.json" <<'NODE'
const fs=require('fs'),v=JSON.parse(fs.readFileSync(process.argv[2]));delete v.owner_decision;fs.writeFileSync(process.argv[3],JSON.stringify(v));
NODE
expect_exit 1 "$BIN" review --baf-root "$baf" --card "$baf/card/no-owner.json" --contract "$protocol/contract.md" --check-owner-decision --format json
for decision in 不符合 需修改; do
  cp "$baf/card/review-card.json" "$baf/card/review-card.before-decision.json"
  node - "$baf/card/review-card.json" "$decision" <<'NODE'
const fs=require('fs'),file=process.argv[2],v=JSON.parse(fs.readFileSync(file));v.owner_decision.decision=process.argv[3];fs.writeFileSync(file,JSON.stringify(v));
NODE
  expect_exit 2 "$BIN" review --baf-root "$baf" --card "$baf/card/review-card.json" --contract "$protocol/contract.md" --check-owner-decision --format json
  mv "$baf/card/review-card.before-decision.json" "$baf/card/review-card.json"
done
cp "$baf/card/review-card.json" "$baf/card/review-card.before-unregistered.json"
node - "$baf/card/review-card.json" <<'NODE'
const fs=require('fs'),file=process.argv[2],v=JSON.parse(fs.readFileSync(file));v.owner_decision.decision_evidence_id='not-registered';fs.writeFileSync(file,JSON.stringify(v));
NODE
expect_exit 1 "$BIN" review --baf-root "$baf" --card "$baf/card/review-card.json" --contract "$protocol/contract.md" --check-owner-decision --format json
grep -Fq '未登记为当前 BAF evidence' "$TMP_ROOT/command.err"
mv "$baf/card/review-card.before-unregistered.json" "$baf/card/review-card.json"
printf '%s\n' changed-contract > "$protocol/other-contract.md"
expect_exit 1 "$BIN" review --baf-root "$baf" --card "$baf/card/review-card.json" --contract "$protocol/other-contract.md" --check-owner-decision --format json

for ref_kind in verdict map scenario; do
  node - "$baf/card/review-card.json" "$baf/card/stale-$ref_kind.json" "$ref_kind" <<'NODE'
const fs=require('fs'),v=JSON.parse(fs.readFileSync(process.argv[2])),kind=process.argv[4],key=kind==='verdict'?'verdict_digest':kind==='map'?'evidence_map_digest':'scenario_digest';v.baf_refs[key]='0'.repeat(64);v.owner_decision[key]='0'.repeat(64);fs.writeFileSync(process.argv[3],JSON.stringify(v));
NODE
  expect_exit 1 "$BIN" review --baf-root "$baf" --card "$baf/card/stale-$ref_kind.json" --contract "$protocol/contract.md" --check-owner-decision --format json
done
printf '%s\n' changed-actual > "$baf/card/actual.png"
expect_exit 1 "$BIN" review --baf-root "$baf" --card "$baf/card/review-card.json" --contract "$protocol/contract.md" --check-owner-decision --format json
printf '%s\n' actual > "$baf/card/actual.png"

for image_case in missing escape symlink placeholder; do
  target="$baf/card/image-$image_case.json"
  node - "$baf/card/review-card.json" "$target" "$image_case" <<'NODE'
const fs=require('fs'),v=JSON.parse(fs.readFileSync(process.argv[2])),kind=process.argv[4];v.reference_images=[kind==='missing'?'absent.png':kind==='escape'?'../outside.png':kind==='symlink'?'linked.png':'无'];fs.writeFileSync(process.argv[3],JSON.stringify(v));
NODE
  if [[ "$image_case" == symlink ]]; then ln -s actual.png "$baf/card/linked.png"; fi
  expect_exit 1 "$BIN" review --baf-root "$baf" --card "$target" --format json
done

cp "$baf/business-verdict.json" "$baf/business-verdict.before-owner-ref.json"
cp "$baf/card/review-card.json" "$baf/card/review-card.before-owner-ref.json"
node - "$baf/business-verdict.json" "$baf/card/review-card.json" <<'NODE'
const c=require('crypto'),fs=require('fs'),vfile=process.argv[2],cfile=process.argv[3],v=JSON.parse(fs.readFileSync(vfile));v.goal_b.evidence_refs=[];fs.writeFileSync(vfile,JSON.stringify(v)+'\n');const card=JSON.parse(fs.readFileSync(cfile)),sha=c.createHash('sha256').update(fs.readFileSync(vfile)).digest('hex');card.baf_refs.verdict_digest=sha;card.owner_decision.verdict_digest=sha;fs.writeFileSync(cfile,JSON.stringify(card));
NODE
expect_exit 1 "$BIN" review --baf-root "$baf" --card "$baf/card/review-card.json" --contract "$protocol/contract.md" --check-owner-decision --format json
grep -Fq '未引用 owner decision evidence' "$TMP_ROOT/command.err"
mv "$baf/business-verdict.before-owner-ref.json" "$baf/business-verdict.json"
mv "$baf/card/review-card.before-owner-ref.json" "$baf/card/review-card.json"

cp "$baf/business-verdict.json" "$baf/business-verdict.before-mode.json"
node - "$baf/business-verdict.json" "$baf/card/review-card.json" <<'NODE'
const c=require('crypto'),fs=require('fs'),vfile=process.argv[2],cfile=process.argv[3],v=JSON.parse(fs.readFileSync(vfile));v.goal_a.integration_mode=v.goal_b.integration_mode='approved_simulator';fs.writeFileSync(vfile,JSON.stringify(v)+'\n');const card=JSON.parse(fs.readFileSync(cfile)),sha=c.createHash('sha256').update(fs.readFileSync(vfile)).digest('hex');card.integration_mode='approved_simulator';card.limitations=['已完成真实 UI 验收'];card.baf_refs.verdict_digest=sha;card.owner_decision.verdict_digest=sha;fs.writeFileSync(cfile+'.nonreal',JSON.stringify(card));
NODE
expect_exit 1 "$BIN" review --baf-root "$baf" --card "$baf/card/review-card.json.nonreal" --format json
grep -Fq '不得称为真实运行' "$TMP_ROOT/command.err"
mv "$baf/business-verdict.before-mode.json" "$baf/business-verdict.json"

if rg -n 'codex-team-business-report|presentation-strict|finalStatus' "$BIN" "$ATLAS_FORGE_ROOT/workflow/bin/lib/codex-web-acceptance"; then
  printf 'Web Core contains a forbidden renderer/presentation/parallel-verdict dependency\n' >&2
  exit 1
fi
for heading in '场景目标与验收条件' '场景操作、预期与实际' '参考图与实际截图' '禁止绕过、阻断与未覆盖' 'Acceptance owner 人工判断'; do grep -Fq "$heading" "$ATLAS_FORGE_ROOT/workflow/templates/web-scenario-review-card.md"; done

# Atlas-scoped distribution uses the managed bin root; stage equality is enforced by the sync helper.
sync_home="$TMP_ROOT/sync-home"
mkdir -p "$sync_home"
HOME="$sync_home" CODEX_HOME_ROOT="$sync_home/codex" CODEX_WORKFLOW_ROOT="$sync_home/workflow" LOCAL_BIN_ROOT="$sync_home/bin" \
  "$ATLAS_FORGE_ROOT/scripts/sync-live-atlas-workflow.sh" >/dev/null
test -x "$sync_home/bin/codex-web-acceptance"
diff -qr "$ATLAS_FORGE_ROOT/workflow/bin/lib/codex-web-acceptance/contracts" "$sync_home/workflow/bin/lib/codex-web-acceptance/contracts" >/dev/null
expect_exit 0 "$BIN" audit --project "$clean" --playwright-config playwright.config.ts --source-root specs --format json
cp "$TMP_ROOT/command.out" "$TMP_ROOT/repo-distribution.json"
expect_exit 0 "$sync_home/bin/codex-web-acceptance" audit --project "$clean" --playwright-config playwright.config.ts --source-root specs --format json
cmp -s "$TMP_ROOT/repo-distribution.json" "$TMP_ROOT/command.out"

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
