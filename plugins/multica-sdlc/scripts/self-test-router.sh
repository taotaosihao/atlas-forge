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
  python3 - "$output" "$expected_action" "$expected_phase" "$expected_roles_json" <<'PY'
import json
import sys

actual = json.loads(sys.argv[1])
expected_action = sys.argv[2]
expected_phase = sys.argv[3]
expected_roles = json.loads(sys.argv[4])
if actual["action"] != expected_action:
    raise SystemExit(f"action mismatch: {actual['action']} != {expected_action}")
if actual["next_phase"] != expected_phase:
    raise SystemExit(f"phase mismatch: {actual['next_phase']} != {expected_phase}")
if actual["next_roles"] != expected_roles:
    raise SystemExit(f"roles mismatch: {actual['next_roles']} != {expected_roles}")
PY
}

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
python3 - "$duplicate" <<'PY'
import json
import sys
actual = json.loads(sys.argv[1])
if actual["action"] != "duplicate":
    raise SystemExit(f"dedupe mismatch: {actual['action']} != duplicate")
PY

echo "router self-test passed"
