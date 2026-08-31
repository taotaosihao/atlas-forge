#!/usr/bin/env bash
set -euo pipefail

ATLAS_FORGE_ROOT="${ATLAS_FORGE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
source "$(dirname "${BASH_SOURCE[0]}")/lib/portable.sh"
ORIGINAL_HOME="$HOME"
NODE_BIN_DIR="$(test_command_dir node)"
PYTHON_BIN_DIR="$(test_command_dir python3)"
RG_BIN_DIR="$(test_command_dir rg)"
BASH_BIN_DIR="$(test_command_dir bash)"
BASE_PATH="$NODE_BIN_DIR:$PYTHON_BIN_DIR:$RG_BIN_DIR:$BASH_BIN_DIR:/usr/local/bin:/usr/bin:/bin"
KEEP_TEST_TMP="${KEEP_TEST_TMP:-0}"

case "$KEEP_TEST_TMP" in
  0|1) ;;
  *)
    printf 'KEEP_TEST_TMP must be 0 or 1\n' >&2
    exit 2
    ;;
esac

ISOLATION_BACKEND="$(uname -s)"
case "$ISOLATION_BACKEND" in
  Linux)
    ISOLATION_BIN="$(command -v strace)" || {
      printf 'repo contract requires strace for real-HOME read isolation on Linux\n' >&2
      exit 1
    }
    ;;
  Darwin)
    ISOLATION_BIN=/usr/bin/sandbox-exec
    [[ -x "$ISOLATION_BIN" ]] || {
      printf 'repo contract requires sandbox-exec for real-HOME isolation on macOS\n' >&2
      exit 1
    }
    ;;
  *)
    printf 'repo contract has no HOME isolation backend for %s\n' "$ISOLATION_BACKEND" >&2
    exit 1
    ;;
esac
TMP_ROOT="$(cd "$(mktemp -d "${TMPDIR:-/tmp}/atlas-repo-contract.XXXXXX")" && pwd -P)"
OWNERSHIP_MARKER="$TMP_ROOT/.atlas-repo-contract-owned"
touch "$OWNERSHIP_MARKER"

cleanup() {
  local rc=$?
  trap - EXIT
  if [[ "$KEEP_TEST_TMP" == 1 ]]; then
    printf 'repo_contract_tmp=%s\n' "$TMP_ROOT"
  else
    if [[ -L "$TMP_ROOT" || ! -f "$OWNERSHIP_MARKER" || "$(basename "$TMP_ROOT")" != atlas-repo-contract.* ]]; then
      printf 'refusing to clean unowned repo contract path: %s\n' "$TMP_ROOT" >&2
      exit 2
    fi
    rm -rf -- "$TMP_ROOT"
  fi
  exit "$rc"
}
trap cleanup EXIT

CONTRACT_TMP="$TMP_ROOT/contract"
HOME_ROOT="$TMP_ROOT/home"
CODEX_HOME_VALUE="$TMP_ROOT/codex-home"
CODEX_ROOT="$CONTRACT_TMP/codex"
AGENTS_ROOT="$TMP_ROOT/agents"
LOCAL_BIN_ROOT_VALUE="$TMP_ROOT/bin"
XDG_CONFIG_ROOT="$TMP_ROOT/xdg/config"
XDG_CACHE_ROOT="$TMP_ROOT/xdg/cache"
XDG_DATA_ROOT="$TMP_ROOT/xdg/data"
XDG_STATE_ROOT="$TMP_ROOT/xdg/state"
XDG_RUNTIME_ROOT="$TMP_ROOT/xdg/runtime"
CASE_TMP="$TMP_ROOT/tmp"
GIT_CONFIG_FILE="$TMP_ROOT/gitconfig"
GIT_TEMPLATE_ROOT="$TMP_ROOT/git-template"
GNUPG_ROOT="$TMP_ROOT/gnupg"
TRACE_ROOT="$TMP_ROOT/trace"
MARKETPLACE_FILE="$CODEX_ROOT/.agents/plugins/marketplace.json"

