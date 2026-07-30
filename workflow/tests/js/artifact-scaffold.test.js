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
const { resolvePaths, taskArtifactDir } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/core/paths.js",
));
const { mutateTaskRuntime, taskEventFile } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/core/task-mutation.js",
));
const { digestCanonical, sha256 } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/verification/identity.js",
));
const { createTask } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/task/lifecycle.js",
));
const { taskRuntimeFile } = require(path.join(
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

function fixedClock() {
  return new Date(2026, 6, 10, 12, 0, 0);
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
  const repo = path.join(paths.root, "phase-report-repo");
  fs.mkdirSync(repo, { recursive: true });
  assert.equal(spawnSync("git", ["init", "-q", repo]).status, 0);
  assert.equal(spawnSync("git", ["-C", repo, "config", "user.email", "atlas@example.test"]).status, 0);
  assert.equal(spawnSync("git", ["-C", repo, "config", "user.name", "Atlas Test"]).status, 0);
  const candidateTree = "a".repeat(40);
  const plan = {
    schema_version: 1,
    size_policy: { policy_id: "atlas-slice-size-v2" },
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
        command: "node test-create-project.js",
        final_only: true,
        cache_policy: "fresh-executed",
      }],
    }],
  };
  const contract = path.join(repo, "implementation-contract.final.md");
  fs.writeFileSync(contract, [
    "# Product contract",
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
  const releaseBinding = {
    intent_sha256: `sha256:${"d".repeat(64)}`,
    profile_ref: "web-ui-v1",
    profile_sha256: `sha256:${"e".repeat(64)}`,
    requirement_refs: ["web-ui-v1.critical-journey"],
  };
  const authority = {
    schema_version: 1,
    status: "active",
    contract_path: contract,
    contract_sha256: sha256(fs.readFileSync(contract)),
    execution_plan_sha256: digestCanonical(plan),
    repo_realpath: fs.realpathSync(repo),
    required_slices: ["product-flow"],
    ...(withReleaseDecision ? { release_binding: releaseBinding } : {}),
  };
  mutateTaskRuntime(paths, taskId, {
    kind: "test.execution.authorized",
    operationId: "authorize-phase-report",
  }, ({ currentProjection }) => ({
    projection: {
      task_content: currentProjection.task_content,
      state: { ...currentProjection.state, execution_authority: authority },
    },
  }), { clock: fixedClock, environment });

  if (accepted) {
    const recordId = `sha256:${"b".repeat(64)}`;
    const identityDigest = `sha256:${"c".repeat(64)}`;
    const verification = mutateTaskRuntime(paths, taskId, {
      kind: "verification.recorded",
      operationId: "verify-phase-report",
      data: {
        record_id: recordId,
        identity_digest: identityDigest,
        required_gate: {
          check_id: "browser-create-project",
          candidate_tree_oid: candidateTree,
        },
      },
    }, ({ currentProjection }) => ({ projection: currentProjection }), {
      clock: fixedClock,
      environment,
    });
    mutateTaskRuntime(paths, taskId, {
      kind: "slice.accepted",
      operationId: "accept-phase-report",
      data: { slice_id: "product-flow" },
    }, ({ currentProjection, revision }) => {
      const record = {
        check_id: "browser-create-project",
        slice_id: "product-flow",
        outcome: "passed",
        provenance: "fresh-executed",
        record_id: recordId,
        identity_digest: identityDigest,
        candidate_tree_oid: candidateTree,
        verification_event_id: verification.event.event_id,
        verification_revision: verification.event.revision,
      };
      const acceptedValue = {
        task_id: taskId,
        slice_id: "product-flow",
        status: "accepted",
        operation_id: "accept-phase-report",
        revision: revision + 1,
        contract_sha256: authority.contract_sha256,
        execution_plan_sha256: authority.execution_plan_sha256,
        actual_size: { accepted_tree_oid: candidateTree },
        verification_records: [record],
      };
      const state = {
        ...currentProjection.state,
        slice_acceptances: { "product-flow": acceptedValue },
      };
      return {
        projection: { task_content: currentProjection.task_content, state },
        result: { accepted: acceptedValue },
      };
    }, { clock: fixedClock, environment });
  }
  if (withReleaseDecision) {
    const resultBody = {
      requirement_ref: "web-ui-v1.critical-journey",
      fact_id: `sha256:${"1".repeat(64)}`,
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
      candidate_manifest_digest: `sha256:${"f".repeat(64)}`,
      requirement_results: [{ ...resultBody, result_id: digestCanonical(resultBody) }],
    };
    const decision = { ...body, decision_id: digestCanonical(body) };
    mutateTaskRuntime(paths, taskId, {
      kind: "task.completion.closed",
      operationId: "complete-phase-report",
      data: { outcome: "succeeded" },
    }, ({ currentProjection, revision }) => {
      const completedRevision = revision + 1;
      const state = {
        ...currentProjection.state,
        completion: {
          schema_version: 1,
          outcome: "succeeded",
          release_decision: decision,
        },
        execution_authority: {
          ...currentProjection.state.execution_authority,
          completion: {
            completed_at: "2026-07-10T04:00:00Z",
            completed_revision: completedRevision,
          },
        },
      };
      return {
        projection: { task_content: currentProjection.task_content, state },
        result: { completion: state.completion },
      };
    }, { clock: fixedClock, environment });
  }
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
  assert.match(fs.readFileSync(intakeFile, "utf8"), /created: 2026-07-10/);

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

test("rejects accepted evidence replaced only in a later projection", (t) => {
  const value = canonicalPhaseFixture(t);
  mutateTaskRuntime(value.paths, value.taskId, {
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
  }, { clock: fixedClock, environment: value.environment });
  assert.throws(
    () => writePhaseReportProjection(value.taskId, "phase-tampered", {
      environment: value.environment,
    }),
    /accepted slice authority is inconsistent/,
  );
});

test("rejects a digest-valid but semantically invalid release decision", (t) => {
  const value = canonicalPhaseFixture(t, {
    invalidReleaseDecision: true,
    withReleaseDecision: true,
  });
  assert.throws(
    () => writePhaseReportProjection(value.taskId, "phase-invalid-release", {
      environment: value.environment,
    }),
    /stored release decision is invalid/,
  );
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
