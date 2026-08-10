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
const { admitTeamStart } = require(path.join(
  ROOT,
  "workflow/bin/lib/codex-workflow/team/admission",
));
const { createTask, startTask } = require(path.join(
  ROOT,
  "workflow/bin/lib/codex-workflow/task/lifecycle",
));
const { readJsonObject, taskStateFile } = require(path.join(
  ROOT,
  "workflow/bin/lib/codex-workflow/task/runtime",
));
const { parseAuthorizeArgs, runAuthorize } = require(path.join(
  ROOT,
  "workflow/bin/lib/codex-workflow/team/authority-commands",
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

function releasePlan(intent, schemaVersion = 4) {
  const profile = loadBundledProfile("web-ui-v1");
  const binding = profileBinding(profile);
  return {
    schema_version: schemaVersion,
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

function contractMarkdown(intent, plan, taskId, workType = "implementation") {
  const semanticsVersion = plan.schema_version === 4 ? 6 : 4;
  const vNextAuthoring = semanticsVersion === 6 ? [
    "finding_scope_admission: controller_current_required_only",
    "safe_fallback_authority: none",
    "first_code_guard: required",
    "first_code_not_applicable_reason:",
    "product_ui_gate: required",
    "product_ui_not_applicable_reason:",
    "",
    "## First Code Slice Guard",
    "",
    "- first_code_slice: Implement the governed release runtime and its final-sweep behavior.",
    "- first_code_slice_kind: product",
    "- first_code_owner: release-runtime-owner",
    "- first_code_verification: node --test workflow/tests/js/release-certification-admission.test.js",
    "- allowed_contract_gate_only_until: contract authoring validation",
    "- stop_if_no_code_by_phase: release implementation",
    "- gate_parallelization_or_deferral_plan: Run admission checks before accepting the release execution slice.",
    "",
    "## Product/UI Acceptance Gate",
    "",
    "- first_operable_user_flow: Open the release candidate, complete its primary flow, and verify the saved result.",
    "- browser_entrypoint: http://127.0.0.1:4173/release",
    "- served_ui_validation_action: page.route('/api/**', route => route.fulfill({json: fixture})); never fulfill the main document or app bundle; page.goto(entrypoint); complete the primary flow and verify the saved result.",
    "- ui_data_mode: API fixture data served behind the real application document and assets",
    "- required_safety_gates: browser network boundary, credential isolation, and release authority checks",
    "- allowed_headless_only_until: contract authoring validation",
    "- stop_if_no_ui_by_phase: release implementation",
    "",
  ] : [];
  const acceptanceRefs = [...new Set(plan.slices.flatMap((slice) => slice.acceptance_refs))];
  const vNextScope = semanticsVersion === 6 ? [
    "## Acceptance Criteria",
    "",
    "| ID | Criterion | Required | Verification | Authority |",
    "|----|-----------|----------|--------------|-----------|",
    ...acceptanceRefs.map((ref) => (
      `| ${ref} | Preserve the governed release requirement. | yes | release admission | goal:${ref} |`
    )),
    "",
    "## Edge Cases",
    "",
    "| Case | Expected behavior | Required | Admission |",
    "|------|-------------------|----------|-----------|",
    "| Optional evidence note | Keep it outside executable scope. | no | optional |",
    "",
    "## Failure And Stop Conditions",
    "",
    "- Stop and ask the user when: release authority cannot be established.",
    "- Treat the task as failed when: a required Profile validation fails.",
    "- Required safe fallback: not_applicable",
    "- Optional fallback notes: preserve non-required evidence as provenance.",
    "",
    "## Finding Provenance",
    "",
    "| Finding ID | Disposition | Source | Follow-up |",
    "|------------|-------------|--------|-----------|",
    "| release-note | informational | release fixture | none |",
    "",
  ] : [];
  return [
    "# Governed product release",
    "",
    `task_id: ${taskId}`,
    `contract_semantics_version: ${semanticsVersion}`,
    `work_type: ${workType}`,
    ...vNextAuthoring,
    "",
    "```atlas-release-intent+json",
    JSON.stringify(intent, null, 2),
    "```",
    "",
    "```atlas-execution-plan+json",
    JSON.stringify(plan, null, 2),
    "```",
    "",
    ...vNextScope,
  ].join("\n");
}

function decoyEnvelopeFor(semanticsVersion) {
  const conflicting = semanticsVersion === 6 ? 5 : 6;
  return [
    "```text",
    `contract_semantics_version: ${conflicting}`,
    "work_type: review",
    "```",
    "<!-- contract_semantics_version: 4 -->",
    "",
  ].join("\n");
}

function git(repo, args) {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function writeAuthoritySlice(paths, taskId, repo, baseSha, acceptanceRefs) {
  const sliceId = "release-authority";
  const sliceDir = path.join(
    taskArtifactDir(paths, taskId),
    "team/sdd/slices",
    sliceId,
  );
  fs.mkdirSync(sliceDir, { recursive: true });
  fs.writeFileSync(path.join(sliceDir, "brief.md"), [
    "# Release authority",
    "",
    ...acceptanceRefs.map((ref) => `- ${ref}`),
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(sliceDir, "brief.json"), `${JSON.stringify({
    schema_version: 2,
    task_id: taskId,
    slice_id: sliceId,
    repo,
    base_sha: baseSha,
    objective: "Provide canonical goal authority for release contract authoring.",
    requirements_path: "brief.md",
    global_constraints_path: "../../global-constraints.md",
    owned_paths: ["product/release"],
    forbidden_paths: ["plugins/multica-sdlc"],
    acceptance_refs: acceptanceRefs,
    required_checks: ["node --test workflow/tests/js/release-certification-admission.test.js"],
    commit_policy: "logical_outcome",
    output_contract: "final_message_json_only",
  }, null, 2)}\n`);
  return sliceDir;
}

function fixture(t, {
  authorityRef = "user-message:release",
  decoyEnvelope = false,
  workType = "implementation",
} = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-release-admission."));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const environment = {
    ...process.env,
    ATLAS_WORKFLOW_PLUGIN_ROOT: PLUGIN_ROOT,
    CODEX_HOME_ROOT: home,
    CODEX_WORKFLOW_ROOT: path.join(home, "workflow"),
  };
  const paths = resolvePaths(environment);
  const lifecycleOptions = { clock: () => new Date("2026-07-30T00:00:00Z"), environment };
  const taskId = createTask("Release admission", "governed release admission", lifecycleOptions);
  startTask(taskId, lifecycleOptions);
  const repo = path.join(home, "repo");
  fs.mkdirSync(repo, { recursive: true });
  git(repo, ["init", "-q"]);
  git(repo, ["config", "user.email", "atlas@example.test"]);
  git(repo, ["config", "user.name", "Atlas Test"]);
  const intent = productIntent(authorityRef);
  const vNext = workType === "implementation";
  const plan = releasePlan(intent, vNext ? 4 : 2);
  const contractName = `implementation-contract.${taskId}.final.md`;
  const contract = path.join(repo, contractName);
  const contractText = contractMarkdown(intent, plan, taskId, workType);
  fs.writeFileSync(
    contract,
    decoyEnvelope
      ? `${decoyEnvelopeFor(plan.schema_version === 4 ? 6 : 4)}${contractText}`
      : contractText,
  );
  git(repo, ["add", contractName]);
  git(repo, ["commit", "-qm", "test: add release contract"]);
  const base = git(repo, ["rev-parse", "HEAD"]);
  const authoritySlice = vNext
    ? writeAuthoritySlice(
      paths,
      taskId,
      repo,
      base,
      [...new Set(plan.slices.flatMap((slice) => slice.acceptance_refs))],
    )
    : null;
  const compile = spawnSync("node", [
    BRIEF_BIN,
    "--task", taskId,
    "--slice", "release-slice",
    "--repo", repo,
    "--base", base,
    "--contract", contract,
    ...(authoritySlice ? ["--authority-slice", authoritySlice] : []),
  ], { cwd: repo, env: environment, encoding: "utf8" });
  assert.equal(compile.status, 0, compile.stderr);
  const briefPath = path.join(
    taskArtifactDir(paths, taskId),
    "team/sdd/slices/release-slice/brief.json",
  );
  let grant = null;
  if (vNext && /^(?:user-message|operator-input):/.test(authorityRef)) {
    const brief = JSON.parse(fs.readFileSync(briefPath, "utf8"));
    runAuthorize(parseAuthorizeArgs([
      taskId,
      brief.objective,
      `--authorization-ref=${authorityRef}`,
      `--brief=${briefPath}`,
      "--grant-id=release-grant",
      "--operation-id=authorize-release",
    ]), { cwd: repo, environment });
    const state = readJsonObject(taskStateFile(paths, taskId));
    grant = state.execution_authority.grants[0];
  }
  return {
    base,
    briefPath,
    contract,
    currentState: readJsonObject(taskStateFile(paths, taskId)),
    environment,
    grant,
    intent,
    paths,
    plan,
    repo,
    taskId,
    workType,
  };
}

test("brief v4 and Team execution-vnext bind an exact semantics-v6 release policy", (t) => {
  const value = fixture(t, { decoyEnvelope: true });
  const brief = JSON.parse(fs.readFileSync(value.briefPath, "utf8"));
  assert.deepEqual(validateBrief(brief), []);
  assert.equal(brief.schema_version, 4);
  assert.equal(brief.contract.semantics_version, 6);
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
    currentState: value.currentState,
    expectedGrantId: value.grant.grant_id,
    expectedScopeDigest: value.grant.scope_digest,
    mode: "execute",
    objective: brief.objective,
    paths: value.paths,
    taskId: value.taskId,
  });
  assert.equal(admission.mode, "execution-vnext");
  assert.equal(admission.brief.work_type, "implementation");
  assert.deepEqual(admission.brief.release, {
    ...value.plan.release,
    requirement_refs: [...value.plan.release.requirement_refs].sort(),
  });
  assert.equal(value.currentState.execution_authority.schema_version, 2);
  assert.deepEqual(value.grant.scope.release_binding, {
    ...value.plan.release,
    requirement_refs: [...value.plan.release.requirement_refs].sort(),
  });
  assert.equal(
    value.currentState.execution_authority.delivery_authority.ref,
    "user-message:release",
  );
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
      taskId: value.taskId,
    });
    assert.equal(discussed.mode, "discuss-v3");
    assert.equal(discussed.brief.work_type, workType);
    const eventsBefore = fs.readFileSync(
      path.join(taskArtifactDir(value.paths, value.taskId), "events-v2.jsonl"),
      "utf8",
    );
    assert.throws(() => runAuthorize(parseAuthorizeArgs([
      value.taskId,
      brief.objective,
      "--authorization-ref=user-message:release",
      `--brief=${value.briefPath}`,
      `--grant-id=${workType}-grant`,
      `--operation-id=authorize-${workType}`,
    ]), { cwd: value.repo, environment: value.environment }), /schema_version 4|legacy 1\/2\/3/);
    assert.equal(
      fs.readFileSync(path.join(taskArtifactDir(value.paths, value.taskId), "events-v2.jsonl"), "utf8"),
      eventsBefore,
    );
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
    currentState: value.currentState,
    expectedGrantId: value.grant.grant_id,
    expectedScopeDigest: value.grant.scope_digest,
    mode: "execute",
    objective: original.objective,
    paths: value.paths,
    taskId: value.taskId,
  }), /invalid|does not match/);

  const replaced = structuredClone(original);
  replaced.contract.release.profile_sha256 = digest("b");
  fs.writeFileSync(value.briefPath, `${JSON.stringify(replaced, null, 2)}\n`);
  assert.throws(() => admitTeamStart({
    authorizationRef: "user-message:release",
    briefPath: value.briefPath,
    clock: () => new Date("2026-07-30T00:00:00Z"),
    cwd: value.repo,
    environment: value.environment,
    currentState: value.currentState,
    expectedGrantId: value.grant.grant_id,
    expectedScopeDigest: value.grant.scope_digest,
    mode: "execute",
    objective: original.objective,
    paths: value.paths,
    taskId: value.taskId,
  }), /invalid|does not match/);

  const replacedWorkType = structuredClone(original);
  replacedWorkType.contract.work_type = "review";
  fs.writeFileSync(value.briefPath, `${JSON.stringify(replacedWorkType, null, 2)}\n`);
  assert.throws(() => admitTeamStart({
    authorizationRef: "user-message:release",
    briefPath: value.briefPath,
    clock: () => new Date("2026-07-30T00:00:00Z"),
    cwd: value.repo,
    environment: value.environment,
    currentState: value.currentState,
    expectedGrantId: value.grant.grant_id,
    expectedScopeDigest: value.grant.scope_digest,
    mode: "execute",
    objective: original.objective,
    paths: value.paths,
    taskId: value.taskId,
  }), /invalid|does not match/);
});

