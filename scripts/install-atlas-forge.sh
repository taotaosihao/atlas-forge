#!/usr/bin/env bash
set -euo pipefail

MARKETPLACE="atlas-forge"
REF="${ATLAS_FORGE_REF:-main}"
SOURCE="${ATLAS_FORGE_SOURCE:-git@github.com:taotaosihao/atlas-forge.git}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CODEX_HOME_ROOT="${CODEX_HOME_ROOT:-${CODEX_HOME:-$HOME/.codex}}"
CODEX_CONFIG_FILE="${CODEX_CONFIG_FILE:-$CODEX_HOME_ROOT/config.toml}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

marketplace_root_from_json() {
  python3 -c 'import json,sys; print(json.load(sys.stdin).get("installedRoot") or "")'
}

marketplace_config_status() {
  python3 - "$CODEX_CONFIG_FILE" "$MARKETPLACE" "$SOURCE" "$REF" <<'PY'
import sys
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:
    print("unknown")
    raise SystemExit(0)

config_path = Path(sys.argv[1])
marketplace_name = sys.argv[2]
source = sys.argv[3]
ref = sys.argv[4]

if not config_path.exists():
    print("missing")
    raise SystemExit(0)

data = tomllib.loads(config_path.read_text())
marketplace = data.get("marketplaces", {}).get(marketplace_name)
if not marketplace:
    print("missing")
elif (
    marketplace.get("source_type") == "git"
    and marketplace.get("source") == source
    and marketplace.get("ref", "main") == ref
):
    print("match")
else:
    print("mismatch")
PY
}

add_marketplace() {
  local output
  if [[ "$(marketplace_config_status)" == "mismatch" ]]; then
    echo "replacing existing $MARKETPLACE marketplace configuration" >&2
    codex plugin marketplace remove "$MARKETPLACE" >/dev/null 2>&1 || true
  fi

  if output="$(codex plugin marketplace add --json --ref "$REF" "$SOURCE" 2>&1)"; then
    printf '%s\n' "$output"
    return 0
  fi

  echo "$output" >&2
  exit 1
}

require_command codex
require_command git
require_command python3

add_output="$(add_marketplace)"
marketplace_root="$(printf '%s' "$add_output" | marketplace_root_from_json)"

codex plugin marketplace upgrade "$MARKETPLACE"
codex plugin add atlas-workflow@"$MARKETPLACE"
codex plugin add mempalace@"$MARKETPLACE"
codex plugin add multica-sdlc@"$MARKETPLACE"

if [[ -n "$marketplace_root" && -x "$marketplace_root/scripts/sync-live-workflow.sh" ]]; then
  "$marketplace_root/scripts/sync-live-workflow.sh"
else
  "$REPO_ROOT/scripts/sync-live-workflow.sh"
fi
