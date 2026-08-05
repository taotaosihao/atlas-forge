# Workflow Helper

Use `~/.codex/workflow/bin/codex-workflow` when bounded work benefits from durable tracking, recovery, explicit verification, or handoff.

Do not use workflow for these tiny tasks:

- one standalone commit or commit-message cleanup
- one single-file documentation sync for rules, paths, or command examples
- status checks, information lookups, or result summaries
- one or two wording, comment, or example edits that do not change behavior

Behavior changes, test updates, multiple files, or general complexity do not by themselves require workflow. Clear, low-risk, verifiable work may execute directly; use workflow when its durable state or gates materially serve the task.

## Quick Loop

1. List tasks and reuse a relevant `doing` task.
2. Only when no relevant task exists, create one with `init-task`.
3. Mark it active with `start`.
4. Search MemPalace only when the user requests it or prior decisions are material evidence for the current work.
5. Verify the work with real commands.
6. During authorized implementation, create moderate Conventional Commits that are independently understandable, verified, and reversible; do not force one commit per task or slice.
7. Finish the whole authorized goal with `done`.
8. Review it with `show`.
9. After the task is done, rely on MemPalace hooks/mining when memory capture is requested or materially useful; use `learn` only for legacy manual archival.
10. Use `doctor`, `smoke`, `verify`, and `team-*` when the task needs environment checks, executable validation, or discussion rounds.

## Commands

Create a new task:

```bash
~/.codex/workflow/bin/codex-workflow init-task "Short title" "What done looks like"
```

List tasks:

```bash
~/.codex/workflow/bin/codex-workflow list
```

Start a task:

```bash
~/.codex/workflow/bin/codex-workflow start <task-id>
```

Finish a task:

```bash
~/.codex/workflow/bin/codex-workflow done <task-id>
~/.codex/workflow/bin/codex-workflow done <task-id> --outcome failed|cancelled --authority-ref <stable-ref> --evidence-ref <path-or-url>
```

Succeeded completion requires a current, stable verification identity and a
fully closed Team ledger. Failed or cancelled completion is explicit and must
retain both authority and evidence; it never projects a succeeded outcome.
`--no-verify` cannot admit succeeded completion.

Show a task:

```bash
~/.codex/workflow/bin/codex-workflow show <task-id>
```

Task mutations commit to `events-v2.jsonl` before updating Markdown, `state.json`,
or the derived compatibility `runtime.jsonl`. Each event carries a monotonic
revision, operation identity, previous-event link, payload digest, whole-record
digest, and a replayable projection. Retrying the same operation and payload is
idempotent; reusing an operation identity with different input is rejected.

Inspect projection consistency without changing files:

```bash
~/.codex/workflow/bin/codex-workflow reconcile <task-id>
```

Rebuild a missing, stale, or divergent projection only with explicit repair
authority. Apply mode first saves the current projection under the task's
`reconcile-backups/` directory:

```bash
~/.codex/workflow/bin/codex-workflow reconcile <task-id> --apply --authority-ref <stable-ref> --reason "<repair reason>"
```

Legacy Atlas recall:

```bash
~/.codex/workflow/bin/codex-workflow recall "Short topic"
```

Check local Codex environment health:

```bash
~/.codex/workflow/bin/codex-workflow doctor
```

Run a real Codex smoke in the active task workspace:

```bash
~/.codex/workflow/bin/codex-workflow smoke
```

Record a verification command inside the task artifact directory:

```bash
~/.codex/workflow/bin/codex-workflow verify <task-id> [--gate-class <id>] [--input <file>]... -- <command...>
```

For an admitted execution-v3 slice, bind every required check to the canonical brief and its exact declared command:

```bash
~/.codex/workflow/bin/codex-workflow verify <task-id> \
  --brief <brief.json> --slice-id <slice-id> --check-id <check-id> -- <declared-command...>
~/.codex/workflow/bin/codex-workflow team-slice-accept <task-id> \
  --brief <brief.json> --operation-id <id> --keeper-output '<declared-ref>=<repo-file>'
~/.codex/workflow/bin/codex-workflow team-slice-supersede <task-id> \
  --slice-id <slice-id> --operation-id <id> --authority-ref <ref> --reason "<reason>"
```

