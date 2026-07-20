#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEAM="$ROOT/plugins/atlas-workflow/skills/team/SKILL.md"
REFERENCE="$ROOT/plugins/atlas-workflow/skills/team/references/code-review.md"

assert_has() {
  local file="$1" pattern="$2" label="$3"
  rg -q -- "$pattern" "$file" || {
    printf 'missing deliberative review behavior: %s\n' "$label" >&2
    exit 1
  }
}

assert_lacks() {
  local file="$1" pattern="$2" label="$3"
  if rg -q -- "$pattern" "$file"; then
    printf 'found over-constrained review behavior: %s\n' "$label" >&2
    exit 1
  fi
}

test -f "$REFERENCE"

assert_has "$TEAM" 'There is no required council shape' 'roles and agent count remain dynamic'
assert_has "$TEAM" 'Two or three perspectives are often useful, but this is guidance rather than a staffing gate' 'perspective count is a recommendation'
assert_has "$TEAM" 'independent first-round position' 'initial review stays independent'
assert_has "$TEAM" 'Keep useful review agents available after their initial findings' 'review agents remain available for deliberation'
assert_has "$TEAM" 'same relevant agents with `paseo send` or native `followup_task`' 'follow-up reuses the original agents'
assert_has "$TEAM" 'normally converge within two or three rounds' 'review has a lightweight convergence target'
assert_has "$TEAM" 'operating target, not a hard semantic limit' 'round target is not a hard stop'
assert_has "$TEAM" 'return a concise human decision packet' 'persistent material disagreement reaches a human'
assert_has "$TEAM" 'Silence, timeout, an unavailable reviewer, or unsupported agreement is not consensus' 'false consensus is prohibited'
assert_has "$TEAM" 'must not present itself as the missing independent reviewer' 'main controller cannot impersonate independent review'
assert_has "$TEAM" 'no unresolved disagreement remains that would materially change the final recommendation' 'convergence is recommendation-oriented'
assert_has "$TEAM" 'references/code-review.md' 'optional detailed reference is routed'

assert_has "$REFERENCE" 'Perspective Menu' 'task-adapted perspective menu exists'
assert_has "$REFERENCE" 'strongest counterargument against accepting the change as-is' 'adversarial perspective is recommended'
assert_has "$REFERENCE" 'path and line when applicable' 'findings are evidence-located'
assert_has "$REFERENCE" 'Critical.*, `Important`.*, or `Minor`' 'Atlas severity vocabulary is preserved'
assert_has "$REFERENCE" 'what evidence would change the role' 'disagreement asks for falsifiable evidence'
assert_has "$REFERENCE" 'HUMAN_DECISION_REQUIRED' 'human escalation is represented'
assert_has "$REFERENCE" 'Make blockers impossible to miss' 'final synthesis surfaces blockers'
assert_has "$REFERENCE" 'validated controller resolution remains the finding-scope authority' 'SDD admission authority is preserved'
assert_has "$REFERENCE" 'do not grant repair scope' 'review discussion cannot expand implementation authority'

assert_lacks "$TEAM" 'must use exactly [0-9]+ reviewers' 'fixed reviewer count'
assert_lacks "$TEAM" 'code-reviewer and architect' 'fixed reviewer role pair'
assert_lacks "$REFERENCE" 'Functions < 50|Cyclomatic complexity < 10|nesting depth.*4' 'language-independent numeric code gates'

printf 'contract_team_review: ok\n'
