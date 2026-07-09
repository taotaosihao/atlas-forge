#!/usr/bin/env bash
set -euo pipefail

ATLAS_FORGE_ROOT="${ATLAS_FORGE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
VERIFY="$ATLAS_FORGE_ROOT/scripts/verify-atlas-workflow-install.sh"
PLUGIN_SOURCE="$ATLAS_FORGE_ROOT/plugins/atlas-workflow"

if [[ "${ATLAS_REAL_CLI_E2E:-0}" != 1 ]]; then
  printf 'ok - isolated real Codex CLI gate is opt-in # SKIP set ATLAS_REAL_CLI_E2E=1 and ATLAS_EXPECTED_CODEX_VERSION\n'
  printf '1..1\n'
  exit 0
fi

fail() {
  printf 'not ok - %s\n' "$1" >&2
  exit 1
}

pass_count=0
pass() {
  pass_count=$((pass_count + 1))
  printf 'ok - %s\n' "$1"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

fingerprint() {
  local target="$1"
  if [[ ! -e "$target" && ! -L "$target" ]]; then
    printf 'missing\n'
    return
  fi
  if [[ -f "$target" || -L "$target" ]]; then
    {
      stat -c '%F %a %s' "$target"
      if [[ -L "$target" ]]; then readlink "$target"; else sha256sum "$target" | awk '{print $1}'; fi
    } | sha256sum | awk '{print $1}'
    return
  fi
  (
    cd "$target"
    find . -path './.git' -prune -o -type d -printf 'd %m %p\n' | LC_ALL=C sort
    find . -path './.git' -prune -o -type f -print0 | LC_ALL=C sort -z \
      | while IFS= read -r -d '' file; do
          printf 'f %s %s ' "$(stat -c '%a' "$file")" "$file"
          sha256sum "$file" | awk '{print $1}'
        done
    find . -path './.git' -prune -o -type l -printf 'l %p -> %l\n' | LC_ALL=C sort
  ) | sha256sum | awk '{print $1}'
}

set_manifest_version() {
  local plugin_root="$1" version="$2"
  node - "$plugin_root/.codex-plugin/plugin.json" "$version" <<'NODE'
const fs = require("fs");
const [file, version] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
manifest.version = version;
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
}

write_marketplace() {
  local path="$1"
  mkdir -p "$(dirname "$path")"
  node - "$path" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
fs.writeFileSync(file, `${JSON.stringify({
  name: "atlas-only",
  interface: { displayName: "Atlas isolated E2E fixture" },
  plugins: [{
    name: "atlas-workflow",
    source: { source: "local", path: "./plugins/atlas-workflow" },
    policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
    category: "Productivity",
  }],
}, null, 2)}\n`);
NODE
}

rewrite_marketplace_ref() {
  local config="$1" old_ref="$2" new_ref="$3"
  python3 - "$config" "$old_ref" "$new_ref" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
old_ref = sys.argv[2]
new_ref = sys.argv[3]
lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
replaced = 0
output = []
for line in lines:
    if line.strip() == f'ref = "{old_ref}"':
        output.append(line.replace(old_ref, new_ref, 1))
        replaced += 1
    else:
        output.append(line)
if replaced != 1:
    raise SystemExit(f"expected exactly one marketplace ref, replaced {replaced}")
path.write_text("".join(output), encoding="utf-8")
PY
}

assert_json_ok() {
  local path="$1"
  python3 - "$path" <<'PY'
import json
import sys

value = json.loads(open(sys.argv[1], encoding="utf-8").read())
if value.get("ok") is not True:
    raise SystemExit(f"expected ok JSON: {value}")
PY
}

assert_cli_json() {
  local path="$1" kind="$2" expected_version="${3:-}" expected_path="${4:-}"
  python3 - "$path" "$kind" "$expected_version" "$expected_path" <<'PY'
import json
import sys

path, kind, expected_version, expected_path = sys.argv[1:]
value = json.loads(open(path, encoding="utf-8").read())
if not isinstance(value, dict):
    raise SystemExit("Codex CLI JSON output must be an object")
if kind == "marketplace-add":
    expected = {
        "marketplaceName": "atlas-only",
        "installedRoot": expected_path,
        "alreadyAdded": False,
    }
elif kind == "marketplace-upgrade":
    expected = {
        "selectedMarketplaces": ["atlas-only"],
        "upgradedRoots": [expected_path],
        "errors": [],
    }
elif kind == "plugin-add":
    expected = {
        "pluginId": "atlas-workflow@atlas-only",
        "name": "atlas-workflow",
        "marketplaceName": "atlas-only",
        "version": expected_version,
        "installedPath": expected_path,
        "authPolicy": "ON_INSTALL",
    }
else:
    raise SystemExit(f"unknown Codex CLI JSON kind: {kind}")
mismatches = {
    key: {"expected": expected_value, "actual": value.get(key)}
    for key, expected_value in expected.items()
    if value.get(key) != expected_value
}
if mismatches:
    raise SystemExit(f"Codex CLI {kind} contract mismatch: {mismatches}")
PY
}

require_command codex
require_command git
require_command node
require_command python3
require_command strace

expected_codex_version="${ATLAS_EXPECTED_CODEX_VERSION:-}"
[[ -n "$expected_codex_version" ]] || fail 'ATLAS_EXPECTED_CODEX_VERSION is required for the real CLI gate'
codex_bin="$(command -v codex)"

real_home="$HOME"
real_codex_home="${CODEX_HOME_REAL:-${CODEX_HOME:-$real_home/.codex}}"
real_agents_home="${AGENTS_HOME_REAL:-${AGENTS_HOME:-$real_home/.agents}}"
real_local_bin="${LOCAL_BIN_ROOT_REAL:-${LOCAL_BIN_ROOT:-$real_home/.local/bin}}"
protected_paths=(
  "$ATLAS_FORGE_ROOT/plugins/multica-sdlc"
  "$ATLAS_FORGE_ROOT/.agents"
  "$real_agents_home/multica-sdlc/generated"
  "$real_agents_home/multica-sdlc/instructions"
  "$real_agents_home/multica-sdlc/templates"
  "$real_agents_home/multica-sdlc/skill.md"
  "$real_agents_home/multica-sdlc/local-repos.md"
  "$real_agents_home/multica-sdlc/agent-scorecards.md"
  "$real_agents_home/skills/multica-agent-plan"
  "$real_agents_home/skills/multica-prd-submit"
  "$real_agents_home/bin/multica-prd-submit"
  "$real_local_bin/multica-prd-submit"
  "$real_codex_home/plugins/cache/atlas-forge/multica-sdlc"
)
forbidden_access_paths=(
  "$ATLAS_FORGE_ROOT/plugins/multica-sdlc"
  "$ATLAS_FORGE_ROOT/.agents"
  "$real_agents_home"
  "$real_local_bin/multica-prd-submit"
  "$real_codex_home/plugins/cache/atlas-forge/multica-sdlc"
)
protected_before=()
for path in "${protected_paths[@]}"; do
  protected_before+=("$(fingerprint "$path")")
done

tmp_root="$(mktemp -d)"
trap 'rm -rf "$tmp_root"' EXIT
case_root="$tmp_root/case"
repo="$case_root/repo"
remote="$case_root/atlas-only.git"
home_root="$case_root/home"
codex_root="$case_root/codex"
workflow_root="$case_root/workflow"
agents_root="$case_root/agents"
local_bin="$case_root/bin"
xdg_config="$case_root/xdg/config"
xdg_cache="$case_root/xdg/cache"
xdg_data="$case_root/xdg/data"
xdg_state="$case_root/xdg/state"
xdg_runtime="$case_root/xdg/runtime"
tmpdir="$case_root/tmp"
ssh_shim="$case_root/fixture-ssh"
git_config="$case_root/gitconfig"
git_template="$case_root/git-template"
expected_source='ssh://fixture.invalid/atlas-only.git'
marketplace='atlas-only'
base_version='1.0.0+codex.1'
expected_version='1.0.0+codex.2'

mkdir -p "$repo/plugins" "$home_root" "$codex_root" "$workflow_root" \
  "$agents_root" "$local_bin" "$xdg_config" "$xdg_cache" "$xdg_data" \
  "$xdg_state" "$xdg_runtime" "$tmpdir" "$git_template"
touch "$git_config"
chmod 700 "$xdg_runtime"
cp -a "$PLUGIN_SOURCE" "$repo/plugins/atlas-workflow"
write_marketplace "$repo/.agents/plugins/marketplace.json"

run_git() {
  env -u SSH_AUTH_SOCK -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE \
    -u GIT_OBJECT_DIRECTORY -u GIT_ALTERNATE_OBJECT_DIRECTORIES -u GIT_CONFIG_COUNT \
    HOME="$home_root" \
    XDG_CONFIG_HOME="$xdg_config" \
    XDG_CACHE_HOME="$xdg_cache" \
    XDG_DATA_HOME="$xdg_data" \
    XDG_STATE_HOME="$xdg_state" \
    XDG_RUNTIME_DIR="$xdg_runtime" \
    TMPDIR="$tmpdir" \
    GIT_CONFIG_GLOBAL="$git_config" \
    GIT_CONFIG_SYSTEM=/dev/null \
    GIT_CONFIG_NOSYSTEM=1 \
    GIT_TEMPLATE_DIR="$git_template" \
    GIT_TERMINAL_PROMPT=0 \
    GIT_AUTHOR_NAME='Atlas fixture' \
    GIT_AUTHOR_EMAIL=fixture@example.invalid \
    GIT_COMMITTER_NAME='Atlas fixture' \
    GIT_COMMITTER_EMAIL=fixture@example.invalid \
    git -c commit.gpgSign=false -c tag.gpgSign=false -c core.hooksPath=/dev/null "$@"
}

run_git -C "$repo" init -q -b main
set_manifest_version "$repo/plugins/atlas-workflow" "$base_version"
printf '%s\n' base > "$repo/plugins/atlas-workflow/fixture-release.txt"
run_git -C "$repo" add .
run_git -C "$repo" commit -q -m base
base_sha="$(run_git -C "$repo" rev-parse HEAD)"

set_manifest_version "$repo/plugins/atlas-workflow" "$expected_version"
printf '%s\n' expected > "$repo/plugins/atlas-workflow/fixture-release.txt"
run_git -C "$repo" add plugins/atlas-workflow
run_git -C "$repo" commit -q -m expected
expected_sha="$(run_git -C "$repo" rev-parse HEAD)"

run_git clone -q --bare "$repo" "$remote"
run_git -C "$repo" remote add origin "$remote"
run_git -C "$repo" fetch -q origin
run_git -C "$repo" branch --set-upstream-to=origin/main main >/dev/null

python3 - "$ssh_shim" <<'PY'
import os
import stat
import sys
from pathlib import Path

path = Path(sys.argv[1])
path.write_text("""#!/usr/bin/env bash
set -euo pipefail
for argument in "$@"; do
  case "$argument" in
    git-upload-pack*) exec git-upload-pack "$ATLAS_FIXTURE_REMOTE" ;;
  esac
done
exit 97
""", encoding="utf-8")
path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
PY

run_codex() {
  local -a command=("$codex_bin" "$@")
  local command_trace
  command_trace="$(mktemp "$case_root/codex.XXXXXX.strace")"
  command=(strace -f -qq -e trace=%file -o "$command_trace" -a 120 "${command[@]}")
  (
    cd "$case_root"
    env -u SSH_AUTH_SOCK -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE \
      -u GIT_OBJECT_DIRECTORY -u GIT_ALTERNATE_OBJECT_DIRECTORIES -u GIT_CONFIG_COUNT \
      HOME="$home_root" \
      CODEX_HOME="$codex_root" \
      CODEX_HOME_ROOT="$codex_root" \
      CODEX_WORKFLOW_ROOT="$workflow_root" \
      AGENTS_HOME="$agents_root" \
      LOCAL_BIN_ROOT="$local_bin" \
      XDG_CONFIG_HOME="$xdg_config" \
      XDG_CACHE_HOME="$xdg_cache" \
      XDG_DATA_HOME="$xdg_data" \
      XDG_STATE_HOME="$xdg_state" \
      XDG_RUNTIME_DIR="$xdg_runtime" \
      TMPDIR="$tmpdir" \
      GIT_CONFIG_GLOBAL="$git_config" \
      GIT_CONFIG_SYSTEM=/dev/null \
      GIT_CONFIG_NOSYSTEM=1 \
      GIT_TEMPLATE_DIR="$git_template" \
      GIT_TERMINAL_PROMPT=0 \
      GIT_SSH_VARIANT=ssh \
      GIT_SSH_COMMAND="$ssh_shim" \
      ATLAS_FIXTURE_REMOTE="$remote" \
      "${command[@]}"
  )
}

run_verify() {
  local mode="$1"
  env -u SSH_AUTH_SOCK -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE \
    -u GIT_OBJECT_DIRECTORY -u GIT_ALTERNATE_OBJECT_DIRECTORIES -u GIT_CONFIG_COUNT \
    HOME="$home_root" \
    CODEX_HOME="$codex_root" \
    CODEX_HOME_ROOT="$codex_root" \
    CODEX_WORKFLOW_ROOT="$workflow_root" \
    AGENTS_HOME="$agents_root" \
    LOCAL_BIN_ROOT="$local_bin" \
    XDG_CONFIG_HOME="$xdg_config" \
    XDG_CACHE_HOME="$xdg_cache" \
    XDG_DATA_HOME="$xdg_data" \
    XDG_STATE_HOME="$xdg_state" \
    XDG_RUNTIME_DIR="$xdg_runtime" \
    TMPDIR="$tmpdir" \
    GIT_CONFIG_GLOBAL="$git_config" \
    GIT_CONFIG_SYSTEM=/dev/null \
    GIT_CONFIG_NOSYSTEM=1 \
    GIT_TEMPLATE_DIR="$git_template" \
    GIT_TERMINAL_PROMPT=0 \
    "$VERIFY" "$mode" \
      --repo "$repo" \
      --base "$base_sha" \
      --expected-commit "$expected_sha" \
      --marketplace "$marketplace" \
      --expected-source "$expected_source" \
      --codex-home "$codex_root"
}

actual_codex_version="$(run_codex --version)"
[[ "$actual_codex_version" == "$expected_codex_version" ]] \
  || fail "Codex CLI version mismatch: expected '$expected_codex_version', got '$actual_codex_version'"
pass "Codex CLI version is pinned to $actual_codex_version inside isolated roots"

run_codex plugin marketplace add --json --ref "$base_sha" "$expected_source" \
  > "$case_root/marketplace-add.json"
assert_cli_json "$case_root/marketplace-add.json" marketplace-add '' \
  "$codex_root/.tmp/marketplaces/$marketplace"
[[ -d "$codex_root/.tmp/marketplaces/$marketplace" ]] \
  || fail 'Codex CLI did not create the isolated marketplace snapshot'
pass 'exact-SHA marketplace add writes only the isolated Codex root'

run_codex plugin add --json "atlas-workflow@$marketplace" > "$case_root/plugin-add-base.json"
assert_cli_json "$case_root/plugin-add-base.json" plugin-add "$base_version" \
  "$codex_root/plugins/cache/$marketplace/atlas-workflow/$base_version"
[[ -d "$codex_root/plugins/cache/$marketplace/atlas-workflow/$base_version" ]] \
  || fail 'Codex CLI did not create the base exact-version cache'
pass 'plugin add creates the isolated base exact-version cache'

rewrite_marketplace_ref "$codex_root/config.toml" "$base_sha" "$expected_sha"
run_verify preflight > "$case_root/preflight.json"
assert_json_ok "$case_root/preflight.json"
pass 'read-only preflight accepts the exact target SHA before marketplace upgrade'

run_codex plugin marketplace upgrade --json "$marketplace" > "$case_root/marketplace-upgrade.json"
assert_cli_json "$case_root/marketplace-upgrade.json" marketplace-upgrade '' \
  "$codex_root/.tmp/marketplaces/$marketplace"
[[ -d "$codex_root/plugins/cache/$marketplace/atlas-workflow/$expected_version" ]] \
  || fail 'pinned Codex CLI did not auto-refresh the enabled plugin to the target exact cache'
pass 'isolated marketplace upgrade reaches the exact target cache under the pinned CLI'

run_codex plugin add --json "atlas-workflow@$marketplace" > "$case_root/plugin-add-target.json"
assert_cli_json "$case_root/plugin-add-target.json" plugin-add "$expected_version" \
  "$codex_root/plugins/cache/$marketplace/atlas-workflow/$expected_version"
run_verify installed > "$case_root/installed.json"
assert_json_ok "$case_root/installed.json"
pass 'post-install verifier proves source, snapshot, sidecar, and exact cache identity'

for index in "${!protected_paths[@]}"; do
  [[ "$(fingerprint "${protected_paths[$index]}")" == "${protected_before[$index]}" ]] \
    || fail "protected path changed: ${protected_paths[$index]}"
done
mapfile -t trace_files < <(find "$case_root" -maxdepth 1 -type f -name 'codex.*.strace' -print | LC_ALL=C sort)
[[ "${#trace_files[@]}" -eq 5 ]] || fail "expected five Codex strace files, found ${#trace_files[@]}"
for trace_file in "${trace_files[@]}"; do
  for path in "${forbidden_access_paths[@]}"; do
    if grep -F -- "$path" "$trace_file" >/dev/null; then
      fail "Codex CLI accessed a protected path: $path"
    fi
  done
done
pass 'project Multica, real .agents, shim, and release cache fingerprints remain unchanged'

printf '1..%s\n' "$pass_count"
