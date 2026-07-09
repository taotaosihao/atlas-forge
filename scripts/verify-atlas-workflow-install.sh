#!/usr/bin/env bash
set -euo pipefail

ATLAS_FORGE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INTEGRITY_BIN="$ATLAS_FORGE_ROOT/workflow/bin/atlas-plugin-integrity"

exec python3 - "$INTEGRITY_BIN" "$@" <<'PY'
import json
import os
import re
import subprocess
import sys
import tomllib
from pathlib import Path

TOOL = "verify-atlas-workflow-install"
SCHEMA_VERSION = 1
PLUGIN_NAME = "atlas-workflow"
PLUGIN_PATH = "plugins/atlas-workflow"
MARKETPLACE_PATH = ".agents/plugins/marketplace.json"
FULL_SHA = re.compile(r"^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$")
SEMVER = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)"
    r"(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?"
    r"(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$"
)
CODEX_SEQUENCE = re.compile(r"^codex\.(0|[1-9]\d*)$")
SECTIONS = (
    "inputs",
    "repo",
    "release_identity",
    "marketplace_contract",
    "marketplace_config",
    "version_order",
    "snapshot",
    "sidecar",
    "exact_cache",
)


class VerifyError(RuntimeError):
    def __init__(self, code, message, **details):
        super().__init__(message)
        self.code = code
        self.details = details


def error_payload(error):
    if isinstance(error, VerifyError):
        return {"code": error.code, "message": str(error), **error.details}
    return {"code": "INTERNAL_ERROR", "message": str(error)}


