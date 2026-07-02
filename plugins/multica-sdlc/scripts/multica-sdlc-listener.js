#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const childProcess = require("child_process");
const os = require("os");
const router = require("./multica-next-role-router-core");

const PLUGIN_ROOT = path.resolve(__dirname, "..");
const DEFAULT_TEMPLATE = path.join(PLUGIN_ROOT, "templates", "multica-sdlc-workflow.yaml");
const DEFAULT_EVENT_TYPES = "issue:created,issue:updated,comment:created,pull_request:linked,pull_request:updated,task:completed,task:failed,task:message";
const ALLOWED_APPLY_ACTIONS = new Set(["comment", "metadata", "leader-task", "subagent"]);
const IMPLEMENTED_APPLY_ACTIONS = new Set(["comment", "leader-task", "metadata", "subagent"]);
const HUMAN_DECISION_TOKENS = ["HUMAN_DECISION_REQUIRED", "continue_without_user=false", "minimum_user_input"];
const NON_BLOCKING_CONTROL_TOKENS = [
  "OBSERVE_ONLY",
  "ROUTE_ONLY",
  "NOT_MY_GATE",
  "block_downstream=false",
  "control_plane_handoff",
  "continuity_snapshot",
  "continuity_handoff",
  "no active final decision lock",
];
const FINAL_LOCK_TOKENS = ["DECISION_REQUIRED", "block_downstream=true", "decision_lock_owner", "gate_round_id"];
const CONTROL_PLANE_AGENT_IDS = new Set([
  "1f080c7d-28df-4052-9908-1c5f578e67ae",
  "48334b8d-dc90-42bc-8e33-eb8418290a64",
  "3764e00d-2ca8-45d3-afaf-6152c5b9062a",
  "4a4e7389-ec0e-4961-bfa6-1eb1c968f7e1",
  "1b4392e6-4bf4-4e15-875c-285e1d3d7c01",
]);

function utcNow() {
  return new Date().toISOString();
}

function sha(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function redactText(value) {
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/(cookie\s*[:=]\s*)[^;\s]+/gi, "$1[REDACTED]")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED PRIVATE KEY]")
    .replace(/(api[_-]?key|token|secret|password)(['"]?\s*[:=]\s*['"]?)[^'"\s,}]+/gi, "$1$2[REDACTED]");
}

function redact(value) {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = /(token|secret|password|cookie|api[_-]?key|private[_-]?key)/i.test(key) ? "[REDACTED]" : redact(item);
    }
    return out;
  }
  return value;
}

function splitCsv(values) {
  const out = new Set();
  for (const value of values || []) {
    for (const item of String(value).split(",")) {
      const trimmed = item.trim();
      if (trimmed) out.add(trimmed);
    }
  }
  return out;
}

function asList(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    for (const key of ["items", "issues", "children", "pull_requests", "comments", "messages", "tasks"]) {
      if (Array.isArray(value[key])) return value[key];
    }
  }
  return [];
}

function unwrapIssue(value) {
  return value && typeof value.issue === "object" ? value.issue : (value && typeof value === "object" ? value : {});
}

function issueParentId(issue) {
  return String(issue.parent_id || issue.parent_issue_id || "");
}

function issueStatus(issue) {
  return String(issue.status || "").toLowerCase();
}

function isCompleteIssueStatus(status) {
  return ["in_review", "review", "done", "completed"].includes(String(status || "").toLowerCase());
}

function routeChildFactSortKey(item) {
  return [
    Number.isInteger(item && item.stage) ? item.stage : -1,
    Date.parse(item && item.updated_at || "") || 0,
    String(item && item.issue_id || ""),
  ];
}

function compareRouteChildFacts(a, b) {
  const left = routeChildFactSortKey(a);
  const right = routeChildFactSortKey(b);
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] === right[index]) continue;
    return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

function prStatus(pr) {
  if (!pr) return "";
  return String(pr.state || pr.status || (pr.pull_request && (pr.pull_request.state || pr.pull_request.status)) || "").toLowerCase();
}

function payloadComment(payload) {
  return payload && payload.comment && typeof payload.comment === "object" ? payload.comment : {};
}

function isListenerComment(payload) {
  const comment = payloadComment(payload);
  return typeof comment.content === "string" && comment.content.includes("[multica-sdlc-listener]");
}

function isListenerMetadataEvent(payload) {
  const text = JSON.stringify(payload || {});
  return text.includes("multica_listener.");
}

function nonEmptyString(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return text;
}

function normalizedStageLabel(value) {
  return nonEmptyString(value).toUpperCase().replace(/\s+/g, "");
}

function expectedStageIndex(value, expectedStageOrder) {
  const needle = normalizedStageLabel(value);
  if (!needle || !Array.isArray(expectedStageOrder) || !expectedStageOrder.length) return null;
  const index = expectedStageOrder.findIndex((item) => normalizedStageLabel(item) === needle);
  return index >= 0 ? index + 1 : null;
}

function stageTokenFromText(value) {
  const text = nonEmptyString(value);
  if (!text) return "";
  const match = text.match(/(?:^|[^A-Za-z0-9])(?:stage|阶段)\s*([0-9A-Za-z]+(?:[-/][0-9A-Za-z]+)?)(?:[^A-Za-z0-9]|$)/i);
  return match ? match[1] : "";
}

function childStageRaw(child) {
  if (!child) return "";
  for (const key of ["stage", "stage_index", "stage_number", "stage_key", "stage_label"]) {
    const value = nonEmptyString(child[key]);
    if (value) return value;
  }
  const metadata = child.metadata && typeof child.metadata === "object" ? child.metadata : {};
  for (const key of [
    "stage",
    "stage_index",
    "stage_number",
    "stage_key",
    "stage_label",
    "multica_sdlc.stage",
    "multica_sdlc.stage_index",
    "multica_sdlc.stage_number",
    "multica_sdlc.stage_key",
  ]) {
    const value = nonEmptyString(metadata[key]);
    if (value) return value;
  }
  for (const key of ["title", "name", "summary"]) {
    const token = stageTokenFromText(child[key]);
    if (token) return token;
  }
  return "";
}

function childStageMissing(child, expectedStageOrder = []) {
  return child && childStageIndex(child, expectedStageOrder) === null;
}

function childStageIndex(child, expectedStageOrder = []) {
  const raw = childStageRaw(child);
  if (!raw) return null;
  const expectedIndex = expectedStageIndex(raw, expectedStageOrder);
  if (expectedIndex) return expectedIndex;
  if (/^\d+$/.test(raw)) return Number(raw);
  const match = raw.match(/(?:^|[^0-9])(\d+)(?:[^0-9]|$)/);
  return match ? Number(match[1]) : null;
}

function parseStageOrder(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function issueIdOf(issue) {
  return issue && (issue.id || issue.issue_id) ? String(issue.id || issue.issue_id) : "";
}

function unstagedSiblingBarrier(children, expectedStageOrder = []) {
  return Array.isArray(children) && children.length > 1 && children.some((child) => childStageMissing(child, expectedStageOrder));
}

function lowerText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.toLowerCase();
  try {
    return JSON.stringify(value).toLowerCase();
  } catch {
    return String(value).toLowerCase();
  }
}

function includesAnyToken(text, tokens) {
  const lower = lowerText(text);
  return tokens.some((token) => lower.includes(String(token).toLowerCase()));
}

