"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const ANCHORS = path.join(ROOT, "test/fixtures/implementation-contract/release-certification/anchors.json");
const {
  BUNDLED_PROFILE_DIGESTS,
  INTEGRATED_PROFILE_DIMENSIONS,
  INTEGRATED_SURFACE_KINDS,
  PROFILE_DIMENSIONS,
  assertBundledComponentIntegrity,
  assertBundledProfileIntegrity,
  loadBundledProfile,
  profileBinding,
  profileSurfaceKinds,
  validateProfile,
} = require(path.join(
  ROOT,
  "plugins/atlas-workflow/contracts/release-certification/validators/profile",
));
const {
  ISOLATION_BOUNDARIES,
  extractContractWorkType,
  extractReleaseIntent,
  validateReleaseIntent,
} = require(path.join(
  ROOT,
  "plugins/atlas-workflow/contracts/release-certification/validators/release-intent",
));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

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

function integratedProductIntent() {
  const profile = loadBundledProfile("integrated-app-v1");
  return {
    schema_version: 2,
    target_delivery_class: "product_release",
    target_delivery_authority_ref: "goal:REL-INTEGRATED-PRODUCT",
    release_stage: "mvp",
    surface_inventory: { ref: "AC-INTEGRATED-SURFACE", sha256: digest("c") },
    surface_kinds: [...INTEGRATED_SURFACE_KINDS],
    release_profile_refs: [{
      profile_ref: "integrated-app-v1",
      profile_sha256: profileBinding(profile).profile_sha256,
    }],
    release_claim_refs: ["AC-INTEGRATED-CLAIM"],
    audience_refs: ["AC-INTEGRATED-AUDIENCE"],
    critical_outcome_refs: ["AC-INTEGRATED-OUTCOME"],
  };
}

test("bundled web-ui-v1 is immutable, complete, and non-waivable", () => {
  const profile = loadBundledProfile("web-ui-v1");
  assert.deepEqual(profile.requirements.map((item) => item.dimension), PROFILE_DIMENSIONS);
  assert.equal(validateProfile(profile).length, 0);
  assert.match(profileBinding(profile).profile_sha256, /^sha256:[a-f0-9]{64}$/);
  assert.equal(profileBinding(profile).profile_sha256, BUNDLED_PROFILE_DIGESTS[profile.profile_id]);
  assert.ok(profile.requirements.every((item) => item.required && item.waiver_policy === "never"));

  const mutated = clone(profile);
  mutated.requirements[0].assertion = "A changed policy under the same profile identity.";
  assert.throws(() => assertBundledProfileIntegrity("web-ui-v1", mutated), /integrity mismatch/);

  const replacedComponent = clone(profile);
  replacedComponent.requirements[0].check_definition.collector_adapter.sha256 = digest("0");
  assert.throws(() => assertBundledComponentIntegrity(replacedComponent), /component integrity mismatch/);

  const incomplete = clone(profile);
  incomplete.requirements.pop();
  assert.ok(validateProfile(incomplete).some((error) => error.includes("exactly 7")));

  const waiver = clone(profile);
  waiver.requirements[0].waiver_policy = "owner-approved";
  assert.ok(validateProfile(waiver).some((error) => error.includes("must equal never")));
});

test("bundled integrated-app-v1 is immutable, complete, and candidate-atomic", () => {
  const profile = loadBundledProfile("integrated-app-v1");
  assert.deepEqual(profile.surface_kinds, INTEGRATED_SURFACE_KINDS);
  assert.deepEqual(profileSurfaceKinds(profile), INTEGRATED_SURFACE_KINDS);
  assert.deepEqual(profile.requirements.map((item) => item.dimension), INTEGRATED_PROFILE_DIMENSIONS);
  assert.equal(validateProfile(profile).length, 0);
  assert.equal(profileBinding(profile).profile_sha256, BUNDLED_PROFILE_DIGESTS[profile.profile_id]);
  assert.ok(profile.requirements.every((item) => (
    item.required
    && item.waiver_policy === "never"
    && item.check_definition.required_candidate_components.length === 13
  )));

  const mutated = clone(profile);
  mutated.surface_kinds.pop();
  assert.throws(() => assertBundledProfileIntegrity("integrated-app-v1", mutated), /integrity mismatch/);
  assert.ok(validateProfile(mutated).some((error) => error.includes("surface_kinds")));

  const missingRequirement = clone(profile);
  missingRequirement.requirements.pop();
  assert.ok(validateProfile(missingRequirement).some((error) => error.includes("exactly 12")));
});

