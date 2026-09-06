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
    printf '{"models":[{"slug":"gpt-6-astra","description":"Our most capable model for complex, demanding work.","supported_reasoning_levels":[{"effort":"medium"},{"effort":"high"}]},'
    printf '{"slug":"gpt-%s-sol","description":"Latest frontier agentic coding model.","supported_reasoning_levels":[{"effort":"medium"},{"effort":"high"},{"effort":"xhigh"},{"effort":"max"}]},' "$family"
    printf '{"slug":"gpt-%s-terra","description":"Balanced agentic coding model for everyday work.","supported_reasoning_levels":[{"effort":"high"},{"effort":"max"}]}' "$family"
    if [[ "$include_fast" == yes ]]; then
      printf ',{"slug":"gpt-%s-luna","description":"Fast and affordable agentic coding model.","supported_reasoning_levels":[{"effort":"medium"},{"effort":"high"},{"effort":"xhigh"},{"effort":"max"}]}' "$family"
    fi
    printf ']}\n'
  } > "$file"
}

make_agents() {
  local dir="$1"
  mkdir -p "$dir"
  printf 'sandbox_mode = "read-only"\ndeveloper_instructions = """routine reviewer"""\n' > "$dir/atlas-sdd-reviewer.toml"
  printf 'developer_instructions = """phase reviewer"""\n' > "$dir/atlas-sdd-phase-reviewer.toml"
  printf 'sandbox_mode = "read-only"\ndeveloper_instructions = """planner"""\n' > "$dir/atlas-sdd-planner.toml"
  printf 'developer_instructions = """same writable implementer"""\n' > "$dir/atlas-sdd-implementer.toml"
  printf 'model_provider = "zenmux"\nmodel = "deepseek-v4-pro:deepseek"\nmodel_reasoning_effort = "max"\ndeveloper_instructions = """same writable implementer"""\n' > "$dir/atlas-sdd-implementer-deepseek.toml"
  printf 'developer_instructions = """verifier"""\n' > "$dir/atlas-sdd-verifier.toml"
  printf 'developer_instructions = """browser verifier"""\n' > "$dir/atlas-sdd-browser-verifier.toml"
  printf 'sandbox_mode = "read-only"\ndeveloper_instructions = """same read-only explorer"""\n' > "$dir/atlas-sdd-explorer.toml"
  printf 'model_provider = "zenmux"\nmodel = "deepseek-v4-pro:deepseek"\nmodel_reasoning_effort = "max"\nsandbox_mode = "read-only"\ndeveloper_instructions = """same read-only explorer"""\n' > "$dir/atlas-sdd-explorer-deepseek.toml"
  printf 'model_provider = "zenmux"\nmodel = "deepseek-v4-pro:deepseek"\nmodel_reasoning_effort = "max"\nsandbox_mode = "read-only"\ndeveloper_instructions = """planner"""\n' > "$dir/atlas-sdd-planner-deepseek.toml"
  printf 'model_provider = "zenmux"\nmodel = "deepseek-v4-pro:deepseek"\nmodel_reasoning_effort = "max"\nsandbox_mode = "read-only"\ndeveloper_instructions = """routine reviewer"""\n' > "$dir/atlas-sdd-reviewer-deepseek.toml"
}

make_catalog "$TMP_ROOT/5.6.json" 5.6
make_agents "$TMP_ROOT/agents"
node "$ROOT/workflow/bin/atlas-agent-model-policy" check --catalog "$TMP_ROOT/5.6.json" --agents-dir "$TMP_ROOT/agents"
node "$ROOT/workflow/bin/atlas-agent-model-policy" check --mode planning-review --catalog "$TMP_ROOT/5.6.json" --agents-dir "$TMP_ROOT/agents"
node "$ROOT/workflow/bin/atlas-agent-model-policy" check --mode saving --catalog "$TMP_ROOT/5.6.json" --agents-dir "$TMP_ROOT/agents"
node "$ROOT/workflow/bin/atlas-agent-model-policy" check --mode quality --catalog "$TMP_ROOT/5.6.json" --agents-dir "$TMP_ROOT/agents"
node "$ROOT/workflow/bin/atlas-agent-model-policy" check \
  --catalog "$TMP_ROOT/5.6.json" \
  --policy "$ROOT/.codex/agents/model-policy.json" \
  --agents-dir "$ROOT/.codex/agents"
