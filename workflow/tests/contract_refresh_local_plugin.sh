#!/usr/bin/env bash
set -euo pipefail

ATLAS_FORGE_ROOT="${ATLAS_FORGE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
source "$(dirname "${BASH_SOURCE[0]}")/lib/portable.sh"
BIN="$ATLAS_FORGE_ROOT/workflow/bin/codex-refresh-local-plugin"
INTEGRITY_BIN="$ATLAS_FORGE_ROOT/workflow/bin/atlas-plugin-integrity"
PLUGIN_SOURCE="$ATLAS_FORGE_ROOT/plugins/atlas-workflow"
TMP_ROOT="$(cd "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "$TMP_ROOT"' EXIT

pass() {
  printf 'ok - %s\n' "$1"
}

fail() {
  printf 'not ok - %s\n' "$1" >&2
  exit 1
}

assert_fingerprint() {
  local label="$1"
  local target="$2"
  local expected="$3"
  [[ "$(fingerprint "$target")" == "$expected" ]] || fail "$label changed: $target"
}

assert_json() {
  local file="$1"
  local expected_ok="$2"
  local expected_action="${3:-}"
  local expected_code="${4:-}"
  node - "$file" "$expected_ok" "$expected_action" "$expected_code" <<'NODE'
const fs = require("fs");
const [file, expectedOk, expectedAction, expectedCode] = process.argv.slice(2);
const value = JSON.parse(fs.readFileSync(file, "utf8"));
if (value.schema_version !== 1 || value.tool !== "codex-refresh-local-plugin") {
  throw new Error(`bad envelope: ${JSON.stringify(value)}`);
}
if (value.ok !== (expectedOk === "true")) {
  throw new Error(`unexpected ok: ${JSON.stringify(value)}`);
}
if (expectedAction && value.action !== expectedAction) {
  throw new Error(`unexpected action: ${JSON.stringify(value)}`);
}
if (expectedCode && !value.errors.some((error) => error.code === expectedCode)) {
  throw new Error(`missing error ${expectedCode}: ${JSON.stringify(value)}`);
}
NODE
}

write_marketplace() {
  local file="$1"
  local name="${2:-local-atlas}"
  local source_kind="${3:-local}"
  local source_path="${4:-./plugins/atlas-workflow}"
  local count="${5:-1}"
  mkdir -p "$(dirname "$file")"
  node - "$file" "$name" "$source_kind" "$source_path" "$count" <<'NODE'
const fs = require("fs");
const [file, name, sourceKind, sourcePath, rawCount] = process.argv.slice(2);
const plugins = [];
for (let index = 0; index < Number(rawCount); index += 1) {
  plugins.push({ name: "atlas-workflow", source: { source: sourceKind, path: sourcePath } });
}
fs.writeFileSync(file, `${JSON.stringify({ name, plugins }, null, 2)}\n`);
NODE
}

