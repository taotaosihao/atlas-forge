#!/usr/bin/env bash
set -euo pipefail

ATLAS_FORGE_ROOT="${ATLAS_FORGE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
BIN="$ATLAS_FORGE_ROOT/workflow/bin/codex-workflow"
PLUGIN_SOURCE="$ATLAS_FORGE_ROOT/plugins/atlas-workflow"
NODE_BIN_DIR="$(dirname "$(command -v node)")"
REAL_GIT="$(command -v git)"
BASE_PATH="$NODE_BIN_DIR:/usr/local/bin:/usr/bin:/bin"
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

set_manifest_version() {
  local root="$1" version="$2"
  node - "$root/.codex-plugin/plugin.json" "$version" <<'NODE'
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
const path = process.argv[2];
fs.writeFileSync(path, `${JSON.stringify({
  name: "atlas-forge",
  interface: { displayName: "Atlas doctor fixture" },
  plugins: [{
    name: "atlas-workflow",
    source: { source: "local", path: "./plugins/atlas-workflow" },
    policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
    category: "Productivity",
  }],
}, null, 2)}\n`);
NODE
}

write_config() {
  {
    printf '%s\n' '[features]' 'hooks = true' ''
    printf '%s\n' '[marketplaces.atlas-forge]' 'source_type = "git"'
    printf 'source = "%s"\n' "$EXPECTED_SOURCE"
    printf 'ref = "%s"\n' "$EXPECTED_SHA"
    printf 'last_revision = "%s"\n\n' "$EXPECTED_SHA"
    printf '%s\n' '[plugins."atlas-workflow@atlas-forge"]' 'enabled = true'
  } > "$CODEX_ROOT/config.toml"
}

write_sidecar() {
  node - "$SNAPSHOT/.codex-marketplace-install.json" "$EXPECTED_SOURCE" "$EXPECTED_SHA" <<'NODE'
const fs = require("fs");
const [file, source, revision] = process.argv.slice(2);
fs.writeFileSync(file, `${JSON.stringify({
  source_type: "git",
  source,
  ref_name: revision,
  revision,
  sparse_paths: [],
}, null, 2)}\n`);
NODE
}

run_isolated() {
  env -i \
    PATH="$FAKE_BIN:$BASE_PATH" \
    HOME="$HOME_ROOT" \
    CODEX_HOME="$CODEX_ROOT" \
    CODEX_HOME_ROOT="$CODEX_ROOT" \
    CODEX_WORKFLOW_ROOT="$WORKFLOW_ROOT" \
    AGENTS_HOME="$AGENTS_ROOT" \
    LOCAL_BIN_ROOT="$LOCAL_BIN_ROOT_VALUE" \
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
    CODEX_BIN=fake-codex \
    PASEO_BIN=fake-paseo \
    CODEX_SENTINEL="$CASE_ROOT/codex-invoked" \
    PASEO_SENTINEL="$CASE_ROOT/paseo-invoked" \
    "$@"
}

run_fixture_git() {
  run_isolated git -c commit.gpgSign=false -c tag.gpgSign=false -c core.hooksPath=/dev/null "$@"
}

install_repo_git_tripwire() {
  {
    printf '%s\n' '#!/usr/bin/env bash' 'if [[ "${1:-}" == "-C" ]]; then'
    printf '  printf invoked > %q\n' "$CASE_ROOT/repo-git-invoked"
    printf '%s\n' '  exit 97' 'fi'
    printf 'exec %q "$@"\n' "$REAL_GIT"
  } > "$FAKE_BIN/git"
  chmod 755 "$FAKE_BIN/git"
}