node "$ROOT/workflow/bin/atlas-agent-model-policy" check --mode quality \
  --catalog "$TMP_ROOT/5.6.json" \
  --policy "$ROOT/.codex/agents/model-policy.json" \
  --agents-dir "$ROOT/.codex/agents"
node "$ROOT/workflow/bin/atlas-agent-model-policy" check --mode saving \
  --catalog "$TMP_ROOT/5.6.json" \
  --policy "$ROOT/.codex/agents/model-policy.json" \
  --agents-dir "$ROOT/.codex/agents"
while IFS= read -r role; do
  git -C "$ROOT" ls-files --error-unmatch ".codex/agents/$role.toml" >/dev/null
done < <(node -e 'const policy=require(process.argv[1]); process.stdout.write(`${[...new Set([...Object.keys(policy.roles), ...Object.keys(policy.planning_review_roles), ...Object.keys(policy.quality_roles), ...Object.keys(policy.equivalent_roles || {})])].sort().join("\n")}\n`)' "$ROOT/.codex/agents/model-policy.json")

node -e '
  const policy=require(process.argv[1]);
  if (policy.schema_version !== 2 || policy.default_mode !== "planning-review") throw new Error(`expected schema v2 planning-review default`);
  for (const [role, equivalentTo] of [["atlas-sdd-planner-deepseek", "atlas-sdd-planner"], ["atlas-sdd-reviewer-deepseek", "atlas-sdd-reviewer"]]) {
    const entry=policy.equivalent_roles?.[role];
    if (!entry || entry.equivalent_to !== equivalentTo || entry.model !== "deepseek-v4-pro:deepseek" || entry.model_provider !== "zenmux" || entry.reasoning_effort !== "max" || entry.sandbox_mode !== "read-only") {
      throw new Error(`invalid Cross equivalent role: ${role}`);
    }
  }
' "$ROOT/.codex/agents/model-policy.json"

make_catalog "$TMP_ROOT/6.1.json" 6.1
node "$ROOT/workflow/bin/atlas-agent-model-policy" check --catalog "$TMP_ROOT/6.1.json" --agents-dir "$TMP_ROOT/agents"
node "$ROOT/workflow/bin/atlas-agent-model-policy" resolve --catalog "$TMP_ROOT/6.1.json" \
  | jq -e '.family == "6.0" and .mode == "planning-review"
    and ([.roles[].model] | unique) == ["gpt-6-astra"]
    and ([.roles["atlas-sdd-reviewer", "atlas-sdd-phase-reviewer"].model_reasoning_effort] | unique) == ["medium"]
    and .roles["atlas-sdd-planner"].model_reasoning_effort == "high"
    and (.roles | has("atlas-sdd-implementer") | not)' >/dev/null
node "$ROOT/workflow/bin/atlas-agent-model-policy" resolve --mode saving --catalog "$TMP_ROOT/6.1.json" \
  | jq -e '.family == "6.1" and .mode == "saving"
    and .roles["atlas-sdd-reviewer"].model_reasoning_effort == "max"
    and .roles["atlas-sdd-planner"].model_reasoning_effort == "high"
    and .roles["atlas-sdd-implementer"] == {model:"gpt-6.1-luna",model_reasoning_effort:"max"}
    and .roles["atlas-sdd-browser-verifier"].model_reasoning_effort == "xhigh"
    and .roles["atlas-sdd-explorer"].model_reasoning_effort == "max"' >/dev/null
