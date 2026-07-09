#!/usr/bin/env bash
set -euo pipefail

ATLAS_FORGE_ROOT="${ATLAS_FORGE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
VERIFY="$ATLAS_FORGE_ROOT/scripts/verify-atlas-workflow-install.sh"
UPDATE="$ATLAS_FORGE_ROOT/scripts/update-atlas-workflow-marketplace"
PLUGIN_SOURCE="$ATLAS_FORGE_ROOT/plugins/atlas-workflow"
TMP_ROOT="$(mktemp -d)"
mkdir -p "$TMP_ROOT/outputs"
trap 'rm -rf "$TMP_ROOT"' EXIT

PASS_COUNT=0

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  printf 'ok - %s\n' "$1"
}

fail() {
  printf 'not ok - %s\n' "$1" >&2
  exit 1
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
    find . -type d -printf 'd %m %p\n' | LC_ALL=C sort
    find . -type f -print0 | LC_ALL=C sort -z \
      | while IFS= read -r -d '' file; do
          printf 'f %s %s ' "$(stat -c '%a' "$file")" "$file"
          sha256sum "$file" | awk '{print $1}'
        done
    find . -type l -printf 'l %p -> %l\n' | LC_ALL=C sort
  ) | sha256sum | awk '{print $1}'
}

assert_fingerprint() {
  local label="$1" target="$2" expected="$3"
  [[ "$(fingerprint "$target")" == "$expected" ]] || fail "$label changed: $target"
}

set_plugin_version() {
  local root="$1" version="$2"
  node - "$root/.codex-plugin/plugin.json" "$version" <<'NODE'
const fs = require("fs");
const [file, version] = process.argv.slice(2);
const value = JSON.parse(fs.readFileSync(file, "utf8"));
value.version = version;
fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
NODE
}

write_marketplace() {
  local file="$1" name="${2:-atlas-only}" shared="${3:-0}"
  mkdir -p "$(dirname "$file")"
  node - "$file" "$name" "$shared" <<'NODE'
const fs = require("fs");
const [file, name, shared] = process.argv.slice(2);
const plugins = [{
  name: "atlas-workflow",
  source: { source: "local", path: "./plugins/atlas-workflow" },
}];
if (shared === "1") {
  plugins.push({ name: "multica-sdlc", source: { source: "local", path: "./plugins/multica-sdlc" } });
}
fs.writeFileSync(file, `${JSON.stringify({ name, plugins }, null, 2)}\n`);
NODE
}

write_config() {
  local ref="$1" revision="$2" other_enabled="${3:-0}" atlas_enabled="${4:-1}"
  mkdir -p "$CODEX_ROOT"
  {
    printf '[marketplaces.%s]\n' "$MARKETPLACE"
    printf 'source_type = "git"\n'
    printf 'source = "%s"\n' "$EXPECTED_SOURCE"
    printf 'ref = "%s"\n' "$ref"
    printf 'last_revision = "%s"\n\n' "$revision"
    if [[ "$atlas_enabled" != missing ]]; then
      printf '[plugins."atlas-workflow@%s"]\n' "$MARKETPLACE"
      if [[ "$atlas_enabled" == 1 ]]; then printf 'enabled = true\n'; else printf 'enabled = false\n'; fi
    fi
    if [[ "$other_enabled" == 1 ]]; then
      printf '\n[plugins."multica-sdlc@%s"]\n' "$MARKETPLACE"
      printf 'enabled = true\n'
    fi
  } > "$CODEX_ROOT/config.toml"
}

write_sidecar() {
  local revision="$1" ref_name="${2:-$1}" sparse="${3:-0}"
  node - "$SNAPSHOT/.codex-marketplace-install.json" "$EXPECTED_SOURCE" "$ref_name" "$revision" "$sparse" <<'NODE'
const fs = require("fs");
const [file, source, refName, revision, sparse] = process.argv.slice(2);
fs.writeFileSync(file, `${JSON.stringify({
  source_type: "git",
  source,
  ref_name: refName,
  revision,
  sparse_paths: sparse === "1" ? ["plugins/atlas-workflow"] : [],
}, null, 2)}\n`);
NODE
}

