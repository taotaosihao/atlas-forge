# Hook Examples

Codex plugin manifests currently reject unsupported `hooks` manifest fields in
this local validation flow, so this directory documents hook integration but is
not referenced from `.codex-plugin/plugin.json`.

Use `../scripts/multica-next-role-router` from a Claude `Stop`/`SessionEnd`
hook or from an explicit Multica/Codex runtime wrapper. See
`../docs/hook-integration.md` for the Claude/Codex boundary.
