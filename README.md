# Paseo Agent Guard Plugin

Standalone Codex plugin and CLI for guarding Paseo orchestration with a project-room durable objective.

It keeps planning and research in `researchWorkspace`, while constraining implementation, fix, validation, audit, and PR child agents to `targetWorkspace` or a linked target worktree.

## Layout

```text
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
node scripts/paseo-guard.mjs init --config <config>
node scripts/paseo-guard.mjs status --config <config>
node scripts/paseo-guard.mjs pause --config <config>
node scripts/paseo-guard.mjs resume --config <config>
node scripts/paseo-guard.mjs clear --config <config>
node scripts/paseo-guard.mjs reconcile --config <config> --dry-run
node scripts/paseo-guard-watch.mjs --config <config>
```

`reconcile` reads the objective, room messages, orchestrator state, and child agent state. It sends at most one continuation prompt to the orchestrator, and only when the policy allows it.

The watcher is event-driven:

```bash
paseo chat wait <room> --timeout 10m --json
```

Timeouts are heartbeats. They do not create schedule agents.

## Install Locally

The repo is a Codex plugin marketplace through `.agents/plugins/marketplace.json`. Register it with the official Codex marketplace command:

```bash
codex plugin marketplace add taotaosihao/paseo-agent-guard-plugin
```

## Update Local Plugin

After pushing changes to the Git marketplace repo, refresh the Codex runtime cache with one command:

```bash
npm run plugin:update
```

This runs the official `codex plugin marketplace upgrade paseo-agent-guard-plugin` path. Start a new Codex session, or reload the plugin context, before relying on updated skill text.

## Checks

```bash
npm run check
node scripts/paseo-guard.mjs init --config examples/gearjob-123-plm-next.config.json
node scripts/paseo-guard.mjs reconcile --config examples/gearjob-123-plm-next.config.json --dry-run
paseo chat wait gearjob-123-plm-next --timeout 5s --json
```
