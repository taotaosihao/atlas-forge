#!/usr/bin/env bash
set -euo pipefail

# Static source gate for tracked Bash and JavaScript sources.
# Bash: shellcheck at error+warning severity. JavaScript: node --check.
# Multica paths are frozen (planned deprecation) and are never linted here.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SHELLCHECK_BIN="${SHELLCHECK_BIN:-shellcheck}"
SHELLCHECK_SEVERITY="${SHELLCHECK_SEVERITY:-warning}"

# Frozen or externally-owned trees excluded from every lint pass.
FROZEN_PREFIXES=(
  '.agents/'
  'plugins/multica-sdlc/'
)

# Individually excluded files. Each entry needs a reason.
# scripts/sync-live-agents.sh: installs the Multica shim, inside the freeze.
SHELLCHECK_EXCLUDED_FILES=(
  'scripts/sync-live-agents.sh'
)

is_excluded() {
  local candidate="$1" prefix entry
  for prefix in "${FROZEN_PREFIXES[@]}"; do
    [[ "$candidate" == "$prefix"* ]] && return 0
  done
  for entry in "${SHELLCHECK_EXCLUDED_FILES[@]}"; do
    [[ "$candidate" == "$entry" ]] && return 0
  done
  return 1
}

shell_files=()
js_files=()
while IFS= read -r tracked; do
  is_excluded "$tracked" && continue
  case "$tracked" in
    *.js)
      js_files+=("$tracked")
      continue
      ;;
  esac
  case "$tracked" in
    *.sh)
      shell_files+=("$tracked")
      ;;
    *)
      [[ -f "$tracked" ]] || continue
      if head -n 1 "$tracked" | grep -qE '^#!.*\b(bash|sh)$'; then
        shell_files+=("$tracked")
      fi
      ;;
  esac
done < <(git ls-files --cached --others --exclude-standard)

if [[ "${#shell_files[@]}" -eq 0 ]]; then
  echo "lint-sources: no shell sources discovered" >&2
  exit 1
fi
if [[ "${#js_files[@]}" -eq 0 ]]; then
  echo "lint-sources: no JavaScript sources discovered" >&2
  exit 1
fi

if ! command -v "$SHELLCHECK_BIN" >/dev/null 2>&1; then
  echo "lint-sources: missing shellcheck (set SHELLCHECK_BIN to override)" >&2
  exit 1
fi

"$SHELLCHECK_BIN" --severity="$SHELLCHECK_SEVERITY" --format=gcc "${shell_files[@]}"
printf 'lint-sources: shellcheck clean at severity %s (%d files)\n' \
  "$SHELLCHECK_SEVERITY" "${#shell_files[@]}"

for js_file in "${js_files[@]}"; do
  node --check "$js_file"
done
printf 'lint-sources: node --check clean (%d files)\n' "${#js_files[@]}"
