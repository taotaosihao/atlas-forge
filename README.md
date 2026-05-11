# Atlas Forge

Shared Codex plugin marketplace for local productivity plugins.

The first plugin is `paseo-agent-guard-plugin`, a standalone Codex plugin and CLI for guarding Paseo orchestration with a project-room durable objective.

It keeps planning and research in `researchWorkspace`, while constraining implementation, fix, validation, audit, and PR child agents to `targetWorkspace` or a linked target worktree.

## Layout

```text
atlas-forge/
  .agents/plugins/marketplace.json
  scripts/update-codex-plugin.mjs
  plugins/
    paseo-agent-guard-plugin/
      .codex-plugin/plugin.json
      skills/paseo-agent-guard/SKILL.md
      scripts/paseo-guard.mjs
      scripts/paseo-guard-watch.mjs
      templates/paseo-guard.config.json
      examples/gearjob-123-plm-next.config.json
```

## Durable Objective

The objective is stored outside the repo by default:

```text
~/.paseo-agent-guard/objectives/<project-name>/<room>.json
```

It is owned by the plugin, not by Codex Goal. The model is similar: an active objective persists across turns and watcher processes until paused, resumed, blocked, completed, or cleared.

## Commands

```bash
node plugins/paseo-agent-guard-plugin/scripts/paseo-guard.mjs init --config <config>
node plugins/paseo-agent-guard-plugin/scripts/paseo-guard.mjs status --config <config>
node plugins/paseo-agent-guard-plugin/scripts/paseo-guard.mjs pause --config <config>
node plugins/paseo-agent-guard-plugin/scripts/paseo-guard.mjs resume --config <config>
node plugins/paseo-agent-guard-plugin/scripts/paseo-guard.mjs clear --config <config>
node plugins/paseo-agent-guard-plugin/scripts/paseo-guard.mjs reconcile --config <config> --dry-run
node plugins/paseo-agent-guard-plugin/scripts/paseo-guard-watch.mjs --config <config>
```

`reconcile` reads the objective, room messages, orchestrator state, and child agent state. It sends at most one continuation prompt to the orchestrator, and only when the policy allows it.

The watcher is event-driven:

```bash
paseo chat wait <room> --timeout 10m --json
```

Timeouts are heartbeats. They trigger a guarded reconcile pass so missing child-agent evidence can be inspected, but they do not create schedule agents.

## Install Locally

The repo is a Codex plugin marketplace through `.agents/plugins/marketplace.json`. Register it with the official Codex marketplace command:

```bash
codex plugin marketplace add git@github.com:taotaosihao/atlas-forge.git
```

## Update Local Plugin

After pushing changes to the Git marketplace repo, refresh the Codex runtime cache with one command:

```bash
npm run plugin:update
```

This runs the official `codex plugin marketplace upgrade atlas-forge` path. Start a new Codex session, or reload the plugin context, before relying on updated skill text.

## Checks

```bash
npm run check
node plugins/paseo-agent-guard-plugin/scripts/paseo-guard.mjs init --config plugins/paseo-agent-guard-plugin/examples/gearjob-123-plm-next.config.json
node plugins/paseo-agent-guard-plugin/scripts/paseo-guard.mjs reconcile --config plugins/paseo-agent-guard-plugin/examples/gearjob-123-plm-next.config.json --dry-run
paseo chat wait gearjob-123-plm-next --timeout 5s --json
```
