#!/usr/bin/env bash
set -euo pipefail

ATLAS_FORGE_ROOT="${ATLAS_FORGE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
skill_root="$ATLAS_FORGE_ROOT/plugins/atlas-workflow/skills/product-design"
skills_root="$ATLAS_FORGE_ROOT/plugins/atlas-workflow/skills"
manifest="$ATLAS_FORGE_ROOT/plugins/atlas-workflow/.codex-plugin/plugin.json"
readme="$ATLAS_FORGE_ROOT/plugins/atlas-workflow/README.md"

fail() {
  printf 'product-design contract failed: %s\n' "$1" >&2
  exit 1
}

for path in \
  "$skill_root/SKILL.md" \
  "$skill_root/references/method-adapter.md" \
  "$skill_root/references/upstream-provenance.md" \
  "$skill_root/assets/A-product-context.template.md" \
  "$skill_root/assets/C-critical-scenario.template.md" \
  "$skill_root/assets/D-flow-design.template.md" \
  "$skill_root/assets/E-design-handoff.template.md" \
  "$skill_root/vendor/wds/.gitattributes" \
  "$skill_root/vendor/wds/LICENSE" \
  "$skill_root/vendor/wds/SOURCES.json"; do
  test -f "$path" || fail "missing $path"
done

python3 - "$skill_root/SKILL.md" <<'PY'
import pathlib
import sys
import yaml

def check(condition, message):
    if not condition:
        raise SystemExit(message)

text = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
check(text.startswith("---\n"), "SKILL.md missing YAML frontmatter")
frontmatter = text.split("---\n", 2)[1]
metadata = yaml.safe_load(frontmatter)
check(list(metadata) == ["name", "description"], "frontmatter must contain only name and description")
check(metadata["name"] == "product-design", "unexpected skill name")
check("user-visible" in metadata["description"], "description lacks user-visible trigger")
check(len(text.splitlines()) < 500, "SKILL.md exceeds 500 lines")
PY

a_template="$skill_root/assets/A-product-context.template.md"
c_template="$skill_root/assets/C-critical-scenario.template.md"
d_template="$skill_root/assets/D-flow-design.template.md"
e_template="$skill_root/assets/E-design-handoff.template.md"
for field in designed_feature_target allowed_claims primary_user critical_transaction critical_object durable_outcome data_profile source_refs assumptions context_identity; do
  rg -q "^${field}:" "$a_template" || fail "A missing $field"
done
for field in status source_refs content_identity approval_ref; do
  rg -q "^${field}:" "$c_template" || fail "C missing $field"
done
test "$(rg -c '^## [1-8]\.' "$c_template")" = 8 || fail "C must contain eight questions"
rg -q 'Natural entry' "$c_template"
rg -q 'durable outcome' "$c_template"
rg -q 'Refresh or re-entry and one failure recovery' "$c_template"
for field in status context_ref scenario_ref approved_context_identity approved_scenario_identity approved_flow_identity source_refs approval_ref; do
  rg -q "^${field}:" "$d_template" || fail "D missing $field"
done
test "$(rg -c '^## [1-7]\.' "$d_template")" = 7 || fail "D must contain seven sections"
rg -q 'Target form factor / primary viewport' "$d_template"
rg -q 'desktop-only.*not applicable' "$d_template"
test "$(rg -c '^-' "$d_template" | tail -1)" -ge 3 || fail "D accessibility baseline missing"
for field in status context_ref scenario_ref flow_ref context_identity scenario_identity flow_identity scenario_approval_ref flow_approval_ref; do
  rg -q "^${field}:" "$e_template" || fail "E missing $field"
done

adapter="$skill_root/references/method-adapter.md"
design_review="$skills_root/design-review/SKILL.md"
rg -q 'fixed key order' "$adapter"
rg -q 'UTF-8 canonical JSON followed by one LF' "$adapter"
rg -q 'approved_context_identity' "$adapter"
rg -q 'approved_scenario_identity' "$adapter"
rg -q 'approved_flow_identity' "$adapter"
rg -q 'draft/non-executable' "$adapter"
rg -q 'exploration.*product_release' "$adapter"
rg -q 'product_increment' "$adapter"
rg -q 'never creates release evidence' "$adapter"
rg -q 'Agent judgment, tests, silence' "$adapter"
rg -q 'implementation-bug' "$adapter"
rg -q 'spec-gap.*acceptance-gap.*prd-conflict' "$adapter"
rg -q 'scope-change' "$adapter"
rg -q 'product_increment' "$skill_root/SKILL.md"
rg -q 'must omit release-intent, v4, immutable Profile, release' "$skill_root/SKILL.md"
rg -q '证据采集：降级' "$skill_root/SKILL.md"

