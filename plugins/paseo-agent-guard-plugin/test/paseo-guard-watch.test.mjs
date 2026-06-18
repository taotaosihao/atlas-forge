import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { initObjective, normalizeConfig, objectivePathFor } from "../scripts/paseo-guard.mjs";
import { parseWaitMessages, selectWatchTimeout, waitForRoomEvent, watch } from "../scripts/paseo-guard-watch.mjs";

function tempRoot() {
  return mkdtempSync(join(tmpdir(), "paseo-guard-watch-test-"));
}

function makeConfig(root = tempRoot()) {
  return normalizeConfig(
    {
      objective: "watch room",
      projectName: "project-a",
      room: "room-a",
      researchWorkspace: join(root, "research"),
      targetWorkspace: join(root, "target"),
      objectiveStoreDir: join(root, "state"),
      policy: {
        autoContinue: true,
        cooldownSeconds: 0,
        checkGitWorktrees: false
      }
    },
    join(root, "config.json")
  );
}

function updateObjective(config, patch) {
  const path = objectivePathFor(config);
  const current = JSON.parse(readFileSync(path, "utf8"));
  writeFileSync(path, `${JSON.stringify({ ...current, ...patch }, null, 2)}\n`);
}

test("parseWaitMessages preserves message envelopes and empty waits", () => {
  assert.deepEqual(parseWaitMessages("[]"), []);
  assert.deepEqual(parseWaitMessages('{"messages":[]}'), []);
  assert.deepEqual(parseWaitMessages('{"Messages":[]}'), []);
  assert.deepEqual(parseWaitMessages('[{"id":"m1"}]'), [{ id: "m1" }]);
  assert.deepEqual(parseWaitMessages('{"messages":[{"id":"m1"},{"id":"m2"}]}'), [
    { id: "m1" },
    { id: "m2" }
  ]);
  assert.deepEqual(parseWaitMessages('{"message":{"id":"m3"}}'), [{ id: "m3" }]);
});