mkdir -p "$HOME_ROOT" "$CODEX_HOME_VALUE" "$CODEX_ROOT/plugins" "$AGENTS_ROOT" "$LOCAL_BIN_ROOT_VALUE" \
  "$XDG_CONFIG_ROOT" "$XDG_CACHE_ROOT" "$XDG_DATA_ROOT" "$XDG_STATE_ROOT" \
  "$XDG_RUNTIME_ROOT" "$CASE_TMP" "$GIT_TEMPLATE_ROOT" "$GNUPG_ROOT" "$TRACE_ROOT" \
  "$HOME_ROOT/.codex/plugins/cache/atlas-forge/atlas-workflow/stale" \
  "$HOME_ROOT/.agents/private" "$HOME_ROOT/.ssh"
chmod 700 "$XDG_RUNTIME_ROOT"
touch "$GIT_CONFIG_FILE"
printf '%s\n' stale-cache > "$HOME_ROOT/.codex/plugins/cache/atlas-forge/atlas-workflow/stale/sentinel"
printf '%s\n' protected-agent > "$HOME_ROOT/.agents/private/sentinel"
printf '%s\n' protected-ssh > "$HOME_ROOT/.ssh/sentinel"
stale_before="$(sha256 "$HOME_ROOT/.codex/plugins/cache/atlas-forge/atlas-workflow/stale/sentinel" \
  "$HOME_ROOT/.agents/private/sentinel" "$HOME_ROOT/.ssh/sentinel")"

copy_atlas_fixture "$ATLAS_FORGE_ROOT/plugins/atlas-workflow" "$CODEX_ROOT/plugins/atlas-workflow"
mkdir -p "$(dirname "$MARKETPLACE_FILE")"
node - "$MARKETPLACE_FILE" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
fs.writeFileSync(file, `${JSON.stringify({
  name: "local-atlas",
  interface: { displayName: "Hermetic Atlas development marketplace" },
  plugins: [{
    name: "atlas-workflow",
    source: { source: "local", path: "./plugins/atlas-workflow" },
    policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
    category: "Productivity",
  }],
}, null, 2)}\n`);
NODE

run_isolated() {
  env -i \
    PATH="$BASE_PATH" \
    HOME="$HOME_ROOT" \
    CODEX_HOME="$CODEX_HOME_VALUE" \
    CODEX_HOME_ROOT="$CODEX_ROOT" \
    CODEX_WORKFLOW_ROOT="$CONTRACT_TMP/workflow" \
    AGENTS_HOME="$AGENTS_ROOT" \
    LOCAL_BIN_ROOT="$LOCAL_BIN_ROOT_VALUE" \
    XDG_CONFIG_HOME="$XDG_CONFIG_ROOT" \
    XDG_CACHE_HOME="$XDG_CACHE_ROOT" \
    XDG_DATA_HOME="$XDG_DATA_ROOT" \
    XDG_STATE_HOME="$XDG_STATE_ROOT" \
    XDG_RUNTIME_DIR="$XDG_RUNTIME_ROOT" \
    GNUPGHOME="$GNUPG_ROOT" \
    TMPDIR="$CASE_TMP" \
    GIT_CONFIG_GLOBAL="$GIT_CONFIG_FILE" \
    GIT_CONFIG_SYSTEM=/dev/null \
    GIT_CONFIG_NOSYSTEM=1 \
    GIT_TEMPLATE_DIR="$GIT_TEMPLATE_ROOT" \
    GIT_TERMINAL_PROMPT=0 \
    GIT_CEILING_DIRECTORIES="$TMP_ROOT" \
    GIT_ASKPASS=/bin/false \
    SSH_ASKPASS=/bin/false \
    PYTHONNOUSERSITE=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    LANG=C \
    LC_ALL=C \
    TZ=UTC \
    ATLAS_FORGE_ROOT="$ATLAS_FORGE_ROOT" \
    ATLAS_CONTRACT_INTERNAL_REPO=1 \
    ATLAS_CONTRACT_TMP_ROOT="$CONTRACT_TMP" \
    CODEX_WORKFLOW_BIN="$ATLAS_FORGE_ROOT/workflow/bin/codex-workflow" \
    CODEX_HOME_REAL="$HOME_ROOT/.codex" \
    AGENTS_HOME_REAL="$HOME_ROOT/.agents" \
    CODEX_PLUGIN_MARKETPLACE_FILE="$MARKETPLACE_FILE" \
    PLUGIN_CREATOR_VALIDATE_SCRIPT="$TMP_ROOT/missing-plugin-validator.py" \
    "$@"
}

