#!/usr/bin/env bash
set -euo pipefail
export PYTHONDONTWRITEBYTECODE=1

ATLAS_FORGE_ROOT="${ATLAS_FORGE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
UPDATE_SCRIPT="$ATLAS_FORGE_ROOT/scripts/update-atlas-workflow-plugin"
SYNC_SCRIPT="$ATLAS_FORGE_ROOT/scripts/sync-live-atlas-workflow.sh"
TMP_ROOT="$(cd "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "$TMP_ROOT"' EXIT

REAL_RSYNC="$(command -v rsync)"
EXPECTED_PLUGIN_FILTER_ARGS=(
  '--exclude=/tools/atlas-3d-harness/node_modules/'
  '--exclude=/tools/atlas-3d-harness/.local/'
  '--exclude=/tools/atlas-3d-harness/runs/'
  '--exclude=/tools/atlas-3d-harness/artifacts/'
  '--exclude=/tools/atlas-3d-harness/runtime-config.local.json'
  '--exclude=/tools/atlas-3d-harness/*.log'
)

pass() {
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
    sha256sum "$target" | awk '{print $1}'
    return
  fi

  (
    cd "$target"
    find . -type d -print | LC_ALL=C sort | sed 's/^/dir /'
    find . -type f -print0 \
      | LC_ALL=C sort -z \
      | while IFS= read -r -d '' file; do
          printf 'file %s ' "$file"
          sha256sum "$file" | awk '{print $1}'
        done
    find . -type l -print0 \
      | LC_ALL=C sort -z \
      | while IFS= read -r -d '' file; do
          printf 'link %s -> %s\n' "$file" "$(readlink "$file")"
        done
    find . -type p -print | LC_ALL=C sort | sed 's/^/fifo /'
  ) | sha256sum | awk '{print $1}'
}

assert_fingerprint() {
  local label="$1"
  local target="$2"
  local expected="$3"
  local actual

  actual="$(fingerprint "$target")"
  [[ "$actual" == "$expected" ]] || fail "$label changed: $target"
}

assert_filtered_plugin_copy() {
  local source="$1"
  local target="$2"
  local label="$3"
  local changes
  local tool="$target/tools/atlas-3d-harness"

  changes="$(rsync -ani --delete --delete-excluded \
    "${EXPECTED_PLUGIN_FILTER_ARGS[@]}" "$source/" "$target/")"
  [[ -z "$changes" ]] || fail "$label differs from filtered plugin source: $changes"
  [[ ! -e "$tool/node_modules" ]]
  [[ ! -e "$tool/.local" ]]
  [[ ! -e "$tool/runs" ]]
  [[ ! -e "$tool/artifacts" ]]
  [[ ! -e "$tool/runtime-config.local.json" ]]
  [[ ! -e "$tool/runtime-generated.log" ]]
  if find "$target" -name '.atlas-3d-browser-cache-must-not-sync' -print -quit | grep -q .; then
    fail "$label absorbed the repo-level Atlas 3D browser cache"
  fi
}

write_marketplace() {
  local codex_home_root="$1"
  local marketplace_name="$2"
  local source_kind="$3"
  local source_path="$4"
  local duplicate="${5:-0}"
  local marketplace_file="$codex_home_root/.agents/plugins/marketplace.json"

  mkdir -p "$(dirname "$marketplace_file")"
  node - "$marketplace_file" "$marketplace_name" "$source_kind" "$source_path" "$duplicate" <<'NODE'
const fs = require("fs");
const [file, marketplaceName, sourceKind, sourcePath, duplicateValue] = process.argv.slice(2);
const plugin = {
  name: "atlas-workflow",
  source: { source: sourceKind, path: sourcePath },
};
const plugins = [plugin];
if (duplicateValue === "1") {
  plugins.push(JSON.parse(JSON.stringify(plugin)));
}
fs.writeFileSync(file, `${JSON.stringify({ name: marketplaceName, plugins }, null, 2)}\n`);
NODE
}

assert_no_transaction_debris() {
  local codex_home_root="$1"
  if find "$codex_home_root/plugins" -type d \
      \( -name '.atlas-workflow.stage.*' -o -name '.atlas-workflow.backup.*' \
         -o -name '.local.stage.*' -o -name '.local.backup.*' \) \
      -print -quit 2>/dev/null | grep -q .; then
    fail "transaction stage or backup directory leaked"
  fi
}

