import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  GuardError,
  buildContinuationPrompt,
  createObjective,
  decideReconcile,
  ensureWatch,
  initObjective,
  loadWorkflow,
  main,
  objectivePathFor,
  parseSignal,
  readObjective,
  reconcile,
  resolveProjectWorkspace,
  setObjectiveStatus,
  validateDelegationContract,
  watcherStatus
} from "../scripts/paseo-guard.mjs";

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function tempRoot() {
  return mkdtempSync(join(tmpdir(), "paseo-guard-v2-test-"));
}

function writeWorkflow(root, frontMatter, body = "Continue safely.") {
  const workflowPath = join(root, "WORKFLOW.md");
  writeFileSync(workflowPath, `---\n${frontMatter.trim()}\n---\n\n${body}\n`, "utf8");
  return workflowPath;
}

function makeWorkflow(root = tempRoot(), overrides = {}) {
  const research = join(root, "research");
  const alpha = join(root, "alpha");
  const beta = join(root, "beta");
  const objectiveStoreDir = join(root, "state");
  mkdirSync(research, { recursive: true });
  mkdirSync(alpha, { recursive: true });
  mkdirSync(beta, { recursive: true });
  mkdirSync(objectiveStoreDir, { recursive: true });
  const workflowPath = writeWorkflow(root, `
schemaVersion: 2
projectName: project-a
room: room-a
objective: continue approved delivery
researchWorkspace: ./research
objectiveStoreDir: ./state
projects:
  - key: alpha
    targetWorkspace: ./alpha
    allowedImplementationRoots:
      - ./alpha-worktrees
  - key: beta
    targetWorkspace: ./beta
policy:
  cooldownSeconds: 0
  checkGitWorktrees: false
${overrides.frontMatter || ""}
  `, overrides.body || "Continue safely.");
  if (overrides.alphaWorktree !== false) {
    mkdirSync(join(root, "alpha-worktrees"), { recursive: true });
  }
  return loadWorkflow(workflowPath);
}

function message(id, body, author = "child-1", createdAt = null) {
  return {
    id,
    author,
    body,
    createdAt: createdAt || `2026-05-12T00:00:0${id.slice(-1)}.000Z`
  };
}

function objective(workflow, overrides = {}) {
  return {
    ...createObjective(workflow, new Date("2026-05-12T00:00:00.000Z")),
    ...overrides
  };
}

function baseSnapshot(workflow, messages = []) {
  return {
    orchestrators: [
      {
        id: "orch-1",
        status: "idle",
        cwd: workflow.researchWorkspace,
        labels: { room: workflow.room, role: "orchestrator" },
        projectKey: null,
        projectViolation: null,
        workspaceKind: "research"
      }
    ],
    childAgents: [],
    allAgents: [],
    agentById: {},
    runningChildCounts: Object.fromEntries(workflow.projects.map((project) => [project.key, 0])),
    messages: Array.isArray(messages) ? messages : [messages]
  };
}

