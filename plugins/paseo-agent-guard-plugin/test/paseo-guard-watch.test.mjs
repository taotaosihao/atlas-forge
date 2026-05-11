import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { WorkflowStore, initObjective, loadWorkflow, objectivePathFor } from "../scripts/paseo-guard.mjs";
import { parseWaitMessages, selectWatchTimeout, waitForRoomEvent, watch } from "../scripts/paseo-guard-watch.mjs";

function tempRoot() {
  return mkdtempSync(join(tmpdir(), "paseo-guard-watch-v2-test-"));
}

function writeWorkflow(root, body = "Continue safely.", extraPolicy = "") {
  const path = join(root, "WORKFLOW.md");
  writeFileSync(path, `---
schemaVersion: 2
projectName: watch-project
room: room-a
objective: keep watching
researchWorkspace: ./research
objectiveStoreDir: ./state
projects:
  - key: alpha
    targetWorkspace: ./alpha
policy:
  cooldownSeconds: 0
  checkGitWorktrees: false
${extraPolicy}
---

${body}
`, "utf8");
  return path;
}

function makeWorkflow(root = tempRoot(), options = {}) {
  writeFileSync(join(root, ".keep"), "", "utf8");
  writeWorkflow(root, options.body, options.extraPolicy || "");
  return loadWorkflow(join(root, "WORKFLOW.md"));
}

function updateObjective(workflow, patch) {
  const path = objectivePathFor(workflow);
  const current = JSON.parse(readFileSync(path, "utf8"));
  writeFileSync(path, `${JSON.stringify({ ...current, ...patch }, null, 2)}\n`);
}

test("parseWaitMessages preserves message envelopes and empty waits", () => {
  assert.deepEqual(parseWaitMessages("[]"), []);
  assert.deepEqual(parseWaitMessages('{"messages":[]}'), []);
  assert.deepEqual(parseWaitMessages('[{"id":"m1"}]'), [{ id: "m1" }]);
  assert.deepEqual(parseWaitMessages('{"message":{"id":"m3"}}'), [{ id: "m3" }]);
});

test("waitForRoomEvent treats empty wait as heartbeat", async () => {
  const root = tempRoot();
  try {
    const workflow = makeWorkflow(root);
    const event = await waitForRoomEvent(workflow, {
      timeout: "1s",
      runner(_command, args) {
        assert.deepEqual(args, ["chat", "wait", "room-a", "--timeout", "1s", "--json"]);
        return { status: 0, stdout: '{"messages":[]}', stderr: "" };
      }
    });
    assert.equal(event.type, "heartbeat");
    assert.equal(event.reason, "timeout_or_empty_wait");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("selectWatchTimeout shortens waits after agent status or cooldown decisions", () => {
  const root = tempRoot();
  try {
    const workflow = makeWorkflow(root);
    workflow.watch.agentStatusPollTimeout = "2s";
    workflow.watch.cooldownPollTimeout = "3s";
    assert.equal(selectWatchTimeout({ status: "active", lastDecision: null }, workflow), "10m");
    assert.equal(
      selectWatchTimeout({ status: "active", lastDecision: { action: "wait", reason: "child_agent_running" } }, workflow),
      "2s"
    );
    assert.equal(
      selectWatchTimeout({ status: "active", lastDecision: { action: "wait", reason: "cooldown_active" } }, workflow),
      "3s"
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("watch reload keeps last-known-good workflow and exposes workflowLoadError", async () => {
  const root = tempRoot();
  const originalWrite = process.stdout.write;
  const writes = [];
  try {
    const workflow = makeWorkflow(root);
    initObjective(workflow);
    const store = new WorkflowStore(workflow.workflowPath);
    store.loadInitial();
    writeFileSync(workflow.workflowPath, "---\nschemaVersion: 2\nprojectName: broken\n---\n");
    process.stdout.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };
    await watch(store, {
      maxCycles: 1,
      dryRun: true,
      runner(_command, args) {
        if (args[0] === "chat" && args[1] === "wait") {
          return { status: 0, stdout: '{"messages":[]}', stderr: "" };
        }
        if (args[0] === "ls" && args.includes("role=orchestrator")) {
          return { status: 0, stdout: JSON.stringify([{ id: "orch-1", status: "idle", cwd: workflow.researchWorkspace, labels: { room: workflow.room, role: "orchestrator" } }]), stderr: "" };
        }
        if (args[0] === "ls" && args.includes(`room=${workflow.room}`)) {
          return { status: 0, stdout: JSON.stringify([{ id: "orch-1", status: "idle", cwd: workflow.researchWorkspace, labels: { room: workflow.room, role: "orchestrator" } }]), stderr: "" };
        }
        if (args[0] === "chat" && args[1] === "read") {
          return { status: 0, stdout: "[]", stderr: "" };
        }
        throw new Error(`unexpected call: ${args.join(" ")}`);
      }
    });
    const combined = writes.join("");
    assert.match(combined, /workflowLoadError/);
    assert.match(combined, /workflow_missing_required_field/);
  } finally {
    process.stdout.write = originalWrite;
    rmSync(root, { recursive: true, force: true });
  }
});

test("watch emits project-aware reconcile events", async () => {
  const root = tempRoot();
  const originalWrite = process.stdout.write;
  const writes = [];
  try {
    const workflow = makeWorkflow(root);
    initObjective(workflow);
    updateObjective(workflow, {
      lastDecision: {
        action: "wait",
        reason: "cooldown_active",
        projectKey: "alpha",
        signal: "DONE",
        messageId: "m1",
        decidedAt: "2000-01-01T00:00:00.000Z"
      }
    });
    const store = new WorkflowStore(workflow.workflowPath);
    store.loadInitial();
    process.stdout.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };
    await watch(store, {
      maxCycles: 1,
      dryRun: true,
      cooldownPollTimeout: "2s",
      runner(_command, args) {
        if (args[0] === "chat" && args[1] === "wait") {
          return { status: 0, stdout: '{"messages":[]}', stderr: "" };
        }
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
                id: "m2",
                author: "child-1",
                createdAt: "2026-05-12T00:00:02.000Z",
                body: `SIGNAL signal=PASS project=alpha agent=child-1 cwd=${workflow.projects[0].targetWorkspace} branch=feat task=t1 labels={room=room-a,project=alpha,parent=orch-1,phase=build,task=t1,role=implementation} evidence=done`
              }
            ]),
            stderr: ""
          };
        }
        throw new Error(`unexpected call: ${args.join(" ")}`);
      }
    });
    const combined = writes.join("");
    assert.match(combined, /"projectKey":"alpha"/);
    assert.match(combined, /"decision":"send"/);
    assert.match(combined, /"reason":"safe_signal_continue"/);
  } finally {
    process.stdout.write = originalWrite;
    rmSync(root, { recursive: true, force: true });
  }
});
