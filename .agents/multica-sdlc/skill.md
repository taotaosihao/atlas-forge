---
name: sdlc-autopilot-protocol
description: Issue-driven Multica protocol for approved PRDs and plans. The leader first classifies the task type, then dynamically staffs the squad: product-research PRD/documentation tasks produce research artifacts, while implementation tasks run planning, implementation, review, validation, repair loops, docs, and draft PR creation without merge/deploy.
---

# Multica Dynamic Task Protocol

The canonical PRD may be Markdown or HTML.

If the PRD is HTML, the HTML is the full source of truth. Any Markdown summary is only a derived execution index. If the HTML and summary conflict, stop before implementation and report a PRD fidelity blocker.

The leader and planner must not assume a fixed squad. They classify the issue and dynamically choose active members by task mode, risk, surfaces, and evidence gaps. Same-role agents may run in parallel only when their outputs can be reconciled and their scopes are explicit.

Dynamic staffing is inventory-first and reuse-first. Before creating or changing any agent, inspect the current workspace agents, their assigned skills, and their active work:
- list agents with `multica agent list --include-archived --output json`
- inspect candidate agents with `multica agent get <agent-id> --output json`
- inspect assigned skills with `multica agent skills list <agent-id> --output json`
- inspect occupancy with `multica agent tasks <agent-id> --output json` and `multica issue list --assignee-id <agent-id> --output json`

If an existing non-archived agent already satisfies a required role through its model, runtime, skills, MCP configuration, and instructions, add that agent directly to the active squad. Do not create or edit an agent for a role that an existing suitable agent can cover.

If a capability gap remains, choose the smallest safe change: add a missing skill, edit an existing idle agent, or create a new agent. Editing includes changing instructions, model, runtime, MCP config, environment, max concurrency, role identity, or skill assignments. Before editing an existing agent, prove that it has no active issue or task. Treat unknown/non-terminal status as active; do not mutate that agent. If the agent is occupied, create a new agent, select another suitable idle agent, or report a staffing blocker that needs human approval.

Task modes:

- `implementation`: build or modify code/config/docs in a repository. Use the full SDLC flow through draft PR.
- `product-research-prd`: analyze an existing product/system and produce PRD/research artifacts. Do not create branches, modify code, open PRs, or run implementation repair loops.
- `design-or-doc-review`: review, critique, or polish artifacts without implementation. Use read-only review and artifact delivery gates.
- `investigation`: diagnose or gather evidence before a later decision. Produce findings, evidence, and recommended next actions.

For `product-research-prd`, staff from product/research roles such as leader, planner, PRD owner, page/IA mapper, domain analyst, mock scenario operator, data/API analyst, UX workflow analyst, technical feasibility reviewer, evidence QA, and documentation editor. Do not staff coder, code reviewer, CI fixer, E2E repair, draft PR owner, or deploy/release roles unless a later human instruction changes the task to implementation.

Known local repositories are recorded in `$MULTICA_STATE_HOME/local-repos.md`. Prefer those local paths before using `multica repo checkout` or cloning.

Evidence manifest policy: for any run with required acceptance or validation
rows, maintain the manifest described in
`$MULTICA_STATE_HOME/instructions/evidence-manifest.md`. The
manifest records acceptance row IDs, validation row IDs, runtime targets,
commit SHA, evidence refs, missing evidence, fallback-only status, wrong-commit
status, and task-type profile evidence. Missing, stale, fallback-only,
static-only, or wrong-commit evidence for required rows blocks the PR-ready
gate.

Worktree policy: during planning, estimate the expected code delta. If the implementation is expected to change more than 100 lines of code, the work must happen in a dedicated git worktree and branch from the configured base branch. Do not implement >100-line estimated changes directly in the main local checkout.
Worktree cleanup policy: do not remove an implementation worktree while its draft PR is still open or under review. After PR review is complete and the PR is confirmed merged into the configured base branch, clean up the dedicated worktree and its local branch if it is safe to do so.

Run the flow as an issue assigned to the Multica leader/squad:

1. PREFLIGHT
   - Classify the task mode.
   - Record the current agent/skill inventory, reuse decisions, proposed edits/new agents, active roles, omitted roles, why each role is needed or skipped, and expected artifacts.
   - Reuse existing suitable agents before proposing new or edited agents.
   - For every proposed edit to an existing agent, record the `agent tasks` and `issue list --assignee-id` evidence proving there is no active issue/task.
2. PLAN
   - If multiple active planner-capable agents exist for the selected task mode, they may run in parallel and the leader reconciles their outputs.
   - For `implementation`, define contract owners for each implementation slice: generator/coder owner, evaluator/E2E owner, optional reviewer or Evidence QA owner, sprint contract artifact path, covered acceptance rows, and the real runtime targets that must be negotiated before coding.