python3 - "$skill_root/SKILL.md" "$adapter" "$d_template" "$design_review" <<'PY'
import pathlib, sys, yaml

paths = map(pathlib.Path, sys.argv[1:])
skill, adapter, d_template, review = (path.read_text(encoding="utf-8") for path in paths)
skill_flat, adapter_flat, d_flat, review_flat = (" ".join(text.split()) for text in (skill, adapter, d_template, review))

def check(condition, message): assert condition, message

baseline = skill.split("### Route an operable Baseline only when needed", 1)[1].split("## Create and validate E", 1)[0]
baseline_flat = " ".join(baseline.split())
for phrase in (
    "Reuse current A/C/D/E from the same task", "existing pages, UI components and code, optional", "direct reuse, a small adaptation, composition of existing",
    "An operable real Baseline is required when any one of these is true", "actual platform or application behavior", "explicitly asks to operate a real page or application",
    "independent trigger even when text, static layout, or an isolated prototype could answer", "separately verify exact product-path, local-runtime, and local-candidate-commit authority",
    "existing real entrypoint's focus", "Applicable acceptance requires a real interaction observation", "new page, a lack of an already approved page, or the fact that a direction was chosen does not",
    "least costly evidence", "Skip it only when no condition above requires it",
    "one bounded, single-writer direct Task", "sole pre-E implementation exception", "final page shells, components, and source files",
    "existing mock/fixture/adapter, existing", "synthetic`, `authorized_test`, and `mixed`", "page-specific adjustment, design-semantics", "D sections 3 and 7", "Only then request the existing",
):
    check(phrase in skill_flat, f"Product Design UX contract phrase missing: {phrase}")
for phrase in ("When a Baseline is required, keep D draft", "edits to the exact product paths, starting the local runtime, and creating a local candidate commit", "ask once for that bounded implementation authority and stop", "Web requires a real HTTP server", "non-Web requires the real application/window", "Do not connect real write side effects", "first freeze an isolatable exact candidate commit", "then start the actual entrypoint from that commit"):
    check(phrase in baseline_flat, f"bounded Baseline rule missing: {phrase}")
check(baseline_flat.index("first freeze an isolatable exact candidate commit") < baseline_flat.index("then start the actual entrypoint from that commit"), "candidate commit must precede entrypoint start")
check("explicitly asks to operate a real page or application, and the operation is needed" not in baseline_flat, "real-page request must be an independent Baseline trigger")
triggers = baseline.split("An operable real Baseline is required when any one of these is true:", 1)[1].split("A new page,", 1)[0]
check(len([line for line in triggers.splitlines() if line[:1].isdigit()]) == 4, "Baseline must have exactly four trigger items")
skip = "Skip it only when no condition above requires it, the selected lower-fidelity evidence or stable reference answers the recorded question, the adaptation is local and known, and the critical journey, hierarchy, primary action, and recovery remain unchanged."
check(skip in baseline_flat, "Baseline skips must first exclude every required trigger")

c_section = skill.split("## Build A and C", 1)[1].split("## Build D and obtain Gate 2", 1)[0]
d_section = skill.split("## Build D and obtain Gate 2", 1)[1].split("### Route an operable Baseline only when needed", 1)[0]
check("[Route an operable Baseline only when needed](#route-an-operable-baseline-only-when-needed)" in d_section,
      "adaptations must use the shared Baseline decision before implementation routing")
check("directly to Task without a Baseline" not in " ".join(d_section.split()),
      "small adaptations must not bypass required Baseline triggers")
combined_phrases = (
    "constrained combined-gate drafting path may start with D absent or incomplete",
    "approval authority, current A/C identities, permission range, and business outcome are clear",
    "Before requesting either approval, derive the D identity and present the complete current C and D together",
    "no rejection, known conflict, blocker, or high-cost user decision", "both C and D remain `draft`",
    "no C/D `approval_ref`", "no D `approved_*` binding", "enter no product implementation",
    "If a real Baseline needs code, use only the explicitly authorized D-draft Baseline exception",
    "One current explicit reply may", "two separate approval bindings", "never manufacture missing identity or permission",
)
c_flat = " ".join(c_section.split()).lower()
for phrase in combined_phrases:
    check(phrase.lower() in c_flat, f"C combined-gate rule missing: {phrase}")
