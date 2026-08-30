#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PLUGIN="$ROOT/plugins/atlas-workflow"
CLARIFY="$PLUGIN/skills/clarify/SKILL.md"
COLLABORATION="$PLUGIN/skills/clarify/references/collaboration.md"
CONTRACT="$PLUGIN/skills/clarify/references/contract-authoring.md"
MANIFEST="$PLUGIN/.codex-plugin/plugin.json"

assert_has() {
  local file="$1" pattern="$2" label="$3"
  rg -Uq -- "$pattern" "$file" || {
    printf 'missing Clarify policy: %s (%s)\n' "$label" "$file" >&2
    exit 1
  }
}

assert_lacks() {
  local file="$1" pattern="$2" label="$3"
  if rg -Uq -- "$pattern" "$file"; then
    printf 'found forbidden Clarify behavior: %s (%s)\n' "$label" "$file" >&2
    exit 1
  fi
}

test -f "$COLLABORATION"
test -f "$CONTRACT"

# Default routing must work without loading the conditional detail files.
assert_has "$CLARIFY" 'Read the request, current conversation, existing decisions' 'reuse context before asking'
assert_has "$CLARIFY" 'Before brownfield discovery or any fan-out, freeze the smallest user-visible Goal' 'Goal freeze precedes discovery and fan-out'
assert_has "$CLARIFY" 'Preserve requirement meanings, not just their IDs' 'stable IDs do not prove semantic fidelity'
assert_has "$CLARIFY" 'Engineering assumptions remain revisable' 'an implementation guess is not user intent'
assert_has "$CLARIFY" 'Ask one blocking question only when' 'questions need a material unresolved choice'
assert_has "$CLARIFY" 'one-line request with complete context needs no fixed checklist' 'short requests do not cause ceremonial expansion'
assert_has "$CLARIFY" 'larger task with material engineering tradeoffs, automatically start\s+read-only multi-perspective discussion before the contract is drafted' 'automatic engineering deliberation precedes the contract'
assert_has "$CLARIFY" 'do not ask for per-run permission' 'no repeated staffing approval'
assert_has "$CLARIFY" 'common pair, not a fixed roster' 'roles follow the engineering decision'
assert_has "$CLARIFY" 'File count, request length and a non-tiny\s+label alone do not justify discussion' 'size labels alone do not trigger deliberation'
assert_has "$CLARIFY" 'Repetitive bulk work may benefit from parallel\s+fact-finding without a stance debate' 'bulk work is not forced into a debate'
assert_has "$CLARIFY" 'Before dispatch, read \[references/collaboration.md\]' 'explicit collaboration read trigger'
assert_has "$CLARIFY" 'Only when machine-checkable admission, cross-session handoff, audit or release\s+value requires an implementation contract, read' 'contract detail is conditional'
assert_has "$CLARIFY" 'Compare final clauses with the user.s original intent, approved decisions and\s+discussion results' 'compare original intent, not consensus alone'
assert_has "$CLARIFY" 'legal, reachable prerequisites' 'acceptance prerequisites are reachable'
assert_has "$CLARIFY" 'Do not invent an unauthorized write path' 'acceptance grants no write access'
assert_has "$CLARIFY" 'minimum complete implementation, including necessary safety and quality' 'minimal retains necessary protection'
assert_lacks "$CLARIFY" '## Short Request Expansion Rule|## Clarify Main-Only Default|first_code_stop_before_slice' 'default body excludes old checklists and contract detail'

# Independent options, direct peer responses, and one canonical author.
assert_has "$COLLABORATION" 'original user request, approved decisions, relevant raw evidence/code' 'roles receive original evidence'
assert_has "$COLLABORATION" 'independently propose.*before showing peer conclusions' 'initial options are independent'
assert_has "$COLLABORATION" 'respond directly and revise their options' 'roles respond to each other'
assert_has "$COLLABORATION" 'Do not vote, mechanically average options or merge all suggestions' 'main chooses, not unions requirements'
assert_has "$COLLABORATION" 'current duplication, errors or costly rework can justify\s+a bounded structural improvement now' 'minimum diff is not always the winner'
assert_has "$COLLABORATION" 'Round counts, time, agent count and unanimous preference are not stop\s+conditions' 'outcome-based convergence'
assert_has "$COLLABORATION" 'sole canonical scope/artifact writer and final synthesizer' 'main is sole canonical writer'
assert_has "$COLLABORATION" 'Child findings cannot expand the Goal, create workflow artifacts or write project\s+documents' 'children cannot grant scope or write artifacts'
for field in 'Goal/current-required reference' consumer 'ready\s+input' 'evidence domain' 'expected output' authority 'stop condition'; do
  assert_has "$COLLABORATION" "$field" "lane admission preserves $field"
