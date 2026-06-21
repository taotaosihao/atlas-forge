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