test("Profile schema branches preserve the same fixed identities as the JS validator", () => {
  const schema = JSON.parse(fs.readFileSync(path.join(
    ROOT,
    "plugins/atlas-workflow/contracts/release-certification/profile.schema.json",
  ), "utf8"));
  const web = loadBundledProfile("web-ui-v1");
  const integrated = loadBundledProfile("integrated-app-v1");
  const branches = schema.$defs;
  assert.equal(branches.webUiProfileV1.properties.profile_id.const, web.profile_id);
  assert.equal(branches.integratedAppProfileV2.properties.profile_id.const, integrated.profile_id);
  assert.deepEqual(
    branches.webUiProfileV1.properties.requirements.prefixItems.map((item) => (
      item.properties.requirement_id.const
    )),
    web.requirements.map((item) => item.requirement_id),
  );
  assert.deepEqual(
    branches.integratedAppProfileV2.properties.requirements.prefixItems.map((item) => (
      item.properties.requirement_id.const
    )),
    integrated.requirements.map((item) => item.requirement_id),
  );

  const alternateWebIdentity = clone(web);
  alternateWebIdentity.profile_id = "alternate-web-v1";
  alternateWebIdentity.requirements.forEach((item) => {
    item.requirement_id = item.requirement_id.replace("web-ui-v1", "alternate-web-v1");
    item.check_definition.definition_id = item.check_definition.definition_id
      .replace("web-ui-v1", "alternate-web-v1");
  });
  assert.ok(validateProfile(alternateWebIdentity).some((error) => error.includes("must equal web-ui-v1")));

  const reordered = clone(integrated);
  [reordered.requirements[0], reordered.requirements[1]] = [
    reordered.requirements[1], reordered.requirements[0],
  ];
  assert.ok(validateProfile(reordered).some((error) => error.includes("dimension: must equal")));

  const alternateDefinition = clone(integrated);
  alternateDefinition.requirements[0].check_definition.definition_id = "alternate.definition.v1";
  assert.ok(validateProfile(alternateDefinition).some((error) => error.includes("definition_id: must equal")));
});

test("product release stages share the same pure web UI profile", () => {
  for (const stage of ["mvp", "beta", "limited_release", "general_availability", "scaled"]) {
    const intent = productIntent();
    intent.release_stage = stage;
    assert.deepEqual(validateReleaseIntent(intent), []);
  }

  const unsupported = productIntent();
  unsupported.surface_kinds = ["api"];
  assert.ok(validateReleaseIntent(unsupported).some((error) => error.includes("pure web_ui")));

  const staleProfile = productIntent();
  staleProfile.release_profile_refs[0].profile_sha256 = digest("b");
  assert.ok(validateReleaseIntent(staleProfile).some((error) => error.includes("immutable profile")));
});

test("release intent v2 admits only the exact integrated application surface set", () => {
  assert.deepEqual(validateReleaseIntent(integratedProductIntent()), []);

  const missingWorker = integratedProductIntent();
  missingWorker.surface_kinds.splice(2, 1);
  assert.ok(validateReleaseIntent(missingWorker).some((error) => error.includes("exactly match")));

  const reordered = integratedProductIntent();
  [reordered.surface_kinds[0], reordered.surface_kinds[1]] = [
    reordered.surface_kinds[1], reordered.surface_kinds[0],
  ];
  assert.ok(validateReleaseIntent(reordered).some((error) => error.includes("exactly match")));

  const legacyProfile = integratedProductIntent();
  const webProfile = loadBundledProfile("web-ui-v1");
  legacyProfile.release_profile_refs[0] = {
    profile_ref: "web-ui-v1",
    profile_sha256: profileBinding(webProfile).profile_sha256,
  };
  assert.ok(validateReleaseIntent(legacyProfile).some((error) => error.includes("mixed-surface Profile")));

  const newProfileOnV1 = productIntent();
  const integratedProfile = loadBundledProfile("integrated-app-v1");
  newProfileOnV1.release_profile_refs[0] = {
    profile_ref: "integrated-app-v1",
    profile_sha256: profileBinding(integratedProfile).profile_sha256,
  };
  assert.ok(validateReleaseIntent(newProfileOnV1).some((error) => error.includes("pure web_ui Profile")));
});