Execution-v3 keeps the admitted HEAD exact through verification, slice
acceptance, and succeeded `done`; the accepted `tree_oid` binds staged and
untracked implementation content without requiring an intermediate commit.
After `done`, the integration owner commits exactly that accepted tree and then
archives the task. Archive rejects worktree drift, a HEAD whose commit tree does
not equal the accepted tree, or a non-descendant commit, and records the final
commit under `completion.final_commit_link`. This is the only supported
execution-v3 commit sequence; `logical_outcome` is not a validator requirement
to commit before verification or slice acceptance.

Verification records bind the result to the current Git/worktree, cwd, argv,
non-secret environment policy, toolchain, lockfiles, submodules, and explicit
inputs. General verification remains supplemental and cannot satisfy a declared
required gate. Any snapshot change after verification requires a new verification.

### Product increment versus product release

Use `product_increment` for an MVP, Beta, internal test/dogfood, or small-scope
public beta when the request does not explicitly ask for formal release
certification, `release-ready`, or `certified`. It is a routing/reporting term,
not a release-intent schema branch: ordinary semantics-v3/lightweight contracts
must omit release intent, immutable Profile binding, terminal certification
slices, release receipts, and release decisions. Direct Task or the main Codex is
the default; Team is chosen only for an independent collaboration or review
need. Reclassify to explicit `product_release` intent before using release
controls.

The minimum real acceptance is startup, the most important end-to-end user flow,
related checks that actually ran and passed, no observed feature/data/permission/
security blocker, and no unauthorized deployment, publication, shared-environment
write, or irreversible operation. A small public beta also makes its access,
data/sensitive-information, credential, rollback/close, and real-entrypoint smoke
boundaries explicit. Report exact commands, exit results, and key conclusions.
If real checks passed but recorder/evidence collection failed, report
`证据采集：降级` and the reason; failed, unrun, or unknown real checks still
block. This result does not create `release_decision`, `certified`, or
release-ready evidence and cannot substitute for the strict path below.

Choose staffing (`main`/`team`), model policy (host/default-saving/explicit
quality), path lease, and release mode independently. Main-only single writers
and read-only/review/verifier work do not need a lease. One isolated
product-increment Team writer without fallback, takeover, or external concurrency
does not require one by default. Concurrent writers, fallback/takeover, uncertain
quiescence, or external shared writers require non-overlapping ownership plus the
existing lease/quiescence boundary. Strict `product_release` execution-v3 lease
and admission remain unchanged; no general lease runtime is added here.

### Product release verification

For a valid `product_release`, contract semantics v4 binds either the immutable
pure-Web `web-ui-v1` Profile or, for strict authoring and admission, the
immutable exact mixed-surface `integrated-app-v1` Profile. Execution-plan
schema version 2 projects every bound Profile requirement into one terminal
certification slice, and brief schema version 3 carries the exact policy
identities into Team execution-v3. The public CLI in this release does not
register a trusted producer for `integrated-app-v1`; without a separately
delivered workflow-bound host producer, structurally passing mixed-surface
facts are recomputed but downgraded to `cannot_verify`.

Release evidence lives under the canonical task artifact directory:

- `release/candidate-manifest.json` binds the admitted repo HEAD/tree and the
  content-addressed artifact, surface inventory, config, runtime, and data inputs.
- `release/raw/*.json` contains adapter inputs; `release/facts/*.json` contains
  typed facts. Each required verification binds exactly one candidate manifest,
  one fact, its raw input, every candidate component, and every evidence ref by
  `--input`.
- The final sweep reloads the digest-pinned plugin adapters, recomputes each fact,
  and rejects policy, fact, input, candidate, or final-worktree drift.

The verification command's success means the typed fact was recorded and
recomputed correctly; it does not mean the fact outcome was `passed`.
Completion derives the read-only result only after the whole terminal sweep:

