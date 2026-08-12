#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HELPER="$ROOT/workflow/bin/atlas-team-model-catalog"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

fail() {
  printf 'contract_agent_model_catalog: %s\n' "$1" >&2
  exit 1
}

cat > "$TMP_ROOT/official.json" <<'JSON'
{
  "models": [
    {"slug":"gpt-5.6-sol","multi_agent_version":"v2"},
    {"slug":"gpt-5.6-terra","multi_agent_version":"v2"},
    {"slug":"gpt-5.6-luna","multi_agent_version":"v1"},
    {"slug":"gpt-5.5"}
  ],
  "metadata": {"preserved": true}
}
JSON
cat > "$TMP_ROOT/deepseek.json" <<'JSON'
{"models":[{"slug":"deepseek-v4-pro:deepseek","display_name":"DeepSeek V4 Pro via ZenMux","default_reasoning_level":"max","supported_reasoning_levels":[{"effort":"low"},{"effort":"high"},{"effort":"max"}]}]}
JSON
chmod 600 "$TMP_ROOT/official.json" "$TMP_ROOT/deepseek.json"

official_before="$(sha256sum "$TMP_ROOT/official.json")"
deepseek_before="$(sha256sum "$TMP_ROOT/deepseek.json")"
"$HELPER" \
  --official "$TMP_ROOT/official.json" \
  --deepseek "$TMP_ROOT/deepseek.json" \
  --output "$TMP_ROOT/atlas-team.json" >/dev/null

[[ "$(stat -c '%a' "$TMP_ROOT/atlas-team.json")" == 600 ]] \
  || fail 'output catalog mode is not 600'
[[ "$official_before" == "$(sha256sum "$TMP_ROOT/official.json")" ]] \
  || fail 'official input catalog was modified'
[[ "$deepseek_before" == "$(sha256sum "$TMP_ROOT/deepseek.json")" ]] \
  || fail 'DeepSeek input catalog was modified'
jq -e '.metadata.preserved == true' "$TMP_ROOT/atlas-team.json" >/dev/null \
  || fail 'official catalog metadata was not preserved'
jq -e '
  [.models[] | select(.multi_agent_version == "v2") | .slug]
  == ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "deepseek-v4-pro:deepseek"]
' "$TMP_ROOT/atlas-team.json" >/dev/null \
  || fail 'eligible model projection is incorrect'
jq -e '
  .models[]
  | select(.slug == "deepseek-v4-pro:deepseek")
  | .default_reasoning_level == "max"
    and ([.supported_reasoning_levels[].effort] == ["low", "high", "max"])
' "$TMP_ROOT/atlas-team.json" >/dev/null \
  || fail 'DeepSeek max-effort catalog projection is incorrect'

jq 'del(.models[] | select(.slug == "gpt-5.6-luna"))' \
  "$TMP_ROOT/official.json" > "$TMP_ROOT/no-luna.json"
if "$HELPER" --official "$TMP_ROOT/no-luna.json" --deepseek "$TMP_ROOT/deepseek.json" --output "$TMP_ROOT/no-luna-output.json" >/dev/null 2>&1; then
  fail 'missing Luna unexpectedly passed'
fi

sed 's/deepseek-v4-pro:deepseek/deepseek\/deepseek-v4-pro/' \
  "$TMP_ROOT/deepseek.json" > "$TMP_ROOT/wrong-deepseek.json"
if "$HELPER" --official "$TMP_ROOT/official.json" --deepseek "$TMP_ROOT/wrong-deepseek.json" --output "$TMP_ROOT/wrong-deepseek-output.json" >/dev/null 2>&1; then
  fail 'upstream DeepSeek slug unexpectedly passed as a routed alias'
fi

jq '(.models[0].default_reasoning_level = "high")' \
  "$TMP_ROOT/deepseek.json" > "$TMP_ROOT/wrong-effort.json"
if "$HELPER" --official "$TMP_ROOT/official.json" --deepseek "$TMP_ROOT/wrong-effort.json" --output "$TMP_ROOT/wrong-effort-output.json" >/dev/null 2>&1; then
  fail 'non-max DeepSeek default unexpectedly passed'
fi

if "$HELPER" --official "$TMP_ROOT/official.json" --deepseek "$TMP_ROOT/deepseek.json" --output "$TMP_ROOT/official.json" >/dev/null 2>&1; then
  fail 'input overwrite unexpectedly passed'
fi

printf 'contract_agent_model_catalog: ok\n'
