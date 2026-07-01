#!/usr/bin/env python3
"""Validate daily-agent benchmark case metadata and fixtures."""

from __future__ import annotations

import argparse
import re
import shlex
import sys
import tempfile
from pathlib import Path, PureWindowsPath
from typing import Any

try:
    import yaml
except ModuleNotFoundError:
    print(
        "error: PyYAML is required for validate_cases.py; install the 'yaml' package in this Python environment",
        file=sys.stderr,
    )
    sys.exit(2)


CATEGORIES = {
    "code-review",
    "bugfix",
    "ops-debug",
    "data-check",
    "doc-sync",
    "product-reasoning",
}
SOURCE_TYPES = {"sanitized-synthetic", "sanitized-realistic", "workflow-derived", "manual"}
DIFFICULTIES = {"small", "medium", "large"}
PRIVACY_LEVELS = {"public", "sanitized", "private"}
CHECK_TYPES = {"none", "script", "hybrid"}
REQUIRED_FIELDS = {
    "id",
    "title",
    "category",
    "source_type",
    "difficulty",
    "privacy",
    "requires_network",
    "prompt_file",
    "oracle_file",
    "snapshot_dir",
    "snapshot_manifest",
    "check",
    "redaction_notes",
    "scoring",
}
CASE_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def load_case_yaml(path: Path) -> dict[str, Any] | None:
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except Exception as exc:  # pragma: no cover - exact parser errors vary.
        raise ValueError(f"cannot parse YAML: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("case.yaml must contain a mapping")
    return data


def is_absolute_like(value: str) -> bool:
    return Path(value).is_absolute() or PureWindowsPath(value).is_absolute()


def validate_relative_path(value: Any, field: str, errors: list[str]) -> str | None:
    if not isinstance(value, str) or not value.strip():
        errors.append(f"{field} must be a non-empty relative path string")
        return None
    if is_absolute_like(value):
        errors.append(f"{field} must be relative, got absolute path: {value}")
        return None
    parts = Path(value).parts
    if ".." in parts:
        errors.append(f"{field} must not contain '..': {value}")
        return None
    return value


def is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def validate_check(case_dir: Path, check: Any, errors: list[str]) -> None:
    if not isinstance(check, dict):
        errors.append("check must be a mapping")
        return

    check_type = check.get("type")
    if check_type not in CHECK_TYPES:
        errors.append(f"check.type must be one of {sorted(CHECK_TYPES)}, got {check_type!r}")
        return

    command = check.get("command", "")
    if check_type == "none":
        return

    if not isinstance(command, str) or not command.strip():
        errors.append("check.command is required for script or hybrid checks")
        return
    if any(marker in command for marker in (";", "&&", "||", "|", "`", "$(")):
        errors.append("check.command must be a simple local command without shell chaining")
    try:
        tokens = shlex.split(command)
    except ValueError as exc:
        errors.append(f"check.command cannot be parsed: {exc}")
        return
    for token in tokens:
        if token.startswith("-"):
            continue
        if is_absolute_like(token) or ".." in Path(token).parts:
            errors.append(f"check.command must not reference absolute or parent paths: {token}")
        if token.endswith(".sh") and not (case_dir / token).is_file():
            errors.append(f"check.command references missing script: {token}")


def validate_scoring(scoring: Any, errors: list[str]) -> None:
    if not isinstance(scoring, dict):
        errors.append("scoring must be a mapping")
        return

    total = scoring.get("total_points")
    if total != 20:
        errors.append(f"scoring.total_points must be 20, got {total!r}")

    dimensions = scoring.get("dimensions")
    if not isinstance(dimensions, dict) or not dimensions:
        errors.append("scoring.dimensions must be a non-empty mapping")
        return

    bad_dimensions = [name for name, points in dimensions.items() if not is_number(points)]
    if bad_dimensions:
        errors.append(f"scoring dimensions must be numeric: {bad_dimensions}")
        return

    dimension_sum = sum(dimensions.values())
    if dimension_sum != 20:
        errors.append(f"scoring dimensions must sum to 20, got {dimension_sum}")


def validate_case(case_dir: Path) -> list[str]:
    errors: list[str] = []
    case_yaml = case_dir / "case.yaml"
    if not case_yaml.is_file():
        return [f"missing case.yaml in {case_dir}"]

    try:
        data = load_case_yaml(case_yaml)
    except ValueError as exc:
        return [str(exc)]
    assert data is not None

    missing = sorted(REQUIRED_FIELDS - set(data))
    if missing:
        errors.append(f"missing required fields: {', '.join(missing)}")

    case_id = data.get("id")
    if not isinstance(case_id, str) or not CASE_ID_RE.fullmatch(case_id):
        errors.append("id must be kebab-case")
    elif case_id != case_dir.name:
        errors.append(f"id must match directory name {case_dir.name!r}, got {case_id!r}")

    if not isinstance(data.get("title"), str) or not data.get("title", "").strip():
        errors.append("title must be a non-empty string")
    if data.get("category") not in CATEGORIES:
        errors.append(f"category must be one of {sorted(CATEGORIES)}, got {data.get('category')!r}")
    if data.get("source_type") not in SOURCE_TYPES:
        errors.append(f"source_type must be one of {sorted(SOURCE_TYPES)}, got {data.get('source_type')!r}")
    if data.get("difficulty") not in DIFFICULTIES:
        errors.append(f"difficulty must be one of {sorted(DIFFICULTIES)}, got {data.get('difficulty')!r}")
    if data.get("privacy") not in PRIVACY_LEVELS:
        errors.append(f"privacy must be one of {sorted(PRIVACY_LEVELS)}, got {data.get('privacy')!r}")
    elif data.get("privacy") == "private":
        errors.append("committed cases must not use privacy: private; use an ignored private-* directory")
    if not isinstance(data.get("requires_network"), bool):
        errors.append("requires_network must be a boolean")
    elif data.get("requires_network"):
        errors.append("committed v1 cases must not require network access")

    prompt_file = validate_relative_path(data.get("prompt_file"), "prompt_file", errors)
    oracle_file = validate_relative_path(data.get("oracle_file"), "oracle_file", errors)
    snapshot_dir_value = validate_relative_path(data.get("snapshot_dir"), "snapshot_dir", errors)

    if prompt_file and not (case_dir / prompt_file).is_file():
        errors.append(f"prompt_file does not exist: {prompt_file}")
    if oracle_file and not (case_dir / oracle_file).is_file():
        errors.append(f"oracle_file does not exist: {oracle_file}")

    snapshot_root: Path | None = None
    if snapshot_dir_value:
        snapshot_root = case_dir / snapshot_dir_value
        if not snapshot_root.is_dir():
            errors.append(f"snapshot_dir does not exist: {snapshot_dir_value}")

    manifest = data.get("snapshot_manifest")
    if not isinstance(manifest, list) or not manifest:
        errors.append("snapshot_manifest must be a non-empty list")
    elif snapshot_root is not None:
        for index, entry in enumerate(manifest):
            if not isinstance(entry, dict):
                errors.append(f"snapshot_manifest[{index}] must be a mapping")
                continue
            manifest_path = validate_relative_path(entry.get("path"), f"snapshot_manifest[{index}].path", errors)
            if manifest_path and not (snapshot_root / manifest_path).is_file():
                errors.append(f"snapshot manifest file does not exist: {snapshot_dir_value}/{manifest_path}")

    validate_check(case_dir, data.get("check"), errors)

    redaction_notes = data.get("redaction_notes")
    if (
        not isinstance(redaction_notes, list)
        or not redaction_notes
        or not all(isinstance(note, str) and note.strip() for note in redaction_notes)
    ):
        errors.append("redaction_notes must be a non-empty list of strings")

    validate_scoring(data.get("scoring"), errors)

    tags = data.get("tags")
    if tags is not None and (not isinstance(tags, list) or not all(isinstance(tag, str) for tag in tags)):
        errors.append("tags must be a list of strings when present")

    return errors


def find_case_dirs(root: Path) -> list[Path]:
    if (root / "case.yaml").is_file():
        return [root]
    case_dirs: list[Path] = []
    for child in sorted(root.iterdir()):
        if not child.is_dir():
            continue
        if child.name.startswith("private-"):
            continue
        if (child / "case.yaml").is_file():
            case_dirs.append(child)
    return case_dirs


def write_fixture(case_dir: Path, data: dict[str, Any]) -> None:
    (case_dir / "snapshot").mkdir(parents=True)
    (case_dir / "prompt.md").write_text("# Prompt\n", encoding="utf-8")
    (case_dir / "oracle.md").write_text("# Oracle\n", encoding="utf-8")
    (case_dir / "check.sh").write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
    (case_dir / "snapshot" / "fixture.txt").write_text("synthetic fixture\n", encoding="utf-8")
    (case_dir / "case.yaml").write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")


def base_self_test_case(case_id: str) -> dict[str, Any]:
    return {
        "id": case_id,
        "title": "Self-test fixture",
        "category": "data-check",
        "source_type": "sanitized-synthetic",
        "difficulty": "small",
        "privacy": "sanitized",
        "requires_network": False,
        "prompt_file": "prompt.md",
        "oracle_file": "oracle.md",
        "snapshot_dir": "snapshot",
        "snapshot_manifest": [{"path": "fixture.txt", "description": "Synthetic fixture."}],
        "check": {"type": "script", "command": "bash check.sh"},
        "redaction_notes": ["Synthetic self-test fixture."],
        "scoring": {
            "total_points": 20,
            "dimensions": {"calculation_accuracy": 8, "evidence_use": 4, "recommendation": 4, "communication": 4},
        },
    }


def run_self_test() -> int:
    mutations = {
        "missing-title": lambda data: data.pop("title"),
        "invalid-category": lambda data: data.update({"category": "chat"}),
        "absolute-prompt": lambda data: data.update({"prompt_file": "/tmp/prompt.md"}),
        "missing-redaction": lambda data: data.update({"redaction_notes": []}),
        "missing-snapshot": lambda data: data.update({"snapshot_manifest": [{"path": "missing.txt"}]}),
        "non-20-scoring": lambda data: data["scoring"]["dimensions"].update({"communication": 3}),
        "private-privacy": lambda data: data.update({"privacy": "private"}),
    }

    with tempfile.TemporaryDirectory(prefix="dab-validator-") as tmp:
        root = Path(tmp)
        valid_dir = root / "valid-case"
        valid_data = base_self_test_case("valid-case")
        write_fixture(valid_dir, valid_data)
        valid_errors = validate_case(valid_dir)
        if valid_errors:
            print(f"self-test failed: valid fixture rejected: {valid_errors}", file=sys.stderr)
            return 1

        for name, mutate in mutations.items():
            case_dir = root / name
            data = base_self_test_case(name)
            mutate(data)
            write_fixture(case_dir, data)
            errors = validate_case(case_dir)
            if not errors:
                print(f"self-test failed: invalid fixture was accepted: {name}", file=sys.stderr)
                return 1

    print(f"self-test passed: {len(mutations)} invalid fixtures rejected")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Validate daily-agent benchmark cases.")
    parser.add_argument("cases_path", nargs="?", default="tools/daily-agent-benchmark/cases")
    parser.add_argument("--self-test", action="store_true", help="run validator negative-case self-tests")
    args = parser.parse_args(argv)

    if args.self_test:
        return run_self_test()

    root = Path(args.cases_path)
    if not root.exists():
        print(f"error: cases path does not exist: {root}", file=sys.stderr)
        return 1

    case_dirs = find_case_dirs(root)
    if not case_dirs:
        print(f"error: no case directories found under {root}", file=sys.stderr)
        return 1

    failed = False
    for case_dir in case_dirs:
        errors = validate_case(case_dir)
        if errors:
            failed = True
            for error in errors:
                print(f"[fail] {case_dir}: {error}", file=sys.stderr)
        else:
            print(f"[ok] {case_dir.name}")

    if failed:
        return 1
    print(f"validated {len(case_dirs)} case(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
