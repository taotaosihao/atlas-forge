#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HELPER="$ROOT/workflow/bin/atlas-zenmux-bearer-token"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

fail() {
  printf 'contract_zenmux_bearer_token: %s\n' "$1" >&2
  exit 1
}

write_profile() {
  printf '%s\n' \
    'model_provider = "zenmux"' \
    '[model_providers.zenmux]' \
    'experimental_bearer_token = "fixture-token"' \
    > "$TMP_ROOT/zenmux-deepseek.config.toml"
  chmod 600 "$TMP_ROOT/zenmux-deepseek.config.toml"
}

chmod 700 "$TMP_ROOT"
write_profile
[[ "$(CODEX_HOME="$TMP_ROOT" "$HELPER")" == 'fixture-token' ]] \
  || fail 'valid isolated profile did not return the fixture token'

chmod 755 "$TMP_ROOT"
if CODEX_HOME="$TMP_ROOT" "$HELPER" >/dev/null 2>&1; then
  fail 'loose CODEX_HOME mode unexpectedly passed'
fi
chmod 700 "$TMP_ROOT"

chmod 644 "$TMP_ROOT/zenmux-deepseek.config.toml"
if CODEX_HOME="$TMP_ROOT" "$HELPER" >/dev/null 2>&1; then
  fail 'loose profile mode unexpectedly passed'
fi

write_profile
printf '%s\n' \
  'model_provider = "other"' \
  '[model_providers.other]' \
  'experimental_bearer_token = "fixture-token"' \
  > "$TMP_ROOT/zenmux-deepseek.config.toml"
chmod 600 "$TMP_ROOT/zenmux-deepseek.config.toml"
if CODEX_HOME="$TMP_ROOT" "$HELPER" >/dev/null 2>&1; then
  fail 'non-ZenMux provider unexpectedly passed'
fi

printf 'contract_zenmux_bearer_token: ok\n'