run_isolated() {
  env -u SSH_AUTH_SOCK -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE \
    -u GIT_OBJECT_DIRECTORY -u GIT_ALTERNATE_OBJECT_DIRECTORIES -u GIT_CONFIG_COUNT \
    HOME="$HOME_ROOT" \
    CODEX_HOME="$CODEX_HOME_VALUE" \
    CODEX_HOME_ROOT="$CODEX_ROOT" \
    CODEX_WORKFLOW_ROOT="$WORKFLOW_ROOT" \
    AGENTS_HOME="$AGENTS_ROOT" \
    LOCAL_BIN_ROOT="$BIN_ROOT" \
    XDG_CONFIG_HOME="$XDG_CONFIG_ROOT" \
    XDG_CACHE_HOME="$XDG_CACHE_ROOT" \
    XDG_DATA_HOME="$XDG_DATA_ROOT" \
    XDG_STATE_HOME="$XDG_STATE_ROOT" \
    XDG_RUNTIME_DIR="$XDG_RUNTIME_ROOT" \
    TMPDIR="$CASE_TMP" \
    GIT_CONFIG_GLOBAL="$GIT_CONFIG_FILE" \
    GIT_CONFIG_SYSTEM=/dev/null \
    GIT_CONFIG_NOSYSTEM=1 \
    GIT_TEMPLATE_DIR="$GIT_TEMPLATE_ROOT" \
    GIT_TERMINAL_PROMPT=0 \
    GIT_CEILING_DIRECTORIES="$CASE_ROOT" \
    GIT_AUTHOR_NAME=Fixture \
    GIT_AUTHOR_EMAIL=fixture@example.invalid \
    GIT_COMMITTER_NAME=Fixture \
    GIT_COMMITTER_EMAIL=fixture@example.invalid \
    "$@"
}

run_fixture_git() {
  run_isolated git -c commit.gpgSign=false -c tag.gpgSign=false -c core.hooksPath=/dev/null "$@"
}

