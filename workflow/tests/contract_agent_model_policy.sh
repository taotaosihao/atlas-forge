#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

make_catalog() {
  local file="$1"
  local family="$2"
  local include_fast="${3:-yes}"
  {
    printf '{"models":['
    printf '{"slug":"gpt-%s-sol","description":"Latest frontier agentic coding model.","supported_reasoning_levels":[{"effort":"medium"},{"effort":"high"},{"effort":"max"}]},' "$family"
    printf '{"slug":"gpt-%s-terra","description":"Balanced agentic coding model for everyday work.","supported_reasoning_levels":[{"effort":"high"}]}' "$family"
    if [[ "$include_fast" == yes ]]; then
      printf ',{"slug":"gpt-%s-luna","description":"Fast and affordable agentic coding model.","supported_reasoning_levels":[{"effort":"medium"},{"effort":"high"},{"effort":"max"}]}' "$family"
    fi
    printf ']}\n'
  } > "$file"
}

make_agents() {
  local dir="$1"
  local family="$2"
  mkdir -p "$dir"
  printf 'model = "gpt-%s-sol"\nmodel_reasoning_effort = "high"\n' "$family" > "$dir/atlas-sdd-reviewer.toml"
  printf 'model = "gpt-%s-sol"\nmodel_reasoning_effort = "medium"\n' "$family" > "$dir/atlas-sdd-phase-reviewer.toml"
  printf 'model = "gpt-%s-sol"\nmodel_reasoning_effort = "medium"\n' "$family" > "$dir/atlas-sdd-planner.toml"
  printf 'model = "gpt-%s-sol"\nmodel_reasoning_effort = "max"\n' "$family" > "$dir/atlas-sdd-implementer.toml"
  printf 'model = "gpt-%s-sol"\nmodel_reasoning_effort = "high"\n' "$family" > "$dir/atlas-sdd-verifier.toml"
  printf 'model = "gpt-%s-sol"\nmodel_reasoning_effort = "high"\n' "$family" > "$dir/atlas-sdd-browser-verifier.toml"
  printf 'model = "gpt-%s-sol"\nmodel_reasoning_effort = "medium"\n' "$family" > "$dir/atlas-sdd-explorer.toml"
}

make_catalog "$TMP_ROOT/5.6.json" 5.6
make_agents "$TMP_ROOT/agents-5.6" 5.6
node "$ROOT/workflow/bin/atlas-agent-model-policy" check --catalog "$TMP_ROOT/5.6.json" --agents-dir "$TMP_ROOT/agents-5.6"
node "$ROOT/workflow/bin/atlas-agent-model-policy" check \
  --catalog "$TMP_ROOT/5.6.json" \
  --policy "$ROOT/.codex/agents/model-policy.json" \
  --agents-dir "$ROOT/.codex/agents"
while IFS= read -r role; do
  git -C "$ROOT" ls-files --error-unmatch ".codex/agents/$role.toml" >/dev/null
done < <(node -e 'const policy=require(process.argv[1]); process.stdout.write(`${Object.keys(policy.roles).sort().join("\n")}\n`)' "$ROOT/.codex/agents/model-policy.json")

make_catalog "$TMP_ROOT/6.1.json" 6.1
if node "$ROOT/workflow/bin/atlas-agent-model-policy" check --catalog "$TMP_ROOT/6.1.json" --agents-dir "$TMP_ROOT/agents-5.6" >/dev/null 2>&1; then
  echo "expected stale 5.6 projections to fail against a non-contiguous 6.1 catalog" >&2
  exit 1
fi
make_agents "$TMP_ROOT/agents-6.1" 6.1
node "$ROOT/workflow/bin/atlas-agent-model-policy" check --catalog "$TMP_ROOT/6.1.json" --agents-dir "$TMP_ROOT/agents-6.1"

make_catalog "$TMP_ROOT/incomplete.json" 5.8 no
if node "$ROOT/workflow/bin/atlas-agent-model-policy" resolve --catalog "$TMP_ROOT/incomplete.json" >/dev/null 2>&1; then
  echo "expected an incomplete latest family to fail closed" >&2
  exit 1
fi

printf 'contract_agent_model_policy: ok\n'