for label, text, reference in (
    ("D", d_section, "[Build A and C](#build-a-and-c)"),
    ("adapter", adapter, "[Build A and C in `SKILL.md`](../SKILL.md#build-a-and-c)"),
):
    check(reference in text, f"{label} must reference the shared combined-gate conditions")
for phrase in ("unknown business or permission/safety", "known conflict", "blocker"):
    check(phrase.lower() in c_flat, f"C combined-gate stop condition missing: {phrase}")

for phrase in (
    "authoritative only for artifact structure, identity, approval binding, invalidation, and handoff validation", "`SKILL.md` is authoritative for operational routing, including Baseline trigger/skip/sequence",
    "One current explicit reply may cover the presented C and D", "two separate approval bindings for C and D",
    "Mocks may replace data and responses but never create capability", "only implementation allowed before valid E",
    "Every other implementation route still requires valid E", "Design approval itself grants no implementation or commit authority",
    "At convergence, apply the final design decisions once",
):
    check(phrase in adapter_flat, f"method adapter UX contract phrase missing: {phrase}")
check("A Baseline is required when" not in adapter_flat, "adapter duplicates the Baseline decision tree")

for phrase in (
    "authoritative path or explicitly approved feasible bounded side-effect plan", "Evidence level (text rehearsal, static layout, interaction prototype, real Baseline, or reused reference)",
    "Final candidate commit and actual entrypoint", "Allowed engineering adjustments after handoff", "展示建议", "完整验收", "readback/export", "Operated steps and user confirmation reference",
):
    check(phrase in d_flat, f"D Baseline binding missing: {phrase}")
parts = d_template.split("---\n", 2)
check(len(parts) == 3, "D template frontmatter malformed")
check(list(yaml.safe_load(parts[1])) == [
    "status", "context_ref", "scenario_ref", "approved_context_identity", "approved_scenario_identity",
    "approved_flow_identity", "source_refs", "approval_ref",
], "D template schema changed")

for phrase in (
    "read the approved D and E", "form factor/viewport, states,", "Mark mobile not applicable when D", "Review the current candidate by default",
    "historical Baseline only for a named dispute", "real browser cannot operate the entrypoint, keep the review non-passing", "Only the literal value `passed`",
    "Missing, unknown, unparsable, or any other value", "task `done`, build/test results, and screenshots cannot",
):
    check(phrase in review_flat, f"Design Review truth phrase missing: {phrase}")

for text, phrase in (
    (skill, "Baseline is required only when all"), (skill, "Skip it when any"),
    (skill, "third design approval"), (adapter, "A Baseline is required when"),
    (review, "task `done` permits"), (review, "screenshots can infer"),
):
    check(phrase not in text, f"opposite UX rule present: {phrase}")
PY

python3 - "$adapter" "$a_template" "$c_template" "$d_template" "$e_template" <<'PY'
import copy
import hashlib
import json
import pathlib
import sys
import tempfile
import yaml

adapter_path, a_path, c_path, d_path, e_path = map(pathlib.Path, sys.argv[1:])

def check(condition, message):
    if not condition:
        raise SystemExit(message)

def split_document(path):
    text = path.read_text(encoding="utf-8")
    check(text.startswith("---\n"), f"missing frontmatter: {path}")
    parts = text.split("---\n", 2)
    check(len(parts) == 3, f"malformed frontmatter: {path}")
    metadata = yaml.safe_load(parts[1])
    check(isinstance(metadata, dict), f"frontmatter is not a mapping: {path}")
    return metadata, parts[2]

def write_document(path, metadata, body):
    with path.open("w", encoding="utf-8", newline="\n") as stream:
        stream.write("---\n" + yaml.safe_dump(metadata, sort_keys=False, allow_unicode=True) + "---\n" + body)

def canonical_a(metadata):
    keys = ("designed_feature_target", "allowed_claims", "critical_object", "data_profile")
    check(all(key in metadata for key in keys), "A identity projection field missing")
    projected = {key: metadata[key] for key in keys}
    payload = json.dumps(projected, ensure_ascii=False, separators=(",", ":")) + "\n"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()

