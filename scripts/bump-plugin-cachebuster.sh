#!/usr/bin/env bash
set -euo pipefail

PLUGIN_SELECTOR="${1:-}"
if [[ -z "$PLUGIN_SELECTOR" ]]; then
  echo "usage: scripts/bump-plugin-cachebuster.sh <atlas-workflow|mempalace>" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

case "$PLUGIN_SELECTOR" in
  atlas-workflow)
    PLUGIN_PATH="$REPO_ROOT/plugins/atlas-workflow"
    ;;
  mempalace|mempalace-codex-plugin)
    PLUGIN_PATH="$REPO_ROOT/plugins/mempalace-codex-plugin"
    ;;
  *)
    echo "unknown plugin: $PLUGIN_SELECTOR" >&2
    exit 1
    ;;
esac

python3 /home/gewu/.codex/skills/.system/plugin-creator/scripts/update_plugin_cachebuster.py "$PLUGIN_PATH"
python3 - "$PLUGIN_PATH" <<'PY'
import json
import sys
from pathlib import Path

plugin_path = Path(sys.argv[1])
runtime_manifest = plugin_path / ".codex-plugin" / "plugin.json"
legacy_manifest = plugin_path / "plugin.json"

if runtime_manifest.exists() and legacy_manifest.exists():
    runtime = json.loads(runtime_manifest.read_text())
    legacy = json.loads(legacy_manifest.read_text())
    version = runtime.get("version")
    if version and legacy.get("version") != version:
        legacy["version"] = version
        legacy_manifest.write_text(json.dumps(legacy, indent=2, ensure_ascii=False) + "\n")
PY
