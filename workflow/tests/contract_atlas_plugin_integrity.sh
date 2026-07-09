#!/usr/bin/env bash
set -euo pipefail

ATLAS_FORGE_ROOT="${ATLAS_FORGE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
BIN="${ATLAS_PLUGIN_INTEGRITY_BIN:-$ATLAS_FORGE_ROOT/workflow/bin/atlas-plugin-integrity}"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

export HOME="$TMP_ROOT/home"
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_CONFIG_NOSYSTEM=1
mkdir -p "$HOME"

pass() {
  printf 'ok - %s\n' "$1"
}

assert_json() {
  local output="$1"
  local expected_ok="$2"
  local expected_code="${3:-}"
  node - "$output" "$expected_ok" "$expected_code" <<'NODE'
const fs = require("fs");
const [file, expectedOk, expectedCode] = process.argv.slice(2);
const payload = JSON.parse(fs.readFileSync(file, "utf8"));
if (payload.schema_version !== 1 || payload.tool !== "atlas-plugin-integrity") {
  throw new Error(`unexpected JSON envelope: ${file}`);
}
if (payload.ok !== (expectedOk === "true")) {
  throw new Error(`unexpected ok value in ${file}: ${payload.ok}`);
}
if (!payload.checks || !Array.isArray(payload.errors)) {
  throw new Error(`missing checks/errors in ${file}`);
}
if (expectedCode && !payload.errors.some((error) => error.code === expectedCode)) {
  throw new Error(`missing error ${expectedCode} in ${file}: ${JSON.stringify(payload.errors)}`);
}
NODE
}

case_id=0
run_pass() {
  local label="$1"
  shift
  case_id=$((case_id + 1))
  local output="$TMP_ROOT/case-$case_id.json"
  local stderr="$TMP_ROOT/case-$case_id.stderr"
  if ! "$BIN" "$@" >"$output" 2>"$stderr"; then
    printf 'expected pass but failed: %s\n' "$label" >&2
    cat "$output" >&2
    cat "$stderr" >&2
    exit 1
  fi
  test ! -s "$stderr"
  assert_json "$output" true
  pass "$label"
}

run_fail() {
  local label="$1"
  local expected_code="$2"
  shift 2
  case_id=$((case_id + 1))
  local output="$TMP_ROOT/case-$case_id.json"
  local stderr="$TMP_ROOT/case-$case_id.stderr"
  set +e
  "$BIN" "$@" >"$output" 2>"$stderr"
  local status=$?
  set -e
  if [[ "$status" -eq 0 ]]; then
    printf 'expected failure but passed: %s\n' "$label" >&2
    cat "$output" >&2
    exit 1
  fi
  test ! -s "$stderr"
  assert_json "$output" false "$expected_code"
  pass "$label"
}

write_plugin() {
  local root="$1"
  local version="$2"
  local prompt_count="${3:-3}"
  local prompt_length="${4:-16}"
  local prompt_character="${5:-x}"
  mkdir -p "$root/.codex-plugin"
  node - "$root/.codex-plugin/plugin.json" "$version" "$prompt_count" "$prompt_length" "$prompt_character" <<'NODE'
const fs = require("fs");
const [file, version, countValue, lengthValue, character] = process.argv.slice(2);
const manifest = {
  name: "atlas-workflow",
  interface: {
    defaultPrompt: Array.from(
      { length: Number(countValue) },
      () => character.repeat(Number(lengthValue)),
    ),
  },
};
if (version !== "__MISSING__") {
  manifest.version = version;
}
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
  printf '%s\n' 'fixture plugin content' > "$root/README.md"
}

copy_plugin() {
  local source="$1"
  local target="$2"
  rm -rf "$target"
  mkdir -p "$target"
  cp -a "$source/." "$target/"
}

init_repo() {
  local repo="$1"
  local version="$2"
  local marker="$3"
  mkdir -p "$repo"
  git -C "$repo" init -q -b main
  git -C "$repo" config user.email test@example.invalid
  git -C "$repo" config user.name 'Atlas Integrity Contract'
  write_plugin "$repo/plugins/atlas-workflow" "$version" 3 16 x
  printf '%s\n' "$marker" > "$repo/plugins/atlas-workflow/README.md"
  git -C "$repo" add plugins/atlas-workflow
  git -C "$repo" commit -q -m 'fixture base'
}

