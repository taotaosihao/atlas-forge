"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const WORKFLOW_ROOT = path.join(ROOT, "workflow");
const PLUGIN_ROOT = path.join(ROOT, "plugins/atlas-workflow");
const BRIEF_BIN = path.join(PLUGIN_ROOT, "scripts/codex-team-brief");
const { collectBusinessAcceptance } = require(path.join(
  PLUGIN_ROOT, "contracts/release-certification/adapters/business-acceptance-v2",
));
const { collectFormalWebUi } = require(path.join(
  PLUGIN_ROOT, "contracts/release-certification/adapters/formal-web-ui-v1",
));
const {
  CONTROL_SPECS,
  DIMENSIONS: INTEGRATED_DIMENSIONS,
  DIMENSION_COMPONENTS,
  DIMENSION_CONTROLS,
  collectIntegratedApp,
} = require(path.join(
  PLUGIN_ROOT, "contracts/release-certification/adapters/integrated-app-v1",
));
const { collectReleaseData } = require(path.join(
  PLUGIN_ROOT, "contracts/release-certification/adapters/release-data-v1",
));
const { CONTROLS, collectReleaseOperability } = require(path.join(
  PLUGIN_ROOT, "contracts/release-certification/adapters/release-operability-v1",
));
const { loadBundledProfile, profileBinding } = require(path.join(
  PLUGIN_ROOT, "contracts/release-certification/validators/profile",
));
const {
  releasePlanBinding,
  releaseRequirementProjection,
} = require(path.join(PLUGIN_ROOT, "contracts/team-sdd/validators/execution-plan"));
const { resolvePaths, taskArtifactDir } = require(path.join(
  WORKFLOW_ROOT, "bin/lib/codex-workflow/core/paths",
));
const { readAuthoritativeEvents } = require(path.join(
  WORKFLOW_ROOT, "bin/lib/codex-workflow/core/event-store",
));
const { taskEventFile } = require(path.join(
  WORKFLOW_ROOT, "bin/lib/codex-workflow/core/task-mutation",
));
const { captureWorktreeSnapshot } = require(path.join(
  WORKFLOW_ROOT, "bin/lib/codex-workflow/core/worktree-snapshot",
));
const { completeTask, createTask, startTask } = require(path.join(
  WORKFLOW_ROOT, "bin/lib/codex-workflow/task/lifecycle",
));
const {
  readJsonObject,
  setTaskStateFields,
  taskStateFile,
  writeTaskCompletion,
} = require(path.join(WORKFLOW_ROOT, "bin/lib/codex-workflow/task/runtime"));
const {
  formatCommand,
  parseVerifyArgs,
  runVerification,
} = require(path.join(WORKFLOW_ROOT, "bin/lib/codex-workflow/verification/runner"));
const { captureVerificationIdentity, digestCanonical, sha256 } = require(path.join(
  WORKFLOW_ROOT, "bin/lib/codex-workflow/verification/identity",
));
const { buildVerificationIdentityRecord } = require(path.join(
  WORKFLOW_ROOT, "bin/lib/codex-workflow/verification/record",
));
const {
  buildCandidateManifest,
  evaluateReleaseSweep,
  validateCandidateManifest,
} = require(path.join(
  WORKFLOW_ROOT, "bin/lib/codex-workflow/verification/release-certification",
));
const { executionCompletionAdmission, requiredGateAdmission } = require(path.join(
  WORKFLOW_ROOT, "bin/lib/codex-workflow/verification/required-gates",
));
const {
  parseRecordStartArgs,
  parsePromoteArgs,
  runPromote,
  runRecordStart,
} = require(path.join(WORKFLOW_ROOT, "bin/lib/codex-workflow/team/commands"));
const { parseSliceAcceptArgs, runSliceAccept } = require(path.join(
  WORKFLOW_ROOT, "bin/lib/codex-workflow/team/slice-acceptance",
));

const NOW = "2026-07-30T08:00:00Z";
const clock = () => new Date(NOW);

function git(repo, args) {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

function contentRef(ref, file, kind) {
  return { ref, sha256: sha256(fs.readFileSync(file)), kind };
}

function temporaryWorkflow(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-release-runtime."));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const environment = {
    ...process.env,
    ATLAS_WORKFLOW_PLUGIN_ROOT: PLUGIN_ROOT,
    CODEX_HOME_ROOT: root,
    CODEX_WORKFLOW_ROOT: path.join(root, "workflow"),
    CODEX_WORKFLOW_TEMPLATE_DIR: path.join(WORKFLOW_ROOT, "templates"),
    TMPDIR: path.join(root, "tmp"),
  };
  return { environment, paths: resolvePaths(environment), root };
}

function policyContext(profileRef = "web-ui-v1") {
  const profile = loadBundledProfile(profileRef);
  const binding = profileBinding(profile);
  const policies = new Map(profile.requirements.map((requirement) => [
    requirement.requirement_id,
    releaseRequirementProjection(profile, binding, requirement),
  ]));
  return { binding, policies, profile };
}

function passingObservations(dimension, control, candidate) {
  const observations = Object.fromEntries(Object.entries(CONTROL_SPECS[dimension][control].fields)
    .map(([field, type]) => {
      if (type === "bool") return [field, field !== "unbounded_growth"];
      if (type === "integer") return [field, 0];
      if (type === "positive_integer") return [field, field === "epochs_observed" ? 2 : 1];
      if (type === "digest") return [field, `sha256:${"a".repeat(64)}`];
      if (["flow_id", "command_flow_id"].includes(field)) {
        return [field, "integrated-primary-flow"];
      }
      return [field, `${dimension}-${control}-${field}`];
    }));
  if (dimension === "data-integrity" && control === "schema_migration") {
    observations.migration_bundle_sha256 = candidate.release_units?.database
      ?.migration_bundle_sha256 || observations.migration_bundle_sha256;
  }
  if (dimension === "data-integrity" && control === "backup_restore") {
    observations.restored_schema_head = candidate.release_units?.database
      ?.schema_head || observations.restored_schema_head;
  }
  if (dimension === "external-integration" && control === "contract_binding") {
    observations.contract_version = candidate.release_units?.external_integration
      ?.contract_version || observations.contract_version;
    observations.config_sha256 = candidate.release_units?.external_integration
      ?.config_sha256 || observations.config_sha256;
  }
  if (dimension === "external-integration"
    && control === "identity_credentials_rotation_revocation") {
    observations.credential_identity = candidate.release_units?.external_integration
      ?.credential_identity || observations.credential_identity;
  }
  if (dimension === "api-contract" && control === "shared_contract") {
    observations.contract_version = candidate.release_units?.api
      ?.contract_version || observations.contract_version;
    observations.api_artifact_digest = candidate.release_units?.api
      ?.artifact_digest || observations.api_artifact_digest;
  }
  if (dimension === "performance-resilience") {
    observations.load_profile = candidate.performance_budget?.load_profile || observations.load_profile;
    observations.thresholds_sha256 = candidate.performance_budget?.sha256
      || observations.thresholds_sha256;
  }
  assert.equal(CONTROL_SPECS[dimension][control].passes(observations), true);
  return observations;
}