setup_case() {
  local name="$1"
  CASE_ROOT="$TMP_ROOT/$name"
  CASE_HOME="$CASE_ROOT/home"
  CASE_CODEX_HOME="$CASE_ROOT/codex-home"
  CASE_CODEX_ROOT="$CASE_ROOT/codex-root"
  CASE_WORKFLOW_ROOT="$CASE_ROOT/workflow"
  CASE_AGENTS_HOME="$CASE_ROOT/agents-home"
  CASE_LOCAL_BIN="$CASE_ROOT/local-bin"
  CASE_MARKETPLACE="$CASE_CODEX_ROOT/.agents/plugins/marketplace.json"
  CASE_SOURCE="$CASE_CODEX_ROOT/plugins/atlas-workflow"
  CASE_TARGET="$CASE_CODEX_ROOT/plugins/cache/local-atlas/atlas-workflow/local"
  CASE_OUTPUT="$CASE_ROOT/output.json"

  mkdir -p "$CASE_CODEX_ROOT/plugins" "$CASE_WORKFLOW_ROOT" "$CASE_AGENTS_HOME" \
    "$CASE_LOCAL_BIN" "$CASE_HOME/.agents" "$CASE_CODEX_HOME"
  copy_atlas_fixture "$PLUGIN_SOURCE" "$CASE_SOURCE"
  mkdir -p "$CASE_SOURCE/bin"
  printf '%s\n' 'hidden fixture' > "$CASE_SOURCE/.hidden"
  printf '%s\n' '#!/usr/bin/env bash' 'exit 0' > "$CASE_SOURCE/bin/tool"
  chmod 755 "$CASE_SOURCE/bin/tool"
  write_marketplace "$CASE_MARKETPLACE"

  mkdir -p \
    "$CASE_CODEX_ROOT/.tmp/marketplaces/atlas-forge" \
    "$CASE_CODEX_ROOT/plugins/cache/atlas-forge" \
    "$CASE_CODEX_HOME/.tmp/marketplaces/atlas-forge" \
    "$CASE_CODEX_HOME/plugins/cache/atlas-forge" \
    "$CASE_HOME/.codex/.tmp/marketplaces/atlas-forge" \
    "$CASE_HOME/.codex/plugins/cache/atlas-forge"
  printf '%s\n' snapshot > "$CASE_CODEX_ROOT/.tmp/marketplaces/atlas-forge/sentinel"
  printf '%s\n' release > "$CASE_CODEX_ROOT/plugins/cache/atlas-forge/sentinel"
  printf '%s\n' snapshot > "$CASE_CODEX_HOME/.tmp/marketplaces/atlas-forge/sentinel"
  printf '%s\n' release > "$CASE_CODEX_HOME/plugins/cache/atlas-forge/sentinel"
  printf '%s\n' snapshot > "$CASE_HOME/.codex/.tmp/marketplaces/atlas-forge/sentinel"
  printf '%s\n' release > "$CASE_HOME/.codex/plugins/cache/atlas-forge/sentinel"
  printf '%s\n' legacy > "$CASE_HOME/.agents/sentinel"
  printf '%s\n' legacy > "$CASE_AGENTS_HOME/sentinel"
  printf '%s\n' multica > "$CASE_LOCAL_BIN/multica-prd-submit"
}

forbidden_fingerprint() {
  {
    fingerprint "$CASE_CODEX_ROOT/.tmp/marketplaces/atlas-forge"
    fingerprint "$CASE_CODEX_ROOT/plugins/cache/atlas-forge"
    fingerprint "$CASE_CODEX_HOME/.tmp/marketplaces/atlas-forge"
    fingerprint "$CASE_CODEX_HOME/plugins/cache/atlas-forge"
    fingerprint "$CASE_HOME/.codex/.tmp/marketplaces/atlas-forge"
    fingerprint "$CASE_HOME/.codex/plugins/cache/atlas-forge"
    fingerprint "$CASE_HOME/.agents"
    fingerprint "$CASE_AGENTS_HOME"
    fingerprint "$CASE_LOCAL_BIN/multica-prd-submit"
  } | sha256
}

managed_fingerprint() {
  {
    fingerprint "$CASE_CODEX_ROOT"
    fingerprint "$CASE_HOME/.agents"
    fingerprint "$CASE_AGENTS_HOME"
    fingerprint "$CASE_LOCAL_BIN"
  } | sha256
}

run_refresh() {
  HOME="$CASE_HOME" \
  CODEX_HOME="$CASE_CODEX_HOME" \
  CODEX_HOME_ROOT="$CASE_CODEX_ROOT" \
  CODEX_WORKFLOW_ROOT="$CASE_WORKFLOW_ROOT" \
  AGENTS_HOME="$CASE_AGENTS_HOME" \
  LOCAL_BIN_ROOT="$CASE_LOCAL_BIN" \
    "$BIN" "$@"
}

expect_fail_current() {
  local label="$1"
  local code="$2"
  shift 2
  if run_refresh "$@" > "$CASE_OUTPUT" 2> "$CASE_ROOT/stderr"; then
    fail "$label unexpectedly passed"
  fi
  [[ ! -s "$CASE_ROOT/stderr" ]]
  assert_json "$CASE_OUTPUT" false none "$code"
  pass "$label"
}

assert_no_debris() {
  local parent="$CASE_CODEX_ROOT/plugins/cache/local-atlas/atlas-workflow"
  if [[ -d "$parent" ]] && find "$parent" -mindepth 1 -maxdepth 1 \
      \( -name '.local.stage.*' -o -name '.local.backup.*' \) -print -quit | grep -q .; then
    fail 'stage or backup debris remained'
  fi
}

bash -n "$BIN"
node --check "$INTEGRITY_BIN"

