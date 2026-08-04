#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CODEX_HOME_ROOT="${CODEX_HOME_ROOT:-${CODEX_HOME:-$HOME/.codex}}"
LIVE_WORKFLOW_ROOT="${CODEX_WORKFLOW_ROOT:-$CODEX_HOME_ROOT/workflow}"
LOCAL_BIN_ROOT="${LOCAL_BIN_ROOT:-$HOME/.local/bin}"
CODEX_AGENT_SOURCE="$REPO_ROOT/.codex/agents"
CODEX_AGENT_TARGET="$CODEX_HOME_ROOT/agents"

DRY_RUN=0
WORKFLOW_STAGE=""
AGENT_STAGE=""
SHIM_STAGE=""
WORKFLOW_ROOT_EXISTED=0
AGENT_ROOT_EXISTED=0
BIN_ROOT_EXISTED=0

usage() {
  cat <<'EOF'
Usage:
  scripts/sync-live-atlas-workflow.sh [--dry-run]

Sync only Atlas workflow helpers, the managed native Atlas agents, and Atlas
command shims. Writes are limited to CODEX_WORKFLOW_ROOT,
CODEX_HOME_ROOT/agents, and LOCAL_BIN_ROOT. All assets are staged and verified
before managed targets change. This helper never writes AGENTS_HOME or
$HOME/.agents and never invokes Multica or the full workflow self-test.
EOF
}

