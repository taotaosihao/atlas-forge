#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_CONFIG = {
  schemaVersion: 1,
  objectiveStoreDir: "~/.paseo-agent-guard/objectives",
  orchestratorSelector: {
    labels: { role: "orchestrator" }
  },
  childAgents: {
    requiredLabels: ["room", "parent", "phase", "task", "role"],
    requiredEvidenceFields: ["agent", "cwd", "branch", "task", "labels"],
    requiredSkills: ["paseo-agent-guard"],
    implementationRoles: ["implementation", "fix", "validation", "audit", "pr"],
    runningStatuses: ["running", "thinking", "queued", "starting", "needs_permission"],
    finishedStatuses: ["idle", "complete", "completed", "done"],
    failureStatuses: ["failed", "error", "crashed", "cancelled", "canceled", "timed_out", "timeout"],
    closeOnCompletion: true,
    permissionModeDefaults: {
      codex: "full-access",
      claude: "bypassPermissions",
      gemini: "yolo",
      mimo: "bypassPermissions"
    }
  },
  workflow: {
    safeSignals: ["PLAN_READY", "DONE", "FIXED", "PASS"],
    blockedSignals: ["BLOCKED", "NEEDS_FIX", "NEEDS_USER_DECISION", "ERROR"],
    recoverableBlockedSignals: ["BLOCKED", "NEEDS_FIX"],
    terminalSignals: ["PR_CREATED", "MERGED"],
    diagnosticSignals: ["START", "FIX_STARTED", "PR_REVIEW_GATE_STARTED", "PR_REVIEW_STATUS", "REVIEW_STATUS", "AGENT_STATUS", "CHILD_AGENT_STATUS", "PROGRESS", "CHECKPOINT"],
    protectedActions: [
      "merge",
      "delete branch",
      "branch deletion",
      "delete agent",
      "archive agent",
      "close agent",
      "force archive",
      "daemon restart",
      "restart daemon",
      "new project phase"
    ]
  },
  policy: {
    autoContinue: true,
    handoffMode: false,
    cooldownSeconds: 60,
    maxRetries: 3,
    allowNewPhaseAfterMerge: false,
    checkGitWorktrees: true
  },
  reviewPolicy: {
    reviewers: ["claude", "codex", "gemini", "mimo"],
    ignoreUnavailableReviewers: true,
    phases: {
      prd: {
        multiAgentReview: true,
        defaultRounds: 1,
        humanReviewAfterMultiAgent: true,
        untilCleanOverride: true
      },
      plan: {
        multiAgentReview: true,
        defaultRounds: 3,
        untilCleanOverride: true
      },
      feature: {
        multiAgentReview: true,
        defaultRounds: 3,
        untilCleanOverride: true
      },
      pr: {
        multiAgentReview: true,
        defaultRounds: 3,
        untilCleanOverride: true
      }
    }
  },
  commands: {
    paseo: "paseo",
    ls: ["ls", "--json"],
    inspect: ["inspect", "{agentId}", "--json"],
    chatRead: ["chat", "read", "{room}", "--limit", "{limit}", "--json"],
    chatPost: ["chat", "post", "{room}", "{message}", "--json"],
    send: ["send", "{agentId}", "--prompt", "{prompt}", "--no-wait", "--json"],
    agentWait: ["wait", "{agentId}", "--json"],
    archive: ["archive", "{agentId}", "--json"],
    chatWait: ["chat", "wait", "{room}", "--timeout", "{timeout}", "--json"]
  },
  chatReadLimit: 50,
  watch: {
    timeout: "10m",
    agentStatusPollTimeout: "15s",
    cooldownPollTimeout: "15s"
  }
};

const STATUS_ACTIVE = "active";
const STATUS_PAUSED = "paused";
const STATUS_BLOCKED = "blocked";
const STATUS_COMPLETE = "complete";
const HANDOFF_ALLOWED_PROTECTED_ACTIONS = new Set(["merge", "new project phase"]);

export class GuardError extends Error {
  constructor(message, code = "guard_error") {
    super(message);
    this.name = "GuardError";
    this.code = code;
  }
}

export function parseCliArgs(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      result._.push(arg);
      continue;
    }

    const eqIndex = arg.indexOf("=");
    if (eqIndex !== -1) {
      result[arg.slice(2, eqIndex)] = arg.slice(eqIndex + 1);
      continue;
    }

    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      result[key] = next;
      index += 1;
    } else {
      result[key] = true;
    }
  }
  return result;
}

export function expandHome(value) {
  if (typeof value !== "string") {
    return value;
  }
  if (value === "~") {
    return homedir();
  }
  if (value.startsWith("~/")) {
    return join(homedir(), value.slice(2));
  }
  return value;
}

function deepMerge(base, override) {
  if (!override || typeof override !== "object" || Array.isArray(override)) {
    return override === undefined ? base : override;
  }

  const merged = { ...(base || {}) };
  for (const [key, value] of Object.entries(override)) {
    const baseValue = merged[key];
    if (
      baseValue &&
      typeof baseValue === "object" &&
      !Array.isArray(baseValue) &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      merged[key] = deepMerge(baseValue, value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const tempPath = join(dirname(path), `.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`);
  try {
    writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(tempPath, path);
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw error;
  }
}

function resolveFromConfigDir(pathValue, configDir) {
  const expanded = expandHome(pathValue);
  if (!expanded) {
    return expanded;
  }
  return isAbsolute(expanded) ? resolve(expanded) : resolve(configDir, expanded);
}

export function normalizeConfig(rawConfig, configPath = process.cwd()) {
  const configDir = dirname(resolve(configPath));
  const config = deepMerge(DEFAULT_CONFIG, rawConfig);
  const required = ["objective", "projectName", "room", "researchWorkspace", "targetWorkspace"];
  const missing = required.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new GuardError(`config_missing_required_fields: ${missing.join(", ")}`, "config_invalid");
  }

  config.configPath = resolve(configPath);
  config.objectiveStoreDir = resolveFromConfigDir(config.objectiveStoreDir, configDir);
  config.researchWorkspace = resolveFromConfigDir(config.researchWorkspace, configDir);
  config.targetWorkspace = resolveFromConfigDir(config.targetWorkspace, configDir);
  config.allowedImplementationRoots = (config.allowedImplementationRoots || []).map((entry) =>
    resolveFromConfigDir(entry, configDir)
  );
  config.watch = config.watch || {};
  config.watch.logDir = config.watch.logDir
    ? resolveFromConfigDir(config.watch.logDir, configDir)
    : join(dirname(config.objectiveStoreDir), "logs");
  return config;
}

export function loadConfig(configPath) {
  if (!configPath) {
    throw new GuardError("missing --config <path>", "config_missing");
  }
  const resolvedPath = resolve(expandHome(configPath));
  return normalizeConfig(loadJson(resolvedPath), resolvedPath);
}

export function sanitizeSegment(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "default";
}

export function objectivePathFor(config) {
  return join(
    config.objectiveStoreDir,
    sanitizeSegment(config.projectName),
    `${sanitizeSegment(config.room)}.json`
  );
}

export function createObjective(config, now = new Date()) {
  const timestamp = now.toISOString();
  return {
    objective: config.objective,
    projectName: config.projectName,
    room: config.room,
    researchWorkspace: config.researchWorkspace,
    targetWorkspace: config.targetWorkspace,
    orchestratorSelector: config.orchestratorSelector,
    status: STATUS_ACTIVE,
    lastHandledMessageId: null,
    lastHandledMessageCreatedAt: null,
    lastDecision: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function readObjective(config) {
  const path = objectivePathFor(config);
  if (!existsSync(path)) {
    return null;
  }
  return loadJson(path);
}

export function initObjective(config, { now = new Date(), force = false } = {}) {
  const path = objectivePathFor(config);
  const existing = !force ? readObjective(config) : null;
  const timestamp = now.toISOString();
  const objective = {
    ...(existing || createObjective(config, now)),
    objective: config.objective,
    projectName: config.projectName,
    room: config.room,
    researchWorkspace: config.researchWorkspace,
    targetWorkspace: config.targetWorkspace,
    orchestratorSelector: config.orchestratorSelector,
    status: existing?.status || STATUS_ACTIVE,
    lastHandledMessageCreatedAt: existing?.lastHandledMessageCreatedAt ?? null,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp
  };
  writeJson(path, objective);
  return { path, objective };
}

export function setObjectiveStatus(config, status, { now = new Date() } = {}) {
  const objective = readObjective(config);
  if (!objective) {
    throw new GuardError("objective_missing: run init first", "objective_missing");
  }
  const timestamp = now.toISOString();
  const next = {
    ...objective,
    status,
    lastDecision: {
      action: status,
      reason: `manual_${status}`,
      decidedAt: timestamp
    },
    updatedAt: timestamp
  };
  writeJson(objectivePathFor(config), next);
  return next;
}

function splitCommandLine(value) {
  if (Array.isArray(value)) {
    return value;
  }
  const result = [];
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^']*)'|[^\s]+/g;
  let match;
  while ((match = pattern.exec(String(value))) !== null) {
    result.push(match[1] ?? match[2] ?? match[0]);
  }
  return result;
}

function templateToken(token, vars) {
  return String(token).replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    if (vars[key] === undefined || vars[key] === null) {
      return "";
    }
    return String(vars[key]);
  });
}

export function buildPaseoArgs(config, commandName, vars = {}, extraArgs = []) {
  const command = config.commands?.[commandName];
  if (!command) {
    throw new GuardError(`command_not_configured: ${commandName}`, "command_invalid");
  }
  return [...splitCommandLine(command).map((part) => templateToken(part, vars)), ...extraArgs];
}

export function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error
  };
}

