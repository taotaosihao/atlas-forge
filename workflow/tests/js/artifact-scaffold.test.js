"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const test = require("node:test");

const WORKFLOW_ROOT = path.resolve(__dirname, "../..");
const PUBLIC_BIN = path.join(WORKFLOW_ROOT, "bin", "codex-workflow");
const TEMPLATE_DIR = path.join(WORKFLOW_ROOT, "templates");
const { relativeToCodeHome, resolvePaths, taskArtifactDir } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/core/paths.js",
));
const { captureWorktreeSnapshot } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/core/worktree-snapshot.js",
));
const { mutateTaskRuntime, taskEventFile } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/core/task-mutation.js",
));
const {
  captureVerificationIdentity,
  captureVerificationOutput,
  digestCanonical,
  sha256,
} = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/verification/identity.js",
));
const {
  buildVerificationIdentityRecord,
  renderVerificationRecord,
} = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/verification/record.js",
));
const { formatCommand } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/verification/runner.js",
));
const { createTask, localDay, startTask } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/task/lifecycle.js",
));
const { renderTaskFields } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/task/repository.js",
));
const { projectTaskState, taskRuntimeFile } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/task/runtime.js",
));
const {
  ArtifactScaffoldError,
  scaffoldBrainstorm,
  scaffoldClarify,
  scaffoldIntake,
  scaffoldPhase,
  scaffoldTeam,
} = require(path.join(WORKFLOW_ROOT, "bin/lib/codex-workflow/artifact/scaffold.js"));
const { writePhaseReportProjection } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/artifact/phase-report.js",
));
const { transitionAuthorityState } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/team/execution-grant.js",
));
const { createTeamRun } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/team/lane-registry.js",
));
const {
  canonicalScopeVNext,
  scopeCoreDigest,
  scopeDigest,
} = require(path.resolve(
  WORKFLOW_ROOT,
  "../plugins/atlas-workflow/contracts/team-sdd/validators/scope-grant.js",
));

function fixedClock() {
  return new Date("2026-07-10T04:00:00Z");
}

function temporaryWorkflow(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-artifact-scaffold."));
  const environment = {
    ...process.env,
    CODEX_HOME_ROOT: home,
    CODEX_WORKFLOW_ROOT: path.join(home, "workflow"),
    CODEX_WORKFLOW_TEMPLATE_DIR: TEMPLATE_DIR,
    TMPDIR: path.join(home, "tmp"),
  };
  t.after(() => fs.rmSync(home, { force: true, recursive: true }));
  return { environment, paths: resolvePaths(environment) };
}

function createFixtureTask(environment, title = "Artifact scaffold") {
  return createTask(title, "scaffold contract", {
    clock: fixedClock,
    environment,
  });
}