function rawInputs(candidate, files, surfaceRef, evidenceDir) {
  const candidateDigest = candidate.manifest_digest;
  const business = {
    schema_version: 1,
    candidate_manifest_digest: candidateDigest,
    verdict: {
      schema_version: 2,
      task_id: "release-runtime",
      verdict: "accepted",
      technical_gate_status: "passed",
      business_acceptance_status: "passed",
      required_followups: [],
      blockers: [],
      goal_a: {
        status: "passed", evidence_refs: ["goal-a-proof"],
        integration_path_id: "primary-flow", integration_mode: "real",
      },
      goal_b: {
        status: "passed", evidence_refs: ["goal-b-proof"],
        integration_path_id: "primary-flow", integration_mode: "real",
      },
    },
    acceptance_report: {
      schema_version: 1,
      task_id: "release-runtime",
      scenario_results: [{
        scenario_id: "primary-flow", business_result: "passed",
        technical_gate_result: "passed", score: 100,
      }],
      technical_gate_summary: { blocking_failure_count: 0, failed_gates: [] },
      rating: { total: 100, level: "accepted", blocking_technical_gate_failed: false },
      open_deviations: [],
    },
    evidence_refs: [
      contentRef("business-report", files.get("business-report"), "business_report"),
      contentRef("goal-a-proof", files.get("goal-a-proof"), "business_evidence"),
      contentRef("goal-b-proof", files.get("goal-b-proof"), "business_evidence"),
    ],
  };
  const formalDimensions = Object.fromEntries([
    "capability-truth", "surface-states", "formal-content-ia", "accessibility-quality",
  ].map((dimension) => [dimension, {
    status: "passed",
    summary: `${dimension} passed against the served final candidate with stable evidence.`,
    evidence_refs: [`${dimension}-proof`],
    finding_codes: [],
  }]));
  const formal = {
    schema_version: 2,
    review_id: "formal-release-review",
    candidate_manifest_digest: candidateDigest,
    surface_inventory: surfaceRef,
    owner_decision: { owner: "product-owner", status: "accepted", evidence_ref: "ui-owner-proof" },
    dimensions: formalDimensions,
    failure_checks: {
      dead_controls: "passed", happy_path_only: "passed", engineering_meta_leakage: "passed",
    },
    evidence_refs: [
      contentRef("ui-owner-proof", files.get("ui-owner-proof"), "human_decision"),
      ...Object.keys(formalDimensions).map((dimension) => contentRef(
        `${dimension}-proof`, files.get(`${dimension}-proof`), "browser_evidence",
      )),
    ],
  };
  const data = {
    schema_version: 1,
    review_id: "release-data-review",
    candidate_manifest_digest: candidateDigest,
    status: "accepted",
    data_mode: "production_equivalent",
    product_routes_reviewed: ["/projects", "/projects/:id"],
    demo_seed_detected: false,
    acceptance_data_detected: false,
    lifecycle_verified: true,
    schema_migration_verified: true,
    summary: "Production-equivalent lifecycle and schema behavior passed for every released product route.",
    evidence_refs: [contentRef("data-proof", files.get("data-proof"), "data_review")],
  };
  const controls = Object.fromEntries(CONTROLS.map((control) => [control, {
    status: "passed",
    summary: `${control} passed for the final candidate with stable operational evidence.`,
    evidence_refs: [`${control}-proof`],
  }]));
  const operability = {
    schema_version: 1,
    review_id: "release-operability-review",
    candidate_manifest_digest: candidateDigest,
    owner_decision: { owner: "service-owner", status: "accepted", evidence_ref: "ops-owner-proof" },
    controls,
    evidence_refs: [
      contentRef("ops-owner-proof", files.get("ops-owner-proof"), "human_decision"),
      ...CONTROLS.map((control) => contentRef(
        `${control}-proof`, files.get(`${control}-proof`), "control_evidence",
      )),
    ],
  };
  const candidateComponents = Object.fromEntries([
    "web_ui", "api", "worker", "database", "external_integration",
  ].map((unit, index) => [
    unit,
    candidate.release_units?.[unit]?.sha256 || `sha256:${String(index + 1).repeat(64)}`,
  ]));
  const evidenceRecords = [];
  const integratedDimensions = Object.fromEntries(INTEGRATED_DIMENSIONS.map((dimension) => [dimension, {
    status: "passed",
    summary: `${dimension} passed every required control against the final integrated candidate.`,
    controls: Object.fromEntries(DIMENSION_CONTROLS[dimension].map((control) => {
      const file = path.join(evidenceDir, `${dimension}-${control}-proof.json`);
      const ref = file;
      const record = {
        schema_version: 1,
        evidence_id: ref,
        candidate_manifest_digest: candidateDigest,
        deployment_id: candidate.deployment?.deployment_id || "unused-web-deployment",
        observed_unit_set_sha256: candidate.deployment?.unit_set_sha256
          || `sha256:${"c".repeat(64)}`,
        evidence_set_id: "integrated-evidence-set-1",
        run_id: "integrated-run-1",
        dimension,
        control_id: control,
        component_identities: Object.fromEntries(DIMENSION_COMPONENTS[dimension].map((unit) => [
          unit, candidateComponents[unit],
        ])),
        check_identity: {
          producer: "atlas-test-integrated-observer@1",
          check_id: `${dimension}.${control}`,
          gate_class: "integration",
          command_sha256: `sha256:${"b".repeat(64)}`,
        },
        executed_at: NOW,
        observations: passingObservations(dimension, control, candidate),
      };
      write(file, record);
      files.set(ref, file);
      evidenceRecords.push({
        content_ref: contentRef(ref, file, "integrated_control_evidence"),
        record,
      });
      return [control, {
        status: "passed",
        summary: `${control} passed with candidate-bound evidence from the final integrated runtime.`,
        evidence_ref: ref,
      }];
    })),
    finding_codes: [],
  }]));
  const integrated = {
    schema_version: 2,
    review_id: "integrated-app-release-review",
    candidate_manifest_digest: candidateDigest,
    deployment_id: candidate.deployment?.deployment_id || "unused-web-deployment",
    candidate_components: candidateComponents,
    observed_unit_set_sha256: candidate.deployment?.unit_set_sha256
      || `sha256:${"c".repeat(64)}`,
    evidence_set_id: "integrated-evidence-set-1",
    run_id: "integrated-run-1",
    observation_window: {
      started_at: "2026-07-30T07:00:00.000Z",
      ended_at: NOW,
    },
    owner_decision: {
      owner: "integrated-service-owner",
      status: "accepted",
      evidence_ref: "integrated-owner-proof",
    },
    owner_evidence: contentRef(
      "integrated-owner-proof", files.get("integrated-owner-proof"), "human_decision",
    ),
    dimensions: integratedDimensions,
    evidence_records: evidenceRecords,
  };
  return { business, data, formal, integrated, operability };
}