node --check "$BIN"

manifest_root="$TMP_ROOT/manifest-valid"
write_plugin "$manifest_root" '1.0.0+codex.fixture' 3 128 x
run_pass 'manifest accepts three prompts at 128 code points' manifest --plugin-root "$manifest_root"

manifest_output="$TMP_ROOT/manifest-unicode.json"
unicode_root="$TMP_ROOT/manifest-unicode"
write_plugin "$unicode_root" '1.0.0+codex.fixture' 3 128 '😀'
"$BIN" manifest --plugin-root "$unicode_root" > "$manifest_output"
assert_json "$manifest_output" true
node - "$manifest_output" <<'NODE'
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const entry = payload.checks.manifest.default_prompt.entries[0];
if (entry.code_points !== 128 || entry.utf16_code_units !== 256 || entry.utf8_bytes !== 512) {
  throw new Error(`unexpected Unicode metrics: ${JSON.stringify(entry)}`);
}
NODE
pass 'manifest counts Unicode code points rather than UTF-16 units'

four_prompts="$TMP_ROOT/manifest-four"
write_plugin "$four_prompts" '1.0.0+codex.fixture' 4 1 x
run_fail 'manifest rejects four prompts' DEFAULT_PROMPT_COUNT_EXCEEDED manifest --plugin-root "$four_prompts"

long_prompt="$TMP_ROOT/manifest-long"
write_plugin "$long_prompt" '1.0.0+codex.fixture' 3 129 x
run_fail 'manifest rejects 129 code points' DEFAULT_PROMPT_TOO_LONG manifest --plugin-root "$long_prompt"

missing_manifest="$TMP_ROOT/manifest-missing"
mkdir -p "$missing_manifest"
run_fail 'manifest rejects missing manifest' MANIFEST_MISSING manifest --plugin-root "$missing_manifest"

missing_version="$TMP_ROOT/manifest-version-missing"
write_plugin "$missing_version" __MISSING__ 3 8 x
run_fail 'manifest rejects missing version' MANIFEST_VERSION_MISSING manifest --plugin-root "$missing_version"

invalid_semver="$TMP_ROOT/manifest-invalid-semver"
write_plugin "$invalid_semver" '01.0.0+codex.fixture' 3 8 x
run_fail 'manifest rejects non-canonical SemVer' MANIFEST_VERSION_INVALID_SEMVER manifest --plugin-root "$invalid_semver"

wrong_name="$TMP_ROOT/manifest-wrong-name"
write_plugin "$wrong_name" '1.0.0+codex.fixture' 3 8 x
node - "$wrong_name/.codex-plugin/plugin.json" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
manifest.name = "not-atlas-workflow";
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
run_fail 'manifest rejects a non-Atlas plugin name' MANIFEST_NAME_INVALID manifest --plugin-root "$wrong_name"

prompt_alias="$TMP_ROOT/manifest-prompt-alias"
write_plugin "$prompt_alias" '1.0.0+codex.fixture' 3 8 x
node - "$prompt_alias/.codex-plugin/plugin.json" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
manifest.interface.default_prompt = ["x".repeat(129)];
delete manifest.interface.defaultPrompt;
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
run_fail 'manifest rejects default_prompt alias' DEFAULT_PROMPT_ALIAS_FORBIDDEN manifest --plugin-root "$prompt_alias"

prompt_alias_both="$TMP_ROOT/manifest-prompt-alias-both"
write_plugin "$prompt_alias_both" '1.0.0+codex.fixture' 3 8 x
node - "$prompt_alias_both/.codex-plugin/plugin.json" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
manifest.interface.default_prompt = ["alias"];
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
run_fail 'manifest rejects default_prompt beside defaultPrompt' DEFAULT_PROMPT_ALIAS_FORBIDDEN manifest --plugin-root "$prompt_alias_both"