test("loadWorkflow applies defaults and canonicalizes workflow v2 paths", () => {
  const root = tempRoot();
  try {
    const workflow = makeWorkflow(root);
    assert.equal(workflow.schemaVersion, 2);
    assert.equal(workflow.projects.length, 2);
    assert.equal(workflow.researchWorkspace.endsWith("/research"), true);
    assert.equal(workflow.projects[0].targetWorkspace.endsWith("/alpha"), true);
    assert.equal(workflow.projects[0].allowedImplementationRoots[0].endsWith("/alpha-worktrees"), true);
    assert.equal(workflow.watch.logDir.endsWith("/logs"), true);
    assert.equal(typeof workflow.workflowDigest, "string");
    assert.ok(workflow.workflowDigest.length > 10);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("loadWorkflow rejects overlapping project roots", () => {
  const root = tempRoot();
  try {
    mkdirSync(join(root, "research"), { recursive: true });
    mkdirSync(join(root, "mono"), { recursive: true });
    mkdirSync(join(root, "mono", "sub"), { recursive: true });
    mkdirSync(join(root, "state"), { recursive: true });
    const workflowPath = writeWorkflow(root, `
schemaVersion: 2
projectName: overlap
room: room-a
objective: overlap
researchWorkspace: ./research
objectiveStoreDir: ./state
projects:
  - key: one
    targetWorkspace: ./mono
  - key: two
    targetWorkspace: ./mono/sub
policy:
  checkGitWorktrees: false
    `);
    assert.throws(() => loadWorkflow(workflowPath), /workflow_overlapping_project_roots/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("main rejects removed --config usage with migration error", () => {
  assert.throws(
    () => main(["status", "--config", "guard.json"]),
    (error) => error instanceof GuardError && error.code === "workflow_migration_required"
  );
});

test("objective init/status/clear use schema v2 and reject legacy objective schema", () => {
  const root = tempRoot();
  try {
    const workflow = makeWorkflow(root);
    const created = initObjective(workflow, { now: new Date("2026-05-12T00:00:00.000Z") });
    assert.equal(created.objective.schemaVersion, 2);
    assert.equal(created.objective.workflowPath, workflow.workflowPath);
    assert.deepEqual(Object.keys(created.objective.perProjectHandledCursor), ["alpha", "beta"]);
    assert.equal(setObjectiveStatus(workflow, "paused").status, "paused");
    assert.equal(setObjectiveStatus(workflow, "complete").status, "complete");

    writeFileSync(objectivePathFor(workflow), `${JSON.stringify({ schemaVersion: 1, room: workflow.room }, null, 2)}\n`);
    assert.throws(() => readObjective(workflow), /objective_migration_required/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveProjectWorkspace returns exactly one project match", () => {
  const root = tempRoot();
  try {
    const workflow = makeWorkflow(root);
    assert.deepEqual(resolveProjectWorkspace(join(workflow.projects[0].targetWorkspace, "src"), workflow.projects, { checkGitWorktrees: false }), {
      projectKey: "alpha",
      workspaceKind: "target"
    });
    assert.deepEqual(resolveProjectWorkspace(join(workflow.projects[0].allowedImplementationRoots[0], "task1"), workflow.projects, { checkGitWorktrees: false }), {
      projectKey: "alpha",
      workspaceKind: "allowed-root"
    });
    assert.throws(() => resolveProjectWorkspace(join(root, "nowhere"), workflow.projects, { checkGitWorktrees: false }), /delegation_contract_violation/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("parseSignal only accepts canonical SIGNAL envelope", () => {
  const root = tempRoot();
  try {
    const workflow = makeWorkflow(root);
    assert.equal(
      parseSignal(
        "SIGNAL signal=FIXED project=alpha agent=child-1 cwd=/tmp branch=feat task=t labels={room=room-a,project=alpha,parent=orch-1,phase=fix,task=t,role=fix} evidence=clean",
        workflow
      ),
      "FIXED"
    );
    assert.equal(
      parseSignal(
        "FIXED project=alpha agent=child-1 cwd=/tmp branch=feat task=t labels={room=room-a,project=alpha,parent=orch-1,phase=fix,task=t,role=fix} evidence=clean",
        workflow
      ),
      null
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("validateDelegationContract reports separate project, label, role, and evidence violations", () => {
  const root = tempRoot();
  try {
    const workflow = makeWorkflow(root);
    const entry = {
      message: message(
        "m1",
        `SIGNAL signal=DONE project=alpha agent=child-1 cwd=${workflow.researchWorkspace} branch=feat labels={room=room-a,project=beta,parent=orch-1,phase=p1,role=implementation} evidence=done`
      ),
      signal: "DONE"
    };
    const snapshot = baseSnapshot(workflow, entry.message);
    snapshot.agentById["child-1"] = {
      id: "child-1",
      cwd: workflow.researchWorkspace,
      labels: { room: workflow.room, project: "beta", parent: "orch-1", phase: "p1", role: "implementation" },
      projectKey: null,
      projectViolation: null,
      workspaceKind: "research"
    };
    const violation = validateDelegationContract(entry, snapshot, workflow);
    assert.equal(violation.type, "delegation_contract_violation");
    assert.equal(violation.violations.labelProject, "labels.project_mismatch:beta");
    assert.equal(violation.violations.role, "invalid_workspace_kind:research");
    assert.equal(violation.violations.evidence.includes("task"), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("validateDelegationContract infers missing agent and cwd evidence from room author", () => {
  const root = tempRoot();
  try {
    const workflow = makeWorkflow(root);
    const entry = {
      message: message(
        "m1",
        "SIGNAL signal=PASS project=alpha branch=feat task=t-a labels={room=room-a,project=alpha,parent=orch-1,phase=review,task=t-a,role=implementation} evidence=clean",
        "child-a"
      ),
      signal: "PASS",
      projectKey: "alpha"
    };
    const snapshot = baseSnapshot(workflow, entry.message);
    snapshot.agentById["child-a"] = {
      id: "child-a",
      cwd: workflow.projects[0].targetWorkspace,
      labels: { room: workflow.room, project: "alpha", parent: "orch-1", phase: "review", task: "t-a", role: "implementation" },
      projectKey: "alpha",
      projectViolation: null,
      workspaceKind: "target"
    };

    assert.equal(validateDelegationContract(entry, snapshot, workflow), null);

    const result = decideReconcile(objective(workflow), workflow, snapshot);
    assert.equal(result.action, "send");
    assert.equal(result.reason, "safe_signal_continue");
    assert.equal(result.signal, "PASS");
    assert.equal(result.messageId, "m1");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("validateDelegationContract accepts task evidence from labels", () => {
  const root = tempRoot();
  try {
    const workflow = makeWorkflow(root);
    const entry = {
      message: message(
        "m1",
        `SIGNAL signal=DONE project=alpha agent=child-a cwd=${workflow.projects[0].targetWorkspace} branch=feat labels={room=room-a,project=alpha,parent=orch-1,phase=build,task=t-a,role=implementation} evidence=done`,
        "child-a"
      ),
      signal: "DONE",
      projectKey: "alpha"
    };
    const snapshot = baseSnapshot(workflow, entry.message);
    snapshot.agentById["child-a"] = {
      id: "child-a",
      cwd: workflow.projects[0].targetWorkspace,
      labels: { room: workflow.room, project: "alpha", parent: "orch-1", phase: "build", task: "t-a", role: "implementation" },
      projectKey: "alpha",
      projectViolation: null,
      workspaceKind: "target"
    };

    assert.equal(validateDelegationContract(entry, snapshot, workflow), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("decideReconcile processes oldest actionable signal for one project only", () => {
  const root = tempRoot();
  try {
    const workflow = makeWorkflow(root);
    const snapshot = baseSnapshot(workflow, [
      message(
        "m1",
        `SIGNAL signal=PASS project=alpha agent=child-a cwd=${workflow.projects[0].targetWorkspace} branch=feat-a task=t-a labels={room=room-a,project=alpha,parent=orch-1,phase=build,task=t-a,role=implementation} evidence=alpha clean`,
        "child-a",
        "2026-05-12T00:00:01.000Z"
      ),
      message(
        "m2",
        `SIGNAL signal=PASS project=beta agent=child-b cwd=${workflow.projects[1].targetWorkspace} branch=feat-b task=t-b labels={room=room-a,project=beta,parent=orch-1,phase=build,task=t-b,role=implementation} evidence=beta clean`,
        "child-b",
        "2026-05-12T00:00:02.000Z"
      )
    ]);
    snapshot.agentById["child-a"] = {
      id: "child-a",
      cwd: workflow.projects[0].targetWorkspace,
      labels: { room: workflow.room, project: "alpha", parent: "orch-1", phase: "build", task: "t-a", role: "implementation" },
      projectKey: "alpha",
      projectViolation: null,
      workspaceKind: "target"
    };
    snapshot.agentById["child-b"] = {
      id: "child-b",
      cwd: workflow.projects[1].targetWorkspace,
      labels: { room: workflow.room, project: "beta", parent: "orch-1", phase: "build", task: "t-b", role: "implementation" },
      projectKey: "beta",
      projectViolation: null,
      workspaceKind: "target"
    };
    const result = decideReconcile(objective(workflow), workflow, snapshot);
    assert.equal(result.action, "send");
    assert.equal(result.reason, "safe_signal_continue");
    assert.equal(result.projectKey, "alpha");
    assert.equal(result.messageId, "m1");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reconcile updates only the handled project cursor and clears that project retry ledger after valid progress", () => {
  const root = tempRoot();
  try {
    const workflow = makeWorkflow(root);
    initObjective(workflow);
    const objectiveData = readObjective(workflow);
    objectiveData.retryLedger = {
      "alpha:recoverable_blocker_nudge:m-old": {
        projectKey: "alpha",
        reason: "recoverable_blocker_nudge",
        messageId: "m-old",
        agentId: null,
        attempt: 1,
        dueAt: "2026-05-12T00:00:00.000Z",
        lastError: null,
        lastPromptAt: "2026-05-12T00:00:00.000Z"
      },
      "beta:recoverable_blocker_nudge:m-beta": {
        projectKey: "beta",
        reason: "recoverable_blocker_nudge",
        messageId: "m-beta",
        agentId: null,
        attempt: 1,
        dueAt: "2026-05-12T00:00:00.000Z",
        lastError: null,
        lastPromptAt: "2026-05-12T00:00:00.000Z"
      }
    };
    writeFileSync(objectivePathFor(workflow), `${JSON.stringify(objectiveData, null, 2)}\n`);

    reconcile(workflow, {
      runner(_command, args) {
        if (args[0] === "ls" && args.includes("role=orchestrator")) {
          return { status: 0, stdout: JSON.stringify([{ id: "orch-1", status: "idle", cwd: workflow.researchWorkspace, labels: { room: workflow.room, role: "orchestrator" } }]), stderr: "" };
        }
        if (args[0] === "ls" && args.includes(`room=${workflow.room}`)) {
          return { status: 0, stdout: JSON.stringify([{ id: "orch-1", status: "idle", cwd: workflow.researchWorkspace, labels: { room: workflow.room, role: "orchestrator" } }]), stderr: "" };
        }
        if (args[0] === "chat" && args[1] === "read") {
          return {
            status: 0,
            stdout: JSON.stringify([
              {
                id: "m1",
                author: "child-a",
                createdAt: "2026-05-12T00:00:01.000Z",
                body: `SIGNAL signal=PASS project=alpha agent=child-a cwd=${workflow.projects[0].targetWorkspace} branch=feat-a task=t-a labels={room=room-a,project=alpha,parent=orch-1,phase=build,task=t-a,role=implementation} evidence=alpha clean`
              }
            ]),
            stderr: ""
          };
        }
        if (args[0] === "send") {
          return { status: 0, stdout: "{}", stderr: "" };
        }
        throw new Error(`unexpected call: ${args.join(" ")}`);
      }
    });

    const next = readObjective(workflow);
    assert.equal(next.perProjectHandledCursor.alpha.messageId, "m1");
    assert.equal(next.perProjectHandledCursor.beta.messageId, null);
    assert.equal(next.retryLedger["beta:recoverable_blocker_nudge:m-beta"] !== undefined, true);
    assert.equal(next.retryLedger["alpha:recoverable_blocker_nudge:m-old"], undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("retry ledger is keyed by project and blocks project after max retries", () => {
  const root = tempRoot();
  try {
    const workflow = makeWorkflow(root, {
      frontMatter: `
policy:
  cooldownSeconds: 0
  maxRetries: 2
  checkGitWorktrees: false
      `
    });
    const snapshot = baseSnapshot(workflow);
    const result = decideReconcile(objective(workflow, {
      retryLedger: {
        "alpha:missing_room_evidence_recovery:child-1": {
          projectKey: "alpha",
          reason: "missing_room_evidence_recovery",
          messageId: null,
          agentId: "child-1",
          attempt: 2,
          dueAt: "2026-05-12T00:00:00.000Z",
          lastError: null,
          lastPromptAt: "2026-05-12T00:00:00.000Z"
        }
      }
    }), workflow, snapshot, { now: new Date("2026-05-12T00:00:10.000Z") });
    assert.equal(result.action, "block");
    assert.equal(result.reason, "retry_budget_exhausted");
    assert.equal(result.projectKey, "alpha");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("plain project messages do not suppress due retry entries", () => {
  const root = tempRoot();
  try {
    const workflow = makeWorkflow(root);
    const snapshot = baseSnapshot(
      workflow,
      message("m2", "status update project=alpha still investigating", "orch-1", "2026-05-12T00:00:05.000Z")
    );
    const result = decideReconcile(objective(workflow, {
      retryLedger: {
        "alpha:recoverable_blocker_nudge:m-old": {
          projectKey: "alpha",
          reason: "recoverable_blocker_nudge",
          messageId: "m-old",
          agentId: null,
          attempt: 1,
          dueAt: "2026-05-12T00:00:00.000Z",
          lastError: null,
          lastPromptAt: "2026-05-12T00:00:01.000Z"
        }
      }
    }), workflow, snapshot, { now: new Date("2026-05-12T00:00:10.000Z") });

    assert.equal(result.action, "send");
    assert.equal(result.reason, "recoverable_blocker_nudge");
    assert.equal(result.projectKey, "alpha");
    assert.equal(result.retryAttempt, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("diagnostic project evidence suppresses retry and is handled as recovery", () => {
  const root = tempRoot();
  try {
    const workflow = makeWorkflow(root);
    const snapshot = baseSnapshot(
      workflow,
      message("m2", "PROGRESS project=alpha agent=child-a cwd=/tmp evidence=still_running", "child-a", "2026-05-12T00:00:05.000Z")
    );
    const result = decideReconcile(objective(workflow, {
      retryLedger: {
        "alpha:recoverable_blocker_nudge:m-old": {
          projectKey: "alpha",
          reason: "recoverable_blocker_nudge",
          messageId: "m-old",
          agentId: null,
          attempt: 1,
          dueAt: "2026-05-12T00:00:00.000Z",
          lastError: null,
          lastPromptAt: "2026-05-12T00:00:01.000Z"
        }
      }
    }), workflow, snapshot, { now: new Date("2026-05-12T00:00:10.000Z") });

    assert.equal(result.action, "send");
    assert.equal(result.reason, "missing_room_evidence_recovery");
    assert.equal(result.projectKey, "alpha");
    assert.equal(result.messageId, "m2");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("completed child cleanup requires valid final evidence for the same project", () => {
  const root = tempRoot();
  try {
    const workflow = makeWorkflow(root);
    const snapshot = baseSnapshot(workflow, message(
      "m1",
      `SIGNAL signal=PASS project=alpha agent=child-1 cwd=${workflow.projects[0].targetWorkspace} branch=feat task=t1 labels={room=room-a,project=alpha,parent=orch-1,phase=review,task=t1,role=audit} evidence=clean`,
      "child-1"
    ));
    snapshot.childAgents = [
      {
        id: "child-1",
        status: "done",
        cwd: workflow.projects[0].targetWorkspace,
        labels: { room: workflow.room, project: "alpha", parent: "orch-1", phase: "review", task: "t1", role: "audit" },
        projectKey: "alpha",
        projectViolation: null,
        workspaceKind: "target"
      }
    ];
    snapshot.agentById["child-1"] = snapshot.childAgents[0];
    const result = decideReconcile(objective(workflow, {
      perProjectHandledCursor: {
        alpha: { messageId: "m1", lastHandledMessageCreatedAt: "2026-05-12T00:00:01.000Z" },
        beta: { messageId: null, lastHandledMessageCreatedAt: null }
      }
    }), workflow, snapshot);
    assert.equal(result.action, "send");
    assert.equal(result.reason, "completed_child_cleanup");
    assert.deepEqual(result.cleanupAgentIds, ["child-1"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ensureWatch uses workflowPath and rejects handoff without trust acknowledgement", () => {
  const root = tempRoot();
  try {
    const workflow = makeWorkflow(root, {
      frontMatter: `
policy:
  handoffMode: true
  trustAcknowledged: false
  cooldownSeconds: 0
  checkGitWorktrees: false
      `
    });
    assert.throws(() => ensureWatch(workflow, { dryRun: true }), /workflow_trust_acknowledgement_required/);

    const trusted = makeWorkflow(root, {
      frontMatter: `
policy:
  handoffMode: true
  trustAcknowledged: true
  cooldownSeconds: 0
  checkGitWorktrees: false
      `
    });
    const pidFile = watcherStatus(trusted).pidFile;
    mkdirSync(dirname(pidFile), { recursive: true });
    writeFileSync(pidFile, "123\n");
    const state = watcherStatus(trusted, {
      processInspector() {
        return {
          alive: true,
          command: `${process.execPath} paseo-guard-watch.mjs --workflow ${trusted.workflowPath}`
        };
      }
    });
    assert.equal(state.processMatches, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("continuation prompt renders strict template variables and includes workflow body", () => {
  const root = tempRoot();
  try {
    const workflow = makeWorkflow(root, { body: "Follow WORKFLOW body text." });
    const prompt = buildContinuationPrompt({
      objective: objective(workflow),
      workflow,
      currentProject: workflow.projects[0],
      reason: "safe_signal_continue"
    });
    assert.match(prompt, /workflowDigest=/);
    assert.match(prompt, /currentProject=/);
    assert.match(prompt, /Follow WORKFLOW body text/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readme skill template and examples are updated to workflow v2 assets", () => {
  const paths = [
    join(pluginRoot, "templates/WORKFLOW.md"),
    join(pluginRoot, "examples/single-project.WORKFLOW.md"),
    join(pluginRoot, "examples/multi-project.WORKFLOW.md"),
    join(dirname(dirname(pluginRoot)), "README.md"),
    join(pluginRoot, "skills/paseo-agent-guard/SKILL.md")
  ];
  for (const path of paths) {
    const text = readFileSync(path, "utf8");
    assert.match(text, /WORKFLOW\.md|schemaVersion: 2|project=/);
  }
});

test("guard watcher package scripts are operational by default", () => {
  const packageJson = JSON.parse(readFileSync(join(dirname(dirname(pluginRoot)), "package.json"), "utf8"));
  assert.doesNotMatch(packageJson.scripts["guard:ensure-watch"], /--dry-run/);
  assert.doesNotMatch(packageJson.scripts["guard:watch"], /--dry-run|--max-cycles/);
  assert.match(packageJson.scripts["guard:ensure-watch"], /ensure-watch --workflow/);
  assert.match(packageJson.scripts["guard:watch"], /paseo-guard-watch\.mjs --workflow/);
});
