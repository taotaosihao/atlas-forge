# Multica SDLC Plugin

This plugin packages reusable Multica SDLC orchestration assets for Codex:

- `multica-agent-plan` skill for staffing and gate planning before submission.
- `multica-prd-submit` skill for submitting approved PRD/task packets.
- `multica-dynamic-workflow` skill for template-driven next-role routing.
- Role instructions and generated instruction sources copied from the Atlas
  Forge Multica SDLC source tree.
- A deterministic router script and example workflow template.
See `docs/workflow-template-schema.md` for the template field contract and
`docs/hook-integration.md` for Claude/Codex hook boundaries.

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
  scripts/multica-next-role-router.py
  scripts/self-test-router.sh
  docs/hook-integration.md
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

## Hook Boundary

Claude can usually call the router from `Stop` or `SessionEnd` hooks in
`~/.claude/settings.json`. Multica Codex tasks use per-task `CODEX_HOME` and
currently may copy only `config.json`, `config.toml`, and `instructions.md`, so
Codex hook integration needs explicit per-task injection, a wrapper, or a
runtime supervisor call. Do not assume global `~/.codex/hooks.json` reaches a
Multica Codex task.
