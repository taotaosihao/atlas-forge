#!/usr/bin/env bash
set -euo pipefail

PLUGIN_SELECTOR="${1:-}"
if [[ -z "$PLUGIN_SELECTOR" ]]; then
  echo "usage: scripts/bump-plugin-cachebuster.sh <atlas-workflow|mempalace|multica-sdlc>" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_CREATOR_CACHEBUSTER_SCRIPT="${PLUGIN_CREATOR_CACHEBUSTER_SCRIPT:-${CODEX_HOME:-$HOME/.codex}/skills/.system/plugin-creator/scripts/update_plugin_cachebuster.py}"

case "$PLUGIN_SELECTOR" in
  atlas-workflow)
    PLUGIN_PATH="$REPO_ROOT/plugins/atlas-workflow"
    ;;
  mempalace|mempalace-codex-plugin)
    PLUGIN_PATH="$REPO_ROOT/plugins/mempalace-codex-plugin"
    ;;
  multica-sdlc)
    PLUGIN_PATH="$REPO_ROOT/plugins/multica-sdlc"
    ;;
  *)
    echo "unknown plugin: $PLUGIN_SELECTOR" >&2
    exit 1
    ;;
esac

python3 "$PLUGIN_CREATOR_CACHEBUSTER_SCRIPT" "$PLUGIN_PATH"
python3 - "$PLUGIN_PATH" "$REPO_ROOT" "$PLUGIN_SELECTOR" <<'PY'
import json
import sys
from pathlib import Path

plugin_path = Path(sys.argv[1])
repo_root = Path(sys.argv[2])
plugin_selector = sys.argv[3]
runtime_manifest = plugin_path / ".codex-plugin" / "plugin.json"

if not runtime_manifest.exists():
    sys.exit(0)
runtime = json.loads(runtime_manifest.read_text())
version = runtime.get("version")

legacy_manifest = plugin_path / "plugin.json"
if version and legacy_manifest.exists():
    legacy = json.loads(legacy_manifest.read_text())
    if legacy.get("version") != version:
        legacy["version"] = version
        legacy_manifest.write_text(json.dumps(legacy, indent=2, ensure_ascii=False) + "\n")

claude_manifest = plugin_path / ".claude-plugin" / "plugin.json"
if version and claude_manifest.exists():
    claude = json.loads(claude_manifest.read_text())
    if claude.get("version") != version:
        claude["version"] = version
        claude_manifest.write_text(json.dumps(claude, indent=2, ensure_ascii=False) + "\n")

marketplace_manifest = repo_root / ".claude-plugin" / "marketplace.json"
if version and marketplace_manifest.exists():
    marketplace = json.loads(marketplace_manifest.read_text())
    changed = False
    metadata = marketplace.get("metadata")
    if isinstance(metadata, dict) and metadata.get("version") != version:
        metadata["version"] = version
        changed = True
    for entry in marketplace.get("plugins", []):
        if isinstance(entry, dict) and entry.get("name") == plugin_selector and entry.get("version") != version:
            entry["version"] = version
            changed = True
    if changed:
        marketplace_manifest.write_text(json.dumps(marketplace, indent=2, ensure_ascii=False) + "\n")
PY
