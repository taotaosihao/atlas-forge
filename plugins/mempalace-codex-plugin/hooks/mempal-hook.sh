#!/usr/bin/env bash
set -euo pipefail
HOOK_NAME="${1:?Usage: mempal-hook.sh <hook-name>}"
INPUT_FILE=$(mktemp) || { echo "Failed to create temp file" >&2; exit 1; }
trap 'rm -f "$INPUT_FILE" 2>/dev/null || true' EXIT

MEMPALACE_BIN="${MEMPALACE_BIN:-}"
if [[ -z "$MEMPALACE_BIN" ]]; then
  if command -v mempalace >/dev/null 2>&1; then
    MEMPALACE_BIN="$(command -v mempalace)"
  elif [[ -x "${HOME:-}/.local/bin/mempalace" ]]; then
    MEMPALACE_BIN="${HOME}/.local/bin/mempalace"
  else
    echo "mempalace command not found; set MEMPALACE_BIN or install it at \$HOME/.local/bin/mempalace" >&2
    exit 127
  fi
fi

cat > "$INPUT_FILE"
"$MEMPALACE_BIN" hook run --hook "$HOOK_NAME" --harness codex < "$INPUT_FILE"