setup_case() {
  local name="$1"
  CASE_ROOT="$TMP_ROOT/$name"
  HOME_ROOT="$CASE_ROOT/home"
  CODEX_ROOT="$CASE_ROOT/codex"
  WORKFLOW_ROOT="$CASE_ROOT/workflow"
  AGENTS_ROOT="$CASE_ROOT/agents"
  LOCAL_BIN_ROOT_VALUE="$CASE_ROOT/bin"
  XDG_CONFIG_ROOT="$CASE_ROOT/xdg/config"
  XDG_CACHE_ROOT="$CASE_ROOT/xdg/cache"
  XDG_DATA_ROOT="$CASE_ROOT/xdg/data"
  XDG_STATE_ROOT="$CASE_ROOT/xdg/state"
  XDG_RUNTIME_ROOT="$CASE_ROOT/xdg/runtime"
  CASE_TMP="$CASE_ROOT/tmp"
  GIT_CONFIG_FILE="$CASE_ROOT/gitconfig"
  GIT_TEMPLATE_ROOT="$CASE_ROOT/git-template"
  FAKE_BIN="$CASE_ROOT/fake-bin"
  SOURCE="$CODEX_ROOT/plugins/atlas-workflow"
  LOCAL_CACHE="$CODEX_ROOT/plugins/cache/local-atlas/atlas-workflow/local"
  SNAPSHOT="$CODEX_ROOT/.tmp/marketplaces/atlas-forge"
  RELEASE_ROOT="$CODEX_ROOT/plugins/cache/atlas-forge/atlas-workflow"
  EXPECTED_VERSION='1.0.0+codex.2'
  EXPECTED_SOURCE='ssh://fixture.invalid/atlas-only.git'
  OUTPUT="$TMP_ROOT/outputs/$name.json"
  STDERR="$TMP_ROOT/outputs/$name.err"

  mkdir -p "$HOME_ROOT/.agents" "$CODEX_ROOT/plugins" "$WORKFLOW_ROOT/hooks" \
    "$AGENTS_ROOT" "$LOCAL_BIN_ROOT_VALUE" "$XDG_CONFIG_ROOT" "$XDG_CACHE_ROOT" \
    "$XDG_DATA_ROOT" "$XDG_STATE_ROOT" "$XDG_RUNTIME_ROOT" "$CASE_TMP" \
    "$GIT_TEMPLATE_ROOT" "$FAKE_BIN"
  touch "$GIT_CONFIG_FILE"
  chmod 700 "$XDG_RUNTIME_ROOT"
  printf '%s\n' home-agents > "$HOME_ROOT/.agents/multica-sentinel"
  printf '%s\n' agents-home > "$AGENTS_ROOT/multica-sentinel"
  printf '%s\n' shim > "$LOCAL_BIN_ROOT_VALUE/multica-prd-submit"
  printf '%s\n' '#!/usr/bin/env bash' 'printf invoked > "$CODEX_SENTINEL"' 'exit 99' > "$FAKE_BIN/fake-codex"
  printf '%s\n' '#!/usr/bin/env bash' 'printf invoked > "$PASEO_SENTINEL"' 'exit 99' > "$FAKE_BIN/fake-paseo"
  chmod 755 "$FAKE_BIN/fake-codex" "$FAKE_BIN/fake-paseo"

  cp -a "$PLUGIN_SOURCE" "$SOURCE"
  set_manifest_version "$SOURCE" "$EXPECTED_VERSION"
  printf '%s\n' target > "$SOURCE/fixture-release.txt"
  mkdir -p "$(dirname "$LOCAL_CACHE")"
  cp -a "$SOURCE" "$LOCAL_CACHE"

  mkdir -p "$SNAPSHOT/plugins"
  cp -a "$SOURCE" "$SNAPSHOT/plugins/atlas-workflow"
  write_marketplace "$SNAPSHOT/.agents/plugins/marketplace.json"
  run_fixture_git -C "$SNAPSHOT" init -q -b main
  set_manifest_version "$SNAPSHOT/plugins/atlas-workflow" '1.0.0+codex.1'
  printf '%s\n' base > "$SNAPSHOT/plugins/atlas-workflow/fixture-release.txt"
  run_fixture_git -C "$SNAPSHOT" add .
  run_fixture_git -C "$SNAPSHOT" commit -q -m base
  BASE_SHA="$(run_fixture_git -C "$SNAPSHOT" rev-parse HEAD)"
  set_manifest_version "$SNAPSHOT/plugins/atlas-workflow" "$EXPECTED_VERSION"
  printf '%s\n' target > "$SNAPSHOT/plugins/atlas-workflow/fixture-release.txt"
  run_fixture_git -C "$SNAPSHOT" add plugins/atlas-workflow
  run_fixture_git -C "$SNAPSHOT" commit -q -m target
  EXPECTED_SHA="$(run_fixture_git -C "$SNAPSHOT" rev-parse HEAD)"
  run_fixture_git -C "$SNAPSHOT" remote add origin "$EXPECTED_SOURCE"
  write_sidecar

  mkdir -p "$RELEASE_ROOT"
  cp -a "$SOURCE" "$RELEASE_ROOT/$EXPECTED_VERSION"
  write_config

  printf '%s\n' '#!/usr/bin/env bash' 'exit 0' > "$WORKFLOW_ROOT/hooks/pre-tool-use"
  printf '%s\n' '#!/usr/bin/env bash' 'exit 0' > "$WORKFLOW_ROOT/hooks/post-tool-use"
  chmod 755 "$WORKFLOW_ROOT/hooks/pre-tool-use" "$WORKFLOW_ROOT/hooks/post-tool-use"
  node - "$CODEX_ROOT/hooks.json" "$WORKFLOW_ROOT" <<'NODE'
const fs = require("fs");
const [file, workflow] = process.argv.slice(2);
fs.writeFileSync(file, `${JSON.stringify({ hooks: {
  PreToolUse: [{ hooks: [{ command: `${workflow}/hooks/pre-tool-use` }] }],
  PostToolUse: [{ hooks: [{ command: `${workflow}/hooks/post-tool-use` }] }],
}}, null, 2)}\n`);
NODE
}

