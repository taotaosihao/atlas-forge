#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_ROOT="$(cd "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "$TMP_ROOT"' EXIT

# No host/model CLI may run, even if a developer has one installed.
mkdir -p "$TMP_ROOT/guards" "$TMP_ROOT/home"
for command_name in claude codex paseo; do
  cat > "$TMP_ROOT/guards/$command_name" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$0" >> "$HOME/model-cli-called"
exit 99
SH
  chmod +x "$TMP_ROOT/guards/$command_name"
done

env -i HOME="$TMP_ROOT/home" PATH="$TMP_ROOT/guards:$PATH" \
  CLAUDE_CONFIG_DIR="$TMP_ROOT/claude config" ROOT="$ROOT" bash <<'SH'
set -Eeuo pipefail
trap 'printf "failed Claude fixture command: %s\n" "$BASH_COMMAND" >&2' ERR
sync_script="$ROOT/scripts/sync-live-atlas-workflow.sh"
runtime="$CLAUDE_CONFIG_DIR/workflow"
commands="$CLAUDE_CONFIG_DIR/bin"

bash "$sync_script" --host claude --dry-run >/dev/null
[[ ! -e "$CLAUDE_CONFIG_DIR" ]]
bash "$sync_script" --host claude >/dev/null
[[ ! -e "$HOME/.codex" && ! -e "$HOME/.agents" ]]
[[ ! -e "$CLAUDE_CONFIG_DIR/agents" && ! -e "$commands/atlas-native-agent-inbox" ]]
export PATH="$commands:$PATH"
atlas-workflow list
task_id="$(atlas-workflow init-task 'Claude runtime' 'isolated CLI and hooks')"
atlas-workflow start "$task_id"
[[ -f "$runtime/tasks/$task_id.md" ]]

# Exercise the plugin-cache layout: no sibling checkout workflow is present.
plugin_root="$CLAUDE_CONFIG_DIR/plugins/cache/atlas-forge/atlas-workflow/test"
mkdir -p "$plugin_root/scripts"
cp "$ROOT/plugins/atlas-workflow/scripts/claude-hook-launcher" "$plugin_root/scripts/"
launcher="$plugin_root/scripts/claude-hook-launcher"
printf '%s' '{"tool_name":"Bash","tool_input":{"command":"git reset --hard"}}' |
  bash "$launcher" pre-tool-use > "$HOME/hook-output"
grep -q 'high-risk bash command' "$HOME/hook-output"
grep -q 'pre-tool-risk' "$runtime/artifacts/$task_id/runtime.jsonl"
# This is a synthetic payload contract, not proof of real Claude event delivery.
printf '%s' '{"tool_input":{"command":"bash check.sh"},"tool_response":{"exit_code":1,"stderr":"error: fixture"}}' |
  bash "$launcher" post-tool-use > /dev/null
grep -q 'post-tool-failure' "$runtime/artifacts/$task_id/runtime.jsonl"

before="$(shasum "$runtime/tasks/$task_id.md" "$runtime/state/current-task.json" "$runtime/artifacts/$task_id/runtime.jsonl")"
bash "$sync_script" --host claude >/dev/null
[[ "$before" == "$(shasum "$runtime/tasks/$task_id.md" "$runtime/state/current-task.json" "$runtime/artifacts/$task_id/runtime.jsonl")" ]]
atlas-workflow verify "$task_id" -- bash -c 'test -s "$1"' bash "$runtime/artifacts/$task_id/runtime.jsonl" >/dev/null
atlas-workflow done "$task_id"
codex-design-review init 'Claude review' 'http://localhost' 'fixture' >/dev/null
[[ -d "$runtime/design-reviews" && ! -e "$HOME/.codex" ]]

# Custom runtime and bin paths must agree for the CLI and plugin launcher.
export ATLAS_WORKFLOW_ROOT="$HOME/custom runtime"
export LOCAL_BIN_ROOT="$HOME/custom bin"
bash "$sync_script" --host claude >/dev/null
custom_id="$("$LOCAL_BIN_ROOT/atlas-workflow" init-task 'Custom runtime' 'same hook state')"
"$LOCAL_BIN_ROOT/atlas-workflow" start "$custom_id"
printf '%s' '{"tool_input":{"command":"git reset --hard"}}' |
  bash "$launcher" pre-tool-use >/dev/null
grep -q 'pre-tool-risk' "$ATLAS_WORKFLOW_ROOT/artifacts/$custom_id/runtime.jsonl"

if ATLAS_WORKFLOW_ROOT="$CLAUDE_CONFIG_DIR/plugins/unsafe" bash "$sync_script" --host claude >/dev/null 2>&1; then
  echo 'must reject a runtime inside the plugin cache' >&2
  exit 1
fi
[[ ! -e "$CLAUDE_CONFIG_DIR/plugins/unsafe" && ! -e "$HOME/model-cli-called" ]]
SH

python3 - "$ROOT" <<'PY'
from pathlib import Path
import sys

plugin = Path(sys.argv[1]) / 'plugins/atlas-workflow'
team = (plugin / 'skills/team/SKILL.md').read_text()
host = team.split('## Host Note\n', 1)[1].split('\n## ', 1)[0]
claude = team.split('## Claude Native Collaboration\n', 1)[1].split('\n## ', 1)[0]
codex = team.split('## Native Exact Model Routing\n', 1)[1].split('\n## ', 1)[0]
assert 'not Claude prerequisites' in host
assert 'team-v1` and DeepSeek/ZenMux routes are deprecated' in host
assert 'Leave the model override unset' in claude
assert 'never send Codex-only' in claude
assert 'stay main-only' in claude and 'old one is quiesced' in claude
assert 'not a complete inventory of live agents' in claude
assert 'Codex-only:' in codex and 'do not apply on Claude Code' in codex
assert 'gate applies only to the explicitly selected Paseo lanes' in team
for profile in (plugin / 'agents').glob('*.md'):
    text = profile.read_text()
    assert '\nmodel:' not in text.split('---', 2)[1], profile
    assert 'manual exact-provider gate belongs only to explicit Paseo routing' in text, profile
print('ok - Claude native host policy and model inheritance (static contract)')
PY
printf 'ok - Claude isolated runtime install, CLI, hooks, preservation, and no model calls\n'