assert_allowed_codex_tree() {
  local codex_home_root="$1"
  local relative

  while IFS= read -r relative; do
    case "$relative" in
      .agents|.agents/plugins|.agents/plugins/marketplace.json) ;;
      .tmp|.tmp/marketplaces|.tmp/marketplaces/atlas-forge|.tmp/marketplaces/atlas-forge/*) ;;
      agents|agents/atlas-sdd-browser-verifier.toml|agents/atlas-sdd-explorer.toml|agents/atlas-sdd-explorer-deepseek.toml|agents/atlas-sdd-implementer.toml|agents/atlas-sdd-implementer-deepseek.toml|agents/atlas-sdd-phase-reviewer.toml|agents/atlas-sdd-planner.toml|agents/atlas-sdd-planner-deepseek.toml|agents/atlas-sdd-reviewer.toml|agents/atlas-sdd-reviewer-deepseek.toml|agents/atlas-sdd-verifier.toml|agents/model-policy.json|agents/unrelated.toml) ;;
      plugins|plugins/atlas-workflow|plugins/atlas-workflow/*) ;;
      plugins/cache|plugins/cache/atlas-forge|plugins/cache/atlas-forge/*) ;;
      plugins/cache/local-atlas|plugins/cache/local-atlas/atlas-workflow|plugins/cache/local-atlas/atlas-workflow/local|plugins/cache/local-atlas/atlas-workflow/local/*) ;;
      *) fail "unexpected CODEX_HOME_ROOT write: $relative" ;;
    esac
  done < <(cd "$codex_home_root" && find . -mindepth 1 -print | sed 's#^\./##' | LC_ALL=C sort)
}

run_success_case() {
  local case_root="$TMP_ROOT/success"
  local home="$case_root/home"
  local codex_home="$case_root/codex-home"
  local codex_home_root="$case_root/codex-root"
  local workflow_root="$case_root/live-workflow"
  local agents_home="$case_root/agents-home"
  local local_bin="$case_root/local-bin"
  local snapshot="$codex_home_root/.tmp/marketplaces/atlas-forge/plugins/atlas-workflow"
  local release_cache="$codex_home_root/plugins/cache/atlas-forge/atlas-workflow/9.9.9"
  local local_source="$codex_home_root/plugins/atlas-workflow"
  local local_cache="$codex_home_root/plugins/cache/local-atlas/atlas-workflow/local"
  local output="$TMP_ROOT/success.out"
  local marketplace_before snapshot_before release_before agents_before legacy_before multica_before

  write_marketplace "$codex_home_root" local-atlas local './plugins/atlas-workflow'
  mkdir -p "$home/.agents" "$codex_home" "$snapshot" "$release_cache" \
    "$agents_home" "$local_bin" "$workflow_root/tasks" "$workflow_root/artifacts" \
    "$workflow_root/state" "$codex_home_root/agents"
  printf '%s\n' 'HOME-LEGACY-SENTINEL' > "$home/.agents/sentinel"
  printf '%s\n' 'CODEX-HOME-SENTINEL' > "$codex_home/sentinel"
  printf '%s\n' 'SNAPSHOT-SENTINEL' > "$snapshot/sentinel"
  printf '%s\n' 'RELEASE-CACHE-SENTINEL' > "$release_cache/sentinel"
  printf '%s\n' 'AGENTS-HOME-SENTINEL' > "$agents_home/sentinel"
  printf '%s\n' 'MULTICA-SHIM-SENTINEL' > "$local_bin/multica-prd-submit"
  printf '%s\n' 'UNRELATED-AGENT-SENTINEL' > "$codex_home_root/agents/unrelated.toml"
  printf '%s\n' 'TASK-STATE-SENTINEL' > "$workflow_root/tasks/preserve.md"
  printf '%s\n' 'ARTIFACT-STATE-SENTINEL' > "$workflow_root/artifacts/preserve.md"
  printf '%s\n' 'WORKFLOW-STATE-SENTINEL' > "$workflow_root/state/preserve"

  marketplace_before="$(fingerprint "$codex_home_root/.agents/plugins/marketplace.json")"
  snapshot_before="$(fingerprint "$snapshot")"
  release_before="$(fingerprint "$release_cache")"
  agents_before="$(fingerprint "$agents_home")"
  legacy_before="$(fingerprint "$home/.agents")"
  multica_before="$(fingerprint "$local_bin/multica-prd-submit")"

  HOME="$home" \
  CODEX_HOME="$codex_home" \
  CODEX_HOME_ROOT="$codex_home_root" \
  CODEX_WORKFLOW_ROOT="$workflow_root" \
  AGENTS_HOME="$agents_home" \
  LOCAL_BIN_ROOT="$local_bin" \
    "$UPDATE_SCRIPT" --skip-validate --contract > "$output"

  grep -q 'validated repo Atlas plugin integrity' "$output"
  grep -q 'ok - atlas plugin integrity contract' "$output"
  grep -q 'refreshed local-atlas installed cache atomically' "$output"
  grep -q 'No atlas-forge marketplace snapshot or release cache was changed' "$output"
  assert_filtered_plugin_copy "$ATLAS_FORGE_ROOT/plugins/atlas-workflow" "$local_source" 'local plugin source'
  assert_filtered_plugin_copy "$ATLAS_FORGE_ROOT/plugins/atlas-workflow" "$local_cache" 'local-atlas plugin cache'
  diff -qr "$local_source" "$local_cache" >/dev/null
  pass 'dev refresh keeps filtered repo source, local source, and local-atlas cache equal'
  pass 'dev refresh excludes Atlas 3D dependencies, runtime state, and browser cache'

  for directory_name in bin hooks templates tests; do
    diff -qr "$ATLAS_FORGE_ROOT/workflow/$directory_name" "$workflow_root/$directory_name" >/dev/null
  done
  [[ -x "$workflow_root/bin/codex-workflow" ]]
  [[ -x "$workflow_root/bin/codex-workflow-legacy" ]]
  cmp -s "$ATLAS_FORGE_ROOT/workflow/README.md" "$workflow_root/README.md"
  [[ "$(<"$workflow_root/source-root")" == "$ATLAS_FORGE_ROOT" ]]
  pass 'Atlas workflow helpers are synchronized without replacing workflow state roots'

  for agent_name in \
    atlas-sdd-browser-verifier.toml \
    atlas-sdd-explorer.toml \
    atlas-sdd-explorer-deepseek.toml \
    atlas-sdd-implementer.toml \
    atlas-sdd-implementer-deepseek.toml \
    atlas-sdd-phase-reviewer.toml \
    atlas-sdd-planner.toml \
    atlas-sdd-planner-deepseek.toml \
    atlas-sdd-reviewer.toml \
    atlas-sdd-reviewer-deepseek.toml \
    atlas-sdd-verifier.toml \
    model-policy.json; do
    cmp -s "$ATLAS_FORGE_ROOT/.codex/agents/$agent_name" "$codex_home_root/agents/$agent_name"
  done
  grep -q 'UNRELATED-AGENT-SENTINEL' "$codex_home_root/agents/unrelated.toml"
  for command_name in atlas-native-agent-inbox atlas-plugin-integrity atlas-team-model-catalog atlas-zenmux-bearer-token codex-design-review codex-refresh-local-plugin codex-workflow; do
    [[ -x "$local_bin/$command_name" ]]
    grep -Fq "$workflow_root/bin/$command_name" "$local_bin/$command_name"
  done
  pass 'only native Atlas agents and Atlas command shims are installed'

  assert_fingerprint 'local marketplace bytes' "$codex_home_root/.agents/plugins/marketplace.json" "$marketplace_before"
  assert_fingerprint 'atlas-forge snapshot sentinel' "$snapshot" "$snapshot_before"
  assert_fingerprint 'atlas-forge cache sentinel' "$release_cache" "$release_before"
  assert_fingerprint 'AGENTS_HOME sentinel' "$agents_home" "$agents_before"
  assert_fingerprint 'HOME legacy .agents sentinel' "$home/.agents" "$legacy_before"
  assert_fingerprint 'Multica shim sentinel' "$local_bin/multica-prd-submit" "$multica_before"
  grep -q 'CODEX-HOME-SENTINEL' "$codex_home/sentinel"
  grep -q 'TASK-STATE-SENTINEL' "$workflow_root/tasks/preserve.md"
  grep -q 'ARTIFACT-STATE-SENTINEL' "$workflow_root/artifacts/preserve.md"
  grep -q 'WORKFLOW-STATE-SENTINEL' "$workflow_root/state/preserve"
  [[ ! -e "$codex_home_root/test" ]]
  assert_no_transaction_debris "$codex_home_root"
  assert_allowed_codex_tree "$codex_home_root"
  pass 'release, Multica, legacy agents, marketplace, and workflow state sentinels are unchanged'
}

assert_preflight_failure() {
  local label="$1"
  local marketplace_name="$2"
  local source_kind="$3"
  local source_path="$4"
  local duplicate="${5:-0}"
  local case_root="$TMP_ROOT/preflight-${label// /-}"
  local home="$case_root/home"
  local codex_home="$case_root/codex-home"
  local codex_home_root="$case_root/codex-root"
  local workflow_root="$case_root/live-workflow"
  local agents_home="$case_root/agents-home"
  local local_bin="$case_root/local-bin"
  local output="$case_root.out"
  local before

  if [[ "$marketplace_name" != '__MISSING__' ]]; then
    write_marketplace "$codex_home_root" "$marketplace_name" "$source_kind" "$source_path" "$duplicate"
  fi
  before="$(fingerprint "$codex_home_root")"

  if HOME="$home" \
    CODEX_HOME="$codex_home" \
    CODEX_HOME_ROOT="$codex_home_root" \
    CODEX_WORKFLOW_ROOT="$workflow_root" \
    AGENTS_HOME="$agents_home" \
    LOCAL_BIN_ROOT="$local_bin" \
      "$UPDATE_SCRIPT" --skip-validate > "$output" 2>&1; then
    fail "$label unexpectedly passed"
  fi

  assert_fingerprint "$label CODEX_HOME_ROOT" "$codex_home_root" "$before"
  if [[ -e "$home" || -e "$codex_home" || -e "$workflow_root" || -e "$agents_home" || -e "$local_bin" ]]; then
    for unexpected in "$home" "$codex_home" "$workflow_root" "$agents_home" "$local_bin"; do
      [[ ! -e "$unexpected" ]] || printf 'unexpected preflight path: %s\n' "$unexpected" >&2
    done
    fail "$label wrote outside the marketplace fixture"
  fi
  pass "$label fails before every runtime write"
}

run_preflight_cases() {
  assert_preflight_failure 'missing marketplace' __MISSING__ local './plugins/atlas-workflow'
  assert_preflight_failure 'wrong marketplace name' atlas-forge local './plugins/atlas-workflow'
  assert_preflight_failure 'wrong source kind' local-atlas git './plugins/atlas-workflow'
  assert_preflight_failure 'wrong source path' local-atlas local './plugins/not-atlas-workflow'
  assert_preflight_failure 'escaping source path' local-atlas local './plugins/../plugins/atlas-workflow'
  assert_preflight_failure 'duplicate Atlas entry' local-atlas local './plugins/atlas-workflow' 1

  local object_root="$TMP_ROOT/preflight-non-object"
  mkdir -p "$object_root/codex-root/.agents/plugins"
  printf '%s\n' '[]' > "$object_root/codex-root/.agents/plugins/marketplace.json"
  local before
  before="$(fingerprint "$object_root/codex-root")"
  if HOME="$object_root/home" \
    CODEX_HOME="$object_root/codex-home" \
    CODEX_HOME_ROOT="$object_root/codex-root" \
    CODEX_WORKFLOW_ROOT="$object_root/workflow" \
    AGENTS_HOME="$object_root/agents-home" \
    LOCAL_BIN_ROOT="$object_root/bin" \
      "$UPDATE_SCRIPT" --skip-validate > "$object_root.out" 2>&1; then
    fail 'non-object marketplace unexpectedly passed'
  fi
  assert_fingerprint 'non-object marketplace CODEX_HOME_ROOT' "$object_root/codex-root" "$before"
  [[ ! -e "$object_root/home" && ! -e "$object_root/codex-home" && ! -e "$object_root/workflow" \
     && ! -e "$object_root/agents-home" && ! -e "$object_root/bin" ]]
  pass 'non-object marketplace fails before every runtime write'

  local symlink_root="$TMP_ROOT/preflight-symlink"
  write_marketplace "$symlink_root/codex-root" local-atlas local './plugins/atlas-workflow'
  mkdir -p "$symlink_root/codex-root/plugins" "$symlink_root/outside"
  ln -s "$symlink_root/outside" "$symlink_root/codex-root/plugins/atlas-workflow"
  before="$(fingerprint "$symlink_root/codex-root")"
  if HOME="$symlink_root/home" \
    CODEX_HOME="$symlink_root/codex-home" \
    CODEX_HOME_ROOT="$symlink_root/codex-root" \
    CODEX_WORKFLOW_ROOT="$symlink_root/workflow" \
    AGENTS_HOME="$symlink_root/agents-home" \
    LOCAL_BIN_ROOT="$symlink_root/bin" \
      "$UPDATE_SCRIPT" --skip-validate > "$symlink_root.out" 2>&1; then
    fail 'symlinked local source unexpectedly passed'
  fi
  assert_fingerprint 'symlinked local source CODEX_HOME_ROOT' "$symlink_root/codex-root" "$before"
  [[ ! -e "$symlink_root/home" && ! -e "$symlink_root/codex-home" && ! -e "$symlink_root/workflow" \
     && ! -e "$symlink_root/agents-home" && ! -e "$symlink_root/bin" ]]
  pass 'symlinked local source fails before every runtime write'

  local cache_symlink_root="$TMP_ROOT/preflight-cache-parent-symlink"
  write_marketplace "$cache_symlink_root/codex-root" local-atlas local './plugins/atlas-workflow'
  mkdir -p "$cache_symlink_root/codex-root/plugins" "$cache_symlink_root/outside"
  ln -s "$cache_symlink_root/outside" "$cache_symlink_root/codex-root/plugins/cache"
  before="$(fingerprint "$cache_symlink_root/codex-root")"
  local outside_before
  outside_before="$(fingerprint "$cache_symlink_root/outside")"
  if HOME="$cache_symlink_root/home" \
    CODEX_HOME="$cache_symlink_root/codex-home" \
    CODEX_HOME_ROOT="$cache_symlink_root/codex-root" \
    CODEX_WORKFLOW_ROOT="$cache_symlink_root/workflow" \
    AGENTS_HOME="$cache_symlink_root/agents-home" \
    LOCAL_BIN_ROOT="$cache_symlink_root/bin" \
      "$UPDATE_SCRIPT" --skip-validate > "$cache_symlink_root.out" 2>&1; then
    fail 'symlinked local cache parent unexpectedly passed'
  fi
  assert_fingerprint 'symlinked cache parent CODEX_HOME_ROOT' "$cache_symlink_root/codex-root" "$before"
  assert_fingerprint 'symlinked cache parent destination' "$cache_symlink_root/outside" "$outside_before"
  [[ ! -e "$cache_symlink_root/home" && ! -e "$cache_symlink_root/codex-home" \
     && ! -e "$cache_symlink_root/workflow" && ! -e "$cache_symlink_root/agents-home" \
     && ! -e "$cache_symlink_root/bin" ]]
  grep -q 'must not traverse symlinks' "$cache_symlink_root.out"
  pass 'symlinked local cache parent fails before every runtime write'
}

run_dry_run_case() {
  local case_root="$TMP_ROOT/dry-run"
  local codex_home_root="$case_root/codex-root"
  local output="$TMP_ROOT/dry-run.out"
  local before

  write_marketplace "$codex_home_root" local-atlas local './plugins/atlas-workflow'
  before="$(fingerprint "$case_root")"
  HOME="$case_root/home" \
  CODEX_HOME="$case_root/codex-home" \
  CODEX_HOME_ROOT="$codex_home_root" \
  CODEX_WORKFLOW_ROOT="$case_root/workflow" \
  AGENTS_HOME="$case_root/agents-home" \
  LOCAL_BIN_ROOT="$case_root/bin" \
    "$UPDATE_SCRIPT" --dry-run --contract --skip-validate > "$output"

  assert_fingerprint 'dry-run runtime' "$case_root" "$before"
  grep -q 'would sync atlas-workflow source to local plugin source' "$output"
  grep -q 'would refresh installed local plugin cache atomically' "$output"
  grep -q 'would sync workflow helpers' "$output"
  grep -q 'would sync native Codex agents' "$output"
  grep -q 'dry-run: contract suite was not executed' "$output"
  grep -q 'no files were written' "$output"
  pass 'dry-run validates and reports the dev-only plan without writes or contract execution'
}

run_root_injection_cases() {
  local mode

  for mode in snapshot release-cache legacy-agents overlap; do
    local case_root="$TMP_ROOT/root-injection-$mode"
    local home="$case_root/home"
    local codex_home="$case_root/codex-home"
    local codex_home_root="$case_root/codex-root"
    local agents_home="$case_root/agents-home"
    local workflow_root="$case_root/workflow"
    local local_bin="$case_root/bin"
    local local_source="$codex_home_root/plugins/atlas-workflow"
    local local_cache="$codex_home_root/plugins/cache/local-atlas/atlas-workflow/local"
    local output="$case_root.out"
    local codex_before agents_before

    case "$mode" in
      snapshot)
        workflow_root="$codex_home_root/.tmp/marketplaces/atlas-forge/plugins/atlas-workflow/workflow"
        ;;
      release-cache)
        workflow_root="$codex_home_root/plugins/cache/atlas-forge/atlas-workflow/9.9.9/workflow"
        ;;
      legacy-agents)
        workflow_root="$agents_home/workflow"
        ;;
      overlap)
        local_bin="$workflow_root/bin"
        ;;
    esac

    write_marketplace "$codex_home_root" local-atlas local './plugins/atlas-workflow'
    mkdir -p "$local_source" "$local_cache" "$agents_home"
    printf '%s\n' 'OLD-LOCAL-SOURCE' > "$local_source/sentinel"
    printf '%s\n' 'OLD-LOCAL-CACHE' > "$local_cache/sentinel"
    printf '%s\n' 'LEGACY-AGENTS-SENTINEL' > "$agents_home/sentinel"
    codex_before="$(fingerprint "$codex_home_root")"
    agents_before="$(fingerprint "$agents_home")"

    if HOME="$home" \
      CODEX_HOME="$codex_home" \
      CODEX_HOME_ROOT="$codex_home_root" \
      CODEX_WORKFLOW_ROOT="$workflow_root" \
      AGENTS_HOME="$agents_home" \
      LOCAL_BIN_ROOT="$local_bin" \
        "$UPDATE_SCRIPT" --skip-validate > "$output" 2>&1; then
      fail "$mode root injection unexpectedly passed"
    fi

    assert_fingerprint "$mode root injection CODEX_HOME_ROOT" "$codex_home_root" "$codex_before"
    assert_fingerprint "$mode root injection AGENTS_HOME" "$agents_home" "$agents_before"
    [[ ! -e "$home" && ! -e "$codex_home" ]] || fail "$mode root injection wrote fallback roots"
    [[ ! -e "$local_bin" ]] || fail "$mode root injection wrote local command shims"
    if [[ "$mode" == overlap ]]; then
      [[ ! -e "$workflow_root" ]] || fail 'overlap root injection wrote workflow targets'
    fi
    grep -Eq 'forbidden runtime root|must not overlap' "$output"
    pass "$mode root injection fails before local source, cache, release, or legacy writes"
  done
}

run_copy_failure_case() {
  local case_root="$TMP_ROOT/copy-failure"
  local codex_home_root="$case_root/codex-root"
  local local_source="$codex_home_root/plugins/atlas-workflow"
  local local_cache="$codex_home_root/plugins/cache/local-atlas/atlas-workflow/local"
  local fake_bin="$case_root/fake-bin"
  local output="$TMP_ROOT/copy-failure.out"
  local source_before cache_before

  write_marketplace "$codex_home_root" local-atlas local './plugins/atlas-workflow'
  mkdir -p "$local_source" "$local_cache" "$fake_bin"
  printf '%s\n' 'OLD-LOCAL-SOURCE' > "$local_source/sentinel"
  printf '%s\n' 'OLD-LOCAL-CACHE' > "$local_cache/sentinel"
  source_before="$(fingerprint "$local_source")"
  cache_before="$(fingerprint "$local_cache")"

  printf '%s\n' \
    '#!/usr/bin/env bash' \
    'set -euo pipefail' \
    'count=0' \
    '[[ ! -f "$RSYNC_CALL_COUNTER" ]] || count="$(<"$RSYNC_CALL_COUNTER")"' \
    'count=$((count + 1))' \
    'printf "%s\\n" "$count" > "$RSYNC_CALL_COUNTER"' \
    'if [[ "$count" -eq 1 ]]; then exit 23; fi' \
    'exec "$REAL_RSYNC" "$@"' \
    > "$fake_bin/rsync"
  chmod +x "$fake_bin/rsync"

  if PATH="$fake_bin:$PATH" \
    REAL_RSYNC="$REAL_RSYNC" \
    RSYNC_CALL_COUNTER="$case_root/rsync-count" \
    HOME="$case_root/home" \
    CODEX_HOME="$case_root/codex-home" \
    CODEX_HOME_ROOT="$codex_home_root" \
    CODEX_WORKFLOW_ROOT="$case_root/workflow" \
    AGENTS_HOME="$case_root/agents-home" \
    LOCAL_BIN_ROOT="$case_root/bin" \
      "$UPDATE_SCRIPT" --skip-validate > "$output" 2>&1; then
    fail 'injected source-copy failure unexpectedly passed'
  fi

  assert_fingerprint 'old local source after copy failure' "$local_source" "$source_before"
  assert_fingerprint 'old local cache after copy failure' "$local_cache" "$cache_before"
  assert_no_transaction_debris "$codex_home_root"
  [[ ! -e "$case_root/workflow" && ! -e "$case_root/agents-home" && ! -e "$case_root/bin" ]]
  grep -q 'existing source and cache were preserved' "$output"
  pass 'source copy failure preserves both old development copies without partial targets'
}

run_updater_sync_failure_case() {
  local case_root="$TMP_ROOT/updater-sync-failure"
  local home="$case_root/home"
  local codex_home="$case_root/codex-home"
  local codex_home_root="$case_root/codex-root"
  local workflow_root="$case_root/workflow"
  local agents_home="$case_root/agents-home"
  local local_bin="$case_root/bin"
  local local_source="$codex_home_root/plugins/atlas-workflow"
  local local_cache="$codex_home_root/plugins/cache/local-atlas/atlas-workflow/local"
  local fake_bin="$case_root/fake-bin"
  local output="$TMP_ROOT/updater-sync-failure.out"
  local codex_before workflow_before agents_before bin_before legacy_before

  write_marketplace "$codex_home_root" local-atlas local './plugins/atlas-workflow'
  mkdir -p "$local_source" "$local_cache" "$workflow_root/bin" "$workflow_root/hooks" \
    "$workflow_root/templates" "$workflow_root/tests" "$workflow_root/tasks" \
    "$codex_home_root/agents" "$agents_home" "$local_bin" "$fake_bin"
  printf '%s\n' 'OLD-LOCAL-SOURCE' > "$local_source/sentinel"
  printf '%s\n' 'OLD-LOCAL-CACHE' > "$local_cache/sentinel"
  printf '%s\n' 'OLD-BIN' > "$workflow_root/bin/KEEP"
  printf '%s\n' 'OLD-HOOKS' > "$workflow_root/hooks/KEEP"
  printf '%s\n' 'OLD-TEMPLATES' > "$workflow_root/templates/KEEP"
  printf '%s\n' 'OLD-TESTS' > "$workflow_root/tests/KEEP"
  printf '%s\n' 'OLD-STATE' > "$workflow_root/tasks/KEEP"
  printf '%s\n' 'OLD-README' > "$workflow_root/README.md"
  printf '%s\n' 'OLD-SOURCE-ROOT' > "$workflow_root/source-root"
  printf '%s\n' 'OLD-AGENT' > "$codex_home_root/agents/atlas-sdd-explorer.toml"
  printf '%s\n' 'UNRELATED-AGENT' > "$codex_home_root/agents/unrelated.toml"
  printf '%s\n' 'OLD-ATLAS-SHIM' > "$local_bin/codex-workflow"
  printf '%s\n' 'MULTICA-SHIM' > "$local_bin/multica-prd-submit"
  printf '%s\n' 'LEGACY-AGENTS' > "$agents_home/sentinel"
  codex_before="$(fingerprint "$codex_home_root")"
  workflow_before="$(fingerprint "$workflow_root")"
  agents_before="$(fingerprint "$codex_home_root/agents")"
  bin_before="$(fingerprint "$local_bin")"
  legacy_before="$(fingerprint "$agents_home")"

  printf '%s\n' \
    '#!/usr/bin/env bash' \
    'set -euo pipefail' \
    'for argument in "$@"; do' \
    '  if [[ "$argument" == "$WORKFLOW_SYNC_SOURCE" ]]; then' \
    '    printf "%s\\n" injected > "$RSYNC_INJECTION_MARKER"' \
    '    exit 42' \
    '  fi' \
    'done' \
    'exec "$REAL_RSYNC" "$@"' \
    > "$fake_bin/rsync"
  chmod +x "$fake_bin/rsync"

  if PATH="$fake_bin:$PATH" \
    REAL_RSYNC="$REAL_RSYNC" \
    WORKFLOW_SYNC_SOURCE="$ATLAS_FORGE_ROOT/workflow/bin/" \
    RSYNC_INJECTION_MARKER="$case_root/rsync-injected" \
    HOME="$home" \
    CODEX_HOME="$codex_home" \
    CODEX_HOME_ROOT="$codex_home_root" \
    CODEX_WORKFLOW_ROOT="$workflow_root" \
    AGENTS_HOME="$agents_home" \
    LOCAL_BIN_ROOT="$local_bin" \
      "$UPDATE_SCRIPT" --skip-validate > "$output" 2>&1; then
    fail 'updater-level sync copy failure unexpectedly passed'
  fi

  [[ "$(<"$case_root/rsync-injected")" == injected ]]
  assert_fingerprint 'updater rollback CODEX_HOME_ROOT' "$codex_home_root" "$codex_before"
  assert_fingerprint 'updater rollback workflow roots' "$workflow_root" "$workflow_before"
  assert_fingerprint 'updater rollback Codex agents' "$codex_home_root/agents" "$agents_before"
  assert_fingerprint 'updater rollback command shims' "$local_bin" "$bin_before"
  assert_fingerprint 'updater rollback legacy agents' "$agents_home" "$legacy_before"
  assert_no_transaction_debris "$codex_home_root"
  grep -q 'managed targets were preserved' "$output" || {
    sed -n '1,200p' "$output" >&2
    fail 'updater sync failure did not preserve managed targets'
  }
  grep -q 'restored previous local plugin source and local-atlas cache' "$output" || {
    sed -n '1,200p' "$output" >&2
    fail 'updater sync failure did not roll back development plugin copies'
  }
  pass 'updater sync failure rolls back local copies and preserves all managed runtime targets'
}

run_managed_target_symlink_case() {
  local case_root="$TMP_ROOT/managed-target-symlink"
  local home="$case_root/home"
  local codex_home_root="$case_root/codex-root"
  local workflow_root="$case_root/workflow"
  local agents_home="$case_root/agents-home"
  local local_bin="$case_root/bin"
  local snapshot="$codex_home_root/.tmp/marketplaces/atlas-forge/symlink-targets"
  local output="$TMP_ROOT/managed-target-symlink.out"
  local snapshot_before

  mkdir -p "$workflow_root" "$codex_home_root/agents" "$agents_home" "$local_bin" "$snapshot/bin"
  printf '%s\n' 'SNAPSHOT-BIN' > "$snapshot/bin/sentinel"
  printf '%s\n' 'SNAPSHOT-README' > "$snapshot/readme"
  printf '%s\n' 'SNAPSHOT-SOURCE' > "$snapshot/source-root"
  printf '%s\n' 'SNAPSHOT-AGENT' > "$snapshot/agent"
  printf '%s\n' 'SNAPSHOT-SHIM' > "$snapshot/shim"
  ln -s "$snapshot/bin" "$workflow_root/bin"
  ln -s "$snapshot/readme" "$workflow_root/README.md"
  ln -s "$snapshot/source-root" "$workflow_root/source-root"
  ln -s "$snapshot/agent" "$codex_home_root/agents/atlas-sdd-explorer.toml"
  ln -s "$snapshot/shim" "$local_bin/codex-workflow"
  printf '%s\n' 'UNRELATED-AGENT' > "$codex_home_root/agents/unrelated.toml"
  printf '%s\n' 'MULTICA-SHIM' > "$local_bin/multica-prd-submit"
  printf '%s\n' 'LEGACY-AGENTS' > "$agents_home/sentinel"
  snapshot_before="$(fingerprint "$snapshot")"

  HOME="$home" \
  CODEX_HOME="$case_root/codex-home" \
  CODEX_HOME_ROOT="$codex_home_root" \
  CODEX_WORKFLOW_ROOT="$workflow_root" \
  AGENTS_HOME="$agents_home" \
  LOCAL_BIN_ROOT="$local_bin" \
    "$SYNC_SCRIPT" > "$output"

  assert_fingerprint 'symlink target release snapshot' "$snapshot" "$snapshot_before"
  [[ ! -L "$workflow_root/bin" && -d "$workflow_root/bin" ]]
  [[ ! -L "$workflow_root/README.md" && -f "$workflow_root/README.md" ]]
  [[ ! -L "$workflow_root/source-root" && -f "$workflow_root/source-root" ]]
  [[ ! -L "$codex_home_root/agents/atlas-sdd-explorer.toml" ]]
  [[ ! -L "$local_bin/codex-workflow" ]]
  grep -q 'UNRELATED-AGENT' "$codex_home_root/agents/unrelated.toml"
  grep -q 'MULTICA-SHIM' "$local_bin/multica-prd-submit"
  grep -q 'LEGACY-AGENTS' "$agents_home/sentinel"
  pass 'managed target symlinks are replaced atomically without following them into release runtime'
}

run_sync_copy_failure_case() {
  local case_root="$TMP_ROOT/sync-copy-failure"
  local home="$case_root/home"
  local codex_home_root="$case_root/codex-root"
  local workflow_root="$case_root/workflow"
  local agents_home="$case_root/agents-home"
  local local_bin="$case_root/bin"
  local fake_bin="$case_root/fake-bin"
  local output="$TMP_ROOT/sync-copy-failure.out"
  local workflow_before agents_before bin_before

  mkdir -p "$workflow_root/bin" "$workflow_root/hooks" "$workflow_root/templates" \
    "$workflow_root/tests" "$workflow_root/tasks" "$codex_home_root/agents" \
    "$agents_home" "$local_bin" "$fake_bin"
  printf '%s\n' 'OLD-BIN' > "$workflow_root/bin/KEEP"
  printf '%s\n' 'OLD-HOOKS' > "$workflow_root/hooks/KEEP"
  printf '%s\n' 'OLD-TEMPLATES' > "$workflow_root/templates/KEEP"
  printf '%s\n' 'OLD-TESTS' > "$workflow_root/tests/KEEP"
  printf '%s\n' 'OLD-STATE' > "$workflow_root/tasks/KEEP"
  printf '%s\n' 'OLD-README' > "$workflow_root/README.md"
  printf '%s\n' 'OLD-SOURCE-ROOT' > "$workflow_root/source-root"
  printf '%s\n' 'OLD-AGENT' > "$codex_home_root/agents/atlas-sdd-explorer.toml"
  printf '%s\n' 'UNRELATED-AGENT' > "$codex_home_root/agents/unrelated.toml"
  printf '%s\n' 'OLD-ATLAS-SHIM' > "$local_bin/codex-workflow"
  printf '%s\n' 'MULTICA-SHIM' > "$local_bin/multica-prd-submit"
  printf '%s\n' 'LEGACY-AGENTS' > "$agents_home/sentinel"
  workflow_before="$(fingerprint "$workflow_root")"
  agents_before="$(fingerprint "$codex_home_root/agents")"
  bin_before="$(fingerprint "$local_bin")"

  printf '%s\n' \
    '#!/usr/bin/env bash' \
    'exit 42' \
    > "$fake_bin/rsync"
  chmod +x "$fake_bin/rsync"

  if PATH="$fake_bin:$PATH" \
    HOME="$home" \
    CODEX_HOME="$case_root/codex-home" \
    CODEX_HOME_ROOT="$codex_home_root" \
    CODEX_WORKFLOW_ROOT="$workflow_root" \
    AGENTS_HOME="$agents_home" \
    LOCAL_BIN_ROOT="$local_bin" \
      "$SYNC_SCRIPT" > "$output" 2>&1; then
    fail 'injected workflow copy failure unexpectedly passed'
  fi

  assert_fingerprint 'workflow targets after staged copy failure' "$workflow_root" "$workflow_before"
  assert_fingerprint 'Codex agent targets after staged copy failure' "$codex_home_root/agents" "$agents_before"
  assert_fingerprint 'command shims after staged copy failure' "$local_bin" "$bin_before"
  grep -q 'managed targets were preserved' "$output"
  pass 'Atlas-only sync copy failure preserves every managed target and unrelated sentinel'
}

run_fifo_failure_case() {
  local fixture_root="$TMP_ROOT/fifo-repo"
  local case_root="$TMP_ROOT/fifo-runtime"
  local codex_home_root="$case_root/codex-root"
  local local_source="$codex_home_root/plugins/atlas-workflow"
  local local_cache="$codex_home_root/plugins/cache/local-atlas/atlas-workflow/local"
  local output="$TMP_ROOT/fifo.out"
  local source_before cache_before

  mkdir -p "$fixture_root/scripts" "$fixture_root/.codex" "$fixture_root/plugins" \
    "$fixture_root/workflow/hooks" "$fixture_root/workflow/templates" "$fixture_root/workflow/tests"
  cp -p "$UPDATE_SCRIPT" "$fixture_root/scripts/update-atlas-workflow-plugin"
  cp -p "$SYNC_SCRIPT" "$fixture_root/scripts/sync-live-atlas-workflow.sh"
  cp -a "$ATLAS_FORGE_ROOT/workflow/bin" "$fixture_root/workflow/bin"
  cp -p "$ATLAS_FORGE_ROOT/workflow/README.md" "$fixture_root/workflow/README.md"
  cp -a "$ATLAS_FORGE_ROOT/plugins/atlas-workflow" "$fixture_root/plugins/atlas-workflow"
  cp -a "$ATLAS_FORGE_ROOT/.codex/agents" "$fixture_root/.codex/agents"
  mkfifo "$fixture_root/plugins/atlas-workflow/unsupported-fifo"

  write_marketplace "$codex_home_root" local-atlas local './plugins/atlas-workflow'
  mkdir -p "$local_source" "$local_cache"
  printf '%s\n' 'OLD-LOCAL-SOURCE' > "$local_source/sentinel"
  printf '%s\n' 'OLD-LOCAL-CACHE' > "$local_cache/sentinel"
  source_before="$(fingerprint "$local_source")"
  cache_before="$(fingerprint "$local_cache")"

  if HOME="$case_root/home" \
    CODEX_HOME="$case_root/codex-home" \
    CODEX_HOME_ROOT="$codex_home_root" \
    CODEX_WORKFLOW_ROOT="$case_root/workflow" \
    AGENTS_HOME="$case_root/agents-home" \
    LOCAL_BIN_ROOT="$case_root/bin" \
      "$fixture_root/scripts/update-atlas-workflow-plugin" --skip-validate > "$output" 2>&1; then
    fail 'FIFO plugin source unexpectedly passed'
  fi

  assert_fingerprint 'old local source after FIFO rejection' "$local_source" "$source_before"
  assert_fingerprint 'old local cache after FIFO rejection' "$local_cache" "$cache_before"
  assert_no_transaction_debris "$codex_home_root"
  [[ ! -e "$case_root/workflow" && ! -e "$case_root/agents-home" && ! -e "$case_root/bin" ]]
  grep -q 'unsupported entry' "$output"
  pass 'FIFO source is rejected before either existing development copy changes'
}

run_isolated_source_fixture() {
  local source_root="$ATLAS_FORGE_ROOT"
  local fixture_root="$TMP_ROOT/source-fixture"
  local multica_root="$fixture_root/plugins/multica-sdlc"
  local browser_cache="$fixture_root/.tmp/atlas-3d-harness/playwright-browsers"
  local tool_root="$fixture_root/plugins/atlas-workflow/tools/atlas-3d-harness"
  local multica_before browser_before

  mkdir -p "$fixture_root"
  rsync -a \
    --exclude='/.git/' \
    --exclude='/.tmp/' \
    --exclude='/.agents/' \
    --exclude='/plugins/cache/' \
    --exclude='/cache/' \
    --exclude='/plugins/multica-sdlc/' \
    --exclude='/workflow/artifacts/' \
    --exclude='node_modules/' \
    "$source_root/" "$fixture_root/"

  mkdir -p "$tool_root/node_modules" "$tool_root/.local" "$tool_root/runs" \
    "$tool_root/artifacts" "$browser_cache" "$multica_root"
  printf '%s\n' 'NODE-MODULES-MUST-NOT-SYNC' > "$tool_root/node_modules/.atlas-3d-node-modules-must-not-sync"
  printf '%s\n' 'LOCAL-RUNTIME-MUST-NOT-SYNC' > "$tool_root/.local/runtime.json"
  printf '%s\n' 'RUN-ROOT-MUST-NOT-SYNC' > "$tool_root/runs/run.json"
  printf '%s\n' 'ARTIFACT-MUST-NOT-SYNC' > "$tool_root/artifacts/evidence.json"
  printf '%s\n' 'LOCAL-CONFIG-MUST-NOT-SYNC' > "$tool_root/runtime-config.local.json"
  printf '%s\n' 'LOCAL-LOG-MUST-NOT-SYNC' > "$tool_root/runtime-generated.log"
  printf '%s\n' 'BROWSER-CACHE-MUST-NOT-SYNC' > "$browser_cache/.atlas-3d-browser-cache-must-not-sync"
  printf '%s\n' 'MULTICA-SOURCE-MUST-NOT-CHANGE' > "$multica_root/sentinel"

  multica_before="$(fingerprint "$multica_root")"
  browser_before="$(fingerprint "$fixture_root/.tmp/atlas-3d-harness")"
  ATLAS_DEV_SYNC_FIXTURE=1 ATLAS_FORGE_ROOT="$fixture_root" \
    "$fixture_root/workflow/tests/integration_atlas_plugin_dev_sync.sh"
  assert_fingerprint 'isolated Multica source sentinel' "$multica_root" "$multica_before"
  assert_fingerprint 'isolated repo browser cache' "$fixture_root/.tmp/atlas-3d-harness" "$browser_before"
  pass 'isolated source fixture preserves Multica and repo-level browser runtime state'
}

if [[ "${ATLAS_DEV_SYNC_FIXTURE:-0}" != 1 ]]; then
  run_isolated_source_fixture
  exit 0
fi

bash -n "$UPDATE_SCRIPT" "$SYNC_SCRIPT"
run_success_case
run_preflight_cases
run_dry_run_case
run_root_injection_cases
run_copy_failure_case
run_updater_sync_failure_case
run_sync_copy_failure_case
run_managed_target_symlink_case
run_fifo_failure_case
pass 'Atlas plugin development sync integration'
