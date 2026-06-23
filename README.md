# Atlas Forge

Atlas Forge is a Git-backed Codex plugin marketplace for local workflow tools.
It packages the Atlas workflow skills, the MemPalace Codex wrapper, and the
Atlas workflow helper scripts behind one installable marketplace. It also
stores the reusable Multica SDLC agent skills and instruction sources that are
synced into `~/.agents`.

Codex should install plugins from the Git marketplace snapshot, not directly
from a local checkout. The local checkout is the source for editing, reviewing,
committing, and publishing changes.

## Included Plugins

| Plugin | Purpose |
| --- | --- |
| `atlas-workflow` | Atlas skills for task routing, planning, workflow gates, design review, team handoff, and bounded local work. |
| `mempalace` | MemPalace wrapper plugin for local memory search and related commands. |
| `multica-sdlc` | Multica SDLC skills, role instruction assets, dynamic workflow templates, and deterministic next-role routing helpers. |

The repository also stores the Atlas workflow helper source under `workflow/`.
Those helpers are synced into `~/.codex/workflow` when workflow runtime files
change.

The repository also stores non-secret Multica agent assets under `.agents/`:

| Asset | Purpose |
| --- | --- |
| `.agents/skills/multica-agent-plan` | Plans task-specific Multica agent staffing from current agents and skills before submission. |
| `.agents/skills/multica-prd-submit` | Submits approved PRD/task packets and optional approved staffing plans to Multica. |
| `.agents/bin/multica-prd-submit` | Wrapper that creates the Multica issue and attaches the canonical task packet/staffing plan. |
| `.agents/multica-sdlc` | Multica SDLC protocol, leader/planner/specialist instructions, generated instruction sources, and evidence scorecard schema. |

## Requirements

- Codex CLI with `codex plugin` support.
- Git.
- GitHub SSH access to `git@github.com:taotaosihao/atlas-forge.git`.

## Install

All devices use the same SSH Git marketplace source.

```bash
bash -lc 'set -euo pipefail
tmp="$(mktemp -d)"
trap "rm -rf \"$tmp\"" EXIT
git clone --depth 1 --branch main git@github.com:taotaosihao/atlas-forge.git "$tmp/atlas-forge"
"$tmp/atlas-forge/scripts/install-atlas-forge.sh"'
```

If the device already has an older local `atlas-forge` marketplace configured,
the installer replaces it with the SSH Git marketplace source.

If the repository is already checked out locally, run:

```bash
scripts/install-atlas-forge.sh
```

The installer registers the marketplace, installs `atlas-workflow`,
`mempalace`, and `multica-sdlc`, syncs the Atlas workflow helpers, syncs
Multica agent assets into `~/.agents`, and refreshes command shims in
`~/.local/bin`.

After installation, start a new Codex thread so the updated skills are loaded.

## Agent Install

The full installer also installs the reusable Multica agent assets. It syncs:

- `.agents/skills/*` to `~/.agents/skills/`
- `.agents/bin/*` to `~/.agents/bin/`
- `.agents/multica-sdlc/*` to `~/.agents/multica-sdlc/`
- the `multica-prd-submit` shim to `~/.local/bin/multica-prd-submit`

To install or refresh only the agent assets from a local checkout, run:

```bash
scripts/sync-live-agents.sh
```

Use `AGENTS_HOME` and `LOCAL_BIN_ROOT` when installing into non-default
locations:

```bash
AGENTS_HOME="$HOME/.agents" LOCAL_BIN_ROOT="$HOME/.local/bin" \
  scripts/sync-live-agents.sh
```

Verify the agent install:

```bash
test -d ~/.agents/skills/multica-agent-plan
test -d ~/.agents/skills/multica-prd-submit
test -f ~/.agents/multica-sdlc/instructions/leader.md
test -x ~/.agents/bin/multica-prd-submit
command -v multica-prd-submit
```

If agent instructions or skills changed, rerun `scripts/sync-live-agents.sh`
after pulling the latest repository changes. Existing live task state, auth
tokens, runtime settings, scorecard JSONL, and lock files remain local runtime
state and are not stored in this repository.

