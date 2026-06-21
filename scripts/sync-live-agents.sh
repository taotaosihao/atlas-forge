#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENTS_HOME="${AGENTS_HOME:-$HOME/.agents}"
LOCAL_BIN_ROOT="${LOCAL_BIN_ROOT:-$HOME/.local/bin}"

mkdir -p "$AGENTS_HOME" "$AGENTS_HOME/skills" "$AGENTS_HOME/bin" "$LOCAL_BIN_ROOT"

if [[ -d "$REPO_ROOT/.agents/skills" ]]; then
  cp -a "$REPO_ROOT/.agents/skills/." "$AGENTS_HOME/skills/"
fi

if [[ -d "$REPO_ROOT/.agents/bin" ]]; then
  cp -a "$REPO_ROOT/.agents/bin/." "$AGENTS_HOME/bin/"
  chmod +x "$AGENTS_HOME/bin/"* 2>/dev/null || true
fi

if [[ -d "$REPO_ROOT/.agents/multica-sdlc" ]]; then
  mkdir -p "$AGENTS_HOME/multica-sdlc"
  cp -a "$REPO_ROOT/.agents/multica-sdlc/." "$AGENTS_HOME/multica-sdlc/"
  touch "$AGENTS_HOME/multica-sdlc/agent-scorecards.jsonl"
  touch "$AGENTS_HOME/multica-sdlc/agent-scorecards.lock"
fi

for command_name in multica-prd-submit; do
  target_path="$AGENTS_HOME/bin/$command_name"
  [[ -x "$target_path" ]] || continue
  shim_path="$LOCAL_BIN_ROOT/$command_name"
  rm -f "$shim_path"
  {
    printf '#!/usr/bin/env bash\n'
    printf 'exec %q "$@"\n' "$target_path"
  } > "$shim_path"
  chmod +x "$shim_path"
done