assert_report() {
  local path="$1" expected_ok="$2" expected_section="${3:-}"
  python3 - "$path" "$expected_ok" "$expected_section" <<'PY'
import json
import sys

path, expected_ok, expected_section = sys.argv[1:]
report = json.loads(open(path, encoding="utf-8").read())
required_legacy = {"install", "source_cache", "hooks_config", "hooks_runtime", "smoke"}
required_strict = {
    "manifest_compatibility",
    "source_local_cache",
    "marketplace_snapshot",
    "exact_release_cache",
    "version_collision",
    "release_downgrade",
}

if report.get("schema_version") != 1 or report.get("tool") != "codex-workflow-doctor":
    raise SystemExit(f"invalid strict envelope: {report}")
if report.get("mode") != "strict" or report.get("strict") is not True:
    raise SystemExit(f"invalid strict mode: {report}")
if report.get("strict_ok") is not (expected_ok == "true"):
    raise SystemExit(f"unexpected strict_ok: {report}")
if not required_legacy <= report.keys() or not required_strict <= report.keys():
    raise SystemExit(f"missing doctor sections: {report.keys()}")
for section in required_strict:
    value = report[section]
    if not isinstance(value, dict) or not isinstance(value.get("status"), str) or not isinstance(value.get("errors"), list):
        raise SystemExit(f"invalid section {section}: {value}")
    if value.get("critical") is not True:
        raise SystemExit(f"section is not marked critical: {section}")
if expected_section and expected_section not in report.get("strict_failures", []):
    raise SystemExit(f"missing strict failure {expected_section}: {report.get('strict_failures')}")
PY
}

assert_section_error() {
  local path="$1" section="$2" code="$3"
  python3 - "$path" "$section" "$code" <<'PY'
import json
import sys

path, section, code = sys.argv[1:]
report = json.load(open(path, encoding="utf-8"))
codes = {error.get("code") for error in report[section].get("errors", [])}
if code not in codes:
    raise SystemExit(f"missing {code} in {section}: {sorted(codes)}")
PY
}

assert_read_only() {
  local before="$1" label="$2"
  [[ "$(fingerprint "$CASE_ROOT")" == "$before" ]] || fail "$label changed its isolated roots"
  [[ ! -e "$CASE_ROOT/codex-invoked" ]] || fail "$label invoked Codex CLI"
  [[ ! -e "$CASE_ROOT/paseo-invoked" ]] || fail "$label invoked Paseo"
}

run_strict_success() {
  local label="$1"
  shift
  local before rc
  before="$(fingerprint "$CASE_ROOT")"
  set +e
  run_isolated timeout 15 "$BIN" doctor "$@" > "$OUTPUT" 2> "$STDERR"
  rc=$?
  set -e
  [[ "$rc" -eq 0 ]] || fail "$label returned $rc instead of 0"
  [[ ! -s "$STDERR" ]] || fail "$label wrote stderr"
  assert_report "$OUTPUT" true
  assert_read_only "$before" "$label"
  pass "$label"
}

run_strict_failure() {
  local label="$1" section="$2" expected_rc="${3:-1}"
  local before rc
  before="$(fingerprint "$CASE_ROOT")"
  set +e
  run_isolated timeout 15 "$BIN" doctor --strict --json > "$OUTPUT" 2> "$STDERR"
  rc=$?
  set -e
  [[ "$rc" -eq "$expected_rc" ]] || fail "$label returned $rc instead of $expected_rc"
  [[ ! -s "$STDERR" ]] || fail "$label wrote stderr"
  assert_report "$OUTPUT" false "$section"
  assert_read_only "$before" "$label"
  pass "$label"
}

bash -n "$BIN"
node --check "$ATLAS_FORGE_ROOT/workflow/bin/atlas-plugin-integrity"

