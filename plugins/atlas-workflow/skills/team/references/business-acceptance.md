# Business Acceptance Protocol

Load this reference when a user request, PRD, approved design/plan, selected
contract, or Team decision requires a business scenario, stakeholder
acceptance, domain state transition, protocol/device closure, or
`team/acceptance/` artifact. A business-function delivery must load these
shared rules from Task or Team without an extra protocol selection; direct Team
entry does not depend on Task having loaded them first. A Project Verification
Map is optional and is never a prerequisite.

## Activation

- Technical checks alone are insufficient to judge the named business workflow.
- When a selected contract requires business acceptance artifacts, it names the
  business scenarios, expected state transitions, evidence sources, and
  acceptance owner. Without that contract, the current approved design/plan or
  task determines the applicable requirements; this reference does not force a
  BAF artifact.
- Product Design and Clarify establish the applicable business standard and the
  way to verify it; Task and Team execute that same standard and report the
  observed result. Reuse the existing task/contract/scenario/report carrier.
- Ordinary library, CLI, refactor, maintenance, and technical Team tasks do not
  activate this protocol.
- An explicit video-and-manual request loads only **Optional operation-guide
  delivery** below; for a non-business task it does not activate the rest of this
  business protocol or require BAF artifacts.
- BAF artifacts are created only when the selected contract requires them; this
  shared reference does not add a new schema, validator, approval, or runner.

## Dual-Goal Work

When a workflow spans both protocol/device integration and a user-facing business UI, keep the goals independent:

- Goal A proves the named real or approved-simulator integration path, action, response/callback, persisted state, and audit evidence.
- Goal B proves that the operator can complete the named UI workflow against integration-backed data and actions.
- Backend/protocol evidence cannot replace UI acceptance, and mock-only UI evidence cannot replace required integration closure.

For a `product_release`, the strict critical journey uses the named real integration path; an approved simulator is valid only when a non-release contract explicitly selects it. Both goals must bind the same final candidate and content-addressed evidence. An accepted release fact permits no conditional status, blockers, unresolved deviations, or acceptance follow-ups.

## Artifacts And Verdict

- Use the existing Team business-acceptance schemas and validators as the exact field contract; do not reproduce their full schema in prompts.
- Create only the scenario/evidence/verdict artifacts required by the selected contract. Do not generate the full BAF set for unused goals.
- A passed or conditional verdict requires current evidence for every required goal. Missing external evidence is a concrete blocker, not permission to invent substitute evidence or expand the roadmap.
- Reviewer findings outside the authorized business goal are follow-ups unless they make the current delivery unsafe.

## Release Fact Boundary

In release mode, this protocol supplies only the Profile-bound `critical-journey` fact through the official Business Acceptance adapter. An unconditional accepted verdict with both required goals and real integration may map to `passed`; rejected or failed acceptance maps to `failed`; conditional, blocked, missing, ambiguous, simulator-only, or unresolved evidence maps to `cannot_verify` according to the adapter contract.

The verdict and acceptance report remain claims until a workflow-bound producer receipt binds their source, producer, requirement, and immutable candidate. Content addressing alone does not establish that provenance; without it, the effective release fact is `cannot_verify`.

Business Acceptance completion or stakeholder approval never grants certification. Only the Team execution-vnext completion-derived `release_decision.status` may be reported as the source-level release-readiness result, and its `certified`, `denied`, or `cannot_verify` value must be preserved exactly. Even `certified` does not prove or authorize installation, push, deployment, publication, or actual release.

## Design-led business acceptance

For a business-function delivery, determine acceptance from the current valid
design, approved flow, business rules, and user decision before looking at the
implementation. Compare only requirements that affect the named result:
required layout/content, key interaction, role or permission, business-state
feedback, durable outcome, and required recovery. Do not add an unapproved
visual system, viewport matrix, or feature merely because an implementation
could support it.

The verification unit is every complete business journey required by the
current scope, one journey at a time. Identify the role, ordinary startup and
entrypoint, legal starting data, required steps, and final business result.
Execute every required step with the same related objects and IDs, including
API, Worker, callback, persistence, downstream page, or export only when that
path belongs to the journey. At the end, compare any report/export with the
same batch of business data and the configuration used earlier in the journey.
Do not combine different candidates, instances, or seed data into a synthetic
full-flow result, and do not replace required journeys with the easiest one.

If the design requires a UI action, perform that action through the UI. API
calls may prepare explicitly allowed data or read back a durable result; they
cannot bypass an absent or broken UI. Approved mock data or responses support
only their stated simulation boundary and cannot prove a real integration.
Record a short design-to-observation comparison in an existing scenario card or
report when useful; the five-column table is optional, not a new required
format. Reuse existing evidence channels rather than creating another sink.

