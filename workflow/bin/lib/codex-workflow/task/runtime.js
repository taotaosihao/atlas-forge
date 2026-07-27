"use strict";

const fs = require("fs");
const path = require("path");
const { atomicWriteJson } = require("../core/atomic-file");
const {
  appendLifecycleEvent,
  readAuthoritativeEvents,
  readEventRows,
} = require("../core/event-store");
const { taskEventFile } = require("../core/task-mutation");
const { withLock } = require("../core/lock");
const { taskArtifactDir, taskArtifactDirRelative } = require("../core/paths");
const {
  REQUIRED_FIELDS,
  parseTaskHeader,
  requireTaskFile,
  updateTaskFields,
  validateTaskFile,
} = require("./repository");
const {
  captureVerificationIdentity,
  digestCanonical,
  identityInputPaths,
} = require("../verification/identity");
const {
  executionCompletionAdmission,
  requiredGateAdmission,
} = require("../verification/required-gates");

function timestampSeconds(clock = () => new Date()) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("clock must return a valid date");
  }
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function readJsonObject(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`corrupt task state: ${file}: expected a JSON object`);
    }
    return value;
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    if (error instanceof SyntaxError) {
      throw new Error(`corrupt task state: ${file}: ${error.message}`);
    }
    throw error;
  }
}

function taskStateFile(paths, taskId) {
  return path.join(taskArtifactDir(paths, taskId), "state.json");
}

function taskRuntimeFile(paths, taskId) {
  return path.join(taskArtifactDir(paths, taskId), "runtime.jsonl");
}

function ensureFile(file, content) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, content, "utf8");
  }
}

function ensureTaskRuntimeScaffold(paths, taskId, title) {
  const artifactDir = taskArtifactDir(paths, taskId);
  const verificationDir = path.join(artifactDir, "verification");
  const teamDir = path.join(artifactDir, "team");
  const hookFailuresDir = path.join(artifactDir, "hook-failures");
  fs.mkdirSync(verificationDir, { recursive: true });
  fs.mkdirSync(teamDir, { recursive: true });
  fs.mkdirSync(hookFailuresDir, { recursive: true });

  ensureFile(path.join(artifactDir, "context.md"), `# Context\n\nTask: ${taskId}\nTitle: ${title}\n`);
  ensureFile(path.join(artifactDir, "spec.md"), `# Spec\n\nTask: ${taskId}\n`);
  ensureFile(path.join(artifactDir, "analysis.md"), `# Analysis\n\nTask: ${taskId}\n`);
  ensureFile(path.join(teamDir, "decision.md"), "# Team Decision\n\nPending discussion.\n");
  ensureFile(path.join(teamDir, "staffing.md"), "# Staffing\n\nPending discussion.\n");
}

function headerValue(fields, key) {
  return fields[key] ? fields[key][0] : "";
}

function projectTaskState(paths, taskId, taskContent, currentState = {}, clock = () => new Date()) {
  const fields = parseTaskHeader(taskContent);
  const missing = REQUIRED_FIELDS.filter((field) => !fields[field] || fields[field].length !== 1);
  if (missing.length > 0) {
    throw new Error(`cannot project malformed task content: missing or duplicate ${missing.join(" ")}`);
  }
  const task = Object.fromEntries(REQUIRED_FIELDS.map((field) => [field, fields[field][0]]));
  if (task.id !== taskId) {
    throw new Error(`cannot project task id mismatch: ${task.id} != ${taskId}`);
  }
  const state = JSON.parse(JSON.stringify(currentState || {}));
  const activeTeam =
    state.active_team && typeof state.active_team === "object" ? state.active_team : {};
  if (activeTeam.schema_version !== 2) {
    activeTeam.backend = headerValue(fields, "active_team_backend") || activeTeam.backend || "";
    activeTeam.mode = headerValue(fields, "active_team_mode") || activeTeam.mode || "";
    activeTeam.status = headerValue(fields, "active_team_status") || activeTeam.status || "";
    activeTeam.decision =
      headerValue(fields, "active_team_decision") || activeTeam.decision || "";
  }
  Object.assign(state, {
    task_id: task.id,
    title: task.title,
    status: task.status,
    artifact_dir: taskArtifactDirRelative(paths, taskId),
    last_verified_at: headerValue(fields, "last_verified_at"),
    updated_at: timestampSeconds(clock),
    active_team: activeTeam,
  });
  for (const key of [
    "blocked_reason",
    "blocked_at",
    "resumed_at",
    "archived_reason",
    "archived_at",
    "no_verify_reason",
    "no_verify_at",
  ]) {
    const value = headerValue(fields, key);
    if (value) state[key] = value;
  }
  return state;
}