function canonicalPhaseFixture(t, {
  accepted = true,
  invalidReleaseDecision = false,
  required = true,
  withReleaseDecision = false,
} = {}) {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Canonical phase report");
  startTask(taskId, { clock: fixedClock, environment });
  const repo = path.join(paths.root, "phase-report-repo");
  fs.mkdirSync(repo, { recursive: true });
  assert.equal(spawnSync("git", ["init", "-q", repo]).status, 0);
  assert.equal(spawnSync("git", ["-C", repo, "config", "user.email", "atlas@example.test"]).status, 0);
  assert.equal(spawnSync("git", ["-C", repo, "config", "user.name", "Atlas Test"]).status, 0);
  const checkCommand = [process.execPath, "-e", "process.exit(0)"];
  const checkCommandText = formatCommand(checkCommand).trimEnd();
  const releaseBinding = withReleaseDecision ? {
    target_delivery_class: "product_release",
    intent_sha256: `sha256:${"d".repeat(64)}`,
    profile_ref: "web-ui-v1",
    profile_sha256: `sha256:${"e".repeat(64)}`,
    check_definition_set_sha256: `sha256:${"9".repeat(64)}`,
    requirement_refs: ["web-ui-v1.critical-journey"],
  } : null;
  const releaseRequirement = withReleaseDecision ? {
    profile_ref: releaseBinding.profile_ref,
    profile_sha256: releaseBinding.profile_sha256,
    requirement_ref: releaseBinding.requirement_refs[0],
    requirement_sha256: `sha256:${"1".repeat(64)}`,
    dimension: "critical-journey",
    required: true,
    waiver_policy: "never",
    definition_ref: "test-definition@1",
    definition_sha256: `sha256:${"2".repeat(64)}`,
    collector_adapter_ref: "test-collector@1",
    collector_adapter_sha256: `sha256:${"3".repeat(64)}`,
    fact_schema_ref: "test-fact@1",
    fact_schema_sha256: `sha256:${"4".repeat(64)}`,
    evaluator_ref: "test-evaluator@1",
    evaluator_sha256: `sha256:${"5".repeat(64)}`,
    pass_rule_sha256: `sha256:${"6".repeat(64)}`,
    required_candidate_components: ["artifact"],
  } : null;
  const plan = {
    schema_version: withReleaseDecision ? 4 : 3,
    size_policy: { policy_id: "atlas-slice-size-v2" },
    ...(releaseBinding ? { release: releaseBinding } : {}),
    slices: [{
      slice_id: "product-flow",
      objective: "用户可以完成项目创建",
      depends_on: [],
      keeper_outputs: ["product:create-project"],
      owned_paths: ["src/**"],
      forbidden_paths: [],
      acceptance_refs: ["AC-PRODUCT"],
      risk_class: "high",
      failure_domain: "product-flow",
      rollback_boundary: "one commit",
      estimate: {
        estimated_changed_files: 1,
        estimated_net_loc: 10,
        target_p90_minutes: 10,
        serial_dependency_depth: 0,
        independent_vertical_count: 1,
      },
      budget: {
        max_changed_files: 2,
        max_loc: 20,
        max_wall_clock_minutes: 20,
        max_required_checks: 1,
      },
      checks: [{
        check_id: "browser-create-project",
        gate_class: "browser-flow",
        command: checkCommandText,
        final_only: true,
        cache_policy: "fresh-executed",
        ...(releaseRequirement ? { release_requirement: releaseRequirement } : {}),
      }],
    }],
  };
  const contract = path.join(repo, "implementation-contract.final.md");
  fs.writeFileSync(contract, [
    "# Product contract",
    "",
    `task_id: ${taskId}`,
    `contract_semantics_version: ${withReleaseDecision ? 6 : 5}`,
    ...(withReleaseDecision ? ["work_type: implementation"] : []),
    "",
    "## Acceptance Criteria",
    "",
    "| ID | Criterion | Required | Verification | Authority |",
    "|----|-----------|----------|--------------|-----------|",
    `| AC-PRODUCT | 用户可以创建一个项目并看到详情页 | ${required ? "yes" : "no"} | 在正式服务界面创建项目，确认详情持久化 | goal:PRODUCT |`,
    "",
    "```atlas-execution-plan+json",
    JSON.stringify(plan, null, 2),
    "```",
    "",
  ].join("\n"));
  assert.equal(spawnSync("git", ["-C", repo, "add", "implementation-contract.final.md"]).status, 0);
  assert.equal(spawnSync("git", ["-C", repo, "commit", "-qm", "test: phase report contract"]).status, 0);
  const baseSha = spawnSync(
    "git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" },
  ).stdout.trim();
  const briefPath = path.join(
    taskArtifactDir(paths, taskId), "team/sdd/slices/product-flow/brief.json",
  );
  fs.mkdirSync(path.dirname(briefPath), { recursive: true });
  fs.writeFileSync(briefPath, "{\"schema_version\":4}\n");
  const contractSha256 = sha256(fs.readFileSync(contract));
  const rawScope = {
    schema_version: 1,
    grant_id: "phase-report-grant",
    task_id: taskId,
    repo: { realpath: fs.realpathSync(repo), base_sha: baseSha },
    objective: "用户可以完成项目创建",
    contract: {
      path: "implementation-contract.final.md",
      sha256: contractSha256,
      semantics_version: withReleaseDecision ? 6 : 5,
      authority_slices: [{
        path: path.join(
          environment.CODEX_WORKFLOW_ROOT,
          "artifacts", taskId, "team/sdd/slices/authority-phase-report",
        ),
        task_id: taskId,
        slice_id: "authority-phase-report",
        brief_json_sha256: `sha256:${"1".repeat(64)}`,
        brief_md_sha256: `sha256:${"2".repeat(64)}`,
        evidence_manifest_sha256: null,
        review_verdict_sha256: null,
        controller_resolution_sha256: null,
        global_constraints_sha256: null,
      }],
    },
    execution_plan: {
      schema_version: plan.schema_version,
      sha256: digestCanonical(plan),
    },
    owned_paths: ["src/**"],
    forbidden_paths: [],
    required_slices: [{
      slice_id: "product-flow",
      objective: "用户可以完成项目创建",
      brief_path: "team/sdd/slices/product-flow/brief.json",
      brief_sha256: sha256(fs.readFileSync(briefPath)),
      depends_on: [],
      keeper_outputs: ["product:create-project"],
      owned_paths: ["src/**"],
      forbidden_paths: [],
      acceptance_refs: ["AC-PRODUCT"],
      estimate: { ...plan.slices[0].estimate },
      budget: { ...plan.slices[0].budget },
      checks: [{
        check_id: "browser-create-project",
        gate_class: "browser-flow",
        command: checkCommandText,
        final_only: true,
        cache_policy: "fresh-executed",
        release_requirement: releaseRequirement,
      }],
    }],
    size_exceptions: [],
    scope_core_digest: `sha256:${"0".repeat(64)}`,
    authorization_provenance: {
      kind: "user-message",
      ref: "user-message:phase-report",
    },
    release_binding: releaseBinding,
    parent: null,
    supersedes_grant_id: null,
    evidence_policy: { mode: "invalidate-incompatible", retained_receipt_ids: [] },
    design_handoff: withReleaseDecision ? {
      status: "approved",
      task_id: taskId,
      designed_feature_target: "product_release",
      context_path: "product-design/A-product-context.md",
      context_sha256: `sha256:${"a".repeat(64)}`,
      context_identity: `sha256:${"b".repeat(64)}`,
      scenario_path: "product-design/C-critical-scenario.md",
      scenario_sha256: `sha256:${"c".repeat(64)}`,
      scenario_identity: `sha256:${"d".repeat(64)}`,
      scenario_approval_ref: "user-message:phase-report-scenario",
      flow_path: "product-design/D-flow-design.md",
      flow_sha256: `sha256:${"e".repeat(64)}`,
      flow_identity: `sha256:${"f".repeat(64)}`,
      flow_approval_ref: "user-message:phase-report-flow",
      handoff_path: "product-design/E-design-handoff.md",
      handoff_sha256: `sha256:${"7".repeat(64)}`,
    } : {
      status: "not_applicable",
      reason: "This fixture has no executable Design Handoff.",
      contract_sha256: contractSha256,
    },
    first_code: {
      status: "not_applicable",
      reason: "This fixture projects already-recorded acceptance rather than executing code.",
      contract_sha256: contractSha256,
    },
  };
  const coreScope = canonicalScopeVNext(rawScope, { skipCoreDigestCheck: true });
  rawScope.scope_core_digest = scopeCoreDigest(coreScope);
  const scope = canonicalScopeVNext(rawScope);
  const grant = {
    schema_version: 1,
    grant_id: "phase-report-grant",
    status: "active",
    scope_digest: scopeDigest(scope),
    scope,
    evidence_epoch: 1,
    authorization_provenance: scope.authorization_provenance,
    issued_at: "2026-07-10T04:00:00Z",
    issued_revision: 0,
    terminal: null,
  };
  mutateTaskRuntime(paths, taskId, {
    kind: "authority.grant.issued",
    operationId: "authorize-phase-report",
    data: {
      authorization_ref: scope.authorization_provenance.ref,
      brief_path: briefPath,
      grant_id: grant.grant_id,
      objective: scope.objective,
      expected_scope_digest: grant.scope_digest,
    },
  }, ({ currentProjection, revision }) => {
    grant.issued_revision = revision + 1;
    const transition = {
      schema_version: 1,
      type: "grant-issued",
      revision: revision + 1,
      grant,
      delivery_authority: releaseBinding ? {
        kind: "user-message",
        ref: "user-message:phase-report",
        established_revision: revision + 1,
        contract_sha256: scope.contract.sha256,
        execution_plan_sha256: scope.execution_plan.sha256,
        release_binding: releaseBinding,
      } : null,
    };
    const state = structuredClone(currentProjection.state);
    transitionAuthorityState(state, transition);
    return {
      authorityTransition: transition,
      projection: { task_content: currentProjection.task_content, state },
      result: {
        grant,
        grant_id: grant.grant_id,
        scope_digest: grant.scope_digest,
        evidence_epoch: grant.evidence_epoch,
      },
    };
  }, { clock: fixedClock, environment });

  let acceptedReceipt = null;
  let verificationReceipt = null;
  let releaseFactId = "";
  let candidateManifestDigest = "";
  if (accepted) {
    const admissionSnapshot = captureWorktreeSnapshot(repo);
    mutateTaskRuntime(paths, taskId, {
      kind: "team.started",
      operationId: "start-phase-report",
      data: {
        mode: "execute",
        objective: scope.objective,
        backend: "",
        fallback_policy: "",
        authorization_ref: scope.authorization_provenance.ref,
        grant_id: grant.grant_id,
        scope_digest: grant.scope_digest,
        agents: "",
        roles: "",
        providers: "",
        selection_authority_kind: "",
        selection_authority_ref: "",
        brief_path: briefPath,
        brief_sha256: scope.required_slices[0].brief_sha256,
        contract_sha256: scope.contract.sha256,
        execution_plan_sha256: scope.execution_plan.sha256,
      },
    }, ({ currentProjection, revision }) => {
      const artifactDir = currentProjection.state.artifact_dir;
      const decisionPath = `${artifactDir}/team/decision.md`.replace(/^\//, "");
      const staffingPath = `${artifactDir}/team/staffing.md`.replace(/^\//, "");
      const admission = {
        mode: "execution-vnext",
        brief: {
          path: briefPath,
          sha256: scope.required_slices[0].brief_sha256,
          slice_id: "product-flow",
          contract_path: contract,
          contract_sha256: scope.contract.sha256,
          execution_plan_schema_version: scope.execution_plan.schema_version,
          execution_plan_sha256: scope.execution_plan.sha256,
          base_sha: scope.repo.base_sha,
          repo: scope.repo.realpath,
          ...(releaseBinding ? {
            work_type: "implementation",
            release: releaseBinding,
            delivery_authority_ref: scope.authorization_provenance.ref,
          } : {}),
        },
        admitted_owned_paths: [...scope.required_slices[0].owned_paths],
        required_slices: ["product-flow"],
        canonical_objective: scope.objective,
        grant_id: grant.grant_id,
        scope_digest: grant.scope_digest,
        evidence_epoch: grant.evidence_epoch,
        slice_start_snapshot: {
          ...admissionSnapshot,
          worktree_manifest_digest: digestCanonical(admissionSnapshot),
          captured_at_revision: revision + 1,
        },
      };
      const team = createTeamRun({
        previous: currentProjection.state.active_team || {},
        mode: "execute",
        objective: scope.objective,
        configuredBackend: null,
        fallbackPolicy: "",
        authorizationRef: scope.authorization_provenance.ref,
        agents: "",
        roles: "",
        providers: "",
        decision: decisionPath,
        staffing: staffingPath,
        now: "2026-07-10T04:00:00Z",
        teamSelection: null,
      });
      Object.assign(team, {
        admission,
        admitted_owned_paths: [...admission.admitted_owned_paths],
        slice_id: "product-flow",
        start_operation_id: "start-phase-report",
        grant_id: grant.grant_id,
        scope_digest: grant.scope_digest,
        evidence_epoch: grant.evidence_epoch,
      });
      const taskContent = renderTaskFields(currentProjection.task_content, {
        active_team_backend: team.backend,
        active_team_mode: team.mode,
        active_team_status: team.status,
        active_team_decision: team.decision,
      });
      const state = projectTaskState(
        paths, taskId, taskContent, currentProjection.state, fixedClock,
      );
      state.active_team = team;
      state.updated_at = "2026-07-10T04:00:00Z";
      return {
        projection: { task_content: taskContent, state },
        result: { team },
      };
    }, { clock: fixedClock, environment });

    mutateTaskRuntime(paths, taskId, {
      kind: "team.promoted",
      operationId: "finish-phase-report",
      data: {
        target: "finish",
        authorization_ref: "",
        grant_id: "",
        scope_digest: "",
        brief_path: "",
        brief_sha256: "",
        contract_sha256: "",
        execution_plan_sha256: "",
      },
    }, ({ currentProjection }) => {
      const team = structuredClone(currentProjection.state.active_team);
      team.status = "promoted:finish";
      team.promoted_to = "finish";
      team.decision = `${currentProjection.state.artifact_dir}/team/decision.md`.replace(/^\//, "");
      const taskContent = renderTaskFields(currentProjection.task_content, {
        active_team_backend: team.backend,
        active_team_mode: team.mode,
        active_team_status: team.status,
        active_team_decision: team.decision,
      });
      const state = projectTaskState(
        paths, taskId, taskContent, currentProjection.state, fixedClock,
      );
      state.active_team = team;
      state.updated_at = "2026-07-10T04:00:00Z";
      return {
        projection: { task_content: taskContent, state },
        result: { team },
      };
    }, { clock: fixedClock, environment });

    const keeperPath = path.join(repo, "src/keeper.txt");
    fs.mkdirSync(path.dirname(keeperPath), { recursive: true });
    fs.writeFileSync(keeperPath, "project creation verified\n");
    assert.equal(spawnSync("git", ["-C", repo, "add", "src/keeper.txt"]).status, 0);
    assert.equal(spawnSync(
      "git", ["-C", repo, "commit", "-qm", "test: verified project flow"],
    ).status, 0);
    const acceptedHead = spawnSync(
      "git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" },
    ).stdout.trim();
    const acceptedTree = spawnSync(
      "git", ["-C", repo, "rev-parse", "HEAD^{tree}"], { encoding: "utf8" },
    ).stdout.trim();

    const releaseDir = path.join(taskArtifactDir(paths, taskId), "release-fixture");
    fs.mkdirSync(releaseDir, { recursive: true });
    const rawPath = path.join(releaseDir, "raw.json");
    const candidatePath = path.join(releaseDir, "candidate.json");
    const factPath = path.join(releaseDir, "fact.json");
    let producerProvenance = null;
    let releaseEvidence = null;
    let identityInputPaths = [];
    let outputs = [];
    if (releaseRequirement) {
      fs.writeFileSync(rawPath, `${JSON.stringify({ passed: true })}\n`);
      const candidateBody = {
        schema_version: 1,
        source: {
          repo_realpath: fs.realpathSync(repo),
          head_sha: acceptedHead,
          tree_oid: acceptedTree,
        },
        components: { artifact: { sha256: sha256("verified artifact") } },
      };
      const candidate = {
        ...candidateBody,
        manifest_digest: digestCanonical(candidateBody),
      };
      candidateManifestDigest = candidate.manifest_digest;
      fs.writeFileSync(candidatePath, `${JSON.stringify(candidate)}\n`);
      const factBody = {
        schema_version: 1,
        policy_binding: releaseRequirement,
        candidate_manifest_digest: candidate.manifest_digest,
        outcome: "passed",
        reason_codes: [],
        summary: "critical journey passed",
        source: { ref: rawPath, sha256: sha256(fs.readFileSync(rawPath)), kind: "browser-report" },
        evidence_refs: [rawPath],
        evaluated_at: "2026-07-10T04:00:00Z",
      };
      const fact = { ...factBody, fact_id: digestCanonical(factBody) };
      releaseFactId = fact.fact_id;
      fs.writeFileSync(factPath, `${JSON.stringify(fact)}\n`);
      identityInputPaths = [candidatePath, rawPath];
      outputs = [captureVerificationOutput({ requested: factPath, path: factPath })];
    }

    const identityCapture = captureVerificationIdentity({
      argv: checkCommand,
      cwd: repo,
      environment,
      inputPaths: identityInputPaths,
    });
    const staticGate = {
      admission_head_sha: admissionSnapshot.head_sha,
      admission_tree_oid: admissionSnapshot.tree_oid,
      brief_sha256: scope.required_slices[0].brief_sha256,
      cache_policy: "fresh-executed",
      base_sha: scope.repo.base_sha,
      check_id: "browser-create-project",
      command_digest: sha256(checkCommandText),
      contract_sha256: scope.contract.sha256,
      execution_plan_sha256: scope.execution_plan.sha256,
      evidence_epoch: grant.evidence_epoch,
      final_only: true,
      gate_class: "browser-flow",
      grant_id: grant.grant_id,
      repo_realpath: scope.repo.realpath,
      scope_digest: grant.scope_digest,
      slice_id: "product-flow",
      ...(releaseRequirement ? { release_requirement: releaseRequirement } : {}),
    };
    const completedGate = { ...staticGate, candidate_tree_oid: acceptedTree };
    const authorityIdentity = {
      grant_id: grant.grant_id,
      scope_digest: grant.scope_digest,
      evidence_epoch: grant.evidence_epoch,
      slice_id: "product-flow",
      brief_sha256: scope.required_slices[0].brief_sha256,
      contract_sha256: scope.contract.sha256,
      execution_plan_sha256: scope.execution_plan.sha256,
      admission_head_sha: admissionSnapshot.head_sha,
      admission_tree_oid: admissionSnapshot.tree_oid,
      repo_realpath: scope.repo.realpath,
    };
    const checkBinding = {
      schema_version: 1,
      check_id: "browser-create-project",
      slice_id: "product-flow",
      gate_class: "browser-flow",
      command_digest: sha256(checkCommandText),
    };
    const executionTarget = {
      schema_version: 1,
      task_id: taskId,
      cwd_realpath: fs.realpathSync(repo),
      command: [...checkCommand],
      input_paths: [...identityInputPaths],
      output_paths: releaseRequirement ? [factPath] : [],
    };
    const claimIdentity = {
      schema_version: 2,
      claim_kind: "verification-command",
      task_id: taskId,
      operation_id: "verify-phase-report",
      claim_operation_id: "verify-phase-report-verification-claim",
      terminal_operation_id: "verify-phase-report",
      request_digest: digestCanonical({ executionTarget, staticGate }),
      execution_fingerprint: digestCanonical(executionTarget),
      execution_target: executionTarget,
      required_check_binding: checkBinding,
      authority_identity: authorityIdentity,
    };
    const claim = mutateTaskRuntime(paths, taskId, {
      kind: "verification.claimed",
      operationId: claimIdentity.claim_operation_id,
      data: claimIdentity,
    }, ({ currentProjection }) => {
      const state = structuredClone(currentProjection.state);
      const claimed = {
        ...claimIdentity,
        status: "in_progress",
        claimed_at: "2026-07-10T04:00:00Z",
      };
      state.verification = {
        ...(state.verification || {}),
        operation_claims: [...(state.verification?.operation_claims || []), claimed],
      };
      return {
        projection: { task_content: currentProjection.task_content, state },
        result: { claim: claimed },
      };
    }, { clock: fixedClock, environment });

    const sourceEntry = identityCapture.identity.inputs.find(
      (entry) => entry.requested === rawPath,
    );
    if (releaseRequirement) {
      producerProvenance = {
        schema_version: 1,
        producer_ref: "atlas-phase-report-fixture@1",
        producer_sha256: identityCapture.identity.toolchain.find((entry) => entry.sha256).sha256,
        source_ref: rawPath,
        source_sha256: sourceEntry.sha256,
        candidate_manifest_digest: candidateManifestDigest,
        requirement_refs: [releaseRequirement.requirement_ref],
      };
      const factEntry = outputs[0];
      const candidateEntry = identityCapture.identity.inputs.find(
        (entry) => entry.requested === candidatePath,
      );
      releaseEvidence = {
        schema_version: 1,
        requirement_ref: releaseRequirement.requirement_ref,
        fact: { entry: factEntry, content_base64: fs.readFileSync(factPath).toString("base64") },
        candidate_manifest: {
          entry: candidateEntry,
          content_base64: fs.readFileSync(candidatePath).toString("base64"),
        },
        producer_provenance: producerProvenance,
      };
    }
    const identityRecord = buildVerificationIdentityRecord({
      schema_version: 3,
      task_id: taskId,
      created_at: "2026-07-10T04:00:00Z",
      gate_class: "browser-flow",
      verdict: "passed",
      outcome: "passed",
      provenance: "fresh-executed",
      required_gate: completedGate,
      identity: identityCapture.identity,
      identity_digest: identityCapture.identityDigest,
      pre_identity_digest: identityCapture.identityDigest,
      snapshot_stable: true,
      result: {
        exit_code: 0,
        stdout_sha256: sha256(""),
        stderr_sha256: sha256(""),
        evidence_refs: [],
        outputs,
        ...(producerProvenance ? { producer_provenance: producerProvenance } : {}),
      },
    });
    const verificationDir = path.join(taskArtifactDir(paths, taskId), "verification");
    fs.mkdirSync(verificationDir, { recursive: true });
    const recordFile = path.join(verificationDir, "20260710T040000000000001.md");
    const identityFile = path.join(verificationDir, "20260710T040000000000001.json");
    const stdoutFile = path.join(paths.root, "phase-report-stdout");
    const stderrFile = path.join(paths.root, "phase-report-stderr");
    fs.writeFileSync(stdoutFile, "");
    fs.writeFileSync(stderrFile, "");
    const identityReference = relativeToCodeHome(paths, identityFile);
    const recordContent = renderVerificationRecord({
      recordFile,
      recordType: "verification",
      taskId,
      commandText: `${checkCommandText} `,
      cwd: repo,
      exitCode: 0,
      verdict: "passed",
      stdoutFile,
      stderrFile,
      createdAt: "2026-07-10T04:00:00Z",
      outcome: "passed",
      trajectory: "",
      evaluator: "local-command",
      failureAttribution: "",
      evidenceRefs: [],
      identityRecord: identityReference,
      recordId: identityRecord.record_id,
      identityDigest: identityRecord.identity_digest,
      snapshotStable: true,
    });
    const storedResult = {
      exitCode: 0,
      lines: [`task_id: ${taskId}`, `record: ${recordFile}`, "verdict: passed"],
      identityFile,
      recordFile,
    };
    const verification = mutateTaskRuntime(paths, taskId, {
      kind: "verification.recorded",
      operationId: "verify-phase-report",
      data: {
        authority_identity: authorityIdentity,
        claim_operation_id: claimIdentity.claim_operation_id,
        record_id: identityRecord.record_id,
        identity_digest: identityRecord.identity_digest,
        observed_revision: claim.event.revision - 1,
        claim_revision: claim.event.revision,
        request_digest: claimIdentity.request_digest,
        required_gate: completedGate,
        release_evidence: releaseEvidence,
        verdict: "passed",
        outcome: "passed",
      },
    }, ({ currentProjection, revision }) => {
      const taskContent = renderTaskFields(currentProjection.task_content, {
        last_verified_at: "2026-07-10T04:00:00Z",
      });
      const state = projectTaskState(paths, taskId, taskContent, currentProjection.state, fixedClock);
      state.last_verified_at = "2026-07-10T04:00:00Z";
      state.verification = {
        ...(state.verification || {}),
        last_record: relativeToCodeHome(paths, recordFile),
        last_identity_record: identityReference,
        last_exit_code: 0,
        outcome: "passed",
        trajectory: "",
        evaluator: "local-command",
        failure_attribution: "",
        identity_schema_version: 3,
        record_id: identityRecord.record_id,
        identity_digest: identityRecord.identity_digest,
        identity_stable: true,
        evidence_refs: "-",
        schema_version: 3,
      };
      state.verification.operation_claims = state.verification.operation_claims.map((item) => (
        item.operation_id === claimIdentity.operation_id
          ? {
            ...item,
            status: "terminal",
            terminal_at: "2026-07-10T04:00:00Z",
            result: storedResult,
          }
          : item
      ));
      state.verification.required_gates = {
        ...(state.verification.required_gates || {}),
        "browser-create-project": {
          ...completedGate,
          completed_at: "2026-07-10T04:00:00Z",
          event_revision: revision + 1,
          identity_digest: identityRecord.identity_digest,
          identity_record: identityReference,
          outcome: "passed",
          provenance: "fresh-executed",
          record_digest: identityRecord.record_id,
          record_id: identityRecord.record_id,
        },
      };
      return {
        projection: {
          task_content: taskContent,
          state,
          files: [
            {
              path: `verification/${path.basename(recordFile)}`,
              content_base64: Buffer.from(recordContent).toString("base64"),
            },
            {
              path: `verification/${path.basename(identityFile)}`,
              content_base64: Buffer.from(`${JSON.stringify(identityRecord, null, 2)}\n`)
                .toString("base64"),
            },
          ],
        },
        result: storedResult,
      };
    }, { clock: fixedClock, environment });

    mutateTaskRuntime(paths, taskId, {
      kind: "slice.accepted",
      operationId: "accept-phase-report",
      data: {
        brief_path: briefPath,
        brief_sha256: scope.required_slices[0].brief_sha256,
        contract_sha256: scope.contract.sha256,
        execution_plan_sha256: scope.execution_plan.sha256,
        keeper_outputs: [{
          reference: "product:create-project",
          path: "src/keeper.txt",
          content_digest: sha256(fs.readFileSync(keeperPath)),
        }],
        slice_id: "product-flow",
      },
    }, ({ currentProjection, revision }) => {
      const gate = currentProjection.state.verification.required_gates["browser-create-project"];
      verificationReceipt = {
        ...gate,
        verification_event_id: verification.event.event_id,
        verification_revision: verification.event.revision,
        ...(releaseRequirement ? {
          release_fact_id: releaseFactId,
          release_fact_outcome: "passed",
          candidate_manifest_digest: candidateManifestDigest,
        } : {}),
      };
      acceptedReceipt = {
        authority_ref: "team-run:run-0001",
        actual_size: {
          accepted_head_sha: acceptedHead,
          accepted_tree_oid: acceptedTree,
          changed_files: 1,
          changed_paths: ["src/keeper.txt"],
          current_tree_oid: acceptedTree,
          loc: 1,
          start_head_sha: admissionSnapshot.head_sha,
          start_tree_oid: admissionSnapshot.tree_oid,
        },
        accepted_at: "2026-07-10T04:00:00Z",
        brief_sha256: scope.required_slices[0].brief_sha256,
        contract_sha256: scope.contract.sha256,
        execution_plan_sha256: scope.execution_plan.sha256,
        generation: 1,
        grant_id: grant.grant_id,
        scope_digest: grant.scope_digest,
        evidence_epoch: grant.evidence_epoch,
        keeper_outputs: [{
          reference: "product:create-project",
          path: "src/keeper.txt",
          content_digest: sha256(fs.readFileSync(keeperPath)),
        }],
        operation_id: "accept-phase-report",
        revision: revision + 1,
        slice_id: "product-flow",
        status: "accepted",
        task_id: taskId,
        team_run_id: "run-0001",
        verification_records: [verificationReceipt],
      };
      const state = structuredClone(currentProjection.state);
      state.slice_acceptances = {
        ...(state.slice_acceptances || {}),
        "product-flow": acceptedReceipt,
      };
      return {
        projection: { task_content: currentProjection.task_content, state },
        result: { accepted: acceptedReceipt },
      };
    }, { clock: fixedClock, environment });
  }
  let decision = null;
  if (withReleaseDecision) {
    const resultBody = {
      requirement_ref: "web-ui-v1.critical-journey",
      fact_id: releaseFactId,
      submitted_outcome: "passed",
      outcome: "passed",
      reason_codes: [],
    };
    const body = {
      schema_version: 1,
      authority: invalidReleaseDecision
        ? "self-authored"
        : "derived-from-final-release-sweep",
      status: "certified",
      target_delivery_class: "product_release",
      intent_sha256: releaseBinding.intent_sha256,
      profile_ref: releaseBinding.profile_ref,
      profile_sha256: releaseBinding.profile_sha256,
      candidate_manifest_digest: candidateManifestDigest,
      requirement_results: [{ ...resultBody, result_id: digestCanonical(resultBody) }],
    };
    decision = { ...body, decision_id: digestCanonical(body) };
  }
  const completionOutcome = accepted ? "succeeded" : "failed";
  const completionEvidence = accepted ? [] : ["phase-report-fixture"];
  mutateTaskRuntime(paths, taskId, {
    kind: "task.completion.closed",
    operationId: "complete-phase-report",
    data: {
      from: "doing",
      to: "done",
      outcome: completionOutcome,
      authority_ref: scope.authorization_provenance.ref,
      evidence_refs: completionEvidence,
      no_verify_reason: "",
    },
  }, ({ currentProjection, revision }) => {
    const activeGrant = currentProjection.state.execution_authority.grants.find(
      (candidate) => candidate.grant_id
        === currentProjection.state.execution_authority.current_grant_id,
    );
    const completedAt = "2026-07-10T04:00:00Z";
    const completionSnapshot = accepted ? {
      schema_version: 2,
      grant_id: activeGrant.grant_id,
      scope_digest: activeGrant.scope_digest,
      evidence_epoch: activeGrant.evidence_epoch,
      repo_realpath: scope.repo.realpath,
      head_sha: acceptedReceipt.actual_size.accepted_head_sha,
      tree_oid: acceptedReceipt.actual_size.accepted_tree_oid,
      source_slice_id: "product-flow",
      source_acceptance_event_id: currentProjection.state.last_event_id,
      source_acceptance_revision: acceptedReceipt.revision,
    } : null;
    const team = currentProjection.state.active_team || {};
    const taskContent = renderTaskFields(currentProjection.task_content, {
      status: "done",
      updated: localDay(fixedClock),
      completion_outcome: completionOutcome,
      completion_authority_ref: scope.authorization_provenance.ref,
      completion_evidence_refs: completionEvidence.length > 0
        ? completionEvidence.join(" ")
        : "-",
      completion_closed_at: completedAt,
    });
    const state = structuredClone(currentProjection.state);
    state.status = "done";
    state.updated_at = completedAt;
    state.completion = {
      schema_version: 1,
      outcome: completionOutcome,
      authority_ref: scope.authorization_provenance.ref,
      evidence_refs: completionEvidence,
      completion_snapshot: completionSnapshot,
      verification_record_id: accepted ? verificationReceipt.record_id : "",
      verification_identity_digest: "",
      verification_record_ids: accepted ? [verificationReceipt.record_id] : [],
      release_decision: accepted ? decision : null,
      grant_id: activeGrant.grant_id,
      scope_digest: activeGrant.scope_digest,
      evidence_epoch: activeGrant.evidence_epoch,
      team_run_id: team.team_run_id || "",
      team_generation: team.generation || 0,
      closed_at: completedAt,
    };
    const transition = {
      schema_version: 1,
      type: "grant-completed",
      revision: revision + 1,
      occurred_at: completedAt,
      old_grant_id: activeGrant.grant_id,
      old_scope_digest: activeGrant.scope_digest,
      old_evidence_epoch: activeGrant.evidence_epoch,
      outcome: completionOutcome,
      reason: `task-completion:${completionOutcome}`,
    };
    transitionAuthorityState(state, transition);
    return {
      authorityTransition: transition,
      projection: { task_content: taskContent, state },
      result: {
        outcome: completionOutcome,
        grant_id: activeGrant.grant_id,
        scope_digest: activeGrant.scope_digest,
        evidence_epoch: activeGrant.evidence_epoch,
      },
    };
  }, { clock: fixedClock, environment });
  return { environment, paths, taskId };
}

test("creates workflow-note scaffolds and preserves substantive existing files", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment);
  const artifactDir = taskArtifactDir(paths, taskId);

  assert.deepEqual(scaffoldIntake(taskId, { clock: fixedClock, environment }), [
    `created\t${path.join(artifactDir, "intake.md")}`,
  ]);
  scaffoldBrainstorm(taskId, { clock: fixedClock, environment });
  scaffoldClarify(taskId, { clock: fixedClock, environment });
  const intakeFile = path.join(artifactDir, "intake.md");
  assert.match(fs.readFileSync(intakeFile, "utf8"), new RegExp(`task_id: ${taskId}`));
  assert.match(fs.readFileSync(intakeFile, "utf8"), new RegExp(`created: ${localDay(fixedClock)}`));

  fs.appendFileSync(intakeFile, "KEEP-ME\n", "utf8");
  const before = fs.readFileSync(intakeFile);
  assert.deepEqual(scaffoldIntake(taskId, { clock: fixedClock, environment }), [
    `exists\t${intakeFile}`,
  ]);
  assert.deepEqual(fs.readFileSync(intakeFile), before);

  const events = fs
    .readFileSync(taskRuntimeFile(paths, taskId), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
    .filter((row) => row.kind === "scaffold");
  assert.deepEqual(
    events.map((row) => row.detail),
    ["intake", "brainstorm", "clarify", "intake"],
  );
});

