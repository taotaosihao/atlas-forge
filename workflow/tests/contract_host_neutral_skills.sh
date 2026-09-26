#!/usr/bin/env bash
set -euo pipefail

# Static contract: Atlas skills outside the Codex-only legacy Team backend must
# be usable from a Claude-only runtime without Codex paths or Codex-only tools.
ATLAS_FORGE_ROOT="${ATLAS_FORGE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

python3 - "$ATLAS_FORGE_ROOT/plugins/atlas-workflow" <<'PY'
import pathlib
import re
import sys

plugin = pathlib.Path(sys.argv[1])
skills = plugin / "skills"
failures = []
# team-v1 is a documented Codex-only legacy backend; team keeps its own paired
# Codex/Claude sections under contract_claude_host.sh.
exempt = {"team-v1", "team"}
cli = re.compile(r"`(?:atlas|codex)-workflow(?=[ `])|`codex-design-review(?=[ `])")

def fail(message):
    failures.append(message)

def flat(text):
    return " ".join(text.split())

def host_note(text):
    if "## Host Note\n" not in text:
        return ""
    return text.split("## Host Note\n", 1)[1].split("\n## ", 1)[0]

for path in sorted(skills.glob("*/SKILL.md")):
    name = path.parent.name
    text = path.read_text(encoding="utf-8")
    note = flat(host_note(text))
    if name in exempt or not cli.search(text):
        continue
    for phrase in (
        "`~/.codex/workflow/bin/<command>` on Codex",
        "`${CLAUDE_CONFIG_DIR:-$HOME/.claude}/bin/<command>`",
        "`LOCAL_BIN_ROOT`",
        "do not call the runtime copy",
        "does not resolve into the other host's directory",
        "`$atlas-workflow:<name>` references below follow the same per-host pattern",
    ):
        if phrase not in note:
            fail(f"{name}: Host Note missing: {phrase}")

scan = [p for p in (plugin / "skills").rglob("*.md")
        if p.relative_to(skills).parts[0] not in exempt]
scan += list((plugin / "references").rglob("*.md")) + list((plugin / "commands").rglob("*.md"))
for path in sorted(scan):
    rel = path.relative_to(plugin)
    text = path.read_text(encoding="utf-8")
    if "CLAUDE_CONFIG_DIR:-~" in text:
        fail(f"{rel}: quoted ~ does not expand; use $HOME")
    body = text.replace(host_note(text), "") if path.name == "SKILL.md" else text
    lines = body.splitlines()
    for index, line in enumerate(lines):
        if "~/.codex/workflow/bin/" in line:
            fail(f"{rel}:{index + 1}: absolute Codex command path outside the Host Note")
        elif "~/.codex/" in line:
            window = "\n".join(lines[max(0, index - 3): index + 4])
            if "CLAUDE_CONFIG_DIR" not in window:
                fail(f"{rel}:{index + 1}: Codex home path without a nearby Claude Code counterpart")
    if rel.parts[:2] != ("skills", "task") and re.search(r"\bmain Codex\b", text):
        fail(f"{rel}: host-specific main-session wording")

for name, pattern in (
    ("design-review", r"When the current host provides MemPalace"),
    ("learn", r"When MemPalace is available"),
    ("cw", r"MemPalace \(when the host provides it\)"),
):
    if not re.search(pattern, (skills / name / "SKILL.md").read_text(encoding="utf-8")):
        fail(f"{name}: MemPalace use must degrade when the host lacks it")

message = skills / "system-message-design" / "SKILL.md"
if not message.is_file():
    fail("system-message-design must ship with the plugin for both hosts")
else:
    head = message.read_text(encoding="utf-8").split("---\n", 2)[1]
    if "name: system-message-design" not in head:
        fail("system-message-design frontmatter name mismatch")
ui_ux = flat((plugin / "references" / "ui-ux.md").read_text(encoding="utf-8"))
if "[system-message-design](../skills/system-message-design/SKILL.md)" not in ui_ux:
    fail("ui-ux.md must link the bundled message skill")

if failures:
    raise SystemExit("host-neutral skill contract failed:\n- " + "\n- ".join(failures))
print("ok - host-neutral Atlas skills (static contract)")
PY
