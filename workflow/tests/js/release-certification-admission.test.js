"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const PLUGIN_ROOT = path.join(ROOT, "plugins/atlas-workflow");
const BRIEF_BIN = path.join(PLUGIN_ROOT, "scripts/codex-team-brief");
const { validateBrief } = require(path.join(
  PLUGIN_ROOT,
  "contracts/team-sdd/validators/brief",
));
const {
  releasePlanBinding,
  releaseRequirementProjection,
} = require(path.join(
  PLUGIN_ROOT,
  "contracts/team-sdd/validators/execution-plan",
));
const { loadBundledProfile, profileBinding } = require(path.join(
  PLUGIN_ROOT,
  "contracts/release-certification/validators/profile",
));
const { resolvePaths, taskArtifactDir } = require(path.join(
  ROOT,
  "workflow/bin/lib/codex-workflow/core/paths",
));
const { admitTeamStart, bindExecutionAuthority } = require(path.join(
  ROOT,
  "workflow/bin/lib/codex-workflow/team/admission",
));

function digest(char) {
  return `sha256:${char.repeat(64)}`;
}

function productIntent(authorityRef = "user-message:release") {
  const profile = loadBundledProfile("web-ui-v1");
  return {
    schema_version: 1,
    target_delivery_class: "product_release",
    target_delivery_authority_ref: authorityRef,
    release_stage: "mvp",
    surface_inventory: { ref: "AC-SURFACE", sha256: digest("a") },
    surface_kinds: ["web_ui"],
    release_profile_refs: [{
      profile_ref: profile.profile_id,
      profile_sha256: profileBinding(profile).profile_sha256,
    }],
    release_claim_refs: ["AC-CLAIM"],
    audience_refs: ["AC-AUDIENCE"],
    critical_outcome_refs: ["AC-OUTCOME"],
  };
}

