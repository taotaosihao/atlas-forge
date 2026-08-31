#!/usr/bin/env bash

ATLAS_TEST_PORTABLE_JS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/portable.js"

test_command_dir() {
  local executable
  executable="$(command -v "$1")" || {
    printf 'contract tests require %s on PATH\n' "$1" >&2
    return 1
  }
  if [[ "$1" == bash ]] && ! "$executable" -c '[[ "${BASH_VERSINFO[0]}" -ge 4 ]]'; then
    printf 'contract tests require Bash 4+ on PATH\n' >&2
    return 1
  fi
  dirname "$executable"
}

sha256() {
  node "$ATLAS_TEST_PORTABLE_JS" sha256 "$@"
}

fingerprint() {
  node "$ATLAS_TEST_PORTABLE_JS" fingerprint "$@"
}

file_identity() {
  node "$ATLAS_TEST_PORTABLE_JS" file-identity "$@"
}

file_mode() {
  node "$ATLAS_TEST_PORTABLE_JS" file-mode "$@"
}

copy_atlas_fixture() {
  # Match the development payload; ignored local dependencies are not Git snapshot content.
  mkdir -p "$2"
  rsync -a \
    --exclude=/tools/atlas-3d-harness/node_modules/ \
    --exclude=/tools/atlas-3d-harness/.local/ \
    --exclude=/tools/atlas-3d-harness/runs/ \
    --exclude=/tools/atlas-3d-harness/artifacts/ \
    --exclude=/tools/atlas-3d-harness/runtime-config.local.json \
    '--exclude=/tools/atlas-3d-harness/*.log' \
    "$1/" "$2/"
}