setup_case first-install
source_before="$(fingerprint "$CASE_SOURCE")"
marketplace_before="$(fingerprint "$CASE_MARKETPLACE")"
forbidden_before="$(forbidden_fingerprint)"
run_refresh atlas-workflow > "$CASE_OUTPUT"
assert_json "$CASE_OUTPUT" true refreshed
diff -qr "$CASE_SOURCE" "$CASE_TARGET" >/dev/null
[[ -f "$CASE_TARGET/.hidden" && -x "$CASE_TARGET/bin/tool" ]]
assert_fingerprint 'first install source' "$CASE_SOURCE" "$source_before"
assert_fingerprint 'first install marketplace' "$CASE_MARKETPLACE" "$marketplace_before"
[[ "$(forbidden_fingerprint)" == "$forbidden_before" ]]
assert_no_debris
pass 'canonical first install preserves hidden files, executable mode, and forbidden sentinels'

setup_case replace
mkdir -p "$CASE_TARGET"
printf '%s\n' old > "$CASE_TARGET/old.txt"
run_refresh atlas-workflow > "$CASE_OUTPUT"
assert_json "$CASE_OUTPUT" true refreshed
diff -qr "$CASE_SOURCE" "$CASE_TARGET" >/dev/null
assert_no_debris
pass 'canonical replacement installs a verified exact copy'

target_before="$(fingerprint "$CASE_TARGET")"
code_root_before="$(fingerprint "$CASE_CODEX_ROOT")"
target_inode_before="$(file_identity "$CASE_TARGET")"
run_refresh atlas-workflow > "$CASE_OUTPUT"
assert_json "$CASE_OUTPUT" true noop
assert_fingerprint 'no-op target' "$CASE_TARGET" "$target_before"
assert_fingerprint 'no-op CODEX_HOME_ROOT' "$CASE_CODEX_ROOT" "$code_root_before"
[[ "$(file_identity "$CASE_TARGET")" == "$target_inode_before" ]] \
  || fail 'no-op replaced the cache directory inode'
assert_no_debris
pass 'equal source and cache produce a true no-op'

setup_case selectors
expect_fail_current 'missing selector is rejected' CLI_USAGE
expect_fail_current 'Multica selector is rejected' PLUGIN_SELECTOR_FORBIDDEN multica-sdlc
expect_fail_current 'MemPalace selector is rejected' PLUGIN_SELECTOR_FORBIDDEN mempalace
expect_fail_current 'traversal selector is rejected' PLUGIN_SELECTOR_FORBIDDEN ../atlas-workflow

setup_case marketplace-shape
rm "$CASE_MARKETPLACE"
expect_fail_current 'missing marketplace is rejected' JSON_FILE_INVALID atlas-workflow
write_marketplace "$CASE_MARKETPLACE"
printf '%s\n' '[]' > "$CASE_MARKETPLACE"
expect_fail_current 'non-object marketplace is rejected' MARKETPLACE_NOT_OBJECT atlas-workflow
printf '%s\n' '{bad' > "$CASE_MARKETPLACE"
expect_fail_current 'invalid marketplace JSON is rejected' JSON_INVALID atlas-workflow
write_marketplace "$CASE_MARKETPLACE" atlas-forge
expect_fail_current 'wrong marketplace name is rejected' MARKETPLACE_NAME_INVALID atlas-workflow
write_marketplace "$CASE_MARKETPLACE" local-atlas local './plugins/not-atlas'
expect_fail_current 'noncanonical marketplace source path is rejected' MARKETPLACE_SOURCE_PATH_INVALID atlas-workflow
write_marketplace "$CASE_MARKETPLACE" local-atlas git './plugins/atlas-workflow'
expect_fail_current 'non-local marketplace source is rejected' MARKETPLACE_SOURCE_INVALID atlas-workflow
write_marketplace "$CASE_MARKETPLACE" local-atlas local './plugins/atlas-workflow' 2
expect_fail_current 'duplicate Atlas entries are rejected' MARKETPLACE_ATLAS_ENTRY_COUNT atlas-workflow

setup_case cache-override
if CODEX_PLUGIN_CACHE_ROOT="$CASE_ROOT/elsewhere" run_refresh atlas-workflow > "$CASE_OUTPUT" 2>/dev/null; then
  fail 'cache root override unexpectedly passed'
fi
assert_json "$CASE_OUTPUT" false none CACHE_ROOT_OVERRIDE_FORBIDDEN
pass 'cache root override cannot redirect the fixed target'