function buildFacts(profile, policies, raw, candidateDigest) {
  const formalPolicies = [...policies.values()].filter((policy) => (
    policy.collector_adapter_ref === "formal-web-ui-v1@1"
  ));
  const facts = new Map();
  facts.set(`${profile.profile_id}.critical-journey`, collectBusinessAcceptance(raw.business, {
    policyBinding: policies.get(`${profile.profile_id}.critical-journey`),
    candidateManifestDigest: candidateDigest,
    evaluatedAt: NOW,
  }));
  for (const fact of collectFormalWebUi(raw.formal, {
    policyBindings: formalPolicies,
    candidateManifestDigest: candidateDigest,
    evaluatedAt: NOW,
  })) facts.set(fact.policy_binding.requirement_ref, fact);
  facts.set(`${profile.profile_id}.production-data`, collectReleaseData(raw.data, {
    policyBinding: policies.get(`${profile.profile_id}.production-data`),
    candidateManifestDigest: candidateDigest,
    evaluatedAt: NOW,
  }));
  facts.set(`${profile.profile_id}.security-operability`, collectReleaseOperability(raw.operability, {
    policyBinding: policies.get(`${profile.profile_id}.security-operability`),
    candidateManifestDigest: candidateDigest,
    evaluatedAt: NOW,
  }));
  const integratedPolicies = [...policies.values()].filter((policy) => (
    policy.collector_adapter_ref === "integrated-app-v1@1"
  ));
  if (integratedPolicies.length > 0) {
    for (const fact of collectIntegratedApp(raw.integrated, {
      policyBindings: integratedPolicies,
      candidateManifestDigest: candidateDigest,
      evaluatedAt: NOW,
    })) facts.set(fact.policy_binding.requirement_ref, fact);
  }
  assert.deepEqual([...facts.keys()].sort(), profile.requirements.map((item) => item.requirement_id).sort());
  return facts;
}

