#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
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
    implementationRoles: ["implementation", "fix", "validation", "audit", "pr"],
    runningStatuses: ["running", "thinking", "queued", "starting", "needs_permission"]
  },
  workflow: {
    safeSignals: ["PLAN_READY", "DONE", "FIXED", "PASS"],
    blockedSignals: ["BLOCKED", "NEEDS_FIX", "NEEDS_USER_DECISION", "ERROR"],
    recoverableBlockedSignals: ["BLOCKED", "NEEDS_FIX"],
    terminalSignals: ["PR_CREATED", "MERGED"],
    protectedActions: [
      "merge",
      "delete branch",
      "branch deletion",
      "delete agent",
      "archive agent",
      "daemon restart",
      "restart daemon",
      "new project phase"
    ]
  },
  policy: {
    autoContinue: true,
    cooldownSeconds: 60,
    maxRetries: 3,
    allowNewPhaseAfterMerge: false,
    checkGitWorktrees: true
  },
  commands: {
    paseo: "paseo",
    ls: ["ls", "--json"],
    inspect: ["inspect", "{agentId}", "--json"],
    chatRead: ["chat", "read", "{room}", "--limit", "{limit}", "--json"],
    chatPost: ["chat", "post", "{room}", "{message}", "--json"],
    send: ["send", "{agentId}", "--prompt", "{prompt}", "--no-wait", "--json"],
    chatWait: ["chat", "wait", "{room}", "--timeout", "{timeout}", "--json"]
  },
  chatReadLimit: 50,
  watch: {
    timeout: "10m"
  }
};

const STATUS_ACTIVE = "active";
const STATUS_PAUSED = "paused";
const STATUS_BLOCKED = "blocked";
const STATUS_COMPLETE = "complete";

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

export function parseSignal(body, config) {
  const match = String(body || "").trim().match(/^([A-Z][A-Z0-9_]+)/);
  if (!match) {
    return null;
  }
  const signal = match[1];
  const knownSignals = new Set([
    ...(config.workflow?.safeSignals || []),
    ...(config.workflow?.blockedSignals || []),
    ...(config.workflow?.terminalSignals || [])
  ]);
  return knownSignals.has(signal) ? signal : null;
}

function messageTime(message) {
  const time = Date.parse(message.createdAt || "");
  return Number.isNaN(time) ? 0 : time;
}

export function latestUnhandledSignal(messages, objective, config) {
  const ordered = [...messages].sort((left, right) => messageTime(left) - messageTime(right));
  const handledIndex = objective.lastHandledMessageId
    ? ordered.findIndex((message) => message.id === objective.lastHandledMessageId)
    : -1;
  const candidates = handledIndex >= 0 ? ordered.slice(handledIndex + 1) : ordered;
  const signaled = candidates
    .map((message) => ({ message, signal: parseSignal(message.body, config) }))
    .filter((entry) => entry.signal);
  return signaled.at(-1) || null;
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
  const missingEvidence = (config.childAgents?.requiredEvidenceFields || []).filter((key) => {
    if (key === "labels") {
      return !fields.labels && Object.keys(messageLabels).length === 0;
    }
    return !fields[key];
  });

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

function containsProtectedAction(text, config) {
  const lower = String(text || "").toLowerCase();
  return (config.workflow?.protectedActions || []).find((action) => lower.includes(String(action).toLowerCase()));
}

function isRunningAgent(agent, config) {
  return new Set(config.childAgents?.runningStatuses || []).has(String(agent.status || "").toLowerCase());
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

export function buildContinuationPrompt({ objective, config, signalEntry, reason, violation }) {
  const signalLine = signalEntry
    ? `lastSignal=${signalEntry.signal}\nlastMessageId=${signalEntry.message.id}`
    : "lastSignal=none\nlastMessageId=none";
  const violationLine = violation
    ? `contractViolation=${violation.violations.join("; ")}`
    : "contractViolation=none";

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
    "",
    "Instructions:",
    "1. Read the room state and current project evidence before acting.",
    "2. Take exactly one safe next step, then report back to the room.",
    "3. Planning and research may run in researchWorkspace.",
    "4. Implementation, fix, validation, audit, and PR child agents must run in targetWorkspace or a linked target worktree.",
    "5. Every child agent must include labels: room, parent, phase, task, role.",
    "6. Immediately inspect each created child agent and verify its cwd before relying on it.",
    "7. Post room evidence in this shape: agent=<id> cwd=<path> branch=<branch> task=<task-id> labels={room=<room>,parent=<id>,phase=<phase>,task=<task>,role=<role>}.",
    "8. Use background or no-wait mode for child agents and continue through room evidence.",
    "9. Do not merge, delete branches, archive/delete agents, restart the daemon, or start a new post-merge phase without explicit user approval."
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

  const orchestrator = snapshot.orchestrators[0];
  if (!orchestrator) {
    return decision("block", "orchestrator_not_found", {
      nextStatus: STATUS_BLOCKED,
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

  const signalEntry = latestUnhandledSignal(snapshot.messages, objective, config);
  if (!signalEntry) {
    return decision("wait", "no_unhandled_signal", {
      decidedAt: timestamp
    });
  }

  const contractViolation = validateDelegationContract(signalEntry, snapshot, config);
  if (contractViolation) {
    return decision("block", "delegation_contract_violation", {
      signal: signalEntry.signal,
      messageId: signalEntry.message.id,
      violation: contractViolation,
      prompt: buildContinuationPrompt({
        objective,
        config,
        signalEntry,
        reason: "delegation_contract_violation",
        violation: contractViolation
      }),
      nextStatus: STATUS_BLOCKED,
      lastHandledMessageId: signalEntry.message.id,
      decidedAt: timestamp
    });
  }

  const protectedAction = containsProtectedAction(signalEntry.message.body, config);
  if (protectedAction) {
    return decision("block", "protected_action_detected", {
      signal: signalEntry.signal,
      messageId: signalEntry.message.id,
      protectedAction,
      nextStatus: STATUS_BLOCKED,
      lastHandledMessageId: signalEntry.message.id,
      decidedAt: timestamp
    });
  }

  if ((config.workflow?.terminalSignals || []).includes(signalEntry.signal)) {
    const nextStatus =
      signalEntry.signal === "MERGED" && !config.policy?.allowNewPhaseAfterMerge
        ? STATUS_COMPLETE
        : STATUS_BLOCKED;
    return decision("stop", signalEntry.signal === "PR_CREATED" ? "terminal_review_gate" : "terminal_signal", {
      signal: signalEntry.signal,
      messageId: signalEntry.message.id,
      nextStatus,
      lastHandledMessageId: signalEntry.message.id,
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
        reason: "recoverable_blocker_nudge"
      }),
      lastHandledMessageId: signalEntry.message.id,
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
      reason: "safe_signal_continue"
    }),
    lastHandledMessageId: signalEntry.message.id,
    decidedAt: timestamp
  });
}

function applyDecisionToObjective(objective, decisionResult, now = new Date()) {
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
  const output = {
    dryRun,
    objectivePath: objectivePathFor(config),
    decision: decisionResult,
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

  const nextObjective = applyDecisionToObjective(objective, decisionResult, now);
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
    const objective = readObjective(config);
    if (!objective) {
      throw new GuardError("objective_missing: run init first", "objective_missing");
    }
    printJson({ path: objectivePathFor(config), objective });
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
