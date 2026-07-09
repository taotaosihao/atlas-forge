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
| `multica-sdlc` | **Planned deprecation.** Existing compatibility assets remain available until a separate removal decision; no new feature or migration investment is planned. |

### Multica Lifecycle Notice

`multica-sdlc` and the mirrored `.agents` Multica assets are in planned
deprecation. Atlas native workflow is the forward path for new orchestration
work. This status does not remove the existing plugin, installer entries, or
runtime assets; removal and compatibility cleanup require a separate approved
plan. Until then, Multica code, generated instructions, tests, router, listener,
and runtime state are maintenance-frozen.

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
- rsync.
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

## Remote Agent Deployment

远端主机上的 agent 部署请优先使用
[远端 Agent 部署手册](docs/remote-agent-deployment.md)。该手册按从空主机到
可用 agent runtime 的顺序记录 SSH 授权、全量安装、非默认目录、仅刷新
`~/.agents` 资产、验证清单、更新流程和常见故障处理。

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

For local development, edit plugin, workflow, or native agent source in this
repository, then run one command:

```bash
scripts/update-atlas-workflow-plugin
```

This syncs `plugins/atlas-workflow/` into the local Codex plugin source,
refreshes installed runtime cache copies, syncs workflow helpers and native
Codex agents, and verifies source/cache equality. Use `--dry-run` to preview
the runtime writes and `--contract` when you want the full workflow contract
suite after the refresh:

```bash
scripts/update-atlas-workflow-plugin --dry-run
scripts/update-atlas-workflow-plugin --contract
```

Start a new Codex thread before relying on changed skills or native agents.

For repository and installed-layout checks that are not part of the one-command
local refresh, run the hermetic suites:

```bash
bash workflow/tests/contract_repo.sh
bash workflow/tests/contract_host_install.sh
bash workflow/tests/contract.sh
```

`contract_repo.sh` uses isolated HOME, Codex, agent, XDG, Git, and temporary
roots and audits file access so stale user caches are not consulted.
`contract_host_install.sh` runs only temporary Atlas layout, strict-doctor,
local-cache, and development-sync fixtures. Neither default suite installs from
a real marketplace or reads the active Multica runtime.

Temporary roots are removed by default. To retain the suite root, syscall
traces, captured logs, and host layout fixtures for investigation, run:

```bash
KEEP_TEST_TMP=1 bash workflow/tests/contract_repo.sh
KEEP_TEST_TMP=1 bash workflow/tests/contract_host_install.sh
```

The real Codex CLI installation gate remains a separate local or controlled
self-hosted release check. It requires an explicitly pinned CLI version and is
not part of ordinary hosted CI:

```bash
ATLAS_REAL_CLI_E2E=1 \
ATLAS_EXPECTED_CODEX_VERSION='codex-cli <pinned-version>' \
  bash workflow/tests/integration_atlas_plugin_install.sh
```

The compatibility-only live-host contract remains available through
`ATLAS_CONTRACT_LEGACY_HOST=1 bash workflow/tests/contract.sh`; it reads active
installation state and is intentionally excluded from Atlas CI and normal
development checks.

GitHub Actions runs four read-only jobs: `manifest-release-integrity`,
`repo-contract`, `host-layout-fixtures`, and `docs-links`. The hosted jobs do
not use Codex credentials, marketplace network access, or Multica tests.

Before publishing a new marketplace snapshot, bump the changed plugin's
manifest cachebuster:

```bash
scripts/bump-plugin-cachebuster.sh atlas-workflow
scripts/bump-plugin-cachebuster.sh mempalace
scripts/bump-plugin-cachebuster.sh multica-sdlc
```

Then commit and push:

```bash
git add -A
git commit -m "type(scope): summary"
git push origin main
```

Refresh Codex from the Git marketplace snapshot:

```bash
scripts/codex-plugin-update.sh atlas-workflow
scripts/codex-plugin-update.sh mempalace
scripts/codex-plugin-update.sh multica-sdlc
```

`codex-plugin-update.sh` is the stricter publish/update path for installed
devices. It requires a clean local checkout whose `HEAD` matches `origin/main`,
then upgrades the `atlas-forge` marketplace and reinstalls the selected plugin.

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
    update-atlas-workflow-plugin
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
