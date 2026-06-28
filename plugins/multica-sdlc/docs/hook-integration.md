# Multica SDLC Hook Integration

This plugin ships a deterministic next-role router. Hook code should call the
router after a Multica specialist run or issue comment is available, then use
the JSON result to decide whether to dispatch, wait, suppress a duplicate, or
escalate to leader.

## Claude

Claude commonly supports hooks through `~/.claude/settings.json`, including
`Stop` and `SessionEnd`. A Claude-side Multica specialist can call:

```bash
plugins/multica-sdlc/scripts/multica-next-role-router \
  --template plugins/multica-sdlc/templates/multica-sdlc-workflow.yaml \
  --event /path/to/multica-event.json \
  --dedupe-store /path/to/multica-router-dedupe.jsonl \
  --record-dedupe
```

The hook should pass only redacted event facts: issue id, phase, source role,
source comment or run id, commit SHA, artifact type, result, and completed role
results. Do not pass raw passwords, cookies, sessions, bearer tokens, private
keys, API keys, CSRF tokens, or challenge answers.

## Codex

Codex integration in Multica needs explicit handling. Multica Codex tasks use
per-task `CODEX_HOME`, and the current runtime setup may copy only these files:

- `config.json`
- `config.toml`
- `instructions.md`

That means a global `~/.codex/hooks.json` may not be available inside a Multica
Codex task. Use one of these integration paths:

- inject a task-local hook config into the per-task `CODEX_HOME`;
- wrap Codex task execution with a supervisor that calls the router after each
  agent run;
- install this plugin into the per-task Codex environment and invoke the router
  from Multica orchestration after run completion.

The plugin does not modify Multica runtime code. Treat hook installation as an
operator/runtime step and verify it in the target Multica environment.

## Codex WebSocket Listener

For Codex-managed Multica SDLC work, `scripts/multica-sdlc-listener` provides a
runtime supervisor path that does not depend on per-task hook propagation. It is
a Node.js CLI and uses Node runtime built-ins (`fetch` and `WebSocket`) instead
of an npm WebSocket dependency.

Use it when non-terminal gates need parent visibility, for example a child issue
entering `in_review` or a linked draft PR appearing before the child reaches
`done/cancelled`.

```bash
plugins/multica-sdlc/scripts/multica-sdlc-listener \
  --ws-url wss://.../ws \
  --api-url https://... \
  --workspace-slug sharp-cell \
  --watch-parent GEW-36 \
  --template plugins/multica-sdlc/templates/multica-sdlc-workflow.yaml \
  --token-env MULTICA_TOKEN \
  --dry-run
```

The listener hydrates issue/children/PR/metadata/task facts before routing and
shares router code with `scripts/multica-next-role-router`. It does not change
Multica runtime semantics and does not continuously poll. Startup/reconnect
reconciliation is bounded to watched issues only.

`--apply` is opt-in and must include `--allow-action`. The first version only
executes `comment` and `metadata`; `leader-task` remains blocked until a stable
entry is confirmed.

## Dispatch Boundary

The router may output `leader_required: true`, but that is only a routing fact.
The leader still owns:

- template creation or updates;
- phase/join clean-gate decisions;
- PR-ready gate decisions;
- final closure;
- blocked reports when no repair owner is knowable.

Specialists should continue to deliver structured facts and evidence using
their role instruction output formats.
