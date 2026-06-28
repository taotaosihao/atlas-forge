# Multica SDLC Plugin

This plugin packages reusable Multica SDLC orchestration assets for Codex:

- `multica-agent-plan` skill for staffing and gate planning before submission.
- `multica-prd-submit` skill for submitting approved PRD/task packets.
- `multica-dynamic-workflow` skill for template-driven next-role routing.
- Role instructions and generated instruction sources copied from the Atlas
  Forge Multica SDLC source tree.
- A deterministic router script and example workflow template.
- A Codex-hosted WebSocket listener for realtime SDLC routing signals.
See `docs/workflow-template-schema.md` for the template field contract and
`docs/hook-integration.md` for Claude/Codex hook boundaries. See
`docs/websocket-listener.md` for the listener runtime and safety contract.

The default SDLC workflow includes a full Planner / Generator / Evaluator
contract flow for implementation tasks. Planner assigns contract owners,
generator/coder proposes the slice before writing code, evaluator/E2E challenges
the proposal with real validation paths, and optional reviewer/Evidence QA
checks scope and evidence readiness. The canonical template lives at
`templates/sprint-contract.md`.

The router is intentionally not an LLM judge. It reads a workflow template and
facts from a Multica issue/run/comment event, then returns the next role group,
wait state, repair owner, blocker owner, or clean-gate owner defined by the
template.

## Layout

```text
plugins/multica-sdlc/
  .codex-plugin/plugin.json
  skills/
    multica-agent-plan/
    multica-prd-submit/
    multica-dynamic-workflow/
  instructions/
  generated/
  templates/multica-sdlc-workflow.yaml
  scripts/multica-next-role-router
  scripts/multica-next-role-router.js
  scripts/multica-next-role-router-core.js
  scripts/multica-sdlc-listener
  scripts/multica-sdlc-listener.js
  scripts/self-test-router.sh
  scripts/self-test-listener.sh
  examples/listener-events/
  docs/hook-integration.md
  docs/websocket-listener.md
  hooks/README.md
```

## Router Dry Run

```bash
plugins/multica-sdlc/scripts/multica-next-role-router \
  --template plugins/multica-sdlc/templates/multica-sdlc-workflow.yaml \
  --event plugins/multica-sdlc/examples/router-events/coder-done.json
```

Run the bundled smoke tests:

```bash
plugins/multica-sdlc/scripts/self-test-router.sh
```

## WebSocket Listener

The listener is a Node.js CLI with no npm dependency. It uses Multica realtime
events as triggers, hydrates authoritative facts through the HTTP API, routes
through the shared router core, writes an auditable JSONL journal, and defaults
to dry-run.

```bash
plugins/multica-sdlc/scripts/multica-sdlc-listener \
  --ws-url wss://.../ws \
  --api-url https://... \
  --workspace-slug sharp-cell \
  --watch-parent GEW-36 \
  --template plugins/multica-sdlc/templates/multica-sdlc-workflow.yaml \
  --journal ~/.agents/multica-sdlc/listener-journal.jsonl \
  --dedupe-store ~/.agents/multica-sdlc/listener-dedupe.jsonl \
  --token-env MULTICA_TOKEN \
  --dry-run
```

`--apply` requires `--allow-action`. The first version only applies `comment`
and `metadata`; `leader-task` stays blocked until a stable API/CLI entry is
confirmed.

```bash
plugins/multica-sdlc/scripts/self-test-listener.sh
```

## Hook Boundary

Claude can usually call the router from `Stop` or `SessionEnd` hooks in
`~/.claude/settings.json`. Multica Codex tasks use per-task `CODEX_HOME` and
currently may copy only `config.json`, `config.toml`, and `instructions.md`, so
Codex hook integration needs explicit per-task injection, a wrapper, or a
runtime supervisor call. The WebSocket listener is the preferred supervisor
path for non-terminal gates such as draft PR or `in_review`, because it does
not rely on per-task hook propagation. Do not assume global
`~/.codex/hooks.json` reaches a Multica Codex task.