node "$ROOT/workflow/bin/atlas-agent-model-policy" resolve --mode quality --catalog "$TMP_ROOT/6.1.json" \
  | jq -e '.family == "6.1" and .mode == "quality"
    and ([.roles[].model] | unique) == ["gpt-6.1-sol"]
    and ([.roles["atlas-sdd-reviewer", "atlas-sdd-phase-reviewer"].model_reasoning_effort] | unique) == ["xhigh"]
    and .roles["atlas-sdd-planner"].model_reasoning_effort == "max"
    and .roles["atlas-sdd-implementer"].model_reasoning_effort == "medium"
    and ([.roles["atlas-sdd-verifier", "atlas-sdd-browser-verifier"].model_reasoning_effort] | unique) == ["medium"]
    and .roles["atlas-sdd-explorer"].model_reasoning_effort == "high"' >/dev/null

jq '.planning_review_roles["atlas-sdd-reviewer"].capability = "balanced"' \
  "$ROOT/.codex/agents/model-policy.json" > "$TMP_ROOT/low-tier-planning-review-policy.json"
if node "$ROOT/workflow/bin/atlas-agent-model-policy" resolve \
  --catalog "$TMP_ROOT/5.6.json" \
  --policy "$TMP_ROOT/low-tier-planning-review-policy.json" >/dev/null 2>&1; then
  echo "expected a low-tier planning-review policy to fail closed" >&2
  exit 1
fi

jq 'del(.default_mode)' "$ROOT/.codex/agents/model-policy.json" \
  > "$TMP_ROOT/missing-default-policy.json"
if node "$ROOT/workflow/bin/atlas-agent-model-policy" resolve \
  --catalog "$TMP_ROOT/5.6.json" \
  --policy "$TMP_ROOT/missing-default-policy.json" >/dev/null 2>&1; then
  echo "expected schema v2 without a planning-review default to fail closed" >&2
  exit 1
fi

cp -R "$TMP_ROOT/agents" "$TMP_ROOT/agents-pinned-native"
printf 'model = "gpt-5.6-sol"\nmodel_reasoning_effort = "medium"\n' \
  >> "$TMP_ROOT/agents-pinned-native/atlas-sdd-implementer.toml"
if node "$ROOT/workflow/bin/atlas-agent-model-policy" check \
  --mode saving \
  --catalog "$TMP_ROOT/5.6.json" \
  --agents-dir "$TMP_ROOT/agents-pinned-native" >/dev/null 2>&1; then
  echo "expected a native profile model pin to fail closed" >&2
  exit 1
fi

cp -R "$TMP_ROOT/agents" "$TMP_ROOT/agents-divergent-equivalent"
printf 'model_provider = "zenmux"\nmodel = "deepseek-v4-pro:deepseek"\nmodel_reasoning_effort = "medium"\nsandbox_mode = "read-only"\ndeveloper_instructions = """different role"""\n' \
  > "$TMP_ROOT/agents-divergent-equivalent/atlas-sdd-explorer-deepseek.toml"
if node "$ROOT/workflow/bin/atlas-agent-model-policy" check \
  --mode saving \
  --catalog "$TMP_ROOT/5.6.json" \
  --agents-dir "$TMP_ROOT/agents-divergent-equivalent" >/dev/null 2>&1; then
  echo "expected divergent equivalent-role instructions to fail closed" >&2
  exit 1
fi

cp -R "$TMP_ROOT/agents" "$TMP_ROOT/agents-divergent-planner"
printf 'model_provider = "zenmux"\nmodel = "deepseek-v4-pro:deepseek"\nmodel_reasoning_effort = "high"\nsandbox_mode = "read-only"\ndeveloper_instructions = """planner"""\n' \
  > "$TMP_ROOT/agents-divergent-planner/atlas-sdd-planner-deepseek.toml"
if node "$ROOT/workflow/bin/atlas-agent-model-policy" check \
  --catalog "$TMP_ROOT/5.6.json" \
  --agents-dir "$TMP_ROOT/agents-divergent-planner" >/dev/null 2>&1; then
  echo "expected planner equivalent route drift to fail closed" >&2
  exit 1
fi

