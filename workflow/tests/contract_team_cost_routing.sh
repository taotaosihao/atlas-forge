#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEAM="$ROOT/plugins/atlas-workflow/skills/team/SKILL.md"
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
  'routine-implementation': ['luna-max-implementer-when-useful', 'sol-by-default'],
  'routine-review-verify': ['terra-reviewer-or-verifier', 'sol-routine-check'],
  'hard-to-reverse-direction': ['sol-medium-planner-when-useful', 'sol-for-mechanical-or-env-failure'],
  'completed-phase-extra-judgment': ['sol-medium-phase-reviewer', 'phase-reviewer-for-routine-review'],
  'browser-heavy': ['luna-high-browser-verifier', 'sol-throughout-browser-run'],
  'preferred-agent-unavailable': ['disclosed-reasonable-fallback', 'claim-preferred-profile-verified'],
  'metadata-invisible': ['mark-unverified-and-continue', 'runtime-proof-daily-gate'],
  'confirmed-cost-anomaly': ['stop-new-fanout; readonly-diagnosis; reduce-agents', 'continue-fanout-or-mutate-runtime'],
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
assert_lacks "$TEAM" 'mandatory before the first such spawn' 'projection check as a hard spawn gate'

assert_has "$TEAM" 'implementation lane.*GPT-5\.6 Luna max' 'routine implementation prefers Luna max'
assert_has "$TEAM" 'routine review or command verification, prefer Terra' 'routine review and verification prefer Terra'
assert_has "$TEAM" 'Sol medium planner only for planning.*costly or hard to reverse' 'planner Sol is reserved for hard-to-reverse direction'

assert_has "$TEAM" 'phase-reviewer only for a completed phase/final integration result where extra judgment is valuable' 'phase reviewer requires a completed gate and useful judgment'
assert_has "$TEAM" 'mechanical or environmental failures stay on the default path' 'mechanical and environment failures do not escalate'
assert_lacks "$TEAM" 'Upgrade to the Sol phase-reviewer' 'automatic Sol upgrade wording'

assert_has "$TEAM" 'Luna high browser-verifier only for substantial Playwright or visual interaction work' 'browser-heavy work prefers Luna high'
assert_has "$AGENTS/atlas-sdd-browser-verifier.toml" 'would benefit from extra judgment, recommend routing' 'final Sol browser review remains conditional'
assert_lacks "$AGENTS/atlas-sdd-browser-verifier.toml" 'require the controller to route' 'browser evidence cannot force Sol review'

assert_has "$TEAM" 'reasonable available fallback and disclose it' 'unavailable preferred profile permits disclosed fallback'
assert_has "$TEAM" 'otherwise record `unverified` and continue ordinary work' 'invisible metadata does not block ordinary work'
assert_lacks "$TEAM" 'stop before spawning rather than silently selecting' 'missing projection cannot hard-stop ordinary work'

assert_has "$TEAM" 'stop new fan-out, perform only minimal read-only diagnosis' 'confirmed cost anomaly stops new fan-out'
assert_has "$TEAM" 'fall back to the main Codex or fewer subagents' 'confirmed cost anomaly has safe fallback'

assert_has "$AGENTS/atlas-sdd-implementer.toml" 'Do not force a dedicated commit for every slice' 'implementer follows moderate commit boundaries'
assert_lacks "$AGENTS/atlas-sdd-implementer.toml" 'create a dedicated git commit before reporting' 'per-slice commit requirement'

printf 'contract_team_cost_routing: ok\n'