function releaseFixture(t, {
  briefMode = "full",
  deploymentAttestationMismatch = false,
  formalOwnerStatus = "accepted",
  integratedCandidateMetadataMismatch = false,
  integratedEvidenceMismatch = false,
  profileRef = "web-ui-v1",
  promotedExecution = false,
  splitIntegratedSources = false,
  typedFactCase = "valid",
  trustedProducer = false,
} = {}) {
  const { environment, paths, root } = temporaryWorkflow(t);
  const taskId = createTask("Release runtime", "derive a formal release decision", { clock, environment });
  startTask(taskId, { clock, environment });
  const repo = path.join(root, "repo");
  fs.mkdirSync(repo, { recursive: true });
  git(repo, ["init", "-q"]);
  git(repo, ["config", "user.email", "atlas@example.test"]);
  git(repo, ["config", "user.name", "Atlas Test"]);

  const releaseRoot = path.join(taskArtifactDir(paths, taskId), "release");
  const materials = path.join(releaseRoot, "materials");
  const surfaceFile = write(path.join(materials, "surface-inventory.json"), { routes: ["/projects"] });
  const componentFiles = Object.fromEntries([
    ["artifact", "deployed artifact manifest"],
    ["config", "release configuration manifest"],
    ["runtime", "production-equivalent runtime manifest"],
    ["data", "production data lifecycle manifest"],
  ].map(([name, content]) => [name, write(path.join(materials, `${name}.txt`), `${content}\n`)]));
  const { binding, policies, profile } = policyContext(profileRef);
  const intent = {
    schema_version: profile.schema_version,
    target_delivery_class: "product_release",
    target_delivery_authority_ref: "user-message:release",
    release_stage: "mvp",
    surface_inventory: { ref: "surface-inventory", sha256: sha256(fs.readFileSync(surfaceFile)) },
    surface_kinds: profile.schema_version === 1 ? [profile.surface_kind] : [...profile.surface_kinds],
    release_profile_refs: [{ profile_ref: profile.profile_id, profile_sha256: binding.profile_sha256 }],
    release_claim_refs: ["AC-CLAIM"],
    audience_refs: ["AC-AUDIENCE"],
    critical_outcome_refs: ["AC-OUTCOME"],
  };
  const releaseBinding = releasePlanBinding(intent);
  const command = [process.execPath, "-e", [
    "const fs=require('fs');",
    "const [output]=JSON.parse(process.env.ATLAS_VERIFICATION_OUTPUTS_JSON);",
    "const fact=JSON.parse(process.env.ATLAS_TEST_RELEASE_FACT_JSON);",
    "if(fact.evaluated_at&&fact.evaluated_at!==process.env.ATLAS_VERIFICATION_CREATED_AT)process.exit(2);",
    "for(const output of JSON.parse(process.env.ATLAS_VERIFICATION_OUTPUTS_JSON))fs.writeFileSync(output,JSON.stringify(fact));",
  ].join("")];
  const checks = profile.requirements.map((requirement) => ({
    check_id: `release-${requirement.dimension}`,
    gate_class: requirement.check_definition.allowed_gate_classes[0],
    command: formatCommand(command).trimEnd(),
    final_only: true,
    cache_policy: "fresh-executed",
    release_requirement: policies.get(requirement.requirement_id),
  }));
  const releaseSliceChecks = briefMode === "non-release"
      ? [{ ...checks[0], check_id: "harness-unit", release_requirement: undefined }]
      : checks;
  if (briefMode === "non-release") delete releaseSliceChecks[0].release_requirement;
  const releaseSlice = {
    slice_id: "release-slice",
    objective: "Run the currently admitted release workflow slice.",
    depends_on: [],
    keeper_outputs: ["release:final-sweep"],
    owned_paths: ["release/output/**"],
    forbidden_paths: ["plugins/multica-sdlc/**"],
    acceptance_refs: ["AC-RELEASE"],
    risk_class: "critical",
    failure_domain: "release-certification",
    rollback_boundary: "one release evidence commit",
    estimate: {
      estimated_changed_files: 64, estimated_net_loc: 100, target_p90_minutes: 90,
      serial_dependency_depth: 0, independent_vertical_count: 1,
    },
    budget: {
      max_changed_files: 80, max_loc: 400, max_wall_clock_minutes: 120,
      max_required_checks: releaseSliceChecks.length,
    },
    checks: releaseSliceChecks,
  };
  const plan = {
    schema_version: 2,
    size_policy: { policy_id: "atlas-slice-size-v2" },
    release: releaseBinding,
    slices: briefMode === "full" ? [releaseSlice] : [releaseSlice, {
      ...releaseSlice,
      slice_id: "terminal-slice",
      objective: "Complete the remaining full Profile sweep.",
      depends_on: ["release-slice"],
      keeper_outputs: ["release:terminal-sweep"],
      owned_paths: ["release/terminal/**"],
      acceptance_refs: ["AC-TERMINAL-RELEASE"],
      estimate: { ...releaseSlice.estimate, serial_dependency_depth: 1 },
      checks,
      budget: { ...releaseSlice.budget, max_required_checks: checks.length },
    }],
  };
  const contract = write(path.join(repo, "implementation-contract.final.md"), [
    "# Product release contract", "", `task_id: ${taskId}`,
    "contract_semantics_version: 4", "work_type: implementation", "",
    "```atlas-release-intent+json", JSON.stringify(intent, null, 2), "```", "",
    "```atlas-execution-plan+json", JSON.stringify(plan, null, 2), "```", "",
  ].join("\n"));
  git(repo, ["add", "implementation-contract.final.md"]);
  git(repo, ["commit", "-qm", "test: add product release contract"]);
  const base = git(repo, ["rev-parse", "HEAD"]);
  const compile = spawnSync(process.execPath, [
    BRIEF_BIN, "--task", taskId, "--slice", "release-slice", "--repo", repo,
    "--base", base, "--contract", contract,
  ], { cwd: repo, env: environment, encoding: "utf8" });
  assert.equal(compile.status, 0, compile.stderr);
  const briefPath = path.join(
    taskArtifactDir(paths, taskId), "team/sdd/slices/release-slice/brief.json",
  );
  if (promotedExecution) {
    runRecordStart(parseRecordStartArgs([
      taskId, "discuss final release sweep", "--mode=discuss", `--brief=${briefPath}`,
      "--operation-id=discuss-release-sweep",
    ]), { cwd: repo, environment });
    runPromote(parsePromoteArgs([
      taskId, "--to=execute", "--authorization-ref=user-message:release",
      `--brief=${briefPath}`, "--operation-id=promote-release-sweep",
    ]), { cwd: repo, environment });
  } else {
    runRecordStart(parseRecordStartArgs([
      taskId, "execute final release sweep", "--mode=execute",
      "--authorization-ref=user-message:release", `--brief=${briefPath}`,
      "--operation-id=start-release-sweep",
    ]), { cwd: repo, environment });
  }
  runPromote(parsePromoteArgs([taskId, "--to=finish"]), {
    environment, operationId: "finish-release-team",
  });

  const evidenceDir = path.join(repo, "release/output/evidence");
  const evidenceFiles = new Map();
  for (const name of [
    "business-report", "goal-a-proof", "goal-b-proof", "ui-owner-proof",
    "capability-truth-proof", "surface-states-proof", "formal-content-ia-proof",
    "accessibility-quality-proof", "data-proof", "ops-owner-proof",
    ...CONTROLS.map((control) => `${control}-proof`),
    "integrated-owner-proof",
  ]) evidenceFiles.set(name, write(path.join(evidenceDir, name), `${name} content\n`));
  const keeperRelative = "release/output/final-sweep.txt";
  write(path.join(repo, keeperRelative), "final release sweep\n");
  const snapshot = captureWorktreeSnapshot(repo);
  const components = {
    artifact: { input_ref: componentFiles.artifact, sha256: sha256(fs.readFileSync(componentFiles.artifact)) },
    surface_inventory: {
      authority_ref: intent.surface_inventory.ref,
      input_ref: surfaceFile,
      sha256: intent.surface_inventory.sha256,
    },
    config: { input_ref: componentFiles.config, sha256: sha256(fs.readFileSync(componentFiles.config)) },
    runtime: { input_ref: componentFiles.runtime, sha256: sha256(fs.readFileSync(componentFiles.runtime)) },
    data: { input_ref: componentFiles.data, sha256: sha256(fs.readFileSync(componentFiles.data)) },
  };
  const releaseUnitFiles = profile.schema_version === 2
    ? Object.fromEntries([
      "web_ui", "api", "worker", "database", "external_integration",
    ].map((unit) => [
      unit, write(path.join(materials, `${unit}.json`), { unit, release: "mes-p1" }),
    ]))
    : {};
  const releaseUnits = profile.schema_version === 2 ? {
    web_ui: {
      input_ref: releaseUnitFiles.web_ui,
      sha256: sha256(fs.readFileSync(releaseUnitFiles.web_ui)),
      artifact_digest: sha256(fs.readFileSync(releaseUnitFiles.web_ui)),
      build_id: "mes-web-build-1",
    },
    api: {
      input_ref: releaseUnitFiles.api,
      sha256: sha256(fs.readFileSync(releaseUnitFiles.api)),
      artifact_digest: sha256(fs.readFileSync(releaseUnitFiles.api)),
      image_or_package_id: "mes-api-image-1",
      contract_version: "mes-api-v1",
    },
    worker: {
      input_ref: releaseUnitFiles.worker,
      sha256: sha256(fs.readFileSync(releaseUnitFiles.worker)),
      artifact_digest: sha256(fs.readFileSync(releaseUnitFiles.worker)),
      image_or_package_id: "mes-worker-image-1",
    },
    database: {
      input_ref: releaseUnitFiles.database,
      sha256: sha256(fs.readFileSync(releaseUnitFiles.database)),
      migration_bundle_sha256: sha256(fs.readFileSync(releaseUnitFiles.database)),
      schema_head: "mes-schema-v1",
      compatibility_window: "one-version-backward",
    },
    external_integration: {
      input_ref: releaseUnitFiles.external_integration,
      sha256: sha256(fs.readFileSync(releaseUnitFiles.external_integration)),
      contract_version: "hive-v1",
      config_sha256: sha256(fs.readFileSync(releaseUnitFiles.external_integration)),
      credential_identity: "hive-tenant-device",
    },
  } : null;
  const candidateBody = {
    schema_version: profile.schema_version,
    release_binding: releaseBinding,
    source: { repo_realpath: repo, head_sha: snapshot.head_sha, tree_oid: snapshot.tree_oid },
    components,
  };
  if (releaseUnits) {
    const unitSetSha256 = digestCanonical(releaseUnits);
    const deploymentAttestationFile = write(
      path.join(materials, "deployment-attestation.json"),
      {
        deployment_id: "mes-p1-deployment",
        environment_class: "production-equivalent",
        observed_unit_set_sha256: deploymentAttestationMismatch
          ? `sha256:${"0".repeat(64)}`
          : unitSetSha256,
      },
    );
    const performanceBudgetFile = write(
      path.join(materials, "performance-budget.json"),
      {
        load_profile: "mes-p1-300-devices-1hz-50-users-20-terminals",
        p95_event_to_ui_ms: 3000,
      },
    );
    candidateBody.release_units = releaseUnits;
    candidateBody.deployment = {
      deployment_id: "mes-p1-deployment",
      environment_class: "production-equivalent",
      unit_set_sha256: unitSetSha256,
    };
    candidateBody.deployment_attestation = {
      input_ref: deploymentAttestationFile,
      sha256: sha256(fs.readFileSync(deploymentAttestationFile)),
      deployment_id: "mes-p1-deployment",
      environment_class: "production-equivalent",
      observed_unit_set_sha256: unitSetSha256,
    };
    candidateBody.performance_budget = {
      input_ref: performanceBudgetFile,
      sha256: sha256(fs.readFileSync(performanceBudgetFile)),
      load_profile: "mes-p1-300-devices-1hz-50-users-20-terminals",
    };
  }
  const candidate = buildCandidateManifest(candidateBody);
  const candidatePath = write(path.join(releaseRoot, "candidate-manifest.json"), candidate);
  const surfaceRef = { ref: surfaceFile, sha256: intent.surface_inventory.sha256, kind: "surface_inventory" };
  const raw = rawInputs(
    candidate,
    evidenceFiles,
    surfaceRef,
    path.join(releaseRoot, "evidence"),
  );
  raw.formal.owner_decision.status = formalOwnerStatus;
  if (integratedCandidateMetadataMismatch) {
    const evidence = raw.integrated.evidence_records.find((item) => (
      item.record.dimension === "external-integration"
      && item.record.control_id === "contract_binding"
    ));
    evidence.record.observations.contract_version = "forged-contract-version";
    write(evidence.content_ref.ref, evidence.record);
    evidence.content_ref.sha256 = sha256(fs.readFileSync(evidence.content_ref.ref));
  }
  const rawPaths = {
    "business-acceptance-v2@2": write(path.join(releaseRoot, "raw/business.json"), raw.business),
    "formal-web-ui-v1@1": write(path.join(releaseRoot, "raw/formal.json"), raw.formal),
    "release-data-v1@1": write(path.join(releaseRoot, "raw/data.json"), raw.data),
    "release-operability-v1@1": write(path.join(releaseRoot, "raw/operability.json"), raw.operability),
    "integrated-app-v1@1": write(path.join(releaseRoot, "raw/integrated.json"), raw.integrated),
  };
  const facts = buildFacts(profile, policies, raw, candidate.manifest_digest);
  const collectorRawPathByRequirement = new Map();
  if (splitIntegratedSources) {
    const integratedPolicies = [...policies.values()].filter((policy) => (
      policy.collector_adapter_ref === "integrated-app-v1@1"
    ));
    for (const policy of integratedPolicies) {
      const split = structuredClone(raw.integrated);
      split.review_id = `split-review-${policy.dimension}`;
      for (const dimension of INTEGRATED_DIMENSIONS) {
        if (dimension !== policy.dimension) split.dimensions[dimension].status = "failed";
      }
      const splitPath = write(
        path.join(releaseRoot, `raw/integrated-${policy.dimension}.json`),
        split,
      );
      const selected = collectIntegratedApp(split, {
        policyBindings: integratedPolicies,
        candidateManifestDigest: candidate.manifest_digest,
        evaluatedAt: NOW,
      }).find((fact) => fact.policy_binding.requirement_ref === policy.requirement_ref);
      assert.equal(selected.outcome, "passed");
      facts.set(policy.requirement_ref, selected);
      collectorRawPathByRequirement.set(policy.requirement_ref, splitPath);
    }
  }
  if (integratedEvidenceMismatch) {
    const evidencePath = raw.integrated.evidence_records[0].content_ref.ref;
    write(evidencePath, { forged: "arbitrary proof does not match the typed record" });
  }
  const factsRoot = path.join(releaseRoot, "facts");
  fs.mkdirSync(factsRoot, { recursive: true });
  const factPaths = new Map([...facts].map(([requirementRef]) => [
    requirementRef, path.join(factsRoot, `${requirementRef}.json`),
  ]));
  for (const [index, requirement] of profile.requirements.entries()) {
    if (briefMode !== "full" && index > 0) continue;
    const policy = policies.get(requirement.requirement_id);
    const fact = facts.get(requirement.requirement_id);
    const factPath = factPaths.get(requirement.requirement_id);
    const outputPaths = typedFactCase === "multiple"
      ? [factPath, path.join(factsRoot, `${requirement.requirement_id}.second.json`)]
      : typedFactCase === "outside"
        ? [write(path.join(taskArtifactDir(paths, taskId), "outside", ".parent"), "parent\n")
          && path.join(taskArtifactDir(paths, taskId), "outside", `${requirement.requirement_id}.json`)]
        : [factPath];
    const inputFactPath = typedFactCase === "stable-input"
      ? write(path.join(releaseRoot, "raw", `${requirement.requirement_id}.input-fact.json`), fact)
      : null;
    const rawPath = collectorRawPathByRequirement.get(requirement.requirement_id)
      || rawPaths[policy.collector_adapter_ref];
    const inputs = [...new Set([
      candidatePath,
      rawPath,
      inputFactPath,
      ...Object.values(components).map((item) => item.input_ref),
      ...Object.values(releaseUnits || {}).map((item) => item.input_ref),
      ...[candidate.deployment_attestation, candidate.performance_budget]
        .filter(Boolean).map((item) => item.input_ref),
      ...fact.evidence_refs.map((item) => item.ref),
    ].filter(Boolean))];
    runVerification(parseVerifyArgs([
      taskId, `--brief=${briefPath}`, "--slice-id=release-slice",
      `--check-id=${briefMode === "non-release" ? "harness-unit" : `release-${requirement.dimension}`}`,
      `--evidence=${factPath}`,
      ...outputPaths.flatMap((output) => ["--output", output]),
      ...inputs.flatMap((input) => ["--input", input]),
      "--", ...command,
    ]), {
      clock,
      cwd: evidenceDir,
      environment: {
        ...environment,
        ATLAS_TEST_RELEASE_FACT_JSON: JSON.stringify(
          typedFactCase === "zero" ? { schema_version: 1, not_a_typed_fact: true } : fact,
        ),
      },
      operationId: `verify-${requirement.dimension}`,
      recordToken: `20260730T08000000000000${index}`,
      ...(trustedProducer ? {
        resolveReleaseProducer: ({ identity, requiredGate }) => ({
          schema_version: 1,
          producer_ref: "atlas-test-release-producer@1",
          producer_sha256: identity.toolchain.find((item) => item.sha256)?.sha256,
          source_ref: rawPath,
          source_sha256: sha256(fs.readFileSync(rawPath)),
          candidate_manifest_digest: candidate.manifest_digest,
          requirement_refs: [requiredGate.release_requirement.requirement_ref],
        }),
      } : {}),
    });
  }
  return {
    briefPath, candidatePath, command, contract, environment, evidenceDir, factPaths,
    keeperRelative, paths, policies, profile, raw, releaseBinding, releaseRoot,
    releaseUnits, repo, snapshot, taskId,
  };
}

