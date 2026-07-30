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
const { captureVerificationIdentity, sha256 } = require(path.join(
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

function policyContext() {
  const profile = loadBundledProfile("web-ui-v1");
  const binding = profileBinding(profile);
  const policies = new Map(profile.requirements.map((requirement) => [
    requirement.requirement_id,
    releaseRequirementProjection(profile, binding, requirement),
  ]));
  return { binding, policies, profile };
}

function rawInputs(candidateDigest, files, surfaceRef) {
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
  return { business, data, formal, operability };
}

function buildFacts(profile, policies, raw, candidateDigest) {
  const formalPolicies = [...policies.values()].filter((policy) => (
    policy.collector_adapter_ref === "formal-web-ui-v1@1"
  ));
  const facts = new Map();
  facts.set("web-ui-v1.critical-journey", collectBusinessAcceptance(raw.business, {
    policyBinding: policies.get("web-ui-v1.critical-journey"),
    candidateManifestDigest: candidateDigest,
    evaluatedAt: NOW,
  }));
  for (const fact of collectFormalWebUi(raw.formal, {
    policyBindings: formalPolicies,
    candidateManifestDigest: candidateDigest,
    evaluatedAt: NOW,
  })) facts.set(fact.policy_binding.requirement_ref, fact);
  facts.set("web-ui-v1.production-data", collectReleaseData(raw.data, {
    policyBinding: policies.get("web-ui-v1.production-data"),
    candidateManifestDigest: candidateDigest,
    evaluatedAt: NOW,
  }));
  facts.set("web-ui-v1.security-operability", collectReleaseOperability(raw.operability, {
    policyBinding: policies.get("web-ui-v1.security-operability"),
    candidateManifestDigest: candidateDigest,
    evaluatedAt: NOW,
  }));
  assert.deepEqual([...facts.keys()].sort(), profile.requirements.map((item) => item.requirement_id).sort());
  return facts;
}

function releaseFixture(t, { formalOwnerStatus = "accepted" } = {}) {
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
  const { binding, policies, profile } = policyContext();
  const intent = {
    schema_version: 1,
    target_delivery_class: "product_release",
    target_delivery_authority_ref: "goal:REL-PRODUCT",
    release_stage: "mvp",
    surface_inventory: { ref: "surface-inventory", sha256: sha256(fs.readFileSync(surfaceFile)) },
    surface_kinds: ["web_ui"],
    release_profile_refs: [{ profile_ref: profile.profile_id, profile_sha256: binding.profile_sha256 }],
    release_claim_refs: ["AC-CLAIM"],
    audience_refs: ["AC-AUDIENCE"],
    critical_outcome_refs: ["AC-OUTCOME"],
  };
  const releaseBinding = releasePlanBinding(intent);
  const command = [process.execPath, "-e", "process.exit(0)"];
  const checks = profile.requirements.map((requirement) => ({
    check_id: `release-${requirement.dimension}`,
    gate_class: requirement.check_definition.allowed_gate_classes[0],
    command: formatCommand(command).trimEnd(),
    final_only: true,
    cache_policy: "fresh-executed",
    release_requirement: policies.get(requirement.requirement_id),
  }));
  const plan = {
    schema_version: 2,
    size_policy: { policy_id: "atlas-slice-size-v2" },
    release: releaseBinding,
    slices: [{
      slice_id: "release-slice",
      objective: "Run one terminal same-candidate release sweep.",
      depends_on: [],
      keeper_outputs: ["release:final-sweep"],
      owned_paths: ["release/output/**"],
      forbidden_paths: ["plugins/multica-sdlc/**"],
      acceptance_refs: ["AC-RELEASE"],
      risk_class: "critical",
      failure_domain: "release-certification",
      rollback_boundary: "one release evidence commit",
      estimate: {
        estimated_changed_files: 24, estimated_net_loc: 100, target_p90_minutes: 90,
        serial_dependency_depth: 0, independent_vertical_count: 1,
      },
      budget: {
        max_changed_files: 32, max_loc: 400, max_wall_clock_minutes: 120,
        max_required_checks: 7,
      },
      checks,
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
  runRecordStart(parseRecordStartArgs([
    taskId, "execute final release sweep", "--mode=execute",
    "--authorization-ref=user-message:release", `--brief=${briefPath}`,
    "--operation-id=start-release-sweep",
  ]), { cwd: repo, environment });
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
  const candidate = buildCandidateManifest({
    schema_version: 1,
    release_binding: releaseBinding,
    source: { repo_realpath: repo, head_sha: snapshot.head_sha, tree_oid: snapshot.tree_oid },
    components,
  });
  const candidatePath = write(path.join(releaseRoot, "candidate-manifest.json"), candidate);
  const surfaceRef = { ref: surfaceFile, sha256: intent.surface_inventory.sha256, kind: "surface_inventory" };
  const raw = rawInputs(candidate.manifest_digest, evidenceFiles, surfaceRef);
  raw.formal.owner_decision.status = formalOwnerStatus;
  const rawPaths = {
    "business-acceptance-v2@2": write(path.join(releaseRoot, "raw/business.json"), raw.business),
    "formal-web-ui-v1@1": write(path.join(releaseRoot, "raw/formal.json"), raw.formal),
    "release-data-v1@1": write(path.join(releaseRoot, "raw/data.json"), raw.data),
    "release-operability-v1@1": write(path.join(releaseRoot, "raw/operability.json"), raw.operability),
  };
  const facts = buildFacts(profile, policies, raw, candidate.manifest_digest);
  const factPaths = new Map([...facts].map(([requirementRef, fact]) => [
    requirementRef,
    write(path.join(releaseRoot, `facts/${requirementRef}.json`), fact),
  ]));
  for (const [index, requirement] of profile.requirements.entries()) {
    const policy = policies.get(requirement.requirement_id);
    const fact = facts.get(requirement.requirement_id);
    const factPath = factPaths.get(requirement.requirement_id);
    const inputs = [...new Set([
      candidatePath,
      factPath,
      rawPaths[policy.collector_adapter_ref],
      ...Object.values(components).map((item) => item.input_ref),
      ...fact.evidence_refs.map((item) => item.ref),
    ])];
    runVerification(parseVerifyArgs([
      taskId, `--brief=${briefPath}`, "--slice-id=release-slice",
      `--check-id=release-${requirement.dimension}`, `--evidence=${factPath}`,
      ...inputs.flatMap((input) => ["--input", input]),
      "--", ...command,
    ]), {
      clock,
      cwd: evidenceDir,
      environment,
      operationId: `verify-${requirement.dimension}`,
      recordToken: `20260730T08000000000000${index}`,
    });
  }
  return {
    briefPath, candidatePath, command, contract, environment, evidenceDir, factPaths,
    keeperRelative, paths, policies, profile, raw, releaseBinding, releaseRoot,
    repo, snapshot, taskId,
  };
}

test("Team final sweep persists the only derived certified decision", (t) => {
  const value = releaseFixture(t);
  const beforeAcceptance = readJsonObject(taskStateFile(value.paths, value.taskId));
  assert.equal(beforeAcceptance.execution_authority.work_type, "implementation");
  const gates = requiredGateAdmission(value.paths, value.taskId, beforeAcceptance, {
    environment: value.environment,
  });
  assert.equal(gates.passed, true, gates.reasons.join("\n"));
  assert.equal(gates.releaseDecision.status, "certified");
  assert.equal(gates.verificationRecords.filter((item) => item.release_fact_id).length, 7);

  runSliceAccept(parseSliceAcceptArgs([
    value.taskId, `--brief=${value.briefPath}`, "--operation-id=accept-release-sweep",
    `--keeper-output=release:final-sweep=${value.keeperRelative}`,
  ]), { environment: value.environment });
  completeTask(value.taskId, {
    clock, environment: value.environment, operationId: "complete-release-task",
  });
  const completed = readJsonObject(taskStateFile(value.paths, value.taskId));
  assert.equal(completed.completion.release_decision.status, "certified");
  assert.equal(completed.completion.release_decision.authority, "derived-from-final-release-sweep");
  assert.equal(completed.completion.release_decision.candidate_manifest_digest,
    JSON.parse(fs.readFileSync(value.candidatePath)).manifest_digest);
  assert.match(completed.completion.release_decision.decision_id, /^sha256:[a-f0-9]{64}$/);
  assert.equal(
    executionCompletionAdmission(value.paths, value.taskId, completed, { environment: value.environment })
      .releaseDecision.status,
    "certified",
  );
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
  assert.match(drifted.reasons.join("\n"), /changed after verification/);
});

test("mixed candidate receipts cannot be assembled into a release", (t) => {
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
  assert.match(mixed.reasons.join("\n"), /do not bind one identical candidate manifest/);
});
