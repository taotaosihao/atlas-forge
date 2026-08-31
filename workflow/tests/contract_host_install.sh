#!/usr/bin/env bash
set -euo pipefail

ATLAS_FORGE_ROOT="${ATLAS_FORGE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
source "$(dirname "${BASH_SOURCE[0]}")/lib/portable.sh"
NODE_BIN_DIR="$(test_command_dir node)"
PYTHON_BIN_DIR="$(test_command_dir python3)"
RG_BIN_DIR="$(test_command_dir rg)"
BASH_BIN_DIR="$(test_command_dir bash)"
BASE_PATH="$NODE_BIN_DIR:$PYTHON_BIN_DIR:$RG_BIN_DIR:$BASH_BIN_DIR:/usr/local/bin:/usr/bin:/bin"
KEEP_TEST_TMP="${KEEP_TEST_TMP:-0}"
DEFAULT_LAYOUT_SUITE="$ATLAS_FORGE_ROOT/workflow/tests/integration_atlas_plugin_layout.sh"
LAYOUT_SUITE="${ATLAS_HOST_LAYOUT_SUITE:-$DEFAULT_LAYOUT_SUITE}"
DOCTOR_SUITE="$ATLAS_FORGE_ROOT/workflow/tests/contract_atlas_doctor.sh"
REFRESH_SUITE="$ATLAS_FORGE_ROOT/workflow/tests/contract_refresh_local_plugin.sh"
DEV_SYNC_SUITE="$ATLAS_FORGE_ROOT/workflow/tests/integration_atlas_plugin_dev_sync.sh"

case "$KEEP_TEST_TMP" in
  0|1) ;;
  *)
    printf 'KEEP_TEST_TMP must be 0 or 1\n' >&2
    exit 2
    ;;
esac
if [[ "$LAYOUT_SUITE" != "$DEFAULT_LAYOUT_SUITE" && "${ATLAS_CONTRACT_TESTING:-0}" != 1 ]]; then
  printf 'ATLAS_HOST_LAYOUT_SUITE override requires ATLAS_CONTRACT_TESTING=1\n' >&2
  exit 2
fi
TMP_ROOT="$(cd "$(mktemp -d "${TMPDIR:-/tmp}/atlas-host-contract.XXXXXX")" && pwd -P)"
OWNERSHIP_MARKER="$TMP_ROOT/.atlas-host-contract-owned"
touch "$OWNERSHIP_MARKER"

cleanup() {
  local rc=$?
  trap - EXIT
  if [[ "$KEEP_TEST_TMP" == 1 ]]; then
    printf 'host_contract_tmp=%s\n' "$TMP_ROOT"
  else
    if [[ -L "$TMP_ROOT" || ! -f "$OWNERSHIP_MARKER" || "$(basename "$TMP_ROOT")" != atlas-host-contract.* ]]; then
      printf 'refusing to clean unowned host contract path: %s\n' "$TMP_ROOT" >&2
      exit 2
    fi
    rm -rf -- "$TMP_ROOT"
  fi
  exit "$rc"
}
trap cleanup EXIT

HOME_ROOT="$TMP_ROOT/home"
CODEX_HOME_VALUE="$TMP_ROOT/codex-home"
CODEX_ROOT="$TMP_ROOT/codex-root"
WORKFLOW_ROOT="$TMP_ROOT/workflow"
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
OUTPUT_ROOT="$TMP_ROOT/output"

mkdir -p "$HOME_ROOT" "$CODEX_HOME_VALUE" "$CODEX_ROOT" "$WORKFLOW_ROOT" "$AGENTS_ROOT" \
  "$LOCAL_BIN_ROOT_VALUE" "$XDG_CONFIG_ROOT" "$XDG_CACHE_ROOT" "$XDG_DATA_ROOT" \
  "$XDG_STATE_ROOT" "$XDG_RUNTIME_ROOT" "$CASE_TMP" "$GIT_TEMPLATE_ROOT" "$GNUPG_ROOT" "$OUTPUT_ROOT"