def emit(mode, checks, errors, exit_code=None):
    payload = {
        "schema_version": SCHEMA_VERSION,
        "tool": TOOL,
        "mode": mode,
        "ok": not errors,
        "checks": {section: checks.get(section, {}) for section in SECTIONS},
        "errors": errors,
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
    raise SystemExit((0 if not errors else 1) if exit_code is None else exit_code)


def parse_arguments(argv):
    if argv and argv[0] in ("-h", "--help"):
        print(
            "Usage: verify-atlas-workflow-install.sh <preflight|installed> "
            "--repo ABS --base REF --expected-commit FULLSHA "
            "--marketplace NAME --expected-source SOURCE [--codex-home ABS]"
        )
        raise SystemExit(0)
    if not argv or argv[0] not in ("preflight", "installed"):
        raise VerifyError("CLI_USAGE", "first argument must be preflight or installed")
    mode = argv[0]
    values = {}
    index = 1
    allowed = {"repo", "base", "expected-commit", "marketplace", "expected-source", "codex-home"}
    while index < len(argv):
        argument = argv[index]
        if not argument.startswith("--"):
            raise VerifyError("CLI_USAGE", f"unexpected positional argument: {argument}")
        key = argument[2:]
        if key not in allowed:
            raise VerifyError("CLI_USAGE", f"unknown option: --{key}")
        if key in values or index + 1 >= len(argv):
            raise VerifyError("CLI_USAGE", f"missing or duplicate value for --{key}")
        values[key] = argv[index + 1]
        index += 2
    for key in ("repo", "base", "expected-commit", "marketplace", "expected-source"):
        if not values.get(key):
            raise VerifyError("CLI_USAGE", f"missing required option: --{key}")
    if "codex-home" not in values:
        values["codex-home"] = os.environ.get("CODEX_HOME_ROOT") or os.environ.get("CODEX_HOME")
    if not values.get("codex-home"):
        raise VerifyError("CLI_USAGE", "CODEX_HOME_ROOT, CODEX_HOME, or --codex-home is required")
    return mode, values


def canonical_absolute(raw, label):
    value = Path(raw)
    if not value.is_absolute():
        raise VerifyError("PATH_NOT_ABSOLUTE", f"{label} must be absolute", path=raw)
    if os.path.normpath(raw) != raw:
        raise VerifyError("PATH_NOT_CANONICAL", f"{label} must be lexically canonical", path=raw)
    cursor = Path(value.anchor)
    for part in value.parts[1:]:
        cursor /= part
        if cursor.is_symlink():
            raise VerifyError(
                "PATH_COMPONENT_SYMLINK_FORBIDDEN",
                f"{label} must not traverse symbolic links",
                path=str(value),
                symlink_component=str(cursor),
            )
        if not cursor.exists():
            break
    return value


def git(repo, arguments, allow_failure=False):
    environment = dict(os.environ)
    environment["GIT_OPTIONAL_LOCKS"] = "0"
    result = subprocess.run(
        ["git", "-C", str(repo), *arguments],
        text=True,
        capture_output=True,
        check=False,
        env=environment,
    )
    if result.returncode != 0 and not allow_failure:
        raise VerifyError(
            "GIT_COMMAND_FAILED",
            f"git {' '.join(arguments)} failed",
            exit_code=result.returncode,
            stderr=result.stderr.strip(),
        )
    return result


def read_json_file(path, label):
    canonical_absolute(str(path), label)
    if path.is_symlink() or not path.is_file():
        raise VerifyError("JSON_FILE_MISSING", f"{label} must be a regular file", path=str(path))
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise VerifyError("JSON_INVALID", f"{label} is not valid UTF-8 JSON", path=str(path), detail=str(error))


def read_json_at(repo, commit, relative, label):
    result = git(repo, ["show", f"{commit}:{relative}"])
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise VerifyError("JSON_INVALID", f"{label} is not valid JSON", path=relative, detail=str(error))


def validate_marketplace(data, marketplace, label):
    if not isinstance(data, dict):
        raise VerifyError("MARKETPLACE_NOT_OBJECT", f"{label} must be an object")
    if data.get("name") != marketplace:
        raise VerifyError(
            "MARKETPLACE_NAME_MISMATCH",
            f"{label} name does not match the requested marketplace",
            expected=marketplace,
            actual=data.get("name"),
        )
    plugins = data.get("plugins")
    if not isinstance(plugins, list) or len(plugins) != 1:
        names = [item.get("name") for item in plugins if isinstance(item, dict)] if isinstance(plugins, list) else []
        raise VerifyError(
            "SHARED_MARKETPLACE_FORBIDDEN",
            f"{label} must contain exactly one Atlas plugin",
            plugin_names=names,
        )
    plugin = plugins[0]
    if not isinstance(plugin, dict) or plugin.get("name") != PLUGIN_NAME:
        raise VerifyError("SHARED_MARKETPLACE_FORBIDDEN", f"{label} must contain only atlas-workflow")
    source = plugin.get("source")
    if not isinstance(source, dict) or source.get("source") != "local" or source.get("path") != "./plugins/atlas-workflow":
        raise VerifyError("MARKETPLACE_PLUGIN_SOURCE_INVALID", f"{label} Atlas source must be canonical local source")
    return {"name": marketplace, "plugin_names": [PLUGIN_NAME], "atlas_only": True}


def load_manifest(path, label):
    data = read_json_file(path / ".codex-plugin" / "plugin.json", f"{label} manifest")
    if not isinstance(data, dict) or data.get("name") != PLUGIN_NAME:
        raise VerifyError("PLUGIN_MANIFEST_NAME_INVALID", f"{label} manifest name must be atlas-workflow")
    version = data.get("version")
    if not isinstance(version, str) or not SEMVER.fullmatch(version):
        raise VerifyError("PLUGIN_VERSION_INVALID", f"{label} manifest version must use strict SemVer", version=version)
    return version


def parse_semver(value):
    match = SEMVER.fullmatch(value)
    if not match:
        raise VerifyError("INSTALLED_VERSION_INVALID", "installed cache entry is not strict SemVer", version=value)
    prerelease = [] if match.group(4) is None else match.group(4).split(".")
    return {
        "raw": value,
        "core": (int(match.group(1)), int(match.group(2)), int(match.group(3))),
        "prerelease": prerelease,
        "build": match.group(5),
    }


def compare_prerelease(left, right):
    if not left and not right:
        return 0
    if not left:
        return 1
    if not right:
        return -1
    for left_item, right_item in zip(left, right):
        if left_item == right_item:
            continue
        left_numeric = left_item.isdigit()
        right_numeric = right_item.isdigit()
        if left_numeric and right_numeric:
            return 1 if int(left_item) > int(right_item) else -1
        if left_numeric != right_numeric:
            return -1 if left_numeric else 1
        return 1 if left_item > right_item else -1
    if len(left) == len(right):
        return 0
    return 1 if len(left) > len(right) else -1


def compare_release_order(installed, expected):
    left = parse_semver(installed)
    right = parse_semver(expected)
    if left["core"] != right["core"]:
        return 1 if left["core"] > right["core"] else -1
    prerelease = compare_prerelease(left["prerelease"], right["prerelease"])
    if prerelease:
        return prerelease
    if installed == expected:
        return 0
    left_sequence = CODEX_SEQUENCE.fullmatch(left["build"] or "")
    right_sequence = CODEX_SEQUENCE.fullmatch(right["build"] or "")
    if left_sequence and right_sequence:
        left_value = int(left_sequence.group(1))
        right_value = int(right_sequence.group(1))
        return (left_value > right_value) - (left_value < right_value)
    raise VerifyError(
        "VERSION_ORDER_UNPROVEN",
        "equal SemVer precedence with different non-codex build metadata cannot be ordered safely",
        installed=installed,
        expected=expected,
    )


def run_integrity(binary, arguments):
    environment = dict(os.environ)
    environment["GIT_OPTIONAL_LOCKS"] = "0"
    result = subprocess.run(
        [str(binary), *arguments],
        text=True,
        capture_output=True,
        check=False,
        env=environment,
    )
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise VerifyError("INTEGRITY_OUTPUT_INVALID", "atlas-plugin-integrity returned invalid JSON", detail=str(error))
    return result.returncode, payload


def validate_config(path, marketplace, expected_source, expected_commit, installed_mode):
    canonical_absolute(str(path), "Codex config")
    if path.is_symlink() or not path.is_file():
        raise VerifyError("CONFIG_MISSING", "Codex config.toml must be a regular file", path=str(path))
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, tomllib.TOMLDecodeError) as error:
        raise VerifyError("CONFIG_INVALID", "Codex config.toml is invalid", detail=str(error))
    marketplaces = data.get("marketplaces")
    entry = marketplaces.get(marketplace) if isinstance(marketplaces, dict) else None
    if not isinstance(entry, dict):
        raise VerifyError("MARKETPLACE_CONFIG_MISSING", "requested marketplace is missing from Codex config")
    if entry.get("source_type") != "git" or entry.get("source") != expected_source:
        raise VerifyError("MARKETPLACE_SOURCE_MISMATCH", "marketplace config source does not match expected Git source")
    ref = entry.get("ref")
    if not isinstance(ref, str) or not FULL_SHA.fullmatch(ref):
        raise VerifyError("MOVING_REF_FORBIDDEN", "marketplace ref must be a full immutable commit SHA", ref=ref)
    if ref.lower() != expected_commit.lower():
        raise VerifyError("MARKETPLACE_REF_MISMATCH", "marketplace ref does not match expected commit", ref=ref)
    revision = entry.get("last_revision")
    if revision is not None and (not isinstance(revision, str) or not FULL_SHA.fullmatch(revision)):
        raise VerifyError(
            "MARKETPLACE_REVISION_INVALID",
            "marketplace last_revision must be a full immutable commit SHA string",
            last_revision=revision,
        )
    if installed_mode and revision is None:
        raise VerifyError(
            "MARKETPLACE_REVISION_INVALID",
            "installed verification requires a full immutable last_revision",
            last_revision=None,
        )
    if installed_mode and revision.lower() != expected_commit.lower():
        raise VerifyError("MARKETPLACE_REVISION_MISMATCH", "marketplace last_revision does not match expected commit")
    plugins = data.get("plugins")
    selector = f"{PLUGIN_NAME}@{marketplace}"
    atlas_settings = plugins.get(selector) if isinstance(plugins, dict) else None
    atlas_enabled = isinstance(atlas_settings, dict) and atlas_settings.get("enabled") is True
    if installed_mode and not atlas_enabled:
        raise VerifyError(
            "ATLAS_PLUGIN_NOT_ENABLED",
            "installed verification requires the Atlas plugin selector to be enabled",
            selector=selector,
        )
    other_enabled = []
    if isinstance(plugins, dict):
        suffix = f"@{marketplace}"
        for selector, settings in plugins.items():
            if selector.endswith(suffix) and selector != f"{PLUGIN_NAME}{suffix}" and isinstance(settings, dict) and settings.get("enabled") is True:
                other_enabled.append(selector)
    if other_enabled:
        raise VerifyError(
            "OTHER_ENABLED_PLUGIN_PRESENT",
            "another plugin is enabled from the requested marketplace",
            selectors=sorted(other_enabled),
        )
    return {
        "path": str(path),
        "source_type": entry.get("source_type"),
        "source": entry.get("source"),
        "ref": ref,
        "last_revision": revision,
        "atlas_enabled": atlas_enabled,
        "other_enabled_plugins": [],
    }