test("replaces only exact team placeholders and then preserves rendered files", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Team scaffold");
  const teamDir = path.join(taskArtifactDir(paths, taskId), "team");

  assert.deepEqual(scaffoldTeam(taskId, { clock: fixedClock, environment }), [
    `updated\t${path.join(teamDir, "decision.md")}`,
    `updated\t${path.join(teamDir, "staffing.md")}`,
  ]);
  assert.match(fs.readFileSync(path.join(teamDir, "decision.md"), "utf8"), /backend: native/);
  assert.match(fs.readFileSync(path.join(teamDir, "staffing.md"), "utf8"), /## Ownership/);

  const decisionFile = path.join(teamDir, "decision.md");
  fs.appendFileSync(decisionFile, "\nSubstantive decision.\n", "utf8");
  const before = fs.readFileSync(decisionFile);
  const lines = scaffoldTeam(taskId, { clock: fixedClock, environment });
  assert.equal(lines[0], `exists\t${decisionFile}`);
  assert.equal(lines[1], `exists\t${path.join(teamDir, "staffing.md")}`);
  assert.deepEqual(fs.readFileSync(decisionFile), before);
});

test("creates a non-authoritative phase sentinel and rejects unsafe phase ids", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Phase scaffold");
  const phaseDir = path.join(taskArtifactDir(paths, taskId), "evidence", "phase-4a");
  const lines = scaffoldPhase(taskId, "phase-4a", { clock: fixedClock, environment });

  assert.equal(lines.length, 4);
  for (const name of [
    "phase-review-report.md",
    "defect-queue.md",
    "evidence-index.md",
    "gate-checklist.md",
  ]) {
    const text = fs.readFileSync(path.join(phaseDir, name), "utf8");
    assert.match(text, new RegExp(`task_id: ${taskId}`));
    assert.match(text, /phase_id: phase-4a/);
  }
  const report = fs.readFileSync(path.join(phaseDir, "phase-review-report.md"), "utf8");
  assert.match(report, /Canonical 状态：未投影/);
  assert.match(report, /不能作为验收或 release 证据/);
  assert.match(report, /project-phase-report/);
  assert.doesNotMatch(report, /阻断缺陷：无/);
  assert.throws(
    () => scaffoldPhase(taskId, "../bad", { clock: fixedClock, environment }),
    (error) =>
      error instanceof ArtifactScaffoldError && error.message === "invalid phase id: ../bad",
  );
});

