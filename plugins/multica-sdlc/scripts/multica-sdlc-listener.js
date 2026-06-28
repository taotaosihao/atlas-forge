#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const router = require("./multica-next-role-router-core");

const PLUGIN_ROOT = path.resolve(__dirname, "..");
const DEFAULT_TEMPLATE = path.join(PLUGIN_ROOT, "templates", "multica-sdlc-workflow.yaml");
const DEFAULT_EVENT_TYPES = "issue:created,issue:updated,issue_metadata:changed,comment:created,pull_request:linked,pull_request:updated,task:completed,task:failed";
const ALLOWED_APPLY_ACTIONS = new Set(["comment", "metadata", "leader-task"]);
const IMPLEMENTED_APPLY_ACTIONS = new Set(["comment", "metadata"]);

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

function mkdirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function appendJsonl(filePath, record) {
  mkdirFor(filePath);
  fs.closeSync(fs.openSync(filePath, "a", 0o600));
  fs.appendFileSync(filePath, `${JSON.stringify(redact(record))}\n`, "utf8");
}

function loadJsonlKeys(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return new Set();
  const keys = new Set();
  for (const raw of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!raw.trim()) continue;
    try {
      const parsed = JSON.parse(raw);
      const key = parsed.apply_dedupe_key || parsed.dedupe_key;
      if (key) keys.add(String(key));
    } catch {
      keys.add(raw.trim());
    }
  }
  return keys;
}

