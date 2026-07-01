#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

test -f snapshot/weekly_signups.csv

expected_rate="$(awk -F, 'NR > 1 && $1 != "TOTAL" { visits += $2; signups += $3 } END { printf "%.4f", signups / visits }' snapshot/weekly_signups.csv)"
reported_rate="$(awk -F, '$1 == "TOTAL" { printf "%.4f", $4 }' snapshot/weekly_signups.csv)"

test "$expected_rate" = "0.1333"
test "$reported_rate" = "0.1200"
test "$expected_rate" != "$reported_rate"

echo "supporting check passed: expected_rate=${expected_rate}; reported_rate=${reported_rate}"