function writeTaskState(paths, taskId, clock = () => new Date()) {
  const file = requireTaskFile(paths.tasksDir, taskId);
  validateTaskFile(file);
  const stateFile = taskStateFile(paths, taskId);
  const state = projectTaskState(
    paths,
    taskId,
    fs.readFileSync(file, "utf8"),
    readJsonObject(stateFile),
    clock,
  );
  atomicWriteJson(stateFile, state);
  return state;
}

function castStateValue(value) {
  if (value === "__TRUE__") {
    return true;
  }
  if (value === "__FALSE__") {
    return false;
  }
  if (value === "__NULL__") {
    return null;
  }
  if (/^\d+$/.test(value)) {
    return Number(value);
  }
  return value;
}

function setTaskStateFields(paths, taskId, updates, clock = () => new Date()) {
  const stateFile = taskStateFile(paths, taskId);
  const state = readJsonObject(stateFile);
  for (const [key, rawValue] of Object.entries(updates)) {
    const parts = key.split(".");
    let cursor = state;
    for (const part of parts.slice(0, -1)) {
      if (!cursor[part] || typeof cursor[part] !== "object") {
        cursor[part] = {};
      }
      cursor = cursor[part];
    }
    cursor[parts.at(-1)] = castStateValue(String(rawValue));
  }
  state.updated_at = timestampSeconds(clock);
  atomicWriteJson(stateFile, state);
  return state;
}

function replaceActiveTeam(paths, taskId, activeTeam, clock = () => new Date()) {
  if (!activeTeam || typeof activeTeam !== "object" || Array.isArray(activeTeam)) {
    throw new TypeError("activeTeam must be an object");
  }
  const stateFile = taskStateFile(paths, taskId);
  const state = readJsonObject(stateFile);
  state.active_team = activeTeam;
  state.updated_at = timestampSeconds(clock);
  atomicWriteJson(stateFile, state);
  return state;
}

function writeTaskCompletion(paths, taskId, completion, clock = () => new Date()) {
  if (!completion || typeof completion !== "object" || Array.isArray(completion)) {
    throw new TypeError("completion must be an object");
  }
  const stateFile = taskStateFile(paths, taskId);
  const state = readJsonObject(stateFile);
  state.completion = completion;
  state.updated_at = timestampSeconds(clock);
  atomicWriteJson(stateFile, state);
  return state;
}

function syncTaskRuntime(paths, taskId, clock = () => new Date()) {
  const file = requireTaskFile(paths.tasksDir, taskId);
  const { fields, task } = validateTaskFile(file);
  readJsonObject(taskStateFile(paths, taskId));
  ensureTaskRuntimeScaffold(paths, taskId, task.title);
  updateTaskFields(file, {
    artifact_dir: taskArtifactDirRelative(paths, taskId),
    last_verified_at: headerValue(fields, "last_verified_at"),
    active_team_backend: headerValue(fields, "active_team_backend"),
    active_team_mode: headerValue(fields, "active_team_mode"),
    active_team_status: headerValue(fields, "active_team_status"),
    active_team_decision: headerValue(fields, "active_team_decision"),
  });
  return writeTaskState(paths, taskId, clock);
}

function writeCurrentTaskPointer(paths, taskId, clock = () => new Date()) {
  return withLock(paths.pointerLockFile, () => {
    const file = requireTaskFile(paths.tasksDir, taskId);
    const { task } = validateTaskFile(file);
    const pointer = {
      task_id: taskId,
      title: task.title,
      artifact_dir: taskArtifactDirRelative(paths, taskId),
      updated_at: timestampSeconds(clock),
    };
    atomicWriteJson(paths.currentTaskFile, pointer);
    return pointer;
  });
}

function clearCurrentTaskPointer(paths, taskId = "") {
  return withLock(paths.pointerLockFile, () => {
    if (!fs.existsSync(paths.currentTaskFile)) {
      return false;
    }
    if (!taskId) {
      fs.unlinkSync(paths.currentTaskFile);
      return true;
    }

    let pointer;
    try {
      pointer = JSON.parse(fs.readFileSync(paths.currentTaskFile, "utf8"));
    } catch {
      fs.unlinkSync(paths.currentTaskFile);
      return true;
    }
    if (pointer.task_id === taskId) {
      fs.unlinkSync(paths.currentTaskFile);
      return true;
    }
    return false;
  });
}

function appendTaskLifecycleEvent(paths, taskId, kind, data, options = {}) {
  return appendLifecycleEvent(taskRuntimeFile(paths, taskId), {
    taskId,
    kind,
    data,
    ...options,
  });
}