test("exploration is isolated and cannot claim a product stage", () => {
  const intent = {
    schema_version: 1,
    target_delivery_class: "exploration",
    target_delivery_authority_ref: "goal:REL-EXPLORE",
    artifact_kind: "prototype",
    allowed_claims: ["Tests navigation comprehension"],
    isolation_boundaries: [...ISOLATION_BOUNDARIES],
    promotion_policy: "revalidate",
  };
  assert.deepEqual(validateReleaseIntent(intent), []);

  const leaked = clone(intent);
  leaked.allowed_claims = ["MVP release-ready"];
  assert.ok(validateReleaseIntent(leaked).some((error) => error.includes("cannot claim")));

  const localizedLeak = clone(intent);
  localizedLeak.allowed_claims = ["可以作为正式产品对外发布"];
  assert.ok(validateReleaseIntent(localizedLeak).some((error) => error.includes("cannot claim")));

  const unisolated = clone(intent);
  unisolated.isolation_boundaries.pop();
  assert.ok(validateReleaseIntent(unisolated).some((error) => error.includes("missing mandatory boundary")));
});

test("non-product reasons allow precise product references but reject positive relabeling", () => {
  const intent = {
    schema_version: 1,
    target_delivery_class: "non_product",
    target_delivery_authority_ref: "goal:REL-DOCS",
    deliverable_kind: "documentation",
    not_applicable_reason: "Updates product release documentation without shipping or changing a user-facing candidate.",
  };
  assert.deepEqual(validateReleaseIntent(intent), []);

  const relabeled = clone(intent);
  relabeled.not_applicable_reason = "This task ships an MVP web application but labels it non-product.";
  assert.ok(validateReleaseIntent(relabeled).some((error) => error.includes("cannot be relabeled")));
});

test("release intent block is singular and strict", () => {
  const markdown = `\`\`\`atlas-release-intent+json\n${JSON.stringify(productIntent())}\n\`\`\``;
  assert.equal(extractReleaseIntent(markdown).target_delivery_class, "product_release");
  assert.throws(() => extractReleaseIntent(`${markdown}\n${markdown}`), /exactly one/);

  const unknown = productIntent();
  unknown.author_status = "certified";
  assert.ok(validateReleaseIntent(unknown).some((error) => error.includes("unknown key: author_status")));
});

test("contract work type is singular and normalized for release authority binding", () => {
  assert.equal(extractContractWorkType("work_type: implementation\n"), "implementation");
  assert.equal(extractContractWorkType("work_type: review\n"), "review");
  assert.throws(
    () => extractContractWorkType("work_type: planning\nwork_type: implementation\n"),
    /exactly one work_type/,
  );
  assert.throws(() => extractContractWorkType("work_type: release\n"), /unsupported work_type/);
});

test("anchor corpus stays small, explicit, and fail-closed", () => {
  const cases = JSON.parse(fs.readFileSync(ANCHORS, "utf8"));
  assert.ok(cases.length >= 8 && cases.length <= 15);
  assert.equal(new Set(cases.map((item) => item.case_id)).size, cases.length);
  assert.ok(cases.every((item) => (
    item.scenario_input
    && typeof item.scenario_input.request === "string"
    && item.scenario_input.request.length >= 40
    && item.oracle
    && typeof item.oracle.must_not_pass_reason === "string"
    && item.oracle.must_not_pass_reason.length >= 20
  )));
  assert.ok(cases.every((item) => !Object.hasOwn(item.scenario_input, "target_delivery_class")));
  assert.ok(cases.some((item) => item.oracle.expected_release_decision === "denied"));
  assert.ok(cases.some((item) => item.oracle.expected_release_decision === "cannot_verify"));
  assert.ok(cases.some((item) => item.oracle.expected_release_decision === "certified"));
  assert.ok(cases.some((item) => item.oracle.target_delivery_class === "exploration"));
  assert.ok(cases.some((item) => item.oracle.target_delivery_class === "non_product"));
  for (const [caseId, namedExternal] of [
    ["internal-mvp-product-increment", false],
    ["small-beta-product-increment", true],
  ]) {
    const anchor = cases.find((item) => item.case_id === caseId);
    assert.ok(anchor);
    assert.equal(anchor.oracle.target_delivery_class, "product_increment");
    assert.equal(anchor.oracle.expected_release_decision, null);
    assert.equal(anchor.oracle.team_route, "not_required_for_current_work");
    assert.equal(anchor.scenario_input.target_facts.named_external_candidate, namedExternal);
  }
});