test("self-attested release JSON plus an exit-zero command cannot certify a product", (t) => {
  const value = releaseFixture(t);
  const beforeAcceptance = readJsonObject(taskStateFile(value.paths, value.taskId));
  assert.equal(beforeAcceptance.execution_authority.work_type, "implementation");
  const gates = requiredGateAdmission(value.paths, value.taskId, beforeAcceptance, {
    environment: value.environment,
  });
  assert.equal(gates.passed, true, gates.reasons.join("\n"));
  assert.equal(gates.releaseDecision.status, "cannot_verify");
  assert.equal(gates.verificationRecords.filter((item) => item.release_fact_id).length, 7);
  assert.ok(gates.verificationRecords.every((item) => (
    item.release_fact_outcome === "cannot_verify"
  )));

  runSliceAccept(parseSliceAcceptArgs([
    value.taskId, `--brief=${value.briefPath}`, "--operation-id=accept-release-sweep",
    `--keeper-output=release:final-sweep=${value.keeperRelative}`,
  ]), { environment: value.environment });
  completeTask(value.taskId, {
    clock, environment: value.environment, operationId: "complete-release-task",
  });
  const completed = readJsonObject(taskStateFile(value.paths, value.taskId));
  assert.equal(completed.completion.release_decision.status, "cannot_verify");
  assert.equal(completed.completion.release_decision.authority, "derived-from-final-release-sweep");
  assert.equal(completed.completion.release_decision.candidate_manifest_digest,
    JSON.parse(fs.readFileSync(value.candidatePath)).manifest_digest);
  assert.match(completed.completion.release_decision.decision_id, /^sha256:[a-f0-9]{64}$/);
  assert.ok(completed.completion.release_decision.requirement_results.every((result) => (
    result.submitted_outcome === "passed"
    && result.outcome === "cannot_verify"
    && /^sha256:[a-f0-9]{64}$/.test(result.fact_id)
    && /^sha256:[a-f0-9]{64}$/.test(result.result_id)
    && result.result_id === digestCanonical({
      requirement_ref: result.requirement_ref,
      fact_id: result.fact_id,
      submitted_outcome: result.submitted_outcome,
      outcome: result.outcome,
      reason_codes: result.reason_codes,
    })
  )));
  assert.equal(
    executionCompletionAdmission(value.paths, value.taskId, completed, { environment: value.environment })
      .releaseDecision.status,
    "cannot_verify",
  );
});

