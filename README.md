# Atlas Forge

Shared Codex plugin marketplace for local productivity plugins.

The first plugin is `paseo-agent-guard-plugin`, a standalone Codex plugin and CLI for guarding Paseo orchestration with a project-room durable objective.

It keeps planning and research in `researchWorkspace`, while constraining implementation, fix, validation, audit, and PR child agents to one declared project workspace at a time from `projects[]`.

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
      templates/WORKFLOW.md
      examples/single-project.WORKFLOW.md
      examples/multi-project.WORKFLOW.md
```

## Durable Objective

The objective is stored outside the repo by default:

```text
~/.paseo-agent-guard/objectives/<project-name>/<room>.json
```

It is owned by the plugin, not by Codex Goal. The model is similar: an active objective persists across turns and watcher processes until paused, resumed, blocked, completed, or cleared.

## WORKFLOW.md v2

The guard no longer accepts JSON config files. It loads `WORKFLOW.md` by default from the current directory, or an explicit path with `--workflow <path>`.

Required front matter:

```yaml
schemaVersion: 2
projectName: example-project
room: example-room
objective: continue approved delivery
researchWorkspace: /abs/path/to/research
projects:
  - key: app
    targetWorkspace: /abs/path/to/project
    allowedImplementationRoots:
      - /abs/path/to/project-worktrees
```

Single-project workflows still use `projects.length === 1` and still require canonical room evidence with `project=<key>` and `labels.project=<key>`.

The Markdown body after front matter is part of the workflow contract. Invalid workflow on startup fails immediately. The watcher reloads workflow on heartbeat; if reload is invalid, it keeps the last-known-good workflow and exposes `workflowLoadError`.

## Commands

```bash
node plugins/paseo-agent-guard-plugin/scripts/paseo-guard.mjs init --workflow <path>
node plugins/paseo-agent-guard-plugin/scripts/paseo-guard.mjs status --workflow <path>
node plugins/paseo-agent-guard-plugin/scripts/paseo-guard.mjs pause --workflow <path>
node plugins/paseo-agent-guard-plugin/scripts/paseo-guard.mjs resume --workflow <path>
node plugins/paseo-agent-guard-plugin/scripts/paseo-guard.mjs clear --workflow <path>
node plugins/paseo-agent-guard-plugin/scripts/paseo-guard.mjs watch-status --workflow <path>
node plugins/paseo-agent-guard-plugin/scripts/paseo-guard.mjs ensure-watch --workflow <path>
node plugins/paseo-agent-guard-plugin/scripts/paseo-guard.mjs reconcile --workflow <path> --dry-run
node plugins/paseo-agent-guard-plugin/scripts/paseo-guard-watch.mjs --workflow <path>
```

`reconcile` reads the objective, room messages, orchestrator state, and child agent state. It sends at most one continuation prompt to the orchestrator, and only when the policy allows it.

The durable objective is now schema v2 and stores:

- `schemaVersion`, `workflowPath`, `workflowDigest`
- project summaries from `projects[]`
- `perProjectHandledCursor`
- `retryLedger`
- `lastDecision` and global `status`

Existing objective schema v1 files are rejected with an explicit migration error.

The guard resolves each child cwd to exactly one project. No match or multiple matches is a `delegation_contract_violation`. The SIGNAL contract is canonical and strict:

```text
SIGNAL signal=<PASS|DONE|FIXED|PLAN_READY|BLOCKED|NEEDS_FIX|NEEDS_USER_DECISION|ERROR|PR_CREATED|MERGED> project=<key> agent=<id> cwd=<path> branch=<branch> task=<task> labels={room=<room>,project=<key>,parent=<parent>,phase=<phase>,task=<task>,role=<role>} evidence=<summary>
```

The guard validates top-level `project`, `labels.project`, the agent cwd-derived project, role, required labels, and evidence fields separately.
Canonical project `SIGNAL` evidence must be authored by the reported child agent: `message.author` must match `agent=<child-id>`. Orchestrator-authored, unknown-author, or mismatched-author canonical project `SIGNAL` lines are rejected as `delegation_contract_violation`, even if they report `agent=<child-id>` or `relayed=true`; orchestrators should use diagnostic/progress/recovery messages for coordination.

In `policy.handoffMode`, blocked signals are treated as obstacles to clear toward the approved objective unless they explicitly mark a preserved stop gate with `handoffStop=<prd_human_review|scope_decision|provider_tooling_blocker|final_acceptance|unrecoverable_blocker>`. The guard still stops for those marked gates and for protected actions outside the handoff allowance.

Completed child agents are part of the guard lifecycle: once a child agent has posted valid final room evidence and is idle/done, the orchestrator is instructed to soft-close it with `paseo archive <agent-id> --json`. Running agents, agents without required evidence, and the orchestrator itself are not closed by cleanup.

The watcher is event-driven:

```bash
paseo chat wait <room> --timeout 10m --json
```

Timeouts are heartbeats. They trigger a guarded reconcile pass so missing child-agent evidence can be inspected, but they do not create schedule agents. When the last guard decision is waiting on agent status, such as `child_agent_running` or `orchestrator_not_idle`, the watcher uses `watch.agentStatusPollTimeout` for a shorter status poll before reconciling again. When the last decision is `cooldown_active`, it uses `watch.cooldownPollTimeout` so handoff flows resume promptly after cooldown expires.

The watcher reloads `WORKFLOW.md` through `WorkflowStore` every cycle and logs JSONL lines containing `room`, `workflowDigest`, `projectKey`, `decision`, `reason`, `signal`, `messageId`, and `retryAttempt`.

Per-child `paseo wait <agent-id>` processes are auxiliary idle diagnostics; durable continuation is handled by the guard watcher plus valid room `SIGNAL` evidence.

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
node plugins/paseo-agent-guard-plugin/scripts/paseo-guard.mjs init --workflow plugins/paseo-agent-guard-plugin/examples/single-project.WORKFLOW.md
node plugins/paseo-agent-guard-plugin/scripts/paseo-guard.mjs status --workflow plugins/paseo-agent-guard-plugin/examples/single-project.WORKFLOW.md
node plugins/paseo-agent-guard-plugin/scripts/paseo-guard.mjs reconcile --workflow plugins/paseo-agent-guard-plugin/examples/single-project.WORKFLOW.md --dry-run
paseo chat wait gearjob-123-plm-next --timeout 5s --json
```