setup_case() {
  local name="$1" target_version="${2:-1.0.0+codex.2}"
  CASE_ROOT="$TMP_ROOT/$name"
  REPO="$CASE_ROOT/repo"
  REMOTE="$CASE_ROOT/remote.git"
  HOME_ROOT="$CASE_ROOT/home"
  CODEX_HOME_VALUE="$CASE_ROOT/codex-home"
  CODEX_ROOT="$CASE_ROOT/codex-root"
  WORKFLOW_ROOT="$CASE_ROOT/workflow"
  AGENTS_ROOT="$CASE_ROOT/agents-home"
  BIN_ROOT="$CASE_ROOT/bin"
  XDG_CONFIG_ROOT="$CASE_ROOT/xdg/config"
  XDG_CACHE_ROOT="$CASE_ROOT/xdg/cache"
  XDG_DATA_ROOT="$CASE_ROOT/xdg/data"
  XDG_STATE_ROOT="$CASE_ROOT/xdg/state"
  XDG_RUNTIME_ROOT="$CASE_ROOT/xdg/runtime"
  CASE_TMP="$CASE_ROOT/tmp"
  GIT_CONFIG_FILE="$CASE_ROOT/gitconfig"
  GIT_TEMPLATE_ROOT="$CASE_ROOT/git-template"
  MARKETPLACE="atlas-only"
  EXPECTED_SOURCE="ssh://fixture.invalid/atlas-only.git"
  OUTPUT="$TMP_ROOT/outputs/$name.json"

  mkdir -p "$REPO/plugins" "$HOME_ROOT/.agents" "$CODEX_HOME_VALUE" \
    "$WORKFLOW_ROOT" "$AGENTS_ROOT" "$BIN_ROOT" "$XDG_CONFIG_ROOT" \
    "$XDG_CACHE_ROOT" "$XDG_DATA_ROOT" "$XDG_STATE_ROOT" "$XDG_RUNTIME_ROOT" \
    "$CASE_TMP" "$GIT_TEMPLATE_ROOT"
  touch "$GIT_CONFIG_FILE"
  chmod 700 "$XDG_RUNTIME_ROOT"
  cp -a "$PLUGIN_SOURCE" "$REPO/plugins/atlas-workflow"
  write_marketplace "$REPO/.agents/plugins/marketplace.json"
  run_fixture_git -C "$REPO" init -q -b main

  set_plugin_version "$REPO/plugins/atlas-workflow" '1.0.0+codex.1'
  printf '%s\n' base > "$REPO/plugins/atlas-workflow/fixture-release.txt"
  run_fixture_git -C "$REPO" add .
  run_fixture_git -C "$REPO" commit -q -m base
  BASE_SHA="$(run_fixture_git -C "$REPO" rev-parse HEAD)"

  set_plugin_version "$REPO/plugins/atlas-workflow" "$target_version"
  printf '%s\n' expected > "$REPO/plugins/atlas-workflow/fixture-release.txt"
  run_fixture_git -C "$REPO" add plugins/atlas-workflow
  run_fixture_git -C "$REPO" commit -q -m expected
  EXPECTED_SHA="$(run_fixture_git -C "$REPO" rev-parse HEAD)"
  EXPECTED_VERSION="$target_version"

  run_fixture_git clone -q --bare "$REPO" "$REMOTE"
  run_fixture_git -C "$REPO" remote add origin "$REMOTE"
  run_fixture_git -C "$REPO" fetch -q origin
  run_fixture_git -C "$REPO" branch --set-upstream-to=origin/main main >/dev/null

  printf '%s\n' home-agents > "$HOME_ROOT/.agents/sentinel"
  printf '%s\n' agents-home > "$AGENTS_ROOT/sentinel"
  printf '%s\n' multica-shim > "$BIN_ROOT/multica-prd-submit"
  write_config "$EXPECTED_SHA" "$EXPECTED_SHA"

  SNAPSHOT="$CODEX_ROOT/.tmp/marketplaces/$MARKETPLACE"
  mkdir -p "$(dirname "$SNAPSHOT")"
  run_fixture_git clone -q "$REMOTE" "$SNAPSHOT"
  write_sidecar "$EXPECTED_SHA"

  CACHE_PARENT="$CODEX_ROOT/plugins/cache/$MARKETPLACE/atlas-workflow"
  EXACT_CACHE="$CACHE_PARENT/$EXPECTED_VERSION"
  mkdir -p "$CACHE_PARENT"
  cp -a "$REPO/plugins/atlas-workflow" "$EXACT_CACHE"
}

advance_shared_marketplace() {
  write_marketplace "$REPO/.agents/plugins/marketplace.json" "$MARKETPLACE" 1
  run_fixture_git -C "$REPO" add .agents/plugins/marketplace.json
  run_fixture_git -C "$REPO" commit -q -m shared
  EXPECTED_SHA="$(run_fixture_git -C "$REPO" rev-parse HEAD)"
  run_fixture_git -C "$REPO" push -q origin main
  run_fixture_git -C "$REPO" fetch -q origin
  write_config "$EXPECTED_SHA" "$EXPECTED_SHA"
}

scope_fingerprint() {
  {
    fingerprint "$REPO"
    fingerprint "$CODEX_ROOT"
    fingerprint "$HOME_ROOT/.agents"
    fingerprint "$AGENTS_ROOT"
    fingerprint "$BIN_ROOT"
  } | sha256sum | awk '{print $1}'
}

run_verify() {
  local mode="$1"
  run_isolated "$VERIFY" "$mode" \
      --repo "$REPO" \
      --base "$BASE_SHA" \
      --expected-commit "$EXPECTED_SHA" \
      --marketplace "$MARKETPLACE" \
      --expected-source "$EXPECTED_SOURCE" \
      --codex-home "$CODEX_ROOT"
}

assert_json() {
  local file="$1" ok="$2" mode="$3" code="${4:-}"
  node - "$file" "$ok" "$mode" "$code" <<'NODE'
const fs = require("fs");
const [file, expectedOk, mode, code] = process.argv.slice(2);
const value = JSON.parse(fs.readFileSync(file, "utf8"));
if (value.schema_version !== 1 || value.tool !== "verify-atlas-workflow-install" || value.mode !== mode) {
  throw new Error(`invalid envelope: ${JSON.stringify(value)}`);
}
if (value.ok !== (expectedOk === "true")) throw new Error(`unexpected ok: ${JSON.stringify(value)}`);
for (const section of ["inputs", "repo", "release_identity", "marketplace_contract", "marketplace_config", "version_order", "snapshot", "sidecar", "exact_cache"]) {
  if (!(section in value.checks)) throw new Error(`missing section ${section}`);
}
if (code && !value.errors.some((error) => error.code === code)) {
  throw new Error(`missing error ${code}: ${JSON.stringify(value)}`);
}
NODE
}

