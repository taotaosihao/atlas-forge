# Atlas Forge

Atlas Forge is a Git-backed Codex plugin marketplace for local workflow tools.
It packages the Atlas workflow skills, the MemPalace Codex wrapper, and the
Atlas workflow helper scripts behind one installable marketplace.

Codex should install plugins from the Git marketplace snapshot, not directly
from a local checkout. The local checkout is the source for editing, reviewing,
committing, and publishing changes.

## Included Plugins

| Plugin | Purpose |
| --- | --- |
| `atlas-workflow` | Atlas skills for task routing, planning, workflow gates, design review, team handoff, and bounded local work. |
| `mempalace` | MemPalace wrapper plugin for local memory search and related commands. |

The repository also stores the Atlas workflow helper source under `workflow/`.
Those helpers are synced into `~/.codex/workflow` when workflow runtime files
change.

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

The installer registers the marketplace, installs `atlas-workflow` and
`mempalace`, syncs the Atlas workflow helpers, and refreshes command shims in
`~/.local/bin`.

After installation, start a new Codex thread so the updated skills are loaded.

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
```

3. Run the local checks:

```bash
python3 -m json.tool .agents/plugins/marketplace.json >/dev/null
python3 /home/gewu/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/atlas-workflow
python3 /home/gewu/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/mempalace-codex-plugin
bash -n scripts/bump-plugin-cachebuster.sh
bash -n scripts/codex-plugin-update.sh
bash -n scripts/install-atlas-forge.sh
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
```

6. If workflow helper files changed, sync them to the live Codex workflow path:

```bash
scripts/sync-live-workflow.sh
```

The sync script also refreshes command shims in `~/.local/bin` for
`codex-workflow`, `codex-design-review`, and `codex-refresh-local-plugin`.

7. Start a new Codex thread before relying on changed skills.

## Repository Layout

```text
atlas-forge/
  .agents/plugins/marketplace.json
  plugins/
    atlas-workflow/
    mempalace-codex-plugin/
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

Those files belong under the local Codex home, such as `~/.codex/workflow` and
`~/.codex/plugins/cache`.

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
