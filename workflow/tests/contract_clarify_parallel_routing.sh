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
const goal = source.search(/Before\s+brownfield discovery(?:\s+or any optional\s+fan-out)?,\s+main Codex freezes the minimal Goal/);
const facts = source.indexOf('Collect brownfield facts after the Goal is frozen');
if (goal < 0 || facts < 0 || goal >= facts) {
  throw new Error('Clarify must freeze Goal before brownfield discovery');
}
NODE

assert_has '^## Clarify Main-Only Default' 'main-only Clarify policy section is explicit'
assert_has 'Before\s+brownfield discovery(?:\s+or any optional\s+fan-out)?,\s+main Codex freezes the minimal Goal' 'Goal freeze precedes discovery'
assert_has 'Clarify is main-only by default' 'Clarify defaults to the main Codex'
assert_has 'Task size, file count, a short request, or a non-tiny label do\s+not by themselves justify a child lane' 'task complexity does not auto-create a child'
assert_lacks 'non-tiny Clarify,?\s+the default is `main \+ at least one read-only child\s+lane`' 'non-tiny Clarify must not auto-create a child'
assert_has 'independent evidence domain or specialist\s+perspective has a concrete consumer' 'optional child needs a concrete consumer'
assert_has 'materially reduce\s+critical-path latency or a named current risk' 'optional child needs latency or risk value'
assert_has 'two or more independently justified, ready, non-duplicate child lanes' 'parallel Clarify requires independently justified lanes'
assert_has 'may run in parallel' 'independently justified lanes may fan out concurrently'
assert_has 'Clarify wave has at most three child lanes' 'Clarify child wave has a maximum of three'
assert_has 'child_count = min\(ready justified lanes, host available child slots, 3\)' 'Clarify wave uses its three-child bounded width'
assert_has 'soft\s+wave cap is not a completion or stop condition' 'wave cap is not a completion or stop condition'
assert_lacks 'child_count = min\(ready independent lanes, host available child slots, 4\)' 'Team four-child cap must not widen a Clarify wave'

# Every admitted discovery lane must be useful, attributable, and bounded.
assert_has 'Admit a candidate lane only when' 'lane admission rule is explicit'
for lane_field in Goal consumer 'ready input' authority 'structured expected output' 'stop condition'; do
  assert_has "$lane_field" "lane admission records $lane_field"
done
assert_has 'concrete latency/risk benefit|materially reduce.*latency|named current risk' 'lane admission requires a latency or named-risk benefit'
assert_has '[Dd]uplicate.*lane|coalesce.*duplicate|non-duplicative' 'duplicate lanes are coalesced rather than fanned out'
assert_has 'dependency.*not.*ready|dependencies.*ready.*before|defer.*not.*ready' 'dependency-not-ready lanes are deferred'

# Main owns the canonical scope and all synthesis; child findings cannot grant scope.
assert_has 'main Codex is the sole canonical scope/artifact writer and final\s+synthesizer' 'main is the sole canonical scope writer and synthesizer'
assert_has 'final\s+synthesizer|conflict.*synthes' 'main is the final synthesizer'
assert_has 'child.*(cannot|must not|may not).*expand.*Goal|findings.*cannot.*expand.*Goal|discovery.*cannot.*rewrite.*Goal' 'child findings cannot expand the Goal'
assert_has 'create workflow artifacts|write project documents' 'children cannot write canonical scope or workflow artifacts'

# This is a controller policy only. It does not introduce scheduler state or a
# runtime guarantee, and it keeps zero-dispatch Team compatibility intact.
assert_has 'controller.*(scheduling )?policy' 'policy is explicitly controller-level'
assert_has 'not.*runtime.*(scheduler )?guarantee|not.*runtime.*invariant|not.*runtime.*enforce' 'policy does not claim a runtime scheduler guarantee'
assert_has 'record-only.*compatib|effective_backend=none|effective_backend.*none' 'record-only compatibility remains explicit'
assert_has 'does not.*prove.*parallel|not.*evidence.*parallel|not parallel evidence|zero-dispatch' 'record-only state is not parallelism evidence'
assert_lacks 'parallel_required|frontier_status|fanout_required' 'no new parallel scheduler schema field is introduced'
assert_lacks 'automatically create.*(actor|scheduler)|runtime scheduler (guarantee|enforced|required)|scheduler daemon' 'Clarify does not promise a runtime scheduler'

# Existing fail-closed routing and release authority must remain visible in the
# Clarify policy while fan-out defaults change.
assert_has 'schema/profile' 'schema-restricted routing remains fail closed'
assert_has 'exact-route|exact spawn[[:space:]]+schema/profile|schema/profile/model' 'profile and exact-route mismatch remain fail closed'
assert_has 'cost anomaly|cost-anomaly|confirmed.*cost' 'confirmed cost anomaly remains fail closed'
assert_has 'main-only|main only' 'fallback has an explicit main-only path'
for failure_mode in 'cannot start' 'times out' 'becomes unavailable' 'no usable output'; do
  assert_has "$failure_mode" "child failure mode is explicit: $failure_mode"
done
assert_has 'otherwise stop\s+and report the blocker' 'unsafe main-only fallback stops instead of degrading silently'
assert_has '[Dd]isclose[[:space:]]+which independently justified perspective was\s+unavailable' 'main-only fallback discloses the missing perspective'
assert_has 'never report a degraded main-only result as completed\s+multi-agent clarification' 'degraded fallback cannot claim completed multi-agent clarification'
assert_has 'product_release.*execution-vnext|execution-vnext.*product_release' 'release execution remains execution-vnext'
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
  [/Clarify 默认 main-only；有明确消费者且能降延迟\/风险才建 child/, 'Clarify defaults main-only and justifies optional children'],
  [/Team: bounded ready waves/, 'selected Team keeps bounded ready-frontier waves'],
  [/Task\/CW不自动进Team/, 'Task/CW do not auto-upgrade to Team'],
  [/model\/lease\/release 独立/, 'decision axes remain independent'],
  [/Certified 非发布/, 'certification remains distinct from actual release'],
];
for (const [pattern, label] of required) {
  if (!pattern.test(prompts)) throw new Error(`manifest prompt missing: ${label}`);
}
if (/Task\/CW\s*不进\s*Team/.test(prompts)) {
  throw new Error('manifest prompt must not prohibit all Task/CW Team routing');
}
NODE

printf 'contract_clarify_parallel_routing: ok\n'