assert_wrapper_json() {
  local file="$1" code="$2"
  node - "$file" "$code" <<'NODE'
const fs = require("fs");
const [file, code] = process.argv.slice(2);
const value = JSON.parse(fs.readFileSync(file, "utf8"));
if (value.schema_version !== 1 || value.tool !== "update-atlas-workflow-marketplace" || value.ok !== false) {
  throw new Error(`invalid wrapper envelope: ${JSON.stringify(value)}`);
}
if (!value.errors.some((error) => error.code === code)) {
  throw new Error(`missing wrapper error ${code}: ${JSON.stringify(value)}`);
}
NODE
}

expect_failure() {
  local label="$1" mode="$2" code="$3"
  local before
  before="$(scope_fingerprint)"
  if run_verify "$mode" > "$OUTPUT" 2> "$CASE_ROOT/stderr"; then
    fail "$label unexpectedly passed"
  fi
  [[ ! -s "$CASE_ROOT/stderr" ]]
  assert_json "$OUTPUT" false "$mode" "$code"
  [[ "$(scope_fingerprint)" == "$before" ]] || fail "$label changed a protected scope"
  pass "$label"
}

bash -n "$VERIFY"
bash -n "$UPDATE"

setup_case healthy
before="$(scope_fingerprint)"
run_verify preflight > "$OUTPUT"
assert_json "$OUTPUT" true preflight
[[ "$(scope_fingerprint)" == "$before" ]]
pass 'healthy release preflight is complete JSON and read-only'
run_verify installed > "$OUTPUT"
assert_json "$OUTPUT" true installed
[[ "$(scope_fingerprint)" == "$before" ]]
pass 'healthy installed layout is complete JSON and read-only'

setup_case moving-ref
write_config main "$EXPECTED_SHA"
expect_failure 'moving marketplace ref is rejected' preflight MOVING_REF_FORBIDDEN

setup_case shared-marketplace
advance_shared_marketplace
expect_failure 'shared marketplace is rejected before install mutation' preflight SHARED_MARKETPLACE_FORBIDDEN

setup_case other-enabled
write_config "$EXPECTED_SHA" "$EXPECTED_SHA" 1
expect_failure 'another enabled marketplace plugin is rejected' preflight OTHER_ENABLED_PLUGIN_PRESENT

setup_case repo-dirty
printf '%s\n' dirty > "$REPO/untracked"
expect_failure 'dirty repo is rejected' preflight REPO_DIRTY

setup_case short-expected-sha
EXPECTED_SHA="${EXPECTED_SHA:0:12}"
expect_failure 'short expected commit is rejected' preflight EXPECTED_COMMIT_INVALID

setup_case short-base-sha
BASE_SHA="${BASE_SHA:0:12}"
expect_failure 'short base commit is rejected' preflight BASE_COMMIT_INVALID

setup_case release-version-downgrade '0.9.0+codex.1'
expect_failure 'release version cannot move backward even when no older cache remains' preflight RELEASE_VERSION_DOWNGRADE

setup_case latest-cache
mkdir -p "$CACHE_PARENT/latest"
expect_failure 'latest cache fallback is rejected' preflight LATEST_FALLBACK_FORBIDDEN

setup_case higher-version
cp -a "$REPO/plugins/atlas-workflow" "$CACHE_PARENT/1.0.0+codex.3"
set_plugin_version "$CACHE_PARENT/1.0.0+codex.3" '1.0.0+codex.3'
expect_failure 'higher installed Atlas version blocks downgrade' preflight RELEASE_DOWNGRADE

setup_case ambiguous-build
cp -a "$REPO/plugins/atlas-workflow" "$CACHE_PARENT/1.0.0+other"
set_plugin_version "$CACHE_PARENT/1.0.0+other" '1.0.0+other'
expect_failure 'ambiguous build metadata order fails closed' preflight VERSION_ORDER_UNPROVEN

