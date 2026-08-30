# Machine implementation contract authoring

Read this only after choosing a machine-checkable implementation contract.
Discussion, task size or a short request alone does not require one.

## One current scope body

Copy and fill the existing workflow helper's `implementation-contract.md` or
`implementation-contract.final.md` template: use its `CODEX_WORKFLOW_TEMPLATE_DIR`
override when configured, otherwise the helper module's `templates/` directory
(normally `~/.codex/workflow/templates/`). The source-checkout copies live in
`workflow/templates/`; do not assume that directory exists in the target project.
`scaffold-clarify` creates `clarify.md`, not a machine contract. If the templates
are unavailable, author the required fields below and validate them; do not
install or refresh a runtime just to obtain a template.
Keep one authoritative scope body. Promote a finalized contract in place of an
earlier `clarify.md`, reducing the latter to links and non-duplicated background.
Create `contract-index.md` or a repo bundle only when handoff, audit, release or
existing project authority actually requires it.

Record the agreed Goal and stable requirement meanings, non-goals, accepted
assumptions, executable boundaries, reachable acceptance and verification.
Identify real commands, app/API/CLI entrypoints and legal data prerequisites.
Keep raw logs, traces, videos, HAR, screenshots, API dumps and intermediate
repair output outside Git. Supporting artifacts reference scope rather than repeat it.

## Existing authoring and admission requirements

- for non-tiny implementation work that could spend early phases on
  contracts, scanners, fixtures, headless models, research, or evidence
  before changing the requested behavior, whether `First-code guard` is
  `required` or `not_applicable`
- when `First-code guard` is required, the contract must name
  `first_code_slice`, `first_code_slice_kind`, `first_code_owner`, `first_code_verification`,
  `first_code_stop_before_slice`,
  `allowed_contract_gate_only_until`, `stop_if_no_code_by_phase`, and
  `gate_parallelization_or_deferral_plan`
- for semantics v5/v6, the slice, verification, and stop values are exact
  execution-plan IDs; use `task-completion` only when completion itself is
  the declared stop rather than a later slice
- contract, scanner, fixture, and evidence-only preparation must be bounded
  by phase or step; the first code slice may be fixture-backed, mocked, or
  in-memory, but it must change the product, runtime, API, CLI, workflow, or
  contract-owned behavior under test
- a semantics version 1 contract with a required First-code guard must name
  `stop_if_no_code_by_phase`; the one-phase default for an omitted field
  applies only when interpreting an unversioned historical contract
- for non-tiny user-facing product, frontend, dashboard, editor, player,
  browser, GUI, or site work, whether `Product/UI gate` is `required` or
  `not_applicable`
- when `Product/UI gate` is required, the contract must name
  `first_operable_user_flow`, `browser_entrypoint`,
  `served_ui_validation_action`, `ui_data_mode`,
  `allowed_headless_only_until`, and `stop_if_no_ui_by_phase`; do not add a
  separate safety-gate field when no concrete reachable risk requires one
- served UI evidence must open a real app entrypoint whose HTML document and
  JS/CSS assets are served by a real HTTP server; synthetic HTML,
  `page.setContent`, fulfilled main documents, fulfilled app bundles,
  headless model tests, scanner fixtures, build-only proof, and network
  allowlist capture without a served UI route do not satisfy UI/product
  acceptance by themselves
- the UI thin slice must precede release, perf, soak, and phase evidence
  expansion
- when a concrete reachable safety/data/permission risk would make current
  acceptance unsafe, bind the minimum necessary control to the relevant
  acceptance row or edge case; do not create a standalone safety checklist
  merely because the task has a Product/UI gate