export function runPaseoCommand(config, commandName, vars = {}, extraArgs = [], runner = runCommand) {
  const command = config.commands?.paseo || "paseo";
  const args = buildPaseoArgs(config, commandName, vars, extraArgs);
  const result = runner(command, args);
  if (result.error) {
    throw new GuardError(`paseo_command_error: ${result.error.message}`, "paseo_command_error");
  }
  if (result.status !== 0) {
    throw new GuardError(
      `paseo_command_failed: ${command} ${args.join(" ")}\n${result.stderr || result.stdout}`,
      "paseo_command_failed"
    );
  }
  return result;
}

function parseJsonOutput(result, commandName) {
  const text = result.stdout.trim();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new GuardError(`invalid_json_from_${commandName}: ${error.message}`, "invalid_json");
  }
}

function watcherPaths(config) {
  return {
    pidFile: join(
      config.watch.logDir,
      sanitizeSegment(config.projectName),
      `${sanitizeSegment(config.room)}.pid`
    ),
    logFile: join(
      config.watch.logDir,
      sanitizeSegment(config.projectName),
      `${sanitizeSegment(config.room)}.jsonl`
    )
  };
}

function readPidFile(path) {
  if (!existsSync(path)) {
    return null;
  }
  const raw = readFileSync(path, "utf8").trim();
  const pid = Number(raw);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function isProcessAlive(pid) {
  if (!pid) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function processInfoForPid(pid) {
  if (!pid || !isProcessAlive(pid)) {
    return { alive: false, command: null };
  }
  const result = runCommand("ps", ["-p", String(pid), "-o", "command="]);
  if (result.status !== 0) {
    return { alive: true, command: null };
  }
  return {
    alive: true,
    command: result.stdout.trim()
  };
}

function commandIsGuardWatcher(command, config) {
  const text = String(command || "");
  return text.includes("paseo-guard-watch") && text.includes(config.configPath);
}

export function watcherStatus(config, { processInspector = processInfoForPid } = {}) {
  const paths = watcherPaths(config);
  const pid = readPidFile(paths.pidFile);
  const processInfo = pid ? processInspector(pid) : { alive: false, command: null };
  const processMatches = processInfo.alive ? commandIsGuardWatcher(processInfo.command, config) : false;
  const running = Boolean(processInfo.alive && processMatches);
  return {
    running,
    stale: Boolean(pid && !running),
    pid,
    processAlive: Boolean(processInfo.alive),
    processMatches,
    processCommand: processInfo.command || null,
    pidFile: paths.pidFile,
    logFile: paths.logFile
  };
}

function launchWatchProcess(config, paths) {
  mkdirSync(dirname(paths.logFile), { recursive: true });
  const fd = openSync(paths.logFile, "a", 0o600);
  try {
    const script = join(dirname(fileURLToPath(import.meta.url)), "paseo-guard-watch.mjs");
    const child = spawn(process.execPath, [script, "--config", config.configPath], {
      detached: true,
      stdio: ["ignore", fd, fd]
    });
    child.unref();
    return { pid: child.pid };
  } finally {
    closeSync(fd);
  }
}

export function ensureWatch(config, { dryRun = false, launcher = launchWatchProcess, processInspector } = {}) {
  const current = watcherStatus(config, { processInspector });
  if (current.running) {
    return {
      action: "already_running",
      watcherStatus: current
    };
  }

  if (dryRun) {
    return {
      action: "would_start",
      watcherStatus: current
    };
  }

  const paths = watcherPaths(config);
  mkdirSync(dirname(paths.pidFile), { recursive: true });
  const launched = launcher(config, paths);
  if (!launched?.pid) {
    throw new GuardError("watcher_launch_failed: missing child pid", "watcher_launch_failed");
  }
  writeFileSync(paths.pidFile, `${launched.pid}\n`, { encoding: "utf8", mode: 0o600 });
  return {
    action: current.stale ? "restarted" : "started",
    previousWatcherStatus: current,
    watcherStatus: watcherStatus(config, { processInspector })
  };
}

function normalizeAgent(raw) {
  const id = raw.id || raw.Id || raw.agentId || raw.AgentId;
  return {
    ...raw,
    id,
    status: String(raw.status || raw.Status || raw.lastStatus || raw.LastStatus || "").toLowerCase(),
    cwd: raw.cwd || raw.Cwd,
    labels: raw.labels || raw.Labels || {},
    name: raw.name || raw.Name || raw.title || raw.Title
  };
}

function normalizeAgents(raw) {
  const list = Array.isArray(raw) ? raw : raw?.agents || raw?.Agents || [];
  return list.map(normalizeAgent).filter((agent) => agent.id);
}

function normalizeMessage(raw) {
  return {
    ...raw,
    id: raw.id || raw.Id || raw.messageId || raw.MessageId,
    author: raw.author || raw.Author || raw.agentId || raw.AgentId,
    body: raw.body || raw.Body || raw.message || raw.Message || "",
    createdAt: raw.createdAt || raw.CreatedAt || raw.timestamp || raw.Timestamp
  };
}

function normalizeMessages(raw) {
  const list = Array.isArray(raw) ? raw : raw?.messages || raw?.Messages || [];
  return list.map(normalizeMessage).filter((message) => message.id);
}

function labelArgs(labels = {}) {
  return Object.entries(labels).flatMap(([key, value]) => ["--label", `${key}=${value}`]);
}

function getPaseoHome(config) {
  return resolve(expandHome(config.paseoHome || process.env.PASEO_HOME || "~/.paseo"));
}

function findAgentStateFile(id, root) {
  if (!id || !existsSync(root)) {
    return null;
  }

  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name === `${id}.json`) {
        return fullPath;
      }
    }
  }
  return null;
}

function readAgentState(id, config) {
  const file = findAgentStateFile(id, join(getPaseoHome(config), "agents"));
  if (!file) {
    return null;
  }
  try {
    return loadJson(file);
  } catch {
    return null;
  }
}

