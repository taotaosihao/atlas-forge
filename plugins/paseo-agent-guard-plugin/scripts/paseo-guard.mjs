#!/usr/bin/env node
import { createHash } from "node:crypto";
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

const DEFAULT_WORKFLOW_PATH = "./WORKFLOW.md";
const STATUS_ACTIVE = "active";
const STATUS_PAUSED = "paused";
const STATUS_BLOCKED = "blocked";
const STATUS_COMPLETE = "complete";
const OBJECTIVE_SCHEMA_VERSION = 2;
const HANDOFF_ALLOWED_PROTECTED_ACTIONS = new Set(["merge", "new project phase"]);
const HANDOFF_STOP_REASONS = new Set([
  "prd_human_review",
  "scope_decision",
  "provider_tooling_blocker",
  "final_acceptance",
  "unrecoverable_blocker"
]);
const HANDOFF_STOP_REASON_ALIASES = new Map([
  ["prd_review", "prd_human_review"],
  ["prd_gate", "prd_human_review"],
  ["human_review", "prd_human_review"],
  ["outside_scope", "scope_decision"],
  ["approved_scope", "scope_decision"],
  ["product_decision", "scope_decision"],
  ["provider_blocker", "provider_tooling_blocker"],
  ["tooling_blocker", "provider_tooling_blocker"],
  ["review_provider_blocker", "provider_tooling_blocker"],
  ["human_acceptance", "final_acceptance"],
  ["uat_acceptance", "final_acceptance"],
  ["unrecoverable", "unrecoverable_blocker"]
]);
const ALLOWED_TEMPLATE_VARS = new Set([
  "objective",
  "room",
  "researchWorkspace",
  "projects",
  "currentProject",
  "signal",
  "reason",
  "violation",
  "recovery",
  "cleanupAgents",
  "policy",
  "reviewPolicy",
  "workflowDigest"
]);
const ALLOWED_TEMPLATE_FILTERS = new Set(["json"]);