test("required gate admission layers a non-release slice before a fail-closed partial sweep", (t) => {
  const harness = releaseFixture(t, { briefMode: "non-release" });
  const harnessAdmission = requiredGateAdmission(
    harness.paths,
    harness.taskId,
    readJsonObject(taskStateFile(harness.paths, harness.taskId)),
    { environment: harness.environment },
  );
  assert.equal(harnessAdmission.passed, true, harnessAdmission.reasons.join("\n"));
  assert.equal(Object.hasOwn(harnessAdmission, "releaseDecision"), false);
  assert.equal(harnessAdmission.verificationRecords.length, 1);

  const partial = releaseFixture(t);
  const partialState = readJsonObject(taskStateFile(partial.paths, partial.taskId));
  const brief = JSON.parse(fs.readFileSync(partial.briefPath, "utf8"));
  brief.checks = [brief.checks[0]];
  write(partial.briefPath, brief);
  const briefSha256 = sha256(fs.readFileSync(partial.briefPath));
  partialState.active_team.admission.brief.sha256 = briefSha256;
  const gate = Object.values(partialState.verification.required_gates)[0];
  const identityFile = path.resolve(partial.paths.codeHome, gate.identity_record);
  const identityRecord = JSON.parse(fs.readFileSync(identityFile, "utf8"));
  identityRecord.required_gate.brief_sha256 = briefSha256;
  delete identityRecord.record_id;
  identityRecord.record_id = digestCanonical(identityRecord);
  write(identityFile, identityRecord);
  Object.assign(gate, {
    brief_sha256: briefSha256,
    record_id: identityRecord.record_id,
    record_digest: identityRecord.record_id,
  });
  partialState.verification.required_gates = { [gate.check_id]: gate };
  let sweepCalled = false;
  const partialAdmission = requiredGateAdmission(
    partial.paths,
    partial.taskId,
    partialState,
    {
      environment: partial.environment,
      evaluateReleaseSweep: ({ receipts, releaseBinding }) => {
        sweepCalled = true;
        assert.equal(receipts.length, 1);
        assert.ok(releaseBinding.requirement_refs.length > receipts.length);
        return {
          admissible: false,
          decision: null,
          reasons: ["final release sweep coverage is incomplete"],
          receiptSummaries: [],
        };
      },
    },
  );
  assert.equal(sweepCalled, true);
  assert.equal(partialAdmission.passed, false);
  assert.equal(Object.hasOwn(partialAdmission, "releaseDecision"), true);
  assert.match(partialAdmission.reasons.join("\n"), /final release sweep coverage is incomplete/);
});

test("release evaluator rejects every invalid typed-fact input/output layer", (t) => {
  for (const [typedFactCase, expected] of [
    ["stable-input", /exactly one candidate manifest and one typed fact/],
    ["zero", /exactly one candidate manifest and one typed fact/],
    ["multiple", /exactly one candidate manifest and one typed fact/],
    ["outside", /typed fact is not a declared task release artifact/],
  ]) {
    const value = releaseFixture(t, { typedFactCase });
    const admission = requiredGateAdmission(
      value.paths,
      value.taskId,
      readJsonObject(taskStateFile(value.paths, value.taskId)),
      { environment: value.environment },
    );
    assert.equal(admission.passed, false, typedFactCase);
    assert.match(admission.reasons.join("\n"), expected, typedFactCase);
  }
});

test("promoted execution with event-bound producer provenance can certify", (t) => {
  const value = releaseFixture(t, { promotedExecution: true, trustedProducer: true });
  const beforeAcceptance = readJsonObject(taskStateFile(value.paths, value.taskId));
  const events = readAuthoritativeEvents(taskEventFile(value.paths, value.taskId), value.taskId);
  const authorityEvent = events.find((event) => (
    event.revision === beforeAcceptance.execution_authority.established_revision
  ));
  assert.equal(authorityEvent.kind, "team.promoted");
  assert.equal(authorityEvent.data.target, "execute");
  assert.equal(authorityEvent.data.authorization_ref, "user-message:release");

  const finishEvent = events.find((event) => (
    event.kind === "team.promoted" && event.data?.target === "finish"
  ));
  const wrongTarget = structuredClone(beforeAcceptance);
  wrongTarget.execution_authority.established_revision = finishEvent.revision;
  const rejected = requiredGateAdmission(value.paths, value.taskId, wrongTarget, {
    environment: value.environment,
  });
  assert.equal(rejected.passed, false);
  assert.match(rejected.reasons.join("\n"), /release delivery authority/);

  const gates = requiredGateAdmission(value.paths, value.taskId, beforeAcceptance, {
    environment: value.environment,
  });
  assert.equal(gates.passed, true, gates.reasons.join("\n"));
  assert.equal(gates.releaseDecision.status, "certified");
  assert.ok(gates.verificationRecords.every((item) => item.release_fact_outcome === "passed"));

  runSliceAccept(parseSliceAcceptArgs([
    value.taskId, `--brief=${value.briefPath}`, "--operation-id=accept-trusted-release-sweep",
    `--keeper-output=release:final-sweep=${value.keeperRelative}`,
  ]), { environment: value.environment });
  completeTask(value.taskId, {
    clock, environment: value.environment, operationId: "complete-trusted-release-task",
  });
  assert.equal(
    readJsonObject(taskStateFile(value.paths, value.taskId)).completion.release_decision.status,
    "certified",
  );
});

test("host-injected trusted producer can certify a structurally valid integrated candidate", (t) => {
  const value = releaseFixture(t, {
    profileRef: "integrated-app-v1",
    promotedExecution: true,
    trustedProducer: true,
  });
  const state = readJsonObject(taskStateFile(value.paths, value.taskId));
  const gates = requiredGateAdmission(value.paths, value.taskId, state, {
    environment: value.environment,
  });
  assert.equal(gates.passed, true, gates.reasons.join("\n"));
  assert.equal(gates.releaseDecision.status, "certified");
  assert.equal(gates.verificationRecords.filter((item) => item.release_fact_id).length, 12);
  assert.ok(INTEGRATED_DIMENSIONS.every((dimension) => (
    gates.verificationRecords.some((item) => (
      item.release_requirement.requirement_ref === `integrated-app-v1.${dimension}`
      && item.release_fact_outcome === "passed"
    ))
  )));
});