function releasePlan(intent) {
  const profile = loadBundledProfile("web-ui-v1");
  const binding = profileBinding(profile);
  return {
    schema_version: 2,
    size_policy: { policy_id: "atlas-slice-size-v2" },
    release: releasePlanBinding(intent),
    slices: [{
      slice_id: "release-slice",
      objective: "Implement and certify the governed Web UI candidate.",
      depends_on: [],
      keeper_outputs: ["release:web-ui-v1:evidence"],
      owned_paths: ["product/release/**"],
      forbidden_paths: ["plugins/multica-sdlc/**"],
      acceptance_refs: ["AC-RELEASE"],
      risk_class: "critical",
      failure_domain: "release-certification",
      rollback_boundary: "one governed product release commit",
      estimate: {
        estimated_changed_files: 2,
        estimated_net_loc: 200,
        target_p90_minutes: 90,
        serial_dependency_depth: 0,
        independent_vertical_count: 1,
      },
      budget: {
        max_changed_files: 4,
        max_loc: 400,
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
}

function contractMarkdown(intent, plan, workType = "implementation") {
  return [
    "# Governed product release",
    "",
    "task_id: release-task",
    "contract_semantics_version: 4",
    `work_type: ${workType}`,
    "",
    "```atlas-release-intent+json",
    JSON.stringify(intent, null, 2),
    "```",
    "",
    "```atlas-execution-plan+json",
    JSON.stringify(plan, null, 2),
    "```",
    "",
  ].join("\n");
}

function git(repo, args) {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function fixture(t, { authorityRef = "user-message:release", workType = "implementation" } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-release-admission."));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const environment = {
    ...process.env,
    ATLAS_WORKFLOW_PLUGIN_ROOT: PLUGIN_ROOT,
    CODEX_HOME_ROOT: home,
    CODEX_WORKFLOW_ROOT: path.join(home, "workflow"),
  };
  const paths = resolvePaths(environment);
  const repo = path.join(home, "repo");
  fs.mkdirSync(repo, { recursive: true });
  git(repo, ["init", "-q"]);
  git(repo, ["config", "user.email", "atlas@example.test"]);
  git(repo, ["config", "user.name", "Atlas Test"]);
  const intent = productIntent(authorityRef);
  const plan = releasePlan(intent);
  const contract = path.join(repo, "implementation-contract.final.md");
  fs.writeFileSync(contract, contractMarkdown(intent, plan, workType));
  git(repo, ["add", "implementation-contract.final.md"]);
  git(repo, ["commit", "-qm", "test: add release contract"]);
  const base = git(repo, ["rev-parse", "HEAD"]);
  const compile = spawnSync("node", [
    BRIEF_BIN,
    "--task", "release-task",
    "--slice", "release-slice",
    "--repo", repo,
    "--base", base,
    "--contract", contract,
  ], { cwd: repo, env: environment, encoding: "utf8" });
  assert.equal(compile.status, 0, compile.stderr);
  const briefPath = path.join(
    taskArtifactDir(paths, "release-task"),
    "team/sdd/slices/release-slice/brief.json",
  );
  return { base, briefPath, contract, environment, intent, paths, plan, repo, workType };
}

test("brief v3 and Team execution-v3 bind an exact semantics-v4 release policy", (t) => {
  const value = fixture(t);
  const brief = JSON.parse(fs.readFileSync(value.briefPath, "utf8"));
  assert.deepEqual(validateBrief(brief), []);
  assert.equal(brief.schema_version, 3);
  assert.equal(brief.contract.semantics_version, 4);
  assert.equal(brief.contract.work_type, "implementation");
  assert.deepEqual(brief.contract.release, value.plan.release);
  const missingWorkType = structuredClone(brief);
  delete missingWorkType.contract.work_type;
  assert.match(validateBrief(missingWorkType).join("\n"), /missing required key: work_type/);

  const admission = admitTeamStart({
    authorizationRef: "user-message:release",
    briefPath: value.briefPath,
    clock: () => new Date("2026-07-30T00:00:00Z"),
    cwd: value.repo,
    environment: value.environment,
    mode: "execute",
    paths: value.paths,
    taskId: "release-task",
  });
  assert.equal(admission.mode, "execution-v3");
  assert.equal(admission.brief.work_type, "implementation");
  assert.deepEqual(admission.brief.release, value.plan.release);
  const state = {};
  const authority = bindExecutionAuthority(state, admission, 1);
  assert.equal(authority.work_type, "implementation");
  assert.deepEqual(authority.release_binding, value.plan.release);
});

test("planning and review keep product_release classification but cannot enter certification execution", (t) => {
  for (const workType of ["planning", "review"]) {
    const value = fixture(t, { workType });
    const brief = JSON.parse(fs.readFileSync(value.briefPath, "utf8"));
    assert.deepEqual(validateBrief(brief), []);
    assert.equal(brief.contract.work_type, workType);
    assert.equal(brief.contract.release.target_delivery_class, "product_release");

    const discussed = admitTeamStart({
      briefPath: value.briefPath,
      clock: () => new Date("2026-07-30T00:00:00Z"),
      cwd: value.repo,
      environment: value.environment,
      mode: "discuss",
      paths: value.paths,
      taskId: "release-task",
    });
    assert.equal(discussed.mode, "discuss-v3");
    assert.equal(discussed.brief.work_type, workType);
    assert.throws(() => admitTeamStart({
      authorizationRef: "user-message:release",
      briefPath: value.briefPath,
      clock: () => new Date("2026-07-30T00:00:00Z"),
      cwd: value.repo,
      environment: value.environment,
      mode: "execute",
      paths: value.paths,
      taskId: "release-task",
    }), /product_release Team execution requires work_type implementation/);
  }
});

test("Team admission rejects missing or replaceable Profile identity", (t) => {
  const value = fixture(t);
  const original = JSON.parse(fs.readFileSync(value.briefPath, "utf8"));

  const missing = structuredClone(original);
  delete missing.contract.release;
  fs.writeFileSync(value.briefPath, `${JSON.stringify(missing, null, 2)}\n`);
  assert.throws(() => admitTeamStart({
    authorizationRef: "user-message:release",
    briefPath: value.briefPath,
    clock: () => new Date("2026-07-30T00:00:00Z"),
    cwd: value.repo,
    environment: value.environment,
    mode: "execute",
    paths: value.paths,
    taskId: "release-task",
  }), /brief release binding does not match/);

  const replaced = structuredClone(original);
  replaced.contract.release.profile_sha256 = digest("b");
  fs.writeFileSync(value.briefPath, `${JSON.stringify(replaced, null, 2)}\n`);
  assert.throws(() => admitTeamStart({
    authorizationRef: "user-message:release",
    briefPath: value.briefPath,
    clock: () => new Date("2026-07-30T00:00:00Z"),
    cwd: value.repo,
    environment: value.environment,
    mode: "execute",
    paths: value.paths,
    taskId: "release-task",
  }), /brief release binding does not match/);

  const replacedWorkType = structuredClone(original);
  replacedWorkType.contract.work_type = "review";
  fs.writeFileSync(value.briefPath, `${JSON.stringify(replacedWorkType, null, 2)}\n`);
  assert.throws(() => admitTeamStart({
    authorizationRef: "user-message:release",
    briefPath: value.briefPath,
    clock: () => new Date("2026-07-30T00:00:00Z"),
    cwd: value.repo,
    environment: value.environment,
    mode: "execute",
    paths: value.paths,
    taskId: "release-task",
  }), /brief work_type does not match/);
});

test("product_release execution requires the exact controller-recordable delivery authority", (t) => {
  const value = fixture(t);
  const admit = (authorizationRef) => admitTeamStart({
    authorizationRef,
    briefPath: value.briefPath,
    clock: () => new Date("2026-07-30T00:00:00Z"),
    cwd: value.repo,
    environment: value.environment,
    mode: "execute",
    paths: value.paths,
    taskId: "release-task",
  });
  assert.equal(admit("user-message:release").brief.delivery_authority_ref, "user-message:release");
  assert.throws(() => admit("user-message:other"), /exact user-message or operator-input authority/);
  assert.throws(() => admit(""), /exact user-message or operator-input authority/);

  for (const unresolved of ["goal:REL-PRODUCT", "current-required:REL-PRODUCT"]) {
    const unresolvedFixture = fixture(t, { authorityRef: unresolved });
    assert.throws(() => admitTeamStart({
      authorizationRef: unresolved,
      briefPath: unresolvedFixture.briefPath,
      clock: () => new Date("2026-07-30T00:00:00Z"),
      cwd: unresolvedFixture.repo,
      environment: unresolvedFixture.environment,
      mode: "execute",
      paths: unresolvedFixture.paths,
      taskId: "release-task",
    }), /exact user-message or operator-input authority/);
  }
});

test("brief compiler rejects an author-replaced evaluator", (t) => {
  const value = fixture(t);
  const replacedPlan = structuredClone(value.plan);
  replacedPlan.slices[0].checks[0].release_requirement.evaluator_ref = "author-evaluator@1";
  const replacedContract = path.join(value.repo, "replaced-contract.md");
  fs.writeFileSync(replacedContract, contractMarkdown(value.intent, replacedPlan));
  const compile = spawnSync("node", [
    BRIEF_BIN,
    "--task", "replaced-task",
    "--slice", "release-slice",
    "--repo", value.repo,
    "--base", value.base,
    "--contract", replacedContract,
  ], { cwd: value.repo, env: value.environment, encoding: "utf8" });
  assert.equal(compile.status, 1);
  assert.match(compile.stderr, /immutable Profile Check Definition/);
});