setup_case exact-collision
printf '%s\n' collision >> "$EXACT_CACHE/fixture-release.txt"
expect_failure 'same-version different-tree cache is rejected' preflight VERSION_TREE_COLLISION

setup_case invalid-lower-cache
mkdir -p "$CACHE_PARENT/1.0.0+codex.1"
printf '%s\n' junk > "$CACHE_PARENT/1.0.0+codex.1/junk"
expect_failure 'lower cache without a valid Atlas manifest is rejected' preflight INSTALLED_CACHE_MANIFEST_INVALID

setup_case mismatched-lower-cache-version
cp -a "$REPO/plugins/atlas-workflow" "$CACHE_PARENT/1.0.0+codex.1"
expect_failure 'lower cache directory and manifest versions must agree' preflight INSTALLED_CACHE_VERSION_MISMATCH

setup_case exact-symlink
rm -rf "$EXACT_CACHE"
ln -s "$REPO/plugins/atlas-workflow" "$EXACT_CACHE"
expect_failure 'exact cache symlink is rejected' installed EXACT_CACHE_SYMLINK_FORBIDDEN

setup_case missing-exact
rm -rf "$EXACT_CACHE"
expect_failure 'missing exact cache is rejected' installed EXACT_CACHE_MISSING

setup_case stale-snapshot
run_fixture_git -C "$SNAPSHOT" checkout -q "$BASE_SHA"
expect_failure 'stale snapshot commit is rejected' installed SNAPSHOT_COMMIT_MISMATCH

setup_case parent-git-snapshot
snapshot_parent="$(dirname "$SNAPSHOT")"
mv "$SNAPSHOT/.git" "$snapshot_parent/.git"
mkdir -p "$snapshot_parent/.git/info"
printf '%s/\n' "$MARKETPLACE" >> "$snapshot_parent/.git/info/exclude"
expect_failure 'snapshot must own its Git worktree instead of inheriting a parent checkout' installed SNAPSHOT_GIT_METADATA_INVALID

setup_case symlinked-snapshot-git
mv "$SNAPSHOT/.git" "$CASE_ROOT/snapshot-git"
ln -s "$CASE_ROOT/snapshot-git" "$SNAPSHOT/.git"
expect_failure 'symlinked snapshot Git metadata is rejected' installed SNAPSHOT_GIT_METADATA_INVALID

setup_case dirty-snapshot
printf '%s\n' dirty >> "$SNAPSHOT/plugins/atlas-workflow/fixture-release.txt"
expect_failure 'dirty snapshot plugin tree is rejected' installed SNAPSHOT_DIRTY

setup_case symlinked-snapshot-plugin
mv "$SNAPSHOT/plugins/atlas-workflow" "$SNAPSHOT/plugins/atlas-workflow.real"
ln -s atlas-workflow.real "$SNAPSHOT/plugins/atlas-workflow"
expect_failure 'symlinked snapshot plugin is rejected before tree traversal' installed SNAPSHOT_PLUGIN_SYMLINK_FORBIDDEN

setup_case dirty-snapshot-marketplace
printf ' \n' >> "$SNAPSHOT/.agents/plugins/marketplace.json"
expect_failure 'dirty snapshot marketplace metadata is rejected' installed SNAPSHOT_DIRTY

setup_case sidecar-revision
write_sidecar "$BASE_SHA"
expect_failure 'sidecar revision mismatch is rejected' installed SIDECAR_MISMATCH

setup_case sidecar-sparse
write_sidecar "$EXPECTED_SHA" "$EXPECTED_SHA" 1
expect_failure 'nonempty sidecar sparse paths are rejected' installed SIDECAR_MISMATCH

setup_case config-revision
write_config "$EXPECTED_SHA" "$BASE_SHA"
expect_failure 'config last_revision mismatch is rejected' installed MARKETPLACE_REVISION_MISMATCH

setup_case config-revision-type
python3 - "$CODEX_ROOT/config.toml" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
path.write_text("".join(
    "last_revision = " + "1" * 40 + "\n" if line.startswith("last_revision = ") else line
    for line in lines
), encoding="utf-8")
PY
expect_failure 'config last_revision must be a full SHA string rather than a TOML integer' installed MARKETPLACE_REVISION_INVALID

