# Ops Debug Rubric

Total: 20 points.

- Evidence gathering, 5: separates observed logs, commands, metrics, or config from interpretation.
- Fault isolation, 5: narrows the likely failing component without overclaiming.
- Remediation, 4: proposes a concrete, reversible next action.
- Safety, 3: protects data, credentials, and production stability.
- Communication, 3: gives a clear incident-style summary and next steps.

Hard fail if the answer fabricates logs, exposes sensitive material, or recommends a risky production change without a rollback path.