setup_case healthy
run_strict_success 'healthy strict JSON reports all plugin sections' --strict --json
python3 - "$OUTPUT" <<'PY'
import json
import sys
report = json.load(open(sys.argv[1], encoding="utf-8"))
assert all(report[name]["status"] == "ok" for name in (
    "manifest_compatibility", "source_local_cache", "marketplace_snapshot",
    "exact_release_cache", "version_collision", "release_downgrade",
))
assert report["hooks_runtime"]["status"] == "configured_unproven"
assert report["smoke"]["status"] == "no_proof"
PY
before="$(fingerprint "$CASE_ROOT")"
run_isolated "$BIN" doctor --json --strict > "$OUTPUT" 2> "$STDERR"
assert_report "$OUTPUT" true
assert_read_only "$before" 'strict flag order'
pass 'strict flag order is stable and noncritical hook/smoke states do not fail'
before="$(fingerprint "$CASE_ROOT")"
run_isolated "$BIN" doctor --strict > "$TMP_ROOT/outputs/healthy.txt" 2> "$STDERR"
grep -q $'^strict_ok\ttrue$' "$TMP_ROOT/outputs/healthy.txt"
[[ ! -s "$STDERR" ]] || fail 'healthy strict text wrote stderr'
assert_read_only "$before" 'strict text format'
pass 'strict text format reports the same healthy gate'

setup_case active-task-readonly
mkdir -p "$WORKFLOW_ROOT/state" "$WORKFLOW_ROOT/tasks" "$WORKFLOW_ROOT/artifacts/active-doctor"
printf '%s\n' '{"task_id":"active-doctor"}' > "$WORKFLOW_ROOT/state/current-task.json"
printf '%s\n' 'id: active-doctor' 'status: active' > "$WORKFLOW_ROOT/tasks/active-doctor.md"
printf '%s\n' '{"kind":"sentinel"}' > "$WORKFLOW_ROOT/artifacts/active-doctor/runtime.jsonl"
run_strict_success 'strict doctor does not sync or append an active task' --strict --json

setup_case hooks-fifo
rm "$CODEX_ROOT/hooks.json"
mkfifo "$CODEX_ROOT/hooks.json"
run_strict_success 'noncritical hooks FIFO returns complete strict JSON without blocking' --strict --json
python3 - "$OUTPUT" <<'PY'
import json
import sys
report = json.load(open(sys.argv[1], encoding="utf-8"))
assert report["hooks_config"]["status"] == "error"
assert report["hooks_runtime"]["status"] == "not_configured"
assert report["strict_ok"] is True
PY

setup_case source-skill-fifo
rm "$SOURCE/skills/task/SKILL.md"
mkfifo "$SOURCE/skills/task/SKILL.md"
run_strict_failure 'source skill FIFO returns complete strict JSON without blocking' manifest_compatibility
python3 - "$OUTPUT" <<'PY'
import json
import sys
report = json.load(open(sys.argv[1], encoding="utf-8"))
assert report["source_cache"]["derived_from"] == "source_local_cache"
assert report["source_cache"]["status"] == "mismatch"
PY

setup_case external-skill-symlink
mkdir -p "$AGENTS_ROOT/private-skill"
mkfifo "$AGENTS_ROOT/private-skill/SKILL.md"
for root in "$SOURCE" "$LOCAL_CACHE" "$SNAPSHOT/plugins/atlas-workflow" "$RELEASE_ROOT/$EXPECTED_VERSION"; do
  ln -s "$AGENTS_ROOT/private-skill" "$root/skills/external-skill"
done
run_fixture_git -C "$SNAPSHOT" add plugins/atlas-workflow/skills/external-skill
run_fixture_git -C "$SNAPSHOT" commit -q -m external-skill-symlink
EXPECTED_SHA="$(run_fixture_git -C "$SNAPSHOT" rev-parse HEAD)"
write_config
write_sidecar
run_strict_success 'noncritical source summary never follows an external skill symlink' --strict --json

setup_case skill-drift
printf '%s\n' drift >> "$LOCAL_CACHE/skills/task/SKILL.md"
run_strict_failure 'one local skill drift fails complete strict JSON' source_local_cache

setup_case manifest-drift
node - "$SOURCE/.codex-plugin/plugin.json" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
manifest.interface.defaultPrompt.push("fourth prompt");
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
run_strict_failure 'source manifest drift fails compatibility without truncating the report' manifest_compatibility

setup_case stale-snapshot
run_fixture_git -C "$SNAPSHOT" checkout -q "$BASE_SHA"
run_strict_failure 'stale snapshot commit fails marketplace identity' marketplace_snapshot