setup_case source-special
mkfifo "$CASE_SOURCE/unsupported-fifo"
expect_fail_current 'FIFO source entry is rejected' TREE_ENTRY_TYPE_FORBIDDEN atlas-workflow
rm "$CASE_SOURCE/unsupported-fifo"
ln -s README.md "$CASE_SOURCE/unsupported-link"
expect_fail_current 'symlink source entry is rejected' TREE_ENTRY_TYPE_FORBIDDEN atlas-workflow

for failpoint in copy install postverify; do
  setup_case "failure-$failpoint-existing"
  mkdir -p "$CASE_TARGET"
  printf '%s\n' old > "$CASE_TARGET/old.txt"
  target_before="$(fingerprint "$CASE_TARGET")"
  source_before="$(fingerprint "$CASE_SOURCE")"
  marketplace_before="$(fingerprint "$CASE_MARKETPLACE")"
  forbidden_before="$(forbidden_fingerprint)"
  if CODEX_REFRESH_LOCAL_PLUGIN_TESTING=1 \
    CODEX_REFRESH_LOCAL_PLUGIN_TEST_FAILPOINT="$failpoint" \
      run_refresh atlas-workflow > "$CASE_OUTPUT" 2> "$CASE_ROOT/stderr"; then
    fail "$failpoint failure unexpectedly passed"
  fi
  [[ ! -s "$CASE_ROOT/stderr" ]]
  assert_json "$CASE_OUTPUT" false none "TEST_${failpoint^^}_FAILURE"
  assert_fingerprint "$failpoint old target" "$CASE_TARGET" "$target_before"
  assert_fingerprint "$failpoint source" "$CASE_SOURCE" "$source_before"
  assert_fingerprint "$failpoint marketplace" "$CASE_MARKETPLACE" "$marketplace_before"
  [[ "$(forbidden_fingerprint)" == "$forbidden_before" ]]
  assert_no_debris
  pass "$failpoint failure restores the old cache without debris"
done

setup_case failure-absent
for failpoint in copy install postverify; do
  rm -rf "$CASE_TARGET"
  code_root_before="$(fingerprint "$CASE_CODEX_ROOT")"
  if CODEX_REFRESH_LOCAL_PLUGIN_TESTING=1 \
    CODEX_REFRESH_LOCAL_PLUGIN_TEST_FAILPOINT="$failpoint" \
      run_refresh atlas-workflow > "$CASE_OUTPUT" 2> "$CASE_ROOT/stderr"; then
    fail "$failpoint absent-target failure unexpectedly passed"
  fi
  [[ ! -e "$CASE_TARGET" && ! -L "$CASE_TARGET" ]]
  assert_fingerprint "$failpoint absent CODEX_HOME_ROOT" "$CASE_CODEX_ROOT" "$code_root_before"
  assert_no_debris
done
pass 'all injected failures restore an initially missing cache target'

setup_case failpoint-guard
if CODEX_REFRESH_LOCAL_PLUGIN_TEST_FAILPOINT=copy run_refresh atlas-workflow > "$CASE_OUTPUT" 2>/dev/null; then
  fail 'unguarded failpoint unexpectedly passed'
fi
assert_json "$CASE_OUTPUT" false none TEST_FAILPOINT_FORBIDDEN
pass 'test failpoints are disabled outside explicit testing mode'

setup_case marketplace-override
outside_marketplace="$CASE_ROOT/outside-marketplace.json"
cp -p "$CASE_MARKETPLACE" "$outside_marketplace"
case_before="$(managed_fingerprint)"
outside_before="$(fingerprint "$outside_marketplace")"
if CODEX_PLUGIN_MARKETPLACE_FILE="$outside_marketplace" \
  run_refresh atlas-workflow > "$CASE_OUTPUT" 2>/dev/null; then
  fail 'marketplace override unexpectedly passed'
fi
assert_json "$CASE_OUTPUT" false none MARKETPLACE_FILE_OVERRIDE_FORBIDDEN
[[ "$(managed_fingerprint)" == "$case_before" ]] || fail 'marketplace override changed managed roots'
assert_fingerprint 'marketplace override input' "$outside_marketplace" "$outside_before"
pass 'marketplace override cannot redirect the canonical configuration input'