def normalize_body(body):
    normalized = body.replace("\r\n", "\n").replace("\r", "\n")
    normalized = "\n".join(line.rstrip() for line in normalized.split("\n")).strip("\n") + "\n"
    return normalized

def body_identity(body):
    return hashlib.sha256(normalize_body(body).encode("utf-8")).hexdigest()

adapter = adapter_path.read_text(encoding="utf-8")
projection_literal = '{"designed_feature_target":"...","allowed_claims":[],"critical_object":"...","data_profile":"..."}'
check(projection_literal in adapter, "adapter does not bind the fixed A projection")
for phrase in (
    "fixed key order",
    "UTF-8 canonical JSON followed by one LF",
    "append exactly one LF",
    "remove trailing spaces on each line plus leading/trailing blank",
    "E identities equal current A, C, and D identities",
    "D `approved_context_identity` equals current A `context_identity`",
    "D `approved_scenario_identity` equals current C `content_identity`",
    "D `approved_flow_identity` equals current derived D identity",
    "C and D contain valid, current `approval_ref` values",
    "No blocking open question or known conflict remains",
):
    check(phrase in adapter, f"adapter contract phrase missing: {phrase}")

a_template, a_body = split_document(a_path)
c_template, c_body = split_document(c_path)
d_template, d_body = split_document(d_path)
e_template, e_body = split_document(e_path)
check(set(("designed_feature_target", "allowed_claims", "critical_object", "data_profile")) <= set(a_template), "A template projection fields missing")
check(set(("content_identity", "approval_ref")) <= set(c_template), "C template identity fields missing")
check(set(("approved_context_identity", "approved_scenario_identity", "approved_flow_identity", "approval_ref")) <= set(d_template), "D template approval fields missing")
check(set(("context_identity", "scenario_identity", "flow_identity", "scenario_approval_ref", "flow_approval_ref")) <= set(e_template), "E template identity fields missing")

known_a = {
    "designed_feature_target": "exploration",
    "allowed_claims": ["operator can save and reopen an item"],
    "critical_object": "saved item",
    "data_profile": "synthetic",
}
check(canonical_a(known_a) == "b3dea6a789b454a00de8f66fd42e13bccc0dac2ae37d5d2d87922058a91f11c4", "A known-answer identity mismatch")
check(body_identity(c_body) == "1fa087ccbfb1e673889f2a0f9747ac6e398aaead23bc84640507a02450b2d15f", "C normalization known-answer mismatch")
check(body_identity(d_body) == "89093413afbcb79e301970d56f5d5e2ffd21d78046edfa1a4f2b4dd57c412bf6", "D normalization known-answer mismatch")

def read_artifacts(root):
    result = {}
    for key, name in (("a", "A-product-context.md"), ("c", "C-critical-scenario.md"), ("d", "D-flow-design.md"), ("e", "E-design-handoff.md")):
        result[key] = split_document(root / name)
    return result

def executable(root, blockers=()):
    artifacts = read_artifacts(root)
    a_meta, _ = artifacts["a"]
    c_meta, c_current_body = artifacts["c"]
    d_meta, d_current_body = artifacts["d"]
    e_meta, _ = artifacts["e"]
    current = {
        "a": canonical_a(a_meta),
        "c": body_identity(c_current_body),
        "d": body_identity(d_current_body),
    }
    e_bound = {
        "a": e_meta.get("context_identity"),
        "c": e_meta.get("scenario_identity"),
        "d": e_meta.get("flow_identity"),
    }
    d_bound = {
        "a": d_meta.get("approved_context_identity"),
        "c": d_meta.get("approved_scenario_identity"),
        "d": d_meta.get("approved_flow_identity"),
    }
    approvals_valid = bool(c_meta.get("approval_ref")) and bool(d_meta.get("approval_ref"))
    approval_refs_match = (
        e_meta.get("scenario_approval_ref") == c_meta.get("approval_ref")
        and e_meta.get("flow_approval_ref") == d_meta.get("approval_ref")
    )
    release_approval = a_meta.get("designed_feature_target") != "product_release" or d_meta.get("approval_ref") == "current-user-flow-approval"
    return e_bound == current and d_bound == current and approvals_valid and approval_refs_match and not blockers and release_approval

