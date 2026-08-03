#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEAM="$ROOT/plugins/atlas-workflow/skills/team/SKILL.md"
README="$ROOT/plugins/atlas-workflow/README.md"
AGENTS="$ROOT/.codex/agents"

assert_has() {
  local file="$1" pattern="$2" label="$3"
  rg -q -- "$pattern" "$file" || {
    printf 'missing required routing behavior: %s\n' "$label" >&2
    exit 1
  }
}

assert_lacks() {
  local file="$1" pattern="$2" label="$3"
  if rg -q -- "$pattern" "$file"; then
    printf 'found forbidden routing behavior: %s\n' "$label" >&2
    exit 1
  fi
}

# Parse the skill's decision table and compare complete scenario outputs, so each case
# must expose both an allowed and disallowed decision rather than isolated keywords.
node - "$TEAM" <<'NODE'
const fs = require('fs');
const source = fs.readFileSync(process.argv[2], 'utf8');
const section = source.match(/### Routing Scenarios\n\n([\s\S]*?)\n\nUse this table as a decision contract/);
if (!section) throw new Error('missing parseable Routing Scenarios decision table');

const actual = new Map();
for (const line of section[1].split('\n').slice(2)) {
  const cells = line.split('|').slice(1, -1).map((cell) => cell.trim().replaceAll('`', ''));
  if (cells.length !== 3 || !cells[0]) continue;
  if (actual.has(cells[0])) throw new Error(`duplicate scenario: ${cells[0]}`);
  if (!cells[1] || !cells[2]) throw new Error(`scenario lacks positive or negative decision: ${cells[0]}`);
  actual.set(cells[0], { allowed: cells[1], disallowed: cells[2] });
}

const expected = {
  'tiny-clear': ['main-by-default; evidence-backed-specialist-allowed', 'fixed-team-fanout'],
  'routine-implementation': ['default-luna-max-implementer', 'implicit-quality-model'],
  'routine-review-verify': ['default-terra-high-reviewer-or-verifier', 'implicit-quality-model'],
  'hard-to-reverse-direction': ['default-sol-medium-planner', 'automatic-quality-upgrade'],
  'completed-phase-extra-judgment': ['default-sol-medium-phase-reviewer', 'phase-reviewer-for-routine-review'],
  'browser-heavy': ['default-luna-high-browser-verifier', 'implicit-quality-model'],
  'quality-mode-explicit': ['all-sol-with-role-specific-reasoning', 'implicit-or-automatic-quality'],
  'schema-restricted': ['main-only; disclose-routing-unavailable', 'generic-inherited-fanout'],
  'profile-mismatch': ['block-spawn; reconcile-policy-profile', 'spawn-with-mismatched-model'],
  'metadata-invisible': ['disclose-unverified; no-billing-proof-required', 'claim-billing-model-verified'],
  'confirmed-cost-anomaly': ['stop-new-fanout; readonly-diagnosis; main-only', 'continue-fanout-or-mutate-runtime'],
};

if (actual.size !== Object.keys(expected).length) {
  throw new Error(`scenario count mismatch: expected ${Object.keys(expected).length}, found ${actual.size}`);
}
for (const [id, [allowed, disallowed]] of Object.entries(expected)) {
  const row = actual.get(id);
  if (!row) throw new Error(`missing scenario: ${id}`);
  if (row.allowed !== allowed || row.disallowed !== disallowed) {
    throw new Error(`scenario decision mismatch: ${id}: ${JSON.stringify(row)}`);
  }
}
NODE

# Guard prose and agent prompts against contradictory shortcuts outside the table.
assert_has "$TEAM" 'small clear task defaults to the main Codex' 'small task defaults to main agent'
assert_has "$TEAM" 'concrete evidence.*materially lowers risk or latency' 'small task permits evidence-backed delegation'
assert_has "$TEAM" 'Before the first native fan-out' 'native routing preflight is mandatory'
assert_has "$TEAM" 'agent_type.*model.*reasoning_effort.*fork_turns' 'preflight checks all exact-routing fields'
assert_has "$TEAM" 'schema-restricted.*main-only' 'restricted schema fails closed to main-only'

assert_has "$TEAM" 'Default Saving Mode' 'saving mode is visibly the default'
assert_has "$TEAM" 'only after staffing has established that the lane is useful' 'saving mode follows staffing rather than creating Team'
assert_has "$TEAM" 'atlas-sdd-implementer.*gpt-5\.6-luna.*max.*none' 'routine implementation defaults to Luna max'
assert_has "$TEAM" 'atlas-sdd-reviewer.*gpt-5\.6-terra.*high.*none' 'routine review defaults to Terra high'
assert_has "$TEAM" 'atlas-sdd-verifier.*gpt-5\.6-terra.*high.*none' 'verification defaults to Terra high'
assert_has "$TEAM" 'atlas-sdd-planner.*gpt-5\.6-sol.*medium.*none' 'planning defaults to Sol medium'

assert_has "$TEAM" 'atlas-sdd-phase-reviewer.*gpt-5\.6-sol.*medium.*none' 'phase reviewer explicitly routes to Sol medium'
assert_has "$TEAM" 'mechanical or environmental failures stay on the ordinary reviewer/verifier path' 'mechanical and environment failures do not escalate'
assert_lacks "$TEAM" 'Upgrade to the Sol phase-reviewer' 'automatic Sol upgrade wording'

assert_has "$TEAM" 'atlas-sdd-browser-verifier.*gpt-5\.6-luna.*high.*none' 'browser-heavy work defaults to Luna high'
assert_has "$TEAM" 'atlas-sdd-explorer.*gpt-5\.6-luna.*medium.*none' 'exploration defaults to Luna medium'
assert_has "$TEAM" 'Explicit Quality Mode' 'quality mode is separately defined'
assert_has "$TEAM" 'explicitly requests.*quality mode' 'quality mode requires an explicit user request'
assert_has "$TEAM" '\| Planning \| `atlas-sdd-planner` \| `gpt-5\.6-sol` \| `max` \| `none` \|' 'quality planning routes to Sol max'
assert_has "$TEAM" 'atlas-sdd-implementer.*gpt-5\.6-sol.*medium.*none' 'quality implementation routes to Sol medium'
assert_has "$TEAM" 'atlas-sdd-reviewer.*gpt-5\.6-sol.*max.*none' 'quality review routes to Sol max'
assert_has "$TEAM" 'atlas-sdd-verifier.*gpt-5\.6-sol.*high.*none' 'quality verification routes to Sol high'
assert_has "$TEAM" 'never automatically enable quality mode' 'quality mode is never activated automatically'
assert_has "$TEAM" 'staffing_mode' 'staffing is an independent decision'
assert_has "$TEAM" 'model_policy' 'model policy is an independent decision'
assert_has "$TEAM" 'release_mode' 'release mode is an independent decision'
assert_has "$TEAM" 'Do not create Team just to obtain Saving Mode' 'saving mode does not create Team'
assert_has "$TEAM" 'Team does not imply quality mode' 'Team does not imply quality mode'
assert_has "$TEAM" 'does not rewrite the root host model' 'Atlas does not rewrite the host model'
assert_has "$TEAM" 'Saving/quality selection' 'saving and quality are not persisted'
assert_has "$TEAM" 'Main-only single writers' 'single writers do not require a lease'
assert_has "$TEAM" 'does not require a lease by default' 'isolated product increment writer has no default lease'
assert_has "$TEAM" 'does not enter execution-v3 or acquire a durable' 'quick writer avoids durable execution-v3 attempt'
assert_has "$TEAM" 'Formal `product_release` execution continues to use the existing execution-v3' 'strict release lease remains'
assert_has "$README" 'Staffing, Team, path lease, model choice, and release mode are independent' 'README keeps decisions orthogonal'
assert_has "$README" 'root host model' 'README protects host model'
assert_has "$AGENTS/atlas-sdd-browser-verifier.toml" 'would benefit from extra judgment, recommend routing' 'final Sol browser review remains conditional'
assert_lacks "$AGENTS/atlas-sdd-browser-verifier.toml" 'require the controller to route' 'browser evidence cannot force Sol review'

assert_has "$TEAM" 'fork_turns="none"' 'custom role dispatch avoids full-history fork'
assert_has "$TEAM" 'self-contained dispatch packet' 'fresh child receives a complete task packet'
assert_has "$TEAM" '`task_name`.*does not select' 'task name is not treated as a custom-agent selector'
assert_has "$TEAM" 'Outside that explicit override.*mismatch.*do not spawn' 'unexpected profile and dispatch mismatch blocks spawn'
assert_lacks "$TEAM" 'reasonable available fallback and disclose it' 'unavailable exact profile cannot use a generic fallback'
assert_lacks "$TEAM" 'default_subagent_model' 'team does not require a global default subagent model'
assert_lacks "$TEAM" 'session JSONL' 'team does not require strict session-log auditing'

assert_has "$TEAM" 'stop new fan-out, perform only minimal read-only diagnosis' 'confirmed cost anomaly stops new fan-out'
assert_has "$TEAM" 'fall back to main-only' 'confirmed cost anomaly has a deterministic safe fallback'

assert_has "$AGENTS/atlas-sdd-implementer.toml" 'Do not force a dedicated commit for every slice' 'implementer follows moderate commit boundaries'
assert_lacks "$AGENTS/atlas-sdd-implementer.toml" 'create a dedicated git commit before reporting' 'per-slice commit requirement'

printf 'contract_team_cost_routing: ok\n'