setup_case noncanonical-cache-override
case_before="$(managed_fingerprint)"
if CODEX_PLUGIN_CACHE_ROOT="$CASE_CODEX_ROOT/plugins/../plugins/cache" \
  run_refresh atlas-workflow > "$CASE_OUTPUT" 2>/dev/null; then
  fail 'noncanonical cache override unexpectedly passed'
fi
assert_json "$CASE_OUTPUT" false none CACHE_ROOT_OVERRIDE_FORBIDDEN
[[ "$(managed_fingerprint)" == "$case_before" ]] || fail 'noncanonical cache override changed managed roots'
pass 'lexically noncanonical cache roots are rejected even when they normalize safely'

for symlink_case in source marketplace cache-parent target; do
  setup_case "symlink-$symlink_case"
  case "$symlink_case" in
    source)
      mv "$CASE_SOURCE" "$CASE_ROOT/outside-source"
      ln -s "$CASE_ROOT/outside-source" "$CASE_SOURCE"
      ;;
    marketplace)
      mv "$CASE_MARKETPLACE" "$CASE_ROOT/outside-marketplace.json"
      ln -s "$CASE_ROOT/outside-marketplace.json" "$CASE_MARKETPLACE"
      ;;
    cache-parent)
      ln -s "$CASE_CODEX_ROOT/.tmp/marketplaces/atlas-forge" \
        "$CASE_CODEX_ROOT/plugins/cache/local-atlas"
      ;;
    target)
      mkdir -p "$(dirname "$CASE_TARGET")"
      ln -s "$CASE_CODEX_ROOT/.tmp/marketplaces/atlas-forge" "$CASE_TARGET"
      ;;
  esac
  case_before="$(managed_fingerprint)"
  if [[ "$symlink_case" == source ]]; then
    outside_before="$(fingerprint "$CASE_ROOT/outside-source")"
  elif [[ "$symlink_case" == marketplace ]]; then
    outside_before="$(fingerprint "$CASE_ROOT/outside-marketplace.json")"
  else
    outside_before=""
  fi
  expect_fail_current "$symlink_case symlink is rejected" PATH_COMPONENT_SYMLINK_FORBIDDEN atlas-workflow
  [[ "$(managed_fingerprint)" == "$case_before" ]] || fail "$symlink_case symlink changed managed roots"
  if [[ -n "$outside_before" ]]; then
    if [[ "$symlink_case" == source ]]; then
      assert_fingerprint 'source symlink destination' "$CASE_ROOT/outside-source" "$outside_before"
    else
      assert_fingerprint 'marketplace symlink destination' "$CASE_ROOT/outside-marketplace.json" "$outside_before"
    fi
  fi
done
pass 'marketplace, source, cache-parent, and target symlink components are never followed'

setup_case target-special
mkdir -p "$CASE_TARGET"
printf '%s\n' old > "$CASE_TARGET/old.txt"
ln -s "$CASE_ROOT/victim" "$CASE_TARGET/unsupported-link"
case_before="$(managed_fingerprint)"
expect_fail_current 'existing cache symlink entry is rejected' TREE_ENTRY_TYPE_FORBIDDEN atlas-workflow
[[ "$(managed_fingerprint)" == "$case_before" ]] || fail 'existing cache special entry changed managed roots'
pass 'existing cache special entries fail before replacement staging'

for forbidden_case in home-agents agents-home; do
  setup_case "nested-$forbidden_case"
  if [[ "$forbidden_case" == home-agents ]]; then
    nested_root="$CASE_HOME/.agents/nested-codex"
  else
    nested_root="$CASE_AGENTS_HOME/nested-codex"
  fi
  mkdir -p "$nested_root/plugins"
  cp -a "$PLUGIN_SOURCE" "$nested_root/plugins/atlas-workflow"
  write_marketplace "$nested_root/.agents/plugins/marketplace.json"
  case_before="$(managed_fingerprint)"
  if HOME="$CASE_HOME" CODEX_HOME="$CASE_CODEX_HOME" CODEX_HOME_ROOT="$nested_root" \
    CODEX_WORKFLOW_ROOT="$CASE_WORKFLOW_ROOT" AGENTS_HOME="$CASE_AGENTS_HOME" \
    LOCAL_BIN_ROOT="$CASE_LOCAL_BIN" \
    "$BIN" atlas-workflow > "$CASE_OUTPUT" 2>/dev/null; then
    fail "$forbidden_case nested CODEX root unexpectedly passed"
  fi
  assert_json "$CASE_OUTPUT" false none FORBIDDEN_RUNTIME_ROOT
  [[ "$(managed_fingerprint)" == "$case_before" ]] || fail "$forbidden_case nested fixture changed managed roots"
