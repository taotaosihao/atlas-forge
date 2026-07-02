#!/usr/bin/env python3
"""Summarize daily-agent benchmark run packets."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


SCORECARD_RE = re.compile(r"^(auto_check_status|human_score_total|hard_fail):\s*(.*)$")


def read_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def read_scorecard(path: Path) -> dict[str, str]:
    result = {"auto_check_status": "", "human_score_total": "", "hard_fail": ""}
    if not path.is_file():
        return result
    for line in path.read_text(encoding="utf-8").splitlines():
        match = SCORECARD_RE.match(line)
        if match:
            result[match.group(1)] = match.group(2).strip()
    return result


def summarize(root: Path) -> int:
    if not root.exists():
        print(f"error: runs path does not exist: {root}", file=sys.stderr)
        return 1
    if not root.is_dir():
        print(f"error: runs path is not a directory: {root}", file=sys.stderr)
        return 1

    rows: list[dict[str, str]] = []
    for child in sorted(root.iterdir()):
        if not child.is_dir():
            continue
        metadata = read_json(child / "run.json")
        scorecard = read_scorecard(child / "scorecard.md")
        auto_check = scorecard.get("auto_check_status") or str(metadata.get("auto_check_status", ""))
        human_score = scorecard.get("human_score_total") or metadata.get("human_score_total")
        hard_fail = scorecard.get("hard_fail") or metadata.get("hard_fail")
        rows.append(
            {
                "run": child.name,
                "case_id": str(metadata.get("case_id") or child.name.split("-", 1)[-1]),
                "created_at_utc": str(metadata.get("created_at_utc") or ""),
                "auto_check_status": str(auto_check or ""),
                "human_score_total": "" if human_score is None else str(human_score),
                "hard_fail": "" if hard_fail is None else str(hard_fail),
            }
        )

    print(f"runs_dir: {root}")
    print(f"run_count: {len(rows)}")
    print("fields: auto_check_status is script evidence; human_score_total is reviewer-entered scoring")
    if not rows:
        return 0

    headers = ["case_id", "created_at_utc", "auto_check_status", "human_score_total", "hard_fail", "run"]
    widths = {header: len(header) for header in headers}
    for row in rows:
        for header in headers:
            widths[header] = max(widths[header], len(row[header]))

    print("  ".join(header.ljust(widths[header]) for header in headers))
    print("  ".join("-" * widths[header] for header in headers))
    for row in rows:
        print("  ".join(row[header].ljust(widths[header]) for header in headers))
    return 0


def main(argv: list[str]) -> int:
    root = Path(argv[0]) if argv else Path("tools/daily-agent-benchmark/runs")
    return summarize(root)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
