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
  run; do not repeat them just to check off another name. Formal gate, receipt,
  freshness and final-candidate rules remain binding.
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
