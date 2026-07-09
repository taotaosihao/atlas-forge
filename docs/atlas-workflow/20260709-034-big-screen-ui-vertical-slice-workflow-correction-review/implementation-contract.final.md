# Final Implementation Contract

workflow_id: 20260709-034-big-screen-ui-vertical-slice-workflow-correction-review
task_id: 20260709-034-big-screen-ui-vertical-slice-workflow-correction-review
title: Operable UI Vertical Slice Gate for atlas-workflow
contract_status: final
current_authoritative_contract: ./implementation-contract.final.md
created: 2026-07-09
finalized: 2026-07-09
advisor_reviewed: 2026-07-09

## Scope

- Goal: add guidance/template/contract-test support for an `Operable UI Vertical Slice Gate` in `atlas-workflow`.
- Non-goals:
  - Do not implement Big Screen UI.
  - Do not weaken `no-data-plane-direct`, `no-cloud-runtime`, Provider credential, or browser network hard gates.
  - Do not make Goal A/Goal B JSON schema fields globally required in the first patch.
  - Do not rewrite or reorder existing BAF changes.
- Files or surfaces likely affected:
  - `plugins/atlas-workflow/skills/team/SKILL.md`
  - `plugins/atlas-workflow/skills/clarify/SKILL.md`
  - `plugins/atlas-workflow/skills/task/SKILL.md`
  - `workflow/templates/implementation-contract.md`
  - `workflow/templates/implementation-contract.final.md`
  - `workflow/templates/team-staffing.md`
  - optional: `workflow/templates/gate-checklist.md`
  - `workflow/tests/contract.sh`
- User-visible behavior: future Atlas-guided UI/product tasks must declare whether Product/UI gate is required and cannot treat headless/browser-security evidence as UI/product acceptance.

## Product/UI Acceptance Gate

- Ordering rule: for non-tiny user-facing product/UI/browser workflow tasks, a served operable UI thin slice must precede release, perf, soak, and phase evidence expansion.
- Hard safety rule: the served UI thin slice and required hard safety gates must be satisfied together; neither may pass acceptance without the other. `No-data-plane-direct`, `no-cloud-runtime`, Provider credential, and browser network boundary gates must not be skipped, weakened, or deferred after release. "Not an open-ended prerequisite" means safety gates must not indefinitely block the first UI slice; it does not mean safety gates can be bypassed or backfilled.
- Product/UI gate: required for non-tiny user-facing frontend/product/browser workflow tasks.
- First operable user flow: must be named before execution when the gate is required.
- Browser entrypoint: must be a real served app route, such as a dev server, preview server, static served bundle, or project route.
- Served UI validation action: must use a real browser opening the real app entrypoint, preferably `page.goto(real server URL)` or a documented manual equivalent. The HTML document and JS/CSS app assets must be served by a real HTTP server; `page.route` may mock backend/data-plane responses only, not the main document or app bundle.
- Data/runtime mode: may use local fixture, in-memory store, approved simulator, canned control-plane, or real backend, but the boundary must be named and evidence must distinguish mock/stub data from real control-plane/backend data.
- Required safety gates: no-data-plane-direct, no-cloud-runtime, Provider credential not in browser, browser does not direct-request Provider.
- Allowed headless-only work until: must be named when scanner/model/evidence slices precede UI.
- Stop if no UI by phase: if the named phase arrives without served UI evidence, stop expanding headless scanners/evidence and return to clarify/team unless the user explicitly approves deferral. If omitted while the gate is required, default to stopping before release/perf/soak/P0G-style evidence.
- Not applicable exception: allowed only for genuinely headless CLI/worker/library/scanner work or tiny changes that do not alter user-visible UI behavior. A product task with no served app cannot be classified as tiny solely because the requested slice is small.
- Not acceptable as UI/product acceptance by itself: `page.setContent`, synthetic HTML, `page.route(...).fulfill()` main document or app bundle, headless model tests, scanner fixtures, CLI pass, typecheck/build-only proof, network allowlist capture without served UI route.
- Evidence purpose boundary: the non-evidence list applies to evidence claiming UI/product acceptance. Headless model tests, network capture, allowlist capture, and scanner evidence can remain valid safety-gate evidence when they are labeled and reviewed as safety evidence.
- Reverse guard: served UI evidence does not satisfy hard safety gates by itself. If served UI exists but required hard safety-gate evidence is missing, stale, or out of scope, acceptance fails.
- BAF relationship: when Business Acceptance First Mode and this UI gate both apply, served UI evidence does not automatically satisfy BAF Goal B; BAF still requires business scenario evidence.
- BAF edit boundary: first-patch guidance should record this relationship in the UI-gate guidance, team skill, contract templates, staffing, and checklist. Do not rewrite existing BAF templates in the first patch; any later BAF-template change must preserve existing BAF content and run BAF contract tests.

## First Patch Contract-Test Scope

- First-patch contract tests verify that skill guidance, templates, staffing/checklist, and contract tests contain the load-bearing UI gate text: ordering rule, hard safety rule, non-evidence list, evidence purpose boundary, reverse guard, stop default, and not-applicable boundary.
- First-patch contract tests do not claim to implement a complete semantic evidence scanner.
- Semantic evidence scanning, evidence-purpose annotations, JSON/schema enforcement, and accepted-verdict rejection belong to the second phase.

