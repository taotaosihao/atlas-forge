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
const siblingId = "GEW-38";
const missingFactsId = "GEW-39";
const blockedId = "GEW-40";
const parentId = "GEW-36";
const taskId = "task-123";
const missingTaskId = "task-missing";
const messageTaskId = "task-message";
const writes = [];
const gets = [];
const webhookWrites = [];
let parentChildrenUnstaged = false;
let blockedHasActiveTask = false;
let parentChildrenContinuationStalled = false;
let parentChildrenTitleInferred = false;
let parentHasActiveTask = false;
let childHasActiveTask = false;
let parentChildrenAllComplete = false;
let parentHasNonBlockingControlPlaneTask = false;
let parentControlPlaneHandoff = false;
let primaryIssueStatus = "in_review";
let historicalContractComment = false;
let historicalImplementationAfterContract = false;
let repairReadyMetadata = false;

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
  const reqPath = new URL(req.url, "http://127.0.0.1").pathname;
  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    jsonResponse(res, 401, { error: "missing auth" });
    return;
  }
  if (req.method === "GET") {
    gets.push(reqPath);
    if (reqPath === `/api/issues/${issueId}`) jsonResponse(res, 200, {
      id: issueId,
      parent_id: parentId,
      status: primaryIssueStatus,
      title: parentChildrenTitleInferred ? "GEW-36 Stage 6 discovery: identify first real MES/WMS closed loop" : undefined,
      metadata,
    });
    else if (reqPath === `/api/issues/${parentId}`) jsonResponse(res, 200, { id: parentId, status: "in_progress", metadata: parentControlPlaneHandoff
      ? { control_plane_handoff: "Router owns routing; no active final decision lock", decision: "ROUTE_ONLY", waiting_on: "implementation_owner_repair_wave_2" }
      : { "multica_sdlc.phase": "validation" } });
    else if (reqPath === `/api/issues/${siblingId}`) jsonResponse(res, 200, {
      id: siblingId,
      parent_id: parentId,
      status: parentChildrenTitleInferred ? "done" : "todo",
      title: parentChildrenTitleInferred ? "GEW-36 Stage 5: MES/WMS productization" : undefined,
      metadata,
    });
    else if (reqPath === `/api/issues/${missingFactsId}`) jsonResponse(res, 200, { id: missingFactsId, parent_id: parentId, status: "todo", metadata: historicalImplementationAfterContract
      ? {
        "multica_sdlc.phase": "post_code_review_pending",
        "multica_sdlc.source_role": "planner",
        "multica_sdlc.result": "CONTRACT_ACCEPTED",
      }
      : repairReadyMetadata
        ? {
          control_plane_handoff: "ROUTE_ONLY: Repair Captain returned REPAIR_PLAN_READY",
          "multica_sdlc.phase": "repair_ready",
          "multica_sdlc.source_role": "repair_captain",
          "multica_sdlc.result": "REPAIR_PLAN_READY",
          "multica_sdlc.commit_sha": "abc123",
          "multica_sdlc.next_owner": "SDLC GPT Coder for repair",
          "multica_sdlc.review_wave_id": "RW-POSTCODE-001",
        }
      : {} });
    else if (reqPath === `/api/issues/${blockedId}`) jsonResponse(res, 200, { id: blockedId, parent_id: parentId, status: "blocked", metadata });
    else if (reqPath === `/api/issues/${issueId}/metadata`) jsonResponse(res, 200, { metadata });
    else if (reqPath === `/api/issues/${parentId}/metadata`) jsonResponse(res, 200, { metadata: parentControlPlaneHandoff
      ? { control_plane_handoff: "Router owns routing; no active final decision lock", decision: "ROUTE_ONLY", waiting_on: "implementation_owner_repair_wave_2" }
      : { "multica_listener.owner": "test" } });
    else if (reqPath === `/api/issues/${siblingId}/metadata`) jsonResponse(res, 200, { metadata });
    else if (reqPath === `/api/issues/${missingFactsId}/metadata`) jsonResponse(res, 200, { metadata: historicalImplementationAfterContract
      ? {
        "multica_sdlc.phase": "post_code_review_pending",
        "multica_sdlc.source_role": "planner",
        "multica_sdlc.result": "CONTRACT_ACCEPTED",
      }
      : repairReadyMetadata
        ? {
          control_plane_handoff: "ROUTE_ONLY: Repair Captain returned REPAIR_PLAN_READY",
          "multica_sdlc.phase": "repair_ready",
          "multica_sdlc.source_role": "repair_captain",
          "multica_sdlc.result": "REPAIR_PLAN_READY",
          "multica_sdlc.commit_sha": "abc123",
          "multica_sdlc.next_owner": "SDLC GPT Coder for repair",
          "multica_sdlc.review_wave_id": "RW-POSTCODE-001",
        }
      : {} });
    else if (reqPath === `/api/issues/${blockedId}/metadata`) jsonResponse(res, 200, { metadata });
    else if (reqPath === `/api/issues/${issueId}/children`) jsonResponse(res, 200, { children: [] });
    else if (reqPath === `/api/issues/${parentId}/children`) jsonResponse(res, 200, { children: parentChildrenUnstaged
      ? [{ id: issueId, parent_id: parentId, stage: null, status: "in_review" }, { id: siblingId, parent_id: parentId, status: "todo" }]
      : parentChildrenTitleInferred
        ? [{ id: issueId, parent_id: parentId, stage: null, status: "in_review" }, { id: siblingId, parent_id: parentId, stage: null, status: "done" }]
      : parentChildrenContinuationStalled
        ? [{ id: issueId, parent_id: parentId, stage: "stage-1", status: "in_review" }, { id: siblingId, parent_id: parentId, stage: "stage-2", status: "in_review" }]
      : parentChildrenAllComplete
        ? [{ id: issueId, parent_id: parentId, stage: "stage-1", status: "in_review" }, { id: siblingId, parent_id: parentId, stage: "stage-2", status: "done" }]
      : [{ id: issueId, parent_id: parentId, stage: "stage-1", status: "in_review" }, { id: siblingId, parent_id: parentId, stage: "stage-2", status: "todo" }] });
    else if (reqPath === `/api/issues/${siblingId}/children`) jsonResponse(res, 200, { children: [] });
    else if (reqPath === `/api/issues/${missingFactsId}/children`) jsonResponse(res, 200, { children: [] });
    else if (reqPath === `/api/issues/${blockedId}/children`) jsonResponse(res, 200, { children: [] });
    else if (reqPath === `/api/issues/${issueId}/pull-requests`) jsonResponse(res, 200, { pull_requests: [{ state: "draft", head_sha: "abc123" }] });
    else if (reqPath === `/api/issues/${parentId}/pull-requests`) jsonResponse(res, 200, { pull_requests: [] });
    else if (reqPath === `/api/issues/${siblingId}/pull-requests`) jsonResponse(res, 200, { pull_requests: [] });
    else if (reqPath === `/api/issues/${missingFactsId}/pull-requests`) jsonResponse(res, 200, { pull_requests: [] });
    else if (reqPath === `/api/issues/${blockedId}/pull-requests`) jsonResponse(res, 200, { pull_requests: [] });
    else if (reqPath === `/api/issues/${parentId}/active-task`) jsonResponse(res, 200, { tasks: parentHasActiveTask
      ? [{ id: "active-parent", status: "running" }]
      : parentHasNonBlockingControlPlaneTask
        ? [{ id: "active-router", status: "running", agent_id: "1f080c7d-28df-4052-9908-1c5f578e67ae", trigger_summary: "ROUTE_ONLY block_downstream=false no active final decision lock" }]
        : [] });
    else if (reqPath === `/api/issues/${issueId}/active-task`) jsonResponse(res, 200, { tasks: childHasActiveTask ? [{ id: "active-child", status: "running" }] : [] });
    else if (reqPath === `/api/issues/${siblingId}/active-task`) jsonResponse(res, 200, { tasks: childHasActiveTask ? [{ id: "active-sibling", status: "running" }] : [] });
    else if (reqPath === `/api/issues/${blockedId}/active-task`) jsonResponse(res, 200, { tasks: blockedHasActiveTask ? [{ id: "active-1", status: "running" }] : [] });
    else if (reqPath === `/api/tasks/${taskId}/messages`) jsonResponse(res, 200, { messages: [] });
    else if (reqPath === `/api/tasks/${missingTaskId}/messages`) jsonResponse(res, 200, { messages: [] });
    else if (reqPath === `/api/tasks/${messageTaskId}/messages`) jsonResponse(res, 200, { messages: [] });
    else if (reqPath === `/api/issues/${missingFactsId}/comments`) jsonResponse(res, 200, { comments: historicalImplementationAfterContract
      ? [
        { id: "historical-contract", issue_id: missingFactsId, content: "`CONTRACT_ACCEPTED`\n\nArtifact:\n- Path: `/tmp/stage7-contract.md`\n- SHA256: `abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd`\n\nNext planned owner: SDLC GPT Gate Registry Coordinator." },
        { id: "historical-implementation", issue_id: missingFactsId, content: "Implemented Stage 7 Agent/MCP slice; commit `cb59fada0e7f8014293f48e0c438164738ebf04f`; post-code review/runtime gates are required next." },
      ]
      : historicalContractComment
        ? [{ id: "historical-contract", issue_id: missingFactsId, content: "`CONTRACT_ACCEPTED`\n\nArtifact:\n- Path: `/tmp/stage7-contract.md`\n- SHA256: `abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd`\n\nNext planned owner: SDLC GPT Gate Registry Coordinator." }]
        : [] });
    else if (reqPath.endsWith("/comments")) jsonResponse(res, 200, { comments: [] });
    else jsonResponse(res, 404, { error: reqPath });
    return;
  }

  let body = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    const parsed = body ? JSON.parse(body) : {};
    writes.push([req.method, reqPath, parsed]);
    assert(!JSON.stringify(parsed).includes(TOKEN), "secret leaked into write payload");
    jsonResponse(res, 200, { ok: true });
  });
});