test("public-path integrated admission remains cannot_verify without a trusted producer", (t) => {
  const value = releaseFixture(t, {
    profileRef: "integrated-app-v1",
    promotedExecution: true,
  });
  const gates = requiredGateAdmission(
    value.paths,
    value.taskId,
    readJsonObject(taskStateFile(value.paths, value.taskId)),
    { environment: value.environment },
  );
  assert.equal(gates.passed, true, gates.reasons.join("\n"));
  assert.equal(gates.releaseDecision.status, "cannot_verify");
  assert.equal(gates.verificationRecords.filter((item) => item.release_fact_id).length, 12);
  assert.ok(gates.verificationRecords.every((item) => (
    item.release_fact_outcome === "cannot_verify"
  )));

  const candidate = JSON.parse(fs.readFileSync(value.candidatePath, "utf8"));
  const missingUnit = structuredClone(candidate);
  delete missingUnit.manifest_digest;
  delete missingUnit.release_units.database;
  assert.match(
    validateCandidateManifest(buildCandidateManifest(missingUnit)).join("\n"),
    /release_units missing required key: database/,
  );

  const wrongUnitSet = structuredClone(candidate);
  delete wrongUnitSet.manifest_digest;
  wrongUnitSet.deployment.unit_set_sha256 = `sha256:${"0".repeat(64)}`;
  assert.match(
    validateCandidateManifest(buildCandidateManifest(wrongUnitSet)).join("\n"),
    /unit_set_sha256 does not match release_units/,
  );

  const missingSchemaIdentity = structuredClone(candidate);
  delete missingSchemaIdentity.manifest_digest;
  missingSchemaIdentity.release_units.database.schema_head = "";
  assert.match(
    validateCandidateManifest(buildCandidateManifest(missingSchemaIdentity)).join("\n"),
    /database.schema_head must be non-empty/,
  );
});

test("integrated admission rejects evidence content that differs from its typed record", (t) => {
  const value = releaseFixture(t, {
    integratedEvidenceMismatch: true,
    profileRef: "integrated-app-v1",
    promotedExecution: true,
    trustedProducer: true,
  });
  const gates = requiredGateAdmission(
    value.paths,
    value.taskId,
    readJsonObject(taskStateFile(value.paths, value.taskId)),
    { environment: value.environment },
  );
  assert.equal(gates.passed, false);
  assert.equal(gates.releaseDecision, null);
  assert.match(gates.reasons.join("\n"), /typed fact evidence|integrated evidence content/);
});

test("integrated admission rejects typed evidence that disagrees with candidate metadata", (t) => {
  const value = releaseFixture(t, {
    integratedCandidateMetadataMismatch: true,
    profileRef: "integrated-app-v1",
    promotedExecution: true,
    trustedProducer: true,
  });
  const gates = requiredGateAdmission(
    value.paths,
    value.taskId,
    readJsonObject(taskStateFile(value.paths, value.taskId)),
    { environment: value.environment },
  );
  assert.equal(gates.passed, false);
  assert.equal(gates.releaseDecision, null);
  assert.match(gates.reasons.join("\n"), /does not match the candidate contract or config identity/);
});

test("integrated final sweep rejects facts cherry-picked from different raw reviews", (t) => {
  const value = releaseFixture(t, {
    profileRef: "integrated-app-v1",
    promotedExecution: true,
    splitIntegratedSources: true,
    trustedProducer: true,
  });
  const gates = requiredGateAdmission(
    value.paths,
    value.taskId,
    readJsonObject(taskStateFile(value.paths, value.taskId)),
    { environment: value.environment },
  );
  assert.equal(gates.passed, false);
  assert.equal(gates.releaseDecision, null);
  assert.match(gates.reasons.join("\n"), /must bind one atomic raw review/);
});

test("integrated final sweep validates deployment attestation content", (t) => {
  const value = releaseFixture(t, {
    deploymentAttestationMismatch: true,
    profileRef: "integrated-app-v1",
    promotedExecution: true,
    trustedProducer: true,
  });
  const gates = requiredGateAdmission(
    value.paths,
    value.taskId,
    readJsonObject(taskStateFile(value.paths, value.taskId)),
    { environment: value.environment },
  );
  assert.equal(gates.passed, false);
  assert.equal(gates.releaseDecision, null);
  assert.match(gates.reasons.join("\n"), /attestation content does not match/);
});

test("release completion rejects a missing or mismatched controller authority event", (t) => {
  const value = releaseFixture(t, { trustedProducer: true });
  runSliceAccept(parseSliceAcceptArgs([
    value.taskId, `--brief=${value.briefPath}`, "--operation-id=accept-authority-test",
    `--keeper-output=release:final-sweep=${value.keeperRelative}`,
  ]), { environment: value.environment });
  const state = readJsonObject(taskStateFile(value.paths, value.taskId));

  for (const mutate of [
    (candidate) => { candidate.execution_authority.delivery_authority_ref = "user-message:forged"; },
    (candidate) => { candidate.execution_authority.established_revision += 1; },
  ]) {
    const forged = structuredClone(state);
    mutate(forged);
    const admission = executionCompletionAdmission(
      value.paths, value.taskId, forged, { environment: value.environment },
    );
    assert.equal(admission.passed, false);
    assert.match(admission.reasons.join("\n"), /release delivery authority/);
    assert.notEqual(admission.releaseDecision?.status, "certified");
  }
});

test("non-implementation release authority cannot derive a completion decision", (t) => {
  const value = releaseFixture(t);
  const state = readJsonObject(taskStateFile(value.paths, value.taskId));
  state.execution_authority.work_type = "planning";
  const completion = executionCompletionAdmission(value.paths, value.taskId, state, {
    environment: value.environment,
  });
  assert.equal(completion.passed, false);
  assert.equal(completion.releaseDecision, null);
  assert.match(completion.reasons.join("\n"), /work_type implementation/);
});

test("direct task verification can finish work but can never certify a release", (t) => {
  const { environment, paths, root } = temporaryWorkflow(t);
  const taskId = createTask("Direct task", "verify without Team release authority", { clock, environment });
  startTask(taskId, { clock, environment });
  const repo = path.join(root, "direct-repo");
  fs.mkdirSync(repo, { recursive: true });
  git(repo, ["init", "-q"]);
  git(repo, ["config", "user.email", "atlas@example.test"]);
  git(repo, ["config", "user.name", "Atlas Test"]);
  write(path.join(repo, "README.md"), "direct task\n");
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "-qm", "test: direct task"]);
  runVerification(parseVerifyArgs([
    taskId, "--", process.execPath, "-e", "process.exit(0)",
  ]), { clock, cwd: repo, environment, recordToken: "20260730T080000999999999" });
  completeTask(taskId, { clock, environment, operationId: "complete-direct-task" });
  assert.equal(readJsonObject(taskStateFile(paths, taskId)).completion.release_decision, null);
});

test("release decisions cannot be authored", (t) => {
  const { paths } = temporaryWorkflow(t);
  const manifest = buildCandidateManifest({
    schema_version: 1,
    release_binding: {},
    source: { repo_realpath: "/tmp/repo", head_sha: "a".repeat(40), tree_oid: "b".repeat(40) },
    components: {},
  });
  manifest.release_decision = "certified";
  assert.match(validateCandidateManifest(manifest).join("\n"), /unknown key: release_decision/);
  assert.throws(
    () => setTaskStateFields(paths, "missing", { "completion.release_decision.status": "certified" }),
    /derived and cannot be written directly/,
  );
  assert.throws(
    () => writeTaskCompletion(paths, "missing", { release_decision: { status: "certified" } }),
    /derived and cannot be written directly/,
  );
});

