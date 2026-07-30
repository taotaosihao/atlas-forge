"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const LINTER = path.join(ROOT, "plugins/atlas-workflow/scripts/codex-implementation-contract-lint");
const { loadBundledProfile, profileBinding } = require(path.join(
  ROOT,
  "plugins/atlas-workflow/contracts/release-certification/validators/profile",
));
const {
  releasePlanBinding,
  releaseRequirementProjection,
} = require(path.join(
  ROOT,
  "plugins/atlas-workflow/contracts/team-sdd/validators/execution-plan",
));

function digest(char) {
  return `sha256:${char.repeat(64)}`;
}

function productIntent() {
  const profile = loadBundledProfile("web-ui-v1");
  return {
    schema_version: 1,
    target_delivery_class: "product_release",
    target_delivery_authority_ref: "goal:REL-PRODUCT",
    release_stage: "mvp",
    surface_inventory: { ref: "AC-SURFACE", sha256: digest("a") },
    surface_kinds: ["web_ui"],
    release_profile_refs: [{
      profile_ref: "web-ui-v1",
      profile_sha256: profileBinding(profile).profile_sha256,
    }],
    release_claim_refs: ["AC-CLAIM"],
    audience_refs: ["AC-AUDIENCE"],
    critical_outcome_refs: ["AC-OUTCOME"],
  };
}

function planningContract(intent, planIntent = intent) {
  const profile = loadBundledProfile("web-ui-v1");
  const binding = profileBinding(profile);
  const plan = {
    schema_version: 2,
    size_policy: { policy_id: "atlas-slice-size-v2" },
    release: releasePlanBinding(planIntent),
    slices: [{
      slice_id: "slice-plan",
      objective: "Define the bounded product release certification plan.",
      depends_on: [],
      keeper_outputs: ["plan:release-certification"],
      owned_paths: ["plugins/atlas-workflow/contracts/release-certification/**"],
      forbidden_paths: ["plugins/multica-sdlc/**"],
      acceptance_refs: ["AC-1"],
      risk_class: "medium",
      failure_domain: "release-planning",
      rollback_boundary: "one planning artifact",
      estimate: {
        estimated_changed_files: 2,
        estimated_net_loc: 100,
        target_p90_minutes: 30,
        serial_dependency_depth: 0,
        independent_vertical_count: 1,
      },
      budget: {
        max_changed_files: 12,
        max_loc: 1200,
        max_wall_clock_minutes: 120,
        max_required_checks: 7,
      },
      checks: profile.requirements.map((requirement) => ({
        check_id: `release-${requirement.dimension}`,
        gate_class: requirement.check_definition.allowed_gate_classes[0],
        command: `atlas-release-collect ${requirement.requirement_id}`,
        final_only: true,
        cache_policy: "fresh-executed",
        release_requirement: releaseRequirementProjection(profile, binding, requirement),
      })),
    }],
  };
  return `# Release planning contract

task_id: fixture-release-v4
contract_semantics_version: 4
finding_scope_admission: controller_current_required_only
safe_fallback_authority: none
work_type: planning
first_code_guard: not_applicable
first_code_not_applicable_reason: Planning defines the release contract without changing runtime behavior.
product_ui_gate: not_applicable
product_ui_not_applicable_reason: Planning does not deliver the served product candidate.

## Release Intent

\`\`\`atlas-release-intent+json
${JSON.stringify(intent, null, 2)}
\`\`\`

## Execution Plan

\`\`\`atlas-execution-plan+json
${JSON.stringify(plan, null, 2)}
\`\`\`

## Acceptance Criteria

| ID | Criterion | Required | Verification | Authority |
|----|-----------|----------|--------------|-----------|
| AC-1 | Define the release plan. | yes | contract lint | goal:REL-PRODUCT |

## Edge Cases

| Case | Expected behavior | Required | Admission |
|------|-------------------|----------|-----------|
| Unsupported surface | Return cannot_verify. | yes | goal:REL-PRODUCT |

## Failure And Stop Conditions

- Stop and ask the user when: the supported product surface changes.
- Treat the task as failed when: release intent validation fails.
- Required safe fallback: not_applicable
- Optional fallback notes: unsupported product surfaces fail closed.

## Finding Provenance

| Finding ID | Disposition | Source | Follow-up |
|------------|-------------|--------|-----------|
| future-api-profile | visible-follow-up | product plan | Define separately. |
`;
}

test("semantics v4 linter consumes release intent while preserving planning activity", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-release-contract-"));
  try {
    const validFile = path.join(temp, "valid.md");
    fs.writeFileSync(validFile, planningContract(productIntent()));
    const valid = childProcess.spawnSync("node", [LINTER, "--file", validFile], { encoding: "utf8" });
    assert.equal(valid.status, 0, `${valid.stdout}\n${valid.stderr}`);
    assert.match(valid.stdout, /semantics_version: 4/);

    const invalid = productIntent();
    invalid.surface_kinds = ["worker"];
    const invalidFile = path.join(temp, "invalid.md");
    fs.writeFileSync(invalidFile, planningContract(invalid, productIntent()));
    const rejected = childProcess.spawnSync("node", [LINTER, "--file", invalidFile], { encoding: "utf8" });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /RELEASE_INTENT_INVALID/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