protected_paths=(
  "$HOME_ROOT/.codex"
  "$HOME_ROOT/.ssh"
  "$ORIGINAL_HOME/.codex"
  "$ORIGINAL_HOME/.agents"
  "$ORIGINAL_HOME/.ssh"
  "$ORIGINAL_HOME/.gnupg"
  "$ORIGINAL_HOME/.gitconfig"
  "$ORIGINAL_HOME/.config/git"
)
if [[ "$ISOLATION_BACKEND" == Darwin ]]; then
  sandbox_profile="$TRACE_ROOT/home-isolation.sb"
  sandbox_args=(-f "$sandbox_profile")
  printf '(version 1)\n(allow default)\n' > "$sandbox_profile"
  for index in "${!protected_paths[@]}"; do
    sandbox_args+=(-D "protected$index=${protected_paths[$index]}")
    printf '(deny file-read* file-write* (subpath (param "protected%s")) (with send-signal SIGKILL))\n' \
      "$index" >> "$sandbox_profile"
  done
fi

assert_trace_isolated() {
  local trace_file="$1" protected
  [[ -s "$trace_file" ]] || {
    printf 'repo contract has no file-access trace: %s\n' "$trace_file" >&2
    return 1
  }
  for protected in "${protected_paths[@]}"; do
    if grep -F -- "$protected" "$trace_file" >/dev/null; then
      printf 'repo contract accessed protected HOME path: %s\n' "$protected" >&2
      return 1
    fi
  done
}

run_guarded() {
  local label="$1"
  shift
  local trace_file="$TRACE_ROOT/$label.strace" rc
  if [[ "$ISOLATION_BACKEND" == Darwin ]]; then
    # Kernel denial is inherited by children; it is not a syscall audit log.
    run_isolated "$ISOLATION_BIN" "${sandbox_args[@]}" "$@"
    return $?
  fi
  if run_isolated "$ISOLATION_BIN" -f -qq -e trace=%file -o "$trace_file" "$@"; then
    rc=0
  else
    rc=$?
  fi
  assert_trace_isolated "$trace_file" || return 1
  return "$rc"
}

# Verify the actual backend before running the suite, using only owned canaries.
run_guarded isolation-allowed node -e 'require("fs").readFileSync(process.argv[1])' "$GIT_CONFIG_FILE"
if run_guarded isolation-denied node -e 'require("fs").readFileSync(process.env.HOME + "/.ssh/sentinel")' \
  > "$TRACE_ROOT/probe.stdout" 2> "$TRACE_ROOT/probe.stderr"; then
  printf 'repo contract HOME isolation probe unexpectedly passed\n' >&2
  exit 1
else
  probe_status=$?
fi
if [[ "$ISOLATION_BACKEND" == Darwin ]]; then
  [[ "$probe_status" == 137 ]] || {
    printf 'repo contract sandbox probe did not terminate protected access (exit %s)\n' "$probe_status" >&2
    exit 1
  }
  printf 'repo-contract: HOME isolation verified with macOS sandbox enforcement\n'
else
  grep -Fq 'repo contract accessed protected HOME path:' "$TRACE_ROOT/probe.stderr"
  printf 'repo-contract: HOME isolation verified with Linux strace audit\n'
fi

printf 'repo-contract: workflow source behavior\n'
run_guarded workflow-source bash "$ATLAS_FORGE_ROOT/workflow/tests/contract.sh"

stale_after="$(sha256 "$HOME_ROOT/.codex/plugins/cache/atlas-forge/atlas-workflow/stale/sentinel" \
  "$HOME_ROOT/.agents/private/sentinel" "$HOME_ROOT/.ssh/sentinel")"
[[ "$stale_before" == "$stale_after" ]] || {
  printf 'repo contract changed stale real-HOME sentinels\n' >&2
  exit 1
}

printf 'repo contract passed: isolated HOME/CODEX_HOME/AGENTS_HOME/XDG/TMP roots\n'