test("waitForRoomEvent treats empty chat wait as heartbeat", async () => {
  const root = tempRoot();
  try {
    const config = makeConfig(root);
    const calls = [];
    const event = await waitForRoomEvent(config, {
      timeout: "1s",
      runner(command, args) {
        calls.push([command, args]);
        return { status: 0, stdout: '{"messages":[]}', stderr: "" };
      }
    });
    assert.equal(event.type, "heartbeat");
    assert.equal(event.reason, "timeout_or_empty_wait");
    assert.deepEqual(calls[0][1], ["chat", "wait", "room-a", "--timeout", "1s", "--json"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("waitForRoomEvent survives non-timeout chat wait failures", async () => {
  const root = tempRoot();
  try {
    const config = makeConfig(root);
    const event = await waitForRoomEvent(config, {
      timeout: "1s",
      runner() {
        return { status: 1, stdout: "", stderr: "deadline exceeded" };
      }
    });
    assert.equal(event.type, "heartbeat");
    assert.equal(event.reason, "chat_wait_error");
    assert.match(event.error, /deadline exceeded/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("selectWatchTimeout shortens waits after agent status dependent decisions", () => {
  const root = tempRoot();
  try {
    const config = makeConfig(root);
    config.watch.agentStatusPollTimeout = "2s";
    config.watch.cooldownPollTimeout = "3s";
    assert.equal(selectWatchTimeout({ status: "active", lastDecision: null }, config), "10m");
    assert.equal(
      selectWatchTimeout(
        { status: "active", lastDecision: { action: "wait", reason: "child_agent_running" } },
        config
      ),
      "2s"
    );
    assert.equal(
      selectWatchTimeout(
        { status: "active", lastDecision: { action: "wait", reason: "orchestrator_not_idle" } },
        config,
        { agentStatusPollTimeout: "1s" }
      ),
      "1s"
    );
    assert.equal(
      selectWatchTimeout(
        { status: "active", lastDecision: { action: "wait", reason: "cooldown_active" } },
        config
      ),
      "3s"
    );
    assert.equal(
      selectWatchTimeout(
        { status: "active", lastDecision: { action: "wait", reason: "cooldown_active" } },
        config,
        { cooldownPollTimeout: "4s" }
      ),
      "4s"
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("watch reconciles on heartbeat so missing room evidence can be recovered", async () => {
  const root = tempRoot();
  const originalWrite = process.stdout.write;
  const writes = [];
  try {
    const config = makeConfig(root);
    initObjective(config);
    process.stdout.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };
    await watch(config, {
      timeout: "1s",
      maxCycles: 1,
      dryRun: true,
      runner(command, args) {
        if (args[0] === "chat" && args[1] === "wait") {
          return { status: 0, stdout: '{"messages":[]}', stderr: "" };
        }
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
          return { status: 0, stdout: "[]", stderr: "" };
        }
        throw new Error(`unexpected call: ${command} ${args.join(" ")}`);
      }
    });

    assert.equal(writes.some((line) => line.includes('"type":"heartbeat"')), true);
    assert.equal(writes.some((line) => line.includes('"type":"reconcile"')), true);
    assert.equal(writes.some((line) => line.includes('"reason":"no_unhandled_signal"')), true);
  } finally {
    process.stdout.write = originalWrite;
    rmSync(root, { recursive: true, force: true });
  }
});

test("watch rechecks quickly after child_agent_running and continues when child becomes idle", async () => {
  const root = tempRoot();
  const originalWrite = process.stdout.write;
  const writes = [];
  const calls = [];
  try {
    const config = makeConfig(root);
    config.watch.agentStatusPollTimeout = "2s";
    initObjective(config);
    updateObjective(config, {
      lastDecision: {
        action: "wait",
        reason: "child_agent_running",
        childAgentId: "child-1",
        decidedAt: "2026-05-11T00:00:00.000Z"
      }
    });

    process.stdout.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };
    await watch(config, {
      maxCycles: 1,
      dryRun: true,
      runner(command, args) {
        calls.push([command, args]);
        if (args[0] === "chat" && args[1] === "wait") {
          return { status: 0, stdout: '{"messages":[]}', stderr: "" };
        }
        if (args[0] === "ls" && args.includes("role=orchestrator")) {
          return {
            status: 0,
            stdout: JSON.stringify([
              { id: "orch-1", status: "idle", cwd: config.researchWorkspace, labels: { room: config.room, role: "orchestrator" } }
            ]),
            stderr: ""
          };
        }
        if (args[0] === "ls" && args.includes(`room=${config.room}`)) {
          return {
            status: 0,
            stdout: JSON.stringify([
              { id: "orch-1", status: "idle", cwd: config.researchWorkspace, labels: { room: config.room, role: "orchestrator" } },
              {
                id: "child-1",
                status: "idle",
                cwd: config.targetWorkspace,
                labels: { room: config.room, parent: "orch-1", phase: "fix", task: "fix-task", role: "fix" }
              }
            ]),
            stderr: ""
          };
        }
        if (args[0] === "chat" && args[1] === "read") {
          return {
            status: 0,
            stdout: JSON.stringify([
              {
                id: "m-fixed",
                author: "child-1",
                createdAt: "2026-05-11T00:00:05.000Z",
                body: `SIGNAL signal=FIXED agent=child-1 cwd=${config.targetWorkspace} branch=feat task=fix-task labels={room=room-a,parent=orch-1,phase=fix,task=fix-task,role=fix} evidence=retry fixed`
              }
            ]),
            stderr: ""
          };
        }
        throw new Error(`unexpected call: ${command} ${args.join(" ")}`);
      }
    });

    const chatWaitCall = calls.find(([, args]) => args[0] === "chat" && args[1] === "wait");
    assert.deepEqual(chatWaitCall[1], ["chat", "wait", "room-a", "--timeout", "2s", "--json"]);
    assert.equal(writes.some((line) => line.includes('"previousDecisionReason":"child_agent_running"')), true);
    assert.equal(writes.some((line) => line.includes('"reason":"safe_signal_continue"')), true);
    assert.equal(writes.some((line) => line.includes('"messageId":"m-fixed"')), true);
  } finally {
    process.stdout.write = originalWrite;
    rmSync(root, { recursive: true, force: true });
  }
});

test("watch rechecks quickly after cooldown_active and continues when cooldown has expired", async () => {
  const root = tempRoot();
  const originalWrite = process.stdout.write;
  const writes = [];
  const calls = [];
  try {
    const config = makeConfig(root);
    config.watch.cooldownPollTimeout = "2s";
    initObjective(config);
    updateObjective(config, {
      lastDecision: {
        action: "wait",
        reason: "cooldown_active",
        signal: "DONE",
        messageId: "m-done",
        decidedAt: "2000-01-01T00:00:01.000Z"
      },
      lastContinuationAt: "2000-01-01T00:00:00.000Z"
    });

    process.stdout.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };
    await watch(config, {
      maxCycles: 1,
      dryRun: true,
      runner(command, args) {
        calls.push([command, args]);
        if (args[0] === "chat" && args[1] === "wait") {
          return { status: 0, stdout: '{"messages":[]}', stderr: "" };
        }
        if (args[0] === "ls" && args.includes("role=orchestrator")) {
          return {
            status: 0,
            stdout: JSON.stringify([
              { id: "orch-1", status: "idle", cwd: config.researchWorkspace, labels: { room: config.room, role: "orchestrator" } }
            ]),
            stderr: ""
          };
        }
        if (args[0] === "ls" && args.includes(`room=${config.room}`)) {
          return {
            status: 0,
            stdout: JSON.stringify([
              { id: "orch-1", status: "idle", cwd: config.researchWorkspace, labels: { room: config.room, role: "orchestrator" } }
            ]),
            stderr: ""
          };
        }
        if (args[0] === "chat" && args[1] === "read") {
          return {
            status: 0,
            stdout: JSON.stringify([
              {
                id: "m-done",
                author: "orch-1",
                createdAt: "2026-05-11T00:00:05.000Z",
                body: "SIGNAL signal=DONE agent=orch-1 cwd=/tmp branch=feat task=t labels={room=room-a,parent=root,phase=p,task=t,role=orchestrator} evidence=continue"
              }
            ]),
            stderr: ""
          };
        }
        throw new Error(`unexpected call: ${command} ${args.join(" ")}`);
      }
    });

    const chatWaitCall = calls.find(([, args]) => args[0] === "chat" && args[1] === "wait");
    assert.deepEqual(chatWaitCall[1], ["chat", "wait", "room-a", "--timeout", "2s", "--json"]);
    assert.equal(writes.some((line) => line.includes('"previousDecisionReason":"cooldown_active"')), true);
    assert.equal(writes.some((line) => line.includes('"reason":"safe_signal_continue"')), true);
    assert.equal(writes.some((line) => line.includes('"messageId":"m-done"')), true);
  } finally {
    process.stdout.write = originalWrite;
    rmSync(root, { recursive: true, force: true });
  }
});
