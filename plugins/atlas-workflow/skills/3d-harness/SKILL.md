---
name: 3d-harness
description: Use the source-checkout-only Atlas 3D Harness to validate reviewed-local 3D scenarios, run the current Mac Playwright/Chromium acceptance flow, recheck complete run roots, or compare semantic state and render-review evidence. Use only from the Atlas Forge source checkout for trusted local Three.js fixtures; do not use it for installed plugins, arbitrary or production pages, other hosts, pixel regression, performance scoring, or release claims.
---

# Atlas 3D Harness

Use the runtime in the same Atlas Forge source checkout. Treat this skill as an
operator guide, not as an installer or a second evidence system.

For a corrected or evidence-challenged design, first apply the shared
[decision supersession protocol](../../references/decision-supersession.md).

## Freeze the boundary first

1. Resolve the repository root with `git rev-parse --show-toplevel` and require
   `plugins/atlas-workflow/tools/atlas-3d-harness/` below it.
2. Require the v0.1 qualified host: local `darwin/arm64`, Node `24.15.0`, and
   the source/browser identities enforced by runtime preflight. Let preflight
   fail closed if any frozen identity has drifted.
3. Accept only `trust_profile: reviewed-local@1`. Inspect the scenario and the
   trusted runtime config before running. Keep their roles separate:
   - scenario is declarative data and must not select executable adapter code;
   - runtime config is trusted operator input for the reviewed project root and
     fixed loopback origin;
   - adapter, validator, launcher, and kernel code come only from this checkout.
4. Never target a production, login-state, remote, customer, unknown, or
   malicious page. This harness rejects browser side effects but is not an OS
   sandbox or malware containment system.

## Do not install implicitly

Never install packages, download Chromium, refresh the plugin/cache, change
host configuration, or publish anything as a side effect of using this skill.
If dependencies or the managed browser are unavailable, report the failed
precondition and show this explicit source-root command:

```bash
node plugins/atlas-workflow/tools/atlas-3d-harness/bin/install-managed-browser.cjs
```

Run it only when the user has separately authorized installation/download.
Never fall back to system Chrome or a user Chrome profile.

## Use the CLI

Set the entrypoint without installing a global executable:

```bash
HARNESS="plugins/atlas-workflow/tools/atlas-3d-harness/bin/atlas-3d-harness.cjs"
```

Validate a strict scenario before any browser work:

```bash
node "$HARNESS" validate \
  --scenario plugins/atlas-workflow/tools/atlas-3d-harness/examples/basic-three/scenario.json
```

Run one reviewed-local scenario. Use a new `run-id`; never overwrite a prior
run root. The runtime config must identify the reviewed project root, fixed
`http://127.0.0.1:41733` origin, `current-mac-arm64@1`, and one attempt.

```bash
node "$HARNESS" run \
  --scenario /absolute/path/to/scenario.json \
  --runtime-config /absolute/path/to/runtime-config.json \
  --artifact-root /absolute/path/to/empty-artifact-root \
  --run-id atlas-3d-example-001
```

Recheck a completed run root. The existing `codex-web-acceptance` check runs
first; the 3D domain check only narrows that result and never repairs an
incomplete, unstable, failed, or tampered root.

```bash
node "$HARNESS" check-run --run-root /absolute/path/to/run-root
```

Compare only two complete roots that both pass native and 3D checks. Choose one
purpose explicitly:

```bash
node "$HARNESS" compare \
  --left /absolute/path/to/left-run-root \
  --right /absolute/path/to/right-run-root \
  --purpose semantic-state

node "$HARNESS" compare \
  --left /absolute/path/to/left-run-root \
  --right /absolute/path/to/right-run-root \
  --purpose render-review
```

Use `semantic-state` for canonical-state equality under hard semantic identity.
Use `render-review` to pair human-reviewable images when render pairing identity
matches. Do not infer pixel equality, performance, quality, or a visual verdict.

## Interpret evidence conservatively

For the frozen v0.1 matrix, require two viewports, two named views, and three
checkpoints: 12 captures and 25 evidence references. For each fresh
viewport/context capture sequence, require exactly one successful reset to the
frozen seed/epoch, then absolute checkpoint seeks with no reset between A-B-A.
Require atomic checkpoint closure with `pending == 0` and
`stateRevision == renderedStateRevision`; treat monotonic `renderRevision` as
an independent presentation revision. A successful reset invalidates older
capture tokens, while a failed checkpoint transaction commits nothing and
preserves the previously valid state and token. Require same-render capture
binding. Keep Expected Contract, Actual Observation, and Validator-derived
Decision distinct; the page and adapter provide facts, not a business verdict.

Report the exact command, run root, native/3D check result, comparison purpose,
and any failed precondition. Describe all results as source-checkout exploration
on the current qualified Mac. Never call them installed-ready, production-ready,
release-ready, deployed, or Linux-compatible.