function resolveCodeHomeReference(paths, reference) {
  return path.isAbsolute(reference) ? reference : path.resolve(paths.codeHome, reference);
}

function successfulVerificationAdmission(paths, taskId, options = {}) {
  const state = readJsonObject(taskStateFile(paths, taskId));
  try {
    const execution = executionCompletionAdmission(paths, taskId, state);
    if (execution) return execution;
    const required = requiredGateAdmission(paths, taskId, state, options);
    if (required) return required;
  } catch (error) {
    return { passed: false, reasons: [`unable to load required verification gates: ${error.message}`] };
  }
  const verification =
    state.verification && typeof state.verification === "object" ? state.verification : {};
  const reasons = [];
  if (!String(state.last_verified_at || "").trim()) {
    reasons.push("missing last_verified_at");
  }
  if (!(verification.last_exit_code === 0 || verification.last_exit_code === "0")) {
    reasons.push("last verification exit code is not zero");
  }
  if (verification.outcome !== "passed") {
    reasons.push(`last verification outcome is not passed: ${verification.outcome || "missing"}`);
  }
  if (verification.skipped === true) {
    reasons.push("last verification is marked skipped");
  }
  if (verification.identity_schema_version !== 2) {
    reasons.push("missing verification identity schema version 2");
  }
  if (verification.identity_stable !== true) {
    reasons.push("verification snapshot changed while the command ran");
  }
  if (!verification.last_identity_record) {
    reasons.push("missing verification identity record");
  }
  if (reasons.length > 0) return { passed: false, reasons };

  let record;
  try {
    const recordFile = resolveCodeHomeReference(paths, verification.last_identity_record);
    record = readJsonObject(recordFile);
    if (record.schema_version !== 2 || record.task_id !== taskId) {
      reasons.push("verification identity record task or schema mismatch");
    }
    const withoutId = { ...record };
    delete withoutId.record_id;
    if (record.record_id !== digestCanonical(withoutId)) {
      reasons.push("verification identity record digest mismatch");
    }
    if (record.identity_digest !== digestCanonical(record.identity || {})) {
      reasons.push("verification identity payload digest mismatch");
    }
    if (record.record_id !== verification.record_id
      || record.identity_digest !== verification.identity_digest) {
      reasons.push("verification state pointer does not match the identity record");
    }
    if (record.verdict !== "passed" || record.outcome !== "passed"
      || record.provenance !== "executed" || record.snapshot_stable !== true) {
      reasons.push("verification identity record is not a stable executed pass");
    }
    if (reasons.length === 0) {
      const captureIdentity = options.captureIdentity || captureVerificationIdentity;
      const current = captureIdentity({
        argv: record.identity.argv,
        cwd: record.identity.cwd_realpath,
        environment: options.environment || process.env,
        inputPaths: identityInputPaths(record.identity),
      });
      if (current.identityDigest !== record.identity_digest) {
        reasons.push("verification identity no longer matches the current snapshot");
      }
    }
  } catch (error) {
    reasons.push(`unable to validate verification identity: ${error.message}`);
  }
  return {
    passed: reasons.length === 0,
    reasons,
    recordId: record && record.record_id ? record.record_id : "",
    identityDigest: record && record.identity_digest ? record.identity_digest : "",
  };
}

function hasSuccessfulVerification(paths, taskId, options = {}) {
  return successfulVerificationAdmission(paths, taskId, options).passed;
}

function lifecycleEvents(paths, taskId) {
  const authoritative = readAuthoritativeEvents(taskEventFile(paths, taskId), taskId);
  if (authoritative.length > 0) {
    return authoritative
      .filter((event) => event.kind.startsWith("task."))
      .map((event) => ({
        ...event,
        kind: event.kind === "task.completion.closed" ? "task.done" : event.kind,
      }));
  }
  return readEventRows(taskRuntimeFile(paths, taskId)).filter(
    (row) =>
      row &&
      row.schema_version === 1 &&
      row.task_id === taskId &&
      typeof row.kind === "string" &&
      row.kind.startsWith("task.") &&
      typeof row.occurred_at === "string" &&
      !Number.isNaN(Date.parse(row.occurred_at)),
  );
}

module.exports = {
  appendTaskLifecycleEvent,
  clearCurrentTaskPointer,
  ensureTaskRuntimeScaffold,
  hasSuccessfulVerification,
  lifecycleEvents,
  readJsonObject,
  projectTaskState,
  replaceActiveTeam,
  setTaskStateFields,
  successfulVerificationAdmission,
  syncTaskRuntime,
  taskRuntimeFile,
  taskStateFile,
  timestampSeconds,
  writeCurrentTaskPointer,
  writeTaskCompletion,
  writeTaskState,
};