cp -R "$TMP_ROOT/agents" "$TMP_ROOT/agents-divergent-reviewer"
printf 'model_provider = "zenmux"\nmodel = "deepseek-v4-pro:deepseek"\nmodel_reasoning_effort = "max"\nsandbox_mode = "read-only"\ndeveloper_instructions = """different reviewer"""\n' \
  > "$TMP_ROOT/agents-divergent-reviewer/atlas-sdd-reviewer-deepseek.toml"
if node "$ROOT/workflow/bin/atlas-agent-model-policy" check \
  --catalog "$TMP_ROOT/5.6.json" \
  --agents-dir "$TMP_ROOT/agents-divergent-reviewer" >/dev/null 2>&1; then
  echo "expected reviewer equivalent instruction drift to fail closed" >&2
  exit 1
fi

assert_equivalent_drift_rejected() {
  local role="$1"
  local field="$2"
  local value="$3"
  local label="$4"
  local dir="$TMP_ROOT/agents-drift-${role##atlas-sdd-}-${field}"
  cp -R "$TMP_ROOT/agents" "$dir"
  sed -E "s|^${field} = .*|${field} = \"${value}\"|" \
    "$dir/$role.toml" > "$dir/$role.toml.tmp"
  mv "$dir/$role.toml.tmp" "$dir/$role.toml"
  if node "$ROOT/workflow/bin/atlas-agent-model-policy" check \
    --catalog "$TMP_ROOT/5.6.json" \
    --agents-dir "$dir" >/dev/null 2>&1; then
    echo "expected $label drift to fail closed" >&2
    exit 1
  fi
}

for equivalent_role in atlas-sdd-planner-deepseek atlas-sdd-reviewer-deepseek; do
  assert_equivalent_drift_rejected "$equivalent_role" model \
    'deepseek-v4-pro:drift' "$equivalent_role model"
  assert_equivalent_drift_rejected "$equivalent_role" model_provider \
    openai "$equivalent_role model_provider"
  assert_equivalent_drift_rejected "$equivalent_role" sandbox_mode \
    full-access "$equivalent_role sandbox_mode"
done

make_catalog "$TMP_ROOT/incomplete.json" 5.8 no
node "$ROOT/workflow/bin/atlas-agent-model-policy" resolve --catalog "$TMP_ROOT/incomplete.json" \
  | jq -e '.mode == "planning-review" and ([.roles[].model] | unique) == ["gpt-6-astra"]' >/dev/null
if node "$ROOT/workflow/bin/atlas-agent-model-policy" resolve --mode saving --catalog "$TMP_ROOT/incomplete.json" >/dev/null 2>&1; then
  echo "expected an incomplete latest family to fail closed" >&2
  exit 1
fi

jq '.models |= map(select(.slug != "gpt-6-astra"))' "$TMP_ROOT/5.6.json" > "$TMP_ROOT/no-astra.json"
if node "$ROOT/workflow/bin/atlas-agent-model-policy" resolve --catalog "$TMP_ROOT/no-astra.json" >/dev/null 2>&1; then
  echo "expected missing GPT-6 Astra to fail closed, without Sol fallback" >&2
  exit 1
fi
jq '.models |= map(select(.slug == "gpt-6-astra"))' "$TMP_ROOT/5.6.json" > "$TMP_ROOT/astra-only.json"
node "$ROOT/workflow/bin/atlas-agent-model-policy" check --catalog "$TMP_ROOT/astra-only.json" --agents-dir "$TMP_ROOT/agents"
jq '(.models[] | select(.slug == "gpt-6-astra")).supported_reasoning_levels = [{"effort":"low"}]' "$TMP_ROOT/5.6.json" > "$TMP_ROOT/astra-low-effort.json"
if node "$ROOT/workflow/bin/atlas-agent-model-policy" resolve --catalog "$TMP_ROOT/astra-low-effort.json" >/dev/null 2>&1; then
  echo "expected unsupported planning reasoning effort to fail closed" >&2
  exit 1
fi

printf 'contract_agent_model_policy: ok\n'