3. EXECUTE
   - For `product-research-prd`, execute discovery, mock-data validation, synthesis, and evidence QA. No branch, code edit, draft PR, implementation review, or repair loop.
   - For `implementation`, continue with IMPLEMENT below.
4. IMPLEMENT (`implementation` mode only)
   - Before coding, complete the contract phase for each assigned slice unless the leader explicitly marks the slice as a tiny implementation with obvious acceptance. Use `templates/sprint-contract.md` as the canonical shape.
   - The generator/coder writes a generator proposal: intended change, boundaries, touched surfaces, assumptions, risks, and proposed validation rows.
   - The evaluator/E2E writes an evaluator challenge before code is written: user-relevant path, real browser/API/CLI/worker/database actions, edge cases, failure conditions, and required evidence.
   - Reviewer or Evidence QA checks scope, testability, evidence refs, required/advisory split, and PRD fidelity when assigned.
   - Implementation may start only after the required generator and evaluator roles report `READY` for the sprint contract, or the leader records a scoped exception.
   - If the plan estimates more than 100 lines of code changes, implementation must use a dedicated git worktree and branch.
   - If multiple active coding-capable agents exist for the same role or role family, they may run in parallel on explicit non-overlapping implementation or repair slices. For example, the default `SDLC Coder`, `SDLC Coder Deepseek`, and `SDLC Coder Antigravity CLI` can all use the `coder` role and act as peers.
5. VALIDATE
   - Dispatch all active same-role or same-role-family review agents in parallel. Do not dispatch archived or removed reviewers.
   - Review agents must score every reviewed agent-produced artifact from 0 to 10 and append simple JSONL scorecards to `$MULTICA_STATE_HOME/agent-scorecards.jsonl`.
   - Dispatch all E2E-capable same-role or same-role-family squad members in parallel for the same commit SHA.
   - Regular DeepSeek E2E and DeepSeek E2E peer results are independent; required E2E agents must all pass for a clean round.
   - Direct Antigravity runtime E2E runs in parallel when the Multica Antigravity runtime agent is online. It is advisory by default unless the issue explicitly requires Antigravity E2E; available FAIL/BLOCKER findings still block.
   - Validation must compare the final implementation against both the PRD acceptance rows and the accepted sprint contract. Missing contract rows, unexecuted required contract evidence, or implementation outside the accepted contract are validation failures unless the leader approved a contract amendment.
6. REPAIR (`implementation` mode only)
7. CLEAN-GATE
   - For `product-research-prd`, clean means required pages/flows/artifacts are covered, evidence is attached, and unresolved gaps are explicit.
   - For `implementation`, clean means the implementation validation gates below pass.
8. PR-READY-GATE (`implementation` mode only)
9. DOCS
   - For `product-research-prd`, docs are the primary output artifacts.
   - For `implementation`, update repo docs only when behavior/API/setup changed.
10. DRAFT-PR (`implementation` mode only)
11. POST-MERGE-CLEANUP (`implementation` mode only)
   - Only after the PR is confirmed merged into the configured base branch, remove the dedicated worktree and delete the merged local worktree branch when safe.
   - If the PR is not merged yet, leave the worktree intact and record the cleanup command/path in the artifact manifest.
12. FAILURE

Success requires:
- high-priority bugs are repaired until cleared; there is no fixed repair-round cap while any P0/P1, HIGH/CRITICAL, BLOCKING, failed required validation, missing required evidence, data-loss/security bug, or PRD acceptance regression remains
- after high-priority bugs are cleared, at most two additional review/repair cycles are allowed for medium/low-risk findings and evidence polish
- if a high-priority bug reappears during the post-high-priority cycles, return to the uncapped high-priority repair loop and reset the post-high-priority budget after it is cleared again
- the latest validation round before draft PR has no high-priority bugs and satisfies the PR-ready gate
- each review and E2E result pinned to a commit SHA
- no high-priority or blocking review findings
- required tests/E2E passing across all required parallel E2E agents
- required acceptance checks executed on the real runtime target appropriate to the task, not only by static reasoning
- no required acceptance check marked skipped, not applicable, or fallback-only unless the PRD explicitly allows that
- evidence manifest present and aligned to the final commit SHA for every required acceptance and validation row
- UI/UX work includes browser screenshots, DOM/layout metrics, console/network evidence, and responsive checks for the PRD's critical screens
- optional Antigravity runtime unavailable status recorded when it cannot run
- docs decision completed
- draft PR opened

For `product-research-prd`, success requires:
- task mode and dynamic staffing decision recorded
- required pages, routes, flows, and data objects covered or explicitly marked unavailable
- mock/test data ledger records what was created, validated, cleaned, or left behind
- evidence artifacts attached: screenshots, DOM/text extracts, network/API evidence, route coverage, gap analysis, and final PRD
- final output is artifacts/research report, not code, branch, or PR

Failure means:
- no PR opened
- blocker report posted to the issue

Do not merge or deploy.