with tempfile.TemporaryDirectory(prefix="atlas-product-design-contract-") as temp_dir:
    root = pathlib.Path(temp_dir)
    a_meta = copy.deepcopy(a_template)
    a_meta.update({
        "designed_feature_target": "exploration",
        "allowed_claims": ["operator can save and reopen an item"],
        "primary_user": "operator",
        "critical_transaction": "save item",
        "critical_object": "saved item",
        "durable_outcome": "saved item remains available after refresh",
        "data_profile": "synthetic",
        "source_refs": ["./request.md"],
        "assumptions": ["operator is authorized"],
    })
    a_meta["context_identity"] = canonical_a(a_meta)
    c_meta = copy.deepcopy(c_template)
    c_meta.update({"status": "approved", "content_identity": body_identity(c_body), "approval_ref": "current-scenario-approval"})
    d_meta = copy.deepcopy(d_template)
    d_meta.update({
        "status": "approved",
        "approved_context_identity": a_meta["context_identity"],
        "approved_scenario_identity": c_meta["content_identity"],
        "approved_flow_identity": body_identity(d_body),
        "approval_ref": "current-exploration-flow-approval",
    })
    e_meta = copy.deepcopy(e_template)
    e_meta.update({
        "status": "approved",
        "context_identity": a_meta["context_identity"],
        "scenario_identity": c_meta["content_identity"],
        "flow_identity": d_meta["approved_flow_identity"],
        "scenario_approval_ref": c_meta["approval_ref"],
        "flow_approval_ref": d_meta["approval_ref"],
    })
    write_document(root / "A-product-context.md", a_meta, a_body)
    write_document(root / "C-critical-scenario.md", c_meta, c_body)
    write_document(root / "D-flow-design.md", d_meta, d_body)
    write_document(root / "E-design-handoff.md", e_meta, e_body)
    check(executable(root), "valid exploration handoff rejected")
    check(not executable(root, blockers=("known conflict",)), "blocking conflict did not fail closed")

    for field, replacement in {
        "designed_feature_target": "product_release",
        "allowed_claims": ["operator can save, reopen, and archive an item"],
        "critical_object": "archived item",
        "data_profile": "authorized_test",
    }.items():
        changed = copy.deepcopy(a_meta)
        changed[field] = replacement
        changed["context_identity"] = canonical_a(changed)
        write_document(root / "A-product-context.md", changed, a_body)
        check(not executable(root), f"A mutation did not invalidate E: {field}")
        write_document(root / "A-product-context.md", a_meta, a_body)

    release_meta = copy.deepcopy(a_meta)
    release_meta["designed_feature_target"] = "product_release"
    release_meta["context_identity"] = canonical_a(release_meta)
    write_document(root / "A-product-context.md", release_meta, a_body)
    check(not executable(root), "exploration approval promoted to product_release")
    write_document(root / "A-product-context.md", a_meta, a_body)

    write_document(root / "C-critical-scenario.md", c_meta, c_body + "\nTampered scenario.\n")
    check(not executable(root), "C body tamper did not invalidate E")
    write_document(root / "C-critical-scenario.md", c_meta, c_body)
    write_document(root / "D-flow-design.md", d_meta, d_body + "\nTampered flow.\n")
    check(not executable(root), "D body tamper did not invalidate E")
    write_document(root / "D-flow-design.md", d_meta, d_body)

    for field in ("context_identity", "scenario_identity", "flow_identity"):
        stale = copy.deepcopy(e_meta)
        stale[field] = "0" * 64
        write_document(root / "E-design-handoff.md", stale, e_body)
        check(not executable(root), f"stale E identity accepted: {field}")
        write_document(root / "E-design-handoff.md", e_meta, e_body)

    missing_c = copy.deepcopy(c_meta)
    missing_c["approval_ref"] = ""
    write_document(root / "C-critical-scenario.md", missing_c, c_body)
    check(not executable(root), "missing C approval accepted")
    write_document(root / "C-critical-scenario.md", c_meta, c_body)
    missing_d = copy.deepcopy(d_meta)
    missing_d["approval_ref"] = ""
    write_document(root / "D-flow-design.md", missing_d, d_body)
    check(not executable(root), "missing D approval accepted")
    write_document(root / "D-flow-design.md", d_meta, d_body)
    check(executable(root), "restored valid handoff rejected")
PY

office="$skills_root/office-hours/SKILL.md"
brainstorm="$skills_root/brainstorm/SKILL.md"
task="$skills_root/task/SKILL.md"
clarify="$skills_root/clarify/SKILL.md"
for path in "$office" "$brainstorm" "$task" "$clarify"; do
  rg -q 'atlas-workflow:product-design' "$path" || fail "missing inbound route in $path"