done
assert_has "$COLLABORATION" 'explicit collaboration request authorizes staffing without\s+expanding scope and waives only that extra value proof' 'explicit staffing preserves boundaries'
assert_has "$COLLABORATION" 'Coalesce duplicate lanes\s+and defer dependency-not-ready lanes' 'distinct ready lanes only'
assert_has "$COLLABORATION" 'child_count = min\(ready admitted lanes, host available child slots, 3\)' 'Clarify wave remains three'
assert_has "$COLLABORATION" 'not a role-total, completion or stop condition' 'wave width is not a completion budget'
assert_has "$COLLABORATION" 'controller policy, not a runtime scheduler invariant' 'no scheduler guarantee'
assert_has "$COLLABORATION" 'record-only.*effective_backend=none.*compatibility outcomes, not parallel evidence' 'zero dispatch is not parallel evidence'
for file in "$CLARIFY" "$COLLABORATION"; do
  assert_lacks "$file" 'parallel_required|frontier_status|fanout_required' 'no parallel scheduler schema'
done

assert_has "$COLLABORATION" 'planning/contract-review\s+preflight' 'perspectives retain planning model routing'
assert_has "$COLLABORATION" 'perspectives do not select\s+implementation Saving' 'execute authority does not select the planning model'
assert_has "$COLLABORATION" 'schema/profile/model/reasoning/backend routes' 'exact route remains fail closed'
assert_has "$COLLABORATION" 'confirmed cost anomalies fail closed' 'cost anomaly remains fail closed'
for failure_mode in 'cannot start' 'times out' 'becomes unavailable' 'no usable output'; do
  assert_has "$COLLABORATION" "$failure_mode" "child failure mode: $failure_mode"
done
assert_has "$COLLABORATION" 'main-only only when safe; otherwise stop and report the blocker' 'unsafe fallback stops'
assert_has "$COLLABORATION" 'Disclose\s+which admitted perspective was unavailable' 'fallback names the missing perspective'
assert_has "$COLLABORATION" 'never report a degraded main-only\s+result as completed multi-agent clarification' 'no fake collaboration'
assert_has "$COLLABORATION" 'Ordinary Task/CW\s+do not auto-upgrade to Team' 'staffing does not change workflow authority'
assert_has "$CONTRACT" 'immutable Profile|immutable.*Profile' 'release retains immutable Profile'
assert_has "$CONTRACT" 'terminal.*(release|certification).*slice|final.*sweep' 'release retains final sweep'
assert_has "$CONTRACT" 'completion-derived.*release_decision|release_decision.*completion-derived' 'completion-derived release decisions'
assert_has "$CLARIFY" 'Clarify does not authorize coding, commit, installation, deployment or release' 'clarification does not authorize execution'
assert_has "$CLARIFY" 'execution-vnext admission' 'formal release retains execution-vnext'

# Resolve actual references in a copied plugin layout from an unrelated cwd.
# This does not install or refresh a live plugin, or execute a model replay.
node - "$PLUGIN" "$MANIFEST" "$ROOT/test/fixtures/clarify/behavior-cases.json" <<'NODE'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-clarify-layout-'));
const cwd = process.cwd();
try {
  const plugin = path.join(root, 'cache', 'atlas-workflow', 'isolated-version');
  fs.cpSync(process.argv[2], plugin, { recursive: true });
  const target = path.join(root, 'unrelated-target');
  fs.mkdirSync(target);
  process.chdir(target);
  const skill = path.join(plugin, 'skills', 'clarify', 'SKILL.md');
  assert.equal(path.resolve(path.dirname(skill), '..', '..'), plugin);
  const references = ['collaboration', 'contract-authoring'].map(name =>
    path.join(path.dirname(skill), 'references', name + '.md'));
  for (const file of [skill, ...references]) {
    const body = fs.readFileSync(file, 'utf8');
    const links = [...body.matchAll(/\[[^\]]+\]\(([^)]+\.md)\)/g)];
    assert.ok(links.length > 0, 'missing local references: ' + file);
    for (const [, link] of links) {
      const resolved = path.resolve(path.dirname(file), link);
      assert.ok(resolved.startsWith(plugin + path.sep), 'reference escaped plugin: ' + link);
      assert.ok(fs.readFileSync(resolved, 'utf8').trim(), 'unreadable reference: ' + link);
    }
  }
} finally {
  process.chdir(cwd);
  fs.rmSync(root, { recursive: true, force: true });
}
const manifest = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const prompts = manifest.interface.defaultPrompt.join('\n');
for (const text of ['Clarify只补实际缺口', '复杂且有实质取舍时自动多工程视角讨论', '角色按需变化', '不扩scope', 'Team bounded waves', 'Task/CW不自动进Team', 'Certified≠发布']) {
  assert.ok(prompts.includes(text), 'manifest prompt missing: ' + text);
}
for (const prompt of manifest.interface.defaultPrompt) assert.ok([...prompt].length <= 128);
assert.ok(!/Clarify main-only|Task\/CW\s*不进\s*Team/.test(prompts));

// These are pending behavioral observations, not a model execution or score.
const corpus = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
assert.ok(corpus.description.includes('未运行真实会话回放'));
assert.equal(new Set(corpus.cases.map(item => item.case_id)).size, corpus.cases.length);
for (const item of corpus.cases) {
  assert.ok(item.case_id && item.scenario_input.request);
  for (const values of [item.scenario_input.context, item.expected.should, item.expected.should_not]) {
    assert.ok(Array.isArray(values) && values.length > 0 && values.every(value => typeof value === 'string' && value.trim()));
  }
}
NODE

printf 'contract_clarify_parallel_routing: ok\n'
