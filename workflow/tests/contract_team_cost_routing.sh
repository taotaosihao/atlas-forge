#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEAM="$ROOT/plugins/atlas-workflow/skills/team/SKILL.md"
README="$ROOT/plugins/atlas-workflow/README.md"
AGENTS="$ROOT/.codex/agents"

assert_has() {
  local file="$1" pattern="$2" label="$3"
  rg -Uq -- "$pattern" "$file" || {
    printf 'missing required routing behavior: %s\n' "$label" >&2
    exit 1
  }
}

assert_lacks() {
  local file="$1" pattern="$2" label="$3"
  if rg -Uq -- "$pattern" "$file"; then
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
  'routine-implementation': ['default-luna-or-explicit-available-deepseek-single-writer', 'implicit-quality-model-or-default-dual-writer'],
  'implementation-fallback': ['same-authority-takeover-after-writer-quiescence', 'overlapping-or-uncertain-writer-takeover'],
  'plan-or-contract-review': ['default-astra-medium-formal-reviewer-or-explicit-exact-override', 'implicit-terra-luna-or-saving-route'],
  'implementation-review-verify': ['default-terra-high-reviewer-or-verifier', 'saving-route-before-execute-authority'],
  'hard-to-reverse-direction': ['default-astra-high-planner', 'implicit-low-tier-planner'],
  'completed-phase-extra-judgment': ['default-sol-medium-phase-reviewer', 'phase-reviewer-for-routine-review'],
  'implementation-browser-heavy': ['default-luna-high-browser-verifier', 'low-tier-browser-route-before-execute-authority'],
  'implementation-exploration-single': ['luna-or-deepseek-by-live-availability-and-explicit-route', 'default-dual-fanout-or-pre-execute-saving'],
  'implementation-exploration-cross-check': ['same-input-dual-dispatch-when-risk-reduced-or-explicit', 'different-authority-or-implicit-fanout'],
  'quality-mode-explicit': ['all-sol-with-role-specific-reasoning', 'implicit-or-automatic-quality'],
  'schema-restricted': ['main-only; disclose-routing-unavailable', 'generic-inherited-fanout'],
  'profile-mismatch': ['block-spawn; reconcile-policy-profile', 'spawn-with-mismatched-model'],
  'metadata-invisible': ['disclose-unverified; no-billing-proof-required', 'claim-billing-model-verified'],
  'confirmed-cost-anomaly': ['stop-new-fanout; readonly-diagnosis; main-only', 'continue-fanout-or-mutate-runtime'],
  'single-ready-lane': ['dispatch-one-admitted-lane', 'fan-out-unadmitted-or-duplicate'],
  'duplicate-lane': ['coalesce-duplicate-no-fanout', 'duplicate-cross-check-by-default'],
  'dependency-not-ready': ['defer-until-dependency-ready', 'dispatch-before-dependency-ready'],
  'ready-frontier-bounded': ['bounded-parallel-ready-frontier', 'unbounded-or-not-ready-fanout'],
  'record-only-compatibility': ['effective_backend-none-legal-no-parallel-evidence', 'reject-zero-dispatch-finalize'],
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
assert_has "$TEAM" 'bounded parallel dispatch over the admitted ready frontier rather than main-first serial exploration' 'selected Team defaults to bounded ready-frontier parallelism'
assert_has "$TEAM" '## Bounded-Parallel Controller Policy' 'bounded-parallel controller policy is explicit'
assert_has "$TEAM" 'two or more admitted, independent,\s+ready lanes.*same bounded wave by default' 'two ready independent lanes share a bounded wave'
assert_has "$TEAM" 'child_count = min\(ready independent lanes, host available child slots, 4\)' 'bounded wave width is capacity- and lane-limited'
assert_has "$TEAM" 'initial soft wave cap, not a completion or stop condition' 'wave cap is soft and not a stop condition'
assert_has "$TEAM" 'A lane is admitted only with' 'Team lane admission is explicit'
for lane_field in Goal 'output consumer' 'ready input' 'structured output' authority 'stop condition'; do
  assert_has "$TEAM" "$lane_field" "Team lane admission records $lane_field"
done
assert_has "$TEAM" '[Dd]uplicate lanes.*dependency-not-ready lanes' 'duplicate and dependency-not-ready lanes do not fan out'
assert_has "$TEAM" 'tightly\s+coupled implementation remains single-writer' 'tightly coupled implementation remains single-writer'
assert_has "$TEAM" 'Parallel writers are allowed only' 'multiwriter paths require explicit admission'
assert_has "$TEAM" 'disjoint owned paths' 'multiwriter paths require disjoint ownership'
assert_has "$TEAM" 'integration owner' 'multiwriter paths require an integration owner'
assert_has "$TEAM" 'lease/quiescence boundary' 'multiwriter paths require lease/quiescence'
assert_has "$TEAM" 'controller policy, not a runtime scheduler invariant' 'bounded policy is not a runtime scheduler guarantee'
assert_has "$TEAM" 'record-only.*effective_backend=none.*legal' 'record-only Team compatibility remains legal'
assert_has "$TEAM" 'neither is evidence of admitted dispatch' 'record-only does not prove admitted dispatch'
assert_has "$TEAM" 'parallel completion' 'record-only does not prove parallel completion'
assert_lacks "$TEAM" 'Start with the main Codex, but prefer parallel native agents' 'stale main-first staffing prose is removed'
assert_has "$TEAM" 'Before the first native fan-out' 'native routing preflight is mandatory'
assert_has "$TEAM" 'agent_type.*model.*reasoning_effort.*fork_turns' 'preflight checks all exact-routing fields'
assert_has "$TEAM" 'schema-restricted.*main-only' 'restricted schema fails closed to main-only'
assert_has "$TEAM" 'root Codex session keeps its active model, `model_provider`' 'root session provider remains unchanged'
assert_has "$TEAM" 'A `model` override is not a provider switch' 'model override cannot silently switch provider'
assert_has "$TEAM" 'DeepSeek route is child-local' 'DeepSeek provider override stays child-local'
assert_has "$TEAM" 'provider-routing layer' 'provider routing failure is disclosed at the correct layer'
assert_has "$TEAM" 'Every Atlas DeepSeek profile and catalog route uses the exact `max` effort' 'DeepSeek always uses max'
assert_has "$TEAM" 'Never lower native.*to `high`' 'DeepSeek never silently downshifts from max'
assert_has "$TEAM" 'Select Paseo only from an explicit user or operator choice' 'Paseo remains explicit after native DeepSeek routing'
assert_has "$TEAM" 'Never read or apply Paseo orchestration preferences' 'Paseo preferences do not override controller routing'

assert_has "$TEAM" 'Cross v1.*generation-local.*controller-enforced.*non-crash-resumable' 'Cross v1 keeps generation-local controller-only state'
assert_has "$TEAM" 'non-certification-gate' 'Cross v1 is not a certification gate'
assert_has "$TEAM" '`atlas-sdd-planner` at `gpt-6-astra` / `high`' 'Cross Plan defaults to OpenAI GPT-6 Astra high'
assert_has "$TEAM" '`atlas-sdd-planner-deepseek` at `deepseek-v4-pro:deepseek` / `max`' 'Cross Plan defaults to DeepSeek planner max'
assert_has "$TEAM" 'same self-contained packet' 'Cross Plan sends an identical packet'
assert_has "$TEAM" 'fork_turns="none"' 'Cross Plan uses no history fork'
assert_has "$TEAM" 'followup_task.*original planner runtime id' 'Cross Plan sends disputes to the original planner'
assert_has "$TEAM" 'cross-plan-perspective-missing' 'Cross Plan records a missing DeepSeek perspective'
assert_has "$TEAM" 'highest convergence outcome is' 'Cross Plan caps degraded consensus'
node - "$TEAM" <<'NODE'
const fs = require('fs');
const source = fs.readFileSync(process.argv[2], 'utf8');
const section = source.match(/### Cross Plan\n\n([\s\S]*?)\n\n### Cross Execute/);
if (!section) throw new Error('missing parseable Cross Plan section');
const plan = section[1];
if (!/two OpenAI planner\s+runtime ids that are different actors/.test(plan)) {
  throw new Error('Cross Plan degradation must use two different OpenAI planner runtime actors');
}
if (!/Record `cross-plan-perspective-missing`/.test(plan)) {
  throw new Error('Cross Plan degradation must record cross-plan-perspective-missing');
}
const degraded = plan.match(/If the exact DeepSeek route is unavailable,[\s\S]*?fail Cross closed\./)?.[0] || '';
if (!/highest convergence outcome is\s+`CONSENSUS_WITH_RESERVATIONS`/.test(degraded)) {
  throw new Error('Cross Plan degradation must cap the outcome at CONSENSUS_WITH_RESERVATIONS');
}
if (/highest convergence outcome is\s+`(?:CONSENSUS|HUMAN_DECISION_REQUIRED)`/.test(degraded)) {
  throw new Error('Cross Plan degradation must not claim another highest outcome');
}
NODE
assert_has "$TEAM" 'The default pair is an OpenAI' 'Cross Execute has an OpenAI default writer'
assert_has "$TEAM" '`atlas-sdd-implementer` on Saving Luna `max`' 'Cross Execute defaults to Luna writer'
assert_has "$TEAM" '`atlas-sdd-reviewer-deepseek` on `deepseek-v4-pro:deepseek` / `max`' 'Cross Execute defaults to DeepSeek reviewer'
assert_has "$TEAM" 'explicitly selects a DeepSeek writer' 'Cross Execute supports an explicit DeepSeek writer'
assert_has "$TEAM" '`atlas-sdd-implementer-deepseek` with the OpenAI `atlas-sdd-reviewer` on Sol\s+`xhigh`' 'Cross Execute pairs a DeepSeek writer with a high-tier OpenAI reviewer'
assert_has "$TEAM" 'mandatory pre-review examines\s+the real brief and contract' 'Cross Execute contract pre-review cannot downgrade to Terra'
assert_has "$TEAM" 'meaningful\s+read-only pre-review' 'Cross Execute pre-reviews before writer startup'
assert_has "$TEAM" 'Each\s+execute slice has exactly one implementer' 'Cross Execute keeps one writer per slice'
assert_has "$TEAM" 'Actionable current-goal repair\s+findings go back to the original implementer' 'Cross repair follows the original writer'
assert_has "$TEAM" 'rereview\s+always goes back to the original reviewer' 'Cross rereview follows the original reviewer'
assert_has "$TEAM" 'route/profile,' 'Cross route drift is named'
assert_has "$TEAM" 'fails Cross closed' 'Cross actor or route drift fails closed'
assert_has "$TEAM" 'explicitly switch to ordinary Saving Team' 'Saving fallback requires explicit user choice'
assert_has "$TEAM" 'must not be reported as Cross' 'Saving fallback is not Cross success'
assert_has "$TEAM" 'no Paseo fallback, Claude or Fable' 'Cross runtime excludes Paseo, Claude, and Fable'
assert_has "$TEAM" 'cryptographic provider or billing attestation' 'Cross does not claim billing attestation'
assert_has "$TEAM" 'release-certification authority' 'Cross does not grant release certification'
assert_has "$TEAM" 'suffix identifies the model supplier' 'Cross names the DeepSeek supplier suffix'
assert_has "$TEAM" '`zenmux` identifies the transport/provider' 'Cross distinguishes ZenMux transport from supplier'
assert_has "$TEAM" 'atlas-native-agent-inbox put atlas_sdd_planner.*before calling `spawn_agent`' 'Cross stages the planner logical-role slot before spawn'
assert_has "$TEAM" 'atlas-native-agent-inbox put atlas_sdd_reviewer.*before calling `spawn_agent`' 'Cross stages the reviewer logical-role slot before spawn'

assert_has "$TEAM" 'Default Planning And Contract Review Mode' 'planning and contract review high-tier default is visible'
assert_has "$TEAM" 'no-argument policy\s+check resolves this matrix' 'no-argument model policy defaults to planning-review'
assert_has "$TEAM" 'Formal plan or contract review.*atlas-sdd-phase-reviewer.*gpt-6-astra.*medium.*none' 'formal plan or contract review defaults to GPT-6 Astra medium'
assert_has "$TEAM" 'Additional independent plan or contract review.*atlas-sdd-reviewer.*gpt-6-astra.*medium.*none' 'additional plan or contract review defaults to GPT-6 Astra medium'
assert_has "$TEAM" 'Fable or\s+another high-tier model[\s\S]*explicitly selects the exact provider/model route' 'Fable or another high-tier route requires an exact selection'
assert_has "$TEAM" 'same exact per-lane authority may explicitly choose\s+a lower model' 'an explicit lane selection may override the high-tier default'
assert_has "$TEAM" 'does not fall back to Terra, Luna, or another low-tier\s+route for planning or contract review' 'unavailable advanced review route cannot degrade to a low-tier model'
assert_has "$TEAM" 'Implementation-Stage Saving Mode' 'saving mode is explicitly implementation-scoped'
assert_has "$TEAM" 'only after explicit user implementation authority has\s+entered Execute' 'saving mode requires implementation Execute authority'
assert_has "$TEAM" 'must never author or review a plan or contract' 'saving mode cannot review a plan or contract'
assert_has "$TEAM" 'only after staffing\s+has independently established that the lane is useful' 'saving mode follows staffing rather than creating Team'
assert_has "$TEAM" 'atlas-sdd-implementer.*gpt-5\.6-luna.*max.*none' 'routine implementation defaults to Luna max'
assert_has "$TEAM" 'atlas-sdd-implementer-deepseek.*deepseek-v4-pro:deepseek.*max.*none' 'DeepSeek V4 Pro implementation always uses max'
assert_has "$TEAM" 'atlas-sdd-planner-deepseek.*deepseek-v4-pro:deepseek.*max.*none' 'DeepSeek V4 Pro planning always uses max'
assert_has "$TEAM" 'same logical writable implementation role' 'Luna and DeepSeek preserve one logical implementation responsibility'
assert_has "$TEAM" '[Nn]ever send the same writable packet to both' 'implementation alternatives are not a duplicate-writer fanout'
assert_has "$TEAM" 'predecessor writer is quiesced' 'writable fallback requires quiescence'
assert_has "$TEAM" 'Implementation slice review.*atlas-sdd-reviewer.*gpt-5\.6-terra.*max.*none' 'implementation slice review defaults to Terra max'
assert_has "$TEAM" 'atlas-sdd-reviewer-deepseek.*deepseek-v4-pro:deepseek.*max.*none' 'DeepSeek V4 Pro review always uses max'
assert_has "$TEAM" 'Implementation command or business verification.*atlas-sdd-verifier.*gpt-5\.6-terra.*high.*none' 'implementation verification defaults to Terra high'
assert_has "$TEAM" 'Implementation replanning.*atlas-sdd-planner.*gpt-5\.6-sol.*high.*none' 'implementation replanning remains on Sol high'

assert_has "$TEAM" 'atlas-sdd-phase-reviewer.*gpt-5\.6-sol.*medium.*none' 'phase reviewer explicitly routes to Sol medium'
assert_has "$TEAM" 'mechanical or\s+environmental failures stay on the ordinary reviewer/verifier path' 'mechanical and environment failures do not escalate'
assert_lacks "$TEAM" 'Upgrade to the Sol phase-reviewer' 'automatic Sol upgrade wording'

assert_has "$TEAM" 'atlas-sdd-browser-verifier.*gpt-5\.6-luna.*xhigh.*none' 'browser-heavy work defaults to Luna xhigh'
assert_has "$TEAM" 'atlas-sdd-explorer.*gpt-5\.6-luna.*max.*none' 'exploration defaults to Luna max'
assert_has "$TEAM" 'atlas-sdd-explorer-deepseek.*deepseek-v4-pro:deepseek.*max.*none' 'DeepSeek V4 Pro exploration always uses max'
assert_has "$TEAM" 'atlas-sdd-planner-deepseek.*deepseek-v4-pro:deepseek.*max.*none' 'DeepSeek planner is present in the native matrix'
assert_has "$TEAM" 'atlas-sdd-reviewer-deepseek.*deepseek-v4-pro:deepseek.*max.*none' 'DeepSeek reviewer is present in the native matrix'
assert_has "$TEAM" 'Atlas always selects `max`' 'DeepSeek V4 Pro native profiles use max explicitly'
assert_has "$TEAM" 'configured `low` / `high` / `max` capability set' 'DeepSeek catalog preserves the configured effort set'
assert_has "$TEAM" 'same logical read-only exploration role' 'Luna and DeepSeek preserve one logical responsibility'
assert_has "$TEAM" 'per-lane decision, never a default fan-out' 'dual cross-check is conditional'
assert_has "$TEAM" 'same self-contained packet' 'dual cross-check uses identical acceptance input'
assert_has "$TEAM" 'main Codex compares evidence' 'controller synthesizes model disagreement'
assert_has "$TEAM" 'cannot bypass the host/model allowlist' 'catalog cannot bypass host admission'
assert_has "$TEAM" 'atlas-team-model-catalog' 'Team documents the allowlist catalog projection'
assert_has "$TEAM" 'planning-review/saving/quality Atlas custom-agent profiles intentionally omit `model`, `model_reasoning_effort`, and `model_provider`' 'stage-aware profiles cannot shadow explicit routing'
assert_has "$TEAM" 'provider-bound DeepSeek equivalent profiles are the explicit exception' 'DeepSeek profiles preserve child-local provider routing'
assert_has "$AGENTS/atlas-sdd-explorer.toml" 'sandbox_mode = "read-only"' 'Luna explorer has an explicit read-only sandbox'
assert_has "$AGENTS/atlas-sdd-explorer-deepseek.toml" 'sandbox_mode = "read-only"' 'DeepSeek explorer has an explicit read-only sandbox'
assert_has "$AGENTS/atlas-sdd-explorer-deepseek.toml" '^model_provider = "zenmux"$' 'DeepSeek explorer binds ZenMux locally'
assert_lacks "$AGENTS/atlas-sdd-explorer.toml" '^model_provider = "zenmux"$' 'Luna explorer does not inherit the DeepSeek provider'
assert_has "$AGENTS/atlas-sdd-explorer-deepseek.toml" 'command = "atlas-zenmux-bearer-token"' 'DeepSeek agent reuses isolated credential helper'
assert_lacks "$AGENTS/atlas-sdd-explorer-deepseek.toml" 'experimental_bearer_token' 'DeepSeek agent does not copy credentials'
assert_has "$AGENTS/atlas-sdd-planner.toml" 'sandbox_mode = "read-only"' 'Luna planner has an explicit read-only sandbox'
assert_has "$AGENTS/atlas-sdd-reviewer.toml" 'sandbox_mode = "read-only"' 'Luna reviewer has an explicit read-only sandbox'
assert_has "$AGENTS/atlas-sdd-planner-deepseek.toml" '^model_provider = "zenmux"$' 'DeepSeek planner binds ZenMux locally'
assert_has "$AGENTS/atlas-sdd-planner-deepseek.toml" '^model = "deepseek-v4-pro:deepseek"$' 'DeepSeek planner binds the exact routed model'
assert_has "$AGENTS/atlas-sdd-planner-deepseek.toml" '^model_reasoning_effort = "max"$' 'DeepSeek planner preserves max effort'
assert_has "$AGENTS/atlas-sdd-planner-deepseek.toml" '^model_catalog_json = "~/.codex/model-catalogs/zenmux-deepseek.json"$' 'DeepSeek planner uses the isolated catalog'
assert_has "$AGENTS/atlas-sdd-planner-deepseek.toml" 'sandbox_mode = "read-only"' 'DeepSeek planner has a hard read-only sandbox'
assert_has "$AGENTS/atlas-sdd-planner-deepseek.toml" 'command = "atlas-zenmux-bearer-token"' 'DeepSeek planner reuses isolated credential helper'
assert_lacks "$AGENTS/atlas-sdd-planner-deepseek.toml" 'experimental_bearer_token' 'DeepSeek planner does not copy credentials'
assert_has "$AGENTS/atlas-sdd-reviewer-deepseek.toml" '^model_provider = "zenmux"$' 'DeepSeek reviewer binds ZenMux locally'
assert_has "$AGENTS/atlas-sdd-reviewer-deepseek.toml" '^model = "deepseek-v4-pro:deepseek"$' 'DeepSeek reviewer binds the exact routed model'
assert_has "$AGENTS/atlas-sdd-reviewer-deepseek.toml" '^model_reasoning_effort = "max"$' 'DeepSeek reviewer preserves max effort'
assert_has "$AGENTS/atlas-sdd-reviewer-deepseek.toml" '^model_catalog_json = "~/.codex/model-catalogs/zenmux-deepseek.json"$' 'DeepSeek reviewer uses the isolated catalog'
assert_has "$AGENTS/atlas-sdd-reviewer-deepseek.toml" 'sandbox_mode = "read-only"' 'DeepSeek reviewer has a hard read-only sandbox'
assert_has "$AGENTS/atlas-sdd-reviewer-deepseek.toml" 'command = "atlas-zenmux-bearer-token"' 'DeepSeek reviewer reuses isolated credential helper'
assert_lacks "$AGENTS/atlas-sdd-reviewer-deepseek.toml" 'experimental_bearer_token' 'DeepSeek reviewer does not copy credentials'
assert_has "$AGENTS/atlas-sdd-implementer-deepseek.toml" 'IMPLEMENTER_REPORT_JSON' 'DeepSeek implementer preserves the implementer output contract'
assert_has "$AGENTS/atlas-sdd-implementer-deepseek.toml" '^model_provider = "zenmux"$' 'DeepSeek implementer binds ZenMux locally'
assert_lacks "$AGENTS/atlas-sdd-implementer.toml" '^model_provider = "zenmux"$' 'Luna implementer does not inherit the DeepSeek provider'
assert_has "$AGENTS/atlas-sdd-implementer-deepseek.toml" 'command = "atlas-zenmux-bearer-token"' 'DeepSeek implementer reuses isolated credential helper'
assert_lacks "$AGENTS/atlas-sdd-implementer-deepseek.toml" 'experimental_bearer_token' 'DeepSeek implementer does not copy credentials'
assert_lacks "$AGENTS/atlas-sdd-implementer-deepseek.toml" '^sandbox_mode\s*=' 'DeepSeek implementer does not override Luna authority inheritance'
assert_has "$TEAM" 'Explicit Quality Mode' 'quality mode is separately defined'
assert_has "$TEAM" 'explicitly requests\s+quality mode' 'quality mode requires an explicit user request'
assert_has "$TEAM" '\| Planning \| `atlas-sdd-planner` \| `gpt-5\.6-sol` \| `max` \| `none` \|' 'quality planning routes to Sol max'
assert_has "$TEAM" 'atlas-sdd-implementer.*gpt-5\.6-sol.*medium.*none' 'quality implementation routes to Sol medium'
assert_has "$TEAM" 'atlas-sdd-reviewer.*gpt-5\.6-sol.*xhigh.*none' 'quality review routes to Sol xhigh'
assert_has "$TEAM" 'atlas-sdd-verifier.*gpt-5\.6-sol.*medium.*none' 'quality verification routes to Sol medium'
assert_has "$TEAM" 'atlas-sdd-phase-reviewer.*gpt-5\.6-sol.*xhigh.*none' 'quality phase review routes to Sol xhigh'
assert_has "$TEAM" 'atlas-sdd-browser-verifier.*gpt-5\.6-sol.*medium.*none' 'quality browser verification routes to Sol medium'
assert_has "$TEAM" 'atlas-sdd-explorer.*gpt-5\.6-sol.*high.*none' 'quality exploration routes to Sol high'
assert_has "$TEAM" 'Do not infer an all-Sol implementation\s+route' 'quality implementation mode is never activated automatically'
assert_has "$TEAM" 'atlas-agent-model-policy check --mode quality' 'quality mode validates the all-Sol dispatch matrix'
assert_has "$TEAM" 'staffing_mode' 'staffing is an independent decision'
assert_has "$TEAM" 'model_policy' 'model policy is an independent decision'
assert_has "$TEAM" 'release_mode' 'release mode is an independent decision'
assert_has "$TEAM" 'Do not create Team just to obtain a model route' 'model routing does not create Team'
assert_has "$TEAM" 'Team does not imply saving or\s+quality mode' 'Team does not imply a model mode'
assert_has "$TEAM" 'does not rewrite the root host model' 'Atlas does not rewrite the host model'
assert_has "$TEAM" 'not persisted as workflow state' 'model selection is not persisted'
assert_has "$TEAM" 'Main-only single writers' 'single writers do not require a lease'
assert_has "$TEAM" 'does not require a lease by default' 'isolated product increment writer has no default lease'
assert_has "$TEAM" 'does not enter execution-vnext or acquire a durable' 'quick writer avoids durable execution-vnext attempt'
assert_has "$TEAM" 'Formal `product_release` execution continues to use the existing execution-vnext' 'strict release lease remains'
assert_has "$README" 'Staffing, Team, path lease, model choice, and release mode are independent' 'README keeps decisions orthogonal'
assert_has "$README" 'root host model' 'README protects host model'
assert_has "$README" 'planning and formal plan/contract review use[\s\S]*planning-review[\s\S]*frontier route by default' 'README documents the high-tier planning-review default'
assert_has "$README" 'Saving mode is available only after explicit Execute\s+authority' 'README limits saving mode to implementation Execute'
assert_has "$AGENTS/atlas-sdd-browser-verifier.toml" 'would benefit from extra judgment, recommend routing' 'final Sol browser review remains conditional'
assert_lacks "$AGENTS/atlas-sdd-browser-verifier.toml" 'require the controller to route' 'browser evidence cannot force Sol review'

assert_has "$TEAM" 'fork_turns="none"' 'custom role dispatch avoids full-history fork'
assert_has "$TEAM" 'self-contained dispatch packet' 'fresh child receives a complete task packet'
assert_has "$TEAM" 'atlas-native-agent-inbox put atlas_sdd_explorer.*atlas-native-agent-inbox put atlas_sdd_implementer' 'DeepSeek native dispatch stages the exact packet in a logical-role slot'
assert_has "$TEAM" 'also pass the same packet as `message`' 'compatibility transport preserves the native message contract'
assert_has "$TEAM" 'not a Paseo fallback' 'compatibility transport remains a native Codex dispatch'
assert_has "$TEAM" 'terminal and quiesced.*delete the corresponding role slot' 'DeepSeek packet cleanup waits for quiescence'
assert_has "$TEAM" 'serialized independently.*Luna peer.*may still run concurrently' 'role slots fail closed without blocking Luna cross-checking'
assert_has "$TEAM" 'inbox `get` alone does not prove usable routing' 'transport bootstrap is not confused with a complete tool loop'
assert_has "$AGENTS/atlas-sdd-explorer-deepseek.toml" 'empty visible Payload plus encrypted content' 'DeepSeek explorer has the encrypted-payload bootstrap'
assert_has "$AGENTS/atlas-sdd-implementer-deepseek.toml" 'empty visible Payload plus encrypted content' 'DeepSeek implementer has the encrypted-payload bootstrap'
assert_has "$AGENTS/atlas-sdd-explorer-deepseek.toml" 'atlas-native-agent-inbox get atlas_sdd_explorer' 'DeepSeek explorer uses only its stable logical-role slot'
assert_has "$AGENTS/atlas-sdd-implementer-deepseek.toml" 'atlas-native-agent-inbox get atlas_sdd_implementer' 'DeepSeek implementer uses only its stable logical-role slot'
assert_has "$AGENTS/atlas-sdd-explorer-deepseek.toml" 'Never list the inbox, read another role' 'DeepSeek explorer cannot scan other role packets'
assert_has "$AGENTS/atlas-sdd-implementer-deepseek.toml" 'Never list the inbox, read another role' 'DeepSeek implementer cannot scan other role packets'
assert_has "$AGENTS/atlas-sdd-planner-deepseek.toml" 'empty visible Payload plus encrypted content' 'DeepSeek planner has the encrypted-payload bootstrap'
assert_has "$AGENTS/atlas-sdd-planner-deepseek.toml" 'atlas-native-agent-inbox get atlas_sdd_planner' 'DeepSeek planner uses only its stable logical-role slot'
assert_has "$AGENTS/atlas-sdd-planner-deepseek.toml" 'Never list the inbox, read another role' 'DeepSeek planner cannot scan other role packets'
assert_has "$AGENTS/atlas-sdd-reviewer-deepseek.toml" 'empty visible Payload plus encrypted content' 'DeepSeek reviewer has the encrypted-payload bootstrap'
assert_has "$AGENTS/atlas-sdd-reviewer-deepseek.toml" 'atlas-native-agent-inbox get atlas_sdd_reviewer' 'DeepSeek reviewer uses only its stable logical-role slot'
assert_has "$AGENTS/atlas-sdd-reviewer-deepseek.toml" 'Never list the inbox, read another role' 'DeepSeek reviewer cannot scan other role packets'
assert_has "$TEAM" '`task_name`.*does not select' 'task name is not treated as a custom-agent selector'
assert_has "$TEAM" 'Outside that explicit override[\s\S]*mismatch[\s\S]*do not spawn' 'unexpected dispatch and policy mismatch blocks spawn'
assert_lacks "$TEAM" 'reasonable available fallback and disclose it' 'unavailable exact profile cannot use a generic fallback'
assert_lacks "$TEAM" 'default_subagent_model' 'team does not require a global default subagent model'
assert_lacks "$TEAM" 'session JSONL' 'team does not require strict session-log auditing'

assert_has "$TEAM" 'stop new fan-out, perform only minimal read-only diagnosis' 'confirmed cost anomaly stops new fan-out'
assert_has "$TEAM" 'fall back to main-only' 'confirmed cost anomaly has a deterministic safe fallback'

assert_has "$AGENTS/atlas-sdd-implementer.toml" 'Do not force a dedicated commit for every slice' 'implementer follows moderate commit boundaries'
assert_lacks "$AGENTS/atlas-sdd-implementer.toml" 'create a dedicated git commit before reporting' 'per-slice commit requirement'

for native_role in planner implementer reviewer verifier phase-reviewer browser-verifier explorer; do
  assert_lacks "$AGENTS/atlas-sdd-$native_role.toml" '^model\s*=' "$native_role leaves model selection to explicit dispatch"
  assert_lacks "$AGENTS/atlas-sdd-$native_role.toml" '^model_reasoning_effort\s*=' "$native_role leaves reasoning selection to explicit dispatch"
  assert_lacks "$AGENTS/atlas-sdd-$native_role.toml" '^model_provider\s*=' "$native_role leaves provider selection to explicit dispatch"
done

printf 'contract_team_cost_routing: ok\n'