def main(integrity_bin, argv):
    checks = {section: {} for section in SECTIONS}
    errors = []
    try:
        mode, options = parse_arguments(argv)
    except VerifyError as error:
        emit(None, checks, [error_payload(error)], 2)

    try:
        repo = canonical_absolute(options["repo"], "repo")
        codex_home = canonical_absolute(options["codex-home"], "CODEX_HOME_ROOT")
        integrity = canonical_absolute(str(integrity_bin), "atlas-plugin-integrity")
        expected_commit = options["expected-commit"].lower()
        if not FULL_SHA.fullmatch(expected_commit):
            raise VerifyError("EXPECTED_COMMIT_INVALID", "expected commit must be a full 40 or 64 digit SHA")
        if not FULL_SHA.fullmatch(options["base"]):
            raise VerifyError("BASE_COMMIT_INVALID", "base must be a full 40 or 64 digit SHA")
        marketplace = options["marketplace"]
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", marketplace):
            raise VerifyError("MARKETPLACE_NAME_INVALID", "marketplace must be a safe path segment")
        checks["inputs"] = {
            "repo": str(repo),
            "codex_home": str(codex_home),
            "base": options["base"],
            "expected_commit": expected_commit,
            "marketplace": marketplace,
            "expected_source": options["expected-source"],
        }

        top = git(repo, ["rev-parse", "--show-toplevel"]).stdout.strip()
        if top != str(repo):
            raise VerifyError("REPO_ROOT_MISMATCH", "repo must be the exact Git top-level", actual=top)
        head = git(repo, ["rev-parse", "HEAD"]).stdout.strip().lower()
        origin = git(repo, ["rev-parse", "refs/remotes/origin/main"]).stdout.strip().lower()
        dirty = git(repo, ["status", "--porcelain=v1", "--untracked-files=all"]).stdout.strip()
        if dirty:
            raise VerifyError("REPO_DIRTY", "repo must be clean", status=dirty.splitlines())
        if head != expected_commit:
            raise VerifyError("REPO_HEAD_MISMATCH", "repo HEAD does not match expected commit", actual=head)
        if origin != expected_commit:
            raise VerifyError("ORIGIN_MAIN_MISMATCH", "local origin/main does not match expected commit", actual=origin)
        base_commit = git(repo, ["rev-parse", "--verify", f"{options['base']}^{{commit}}"]).stdout.strip().lower()
        if git(repo, ["merge-base", "--is-ancestor", base_commit, head], allow_failure=True).returncode != 0:
            raise VerifyError("BASE_NOT_ANCESTOR", "base must be an ancestor of expected commit", base=base_commit)
        checks["repo"] = {
            "clean": True,
            "head": head,
            "origin_main": origin,
            "base_commit": base_commit,
        }

        manifest_version = load_manifest(repo / PLUGIN_PATH, "repo Atlas plugin")
        release_rc, release_payload = run_integrity(
            integrity,
            ["release", "--repo", str(repo), "--base", base_commit],
        )
        checks["release_identity"] = {
            "version": manifest_version,
            "integrity": release_payload,
        }
        if release_rc != 0 or release_payload.get("ok") is not True:
            raise VerifyError("RELEASE_IDENTITY_INVALID", "Atlas release identity check failed", integrity_errors=release_payload.get("errors", []))
        release_checks = release_payload.get("checks")
        base_version = release_checks.get("base_version") if isinstance(release_checks, dict) else None
        if not isinstance(base_version, str) or not SEMVER.fullmatch(base_version):
            raise VerifyError(
                "RELEASE_BASE_VERSION_INVALID",
                "release identity output must include a strict SemVer base version",
                base_version=base_version,
            )
        release_relation = compare_release_order(manifest_version, base_version)
        checks["release_identity"]["base_version"] = base_version
        checks["release_identity"]["relation_to_base"] = release_relation
        if manifest_version != base_version and release_relation <= 0:
            raise VerifyError(
                "RELEASE_VERSION_DOWNGRADE",
                "target Atlas release version must be newer than its base version",
                base_version=base_version,
                target_version=manifest_version,
            )

        committed_marketplace = read_json_at(repo, expected_commit, MARKETPLACE_PATH, "committed marketplace")
        checks["marketplace_contract"] = validate_marketplace(committed_marketplace, marketplace, "committed marketplace")

        config_path = codex_home / "config.toml"
        checks["marketplace_config"] = validate_config(
            config_path,
            marketplace,
            options["expected-source"],
            expected_commit,
            mode == "installed",
        )

        cache_parent = codex_home / "plugins" / "cache" / marketplace / PLUGIN_NAME
        canonical_absolute(str(cache_parent), "Atlas release cache root")
        installed_versions = []
        if cache_parent.exists():
            if cache_parent.is_symlink() or not cache_parent.is_dir():
                raise VerifyError("CACHE_ROOT_INVALID", "Atlas release cache root must be a real directory")
            for entry in sorted(cache_parent.iterdir(), key=lambda item: os.fsencode(item.name)):
                if entry.name == "latest":
                    raise VerifyError("LATEST_FALLBACK_FORBIDDEN", "latest cache entry is forbidden", path=str(entry))
                if entry.is_symlink() or not entry.is_dir():
                    code = "EXACT_CACHE_SYMLINK_FORBIDDEN" if entry.name == manifest_version and entry.is_symlink() else "INSTALLED_CACHE_ENTRY_INVALID"
                    raise VerifyError(code, "installed version entry must be a real directory", path=str(entry))
                try:
                    installed_manifest_version = load_manifest(entry, f"installed cache {entry.name}")
                except VerifyError as error:
                    raise VerifyError(
                        "INSTALLED_CACHE_MANIFEST_INVALID",
                        "installed cache entry must contain a valid Atlas manifest",
                        path=str(entry),
                        cause=error_payload(error),
                    ) from error
                if installed_manifest_version != entry.name:
                    raise VerifyError(
                        "INSTALLED_CACHE_VERSION_MISMATCH",
                        "installed cache directory name must equal its manifest version",
                        path=str(entry),
                        directory_version=entry.name,
                        manifest_version=installed_manifest_version,
                    )
                relation = compare_release_order(entry.name, manifest_version)
                installed_versions.append({"version": entry.name, "relation_to_expected": relation})
                if relation > 0:
                    raise VerifyError(
                        "RELEASE_DOWNGRADE",
                        "an installed Atlas version is newer than the expected release",
                        installed=entry.name,
                        expected=manifest_version,
                    )
        checks["version_order"] = {
            "expected_version": manifest_version,
            "installed_versions": installed_versions,
        }

        exact_cache = cache_parent / manifest_version
        if exact_cache.exists() and mode == "preflight":
            layout_rc, layout_payload = run_integrity(
                integrity,
                [
                    "layout",
                    "--source", str(repo / PLUGIN_PATH),
                    "--snapshot", str(repo / PLUGIN_PATH),
                    "--cache", str(exact_cache),
                    "--expected-version", manifest_version,
                ],
            )
            checks["exact_cache"] = {"path": str(exact_cache), "present": True, "integrity": layout_payload}
            if layout_rc != 0 or layout_payload.get("ok") is not True:
                raise VerifyError("VERSION_TREE_COLLISION", "existing exact cache differs from the expected Atlas tree", integrity_errors=layout_payload.get("errors", []))
        else:
            checks["exact_cache"] = {"path": str(exact_cache), "present": exact_cache.exists()}

        if mode == "installed":
            snapshot_root = canonical_absolute(str(codex_home / ".tmp" / "marketplaces" / marketplace), "marketplace snapshot")
            snapshot_plugin = snapshot_root / PLUGIN_PATH
            if snapshot_root.is_symlink() or not snapshot_root.is_dir():
                raise VerifyError("SNAPSHOT_MISSING", "marketplace snapshot must be a real directory")
            if snapshot_plugin.is_symlink():
                raise VerifyError(
                    "SNAPSHOT_PLUGIN_SYMLINK_FORBIDDEN",
                    "snapshot Atlas plugin must not be a symbolic link",
                    path=str(snapshot_plugin),
                )
            canonical_absolute(str(snapshot_plugin), "snapshot Atlas plugin")
            if not snapshot_plugin.is_dir():
                raise VerifyError("SNAPSHOT_PLUGIN_MISSING", "snapshot Atlas plugin must be a real directory")
            snapshot_git = snapshot_root / ".git"
            if snapshot_git.is_symlink() or not snapshot_git.is_dir():
                raise VerifyError(
                    "SNAPSHOT_GIT_METADATA_INVALID",
                    "marketplace snapshot must own a real .git directory",
                    path=str(snapshot_git),
                )
            canonical_absolute(str(snapshot_git), "snapshot Git metadata")
            snapshot_top_result = git(snapshot_root, ["rev-parse", "--show-toplevel"], allow_failure=True)
            snapshot_top = snapshot_top_result.stdout.strip()
            if snapshot_top_result.returncode != 0 or snapshot_top != str(snapshot_root):
                raise VerifyError(
                    "SNAPSHOT_GIT_ROOT_MISMATCH",
                    "marketplace snapshot must be its own Git worktree root",
                    expected=str(snapshot_root),
                    actual=snapshot_top or None,
                )
            snapshot_head = git(snapshot_root, ["rev-parse", "HEAD"]).stdout.strip().lower()
            if snapshot_head != expected_commit:
                raise VerifyError("SNAPSHOT_COMMIT_MISMATCH", "snapshot HEAD does not match expected commit", actual=snapshot_head)
            snapshot_status = git(snapshot_root, ["status", "--porcelain=v1", "--untracked-files=all"]).stdout.splitlines()
            unexpected_status = [
                line for line in snapshot_status
                if line != "?? .codex-marketplace-install.json"
            ]
            if unexpected_status:
                raise VerifyError(
                    "SNAPSHOT_DIRTY",
                    "marketplace snapshot contains changes outside its installation sidecar",
                    status=unexpected_status,
                )
            snapshot_marketplace = read_json_file(snapshot_root / MARKETPLACE_PATH, "snapshot marketplace")
            validate_marketplace(snapshot_marketplace, marketplace, "snapshot marketplace")
            checks["snapshot"] = {
                "root": str(snapshot_root),
                "head": snapshot_head,
                "allowed_untracked": [".codex-marketplace-install.json"],
            }

            sidecar_path = snapshot_root / ".codex-marketplace-install.json"
            sidecar = read_json_file(sidecar_path, "marketplace sidecar")
            expected_sidecar = {
                "source_type": "git",
                "source": options["expected-source"],
                "ref_name": expected_commit,
                "revision": expected_commit,
                "sparse_paths": [],
            }
            mismatches = {
                key: {"expected": expected, "actual": sidecar.get(key) if isinstance(sidecar, dict) else None}
                for key, expected in expected_sidecar.items()
                if not isinstance(sidecar, dict) or sidecar.get(key) != expected
            }
            checks["sidecar"] = {"path": str(sidecar_path), "mismatches": mismatches}
            if mismatches:
                raise VerifyError("SIDECAR_MISMATCH", "marketplace sidecar does not match expected commit/source", mismatches=mismatches)

            if exact_cache.is_symlink() or not exact_cache.is_dir():
                code = "EXACT_CACHE_SYMLINK_FORBIDDEN" if exact_cache.is_symlink() else "EXACT_CACHE_MISSING"
                raise VerifyError(code, "exact release cache must be a real directory", path=str(exact_cache))
            layout_rc, layout_payload = run_integrity(
                integrity,
                [
                    "layout",
                    "--source", str(repo / PLUGIN_PATH),
                    "--snapshot", str(snapshot_plugin),
                    "--cache", str(exact_cache),
                    "--expected-version", manifest_version,
                    "--expected-commit", expected_commit,
                ],
            )
            checks["exact_cache"] = {"path": str(exact_cache), "present": True, "integrity": layout_payload}
            if layout_rc != 0 or layout_payload.get("ok") is not True:
                raise VerifyError("INSTALLED_LAYOUT_INVALID", "source, snapshot, and exact cache do not form one release identity", integrity_errors=layout_payload.get("errors", []))

    except VerifyError as error:
        errors.append(error_payload(error))
    except Exception as error:
        errors.append(error_payload(error))
    emit(mode, checks, errors)


main(Path(sys.argv[1]), sys.argv[2:])
PY