const webhook = http.createServer((req, res) => {
  let body = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    const parsed = body ? JSON.parse(body) : {};
    webhookWrites.push({ path: new URL(req.url, "http://127.0.0.1").pathname, body: parsed });
    jsonResponse(res, 200, { code: 0, msg: "ok" });
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
      env: {
        ...process.env,
        MULTICA_TOKEN: TOKEN,
        LARK_NOTIFY_CONFIG: path.join(os.tmpdir(), "multica-listener-missing-notify-config.json"),
        LARK_WEBHOOK_URL: "",
        FEISHU_WEBHOOK_URL: "",
        LARK_WEBHOOK_SECRET: "",
        FEISHU_WEBHOOK_SECRET: "",
        ...env,
      },
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
  const webhookPort = await listen(webhook);
  const webhookUrl = `http://127.0.0.1:${webhookPort}/hook/test`;
  const webhookSecret = "test-webhook-secret";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "multica-listener-"));
  const notifyConfigFile = path.join(tmp, "lark-notify-config.json");
  const subagentScript = path.join(tmp, "subagent.sh");
  const degradedSubagentScript = path.join(tmp, "subagent-degraded.sh");
  fs.writeFileSync(notifyConfigFile, JSON.stringify({ webhook_url: webhookUrl, webhook_secret: webhookSecret }, null, 2));
  fs.writeFileSync(subagentScript, [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "payload=\"$(cat)\"",
    "node -e 'const p=JSON.parse(process.argv[1]); console.log(JSON.stringify({severity:\"test\",recommended_action:\"continue\",target_issue:p.normalized.router_event.parent_issue_id||p.normalized.router_event.issue_id,reason:p.decision.reason_code,stop_condition:\"test complete\"}))' \"$payload\"",
  ].join("\n"));
  fs.writeFileSync(degradedSubagentScript, [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "payload=\"$(cat)\"",
    "node -e 'const p=JSON.parse(process.argv[1]); console.log(JSON.stringify({degraded:true,severity:\"needs_attention\",recommended_action:\"fallback\",target_issue:p.normalized.router_event.parent_issue_id||p.normalized.router_event.issue_id,reason:p.decision.reason_code,stop_condition:\"fallback only\"}))' \"$payload\"",
  ].join("\n"));
  fs.chmodSync(subagentScript, 0o700);
  fs.chmodSync(degradedSubagentScript, 0o700);
  const event = { type: "task:completed", payload: { task_id: taskId, issue_id: issueId, status: "completed", agent_id: "agent-coder" } };
  const nestedIssueEvent = { type: "issue:updated", payload: { issue: { id: issueId, parent_issue_id: parentId, status: "in_review" }, status_changed: true } };
  const nestedCommentEvent = { type: "comment:created", payload: { comment: { id: "comment-123", issue_id: issueId, content: "{\"multica_sdlc\":{\"phase\":\"implementation\",\"source_role\":\"coder\",\"result\":\"DONE\",\"commit_sha\":\"abc123\"}}" } } };
  const siblingCommentEvent = { type: "comment:created", payload: { comment: { id: "comment-sibling", issue_id: siblingId, content: "{\"multica_sdlc\":{\"phase\":\"implementation\",\"source_role\":\"coder\",\"result\":\"DONE\",\"commit_sha\":\"abc123\"}}" } } };
  const missingFactsEvent = { type: "task:completed", payload: { task_id: missingTaskId, issue_id: missingFactsId, status: "completed", agent_id: "agent-coder" } };
  const missingFactsEventAgain = { type: "comment:created", payload: { comment: { id: "missing-comment-again", issue_id: missingFactsId, content: "same missing SDLC facts" } } };
  const contractAcceptedEvent = { type: "comment:created", payload: { comment: { id: "contract-accepted-comment", issue_id: missingFactsId, content: "`CONTRACT_ACCEPTED`\n\nArtifact:\n- Path: `/tmp/stage7-contract.md`\n- SHA256: `0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`\n\nThe next planned owner is `SDLC GPT Gate Registry Coordinator` for registry validation." } } };
  const blockedEvent = { type: "issue:updated", payload: { issue: { id: blockedId, parent_issue_id: parentId, status: "blocked" }, status_changed: true } };
  const taskMessageEvent = { type: "task:message", payload: { task_id: messageTaskId, issue_id: missingFactsId, seq: 1, type: "text", content: "progress update without structured SDLC facts" } };
  const ignoredProgressEvent = { type: "task:progress", payload: { task_id: messageTaskId, issue_id: missingFactsId, progress: 50 } };
  const eventFile = path.join(tmp, "event.json");
  const nestedIssueFile = path.join(tmp, "issue-updated-nested.json");
  const nestedCommentFile = path.join(tmp, "comment-created-nested.json");
  const siblingCommentFile = path.join(tmp, "comment-created-sibling.json");
  const missingFactsFile = path.join(tmp, "missing-facts.json");
  const missingFactsAgainFile = path.join(tmp, "missing-facts-again.json");
  const contractAcceptedFile = path.join(tmp, "contract-accepted.json");
  const blockedFile = path.join(tmp, "blocked-issue.json");
  const taskMessageFile = path.join(tmp, "task-message.json");
  const ignoredProgressFile = path.join(tmp, "ignored-progress.json");
  fs.writeFileSync(eventFile, JSON.stringify(event));
  fs.writeFileSync(nestedIssueFile, JSON.stringify(nestedIssueEvent));
  fs.writeFileSync(nestedCommentFile, JSON.stringify(nestedCommentEvent));
  fs.writeFileSync(siblingCommentFile, JSON.stringify(siblingCommentEvent));
  fs.writeFileSync(missingFactsFile, JSON.stringify(missingFactsEvent));
  fs.writeFileSync(missingFactsAgainFile, JSON.stringify(missingFactsEventAgain));
  fs.writeFileSync(contractAcceptedFile, JSON.stringify(contractAcceptedEvent));
  fs.writeFileSync(blockedFile, JSON.stringify(blockedEvent));
  fs.writeFileSync(taskMessageFile, JSON.stringify(taskMessageEvent));
  fs.writeFileSync(ignoredProgressFile, JSON.stringify(ignoredProgressEvent));

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

  const siblingUnderParentOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--watch-issue", issueId,
    "--template", template,
    "--state-dir", path.join(tmp, "sibling-under-parent"),
    "--event-file", siblingCommentFile,
    "--log-json",
  ]);
  assert(!siblingUnderParentOut.stdout.includes("watch_filter_miss"), "sibling under watched parent must not be blocked by watch-issue");
  assert(siblingUnderParentOut.stdout.includes("comment:created"), "sibling under watched parent should be processed");

  const apply = base.concat(["--apply", "--allow-action", "comment,metadata"]);
  const applyOut = await run(apply);
  assert.deepStrictEqual(writes.map((item) => item[0]), ["PUT"], "listener comments should be suppressed by default");
  assert(applyOut.stdout.includes("comment:suppressed"), "default apply should report suppressed comment");
  await run(apply);
  assert.deepStrictEqual(writes.map((item) => item[0]), ["PUT"], "duplicate apply should be suppressed");

  const listenerCommentBefore = writes.length;
  await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-issue", issueId,
    "--template", template,
    "--state-dir", path.join(tmp, "listener-comment-opt-in"),
    "--event-file", eventFile,
    "--log-json",
    "--apply",
    "--allow-action", "comment,metadata",
    "--listener-comments",
  ]);
  const listenerCommentWrites = writes.slice(listenerCommentBefore);
  assert.deepStrictEqual(listenerCommentWrites.map((item) => item[0]), ["POST", "PUT"], "listener comments should require explicit opt-in");
  assert(listenerCommentWrites[0][2].content.includes("[multica-sdlc-listener]"), "opt-in listener comment should be structured");

  const missingFactsBefore = writes.length;
  const missingFactsOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--template", template,
    "--state-dir", path.join(tmp, "missing-facts"),
    "--event-file", missingFactsFile,
    "--log-json",
    "--apply",
    "--allow-action", "comment,metadata",
  ]);
  const missingFactsWrites = writes.slice(missingFactsBefore);
  assert(missingFactsOut.stdout.includes("idle_incomplete_leader_handoff"), "idle missing-facts child should wake the parent leader first");
  assert.deepStrictEqual(missingFactsWrites.map((item) => item[0]), ["PUT"], "idle missing-facts correction should default to metadata-only");
  assert(missingFactsOut.stdout.includes("comment:suppressed"), "listener comments should be suppressed by default");
  assert(JSON.stringify(missingFactsWrites[0][2]).includes("idle_incomplete_leader_handoff"), "idle missing-facts metadata should include leader handoff classification");
  await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--template", template,
    "--state-dir", path.join(tmp, "missing-facts"),
    "--event-file", missingFactsAgainFile,
    "--log-json",
    "--apply",
    "--allow-action", "comment,metadata",
  ]);
  assert.strictEqual(writes.length, missingFactsBefore + 1, "same missing facts warning should dedupe across source events");

  const contractAcceptedBefore = writes.length;
  const contractAcceptedOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--template", template,
    "--state-dir", path.join(tmp, "contract-accepted-handoff"),
    "--event-file", contractAcceptedFile,
    "--log-json",
    "--apply",
    "--allow-action", "metadata,leader-task",
  ]);
  const contractAcceptedWrites = writes.slice(contractAcceptedBefore);
  assert(contractAcceptedOut.stdout.includes("idle_incomplete_leader_handoff"), "plain CONTRACT_ACCEPTED idle state should produce generic leader handoff");
  assert(!contractAcceptedOut.stdout.includes("missing_sdlc_facts"), "plain CONTRACT_ACCEPTED comment must not be treated as missing facts");
  assert(contractAcceptedWrites.some((item) => item[0] === "POST" && item[1] === `/api/issues/${parentId}/rerun`), "contract idle handoff should rerun watched parent router");
  assert(!contractAcceptedWrites.some((item) => item[0] === "POST" && item[1] === `/api/issues/${missingFactsId}/rerun`), "guard must not rerun child worker for contract idle handoff");

  historicalContractComment = true;
  const contractReconcileBefore = writes.length;
  const contractReconcileOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--watch-issue", missingFactsId,
    "--template", template,
    "--state-dir", path.join(tmp, "contract-accepted-reconcile"),
    "--reconcile-only",
    "--log-json",
    "--apply",
    "--allow-action", "metadata,leader-task",
  ]);
  historicalContractComment = false;
  const contractReconcileWrites = writes.slice(contractReconcileBefore);
  assert(contractReconcileOut.stdout.includes("idle_incomplete_leader_handoff"), "startup reconcile should wake leader for idle CONTRACT_ACCEPTED state");
  assert(contractReconcileWrites.some((item) => item[0] === "POST" && item[1] === `/api/issues/${parentId}/rerun`), "comment-derived idle handoff should rerun watched parent router");

  historicalImplementationAfterContract = true;
  const implementationDoneBefore = writes.length;
  const implementationDoneOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--watch-issue", missingFactsId,
    "--template", template,
    "--state-dir", path.join(tmp, "implementation-done-after-contract"),
    "--reconcile-only",
    "--log-json",
    "--apply",
    "--allow-action", "metadata,leader-task",
  ]);
  historicalImplementationAfterContract = false;
  const implementationDoneWrites = writes.slice(implementationDoneBefore);
  assert(implementationDoneOut.stdout.includes("idle_incomplete_leader_handoff"), "implementation completion after CONTRACT_ACCEPTED should produce generic leader handoff when idle");
  assert(!implementationDoneOut.stdout.includes("contract_accepted_handoff"), "implementation completion must take precedence over older contract handoff");
  assert(implementationDoneWrites.some((item) => item[0] === "POST" && item[1] === `/api/issues/${parentId}/rerun`), "implementation handoff should rerun watched parent router");
  assert(!implementationDoneWrites.some((item) => item[0] === "POST" && item[1] === `/api/issues/${missingFactsId}/rerun`), "guard must not rerun child worker for implementation idle handoff");

  repairReadyMetadata = true;
  const repairReadyBefore = writes.length;
  const repairReadyOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--watch-issue", missingFactsId,
    "--template", template,
    "--state-dir", path.join(tmp, "repair-ready-leader-handoff"),
    "--reconcile-only",
    "--log-json",
    "--apply",
    "--allow-action", "metadata,leader-task",
  ]);
  repairReadyMetadata = false;
  const repairReadyWrites = writes.slice(repairReadyBefore);
  assert(repairReadyOut.stdout.includes("idle_incomplete_leader_handoff"), "idle incomplete repair state should wake leader instead of being observe-only");
  assert(!repairReadyOut.stdout.includes("control_plane_observed"), "idle incomplete repair state must not be suppressed as nonblocking control-plane observation");
  assert(repairReadyWrites.some((item) => item[0] === "POST" && item[1] === `/api/issues/${parentId}/rerun`), "idle incomplete handoff should rerun watched parent leader");
  assert(!repairReadyWrites.some((item) => item[0] === "POST" && item[1] === `/api/issues/${missingFactsId}/rerun`), "guard must not directly rerun child coder/worker issue for repair");

  primaryIssueStatus = "done";
  const terminalGuardBefore = writes.length;
  const terminalGuardOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--template", template,
    "--state-dir", path.join(tmp, "terminal-status-guard"),
    "--event-file", nestedIssueFile,
    "--log-json",
    "--apply",
    "--allow-action", "comment,metadata",
  ]);
  primaryIssueStatus = "in_review";
  const terminalGuardWrites = writes.slice(terminalGuardBefore);
  assert(terminalGuardOut.stdout.includes("terminal_child_barrier"), "terminal child should produce terminal_child_barrier");
  assert.deepStrictEqual(terminalGuardWrites.map((item) => item[0]), ["PUT"], "terminal child guard should default to metadata-only");
  assert(JSON.stringify(terminalGuardWrites[0][2]).includes("forbid_parent_in_review"), "terminal child metadata should include parent in_review guard");
  assert(JSON.stringify(terminalGuardWrites[0][2]).includes("required_parent_status_while_child_active"), "terminal child metadata should name the in_progress parent status guard");
  const terminalNotifyJournal = fs.readFileSync(path.join(tmp, "terminal-status-guard", "lark-notify.jsonl"), "utf8");
  assert(terminalNotifyJournal.includes('"type":"child-complete"'), "completed child should produce progress notification record by default");
  assert(terminalNotifyJournal.includes("skipped_missing_target"), "completed child notification without target should be recorded as skipped");

  webhookWrites.length = 0;
  primaryIssueStatus = "done";
  await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--template", template,
    "--state-dir", path.join(tmp, "terminal-child-task-completed-no-lark"),
    "--event-file", eventFile,
    "--log-json",
    "--apply",
    "--allow-action", "metadata",
    "--lark-webhook-url", webhookUrl,
    "--lark-webhook-secret", webhookSecret,
  ]);
  primaryIssueStatus = "in_review";
  assert.strictEqual(webhookWrites.length, 0, "task completion alone must not send child progress notification");

  webhookWrites.length = 0;
  primaryIssueStatus = "done";
  await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--template", template,
    "--state-dir", path.join(tmp, "terminal-child-lark-send"),
    "--event-file", nestedIssueFile,
    "--log-json",
    "--apply",
    "--allow-action", "metadata",
    "--lark-webhook-url", webhookUrl,
    "--lark-webhook-secret", webhookSecret,
  ]);
  primaryIssueStatus = "in_review";
  assert.strictEqual(webhookWrites.length, 1, "completed child should call webhook once");
  assert.strictEqual(webhookWrites[0].body.msg_type, "text", "completed child webhook should send text message");
  assert(webhookWrites[0].body.content.text.includes("子任务进度更新"), "completed child webhook should include progress message");
  assert(webhookWrites[0].body.timestamp && webhookWrites[0].body.sign, "signed webhook should include timestamp and sign");

  webhookWrites.length = 0;
  await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--template", template,
    "--state-dir", path.join(tmp, "review-child-webhook-send"),
    "--event-file", nestedIssueFile,
    "--log-json",
    "--apply",
    "--allow-action", "metadata",
    "--lark-webhook-url", webhookUrl,
    "--lark-webhook-secret", webhookSecret,
  ]);
  assert.strictEqual(webhookWrites.length, 1, "in_review child should call webhook once");
  assert(webhookWrites[0].body.content.text.includes("子任务进度更新"), "in_review child webhook should include progress message");

  const missingFactsCommentBefore = writes.length;
  await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--template", template,
    "--state-dir", path.join(tmp, "missing-facts-comment-opt-in"),
    "--event-file", missingFactsFile,
    "--log-json",
    "--apply",
    "--allow-action", "comment,metadata",
    "--state-guard-comments",
  ]);
  const missingFactsCommentWrites = writes.slice(missingFactsCommentBefore);
  assert.deepStrictEqual(missingFactsCommentWrites.map((item) => item[0]), ["PUT", "POST"], "idle handoff comments should run after metadata when explicitly enabled");
  assert(JSON.stringify(missingFactsCommentWrites[0][2]).includes("idle_incomplete_leader_handoff"), "opt-in idle handoff metadata should be structured");
  assert(missingFactsCommentWrites[1][2].content.includes("idle_incomplete_leader_handoff"), "opt-in idle handoff comment should be structured");

  const missingFactsLeaderBefore = writes.length;
  const missingFactsLeaderOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--template", template,
    "--state-dir", path.join(tmp, "missing-facts-leader-task"),
    "--event-file", missingFactsFile,
    "--log-json",
    "--apply",
    "--allow-action", "leader-task",
  ]);
  const missingFactsLeaderWrites = writes.slice(missingFactsLeaderBefore);
  assert(missingFactsLeaderOut.stdout.includes("leader-task:applied"), "missing facts leader-task should rerun parent leader");
  assert.deepStrictEqual(missingFactsLeaderWrites.map((item) => item[0]), ["POST"], "missing facts leader-task should only rerun parent");
  assert.strictEqual(missingFactsLeaderWrites[0][1], `/api/issues/${parentId}/rerun`, "missing facts leader-task should target watched parent");

  const ineffectiveDir = path.join(tmp, "missing-facts-ineffective-escalation");
  const ineffectiveFirstBefore = writes.length;
  const ineffectiveFirstOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--template", template,
    "--state-dir", ineffectiveDir,
    "--event-file", missingFactsFile,
    "--log-json",
    "--apply",
    "--allow-action", "leader-task",
  ]);
  assert(ineffectiveFirstOut.stdout.includes("idle_incomplete_leader_handoff"), "first idle missing-facts event should use the leader handoff reason");
  assert.strictEqual(writes.slice(ineffectiveFirstBefore).filter((item) => item[0] === "POST" && item[1] === `/api/issues/${parentId}/rerun`).length, 1, "first idle missing-facts event should rerun parent once");

  const ineffectiveSecondBefore = writes.length;
  const ineffectiveSecondOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--template", template,
    "--state-dir", ineffectiveDir,
    "--event-file", missingFactsAgainFile,
    "--log-json",
    "--apply",
    "--allow-action", "leader-task",
  ]);
  assert(!ineffectiveSecondOut.stdout.includes("control_plane_observed"), "unchanged idle/missing-facts state must not be observe-only");
  assert(writes.slice(ineffectiveSecondBefore).filter((item) => item[0] === "POST" && item[1] === `/api/issues/${missingFactsId}/rerun`).length === 0, "guard must not rerun child workers for unchanged repair state");
  const ineffectiveJournal = fs.readFileSync(path.join(ineffectiveDir, "listener-journal.jsonl"), "utf8");
  assert(ineffectiveJournal.includes("missing_sdlc_facts") || ineffectiveJournal.includes("idle_incomplete_leader_handoff"), "unchanged idle/missing-facts state should be journaled");

  const ineffectiveThirdBefore = writes.length;
  const ineffectiveThirdOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--template", template,
    "--state-dir", ineffectiveDir,
    "--event-file", missingFactsAgainFile,
    "--log-json",
    "--apply",
    "--allow-action", "leader-task",
    "--leader-task-retry-seconds", "0",
  ]);
  assert(!ineffectiveThirdOut.stdout.includes("control_plane_observed"), "same idle/missing-facts state must still avoid observe-only suppression");
  assert.strictEqual(writes.slice(ineffectiveThirdBefore).filter((item) => item[0] === "POST" && item[1] === `/api/issues/${missingFactsId}/rerun`).length, 0, "same state must never rerun child worker issue directly");

  const taskMessageBefore = writes.length;
  const taskMessageOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--template", template,
    "--state-dir", path.join(tmp, "task-message"),
    "--event-file", taskMessageFile,
    "--log-json",
    "--apply",
    "--allow-action", "comment,metadata",
  ]);
  assert.strictEqual(writes.length, taskMessageBefore, "task:message observe-only must not write in apply mode");
  assert(taskMessageOut.stdout.includes("task:message"), "task:message should not be ignored");
  assert(taskMessageOut.stdout.includes("task_message_observed"), "task:message without SDLC facts should be observe-only");

  const repeatedMessageDir = path.join(tmp, "task-message-throttle");
  const repeatedTaskMessageOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--template", template,
    "--state-dir", repeatedMessageDir,
    "--event-file", taskMessageFile,
    "--event-file", taskMessageFile,
    "--event-file", taskMessageFile,
    "--log-json",
    "--apply",
    "--allow-action", "comment,metadata",
  ]);
  const repeatedTaskMessageStdoutCount = (repeatedTaskMessageOut.stdout.match(/task_message_observed/g) || []).length;
  const repeatedTaskMessageJournalCount = fs.readFileSync(path.join(repeatedMessageDir, "listener-journal.jsonl"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes('"classification":"task_message_observed"')).length;
  assert.strictEqual(repeatedTaskMessageStdoutCount, 1, "repeated task:message observe-only events should be throttled on stdout");
  assert.strictEqual(repeatedTaskMessageJournalCount, 3, "repeated task:message observe-only events should remain fully journaled");

  const ignoredDir = path.join(tmp, "ignored-drop-throttle");
  const ignoredOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--template", template,
    "--state-dir", ignoredDir,
    "--event-file", ignoredProgressFile,
    "--event-file", ignoredProgressFile,
    "--event-file", ignoredProgressFile,
    "--log-json",
  ]);
  const ignoredStdoutCount = (ignoredOut.stdout.match(/event_type_ignored/g) || []).length;
  const ignoredJournalCount = fs.readFileSync(path.join(ignoredDir, "listener-journal.jsonl"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes('"classification":"event_type_ignored"')).length;
  assert.strictEqual(ignoredStdoutCount, 1, "repeated ignored events should be throttled on stdout");
  assert.strictEqual(ignoredJournalCount, 3, "repeated ignored events should remain fully journaled");

  const leaderTask = base.concat(["--apply", "--allow-action", "leader-task"]);
  const before = writes.length;
  const leaderOut = await run(leaderTask);
  assert.strictEqual(writes.length, before, "leader-task should not run without a leader_required decision");
  assert(leaderOut.stdout.includes("leader-task:blocked"), "non-leader decision should report blocked leader-task");

  primaryIssueStatus = "todo";
  const nonterminalLeaderBefore = writes.length;
  const nonterminalLeaderOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--template", template,
    "--state-dir", path.join(tmp, "nonterminal-leader-task"),
    "--event-file", nestedIssueFile,
    "--log-json",
    "--apply",
    "--allow-action", "leader-task",
  ]);
  const nonterminalLeaderWrites = writes.slice(nonterminalLeaderBefore);
  assert(nonterminalLeaderOut.stdout.includes("idle_incomplete_leader_handoff"), "idle nonterminal child should produce generic leader handoff classification");
  assert(nonterminalLeaderOut.stdout.includes("leader-task:applied"), "nonterminal child should rerun parent leader when leader-task is allowed");
  assert.deepStrictEqual(nonterminalLeaderWrites.map((item) => item[0]), ["POST"], "nonterminal leader-task should only rerun parent");
  assert.strictEqual(nonterminalLeaderWrites[0][1], `/api/issues/${parentId}/rerun`, "nonterminal leader-task should rerun watched parent");

  const nonterminalDuplicateBefore = writes.length;
  await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--template", template,
    "--state-dir", path.join(tmp, "nonterminal-leader-task"),
    "--event-file", nestedIssueFile,
    "--log-json",
    "--apply",
    "--allow-action", "leader-task",
  ]);
  assert.strictEqual(writes.length, nonterminalDuplicateBefore, "same nonterminal state should dedupe parent leader rerun");

  const nonterminalRetryBefore = writes.length;
  const nonterminalRetryOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--template", template,
    "--state-dir", path.join(tmp, "nonterminal-leader-task"),
    "--event-file", nestedIssueFile,
    "--log-json",
    "--apply",
    "--allow-action", "leader-task",
    "--leader-task-retry-seconds", "0",
  ]);
  assert(nonterminalRetryOut.stdout.includes("leader-task:applied"), "expired nonterminal leader-task dedupe should retry");
  assert.strictEqual(writes.slice(nonterminalRetryBefore).filter((item) => item[0] === "POST" && item[1] === `/api/issues/${parentId}/rerun`).length, 1, "expired nonterminal state should rerun parent once");
  primaryIssueStatus = "in_review";

  const foreignOwnerDir = path.join(tmp, "foreign-owner-session");
  fs.mkdirSync(foreignOwnerDir, { recursive: true });
  fs.writeFileSync(path.join(foreignOwnerDir, "listener-owner-session.json"), JSON.stringify({
    owner_session_id: "other-codex-session",
    pid: process.pid,
    heartbeat_at: new Date().toISOString(),
  }));
  const foreignOwnerBefore = writes.length;
  const foreignOwnerOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--template", template,
    "--state-dir", foreignOwnerDir,
    "--event-file", nestedIssueFile,
    "--log-json",
    "--apply",
    "--allow-action", "leader-task,metadata",
    "--owner-session-id", "new-codex-session",
  ]);
  assert.strictEqual(writes.length, foreignOwnerBefore, "fresh foreign owner session must block Multica writes");
  assert(foreignOwnerOut.stdout.includes("owner-session:blocked"), "foreign owner should be reported");

  const exitIfNotOwnerBefore = writes.length;
  const exitIfNotOwnerOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--template", template,
    "--state-dir", foreignOwnerDir,
    "--event-file", nestedIssueFile,
    "--log-json",
    "--apply",
    "--allow-action", "leader-task,metadata",
    "--owner-session-id", "new-codex-session",
    "--exit-if-not-owner",
  ]);
  assert.strictEqual(writes.length, exitIfNotOwnerBefore, "exit-if-not-owner must not write Multica state");
  assert(!exitIfNotOwnerOut.stdout.includes("nonterminal_leader_gate"), "exit-if-not-owner should exit before processing events");
  const exitIfNotOwnerLifecycle = fs.readFileSync(path.join(foreignOwnerDir, "listener-lifecycle.jsonl"), "utf8");
  assert(exitIfNotOwnerLifecycle.includes('"event_type":"exit_not_owner"'), "exit-if-not-owner should be lifecycle logged");

  const staleOwnerDir = path.join(tmp, "stale-owner-session");
  fs.mkdirSync(staleOwnerDir, { recursive: true });
  fs.writeFileSync(path.join(staleOwnerDir, "listener-owner-session.json"), JSON.stringify({
    owner_session_id: "stale-codex-session",
    pid: 99999999,
    heartbeat_at: new Date(Date.now() - 3600_000).toISOString(),
    workspace: "sharp-cell",
    watch_parent: [parentId],
    watch_issue: [],
  }));
  primaryIssueStatus = "todo";
  const staleOwnerBefore = writes.length;
  const staleOwnerOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--template", template,
    "--state-dir", staleOwnerDir,
    "--event-file", nestedIssueFile,
    "--log-json",
    "--apply",
    "--allow-action", "leader-task,metadata",
    "--owner-session-id", "new-codex-session",
  ]);
  assert(staleOwnerOut.stdout.includes("idle_incomplete_leader_handoff"), "stale owner should be reclaimed and process event");
  assert(writes.length > staleOwnerBefore, "stale owner takeover should allow writes");
  const staleOwnerLifecycle = fs.readFileSync(path.join(staleOwnerDir, "listener-lifecycle.jsonl"), "utf8");
  assert(staleOwnerLifecycle.includes('"event_type":"stale_owner_reclaimed"'), "stale takeover should be lifecycle logged");

  parentHasActiveTask = true;
  const nonterminalActiveBefore = writes.length;
  const nonterminalActiveOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--template", template,
    "--state-dir", path.join(tmp, "nonterminal-leader-active-task"),
    "--event-file", nestedIssueFile,
    "--log-json",
    "--apply",
    "--allow-action", "leader-task",
  ]);
  parentHasActiveTask = false;
  assert.strictEqual(writes.length, nonterminalActiveBefore, "nonterminal leader-task must not rerun when parent task is already active");
  assert(nonterminalActiveOut.stdout.includes("leader-task:active"), "active parent leader task should be reported");

  parentHasNonBlockingControlPlaneTask = true;
  parentControlPlaneHandoff = true;
  const nonBlockingControlBefore = writes.length;
  const nonBlockingControlOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--template", template,
    "--state-dir", path.join(tmp, "nonterminal-control-plane-active-task"),
    "--event-file", nestedIssueFile,
    "--log-json",
    "--apply",
    "--allow-action", "leader-task",
  ]);
  parentHasNonBlockingControlPlaneTask = false;
  parentControlPlaneHandoff = false;
  primaryIssueStatus = "in_review";
  assert(nonBlockingControlOut.stdout.includes("leader-task:active"), "non-blocking control-plane task should still suppress duplicate leader rerun");
  assert(!writes.slice(nonBlockingControlBefore).some((item) => item[0] === "POST" && item[1] === `/api/issues/${parentId}/rerun`), "non-blocking control-plane active task must not be cancelled by duplicate rerun");

  const subagentDir = path.join(tmp, "subagent-missing-facts");
  const subagentBefore = writes.length;
  const subagentOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--template", template,
    "--state-dir", subagentDir,
    "--event-file", missingFactsFile,
    "--log-json",
    "--apply",
    "--allow-action", "metadata,leader-task,subagent",
    "--subagent-command", subagentScript,
  ]);
  assert(subagentOut.stdout.includes("idle_incomplete_leader_handoff"), "subagent test should exercise idle leader handoff");
  assert(subagentOut.stdout.includes("subagent:applied"), "matching idle reason should call subagent");
  assert(writes.slice(subagentBefore).some((item) => item[1] === `/api/issues/${parentId}/rerun`), "idle missing-facts state should rerun parent leader in aggressive mode");
  const subagentJournal = fs.readFileSync(path.join(subagentDir, "listener-journal.jsonl"), "utf8");
  assert(subagentJournal.includes('"event_type":"subagent:result"'), "subagent result should be journaled");
  assert(subagentJournal.includes("recommended_action") && subagentJournal.includes("continue"), "subagent output should be preserved");

  const degradedSubagentDir = path.join(tmp, "subagent-degraded");
  const degradedSubagentOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--template", template,
    "--state-dir", degradedSubagentDir,
    "--event-file", missingFactsFile,
    "--log-json",
    "--apply",
    "--allow-action", "subagent",
    "--subagent-command", degradedSubagentScript,
  ]);
  assert(degradedSubagentOut.stdout.includes("subagent:degraded"), "degraded subagent should not be reported as applied");
  const degradedSubagentJournal = fs.readFileSync(path.join(degradedSubagentDir, "listener-journal.jsonl"), "utf8");
  assert(degradedSubagentJournal.includes('"degraded":true'), "degraded subagent status should be journaled");

  const blockedLeaderBefore = writes.length;
  const blockedLeaderDir = path.join(tmp, "blocked-leader-task");
  const blockedLeaderOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--template", template,
    "--state-dir", blockedLeaderDir,
    "--event-file", blockedFile,
    "--log-json",
    "--apply",
    "--allow-action", "leader-task,metadata",
  ]);
  const blockedLeaderWrites = writes.slice(blockedLeaderBefore);
  assert(blockedLeaderOut.stdout.includes("idle_incomplete_leader_handoff"), "idle blocked issue should produce generic leader handoff classification");
  assert.deepStrictEqual(blockedLeaderWrites.map((item) => item[0]), ["PUT", "POST"], "blocked issue should write metadata before enqueueing leader task");
  assert(JSON.stringify(blockedLeaderWrites[0][2]).includes("idle_incomplete_leader_handoff"), "blocked issue metadata should include generic idle classification");
  assert.strictEqual(blockedLeaderWrites[1][1], `/api/issues/${parentId}/rerun`, "blocked issue handoff should rerun watched parent leader");
  const blockedNotifyJournal = fs.readFileSync(path.join(blockedLeaderDir, "lark-notify.jsonl"), "utf8");
  assert(blockedNotifyJournal.includes('"type":"human-block"'), "blocked issue should produce human-block notification record by default");
  assert(blockedNotifyJournal.includes("skipped_missing_target"), "default notification without target should be recorded as skipped");

  webhookWrites.length = 0;
  const blockedLarkDir = path.join(tmp, "blocked-webhook-send");
  await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--template", template,
    "--state-dir", blockedLarkDir,
    "--event-file", blockedFile,
    "--log-json",
    "--apply",
    "--allow-action", "metadata",
    "--lark-webhook-url", webhookUrl,
    "--lark-webhook-secret", webhookSecret,
  ]);
  assert.strictEqual(webhookWrites.length, 1, "human block should call webhook once");
  assert(webhookWrites[0].body.content.text.includes("需要人工决策"), "human block webhook should include blocker message");
  const blockedWebhookJournal = fs.readFileSync(path.join(blockedLarkDir, "lark-notify.jsonl"), "utf8");
  assert(blockedWebhookJournal.includes('"transport":"webhook"'), "webhook transport should be recorded");
  assert(!blockedWebhookJournal.includes(webhookSecret), "webhook secret must not be written to journal");

  webhookWrites.length = 0;
  await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--template", template,
    "--state-dir", path.join(tmp, "blocked-webhook-config-file"),
    "--event-file", blockedFile,
    "--log-json",
    "--apply",
    "--allow-action", "metadata",
  ], { LARK_NOTIFY_CONFIG: notifyConfigFile });
  assert.strictEqual(webhookWrites.length, 1, "webhook config file should be used by default");

  blockedHasActiveTask = true;
  const blockedActiveBefore = writes.length;
  const blockedActiveOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--template", template,
    "--state-dir", path.join(tmp, "blocked-leader-active-task"),
    "--event-file", blockedFile,
    "--log-json",
    "--apply",
    "--allow-action", "leader-task",
  ]);
  blockedHasActiveTask = false;
  assert.strictEqual(writes.length, blockedActiveBefore, "leader-task must not rerun when an active task already exists");
  assert(blockedActiveOut.stdout.includes("leader-task:active"), "active leader task should be reported");

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

  const parentDiagDir = path.join(tmp, "parent-diagnose-subagent");
  await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--state-dir", parentDiagDir,
    "--reconcile-only",
    "--apply",
    "--allow-action", "subagent",
    "--subagent-command", subagentScript,
  ]);
  const parentDiagJournal = fs.readFileSync(path.join(parentDiagDir, "listener-journal.jsonl"), "utf8");
  assert(parentDiagJournal.includes('"event_type":"subagent:result"'), "diagnostic subagent result should be journaled");
  assert(parentDiagJournal.includes("subagent:applied"), "unroutable parent snapshot should call subagent");

  const reconcileApplyBefore = writes.length;
  await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--state-dir", path.join(tmp, "reconcile-apply"),
    "--reconcile-only",
    "--apply",
    "--allow-action", "comment,metadata",
  ]);
  const reconcileWrites = writes.slice(reconcileApplyBefore);
  assert(reconcileWrites.length >= 1, "startup reconcile should push continuation metadata in apply mode");
  assert.deepStrictEqual(reconcileWrites.slice(0, 1).map((item) => item[0]), ["PUT"], "startup reconcile state guard should default to metadata-only");
  assert(reconcileWrites.some((item) => JSON.stringify(item[2]).includes("idle_incomplete_leader_handoff")), "startup push metadata must include generic idle classification");
  assert(reconcileWrites.some((item) => item[1] === `/api/issues/${parentId}/metadata/multica_sdlc.commit_sha` && item[2].value === "abc123"), "startup reconcile should copy unfinished child commit facts to the watched parent");

  parentChildrenContinuationStalled = true;
  const stalledBefore = writes.length;
  const stalledDir = path.join(tmp, "continuation-stalled");
  const stalledOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--state-dir", stalledDir,
    "--reconcile-only",
    "--expected-stage-order", "1A-2,1B,2A",
    "--log-json",
  ]);
  assert.strictEqual(writes.length, stalledBefore, "continuation stall must not write Multica comments, metadata, or leader tasks");
  assert(stalledOut.stdout.includes("codex_intervention_required"), "continuation stall should wake Codex");
  assert(stalledOut.stdout.includes("codex-wake:recorded"), "continuation stall should record wake result");
  const wakeJournal = fs.readFileSync(path.join(stalledDir, "codex-wake.jsonl"), "utf8");
  assert(wakeJournal.includes('"next_stage":"2A"'), "wake journal should identify the missing next stage");

  const stalledApplyBefore = writes.length;
  const stalledApplyDir = path.join(tmp, "continuation-stalled-apply");
  const stalledApplyOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--state-dir", stalledApplyDir,
    "--reconcile-only",
    "--apply",
    "--allow-action", "metadata,leader-task",
    "--expected-stage-order", "1A-2,1B,2A",
    "--log-json",
  ]);
  const stalledApplyWrites = writes.slice(stalledApplyBefore);
  assert(stalledApplyOut.stdout.includes("codex_intervention_required"), "continuation stall apply should still wake Codex");
  assert(stalledApplyOut.stdout.includes("leader-task:applied"), "continuation stall should rerun the parent leader when leader-task is allowed");
  assert(stalledApplyWrites.some((item) => item[0] === "POST" && item[1] === `/api/issues/${parentId}/rerun`), "continuation stall should rerun watched parent");
  assert(!stalledApplyWrites.some((item) => item[1].endsWith("/comments")), "continuation stall must not write issue comments");

  parentChildrenTitleInferred = true;
  const titleInferredBefore = writes.length;
  const titleInferredDir = path.join(tmp, "continuation-title-inferred");
  const titleInferredOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--state-dir", titleInferredDir,
    "--reconcile-only",
    "--apply",
    "--allow-action", "metadata,leader-task",
    "--expected-stage-order", "1A-2,1B,2A,2B,2C,2D,3A,3B/3C,4,5,6,7",
    "--log-json",
  ]);
  parentChildrenTitleInferred = false;
  const titleInferredWrites = writes.slice(titleInferredBefore);
  assert(titleInferredOut.stdout.includes("codex_intervention_required"), "title-inferred stage should trigger continuation stall instead of unstaged barrier");
  assert(titleInferredOut.stdout.includes("leader-task:applied"), "title-inferred continuation stall should rerun parent leader");
  assert(titleInferredWrites.some((item) => item[0] === "POST" && item[1] === `/api/issues/${parentId}/rerun`), "title-inferred continuation should rerun watched parent");
  const titleWakeJournal = fs.readFileSync(path.join(titleInferredDir, "codex-wake.jsonl"), "utf8");
  assert(titleWakeJournal.includes('"next_stage":"7"'), "title-inferred wake journal should identify Stage 7 as next");
  assert(!titleInferredOut.stdout.includes("unstaged_sibling_barrier"), "title-inferred stage must not be reported as unstaged barrier");

  const stalledDuplicateBefore = writes.length;
  await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--state-dir", stalledApplyDir,
    "--reconcile-only",
    "--apply",
    "--allow-action", "metadata,leader-task",
    "--expected-stage-order", "1A-2,1B,2A",
    "--log-json",
  ]);
  assert(!writes.slice(stalledDuplicateBefore).some((item) => item[0] === "POST" && item[1] === `/api/issues/${parentId}/rerun`), "continuation stall leader rerun should dedupe");

  parentHasActiveTask = true;
  const activeParentOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--state-dir", path.join(tmp, "continuation-active-parent"),
    "--reconcile-only",
    "--expected-stage-order", "1A-2,1B,2A",
    "--log-json",
  ]);
  parentHasActiveTask = false;
  assert(!activeParentOut.stdout.includes("codex_intervention_required"), "active parent task should suppress continuation stall wake");

  parentHasActiveTask = true;
  const activeParentApplyBefore = writes.length;
  const activeParentApplyOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--state-dir", path.join(tmp, "continuation-active-parent-apply"),
    "--reconcile-only",
    "--expected-stage-order", "1A-2,1B,2A",
    "--apply",
    "--allow-action", "metadata,leader-task",
    "--log-json",
  ]);
  parentHasActiveTask = false;
  assert(!activeParentApplyOut.stdout.includes("codex_intervention_required"), "active parent task should suppress continuation stall apply wake");
  assert(!writes.slice(activeParentApplyBefore).some((item) => item[0] === "POST" && item[1] === `/api/issues/${parentId}/rerun`), "active parent task must suppress continuation rerun");

  childHasActiveTask = true;
  const activeChildOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--state-dir", path.join(tmp, "continuation-active-child"),
    "--reconcile-only",
    "--expected-stage-order", "1A-2,1B,2A",
    "--log-json",
  ]);
  childHasActiveTask = false;
  parentChildrenContinuationStalled = false;
  assert(!activeChildOut.stdout.includes("codex_intervention_required"), "active child task should suppress continuation stall wake");

  webhookWrites.length = 0;
  parentChildrenAllComplete = true;
  const allCompleteDir = path.join(tmp, "all-complete-lark");
  const allCompleteBefore = writes.length;
  await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--state-dir", allCompleteDir,
    "--reconcile-only",
    "--expected-stage-order", "1A-2,1B",
    "--lark-webhook-url", webhookUrl,
    "--lark-webhook-secret", webhookSecret,
    "--log-json",
  ]);
  parentChildrenAllComplete = false;
  assert(!writes.slice(allCompleteBefore).some((item) => item[0] === "POST" && item[1] === `/api/issues/${parentId}/rerun`), "all in_review/done children should not rerun parent leader");
  const allCompleteNotifyJournal = fs.readFileSync(path.join(allCompleteDir, "lark-notify.jsonl"), "utf8");
  assert(allCompleteNotifyJournal.includes('"type":"all-complete"'), "all-complete audit should produce notification record");
  assert(webhookWrites.length >= 1, "all-complete notification should call webhook");
  assert(webhookWrites.some((item) => item.body.content.text.includes("全部任务已完成")), "all-complete webhook should include completion message");

  parentChildrenUnstaged = true;
  childHasActiveTask = true;
  const activeBarrierBefore = writes.length;
  const activeBarrierOut = await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--state-dir", path.join(tmp, "unstaged-barrier-active-child"),
    "--reconcile-only",
    "--apply",
    "--allow-action", "metadata,leader-task",
    "--log-json",
  ]);
  childHasActiveTask = false;
  parentChildrenUnstaged = false;
  assert(activeBarrierOut.stdout.includes("leader-task:active"), "active unstaged child task should suppress parent rerun");
  assert(!writes.slice(activeBarrierBefore).some((item) => item[0] === "POST" && item[1] === `/api/issues/${parentId}/rerun`), "active unstaged child task must suppress parent rerun");

  parentChildrenUnstaged = true;
  const barrierBefore = writes.length;
  await run([
    listener,
    "--api-url", apiUrl,
    "--workspace-slug", "sharp-cell",
    "--watch-parent", parentId,
    "--state-dir", path.join(tmp, "unstaged-barrier"),
    "--reconcile-only",
    "--apply",
    "--allow-action", "comment,leader-task,metadata",
  ]);
  parentChildrenUnstaged = false;
  const barrierWrites = writes.slice(barrierBefore);
  const barrierRerunIndex = barrierWrites.findIndex((item) => item[0] === "POST" && item[1] === `/api/issues/${parentId}/rerun`);
  assert(barrierWrites.length >= 1, "unstaged sibling idle state should write handoff metadata");
  assert(barrierRerunIndex > 0, "unstaged sibling idle state should write metadata before rerunning the parent");
  assert(barrierWrites.some((item) => item[1] === `/api/issues/${parentId}/metadata/multica_sdlc.commit_sha`), "unstaged sibling idle state should copy route child commit before rerun");
  assert(barrierWrites.some((item) => JSON.stringify(item[2]).includes("idle_incomplete_leader_handoff")), "barrier metadata should include idle handoff classification");

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
  webhook.close();
  api.close();
  console.log("listener self-test passed");
})().catch((error) => {
  webhook.close();
  api.close();
  console.error(error);
  process.exit(1);
});
NODE
