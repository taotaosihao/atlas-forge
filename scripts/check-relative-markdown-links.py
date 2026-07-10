#!/usr/bin/env python3
"""Validate repository-relative inline Markdown links and images."""

from __future__ import annotations

import argparse
from pathlib import Path
import re
import subprocess
from urllib.parse import unquote, urlsplit


EXCLUDED_PREFIXES = (".agents/", "plugins/multica-sdlc/")
REFERENCE_DEFINITION_PATTERN = re.compile(r"^\s{0,3}\[[^\]]+\]:\s*(.+)$")
FENCE_OPEN_PATTERN = re.compile(r"^ {0,3}(`{3,}|~{3,})")


def inline_destinations(line: str) -> list[str]:
    destinations: list[str] = []
    search_from = 0
    while True:
        label_end = line.find("](", search_from)
        if label_end == -1:
            break
        if line.rfind("[", 0, label_end) == -1:
            search_from = label_end + 2
            continue

        start = label_end + 2
        index = start
        depth = 0
        escaped = False
        while index < len(line):
            character = line[index]
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == "(":
                depth += 1
            elif character == ")":
                if depth == 0:
                    destinations.append(line[start:index])
                    index += 1
                    break
                depth -= 1
            elif character.isspace() and depth == 0:
                destinations.append(line[start:index])
                break
            index += 1
        search_from = max(index, label_end + 2)
    return destinations


def markdown_files(root: Path) -> list[str]:
    result = subprocess.run(
        [
            "git",
            "-C",
            str(root),
            "ls-files",
            "-z",
            "--cached",
            "--others",
            "--exclude-standard",
            "--",
            "*.md",
        ],
        check=True,
        capture_output=True,
    )
    return sorted(
        entry.decode("utf-8")
        for entry in result.stdout.split(b"\0")
        if entry and not entry.decode("utf-8").startswith(EXCLUDED_PREFIXES)
    )


def destination(raw: str) -> str:
    value = raw.strip()
    if not value or value[0] in {"'", '"'}:
        return ""
    if value.startswith("<"):
        closing = value.find(">", 1)
        if closing != -1:
            return value[1:closing]
    value = value.split(maxsplit=1)[0]
    return re.sub(r"\\([\\()])", r"\1", value)


def validate(root: Path) -> tuple[int, int, list[str]]:
    checked_links = 0
    checked_files = 0
    errors: list[str] = []

    for relative in markdown_files(root):
        source = root / relative
        checked_files += 1
        fence_character = ""
        fence_length = 0
        for line_number, line in enumerate(source.read_text(encoding="utf-8").splitlines(), 1):
            if fence_character:
                closing_fence = re.compile(
                    rf"^ {{0,3}}{re.escape(fence_character)}{{{fence_length},}}[ \t]*$"
                )
                if closing_fence.match(line):
                    fence_character = ""
                    fence_length = 0
                continue

            opening_fence = FENCE_OPEN_PATTERN.match(line)
            if opening_fence:
                marker = opening_fence.group(1)
                fence_character = marker[0]
                fence_length = len(marker)
                continue
            candidates = inline_destinations(line)
            reference_definition = REFERENCE_DEFINITION_PATTERN.match(line)
            if reference_definition:
                candidates.append(reference_definition.group(1))

            for candidate in candidates:
                raw = destination(candidate)
                if not raw:
                    continue
                parsed = urlsplit(raw)
                if parsed.scheme or raw.startswith(("#", "//")):
                    continue
                target_text = unquote(parsed.path)
                if not target_text:
                    continue
                target = (source.parent / target_text).resolve()
                checked_links += 1
                try:
                    target.relative_to(root)
                except ValueError:
                    errors.append(f"{relative}:{line_number} -> outside repository: {raw}")
                    continue
                if not target.exists():
                    errors.append(f"{relative}:{line_number} -> missing: {raw}")

    return checked_files, checked_links, errors


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate repository-relative inline Markdown links and images."
    )
    parser.add_argument("--root", default=".", help="Git repository root (default: current directory)")
    args = parser.parse_args()
    root = Path(args.root).resolve()
    if not (root / ".git").exists():
        parser.error(f"not a Git repository root: {root}")

    checked_files, checked_links, errors = validate(root)
    if errors:
        print("\n".join(errors))
        return 1
    print(f"markdown_files_checked={checked_files}")
    print(f"relative_markdown_links_checked={checked_links}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
