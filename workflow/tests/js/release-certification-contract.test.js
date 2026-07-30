"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const ANCHORS = path.join(ROOT, "test/fixtures/implementation-contract/release-certification/anchors.json");
const {
  BUNDLED_PROFILE_DIGESTS,
  PROFILE_DIMENSIONS,
  assertBundledComponentIntegrity,
  assertBundledProfileIntegrity,
  loadBundledProfile,
  profileBinding,
  validateProfile,
} = require(path.join(
  ROOT,
  "plugins/atlas-workflow/contracts/release-certification/validators/profile",
));
const {
  ISOLATION_BOUNDARIES,
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

test("anchor corpus stays small, explicit, and fail-closed", () => {
  const cases = JSON.parse(fs.readFileSync(ANCHORS, "utf8"));
  assert.ok(cases.length >= 8 && cases.length <= 12);
  assert.equal(new Set(cases.map((item) => item.case_id)).size, cases.length);
  assert.ok(cases.every((item) => typeof item.must_not_pass_reason === "string" && item.must_not_pass_reason.length >= 20));
  assert.ok(cases.some((item) => item.expected_release_decision === "denied"));
  assert.ok(cases.some((item) => item.expected_release_decision === "cannot_verify"));
  assert.ok(cases.some((item) => item.target_delivery_class === "exploration"));
});
