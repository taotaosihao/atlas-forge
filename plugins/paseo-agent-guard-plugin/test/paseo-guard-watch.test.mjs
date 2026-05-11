import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { normalizeConfig } from "../scripts/paseo-guard.mjs";
import { parseWaitMessages, waitForRoomEvent } from "../scripts/paseo-guard-watch.mjs";

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