empty_prompts="$TMP_ROOT/manifest-empty-prompts"
write_plugin "$empty_prompts" '1.0.0+codex.fixture' 0 8 x
run_pass 'manifest accepts an explicit empty defaultPrompt array' manifest --plugin-root "$empty_prompts"

missing_interface="$TMP_ROOT/manifest-interface-missing"
write_plugin "$missing_interface" '1.0.0+codex.fixture' 3 8 x
node - "$missing_interface/.codex-plugin/plugin.json" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
delete manifest.interface;
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
run_fail 'manifest rejects missing interface' MANIFEST_INTERFACE_MISSING manifest --plugin-root "$missing_interface"

missing_default_prompt="$TMP_ROOT/manifest-default-prompt-missing"
write_plugin "$missing_default_prompt" '1.0.0+codex.fixture' 3 8 x
node - "$missing_default_prompt/.codex-plugin/plugin.json" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
delete manifest.interface.defaultPrompt;
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
run_fail 'manifest rejects missing defaultPrompt' DEFAULT_PROMPT_MISSING manifest --plugin-root "$missing_default_prompt"

release_same="$TMP_ROOT/release-same"
init_repo "$release_same" '1.0.0+codex.1' base
same_base="$(git -C "$release_same" rev-parse HEAD)"
run_pass 'release accepts unchanged tree and version' release --repo "$release_same" --base "$same_base"

release_unchanged_history="$TMP_ROOT/release-unchanged-history"
init_repo "$release_unchanged_history" '1.0.0+codex.1' first
printf '%s\n' second > "$release_unchanged_history/plugins/atlas-workflow/README.md"
git -C "$release_unchanged_history" add plugins/atlas-workflow
git -C "$release_unchanged_history" commit -q -m 'fixture historical same-version tree'
unchanged_history_base="$(git -C "$release_unchanged_history" rev-parse HEAD)"
run_fail 'release rejects unchanged identity with older historical collision' VERSION_TREE_COLLISION release --repo "$release_unchanged_history" --base "$unchanged_history_base"

release_unbumped="$TMP_ROOT/release-unbumped"
init_repo "$release_unbumped" '1.0.0+codex.1' base
unbumped_base="$(git -C "$release_unbumped" rev-parse HEAD)"
printf '%s\n' changed > "$release_unbumped/plugins/atlas-workflow/README.md"
run_fail 'release rejects changed tree with unchanged version' PLUGIN_TREE_CHANGED_WITHOUT_VERSION_BUMP release --repo "$release_unbumped" --base "$unbumped_base"

release_bumped="$TMP_ROOT/release-bumped"
init_repo "$release_bumped" '1.0.0+codex.1' base
bumped_base="$(git -C "$release_bumped" rev-parse HEAD)"
write_plugin "$release_bumped/plugins/atlas-workflow" '1.0.0+codex.2' 3 16 x
printf '%s\n' changed > "$release_bumped/plugins/atlas-workflow/README.md"
run_pass 'release accepts changed tree with new version' release --repo "$release_bumped" --base "$bumped_base"

release_version_only="$TMP_ROOT/release-version-only"
init_repo "$release_version_only" '1.0.0+codex.1' base
version_only_base="$(git -C "$release_version_only" rev-parse HEAD)"
write_plugin "$release_version_only/plugins/atlas-workflow" '1.0.0+codex.2' 3 16 x
printf '%s\n' base > "$release_version_only/plugins/atlas-workflow/README.md"
run_pass 'release accepts a version-only identity change' release --repo "$release_version_only" --base "$version_only_base"

release_committed_bump="$TMP_ROOT/release-committed-bump"
init_repo "$release_committed_bump" '1.0.0+codex.1' first
committed_bump_base="$(git -C "$release_committed_bump" rev-parse HEAD)"
write_plugin "$release_committed_bump/plugins/atlas-workflow" '1.0.0+codex.2' 3 16 x
printf '%s\n' second > "$release_committed_bump/plugins/atlas-workflow/README.md"
git -C "$release_committed_bump" add plugins/atlas-workflow
git -C "$release_committed_bump" commit -q -m 'fixture clean committed bump'
run_pass 'release accepts clean committed version introduced after base' release --repo "$release_committed_bump" --base "$committed_bump_base"

