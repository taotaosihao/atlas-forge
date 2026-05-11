import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { initObjective, normalizeConfig } from "../scripts/paseo-guard.mjs";
import { parseWaitMessages, waitForRoomEvent, watch } from "../scripts/paseo-guard-watch.mjs";

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
      objectiveStoreDir: join(root, "state")
    },
    join(root, "config.json")
  );
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
