# Verification selection and diagnostic lifecycle

Use this guidance when choosing or inheriting checks, measurements or diagnostic
code. It is execution guidance, not a checklist, new approval, registry or
requirement to justify every command in a separate artifact. Reuse the current
acceptance and result carrier. Loading it does not activate Business Acceptance,
BAF or release certification.

- **Select for the current decision.** Use existing checks that establish a
  required outcome, protect the next action or resolve uncertainty that could
  change the implementation. Run focused checks first and broaden with the
  affected behavior. A prerequisite check must protect that action or address
  evidence that the next run would be invalid; do not routinely preflight every
  environment, fixture, oracle or sampler. Record the exact command and reason
  when a required check cannot run.
- **Limit failure to the conclusion it affects.** An optional diagnostic's
  missing measurement makes that explanation unavailable; it does not invalidate
  independently established acceptance. If a measurement is necessary for a
  required performance claim, a valid comparison or a safety control, its failure
  still makes that conclusion failed or unknown. A diagnostic label cannot hide
  a real failure, and a recorder failure cannot turn an unrun or failed business
  step into a pass.
- **Reuse applicable evidence.** One sampler, startup/recovery check or complete
  journey may serve several acceptance items. A new slice, reviewer or report
  name does not require another run. Recheck affected conclusions when relevant
  code, configuration, identity, environment, data, measurement method, oracle
  or acceptance meaning changes; do not reuse a pass when applicability is
  unknown. A final suite's included checks satisfy those requirements in that
  run; do not repeat them just to check off another name. Identify a candidate
  by its tree or build identity rather than a per-file hash ledger; keep file
  hashes only where a later check depends on them, such as the same build across
  a long or final run, proof that an unavoidable authorized temporary change was
  reverted, or a migration with history checksum obligations. Formal gate, receipt,
  freshness and final-candidate rules remain binding.
- **Build focused checks from real producers.** When a focused test stands in
  for an in-repository producer across a boundary, build its fixture from that
  producer's actual output, by calling it or capturing what it emits; a
  hand-written record there expresses a deliberate negative case, not a positive
  pass. Pure-function tests and external producers keep their own inputs. When a
  complete journey exposes a defect that a focused check missed, first make the
  focused check fail for the same reason, then repair.
- **Retire answered diagnostics.** Once an experiment has answered the current
  question or is explicitly closed, stop adding samples. Under the current edit
  authority, remove newly introduced temporary runners, duplicate sampling and
  tests that only lock a historical implementation when they have no remaining
  purpose in the active chain. Preserve historical source/results and regression
  coverage of required product behavior. This does not authorize unrelated
  cleanup or deletion of user work.
- **Do not widen side effects for diagnosis.** Preserve the original failure and
  existing logs. Extra stderr is not authority to replay a migration, resend a
  device action or perform another write. An already authorized recovery follows
  its own conditions.
- **Make the cause observable before rerunning.** When existing output does not
  show why a check failed, first add a durable observation at the failing
  boundary, such as a structured rejection reason, a preserved error body or a
  dead-letter summary, and reach it with the smallest check. Do not temporarily
  edit migrations, fixtures or product code to print a cause and then revert
  them. Rerunning a complete journey only to see an error is a last resort.
- **Treat a repeating repair loop as a design signal.** Progress means new
  information that narrows the remaining work. When the same failure signature
  recurs without new information, or a new branch breaks the same consumer
  again, stop rerunning and analyze the shared cause across the affected
  branches. Research the established industry solution for that class of
  problem, choose and record the approach, and continue within the current
  goal, contract and edit authority; changing frozen scope, acceptance or owned
  paths uses its existing amendment path. Ask the user only when the choice
  needs a person: product intent, risk acceptance, permission or authority, an
  external state change, or reversing an active user decision. Rounds and tokens
  remain telemetry, not stop conditions.
- **Stop on sufficient evidence.** After related checks pass, repeat or expand
  only for new changes, failures or unresolved risks. If a claimed benefit drives
  a decision, use a proportionate comparison under the same relevant conditions
  where practical, preserving required safety, permissions and product behavior;
  disclose confounders. Request a further experiment only if its missing evidence
  could change that decision and the experiment is authorized. Do not require
  causal experiments for ordinary work or claim savings from mixed measurement
  methods. Complete the required journeys and postconditions: detector self-tests
  prove the detector, and configuration checks prove configuration, not additional
  business outcomes.

Permission, data integrity, resource ownership, concurrency isolation, final-send
eligibility, uncertain-result handling, required migration/recovery and real
business readback are concrete purposes; they do not need a prior incident to
justify protection. This guidance never lowers an approved requirement or lets
prose override formal admission or release evidence.
