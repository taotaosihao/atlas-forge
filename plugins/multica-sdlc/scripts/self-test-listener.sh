#!/usr/bin/env bash
set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LISTENER="$PLUGIN_ROOT/scripts/multica-sdlc-listener"
TEMPLATE="$PLUGIN_ROOT/templates/multica-sdlc-workflow.yaml"

node - "$LISTENER" "$TEMPLATE" <<'NODE'
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const listener = process.argv[2];
const template = process.argv[3];
const TOKEN = "listener-test-token";
const issueId = "GEW-37";
const parentId = "GEW-36";
const taskId = "task-123";
const writes = [];
const gets = [];

const metadata = {
  "multica_sdlc.phase": "implementation",
  "multica_sdlc.source_role": "coder",
  "multica_sdlc.result": "DONE",
  "multica_sdlc.commit_sha": "abc123",
  "multica_sdlc.completed_roles": JSON.stringify({ coder: { result: "DONE", commit_sha: "abc123" } }),
};

function jsonResponse(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": data.length });
  res.end(data);
}

const api = http.createServer((req, res) => {
  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    jsonResponse(res, 401, { error: "missing auth" });
    return;
  }
  if (req.method === "GET") {
    gets.push(req.url);
    if (req.url === `/api/issues/${issueId}`) jsonResponse(res, 200, { id: issueId, parent_id: parentId, status: "in_review", metadata });
    else if (req.url === `/api/issues/${parentId}`) jsonResponse(res, 200, { id: parentId, status: "in_progress", metadata: { "multica_sdlc.phase": "validation" } });
    else if (req.url === `/api/issues/${issueId}/metadata`) jsonResponse(res, 200, { metadata });
    else if (req.url === `/api/issues/${parentId}/metadata`) jsonResponse(res, 200, { metadata: { "multica_listener.owner": "test" } });
    else if (req.url === `/api/issues/${issueId}/children`) jsonResponse(res, 200, { children: [] });
    else if (req.url === `/api/issues/${parentId}/children`) jsonResponse(res, 200, { children: [{ id: issueId, parent_id: parentId, status: "in_review" }] });
    else if (req.url === `/api/issues/${issueId}/pull-requests`) jsonResponse(res, 200, { pull_requests: [{ state: "draft", head_sha: "abc123" }] });
    else if (req.url === `/api/issues/${parentId}/pull-requests`) jsonResponse(res, 200, { pull_requests: [] });
    else if (req.url === `/api/tasks/${taskId}/messages`) jsonResponse(res, 200, { messages: [] });
    else jsonResponse(res, 404, { error: req.url });
    return;
  }

  let body = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    const parsed = body ? JSON.parse(body) : {};
    writes.push([req.method, req.url, parsed]);
    assert(!JSON.stringify(parsed).includes(TOKEN), "secret leaked into write payload");
    jsonResponse(res, 200, { ok: true });
  });
});

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

function wsFrame(text) {
  const data = Buffer.from(text);
  if (data.length < 126) return Buffer.concat([Buffer.from([0x81, data.length]), data]);
  const header = Buffer.alloc(4);
  header[0] = 0x81;
  header[1] = 126;
  header.writeUInt16BE(data.length, 2);
  return Buffer.concat([header, data]);
}

function readClientFrame(socket) {
  return new Promise((resolve) => {
    let buffer = Buffer.alloc(0);
    socket.on("data", function onData(chunk) {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < 6) return;
      let offset = 2;
      let length = buffer[1] & 0x7f;
      if (length === 126) {
        if (buffer.length < 8) return;
        length = buffer.readUInt16BE(2);
        offset = 4;
      }
      const total = offset + 4 + length;
      if (buffer.length < total) return;
      socket.off("data", onData);
      const mask = buffer.subarray(offset, offset + 4);
      const payload = buffer.subarray(offset + 4, total);
      const out = Buffer.alloc(payload.length);
      for (let i = 0; i < payload.length; i += 1) out[i] = payload[i] ^ mask[i % 4];
      resolve(out.toString());
    });
  });
}

async function createWsServer(event) {
  const server = net.createServer(async (socket) => {
    let request = "";
    socket.on("data", async function onHandshake(chunk) {
      request += chunk.toString("latin1");
      if (!request.includes("\r\n\r\n")) return;
      socket.off("data", onHandshake);
      const key = request.split(/\r\n/).find((line) => /^sec-websocket-key:/i.test(line)).split(":", 2)[1].trim();
      const accept = crypto.createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
      socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
      const auth = JSON.parse(await readClientFrame(socket));
      assert.strictEqual(auth.type, "auth");
      assert.strictEqual(auth.payload.token, TOKEN);
      socket.write(wsFrame(JSON.stringify({ type: "auth_ack" })));
      socket.write(wsFrame("not-json"));
      socket.write(wsFrame(JSON.stringify(event)));
    });
  });
  const port = await listen(server);
  return { server, port };
}