done
pass 'CODEX roots nested in HOME/.agents or AGENTS_HOME fail before cache writes'

for overlap_case in workflow local-bin; do
  setup_case "overlap-$overlap_case"
  case_before="$(managed_fingerprint)"
  if [[ "$overlap_case" == workflow ]]; then
    overlap_workflow="$CASE_TARGET"
    overlap_bin="$CASE_LOCAL_BIN"
  else
    overlap_workflow="$CASE_WORKFLOW_ROOT"
    overlap_bin="$CASE_TARGET/bin"
  fi
  if HOME="$CASE_HOME" CODEX_HOME="$CASE_CODEX_HOME" CODEX_HOME_ROOT="$CASE_CODEX_ROOT" \
    CODEX_WORKFLOW_ROOT="$overlap_workflow" AGENTS_HOME="$CASE_AGENTS_HOME" \
    LOCAL_BIN_ROOT="$overlap_bin" \
    "$BIN" atlas-workflow > "$CASE_OUTPUT" 2>/dev/null; then
    fail "$overlap_case managed-root overlap unexpectedly passed"
  fi
  assert_json "$CASE_OUTPUT" false none MANAGED_ROOT_OVERLAP
  [[ "$(managed_fingerprint)" == "$case_before" ]] || fail "$overlap_case overlap changed managed roots"
done
pass 'cache source and target cannot overlap workflow or local-bin ownership roots'

setup_case default-local-bin-overlap
nested_root="$CASE_HOME/.local/bin/nested-codex"
mkdir -p "$nested_root/plugins"
cp -a "$PLUGIN_SOURCE" "$nested_root/plugins/atlas-workflow"
write_marketplace "$nested_root/.agents/plugins/marketplace.json"
default_bin_before="$(fingerprint "$CASE_HOME/.local/bin")"
if env -u LOCAL_BIN_ROOT \
  HOME="$CASE_HOME" CODEX_HOME="$CASE_CODEX_HOME" CODEX_HOME_ROOT="$nested_root" \
  CODEX_WORKFLOW_ROOT="$CASE_WORKFLOW_ROOT" AGENTS_HOME="$CASE_AGENTS_HOME" \
  "$BIN" atlas-workflow > "$CASE_OUTPUT" 2>/dev/null; then
  fail 'default local-bin overlap unexpectedly passed'
fi
assert_json "$CASE_OUTPUT" false none MANAGED_ROOT_OVERLAP
assert_fingerprint 'default local-bin overlap' "$CASE_HOME/.local/bin" "$default_bin_before"
pass 'default HOME/.local/bin ownership is protected when LOCAL_BIN_ROOT is unset'

setup_case codex-home-precedence
env -u CODEX_HOME_ROOT \
  HOME="$CASE_HOME" CODEX_HOME="$CASE_CODEX_ROOT" \
  CODEX_WORKFLOW_ROOT="$CASE_WORKFLOW_ROOT" AGENTS_HOME="$CASE_AGENTS_HOME" \
  LOCAL_BIN_ROOT="$CASE_LOCAL_BIN" \
  "$BIN" atlas-workflow > "$CASE_OUTPUT"
assert_json "$CASE_OUTPUT" true refreshed
diff -qr "$CASE_SOURCE" "$CASE_TARGET" >/dev/null
pass 'CODEX_HOME is the fallback root when CODEX_HOME_ROOT is unset'

setup_case installed-location-fallback
mkdir -p "$CASE_CODEX_ROOT/workflow/bin"
cp -p "$BIN" "$CASE_CODEX_ROOT/workflow/bin/codex-refresh-local-plugin"
cp -p "$INTEGRITY_BIN" "$CASE_CODEX_ROOT/workflow/bin/atlas-plugin-integrity"
env -u CODEX_HOME_ROOT -u CODEX_HOME \
  HOME="$CASE_HOME" CODEX_WORKFLOW_ROOT="$CASE_WORKFLOW_ROOT" \
  AGENTS_HOME="$CASE_AGENTS_HOME" LOCAL_BIN_ROOT="$CASE_LOCAL_BIN" \
  "$CASE_CODEX_ROOT/workflow/bin/codex-refresh-local-plugin" atlas-workflow > "$CASE_OUTPUT"