An unapproved design difference, skipped/failed/unknown step, broken object
association, or inconsistent final result means the complete journey is not
accepted. A local test, health check, HTTP 200, green unit test, screenshot, or
partial page cannot be averaged into acceptance. A recorder/evidence collector
failure may be reported as `证据采集：降级` only after every applicable real
check has actually passed; a failed, unrun, or unknown real check still blocks.
Repair only under the current implementation authority and rerun the affected
complete journey; this reference never authorizes product or external writes.

## Design and planning handoff

Product Design establishes the role, ordinary entry, complete business path,
visible behavior, durable result, and important recovery in its existing C/D
artifacts before the relevant design approval. E is a reference and approval
index only. Clarify carries those requirements into the applicable environment,
legal role/data prerequisites, actions, expected result, readback, and evidence
method. A lightweight scope document uses its existing Acceptance Criteria and
Verification Plan; a selected machine contract uses its existing Acceptance
Criteria and Real Validation Plan. Neither path requires a new contract type,
Map, or early verification run.

Task and Team inherit the same current design/plan requirements for execution,
including when Team is entered directly. If no prior design or plan artifact is
needed for a clearly small task, state the applicable requirements in the
current task and do not force a planning route. Keep planned, discovered, and
executed entrypoints distinct; a planned or missing entrypoint is a dependency
or blocker, not evidence that the behavior exists. E, a Map, or a verification
plan cannot silently add, remove, or lower an approved requirement, and
planning completion is not execution readiness or business acceptance.

At delivery, hand the user the same candidate's reproducible entrypoint, role
and legal data prerequisites, steps actually driven, final result, direct
evidence, and any remaining breakpoints. Agent self-tests, static checks, and
reviewer agreement are implementation evidence, not user approval of the
business outcome. User revalidation confirms a result that the agent has
already exercised; it must not be the first discovery that a required step was
never run.

## Optional operation-guide delivery

Record the delivery choice in the current Verification Plan / Real Validation
Plan: **标准验收** (default) or **操作手册式验收：视频 + 文档**. An explicit
request for video and accompanying documentation selects the latter without
another confirmation. Task and direct Team inherit this choice; no Map, BAF,
global setting, new CLI option, or additional business action is required.

When selected, deliver both a real-operation MP4 and an offline HTML operation
manual together in a retained, user-accessible directory. Embed screenshots in
the HTML and link the video relatively; do not depend on remote assets or leave
the only deliverables in a disposable run directory. Raw recordings and logs
remain in the existing evidence channel, outside Git by default. Voice-over is
optional; Chinese step titles and necessary explanations must be visible in
the video itself. PDF is an additional format only when requested.

Use one set of scenario steps for both outputs. Each required step identifies
its number, purpose, entry/control, action, necessary explanation, expected and
observed result, corresponding screenshot, and final-video time range. The
manual explains prerequisites, role, environment/version, the complete journey,
result confirmation and applicable recovery; it must be usable without playing
the video. Do not turn internal review fields or logs into operator prose.

Record the actual authorized journey on the same candidate, instance and related
objects. Show the before state, action and feedback. Keep key actions at normal
speed, allow time to read, make the target visible and keep captions off the
controls. Prefer 1080p where appropriate, but judge readability at the actual
playback size. Mark shortened waits or edits and recompute final timecodes;
never edit away failures to imply success. Screenshots and timestamps must
match the recorded run. Synthetic UI or screenshot animations cannot substitute
for real recording; an approved simulator still proves only its stated boundary.
Avoid credentials and unrelated personal data; redaction must not hide the
result needed for acceptance.

Check recording and export capability before the journey. Reuse the project's
adapter and installed tools; missing capability does not authorize installation,
new business writes, device actions or a side-effecting rerun. For
`codex-web-acceptance`, the project adapter may use its own `adapter.argv` options;
declare both files in existing `required_evidence` and use an independent
material validator with `input_context: "run-context@1"` to inspect the actual
files. Do not add unknown project-config fields. Bind the step content to the
frozen contract or registered content evidence, not merely an external filename.

Check that the video decodes, the offline document opens, all required steps
and timecodes correspond, and linked resources remain usable when the directory
moves. Then watch the full video and read the manual to assess clarity; file
existence, hashes and static tests cannot prove readable instruction. The
source-only [local adapter example](../../../../../workflow/examples/operation-guide/README.md)
demonstrates this integration, not automatic support in every project.

Keep business results and material results separate. If the real checks passed
but either deliverable is missing, broken, unreadable or incomplete, report
“业务流程检查通过；操作资料未完成”. The usual evidence-collection degradation
does not complete this selected delivery and must not silently fall back to
standard acceptance. Preserve runner statuses: material failure fails that
attempt and may produce aggregate `failed` or `unstable`; neither is completed
delivery. Materials cannot override a failed, unrun or unknown business step,
grant stakeholder approval, or change release certification.