test("valid final sweeps preserve denied and cannot_verify as distinct decisions", (t) => {
  for (const [formalOwnerStatus, expected] of [
    ["rejected", "denied"],
    ["cannot_verify", "cannot_verify"],
  ]) {
    const value = releaseFixture(t, { formalOwnerStatus });
    const gates = requiredGateAdmission(
      value.paths,
      value.taskId,
      readJsonObject(taskStateFile(value.paths, value.taskId)),
      { environment: value.environment },
    );
    assert.equal(gates.passed, true, gates.reasons.join("\n"));
    assert.equal(gates.releaseDecision.status, expected);
  }
});

test("candidate or typed-fact drift invalidates the final sweep", (t) => {
  const value = releaseFixture(t);
  const state = readJsonObject(taskStateFile(value.paths, value.taskId));
  const summaries = Object.values(state.verification.required_gates);
  const admitted = evaluateReleaseSweep({
    contractMarkdown: fs.readFileSync(value.contract, "utf8"),
    environment: value.environment,
    paths: value.paths,
    receipts: summaries,
    releaseBinding: value.releaseBinding,
    repo: value.repo,
    snapshot: value.snapshot,
    taskId: value.taskId,
    workType: "implementation",
  });
  assert.equal(admitted.admissible, true, admitted.reasons.join("\n"));

  const factPath = value.factPaths.values().next().value;
  fs.appendFileSync(factPath, "\n");
  const drifted = evaluateReleaseSweep({
    contractMarkdown: fs.readFileSync(value.contract, "utf8"),
    environment: value.environment,
    paths: value.paths,
    receipts: summaries,
    releaseBinding: value.releaseBinding,
    repo: value.repo,
    snapshot: value.snapshot,
    taskId: value.taskId,
    workType: "implementation",
  });
  assert.equal(drifted.admissible, false);
  assert.match(drifted.reasons.join("\n"), /verification output changed after capture/);
});

test("release consumption rejects a deterministic path swap after opening verified bytes", (t) => {
  const value = releaseFixture(t);
  const summaries = Object.values(
    readJsonObject(taskStateFile(value.paths, value.taskId)).verification.required_gates,
  );
  const factPath = value.factPaths.values().next().value, factInode = fs.statSync(factPath).ino;
  const originalRead = fs.readFileSync;
  let swapped = false, result;
  fs.readFileSync = function readWithSwap(file, ...args) {
    if (!swapped && Number.isInteger(file) && fs.fstatSync(file).ino === factInode) {
      fs.renameSync(factPath, `${factPath}.opened`);
      fs.writeFileSync(factPath, "{}\n");
      swapped = true;
    }
    return originalRead.call(fs, file, ...args);
  };
  try {
    result = evaluateReleaseSweep({
      contractMarkdown: originalRead.call(fs, value.contract, "utf8"),
      environment: value.environment, paths: value.paths, receipts: summaries,
      releaseBinding: value.releaseBinding, repo: value.repo, snapshot: value.snapshot,
      taskId: value.taskId, workType: "implementation",
    });
  } finally {
    fs.readFileSync = originalRead;
  }
  assert.equal(swapped, true); assert.equal(result.admissible, false);
  assert.match(result.reasons.join("\n"), /path or content changed during capture/);
});

test("inline release receipts cannot bypass canonical task artifacts and events", (t) => {
  const value = releaseFixture(t);
  const state = readJsonObject(taskStateFile(value.paths, value.taskId));
  const summaries = Object.values(state.verification.required_gates);
  const critical = summaries.find((item) => (
    item.release_requirement.requirement_ref === "web-ui-v1.critical-journey"
  ));
  const originalCandidate = JSON.parse(fs.readFileSync(value.candidatePath, "utf8"));
  const alternateArtifact = write(
    path.join(value.releaseRoot, "materials/alternate-artifact.txt"),
    "a different deployed artifact manifest\n",
  );
  const alternateBody = structuredClone(originalCandidate);
  delete alternateBody.manifest_digest;
  alternateBody.components.artifact = {
    input_ref: alternateArtifact,
    sha256: sha256(fs.readFileSync(alternateArtifact)),
  };
  const alternateCandidate = buildCandidateManifest(alternateBody);
  const alternateCandidatePath = write(
    path.join(value.releaseRoot, "alternate-candidate-manifest.json"),
    alternateCandidate,
  );
  const alternateRaw = structuredClone(value.raw.business);
  alternateRaw.candidate_manifest_digest = alternateCandidate.manifest_digest;
  const alternateRawPath = write(path.join(value.releaseRoot, "raw/alternate-business.json"), alternateRaw);
  const alternateFact = collectBusinessAcceptance(alternateRaw, {
    policyBinding: value.policies.get("web-ui-v1.critical-journey"),
    candidateManifestDigest: alternateCandidate.manifest_digest,
    evaluatedAt: NOW,
  });
  const alternateFactPath = write(
    path.join(value.releaseRoot, "facts/alternate-critical-journey.json"),
    alternateFact,
  );
  const inputPaths = [...new Set([
    alternateCandidatePath,
    alternateFactPath,
    alternateRawPath,
    ...Object.values(alternateCandidate.components).map((item) => item.input_ref),
    ...alternateFact.evidence_refs.map((item) => item.ref),
  ])];
  const captured = captureVerificationIdentity({
    argv: value.command,
    cwd: value.evidenceDir,
    environment: value.environment,
    inputPaths,
  });
  const alternateReceipt = buildVerificationIdentityRecord({
    schema_version: 3,
    task_id: value.taskId,
    created_at: NOW,
    gate_class: critical.gate_class,
    verdict: "passed",
    outcome: "passed",
    provenance: "fresh-executed",
    required_gate: Object.fromEntries(Object.entries(critical).filter(([key]) => !new Set([
      "completed_at", "event_revision", "identity_digest", "identity_record", "outcome",
      "provenance", "record_digest", "record_id",
    ]).has(key))),
    identity: captured.identity,
    identity_digest: captured.identityDigest,
    pre_identity_digest: captured.identityDigest,
    snapshot_stable: true,
    result: {
      exit_code: 0,
      stdout_sha256: sha256(Buffer.alloc(0)),
      stderr_sha256: sha256(Buffer.alloc(0)),
      evidence_refs: [alternateFactPath],
    },
  });
  const mixed = evaluateReleaseSweep({
    contractMarkdown: fs.readFileSync(value.contract, "utf8"),
    environment: value.environment,
    paths: value.paths,
    receipts: summaries.map((item) => item === critical ? alternateReceipt : item),
    releaseBinding: value.releaseBinding,
    repo: value.repo,
    snapshot: value.snapshot,
    taskId: value.taskId,
    workType: "implementation",
  });
  assert.equal(mixed.admissible, false);
  assert.match(mixed.reasons.join("\n"), /missing identity_record/);
});