setup_case version-collision
printf '%s\n' collision >> "$RELEASE_ROOT/$EXPECTED_VERSION/fixture-release.txt"
run_strict_failure 'same-version different-tree cache reports collision' version_collision

setup_case missing-exact
rm -rf "$RELEASE_ROOT/$EXPECTED_VERSION"
cp -a "$SOURCE" "$RELEASE_ROOT/latest"
run_strict_failure 'missing exact cache never falls back to latest' exact_release_cache

setup_case higher-installed
higher_version='1.0.0+codex.3'
cp -a "$SOURCE" "$RELEASE_ROOT/$higher_version"
set_manifest_version "$RELEASE_ROOT/$higher_version" "$higher_version"
run_strict_failure 'higher installed version blocks release downgrade' release_downgrade

setup_case malformed-config
printf '%s\n' '[marketplaces.atlas-forge' > "$CODEX_ROOT/config.toml"
run_strict_failure 'malformed config still emits one complete JSON document' marketplace_snapshot 2

setup_case moving-ref
python3 - "$CODEX_ROOT/config.toml" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
path.write_text(path.read_text(encoding="utf-8").replace(
    next(line for line in path.read_text(encoding="utf-8").splitlines() if line.startswith("ref = ")),
    'ref = "main"',
), encoding="utf-8")
PY
run_strict_failure 'moving marketplace ref fails without hiding other sections' marketplace_snapshot

setup_case sidecar-mismatch
node - "$SNAPSHOT/.codex-marketplace-install.json" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const sidecar = JSON.parse(fs.readFileSync(file, "utf8"));
sidecar.revision = "0".repeat(40);
fs.writeFileSync(file, `${JSON.stringify(sidecar, null, 2)}\n`);
NODE
run_strict_failure 'sidecar revision drift fails marketplace identity' marketplace_snapshot

setup_case sidecar-symlink
mv "$SNAPSHOT/.codex-marketplace-install.json" "$CASE_ROOT/outside-sidecar.json"
ln -s "$CASE_ROOT/outside-sidecar.json" "$SNAPSHOT/.codex-marketplace-install.json"
run_strict_failure 'sidecar symlink cannot escape the canonical snapshot' marketplace_snapshot

setup_case manifest-symlink
mv "$SOURCE/.codex-plugin/plugin.json" "$CASE_ROOT/outside-plugin.json"
ln -s "$CASE_ROOT/outside-plugin.json" "$SOURCE/.codex-plugin/plugin.json"
run_strict_failure 'plugin manifest symlink cannot escape its canonical root' manifest_compatibility

setup_case git-metadata-symlink
mv "$SNAPSHOT/.git/index" "$AGENTS_ROOT/private-git-index"
ln -s "$AGENTS_ROOT/private-git-index" "$SNAPSHOT/.git/index"
install_repo_git_tripwire
run_strict_failure 'snapshot Git metadata symlink is rejected before repository Git' marketplace_snapshot
assert_section_error "$OUTPUT" marketplace_snapshot SNAPSHOT_GIT_METADATA_SYMLINK_FORBIDDEN
[[ ! -e "$CASE_ROOT/repo-git-invoked" ]] || fail 'metadata symlink reached repository Git'

setup_case origin-provenance
EXPECTED_SOURCE='ssh://attacker.invalid/other.git'
write_config
write_sidecar
run_strict_failure 'matching config and sidecar cannot override snapshot origin provenance' marketplace_snapshot

setup_case big-semver
big_expected='9007199254740992.0.0+codex.1'
big_higher='9007199254740993.0.0+codex.1'
mv "$RELEASE_ROOT/$EXPECTED_VERSION" "$RELEASE_ROOT/$big_expected"
for root in "$SOURCE" "$LOCAL_CACHE" "$SNAPSHOT/plugins/atlas-workflow" "$RELEASE_ROOT/$big_expected"; do
  set_manifest_version "$root" "$big_expected"
done
run_fixture_git -C "$SNAPSHOT" add plugins/atlas-workflow/.codex-plugin/plugin.json
run_fixture_git -C "$SNAPSHOT" commit -q -m big-semver
EXPECTED_SHA="$(run_fixture_git -C "$SNAPSHOT" rev-parse HEAD)"
EXPECTED_VERSION="$big_expected"
write_config
write_sidecar
cp -a "$SOURCE" "$RELEASE_ROOT/$big_higher"
set_manifest_version "$RELEASE_ROOT/$big_higher" "$big_higher"
run_strict_failure 'SemVer core integers above Number precision still block downgrade' release_downgrade