test("projects a deterministic PM-readable report from canonical acceptance and release state", (t) => {
  const value = canonicalPhaseFixture(t, { withReleaseDecision: true });
  scaffoldPhase(value.taskId, "phase-1", { clock: fixedClock, environment: value.environment });
  const reportFile = path.join(
    taskArtifactDir(value.paths, value.taskId), "evidence/phase-1/phase-review-report.md",
  );
  fs.appendFileSync(reportFile, "\n人工填写：已经正式发布。\n");
  const eventsBefore = fs.readFileSync(taskEventFile(value.paths, value.taskId));
  const runtimeBefore = fs.readFileSync(taskRuntimeFile(value.paths, value.taskId));

  const first = writePhaseReportProjection(value.taskId, "phase-1", {
    environment: value.environment,
  });
  const firstBytes = fs.readFileSync(reportFile);
  const second = writePhaseReportProjection(value.taskId, "phase-1", {
    environment: value.environment,
  });
  assert.equal(first.file, reportFile);
  assert.equal(second.file, reportFile);
  assert.deepEqual(fs.readFileSync(reportFile), firstBytes);
  assert.deepEqual(fs.readFileSync(taskEventFile(value.paths, value.taskId)), eventsBefore);
  assert.deepEqual(fs.readFileSync(taskRuntimeFile(value.paths, value.taskId)), runtimeBefore);

  const report = firstBytes.toString("utf8");
  assert.match(report, /验收证据覆盖：全部覆盖（1\/1 项必需验收标准）/);
  assert.match(report, /用户可以创建一个项目并看到详情页/);
  assert.match(report, /在正式服务界面创建项目，确认详情持久化/);
  assert.match(report, /已形成权威验收；1 个测试记录可追溯/);
  assert.match(report, /源码候选认证状态：`certified`（仅针对已验证的源码候选；不表示已安装、推送、部署、发布或对外可用）/);
  assert.match(report, /不表示已经安装、推送、部署、发布或对外可用/);
  const pmBody = report.split("## 技术追溯")[0];
  assert.doesNotMatch(pmBody, /all_required_ac_covered|product-flow|browser-flow|browser-create-project|receipt/);
  assert.match(report.split("## 技术追溯")[1], /browser-flow:browser-create-project/);
  assert.doesNotMatch(report, /人工填写：已经正式发布/);
  assert.doesNotMatch(report, /产品发布结论|产品已发布|正式上线/);

  const cli = spawnSync(PUBLIC_BIN, ["project-phase-report", value.taskId, "phase-1"], {
    encoding: "utf8",
    env: value.environment,
  });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(cli.stdout, `projected\t${reportFile}\n`);
  const override = spawnSync(PUBLIC_BIN, [
    "project-phase-report", value.taskId, "phase-1", "--status=certified",
  ], { encoding: "utf8", env: value.environment });
  assert.equal(override.status, 1);
  assert.equal(
    override.stderr,
    "usage: codex-workflow project-phase-report <task-id> <phase-id>\n",
  );
});