setup_case config-atlas-missing
write_config "$EXPECTED_SHA" "$EXPECTED_SHA" 0 missing
expect_failure 'installed verification requires the Atlas selector to be enabled' installed ATLAS_PLUGIN_NOT_ENABLED

setup_case codex-root-symlink
mv "$CODEX_ROOT" "$CASE_ROOT/real-codex-root"
ln -s "$CASE_ROOT/real-codex-root" "$CODEX_ROOT"
expect_failure 'symlinked Codex root is rejected' preflight PATH_COMPONENT_SYMLINK_FORBIDDEN

setup_case wrapper-delegation
before="$(scope_fingerprint)"
run_isolated "$UPDATE" --preflight-only \
    --repo "$REPO" --base "$BASE_SHA" --expected-commit "$EXPECTED_SHA" \
    --marketplace "$MARKETPLACE" --expected-source "$EXPECTED_SOURCE" \
    --codex-home "$CODEX_ROOT" > "$OUTPUT"
assert_json "$OUTPUT" true preflight
[[ "$(scope_fingerprint)" == "$before" ]]
run_isolated "$UPDATE" --verify-only \
    --repo "$REPO" --base "$BASE_SHA" --expected-commit "$EXPECTED_SHA" \
    --marketplace "$MARKETPLACE" --expected-source "$EXPECTED_SOURCE" \
    --codex-home "$CODEX_ROOT" > "$OUTPUT"
assert_json "$OUTPUT" true installed
[[ "$(scope_fingerprint)" == "$before" ]]
pass 'release wrapper delegates only read-only preflight and installed verification'

setup_case wrapper-execute-disabled
mkdir -p "$CASE_ROOT/fake-bin"
printf '%s\n' '#!/usr/bin/env bash' 'printf called > "$CODEX_CALLED"' 'exit 99' \
  > "$CASE_ROOT/fake-bin/codex"
chmod 755 "$CASE_ROOT/fake-bin/codex"
before="$(scope_fingerprint)"
if PATH="$CASE_ROOT/fake-bin:$PATH" CODEX_CALLED="$CASE_ROOT/codex-called" \
  run_isolated "$UPDATE" --execute --repo "$REPO" > "$OUTPUT" 2> "$CASE_ROOT/stderr"; then
  fail 'release execute unexpectedly passed'
fi
[[ ! -s "$CASE_ROOT/stderr" && ! -e "$CASE_ROOT/codex-called" ]]
assert_wrapper_json "$OUTPUT" MUTATION_DISABLED
[[ "$(scope_fingerprint)" == "$before" ]]
pass 'release execute is disabled before any Codex CLI lookup or protected write'

setup_case wrapper-shared
advance_shared_marketplace
mkdir -p "$CASE_ROOT/fake-bin"
printf '%s\n' '#!/usr/bin/env bash' 'printf called > "$CODEX_CALLED"' 'exit 99' \
  > "$CASE_ROOT/fake-bin/codex"
chmod 755 "$CASE_ROOT/fake-bin/codex"
before="$(scope_fingerprint)"
if PATH="$CASE_ROOT/fake-bin:$PATH" CODEX_CALLED="$CASE_ROOT/codex-called" \
  run_isolated "$UPDATE" --preflight-only \
    --repo "$REPO" --base "$BASE_SHA" --expected-commit "$EXPECTED_SHA" \
    --marketplace "$MARKETPLACE" --expected-source "$EXPECTED_SOURCE" \
    --codex-home "$CODEX_ROOT" > "$OUTPUT" 2> "$CASE_ROOT/stderr"; then
  fail 'shared wrapper preflight unexpectedly passed'
fi
[[ ! -s "$CASE_ROOT/stderr" && ! -e "$CASE_ROOT/codex-called" ]]
assert_json "$OUTPUT" false preflight SHARED_MARKETPLACE_FORBIDDEN
[[ "$(scope_fingerprint)" == "$before" ]]
pass 'shared marketplace is rejected without invoking Codex CLI'

printf '1..%s\n' "$PASS_COUNT"