## Update An Installed Device

```bash
~/.codex/.tmp/marketplaces/atlas-forge/scripts/install-atlas-forge.sh
```

Start a new Codex thread after updating. Plugin skills are loaded when a thread
starts.

## Development Workflow

1. Edit plugin or workflow source in this repository.
2. If plugin content changed, bump the plugin manifest cachebuster:

```bash
scripts/bump-plugin-cachebuster.sh atlas-workflow
scripts/bump-plugin-cachebuster.sh mempalace
scripts/bump-plugin-cachebuster.sh multica-sdlc
```

3. Run the local checks:

```bash
python3 -m json.tool .agents/plugins/marketplace.json >/dev/null
python3 /home/gewu/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/atlas-workflow
python3 /home/gewu/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/mempalace-codex-plugin
python3 /home/gewu/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/multica-sdlc
bash -n scripts/bump-plugin-cachebuster.sh
bash -n scripts/codex-plugin-update.sh
bash -n scripts/install-atlas-forge.sh
bash -n scripts/sync-live-agents.sh
bash -n scripts/sync-live-workflow.sh
plugins/multica-sdlc/scripts/self-test-router.sh
```

4. Commit and push:

```bash
git add -A
git commit -m "type(scope): summary"
git push origin main
```

5. Refresh Codex from the Git marketplace snapshot:

```bash
scripts/codex-plugin-update.sh atlas-workflow
scripts/codex-plugin-update.sh mempalace
scripts/codex-plugin-update.sh multica-sdlc
```

6. If workflow helper files or Multica agent assets changed, sync them to the
   live local paths:

```bash
scripts/sync-live-agents.sh
scripts/sync-live-workflow.sh
```

The sync scripts refresh command shims in `~/.local/bin` for `codex-workflow`,
`codex-design-review`, `codex-refresh-local-plugin`, and `multica-prd-submit`.

7. Start a new Codex thread before relying on changed skills.

## Repository Layout

```text
atlas-forge/
  .agents/plugins/marketplace.json
  .agents/
    bin/
    skills/
    multica-sdlc/
  plugins/
    atlas-workflow/
    mempalace-codex-plugin/
    multica-sdlc/
  scripts/
    bump-plugin-cachebuster.sh
    codex-plugin-update.sh
    install-atlas-forge.sh
    sync-live-workflow.sh
  workflow/
    bin/
    hooks/
    templates/
    tests/
```

## Marketplace Configuration

The configured marketplace name is `atlas-forge`.

```toml
[marketplaces.atlas-forge]
source_type = "git"
source = "git@github.com:taotaosihao/atlas-forge.git"
ref = "main"
```

`codex plugin marketplace upgrade atlas-forge` refreshes the Git snapshot.
`codex plugin add <plugin>@atlas-forge` installs from that snapshot.

## Runtime State

This repository intentionally does not store live Codex state:

- task artifacts
- session logs
- auth files
- installed plugin caches
- temporary marketplace snapshots
- Multica auth tokens, provider env/settings JSON, live tasks, scorecard JSONL,
  or lock files

Those files belong under the local Codex home, such as `~/.codex/workflow` and
`~/.codex/plugins/cache`, or under local agent runtime paths such as
`~/.agents/multica-sdlc`.

## Troubleshooting

### `Permission denied (publickey)`

The device cannot access the GitHub repository through SSH. Configure the
device's GitHub SSH key and verify:

```bash
git ls-remote git@github.com:taotaosihao/atlas-forge.git HEAD
```

### Marketplace source changed or points to a local path

Remove and re-add the marketplace:

```bash
codex plugin marketplace remove atlas-forge
codex plugin marketplace add --ref main git@github.com:taotaosihao/atlas-forge.git
```

Then reinstall the plugins:

```bash
~/.codex/.tmp/marketplaces/atlas-forge/scripts/install-atlas-forge.sh
```

### Updated skills are not visible

Run the marketplace update command and start a new Codex thread:

```bash
~/.codex/.tmp/marketplaces/atlas-forge/scripts/install-atlas-forge.sh
```