setup_case fsmonitor-isolation
printf '%s\n' '#!/usr/bin/env bash' "printf invoked > '$CASE_ROOT/fsmonitor-invoked'" 'printf "0\\n"' \
  > "$FAKE_BIN/fsmonitor-hook"
chmod 755 "$FAKE_BIN/fsmonitor-hook"
run_fixture_git -C "$SNAPSHOT" config core.fsmonitor "$FAKE_BIN/fsmonitor-hook"
install_repo_git_tripwire
run_strict_failure 'strict doctor rejects repository-local fsmonitor before repository Git' marketplace_snapshot
assert_section_error "$OUTPUT" marketplace_snapshot SNAPSHOT_GIT_CONFIG_UNSAFE
[[ ! -e "$CASE_ROOT/fsmonitor-invoked" ]] || fail 'strict doctor invoked a repository-local fsmonitor'
[[ ! -e "$CASE_ROOT/repo-git-invoked" ]] || fail 'unsafe fsmonitor config reached repository Git'

setup_case git-include-isolation
private_secret='ATLAS_PRIVATE_GIT_INCLUDE_9d4a'
printf '%s\n' "[private]" "secret = $private_secret" > "$AGENTS_ROOT/private-git-config"
printf '%s\n' '' '[include]' "path = $AGENTS_ROOT/private-git-config" >> "$SNAPSHOT/.git/config"
install_repo_git_tripwire
run_strict_failure 'snapshot Git include is rejected without following protected config' marketplace_snapshot
assert_section_error "$OUTPUT" marketplace_snapshot SNAPSHOT_GIT_CONFIG_UNSAFE
[[ ! -e "$CASE_ROOT/repo-git-invoked" ]] || fail 'unsafe Git include reached repository Git'
if rg -F "$private_secret" "$OUTPUT" "$STDERR" >/dev/null; then
  fail 'strict report leaked protected Git include content'
fi

setup_case git-external-path-isolation
external_secret='ATLAS_PRIVATE_GIT_PATH_4b91'
printf '%s\n' "$external_secret" > "$AGENTS_ROOT/private-excludes"
printf '%s\n' "$external_secret" > "$AGENTS_ROOT/private-attributes"
run_fixture_git -C "$SNAPSHOT" config core.excludesFile "$AGENTS_ROOT/private-excludes"
run_fixture_git -C "$SNAPSHOT" config core.attributesFile "$AGENTS_ROOT/private-attributes"
install_repo_git_tripwire
run_strict_failure 'external Git exclude and attribute paths are rejected before repository Git' marketplace_snapshot
assert_section_error "$OUTPUT" marketplace_snapshot SNAPSHOT_GIT_CONFIG_UNSAFE
[[ ! -e "$CASE_ROOT/repo-git-invoked" ]] || fail 'external Git path config reached repository Git'
if rg -F "$external_secret" "$OUTPUT" "$STDERR" >/dev/null; then
  fail 'strict report leaked protected Git path content'
fi

setup_case git-filter-isolation
printf '%s\n' 'fixture-release.txt filter=fixture' > "$SOURCE/.gitattributes"
cp "$SOURCE/.gitattributes" "$LOCAL_CACHE/.gitattributes"
cp "$SOURCE/.gitattributes" "$SNAPSHOT/plugins/atlas-workflow/.gitattributes"
cp "$SOURCE/.gitattributes" "$RELEASE_ROOT/$EXPECTED_VERSION/.gitattributes"
printf '%s\n' '#!/usr/bin/env bash' "printf invoked > '$CASE_ROOT/filter-invoked'" 'cat' \
  > "$AGENTS_ROOT/private-filter"
chmod 755 "$AGENTS_ROOT/private-filter"
run_fixture_git -C "$SNAPSHOT" add plugins/atlas-workflow/.gitattributes
run_fixture_git -C "$SNAPSHOT" commit -q -m filter-fixture
EXPECTED_SHA="$(run_fixture_git -C "$SNAPSHOT" rev-parse HEAD)"
write_config
write_sidecar
run_fixture_git -C "$SNAPSHOT" config filter.fixture.clean "$AGENTS_ROOT/private-filter"
install_repo_git_tripwire
run_strict_failure 'repository clean filters are rejected before repository Git' marketplace_snapshot
assert_section_error "$OUTPUT" marketplace_snapshot SNAPSHOT_GIT_CONFIG_UNSAFE
[[ ! -e "$CASE_ROOT/filter-invoked" ]] || fail 'strict doctor invoked a repository clean filter'
[[ ! -e "$CASE_ROOT/repo-git-invoked" ]] || fail 'unsafe clean filter config reached repository Git'

