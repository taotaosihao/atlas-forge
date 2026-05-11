import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildContinuationPrompt,
  decideReconcile,
  initObjective,
  normalizeConfig,
  readObjective,
  reconcile,
  setObjectiveStatus,
  validateDelegationContract
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
  const config = makeConfig(tempRoot(), {
    policy: {
      autoContinue: true,
      handoffMode: true,
      cooldownSeconds: 0,
      checkGitWorktrees: false
    }
  });
  const result = decideReconcile(
    objective(config),
    config,
    baseSnapshot(config, message("m5", "PR_CREATED PASS agent=orch-1 cwd=/tmp branch=feat task=t labels={room=room-a,parent=root,phase=p,task=t,role=orchestrator}"))
  );
  assert.equal(result.action, "send");
  assert.equal(result.reason, "handoff_pr_review_until_clean");
  assert.match(result.prompt, /Handoff mode is enabled/);
  assert.match(result.prompt, /PR review\/fix\/re-review cycles until all available reviewers report no findings before merge/);
});

test("handoff mode continues MERGED into the next phase", () => {
  const config = makeConfig(tempRoot(), {
    policy: {
      autoContinue: true,
      handoffMode: true,
      cooldownSeconds: 0,
      checkGitWorktrees: false
    }
  });
  const result = decideReconcile(
    objective(config),
    config,
    baseSnapshot(config, message("m5", "MERGED agent=orch-1 cwd=/tmp branch=main task=t labels={room=room-a,parent=root,phase=p,task=t,role=orchestrator}"))
  );
  assert.equal(result.action, "send");
  assert.equal(result.reason, "handoff_next_phase_continue");
  assert.match(result.prompt, /continue into the next approved project phase/);
});

test("handoff mode allows merge and new project phase protected mentions", () => {
  const config = makeConfig(tempRoot(), {
    policy: {
      autoContinue: true,
      handoffMode: true,
      cooldownSeconds: 0,
      checkGitWorktrees: false
    }
  });
  const result = decideReconcile(
    objective(config),
    config,
    baseSnapshot(config, message("m5", "DONE agent=orch-1 cwd=/tmp branch=feat task=t labels={room=room-a,parent=root,phase=p,task=t,role=orchestrator} next_action='merge PR then start new project phase'"))
  );
  assert.equal(result.action, "send");
  assert.equal(result.reason, "safe_signal_continue");
});

test("handoff mode still blocks destructive protected actions", () => {
  const config = makeConfig(tempRoot(), {
    policy: {
      autoContinue: true,
      handoffMode: true,
      cooldownSeconds: 0,
      checkGitWorktrees: false
    }
  });
  const result = decideReconcile(
    objective(config),
    config,
    baseSnapshot(config, message("m5", "DONE agent=orch-1 cwd=/tmp branch=feat task=t labels={room=room-a,parent=root,phase=p,task=t,role=orchestrator} next_action='merge PR then delete branch'"))
  );
  assert.equal(result.action, "block");
  assert.equal(result.reason, "protected_action_detected");
  assert.equal(result.protectedAction, "delete branch");
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

test("plugin manifest and skill frontmatter are valid", () => {
  const plugin = JSON.parse(readFileSync(join(pluginRoot, ".codex-plugin/plugin.json"), "utf8"));
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
    assert.equal(config.policy.handoffMode, false);
    assert.equal(config.reviewPolicy.ignoreUnavailableReviewers, true);
    assert.equal(config.reviewPolicy.phases.prd.defaultRounds, 1);
    assert.equal(config.reviewPolicy.phases.prd.humanReviewAfterMultiAgent, true);
    assert.equal(config.reviewPolicy.phases.plan.defaultRounds, 3);
    assert.equal(config.reviewPolicy.phases.feature.defaultRounds, 3);
    assert.equal(config.reviewPolicy.phases.pr.defaultRounds, 3);
  }
});