release_collision="$TMP_ROOT/release-collision"
init_repo "$release_collision" '1.0.0+codex.1' first
collision_first="$(git -C "$release_collision" rev-parse HEAD)"
write_plugin "$release_collision/plugins/atlas-workflow" '1.0.0+codex.2' 3 16 x
printf '%s\n' second > "$release_collision/plugins/atlas-workflow/README.md"
git -C "$release_collision" add plugins/atlas-workflow
git -C "$release_collision" commit -q -m 'fixture second identity'
collision_base="$(git -C "$release_collision" rev-parse HEAD)"
write_plugin "$release_collision/plugins/atlas-workflow" '1.0.0+codex.1' 3 16 x
printf '%s\n' collision > "$release_collision/plugins/atlas-workflow/README.md"
run_fail 'release rejects historical version bound to different tree' VERSION_TREE_COLLISION release --repo "$release_collision" --base "$collision_base"

git -C "$release_collision" restore --source="$collision_first" --worktree -- plugins/atlas-workflow
run_fail 'release rejects reuse of historical version with exact original tree' VERSION_REUSE_FORBIDDEN release --repo "$release_collision" --base "$collision_base"

release_stale_base="$TMP_ROOT/release-stale-base"
init_repo "$release_stale_base" '1.0.0+codex.1' first
stale_phase_base="$(git -C "$release_stale_base" rev-parse HEAD)"
write_plugin "$release_stale_base/plugins/atlas-workflow" '1.0.0+codex.2' 3 16 x
printf '%s\n' second > "$release_stale_base/plugins/atlas-workflow/README.md"
git -C "$release_stale_base" add plugins/atlas-workflow
git -C "$release_stale_base" commit -q -m 'fixture committed second identity'
write_plugin "$release_stale_base/plugins/atlas-workflow" '1.0.0+codex.2' 3 16 x
printf '%s\n' collision > "$release_stale_base/plugins/atlas-workflow/README.md"
run_fail 'release scans HEAD history when phase base is stale' VERSION_TREE_COLLISION release --repo "$release_stale_base" --base "$stale_phase_base"

release_non_ancestor="$TMP_ROOT/release-non-ancestor"
init_repo "$release_non_ancestor" '1.0.0+codex.1' base
orphan_tree="$(printf '' | git -C "$release_non_ancestor" mktree)"
orphan_commit="$(printf '%s\n' 'orphan fixture' | git -C "$release_non_ancestor" commit-tree "$orphan_tree")"
run_fail 'release rejects base outside HEAD ancestry' BASE_NOT_HEAD_ANCESTOR release --repo "$release_non_ancestor" --base "$orphan_commit"

release_base_missing="$TMP_ROOT/release-base-missing"
mkdir -p "$release_base_missing"
git -C "$release_base_missing" init -q -b main
git -C "$release_base_missing" config user.email test@example.invalid
git -C "$release_base_missing" config user.name 'Atlas Integrity Contract'
printf '%s\n' base > "$release_base_missing/base.txt"
git -C "$release_base_missing" add base.txt
git -C "$release_base_missing" commit -q -m 'fixture without plugin'
base_without_manifest="$(git -C "$release_base_missing" rev-parse HEAD)"
write_plugin "$release_base_missing/plugins/atlas-workflow" '1.0.0+codex.1' 3 16 x
run_fail 'release rejects base without manifest' BASE_MANIFEST_MISSING release --repo "$release_base_missing" --base "$base_without_manifest"

release_current_version_missing="$TMP_ROOT/release-current-version-missing"
init_repo "$release_current_version_missing" '1.0.0+codex.1' base
current_version_base="$(git -C "$release_current_version_missing" rev-parse HEAD)"
write_plugin "$release_current_version_missing/plugins/atlas-workflow" __MISSING__ 3 16 x
run_fail 'release rejects current manifest without version' MANIFEST_VERSION_MISSING release --repo "$release_current_version_missing" --base "$current_version_base"