log() {
  printf '%s\n' "$*"
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'unknown option: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

command -v python3 >/dev/null || die "python3 not found in PATH"
command -v rsync >/dev/null || die "rsync not found in PATH"
command -v diff >/dev/null || die "diff not found in PATH"

for source_dir in \
  "$REPO_ROOT/workflow/bin" \
  "$REPO_ROOT/workflow/hooks" \
  "$REPO_ROOT/workflow/templates" \
  "$REPO_ROOT/workflow/tests"; do
  [[ -d "$source_dir" ]] || die "missing Atlas workflow source directory: $source_dir"
done
[[ -f "$REPO_ROOT/workflow/README.md" ]] || die "missing Atlas workflow README"
[[ -d "$CODEX_AGENT_SOURCE" ]] || die "missing native Atlas agent source: $CODEX_AGENT_SOURCE"

ATLAS_AGENT_NAMES=(
  atlas-sdd-browser-verifier.toml
  atlas-sdd-explorer.toml
  atlas-sdd-explorer-deepseek.toml
  atlas-sdd-implementer.toml
  atlas-sdd-implementer-deepseek.toml
  atlas-sdd-phase-reviewer.toml
  atlas-sdd-planner.toml
  atlas-sdd-reviewer.toml
  atlas-sdd-verifier.toml
  model-policy.json
)
ATLAS_COMMAND_NAMES=(
  atlas-plugin-integrity
  atlas-team-model-catalog
  atlas-zenmux-bearer-token
  codex-design-review
  codex-refresh-local-plugin
  codex-web-acceptance
  codex-workflow
)

for agent_name in "${ATLAS_AGENT_NAMES[@]}"; do
  [[ -f "$CODEX_AGENT_SOURCE/$agent_name" ]] || die "missing native Atlas agent: $agent_name"
done
for command_name in "${ATLAS_COMMAND_NAMES[@]}"; do
  [[ -f "$REPO_ROOT/workflow/bin/$command_name" ]] || die "missing Atlas command: $command_name"
done

# This is a read-only gate. It must run before any stage or target directory is created.
python3 - \
  "$HOME/.agents" \
  "${AGENTS_HOME:-}" \
  "$CODEX_HOME_ROOT/.tmp/marketplaces/atlas-forge" \
  "$CODEX_HOME_ROOT/plugins/cache/atlas-forge" \
  "$LIVE_WORKFLOW_ROOT" \
  "$CODEX_AGENT_TARGET" \
  "$LOCAL_BIN_ROOT" <<'PY'
import sys
from pathlib import Path

legacy_home, agents_home, snapshot_root, release_cache_root, *raw_targets = sys.argv[1:]
forbidden = [
    Path(legacy_home).resolve(strict=False),
    Path(snapshot_root).resolve(strict=False),
    Path(release_cache_root).resolve(strict=False),
]
if agents_home:
    forbidden.append(Path(agents_home).resolve(strict=False))

def reject_existing_symlink_prefix(raw_path):
    path = Path(raw_path).absolute()
    cursor = Path(path.anchor)
    for part in path.parts[1:]:
        cursor /= part
        if cursor.is_symlink():
            raise SystemExit(f"Atlas sync managed root must not traverse symlinks: {cursor}")
        if not cursor.exists():
            break

for value in raw_targets:
    reject_existing_symlink_prefix(value)

targets = [Path(value).resolve(strict=False) for value in raw_targets]
for target in targets:
    for root in forbidden:
        if target == root or root in target.parents:
            raise SystemExit(f"Atlas sync target is inside a forbidden runtime root: {target}")

for index, left in enumerate(targets):
    for right in targets[index + 1:]:
        if left == right or left in right.parents or right in left.parents:
            raise SystemExit(f"Atlas sync managed roots must not overlap: {left} <-> {right}")
PY

if [[ "$DRY_RUN" -eq 1 ]]; then
  for directory_name in bin hooks templates tests; do
    log "would stage and atomically sync Atlas workflow $directory_name: $LIVE_WORKFLOW_ROOT/$directory_name"
  done
  log "would stage and atomically sync Atlas workflow README: $LIVE_WORKFLOW_ROOT/README.md"
  log "would write Atlas workflow source root atomically: $LIVE_WORKFLOW_ROOT/source-root"
  for agent_name in "${ATLAS_AGENT_NAMES[@]}"; do
    log "would stage and atomically sync native Codex agent: $CODEX_AGENT_TARGET/$agent_name"
  done
  for command_name in "${ATLAS_COMMAND_NAMES[@]}"; do
    log "would stage and atomically install Atlas command shim: $LOCAL_BIN_ROOT/$command_name"
  done
  log "Atlas-only live sync dry-run complete; no files were written."
  exit 0
fi

cleanup_stages() {
  [[ -z "$WORKFLOW_STAGE" ]] || rm -rf "$WORKFLOW_STAGE"
  [[ -z "$AGENT_STAGE" ]] || rm -rf "$AGENT_STAGE"
  [[ -z "$SHIM_STAGE" ]] || rm -rf "$SHIM_STAGE"

  if [[ "$WORKFLOW_ROOT_EXISTED" -eq 0 ]]; then
    rmdir "$LIVE_WORKFLOW_ROOT" 2>/dev/null || true
  fi
  if [[ "$AGENT_ROOT_EXISTED" -eq 0 ]]; then
    rmdir "$CODEX_AGENT_TARGET" 2>/dev/null || true
  fi
  if [[ "$BIN_ROOT_EXISTED" -eq 0 ]]; then
    rmdir "$LOCAL_BIN_ROOT" 2>/dev/null || true
  fi
}
trap cleanup_stages EXIT

[[ -d "$LIVE_WORKFLOW_ROOT" ]] && WORKFLOW_ROOT_EXISTED=1
[[ -d "$CODEX_AGENT_TARGET" ]] && AGENT_ROOT_EXISTED=1
[[ -d "$LOCAL_BIN_ROOT" ]] && BIN_ROOT_EXISTED=1
mkdir -p "$LIVE_WORKFLOW_ROOT" "$CODEX_AGENT_TARGET" "$LOCAL_BIN_ROOT"
WORKFLOW_STAGE="$(mktemp -d "$LIVE_WORKFLOW_ROOT/.atlas-workflow-stage.XXXXXX")"
AGENT_STAGE="$(mktemp -d "$CODEX_AGENT_TARGET/.atlas-agents-stage.XXXXXX")"
SHIM_STAGE="$(mktemp -d "$LOCAL_BIN_ROOT/.atlas-shims-stage.XXXXXX")"

for directory_name in bin hooks templates tests; do
  mkdir -p "$WORKFLOW_STAGE/$directory_name"
  if ! rsync -a --delete "$REPO_ROOT/workflow/$directory_name/" "$WORKFLOW_STAGE/$directory_name/"; then
    die "failed to stage Atlas workflow $directory_name; managed targets were preserved"
  fi
  if ! diff -qr "$REPO_ROOT/workflow/$directory_name" "$WORKFLOW_STAGE/$directory_name" >/dev/null; then
    die "staged Atlas workflow $directory_name failed equality verification; managed targets were preserved"
  fi
done
cp -p "$REPO_ROOT/workflow/README.md" "$WORKFLOW_STAGE/README.md"
cmp -s "$REPO_ROOT/workflow/README.md" "$WORKFLOW_STAGE/README.md" \
  || die "staged Atlas workflow README failed equality verification"
printf '%s\n' "$REPO_ROOT" > "$WORKFLOW_STAGE/source-root"

for agent_name in "${ATLAS_AGENT_NAMES[@]}"; do
  cp -p "$CODEX_AGENT_SOURCE/$agent_name" "$AGENT_STAGE/$agent_name"
  cmp -s "$CODEX_AGENT_SOURCE/$agent_name" "$AGENT_STAGE/$agent_name" \
    || die "staged native Atlas agent failed equality verification: $agent_name"
done

for command_name in "${ATLAS_COMMAND_NAMES[@]}"; do
  target_path="$LIVE_WORKFLOW_ROOT/bin/$command_name"
  {
    printf '#!/usr/bin/env bash\n'
    printf 'exec %q "$@"\n' "$target_path"
  } > "$SHIM_STAGE/$command_name"
  chmod +x "$SHIM_STAGE/$command_name"
done

STAGED_PATHS=(
  "$WORKFLOW_STAGE/bin"
  "$WORKFLOW_STAGE/hooks"
  "$WORKFLOW_STAGE/templates"
  "$WORKFLOW_STAGE/tests"
  "$WORKFLOW_STAGE/README.md"
  "$WORKFLOW_STAGE/source-root"
)
TARGET_PATHS=(
  "$LIVE_WORKFLOW_ROOT/bin"
  "$LIVE_WORKFLOW_ROOT/hooks"
  "$LIVE_WORKFLOW_ROOT/templates"
  "$LIVE_WORKFLOW_ROOT/tests"
  "$LIVE_WORKFLOW_ROOT/README.md"
  "$LIVE_WORKFLOW_ROOT/source-root"
)
for agent_name in "${ATLAS_AGENT_NAMES[@]}"; do
  STAGED_PATHS+=("$AGENT_STAGE/$agent_name")
  TARGET_PATHS+=("$CODEX_AGENT_TARGET/$agent_name")
done
for command_name in "${ATLAS_COMMAND_NAMES[@]}"; do
  STAGED_PATHS+=("$SHIM_STAGE/$command_name")
  TARGET_PATHS+=("$LOCAL_BIN_ROOT/$command_name")
done

BACKUP_PATHS=()
INSTALLED=()

rollback_commit() {
  local last_index="$1"
  local index
  local target
  local backup

  for ((index = last_index; index >= 0; index -= 1)); do
    target="${TARGET_PATHS[$index]}"
    backup="${BACKUP_PATHS[$index]:-}"
    if [[ "${INSTALLED[$index]:-0}" -eq 1 ]]; then
      rm -rf "$target"
    fi
    if [[ -n "$backup" && ( -e "$backup" || -L "$backup" ) ]]; then
      mv "$backup" "$target" || true
    fi
  done
}

for index in "${!TARGET_PATHS[@]}"; do
  target="${TARGET_PATHS[$index]}"
  staged="${STAGED_PATHS[$index]}"
  backup=""
  BACKUP_PATHS[$index]=""
  INSTALLED[$index]=0

  if [[ -e "$target" || -L "$target" ]]; then
    backup="$target.atlas-backup.$$.$index"
    [[ ! -e "$backup" && ! -L "$backup" ]] || {
      rollback_commit "$((index - 1))"
      die "Atlas sync backup path already exists: $backup"
    }
    if ! mv "$target" "$backup"; then
      rollback_commit "$((index - 1))"
      die "failed to preserve Atlas sync target: $target"
    fi
    BACKUP_PATHS[$index]="$backup"
  fi

  if ! mv "$staged" "$target"; then
    rollback_commit "$index"
    die "failed to install staged Atlas sync target: $target"
  fi
  INSTALLED[$index]=1
done

verify_installed_targets() {
  local directory_name
  local agent_name

  for directory_name in bin hooks templates tests; do
    diff -qr "$REPO_ROOT/workflow/$directory_name" "$LIVE_WORKFLOW_ROOT/$directory_name" >/dev/null \
      || return 1
  done
  cmp -s "$REPO_ROOT/workflow/README.md" "$LIVE_WORKFLOW_ROOT/README.md" || return 1
  [[ "$(<"$LIVE_WORKFLOW_ROOT/source-root")" == "$REPO_ROOT" ]] || return 1
  for agent_name in "${ATLAS_AGENT_NAMES[@]}"; do
    cmp -s "$CODEX_AGENT_SOURCE/$agent_name" "$CODEX_AGENT_TARGET/$agent_name" || return 1
  done
}

if ! verify_installed_targets; then
  rollback_commit "$((${#TARGET_PATHS[@]} - 1))"
  die "installed Atlas sync targets failed postflight verification; previous targets were restored"
fi

for backup in "${BACKUP_PATHS[@]}"; do
  [[ -z "$backup" ]] || rm -rf "$backup"
done

log "atomically synchronized Atlas workflow helpers: $LIVE_WORKFLOW_ROOT"
log "atomically synchronized native Atlas agents: $CODEX_AGENT_TARGET"
log "atomically installed Atlas command shims: $LOCAL_BIN_ROOT"
log "Atlas-only live sync complete."