done
rg -q 'direction is chosen.*scenario or user-operable flow is not approved' "$office"
rg -q 'direction is chosen.*primary scenario or surface flow is not approved' "$brainstorm"
rg -q 'direction is chosen.*user-visible feature.*primary scenario or user-operable flow lacks current approval' "$task"
rg -q 'same task' "$clarify"
rg -U -q 'recomputing current A `context_identity`,\s+C `content_identity` and D flow identity' "$clarify"
rg -U -q 'D to store\s+all three approved identities' "$clarify"
rg -q 'current C and D approval references' "$clarify"
rg -q 'and no blocker' "$clarify"
rg -q 'With valid current approval and unchanged bindings, reuse the design without reopening it' "$clarify"
rg -q 'keep the handoff non-executable instead of redesigning the whole feature' "$clarify"
rg -q 'For new or changed semantics, return only the affected decision' "$clarify"
rg -q 'Business decisions and their current machine binding are distinct' "$adapter"
node --test "$ATLAS_FORGE_ROOT/workflow/tests/js/product-design-handoff-reuse.test.js"
for path in "$office" "$brainstorm" "$task" "$clarify"; do
  rg -qi 'backend' "$path" || fail "missing backend negative route in $path"
  rg -q 'CLI' "$path" || fail "missing CLI negative route in $path"
  rg -qi 'tiny' "$path" || fail "missing tiny negative route in $path"
done

rg -q 'atlas-workflow:product-design' "$readme"
rg -q 'flow-and-surface' "$readme"
rg -q 'not a complete visual designer' "$readme"
rg -q 'do not certify, install, deploy, publish, or release' "$readme"
python3 - "$manifest" <<'PY'
import json
import pathlib
import re
import sys

def check(condition, message):
    if not condition:
        raise SystemExit(message)

manifest = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
check(re.fullmatch(r"0\.1\.0\+codex\.\d{14}", manifest.get("version", "")) is not None, "manifest version is not a legal Atlas cachebuster SemVer")
check("product-design" in manifest["keywords"], "manifest lacks product-design keyword")
check("flow-and-surface" in manifest["interface"]["longDescription"], "manifest lacks flow-and-surface boundary")
check("do not certify" in manifest["interface"]["longDescription"], "manifest lacks non-certification statement")
PY

if rg -q '\.source' "$skill_root/SKILL.md" "$adapter" "$skill_root/assets"; then
  fail "ordinary runtime resource references vendored source"
fi

python3 - "$skill_root/vendor/wds/SOURCES.json" "$skill_root/vendor/wds" "7043b5a78c92e5e9859c0fba740177feb95a3b59954cc7d241d39fe0388b428c" <<'PY'
import hashlib
import json
import pathlib
import sys

index_path = pathlib.Path(sys.argv[1])
vendor_root = pathlib.Path(sys.argv[2])
expected_index_digest = sys.argv[3]

def check(condition, message):
    if not condition:
        raise SystemExit(message)

index_bytes = index_path.read_bytes()
check(hashlib.sha256(index_bytes).hexdigest() == expected_index_digest, "SOURCES.json immutable anchor mismatch")
index = json.loads(index_bytes.decode("utf-8"))
check(index["schema_version"] == 1, "unexpected SOURCES schema")
check(index["repository"] == "https://github.com/bmad-code-org/bmad-method-wds-expansion", "unexpected WDS repository")
check(index["commit"] == "cc16f09fcfab26d35635af1491f36a38a8431c8d", "unexpected WDS commit")
check(index["version"] == "0.4.3", "unexpected WDS version")
check(len(index["files"]) == 16, "unexpected indexed WDS file count")
check(sum(item["byte_size"] for item in index["files"]) == 103526, "unexpected indexed WDS byte total")
check({item["group"] for item in index["files"]} == {"simplified-brief", "trigger-mapping", "ux-scenario", "ux-design"}, "unexpected WDS groups")

