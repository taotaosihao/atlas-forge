#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: $0 <case-dir>" >&2
  exit 2
fi

case_dir="$1"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
benchmark_dir="$(cd "${script_dir}/.." && pwd)"
runs_dir="${benchmark_dir}/runs"

if [ ! -d "$case_dir" ]; then
  echo "error: case directory does not exist: $case_dir" >&2
  exit 1
fi

python3 "${script_dir}/validate_cases.py" "$case_dir" >/dev/null

metadata="$(
  python3 - "$case_dir/case.yaml" <<'PY'
import sys
import yaml
from pathlib import Path

data = yaml.safe_load(Path(sys.argv[1]).read_text(encoding="utf-8"))
print(data["id"])
print(data.get("check", {}).get("type", "none"))
print(data.get("check", {}).get("command", ""))
PY
)"

case_id="$(printf '%s\n' "$metadata" | sed -n '1p')"
check_type="$(printf '%s\n' "$metadata" | sed -n '2p')"
check_command="$(printf '%s\n' "$metadata" | sed -n '3p')"
created_at_utc="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
stamp="$(date -u +"%Y%m%dT%H%M%SZ")"

mkdir -p "$runs_dir"
run_dir="${runs_dir}/${stamp}-${case_id}"
suffix=1
while [ -e "$run_dir" ]; do
  run_dir="${runs_dir}/${stamp}-${case_id}-${suffix}"
  suffix=$((suffix + 1))
done
mkdir -p "$run_dir"

cp "$case_dir/case.yaml" "$run_dir/case.yaml"
cp "$case_dir/prompt.md" "$run_dir/prompt.md"
cp "$case_dir/oracle.md" "$run_dir/oracle.md"
if [ -f "$case_dir/check.sh" ]; then
  cp "$case_dir/check.sh" "$run_dir/check.sh"
fi
if [ -d "$case_dir/snapshot" ]; then
  mkdir -p "$run_dir/snapshot"
  cp -R "$case_dir/snapshot/." "$run_dir/snapshot/"
fi

auto_check_status="skipped"
check_exit_code=""
if [ "$check_type" != "none" ] && [ -n "$check_command" ]; then
  set +e
  (cd "$case_dir" && bash -lc "$check_command") >"$run_dir/check.stdout" 2>"$run_dir/check.stderr"
  check_exit_code=$?
  set -e
  printf '%s\n' "$check_exit_code" >"$run_dir/check.exit_code"
  if [ "$check_exit_code" -eq 0 ]; then
    auto_check_status="pass"
  else
    auto_check_status="fail"
  fi
else
  printf 'auto check skipped\n' >"$run_dir/check.stdout"
  : >"$run_dir/check.stderr"
  printf 'skipped\n' >"$run_dir/check.exit_code"
fi

cat >"$run_dir/agent_response.md" <<EOF
# Agent Response

Paste or write the agent response here before scoring.
EOF

cat >"$run_dir/scorecard.md" <<EOF
# Scorecard

case_id: ${case_id}
created_at_utc: ${created_at_utc}
auto_check_status: ${auto_check_status}
check_exit_code: ${check_exit_code:-skipped}
human_score_total:
hard_fail:

## Human Scores

- dimension_1:
- dimension_2:
- dimension_3:
- dimension_4:
- dimension_5:

## Reviewer Notes

-
EOF

python3 - "$run_dir/run.json" "$case_id" "$created_at_utc" "$auto_check_status" "${check_exit_code:-skipped}" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
payload = {
    "case_id": sys.argv[2],
    "created_at_utc": sys.argv[3],
    "auto_check_status": sys.argv[4],
    "check_exit_code": sys.argv[5],
    "human_score_total": None,
    "hard_fail": None,
}
path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
PY

echo "created_run: $run_dir"
echo "auto_check_status: $auto_check_status"