test("keeps absent release decision distinct from cannot_verify", (t) => {
  const value = canonicalPhaseFixture(t, { accepted: false });
  const result = writePhaseReportProjection(value.taskId, "phase-open", {
    environment: value.environment,
  });
  const report = fs.readFileSync(result.file, "utf8");
  assert.match(report, /验收证据覆盖：尚未覆盖（0\/1 项必需验收标准）/);
  assert.match(report, /源码候选认证状态：`absent`/);
  assert.match(report, /不得自行判断为 `cannot_verify` 或 `certified`/);
  const pmBody = report.split("## 技术追溯")[0];
  assert.doesNotMatch(
    pmBody,
    /AC-PRODUCT|product-flow|owning slice|required gates|slice acceptance|receipt|completion|release decision|candidate manifest|final sweep/i,
  );
});

test("rejects accepted evidence replaced by a non-evidence event", (t) => {
  const value = canonicalPhaseFixture(t);
  assert.throws(() => mutateTaskRuntime(value.paths, value.taskId, {
    kind: "test.unrelated",
    operationId: "tamper-phase-acceptance-projection",
  }, ({ currentProjection }) => {
    const accepted = currentProjection.state.slice_acceptances["product-flow"];
    const replacement = {
      ...accepted,
      verification_records: accepted.verification_records.map((record) => ({
        ...record,
        record_id: `sha256:${"9".repeat(64)}`,
      })),
    };
    return {
      projection: {
        task_content: currentProjection.task_content,
        state: {
          ...currentProjection.state,
          slice_acceptances: { "product-flow": replacement },
        },
      },
    };
  }, { clock: fixedClock, environment: value.environment }),
  /event changed slice\/evidence history it does not own/);
});