expected_paths = {
    "src/workflows/wds-1-project-brief/steps-c/step-00-simplified-brief.md",
    "src/workflows/wds-1-project-brief/templates/simplified-brief.template.md",
    "src/workflows/wds-2-trigger-mapping/steps-c/step-00a-documentation-synthesis.md",
    "src/workflows/wds-2-trigger-mapping/steps-c/step-00b-business-goals-extract.md",
    "src/workflows/wds-2-trigger-mapping/steps-c/step-00c-target-groups-extract.md",
    "src/workflows/wds-2-trigger-mapping/steps-c/step-00d-driving-forces-extract.md",
    "src/workflows/wds-2-trigger-mapping/templates/trigger-map.template.md",
    "src/workflows/wds-3-scenarios/steps-c/step-05-outline-scenario.md",
    "src/workflows/wds-3-scenarios/data/scenario-outline-template.md",
    "src/workflows/wds-3-scenarios/data/quality-checklist.md",
    "src/workflows/wds-4-ux-design/workflow-dream.md",
    "src/workflows/wds-4-ux-design/steps-p/step-05-interactions.md",
    "src/workflows/wds-4-ux-design/steps-p/step-06-states.md",
    "src/workflows/wds-4-ux-design/templates/page-specification.template.md",
    "src/workflows/wds-4-ux-design/data/specification-audit-workflow.md",
    "src/workflows/wds-4-ux-design/data/page-creation-flows/flow-c-ascii.md",
}
check({item["upstream_path"] for item in index["files"]} == expected_paths, "indexed upstream paths differ from fixed selection")

def verify(path, size, digest):
    data = path.read_bytes()
    check(len(data) == size, f"byte size mismatch: {path}")
    check(hashlib.sha256(data).hexdigest() == digest, f"digest mismatch: {path}")

license_record = index["license"]
verify(vendor_root / license_record["path"], license_record["byte_size"], license_record["sha256"])
check(license_record["byte_size"] == 1366, "unexpected License size")
check(license_record["sha256"] == "6f4fea8494bfb466af2605ae428e8544510135240f3502da24f6f62c5b5cdf24", "unexpected License digest")
indexed_vendored = {item["vendored_path"] for item in index["files"]}
actual_vendored = {path.relative_to(vendor_root).as_posix() for path in (vendor_root / "files").glob("**/*.source")}
check(actual_vendored == indexed_vendored, f"vendored source set differs from index: missing={sorted(indexed_vendored - actual_vendored)} extra={sorted(actual_vendored - indexed_vendored)}")
for item in index["files"]:
    check(item["vendored_path"] == "files/" + item["upstream_path"] + ".source", f"vendored path does not preserve full upstream path: {item['upstream_path']}")
    verify(vendor_root / item["vendored_path"], item["byte_size"], item["sha256"])
PY

rg -Fxq 'files/**/*.source -text -diff' "$skill_root/vendor/wds/.gitattributes"

real_index="$(git -C "$ATLAS_FORGE_ROOT" rev-parse --git-path index)"
temporary_index="$(mktemp)"
trap 'rm -f "$temporary_index"' EXIT
if [[ -f "$real_index" ]]; then
  cp "$real_index" "$temporary_index"
else
  GIT_INDEX_FILE="$temporary_index" git -C "$ATLAS_FORGE_ROOT" read-tree HEAD
fi
GIT_INDEX_FILE="$temporary_index" git -C "$ATLAS_FORGE_ROOT" add -- \
  plugins/atlas-workflow/skills/product-design \
  plugins/atlas-workflow/skills/office-hours/SKILL.md \
  plugins/atlas-workflow/skills/brainstorm/SKILL.md \
  plugins/atlas-workflow/skills/task/SKILL.md \
  plugins/atlas-workflow/skills/clarify/SKILL.md \
  plugins/atlas-workflow/README.md \
  plugins/atlas-workflow/.codex-plugin/plugin.json \
  workflow/tests/contract_product_design_skill.sh \
  workflow/tests/contract.sh
GIT_INDEX_FILE="$temporary_index" git -C "$ATLAS_FORGE_ROOT" diff --cached --check

test -f "$ATLAS_FORGE_ROOT/workflow/templates/design-review-verdict.json"
rg -q '"hard_failures": \[\]' "$ATLAS_FORGE_ROOT/workflow/templates/design-review-verdict.json"
rg -q '"soft_findings": \[\]' "$ATLAS_FORGE_ROOT/workflow/templates/design-review-verdict.json"
rg -q 'feedback-cycle.*--classification' \
  "$ATLAS_FORGE_ROOT/workflow/bin/lib/codex-workflow/feedback/commands.js"

if rg -n 'TODO|TBD|PLACEHOLDER' "$skill_root" --glob '!vendor/**'; then
  fail "placeholder text found"
fi

printf 'product-design skill contract passed\n'