const DEFAULT_WORKFLOW = {
  objectiveStoreDir: "~/.paseo-agent-guard/objectives",
  orchestratorSelector: {
    labels: { role: "orchestrator" }
  },
  childAgents: {
    requiredLabels: ["room", "project", "parent", "phase", "task", "role"],
    requiredEvidenceFields: ["project", "agent", "cwd", "branch", "task", "labels", "evidence"],
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
    trustAcknowledged: false,
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

const CONTINUATION_TEMPLATE = [
  "PASEO_AGENT_GUARD_CONTINUATION",
  "objective={{objective}}",
  "room={{room}}",
  "researchWorkspace={{researchWorkspace}}",
  "workflowDigest={{workflowDigest}}",
  "projects={{json projects}}",
  "currentProject={{json currentProject}}",
  "signal={{json signal}}",
  "reason={{reason}}",
  "violation={{json violation}}",
  "recovery={{json recovery}}",
  "cleanupAgents={{json cleanupAgents}}",
  "policy={{json policy}}",
  "reviewPolicy={{json reviewPolicy}}",
  "",
  "Instructions:",
  "1. Read the workflow body and room evidence before acting.",
  "2. As the orchestrator, delegate execution to child agents or advance orchestration only. Do not perform implementation, fix, validation, audit, review, PR, merge, or other project execution work yourself.",
  "3. Planning and research may run only in researchWorkspace.",
  "4. Implementation, fix, validation, audit, and PR child agents must run in the current project's target workspace or allowed worktree roots.",
  "5. Every child SIGNAL must use: SIGNAL signal=<...> project=<key> agent=<id> cwd=<path> branch=<branch> task=<task> labels={room=<room>,project=<key>,parent=<parent>,phase=<phase>,task=<task>,role=<role>} evidence=<summary>.",
  "6. Every child agent prompt must name required skills, room, project key, cwd contract, labels, and SIGNAL contract directly.",
  "7. Keep background per-child `paseo wait <agent-id> --json` as an auxiliary idle notification path; durable continuation comes from the watcher plus room SIGNAL evidence.",
  "8. Cleanup is allowed only for completed child agents that already posted valid final evidence for their project.",
  "9. Do not perform protected actions unless policy allows the exact action.",
  "10. Orchestrator messages may use diagnostic/progress/recovery updates, but canonical project SIGNAL evidence must come from the reported child agent: room message author must match agent=<child-id>.",
  "11. In handoff mode, clear ordinary blockers that prevent the objective. Stop only when the blocker is explicitly tagged with handoffStop=<prd_human_review|scope_decision|provider_tooling_blocker|final_acceptance|unrecoverable_blocker> or is clearly one of those gates.",
  "",
  "Workflow body:",
  "{{reason}}"
].join("\n");

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

function expandExactEnv(value) {
  if (typeof value !== "string") {
    return value;
  }
  if (!/^\$[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    return value;
  }
  const name = value.slice(1);
  if (!(name in process.env) || !process.env[name]) {
    throw new GuardError(`workflow_invalid_path_env: ${value}`, "workflow_invalid");
  }
  return process.env[name];
}

function deepMerge(base, override) {
  if (!override || typeof override !== "object" || Array.isArray(override)) {
    return override === undefined ? base : override;
  }

  const merged = { ...(base || {}) };
  for (const [key, value] of Object.entries(override)) {
    const current = merged[key];
    if (
      current &&
      typeof current === "object" &&
      !Array.isArray(current) &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      merged[key] = deepMerge(current, value);
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

function canonicalizePath(pathValue, baseDir) {
  if (typeof pathValue !== "string" || !pathValue.trim()) {
    throw new GuardError("workflow_invalid_path_value", "workflow_invalid");
  }
  const expanded = expandExactEnv(expandHome(pathValue.trim()));
  const absolute = isAbsolute(expanded) ? resolve(expanded) : resolve(baseDir, expanded);
  if (existsSync(absolute)) {
    try {
      return realpathSync(absolute);
    } catch {
      return absolute;
    }
  }
  return absolute;
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function splitFrontMatter(text) {
  const normalized = String(text || "");
  if (!normalized.startsWith("---\n") && !normalized.startsWith("---\r\n")) {
    throw new GuardError("workflow_missing_front_matter", "workflow_invalid");
  }
  const lines = normalized.split(/\r?\n/);
  let endIndex = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === "---") {
      endIndex = index;
      break;
    }
  }
  if (endIndex === -1) {
    throw new GuardError("workflow_missing_front_matter_closer", "workflow_invalid");
  }
  return {
    frontMatter: lines.slice(1, endIndex).join("\n"),
    body: lines.slice(endIndex + 1).join("\n").trim()
  };
}

function countIndent(line) {
  const match = String(line).match(/^ */);
  if (/\t/.test(line.slice(0, match[0].length + 1))) {
    throw new GuardError("workflow_tabs_not_supported", "workflow_invalid");
  }
  return match[0].length;
}

function parseScalar(raw) {
  const value = String(raw).trim();
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (value === "null") {
    return null;
  }
  if (/^-?\d+$/.test(value)) {
    return Number(value);
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function skipBlank(lines, start) {
  let index = start;
  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (trimmed && !trimmed.startsWith("#")) {
      break;
    }
    index += 1;
  }
  return index;
}

function parseYamlBlock(lines, start, indent) {
  const index = skipBlank(lines, start);
  if (index >= lines.length) {
    return { value: undefined, index };
  }
  const line = lines[index];
  const lineIndent = countIndent(line);
  if (lineIndent < indent) {
    return { value: undefined, index };
  }
  if (lineIndent > indent) {
    throw new GuardError(`workflow_unexpected_indent: ${line.trim()}`, "workflow_invalid");
  }
  if (line.trim().startsWith("- ")) {
    return parseYamlArray(lines, index, indent);
  }
  return parseYamlObject(lines, index, indent);
}

function parseYamlObjectContinuation(lines, start, indent, initial = {}) {
  let index = start;
  const value = { ...initial };
  while (true) {
    index = skipBlank(lines, index);
    if (index >= lines.length) {
      break;
    }
    const line = lines[index];
    const lineIndent = countIndent(line);
    if (lineIndent < indent) {
      break;
    }
    if (lineIndent > indent) {
      throw new GuardError(`workflow_unexpected_indent: ${line.trim()}`, "workflow_invalid");
    }
    if (line.trim().startsWith("- ")) {
      break;
    }
    const trimmed = line.trim();
    const match = trimmed.match(/^([A-Za-z0-9_.-]+):(.*)$/);
    if (!match) {
      throw new GuardError(`workflow_invalid_line: ${trimmed}`, "workflow_invalid");
    }
    const [, key, remainderRaw] = match;
    const remainder = remainderRaw.trim();
    index += 1;
    if (!remainder) {
      const child = parseYamlBlock(lines, index, indent + 2);
      value[key] = child.value === undefined ? {} : child.value;
      index = child.index;
      continue;
    }
    value[key] = parseScalar(remainder);
  }
  return { value, index };
}

function parseYamlObject(lines, start, indent) {
  return parseYamlObjectContinuation(lines, start, indent);
}

function parseYamlArray(lines, start, indent) {
  let index = start;
  const value = [];
  while (true) {
    index = skipBlank(lines, index);
    if (index >= lines.length) {
      break;
    }
    const line = lines[index];
    const lineIndent = countIndent(line);
    if (lineIndent < indent) {
      break;
    }
    if (lineIndent > indent) {
      throw new GuardError(`workflow_unexpected_indent: ${line.trim()}`, "workflow_invalid");
    }
    const trimmed = line.trim();
    if (!trimmed.startsWith("- ")) {
      break;
    }
    const remainder = trimmed.slice(2).trim();
    index += 1;
    if (!remainder) {
      const child = parseYamlBlock(lines, index, indent + 2);
      value.push(child.value === undefined ? null : child.value);
      index = child.index;
      continue;
    }
    const objectMatch = remainder.match(/^([A-Za-z0-9_.-]+):(.*)$/);
    if (!objectMatch) {
      value.push(parseScalar(remainder));
      continue;
    }
    const [, key, remainderRaw] = objectMatch;
    const item = {};
    const scalar = remainderRaw.trim();
    if (!scalar) {
      const child = parseYamlBlock(lines, index, indent + 2);
      item[key] = child.value === undefined ? {} : child.value;
      index = child.index;
    } else {
      item[key] = parseScalar(scalar);
    }
    const continuation = parseYamlObjectContinuation(lines, index, indent + 2, item);
    value.push(continuation.value);
    index = continuation.index;
  }
  return { value, index };
}

function parseYaml(text) {
  const lines = String(text || "").split(/\r?\n/);
  const parsed = parseYamlBlock(lines, 0, 0);
  return parsed.value || {};
}

function assertNoOverlap(projects) {
  const roots = [];
  for (const project of projects) {
    for (const root of [project.targetWorkspace, ...(project.allowedImplementationRoots || [])]) {
      roots.push({ projectKey: project.key, root });
    }
  }

  for (let index = 0; index < roots.length; index += 1) {
    for (let compare = index + 1; compare < roots.length; compare += 1) {
      const first = roots[index];
      const second = roots[compare];
      if (first.projectKey === second.projectKey) {
        continue;
      }
      if (isPathInside(first.root, second.root) || isPathInside(second.root, first.root)) {
        throw new GuardError(
          `workflow_overlapping_project_roots: ${first.projectKey}:${first.root} <-> ${second.projectKey}:${second.root}`,
          "workflow_invalid"
        );
      }
    }
  }
}

function normalizeProjects(projects, baseDir) {
  if (!Array.isArray(projects) || projects.length === 0) {
    throw new GuardError("workflow_projects_required", "workflow_invalid");
  }
  const seen = new Set();
  const normalized = projects.map((project, index) => {
    if (!project || typeof project !== "object") {
      throw new GuardError(`workflow_project_invalid: index=${index}`, "workflow_invalid");
    }
    const key = String(project.key || "").trim();
    if (!key) {
      throw new GuardError(`workflow_project_missing_key: index=${index}`, "workflow_invalid");
    }
    if (seen.has(key)) {
      throw new GuardError(`workflow_project_duplicate_key: ${key}`, "workflow_invalid");
    }
    seen.add(key);
    const targetWorkspace = canonicalizePath(project.targetWorkspace, baseDir);
    const allowedImplementationRoots = Array.isArray(project.allowedImplementationRoots)
      ? project.allowedImplementationRoots.map((entry) => canonicalizePath(entry, baseDir))
      : [];
    return {
      key,
      targetWorkspace,
      allowedImplementationRoots
    };
  });
  assertNoOverlap(normalized);
  return normalized;
}

function normalizeWorkflow(rawWorkflow, workflowPath, promptBody, sourceText) {
  const merged = deepMerge(DEFAULT_WORKFLOW, rawWorkflow);
  if (merged.schemaVersion !== 2) {
    throw new GuardError(`workflow_schema_version_invalid: expected 2, got ${merged.schemaVersion}`, "workflow_invalid");
  }
  for (const key of ["projectName", "room", "objective", "researchWorkspace"]) {
    if (!merged[key]) {
      throw new GuardError(`workflow_missing_required_field: ${key}`, "workflow_invalid");
    }
  }
  const workflowDir = dirname(workflowPath);
  const researchWorkspace = canonicalizePath(merged.researchWorkspace, workflowDir);
  const objectiveStoreDir = canonicalizePath(merged.objectiveStoreDir, workflowDir);
  const projects = normalizeProjects(merged.projects, workflowDir);
  const watch = {
    ...(merged.watch || {})
  };
  watch.logDir = watch.logDir
    ? canonicalizePath(watch.logDir, workflowDir)
    : join(dirname(objectiveStoreDir), "logs");
  const normalized = {
    ...merged,
    workflowPath,
    workflowDigest: sha256(sourceText),
    workflowBody: promptBody,
    researchWorkspace,
    objectiveStoreDir,
    projects,
    watch
  };
  return normalized;
}

export function loadWorkflow(workflowPath = DEFAULT_WORKFLOW_PATH) {
  const resolvedPath = resolve(expandHome(workflowPath));
  const sourceText = readFileSync(resolvedPath, "utf8");
  const { frontMatter, body } = splitFrontMatter(sourceText);
  const rawWorkflow = parseYaml(frontMatter);
  return normalizeWorkflow(rawWorkflow, resolvedPath, body, sourceText);
}

export class WorkflowStore {
  constructor(workflowPath = DEFAULT_WORKFLOW_PATH, initialWorkflow = null) {
    this.workflowPath = resolve(expandHome(workflowPath));
    this.currentWorkflow = initialWorkflow || null;
    this.workflowLoadError = null;
  }

  loadInitial() {
    const workflow = loadWorkflow(this.workflowPath);
    this.currentWorkflow = workflow;
    this.workflowLoadError = null;
    return workflow;
  }

  reload() {
    try {
      const workflow = loadWorkflow(this.workflowPath);
      this.currentWorkflow = workflow;
      this.workflowLoadError = null;
      return workflow;
    } catch (error) {
      if (!this.currentWorkflow) {
        throw error;
      }
      this.workflowLoadError = String(error.message || error);
      this.currentWorkflow = {
        ...this.currentWorkflow,
        workflowLoadError: this.workflowLoadError
      };
      return this.currentWorkflow;
    }
  }

  getWorkflow() {
    if (!this.currentWorkflow) {
      return this.loadInitial();
    }
    if (this.workflowLoadError) {
      return {
        ...this.currentWorkflow,
        workflowLoadError: this.workflowLoadError
      };
    }
    return this.currentWorkflow;
  }
}

function ensureWorkflowArg(args) {
  if (args.config !== undefined) {
    throw new GuardError(
      "config_flag_removed: JSON config support was removed. Rename to WORKFLOW.md and use --workflow <path> instead.",
      "workflow_migration_required"
    );
  }
  return args.workflow || DEFAULT_WORKFLOW_PATH;
}

export function sanitizeSegment(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "default";
}

function projectSummary(workflow) {
  return workflow.projects.map((project) => ({
    key: project.key,
    targetWorkspace: project.targetWorkspace,
    allowedImplementationRoots: [...project.allowedImplementationRoots]
  }));
}

export function objectivePathFor(workflow) {
  return join(
    workflow.objectiveStoreDir,
    sanitizeSegment(workflow.projectName),
    `${sanitizeSegment(workflow.room)}.json`
  );
}

export function createObjective(workflow, now = new Date()) {
  const timestamp = now.toISOString();
  return {
    schemaVersion: OBJECTIVE_SCHEMA_VERSION,
    workflowPath: workflow.workflowPath,
    workflowDigest: workflow.workflowDigest,
    objective: workflow.objective,
    projectName: workflow.projectName,
    room: workflow.room,
    researchWorkspace: workflow.researchWorkspace,
    projects: projectSummary(workflow),
    status: STATUS_ACTIVE,
    projectStatus: Object.fromEntries(workflow.projects.map((project) => [project.key, STATUS_ACTIVE])),
    perProjectHandledCursor: Object.fromEntries(
      workflow.projects.map((project) => [project.key, { messageId: null, lastHandledMessageCreatedAt: null }])
    ),
    retryLedger: {},
    lastDecision: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function validateObjectiveSchema(objective) {
  const version = Number(objective?.schemaVersion || 0);
  if (version === OBJECTIVE_SCHEMA_VERSION) {
    return;
  }
  if (version === 1 || version === 0) {
    throw new GuardError(
      "objective_migration_required: existing objective is schema v1. Clear or migrate it before using WORKFLOW.md schema v2.",
      "objective_migration_required"
    );
  }
  throw new GuardError(`objective_schema_invalid: ${version}`, "objective_invalid");
}

export function readObjective(workflow) {
  const path = objectivePathFor(workflow);
  if (!existsSync(path)) {
    return null;
  }
  const objective = loadJson(path);
  validateObjectiveSchema(objective);
  return objective;
}

export function initObjective(workflow, { now = new Date(), force = false } = {}) {
  const path = objectivePathFor(workflow);
  const existing = !force ? readObjective(workflow) : null;
  const timestamp = now.toISOString();
  const objective = {
    ...(existing || createObjective(workflow, now)),
    schemaVersion: OBJECTIVE_SCHEMA_VERSION,
    workflowPath: workflow.workflowPath,
    workflowDigest: workflow.workflowDigest,
    objective: workflow.objective,
    projectName: workflow.projectName,
    room: workflow.room,
    researchWorkspace: workflow.researchWorkspace,
    projects: projectSummary(workflow),
    status: existing?.status || STATUS_ACTIVE,
    projectStatus: {
      ...Object.fromEntries(workflow.projects.map((project) => [project.key, STATUS_ACTIVE])),
      ...(existing?.projectStatus || {})
    },
    perProjectHandledCursor: {
      ...Object.fromEntries(
        workflow.projects.map((project) => [project.key, { messageId: null, lastHandledMessageCreatedAt: null }])
      ),
      ...(existing?.perProjectHandledCursor || {})
    },
    retryLedger: existing?.retryLedger || {},
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp
  };
  writeJson(path, objective);
  return { path, objective };
}

export function setObjectiveStatus(workflow, status, { now = new Date() } = {}) {
  const objective = readObjective(workflow);
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
  writeJson(objectivePathFor(workflow), next);
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

export function buildPaseoArgs(workflow, commandName, vars = {}, extraArgs = []) {
  const command = workflow.commands?.[commandName];
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

export function runPaseoCommand(workflow, commandName, vars = {}, extraArgs = [], runner = runCommand) {
  const paseoParts = splitCommandLine(workflow.commands?.paseo || "paseo");
  if (paseoParts.length === 0) {
    throw new GuardError("command_invalid: commands.paseo", "command_invalid");
  }
  const command = paseoParts[0];
  const args = [...paseoParts.slice(1), ...buildPaseoArgs(workflow, commandName, vars, extraArgs)];
  const result = runner(command, args, { cwd: dirname(workflow.workflowPath) });
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

function watcherPaths(workflow) {
  return {
    pidFile: join(
      workflow.watch.logDir,
      sanitizeSegment(workflow.projectName),
      `${sanitizeSegment(workflow.room)}.pid`
    ),
    logFile: join(
      workflow.watch.logDir,
      sanitizeSegment(workflow.projectName),
      `${sanitizeSegment(workflow.room)}.jsonl`
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

function commandIsGuardWatcher(command, workflow) {
  const text = String(command || "");
  return text.includes("paseo-guard-watch") && text.includes(workflow.workflowPath);
}

export function watcherStatus(workflow, { processInspector = processInfoForPid } = {}) {
  const paths = watcherPaths(workflow);
  const pid = readPidFile(paths.pidFile);
  const processInfo = pid ? processInspector(pid) : { alive: false, command: null };
  const processMatches = processInfo.alive ? commandIsGuardWatcher(processInfo.command, workflow) : false;
  const running = Boolean(processInfo.alive && processMatches);
  return {
    running,
    stale: Boolean(pid && !running),
    pid,
    processAlive: Boolean(processInfo.alive),
    processMatches,
    processCommand: processInfo.command || null,
    pidFile: paths.pidFile,
    logFile: paths.logFile,
    workflowPath: workflow.workflowPath
  };
}

function launchWatchProcess(workflow, paths) {
  mkdirSync(dirname(paths.logFile), { recursive: true });
  const fd = openSync(paths.logFile, "a", 0o600);
  try {
    const script = join(dirname(fileURLToPath(import.meta.url)), "paseo-guard-watch.mjs");
    const child = spawn(process.execPath, [script, "--workflow", workflow.workflowPath], {
      detached: true,
      stdio: ["ignore", fd, fd]
    });
    child.unref();
    return { pid: child.pid };
  } finally {
    closeSync(fd);
  }
}

export function ensureWatch(workflow, { dryRun = false, launcher = launchWatchProcess, processInspector } = {}) {
  if (workflow.policy?.handoffMode && workflow.policy?.trustAcknowledged !== true) {
    throw new GuardError(
      "workflow_trust_acknowledgement_required: set policy.trustAcknowledged: true before ensure-watch in handoff mode.",
      "workflow_invalid"
    );
  }
  const current = watcherStatus(workflow, { processInspector });
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

  const paths = watcherPaths(workflow);
  mkdirSync(dirname(paths.pidFile), { recursive: true });
  const launched = launcher(workflow, paths);
  if (!launched?.pid) {
    throw new GuardError("watcher_launch_failed: missing child pid", "watcher_launch_failed");
  }
  writeFileSync(paths.pidFile, `${launched.pid}\n`, { encoding: "utf8", mode: 0o600 });
  return {
    action: current.stale ? "restarted" : "started",
    previousWatcherStatus: current,
    watcherStatus: watcherStatus(workflow, { processInspector })
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

function getPaseoHome(workflow) {
  return resolve(expandHome(workflow.paseoHome || process.env.PASEO_HOME || "~/.paseo"));
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

function readAgentState(id, workflow) {
  const file = findAgentStateFile(id, join(getPaseoHome(workflow), "agents"));
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

export function resolveProjectWorkspace(cwd, projects, options = {}) {
  if (!cwd) {
    throw new GuardError("delegation_contract_violation: missing cwd", "delegation_contract_violation");
  }
  const resolvedCwd = resolve(expandHome(cwd));
  const matches = [];
  for (const project of projects) {
    if (isPathInside(resolvedCwd, project.targetWorkspace)) {
      matches.push({ projectKey: project.key, workspaceKind: "target" });
      continue;
    }
    if ((project.allowedImplementationRoots || []).some((root) => isPathInside(resolvedCwd, root))) {
      matches.push({ projectKey: project.key, workspaceKind: "allowed-root" });
      continue;
    }
    if (options.checkGitWorktrees && existsSync(resolvedCwd) && existsSync(project.targetWorkspace)) {
      try {
        if (sameGitRepository(resolvedCwd, project.targetWorkspace)) {
          matches.push({ projectKey: project.key, workspaceKind: "target-worktree" });
        }
      } catch {
        // Ignore git resolution failures and continue with explicit root checks.
      }
    }
  }
  if (matches.length !== 1) {
    const detail = matches.length === 0
      ? `none:${resolvedCwd}`
      : matches.map((match) => `${match.projectKey}:${match.workspaceKind}`).join(",");
    throw new GuardError(`delegation_contract_violation: project_workspace_resolution=${detail}`, "delegation_contract_violation");
  }
  return matches[0];
}

function classifyWorkspace(cwd, workflow) {
  if (!cwd) {
    return { workspaceKind: "unknown", projectKey: null };
  }
  const resolved = resolve(expandHome(cwd));
  if (isPathInside(resolved, workflow.researchWorkspace)) {
    return { workspaceKind: "research", projectKey: null };
  }
  return resolveProjectWorkspace(resolved, workflow.projects, {
    checkGitWorktrees: workflow.policy?.checkGitWorktrees
  });
}

function enrichAgents(agents, workflow) {
  return agents.map((agent) => {
    const state = readAgentState(agent.id, workflow);
    const cwd = agent.cwd || state?.cwd || state?.Cwd;
    const labels = {
      ...(agent.labels || {}),
      ...(state?.labels || state?.Labels || {})
    };
    let projectKey = null;
    let projectViolation = null;
    let workspaceKind = "unknown";
    try {
      const resolved = classifyWorkspace(cwd, workflow);
      projectKey = resolved.projectKey;
      workspaceKind = resolved.workspaceKind;
    } catch (error) {
      projectViolation = String(error.message || error);
      workspaceKind = "other";
    }
    return {
      ...agent,
      cwd,
      status: agent.status || String(state?.lastStatus || state?.LastStatus || "").toLowerCase(),
      labels,
      state,
      projectKey,
      projectViolation,
      workspaceKind
    };
  });
}

export function buildSnapshot(workflow, runner = runCommand) {
  const orchestratorRaw = parseJsonOutput(
    runPaseoCommand(workflow, "ls", {}, labelArgs(workflow.orchestratorSelector?.labels || {}), runner),
    "ls"
  );
  const roomRaw = parseJsonOutput(
    runPaseoCommand(workflow, "ls", {}, labelArgs({ room: workflow.room }), runner),
    "ls"
  );
  const messagesRaw = parseJsonOutput(
    runPaseoCommand(
      workflow,
      "chatRead",
      { room: workflow.room, limit: workflow.chatReadLimit || 50 },
      [],
      runner
    ),
    "chatRead"
  );

  const orchestrators = enrichAgents(normalizeAgents(orchestratorRaw), workflow);
  const roomAgents = enrichAgents(normalizeAgents(roomRaw), workflow);
  const orchestratorIds = new Set(orchestrators.map((agent) => agent.id));
  const childAgents = roomAgents.filter((agent) => !orchestratorIds.has(agent.id));
  const allAgents = [...orchestrators, ...childAgents];
  const agentById = Object.fromEntries(allAgents.map((agent) => [agent.id, agent]));
  const runningChildCounts = {};
  for (const project of workflow.projects) {
    runningChildCounts[project.key] = 0;
  }
  for (const agent of childAgents) {
    if (agent.projectKey && isRunningAgent(agent, workflow)) {
      runningChildCounts[agent.projectKey] += 1;
    }
  }
  return {
    orchestrators,
    childAgents,
    allAgents,
    agentById,
    runningChildCounts,
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

function knownSignalSet(workflow) {
  return new Set([
    ...(workflow.workflow?.safeSignals || []),
    ...(workflow.workflow?.blockedSignals || []),
    ...(workflow.workflow?.terminalSignals || [])
  ]);
}

function knownDiagnosticSignalSet(workflow) {
  return new Set(workflow.workflow?.diagnosticSignals || []);
}

export function parseSignal(body, workflow) {
  const trimmed = String(body || "").trim();
  if (!trimmed.startsWith("SIGNAL ")) {
    return null;
  }
  const fields = parseFields(trimmed);
  const signal = String(fields.signal || "").trim().toUpperCase();
  return knownSignalSet(workflow).has(signal) ? signal : null;
}

function parseDiagnosticSignal(body, workflow) {
  const trimmed = String(body || "").trim();
  const direct = trimmed.match(/^([A-Z][A-Z0-9_]+)/);
  if (direct && knownDiagnosticSignalSet(workflow).has(direct[1])) {
    return direct[1];
  }
  if (!trimmed.startsWith("SIGNAL ")) {
    return null;
  }
  const fields = parseFields(trimmed);
  const signal = String(fields.signal || "").trim().toUpperCase();
  return knownDiagnosticSignalSet(workflow).has(signal) ? signal : null;
}

function messageTime(message) {
  const time = Date.parse(message.createdAt || "");
  return Number.isNaN(time) ? 0 : time;
}

function sortMessages(messages) {
  return [...messages].sort((left, right) => messageTime(left) - messageTime(right));
}

function cursorForProject(objective, projectKey) {
  return objective?.perProjectHandledCursor?.[projectKey] || { messageId: null, lastHandledMessageCreatedAt: null };
}

function messagesAfterCursor(messages, cursor) {
  const ordered = sortMessages(messages);
  const handledIndex = cursor.messageId
    ? ordered.findIndex((message) => message.id === cursor.messageId)
    : -1;
  if (handledIndex >= 0) {
    return ordered.slice(handledIndex + 1);
  }
  const handledTime = Date.parse(cursor.lastHandledMessageCreatedAt || "");
  if (!Number.isNaN(handledTime)) {
    return ordered.filter((message) => messageTime(message) >= handledTime);
  }
  return ordered;
}

function parseSignalEntry(message, workflow) {
  const signal = parseSignal(message.body, workflow);
  if (!signal) {
    return null;
  }
  const fields = parseFields(message.body);
  const labels = labelsFromMessageFields(fields);
  return {
    message,
    signal,
    fields,
    labels,
    projectKey: String(fields.project || labels.project || "").trim() || null
  };
}

function parseDiagnosticEntry(message, workflow) {
  const diagnosticSignal = parseDiagnosticSignal(message.body, workflow);
  if (!diagnosticSignal) {
    return null;
  }
  const fields = parseFields(message.body);
  const labels = labelsFromMessageFields(fields);
  return {
    message,
    diagnosticSignal,
    fields,
    labels,
    projectKey: String(fields.project || labels.project || "").trim() || null
  };
}

function unhandledSignalsForProject(messages, objective, workflow, projectKey) {
  const cursor = cursorForProject(objective, projectKey);
  return messagesAfterCursor(messages, cursor)
    .map((message) => parseSignalEntry(message, workflow))
    .filter((entry) => entry && entry.projectKey === projectKey);
}

function unhandledDiagnosticsForProject(messages, objective, workflow, projectKey) {
  const cursor = cursorForProject(objective, projectKey);
  return messagesAfterCursor(messages, cursor)
    .map((message) => parseDiagnosticEntry(message, workflow))
    .filter((entry) => entry && entry.projectKey === projectKey);
}

function isHandoffMode(workflow) {
  return Boolean(workflow.policy?.handoffMode);
}

function normalizeHandoffStopReason(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const aliased = HANDOFF_STOP_REASON_ALIASES.get(normalized) || normalized;
  return HANDOFF_STOP_REASONS.has(aliased) ? aliased : null;
}

function inferredHandoffStopReason(text) {
  const lower = String(text || "").toLowerCase();
  if (/\bprd\b/.test(lower) && /\bhuman review\b|\breview gate\b/.test(lower)) {
    return "prd_human_review";
  }
  if (/\boutside (?:the )?approved (?:prd|scope)\b|\bproduct decision\b|\bscope decision\b/.test(lower)) {
    return "scope_decision";
  }
  if (/\bprovider\/tooling blocker\b|\bprovider blocker\b|\btooling blocker\b|\brequired review\b.*\b(?:unavailable|blocked|impossible)\b/.test(lower)) {
    return "provider_tooling_blocker";
  }
  if (/\bfinal (?:human )?acceptance\b|\bhuman acceptance\b|\buat acceptance\b/.test(lower)) {
    return "final_acceptance";
  }
  if (/\bunrecoverable blocker\b|\bcannot continue without human\b|\bunable to continue without human\b/.test(lower)) {
    return "unrecoverable_blocker";
  }
  return null;
}

function handoffStopReason(signalEntry) {
  if (!signalEntry) {
    return null;
  }
  const fields = signalEntry.fields || parseFields(signalEntry.message?.body || "");
  return normalizeHandoffStopReason(
    fields.handoffStop ||
    fields.handoff_stop ||
    fields.humanGate ||
    fields.human_gate ||
    fields.stopReason ||
    fields.stop_reason
  ) || inferredHandoffStopReason(signalEntry.message?.body || "");
}

function isHandoffAllowedProtectedAction(action, workflow) {
  return isHandoffMode(workflow) && HANDOFF_ALLOWED_PROTECTED_ACTIONS.has(String(action || "").toLowerCase());
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
  return escaped ? new RegExp(`(^|[^a-z0-9_])(${escaped})([^a-z0-9_]|$)`, flags) : null;
}

function hasUnnegatedProtectedAction(text, action) {
  const lower = String(text || "").toLowerCase();
  const pattern = protectedActionRegex(action, "g");
  if (!pattern) {
    return false;
  }
  for (let match = pattern.exec(lower); match; match = pattern.exec(lower)) {
    const prefix = lower.slice(Math.max(0, match.index - 30), match.index);
    if (!/\b(?:not|no|without|never|did not|do not|does not|didn't|don't|doesn't)\b/.test(prefix)) {
      return true;
    }
  }
  return false;
}

function blockingProtectedAction(text, workflow) {
  return (workflow.workflow?.protectedActions || []).find((action) => (
    hasUnnegatedProtectedAction(text, action) && !isHandoffAllowedProtectedAction(action, workflow)
  )) || null;
}

function isRunningAgent(agent, workflow) {
  return new Set(workflow.childAgents?.runningStatuses || []).has(String(agent.status || "").toLowerCase());
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

function cooldownActive(objective, workflow, now) {
  const last = objective.lastContinuationAt || objective.lastDecision?.decidedAt;
  if (!last) {
    return false;
  }
  const elapsedMs = now.getTime() - Date.parse(last);
  return elapsedMs < (workflow.policy?.cooldownSeconds || 0) * 1000;
}

function decision(action, reason, extra = {}) {
  return { action, reason, ...extra };
}

function renderTemplate(template, vars) {
  return String(template).replace(/{{\s*([^}]+)\s*}}/g, (_, expression) => {
    const parts = expression.trim().split(/\s+/);
    let filter = null;
    let variable = null;
    if (parts.length === 1) {
      [variable] = parts;
    } else if (parts.length === 2) {
      [filter, variable] = parts;
    } else {
      throw new GuardError(`template_invalid_expression: ${expression}`, "template_invalid");
    }
    if (filter && !ALLOWED_TEMPLATE_FILTERS.has(filter)) {
      throw new GuardError(`template_unknown_filter: ${filter}`, "template_invalid");
    }
    if (!ALLOWED_TEMPLATE_VARS.has(variable)) {
      throw new GuardError(`template_unknown_variable: ${variable}`, "template_invalid");
    }
    const value = vars[variable];
    if (filter === "json") {
      return JSON.stringify(value ?? null);
    }
    if (value === undefined || value === null) {
      return "";
    }
    return typeof value === "string" ? value : JSON.stringify(value);
  });
}

export function buildContinuationPrompt({ objective, workflow, currentProject, signalEntry, reason, violation, recovery, cleanupAgents = [] }) {
  const payload = {
    objective: objective.objective,
    room: objective.room,
    researchWorkspace: workflow.researchWorkspace,
    projects: workflow.projects.map((project) => ({
      key: project.key,
      targetWorkspace: project.targetWorkspace,
      allowedImplementationRoots: project.allowedImplementationRoots
    })),
    currentProject: currentProject || null,
    signal: signalEntry
      ? {
          signal: signalEntry.signal,
          project: signalEntry.projectKey,
          messageId: signalEntry.message.id,
          messageCreatedAt: signalEntry.message.createdAt
        }
      : null,
    reason: `${reason}\n\n${workflow.workflowBody || ""}`.trim(),
    violation: violation || null,
    recovery: recovery || null,
    cleanupAgents,
    policy: workflow.policy,
    reviewPolicy: workflow.reviewPolicy,
    workflowDigest: workflow.workflowDigest
  };
  return renderTemplate(CONTINUATION_TEMPLATE, payload);
}

function messageReportsAgent(message, agentId) {
  if (!agentId) {
    return false;
  }
  return message.author === agentId;
}

function isOrchestratorAuthor(message, snapshot) {
  if (!message?.author) {
    return false;
  }
  return (snapshot.orchestrators || []).some((agent) => agent.id === message.author);
}

export function validateDelegationContract(entry, snapshot, workflow) {
  if (!entry?.message) {
    return null;
  }
  const fields = entry.fields || parseFields(entry.message.body);
  const labels = entry.labels || labelsFromMessageFields(fields);
  const topLevelProject = String(fields.project || "").trim();
  const labelProject = String(labels.project || "").trim();
  const role = String(labels.role || fields.role || "").trim().toLowerCase();
  const requiredLabels = workflow.childAgents?.requiredLabels || [];
  const requiredEvidenceFields = workflow.childAgents?.requiredEvidenceFields || [];
  const author = entry.message.author;
  const reportedAgentId = fields.agent || author || null;
  const agent = (fields.agent && snapshot.agentById[fields.agent]) || (author && snapshot.agentById[author]) || null;
  const effectiveCwd = fields.cwd || agent?.cwd;
  const violations = {
    author: null,
    topLevelProject: null,
    labelProject: null,
    agentProject: null,
    role: null,
    requiredLabels: [],
    evidence: []
  };

  if (isOrchestratorAuthor(entry.message, snapshot)) {
    violations.author = "orchestrator_cannot_emit_project_signal";
  } else if (!author) {
    violations.author = "missing_author";
  } else if (reportedAgentId !== author) {
    violations.author = `author_agent_mismatch:${author}:${reportedAgentId}`;
  } else if (!snapshot.agentById[author]) {
    violations.author = `author_not_known_agent:${author}`;
  }

  if (!topLevelProject) {
    violations.topLevelProject = "missing_project";
  } else if (!workflow.projects.some((project) => project.key === topLevelProject)) {
    violations.topLevelProject = `unknown_project:${topLevelProject}`;
  }

  if (!labelProject) {
    violations.labelProject = "missing_labels.project";
  } else if (topLevelProject && labelProject !== topLevelProject) {
    violations.labelProject = `labels.project_mismatch:${labelProject}`;
  }

  for (const key of requiredLabels) {
    if (!labels[key]) {
      violations.requiredLabels.push(key);
    }
  }

  for (const field of requiredEvidenceFields) {
    if (!evidenceFieldValue(field, fields, labels, agent)) {
      violations.evidence.push(field);
    }
  }

  if (!role) {
    violations.role = "missing_role";
  }

  let cwdResolved = null;
  if (effectiveCwd) {
    try {
      cwdResolved = resolveProjectWorkspace(effectiveCwd, workflow.projects, {
        checkGitWorktrees: workflow.policy?.checkGitWorktrees
      });
    } catch (error) {
      violations.agentProject = String(error.message || error);
    }
  }

  if (!violations.agentProject && cwdResolved && topLevelProject && cwdResolved.projectKey !== topLevelProject) {
    violations.agentProject = `cwd_project_mismatch:${cwdResolved.projectKey}`;
  }

  if (!violations.agentProject && agent?.projectViolation) {
    violations.agentProject = agent.projectViolation;
  } else if (!violations.agentProject && agent?.projectKey && topLevelProject && agent.projectKey !== topLevelProject) {
    violations.agentProject = `agent_project_mismatch:${agent.projectKey}`;
  }

  const implementationRoles = new Set(
    (workflow.childAgents?.implementationRoles || []).map((item) => String(item).toLowerCase())
  );
  if (role && implementationRoles.has(role)) {
    if (!cwdResolved && !agent?.projectKey) {
      violations.role = violations.role || "implementation_role_missing_project";
    }
    if (effectiveCwd) {
      const cwdWorkspaceKind = cwdResolved?.workspaceKind || agent?.workspaceKind || "other";
      if (!["target", "target-worktree", "allowed-root"].includes(cwdWorkspaceKind)) {
        violations.role = `invalid_workspace_kind:${cwdWorkspaceKind}`;
      }
    }
  }

  if (!labels.room || labels.room !== workflow.room) {
    violations.requiredLabels = [...new Set([...violations.requiredLabels, "room"])];
  }

  const hasViolation = Object.values(violations).some((value) => (
    Array.isArray(value) ? value.length > 0 : Boolean(value)
  ));
  if (!hasViolation) {
    return null;
  }
  return {
    type: "delegation_contract_violation",
    author,
    reportedAgentId,
    signal: entry.signal,
    messageId: entry.message.id,
    projectKey: topLevelProject || null,
    violations
  };
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

function hasValidSignalForAgent(messages, agent, snapshot, workflow) {
  return messages.some((message) => {
    const entry = parseSignalEntry(message, workflow);
    if (!entry || !messageReportsAgent(message, agent.id)) {
      return false;
    }
    if (entry.projectKey !== agent.projectKey) {
      return false;
    }
    return !validateDelegationContract(entry, snapshot, workflow);
  });
}

function closeableChildAgents(snapshot, workflow, projectKey) {
  if (!workflow.childAgents?.closeOnCompletion) {
    return [];
  }
  const finishedStatuses = new Set((workflow.childAgents?.finishedStatuses || []).map((item) => String(item).toLowerCase()));
  return snapshot.childAgents
    .filter((agent) => agent.projectKey === projectKey)
    .filter((agent) => finishedStatuses.has(String(agent.status || "").toLowerCase()))
    .filter((agent) => hasValidSignalForAgent(snapshot.messages, agent, snapshot, workflow))
    .map((agent) => ({
      id: agent.id,
      status: agent.status,
      role: agent.labels?.role || null,
      task: agent.labels?.task || null,
      projectKey: agent.projectKey
    }));
}

function latestChildEvidenceAnomaly(snapshot, workflow, projectKey) {
  const failureStatuses = new Set((workflow.childAgents?.failureStatuses || []).map((item) => String(item).toLowerCase()));
  const finishedStatuses = new Set((workflow.childAgents?.finishedStatuses || []).map((item) => String(item).toLowerCase()));
  const candidates = snapshot.childAgents
    .filter((agent) => agent.projectKey === projectKey)
    .filter((agent) => !isRunningAgent(agent, workflow))
    .filter((agent) => !hasValidSignalForAgent(snapshot.messages, agent, snapshot, workflow))
    .filter((agent) => {
      const status = String(agent.status || "").toLowerCase();
      return failureStatuses.has(status) || finishedStatuses.has(status);
    })
    .sort((left, right) => agentTimestamp(left) - agentTimestamp(right));
  return candidates[0] || null;
}

function retryKey(projectKey, reason, messageOrAgentId) {
  return `${projectKey}:${reason}:${messageOrAgentId || "none"}`;
}

function clearRetryLedgerForProject(retryLedger, projectKey) {
  const next = {};
  for (const [key, value] of Object.entries(retryLedger || {})) {
    if (value.projectKey !== projectKey) {
      next[key] = value;
    }
  }
  return next;
}

function clearRetryLedgerByKeys(retryLedger, keys) {
  const remove = new Set(keys || []);
  const next = {};
  for (const [key, value] of Object.entries(retryLedger || {})) {
    if (!remove.has(key)) {
      next[key] = value;
    }
  }
  return next;
}

function isActionableProjectEvidence(message, ledgerEntry, workflow) {
  const signalEntry = parseSignalEntry(message, workflow);
  if (signalEntry?.projectKey === ledgerEntry.projectKey) {
    return true;
  }
  const diagnosticEntry = parseDiagnosticEntry(message, workflow);
  return diagnosticEntry?.projectKey === ledgerEntry.projectKey;
}

function progressAfterRetry(messages, ledgerEntry, workflow) {
  const lastPromptAt = Date.parse(ledgerEntry.lastPromptAt || "");
  if (Number.isNaN(lastPromptAt)) {
    return false;
  }
  return messages.some((message) => {
    const createdAt = Date.parse(message.createdAt || "");
    if (Number.isNaN(createdAt) || createdAt <= lastPromptAt) {
      return false;
    }
    return isActionableProjectEvidence(message, ledgerEntry, workflow);
  });
}

function earliestUnhandledSignal(snapshot, objective, workflow) {
  const entries = [];
  for (const project of workflow.projects) {
    const projectSignals = unhandledSignalsForProject(snapshot.messages, objective, workflow, project.key);
    if (projectSignals.length > 0 && objective.projectStatus?.[project.key] !== STATUS_BLOCKED) {
      entries.push(...projectSignals);
    }
  }
  return sortMessages(entries.map((entry) => entry.message))
    .map((message) => entries.find((entry) => entry.message.id === message.id))
    .find(Boolean) || null;
}

function dueRetryEntry(snapshot, objective, workflow, now) {
  const entries = Object.entries(objective.retryLedger || {})
    .map(([key, value]) => ({ key, ...value }))
    .filter((entry) => objective.projectStatus?.[entry.projectKey] !== STATUS_BLOCKED)
    .filter((entry) => !progressAfterRetry(snapshot.messages, entry, workflow))
    .filter((entry) => {
      const dueAt = Date.parse(entry.dueAt || "");
      return !Number.isNaN(dueAt) && dueAt <= now.getTime();
    })
    .sort((left, right) => Date.parse(left.dueAt) - Date.parse(right.dueAt));
  return entries[0] || null;
}

function ledgerUpdateForRetry(objective, workflow, projectKey, reason, id, now, lastError = null, attemptOverride = null) {
  const key = retryKey(projectKey, reason, id);
  const existing = objective.retryLedger?.[key];
  const attempt = attemptOverride ?? ((existing?.attempt || 0) + 1);
  const dueAt = new Date(now.getTime() + (workflow.policy?.cooldownSeconds || 0) * 1000).toISOString();
  return {
    key,
    value: {
      projectKey,
      reason,
      messageId: reason.includes("signal") || reason.includes("blocker") ? id : null,
      agentId: reason.includes("evidence") ? id : null,
      attempt,
      dueAt,
      lastError,
      lastPromptAt: now.toISOString()
    }
  };
}

function blockProjectDecision(projectKey, reason, extra = {}) {
  return decision("block", reason, {
    projectKey,
    projectStatus: STATUS_BLOCKED,
    ...extra
  });
}

export function decideReconcile(objective, workflow, snapshot, { now = new Date() } = {}) {
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
    return decision("block", snapshot.orchestrators.length > 0 ? "orchestrator_unavailable" : "orchestrator_not_found", {
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

  const runningChild = snapshot.childAgents.find((agent) => isRunningAgent(agent, workflow));
  if (runningChild) {
    return decision("wait", "child_agent_running", {
      projectKey: runningChild.projectKey,
      childAgentId: runningChild.id,
      childAgentStatus: runningChild.status,
      decidedAt: timestamp
    });
  }

  const retryEntry = dueRetryEntry(snapshot, objective, workflow, now);
  const oldestSignal = earliestUnhandledSignal(snapshot, objective, workflow);
  if (retryEntry && !oldestSignal) {
    if (retryEntry.attempt >= (workflow.policy?.maxRetries || 1)) {
      return blockProjectDecision(retryEntry.projectKey, "retry_budget_exhausted", {
        retryKey: retryEntry.key,
        retryAttempt: retryEntry.attempt,
        decidedAt: timestamp
      });
    }
    if (cooldownActive(objective, workflow, now)) {
      return decision("wait", "cooldown_active", {
        projectKey: retryEntry.projectKey,
        retryKey: retryEntry.key,
        decidedAt: timestamp
      });
    }
    if (!workflow.policy?.autoContinue) {
      return decision("wait", "auto_continue_disabled", {
        projectKey: retryEntry.projectKey,
        retryKey: retryEntry.key,
        decidedAt: timestamp
      });
    }
    const currentProject = workflow.projects.find((project) => project.key === retryEntry.projectKey);
    return decision("send", retryEntry.reason, {
      projectKey: retryEntry.projectKey,
      retryKey: retryEntry.key,
      retryAttempt: retryEntry.attempt + 1,
      orchestratorId: orchestrator.id,
      prompt: buildContinuationPrompt({
        objective,
        workflow,
        currentProject,
        reason: retryEntry.reason,
        recovery: retryEntry
      }),
      ledgerUpdate: ledgerUpdateForRetry(
        objective,
        workflow,
        retryEntry.projectKey,
        retryEntry.reason,
        retryEntry.messageId || retryEntry.agentId,
        now,
        retryEntry.lastError,
        retryEntry.attempt + 1
      ),
      decidedAt: timestamp
    });
  }

  if (oldestSignal) {
    const projectKey = oldestSignal.projectKey;
    const currentProject = workflow.projects.find((project) => project.key === projectKey);
    const contractViolation = validateDelegationContract(oldestSignal, snapshot, workflow);
    if (contractViolation) {
      return decision("block", "delegation_contract_violation", {
        projectKey,
        violation: contractViolation,
        signal: oldestSignal.signal,
        messageId: oldestSignal.message.id,
        projectCursor: {
          projectKey,
          messageId: oldestSignal.message.id,
          lastHandledMessageCreatedAt: oldestSignal.message.createdAt
        },
        decidedAt: timestamp
      });
    }

    const protectedAction = blockingProtectedAction(oldestSignal.message.body, workflow);
    if (protectedAction) {
      return decision("block", "protected_action_detected", {
        projectKey,
        protectedAction,
        signal: oldestSignal.signal,
        messageId: oldestSignal.message.id,
        projectCursor: {
          projectKey,
          messageId: oldestSignal.message.id,
          lastHandledMessageCreatedAt: oldestSignal.message.createdAt
        },
        decidedAt: timestamp
      });
    }

    const terminalSignals = new Set(workflow.workflow?.terminalSignals || []);
    const blockedSignals = new Set(workflow.workflow?.blockedSignals || []);
    const recoverableSignals = new Set(workflow.workflow?.recoverableBlockedSignals || []);
    const safeSignals = new Set(workflow.workflow?.safeSignals || []);
    const handoffBlockedStopReason = isHandoffMode(workflow) && blockedSignals.has(oldestSignal.signal)
      ? handoffStopReason(oldestSignal)
      : null;

    if (terminalSignals.has(oldestSignal.signal) && !isHandoffMode(workflow)) {
      return decision("stop", oldestSignal.signal === "PR_CREATED" ? "terminal_review_gate" : "terminal_signal", {
        projectKey,
        signal: oldestSignal.signal,
        messageId: oldestSignal.message.id,
        nextStatus: oldestSignal.signal === "MERGED" && !workflow.policy?.allowNewPhaseAfterMerge
          ? STATUS_COMPLETE
          : STATUS_BLOCKED,
        projectCursor: {
          projectKey,
          messageId: oldestSignal.message.id,
          lastHandledMessageCreatedAt: oldestSignal.message.createdAt
        },
        decidedAt: timestamp
      });
    }

    if (
      blockedSignals.has(oldestSignal.signal) &&
      (!recoverableSignals.has(oldestSignal.signal) || handoffBlockedStopReason) &&
      (!isHandoffMode(workflow) || handoffBlockedStopReason)
    ) {
      return decision("block", handoffBlockedStopReason ? "handoff_human_intervention_required" : "human_decision_required", {
        projectKey,
        signal: oldestSignal.signal,
        handoffStopReason: handoffBlockedStopReason || undefined,
        messageId: oldestSignal.message.id,
        nextStatus: STATUS_BLOCKED,
        projectCursor: {
          projectKey,
          messageId: oldestSignal.message.id,
          lastHandledMessageCreatedAt: oldestSignal.message.createdAt
        },
        decidedAt: timestamp
      });
    }

    if (cooldownActive(objective, workflow, now)) {
      return decision("wait", "cooldown_active", {
        projectKey,
        signal: oldestSignal.signal,
        messageId: oldestSignal.message.id,
        decidedAt: timestamp
      });
    }

    if (!workflow.policy?.autoContinue) {
      return decision("wait", "auto_continue_disabled", {
        projectKey,
        signal: oldestSignal.signal,
        messageId: oldestSignal.message.id,
        decidedAt: timestamp
      });
    }

    if (terminalSignals.has(oldestSignal.signal) && isHandoffMode(workflow)) {
      return decision("send", oldestSignal.signal === "MERGED" ? "handoff_next_phase_continue" : "handoff_pr_review_until_clean", {
        projectKey,
        signal: oldestSignal.signal,
        messageId: oldestSignal.message.id,
        orchestratorId: orchestrator.id,
        prompt: buildContinuationPrompt({
          objective,
          workflow,
          currentProject,
          signalEntry: oldestSignal,
          reason: oldestSignal.signal === "MERGED" ? "handoff_next_phase_continue" : "handoff_pr_review_until_clean"
        }),
        projectCursor: {
          projectKey,
          messageId: oldestSignal.message.id,
          lastHandledMessageCreatedAt: oldestSignal.message.createdAt
        },
        clearProjectRetryLedger: projectKey,
        decidedAt: timestamp
      });
    }

    if (blockedSignals.has(oldestSignal.signal)) {
      const blockerReason = isHandoffMode(workflow) ? "handoff_blocker_clearing" : "recoverable_blocker_nudge";
      return decision("send", blockerReason, {
        projectKey,
        signal: oldestSignal.signal,
        messageId: oldestSignal.message.id,
        orchestratorId: orchestrator.id,
        prompt: buildContinuationPrompt({
          objective,
          workflow,
          currentProject,
          signalEntry: oldestSignal,
          reason: blockerReason
        }),
        projectCursor: {
          projectKey,
          messageId: oldestSignal.message.id,
          lastHandledMessageCreatedAt: oldestSignal.message.createdAt
        },
        ledgerUpdate: ledgerUpdateForRetry(objective, workflow, projectKey, blockerReason, oldestSignal.message.id, now),
        decidedAt: timestamp
      });
    }

    if (safeSignals.has(oldestSignal.signal)) {
      return decision("send", "safe_signal_continue", {
        projectKey,
        signal: oldestSignal.signal,
        messageId: oldestSignal.message.id,
        orchestratorId: orchestrator.id,
        prompt: buildContinuationPrompt({
          objective,
          workflow,
          currentProject,
          signalEntry: oldestSignal,
          reason: "safe_signal_continue"
        }),
        projectCursor: {
          projectKey,
          messageId: oldestSignal.message.id,
          lastHandledMessageCreatedAt: oldestSignal.message.createdAt
        },
        clearProjectRetryLedger: projectKey,
        decidedAt: timestamp
      });
    }
  }

  for (const project of workflow.projects) {
    if (objective.projectStatus?.[project.key] === STATUS_BLOCKED) {
      continue;
    }
    const anomaly = latestChildEvidenceAnomaly(snapshot, workflow, project.key);
    if (anomaly) {
      if (cooldownActive(objective, workflow, now)) {
        return decision("wait", "cooldown_active", {
          projectKey: project.key,
          childAgentId: anomaly.id,
          decidedAt: timestamp
        });
      }
      if (!workflow.policy?.autoContinue) {
        return decision("wait", "auto_continue_disabled", {
          projectKey: project.key,
          childAgentId: anomaly.id,
          decidedAt: timestamp
        });
      }
      return decision("send", "missing_room_evidence_recovery", {
        projectKey: project.key,
        childAgentId: anomaly.id,
        orchestratorId: orchestrator.id,
        prompt: buildContinuationPrompt({
          objective,
          workflow,
          currentProject: project,
          reason: "missing_room_evidence_recovery",
          recovery: {
            type: "child_agent_missing_room_evidence",
            childAgentId: anomaly.id,
            childAgentStatus: anomaly.status,
            projectKey: project.key
          }
        }),
        ledgerUpdate: ledgerUpdateForRetry(objective, workflow, project.key, "missing_room_evidence_recovery", anomaly.id, now),
        decidedAt: timestamp
      });
    }

    const diagnostics = unhandledDiagnosticsForProject(snapshot.messages, objective, workflow, project.key);
    if (diagnostics.length > 0) {
      const diagnostic = diagnostics[0];
      if (cooldownActive(objective, workflow, now)) {
        return decision("wait", "cooldown_active", {
          projectKey: project.key,
          messageId: diagnostic.message.id,
          decidedAt: timestamp
        });
      }
      if (!workflow.policy?.autoContinue) {
        return decision("wait", "auto_continue_disabled", {
          projectKey: project.key,
          messageId: diagnostic.message.id,
          decidedAt: timestamp
        });
      }
      return decision("send", "missing_room_evidence_recovery", {
        projectKey: project.key,
        messageId: diagnostic.message.id,
        orchestratorId: orchestrator.id,
        prompt: buildContinuationPrompt({
          objective,
          workflow,
          currentProject: project,
          reason: "missing_room_evidence_recovery",
          recovery: {
            type: "unrecognized_room_update",
            messageId: diagnostic.message.id,
            author: diagnostic.message.author,
            projectKey: project.key
          }
        }),
        ledgerUpdate: ledgerUpdateForRetry(objective, workflow, project.key, "missing_room_evidence_recovery", diagnostic.message.id, now),
        decidedAt: timestamp
      });
    }

    const cleanupAgents = closeableChildAgents(snapshot, workflow, project.key);
    if (cleanupAgents.length > 0) {
      if (cooldownActive(objective, workflow, now)) {
        return decision("wait", "cooldown_active", {
          projectKey: project.key,
          cleanupAgentIds: cleanupAgents.map((agent) => agent.id),
          decidedAt: timestamp
        });
      }
      if (!workflow.policy?.autoContinue) {
        return decision("wait", "auto_continue_disabled", {
          projectKey: project.key,
          cleanupAgentIds: cleanupAgents.map((agent) => agent.id),
          decidedAt: timestamp
        });
      }
      return decision("send", "completed_child_cleanup", {
        projectKey: project.key,
        cleanupAgentIds: cleanupAgents.map((agent) => agent.id),
        orchestratorId: orchestrator.id,
        prompt: buildContinuationPrompt({
          objective,
          workflow,
          currentProject: project,
          reason: "completed_child_cleanup",
          cleanupAgents
        }),
        decidedAt: timestamp
      });
    }
  }

  return decision("wait", "no_actionable_project", {
    decidedAt: timestamp
  });
}

function applyDecisionToObjective(objective, decisionResult, now = new Date()) {
  const timestamp = now.toISOString();
  let retryLedger = { ...(objective.retryLedger || {}) };
  if (decisionResult.clearProjectRetryLedger) {
    retryLedger = clearRetryLedgerForProject(retryLedger, decisionResult.clearProjectRetryLedger);
  }
  if (decisionResult.retryKey) {
    retryLedger = clearRetryLedgerByKeys(retryLedger, [decisionResult.retryKey]);
  }
  if (decisionResult.ledgerUpdate) {
    retryLedger[decisionResult.ledgerUpdate.key] = decisionResult.ledgerUpdate.value;
  }
  const next = {
    ...objective,
    retryLedger,
    lastDecision: {
      action: decisionResult.action,
      reason: decisionResult.reason,
      projectKey: decisionResult.projectKey || null,
      signal: decisionResult.signal || null,
      messageId: decisionResult.messageId || null,
      retryAttempt: decisionResult.retryAttempt || null,
      decidedAt: decisionResult.decidedAt || timestamp
    },
    updatedAt: timestamp
  };
  if (decisionResult.projectCursor?.projectKey) {
    next.perProjectHandledCursor = {
      ...(objective.perProjectHandledCursor || {}),
      [decisionResult.projectCursor.projectKey]: {
        messageId: decisionResult.projectCursor.messageId || null,
        lastHandledMessageCreatedAt: decisionResult.projectCursor.lastHandledMessageCreatedAt || null
      }
    };
  }
  if (decisionResult.projectStatus && decisionResult.projectKey) {
    next.projectStatus = {
      ...(objective.projectStatus || {}),
      [decisionResult.projectKey]: decisionResult.projectStatus
    };
  }
  if (decisionResult.nextStatus) {
    next.status = decisionResult.nextStatus;
  }
  if (decisionResult.action === "send") {
    next.lastContinuationAt = timestamp;
  }
  return next;
}

function sendPrompt(workflow, agentId, prompt, runner = runCommand) {
  const sendCommand = workflow.commands?.send || [];
  const sendParts = splitCommandLine(sendCommand);
  const usesPromptFile = sendParts.some((part) => String(part).includes("{promptFile}"));
  if (!usesPromptFile) {
    return runPaseoCommand(workflow, "send", { agentId, prompt }, [], runner);
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
    return runPaseoCommand(workflow, "send", { agentId, promptFile }, [], runner);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function guardRuntimeStatus(workflow, objective, snapshot = null) {
  return {
    workflowPath: workflow.workflowPath,
    workflowDigest: workflow.workflowDigest,
    workflowLoadError: workflow.workflowLoadError || null,
    perProjectHandledCursor: objective?.perProjectHandledCursor || {},
    runningChildCounts: snapshot?.runningChildCounts || Object.fromEntries(workflow.projects.map((project) => [project.key, 0])),
    retryLedger: objective?.retryLedger || {},
    watcherStatus: watcherStatus(workflow),
    lastDecision: objective?.lastDecision || null
  };
}

export function status(workflow) {
  const objective = readObjective(workflow);
  if (!objective) {
    throw new GuardError("objective_missing: run init first", "objective_missing");
  }
  let snapshot = null;
  if (objective.status === STATUS_ACTIVE) {
    try {
      snapshot = buildSnapshot(workflow);
    } catch {
      snapshot = null;
    }
  }
  return {
    path: objectivePathFor(workflow),
    objective,
    guard: guardRuntimeStatus(workflow, objective, snapshot)
  };
}

export function reconcile(workflow, { dryRun = false, now = new Date(), runner = runCommand } = {}) {
  const objective = readObjective(workflow);
  if (!objective) {
    throw new GuardError("objective_missing: run init first", "objective_missing");
  }

  const snapshot = objective.status === STATUS_ACTIVE
    ? buildSnapshot(workflow, runner)
    : { orchestrators: [], childAgents: [], allAgents: [], agentById: {}, runningChildCounts: {}, messages: [] };
  const decisionResult = decideReconcile(objective, workflow, snapshot, { now });
  const output = {
    dryRun,
    objectivePath: objectivePathFor(workflow),
    decision: decisionResult,
    guard: guardRuntimeStatus(workflow, objective, snapshot),
    observed: {
      orchestrators: snapshot.orchestrators.map((agent) => ({
        id: agent.id,
        status: agent.status,
        cwd: agent.cwd,
        labels: agent.labels,
        projectKey: agent.projectKey,
        projectViolation: agent.projectViolation,
        workspaceKind: agent.workspaceKind
      })),
      childAgents: snapshot.childAgents.map((agent) => ({
        id: agent.id,
        status: agent.status,
        cwd: agent.cwd,
        labels: agent.labels,
        projectKey: agent.projectKey,
        projectViolation: agent.projectViolation,
        workspaceKind: agent.workspaceKind
      })),
      messages: snapshot.messages.length,
      runningChildCounts: snapshot.runningChildCounts
    }
  };

  if (dryRun) {
    return output;
  }

  if (decisionResult.action === "send") {
    sendPrompt(workflow, decisionResult.orchestratorId, decisionResult.prompt, runner);
  }

  const nextObjective = applyDecisionToObjective(objective, decisionResult, now);
  writeJson(objectivePathFor(workflow), nextObjective);
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
    "  paseo-guard init [--workflow <path>]",
    "  paseo-guard status [--workflow <path>]",
    "  paseo-guard watch-status [--workflow <path>]",
    "  paseo-guard ensure-watch [--workflow <path>] [--dry-run]",
    "  paseo-guard pause [--workflow <path>]",
    "  paseo-guard resume [--workflow <path>]",
    "  paseo-guard clear [--workflow <path>]",
    "  paseo-guard reconcile [--workflow <path>] [--dry-run]"
  ].join("\n");
}

export function main(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);
  const command = args._[0];
  if (!command || args.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  const workflowPath = ensureWorkflowArg(args);
  const workflow = loadWorkflow(workflowPath);

  if (command === "init") {
    printJson(initObjective(workflow, { force: Boolean(args.force) }));
    return 0;
  }

  if (command === "status") {
    printJson(status(workflow));
    return 0;
  }

  if (command === "watch-status") {
    printJson(watcherStatus(workflow));
    return 0;
  }

  if (command === "ensure-watch") {
    printJson(ensureWatch(workflow, { dryRun: Boolean(args["dry-run"]) }));
    return 0;
  }

  if (command === "pause") {
    printJson(setObjectiveStatus(workflow, STATUS_PAUSED));
    return 0;
  }

  if (command === "resume") {
    printJson(setObjectiveStatus(workflow, STATUS_ACTIVE));
    return 0;
  }

  if (command === "clear") {
    printJson(setObjectiveStatus(workflow, STATUS_COMPLETE));
    return 0;
  }

  if (command === "reconcile") {
    printJson(reconcile(workflow, { dryRun: Boolean(args["dry-run"]) }));
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