- any `failed` fact produces `release_decision.status=denied`;
- otherwise any `cannot_verify` fact produces
  `release_decision.status=cannot_verify`;
- all required facts `passed` produces `release_decision.status=certified`;
- missing Team authority or an incomplete, stale, malformed, unsupported, or
  mixed-candidate sweep is inadmissible and produces no decision.

The hash-bound contract `work_type` is projected into brief v3 and persistent
execution authority. Planning and review may retain a `product_release` target
and use Team discuss mode, but release-bearing execution admission and
completion both require `work_type=implementation`; otherwise no release
decision can be derived.

Direct Task work may finish a contributing implementation but cannot close a
`product_release` goal. API-only, worker-only, CLI, mixed combinations other
than the exact `integrated-app-v1` surface set, and unknown surfaces fail before
release admission and have a release-readiness assessment of `cannot_verify`,
not a fabricated completion record. The same assessment applies to direct or
inadmissible work with no decision unless a separately established current
failed fact proves the candidate is not release-ready. Even `certified` means
source-level release-ready only; installation, push, deployment, publication,
and actual release require separate authority and evidence.

Install Codex Bash hooks for workflow evidence capture:

```bash
~/.codex/workflow/bin/codex-workflow install-hooks
```

Start a legacy CLI-backed team discussion or execution round:

```bash
~/.codex/workflow/bin/codex-workflow team-start <task-id> "<objective>" [--mode discuss|execute] [--agents N] [--claude-review]
~/.codex/workflow/bin/codex-workflow team-status <task-id>
~/.codex/workflow/bin/codex-workflow team-promote <task-id> --to execute|worktree|finish
~/.codex/workflow/bin/codex-workflow team-stop <task-id>
```

For a user-authorized host whose official model cache still marks
`gpt-5.6-luna` as MultiAgentV1, build the credential-free Team catalog
projection before starting a new Codex task:

```bash
atlas-team-model-catalog
```

The helper preserves the official catalog, promotes only the exact Luna entry
to v2 when necessary, and appends the isolated ZenMux catalog entry
`deepseek-v4-flash:deepseek` as v2. It writes
`~/.codex/model-catalogs/atlas-team.json` atomically with mode 600 and never
modifies `models_cache.json`. The user-level `model_catalog_json` must point to
that output. The isolated entry must declare the official `low`, `high`, and
`max` efforts exactly once and set `default_reasoning_level` to `max`.
Regenerate it whenever either input catalog changes. Catalog
metadata remains subject to the host's model allowlist, entitlement, and tool
schema checks.

Record a Team run. The backend defaults to Codex native subagents when
`--backend` is omitted. Any explicit Team-level backend selection, including
Paseo or an explicit native override, requires a controller-attested user or
operator reference:

```bash
~/.codex/workflow/bin/codex-workflow team-record-start <task-id> "<objective>" --mode discuss|execute [--agents N] [--roles "<roles>"]
~/.codex/workflow/bin/codex-workflow team-record-start <task-id> "<objective>" --backend paseo --mode discuss|execute --selection-authority-kind user-message --selection-authority-ref <stable-ref> [--fallback-policy codex|none] [--providers "<planning-hints>"]
~/.codex/workflow/bin/codex-workflow team-record-finalize <task-id> --backend native --status complete|failed|interrupted --round <file> --decision <file> --staffing <file>
~/.codex/workflow/bin/codex-workflow team-loop-record <task-id> --backend native --status loop-done|loop-incomplete|loop-failed|loop-timeout --loop <file> --iterations N [--max-iterations N] [--max-time <duration>]
```

`--agents`, `--roles`, and `--providers` are planning hints rather than fixed
staffing gates. Lane and dispatch selections use immutable
`team-selection-record` events. The control plane is exposed through the
following commands; every mutation requires a stable `--operation-id` so a
controller can safely replay after a crash:

```bash
~/.codex/workflow/bin/codex-workflow team-selection-record <task-id> --operation-id <id> --event-id <id> --kind backend|model --scope team|lane:<id>|dispatch:<id> --authority-kind user-message|operator-input --authority-ref <stable-ref> [--backend native|paseo] [--provider <exact-id>] [--model <exact-id>]
~/.codex/workflow/bin/codex-workflow team-selection-record <task-id> --operation-id <id> --event-id <snapshot-id> --kind capability --authority-ref <controller-observation-ref> --provider <exact-id> --model <exact-id>
~/.codex/workflow/bin/codex-workflow team-lane-record <task-id> --operation-id <id> --action open|close --lane <id> [--backend native|paseo] [--selection-event <id>] [--writable --paths <patterns>]
~/.codex/workflow/bin/codex-workflow team-dispatch-record <task-id> --operation-id <id> --action open|dispose|close --dispatch <id> [--lane <id>] [--required-perspective <id>] [--disposition <value>] [--admitted-attempts <ids>] [--evidence-refs <refs>]
~/.codex/workflow/bin/codex-workflow team-attempt-record <task-id> --operation-id <id> --action reserve|bind|running|observe|terminal|quiesced --attempt <id> [--dispatch <id>] [--launch-operation-id <id>] [--capability-snapshot <id>] [--perspective <id>]
~/.codex/workflow/bin/codex-workflow team-fallback-record <task-id> --operation-id <id> --from-attempt <paseo-id> --to-attempt <native-id> --launch-operation-id <id> [--worktree-fingerprint <digest>] [--evidence-refs <refs>]
```

Backend and fallback policy resolve at dispatch, lane, Team, then default
scope. A capability selection observes the live structured Paseo provider and
model catalogs; attempts reference the resulting snapshot instead of accepting
caller-supplied model-family or digest claims. Claude-family models additionally
require an exact manual model selection event, and unknown families fail closed.
A writable Paseo attempt also requires a callable runtime mode present in the
snapshot. Operational Paseo failures may consume one trusted Retry-After retry,
then default to an atomic native fallback. `--fallback-policy none` records
`backend-unavailable` instead.

Attempt terminal state does not admit a result or release a writer lease.
Admission is a controller disposition. Paseo quiescence requires an adapter
receipt correlated to the exact attempt, launch, and actor; quiescence and
fallback evidence must resolve to real files in the current task artifact tree.
Writable fallback also requires preserved worktree evidence and a takeover
fingerprint. Finalization derives requested, attempted, and effective backends
from the v2 ledger and writes `team/backend-v2.json`; strict lint re-derives it
from `state.json`. A record-only compatibility finalization creates no synthetic
attempt or admission and therefore has `effective_backend=none`. Mixed or
no-result v2 runs use `native` only as the legacy Markdown-header projection.

Round, decision, staffing, loop, observation, and provenance files must live
under the current task artifact tree and contain substantive evidence. The
fake Team runtime under `tests/fixtures/` proves adapter ordering and
idempotency only; it does not prove a live Paseo provider, model, or mode is
available. Live capability remains unverified unless a separately authorized
isolated check records structured evidence.

Run a legacy Atlas-managed bounded team implementation loop when the old
CLI-backed team should keep fixing until the objective and verification command
pass:

```bash
~/.codex/workflow/bin/codex-workflow team-loop <task-id> "<objective>" [--agents N] [--max-iterations N] [--max-time <duration>] [--verify-check "<command>"]... [--verify "<prompt>"] [--archive]
```

`team-loop` runs inside Atlas workflow: each iteration launches
`team-start --mode execute`, records a `team/loop-*.md` ledger, runs optional
`--verify-check` commands, and asks a verifier to put `done=true` or
`done=false` on the first non-empty message line. Each team/check/verifier
substep runs under the remaining `--max-time` deadline; timed-out substeps stop
the loop with `loop-timeout`. Keep loops bounded with `--max-iterations` and
`--max-time`.

Save a durable learning:

```bash
~/.codex/workflow/bin/codex-workflow learn <task-id> "Lesson title" "What to remember"
```

