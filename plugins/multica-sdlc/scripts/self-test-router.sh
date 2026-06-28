#!/usr/bin/env bash
set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROUTER="$PLUGIN_ROOT/scripts/multica-next-role-router"
TEMPLATE="$PLUGIN_ROOT/templates/multica-sdlc-workflow.yaml"
EVENTS="$PLUGIN_ROOT/examples/router-events"

assert_route() {
  local event_name="$1"
  local expected_action="$2"
  local expected_phase="$3"
  local expected_roles_json="$4"
  local output
  output="$("$ROUTER" --template "$TEMPLATE" --event "$EVENTS/$event_name.json")"
  node - "$output" "$expected_action" "$expected_phase" "$expected_roles_json" <<'NODE'
const actual = JSON.parse(process.argv[2]);
const expectedAction = process.argv[3];
const expectedPhase = process.argv[4];
const expectedRoles = JSON.parse(process.argv[5]);

if (actual.action !== expectedAction) {
  throw new Error(`action mismatch: ${actual.action} != ${expectedAction}`);
}
if (actual.next_phase !== expectedPhase) {
  throw new Error(`phase mismatch: ${actual.next_phase} != ${expectedPhase}`);
}
if (JSON.stringify(actual.next_roles) !== JSON.stringify(expectedRoles)) {
  throw new Error(`roles mismatch: ${JSON.stringify(actual.next_roles)} != ${JSON.stringify(expectedRoles)}`);
}
NODE
}

assert_route contract-coder-ready wait contract '[]'
assert_route contract-ready dispatch implementation '["coder"]'
assert_route coder-done dispatch validation '["reviewer", "e2e", "qa"]'
assert_route validation-review-clean wait validation '[]'
assert_route validation-e2e-pass wait validation '[]'
assert_route validation-stale-commit wait validation '[]'
assert_route validation-fail dispatch repair '["coder"]'
assert_route validation-all-pass dispatch clean-gate '["leader"]'
assert_route repair-done dispatch validation '["reviewer", "e2e", "qa"]'

tmp_store="$(mktemp)"
trap 'rm -f "$tmp_store"' EXIT
"$ROUTER" --template "$TEMPLATE" --event "$EVENTS/coder-done.json" --dedupe-store "$tmp_store" --record-dedupe >/dev/null
duplicate="$("$ROUTER" --template "$TEMPLATE" --event "$EVENTS/coder-done.json" --dedupe-store "$tmp_store")"
node - "$duplicate" <<'NODE'
const actual = JSON.parse(process.argv[2]);
if (actual.action !== "duplicate") {
  throw new Error(`dedupe mismatch: ${actual.action} != duplicate`);
}
NODE

echo "router self-test passed"