function parseContractAcceptedFacts(messages) {
  const facts = {};
  for (const item of messages || []) {
    if (!item || typeof item.content !== "string") continue;
    const content = item.content;
    if (!/\bCONTRACT_ACCEPTED\b/i.test(content)) continue;
    facts.phase ||= "contract";
    facts.source_role ||= "planner";
    facts.result ||= "CONTRACT_ACCEPTED";
    facts.artifact_type ||= "stage-contract";
    facts.contract_accepted = true;
    const pathMatch = content.match(/(?:Artifact:|Path:|contract_artifact_path[:：])\s*`?([^`\n]+?\.md)`?(?:\s|$)/i);
    if (pathMatch) facts.contract_artifact_path ||= pathMatch[1].trim();
    const shaMatch = content.match(/(?:SHA256|contract_sha256)[:：]?\s*`?([a-f0-9]{64})`?/i);
    if (shaMatch) facts.contract_sha256 ||= shaMatch[1];
    if (/Gate Registry Coordinator/i.test(content)) facts.next_owner ||= "SDLC GPT Gate Registry Coordinator";
    facts.completed_roles ||= {};
    facts.completed_roles.planner ||= {
      result: "CONTRACT_ACCEPTED",
      artifact_type: facts.artifact_type,
      artifact_path: facts.contract_artifact_path,
      sha256: facts.contract_sha256,
    };
  }
  return facts;
}

function parseImplementationDoneFacts(messages) {
  const facts = {};
  for (const item of messages || []) {
    if (!item || typeof item.content !== "string") continue;
    const content = item.content;
    const explicitDone = /\b(DONE|COMPLETE|COMPLETED)\b/i.test(content);
    const implementationDone = /\b(implemented|implementation\s+(?:complete|completed|done)|coding\s+(?:complete|completed|done))\b/i.test(content);
    const coderHint = /\b(coder|coding|implementation|implemented)\b/i.test(content);
    const commitMatch = content.match(/\b(?:commit|commit_sha|sha)\b\s*(?:[:：]|is|=)?\s*`?([a-f0-9]{7,40})`?/i);
    const commitSha = commitMatch ? commitMatch[1] : "";
    if (!commitSha || (!explicitDone && !implementationDone) || !coderHint) continue;
    facts.phase = "implementation";
    facts.source_role = "coder";
    facts.result = "DONE";
    facts.artifact_type = "commit";
    facts.commit_sha = commitSha;
    facts.implementation_done = true;
    facts.next_owner ||= "post-code review/runtime gate owners";
    facts.completed_roles ||= {};
    facts.completed_roles.coder = {
      result: "DONE",
      commit_sha: commitSha,
      artifact_type: "commit",
    };
  }
  return facts;
}

function controlPlaneMetadata(metadata) {
  const text = lowerText(metadata || {});
  const explicitNonBlocking = Boolean(
    metadata && typeof metadata === "object" && (
      Object.prototype.hasOwnProperty.call(metadata, "control_plane_handoff") ||
      includesAnyToken(metadata, NON_BLOCKING_CONTROL_TOKENS)
    )
  );
  const finalLock = includesAnyToken(text, FINAL_LOCK_TOKENS) && !text.includes("no active final decision lock");
  return {
    non_blocking: explicitNonBlocking && !finalLock,
    final_lock: finalLock,
  };
}

function activeTaskStatus(task) {
  return String(task && task.status || "").toLowerCase();
}

function activeTaskId(task) {
  return task && (task.id || task.task_id) ? String(task.id || task.task_id) : null;
}

function isActiveTask(task) {
  return ["queued", "dispatched", "running"].includes(activeTaskStatus(task));
}

function isControlPlaneTask(task) {
  if (!task || typeof task !== "object") return false;
  const agentId = String(task.agent_id || task.assignee_id || "");
  if (CONTROL_PLANE_AGENT_IDS.has(agentId)) return true;
  const text = lowerText({
    agent_name: task.agent_name || task.name || "",
    role: task.role || task.agent_role || "",
    trigger_summary: task.trigger_summary || "",
    kind: task.kind || "",
  });
  return /workflow router|workflow leader clean gate|gate registry|clean gate arbiter|control[- ]plane|supervisor/.test(text);
}

function isNonBlockingControlPlaneTask(task, metadata) {
  if (!isActiveTask(task)) return false;
  const control = controlPlaneMetadata(metadata || {});
  if (control.final_lock) return false;
  if (includesAnyToken(task, FINAL_LOCK_TOKENS) && !includesAnyToken(task, NON_BLOCKING_CONTROL_TOKENS)) return false;
  if (includesAnyToken(task, NON_BLOCKING_CONTROL_TOKENS)) return true;
  return control.non_blocking && isControlPlaneTask(task);
}

function mkdirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function appendJsonl(filePath, record) {
  mkdirFor(filePath);
  fs.closeSync(fs.openSync(filePath, "a", 0o600));
  fs.appendFileSync(filePath, `${JSON.stringify(redact(record))}\n`, "utf8");
}

function readJsonFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function writeJsonFile(filePath, record) {
  mkdirFor(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(redact(record), null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

function removeFileIfExists(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    if (error && error.code !== "ENOENT") throw error;
  }
}

function processAlive(pid) {
  if (!pid || !Number.isInteger(Number(pid))) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

function processCmdline(pid) {
  if (!pid || !Number.isInteger(Number(pid))) return "";
  try {
    return fs.readFileSync(`/proc/${Number(pid)}/cmdline`, "utf8").replace(/\0/g, " ").trim();
  } catch {
    return "";
  }
}

function sameList(left, right) {
  const a = [...(left || [])].map(String).sort();
  const b = [...(right || [])].map(String).sort();
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function loadJsonlDedupe(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return new Map();
  const records = new Map();
  for (const raw of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!raw.trim()) continue;
    try {
      const parsed = JSON.parse(raw);
      const key = parsed.apply_dedupe_key || parsed.dedupe_key;
      if (key) records.set(String(key), parsed);
    } catch {
      records.set(raw.trim(), {});
    }
  }
  return records;
}

function parseArgs(argv) {
  const homeDir = process.env.HOME || ".";
  const notifyConfigPath = process.env.LARK_NOTIFY_CONFIG || process.env.FEISHU_NOTIFY_CONFIG || path.join(homeDir, ".agents/multica-sdlc/lark-notify-config.json");
  const notifyConfig = readJsonFile(notifyConfigPath) || {};
  const args = {
    template: DEFAULT_TEMPLATE,
    journal: path.join(homeDir, ".agents/multica-sdlc/listener-journal.jsonl"),
    dedupeStore: path.join(homeDir, ".agents/multica-sdlc/listener-dedupe.jsonl"),
    tokenEnv: "MULTICA_TOKEN",
    dryRun: true,
    apply: false,
    eventTypes: DEFAULT_EVENT_TYPES,
    watchIssue: [],
    watchParent: [],
    metadataFilter: [],
    agentAllowlist: [],
    squadAllowlist: [],
    allowAction: [],
    eventFile: [],
    once: false,
    maxEvents: 0,
    maxReconnects: -1,
    reconnectDelay: 3000,
    dropLogEvery: 50,
    observeLogEvery: 50,
    listenerComments: false,
    stateGuardComments: false,
    expectedStageOrder: [],
    codexWakeJournal: path.join(homeDir, ".agents/multica-sdlc/codex-wake.jsonl"),
    ownerSessionId: process.env.CODEX_THREAD_ID || `pid:${process.pid}`,
    sessionLock: path.join(homeDir, ".agents/multica-sdlc/listener-owner-session.json"),
    sessionTakeoverSeconds: 180,
    sessionHeartbeatSeconds: 15,
    sessionKeepaliveSeconds: 1800,
    leaderTaskRetrySeconds: 300,
    subagentCommand: "",
    subagentReasons: ["blocked_unknown_fact", "missing_sdlc_facts", "idle_incomplete_leader_handoff", "unstaged_sibling_barrier", "stale_commit_or_pr", "leader_task_duplicate"],
    subagentTimeoutSeconds: 180,
    subagentMaxOutputBytes: 12000,
    ineffectiveRepairThreshold: 2,
    escalationCooldownSeconds: 300,
    larkCli: process.env.LARK_CLI || "lark-cli",
    larkWebhookUrl: process.env.LARK_WEBHOOK_URL || process.env.FEISHU_WEBHOOK_URL || notifyConfig.webhook_url || notifyConfig.url || "",
    larkWebhookSecret: process.env.LARK_WEBHOOK_SECRET || process.env.FEISHU_WEBHOOK_SECRET || notifyConfig.webhook_secret || notifyConfig.secret || "",
    larkNotify: true,
    larkNotifyChatId: process.env.LARK_NOTIFY_CHAT_ID || "",
    larkNotifyUserId: process.env.LARK_NOTIFY_USER_ID || "",
    larkNotifyOn: ["human-block", "all-complete", "child-complete"],
    larkNotifyJournal: path.join(homeDir, ".agents/multica-sdlc/lark-notify.jsonl"),
    logJson: false,
    reconcileOnly: false,
    exitIfNotOwner: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--ws-url") args.wsUrl = next();
    else if (arg === "--api-url") args.apiUrl = next();
    else if (arg === "--workspace-slug") args.workspaceSlug = next();
    else if (arg === "--workspace-id") args.workspaceId = next();
    else if (arg === "--template") args.template = next();
    else if (arg === "--journal") args.journal = next();
    else if (arg === "--dedupe-store") args.dedupeStore = next();
    else if (arg === "--token-env") args.tokenEnv = next();
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--apply") { args.apply = true; args.dryRun = false; }
    else if (arg === "--allow-action") args.allowAction.push(next());
    else if (arg === "--event-types") args.eventTypes = next();
    else if (arg === "--watch-issue") args.watchIssue.push(next());
    else if (arg === "--watch-parent") args.watchParent.push(next());
    else if (arg === "--metadata-filter") args.metadataFilter.push(next());
    else if (arg === "--agent-allowlist") args.agentAllowlist.push(next());
    else if (arg === "--squad-allowlist") args.squadAllowlist.push(next());
    else if (arg === "--once") args.once = true;
    else if (arg === "--max-events") args.maxEvents = Number(next());
    else if (arg === "--log-json") args.logJson = true;
    else if (arg === "--state-dir") args.stateDir = next();
    else if (arg === "--event-file") args.eventFile.push(next());
    else if (arg === "--reconcile-only") args.reconcileOnly = true;
    else if (arg === "--exit-if-not-owner") args.exitIfNotOwner = true;
    else if (arg === "--max-reconnects") args.maxReconnects = Number(next());
    else if (arg === "--reconnect-delay") args.reconnectDelay = Number(next()) * 1000;
    else if (arg === "--drop-log-every") args.dropLogEvery = Number(next());
    else if (arg === "--observe-log-every") args.observeLogEvery = Number(next());
    else if (arg === "--listener-comments") args.listenerComments = true;
    else if (arg === "--state-guard-comments") { args.listenerComments = true; args.stateGuardComments = true; }
    else if (arg === "--expected-stage-order") args.expectedStageOrder = parseStageOrder(next());
    else if (arg === "--codex-wake-journal") args.codexWakeJournal = next();
    else if (arg === "--owner-session-id") args.ownerSessionId = next();
    else if (arg === "--session-lock") args.sessionLock = next();
    else if (arg === "--session-takeover-seconds") args.sessionTakeoverSeconds = Number(next());
    else if (arg === "--session-heartbeat-seconds") args.sessionHeartbeatSeconds = Number(next());
    else if (arg === "--session-keepalive-seconds" || arg === "--keepalive-seconds") args.sessionKeepaliveSeconds = Number(next());
    else if (arg === "--lifecycle-log") args.lifecycleLog = next();
    else if (arg === "--leader-task-retry-seconds") args.leaderTaskRetrySeconds = Number(next());
    else if (arg === "--subagent-command") args.subagentCommand = next();
    else if (arg === "--subagent-on") args.subagentReasons = [...splitCsv([next()])];
    else if (arg === "--subagent-timeout") args.subagentTimeoutSeconds = Number(next());
    else if (arg === "--subagent-max-output-bytes") args.subagentMaxOutputBytes = Number(next());
    else if (arg === "--ineffective-repair-threshold") args.ineffectiveRepairThreshold = Number(next());
    else if (arg === "--escalation-cooldown-seconds") args.escalationCooldownSeconds = Number(next());
    else if (arg === "--lark-cli") args.larkCli = next();
    else if (arg === "--lark-webhook-url" || arg === "--feishu-webhook-url") args.larkWebhookUrl = next();
    else if (arg === "--lark-webhook-secret" || arg === "--feishu-webhook-secret") args.larkWebhookSecret = next();
    else if (arg === "--lark-notify") args.larkNotify = true;
    else if (arg === "--no-lark-notify") args.larkNotify = false;
    else if (arg === "--lark-notify-chat-id") args.larkNotifyChatId = next();
    else if (arg === "--lark-notify-user-id") args.larkNotifyUserId = next();
    else if (arg === "--lark-notify-on") args.larkNotifyOn = [...splitCsv([next()])];
    else if (arg === "--lark-notify-journal") args.larkNotifyJournal = next();
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (args.stateDir) {
    fs.mkdirSync(args.stateDir, { recursive: true });
    args.journal = path.join(args.stateDir, "listener-journal.jsonl");
    args.dedupeStore = path.join(args.stateDir, "listener-dedupe.jsonl");
    args.codexWakeJournal = path.join(args.stateDir, "codex-wake.jsonl");
    args.sessionLock = path.join(args.stateDir, "listener-owner-session.json");
    args.lifecycleLog ||= path.join(args.stateDir, "listener-lifecycle.jsonl");
    args.repairState = path.join(args.stateDir, "listener-repair-state.json");
    args.larkNotifyJournal = path.join(args.stateDir, "lark-notify.jsonl");
  }
  args.lifecycleLog ||= path.join(path.dirname(args.sessionLock), "listener-lifecycle.jsonl");
  args.repairState ||= path.join(path.dirname(args.dedupeStore), "listener-repair-state.json");
  return args;
}

function parseMetadataFilter(values) {
  const out = {};
  for (const raw of values || []) {
    if (raw.trim().startsWith("{")) Object.assign(out, JSON.parse(raw));
    else if (raw.includes("=")) {
      const [key, value] = raw.split("=", 2);
      out[key.trim()] = value.trim();
    } else {
      throw new Error("--metadata-filter must be JSON object or key=value");
    }
  }
  return out;
}

class ApiClient {
  constructor(baseUrl, token, workspace) {
    this.baseUrl = baseUrl ? baseUrl.replace(/\/$/, "") : "";
    this.token = token;
    this.workspace = workspace || {};
    this.writeCalls = 0;
  }

  async request(method, requestPath, body) {
    if (!this.baseUrl) throw new Error("api-url is required for hydration");
    const url = new URL(`${this.baseUrl}${requestPath}`);
    if (this.workspace.workspaceId && !url.searchParams.has("workspace_id")) {
      url.searchParams.set("workspace_id", this.workspace.workspaceId);
    }
    if (this.workspace.workspaceSlug && !url.searchParams.has("workspace_slug")) {
      url.searchParams.set("workspace_slug", this.workspace.workspaceSlug);
    }
    const headers = { Accept: "application/json" };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const options = { method, headers };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);
    const text = await response.text();
    if (!response.ok) throw new Error(`${method} ${requestPath} failed: ${response.status} ${redactText(text)}`);
    if (!["GET", "HEAD"].includes(method)) this.writeCalls += 1;
    return text ? JSON.parse(text) : {};
  }

  get(requestPath) { return this.request("GET", requestPath); }
  post(requestPath, body) { return this.request("POST", requestPath, body); }
  put(requestPath, body) { return this.request("PUT", requestPath, body); }
}

class Listener {
  constructor(args) {
    this.args = args;
    this.template = router.loadStructured(args.template);
    this.token = args.tokenEnv ? process.env[args.tokenEnv] : null;
    this.api = new ApiClient(args.apiUrl, this.token, {
      workspaceId: args.workspaceId,
      workspaceSlug: args.workspaceSlug,
    });
    this.eventTypes = splitCsv([args.eventTypes]);
    this.watchIssues = new Set(args.watchIssue);
    this.watchParents = new Set(args.watchParent);
    this.resolvedWatchIssues = new Set(this.watchIssues);
    this.resolvedWatchParents = new Set(this.watchParents);
    this.agentAllowlist = splitCsv(args.agentAllowlist);
    this.squadAllowlist = splitCsv(args.squadAllowlist);
    this.metadataFilter = parseMetadataFilter(args.metadataFilter);
    this.allowActions = splitCsv(args.allowAction);
    this.larkNotifyOn = new Set(args.larkNotifyOn || []);
    this.applyKeys = loadJsonlDedupe(args.dedupeStore);
    this.notifyKeys = loadJsonlDedupe(args.larkNotifyJournal);
    this.wakeKeys = loadJsonlDedupe(args.codexWakeJournal);
    this.repairState = readJsonFile(args.repairState) || { repairs: {} };
    this.dropCounts = new Map();
    this.observeCounts = new Map();
    this.seenEvents = 0;
    this.authenticatedOnce = false;
    this.ownerSessionId = String(args.ownerSessionId || `pid:${process.pid}`);
    this.ownerActive = false;
    this.ownerHeartbeat = null;
    this.keepaliveHeartbeat = null;
    this.releaseOnExit = false;
    this.validate();
  }

  validate() {
    if (this.args.apply && !this.allowActions.size) throw new Error("--apply requires --allow-action");
    for (const action of this.allowActions) {
      if (!ALLOWED_APPLY_ACTIONS.has(action)) throw new Error(`unsupported --allow-action: ${action}`);
    }
    if (!Number.isInteger(this.args.dropLogEvery) || this.args.dropLogEvery < 0) {
      throw new Error("--drop-log-every must be a non-negative integer");
    }
    if (!Number.isInteger(this.args.observeLogEvery) || this.args.observeLogEvery < 0) {
      throw new Error("--observe-log-every must be a non-negative integer");
    }
    if (!Number.isFinite(this.args.leaderTaskRetrySeconds) || this.args.leaderTaskRetrySeconds < 0) {
      throw new Error("--leader-task-retry-seconds must be a non-negative number");
    }
    if (!Number.isFinite(this.args.sessionTakeoverSeconds) || this.args.sessionTakeoverSeconds < 1) {
      throw new Error("--session-takeover-seconds must be a positive number");
    }
    if (!Number.isFinite(this.args.sessionHeartbeatSeconds) || this.args.sessionHeartbeatSeconds < 1) {
      throw new Error("--session-heartbeat-seconds must be a positive number");
    }
    if (!Number.isFinite(this.args.sessionKeepaliveSeconds) || this.args.sessionKeepaliveSeconds < 0) {
      throw new Error("--session-keepalive-seconds must be a non-negative number");
    }
    if (!Number.isFinite(this.args.subagentTimeoutSeconds) || this.args.subagentTimeoutSeconds < 1) {
      throw new Error("--subagent-timeout must be a positive number");
    }
    if (!Number.isFinite(this.args.subagentMaxOutputBytes) || this.args.subagentMaxOutputBytes < 1000) {
      throw new Error("--subagent-max-output-bytes must be at least 1000");
    }
    if (!Number.isFinite(this.args.ineffectiveRepairThreshold) || this.args.ineffectiveRepairThreshold < 1) {
      throw new Error("--ineffective-repair-threshold must be a positive number");
    }
    if (!Number.isFinite(this.args.escalationCooldownSeconds) || this.args.escalationCooldownSeconds < 0) {
      throw new Error("--escalation-cooldown-seconds must be a non-negative number");
    }
    if (this.args.larkNotify && !this.larkNotifyOn.size) {
      throw new Error("--lark-notify-on must contain at least one notification type when Lark notify is enabled");
    }
    for (const item of this.larkNotifyOn) {
      if (!["human-block", "all-complete", "child-complete"].includes(item)) throw new Error(`unsupported --lark-notify-on: ${item}`);
    }
    if (!this.watchIssues.size && !this.watchParents.size && !Object.keys(this.metadataFilter).length && !this.agentAllowlist.size && !this.squadAllowlist.size) {
      throw new Error("at least one watch filter is required");
    }
  }

  applyMode() {
    return this.args.apply ? "apply" : "dry-run";
  }

  lifecycle(eventType, extra = {}) {
    appendJsonl(this.args.lifecycleLog, {
      event_type: eventType,
      owner_session_id: this.ownerSessionId,
      pid: process.pid,
      workspace: this.args.workspaceSlug || this.args.workspaceId || null,
      watch_parent: [...this.watchParents].sort(),
      watch_issue: [...this.watchIssues].sort(),
      ...extra,
    });
  }

  ownerRecord(existing = null, reason = "heartbeat") {
    const sameOwner = existing && existing.owner_session_id === this.ownerSessionId && Number(existing.pid) === process.pid;
    const previousGeneration = Number(existing && existing.generation);
    const generation = sameOwner && Number.isFinite(previousGeneration)
      ? previousGeneration
      : (Number.isFinite(previousGeneration) ? previousGeneration + 1 : 1);
    return {
      owner_session_id: this.ownerSessionId,
      pid: process.pid,
      ppid: process.ppid,
      hostname: os.hostname(),
      heartbeat_at: utcNow(),
      started_at: sameOwner && existing.started_at ? existing.started_at : utcNow(),
      generation,
      launch_mode: process.env.MULTICA_GUARD_LAUNCH_MODE || "codex-pty",
      cmdline: processCmdline(process.pid) || process.argv.join(" "),
      state_dir: this.args.stateDir || path.dirname(this.args.sessionLock),
      workspace: this.args.workspaceSlug || this.args.workspaceId || null,
      watch_parent: [...this.watchParents].sort(),
      watch_issue: [...this.watchIssues].sort(),
      reason,
    };
  }

  lockOwnerMatchesScope(lock) {
    if (!lock) return false;
    if (lock.workspace !== undefined && lock.workspace !== (this.args.workspaceSlug || this.args.workspaceId || null)) return false;
    if (lock.watch_parent !== undefined && !sameList(lock.watch_parent || [], [...this.watchParents])) return false;
    if (lock.watch_issue !== undefined && !sameList(lock.watch_issue || [], [...this.watchIssues])) return false;
    return true;
  }

  lockPidIdentityLooksValid(lock) {
    if (!lock || !lock.pid) return false;
    const cmdline = processCmdline(lock.pid);
    if (!cmdline) return true;
    if (lock.cmdline && cmdline !== lock.cmdline) return false;
    return cmdline.includes("multica-sdlc-listener");
  }

  lockIsFresh(lock) {
    if (!lock || !lock.heartbeat_at) return false;
    const ageSeconds = (Date.now() - Date.parse(lock.heartbeat_at)) / 1000;
    if (!Number.isFinite(ageSeconds) || ageSeconds > this.args.sessionTakeoverSeconds) return false;
    if (lock.pid && !processAlive(lock.pid)) return false;
    if (lock.pid && !this.lockPidIdentityLooksValid(lock)) return false;
    if (!this.lockOwnerMatchesScope(lock)) return false;
    return true;
  }

  withSessionLock(callback) {
    const lockDir = `${this.args.sessionLock}.lock`;
    try {
      fs.mkdirSync(lockDir, { recursive: false, mode: 0o700 });
    } catch (error) {
      if (error && error.code === "EEXIST") {
        try {
          const stat = fs.statSync(lockDir);
          const ageSeconds = (Date.now() - stat.mtimeMs) / 1000;
          if (Number.isFinite(ageSeconds) && ageSeconds > 30) {
            fs.rmSync(lockDir, { recursive: true, force: true });
            fs.mkdirSync(lockDir, { recursive: false, mode: 0o700 });
          } else {
            this.lifecycle("lease_write_busy", { lock_dir: lockDir, age_seconds: ageSeconds });
            return false;
          }
        } catch {
          return false;
        }
      } else {
        throw error;
      }
    }
    try {
      return callback();
    } finally {
      fs.rmSync(lockDir, { recursive: true, force: true });
    }
  }

  claimOwner(reason) {
    return Boolean(this.withSessionLock(() => {
      const existing = readJsonFile(this.args.sessionLock);
      const sameOwner = existing && existing.owner_session_id === this.ownerSessionId && Number(existing.pid) === process.pid;
      const fresh = this.lockIsFresh(existing);
      if (!existing || sameOwner || !fresh) {
        const record = {
          ...this.ownerRecord(existing, reason),
          previous_owner_session_id: existing ? existing.owner_session_id || null : null,
          previous_pid: existing ? existing.pid || null : null,
        };
        writeJsonFile(this.args.sessionLock, record);
        if (!this.ownerActive) {
          this.log({ state: "owner_session_active", message: this.ownerSessionId });
          this.lifecycle(existing && !sameOwner ? "stale_owner_reclaimed" : "lease_acquired", {
            reason,
            previous_owner_session_id: existing ? existing.owner_session_id || null : null,
            previous_pid: existing ? existing.pid || null : null,
            previous_heartbeat_at: existing ? existing.heartbeat_at || null : null,
            generation: record.generation,
          });
        }
        this.ownerActive = true;
        this.releaseOnExit = true;
        return true;
      }
      this.ownerActive = false;
      this.lifecycle("lease_rejected", {
        reason,
        active_owner_session_id: existing.owner_session_id || null,
        active_pid: existing.pid || null,
        active_heartbeat_at: existing.heartbeat_at || null,
      });
      this.log({
        state: "owner_session_standby",
        message: `${this.ownerSessionId} waiting for ${existing.owner_session_id || "unknown-owner"}`,
      });
      return false;
    }));
  }

  startOwnerHeartbeat() {
    this.lifecycle("started", { launch_mode: process.env.MULTICA_GUARD_LAUNCH_MODE || "codex-pty" });
    this.claimOwner("startup");
    if (this.ownerHeartbeat) clearInterval(this.ownerHeartbeat);
    this.ownerHeartbeat = setInterval(() => {
      if (this.ownerActive) this.claimOwner("heartbeat");
    }, this.args.sessionHeartbeatSeconds * 1000);
    if (this.ownerHeartbeat.unref) this.ownerHeartbeat.unref();
    if (this.keepaliveHeartbeat) clearInterval(this.keepaliveHeartbeat);
    if (this.args.sessionKeepaliveSeconds > 0) {
      this.keepaliveHeartbeat = setInterval(() => {
        this.lifecycle("keepalive", { owner_active: this.ownerActive });
        this.log({ state: "keepalive", message: `pid=${process.pid} owner=${this.ownerSessionId}` });
      }, this.args.sessionKeepaliveSeconds * 1000);
      if (this.keepaliveHeartbeat.unref) this.keepaliveHeartbeat.unref();
    }
  }

  releaseOwner(reason) {
    if (this.ownerHeartbeat) clearInterval(this.ownerHeartbeat);
    if (this.keepaliveHeartbeat) clearInterval(this.keepaliveHeartbeat);
    this.ownerHeartbeat = null;
    this.keepaliveHeartbeat = null;
    this.lifecycle("release_requested", { reason, owner_active: this.ownerActive });
    this.withSessionLock(() => {
      const existing = readJsonFile(this.args.sessionLock);
      if (existing && existing.owner_session_id === this.ownerSessionId && Number(existing.pid) === process.pid) {
        removeFileIfExists(this.args.sessionLock);
        this.lifecycle("lease_released", { reason });
      }
      return true;
    });
    this.ownerActive = false;
  }

  ensureOwnerForApply() {
    if (!this.args.apply) return true;
    return this.claimOwner("apply");
  }

  isWatchedIssue(value) {
    return Boolean(value && (this.watchIssues.has(String(value)) || this.resolvedWatchIssues.has(String(value))));
  }

  isWatchedParent(value) {
    return Boolean(value && (this.watchParents.has(String(value)) || this.resolvedWatchParents.has(String(value))));
  }

  rememberResolvedWatch(snapshot) {
    const actualId = snapshot.issue && snapshot.issue.id ? String(snapshot.issue.id) : "";
    const publicId = snapshot.issueId ? String(snapshot.issueId) : "";
    if (!actualId) return;
    if (this.watchParents.has(publicId) || this.watchParents.has(actualId)) {
      this.resolvedWatchParents.add(actualId);
    }
    if (this.watchIssues.has(publicId) || this.watchIssues.has(actualId)) {
      this.resolvedWatchIssues.add(actualId);
    }
  }

  log(record) {
    const safe = redact({ ts: utcNow(), ...record });
    if (this.args.logJson) console.log(JSON.stringify(safe));
    else console.log(`${safe.ts} ${safe.status || safe.event_type || safe.state || "listener"} ${safe.message || safe.classification || safe.apply_result || ""}`.trim());
  }

  journal(record) {
    appendJsonl(this.args.journal, { ts: utcNow(), ...record });
  }

  saveRepairState() {
    writeJsonFile(this.args.repairState, this.repairState);
  }

  addWorkspaceParams(rawUrl) {
    const url = new URL(rawUrl);
    if (this.args.workspaceSlug) url.searchParams.set("workspace_slug", this.args.workspaceSlug);
    if (this.args.workspaceId) url.searchParams.set("workspace_id", this.args.workspaceId);
    url.searchParams.set("client_platform", url.searchParams.get("client_platform") || "codex");
    url.searchParams.set("client_version", url.searchParams.get("client_version") || "multica-sdlc-listener");
    return url.toString();
  }

  async run() {
    this.startOwnerHeartbeat();
    if (this.args.exitIfNotOwner && !this.ownerActive) {
      this.lifecycle("exit_not_owner");
      return 0;
    }
    try {
      if (this.args.reconcileOnly) {
        await this.reconcile("manual");
        return 0;
      }
      if (this.args.eventFile.length) {
        for (const file of this.args.eventFile) {
          await this.processFrame(JSON.parse(fs.readFileSync(file, "utf8")), "event-file");
        }
        return 0;
      }
      if (!this.args.wsUrl) throw new Error("--ws-url is required unless --event-file or --reconcile-only is used");
      if (typeof WebSocket === "undefined") throw new Error("Node runtime does not provide global WebSocket; use Node 22+ or a reviewed dependency wrapper");

      let reconnects = 0;
      while (true) {
        const code = await this.runWebSocketOnce();
        if (code === 0 || this.args.once) return code;
        reconnects += 1;
        if (this.args.maxReconnects >= 0 && reconnects > this.args.maxReconnects) return 2;
        await new Promise((resolve) => setTimeout(resolve, this.args.reconnectDelay));
      }
    } finally {
      this.releaseOwner("run_complete");
    }
  }

  runWebSocketOnce() {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (code) => {
        if (!settled) {
          settled = true;
          resolve(code);
        }
      };
      const ws = new WebSocket(this.addWorkspaceParams(this.args.wsUrl));
      ws.addEventListener("open", () => {
        this.log({ state: "connecting", message: this.args.wsUrl });
        this.lifecycle("websocket_open", { ws_url: this.args.wsUrl });
        if (this.token) ws.send(JSON.stringify({ type: "auth", payload: { token: this.token } }));
      });
      ws.addEventListener("message", async (event) => {
        try {
          let frame;
          try {
            frame = JSON.parse(String(event.data));
          } catch {
            this.recordDrop("malformed_frame", { raw: String(event.data).slice(0, 200) });
            return;
          }
          if (frame.type === "auth_ack") {
            this.log({ state: "authenticated", message: "auth_ack" });
            await this.reconcile(this.authenticatedOnce ? "reconnect" : "startup");
            this.authenticatedOnce = true;
            return;
          }
          if (frame.type === "auth_error" || frame.type === "error") {
            this.log({ state: "auth_error", message: "websocket authentication rejected" });
            ws.close();
            finish(2);
            return;
          }
          await this.processFrame(frame, "websocket");
          if (this.args.once || (this.args.maxEvents && this.seenEvents >= this.args.maxEvents)) {
            ws.close();
            finish(0);
          }
        } catch (error) {
          this.log({ state: "error", message: error.message });
          ws.close();
          finish(2);
        }
      });
      ws.addEventListener("close", () => {
        this.log({ state: "disconnected", message: "websocket closed" });
        this.lifecycle("websocket_close");
        finish(this.args.once ? 2 : 1);
      });
      ws.addEventListener("error", () => {
        this.log({ state: "disconnected", message: "websocket error" });
        this.lifecycle("websocket_error");
      });
    });
  }

  recordDrop(reason, extra = {}) {
    const journalRecord = { event_type: "drop", classification: reason, apply_mode: this.applyMode(), apply_result: "suppressed", ...extra };
    const key = [reason, extra.event_type || "unknown", extra.source || "unknown"].join("|");
    const count = (this.dropCounts.get(key) || 0) + 1;
    this.dropCounts.set(key, count);
    if (count === 1 || (this.args.dropLogEvery > 0 && count % this.args.dropLogEvery === 0)) {
      this.log({ status: "dropped", classification: reason, dropped_count: count, ...extra });
    }
    this.journal(journalRecord);
  }

  async processFrame(frame, source) {
    if (!frame || typeof frame !== "object" || typeof frame.type !== "string") {
      this.recordDrop("malformed_frame", { source });
      return;
    }
    const eventType = frame.type;
    if (!this.eventTypes.has(eventType)) {
      this.recordDrop("event_type_ignored", { event_type: eventType });
      return;
    }
    const payload = frame.payload && typeof frame.payload === "object" ? frame.payload : {};
    if ((eventType === "comment:created" && isListenerComment(payload)) ||
        (eventType === "issue_metadata:changed" && isListenerMetadataEvent(payload))) {
      this.recordDrop("self_generated_event", { event_type: eventType, source });
      return;
    }
    if (!this.preFilter(eventType, payload, frame)) {
      this.recordDrop("watch_filter_miss", { event_type: eventType, source });
      return;
    }
    this.seenEvents += 1;
    const normalized = await this.hydrateAndNormalize(eventType, payload);
    await this.decideAndApply(eventType, normalized);
  }

  preFilter(eventType, payload, frame) {
    const agentId = payload.agent_id || frame.actor_id;
    if (this.agentAllowlist.size && !this.agentAllowlist.has(String(agentId))) return false;
    const squadId = payload.squad_id || payload.assignee_id;
    if (this.squadAllowlist.size && !this.squadAllowlist.has(String(squadId))) return false;
    const metadata = payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {};
    if (Object.keys(this.metadataFilter).length && Object.entries(this.metadataFilter).every(([k, v]) => metadata[k] === v)) return true;
    const ids = this.extractIssueIds(payload);
    if (!ids.size) return Boolean(Object.keys(this.metadataFilter).length || this.agentAllowlist.size || this.squadAllowlist.size);
    if ([...ids].some((id) => this.isWatchedIssue(id) || this.isWatchedParent(id))) return true;
    if (!this.watchParents.size) return false;
    return !this.hasExplicitParentReference(payload);
  }

  extractIssueIds(payload) {
    const ids = new Set();
    for (const key of ["issue_id", "id", "parent_issue_id"]) if (payload[key]) ids.add(String(payload[key]));
    if (payload.issue && typeof payload.issue === "object") {
      for (const key of ["id", "issue_id", "parent_id", "parent_issue_id"]) {
        if (payload.issue[key]) ids.add(String(payload.issue[key]));
      }
    }
    if (payload.comment && typeof payload.comment === "object" && payload.comment.issue_id) {
      ids.add(String(payload.comment.issue_id));
    }
    if (payload.message && typeof payload.message === "object" && payload.message.issue_id) {
      ids.add(String(payload.message.issue_id));
    }
    if (payload.task_message && typeof payload.task_message === "object" && payload.task_message.issue_id) {
      ids.add(String(payload.task_message.issue_id));
    }
    if (Array.isArray(payload.linked_issue_ids)) for (const id of payload.linked_issue_ids) ids.add(String(id));
    if (payload.pull_request && typeof payload.pull_request === "object") {
      for (const key of ["issue_id", "parent_id", "parent_issue_id"]) if (payload.pull_request[key]) ids.add(String(payload.pull_request[key]));
    }
    return ids;
  }

  hasExplicitParentReference(payload) {
    if (payload.parent_issue_id || payload.parent_id) return true;
    if (payload.issue && typeof payload.issue === "object" && (payload.issue.parent_issue_id || payload.issue.parent_id)) return true;
    if (payload.pull_request && typeof payload.pull_request === "object" && (payload.pull_request.parent_issue_id || payload.pull_request.parent_id)) return true;
    return false;
  }

  primaryIssueId(payload) {
    for (const key of ["issue_id", "id"]) if (payload[key]) return String(payload[key]);
    if (payload.issue && typeof payload.issue === "object") {
      for (const key of ["id", "issue_id"]) if (payload.issue[key]) return String(payload.issue[key]);
    }
    if (payload.comment && typeof payload.comment === "object" && payload.comment.issue_id) return String(payload.comment.issue_id);
    if (payload.message && typeof payload.message === "object" && payload.message.issue_id) return String(payload.message.issue_id);
    if (payload.task_message && typeof payload.task_message === "object" && payload.task_message.issue_id) return String(payload.task_message.issue_id);
    if (Array.isArray(payload.linked_issue_ids) && payload.linked_issue_ids.length) return String(payload.linked_issue_ids[0]);
    if (payload.pull_request && typeof payload.pull_request === "object" && payload.pull_request.issue_id) return String(payload.pull_request.issue_id);
    return null;
  }

  chooseIssueId(payload) {
    const ids = this.extractIssueIds(payload);
    const primary = this.primaryIssueId(payload);
    if (primary && this.watchIssues.has(primary)) return primary;
    for (const id of ids) if (this.watchIssues.has(id)) return id;
    if (primary && [...ids].some((id) => this.watchParents.has(id))) return primary;
    for (const id of ids) if (this.watchParents.has(id)) return id;
    return primary || ids.values().next().value || null;
  }

  async hydrateAndNormalize(eventType, payload) {
    const issueId = this.chooseIssueId(payload);
    if (!issueId) return { classification: "blocked_unknown_fact", blocker: "missing_issue_id", router_event: {} };
    try {
      const snapshot = await this.hydrateIssueSnapshot(issueId, payload.task_id);
      const { issue, metadata, children, prs, facts, parentIssueId } = snapshot;
      const messages = await this.readTaskMessages(payload.task_id);
      const eventMessages = this.eventMessages(eventType, payload);
      const issueMatches = this.watchIssues.size && (this.isWatchedIssue(issueId) || this.isWatchedIssue(parentIssueId));
      const parentMatches = this.watchParents.size && (this.isWatchedParent(issueId) || this.isWatchedParent(parentIssueId));
      if ((this.watchIssues.size || this.watchParents.size) && !issueMatches && !parentMatches) {
        return { drop: true, classification: "watch_filter_miss", router_event: { issue_id: issueId, parent_issue_id: parentIssueId || null } };
      }
      Object.assign(facts, this.extractSdlcFacts({}, [...eventMessages, ...messages], prs), facts);
      const parentBarrier = await this.parentBarrier(parentIssueId);
      const continuationStall = await this.detectContinuationStall(snapshot, "event");
      const completionAudit = await this.detectCompletionAudit(snapshot, "event");
      const idleIncomplete = await this.detectIdleIncomplete(snapshot, "event");
      const routerEvent = {
        issue_id: issueId,
        parent_issue_id: parentIssueId || null,
        phase: facts.phase,
        source_role: facts.source_role,
        result: facts.result,
        commit_sha: facts.commit_sha,
        completed_roles: facts.completed_roles || {},
        contract_accepted: Boolean(facts.contract_accepted),
        implementation_done: Boolean(facts.implementation_done),
        contract_artifact_path: facts.contract_artifact_path || null,
        contract_sha256: facts.contract_sha256 || null,
        next_owner: facts.next_owner || null,
        review_wave_id: facts.review_wave_id || null,
        task_id: payload.task_id,
        source_run_id: payload.task_id || payload.run_id,
        comment_id: payload.comment_id,
        artifact_type: facts.artifact_type,
      };
      const stateClassification = parentBarrier ? "unstaged_sibling_barrier" : this.classify(eventType, issue, children, prs, facts);
      let classification = continuationStall ? "codex_intervention_required" : stateClassification;
      const missing = ["phase", "source_role", "result"].filter((key) => !routerEvent[key]);
      if (missing.length && !continuationStall) classification = "blocked_unknown_fact";
      const stateSnapshot = this.buildStateSnapshot(issue, children, prs, facts, parentBarrier, missing);
      const controlPlane = controlPlaneMetadata(metadata);
      return {
        event_type: eventType,
        classification,
        state_classification: continuationStall ? "continuation_stalled" : stateClassification,
        continuation_stall: continuationStall,
        completion_audit: completionAudit,
        idle_incomplete: idleIncomplete,
        parent_barrier: parentBarrier,
        missing_facts: continuationStall ? [] : missing,
        router_event: routerEvent,
        issue: { id: issueId, status: issue.status, parent_issue_id: parentIssueId || null },
        issue_status: issue.status || null,
        pr_states: prs.map(prStatus).filter(Boolean),
        children_count: children.length,
        pr_count: prs.length,
        control_plane_nonblocking: controlPlane.non_blocking,
        control_plane_final_lock: controlPlane.final_lock,
        state_snapshot: stateSnapshot,
        state_digest: this.stateDigest(stateSnapshot),
        source_event_id: String(payload.event_id || payload.task_id || payload.comment_id || payloadComment(payload).id || payload.message_id || payload.seq || ""),
      };
    } catch (error) {
      return { classification: "blocked_unknown_fact", blocker: error.message, router_event: { issue_id: issueId } };
    }
  }

  async hydrateIssueSnapshot(issueId, taskId) {
    const issue = unwrapIssue(await this.api.get(`/api/issues/${encodeURIComponent(issueId)}`));
    const metadata = await this.readMetadata(issueId, issue);
    const children = await this.enrichChildren(issueId, asList(await this.api.get(`/api/issues/${encodeURIComponent(issueId)}/children`)));
    const prs = asList(await this.api.get(`/api/issues/${encodeURIComponent(issueId)}/pull-requests`));
    const messages = [...await this.readTaskMessages(taskId), ...await this.readIssueComments(issueId)];
    const facts = this.extractSdlcFacts(metadata, messages, prs);
    return {
      issueId,
      issue,
      metadata,
      children,
      prs,
      facts,
      parentIssueId: issueParentId(issue),
    };
  }

  async normalizeSnapshot(snapshot, reason) {
    const { issueId, issue, metadata, children, prs, facts, parentIssueId } = snapshot;
    const stateClassification = this.classify("reconcile", issue, children, prs, facts);
    const continuationStall = await this.detectContinuationStall(snapshot, reason);
    const completionAudit = await this.detectCompletionAudit(snapshot, reason);
    const idleIncomplete = await this.detectIdleIncomplete(snapshot, reason);
    const routerEvent = {
      issue_id: issueId,
      parent_issue_id: parentIssueId || null,
      phase: facts.phase,
      source_role: facts.source_role,
      result: facts.result,
      commit_sha: facts.commit_sha,
      completed_roles: facts.completed_roles || {},
      contract_accepted: Boolean(facts.contract_accepted),
      implementation_done: Boolean(facts.implementation_done),
      contract_artifact_path: facts.contract_artifact_path || null,
      contract_sha256: facts.contract_sha256 || null,
      next_owner: facts.next_owner || null,
      review_wave_id: facts.review_wave_id || null,
      task_id: null,
      source_run_id: `reconcile:${reason}:${issueId}:${issueStatus(issue)}:${prs.map(prStatus).sort().join("|") || "no-pr"}`,
      comment_id: null,
      artifact_type: facts.artifact_type,
    };
    const missing = ["phase", "source_role", "result"].filter((key) => !routerEvent[key]);
    const parentBarrier = stateClassification === "unstaged_sibling_barrier" ? {
      children_count: children.length,
      unstaged_child_ids: children.filter((child) => childStageMissing(child, this.args.expectedStageOrder)).map((child) => String(child.id || child.issue_id || "")).filter(Boolean),
    } : null;
    const stateSnapshot = this.buildStateSnapshot(issue, children, prs, facts, parentBarrier, missing);
    const controlPlane = controlPlaneMetadata(metadata);
    return {
      classification: continuationStall ? "codex_intervention_required" : (missing.length ? "blocked_unknown_fact" : stateClassification),
      state_classification: continuationStall ? "continuation_stalled" : stateClassification,
      continuation_stall: continuationStall,
      completion_audit: completionAudit,
      idle_incomplete: idleIncomplete,
      parent_barrier: parentBarrier,
      missing_facts: continuationStall ? [] : missing,
      router_event: routerEvent,
      issue: { id: issueId, status: issue.status, parent_issue_id: parentIssueId || null },
      issue_status: issue.status || null,
      pr_states: prs.map(prStatus).filter(Boolean),
      children_count: children.length,
      pr_count: prs.length,
      control_plane_nonblocking: controlPlane.non_blocking,
      control_plane_final_lock: controlPlane.final_lock,
      state_snapshot: stateSnapshot,
      state_digest: this.stateDigest(stateSnapshot),
      source_event_id: routerEvent.source_run_id,
      reconcile_reason: reason,
    };
  }

  buildStateSnapshot(issue, children, prs, facts, parentBarrier, missingFacts) {
    return {
      issue_status: issueStatus(issue) || null,
      facts: {
        phase: facts.phase || null,
        source_role: facts.source_role || null,
        result: facts.result || null,
        commit_sha: facts.commit_sha || null,
        artifact_type: facts.artifact_type || null,
        contract_accepted: Boolean(facts.contract_accepted),
        implementation_done: Boolean(facts.implementation_done),
        contract_artifact_path: facts.contract_artifact_path || null,
        contract_sha256: facts.contract_sha256 || null,
        next_owner: facts.next_owner || null,
        review_wave_id: facts.review_wave_id || null,
      },
      missing_facts: [...(missingFacts || [])].sort(),
      children: (children || []).map((child) => ({
        id: issueIdOf(child),
        status: issueStatus(child) || null,
        stage: childStageMissing(child, this.args.expectedStageOrder) ? null : String(childStageIndex(child, this.args.expectedStageOrder)),
        stage_raw: childStageRaw(child) || null,
      })).sort((a, b) => a.id.localeCompare(b.id)),
      pr_states: (prs || []).map(prStatus).filter(Boolean).sort(),
      barrier: parentBarrier || null,
    };
  }

  stateDigest(snapshot) {
    return sha(stableJson(snapshot || {}));
  }

  async readMetadata(issueId, issue) {
    const existing = issue.metadata && typeof issue.metadata === "object" ? issue.metadata : {};
    try {
      const response = await this.api.get(`/api/issues/${encodeURIComponent(issueId)}/metadata`);
      return response.metadata && typeof response.metadata === "object" ? response.metadata : existing;
    } catch {
      return existing;
    }
  }

  async readTaskMessages(taskId) {
    if (!taskId) return [];
    try {
      return asList(await this.api.get(`/api/tasks/${encodeURIComponent(String(taskId))}/messages`));
    } catch {
      return [];
    }
  }

  async readIssueComments(issueId) {
    if (!issueId) return [];
    try {
      return asList(await this.api.get(`/api/issues/${encodeURIComponent(String(issueId))}/comments`));
    } catch {
      return [];
    }
  }

  eventMessages(eventType, payload) {
    if (eventType === "comment:created") {
      const comment = payloadComment(payload);
      return comment.content ? [{ content: String(comment.content) }] : [];
    }
    if (eventType === "task:message") {
      const messages = [];
      if (payload.content) messages.push({ content: String(payload.content) });
      if (typeof payload.message === "string") messages.push({ content: payload.message });
      if (payload.message && typeof payload.message === "object" && payload.message.content) messages.push(payload.message);
      if (payload.task_message && typeof payload.task_message === "object" && payload.task_message.content) messages.push(payload.task_message);
      return messages;
    }
    return [];
  }

  async readChildren(issueId) {
    if (!issueId) return [];
    try {
      return asList(await this.api.get(`/api/issues/${encodeURIComponent(issueId)}/children`));
    } catch {
      return [];
    }
  }

  async enrichChildren(parentIssueId, children) {
    if (!this.args.expectedStageOrder.length || !Array.isArray(children) || !children.length) return children || [];
    const enriched = [];
    for (const child of children) {
      const childId = issueIdOf(child);
      if (!childId || childStageRaw(child)) {
        enriched.push(child);
        continue;
      }
      try {
        const detail = unwrapIssue(await this.api.get(`/api/issues/${encodeURIComponent(childId)}`));
        enriched.push({
          ...detail,
          ...child,
          title: child.title || detail.title,
          name: child.name || detail.name,
          metadata: child.metadata || detail.metadata,
        });
      } catch {
        enriched.push(child);
      }
    }
    return enriched;
  }

  async parentBarrier(parentIssueId) {
    if (!parentIssueId || !this.isWatchedParent(parentIssueId)) return null;
    const children = await this.enrichChildren(parentIssueId, await this.readChildren(parentIssueId));
    if (!unstagedSiblingBarrier(children, this.args.expectedStageOrder)) return null;
    return {
      children_count: children.length,
      unstaged_child_ids: children.filter((child) => childStageMissing(child, this.args.expectedStageOrder)).map((child) => String(child.id || child.issue_id || "")).filter(Boolean),
    };
  }

  async readActiveTasks(issueId) {
    if (!issueId) return [];
    try {
      return asList(await this.api.get(`/api/issues/${encodeURIComponent(issueId)}/active-task`));
    } catch {
      return [];
    }
  }

  async readIssueMetadataForActiveTasks(issueId) {
    if (!issueId) return {};
    try {
      const issue = unwrapIssue(await this.api.get(`/api/issues/${encodeURIComponent(issueId)}`));
      return await this.readMetadata(issueId, issue);
    } catch {
      return {};
    }
  }

  blockingActiveTasks(tasks, metadata) {
    return (tasks || [])
      .filter(isActiveTask)
      .filter((task) => !isNonBlockingControlPlaneTask(task, metadata));
  }

  async readAnyActiveTasks(issueId) {
    const active = await this.readActiveTasks(issueId);
    return (active || []).filter(isActiveTask);
  }

  async readBlockingActiveTasks(issueId, metadata = null) {
    const active = await this.readActiveTasks(issueId);
    const issueMetadata = metadata || await this.readIssueMetadataForActiveTasks(issueId);
    return this.blockingActiveTasks(active, issueMetadata);
  }

  async detectContinuationStall(snapshot, reason) {
    if (!this.args.expectedStageOrder.length) return null;
    const issueId = String(snapshot.issueId || "");
    const actualId = issueIdOf(snapshot.issue);
    if (!this.isWatchedParent(issueId) && !this.isWatchedParent(actualId)) return null;
    const parentStatus = issueStatus(snapshot.issue);
    if (["blocked", "done", "cancelled"].includes(parentStatus)) return null;
    const children = Array.isArray(snapshot.children) ? snapshot.children : [];
    if (!children.length || unstagedSiblingBarrier(children, this.args.expectedStageOrder)) return null;
    const stages = children.map((child) => childStageIndex(child, this.args.expectedStageOrder)).filter((value) => Number.isInteger(value) && value > 0);
    if (!stages.length) return null;
    const maxStage = Math.max(...stages);
    if (maxStage >= this.args.expectedStageOrder.length) return null;

    const childStatuses = children.map((child) => issueStatus(child)).filter(Boolean);
    if (childStatuses.some((status) => !isCompleteIssueStatus(status))) return null;

    const issueIds = [actualId || issueId, ...children.map(issueIdOf)].filter(Boolean);
    const metadataByIssueId = new Map();
    metadataByIssueId.set(actualId || issueId, snapshot.metadata || {});
    for (const child of children) {
      const childId = issueIdOf(child);
      if (childId) metadataByIssueId.set(childId, child.metadata && typeof child.metadata === "object" ? child.metadata : {});
    }
    const activeTasks = [];
    for (const id of new Set(issueIds)) {
      for (const task of await this.readAnyActiveTasks(id)) {
        activeTasks.push({ issue_id: id, task_id: activeTaskId(task), status: activeTaskStatus(task) });
      }
    }
    if (activeTasks.length) return null;

    const nextStage = this.args.expectedStageOrder[maxStage];
    const dedupeFields = {
      workspace: this.args.workspaceSlug || this.args.workspaceId || "unknown-workspace",
      parent_issue_id: actualId || issueId,
      max_stage: String(maxStage),
      next_stage: nextStage,
      children: children.map((child) => `${issueIdOf(child)}:${childStageIndex(child, this.args.expectedStageOrder) || "?"}:${issueStatus(child) || "unknown"}`).sort().join("|"),
    };
    return {
      reason,
      max_stage: maxStage,
      next_stage: nextStage,
      expected_stage_order: this.args.expectedStageOrder,
      active_tasks: [],
      child_statuses: childStatuses,
      child_count: children.length,
      dedupe_key: sha(JSON.stringify(dedupeFields, Object.keys(dedupeFields).sort())),
      dedupe_fields: dedupeFields,
    };
  }

  async detectCompletionAudit(snapshot, reason) {
    if (!this.args.expectedStageOrder.length) return null;
    const issueId = String(snapshot.issueId || "");
    const actualId = issueIdOf(snapshot.issue);
    if (!this.isWatchedParent(issueId) && !this.isWatchedParent(actualId)) return null;
    const children = Array.isArray(snapshot.children) ? snapshot.children : [];
    if (!children.length) return null;
    const stages = children.map((child) => childStageIndex(child, this.args.expectedStageOrder)).filter((value) => Number.isInteger(value) && value > 0);
    const uniqueStages = new Set(stages);
    const missingStages = [];
    for (let index = 1; index <= this.args.expectedStageOrder.length; index += 1) {
      if (!uniqueStages.has(index)) missingStages.push(this.args.expectedStageOrder[index - 1] || String(index));
    }
    const issueIds = [actualId || issueId, ...children.map(issueIdOf)].filter(Boolean);
    const activeTasks = [];
    for (const id of new Set(issueIds)) {
      for (const task of await this.readAnyActiveTasks(id)) {
        activeTasks.push({ issue_id: id, task_id: activeTaskId(task), status: activeTaskStatus(task) });
      }
    }
    const blockingChildren = children
      .map((child) => ({ id: issueIdOf(child), status: issueStatus(child), stage: childStageIndex(child, this.args.expectedStageOrder) }))
      .filter((child) => !isCompleteIssueStatus(child.status));
    const complete = !missingStages.length && !activeTasks.length && !blockingChildren.length;
    if (!complete) return null;
    const fields = {
      workspace: this.args.workspaceSlug || this.args.workspaceId || "unknown-workspace",
      parent_issue_id: actualId || issueId,
      expected_stage_order: this.args.expectedStageOrder.join("|"),
      children: children.map((child) => `${issueIdOf(child)}:${childStageIndex(child, this.args.expectedStageOrder) || "?"}:${issueStatus(child) || "unknown"}`).sort().join("|"),
    };
    return {
      result: "ALL_COMPLETE",
      reason,
      parent_issue_id: actualId || issueId,
      expected_stage_order: this.args.expectedStageOrder,
      child_count: children.length,
      missing_stages: missingStages,
      active_tasks: activeTasks,
      blocking_children: blockingChildren,
      dedupe_key: sha(stableJson(fields)),
      dedupe_fields: fields,
    };
  }

  async detectIdleIncomplete(snapshot, reason) {
    const issueId = String(snapshot.issueId || "");
    const actualId = issueIdOf(snapshot.issue) || issueId;
    const parentIssueId = issueParentId(snapshot.issue);
    const parentWatched = this.isWatchedParent(actualId) || this.isWatchedParent(issueId);
    const childUnderWatchedParent = Boolean(parentIssueId && this.isWatchedParent(parentIssueId));
    if (!parentWatched && !childUnderWatchedParent) return null;

    const currentStatus = issueStatus(snapshot.issue);
    if (isCompleteIssueStatus(currentStatus) || currentStatus === "cancelled") return null;

    const children = Array.isArray(snapshot.children) ? snapshot.children : [];
    if (parentWatched && children.length && children.every((child) => isCompleteIssueStatus(issueStatus(child)))) {
      return null;
    }
    const issueIds = new Set();
    issueIds.add(actualId);
    if (childUnderWatchedParent) issueIds.add(parentIssueId);
    if (parentWatched) {
      for (const child of children) {
        const childId = issueIdOf(child);
        if (childId) issueIds.add(childId);
      }
    }

    const activeTasks = [];
    for (const id of issueIds) {
      for (const task of await this.readAnyActiveTasks(id)) {
        activeTasks.push({ issue_id: id, task_id: activeTaskId(task), status: activeTaskStatus(task) });
      }
    }
    if (activeTasks.length) return null;

    const childStates = children
      .map((child) => ({ id: issueIdOf(child), status: issueStatus(child), stage: childStageIndex(child, this.args.expectedStageOrder) }))
      .filter((child) => child.id);
    const routeChild = parentWatched ? await this.routeChildFactsForIdle(children) : null;
    const dedupeFields = {
      workspace: this.args.workspaceSlug || this.args.workspaceId || "unknown-workspace",
      issue_id: actualId || issueId || "unknown-issue",
      parent_issue_id: parentIssueId || (parentWatched ? actualId || issueId : "no-parent"),
      status: currentStatus || "unknown-status",
      phase: snapshot.facts && snapshot.facts.phase || "unknown-phase",
      result: snapshot.facts && snapshot.facts.result || "unknown-result",
      next_owner: snapshot.facts && snapshot.facts.next_owner || "unknown-next-owner",
      children: childStates.map((child) => `${child.id}:${child.stage || "?"}:${child.status || "unknown"}`).sort().join("|"),
      route_child_issue_id: routeChild && routeChild.issue_id || "",
      route_child_commit_sha: routeChild && routeChild.commit_sha || "",
      route_child_review_wave_id: routeChild && routeChild.review_wave_id || "",
    };
    return {
      reason,
      issue_id: actualId || issueId,
      parent_issue_id: parentIssueId || (parentWatched ? actualId || issueId : null),
      issue_status: currentStatus || null,
      phase: snapshot.facts && snapshot.facts.phase || null,
      result: snapshot.facts && snapshot.facts.result || null,
      next_owner: snapshot.facts && snapshot.facts.next_owner || null,
      active_tasks: [],
      child_states: childStates,
      route_child: routeChild,
      dedupe_key: sha(stableJson(dedupeFields)),
      dedupe_fields: dedupeFields,
    };
  }

  routeChildFactsFromChild(child, metadata = null) {
    const childId = issueIdOf(child);
    if (!childId) return null;
    const childMetadata = metadata && typeof metadata === "object"
      ? metadata
      : child.metadata && typeof child.metadata === "object" ? child.metadata : {};
    const facts = this.extractSdlcFacts(childMetadata, [], []);
    const completedRoles = facts.completed_roles && typeof facts.completed_roles === "object" ? facts.completed_roles : {};
    const coderRole = completedRoles.coder && typeof completedRoles.coder === "object" ? completedRoles.coder : {};
    const commitSha = facts.commit_sha || coderRole.commit_sha;
    if (!commitSha) return null;
    return {
      issue_id: childId,
      status: issueStatus(child) || null,
      stage: childStageIndex(child, this.args.expectedStageOrder),
      stage_raw: childStageRaw(child) || null,
      phase: facts.phase || "implementation",
      source_role: facts.source_role || "coder",
      result: facts.result || "DONE",
      artifact_type: facts.artifact_type || "commit",
      commit_sha: commitSha,
      completed_roles: {
        ...completedRoles,
        coder: {
          result: coderRole.result || "DONE",
          commit_sha: commitSha,
          artifact_type: coderRole.artifact_type || "commit",
        },
      },
      next_owner: facts.next_owner || "post-code review/runtime gate owners",
      review_wave_id: facts.review_wave_id || null,
      blocked_reason: childMetadata.blocked_reason || childMetadata["multica_sdlc.blocked_reason"] || null,
      waiting_on: childMetadata.waiting_on || childMetadata["multica_sdlc.waiting_on"] || null,
      updated_at: child.updated_at || child.updatedAt || child.updated || null,
    };
  }

  async routeChildFactsForIdle(children) {
    const candidates = [];
    for (const child of children || []) {
      if (isCompleteIssueStatus(issueStatus(child))) continue;
      const childId = issueIdOf(child);
      if (!childId) continue;
      const existingMetadata = child.metadata && typeof child.metadata === "object" ? child.metadata : null;
      const metadata = existingMetadata && Object.keys(existingMetadata).length
        ? existingMetadata
        : await this.readMetadata(childId, child);
      const routeChild = this.routeChildFactsFromChild(child, metadata);
      if (routeChild) candidates.push(routeChild);
    }
    return candidates.sort(compareRouteChildFacts).pop() || null;
  }

  extractSdlcFacts(metadata, messages, prs) {
    const facts = {};
    const map = {
      "multica_sdlc.phase": "phase",
      "multica_sdlc.source_role": "source_role",
      "multica_sdlc.result": "result",
      "multica_sdlc.commit_sha": "commit_sha",
      "multica_sdlc.artifact_type": "artifact_type",
      "multica_sdlc.next_owner": "next_owner",
      "multica_sdlc.review_wave_id": "review_wave_id",
    };
    for (const [key, outKey] of Object.entries(map)) if (metadata[key] !== undefined) facts[outKey] = metadata[key];
    if (metadata["multica_sdlc.completed_roles"] !== undefined) facts.completed_roles = this.parseCompletedRoles(metadata["multica_sdlc.completed_roles"]);
    const implementationFacts = {};
    for (const item of messages) {
      if (!item || typeof item.content !== "string" || !item.content.includes("multica_sdlc")) continue;
      const match = item.content.match(/\{[\s\S]*\}/);
      if (!match) continue;
      try {
        const parsed = JSON.parse(match[0]);
        const payload = parsed.multica_sdlc || parsed;
        facts.phase ||= payload.phase;
        facts.source_role ||= payload.source_role || payload.role;
        facts.result ||= payload.result || payload.status;
        facts.commit_sha ||= payload.commit_sha;
        facts.completed_roles ||= payload.completed_roles;
        facts.next_owner ||= payload.next_owner;
        facts.review_wave_id ||= payload.review_wave_id;
        const role = payload.source_role || payload.role;
        const result = String(payload.result || payload.status || "").toUpperCase();
        if (role && /^coder$/i.test(String(role)) && result === "DONE" && payload.commit_sha) {
          Object.assign(implementationFacts, {
            phase: "implementation",
            source_role: "coder",
            result: "DONE",
            artifact_type: "commit",
            commit_sha: payload.commit_sha,
            implementation_done: true,
            next_owner: payload.next_owner || "post-code review/runtime gate owners",
            completed_roles: {
              ...(implementationFacts.completed_roles || {}),
              coder: {
                result: "DONE",
                commit_sha: payload.commit_sha,
                artifact_type: "commit",
              },
            },
          });
        }
      } catch {
        continue;
      }
    }
    Object.assign(facts, parseContractAcceptedFacts(messages));
    Object.assign(facts, parseImplementationDoneFacts(messages));
    Object.assign(facts, implementationFacts);
    if (!facts.commit_sha) {
      for (const pr of prs) {
        facts.commit_sha = pr && (pr.head_sha || pr.commit_sha || (pr.pull_request && pr.pull_request.head_sha));
        if (facts.commit_sha) break;
      }
    }
    facts.completed_roles ||= {};
    return facts;
  }

  parseCompletedRoles(value) {
    if (value && typeof value === "object") return value;
    if (typeof value === "string") {
      try { return JSON.parse(value); } catch { return {}; }
    }
    return {};
  }

  classify(eventType, issue, children, prs, facts) {
    const status = issueStatus(issue);
    const prStates = new Set(prs.filter(Boolean).map(prStatus));
    if (status === "blocked") return "blocked_issue_leader_decision";
    if (status === "done" || status === "cancelled") return "terminal_child_barrier";
    if (unstagedSiblingBarrier(children, this.args.expectedStageOrder)) return "unstaged_sibling_barrier";
    if (status === "in_review" || prStates.has("draft") || eventType.startsWith("pull_request:")) return "nonterminal_leader_gate";
    if (facts.commit_sha && prStates.size && !prStates.has("open") && !prStates.has("draft")) return "stale_commit_or_pr";
    return "missing_required_role";
  }

  shouldPushFromState(normalized) {
    const event = normalized.router_event || {};
    const classification = normalized.state_classification || normalized.classification;
    const parentIssueId = event.parent_issue_id;
    const issueId = event.issue_id;
    if (["blocked_issue_leader_decision", "nonterminal_leader_gate", "terminal_child_barrier", "stale_commit_or_pr"].includes(classification)) {
      return Boolean(parentIssueId && this.isWatchedParent(parentIssueId));
    }
    if (classification === "unstaged_sibling_barrier") {
      return Boolean(this.isWatchedParent(issueId) || (parentIssueId && this.isWatchedParent(parentIssueId) && normalized.parent_barrier));
    }
    return false;
  }

  buildMissingFactsDecision(normalized) {
    const eventType = normalized.event_type || "";
    if (!["reconcile", "comment:created", "task:completed", "task:failed"].includes(eventType)) return null;
    const event = normalized.router_event || {};
    if (!event.parent_issue_id) return null;
    const dedupeFields = {
      workspace: this.args.workspaceSlug || this.args.workspaceId || "unknown-workspace",
      issue_id: event.issue_id || "unknown-issue",
      parent_issue_id: event.parent_issue_id || "no-parent",
      missing_facts: (normalized.missing_facts || []).join("|"),
    };
    return {
      action: "warn",
      next_phase: "sdlc-fact-repair",
      next_roles: ["leader"],
      leader_required: true,
      reason_code: "missing_sdlc_facts",
      reason: "Watched Multica child event entered scope but lacked multica_sdlc.phase/source_role/result; guard asks the leader or child owner to add structured SDLC facts before routing.",
      facts: {
        issue_status: normalized.issue_status || null,
        parent_issue_id: event.parent_issue_id || null,
        missing_facts: normalized.missing_facts || [],
        event_type: eventType,
      },
      decision_source: "state_guard",
      dedupe_key: sha(JSON.stringify(dedupeFields, Object.keys(dedupeFields).sort())),
      dedupe_fields: dedupeFields,
    };
  }

  buildGuardDecision(normalized) {
    if (!this.shouldPushFromState(normalized)) return null;
    const event = normalized.router_event || {};
    const classification = normalized.state_classification || normalized.classification;
    const barrier = classification === "unstaged_sibling_barrier";
    const terminalChildBarrier = classification === "terminal_child_barrier";
    if (barrier && !["reconcile", "issue:created"].includes(normalized.event_type || "")) return null;
    const stateLevelSource = ["blocked_issue_leader_decision", "nonterminal_leader_gate", "terminal_child_barrier", "stale_commit_or_pr", "unstaged_sibling_barrier"].includes(classification);
    const dedupeFields = {
      workspace: this.args.workspaceSlug || this.args.workspaceId || "unknown-workspace",
      issue_id: event.issue_id || "unknown-issue",
      parent_issue_id: event.parent_issue_id || "no-parent",
      issue_status: normalized.issue_status || "unknown-status",
      pr_states: (normalized.pr_states || []).join("|") || "no-pr",
      classification,
      unstaged_child_ids: normalized.parent_barrier ? (normalized.parent_barrier.unstaged_child_ids || []).join("|") : "",
      source_event: stateLevelSource ? "state_guard" : (normalized.source_event_id || "startup-snapshot"),
    };
    return {
      action: barrier ? "warn" : "dispatch",
      next_phase: classification === "blocked_issue_leader_decision" ? "blocker-triage" : (barrier ? "stage-repair" : (terminalChildBarrier ? "parent-route-only-continuation" : "leader-continuation")),
      next_roles: ["leader"],
      leader_required: true,
      reason_code: classification,
      reason: barrier
        ? "Watched parent has multiple child issues with missing stage; terminal-child wake may be blocked until the leader sets sibling stages or avoids relying on terminal-child wake."
        : classification === "blocked_issue_leader_decision"
          ? "Watched child issue is blocked; guard escalates to the issue leader/assignee for an explicit blocker disposition or repair plan."
        : terminalChildBarrier
          ? "A child reached a terminal state, so the parent router should observe and route the next owner only. This is not a final review; if downstream child work remains active, the parent must stay or return to in_progress and must not be moved to in_review."
        : "Current Multica issue state already requires parent leader visibility; guard pushes a bounded continuation signal instead of waiting for a future event.",
      facts: {
        issue_status: normalized.issue_status || null,
        parent_issue_id: event.parent_issue_id || null,
        pr_states: normalized.pr_states || [],
        missing_facts: normalized.missing_facts || [],
        barrier: normalized.parent_barrier || null,
        status_guard: terminalChildBarrier ? {
          routine_control_plane: true,
          classification: "ROUTE_ONLY",
          block_downstream: false,
          forbid_parent_in_review: true,
          required_parent_status_while_child_active: "in_progress",
          allowed_in_review_only_with: "DECISION_REQUIRED or DECISION_COMPLETE final review / PR-ready / clean-gate / closure lock",
        } : null,
      },
      decision_source: "state_guard",
      dedupe_key: sha(JSON.stringify(dedupeFields, Object.keys(dedupeFields).sort())),
      dedupe_fields: dedupeFields,
    };
  }

  buildCodexWakeDecision(normalized) {
    const stall = normalized.continuation_stall || {};
    return {
      action: "dispatch",
      next_phase: "leader-continuation",
      next_roles: ["leader"],
      leader_required: true,
      reason_code: "continuation_stalled",
      reason: "Watched parent has no active task, known child stages are review/terminal, and the next expected stage is missing. Guard records a Codex wake signal and reruns the parent leader when leader-task is allowed.",
      facts: stall,
      decision_source: "codex_wake_guard",
      dedupe_key: stall.dedupe_key || sha(JSON.stringify({
        issue_id: (normalized.router_event || {}).issue_id || "unknown-issue",
        next_stage: stall.next_stage || "unknown-next-stage",
      })),
      dedupe_fields: stall.dedupe_fields || {},
    };
  }

  buildContractAcceptedHandoffDecision(normalized) {
    const event = normalized.router_event || {};
    if (!event.contract_accepted || !event.parent_issue_id || !this.isWatchedParent(event.parent_issue_id)) return null;
    const dedupeFields = {
      workspace: this.args.workspaceSlug || this.args.workspaceId || "unknown-workspace",
      issue_id: event.issue_id || "unknown-issue",
      parent_issue_id: event.parent_issue_id || "no-parent",
      phase: event.phase || "contract",
      result: event.result || "CONTRACT_ACCEPTED",
      contract_sha256: event.contract_sha256 || "unknown-contract-sha",
      next_owner: event.next_owner || "SDLC GPT Gate Registry Coordinator",
      source_event: normalized.source_event_id || event.task_id || event.comment_id || "unknown-source",
    };
    return {
      action: "dispatch",
      next_phase: "gate-registry",
      next_roles: ["leader"],
      leader_required: true,
      reason_code: "contract_accepted_handoff",
      reason: "A watched child posted CONTRACT_ACCEPTED; guard wakes the parent Workflow Router to hand off the accepted contract to Gate Registry / review-wave routing instead of waiting on a generic in_review state.",
      facts: {
        issue_status: normalized.issue_status || null,
        parent_issue_id: event.parent_issue_id || null,
        contract_artifact_path: event.contract_artifact_path || null,
        contract_sha256: event.contract_sha256 || null,
        next_owner: event.next_owner || "SDLC GPT Gate Registry Coordinator",
        block_downstream: false,
      },
      decision_source: "contract_handoff_guard",
      dedupe_key: sha(stableJson(dedupeFields)),
      dedupe_fields: dedupeFields,
    };
  }

  buildImplementationDoneHandoffDecision(normalized) {
    const event = normalized.router_event || {};
    if (!event.implementation_done || !event.commit_sha || !event.parent_issue_id || !this.isWatchedParent(event.parent_issue_id)) return null;
    const dedupeFields = {
      workspace: this.args.workspaceSlug || this.args.workspaceId || "unknown-workspace",
      issue_id: event.issue_id || "unknown-issue",
      parent_issue_id: event.parent_issue_id || "no-parent",
      phase: "implementation",
      result: "DONE",
      commit_sha: event.commit_sha || "unknown-commit",
      next_owner: event.next_owner || "post-code review/runtime gate owners",
      source_event: normalized.source_event_id || event.task_id || event.comment_id || "unknown-source",
      parent_route_metadata_version: "v2",
    };
    return {
      action: "dispatch",
      next_phase: "validation",
      next_roles: ["leader"],
      leader_required: true,
      reason_code: "implementation_done_handoff",
      reason: "A watched child completed implementation with a commit SHA; guard wakes the parent Workflow Router to dispatch post-code review/runtime validation gates instead of replaying the older contract handoff.",
      facts: {
        issue_status: normalized.issue_status || null,
        parent_issue_id: event.parent_issue_id || null,
        commit_sha: event.commit_sha,
        source_role: event.source_role || "coder",
        result: event.result || "DONE",
        next_owner: event.next_owner || "post-code review/runtime gate owners",
        completed_roles: event.completed_roles || {},
        route_child_issue_id: event.issue_id || null,
        block_downstream: false,
      },
      decision_source: "implementation_handoff_guard",
      dedupe_key: sha(stableJson(dedupeFields)),
      dedupe_fields: dedupeFields,
    };
  }

  buildIdleIncompleteLeaderDecision(normalized) {
    const idle = normalized.idle_incomplete || {};
    if (!idle.issue_id) return null;
    const routeChild = idle.route_child || null;
    return {
      action: "dispatch",
      next_phase: "leader-continuation",
      next_roles: ["leader"],
      leader_required: true,
      reason_code: "idle_incomplete_leader_handoff",
      reason: "Watched work is not terminal and there are no active tasks on the relevant parent/child issues. Guard only wakes the parent Workflow Router; the leader decides the next owner and route.",
      facts: {
        issue_status: normalized.issue_status || null,
        parent_issue_id: idle.parent_issue_id || null,
        phase: idle.phase || null,
        result: idle.result || null,
        next_owner: idle.next_owner || null,
        child_states: idle.child_states || [],
        route_child: routeChild,
        route_child_issue_id: routeChild && routeChild.issue_id || null,
        commit_sha: routeChild && routeChild.commit_sha || null,
        completed_roles: routeChild && routeChild.completed_roles || null,
        review_wave_id: routeChild && routeChild.review_wave_id || null,
        waiting_on: routeChild && routeChild.waiting_on || null,
        blocked_reason: routeChild && routeChild.blocked_reason || null,
        guard_scope: "leader_only",
        block_downstream: false,
      },
      decision_source: "idle_incomplete_guard",
      dedupe_key: idle.dedupe_key,
      dedupe_fields: idle.dedupe_fields || {},
    };
  }

  normalizedRepairReason(normalized) {
    if (normalized.idle_incomplete) return "idle_incomplete_leader_handoff";
    if (normalized.router_event && normalized.router_event.implementation_done) return "implementation_done_handoff";
    if (normalized.router_event && normalized.router_event.contract_accepted) return "contract_accepted_handoff";
    if (normalized.continuation_stall) return "continuation_stalled";
    if (normalized.missing_facts && normalized.missing_facts.length) return "missing_sdlc_facts";
    return normalized.state_classification || normalized.classification || "unknown";
  }

  repairSignature(normalized) {
    const event = normalized.router_event || {};
    const reason = this.normalizedRepairReason(normalized);
    const barrierIds = normalized.parent_barrier ? (normalized.parent_barrier.unstaged_child_ids || []).join("|") : "";
    const missing = (normalized.missing_facts || []).slice().sort().join("|");
    const fields = {
      workspace: this.args.workspaceSlug || this.args.workspaceId || "unknown-workspace",
      parent_issue_id: event.parent_issue_id || event.issue_id || "no-parent",
      target_issue_id: event.issue_id || "unknown-issue",
      reason_code: reason,
      missing_facts: missing,
      barrier: barrierIds,
    };
    return {
      reason_code: reason,
      fields,
      key: sha(stableJson(fields)),
    };
  }

  eventCanProveIneffectiveRepair(eventType) {
    return ["comment:created", "task:completed", "task:failed"].includes(eventType);
  }

  annotateIneffectiveRepair(eventType, normalized) {
    if (!this.eventCanProveIneffectiveRepair(eventType)) return;
    if (normalized.observe_only || normalized.continuation_stall) return;
    const event = normalized.router_event || {};
    if (!event.parent_issue_id || !this.isWatchedParent(event.parent_issue_id)) return;
    const reason = this.normalizedRepairReason(normalized);
    if (![
      "missing_sdlc_facts",
      "unstaged_sibling_barrier",
      "nonterminal_leader_gate",
      "blocked_issue_leader_decision",
      "stale_commit_or_pr",
    ].includes(reason)) return;

    const signature = this.repairSignature(normalized);
    const repairs = this.repairState.repairs || {};
    const previous = repairs[signature.key] || {};
    const digest = normalized.state_digest || this.stateDigest(normalized.state_snapshot || {});
    const unchanged = previous.state_digest === digest;
    const count = unchanged ? Number(previous.count || 0) + 1 : 1;
    const epoch = Number(previous.epoch || 0);
    const now = utcNow();
    const lastEscalatedAt = unchanged ? previous.last_escalated_at || null : null;
    const cooldownAge = lastEscalatedAt ? (Date.now() - Date.parse(lastEscalatedAt)) / 1000 : Infinity;
    const cooldownExpired = !Number.isFinite(cooldownAge) || cooldownAge >= this.args.escalationCooldownSeconds;
    const thresholdReached = count >= this.args.ineffectiveRepairThreshold;
    const canEscalate = this.args.apply && this.allowActions.has("leader-task");
    const hasPendingEscalation = Boolean(unchanged && previous.pending_escalation_at && epoch > 0 && !lastEscalatedAt);
    const shouldOpenEscalation = Boolean(canEscalate && thresholdReached && cooldownExpired && !hasPendingEscalation);
    const shouldEscalate = Boolean(canEscalate && thresholdReached && (hasPendingEscalation || cooldownExpired));
    const nextEpoch = shouldOpenEscalation ? epoch + 1 : epoch;

    const record = {
      key: signature.key,
      fields: signature.fields,
      state_digest: digest,
      count,
      epoch: nextEpoch,
      last_seen_at: now,
      last_state_snapshot: normalized.state_snapshot || null,
      last_escalated_at: lastEscalatedAt,
      pending_escalation_at: shouldOpenEscalation ? now : (unchanged ? previous.pending_escalation_at || null : null),
    };
    repairs[signature.key] = record;
    this.repairState.repairs = repairs;
    this.saveRepairState();

    normalized.ineffective_repair = {
      signature_key: signature.key,
      original_reason_code: reason,
      count,
      threshold: this.args.ineffectiveRepairThreshold,
      state_unchanged: unchanged,
      epoch: nextEpoch,
      cooldown_seconds: this.args.escalationCooldownSeconds,
      cooldown_remaining_seconds: thresholdReached && !cooldownExpired ? Math.max(0, Math.ceil(this.args.escalationCooldownSeconds - cooldownAge)) : 0,
      escalating: shouldEscalate,
    };
  }

  applyIneffectiveEscalation(normalized, decision) {
    const repair = normalized.ineffective_repair || {};
    if (!decision) return decision;
    if (!repair.escalating) {
      if (this.allowActions.has("leader-task") && repair.count >= repair.threshold && repair.cooldown_remaining_seconds > 0) {
        return {
          ...decision,
          action: "duplicate",
          leader_required: false,
          reason_code: "ineffective_repair_cooldown",
          reason: "Guard already opened an ineffective repair escalation epoch and is waiting for cooldown or state progress before rerunning the parent leader again.",
          facts: {
            ...(decision.facts || {}),
            ineffective_repair: repair,
            original_reason_code: repair.original_reason_code,
          },
          decision_source: "ineffective_repair_guard",
        };
      }
      return decision;
    }
    if (!this.allowActions.has("leader-task")) return decision;
    const event = normalized.router_event || {};
    const dedupeFields = {
      ...(decision.dedupe_fields || {}),
      ineffective_repair_signature: repair.signature_key,
      original_reason_code: repair.original_reason_code,
      escalation_epoch: String(repair.epoch || 0),
    };
    return {
      ...decision,
      action: "dispatch",
      next_phase: "ineffective-repair-escalation",
      next_roles: ["leader"],
      leader_required: true,
      reason_code: "ineffective_repair_escalation",
      reason: "Guard observed repeated task/comment repair attempts without structured state progress; rerun the parent leader once for this escalation epoch.",
      facts: {
        ...(decision.facts || {}),
        ineffective_repair: repair,
        original_reason_code: repair.original_reason_code,
        parent_issue_id: event.parent_issue_id || null,
      },
      decision_source: "ineffective_repair_guard",
      dedupe_key: sha(stableJson(dedupeFields)),
      dedupe_fields: dedupeFields,
    };
  }

  markIneffectiveEscalationApplied(normalized) {
    const repair = normalized.ineffective_repair || {};
    if (!repair.signature_key || !repair.escalating) return;
    const record = (this.repairState.repairs || {})[repair.signature_key];
    if (!record) return;
    record.last_escalated_at = utcNow();
    record.pending_escalation_at = null;
    this.repairState.repairs[repair.signature_key] = record;
    this.saveRepairState();
  }

  shouldPreferGuardDecision(normalized) {
    return this.shouldPushFromState(normalized) && [
      "blocked_issue_leader_decision",
      "nonterminal_leader_gate",
      "terminal_child_barrier",
    ].includes(normalized.state_classification || normalized.classification);
  }

  shouldObserveNonBlockingControlPlane(normalized) {
    if (!normalized || normalized.continuation_stall) return false;
    if (!normalized.control_plane_nonblocking || normalized.control_plane_final_lock) return false;
    const classification = normalized.state_classification || normalized.classification;
    return [
      "blocked_issue_leader_decision",
      "blocked_unknown_fact",
      "missing_required_role",
      "missing_sdlc_facts",
      "ineffective_repair_escalation",
    ].includes(classification);
  }

  async decideAndApply(eventType, normalized) {
    normalized.event_type ||= eventType;
    if (normalized.drop) {
      await this.recordDecision(eventType, normalized, null, "suppressed");
      return;
    }

    let decision = null;
    this.annotateIneffectiveRepair(eventType, normalized);
    if (normalized.continuation_stall) {
      decision = this.buildCodexWakeDecision(normalized);
      const wakeResult = this.recordCodexWake(normalized, decision);
      const applyResult = await this.applyDecision(normalized, decision);
      await this.recordDecision(eventType, normalized, decision, `${wakeResult},${applyResult}`);
      return;
    }
    if (eventType === "task:message" && normalized.missing_facts && normalized.missing_facts.length) {
      normalized.classification = "task_message_observed";
      normalized.observe_only = true;
      await this.recordDecision(eventType, normalized, null, "suppressed");
      return;
    }
    decision = this.buildIdleIncompleteLeaderDecision(normalized);
    if (decision) {
      normalized.classification = decision.reason_code;
      normalized.missing_facts = [];
      const applyResult = await this.applyDecision(normalized, decision);
      await this.recordDecision(eventType, normalized, decision, applyResult);
      return;
    }
    if (normalized.missing_facts && normalized.missing_facts.length) {
      decision = this.buildMissingFactsDecision(normalized) || this.buildGuardDecision(normalized);
      if (!decision) {
        await this.diagnoseWithSubagent(eventType, normalized, "blocked");
        return;
      }
      decision = this.applyIneffectiveEscalation(normalized, decision);
      normalized.classification = decision.reason_code;
      const applyResult = await this.applyDecision(normalized, decision);
      await this.recordDecision(eventType, normalized, decision, applyResult);
      return;
    }
    decision = this.buildImplementationDoneHandoffDecision(normalized);
    if (decision) {
      normalized.classification = decision.reason_code;
      normalized.missing_facts = [];
      const applyResult = await this.applyDecision(normalized, decision);
      await this.recordDecision(eventType, normalized, decision, applyResult);
      return;
    }
    decision = this.buildContractAcceptedHandoffDecision(normalized);
    if (decision) {
      normalized.classification = decision.reason_code;
      normalized.missing_facts = [];
      const applyResult = await this.applyDecision(normalized, decision);
      await this.recordDecision(eventType, normalized, decision, applyResult);
      return;
    }
    if (this.shouldObserveNonBlockingControlPlane(normalized)) {
      normalized.classification = "control_plane_observed";
      normalized.observe_only = true;
      await this.recordDecision(eventType, normalized, null, "suppressed_nonblocking_control_plane");
      return;
    }
    if (this.shouldPreferGuardDecision(normalized)) {
      decision = this.buildGuardDecision(normalized);
      if (!decision) {
        await this.diagnoseWithSubagent(eventType, normalized, "blocked");
        return;
      }
      decision = this.applyIneffectiveEscalation(normalized, decision);
      normalized.classification = decision.reason_code;
      const applyResult = await this.applyDecision(normalized, decision);
      await this.recordDecision(eventType, normalized, decision, applyResult);
      return;
    }
    try {
      decision = router.route(this.template, normalized.router_event);
    } catch (error) {
      decision = this.buildGuardDecision(normalized);
      if (!decision) {
        normalized.classification = "blocked_unknown_fact";
        normalized.blocker = `router_error: ${error.message}`;
        await this.diagnoseWithSubagent(eventType, normalized, "blocked");
        return;
      }
    }
    decision = this.applyIneffectiveEscalation(normalized, decision);
    if (decision.reason_code === "ineffective_repair_escalation") normalized.classification = decision.reason_code;

    const applyResult = await this.applyDecision(normalized, decision);
    await this.recordDecision(eventType, normalized, decision, applyResult);
  }

  applyDedupeKey(normalized, decision, action) {
    const event = normalized.router_event || {};
    const sourceEvent = ["state_guard", "codex_wake_guard", "idle_incomplete_guard"].includes(decision.decision_source)
      ? decision.decision_source
      : normalized.source_event_id || event.task_id || event.comment_id || "unknown-source";
    return sha(JSON.stringify({
      workspace: this.args.workspaceSlug || this.args.workspaceId || "unknown-workspace",
      watched_parent: [...this.watchParents].sort(),
      issue_id: event.issue_id,
      source_event: sourceEvent,
      router_dedupe_key: decision.dedupe_key,
      apply_action: action,
    }));
  }

  canApplyLeaderTask(decision) {
    return decision && decision.leader_required && [
      "blocked_issue_leader_decision",
      "continuation_stalled",
      "nonterminal_leader_gate",
      "terminal_child_barrier",
      "missing_sdlc_facts",
      "contract_accepted_handoff",
      "implementation_done_handoff",
      "idle_incomplete_leader_handoff",
      "unstaged_sibling_barrier",
      "stale_commit_or_pr",
      "ineffective_repair_escalation",
    ].includes(decision.reason_code);
  }

  isApplyDuplicate(key, action, decision = null) {
    const existing = this.applyKeys.get(key);
    if (!existing) return false;
    if (action !== "leader-task") return true;
    if (decision && decision.reason_code === "ineffective_repair_escalation") return true;
    if (this.args.leaderTaskRetrySeconds === 0) return false;
    const ts = existing.ts || existing.applied_at || existing.created_at;
    if (!ts) return false;
    const ageSeconds = (Date.now() - Date.parse(ts)) / 1000;
    return Number.isFinite(ageSeconds) && ageSeconds < this.args.leaderTaskRetrySeconds;
  }

  rememberApplyKey(key, action, decision) {
    const record = {
      ts: utcNow(),
      apply_dedupe_key: key,
      action,
      router_dedupe_key: decision.dedupe_key,
      reason_code: decision.reason_code,
      escalation_epoch: decision.facts && decision.facts.ineffective_repair ? decision.facts.ineffective_repair.epoch : null,
    };
    appendJsonl(this.args.dedupeStore, record);
    this.applyKeys.set(key, record);
  }

  notificationDedupeKey(type, normalized, extra = {}) {
    const event = normalized.router_event || {};
    const childProgress = type === "child-complete";
    return sha(stableJson({
      workspace: this.args.workspaceSlug || this.args.workspaceId || "unknown-workspace",
      type,
      parent_issue_id: event.parent_issue_id || event.issue_id || extra.parent_issue_id || "unknown-parent",
      issue_id: event.issue_id || "unknown-issue",
      state_digest: childProgress ? null : normalized.state_digest || null,
      reason_code: extra.reason_code || normalized.classification || "unknown",
      completion_key: extra.completion_key || null,
      progress_status: childProgress ? String(extra.progress_status || normalized.issue_status || "unknown").toLowerCase() : null,
    }));
  }

  shouldNotifyHumanBlock(normalized, decision) {
    if (!this.args.larkNotify || !this.larkNotifyOn.has("human-block")) return false;
    if (normalized.issue_status === "blocked" || normalized.classification === "blocked_issue_leader_decision") return true;
    const text = stableJson({
      classification: normalized.classification || null,
      blocker: normalized.blocker || null,
      decision: decision || null,
      facts: decision && decision.facts || null,
    });
    return HUMAN_DECISION_TOKENS.some((token) => text.includes(token));
  }

  shouldNotifyAllComplete(normalized) {
    return Boolean(this.args.larkNotify && this.larkNotifyOn.has("all-complete") && normalized.completion_audit && normalized.completion_audit.result === "ALL_COMPLETE");
  }

  shouldNotifyChildComplete(normalized) {
    if (!this.args.larkNotify || !this.larkNotifyOn.has("child-complete")) return false;
    if (normalized.event_type !== "issue:updated") return false;
    const event = normalized.router_event || {};
    if (!event.parent_issue_id || !this.isWatchedParent(event.parent_issue_id)) return false;
    return ["in_review", "review", "done", "completed"].includes(String(normalized.issue_status || "").toLowerCase());
  }

  larkNotificationTargetArgs() {
    if (this.args.larkNotifyChatId) return ["--chat-id", this.args.larkNotifyChatId];
    if (this.args.larkNotifyUserId) return ["--user-id", this.args.larkNotifyUserId];
    return null;
  }

  larkWebhookPayload(text) {
    const payload = {
      msg_type: "text",
      content: { text },
    };
    if (this.args.larkWebhookSecret) {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const stringToSign = `${timestamp}\n${this.args.larkWebhookSecret}`;
      const sign = crypto
        .createHmac("sha256", stringToSign)
        .update("")
        .digest("base64");
      payload.timestamp = timestamp;
      payload.sign = sign;
    }
    return payload;
  }

  larkMessage(type, normalized, decision) {
    const event = normalized.router_event || {};
    if (type === "all-complete") {
      const audit = normalized.completion_audit || {};
      return [
        "**Multica Guard：全部任务已完成**",
        "",
        `workspace: ${this.args.workspaceSlug || this.args.workspaceId || "unknown"}`,
        `父 issue: ${audit.parent_issue_id || event.parent_issue_id || event.issue_id || "unknown"}`,
        `子 issue 数量: ${audit.child_count || 0}`,
        `阶段顺序: ${(audit.expected_stage_order || []).join(", ")}`,
        "",
        "Guard 已确认所有预期阶段都存在，父子 issue 没有 active task，且没有 todo / in_progress / blocked 子 issue。请按需执行最终 closure review。",
      ].join("\n");
    }
    if (type === "child-complete") {
      return [
        "**Multica Guard：子任务进度更新**",
        "",
        `workspace: ${this.args.workspaceSlug || this.args.workspaceId || "unknown"}`,
        `父 issue: ${event.parent_issue_id || "(none)"}`,
        `子 issue: ${event.issue_id || "unknown"}`,
        `status: ${normalized.issue_status || "unknown"}`,
        `classification: ${normalized.classification || "unknown"}`,
        "",
        "一个被监听的子 issue 已进入 review 或完成里程碑。Guard 会继续监听父 issue，推动下一阶段路由和最终完成。",
      ].join("\n");
    }
    return [
      "**Multica Guard：需要人工决策**",
      "",
      `workspace: ${this.args.workspaceSlug || this.args.workspaceId || "unknown"}`,
      `issue: ${event.issue_id || "unknown"}`,
      `父 issue: ${event.parent_issue_id || "(none)"}`,
      `classification: ${normalized.classification || "unknown"}`,
      `reason_code: ${decision && decision.reason_code || "unknown"}`,
      `status: ${normalized.issue_status || "unknown"}`,
      "",
      "Guard 检测到面向人工的 blocker 信号。除非 blocker report 明确要求外部输入，Multica 应继续优先尝试自动恢复。",
    ].join("\n");
  }

  async notifyLark(type, normalized, decision, extra = {}) {
    const key = this.notificationDedupeKey(type, normalized, extra);
    if (this.notifyKeys.has(key)) return `lark:${type}:duplicate`;
    const baseRecord = {
      ts: utcNow(),
      dedupe_key: key,
      type,
      workspace: this.args.workspaceSlug || this.args.workspaceId || null,
      issue_id: (normalized.router_event || {}).issue_id || null,
      parent_issue_id: (normalized.router_event || {}).parent_issue_id || extra.parent_issue_id || null,
    };
    const message = this.larkMessage(type, normalized, decision);
    if (this.args.larkWebhookUrl) {
      let output = null;
      try {
        const response = await fetch(this.args.larkWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(this.larkWebhookPayload(message)),
        });
        const text = await response.text();
        output = { status: response.ok ? "sent" : "error", http_status: response.status, body: redactText(text).slice(-12000) };
      } catch (error) {
        output = { status: "error", error: error.message };
      }
      const record = {
        ...baseRecord,
        status: output.status,
        transport: "webhook",
        webhook_url_configured: true,
        webhook_signed: Boolean(this.args.larkWebhookSecret),
        output,
      };
      appendJsonl(this.args.larkNotifyJournal, record);
      this.notifyKeys.set(key, record);
      return `lark:${type}:webhook:${output.status}`;
    }
    const targetArgs = this.larkNotificationTargetArgs();
    if (!targetArgs) {
      const record = { ...baseRecord, status: "skipped_missing_target", transport: "none" };
      appendJsonl(this.args.larkNotifyJournal, record);
      this.notifyKeys.set(key, record);
      return `lark:${type}:skipped_missing_target`;
    }
    const args = ["im", "+messages-send", ...targetArgs, "--markdown", message, "--idempotency-key", key, "--format", "json"];
    const output = await new Promise((resolve) => {
      const proc = childProcess.spawn(this.args.larkCli, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
        cwd: process.cwd(),
      });
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (chunk) => { stdout = (stdout + chunk.toString("utf8")).slice(-12000); });
      proc.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString("utf8")).slice(-12000); });
      proc.on("error", (error) => resolve({ status: "error", error: error.message, stdout, stderr }));
      proc.on("close", (code, signal) => resolve({ status: code === 0 ? "sent" : "error", code, signal, stdout, stderr }));
    });
    const record = { ...baseRecord, status: output.status, transport: "lark-cli", output };
    appendJsonl(this.args.larkNotifyJournal, record);
    this.notifyKeys.set(key, record);
    return `lark:${type}:${output.status}`;
  }

  shouldApplySubagent(normalized, decision, currentResults) {
    if (!this.args.subagentCommand) return false;
    const reasons = new Set(this.args.subagentReasons || []);
    const resultText = currentResults.join(",");
    if (resultText.includes("leader-task:duplicate")) return reasons.has("leader_task_duplicate");
    if (resultText.includes("leader-task:blocked")) return reasons.has("leader_task_blocked");
    if (resultText.includes("leader-task:active")) return reasons.has("leader_task_active");
    return reasons.has(decision.reason_code) || reasons.has(normalized.classification);
  }

  buildSubagentOnlyDecision(normalized) {
    const event = normalized.router_event || {};
    const dedupeFields = {
      workspace: this.args.workspaceSlug || this.args.workspaceId || "unknown-workspace",
      issue_id: event.issue_id || "unknown-issue",
      parent_issue_id: event.parent_issue_id || "no-parent",
      classification: normalized.classification || "blocked_unknown_fact",
      blocker: normalized.blocker || "",
    };
    return {
      action: "diagnose",
      next_phase: "guard-diagnosis",
      next_roles: ["subagent"],
      leader_required: false,
      reason_code: normalized.classification || "blocked_unknown_fact",
      reason: "Guard could not derive enough structured facts to route or safely rerun a Multica agent; ask a read-only subagent to judge the next continuation move.",
      facts: {
        issue_status: normalized.issue_status || null,
        missing_facts: normalized.missing_facts || [],
        blocker: normalized.blocker || null,
      },
      decision_source: "subagent_guard",
      dedupe_key: sha(JSON.stringify(dedupeFields, Object.keys(dedupeFields).sort())),
      dedupe_fields: dedupeFields,
    };
  }

  async diagnoseWithSubagent(eventType, normalized, applyResult) {
    if (!this.args.apply || !this.allowActions.has("subagent") || !this.args.subagentCommand) {
      await this.recordDecision(eventType, normalized, null, applyResult);
      return;
    }
    if (!this.ensureOwnerForApply()) {
      await this.recordDecision(eventType, normalized, null, `${applyResult},owner-session:blocked`);
      return;
    }
    const decision = this.buildSubagentOnlyDecision(normalized);
    const key = this.applyDedupeKey(normalized, decision, "subagent");
    if (this.isApplyDuplicate(key, "subagent", decision)) {
      await this.recordDecision(eventType, normalized, decision, `${applyResult},subagent:duplicate`);
      return;
    }
    const subagentResult = await this.applySubagent(normalized, decision, [applyResult]);
    this.rememberApplyKey(key, "subagent", decision);
    await this.recordDecision(eventType, normalized, decision, `${applyResult},${subagentResult}`);
  }

  async applyDecision(normalized, decision) {
    if (!this.args.apply) return "suppressed";
    if (!this.ensureOwnerForApply()) return "owner-session:blocked";
    if (["wait", "duplicate", "error"].includes(decision.action)) return "blocked";
    const results = [];
    for (const action of this.applyActionOrder(decision)) {
      if (action === "subagent" && !this.shouldApplySubagent(normalized, decision, results)) {
        results.push("subagent:suppressed");
        continue;
      }
      if (action === "leader-task" && (!this.canApplyLeaderTask(decision) || !this.leaderTaskIssueId(normalized))) {
        results.push("leader-task:blocked");
        continue;
      }
      const key = this.applyDedupeKey(normalized, decision, action);
      if (this.isApplyDuplicate(key, action, decision)) {
        results.push(`${action}:duplicate`);
        continue;
      }
      if (action === "comment" && decision.decision_source === "state_guard" && !this.args.stateGuardComments) {
        results.push("comment:suppressed_state_guard");
        continue;
      }
      if (action === "comment" && !this.args.listenerComments) {
        results.push("comment:suppressed");
        continue;
      }
      if (!IMPLEMENTED_APPLY_ACTIONS.has(action)) {
        results.push(`${action}:blocked`);
        continue;
      }
      if (action === "comment") await this.applyComment(normalized, decision);
      if (action === "leader-task") {
        const leaderResult = await this.applyLeaderTask(normalized, decision);
        results.push(leaderResult);
        if (leaderResult === "leader-task:applied" && decision.reason_code === "ineffective_repair_escalation") {
          this.markIneffectiveEscalationApplied(normalized);
        }
        this.rememberApplyKey(key, action, decision);
        continue;
      }
      if (action === "subagent") {
        results.push(await this.applySubagent(normalized, decision, results));
        this.rememberApplyKey(key, action, decision);
        continue;
      }
      if (action === "metadata") await this.applyMetadata(normalized, decision);
      this.rememberApplyKey(key, action, decision);
      results.push(`${action}:applied`);
    }
    return results.join(",") || "blocked";
  }

  applyActionOrder(decision) {
    const actions = [...this.allowActions].sort();
    const metadataFirstReasons = new Set([
      "contract_accepted_handoff",
      "implementation_done_handoff",
      "idle_incomplete_leader_handoff",
    ]);
    if (!metadataFirstReasons.has(decision.reason_code)) return actions;
    const priority = new Map([
      ["metadata", 0],
      ["leader-task", 1],
      ["comment", 2],
      ["subagent", 3],
    ]);
    return actions.sort((a, b) => (priority.get(a) ?? 10) - (priority.get(b) ?? 10) || a.localeCompare(b));
  }

  async applyComment(normalized, decision) {
    const event = normalized.router_event;
    const issueId = event.parent_issue_id || event.issue_id;
    const content = [
      "[multica-sdlc-listener]",
      `classification: ${normalized.classification}`,
      `decision_source: ${decision.decision_source || "router"}`,
      `router_action: ${decision.action}`,
      `next_phase: ${decision.next_phase}`,
      `next_roles: ${(decision.next_roles || []).join(", ") || "(none)"}`,
      `reason_code: ${decision.reason_code}`,
      `missing_facts: ${(normalized.missing_facts || []).join(", ") || "(none)"}`,
      `barrier: ${normalized.parent_barrier ? JSON.stringify(normalized.parent_barrier) : "(none)"}`,
      `dedupe_key: ${decision.dedupe_key}`,
    ].join("\n");
    await this.api.post(`/api/issues/${encodeURIComponent(issueId)}/comments`, { content: redactText(content) });
  }

  leaderTaskIssueId(normalized) {
    const event = normalized.router_event || {};
    const classification = normalized.state_classification || normalized.classification;
    if (normalized.classification === "ineffective_repair_escalation") return event.parent_issue_id || event.issue_id;
    if (normalized.classification === "idle_incomplete_leader_handoff") return event.parent_issue_id || event.issue_id;
    if (classification === "blocked_issue_leader_decision") return event.issue_id;
    return event.parent_issue_id || event.issue_id;
  }

  leaderTaskActiveIssueIds(normalized) {
    const ids = new Set();
    const leaderIssueId = this.leaderTaskIssueId(normalized);
    if (leaderIssueId) ids.add(String(leaderIssueId));
    const event = normalized.router_event || {};
    if (event.issue_id) ids.add(String(event.issue_id));
    if (event.parent_issue_id) ids.add(String(event.parent_issue_id));
    const barriers = [
      normalized.parent_barrier,
      normalized.state_snapshot && normalized.state_snapshot.barrier,
    ].filter(Boolean);
    for (const barrier of barriers) {
      for (const id of barrier.unstaged_child_ids || []) {
        if (id) ids.add(String(id));
      }
    }
    for (const child of normalized.state_snapshot && normalized.state_snapshot.children || []) {
      if (child && child.id && child.stage == null) {
        ids.add(String(child.id));
      }
    }
    const stall = normalized.continuation_stall || {};
    for (const task of stall.active_tasks || []) {
      if (task && task.issue_id) ids.add(String(task.issue_id));
    }
    return [...ids];
  }

  async applyLeaderTask(normalized, decision) {
    const issueId = this.leaderTaskIssueId(normalized);
    try {
      const activeIssueIds = new Set(this.leaderTaskActiveIssueIds(normalized));
      if (this.isWatchedParent(issueId)) {
        for (const child of await this.readChildren(issueId)) {
          const childId = issueIdOf(child);
          if (childId) activeIssueIds.add(String(childId));
        }
      }
      for (const activeIssueId of activeIssueIds) {
        const active = await this.readAnyActiveTasks(activeIssueId);
        if (active.length) {
          return "leader-task:active";
        }
      }
    } catch {
      // Older Multica servers may not expose active-task. Fall through to rerun;
      // local dedupe still prevents repeated guard-created tasks.
    }
    await this.api.post(`/api/issues/${encodeURIComponent(issueId)}/rerun`, {});
    return "leader-task:applied";
  }

  async applySubagent(normalized, decision, priorResults) {
    const input = {
      ts: utcNow(),
      workspace: this.args.workspaceSlug || this.args.workspaceId || null,
      watched_parents: [...this.watchParents],
      watched_issues: [...this.watchIssues],
      prior_results: priorResults,
      normalized: redact(normalized),
      decision: redact(decision),
      instruction: [
        "Judge how the Multica guard should continue toward full PRD completion.",
        "Return concise JSON with fields: severity, recommended_action, target_issue, reason, stop_condition.",
        "Do not mutate files, issue state, PRs, or comments from the subagent command itself.",
      ].join(" "),
    };
    const output = await new Promise((resolve) => {
      const proc = childProcess.spawn(this.args.subagentCommand, {
        shell: true,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
        cwd: process.cwd(),
      });
      let stdout = "";
      let stderr = "";
      const limit = this.args.subagentMaxOutputBytes;
      const timer = setTimeout(() => {
        proc.kill("SIGTERM");
      }, this.args.subagentTimeoutSeconds * 1000);
      proc.stdout.on("data", (chunk) => {
        stdout = (stdout + chunk.toString("utf8")).slice(-limit);
      });
      proc.stderr.on("data", (chunk) => {
        stderr = (stderr + chunk.toString("utf8")).slice(-limit);
      });
      proc.on("error", (error) => {
        clearTimeout(timer);
        resolve({ status: "error", error: error.message, stdout, stderr });
      });
      proc.on("close", (code, signal) => {
        clearTimeout(timer);
        let parsed = null;
        const trimmed = stdout.trim();
        if (trimmed) {
          try {
            const jsonStart = trimmed.indexOf("{");
            const jsonEnd = trimmed.lastIndexOf("}");
            if (jsonStart >= 0 && jsonEnd >= jsonStart) parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
          } catch {
            parsed = null;
          }
        }
        const degraded = Boolean(parsed && parsed.degraded);
        resolve({ status: code === 0 ? (degraded ? "degraded" : "ok") : "error", code, signal, stdout, stderr, parsed, degraded });
      });
      proc.stdin.end(JSON.stringify(input), "utf8");
    });
    const subagentApplyResult = output.status === "ok"
      ? "subagent:applied"
      : output.status === "degraded"
        ? "subagent:degraded"
        : "subagent:error";
    appendJsonl(this.args.journal, {
      event_type: "subagent:result",
      issue_id: (normalized.router_event || {}).issue_id || null,
      parent_issue_id: (normalized.router_event || {}).parent_issue_id || null,
      classification: normalized.classification,
      reason_code: decision.reason_code,
      subagent: output,
      apply_mode: this.applyMode(),
      apply_result: subagentApplyResult,
    });
    return subagentApplyResult;
  }

  async applyMetadata(normalized, decision) {
    const event = normalized.router_event;
    const issueId = event.parent_issue_id || event.issue_id;
    if (decision.reason_code === "contract_accepted_handoff" && event.issue_id) {
      const childId = event.issue_id;
      const metadataValues = {
        "multica_sdlc.phase": event.phase || "contract",
        "multica_sdlc.source_role": event.source_role || "planner",
        "multica_sdlc.result": event.result || "CONTRACT_ACCEPTED",
        "multica_sdlc.artifact_type": event.artifact_type || "stage-contract",
      };
      if (event.contract_artifact_path) metadataValues["multica_sdlc.contract_artifact_path"] = event.contract_artifact_path;
      if (event.contract_sha256) metadataValues["multica_sdlc.contract_sha256"] = event.contract_sha256;
      if (event.next_owner) metadataValues["multica_sdlc.next_owner"] = event.next_owner;
      for (const [key, value] of Object.entries(metadataValues)) {
        await this.api.put(`/api/issues/${encodeURIComponent(childId)}/metadata/${encodeURIComponent(key)}`, { value });
      }
    }
    if (decision.reason_code === "implementation_done_handoff" && event.issue_id) {
      const childId = event.issue_id;
      const metadataValues = {
        "multica_sdlc.phase": "implementation",
        "multica_sdlc.source_role": event.source_role || "coder",
        "multica_sdlc.result": event.result || "DONE",
        "multica_sdlc.artifact_type": event.artifact_type || "commit",
        "multica_sdlc.commit_sha": event.commit_sha,
        "multica_sdlc.next_owner": event.next_owner || "post-code review/runtime gate owners",
        "multica_sdlc.completed_roles": JSON.stringify({
          ...(event.completed_roles || {}),
          coder: {
            result: "DONE",
            commit_sha: event.commit_sha,
            artifact_type: "commit",
          },
        }),
      };
      for (const [key, value] of Object.entries(metadataValues)) {
        if (value !== undefined && value !== null && value !== "") {
          await this.api.put(`/api/issues/${encodeURIComponent(childId)}/metadata/${encodeURIComponent(key)}`, { value });
        }
      }
      if (event.parent_issue_id) {
        const parentMetadataValues = {
          ...metadataValues,
          "multica_sdlc.route_child_issue_id": childId,
          "multica_sdlc.route_child_status": normalized.issue_status || null,
        };
        if (event.review_wave_id) parentMetadataValues["multica_sdlc.review_wave_id"] = event.review_wave_id;
        for (const [key, value] of Object.entries(parentMetadataValues)) {
          if (value !== undefined && value !== null && value !== "") {
            await this.api.put(`/api/issues/${encodeURIComponent(event.parent_issue_id)}/metadata/${encodeURIComponent(key)}`, { value });
          }
        }
      }
    }
    if (decision.reason_code === "idle_incomplete_leader_handoff" && decision.facts && decision.facts.route_child) {
      const routeChild = decision.facts.route_child;
      const metadataValues = {
        "multica_sdlc.phase": routeChild.phase || "implementation",
        "multica_sdlc.source_role": routeChild.source_role || "coder",
        "multica_sdlc.result": routeChild.result || "DONE",
        "multica_sdlc.artifact_type": routeChild.artifact_type || "commit",
        "multica_sdlc.commit_sha": routeChild.commit_sha,
        "multica_sdlc.completed_roles": JSON.stringify(routeChild.completed_roles || {}),
        "multica_sdlc.next_owner": routeChild.next_owner || "post-code review/runtime gate owners",
        "multica_sdlc.route_child_issue_id": routeChild.issue_id,
        "multica_sdlc.route_child_status": routeChild.status,
      };
      if (routeChild.review_wave_id) metadataValues["multica_sdlc.review_wave_id"] = routeChild.review_wave_id;
      if (routeChild.waiting_on) metadataValues["multica_sdlc.route_child_waiting_on"] = routeChild.waiting_on;
      if (routeChild.blocked_reason) metadataValues["multica_sdlc.route_child_blocked_reason"] = routeChild.blocked_reason;
      for (const [key, value] of Object.entries(metadataValues)) {
        if (value !== undefined && value !== null && value !== "") {
          await this.api.put(`/api/issues/${encodeURIComponent(issueId)}/metadata/${encodeURIComponent(key)}`, { value });
        }
      }
    }
    const value = JSON.stringify({
      ts: utcNow(),
      action: decision.action,
      next_phase: decision.next_phase,
      reason_code: decision.reason_code,
      decision_source: decision.decision_source || "router",
      classification: normalized.classification,
      missing_facts: normalized.missing_facts || [],
      barrier: normalized.parent_barrier || null,
      status_guard: decision.facts ? decision.facts.status_guard || null : null,
      dedupe_key: decision.dedupe_key,
    });
    await this.api.put(`/api/issues/${encodeURIComponent(issueId)}/metadata/multica_listener.last_decision`, { value });
  }

  recordCodexWake(normalized, decision) {
    const key = decision.dedupe_key;
    if (key && this.wakeKeys.has(key)) return "codex-wake:duplicate";
    const event = normalized.router_event || {};
    const record = {
      ts: utcNow(),
      event_type: "codex_intervention_required",
      dedupe_key: key,
      issue_id: event.issue_id,
      parent_issue_id: event.parent_issue_id,
      classification: normalized.classification,
      reason_code: decision.reason_code,
      next_stage: normalized.continuation_stall ? normalized.continuation_stall.next_stage : null,
      facts: normalized.continuation_stall || {},
    };
    appendJsonl(this.args.codexWakeJournal, record);
    if (key) this.wakeKeys.set(key, record);
    return "codex-wake:recorded";
  }

  async runTerminalNotifications(normalized, decision, applyResult) {
    const results = [];
    if (this.shouldNotifyChildComplete(normalized)) {
      results.push(await this.notifyLark("child-complete", normalized, decision, {
        reason_code: "child_complete",
        progress_status: normalized.issue_status || "unknown",
      }));
    }
    if (this.shouldNotifyHumanBlock(normalized, decision)) {
      results.push(await this.notifyLark("human-block", normalized, decision, {
        reason_code: decision && decision.reason_code || normalized.classification,
      }));
    }
    if (this.shouldNotifyAllComplete(normalized)) {
      results.push(await this.notifyLark("all-complete", normalized, decision, {
        parent_issue_id: normalized.completion_audit.parent_issue_id,
        completion_key: normalized.completion_audit.dedupe_key,
      }));
    }
    return results.filter(Boolean);
  }

  async recordDecision(eventType, normalized, decision, applyResult) {
    const event = normalized.router_event || {};
    const notificationResults = await this.runTerminalNotifications(normalized, decision, applyResult);
    const record = {
      event_type: eventType,
      source_event_id: normalized.source_event_id || null,
      issue_id: event.issue_id,
      parent_issue_id: event.parent_issue_id,
      classification: normalized.classification,
      state_classification: normalized.state_classification || null,
      issue_status: normalized.issue_status || null,
      pr_states: normalized.pr_states || [],
      parent_barrier: normalized.parent_barrier || null,
      continuation_stall: normalized.continuation_stall || null,
      completion_audit: normalized.completion_audit || null,
      ineffective_repair: normalized.ineffective_repair || null,
      control_plane_nonblocking: Boolean(normalized.control_plane_nonblocking),
      control_plane_final_lock: Boolean(normalized.control_plane_final_lock),
      state_digest: normalized.state_digest || null,
      observe_only: Boolean(normalized.observe_only),
      missing_facts: normalized.missing_facts || [],
      router_decision: decision,
      apply_mode: this.applyMode(),
      apply_action: this.args.apply ? [...this.allowActions].sort().join(",") : null,
      apply_result: applyResult,
      notification_result: notificationResults,
      owner_session_id: this.ownerSessionId,
      owner_active: this.ownerActive,
      redactions: ["token", "cookie", "private_key", "api_key", "secret"],
    };
    if (record.observe_only) {
      const key = [eventType, record.classification || "unknown", record.issue_id || "unknown"].join("|");
      const count = (this.observeCounts.get(key) || 0) + 1;
      this.observeCounts.set(key, count);
      if (count === 1 || (this.args.observeLogEvery > 0 && count % this.args.observeLogEvery === 0)) {
        this.log({ event_type: eventType, classification: record.classification, apply_result: applyResult, observed_count: count });
      }
    } else {
      this.log({ event_type: eventType, classification: record.classification, apply_result: applyResult });
    }
    this.journal(record);
  }

  async reconcile(reason) {
    const queue = [...new Set([...this.watchParents, ...this.watchIssues])].sort();
    if (!queue.length) return;
    this.log({ state: "snapshot_or_reconcile", message: reason, watched_count: queue.length });
    this.lifecycle(reason === "startup" ? "startup_reconcile" : "reconcile", { reason, watched_count: queue.length });
    const seen = new Set();
    for (let index = 0; index < queue.length; index += 1) {
      const issueId = queue[index];
      if (seen.has(issueId)) continue;
      seen.add(issueId);
      try {
        const snapshot = await this.hydrateIssueSnapshot(issueId);
        this.rememberResolvedWatch(snapshot);
        if (snapshot.issue && snapshot.issue.id) seen.add(String(snapshot.issue.id));
        if (this.isWatchedParent(issueId) || this.isWatchedParent(snapshot.issue && snapshot.issue.id)) {
          for (const child of snapshot.children) {
            const childId = child && (child.id || child.issue_id);
            if (childId && !seen.has(String(childId))) queue.push(String(childId));
          }
        }
        const normalized = await this.normalizeSnapshot(snapshot, reason);
        await this.decideAndApply("reconcile", normalized);
      } catch (error) {
        this.journal({ event_type: "reconcile", issue_id: issueId, classification: "blocked_unknown_fact", apply_mode: this.applyMode(), apply_result: "blocked", error: error.message });
      }
    }
  }
}

async function main(argv) {
  const args = parseArgs(argv);
  const listener = new Listener(args);
  let exiting = false;
  const shutdown = (signal) => {
    if (exiting) return;
    exiting = true;
    listener.lifecycle("signal_exit", { signal });
    listener.releaseOwner(`signal:${signal}`);
    process.exit(signal === "SIGTERM" || signal === "SIGINT" ? 0 : 2);
  };
  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
    process.once(signal, () => shutdown(signal));
  }
  process.once("uncaughtException", (error) => {
    listener.lifecycle("uncaught_exception", { error: error && error.message ? error.message : String(error) });
    listener.releaseOwner("uncaught_exception");
    console.error(JSON.stringify(redact({ error: error && error.message ? error.message : String(error) })));
    process.exit(2);
  });
  process.once("unhandledRejection", (reason) => {
    const message = reason && reason.message ? reason.message : String(reason);
    listener.lifecycle("unhandled_rejection", { error: message });
    listener.releaseOwner("unhandled_rejection");
    console.error(JSON.stringify(redact({ error: message })));
    process.exit(2);
  });
  return listener.run();
}

main(process.argv.slice(2))
  .then((code) => { process.exit(code); })
  .catch((error) => {
    console.error(JSON.stringify(redact({ error: error.message })));
    process.exit(2);
  });