function parseArgs(argv) {
  const args = {
    template: DEFAULT_TEMPLATE,
    journal: path.join(process.env.HOME || ".", ".agents/multica-sdlc/listener-journal.jsonl"),
    dedupeStore: path.join(process.env.HOME || ".", ".agents/multica-sdlc/listener-dedupe.jsonl"),
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
    logJson: false,
    reconcileOnly: false,
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
    else if (arg === "--max-reconnects") args.maxReconnects = Number(next());
    else if (arg === "--reconnect-delay") args.reconnectDelay = Number(next()) * 1000;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (args.stateDir) {
    fs.mkdirSync(args.stateDir, { recursive: true });
    args.journal = path.join(args.stateDir, "listener-journal.jsonl");
    args.dedupeStore = path.join(args.stateDir, "listener-dedupe.jsonl");
  }
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
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl ? baseUrl.replace(/\/$/, "") : "";
    this.token = token;
    this.writeCalls = 0;
  }

  async request(method, requestPath, body) {
    if (!this.baseUrl) throw new Error("api-url is required for hydration");
    const headers = { Accept: "application/json" };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const options = { method, headers };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    const response = await fetch(`${this.baseUrl}${requestPath}`, options);
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
    this.api = new ApiClient(args.apiUrl, this.token);
    this.eventTypes = splitCsv([args.eventTypes]);
    this.watchIssues = new Set(args.watchIssue);
    this.watchParents = new Set(args.watchParent);
    this.agentAllowlist = splitCsv(args.agentAllowlist);
    this.squadAllowlist = splitCsv(args.squadAllowlist);
    this.metadataFilter = parseMetadataFilter(args.metadataFilter);
    this.allowActions = splitCsv(args.allowAction);
    this.applyKeys = loadJsonlKeys(args.dedupeStore);
    this.seenEvents = 0;
    this.authenticatedOnce = false;
    this.validate();
  }

  validate() {
    if (this.args.apply && !this.allowActions.size) throw new Error("--apply requires --allow-action");
    for (const action of this.allowActions) {
      if (!ALLOWED_APPLY_ACTIONS.has(action)) throw new Error(`unsupported --allow-action: ${action}`);
    }
    if (!this.watchIssues.size && !this.watchParents.size && !Object.keys(this.metadataFilter).length && !this.agentAllowlist.size && !this.squadAllowlist.size) {
      throw new Error("at least one watch filter is required");
    }
  }

  applyMode() {
    return this.args.apply ? "apply" : "dry-run";
  }

  log(record) {
    const safe = redact({ ts: utcNow(), ...record });
    if (this.args.logJson) console.log(JSON.stringify(safe));
    else console.log(`${safe.ts} ${safe.status || safe.event_type || safe.state || "listener"} ${safe.message || safe.classification || safe.apply_result || ""}`.trim());
  }

  journal(record) {
    appendJsonl(this.args.journal, { ts: utcNow(), ...record });
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
        finish(this.args.once ? 2 : 1);
      });
      ws.addEventListener("error", () => {
        this.log({ state: "disconnected", message: "websocket error" });
      });
    });
  }

  recordDrop(reason, extra = {}) {
    this.log({ status: "dropped", classification: reason, ...extra });
    this.journal({ event_type: "drop", classification: reason, apply_mode: this.applyMode(), apply_result: "suppressed", ...extra });
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
    if (!this.preFilter(eventType, payload, frame)) {
      this.recordDrop("watch_filter_miss", { event_type: eventType, source });
      return;
    }
    this.seenEvents += 1;
    const normalized = await this.hydrateAndNormalize(eventType, payload);
    if (normalized.drop || normalized.classification === "blocked_unknown_fact") {
      this.recordDecision(eventType, normalized, null, normalized.drop ? "suppressed" : "blocked");
      return;
    }
    let decision;
    try {
      decision = router.route(this.template, normalized.router_event);
    } catch (error) {
      normalized.classification = "blocked_unknown_fact";
      normalized.blocker = `router_error: ${error.message}`;
      this.recordDecision(eventType, normalized, null, "blocked");
      return;
    }
    const applyResult = await this.applyDecision(normalized, decision);
    this.recordDecision(eventType, normalized, decision, applyResult);
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
    if ([...ids].some((id) => this.watchIssues.has(id) || this.watchParents.has(id))) return true;
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
      const issue = unwrapIssue(await this.api.get(`/api/issues/${encodeURIComponent(issueId)}`));
      const metadata = await this.readMetadata(issueId, issue);
      const children = asList(await this.api.get(`/api/issues/${encodeURIComponent(issueId)}/children`));
      const prs = asList(await this.api.get(`/api/issues/${encodeURIComponent(issueId)}/pull-requests`));
      const messages = await this.readTaskMessages(payload.task_id);
      const parentIssueId = String(issue.parent_id || issue.parent_issue_id || "");
      if (this.watchIssues.size && !this.watchIssues.has(issueId) && !this.watchIssues.has(parentIssueId)) {
        return { drop: true, classification: "watch_filter_miss", router_event: { issue_id: issueId, parent_issue_id: parentIssueId || null } };
      }
      if (this.watchParents.size && !this.watchParents.has(issueId) && !this.watchParents.has(parentIssueId)) {
        return { drop: true, classification: "watch_filter_miss", router_event: { issue_id: issueId, parent_issue_id: parentIssueId || null } };
      }
      const facts = this.extractSdlcFacts(metadata, messages, prs);
      const routerEvent = {
        issue_id: issueId,
        parent_issue_id: parentIssueId || null,
        phase: facts.phase,
        source_role: facts.source_role,
        result: facts.result,
        commit_sha: facts.commit_sha,
        completed_roles: facts.completed_roles || {},
        task_id: payload.task_id,
        source_run_id: payload.task_id || payload.run_id,
        comment_id: payload.comment_id,
        artifact_type: facts.artifact_type,
      };
      let classification = this.classify(eventType, issue, children, prs, facts);
      const missing = ["phase", "source_role", "result"].filter((key) => !routerEvent[key]);
      if (missing.length) classification = "blocked_unknown_fact";
      return {
        classification,
        missing_facts: missing,
        router_event: routerEvent,
        issue: { id: issueId, status: issue.status, parent_issue_id: parentIssueId || null },
        children_count: children.length,
        pr_count: prs.length,
        source_event_id: String(payload.event_id || payload.task_id || payload.comment_id || ""),
      };
    } catch (error) {
      return { classification: "blocked_unknown_fact", blocker: error.message, router_event: { issue_id: issueId } };
    }
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

  extractSdlcFacts(metadata, messages, prs) {
    const facts = {};
    const map = {
      "multica_sdlc.phase": "phase",
      "multica_sdlc.source_role": "source_role",
      "multica_sdlc.result": "result",
      "multica_sdlc.commit_sha": "commit_sha",
      "multica_sdlc.artifact_type": "artifact_type",
    };
    for (const [key, outKey] of Object.entries(map)) if (metadata[key] !== undefined) facts[outKey] = metadata[key];
    if (metadata["multica_sdlc.completed_roles"] !== undefined) facts.completed_roles = this.parseCompletedRoles(metadata["multica_sdlc.completed_roles"]);
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
      } catch {
        continue;
      }
    }
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
    const status = String(issue.status || "");
    const prStates = new Set(prs.filter(Boolean).map((pr) => String(pr.state || pr.status || "").toLowerCase()));
    if (status === "done" || status === "cancelled") return "terminal_child_barrier";
    if (status === "in_review" || prStates.has("draft") || eventType.startsWith("pull_request:")) return "nonterminal_leader_gate";
    if (children.some((child) => child && !child.stage)) return "unstaged_sibling_barrier";
    if (facts.commit_sha && prStates.size && !prStates.has("open") && !prStates.has("draft")) return "stale_commit_or_pr";
    return "missing_required_role";
  }

  applyDedupeKey(normalized, decision, action) {
    const event = normalized.router_event || {};
    return sha(JSON.stringify({
      workspace: this.args.workspaceSlug || this.args.workspaceId || "unknown-workspace",
      watched_parent: [...this.watchParents].sort(),
      issue_id: event.issue_id,
      source_event: normalized.source_event_id || event.task_id || event.comment_id || "unknown-source",
      router_dedupe_key: decision.dedupe_key,
      apply_action: action,
    }));
  }

  async applyDecision(normalized, decision) {
    if (!this.args.apply) return "suppressed";
    if (["wait", "duplicate", "error"].includes(decision.action)) return "blocked";
    const results = [];
    for (const action of [...this.allowActions].sort()) {
      const key = this.applyDedupeKey(normalized, decision, action);
      if (this.applyKeys.has(key)) {
        results.push(`${action}:duplicate`);
        continue;
      }
      if (!IMPLEMENTED_APPLY_ACTIONS.has(action)) {
        results.push(`${action}:blocked`);
        continue;
      }
      if (action === "comment") await this.applyComment(normalized, decision);
      if (action === "metadata") await this.applyMetadata(normalized, decision);
      appendJsonl(this.args.dedupeStore, { apply_dedupe_key: key, action, router_dedupe_key: decision.dedupe_key });
      this.applyKeys.add(key);
      results.push(`${action}:applied`);
    }
    return results.join(",") || "blocked";
  }

  async applyComment(normalized, decision) {
    const event = normalized.router_event;
    const issueId = event.parent_issue_id || event.issue_id;
    const content = [
      "[multica-sdlc-listener]",
      `classification: ${normalized.classification}`,
      `router_action: ${decision.action}`,
      `next_phase: ${decision.next_phase}`,
      `next_roles: ${(decision.next_roles || []).join(", ") || "(none)"}`,
      `reason_code: ${decision.reason_code}`,
      `dedupe_key: ${decision.dedupe_key}`,
    ].join("\n");
    await this.api.post(`/api/issues/${encodeURIComponent(issueId)}/comments`, { content: redactText(content) });
  }

  async applyMetadata(normalized, decision) {
    const event = normalized.router_event;
    const issueId = event.parent_issue_id || event.issue_id;
    const value = JSON.stringify({
      ts: utcNow(),
      action: decision.action,
      next_phase: decision.next_phase,
      reason_code: decision.reason_code,
      dedupe_key: decision.dedupe_key,
    });
    await this.api.put(`/api/issues/${encodeURIComponent(issueId)}/metadata/multica_listener.last_decision`, { value });
  }

  recordDecision(eventType, normalized, decision, applyResult) {
    const event = normalized.router_event || {};
    const record = {
      event_type: eventType,
      source_event_id: normalized.source_event_id || null,
      issue_id: event.issue_id,
      parent_issue_id: event.parent_issue_id,
      classification: normalized.classification,
      missing_facts: normalized.missing_facts || [],
      router_decision: decision,
      apply_mode: this.applyMode(),
      apply_action: this.args.apply ? [...this.allowActions].sort().join(",") : null,
      apply_result: applyResult,
      redactions: ["token", "cookie", "private_key", "api_key", "secret"],
    };
    this.log({ event_type: eventType, classification: record.classification, apply_result: applyResult });
    this.journal(record);
  }

  async reconcile(reason) {
    const watched = [...new Set([...this.watchParents, ...this.watchIssues])].sort();
    if (!watched.length) return;
    this.log({ state: "snapshot_or_reconcile", message: reason, watched_count: watched.length });
    for (const issueId of watched) {
      try {
        await this.api.get(`/api/issues/${encodeURIComponent(issueId)}`);
        await this.api.get(`/api/issues/${encodeURIComponent(issueId)}/children`);
        await this.api.get(`/api/issues/${encodeURIComponent(issueId)}/pull-requests`);
        this.journal({ event_type: "reconcile", issue_id: issueId, classification: "bounded_reconciliation", apply_mode: this.applyMode(), apply_result: "suppressed" });
      } catch (error) {
        this.journal({ event_type: "reconcile", issue_id: issueId, classification: "blocked_unknown_fact", apply_mode: this.applyMode(), apply_result: "blocked", error: error.message });
      }
    }
  }
}

async function main(argv) {
  const args = parseArgs(argv);
  const listener = new Listener(args);
  return listener.run();
}

main(process.argv.slice(2))
  .then((code) => { process.exit(code); })
  .catch((error) => {
    console.error(JSON.stringify(redact({ error: error.message })));
    process.exit(2);
  });
