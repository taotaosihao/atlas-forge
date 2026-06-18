#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CODEX_HOME_ROOT="${CODEX_HOME_ROOT:-$HOME/.codex}"
LIVE_WORKFLOW_ROOT="${CODEX_WORKFLOW_ROOT:-$CODEX_HOME_ROOT/workflow}"

mkdir -p "$LIVE_WORKFLOW_ROOT/bin" "$LIVE_WORKFLOW_ROOT/hooks" "$LIVE_WORKFLOW_ROOT/templates" "$LIVE_WORKFLOW_ROOT/tests"

cp -a "$REPO_ROOT/workflow/bin/." "$LIVE_WORKFLOW_ROOT/bin/"
cp -a "$REPO_ROOT/workflow/hooks/." "$LIVE_WORKFLOW_ROOT/hooks/"
cp -a "$REPO_ROOT/workflow/templates/." "$LIVE_WORKFLOW_ROOT/templates/"
cp -a "$REPO_ROOT/workflow/tests/." "$LIVE_WORKFLOW_ROOT/tests/"
cp -a "$REPO_ROOT/workflow/README.md" "$LIVE_WORKFLOW_ROOT/README.md"

chmod +x "$LIVE_WORKFLOW_ROOT/bin/"* "$LIVE_WORKFLOW_ROOT/hooks/"* "$LIVE_WORKFLOW_ROOT/tests/contract.sh"

"$LIVE_WORKFLOW_ROOT/bin/codex-workflow" self-test
