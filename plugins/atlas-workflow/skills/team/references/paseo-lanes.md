# Explicit Paseo Lanes

Load this reference only after a Team, lane or dispatch has resolved to Paseo
under the Team skill's Backend Selection rules. Native Team work never reads it.

Only after a Team/lane/dispatch has resolved to Paseo:

- Discover providers with `paseo provider ls --json`, and discover models and callable modes from the selected provider's live structured capability.
- Do not hardcode provider/model availability, catalog order, “latest” status, thinking options, or mode IDs, except for the user-required direct Claude Code permission contract below. Never copy a Codex mode or model option to another provider.
- Generic Atlas recommendations may consider only models whose trusted capability identity is explicitly non-Claude, including exact providers in Atlas's controlled direct-provider identity map. Unknown gateway aliases are never eligible for automatic recommendation. Keep implementer and independent reviewer providers distinct when that perspective matters, but do not create lanes only to achieve provider diversity.
- An explicit provider/model request wins when the exact live capability exists. An unknown gateway identity also requires an exact controller-attested model-selection event and remains disclosed as unverified; it is not silently promoted to non-Claude. Do not silently replace an unavailable exact provider/model with another provider/model; apply the recorded Codex fallback policy and disclose the lost perspective.
- Resolve a provider-specific mode that satisfies the lane. If the live capability exposes only a display label or no callable mode ID, treat the Paseo path as unavailable; do not guess `full-access`, `bypass`, `bypassPermissions`, `yolo`, or any other ID. The direct `claude` provider uses the explicit exception below.
- Runtime permission does not grant workflow authority. Review/discuss stays read-only; writable execution still requires explicit user authorization, owned and forbidden paths, acceptance, verification, and a stop condition.
- Prompts carry repository instructions, scope, authority, expected evidence, and stop conditions.

## Claude Manual-Only Gate

This gate applies only to the explicitly selected Paseo lanes in this reference, not to Claude Code native agents inheriting the host model.

Claude-family models are never eligible for automatic routing or model recommendation, whether exposed by the direct `claude` provider or through a gateway.

- Use Claude only when the user or operator manually supplies an exact provider and model ID in a controller-attested model-selection event for the current Team run and scope.
- Live catalog discovery may validate that exact selection; it must not choose, complete, upgrade, or substitute a Claude model.
- Classify model identity from trusted structured capability or Atlas's controlled direct-provider identity map as `claude`, `non-claude`, or `unknown`. A gateway alias or insufficient metadata outside that map is `unknown`, not non-Claude.
- Missing exact manual Claude selection returns `CLAUDE_MODEL_SELECTION_REQUIRED`. An unknown family without an exact controller-attested provider/model selection returns `MODEL_FAMILY_UNVERIFIED`. An exact attested unknown selection may proceed while remaining visibly unverified. Rejected admission does not start an agent or count as an operational fallback.
- For a valid exact selection on the direct `claude` provider, add Paseo's callable Claude mode ID directly to every launch command: `paseo run --provider claude --model "<exact-model-id>" --mode bypassPermissions ... "<prompt>"`. Do not omit the option, shorten it to the display label `bypass`, substitute `default`, `auto`, or `acceptEdits`, or use Claude Code's lower-level `--permission-mode` flag in a Paseo command.
- If a valid manually selected Claude model is unavailable at runtime, preserve the requested perspective and use the recorded Codex fallback policy; never silently choose another Claude model.

## Paseo Lifecycle And Codex Fallback

- Reserve the attempt and any path-scoped writer lease before `paseo run`; bind the returned exact agent/workspace/worktree identity immediately after launch. Use a stable launch operation ID so recovery can reconcile a run/bind crash window without launching a second actor.
- Replaying a pending launch claim may execute only `paseo ls --global --label <exact-label>`. An exact match records the factual receipt and permits bind; missing or ambiguous results record reconciliation evidence, keep the attempt `launch-state-unknown`, retain its writer lease, and never replay `paseo run`.
- Resolve `launch-state-unknown` only with `team-attempt-record --action=resolve-launch` targeting the exact pending claim and launch operation, `--disposition=no-actor-confirmed`, a canonical `user-message:` or `operator-input:` authority ref, a single-line reason, and non-empty canonical task-artifact evidence. This records an indeterminate claim and interrupted unlaunched attempt; quiesce with evidence before retry or fallback. Never use it as a broad reset.
- If a verification command claim survives controller termination, do not run its argv again. `verify-resolve` may mark only the exact pending operation and claim `indeterminate` with a new operation ID, canonical controller authority, reason, and task-artifact evidence. It records no verification receipt or required-gate pass; replan or failed/cancelled closure must remain explicit.
- Reuse an existing reviewer with exact-ID `send` and wait for real completion; do not busy-poll. Stop only the exact actor when continued execution would conflict, exceed scope, or waste material resources. Never use broad stop, daemon restart, agent delete, or provider mutation.
- Treat quota/credits, trusted 429/Retry-After, provider/model/mode/auth unavailability, CLI/daemon failure, runtime crash, and timeout with no useful output as operational failures only when a trusted control/runtime observation supports the classification. Task output, tests, code defects, review findings, disagreement, or missing authority are not backend failures.
- An automatic retry is a new append-only attempt, happens at most once for a dispatch, and requires the predecessor to be quiesced. Fallback likewise requires a quiesced Paseo predecessor.
- Before a writable fallback, preserve diff/worktree/base/head/untracked evidence, prove the original writer is quiesced, and obtain a takeover permit and non-overlapping lease. If any fact is unknown, stop the lane instead of starting another writer.
- Atomically record the fallback event and reserve the native attempt in the same logical lane. The native actor continues the same goal, paths, authority, acceptance, and admitted evidence; fallback never widens scope or hides Paseo provenance.
