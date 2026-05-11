import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildContinuationPrompt,
  decideReconcile,
  ensureWatch,
  initObjective,
  normalizeConfig,
  parseSignal,
  readObjective,
  reconcile,
  setObjectiveStatus,
  validateDelegationContract,
  watcherStatus
} from "../scripts/paseo-guard.mjs";

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const marketplaceRoot = dirname(dirname(pluginRoot));

function tempRoot() {
  return mkdtempSync(join(tmpdir(), "paseo-guard-test-"));
}

function makeConfig(root = tempRoot(), overrides = {}) {
  return normalizeConfig(
    {
      objective: "continue approved delivery",
      projectName: "project-a",
      room: "room-a",
      researchWorkspace: join(root, "research"),
      targetWorkspace: join(root, "target"),
      objectiveStoreDir: join(root, "state"),
      orchestratorSelector: { labels: { room: "room-a", role: "orchestrator" } },
      policy: {
        autoContinue: true,
        cooldownSeconds: 0,
        checkGitWorktrees: false
      },
      ...overrides
    },
    join(root, "config.json")
  );
}

function makeHandoffConfig(policy = {}) {
  return makeConfig(tempRoot(), {
    policy: {
      autoContinue: true,
      handoffMode: true,
      cooldownSeconds: 0,
      checkGitWorktrees: false,
      ...policy
    }
  });
}

function objective(config, overrides = {}) {
  return {
    objective: config.objective,
    projectName: config.projectName,
    room: config.room,
    researchWorkspace: config.researchWorkspace,
    targetWorkspace: config.targetWorkspace,
    orchestratorSelector: config.orchestratorSelector,
    status: "active",
    lastHandledMessageId: null,
    lastDecision: null,
    createdAt: "2026-05-11T00:00:00.000Z",
    updatedAt: "2026-05-11T00:00:00.000Z",
    ...overrides
  };
}

function baseSnapshot(config, message) {
  return {
    orchestrators: [
      {
        id: "orch-1",
        status: "idle",
        cwd: config.researchWorkspace,
        labels: { room: config.room, role: "orchestrator" },
        workspaceKind: "research"
      }
    ],
    childAgents: [],
    allAgents: [],
    agentById: {},
    messages: message ? (Array.isArray(message) ? message : [message]) : []
  };
}

function message(id, body, author = "orch-1") {
  return {
    id,
    author,
    body,
    createdAt: `2026-05-11T00:00:0${id.slice(-1)}.000Z`
  };
}

