# Engineering perspectives for Clarify

Read this only when a material engineering choice or an explicit user request
warrants collaboration. The main agent owns one scope document and the final
engineering choice; every child is read-only.

## Select perspectives around a decision

Name the choice and how different answers affect current delivery, maintenance,
data, permissions or reversibility. Select distinct useful engineering perspectives,
not a fixed committee. Long-term evolution and current delivery often fit:

- Long-term evolution proposes a coherent direction and identifies current maintenance costs, hard-to-reverse choices and unsupported future assumptions.
- Current delivery proposes the smallest complete implementation using current code, identifies known limits and conditions for revisiting them, and preserves necessary safety, quality and acceptance.

Replace, combine or add perspectives when the decision needs something else;
for example, migration compatibility and structural simplification. Do not keep
the common pair and add roles automatically. Either perspective may recommend
more or less structure: current duplication, errors or costly rework can justify
a bounded structural improvement now. Do not demand artificial disagreement.

## Discuss before writing the contract

1. Give each role the original user request, approved decisions, relevant raw evidence/code and authority boundaries, not just the main agent's interpretation. A bounded shared intent packet is sufficient; a finished contract is not a prerequisite.
2. Let the roles independently propose an engineering option, supporting evidence and critical assumptions before showing peer conclusions.
3. Exchange only material objections about implementation, risk or acceptance with the same actors. Ask them to respond directly and revise their options where warranted; inspect a disputed call path or safe counterexample when it can change the choice.
4. The main agent decides from evidence and the current goal. Do not vote, mechanically average options or merge all suggestions into requirements. A concern needs a current-task reason before it becomes required work.
5. Relevant roles compare the final clauses with the original user intent, approved decisions and the discussion outcome. Keep deliberation history outside the executable scope body.

Converge when no unresolved disagreement changes delivery, its safety or reachable
acceptance. Round counts, time, agent count and unanimous preference are not stop
conditions. Unrelated improvements do not prolong this task. If no new evidence
can resolve a necessary fact, report the gap rather than repeat the debate.
Ask the user only for a change of goal, authority, necessary acceptance or a
user-owned tradeoff. Current implementation choices remain the main agent's job.

## Native dispatch and existing boundaries

Before the first dispatch, read the current native collaboration and exact-model
routing rules in [Team](../../team/SKILL.md). Follow its planning/contract-review
preflight and current host profiles: planning uses `gpt-6-astra` / `max`, and
plan/contract review uses `gpt-6-astra` / `xhigh`, with `fork_turns="none"`.
An unavailable exact model fails closed; engineering perspectives do not select
implementation Saving merely because the enclosing task has execute authority.
Do not alter the root model/provider, shared policy or host configuration.

Admit each lane with a Goal/current-required reference, explicit consumer, ready
input, bounded evidence domain, expected output, authority and stop condition.
The main agent is the consumer. Automatic deliberation needs the material
tradeoff identified above; other fact-finding children need concrete latency or
current-risk value. An explicit collaboration request authorizes staffing without
expanding scope and waives only that extra value proof. Coalesce duplicate lanes
and defer dependency-not-ready lanes.

When two or more admitted, ready, non-duplicate child lanes exist, run them in
parallel. A Clarify wave has at most three child lanes:
`child_count = min(ready admitted lanes, host available child slots, 3)`.
This is controller policy, not a runtime scheduler invariant. The soft wave cap
is not a role-total, completion or stop condition; dispatch another useful wave
when its inputs are ready.

Use native collaboration by default. Paseo requires an explicit Team/lane/dispatch
selection and its existing rules; do not infer it from a multi-agent request.
Unavailable exact spawn schema/profile/model/reasoning/backend routes and
confirmed cost anomalies fail closed instead of creating generic substitute fan-out.

The main Codex is the sole canonical scope/artifact writer and final synthesizer.
Child findings cannot expand the Goal, create workflow artifacts or write project
documents. These read-only lanes need no writer lease. Discussion does not enter
Team execute or create a writable attempt; any later implementation preserves
the existing authority and lease/quiescence rules.

If a child cannot start, times out, becomes unavailable or returns no usable output,
continue main-only only when safe; otherwise stop and report the blocker. Disclose
which admitted perspective was unavailable and never report a degraded main-only
result as completed multi-agent clarification or independent review.
`record-only` and `effective_backend=none` are compatibility outcomes, not parallel evidence.

Keep staffing, model choice and release target independent. Discussion and model
routing do not grant implementation, commit or release authority. Ordinary Task/CW
do not auto-upgrade to Team.
