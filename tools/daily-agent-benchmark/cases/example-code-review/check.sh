#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

test -f snapshot/app.py
test -f prompt.md
test -f oracle.md

grep -q "CACHE\\[account_id\\]" snapshot/app.py
grep -q "viewer_id" snapshot/app.py
grep -q "cache key" oracle.md

echo "supporting check passed: cache fixture and oracle are present"