- when an implementation contract is finalized after review, write `implementation-contract.final.md` as a clean rewrite of the final agreed requirements; do not append old contract text, rejected requirements, or review notes into the final executable contract body
- when authority-backed facts determine an environment, status, verification level, or conclusion, state the goal neutrally and place the condition once in an existing invariant, acceptance row, or edge case. If review invalidates an overbroad or stale claim, replace it in place; do not retain it and append exception sections, parallel requirements, per-value matrices, or mirrored prose
- review severity, `required_fix`, affected rows, and remediation prose do not grant scope; for SDD v2, every validated controller finding with `disposition: current-required` remains an executable requirement whether `repair_status` is `open` or `resolved`, while only `open` findings block or create repair feedback
- a safety, data-integrity, or permission finding may become `current-required` only when its controller resolution binds a canonical invariant, a current `acceptance:<ref>`, the current diff or equivalent path/evidence, and a substantive reason explaining why omission blocks or makes that acceptance unsafe; machine validation checks these bindings, not the truth of the prose
- project those admitted findings only into Goal, Acceptance, Completion, Edge Cases, or Required safe fallback; retain `visible-follow-up` and `informational` findings only in `Finding Provenance` or follow-up records
- in semantics-v2 contracts, mark required acceptance and edge-case rows with `goal:<requirement-ref>` or `current-required:<finding_id>` so strict lint can validate attribution without interpreting natural language
- newly authored ordinary contracts use semantics v5, retain the complete semantics-v2 authoring and authority rules, and add exactly one canonical execution-plan schema v3 `atlas-execution-plan+json` fenced block; every executable slice must declare its dependency DAG, keeper outputs, owned/forbidden paths, acceptance ownership, risk/failure/rollback boundaries, positive size budget, and structured checks; semantics v3 is read-only compatibility
- a newly authored `product_release` contract must use semantics v6, include exactly one canonical `atlas-release-intent+json` block, bind the immutable Profile by digest, use execution-plan schema version 4, and place every Profile check in one terminal release-certification slice that transitively depends on every other executable slice; reference the Profile instead of copying its dimension policy into prompts or prose; semantics v4 is read-only compatibility
- use `atlas-slice-size-v2`; every slice must declare `estimated_changed_files`, `estimated_net_loc`, `target_p90_minutes`, `serial_dependency_depth`, and `independent_vertical_count`; the declared dependency depth must equal the plan DAG depth, while estimates above any budget, serial depth above two, more than one independent vertical, or a repository-broad path such as `src/**` or `.` require split or a named, unexpired `size_exception` containing `authority_ref`, `expires_at`, `reason`, and non-empty `compensating_controls`; an exception never downgrades a permanent gate or converts cached, imported, or skipped evidence into a pass

## Target and real verification

Classify target independently of work type. An MVP, Beta, internal test or small
public beta without explicit formal certification is `product_increment`, not
a fourth release-intent branch. Explicit isolated spikes are `exploration`;
`non_product` applies only to standalone work governing no release candidate.
Planning or review that directly authors or gates a named externally usable
candidate retains an already authorized `product_release` target.
An explicit `product_release` must follow [Team's current release rules](../../team/SKILL.md)
before authoring or execution: supported Profile and trusted-producer limits,
exact current authority, immutable identity and terminal sweep rules remain unchanged.
Only completion-derived `release_decision.status=certified` can establish source-level
release readiness; it never proves or authorizes installation, push, deployment,
publication or actual release. Unsupported surfaces fail authoring/admission;
report readiness as `cannot_verify` without inventing a completion `release_decision`
or relabelling the target to bypass the gate.

For `product_increment`, verification requires product startup, the important
end-to-end user flow, related checks that ran and passed, no observed feature, data,
permission or security blocker, and no unauthorized external write. A small public
beta also needs its access, isolation, credential, rollback/close and real-entrypoint
smoke boundaries. If real checks pass but evidence collection fails, report
`证据采集：降级`; failed, unrun or unknown real checks still block.

## Validate the actual contract

Resolve `ATLAS_WORKFLOW_PLUGIN_ROOT` from the loaded Clarify `SKILL.md`, two
directories above its containing skill directory, never from the target project's cwd.

- for a newly authored final contract, run `node "$ATLAS_WORKFLOW_PLUGIN_ROOT/scripts/codex-implementation-contract-lint" --strict --new-authoring --file <implementation-contract.final.md> --authority-slice <canonical-sdd-slice-dir>` and repeat `--authority-slice` for every slice whose goal or `current-required` authority is cited; new authoring requires semantics v5, or semantics v6 for `product_release`; the lint must validate the complete authoring envelope and gates, release intent when applicable, execution plan, exact contract/task identity, goal refs, and finding refs against those canonical artifacts before the contract is execution-ready. `codex-team-brief` must receive the same bounded, duplicate-free authority set, reuse the same full semantic result, and bind its sorted canonical paths plus the current `brief.json`, `brief.md`, optional evidence, paired verdict/resolution, and task-global constraints digests into brief schema v4; any drift before output must produce no executable brief
- Historical semantics-v1 final contracts retain `node "$ATLAS_WORKFLOW_PLUGIN_ROOT/scripts/codex-implementation-contract-lint" --strict --file <implementation-contract.final.md>` read validation. Historical semantics v3/v4 are not new-authoring shortcuts.
- Self-review the final text against user intent and current approved decisions, not only reference IDs or lint success. Remove placeholders, stale/rejected clauses and contradictory copies; label material assumptions and align acceptance with the verification plan.
- Structural lint validates its declared properties, not the truth of requirement meaning or real behavior. Never claim execution-ready when required identity or approval evidence is missing.
- Run `codex-workflow ready` only for the chosen workflow's existing artifact set, not to justify new mirrored documents. Clarification and readiness do not authorize implementation or certify a release.