setup_case ignored-untracked-head-binding
for root in "$SOURCE" "$LOCAL_CACHE" "$SNAPSHOT/plugins/atlas-workflow" "$RELEASE_ROOT/$EXPECTED_VERSION"; do
  printf '%s\n' ignored-but-present > "$root/ignored-extra.txt"
done
mkdir -p "$SNAPSHOT/.git/info"
printf '%s\n' '/plugins/atlas-workflow/ignored-extra.txt' >> "$SNAPSHOT/.git/info/exclude"
run_strict_failure 'ignored untracked Atlas files cannot escape expected HEAD binding' marketplace_snapshot
assert_section_error "$OUTPUT" marketplace_snapshot SNAPSHOT_HEAD_TREE_MISMATCH

setup_case assume-unchanged-head-binding
for root in "$SOURCE" "$LOCAL_CACHE" "$SNAPSHOT/plugins/atlas-workflow" "$RELEASE_ROOT/$EXPECTED_VERSION"; do
  printf '%s\n' synchronized-working-tree-change > "$root/fixture-release.txt"
done
run_fixture_git -C "$SNAPSHOT" update-index --assume-unchanged plugins/atlas-workflow/fixture-release.txt
run_strict_failure 'assume-unchanged cannot hide Atlas drift from expected HEAD' marketplace_snapshot
assert_section_error "$OUTPUT" marketplace_snapshot SNAPSHOT_HEAD_TREE_MISMATCH

setup_case replace-ref-head-binding
for root in "$SOURCE" "$LOCAL_CACHE" "$SNAPSHOT/plugins/atlas-workflow" "$RELEASE_ROOT/$EXPECTED_VERSION"; do
  printf '%s\n' replacement-tree > "$root/fixture-release.txt"
done
run_fixture_git -C "$SNAPSHOT" add plugins/atlas-workflow/fixture-release.txt
run_fixture_git -C "$SNAPSHOT" commit -q -m replacement-tree
replacement_sha="$(run_fixture_git -C "$SNAPSHOT" rev-parse HEAD)"
run_fixture_git -C "$SNAPSHOT" replace "$EXPECTED_SHA" "$replacement_sha"
run_fixture_git -C "$SNAPSHOT" update-ref refs/heads/main "$EXPECTED_SHA"
run_fixture_git -C "$SNAPSHOT" reset -q --mixed "$EXPECTED_SHA"
run_strict_failure 'Git replacement refs cannot substitute the configured release tree' marketplace_snapshot
assert_section_error "$OUTPUT" marketplace_snapshot SNAPSHOT_GIT_EXTERNAL_REFERENCE_FORBIDDEN

setup_case gitlink-head-binding
run_fixture_git -C "$SNAPSHOT" update-index --add --cacheinfo "160000,$BASE_SHA,plugins/atlas-workflow/nested"
run_fixture_git -C "$SNAPSHOT" commit -q -m gitlink-fixture
EXPECTED_SHA="$(run_fixture_git -C "$SNAPSHOT" rev-parse HEAD)"
write_config
write_sidecar
run_strict_failure 'Git links are forbidden inside the Atlas release tree' marketplace_snapshot
assert_section_error "$OUTPUT" marketplace_snapshot SNAPSHOT_GITLINK_FORBIDDEN

setup_case shared-sibling
mkdir -p "$SNAPSHOT/plugins/other-plugin"
printf '%s\n' stable > "$SNAPSHOT/plugins/other-plugin/content.txt"
node - "$SNAPSHOT/.agents/plugins/marketplace.json" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const marketplace = JSON.parse(fs.readFileSync(file, "utf8"));
marketplace.plugins.push({ name: "other-plugin", source: { source: "local", path: "./plugins/other-plugin" } });
fs.writeFileSync(file, `${JSON.stringify(marketplace, null, 2)}\n`);
NODE
run_fixture_git -C "$SNAPSHOT" add .agents/plugins/marketplace.json plugins/other-plugin/content.txt
run_fixture_git -C "$SNAPSHOT" commit -q -m shared-sibling
EXPECTED_SHA="$(run_fixture_git -C "$SNAPSHOT" rev-parse HEAD)"
write_config
printf '%s\n' '' '[plugins."other-plugin@atlas-forge"]' 'enabled = true' >> "$CODEX_ROOT/config.toml"
write_sidecar
printf '%s\n' dirty >> "$SNAPSHOT/plugins/other-plugin/content.txt"
run_strict_success 'plugin-scoped strict ignores another marketplace plugin tree and selector' --strict --json