chmod 700 "$XDG_RUNTIME_ROOT"
touch "$GIT_CONFIG_FILE"

run_isolated() {
  env -i \
    PATH="$BASE_PATH" \
    HOME="$HOME_ROOT" \
    CODEX_HOME="$CODEX_HOME_VALUE" \
    CODEX_HOME_ROOT="$CODEX_ROOT" \
    CODEX_WORKFLOW_ROOT="$WORKFLOW_ROOT" \
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
    KEEP_TEST_TMP="$KEEP_TEST_TMP" \
    ATLAS_FORGE_ROOT="$ATLAS_FORGE_ROOT" \
    "$@"
}

run_labeled_suite() {
  local label="$1" suite="$2"
  local stdout_file="$OUTPUT_ROOT/$label.stdout"
  local stderr_file="$OUTPUT_ROOT/$label.stderr"
  local suite_sha_before suite_sha_after stdout_sha stderr_sha rc

  suite_sha_before="$(sha256 "$suite")"
  set +e
  run_isolated bash "$suite" > "$stdout_file" 2> "$stderr_file"
  rc=$?
  set -e
  suite_sha_after="$(sha256 "$suite")"
  stdout_sha="$(sha256 "$stdout_file")"
  stderr_sha="$(sha256 "$stderr_file")"
  if [[ "$rc" -ne 0 || "$suite_sha_before" != "$suite_sha_after" ]]; then
    printf 'not ok - %s\n' "$label" >&2
    printf 'diagnostic.label=%s\n' "$label" >&2
    printf 'diagnostic.path=%s\n' "$suite" >&2
    printf 'diagnostic.expected_exit=0\n' >&2
    printf 'diagnostic.actual_exit=%s\n' "$rc" >&2
    printf 'diagnostic.suite_source_expected_sha256=%s\n' "$suite_sha_before" >&2
    printf 'diagnostic.suite_source_actual_sha256=%s\n' "$suite_sha_after" >&2
    printf 'diagnostic.stdout_path=%s\n' "$stdout_file" >&2
    printf 'diagnostic.stdout_sha256=%s\n' "$stdout_sha" >&2
    printf 'diagnostic.stderr_path=%s\n' "$stderr_file" >&2
    printf 'diagnostic.stderr_sha256=%s\n' "$stderr_sha" >&2
    [[ ! -s "$stdout_file" ]] || sed -n '1,120p' "$stdout_file" >&2
    [[ ! -s "$stderr_file" ]] || sed -n '1,120p' "$stderr_file" >&2
    if [[ "$rc" -eq 0 ]]; then
      return 1
    fi
    return "$rc"
  fi
  cat "$stdout_file"
  [[ ! -s "$stderr_file" ]] || cat "$stderr_file" >&2
  printf 'ok - %s\n' "$label"
}

require_suite_output() {
  local label="$1" pattern="$2" file="$3"
  if ! grep -Fq -- "$pattern" "$file"; then
    printf 'not ok - %s output contract\n' "$label" >&2
    printf 'diagnostic.label=%s\n' "$label" >&2
    printf 'diagnostic.path=%s\n' "$file" >&2
    printf 'diagnostic.expected_output=%s\n' "$pattern" >&2
    printf 'diagnostic.actual_stdout_sha256=%s\n' "$(sha256 "$file")" >&2
    return 1
  fi
}

run_labeled_suite host-layout-fixtures "$LAYOUT_SUITE"
require_suite_output host-layout-fixtures 'stale snapshot commit is rejected' \
  "$OUTPUT_ROOT/host-layout-fixtures.stdout"
require_suite_output host-layout-fixtures 'missing exact cache is rejected' \
  "$OUTPUT_ROOT/host-layout-fixtures.stdout"
run_labeled_suite strict-doctor-fixtures "$DOCTOR_SUITE"
run_labeled_suite local-cache-transaction "$REFRESH_SUITE"
run_labeled_suite atlas-development-sync "$DEV_SYNC_SUITE"
printf 'host install contract passed: snapshot/cache/install layout checks are isolated\n'
