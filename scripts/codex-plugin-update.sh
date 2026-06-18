#!/usr/bin/env bash
set -euo pipefail

PLUGIN_SELECTOR="${1:-}"
if [[ -z "$PLUGIN_SELECTOR" ]]; then
  echo "usage: scripts/codex-plugin-update.sh <atlas-workflow|mempalace>" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MARKETPLACE="atlas-forge"
REF="${ATLAS_FORGE_REF:-main}"

case "$PLUGIN_SELECTOR" in
  atlas-workflow)
    PLUGIN_NAME="atlas-workflow"
    ;;
  mempalace|mempalace-codex-plugin)
    PLUGIN_NAME="mempalace"
    ;;
  *)
    echo "unknown plugin: $PLUGIN_SELECTOR" >&2
    exit 1
    ;;
esac

if [[ -n "$(git -C "$REPO_ROOT" status --short)" ]]; then
  echo "atlas-forge has uncommitted changes." >&2
  echo "Commit and push them before updating Codex from the git marketplace." >&2
  exit 1
fi

git -C "$REPO_ROOT" fetch origin "$REF" >/dev/null

local_head="$(git -C "$REPO_ROOT" rev-parse HEAD)"
remote_head="$(git -C "$REPO_ROOT" rev-parse "origin/$REF")"
if [[ "$local_head" != "$remote_head" ]]; then
  echo "atlas-forge local HEAD is not origin/$REF." >&2
  echo "Push or pull the repository before updating Codex from the git marketplace." >&2
  exit 1
fi

codex plugin marketplace upgrade "$MARKETPLACE"
codex plugin add "$PLUGIN_NAME@$MARKETPLACE"
