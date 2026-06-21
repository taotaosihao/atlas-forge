#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CODEX_HOME_ROOT="${CODEX_HOME_ROOT:-$HOME/.codex}"
LIVE_WORKFLOW_ROOT="${CODEX_WORKFLOW_ROOT:-$CODEX_HOME_ROOT/workflow}"
LOCAL_BIN_ROOT="${LOCAL_BIN_ROOT:-$HOME/.local/bin}"

mkdir -p "$LIVE_WORKFLOW_ROOT/bin" "$LIVE_WORKFLOW_ROOT/hooks" "$LIVE_WORKFLOW_ROOT/templates" "$LIVE_WORKFLOW_ROOT/tests"
mkdir -p "$LOCAL_BIN_ROOT"

cp -a "$REPO_ROOT/workflow/bin/." "$LIVE_WORKFLOW_ROOT/bin/"
cp -a "$REPO_ROOT/workflow/hooks/." "$LIVE_WORKFLOW_ROOT/hooks/"
cp -a "$REPO_ROOT/workflow/templates/." "$LIVE_WORKFLOW_ROOT/templates/"
cp -a "$REPO_ROOT/workflow/tests/." "$LIVE_WORKFLOW_ROOT/tests/"
cp -a "$REPO_ROOT/workflow/README.md" "$LIVE_WORKFLOW_ROOT/README.md"

chmod +x "$LIVE_WORKFLOW_ROOT/bin/"* "$LIVE_WORKFLOW_ROOT/hooks/"* "$LIVE_WORKFLOW_ROOT/tests/contract.sh"

if [[ -x "$REPO_ROOT/scripts/sync-live-agents.sh" ]]; then
  "$REPO_ROOT/scripts/sync-live-agents.sh"
fi

for command_name in codex-workflow codex-design-review codex-refresh-local-plugin; do
  shim_path="$LOCAL_BIN_ROOT/$command_name"
  target_path="$LIVE_WORKFLOW_ROOT/bin/$command_name"
  rm -f "$shim_path"
  {
    printf '#!/usr/bin/env bash\n'
    printf 'exec %q "$@"\n' "$target_path"
  } > "$shim_path"
  chmod +x "$shim_path"
done

"$LIVE_WORKFLOW_ROOT/bin/codex-workflow" self-test