## Acceptance Criteria

| ID | Criterion | Required | Verification |
|----|-----------|----------|--------------|
| AC-1 | `$atlas-workflow:team` documents `Operable UI Vertical Slice Gate` with trigger, ordering, hard-safety, evidence-purpose, non-evidence, stop, and safety-parallel rules | yes | `rg -q "Operable UI Vertical Slice Gate" plugins/atlas-workflow/skills/team/SKILL.md && rg -q "served operable UI thin slice|hard safety|safety gate" plugins/atlas-workflow/skills/team/SKILL.md` |
| AC-2 | `$atlas-workflow:clarify` requires Product/UI gate classification for non-tiny UI/product/browser workflow | yes | `rg -q "Product/UI" plugins/atlas-workflow/skills/clarify/SKILL.md` |
| AC-3 | `$atlas-workflow:task` requires Product/UI gate or tiny/not-applicable exception for user-visible frontend/product UI work | yes | `rg -q "Product/UI" plugins/atlas-workflow/skills/task/SKILL.md` |
| AC-4 | implementation contract templates include UI gate fields and stop defaults | yes | `rg -q "browser_entrypoint|first_operable_user_flow|served_ui_evidence|allowed_headless_only_until|stop_if_no_ui_by_phase" workflow/templates/implementation-contract.md workflow/templates/implementation-contract.final.md && rg -q "release|perf|soak|P0G-style" workflow/templates/implementation-contract.md workflow/templates/implementation-contract.final.md` |
| AC-5 | staffing or gate checklist gives reviewers a served UI evidence slot | yes | `rg -q "served UI|browser_entrypoint|operable-ui" workflow/templates/team-staffing.md workflow/templates/gate-checklist.md` |
| AC-6 | contract tests guard non-evidence rules, evidence-purpose boundary, reverse guard, and load-bearing fields | yes | `rg -q "page.setContent|page.route|synthetic|headless model|allowed_headless_only_until|stop_if_no_ui_by_phase|hard safety|safety evidence" workflow/tests/contract.sh && bash workflow/tests/contract.sh` |
| AC-7 | plugin source and active cache remain synchronized | yes | `codex-refresh-local-plugin atlas-workflow` and `cmp` checks |
| AC-8 | first patch includes a negative evidence guard for reports that claim UI/product acceptance using only synthetic/headless evidence, without rejecting correctly labeled safety evidence | yes | `rg -q "synthetic|page.setContent|page.route|served URL|browser_entrypoint|safety evidence" workflow/tests/contract.sh` |
| AC-9 | first patch includes a reverse guard that served UI evidence does not replace required hard safety-gate evidence | yes | `rg -q "hard safety|no-data-plane-direct|no-cloud-runtime|Provider credential" workflow/tests/contract.sh` |

## Real Validation Plan

| Row | Target | Command or action | Expected result | Phase conclusion evidence |
|-----|--------|-------------------|-----------------|---------------------------|
| V-1 | Formatting | `git diff --check` | pass | final reply |
| V-2 | Atlas contract tests | `bash workflow/tests/contract.sh` | pass | final reply |
| V-3 | Plugin cache sync | `codex-refresh-local-plugin atlas-workflow` + `cmp` source/cache | pass | final reply |
| V-4 | Durable docs bundle index | `node plugins/atlas-workflow/scripts/codex-contract-index-lint --root docs/atlas-workflow/20260709-034-big-screen-ui-vertical-slice-workflow-correction-review` | pass | final reply |

## Failure And Stop Conditions

- Stop and ask the user when:
  - adding the gate would require rewriting unrelated BAF changes;
  - cache refresh fails;
  - contract tests fail for reasons outside the intended change.
- Treat the task as failed when:
  - UI gate weakens safety gates;
  - UI gate is only a suggestion and not represented in contract/staffing/gate templates;
  - headless/browser-security evidence can still be labeled UI/product acceptance without an explicit deferral.
  - served UI evidence can replace missing or stale hard safety-gate evidence.
- Safe fallback:
  - keep this docs bundle as the authoritative plan and defer code changes.

## Provenance

- Based on:
  - `/home/gewu/.codex/workflow/artifacts/20260709-034-big-screen-ui-vertical-slice-workflow-correction-review/team/decision.md`
  - `/home/gewu/.codex/workflow/artifacts/20260709-034-big-screen-ui-vertical-slice-workflow-correction-review/team/round-20260709T065152Z.md`
  - `./glm5.2-advisor-review.md`
  - `./claude-sonnet-5-max-advisor-review.md`
  - `./correction-plan.md`
- Supersedes: none.
- Review history: native team discuss round with workflow-architect, product-acceptance-critic, implementation-verifier; GLM5.2 advisor review; Claude Sonnet 5 max advisor review.

## Final Contract Cleanliness Gate

- [x] This is a clean rewrite of the final agreed requirements.
- [x] Superseded requirements are not included as executable instructions.
- [x] Review notes are linked in provenance, not pasted into the body.
- [x] Required acceptance criteria and validation rows are complete.
- [x] Git evidence stays within the phase evidence budget or the exception is explained.
- [x] Residual risks are recorded.