function run(args, env = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(args[0], args.slice(1), {
      env: { ...process.env, MULTICA_TOKEN: TOKEN, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => { stdout += chunk; });
    proc.stderr.on("data", (chunk) => { stderr += chunk; });
    proc.on("error", reject);
    proc.on("close", (status) => {
      if (status !== 0) {
        reject(new Error(`command failed ${status}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
        return;
      }
      resolve({ stdout, stderr, status });
    });
  });
}

(async () => {
  const apiPort = await listen(api);
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "multica-listener-"));
  const event = { type: "task:completed", payload: { task_id: taskId, issue_id: issueId, status: "completed", agent_id: "agent-coder" } };
  const nestedIssueEvent = { type: "issue:updated", payload: { issue: { id: issueId, parent_issue_id: parentId, status: "in_review" }, status_changed: true } };
  const nestedCommentEvent = { type: "comment:created", payload: { comment: { id: "comment-123", issue_id: issueId, content: "{\"multica_sdlc\":{\"phase\":\"implementation\",\"source_role\":\"coder\",\"result\":\"DONE\",\"commit_sha\":\"abc123\"}}" } } };
  const eventFile = path.join(tmp, "event.json");
  const nestedIssueFile = path.join(tmp, "issue-updated-nested.json");
  const nestedCommentFile = path.join(tmp, "comment-created-nested.json");
  fs.writeFileSync(eventFile, JSON.stringify(event));
  fs.writeFileSync(nestedIssueFile, JSON.stringify(nestedIssueEvent));
  fs.writeFileSync(nestedCommentFile, JSON.stringify(nestedCommentEvent));

  const base = [
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-issue", issueId,
    "--template", template,
    "--state-dir", tmp,
    "--event-file", eventFile,
    "--log-json",
  ];

  await run(base);
  assert.deepStrictEqual(writes, []);
  const journal = fs.readFileSync(path.join(tmp, "listener-journal.jsonl"), "utf8");
  assert(!journal.includes(TOKEN), "journal leaked token");
  assert(journal.includes('"apply_mode":"dry-run"'), "journal should record dry-run");

  const nestedIssueOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--template", template,
    "--state-dir", path.join(tmp, "nested-issue"),
    "--event-file", nestedIssueFile,
    "--log-json",
  ]);
  assert(!nestedIssueOut.stdout.includes("watch_filter_miss"), "nested issue:updated must not be pre-filtered out");
  assert(nestedIssueOut.stdout.includes("issue:updated"), "nested issue:updated should be processed");

  const nestedCommentOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-issue", issueId,
    "--template", template,
    "--state-dir", path.join(tmp, "nested-comment"),
    "--event-file", nestedCommentFile,
    "--log-json",
  ]);
  assert(!nestedCommentOut.stdout.includes("watch_filter_miss"), "nested comment:created must not be pre-filtered out");
  assert(nestedCommentOut.stdout.includes("comment:created"), "nested comment:created should be processed");

  const nestedCommentParentOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--template", template,
    "--state-dir", path.join(tmp, "nested-comment-parent"),
    "--event-file", nestedCommentFile,
    "--log-json",
  ]);
  assert(!nestedCommentParentOut.stdout.includes("watch_filter_miss"), "nested comment:created under watched parent must not be pre-filtered out");
  assert(nestedCommentParentOut.stdout.includes("comment:created"), "nested comment:created under watched parent should be processed");

  const apply = base.concat(["--apply", "--allow-action", "comment,metadata"]);
  await run(apply);
  assert.deepStrictEqual(writes.map((item) => item[0]), ["POST", "PUT"]);
  await run(apply);
  assert.deepStrictEqual(writes.map((item) => item[0]), ["POST", "PUT"], "duplicate apply should be suppressed");

  const leaderTask = base.concat(["--apply", "--allow-action", "leader-task"]);
  const before = writes.length;
  const leaderOut = await run(leaderTask);
  assert.strictEqual(writes.length, before, "leader-task must remain blocked");
  assert(leaderOut.stdout.includes("leader-task:blocked"), "leader-task should report blocked");

  const reconcileDir = path.join(tmp, "reconcile");
  await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-issue", issueId,
    "--state-dir", reconcileDir,
    "--reconcile-only",
  ]);
  assert(gets.slice(-3).every((item) => item.startsWith(`/api/issues/${issueId}`)), `unexpected reconcile scope: ${gets.slice(-3).join(",")}`);

  const { server: wsServer, port: wsPort } = await createWsServer(event);
  const wsDir = path.join(tmp, "ws");
  const wsOut = await run([
    listener,
    "--ws-url", `ws://127.0.0.1:${wsPort}/ws`,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-issue", issueId,
    "--state-dir", wsDir,
    "--template", template,
    "--once",
    "--max-events", "1",
    "--log-json",
  ]);
  assert(wsOut.stdout.includes("malformed_frame"), "WS test should include malformed frame drop");
  assert(wsOut.stdout.includes("task:completed"), "WS test should process task event");

  wsServer.close();
  api.close();
  console.log("listener self-test passed");
})().catch((error) => {
  api.close();
  console.error(error);
  process.exit(1);
});
NODE