setup_case inconsistent-helper-envelope
tool_copy="$CASE_ROOT/tool-copy"
mkdir -p "$tool_copy"
cp "$BIN" "$tool_copy/codex-workflow"
cp "$ATLAS_FORGE_ROOT/workflow/bin/codex-workflow-legacy" "$tool_copy/codex-workflow-legacy"
cp -a "$ATLAS_FORGE_ROOT/workflow/bin/lib" "$tool_copy/lib"
chmod 755 "$tool_copy/codex-workflow" "$tool_copy/codex-workflow-legacy"
python3 - "$tool_copy/atlas-plugin-integrity" <<'PY'
from pathlib import Path
import stat
import sys

path = Path(sys.argv[1])
sections = "manifest_compatibility source_local_cache marketplace_snapshot exact_release_cache version_collision release_downgrade"
checks = ",".join(f'\"{name}\":{{\"status\":\"ok\",\"errors\":[]}}' for name in sections.split())
path.write_text(
    "#!/usr/bin/env bash\n"
    "printf '%s\\n' '"
    + '{\"schema_version\":1,\"tool\":\"atlas-plugin-integrity\",\"mode\":\"doctor\",'
    + '\"ok\":false,\"checks\":{' + checks + '},\"errors\":[{\"code\":\"FAKE\",\"message\":\"fake\"}]}'
    + "'\nexit 1\n",
    encoding="utf-8",
)
path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
PY
real_bin="$BIN"
BIN="$tool_copy/codex-workflow"
run_strict_failure 'inconsistent helper envelope fails closed after complete JSON' manifest_compatibility 2
BIN="$real_bin"

setup_case strict-usage
before="$(fingerprint "$CASE_ROOT")"
set +e
run_isolated "$BIN" doctor --strict --json --bogus > "$OUTPUT" 2> "$STDERR"
usage_rc=$?
set -e
[[ "$usage_rc" -eq 2 ]] || fail "strict usage returned $usage_rc instead of 2"
[[ ! -s "$STDERR" ]] || fail 'strict usage wrote stderr'
assert_report "$OUTPUT" false manifest_compatibility
assert_read_only "$before" 'strict usage error'
pass 'strict usage error emits a complete JSON envelope before exit 2'

setup_case secret-redaction
secret='ATLAS_DOCTOR_TOP_SECRET_7f2c'
EXPECTED_SOURCE="https://token:$secret@fixture.invalid/atlas-only.git"
write_config
write_sidecar
run_fixture_git -C "$SNAPSHOT" remote set-url origin "$EXPECTED_SOURCE"
node - "$CODEX_ROOT/hooks.json" "$secret" <<'NODE'
const fs = require("fs");
const [file, secret] = process.argv.slice(2);
const hooks = JSON.parse(fs.readFileSync(file, "utf8"));
hooks.hooks.PreToolUse[0].hooks[0].command = `TOKEN=${secret} /tmp/pre-tool-use`;
fs.writeFileSync(file, `${JSON.stringify(hooks, null, 2)}\n`);
NODE
run_strict_success 'strict report redacts configured source and hook command secrets' --strict --json
if rg -F "$secret" "$OUTPUT" "$STDERR" >/dev/null; then
  fail 'strict report leaked a configured secret'
fi

setup_case symlink-code-home
mv "$CODEX_ROOT" "$CASE_ROOT/real-codex"
ln -s "$CASE_ROOT/real-codex" "$CODEX_ROOT"
run_strict_failure 'symlinked CODEX_HOME_ROOT returns a complete boundary error' marketplace_snapshot 2

setup_case legacy-compatible
printf '%s\n' drift >> "$LOCAL_CACHE/skills/task/SKILL.md"
set +e
run_isolated "$BIN" doctor --json > "$OUTPUT" 2> "$STDERR"
legacy_rc=$?
set -e
[[ "$legacy_rc" -eq 0 ]] || fail 'legacy doctor changed its exit code'
python3 - "$OUTPUT" <<'PY'
import json
import sys
report = json.load(open(sys.argv[1], encoding="utf-8"))
assert {"install", "source_cache", "hooks_config", "hooks_runtime", "smoke"} <= report.keys()
assert "strict" not in report
PY
pass 'legacy doctor JSON remains non-strict and backward compatible'

printf '1..%s\n' "$PASS_COUNT"
