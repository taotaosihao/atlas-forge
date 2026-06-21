#!/usr/bin/env python3
"""Template-driven Multica next-role router.

The router only interprets event facts against a workflow template. It does not
judge PRD fidelity, implementation correctness, or evidence quality.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

try:
    import yaml  # type: ignore
except ImportError:  # pragma: no cover - portability fallback
    yaml = None


DEFAULT_SUCCESS = {"DONE", "PASS", "CLEAN", "READY", "COMPLETE", "COMPLETED"}
DEFAULT_FAILURE = {"FAIL", "FAILED", "BLOCKED", "ERROR"}
DEFAULT_BLOCKER = {"BLOCKER", "MISROUTED_ROLE"}


def load_structured(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    if path.suffix.lower() == ".json" or yaml is None:
        return json.loads(text)
    loaded = yaml.safe_load(text)
    if not isinstance(loaded, dict):
        raise ValueError(f"{path} must load to an object")
    return loaded


def normalize_result(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip().upper().replace("-", "_")


def get_phases(template: dict[str, Any]) -> list[dict[str, Any]]:
    workflow = template.get("workflow", template)
    phases = workflow.get("phases")
    if not isinstance(phases, list):
        raise ValueError("template must contain workflow.phases[]")
    return phases


def get_phase(template: dict[str, Any], phase_name: str) -> dict[str, Any]:
    for phase in get_phases(template):
        if phase.get("phase") == phase_name or phase.get("id") == phase_name:
            return phase
    raise ValueError(f"phase not found in template: {phase_name}")


def result_sets(template: dict[str, Any], phase: dict[str, Any]) -> tuple[set[str], set[str], set[str]]:
    workflow = template.get("workflow", template)
    configured = workflow.get("result_sets", {})
    success = set(map(normalize_result, configured.get("success", DEFAULT_SUCCESS)))
    failure = set(map(normalize_result, configured.get("failure", DEFAULT_FAILURE)))
    blocker = set(map(normalize_result, configured.get("blocker", DEFAULT_BLOCKER)))
    success.update(map(normalize_result, phase.get("success", [])))
    failure.update(map(normalize_result, phase.get("failure", [])))
    blocker.update(map(normalize_result, phase.get("blocker", [])))
    return success, failure, blocker


def role_success_results(template: dict[str, Any], phase: dict[str, Any], role: str) -> set[str]:
    success, _, _ = result_sets(template, phase)
    by_role = phase.get("success_results", {})
    if isinstance(by_role, dict):
        values = by_role.get(role) or by_role.get("*")
        if values:
            return set(map(normalize_result, values))
    return success


def event_role_results(event: dict[str, Any]) -> dict[str, dict[str, Any]]:
    results: dict[str, dict[str, Any]] = {}
    completed = event.get("completed_roles") or event.get("role_results") or {}
    if isinstance(completed, dict):
        for role, value in completed.items():
            if isinstance(value, dict):
                result = normalize_result(value.get("result") or value.get("status"))
                results[str(role)] = {**value, "result": result}
            else:
                results[str(role)] = {"result": normalize_result(value)}
    elif isinstance(completed, list):
        for item in completed:
            if not isinstance(item, dict) or "role" not in item:
                continue
            role = str(item["role"])
            result = normalize_result(item.get("result") or item.get("status"))
            results[role] = {**item, "result": result}

    source_role = event.get("source_role") or event.get("role")
    source_result = normalize_result(event.get("result") or event.get("status"))
    if source_role and source_result:
        role = str(source_role)
        source_record = {
            "result": source_result,
            "commit_sha": event.get("commit_sha"),
            "artifact_type": event.get("artifact_type"),
        }
        results.setdefault(role, source_record)
    return results


def is_success(template: dict[str, Any], phase: dict[str, Any], role: str, result: str) -> bool:
    return normalize_result(result) in role_success_results(template, phase, role)


def stale_reason(event: dict[str, Any], phase: dict[str, Any], role_data: dict[str, Any]) -> str | None:
    role_phase = role_data.get("phase")
    if role_phase and role_phase != phase.get("phase"):
        return "phase_mismatch"

    if not phase.get("commit_sha_required"):
        return None

    event_commit = event.get("commit_sha")
    role_commit = role_data.get("commit_sha")
    if role_commit and event_commit and role_commit != event_commit:
        return "commit_mismatch"
    if not role_commit:
        return "missing_role_commit_sha"
    return None


def route_config(phase: dict[str, Any], name: str) -> dict[str, Any]:
    route = phase.get(name)
    if isinstance(route, dict):
        return route
    return {}


def as_role_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [str(item) for item in value]
    return [str(value)]


def resolve_roles(phase: dict[str, Any], route: dict[str, Any]) -> list[str]:
    roles = route.get("roles")
    if roles is not None:
        return as_role_list(roles)
    roles_from = route.get("roles_from")
    if roles_from:
        return as_role_list(phase.get(str(roles_from)))
    owner = route.get("owner")
    if owner is not None:
        return as_role_list(owner)
    return as_role_list(phase.get("next_roles"))


def build_decision(
    *,
    action: str,
    phase: dict[str, Any],
    route: dict[str, Any],
    event: dict[str, Any],
    reason_code: str,
    reason: str,
    facts: dict[str, Any],
) -> dict[str, Any]:
    next_roles = resolve_roles(phase, route)
    next_phase = route.get("phase") or phase.get("next_phase") or phase.get("phase")
    if action == "wait":
        next_roles = []
        next_phase = phase.get("phase")

    leader_required = "leader" in {role.lower() for role in next_roles}
    roles_hash = hashlib.sha256(
        json.dumps(sorted(next_roles), separators=(",", ":")).encode("utf-8")
    ).hexdigest()[:16]
    source_id = (
        event.get("source_comment_id")
        or event.get("comment_id")
        or event.get("source_run_id")
        or event.get("run_id")
        or event.get("task_id")
        or "unknown-source"
    )
    dedupe_fields = {
        "issue_id": event.get("issue_id") or event.get("issue") or "unknown-issue",
        "phase": phase.get("phase"),
        "commit_sha": event.get("commit_sha") or "unknown-commit",
        "source_id": source_id,
        "next_roles_hash": roles_hash,
    }
    dedupe_key = hashlib.sha256(
        json.dumps(dedupe_fields, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()

    return {
        "action": action,
        "next_phase": next_phase,
        "next_roles": next_roles,
        "leader_required": leader_required,
        "reason_code": reason_code,
        "reason": reason,
        "facts": facts,
        "dedupe_key": dedupe_key,
        "dedupe_fields": dedupe_fields,
    }


def route(template: dict[str, Any], event: dict[str, Any]) -> dict[str, Any]:
    phase_name = event.get("phase")
    if not phase_name:
        raise ValueError("event.phase is required")
    phase = get_phase(template, str(phase_name))
    required_roles = as_role_list(phase.get("required_roles"))
    optional_roles = as_role_list(phase.get("optional_roles"))
    role_results = event_role_results(event)
    _, failure_results, blocker_results = result_sets(template, phase)
    commit_required = bool(phase.get("commit_sha_required"))
    commit_sha = event.get("commit_sha")
    source_result = normalize_result(event.get("result") or event.get("status"))
    timed_out = bool(event.get("timeout")) or source_result == "TIMEOUT"
    join_policy = str(phase.get("join_policy", "all_required"))
    stale_roles = {
        role: stale
        for role, data in role_results.items()
        if (stale := stale_reason(event, phase, data))
    }
    current_role_results = {
        role: data
        for role, data in role_results.items()
        if role not in stale_roles or stale_roles[role] == "missing_role_commit_sha"
    }
    facts = {
        "phase": phase.get("phase"),
        "artifact_type": event.get("artifact_type"),
        "commit_sha": commit_sha,
        "join_policy": join_policy,
        "required_roles": required_roles,
        "optional_roles": optional_roles,
        "role_results": role_results,
        "stale_roles": stale_roles,
    }

    if timed_out:
        route_def = route_config(phase, "timeout_action") or {"roles_from": "blocker_owner"}
        return build_decision(
            action=str(route_def.get("action", "dispatch")),
            phase=phase,
            route=route_def,
            event=event,
            reason_code="timeout",
            reason=str(route_def.get("reason", "Phase timed out.")),
            facts=facts,
        )

    blocker_roles = [
        role for role, data in current_role_results.items()
        if normalize_result(data.get("result")) in blocker_results
    ]
    failed_roles = [
        role for role, data in current_role_results.items()
        if normalize_result(data.get("result")) in failure_results
    ]
    passed_required = [
        role for role in required_roles
        if (
            role in role_results
            and role not in stale_roles
            and is_success(template, phase, role, role_results[role].get("result", ""))
        )
    ]
    missing_required = [role for role in required_roles if role not in passed_required]
    facts.update({
        "passed_required": passed_required,
        "missing_required": missing_required,
        "failed_roles": failed_roles,
        "blocker_roles": blocker_roles,
    })

    if commit_required and not commit_sha:
        route_def = route_config(phase, "on_blocker") or {"roles_from": "blocker_owner"}
        return build_decision(
            action=str(route_def.get("action", "dispatch")),
            phase=phase,
            route=route_def,
            event=event,
            reason_code="missing_commit_sha",
            reason="Template requires commit_sha for this phase.",
            facts=facts,
        )

    if blocker_roles:
        route_def = route_config(phase, "on_blocker") or {"roles_from": "blocker_owner"}
        return build_decision(
            action=str(route_def.get("action", "dispatch")),
            phase=phase,
            route=route_def,
            event=event,
            reason_code="blocker",
            reason=str(route_def.get("reason", "A role reported BLOCKER.")),
            facts=facts,
        )

    if failed_roles:
        route_def = route_config(phase, "on_failure") or {"roles_from": "repair_owner", "phase": "repair"}
        if not resolve_roles(phase, route_def):
            route_def = route_config(phase, "on_blocker") or {"roles_from": "blocker_owner"}
            reason_code = "repair_owner_unknown"
        else:
            reason_code = "failure"
        return build_decision(
            action=str(route_def.get("action", "dispatch")),
            phase=phase,
            route=route_def,
            event=event,
            reason_code=reason_code,
            reason=str(route_def.get("reason", "A role reported failure.")),
            facts=facts,
        )

    if join_policy == "any_blocker":
        route_def = route_config(phase, "on_join_wait") or {"action": "wait"}
        return build_decision(
            action=str(route_def.get("action", "wait")),
            phase=phase,
            route=route_def,
            event=event,
            reason_code="no_blocker_observed",
            reason=str(route_def.get("reason", "No blocker observed yet.")),
            facts=facts,
        )

    if missing_required:
        route_def = route_config(phase, "on_join_wait") or {"action": "wait"}
        reason_code = "stale_required_result" if stale_roles else "join_waiting"
        return build_decision(
            action=str(route_def.get("action", "wait")),
            phase=phase,
            route=route_def,
            event=event,
            reason_code=reason_code,
            reason=str(route_def.get("reason", "Waiting for required roles.")),
            facts=facts,
        )

    route_def = route_config(phase, "on_join_complete") or {
        "action": "dispatch",
        "phase": phase.get("next_phase"),
        "roles": phase.get("next_roles"),
    }
    return build_decision(
        action=str(route_def.get("action", "dispatch")),
        phase=phase,
        route=route_def,
        event=event,
        reason_code="join_complete",
        reason=str(route_def.get("reason", "Required roles completed.")),
        facts=facts,
    )


def load_dedupe_keys(path: Path) -> set[str]:
    if not path.exists():
        return set()
    keys: set[str] = set()
    for raw in path.read_text(encoding="utf-8").splitlines():
        raw = raw.strip()
        if not raw:
            continue
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            keys.add(raw)
        else:
            if isinstance(parsed, dict) and parsed.get("dedupe_key"):
                keys.add(str(parsed["dedupe_key"]))
    return keys


def append_dedupe_key(path: Path, decision: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps({
            "dedupe_key": decision["dedupe_key"],
            "dedupe_fields": decision["dedupe_fields"],
        }, sort_keys=True) + "\n")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--template", required=True, type=Path)
    parser.add_argument("--event", required=True, type=Path)
    parser.add_argument("--dedupe-store", type=Path)
    parser.add_argument("--record-dedupe", action="store_true")
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args(argv)

    try:
        template = load_structured(args.template)
        event = load_structured(args.event)
        decision = route(template, event)
        if args.dedupe_store:
            keys = load_dedupe_keys(args.dedupe_store)
            if decision["dedupe_key"] in keys:
                decision = {**decision, "action": "duplicate", "reason_code": "duplicate"}
            elif args.record_dedupe and decision["action"] == "dispatch":
                append_dedupe_key(args.dedupe_store, decision)
        print(json.dumps(decision, indent=2 if args.pretty else None, sort_keys=True))
        return 0
    except Exception as exc:
        print(json.dumps({"action": "error", "error": str(exc)}, sort_keys=True), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