test("rejects a digest-valid but semantically invalid release decision at completion", (t) => {
  assert.throws(() => canonicalPhaseFixture(t, {
    invalidReleaseDecision: true,
    withReleaseDecision: true,
  }), /task completion release decision differs from execution authority/);
});

test("rejects a contract with no required acceptance criterion", (t) => {
  const value = canonicalPhaseFixture(t, { required: false });
  assert.throws(
    () => writePhaseReportProjection(value.taskId, "phase-no-required-ac", {
      environment: value.environment,
    }),
    /requires at least one required acceptance criterion/,
  );
});

test("rejects a non-file scaffold target without recording a success event", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Invalid target");
  const intakePath = path.join(taskArtifactDir(paths, taskId), "intake.md");
  fs.mkdirSync(intakePath);
  const runtimeFile = taskRuntimeFile(paths, taskId);
  const before = fs.readFileSync(runtimeFile);

  assert.throws(
    () => scaffoldIntake(taskId, { clock: fixedClock, environment }),
    (error) =>
      error instanceof ArtifactScaffoldError &&
      error.message === `artifact path is not a regular file: ${intakePath}`,
  );
  assert.deepEqual(fs.readFileSync(runtimeFile), before);
});

test("public Bash dispatcher delegates scaffold commands and preserves diagnostics", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Public scaffold");
  const result = spawnSync(PUBLIC_BIN, ["scaffold-phase", taskId, "phase-1"], {
    encoding: "utf8",
    env: environment,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim().split("\n").length, 4);
  assert.ok(fs.existsSync(path.join(taskArtifactDir(paths, taskId), "evidence/phase-1/gate-checklist.md")));

  const invalid = spawnSync(PUBLIC_BIN, ["scaffold-phase", taskId, "../bad"], {
    encoding: "utf8",
    env: environment,
  });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stderr, "invalid phase id: ../bad\n");

  const usage = spawnSync(PUBLIC_BIN, ["scaffold-intake", taskId, "extra"], {
    encoding: "utf8",
    env: environment,
  });
  assert.equal(usage.status, 1);
  assert.equal(usage.stderr, "usage: codex-workflow scaffold-intake <task-id>\n");
});
