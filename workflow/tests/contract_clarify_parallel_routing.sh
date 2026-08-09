#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLARIFY="$ROOT/plugins/atlas-workflow/skills/clarify/SKILL.md"
MANIFEST="$ROOT/plugins/atlas-workflow/.codex-plugin/plugin.json"

assert_has() {
  local pattern="$1" label="$2"
  rg -Uq -- "$pattern" "$CLARIFY" || {
    printf 'missing Clarify bounded-parallel policy: %s\n' "$label" >&2
    exit 1
  }
}

assert_lacks() {
  local pattern="$1" label="$2"
  if rg -Uq -- "$pattern" "$CLARIFY"; then
    printf 'found forbidden Clarify parallel behavior: %s\n' "$label" >&2
    exit 1
  fi
}

# Goal authority and discovery ordering are structural policy, not suggestions.
node - "$CLARIFY" <<'NODE'
const fs = require('fs');
const source = fs.readFileSync(process.argv[2], 'utf8');
const goal = source.search(/Before\s+brownfield discovery(?:\s+or fan-out)?,\s+main Codex freezes the minimal Goal/);
const facts = source.indexOf('Collect brownfield facts after the Goal is frozen');
if (goal < 0 || facts < 0 || goal >= facts) {
  throw new Error('Clarify must freeze Goal before brownfield discovery');
}
NODE

assert_has '^## Clarify Bounded-Parallel Default' 'bounded-parallel policy section is explicit'
assert_has 'Before\s+brownfield discovery(?:\s+or fan-out)?,\s+main Codex freezes the minimal Goal' 'Goal freeze precedes discovery'
assert_has 'non-tiny Clarify,?\s+the default is `main \+ at least one read-only child\s+lane`' 'non-tiny Clarify uses main plus at least one child'
assert_has 'two or more independent, ready, non-duplicate\s+unknown\s+clusters with explicit consumers' 'independent ready unknown clusters have explicit consumers'
assert_has 'dispatch.*in parallel' 'two or more independent ready unknown clusters fan out concurrently'
assert_has 'first Clarify wave has at most three child lanes|Clarify wave has at most three child lanes' 'Clarify child wave has a maximum of three'
assert_has 'child_count = min\(ready independent lanes, host available child slots, 3\)' 'Clarify wave uses its three-child bounded width'
assert_has 'soft wave\s+cap is not a completion or stop\s+condition' 'wave cap is not a completion or stop condition'
assert_lacks 'child_count = min\(ready independent lanes, host available child slots, 4\)' 'Team four-child cap must not widen a Clarify wave'

# Every admitted discovery lane must be useful, attributable, and bounded.
assert_has 'Admit a candidate lane only when' 'lane admission rule is explicit'
for lane_field in Goal consumer 'ready input' authority 'structured expected output' 'stop condition'; do
  assert_has "$lane_field" "lane admission records $lane_field"
done
assert_has 'critical-path.*risk benefit|benefit.*risk.*reduction|reduce.*critical.*path.*time|named risk' 'lane admission requires a latency or named-risk benefit'
assert_has '[Dd]uplicate.*lane|coalesce.*duplicate|non-duplicative' 'duplicate lanes are coalesced rather than fanned out'
assert_has 'dependency.*not.*ready|dependencies.*ready.*before|defer.*not.*ready' 'dependency-not-ready lanes are deferred'

# Main owns the canonical scope and all synthesis; child findings cannot grant scope.
assert_has 'main Codex is the sole canonical scope/artifact writer and final\s+synthesizer' 'main is the sole canonical scope writer and synthesizer'
assert_has 'final.*synthesizer|conflict.*synthes' 'main is the final synthesizer'
assert_has 'child.*(cannot|must not|may not).*expand.*Goal|findings.*cannot.*expand.*Goal|discovery.*cannot.*rewrite.*Goal' 'child findings cannot expand the Goal'
assert_has 'create workflow artifacts|write project documents' 'children cannot write canonical scope or workflow artifacts'

# This is a controller policy only. It does not introduce scheduler state or a
# runtime guarantee, and it keeps zero-dispatch Team compatibility intact.
assert_has 'controller.*(scheduling )?policy' 'policy is explicitly controller-level'
assert_has 'not.*runtime.*(scheduler )?guarantee|not.*runtime.*invariant|not.*runtime.*enforce' 'policy does not claim a runtime scheduler guarantee'
assert_has 'record-only.*compatib|effective_backend=none|effective_backend.*none' 'record-only compatibility remains explicit'
assert_has 'does not.*prove.*parallel|not.*evidence.*parallel|zero-dispatch' 'record-only state is not parallelism evidence'
assert_lacks 'parallel_required|frontier_status|fanout_required' 'no new parallel scheduler schema field is introduced'
assert_lacks 'automatically create.*(actor|scheduler)|runtime scheduler (guarantee|enforced|required)|scheduler daemon' 'Clarify does not promise a runtime scheduler'

# Existing fail-closed routing and release authority must remain visible in the
# Clarify policy while fan-out defaults change.
assert_has 'schema/profile' 'schema-restricted routing remains fail closed'
assert_has 'exact-route|exact spawn[[:space:]]+schema/profile|schema/profile/model' 'profile and exact-route mismatch remain fail closed'
assert_has 'cost anomaly|cost-anomaly|confirmed.*cost' 'confirmed cost anomaly remains fail closed'
assert_has 'main-only|main only' 'fallback has an explicit main-only path'
assert_has 'product_release.*execution-v3|execution-v3.*product_release' 'release execution remains execution-v3'
assert_has 'immutable Profile|immutable.*Profile' 'release keeps an immutable Profile'
assert_has 'terminal.*(release|certification).*slice|final.*sweep' 'release keeps a terminal final sweep'
assert_has 'completion-derived.*release_decision|release_decision.*completion-derived' 'only completion-derived release decision is authoritative'
assert_has 'certified.*(source-level )?release-ready|release-ready.*certified' 'release-ready remains gated by certified status'
assert_has 'never.*(prove|authorize).*install|never.*(authorize|prove).*push|deployment.*publication.*actual release' 'release certification does not authorize external release actions'

# The runtime-facing manifest prompt must preserve the qualifiers that compact
# prose is most likely to lose.
node - "$MANIFEST" <<'NODE'
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const prompts = manifest.interface.defaultPrompt.join('\n');
const required = [
  [/非tiny Clarify: main\+read-only child/, 'non-tiny Clarify keeps a read-only child'],
  [/Team: bounded ready waves/, 'selected Team keeps bounded ready-frontier waves'],
  [/Task\/CW 不进 Team/, 'Task/CW do not auto-upgrade to Team'],
  [/Saving\/model\/lease\/release 独立/, 'decision axes remain independent'],
  [/Certified 仅源码就绪，非发布/, 'certification remains source-ready rather than released'],
];
for (const [pattern, label] of required) {
  if (!pattern.test(prompts)) throw new Error(`manifest prompt missing: ${label}`);
}
NODE

printf 'contract_clarify_parallel_routing: ok\n'