test("product_release execution requires the exact controller-recordable delivery authority", (t) => {
  const value = fixture(t);
  const admit = (authorizationRef) => admitTeamStart({
    authorizationRef,
    briefPath: value.briefPath,
    clock: () => new Date("2026-07-30T00:00:00Z"),
    cwd: value.repo,
    environment: value.environment,
    currentState: value.currentState,
    expectedGrantId: value.grant.grant_id,
    expectedScopeDigest: value.grant.scope_digest,
    mode: "execute",
    objective: JSON.parse(fs.readFileSync(value.briefPath, "utf8")).objective,
    paths: value.paths,
    taskId: value.taskId,
  });
  assert.equal(admit("user-message:release").brief.delivery_authority_ref, "user-message:release");
  assert.throws(() => admit("user-message:other"), /does not match the current active grant/);
  assert.equal(admit("").brief.delivery_authority_ref, "user-message:release");

  for (const unresolved of ["goal:REL-PRODUCT", "current-required:REL-PRODUCT"]) {
    const unresolvedFixture = fixture(t, { authorityRef: unresolved });
    const brief = JSON.parse(fs.readFileSync(unresolvedFixture.briefPath, "utf8"));
    assert.throws(() => runAuthorize(parseAuthorizeArgs([
      unresolvedFixture.taskId,
      brief.objective,
      `--authorization-ref=${unresolved}`,
      `--brief=${unresolvedFixture.briefPath}`,
      "--grant-id=unresolved-grant",
      "--operation-id=authorize-unresolved",
    ]), {
      cwd: unresolvedFixture.repo,
      environment: unresolvedFixture.environment,
    }), /controller-recordable user-message: or operator-input: ref/);
  }
});

test("brief compiler rejects an author-replaced evaluator", (t) => {
  const value = fixture(t);
  const replacedPlan = structuredClone(value.plan);
  replacedPlan.slices[0].checks[0].release_requirement.evaluator_ref = "author-evaluator@1";
  const replacedContract = path.join(value.repo, "replaced-contract.md");
  fs.writeFileSync(replacedContract, contractMarkdown(
    value.intent,
    replacedPlan,
    "replaced-task",
  ));
  const authoritySlice = writeAuthoritySlice(
    value.paths,
    "replaced-task",
    value.repo,
    value.base,
    [...new Set(replacedPlan.slices.flatMap((slice) => slice.acceptance_refs))],
  );
  const compile = spawnSync("node", [
    BRIEF_BIN,
    "--task", "replaced-task",
    "--slice", "release-slice",
    "--repo", value.repo,
    "--base", value.base,
    "--contract", replacedContract,
    "--authority-slice", authoritySlice,
  ], { cwd: value.repo, env: value.environment, encoding: "utf8" });
  assert.equal(compile.status, 1);
  assert.match(compile.stderr, /immutable Profile Check Definition/);
});