Scaffold a design-fidelity review task plus contract/report/verdict artifacts:

```bash
~/.codex/workflow/bin/codex-design-review init "<title>" "<page url or route>" "<design source>"
```

Lightweight implementation contracts:

- Use `workflow/templates/implementation-contract.md` when machine-checkable
  scope admission, cross-session handoff, audit, or release value justifies its
  maintenance cost.
- Clear, low-risk work may skip the contract even when it changes behavior or
  touches multiple files, provided the acceptance path remains explicit and
  verifiable.
- The contract records goal, non-goals, acceptance criteria, real validation
  steps, evidence paths, and stop conditions. It is the Atlas workflow
  lightweight counterpart to the full Multica sprint contract.

Web UI acceptance uses the dependency-free `codex-web-acceptance` thin layer:

```bash
workflow/bin/codex-web-acceptance audit --project <root> --playwright-config <file> --format json
workflow/bin/codex-web-acceptance run --project-config <config.json> --contract <contract> --artifact-root <run-root> --format json
workflow/bin/codex-web-acceptance check-run --run-root <run-directory> --format json
# Validate/materialize only: an embedded owner decision is reported as registered but unverified.
workflow/bin/codex-web-acceptance review --baf-root <team/acceptance> --card <review-card.json> --format json
workflow/bin/codex-web-acceptance review --baf-root <team/acceptance> --card <review-card-v2.json> --flow-contract <project-flow.json> --format markdown
# Explicitly validate a complete material's owner decision against the current contract and refs.
workflow/bin/codex-web-acceptance review --baf-root <team/acceptance> --card <review-card-v2.json> --flow-contract <project-flow.json> --contract <contract> --check-owner-decision --format json
```

Project adapters and independent claim validators exchange one JSON envelope on
stdin/stdout and are always launched as argv arrays without a shell. Runtime
contracts and TypeScript declarations live under
`workflow/bin/lib/codex-web-acceptance/contracts/`. `run` and `check-run`
produce only a technical result; BAF v2 remains the machine-fact authority and
`business-verdict.json` remains the sole final verdict. The concise Chinese
handoff template is `workflow/templates/web-scenario-review-card.md`; missing
facts must stay explicit and only BAF `integration_mode: real` may be described
as a real run. Review-card v2 resolves actual values only through current,
content-bound evidence IDs and JSON Pointers; its deterministic Markdown is a
view of the validated model and never creates a verdict. Contract-declared
missing facts produce a blocked material with exact gap targets. A blocked
material cannot validate an owner decision. Without `--check-owner-decision`,
JSON and Markdown never expose the decision value; they only say whether one is
registered but unverified.

Refresh Atlas workflow after changing plugin source, workflow helper source, or
native Codex agent source from the Atlas Forge checkout:

```bash
scripts/update-atlas-workflow-plugin
```

Refresh only the installed local plugin copy when you are intentionally using
the low-level cache primitive:

```bash
~/.codex/workflow/bin/codex-refresh-local-plugin atlas-workflow
```

## Notes

- Tasks live in `workflow/tasks/` as markdown files.
- Task artifacts live in `workflow/artifacts/<task-id>/`.
- Active task pointer lives in `workflow/state/current-task.json`.
- Design-review artifacts live in `workflow/design-reviews/` by default.
- Local Atlas plugin source lives under `$CODEX_HOME_ROOT/plugins/atlas-workflow`;
  the installed development copy lives under
  `$CODEX_HOME_ROOT/plugins/cache/local-atlas/atlas-workflow/local`.
- Legacy Atlas learnings are stored in `~/Documents/note/codex-memory/learnings/` by default.
- MemPalace is the default long-term memory and semantic recall layer; Atlas recall/learn commands remain for compatibility.
- The helper also accepts `CODEX_WORKFLOW_ROOT`, `CODEX_WORKFLOW_TEMPLATE_DIR`, and `CODEX_LEARNINGS_DIR` when you need to point it at a temp or alternate location.