layout_root="$TMP_ROOT/layout"
layout_version='2.0.0+codex.fixture'
layout_source="$layout_root/source"
layout_snapshot="$layout_root/snapshot"
layout_cache="$layout_root/cache/$layout_version"
write_plugin "$layout_source" "$layout_version" 3 16 x
copy_plugin "$layout_source" "$layout_snapshot"
git -C "$layout_snapshot" init -q -b main
git -C "$layout_snapshot" config user.email test@example.invalid
git -C "$layout_snapshot" config user.name 'Atlas Integrity Contract'
git -C "$layout_snapshot" add .
git -C "$layout_snapshot" commit -q -m 'snapshot fixture'
layout_commit="$(git -C "$layout_snapshot" rev-parse HEAD)"
copy_plugin "$layout_source" "$layout_cache"

run_pass 'layout accepts matching source snapshot and exact cache' layout \
  --source "$layout_source" \
  --snapshot "$layout_snapshot" \
  --cache "$layout_cache" \
  --expected-version "$layout_version" \
  --expected-commit "$layout_commit"

run_fail 'layout rejects non-canonical expected SemVer' EXPECTED_VERSION_INVALID_SEMVER layout \
  --source "$layout_source" \
  --snapshot "$layout_snapshot" \
  --cache "$layout_cache" \
  --expected-version '02.0.0+codex.fixture'

layout_latest="$layout_root/cache/latest"
copy_plugin "$layout_source" "$layout_latest"
run_fail 'layout rejects latest cache alias' CACHE_PATH_NOT_EXACT_VERSION layout \
  --source "$layout_source" \
  --snapshot "$layout_snapshot" \
  --cache "$layout_latest" \
  --expected-version "$layout_version"

layout_symlink_root="$layout_root/symlink-cache"
mkdir -p "$layout_symlink_root"
ln -s "$layout_latest" "$layout_symlink_root/$layout_version"
run_fail 'layout rejects exact-version symlink to latest' CACHE_PATH_SYMLINK_FORBIDDEN layout \
  --source "$layout_source" \
  --snapshot "$layout_snapshot" \
  --cache "$layout_symlink_root/$layout_version" \
  --expected-version "$layout_version"

printf '%s\n' different > "$layout_cache/README.md"
run_fail 'layout rejects mismatched cache tree' LAYOUT_TREE_MISMATCH layout \
  --source "$layout_source" \
  --snapshot "$layout_snapshot" \
  --cache "$layout_cache" \
  --expected-version "$layout_version"
copy_plugin "$layout_source" "$layout_cache"

mkdir -p "$layout_cache/.git"
printf '%s\n' extra > "$layout_cache/.git/extra"
run_fail 'layout includes cache .git content in tree identity' LAYOUT_TREE_MISMATCH layout \
  --source "$layout_source" \
  --snapshot "$layout_snapshot" \
  --cache "$layout_cache" \
  --expected-version "$layout_version"
rm -rf "$layout_cache/.git"

write_plugin "$layout_cache" '2.0.0+codex.other' 3 16 x
run_fail 'layout rejects manifest version mismatch' LAYOUT_VERSION_MISMATCH layout \
  --source "$layout_source" \
  --snapshot "$layout_snapshot" \
  --cache "$layout_cache" \
  --expected-version "$layout_version"
copy_plugin "$layout_source" "$layout_cache"

run_fail 'layout rejects missing exact cache directory' PATH_NOT_FOUND layout \
  --source "$layout_source" \
  --snapshot "$layout_snapshot" \
  --cache "$layout_root/missing/$layout_version" \
  --expected-version "$layout_version"

run_fail 'layout rejects unexpected snapshot commit' SNAPSHOT_COMMIT_MISMATCH layout \
  --source "$layout_source" \
  --snapshot "$layout_snapshot" \
  --cache "$layout_cache" \
  --expected-version "$layout_version" \
  --expected-commit 0000000000000000000000000000000000000000

printf '%s\n' dirty > "$layout_snapshot/untracked.txt"
run_fail 'layout rejects dirty snapshot checkout' SNAPSHOT_DIRTY layout \
  --source "$layout_source" \
  --snapshot "$layout_snapshot" \
  --cache "$layout_cache" \
  --expected-version "$layout_version" \
  --expected-commit "$layout_commit"

pass 'atlas plugin integrity contract'
