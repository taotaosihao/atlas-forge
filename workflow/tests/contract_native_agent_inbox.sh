#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT/workflow/tests/lib/portable.sh"
HELPER="$ROOT/workflow/bin/atlas-native-agent-inbox"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

fail() {
  printf 'contract_native_agent_inbox: %s\n' "$1" >&2
  exit 1
}

chmod 700 "$TMP_ROOT"
printf '%s\n' 'goal: inspect one bounded path' 'authority: read-only' \
  | CODEX_HOME="$TMP_ROOT" "$HELPER" put deepseek_probe >/dev/null

[[ "$(file_mode "$TMP_ROOT/atlas-native-agent-inbox")" == 700 ]] \
  || fail 'inbox mode is not 700'
[[ "$(file_mode "$TMP_ROOT/atlas-native-agent-inbox/deepseek_probe.md")" == 600 ]] \
  || fail 'packet mode is not 600'
expected=$'goal: inspect one bounded path\nauthority: read-only'
[[ "$(CODEX_HOME="$TMP_ROOT" "$HELPER" get deepseek_probe)" == "$expected" ]] \
  || fail 'stored packet did not round-trip'

printf '%s\n' 'goal: prove implementer slot' 'authority: isolated role' \
  | CODEX_HOME="$TMP_ROOT" "$HELPER" put atlas_sdd_implementer >/dev/null
implementer_expected=$'goal: prove implementer slot\nauthority: isolated role'
[[ "$(CODEX_HOME="$TMP_ROOT" "$HELPER" get atlas_sdd_implementer)" == "$implementer_expected" ]] \
  || fail 'implementer packet did not round-trip'
[[ "$(CODEX_HOME="$TMP_ROOT" "$HELPER" get deepseek_probe)" == "$expected" ]] \
  || fail 'probe packet changed while implementer slot was present'

printf '%s\n' 'goal: prove planner slot' 'authority: read-only planning' \
  | CODEX_HOME="$TMP_ROOT" "$HELPER" put atlas_sdd_planner >/dev/null
planner_expected=$'goal: prove planner slot\nauthority: read-only planning'
[[ "$(CODEX_HOME="$TMP_ROOT" "$HELPER" get atlas_sdd_planner)" == "$planner_expected" ]] \
  || fail 'planner packet did not round-trip'

printf '%s\n' 'goal: prove reviewer slot' 'authority: read-only review' \
  | CODEX_HOME="$TMP_ROOT" "$HELPER" put atlas_sdd_reviewer >/dev/null
reviewer_expected=$'goal: prove reviewer slot\nauthority: read-only review'
[[ "$(CODEX_HOME="$TMP_ROOT" "$HELPER" get atlas_sdd_reviewer)" == "$reviewer_expected" ]] \
  || fail 'reviewer packet did not round-trip'
[[ "$(CODEX_HOME="$TMP_ROOT" "$HELPER" get atlas_sdd_planner)" == "$planner_expected" ]] \
  || fail 'planner packet changed while reviewer slot was present'

CODEX_HOME="$TMP_ROOT" "$HELPER" delete atlas_sdd_implementer >/dev/null
[[ ! -e "$TMP_ROOT/atlas-native-agent-inbox/atlas_sdd_implementer.md" ]] \
  || fail 'implementer packet was not deleted'
[[ "$(CODEX_HOME="$TMP_ROOT" "$HELPER" get deepseek_probe)" == "$expected" ]] \
  || fail 'probe packet did not survive implementer deletion'

CODEX_HOME="$TMP_ROOT" "$HELPER" delete atlas_sdd_planner >/dev/null
[[ ! -e "$TMP_ROOT/atlas-native-agent-inbox/atlas_sdd_planner.md" ]] \
  || fail 'planner packet was not deleted'
[[ "$(CODEX_HOME="$TMP_ROOT" "$HELPER" get atlas_sdd_reviewer)" == "$reviewer_expected" ]] \
  || fail 'reviewer packet did not survive planner deletion'

if printf 'replacement\n' | CODEX_HOME="$TMP_ROOT" "$HELPER" put atlas_sdd_reviewer >/dev/null 2>&1; then
  fail 'existing reviewer packet was overwritten'
fi
CODEX_HOME="$TMP_ROOT" "$HELPER" delete atlas_sdd_reviewer >/dev/null
[[ ! -e "$TMP_ROOT/atlas-native-agent-inbox/atlas_sdd_reviewer.md" ]] \
  || fail 'reviewer packet was not deleted'

if printf 'replacement\n' | CODEX_HOME="$TMP_ROOT" "$HELPER" put deepseek_probe >/dev/null 2>&1; then
  fail 'existing packet was overwritten'
fi
if printf 'bad name\n' | CODEX_HOME="$TMP_ROOT" "$HELPER" put 'bad/name' >/dev/null 2>&1; then
  fail 'invalid packet slot was admitted'
fi

chmod 644 "$TMP_ROOT/atlas-native-agent-inbox/deepseek_probe.md"
if CODEX_HOME="$TMP_ROOT" "$HELPER" get deepseek_probe >/dev/null 2>&1; then
  fail 'loose packet mode unexpectedly passed'
fi
chmod 600 "$TMP_ROOT/atlas-native-agent-inbox/deepseek_probe.md"

CODEX_HOME="$TMP_ROOT" "$HELPER" delete deepseek_probe >/dev/null
[[ ! -e "$TMP_ROOT/atlas-native-agent-inbox/deepseek_probe.md" ]] \
  || fail 'packet was not deleted'
CODEX_HOME="$TMP_ROOT" "$HELPER" delete deepseek_probe >/dev/null

chmod 755 "$TMP_ROOT"
if printf 'bad home\n' | CODEX_HOME="$TMP_ROOT" "$HELPER" put deepseek_probe >/dev/null 2>&1; then
  fail 'loose CODEX_HOME mode unexpectedly passed'
fi

printf 'contract_native_agent_inbox: ok\n'