function gitCommonDir(path) {
  const result = runCommand("git", ["-C", path, "rev-parse", "--git-common-dir"]);
  if (result.status !== 0) {
    return null;
  }
  const raw = result.stdout.trim();
  if (!raw) {
    return null;
  }
  const absolute = isAbsolute(raw) ? raw : resolve(path, raw);
  try {
    return realpathSync(absolute);
  } catch {
    return resolve(absolute);
  }
}

function sameGitRepository(firstPath, secondPath) {
  const first = gitCommonDir(firstPath);
  const second = gitCommonDir(secondPath);
  return Boolean(first && second && first === second);
}

export function isPathInside(childPath, parentPath) {
  if (!childPath || !parentPath) {
    return false;
  }
  const child = resolve(expandHome(childPath));
  const parent = resolve(expandHome(parentPath));
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function classifyWorkspace(cwd, config) {
  if (!cwd) {
    return "unknown";
  }
  const resolvedCwd = resolve(expandHome(cwd));
  if (isPathInside(resolvedCwd, config.targetWorkspace)) {
    return "target";
  }
  if (isPathInside(resolvedCwd, config.researchWorkspace)) {
    return "research";
  }
  if (config.policy?.checkGitWorktrees && existsSync(resolvedCwd) && existsSync(config.targetWorkspace)) {
    try {
      if (sameGitRepository(resolvedCwd, config.targetWorkspace)) {
        return "target-worktree";
      }
    } catch {
      // Fall through to explicit root checks.
    }
  }
  if ((config.allowedImplementationRoots || []).some((root) => isPathInside(resolvedCwd, root))) {
    return "target-worktree";
  }
  return "other";
}

function enrichAgents(agents, config) {
  return agents.map((agent) => {
    const state = readAgentState(agent.id, config);
    const cwd = agent.cwd || state?.cwd || state?.Cwd;
    const labels = {
      ...(agent.labels || {}),
      ...(state?.labels || state?.Labels || {})
    };
    return {
      ...agent,
      cwd,
      status: agent.status || String(state?.lastStatus || state?.LastStatus || "").toLowerCase(),
      labels,
      state,
      workspaceKind: classifyWorkspace(cwd, config)
    };
  });
}

export function buildSnapshot(config, runner = runCommand) {
  const orchestratorRaw = parseJsonOutput(
    runPaseoCommand(
      config,
      "ls",
      {},
      labelArgs(config.orchestratorSelector?.labels || {}),
      runner
    ),
    "ls"
  );
  const roomRaw = parseJsonOutput(
    runPaseoCommand(config, "ls", {}, labelArgs({ room: config.room }), runner),
    "ls"
  );
  const messagesRaw = parseJsonOutput(
    runPaseoCommand(
      config,
      "chatRead",
      { room: config.room, limit: config.chatReadLimit || 50 },
      [],
      runner
    ),
    "chatRead"
  );

  const orchestrators = enrichAgents(normalizeAgents(orchestratorRaw), config);
  const roomAgents = enrichAgents(normalizeAgents(roomRaw), config);
  const orchestratorIds = new Set(orchestrators.map((agent) => agent.id));
  const childAgents = roomAgents.filter((agent) => !orchestratorIds.has(agent.id));
  const allAgents = [...orchestrators, ...childAgents];
  const agentById = Object.fromEntries(allAgents.map((agent) => [agent.id, agent]));

  return {
    orchestrators,
    childAgents,
    allAgents,
    agentById,
    messages: normalizeMessages(messagesRaw)
  };
}

export function parseFields(body) {
  const fields = {};
  const pattern = /(?:^|\s)([A-Za-z_][A-Za-z0-9_-]*)=("[^"]*"|'[^']*'|\{[^}]*\}|\[[^\]]*\]|[^\s]+)/g;
  let match;
  while ((match = pattern.exec(String(body))) !== null) {
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fields[match[1]] = value.replace(/[,.]$/, "");
  }
  return fields;
}

function knownSignalSet(config) {
  return new Set([
    ...(config.workflow?.safeSignals || []),
    ...(config.workflow?.blockedSignals || []),
    ...(config.workflow?.terminalSignals || [])
  ]);
}

function knownDiagnosticSignalSet(config) {
  return new Set(config.workflow?.diagnosticSignals || []);
}

function firstSignalToken(value) {
  const match = String(value || "")
    .trim()
    .match(/^([A-Z][A-Z0-9_]+)/);
  return match ? match[1] : null;
}

function signalFromSignalEnvelope(body, signalSet) {
  const fields = parseFields(body);
  const explicitSignal = firstSignalToken(fields.signal);
  if (explicitSignal && signalSet.has(explicitSignal)) {
    return explicitSignal;
  }

  const evidenceSignal = firstSignalToken(fields.evidence);
  return evidenceSignal && signalSet.has(evidenceSignal) ? evidenceSignal : null;
}

export function parseSignal(body, config) {
  const match = String(body || "").trim().match(/^([A-Z][A-Z0-9_]+)/);
  if (!match) {
    return null;
  }
  const signal = match[1];
  const knownSignals = knownSignalSet(config);
  if (knownSignals.has(signal)) {
    return signal;
  }

  return signal === "SIGNAL" ? signalFromSignalEnvelope(body, knownSignals) : null;
}

function parseDiagnosticSignal(body, config) {
  const match = String(body || "").trim().match(/^([A-Z][A-Z0-9_]+)/);
  if (!match) {
    return null;
  }
  const signal = match[1];
  const diagnosticSignals = knownDiagnosticSignalSet(config);
  if (diagnosticSignals.has(signal)) {
    return signal;
  }

  return signal === "SIGNAL" ? signalFromSignalEnvelope(body, diagnosticSignals) : null;
}

function messageTime(message) {
  const time = Date.parse(message.createdAt || "");
  return Number.isNaN(time) ? 0 : time;
}

function unhandledMessages(messages, objective) {
  const ordered = [...messages].sort((left, right) => messageTime(left) - messageTime(right));
  const handledIndex = objective.lastHandledMessageId
    ? ordered.findIndex((message) => message.id === objective.lastHandledMessageId)
    : -1;
  if (handledIndex >= 0) {
    return ordered.slice(handledIndex + 1);
  }

  const handledTime = Date.parse(objective.lastHandledMessageCreatedAt || "");
  if (!Number.isNaN(handledTime)) {
    return ordered.filter((message) => messageTime(message) >= handledTime);
  }

  return ordered;
}

export function unhandledSignals(messages, objective, config) {
  return unhandledMessages(messages, objective)
    .map((message) => ({ message, signal: parseSignal(message.body, config) }))
    .filter((entry) => entry.signal);
}

export function latestUnhandledSignal(messages, objective, config) {
  const signaled = unhandledSignals(messages, objective, config);
  return signaled.at(-1) || null;
}

function lastHandledMessageIdFoundInTail(messages, objective) {
  if (!objective?.lastHandledMessageId) {
    return null;
  }
  return messages.some((message) => message.id === objective.lastHandledMessageId);
}

function labelsFromMessageFields(fields) {
  if (!fields.labels) {
    return {};
  }
  const raw = fields.labels.replace(/^\{|\}$/g, "");
  const labels = {};
  for (const part of raw.split(/[;,]/)) {
    const [key, value] = part.split(/[:=]/).map((item) => item?.trim());
    if (key && value) {
      labels[key] = value;
    }
  }
  return labels;
}

function evidenceFieldValue(key, fields, labels, agent) {
  if (key === "agent") {
    return fields.agent || agent?.id;
  }
  if (key === "labels") {
    return fields.labels || Object.keys(labels).length > 0;
  }
  if (key === "cwd") {
    return fields.cwd || agent?.cwd;
  }
  return fields[key] || labels[key];
}

export function validateDelegationContract(entry, snapshot, config) {
  if (!entry?.message) {
    return null;
  }

  const orchestratorIds = new Set(snapshot.orchestrators.map((agent) => agent.id));
  const author = entry.message.author;
  if (!author) {
    return null;
  }

  const fields = parseFields(entry.message.body);
  const reportedAgentId = fields.agent || author;
  const agent = snapshot.agentById[reportedAgentId] || snapshot.agentById[author];
  const isOrchestratorSelfReport = orchestratorIds.has(author) && reportedAgentId === author;

  if (!agent && !fields.agent) {
    return null;
  }

  const messageLabels = labelsFromMessageFields(fields);
  const labels = {
    ...(agent?.labels || {}),
    ...messageLabels
  };
  const role = String(labels.role || fields.role || "").toLowerCase();
  const implementationRoles = new Set(
    (config.childAgents?.implementationRoles || []).map((item) => String(item).toLowerCase())
  );
  const isImplementationReport = implementationRoles.has(role);
  const isRoomChild =
    labels.room === config.room ||
    fields.room === config.room ||
    Boolean(labels.parent || fields.parent || (!isOrchestratorSelfReport && agent));

  if (!isRoomChild && !isImplementationReport) {
    return null;
  }

  if (isOrchestratorSelfReport && !isImplementationReport) {
    return null;
  }

  const missingLabels = (config.childAgents?.requiredLabels || []).filter((key) => !labels[key]);
  const missingEvidence = (config.childAgents?.requiredEvidenceFields || []).filter(
    (key) => !evidenceFieldValue(key, fields, messageLabels, agent)
  );

  const cwd = fields.cwd || agent?.cwd;
  const workspaceKind = agent?.workspaceKind || classifyWorkspace(cwd, config);
  const workspaceViolations = [];
  if (implementationRoles.has(role) && !["target", "target-worktree"].includes(workspaceKind)) {
    workspaceViolations.push(
      `role=${role} must run in targetWorkspace or a target worktree, got ${workspaceKind}:${cwd || "unknown"}`
    );
  }

  const violations = [];
  if (missingLabels.length > 0) {
    violations.push(`missing_labels=${missingLabels.join(",")}`);
  }
  if (missingEvidence.length > 0) {
    violations.push(`missing_evidence=${missingEvidence.join(",")}`);
  }
  violations.push(...workspaceViolations);

  if (violations.length === 0) {
    return null;
  }

  return {
    type: "delegation_contract_violation",
    author,
    reportedAgentId,
    signal: entry.signal,
    messageId: entry.message.id,
    violations
  };
}

function isHandoffMode(config) {
  return Boolean(config.policy?.handoffMode);
}

function isHandoffAllowedProtectedAction(action, config) {
  return isHandoffMode(config) && HANDOFF_ALLOWED_PROTECTED_ACTIONS.has(String(action || "").toLowerCase());
}

function escapedProtectedAction(action) {
  return String(action)
    .toLowerCase()
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
}

function protectedActionRegex(action, flags = "") {
  const escaped = escapedProtectedAction(action);
  if (!escaped) {
    return null;
  }
  return new RegExp(`(^|[^a-z0-9_])(${escaped})([^a-z0-9_]|$)`, flags);
}

function containsProtectedActionMention(text, protectedActions) {
  return protectedActions.some((action) => {
    const pattern = protectedActionRegex(action);
    return pattern?.test(text);
  });
}

function negationPrefixCoversAction(prefix, protectedActions) {
  if (!/(?:,|\band\b|\bor\b)/.test(prefix)) {
    return true;
  }
  return containsProtectedActionMention(prefix, protectedActions);
}

function isNegatedProtectedActionMention(lower, actionStart, protectedActions) {
  const context = lower.slice(Math.max(0, actionStart - 120), actionStart);
  const currentClause = context.split(/[.!?:;\n\r]/).pop() || "";
  const normalized = currentClause.replace(/[("'`[\]{}]/g, " ").replace(/\s+/g, " ");
  const listNegation = normalized.match(/(?:^|[^a-z0-9_])(?:no|without|never)\s+((?:(?:[a-z0-9_#/-]+|,|and|or)\s*){0,12})$/);
  if (listNegation && negationPrefixCoversAction(listNegation[1] || "", protectedActions)) {
    return true;
  }

  const directNegation = normalized.match(/(?:^|[^a-z0-9_])(?:not|did\s+not|do\s+not|does\s+not|didn't|don't|doesn't)\s+((?:(?:[a-z0-9_#/-]+|and|or)\s*){0,8})$/);
  return Boolean(directNegation && negationPrefixCoversAction(directNegation[1] || "", protectedActions));
}

function hasUnnegatedProtectedAction(lower, action, protectedActions) {
  const pattern = protectedActionRegex(action, "g");
  if (!pattern) {
    return false;
  }

  for (let match = pattern.exec(lower); match; match = pattern.exec(lower)) {
    const actionStart = match.index + match[1].length;
    if (!isNegatedProtectedActionMention(lower, actionStart, protectedActions)) {
      return true;
    }
  }
  return false;
}

function protectedActionsInText(text, config) {
  const lower = String(text || "").toLowerCase();
  const protectedActions = config.workflow?.protectedActions || [];
  return protectedActions.filter((action) => hasUnnegatedProtectedAction(lower, action, protectedActions));
}

function blockingProtectedAction(text, config) {
  return protectedActionsInText(text, config).find((action) => !isHandoffAllowedProtectedAction(action, config));
}

function isRunningAgent(agent, config) {
  return new Set(config.childAgents?.runningStatuses || []).has(String(agent.status || "").toLowerCase());
}

function isUnavailableOrchestrator(agent) {
  const status = String(agent?.status || "").toLowerCase();
  return Boolean(agent?.archived || agent?.Archived) || status === "closed" || status === "failed" || status === "error";
}

function selectOrchestrator(orchestrators = []) {
  return orchestrators.find((agent) => !isUnavailableOrchestrator(agent)) || null;
}

function isOrchestratorIdle(agent) {
  const status = String(agent?.status || "").toLowerCase();
  return status === "idle" || status === "complete" || status === "done";
}

function cooldownActive(objective, config, now) {
  const last = objective.lastContinuationAt || objective.lastDecision?.decidedAt;
  if (!last) {
    return false;
  }
  const elapsedMs = now.getTime() - Date.parse(last);
  return elapsedMs < (config.policy?.cooldownSeconds || 0) * 1000;
}

function decision(action, reason, extra = {}) {
  return { action, reason, ...extra };
}

function buildReviewPolicyInstructions(config) {
  const policy = config.reviewPolicy || {};
  const reviewers = Array.isArray(policy.reviewers) && policy.reviewers.length > 0
    ? policy.reviewers.join(", ")
    : "none";
  const phases = policy.phases || {};
  const threeRoundPhases = ["plan", "feature", "pr"]
    .filter((phase) => phases[phase]?.multiAgentReview)
    .map((phase) => `${phase}=${phases[phase]?.defaultRounds || 3}`);
  const prePrPhases = ["plan", "feature"]
    .filter((phase) => phases[phase]?.multiAgentReview)
    .map((phase) => `${phase}=${phases[phase]?.defaultRounds || 3}`);
  const prdRounds = phases.prd?.defaultRounds || 1;
  const reviewRoundsInstruction = isHandoffMode(config)
    ? `- Plan and feature review gates must run exactly these default review rounds: ${prePrPhases.join(", ")}. PR review gates must continue without human confirmation through review/fix/re-review until all available reviewers report no findings, then merge.`
    : `- Plan, feature, and PR review gates must run exactly these default review rounds unless the user asks to review until there are no issues: ${threeRoundPhases.join(", ")}.`;

  const instructions = [
    "Review policy:",
    `- Required multi-agent reviewers: ${reviewers}.`,
    policy.ignoreUnavailableReviewers
      ? "- Try every configured reviewer for each required review gate; if a reviewer/provider is unavailable, record that skip in the room evidence and continue with the available reviewers."
      : "- Try every configured reviewer for each required review gate; unavailable reviewers are blockers unless the user explicitly overrides.",
    `- PRD flow: draft or update PRD, run multi-agent review with the available reviewers for ${prdRounds} round(s), fix findings, then stop for human review.`,
    reviewRoundsInstruction,
    isHandoffMode(config)
      ? "- In handoff mode, do not stop for human confirmation during PR review, PR re-review, PR merge, or approved post-merge continuation; stop only for PRD human review after resolved multi-agent findings or an unrecoverable blocker that genuinely requires human intervention."
      : "- Human confirmation is required at configured terminal gates unless the user explicitly approved continuation.",
    "- If the user asks to review until there are no issues, continue review/fix/re-review cycles until all available reviewers report no findings.",
    "- Do not treat PRD as human-review-ready until the multi-agent review findings are resolved."
  ];

  return instructions;
}

function buildAgentPermissionInstructions(config) {
  const modes = config.childAgents?.permissionModeDefaults || {};
  const modeEntries = Object.entries(modes)
    .map(([provider, mode]) => `${provider}=${mode}`)
    .join(", ");
  const effectiveModes = modeEntries || "none";

  return [
    "Agent launch defaults:",
    `- Use YOLO-equivalent permissions by default for child agents. Provider mode defaults: ${effectiveModes}.`,
    "- Codex uses mode `full-access` as its YOLO-equivalent mode.",
    "- Claude Code-based providers, including `claude` and `mimo`, use mode `bypassPermissions`.",
    "- Pass the provider-specific mode at launch time (`paseo run --mode <mode>` or API `modeId=<mode>`); do not leave child agents on default permission prompts."
  ];
}

function buildChildAgentPromptInstructions(config) {
  const requiredSkills = Array.isArray(config.childAgents?.requiredSkills)
    ? config.childAgents.requiredSkills.filter(Boolean)
    : [];
  const skillsText = requiredSkills.length > 0 ? requiredSkills.join(", ") : "none";

  return [
    "Child-agent prompt contract:",
    `- Every child-agent prompt must explicitly tell the child agent to use these required skill(s): ${skillsText}.`,
    "- Put the room, workspace, label, permission-mode, and evidence requirements directly in each child-agent prompt; do not rely on inherited parent context.",
    "- If the child task has a domain-specific skill, name that skill explicitly in the child-agent prompt together with the guard skill."
  ];
}

function buildChildAgentWaitInstructions(config) {
  const command = (config.commands?.agentWait || ["wait", "{agentId}", "--json"])
    .join(" ")
    .replace("{agentId}", "<agent-id>");

  return [
    "Child-agent wait contract:",
    `- After every parent-launched child agent is created or sent in background/no-wait mode, immediately start a background wait with \`paseo ${command}\` as an auxiliary idle notification path.`,
    "- Run the wait as a background process/job; do not block the parent synchronously on the wait.",
    "- This per-child wait supplements room evidence and the guard watcher; durable continuation comes from `paseo-guard-watch` plus valid SIGNAL reporting."
  ];
}

function buildMissingEvidenceInstructions() {
  return [
    "Missing room evidence recovery:",
    "- If a time check or room read does not show the expected child-agent signal, inspect the child agent status, state, and latest log/error before waiting.",
    "- If a child agent failed, hit quota, lost provider access, or needs permission, record that as room evidence and retry with an available provider or mark the reviewer unavailable according to the review policy.",
    "- If a child agent is idle/complete but did not post room evidence, send it a follow-up asking it to post the required SIGNAL line. If it cannot respond, post a relayed status marked relayed=true and do not count it as reviewer PASS unless the underlying result was observed.",
    "- If the latest room item is only a status summary, read a larger room tail and reconcile against contract signals before concluding there is no work to continue."
  ];
}

function formatCleanupAgents(cleanupAgents = []) {
  if (!cleanupAgents.length) {
    return "completedChildAgentsReadyToClose=none";
  }
  const summary = cleanupAgents
    .map((agent) => {
      const parts = [`id=${agent.id}`, `status=${agent.status || "unknown"}`];
      if (agent.role) {
        parts.push(`role=${agent.role}`);
      }
      if (agent.task) {
        parts.push(`task=${agent.task}`);
      }
      return parts.join(",");
    })
    .join(";");
  return `completedChildAgentsReadyToClose=${summary}`;
}

function buildChildAgentCleanupInstructions(config) {
  const command = (config.commands?.archive || ["archive", "{agentId}", "--json"])
    .join(" ")
    .replace("{agentId}", "<agent-id>");
  return [
    "Child-agent cleanup:",
    config.childAgents?.closeOnCompletion
      ? `- After a child agent posts valid final room evidence and is idle/done, close it promptly with \`paseo ${command}\`.`
      : "- Child-agent auto-close is disabled in config; leave completed child agents active unless the user explicitly asks.",
    "- Never use `--force` for cleanup; never close running, thinking, queued, starting, or needs_permission agents.",
    "- Never close a child agent before its required room evidence is present. If evidence is missing, recover evidence first.",
    "- Archive/close only child agents for this room. Do not delete agents, close the orchestrator, restart the daemon, or delete branches as cleanup."
  ];
}

function latestUnhandledDiagnostic(messages, objective, config) {
  return unhandledMessages(messages, objective)
    .map((message) => ({
      message,
      signal: parseSignal(message.body, config),
      diagnosticSignal: parseDiagnosticSignal(message.body, config)
    }))
    .filter((entry) => !entry.signal && entry.diagnosticSignal)
    .at(-1) || null;
}

function agentStatusSet(config, key) {
  return new Set((config.childAgents?.[key] || []).map((item) => String(item).toLowerCase()));
}

function agentTimestamp(agent) {
  const candidates = [
    agent.updatedAt,
    agent.UpdatedAt,
    agent.completedAt,
    agent.CompletedAt,
    agent.finishedAt,
    agent.FinishedAt,
    agent.createdAt,
    agent.CreatedAt,
    agent.state?.updatedAt,
    agent.state?.UpdatedAt,
    agent.state?.completedAt,
    agent.state?.CompletedAt,
    agent.state?.finishedAt,
    agent.state?.FinishedAt,
    agent.state?.createdAt,
    agent.state?.CreatedAt
  ];
  const times = candidates
    .map((value) => Date.parse(value || ""))
    .filter((value) => !Number.isNaN(value));
  return times.length > 0 ? Math.max(...times) : 0;
}

function objectiveCheckpointTime(objective) {
  const candidates = [
    objective.lastContinuationAt,
    objective.lastDecision?.decidedAt,
    objective.createdAt
  ];
  const times = candidates
    .map((value) => Date.parse(value || ""))
    .filter((value) => !Number.isNaN(value));
  return times.length > 0 ? Math.max(...times) : 0;
}

function messageReportsAgent(message, agentId) {
  if (!agentId) {
    return false;
  }
  const fields = parseFields(message.body);
  return fields.agent === agentId || message.author === agentId;
}

function hasValidContractSignalFromAgent(messages, agentId, snapshot, config) {
  return messages.some((message) => {
    const signal = parseSignal(message.body, config);
    if (!signal || !messageReportsAgent(message, agentId)) {
      return false;
    }
    return !validateDelegationContract({ message, signal }, snapshot, config);
  });
}

function closeableChildAgents(snapshot, config) {
  if (!config.childAgents?.closeOnCompletion) {
    return [];
  }

  const finishedStatuses = agentStatusSet(config, "finishedStatuses");
  return snapshot.childAgents
    .filter((agent) => finishedStatuses.has(String(agent.status || "").toLowerCase()))
    .filter((agent) => hasValidContractSignalFromAgent(snapshot.messages, agent.id, snapshot, config))
    .map((agent) => ({
      id: agent.id,
      status: agent.status,
      role: agent.labels?.role,
      task: agent.labels?.task
    }));
}

function latestChildEvidenceAnomaly(snapshot, objective, config) {
  const failureStatuses = agentStatusSet(config, "failureStatuses");
  const finishedStatuses = agentStatusSet(config, "finishedStatuses");
  const checkpoint = objectiveCheckpointTime(objective);

  const candidates = snapshot.childAgents
    .filter((agent) => !isRunningAgent(agent, config))
    .filter((agent) => !hasValidContractSignalFromAgent(snapshot.messages, agent.id, snapshot, config))
    .filter((agent) => {
      const status = String(agent.status || "").toLowerCase();
      if (failureStatuses.has(status)) {
        return true;
      }
      if (!finishedStatuses.has(status)) {
        return false;
      }
      const timestamp = agentTimestamp(agent);
      return timestamp > 0 && (checkpoint === 0 || timestamp >= checkpoint);
    })
    .sort((left, right) => agentTimestamp(left) - agentTimestamp(right));

  return candidates.at(-1) || null;
}

function formatRecoveryContext(recovery) {
  if (!recovery) {
    return "recoveryContext=none";
  }
  const parts = [`type=${recovery.type}`];
  if (recovery.messageId) {
    parts.push(`messageId=${recovery.messageId}`);
  }
  if (recovery.author) {
    parts.push(`author=${recovery.author}`);
  }
  if (recovery.childAgentId) {
    parts.push(`childAgentId=${recovery.childAgentId}`);
  }
  if (recovery.childAgentStatus) {
    parts.push(`childAgentStatus=${recovery.childAgentStatus}`);
  }
  return `recoveryContext=${parts.join(" ")}`;
}

function messageCreatedAtForId(messages, messageId) {
  if (!messageId) {
    return undefined;
  }
  return messages.find((message) => message.id === messageId)?.createdAt;
}

function derivedLastHandledMessageCreatedAt(messages, objective) {
  return objective?.lastHandledMessageCreatedAt ||
    messageCreatedAtForId(messages || [], objective?.lastHandledMessageId) ||
    null;
}

export function buildContinuationPrompt({ objective, config, signalEntry, reason, violation, recovery, cleanupAgents }) {
  const signalLine = signalEntry
    ? `lastSignal=${signalEntry.signal}\nlastMessageId=${signalEntry.message.id}`
    : "lastSignal=none\nlastMessageId=none";
  const violationLine = violation
    ? `contractViolation=${violation.violations.join("; ")}`
    : "contractViolation=none";
  const recoveryLine = formatRecoveryContext(recovery);
  const cleanupLine = formatCleanupAgents(cleanupAgents);
  const protectedActionInstruction = isHandoffMode(config)
    ? "9. Handoff mode is enabled: config grants explicit approval to complete PR review-until-clean without human confirmation, merge the reviewed PR, post MERGED evidence, and continue into the next approved project phase. Stop only for PRD human review after resolved multi-agent findings or an unrecoverable blocker that genuinely requires human intervention. The guard does not run git or GitHub commands directly; the orchestrator must perform that work through the existing Paseo flow. Do not delete branches, delete agents, force-archive/close running agents, close child agents before room evidence, or restart the daemon without separate explicit approval."
    : "9. Do not merge, delete branches, delete agents, force-archive/close running agents, close child agents before room evidence, restart the daemon, or start a new post-merge phase without explicit user approval.";

  return [
    "PASEO_AGENT_GUARD_CONTINUATION",
    `objective=${objective.objective}`,
    `project=${objective.projectName}`,
    `room=${objective.room}`,
    `researchWorkspace=${config.researchWorkspace}`,
    `targetWorkspace=${config.targetWorkspace}`,
    `reason=${reason}`,
    signalLine,
    violationLine,
    recoveryLine,
    cleanupLine,
    "",
    "Instructions:",
    "1. Read the room state and current project evidence before acting.",
    "2. Take exactly one safe next step, then report back to the room.",
    "3. Planning and research may run in researchWorkspace.",
    "4. Implementation, fix, validation, audit, and PR child agents must run in targetWorkspace or a linked target worktree.",
    "5. Every child agent must include labels: room, parent, phase, task, role.",
    "6. For every parent-launched child agent, use background/no-wait mode, inspect cwd/labels, then start a background `paseo wait <agent-id> --json` until it becomes idle.",
    "7. Post room evidence in this shape: SIGNAL signal=<FIXED|PASS|DONE|PLAN_READY|BLOCKED|NEEDS_FIX|PR_CREATED|MERGED> agent=<id> cwd=<path> branch=<branch> task=<task-id> labels={room=<room>,parent=<id>,phase=<phase>,task=<task>,role=<role>} evidence=<summary>.",
    "8. Continue through room evidence; per-child waits supplement the guard watcher and do not replace SIGNAL reporting.",
    protectedActionInstruction,
    "",
    ...buildChildAgentPromptInstructions(config),
    "",
    ...buildChildAgentWaitInstructions(config),
    "",
    ...buildMissingEvidenceInstructions(config),
    "",
    ...buildChildAgentCleanupInstructions(config),
    "",
    ...buildAgentPermissionInstructions(config),
    "",
    ...buildReviewPolicyInstructions(config)
  ].join("\n");
}

export function decideReconcile(objective, config, snapshot, { now = new Date() } = {}) {
  const timestamp = now.toISOString();
  if (!objective) {
    return decision("block", "objective_missing", {
      nextStatus: STATUS_BLOCKED,
      decidedAt: timestamp
    });
  }

  if (objective.status !== STATUS_ACTIVE) {
    return decision("wait", `objective_${objective.status}`, {
      decidedAt: timestamp
    });
  }

  const orchestrator = selectOrchestrator(snapshot.orchestrators);
  if (!orchestrator) {
    const closedOrchestrators = snapshot.orchestrators.map((agent) => ({
      id: agent.id,
      status: agent.status
    }));
    return decision("block", snapshot.orchestrators.length > 0 ? "orchestrator_unavailable" : "orchestrator_not_found", {
      nextStatus: STATUS_BLOCKED,
      closedOrchestrators,
      decidedAt: timestamp
    });
  }

  if (!isOrchestratorIdle(orchestrator)) {
    return decision("wait", "orchestrator_not_idle", {
      orchestratorId: orchestrator.id,
      orchestratorStatus: orchestrator.status,
      decidedAt: timestamp
    });
  }

  const runningChild = snapshot.childAgents.find((agent) => isRunningAgent(agent, config));
  if (runningChild) {
    return decision("wait", "child_agent_running", {
      childAgentId: runningChild.id,
      childAgentStatus: runningChild.status,
      decidedAt: timestamp
    });
  }

  const cleanupAgents = closeableChildAgents(snapshot, config);
  const signalEntries = unhandledSignals(snapshot.messages, objective, config);
  if (signalEntries.length === 0) {
    const childAnomaly = latestChildEvidenceAnomaly(snapshot, objective, config);
    const diagnosticEntry = latestUnhandledDiagnostic(snapshot.messages, objective, config);
    const recovery = childAnomaly
      ? {
          type: "child_agent_missing_room_evidence",
          childAgentId: childAnomaly.id,
          childAgentStatus: childAnomaly.status
        }
      : diagnosticEntry
        ? {
            type: "unrecognized_room_update",
            messageId: diagnosticEntry.message.id,
            author: diagnosticEntry.message.author,
            messageCreatedAt: diagnosticEntry.message.createdAt
          }
        : null;

    if (recovery) {
      if (cooldownActive(objective, config, now)) {
        return decision("wait", "cooldown_active", {
          messageId: recovery.messageId,
          childAgentId: recovery.childAgentId,
          decidedAt: timestamp
        });
      }

      if (!config.policy?.autoContinue) {
        return decision("wait", "auto_continue_disabled", {
          messageId: recovery.messageId,
          childAgentId: recovery.childAgentId,
          decidedAt: timestamp
        });
      }

      return decision("send", "missing_room_evidence_recovery", {
        messageId: recovery.messageId,
        childAgentId: recovery.childAgentId,
        orchestratorId: orchestrator.id,
        recovery,
        prompt: buildContinuationPrompt({
          objective,
          config,
          reason: "missing_room_evidence_recovery",
          recovery,
          cleanupAgents
        }),
        lastHandledMessageId: recovery.messageId,
        lastHandledMessageCreatedAt: recovery.messageCreatedAt,
        decidedAt: timestamp
      });
    }

    if (cleanupAgents.length > 0) {
      if (cooldownActive(objective, config, now)) {
        return decision("wait", "cooldown_active", {
          cleanupAgentIds: cleanupAgents.map((agent) => agent.id),
          decidedAt: timestamp
        });
      }

      if (!config.policy?.autoContinue) {
        return decision("wait", "auto_continue_disabled", {
          cleanupAgentIds: cleanupAgents.map((agent) => agent.id),
          decidedAt: timestamp
        });
      }

      return decision("send", "completed_child_cleanup", {
        orchestratorId: orchestrator.id,
        cleanupAgentIds: cleanupAgents.map((agent) => agent.id),
        prompt: buildContinuationPrompt({
          objective,
          config,
          reason: "completed_child_cleanup",
          cleanupAgents
        }),
        decidedAt: timestamp
      });
    }

    return decision("wait", "no_unhandled_signal", {
      decidedAt: timestamp
    });
  }

  for (const entry of signalEntries) {
    const contractViolation = validateDelegationContract(entry, snapshot, config);
    if (contractViolation) {
      return decision("block", "delegation_contract_violation", {
        signal: entry.signal,
        messageId: entry.message.id,
        violation: contractViolation,
        prompt: buildContinuationPrompt({
          objective,
          config,
          signalEntry: entry,
          reason: "delegation_contract_violation",
          violation: contractViolation,
          cleanupAgents
        }),
        nextStatus: STATUS_BLOCKED,
        lastHandledMessageId: entry.message.id,
        lastHandledMessageCreatedAt: entry.message.createdAt,
        decidedAt: timestamp
      });
    }

    const isTerminalSignal = (config.workflow?.terminalSignals || []).includes(entry.signal);
    if (isTerminalSignal && !isHandoffMode(config)) {
      const nextStatus =
        entry.signal === "MERGED" && !config.policy?.allowNewPhaseAfterMerge
          ? STATUS_COMPLETE
          : STATUS_BLOCKED;
      return decision("stop", entry.signal === "PR_CREATED" ? "terminal_review_gate" : "terminal_signal", {
        signal: entry.signal,
        messageId: entry.message.id,
        nextStatus,
        lastHandledMessageId: entry.message.id,
        lastHandledMessageCreatedAt: entry.message.createdAt,
        decidedAt: timestamp
      });
    }

    const protectedAction = blockingProtectedAction(entry.message.body, config);
    if (protectedAction) {
      return decision("block", "protected_action_detected", {
        signal: entry.signal,
        messageId: entry.message.id,
        protectedAction,
        nextStatus: STATUS_BLOCKED,
        lastHandledMessageId: entry.message.id,
        lastHandledMessageCreatedAt: entry.message.createdAt,
        decidedAt: timestamp
      });
    }

    if ((config.workflow?.blockedSignals || []).includes(entry.signal)) {
      const recoverable = (config.workflow?.recoverableBlockedSignals || []).includes(entry.signal);
      if (!recoverable) {
        return decision("block", "human_decision_required", {
          signal: entry.signal,
          messageId: entry.message.id,
          nextStatus: STATUS_BLOCKED,
          lastHandledMessageId: entry.message.id,
          lastHandledMessageCreatedAt: entry.message.createdAt,
          decidedAt: timestamp
        });
      }
    }
  }

  let signalEntry = signalEntries.at(-1);
  let lastHandledMessageId = signalEntry.message.id;
  if (isHandoffMode(config)) {
    const terminalSignals = new Set(config.workflow?.terminalSignals || []);
    const safeSignals = new Set(config.workflow?.safeSignals || []);
    for (let index = signalEntries.length - 1; index >= 0; index -= 1) {
      const candidate = signalEntries[index];
      if (!terminalSignals.has(candidate.signal)) {
        continue;
      }

      const laterSignalsAreSafe = signalEntries
        .slice(index + 1)
        .every((entry) => safeSignals.has(entry.signal));
      if (laterSignalsAreSafe) {
        signalEntry = candidate;
      }
      break;
    }
  }

  if (isHandoffMode(config) && (config.workflow?.terminalSignals || []).includes(signalEntry.signal)) {
    if (cooldownActive(objective, config, now)) {
      return decision("wait", "cooldown_active", {
        signal: signalEntry.signal,
        messageId: signalEntry.message.id,
        decidedAt: timestamp
      });
    }

    if (!config.policy?.autoContinue) {
      return decision("wait", "auto_continue_disabled", {
        signal: signalEntry.signal,
        messageId: signalEntry.message.id,
        decidedAt: timestamp
      });
    }

    const reason = signalEntry.signal === "MERGED"
      ? "handoff_next_phase_continue"
      : "handoff_pr_review_until_clean";
    return decision("send", reason, {
      signal: signalEntry.signal,
      messageId: signalEntry.message.id,
      orchestratorId: orchestrator.id,
      prompt: buildContinuationPrompt({
        objective,
        config,
        signalEntry,
        reason,
        cleanupAgents
      }),
      lastHandledMessageId,
      lastHandledMessageCreatedAt: messageCreatedAtForId(
        signalEntries.map((entry) => entry.message),
        lastHandledMessageId
      ),
      decidedAt: timestamp
    });
  }

  if ((config.workflow?.blockedSignals || []).includes(signalEntry.signal)) {
    const recoverable = (config.workflow?.recoverableBlockedSignals || []).includes(signalEntry.signal);
    if (!recoverable) {
      return decision("block", "human_decision_required", {
        signal: signalEntry.signal,
        messageId: signalEntry.message.id,
        nextStatus: STATUS_BLOCKED,
        lastHandledMessageId: signalEntry.message.id,
        lastHandledMessageCreatedAt: signalEntry.message.createdAt,
        decidedAt: timestamp
      });
    }

    if (cooldownActive(objective, config, now)) {
      return decision("wait", "cooldown_active", {
        signal: signalEntry.signal,
        messageId: signalEntry.message.id,
        decidedAt: timestamp
      });
    }

    if (!config.policy?.autoContinue) {
      return decision("wait", "auto_continue_disabled", {
        signal: signalEntry.signal,
        messageId: signalEntry.message.id,
        decidedAt: timestamp
      });
    }

    return decision("send", "recoverable_blocker_nudge", {
      signal: signalEntry.signal,
      messageId: signalEntry.message.id,
      orchestratorId: orchestrator.id,
      prompt: buildContinuationPrompt({
        objective,
        config,
        signalEntry,
        reason: "recoverable_blocker_nudge",
        cleanupAgents
      }),
      lastHandledMessageId: signalEntry.message.id,
      lastHandledMessageCreatedAt: signalEntry.message.createdAt,
      decidedAt: timestamp
    });
  }

  if (!(config.workflow?.safeSignals || []).includes(signalEntry.signal)) {
    return decision("wait", "signal_not_safe", {
      signal: signalEntry.signal,
      messageId: signalEntry.message.id,
      decidedAt: timestamp
    });
  }

  if (cooldownActive(objective, config, now)) {
    return decision("wait", "cooldown_active", {
      signal: signalEntry.signal,
      messageId: signalEntry.message.id,
      decidedAt: timestamp
    });
  }

  if (!config.policy?.autoContinue) {
    return decision("wait", "auto_continue_disabled", {
      signal: signalEntry.signal,
      messageId: signalEntry.message.id,
      decidedAt: timestamp
    });
  }

  return decision("send", "safe_signal_continue", {
    signal: signalEntry.signal,
    messageId: signalEntry.message.id,
    orchestratorId: orchestrator.id,
    prompt: buildContinuationPrompt({
      objective,
      config,
      signalEntry,
      reason: "safe_signal_continue",
      cleanupAgents
    }),
    lastHandledMessageId: signalEntry.message.id,
    lastHandledMessageCreatedAt: signalEntry.message.createdAt,
    decidedAt: timestamp
  });
}

function applyDecisionToObjective(objective, decisionResult, now = new Date(), { derivedHandledCreatedAt = null } = {}) {
  const timestamp = now.toISOString();
  const next = {
    ...objective,
    lastDecision: {
      action: decisionResult.action,
      reason: decisionResult.reason,
      signal: decisionResult.signal,
      messageId: decisionResult.messageId,
      decidedAt: decisionResult.decidedAt || timestamp
    },
    updatedAt: timestamp
  };
  if (decisionResult.lastHandledMessageId) {
    next.lastHandledMessageId = decisionResult.lastHandledMessageId;
    const handledCreatedAt = decisionResult.lastHandledMessageCreatedAt || derivedHandledCreatedAt;
    if (handledCreatedAt) {
      next.lastHandledMessageCreatedAt = handledCreatedAt;
    }
  } else if (!next.lastHandledMessageCreatedAt && derivedHandledCreatedAt) {
    next.lastHandledMessageCreatedAt = derivedHandledCreatedAt;
  }
  if (decisionResult.nextStatus) {
    next.status = decisionResult.nextStatus;
  }
  if (decisionResult.action === "send") {
    next.lastContinuationAt = timestamp;
  }
  return next;
}

function sendPrompt(config, agentId, prompt, runner = runCommand) {
  const sendCommand = config.commands?.send || [];
  const sendParts = splitCommandLine(sendCommand);
  const usesPromptFile = sendParts.some((part) => String(part).includes("{promptFile}"));
  if (!usesPromptFile) {
    return runPaseoCommand(config, "send", { agentId, prompt }, [], runner);
  }

  if (sendParts.includes("--no-wait")) {
    throw new GuardError(
      "unsafe_prompt_file_command: use --prompt with --no-wait, or remove --no-wait from the prompt-file send command",
      "unsafe_prompt_file_command"
    );
  }

  const tempDir = mkdtempSync(join(tmpdir(), "paseo-guard-"));
  const promptFile = join(tempDir, "prompt.txt");
  try {
    writeFileSync(promptFile, prompt, { encoding: "utf8", mode: 0o600 });
    return runPaseoCommand(config, "send", { agentId, promptFile }, [], runner);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function guardRuntimeStatus(config, objective, messages = null, runner = runCommand) {
  let tailMessages = messages;
  let tailReadError = null;
  if (!tailMessages && objective?.status === STATUS_ACTIVE) {
    try {
      const raw = parseJsonOutput(
        runPaseoCommand(
          config,
          "chatRead",
          { room: config.room, limit: config.chatReadLimit || 50 },
          [],
          runner
        ),
        "chatRead"
      );
      tailMessages = normalizeMessages(raw);
    } catch (error) {
      tailReadError = String(error.message || error).slice(0, 500);
      tailMessages = [];
    }
  }

  return {
    effectiveHandoffMode: isHandoffMode(config),
    lastHandledMessageIdFoundInTail: lastHandledMessageIdFoundInTail(tailMessages || [], objective),
    lastHandledMessageCreatedAt: objective?.lastHandledMessageCreatedAt || null,
    derivedLastHandledMessageCreatedAt: derivedLastHandledMessageCreatedAt(tailMessages || [], objective),
    watcherStatus: watcherStatus(config),
    tailReadError
  };
}

export function status(config, { runner = runCommand } = {}) {
  const objective = readObjective(config);
  if (!objective) {
    throw new GuardError("objective_missing: run init first", "objective_missing");
  }
  return {
    path: objectivePathFor(config),
    objective,
    guard: guardRuntimeStatus(config, objective, null, runner)
  };
}

export function reconcile(config, { dryRun = false, now = new Date(), runner = runCommand } = {}) {
  const objective = readObjective(config);
  if (!objective) {
    throw new GuardError("objective_missing: run init first", "objective_missing");
  }

  const snapshot =
    objective.status === STATUS_ACTIVE
      ? buildSnapshot(config, runner)
      : { orchestrators: [], childAgents: [], allAgents: [], agentById: {}, messages: [] };
  const decisionResult = decideReconcile(objective, config, snapshot, { now });
  const derivedHandledCreatedAt = derivedLastHandledMessageCreatedAt(snapshot.messages, objective);
  const output = {
    dryRun,
    objectivePath: objectivePathFor(config),
    decision: decisionResult,
    guard: guardRuntimeStatus(config, objective, snapshot.messages, runner),
    observed: {
      orchestrators: snapshot.orchestrators.map((agent) => ({
        id: agent.id,
        status: agent.status,
        cwd: agent.cwd,
        labels: agent.labels,
        workspaceKind: agent.workspaceKind
      })),
      childAgents: snapshot.childAgents.map((agent) => ({
        id: agent.id,
        status: agent.status,
        cwd: agent.cwd,
        labels: agent.labels,
        workspaceKind: agent.workspaceKind
      })),
      messages: snapshot.messages.length
    }
  };

  if (dryRun) {
    return output;
  }

  if (decisionResult.action === "send") {
    sendPrompt(config, decisionResult.orchestratorId, decisionResult.prompt, runner);
  }

  const nextObjective = applyDecisionToObjective(objective, decisionResult, now, { derivedHandledCreatedAt });
  writeJson(objectivePathFor(config), nextObjective);
  return {
    ...output,
    objective: nextObjective
  };
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage() {
  return [
    "Usage:",
    "  paseo-guard init --config <config>",
    "  paseo-guard status --config <config>",
    "  paseo-guard watch-status --config <config>",
    "  paseo-guard ensure-watch --config <config> [--dry-run]",
    "  paseo-guard pause --config <config>",
    "  paseo-guard resume --config <config>",
    "  paseo-guard clear --config <config>",
    "  paseo-guard reconcile --config <config> [--dry-run]"
  ].join("\n");
}

export function main(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);
  const command = args._[0];
  if (!command || args.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  const config = loadConfig(args.config);
  if (command === "init") {
    printJson(initObjective(config, { force: Boolean(args.force) }));
    return 0;
  }

  if (command === "status") {
    printJson(status(config));
    return 0;
  }

  if (command === "watch-status") {
    printJson(watcherStatus(config));
    return 0;
  }

  if (command === "ensure-watch") {
    printJson(ensureWatch(config, { dryRun: Boolean(args["dry-run"]) }));
    return 0;
  }

  if (command === "pause") {
    printJson(setObjectiveStatus(config, STATUS_PAUSED));
    return 0;
  }

  if (command === "resume") {
    printJson(setObjectiveStatus(config, STATUS_ACTIVE));
    return 0;
  }

  if (command === "clear") {
    printJson(setObjectiveStatus(config, STATUS_COMPLETE));
    return 0;
  }

  if (command === "reconcile") {
    printJson(reconcile(config, { dryRun: Boolean(args["dry-run"]) }));
    return 0;
  }

  throw new GuardError(`unknown_command: ${command}`, "usage");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main();
  } catch (error) {
    const status = error instanceof GuardError ? error.code : "error";
    process.stderr.write(`${status}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
