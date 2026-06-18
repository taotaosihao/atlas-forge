# Codex Local Plugins

Git-managed source root for the local Codex plugin marketplace.

This repository mirrors the local marketplace root that used to live directly
under `/home/gewu/.codex`:

- `.agents/plugins/marketplace.json`: local marketplace manifest.
- `plugins/atlas-workflow`: Atlas workflow plugin source.
- `plugins/mempalace-codex-plugin`: MemPalace local wrapper plugin source.
- `workflow/`: Atlas workflow helper source files that the Atlas plugin skills
  call through `~/.codex/workflow/bin/...`.

Live task state, artifacts, caches, Codex sessions, auth, and logs are not kept
in this repository.

## Install On Another Device

All devices use the same SSH Git marketplace source. Configure GitHub SSH
access on the device first.

```bash
codex plugin marketplace add --ref main git@github.com:taotaosihao/atlas-forge.git \
  && codex plugin add atlas-workflow@atlas-forge \
  && codex plugin add mempalace@atlas-forge
```

If the device already has an older local `atlas-forge` marketplace configured,
remove it first:

```bash
codex plugin marketplace remove atlas-forge
```

After installation, start a new Codex thread so the updated skills are loaded.

To update an already installed device:

```bash
codex plugin marketplace upgrade atlas-forge \
  && codex plugin add atlas-workflow@atlas-forge \
  && codex plugin add mempalace@atlas-forge
```

## Update Flow

1. Edit plugin or workflow source in this repository.
2. If plugin content changed, bump the plugin manifest cachebuster before
   committing:

```bash
scripts/bump-plugin-cachebuster.sh atlas-workflow
scripts/bump-plugin-cachebuster.sh mempalace
```

3. Commit and push the repository. Codex updates from the Git marketplace
   snapshot, not directly from this local checkout:

```bash
git push origin main
```

4. Refresh the configured Git marketplace snapshot and reinstall the changed
   plugin:

```bash
scripts/codex-plugin-update.sh atlas-workflow
scripts/codex-plugin-update.sh mempalace
```

5. For workflow helper changes, sync source files to the live Codex workflow
   path after the git-backed plugin update:

```bash
scripts/sync-live-workflow.sh
```

6. Start a new Codex thread to load updated skills/tools.

## Marketplace

The marketplace name is `atlas-forge`. The intended Codex config source is the
Git remote:

```toml
[marketplaces.atlas-forge]
source_type = "git"
source = "git@github.com:taotaosihao/atlas-forge.git"
ref = "main"
```

After this source is configured, `codex plugin marketplace upgrade atlas-forge`
refreshes the remote snapshot, and `codex plugin add <plugin>@atlas-forge`
installs from that git-managed snapshot.
