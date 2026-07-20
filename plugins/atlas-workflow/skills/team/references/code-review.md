# Deliberative Code Review Reference

Load this reference only when Team is performing a substantive code, phase, or merge-readiness review. The Team skill owns agent selection and lifecycle; this reference supplies a task-adapted review menu and lightweight deliberation shape. It does not require fixed roles, a fixed agent count, a new state machine, or automatic repair.

## Review Packet

Give the selected reviewers a common, bounded packet:

- review objective and current user goal;
- working tree, commit range, pull request, phase, or named-file scope;
- base and head identities when a diff is involved;
- authoritative contract and acceptance references;
- relevant repository instructions and forbidden paths;
- available test, runtime, migration, browser, or release evidence;
- explicit unknowns that the diff cannot establish.

Keep first-round reviewer contexts independent. Each reviewer should form its own position before cross-checking another role's findings.

## Perspective Menu

Recommend only perspectives that materially improve the current review. Two or three complementary perspectives are often enough, but neither that range nor these examples are requirements:

- specification, correctness, security, error handling, performance, maintainability, and tests;
- architecture, interfaces, hidden coupling, compatibility, migration, rollback, and long-term tradeoffs;
- evidence verification, including whether claimed checks actually ran and whether the available inputs support the conclusion;
- domain, operations, release integrity, business acceptance, accessibility, data, or another specialist view justified by the change.

For a material review, consider assigning one perspective the strongest counterargument against accepting the change as-is. This is a responsibility, not a required `architect` role name.

## Evidence And Finding Quality

Report findings at their natural Atlas severity: `Critical`, `Important`, or `Minor`. Severity describes impact and does not grant implementation authority.

Each actionable finding should include:

- a stable local identifier for the discussion;
- path and line when applicable, or the narrowest relevant interface, call chain, schema, or runtime evidence;
- the observed behavior or contract mismatch;
- the concrete risk or user impact;
- a focused recommendation;
- the evidence that supports the claim and any remaining verification gap.

Use review categories as prompts, not universal gates. Select from correctness and edge cases; authentication, authorization, secrets, injection, and trust boundaries; errors and failure semantics; concurrency, transactions, idempotency, and state consistency; performance and resource behavior; compatibility, migration, and rollback; coupling, duplication, and testability; critical-path, failure-path, and regression tests; and system boundaries or long-horizon tradeoffs.

Do not impose language-independent numeric rules for function length, cyclomatic complexity, or nesting depth. Treat them as contextual signals only. Do not claim that absence of a finding proves absence of risk.

## Focused Deliberation

Round 1 is independent review. The main Codex then normalizes duplicate findings, preserves the originating perspectives, and identifies only disagreements that can affect the final recommendation.

In the next round, send a focused dispute back to the same relevant agents. Ask each to distinguish:

1. whether the factual claim is correct;
2. whether the stated impact or severity is justified;
3. whether the issue belongs to the current authorized goal;
4. what evidence would change the role's position.

The main Codex makes an interim ruling from the user goal, authoritative contract, code, tests, and verified runtime evidence. A third round is useful only when new evidence, a corrected interpretation, or a final consistency check can materially advance convergence. Keep settled findings settled unless new evidence appears.

Ordinary differences in wording, duplicate identity, non-blocking severity, or clearly governed scope do not need unanimous agreement. If a blocking disagreement survives several useful exchanges without a new evidence path, or requires an owner to choose a product, compatibility, permission, or risk tradeoff, return it for human decision instead of extending the internal debate.

## Synthesis

Lead with:

- final recommendation;
- `CONSENSUS`, `CONSENSUS_WITH_RESERVATIONS`, or `HUMAN_DECISION_REQUIRED` when useful;
- blockers and material evidence gaps;
- non-blocking watch items and visible follow-ups;
- actual review scope, perspectives used, and checks performed.

When `APPROVE`, `COMMENT`, and `REQUEST_CHANGES` are appropriate to the host review surface:

- use `REQUEST_CHANGES` for an unresolved current-goal blocker;
- withhold approval when a material evidence gap could conceal a blocker or when the claimed independent review did not occur;
- use `COMMENT` when only non-blocking reservations or follow-ups remain;
- use `APPROVE` only when the claimed review has adequate independent evidence and no unresolved disagreement can materially change the recommendation;
- use `HUMAN_DECISION_REQUIRED` instead of majority voting when a material unresolved choice belongs to the user or another owner.

Make blockers impossible to miss. Keep raw agent transcripts and repetitive intermediate debate outside Git unless audit or handoff value specifically justifies a durable record.

## SDD Interoperability

This reference does not replace the Team SDD contracts. When SDD is active, new canonical verdicts still use `review-verdict` schema v2, the main Codex remains the only workflow-artifact writer, and validated controller resolution remains the finding-scope authority. Reviewer severity, recommendations, concessions, or objections discover and refine evidence; they do not grant repair scope. Keep intermediate deliberation transient unless the current contract requires a durable handoff conclusion.