test("objective init, status, pause, resume, and clear", () => {
  const root = tempRoot();
  try {
    const config = makeConfig(root);
    const created = initObjective(config, { now: new Date("2026-05-11T00:00:00.000Z") });
    assert.equal(created.objective.status, "active");
    assert.equal(readObjective(config).room, "room-a");

    assert.equal(setObjectiveStatus(config, "paused").status, "paused");
    assert.equal(setObjectiveStatus(config, "active").status, "active");
    assert.equal(setObjectiveStatus(config, "complete").status, "complete");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("paused objective does not call paseo during reconcile", () => {
  const root = tempRoot();
  try {
    const config = makeConfig(root);
    initObjective(config);
    setObjectiveStatus(config, "paused");
    const result = reconcile(config, {
      dryRun: true,
      runner() {
        throw new Error("runner should not be called");
      }
    });
    assert.equal(result.decision.action, "wait");
    assert.equal(result.decision.reason, "objective_paused");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("lastHandledMessageId prevents duplicate continuation", () => {
  const config = makeConfig();
  const result = decideReconcile(
    objective(config, { lastHandledMessageId: "m1" }),
    config,
    baseSnapshot(config, message("m1", "PASS agent=orch-1 cwd=/tmp branch=x task=t labels={room=room-a,parent=root,phase=p,task=t,role=orchestrator}"))
  );
  assert.equal(result.action, "wait");
  assert.equal(result.reason, "no_unhandled_signal");
});

test("lastHandledMessageCreatedAt filters old tail when handled id is outside chat tail", () => {
  const config = makeConfig();
  const oldSignal = message(
    "m1",
    "MERGED agent=orch-1 cwd=/tmp branch=main task=t labels={room=room-a,parent=root,phase=p,task=t,role=orchestrator}"
  );
  oldSignal.createdAt = "2026-05-11T00:00:01.000Z";
  const newSignal = message(
    "m2",
    "PASS agent=orch-1 cwd=/tmp branch=feat task=t labels={room=room-a,parent=root,phase=p,task=t,role=orchestrator}"
  );
  newSignal.createdAt = "2026-05-11T00:00:03.000Z";

  const result = decideReconcile(
    objective(config, {
      lastHandledMessageId: "missing-from-tail",
      lastHandledMessageCreatedAt: "2026-05-11T00:00:02.000Z"
    }),
    config,
    baseSnapshot(config, [oldSignal, newSignal])
  );
  assert.equal(result.action, "send");
  assert.equal(result.reason, "safe_signal_continue");
  assert.equal(result.messageId, "m2");
});

test("parseSignal accepts canonical and legacy child evidence shapes", () => {
  const config = makeConfig();
  assert.equal(
    parseSignal(
      "FIXED agent=child-1 cwd=/tmp/target branch=feat task=t labels={room=room-a,parent=orch-1,phase=p,task=t,role=fix} evidence=clean",
      config
    ),
    "FIXED"
  );
  assert.equal(
    parseSignal(
      "SIGNAL signal=FIXED agent=child-1 cwd=/tmp/target branch=feat task=t labels={room=room-a,parent=orch-1,phase=p,task=t,role=fix} evidence=clean",
      config
    ),
    "FIXED"
  );
  assert.equal(
    parseSignal(
      "SIGNAL agent=child-1 cwd=/tmp/target branch=feat task=t labels={room=room-a,parent=orch-1,phase=p,task=t,role=fix} evidence=FIXED linked before submit",
      config
    ),
    "FIXED"
  );
  assert.equal(
    parseSignal(
      "SIGNAL agent=child-1 cwd=/tmp/target branch=feat task=t labels={room=room-a,parent=orch-1,phase=p,task=t,role=fix} evidence=START inspecting",
      config
    ),
    null
  );
});

test("non-signal room update triggers missing evidence recovery", () => {
  const config = makeConfig();
  const result = decideReconcile(
    objective(config),
    config,
    baseSnapshot(config, message("m2", "PR_REVIEW_STATUS codex=PASS gemini=result_not_observed mimo=running"))
  );
  assert.equal(result.action, "send");
  assert.equal(result.reason, "missing_room_evidence_recovery");
  assert.equal(result.messageId, "m2");
  assert.equal(result.lastHandledMessageId, "m2");
  assert.match(result.prompt, /reason=missing_room_evidence_recovery/);
  assert.match(result.prompt, /recoveryContext=type=unrecognized_room_update messageId=m2 author=orch-1/);
  assert.match(result.prompt, /If a child agent failed, hit quota, lost provider access, or needs permission/);
});

test("failed child without room signal triggers missing evidence recovery", () => {
  const config = makeConfig();
  const snapshot = baseSnapshot(config);
  snapshot.childAgents = [
    {
      id: "child-1",
      status: "failed",
      cwd: config.targetWorkspace,
      labels: { room: config.room, parent: "orch-1", phase: "review", task: "t1", role: "audit" },
      workspaceKind: "target"
    }
  ];
  snapshot.agentById["child-1"] = snapshot.childAgents[0];

  const result = decideReconcile(objective(config), config, snapshot);
  assert.equal(result.action, "send");
  assert.equal(result.reason, "missing_room_evidence_recovery");
  assert.equal(result.childAgentId, "child-1");
  assert.equal(result.lastHandledMessageId, undefined);
  assert.match(result.prompt, /recoveryContext=type=child_agent_missing_room_evidence childAgentId=child-1 childAgentStatus=failed/);
});

test("finished child after checkpoint without room signal triggers recovery", () => {
  const config = makeConfig();
  const snapshot = baseSnapshot(config);
  snapshot.childAgents = [
    {
      id: "child-2",
      status: "done",
      updatedAt: "2026-05-11T00:00:03.000Z",
      cwd: config.targetWorkspace,
      labels: { room: config.room, parent: "orch-1", phase: "review", task: "t2", role: "audit" },
      workspaceKind: "target"
    }
  ];
  snapshot.agentById["child-2"] = snapshot.childAgents[0];

  const result = decideReconcile(objective(config), config, snapshot);
  assert.equal(result.action, "send");
  assert.equal(result.reason, "missing_room_evidence_recovery");
  assert.equal(result.childAgentId, "child-2");
});

test("completed child with valid room evidence triggers cleanup", () => {
  const config = makeConfig();
  const childDone = message(
    "m-clean",
    `PASS agent=child-1 cwd=${config.targetWorkspace} branch=feat task=t1 labels={room=room-a,parent=orch-1,phase=review,task=t1,role=audit} evidence=clean`,
    "child-1"
  );
  const snapshot = baseSnapshot(config, childDone);
  snapshot.childAgents = [
    {
      id: "child-1",
      status: "done",
      cwd: config.targetWorkspace,
      labels: { room: config.room, parent: "orch-1", phase: "review", task: "t1", role: "audit" },
      workspaceKind: "target"
    }
  ];
  snapshot.agentById["child-1"] = snapshot.childAgents[0];

  const result = decideReconcile(
    objective(config, { lastHandledMessageId: "m-clean" }),
    config,
    snapshot
  );
  assert.equal(result.action, "send");
  assert.equal(result.reason, "completed_child_cleanup");
  assert.deepEqual(result.cleanupAgentIds, ["child-1"]);
  assert.match(result.prompt, /completedChildAgentsReadyToClose=id=child-1,status=done,role=audit,task=t1/);
  assert.match(result.prompt, /paseo archive <agent-id> --json/);
  assert.match(result.prompt, /Never use `--force` for cleanup/);
});

test("completed child cleanup requires valid room evidence", () => {
  const config = makeConfig();
  const childDone = message("m-clean", "PASS result=clean", "child-1");
  const snapshot = baseSnapshot(config, childDone);
  snapshot.childAgents = [
    {
      id: "child-1",
      status: "done",
      updatedAt: "2026-05-11T00:00:03.000Z",
      cwd: config.targetWorkspace,
      labels: { room: config.room, parent: "orch-1", phase: "review", task: "t1", role: "audit" },
      workspaceKind: "target"
    }
  ];
  snapshot.agentById["child-1"] = snapshot.childAgents[0];

  const result = decideReconcile(
    objective(config, { lastHandledMessageId: "m-clean" }),
    config,
    snapshot
  );
  assert.equal(result.action, "send");
  assert.equal(result.reason, "missing_room_evidence_recovery");
  assert.equal(result.childAgentId, "child-1");
});

test("ordinary non-signal room chatter does not trigger continuation", () => {
  const config = makeConfig();
  const result = decideReconcile(
    objective(config),
    config,
    baseSnapshot(config, message("m2", "noted, thanks"))
  );
  assert.equal(result.action, "wait");
  assert.equal(result.reason, "no_unhandled_signal");
});

test("handled non-signal room update is not repeated", () => {
  const config = makeConfig();
  const result = decideReconcile(
    objective(config, { lastHandledMessageId: "m2" }),
    config,
    baseSnapshot(config, message("m2", "PR_REVIEW_STATUS codex=PASS gemini=result_not_observed mimo=running"))
  );
  assert.equal(result.action, "wait");
  assert.equal(result.reason, "no_unhandled_signal");
});

test("implementation agent in research workspace returns contract violation", () => {
  const config = makeConfig();
  const entry = {
    signal: "DONE",
    message: message(
      "m2",
      "DONE agent=child-1 cwd=/tmp/research branch=feat task=t1 labels={room=room-a,parent=orch-1,phase=p1,task=t1,role=implementation}",
      "child-1"
    )
  };
  const snapshot = baseSnapshot(config, entry.message);
  snapshot.agentById["child-1"] = {
    id: "child-1",
    cwd: config.researchWorkspace,
    labels: { room: config.room, parent: "orch-1", phase: "p1", task: "t1", role: "implementation" },
    workspaceKind: "research"
  };
  const violation = validateDelegationContract(entry, snapshot, config);
  assert.equal(violation.type, "delegation_contract_violation");
  assert.match(violation.violations.join("\n"), /must run in targetWorkspace/);
});

test("implementation cwd inside research is not accepted as target worktree", () => {
  const root = tempRoot();
  try {
    mkdirSync(join(root, "research"), { recursive: true });
    mkdirSync(join(root, "target"), { recursive: true });
    spawnSync("git", ["init"], { cwd: root, encoding: "utf8" });

    const config = makeConfig(root, {
      policy: {
        autoContinue: true,
        cooldownSeconds: 0,
        checkGitWorktrees: true
      }
    });
    const entry = {
      signal: "DONE",
      message: message(
        "m2",
        `DONE agent=child-1 cwd=${config.researchWorkspace} branch=feat task=t1 labels={room=room-a,parent=orch-1,phase=p1,task=t1,role=implementation}`,
        "child-1"
      )
    };
    const snapshot = baseSnapshot(config, entry.message);
    snapshot.agentById["child-1"] = {
      id: "child-1",
      cwd: config.researchWorkspace,
      labels: { room: config.room, parent: "orch-1", phase: "p1", task: "t1", role: "implementation" }
    };
    const violation = validateDelegationContract(entry, snapshot, config);
    assert.equal(violation.type, "delegation_contract_violation");
    assert.match(violation.violations.join("\n"), /got research:/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("implementation agent in target workspace passes contract", () => {
  const config = makeConfig();
  const entry = {
    signal: "DONE",
    message: message(
      "m3",
      "DONE agent=child-1 cwd=/tmp/target branch=feat task=t1 labels={room=room-a,parent=orch-1,phase=p1,task=t1,role=implementation}",
      "child-1"
    )
  };
  const snapshot = baseSnapshot(config, entry.message);
  snapshot.agentById["child-1"] = {
    id: "child-1",
    cwd: config.targetWorkspace,
    labels: { room: config.room, parent: "orch-1", phase: "p1", task: "t1", role: "implementation" },
    workspaceKind: "target"
  };
  assert.equal(validateDelegationContract(entry, snapshot, config), null);
});

test("orchestrator self-reporting implementation work in research workspace is blocked", () => {
  const config = makeConfig();
  const entry = {
    signal: "DONE",
    message: message(
      "m4",
      `DONE agent=orch-1 cwd=${config.researchWorkspace} branch=feat task=t1 labels={room=room-a,parent=orch-1,phase=p1,task=t1,role=implementation}`,
      "orch-1"
    )
  };
  const snapshot = baseSnapshot(config, entry.message);
  snapshot.agentById["orch-1"] = {
    id: "orch-1",
    cwd: config.researchWorkspace,
    labels: { room: config.room, role: "orchestrator" },
    workspaceKind: "research"
  };
  const violation = validateDelegationContract(entry, snapshot, config);
  assert.equal(violation.type, "delegation_contract_violation");
  assert.equal(violation.reportedAgentId, "orch-1");
});

test("missing required child labels returns contract violation", () => {
  const config = makeConfig();
  const entry = {
    signal: "DONE",
    message: message("m4", "DONE agent=child-1 cwd=/tmp/target branch=feat task=t1 labels={room=room-a,parent=orch-1}", "child-1")
  };
  const snapshot = baseSnapshot(config, entry.message);
  snapshot.agentById["child-1"] = {
    id: "child-1",
    cwd: config.targetWorkspace,
    labels: { room: config.room, parent: "orch-1" },
    workspaceKind: "target"
  };
  const violation = validateDelegationContract(entry, snapshot, config);
  assert.match(violation.violations.join("\n"), /missing_labels=phase,task,role/);
});

test("PR_CREATED PASS is a terminal human review gate", () => {
  const config = makeConfig();
  const result = decideReconcile(
    objective(config),
    config,
    baseSnapshot(config, message("m5", "PR_CREATED PASS agent=orch-1 cwd=/tmp branch=feat task=t labels={room=room-a,parent=root,phase=p,task=t,role=orchestrator}"))
  );
  assert.equal(result.action, "stop");
  assert.equal(result.reason, "terminal_review_gate");
  assert.equal(result.nextStatus, "blocked");
});

test("MERGED terminal signal is not mistaken for protected merge action", () => {
  const config = makeConfig();
  const result = decideReconcile(
    objective(config),
    config,
    baseSnapshot(config, message("m5", "MERGED agent=orch-1 cwd=/tmp branch=main task=t labels={room=room-a,parent=root,phase=p,task=t,role=orchestrator}"))
  );
  assert.equal(result.action, "stop");
  assert.equal(result.reason, "terminal_signal");
  assert.equal(result.nextStatus, "complete");
});

test("handoff mode continues PR_CREATED into review until clean", () => {
  const config = makeHandoffConfig();
  const result = decideReconcile(
    objective(config),
    config,
    baseSnapshot(config, message("m5", "PR_CREATED PASS agent=orch-1 cwd=/tmp branch=feat task=t labels={room=room-a,parent=root,phase=p,task=t,role=orchestrator}"))
  );
  assert.equal(result.action, "send");
  assert.equal(result.reason, "handoff_pr_review_until_clean");
  assert.match(result.prompt, /Handoff mode is enabled/);
  assert.match(result.prompt, /PR review gates must continue until all available reviewers report no findings before merge/);
});

test("handoff mode continues MERGED into the next phase", () => {
  const config = makeHandoffConfig();
  assert.equal(config.policy.allowNewPhaseAfterMerge, false);
  const result = decideReconcile(
    objective(config),
    config,
    baseSnapshot(config, message("m5", "MERGED agent=orch-1 cwd=/tmp branch=main task=t labels={room=room-a,parent=root,phase=p,task=t,role=orchestrator}"))
  );
  assert.equal(result.action, "send");
  assert.equal(result.reason, "handoff_next_phase_continue");
  assert.match(result.prompt, /continue into the next approved project phase/);
});

test("handoff mode prioritizes terminal signal over later safe signals", () => {
  const config = makeHandoffConfig();
  const result = decideReconcile(
    objective(config),
    config,
    baseSnapshot(config, [
      message("m5", "MERGED agent=orch-1 cwd=/tmp branch=main task=t labels={room=room-a,parent=root,phase=p,task=t,role=orchestrator}"),
      message("m6", "PASS agent=orch-1 cwd=/tmp branch=main task=t labels={room=room-a,parent=root,phase=p,task=t,role=orchestrator}")
    ])
  );
  assert.equal(result.action, "send");
  assert.equal(result.reason, "handoff_next_phase_continue");
  assert.equal(result.messageId, "m5");
  assert.equal(result.lastHandledMessageId, "m6");
});

test("handoff mode respects cooldown before terminal continuation", () => {
  const now = new Date("2026-05-11T00:01:00.000Z");
  const config = makeHandoffConfig({ cooldownSeconds: 60 });
  const result = decideReconcile(
    objective(config, {
      lastDecision: {
        action: "send",
        reason: "safe_signal_continue",
        decidedAt: "2026-05-11T00:00:30.000Z"
      }
    }),
    config,
    baseSnapshot(config, message("m5", "PR_CREATED agent=orch-1 cwd=/tmp branch=feat task=t labels={room=room-a,parent=root,phase=p,task=t,role=orchestrator}")),
    { now }
  );
  assert.equal(result.action, "wait");
  assert.equal(result.reason, "cooldown_active");
});

test("handoff mode respects autoContinue before terminal continuation", () => {
  const config = makeHandoffConfig({ autoContinue: false });
  const result = decideReconcile(
    objective(config),
    config,
    baseSnapshot(config, message("m5", "PR_CREATED agent=orch-1 cwd=/tmp branch=feat task=t labels={room=room-a,parent=root,phase=p,task=t,role=orchestrator}"))
  );
  assert.equal(result.action, "wait");
  assert.equal(result.reason, "auto_continue_disabled");
});

test("handoff mode allows merge and new project phase protected mentions", () => {
  const config = makeHandoffConfig();
  const result = decideReconcile(
    objective(config),
    config,
    baseSnapshot(config, message("m5", "DONE agent=orch-1 cwd=/tmp branch=feat task=t labels={room=room-a,parent=root,phase=p,task=t,role=orchestrator} next_action='merge PR then start new project phase'"))
  );
  assert.equal(result.action, "send");
  assert.equal(result.reason, "safe_signal_continue");
});

test("handoff mode still blocks destructive protected actions", () => {
  const config = makeHandoffConfig();
  const result = decideReconcile(
    objective(config),
    config,
    baseSnapshot(config, message("m5", "DONE agent=orch-1 cwd=/tmp branch=feat task=t labels={room=room-a,parent=root,phase=p,task=t,role=orchestrator} next_action='merge PR then delete branch'"))
  );
  assert.equal(result.action, "block");
  assert.equal(result.reason, "protected_action_detected");
  assert.equal(result.protectedAction, "delete branch");
});

test("generic agent close remains protected", () => {
  const config = makeHandoffConfig();
  const result = decideReconcile(
    objective(config),
    config,
    baseSnapshot(config, message("m5", "DONE agent=orch-1 cwd=/tmp branch=feat task=t labels={room=room-a,parent=root,phase=p,task=t,role=orchestrator} next_action='close agent child-1'"))
  );
  assert.equal(result.action, "block");
  assert.equal(result.reason, "protected_action_detected");
  assert.equal(result.protectedAction, "close agent");
});

test("completed child archive wording is allowed", () => {
  const config = makeHandoffConfig();
  const result = decideReconcile(
    objective(config),
    config,
    baseSnapshot(config, message("m5", "DONE agent=orch-1 cwd=/tmp branch=feat task=t labels={room=room-a,parent=root,phase=p,task=t,role=orchestrator} next_action='archive completed child agent child-1 after evidence'"))
  );
  assert.equal(result.action, "send");
  assert.equal(result.reason, "safe_signal_continue");
});

test("handoff mode blocks destructive protected actions on terminal signals", () => {
  const config = makeHandoffConfig();
  const result = decideReconcile(
    objective(config),
    config,
    baseSnapshot(config, message("m5", "MERGED agent=orch-1 cwd=/tmp branch=main task=t labels={room=room-a,parent=root,phase=p,task=t,role=orchestrator} next_action='delete branch'"))
  );
  assert.equal(result.action, "block");
  assert.equal(result.reason, "protected_action_detected");
  assert.equal(result.protectedAction, "delete branch");
});

test("handoff mode continues latest wrapped FIXED after old merge and recoverable PR fix", () => {
  const config = makeHandoffConfig();
  const merged = message(
    "m1",
    "MERGED agent=orch-1 cwd=/tmp/research branch=master task=old-task labels={room=room-a,parent=root,phase=old,task=old-task,role=orchestrator} evidence=old_pr_merged"
  );
  const needsFix = message(
    "m2",
    "NEEDS_FIX agent=orch-1 cwd=/tmp/research branch=master task=fix-task labels={room=room-a,parent=root,phase=pr-review-fix,task=fix-task,role=orchestrator} evidence=review_found_issue"
  );
  const fixStarted = message(
    "m3",
    "FIX_STARTED agent=orch-1 cwd=/tmp/research branch=master task=fix-task labels={room=room-a,parent=root,phase=pr-review-fix,task=fix-task,role=orchestrator} evidence=child_started"
  );
  const fixed = message(
    "m4",
    `SIGNAL agent=child-1 cwd=${config.targetWorkspace} branch=feat task=fix-task labels={room=room-a,parent=orch-1,phase=pr-review-fix,task=fix-task,role=fix} evidence=FIXED committed and pushed`,
    "child-1"
  );
  const snapshot = baseSnapshot(config, [merged, needsFix, fixStarted, fixed]);
  snapshot.childAgents = [
    {
      id: "child-1",
      status: "idle",
      cwd: config.targetWorkspace,
      labels: { room: config.room, parent: "orch-1", phase: "pr-review-fix", task: "fix-task", role: "fix" },
      workspaceKind: "target"
    }
  ];
  snapshot.agentById["child-1"] = snapshot.childAgents[0];

  const result = decideReconcile(objective(config), config, snapshot);
  assert.equal(result.action, "send");
  assert.equal(result.reason, "safe_signal_continue");
  assert.equal(result.signal, "FIXED");
  assert.equal(result.messageId, "m4");
  assert.equal(result.lastHandledMessageId, "m4");
});

test("handoff mode blocks terminal child contract violations", () => {
  const config = makeHandoffConfig();
  const childSignal = message(
    "m5",
    `PR_CREATED agent=child-1 cwd=${config.researchWorkspace} branch=feat task=t labels={room=room-a,parent=orch-1,phase=p,task=t,role=implementation}`,
    "child-1"
  );
  const snapshot = baseSnapshot(config, childSignal);
  snapshot.agentById["child-1"] = {
    id: "child-1",
    cwd: config.researchWorkspace,
    labels: { room: config.room, parent: "orch-1", phase: "p", task: "t", role: "implementation" },
    workspaceKind: "research"
  };

  const result = decideReconcile(objective(config), config, snapshot);
  assert.equal(result.action, "block");
  assert.equal(result.reason, "delegation_contract_violation");
});

test("handoff mode still blocks non-recoverable signals", () => {
  const config = makeHandoffConfig();
  const result = decideReconcile(
    objective(config),
    config,
    baseSnapshot(config, message("m5", "ERROR agent=orch-1 cwd=/tmp branch=feat task=t labels={room=room-a,parent=root,phase=p,task=t,role=orchestrator}"))
  );
  assert.equal(result.action, "block");
  assert.equal(result.reason, "human_decision_required");
});

test("recoverable blocker nudges orchestrator", () => {
  const config = makeConfig();
  const result = decideReconcile(
    objective(config),
    config,
    baseSnapshot(config, message("m6", "BLOCKED agent=orch-1 cwd=/tmp branch=feat task=t labels={room=room-a,parent=root,phase=p,task=t,role=orchestrator}"))
  );
  assert.equal(result.action, "send");
  assert.equal(result.reason, "recoverable_blocker_nudge");
  assert.match(result.prompt, /targetWorkspace=/);
});

test("continuation prompt includes multi-agent review policy", () => {
  const config = makeConfig();
  const prompt = buildContinuationPrompt({
    objective: objective(config),
    config,
    reason: "safe_signal_continue",
    signalEntry: {
      signal: "PASS",
      message: message("m-review", "PASS agent=orch-1 cwd=/tmp branch=feat task=t labels={room=room-a,parent=root,phase=p,task=t,role=orchestrator}")
    }
  });

  assert.match(prompt, /Required multi-agent reviewers: claude, codex, gemini, mimo\./);
  assert.match(prompt, /Child-agent prompt contract:/);
  assert.match(prompt, /Every child-agent prompt must explicitly tell the child agent to use these required skill\(s\): paseo-agent-guard\./);
  assert.match(prompt, /do not rely on inherited parent context/);
  assert.match(prompt, /For every parent-launched child agent, use background\/no-wait mode, inspect cwd\/labels, then start a background `paseo wait <agent-id> --json` until it becomes idle\./);
  assert.match(prompt, /SIGNAL signal=<FIXED\|PASS\|DONE\|PLAN_READY\|BLOCKED\|NEEDS_FIX\|PR_CREATED\|MERGED>/);
  assert.match(prompt, /Child-agent wait contract:/);
  assert.match(prompt, /immediately start a background wait with `paseo wait <agent-id> --json`/);
  assert.match(prompt, /durable continuation comes from `paseo-guard-watch` plus valid SIGNAL reporting/);
  assert.match(prompt, /Missing room evidence recovery:/);
  assert.match(prompt, /If a child agent is idle\/complete but did not post room evidence/);
  assert.match(prompt, /relayed=true/);
  assert.match(prompt, /Child-agent cleanup:/);
  assert.match(prompt, /After a child agent posts valid final room evidence and is idle\/done, close it promptly/);
  assert.match(prompt, /delete agents, force-archive\/close running agents, close child agents before room evidence/);
  assert.match(prompt, /Agent launch defaults:/);
  assert.match(prompt, /Provider mode defaults: codex=full-access, claude=bypassPermissions, gemini=yolo, mimo=bypassPermissions\./);
  assert.match(prompt, /Codex uses mode `full-access` as its YOLO-equivalent mode\./);
  assert.match(prompt, /Claude Code-based providers, including `claude` and `mimo`, use mode `bypassPermissions`\./);
  assert.match(prompt, /paseo run --mode <mode>/);
  assert.match(prompt, /if a reviewer\/provider is unavailable, record that skip in the room evidence and continue/);
  assert.match(prompt, /PRD flow: draft or update PRD, run multi-agent review .* fix findings, then stop for human review\./);
  assert.match(prompt, /Plan, feature, and PR review gates must run exactly these default review rounds unless the user asks to review until there are no issues: plan=3, feature=3, pr=3\./);
  assert.match(prompt, /review until there are no issues, continue review\/fix\/re-review cycles until all available reviewers report no findings/);
  assert.match(prompt, /Do not treat PRD as human-review-ready until the multi-agent review findings are resolved\./);
});

test("NEEDS_USER_DECISION and ERROR require human handling", () => {
  const config = makeConfig();
  for (const signal of ["NEEDS_USER_DECISION", "ERROR"]) {
    const result = decideReconcile(
      objective(config),
      config,
      baseSnapshot(config, message(`m-${signal}`, `${signal} agent=orch-1 cwd=/tmp branch=feat task=t labels={room=room-a,parent=root,phase=p,task=t,role=orchestrator}`))
    );
    assert.equal(result.action, "block");
    assert.equal(result.reason, "human_decision_required");
    assert.equal(result.nextStatus, "blocked");
  }
});

test("earlier unhandled child contract violation blocks later safe signal", () => {
  const config = makeConfig();
  const badChildSignal = message(
    "m1",
    `DONE agent=child-1 cwd=${config.researchWorkspace} branch=feat task=t1 labels={room=room-a,parent=orch-1,phase=p1,task=t1,role=implementation}`,
    "child-1"
  );
  const laterSafeSignal = message(
    "m2",
    "PASS agent=orch-1 cwd=/tmp branch=feat task=t2 labels={room=room-a,parent=root,phase=p2,task=t2,role=orchestrator}"
  );
  const snapshot = baseSnapshot(config, [badChildSignal, laterSafeSignal]);
  snapshot.agentById["child-1"] = {
    id: "child-1",
    cwd: config.researchWorkspace,
    labels: { room: config.room, parent: "orch-1", phase: "p1", task: "t1", role: "implementation" },
    workspaceKind: "research"
  };

  const result = decideReconcile(objective(config), config, snapshot);
  assert.equal(result.action, "block");
  assert.equal(result.reason, "delegation_contract_violation");
  assert.equal(result.messageId, "m1");
  assert.match(result.violation.violations.join("\n"), /must run in targetWorkspace/);
});

test("earlier unhandled protected action blocks later safe signal", () => {
  const config = makeConfig();
  const protectedSignal = message(
    "m1",
    "DONE agent=orch-1 cwd=/tmp branch=feat task=t1 labels={room=room-a,parent=root,phase=p,task=t,role=orchestrator} next_action='merge PR'"
  );
  const laterSafeSignal = message(
    "m2",
    "PASS agent=orch-1 cwd=/tmp branch=feat task=t2 labels={room=room-a,parent=root,phase=p2,task=t2,role=orchestrator}"
  );

  const result = decideReconcile(objective(config), config, baseSnapshot(config, [protectedSignal, laterSafeSignal]));
  assert.equal(result.action, "block");
  assert.equal(result.reason, "protected_action_detected");
  assert.equal(result.messageId, "m1");
  assert.equal(result.protectedAction, "merge");
});

test("valid earlier child signal still allows latest safe signal continuation", () => {
  const config = makeConfig();
  const childDone = message(
    "m1",
    `DONE agent=child-1 cwd=${config.targetWorkspace} branch=feat task=t1 labels={room=room-a,parent=orch-1,phase=p1,task=t1,role=implementation}`,
    "child-1"
  );
  const laterSafeSignal = message(
    "m2",
    "PASS agent=orch-1 cwd=/tmp branch=feat task=t2 labels={room=room-a,parent=root,phase=p2,task=t2,role=orchestrator}"
  );
  const snapshot = baseSnapshot(config, [childDone, laterSafeSignal]);
  snapshot.agentById["child-1"] = {
    id: "child-1",
    cwd: config.targetWorkspace,
    labels: { room: config.room, parent: "orch-1", phase: "p1", task: "t1", role: "implementation" },
    workspaceKind: "target"
  };

  const result = decideReconcile(objective(config), config, snapshot);
  assert.equal(result.action, "send");
  assert.equal(result.reason, "safe_signal_continue");
  assert.equal(result.messageId, "m2");
});

test("non-dry-run sends inline prompt instead of prompt file", () => {
  const root = tempRoot();
  try {
    const config = makeConfig(root);
    initObjective(config);
    const calls = [];
    const result = reconcile(config, {
      runner(command, args) {
        calls.push([command, args]);
        if (args[0] === "ls" && args.includes("role=orchestrator")) {
          return {
            status: 0,
            stdout: JSON.stringify([{ id: "orch-1", status: "idle", cwd: config.researchWorkspace }]),
            stderr: ""
          };
        }
        if (args[0] === "ls" && args.includes(`room=${config.room}`)) {
          return {
            status: 0,
            stdout: JSON.stringify([{ id: "orch-1", status: "idle", cwd: config.researchWorkspace }]),
            stderr: ""
          };
        }
        if (args[0] === "chat" && args[1] === "read") {
          return {
            status: 0,
            stdout: JSON.stringify([
              message("m8", "PASS agent=orch-1 cwd=/tmp branch=feat task=t labels={room=room-a,parent=root,phase=p,task=t,role=orchestrator}")
            ]),
            stderr: ""
          };
        }
        if (args[0] === "send") {
          assert.equal(args.includes("--prompt"), true);
          assert.equal(args.includes("--prompt-file"), false);
          assert.match(args[args.indexOf("--prompt") + 1], /PASEO_AGENT_GUARD_CONTINUATION/);
          return { status: 0, stdout: "{}", stderr: "" };
        }
        throw new Error(`unexpected call: ${args.join(" ")}`);
      }
    });
    assert.equal(result.decision.action, "send");
    assert.equal(calls.some(([, args]) => args[0] === "send"), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("prompt-file send command with no-wait is rejected", () => {
  const root = tempRoot();
  try {
    const config = makeConfig(root, {
      commands: {
        send: ["send", "{agentId}", "--prompt-file", "{promptFile}", "--no-wait", "--json"]
      }
    });
    initObjective(config);
    assert.throws(
      () =>
        reconcile(config, {
          runner(command, args) {
            if (args[0] === "ls" && args.includes("role=orchestrator")) {
              return {
                status: 0,
                stdout: JSON.stringify([{ id: "orch-1", status: "idle", cwd: config.researchWorkspace }]),
                stderr: ""
              };
            }
            if (args[0] === "ls" && args.includes(`room=${config.room}`)) {
              return {
                status: 0,
                stdout: JSON.stringify([{ id: "orch-1", status: "idle", cwd: config.researchWorkspace }]),
                stderr: ""
              };
            }
            if (args[0] === "chat" && args[1] === "read") {
              return {
                status: 0,
                stdout: JSON.stringify([
                  message("m9", "PASS agent=orch-1 cwd=/tmp branch=feat task=t labels={room=room-a,parent=root,phase=p,task=t,role=orchestrator}")
                ]),
                stderr: ""
              };
            }
            throw new Error(`unexpected call: ${args.join(" ")}`);
          }
        }),
      /unsafe_prompt_file_command/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dry-run reports send decision without invoking paseo send", () => {
  const root = tempRoot();
  try {
    const config = makeConfig(root);
    initObjective(config);
    const calls = [];
    const result = reconcile(config, {
      dryRun: true,
      runner(command, args) {
        calls.push([command, args]);
        if (args[0] === "ls" && args.includes("role=orchestrator")) {
          return {
            status: 0,
            stdout: JSON.stringify([{ id: "orch-1", status: "idle", cwd: config.researchWorkspace }]),
            stderr: ""
          };
        }
        if (args[0] === "ls" && args.includes(`room=${config.room}`)) {
          return {
            status: 0,
            stdout: JSON.stringify([{ id: "orch-1", status: "idle", cwd: config.researchWorkspace }]),
            stderr: ""
          };
        }
        if (args[0] === "chat" && args[1] === "read") {
          return {
            status: 0,
            stdout: JSON.stringify([
              message("m7", "PASS agent=orch-1 cwd=/tmp branch=feat task=t labels={room=room-a,parent=root,phase=p,task=t,role=orchestrator}")
            ]),
            stderr: ""
          };
        }
        throw new Error(`unexpected call: ${args.join(" ")}`);
      }
    });
    assert.equal(result.decision.action, "send");
    assert.equal(calls.some(([, args]) => args[0] === "send"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ensureWatch restarts stale pidfile and does not duplicate a running watcher", () => {
  const root = tempRoot();
  try {
    const config = makeConfig(root);
    const initial = watcherStatus(config);
    mkdirSync(dirname(initial.pidFile), { recursive: true });
    writeFileSync(initial.pidFile, "999999999\n");
    const stale = watcherStatus(config);
    assert.equal(stale.running, false);
    assert.equal(stale.stale, true);

    const restarted = ensureWatch(config, {
      launcher(_config, paths) {
        assert.equal(paths.pidFile, initial.pidFile);
        assert.equal(paths.logFile, initial.logFile);
        return { pid: process.pid };
      }
    });
    assert.equal(restarted.action, "restarted");
    assert.equal(restarted.watcherStatus.running, true);
    assert.equal(restarted.watcherStatus.pid, process.pid);

    const alreadyRunning = ensureWatch(config, {
      launcher() {
        throw new Error("launcher should not be called for live watcher");
      }
    });
    assert.equal(alreadyRunning.action, "already_running");
    assert.equal(alreadyRunning.watcherStatus.pid, process.pid);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("plugin manifest and skill frontmatter are valid", () => {
  const plugin = JSON.parse(readFileSync(join(pluginRoot, "plugin.json"), "utf8"));
  const scaffoldPlugin = JSON.parse(readFileSync(join(pluginRoot, ".codex-plugin/plugin.json"), "utf8"));
  assert.deepEqual(plugin, scaffoldPlugin);
  assert.equal(plugin.name, "paseo-agent-guard-plugin");
  assert.equal(plugin.skills, "./skills/");
  assert.ok(plugin.interface.displayName);

  const marketplace = JSON.parse(readFileSync(join(marketplaceRoot, ".agents/plugins/marketplace.json"), "utf8"));
  assert.equal(marketplace.name, "atlas-forge");
  assert.equal(marketplace.plugins[0].name, "paseo-agent-guard-plugin");
  assert.equal(marketplace.plugins[0].source.path, "./plugins/paseo-agent-guard-plugin");

  const skill = readFileSync(join(pluginRoot, "skills/paseo-agent-guard/SKILL.md"), "utf8");
  assert.match(skill, /^---\nname: paseo-agent-guard\n/m);
  assert.match(skill, /description: .+\n---/m);
});

test("template and example configs include default multi-agent review policy", () => {
  for (const relativePath of [
    "templates/paseo-guard.config.json",
    "examples/gearjob-123-plm-next.config.json"
  ]) {
    const config = JSON.parse(readFileSync(join(pluginRoot, relativePath), "utf8"));
    assert.deepEqual(config.reviewPolicy.reviewers, ["claude", "codex", "gemini", "mimo"]);
    assert.equal(config.policy.handoffMode, relativePath.startsWith("examples/"));
    assert.equal(config.reviewPolicy.ignoreUnavailableReviewers, true);
    assert.equal(config.reviewPolicy.phases.prd.defaultRounds, 1);
    assert.equal(config.reviewPolicy.phases.prd.humanReviewAfterMultiAgent, true);
    assert.equal(config.reviewPolicy.phases.plan.defaultRounds, 3);
    assert.equal(config.reviewPolicy.phases.feature.defaultRounds, 3);
    assert.equal(config.reviewPolicy.phases.pr.defaultRounds, 3);
    assert.deepEqual(config.childAgents.permissionModeDefaults, {
      codex: "full-access",
      claude: "bypassPermissions",
      gemini: "yolo",
      mimo: "bypassPermissions"
    });
    assert.deepEqual(config.childAgents.requiredSkills, ["paseo-agent-guard"]);
    assert.deepEqual(config.childAgents.finishedStatuses, ["idle", "complete", "completed", "done"]);
    assert.deepEqual(config.childAgents.failureStatuses, ["failed", "error", "crashed", "cancelled", "canceled", "timed_out", "timeout"]);
    assert.equal(config.childAgents.closeOnCompletion, true);
    assert.equal(config.workflow.protectedActions.includes("close agent"), true);
    assert.equal(config.workflow.protectedActions.includes("force archive"), true);
    assert.deepEqual(config.workflow.diagnosticSignals, [
      "START",
      "FIX_STARTED",
      "PR_REVIEW_GATE_STARTED",
      "PR_REVIEW_STATUS",
      "REVIEW_STATUS",
      "AGENT_STATUS",
      "CHILD_AGENT_STATUS",
      "PROGRESS",
      "CHECKPOINT"
    ]);
    assert.deepEqual(config.commands.archive, ["archive", "{agentId}", "--json"]);
    assert.deepEqual(config.commands.agentWait, ["wait", "{agentId}", "--json"]);
  }
});