assert_json "$CASE_OUTPUT" true refreshed
diff -qr "$CASE_SOURCE" "$CASE_TARGET" >/dev/null
pass 'installed helper infers its Codex root when explicit root variables are unset'

repo_cache="$ATLAS_FORGE_ROOT/plugins/cache"
repo_cache_before="$(fingerprint "$repo_cache")"
if env -u CODEX_HOME_ROOT -u CODEX_HOME \
  HOME="$TMP_ROOT/repo-direct-home" AGENTS_HOME="$TMP_ROOT/repo-direct-agents" \
  "$BIN" atlas-workflow > "$TMP_ROOT/repo-direct.json" 2>/dev/null; then
  fail 'repo direct invocation without explicit roots unexpectedly passed'
fi
assert_json "$TMP_ROOT/repo-direct.json" false none MARKETPLACE_NAME_INVALID
assert_fingerprint 'repo direct cache' "$repo_cache" "$repo_cache_before"
pass 'repo direct invocation without explicit roots fails closed on atlas-forge marketplace'

setup_case absent-full-rollback
codex_before="$(fingerprint "$CASE_CODEX_ROOT")"
if CODEX_REFRESH_LOCAL_PLUGIN_TESTING=1 \
  CODEX_REFRESH_LOCAL_PLUGIN_TEST_FAILPOINT=install \
  run_refresh atlas-workflow > "$CASE_OUTPUT" 2>/dev/null; then
  fail 'absent-target full rollback unexpectedly passed'
fi
assert_json "$CASE_OUTPUT" false none TEST_INSTALL_FAILURE
assert_fingerprint 'absent-target full rollback' "$CASE_CODEX_ROOT" "$codex_before"
assert_no_debris
pass 'failed first install removes transaction-created cache parents'

setup_case sigterm-rollback
mkdir -p "$CASE_TARGET"
printf '%s\n' old-signal-cache > "$CASE_TARGET/old.txt"
signal_target_before="$(fingerprint "$CASE_TARGET")"
signal_inode_before="$(file_identity "$CASE_TARGET")"
signal_forbidden_before="$(forbidden_fingerprint)"
HOME="$CASE_HOME" \
CODEX_HOME="$CASE_CODEX_HOME" \
CODEX_HOME_ROOT="$CASE_CODEX_ROOT" \
CODEX_WORKFLOW_ROOT="$CASE_WORKFLOW_ROOT" \
AGENTS_HOME="$CASE_AGENTS_HOME" \
LOCAL_BIN_ROOT="$CASE_LOCAL_BIN" \
CODEX_REFRESH_LOCAL_PLUGIN_TESTING=1 \
CODEX_REFRESH_LOCAL_PLUGIN_TEST_PAUSE_AFTER_BACKUP=30 \
  "$BIN" atlas-workflow > "$CASE_OUTPUT" 2> "$CASE_ROOT/stderr" &
signal_pid=$!
backup_seen=0
for _ in $(seq 1 100); do
  if find "$(dirname "$CASE_TARGET")" -mindepth 1 -maxdepth 1 \
      -type d -name '.local.backup.*' -print -quit 2>/dev/null | grep -q .; then
    backup_seen=1
    break
  fi
  sleep 0.05
done
if [[ "$backup_seen" -ne 1 ]]; then
  kill -TERM "$signal_pid" 2>/dev/null || true
  wait "$signal_pid" 2>/dev/null || true
  fail 'SIGTERM fixture did not reach the post-backup pause'
fi
kill -TERM "$signal_pid"
set +e
wait "$signal_pid"
signal_rc=$?
set -e
[[ "$signal_rc" -eq 1 ]] || fail "SIGTERM helper exit was $signal_rc instead of 1"
[[ ! -s "$CASE_ROOT/stderr" ]]
assert_json "$CASE_OUTPUT" false none REFRESH_INTERRUPTED
assert_fingerprint 'SIGTERM restored target' "$CASE_TARGET" "$signal_target_before"
[[ "$(file_identity "$CASE_TARGET")" == "$signal_inode_before" ]] \
  || fail 'SIGTERM rollback did not restore the original cache inode'
[[ "$(forbidden_fingerprint)" == "$signal_forbidden_before" ]]
assert_no_debris
pass 'SIGTERM after backup is forwarded to the transaction and restores the old cache'

pass 'codex refresh local plugin contract'
