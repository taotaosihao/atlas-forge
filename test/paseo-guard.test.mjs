import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  decideReconcile,
  initObjective,
  normalizeConfig,
  readObjective,
  reconcile,
  setObjectiveStatus,
  validateDelegationContract
} from "../scripts/paseo-guard.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

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
    messages: message ? [message] : []
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

test("plugin manifest and skill frontmatter are valid", () => {
  const plugin = JSON.parse(readFileSync(join(repoRoot, ".codex-plugin/plugin.json"), "utf8"));
  assert.equal(plugin.name, "paseo-agent-guard-plugin");
  assert.equal(plugin.skills, "./skills/");
  assert.ok(plugin.interface.displayName);

  const skill = readFileSync(join(repoRoot, "skills/paseo-agent-guard/SKILL.md"), "utf8");
  assert.match(skill, /^---\nname: paseo-agent-guard\n/m);
  assert.match(skill, /description: .+\n---/m);
});

