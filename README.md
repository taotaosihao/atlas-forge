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

## Update Flow

1. Edit plugin or workflow source in this repository.
2. For workflow helper changes, sync source files to the live Codex workflow
   path:

```bash
scripts/sync-live-workflow.sh
```

3. Reinstall a changed plugin through Codex:

```bash
scripts/codex-plugin-update.sh atlas-workflow
scripts/codex-plugin-update.sh mempalace
```

4. Start a new Codex thread to load updated skills/tools.

## Marketplace

The marketplace name is `atlas-forge`. The intended Codex config source is this
repository root:

```toml
[marketplaces.atlas-forge]
source_type = "local"
source = "/home/gewu/work/atlas-forge"
```

After this source is configured, `codex plugin add <plugin>@atlas-forge` installs
from this git-managed repo.
