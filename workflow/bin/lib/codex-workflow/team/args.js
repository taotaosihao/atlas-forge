"use strict";

// Pure argument parsing and validation for the team commands. No filesystem,
// task state, or lane-registry access belongs here.

const { CommandError } = require("../core/command-runtime");

const RECORD_START_USAGE =
  'usage: codex-workflow team-record-start <task-id> "<objective>" --mode discuss|execute [--brief <brief.json>] [--operation-id <id>] [--grant-id <id>] [--scope-digest <sha256:hex>] [--backend native|paseo] [--fallback-policy codex|none] [--agents N] [--roles "<roles>"] [--providers "<providers>"] [--selection-authority-kind user-message|operator-input] [--selection-authority-ref <ref>] [--authorization-ref <user-message-ref>]';
const RECORD_FINALIZE_USAGE =
  "usage: codex-workflow team-record-finalize <task-id> --backend native|paseo --status complete|failed|interrupted --round <file> --decision <file> --staffing <file>";
const LOOP_RECORD_USAGE =
  "usage: codex-workflow team-loop-record <task-id> --backend native|paseo --status loop-done|loop-incomplete|loop-failed|loop-timeout --loop <file> --iterations N [--max-iterations N] [--max-time <duration>]";
const STATUS_USAGE = "usage: codex-workflow team-status <task-id>";
const STOP_USAGE = "usage: codex-workflow team-stop <task-id>";
const PROMOTE_USAGE =
  "usage: codex-workflow team-promote <task-id> --to execute|worktree|finish [--authorization-ref <user-message-ref>] [--brief <brief.json>] [--operation-id <id>] [--grant-id <id>] [--scope-digest <sha256:hex>]";
const AUTHORIZE_USAGE =
  'usage: codex-workflow team-authorize <task-id> "<objective>" --authorization-ref <user-message:ref|operator-input:ref> --brief <brief.json> --grant-id <id> --operation-id <id> [--expected-scope-digest <sha256:hex>]';
const REPLAN_USAGE =
  'usage: codex-workflow team-replan <task-id> "<objective>" --authorization-ref <new-ref> --brief <brief.json> --grant-id <new-id> --operation-id <id> --evidence-policy invalidate-incompatible|retain-compatible --expected-delta <json> [--retain-evidence <receipt-id>]...';
const GRANT_USAGE = "usage: codex-workflow team-grant <task-id>";
const SELECTION_USAGE = "usage: codex-workflow team-selection-record <task-id> --operation-id <id> --event-id <id> --kind backend|model|capability [options]";
const LANE_USAGE = "usage: codex-workflow team-lane-record <task-id> --operation-id <id> --action open|close --lane <id> [options]";
const DISPATCH_USAGE = "usage: codex-workflow team-dispatch-record <task-id> --operation-id <id> --action open|dispose|close --dispatch <id> [options]";
const ATTEMPT_USAGE = "usage: codex-workflow team-attempt-record <task-id> --operation-id <id> --action reserve|bind|running|terminal|quiesced|observe|resolve-launch --attempt <id> [options]";
const FALLBACK_USAGE = "usage: codex-workflow team-fallback-record <task-id> --operation-id <id> --from-attempt <id> --to-attempt <id> --launch-operation-id <id> [options]";

function parseFlags(argv, startIndex, configuration) {
  const result = { ...configuration.defaults };
  for (let index = startIndex; index < argv.length; index += 1) {
    const argument = argv[index];
    if (Object.hasOwn(configuration.flags, argument)) {
      if (index + 1 >= argv.length) {
        throw new CommandError(configuration.usage);
      }
      result[configuration.flags[argument]] = argv[++index];
      continue;
    }
    let matched = false;
    for (const [flag, field] of Object.entries(configuration.flags)) {
      if (argument.startsWith(`${flag}=`)) {
        result[field] = argument.slice(flag.length + 1);
        matched = true;
        break;
      }
    }
    if (!matched) {
      throw new CommandError(`unknown ${configuration.name} option: ${argument}`);
    }
  }
  for (const [field, message] of configuration.required || []) {
    if (!result[field]) {
      throw new CommandError(message);
    }
  }
  return result;
}

function validatePositiveInteger(value, label) {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new CommandError(`invalid ${label}: ${value}`);
  }
}

function validateBackend(backend) {
  if (!new Set(["native", "paseo"]).has(backend)) {
    throw new CommandError(`invalid team backend: ${backend}`);
  }
}

function validateMode(mode) {
  if (!new Set(["discuss", "execute"]).has(mode)) {
    throw new CommandError(`invalid team mode: ${mode}`);
  }
}

function validateFinalStatus(status) {
  if (!new Set(["complete", "failed", "interrupted"]).has(status)) {
    throw new CommandError(`invalid team final status: ${status}`);
  }
}

function validateLoopStatus(status) {
  if (!new Set(["loop-done", "loop-incomplete", "loop-failed", "loop-timeout"]).has(status)) {
    throw new CommandError(`invalid team loop status: ${status}`);
  }
}

function validateQuery(value) {
  if (!value || /[\n\r]/.test(value) || /^\s*$/.test(value)) {
    throw new CommandError("unsafe query: query must be a single non-empty line");
  }
}

function validateReason(value, label) {
  if (!value || /[\n\r\t]/.test(value) || /^\s*$/.test(value)) {
    throw new CommandError(`unsafe ${label}: reason must be a single non-empty line`);
  }
}

function validateExecutionAuthorization(mode, authorizationRef, grantId = "", scopeDigest = "") {
  if (mode !== "execute") {
    return;
  }
  if (authorizationRef) validateReason(authorizationRef, "execute authorization ref");
  if (!grantId || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(grantId)) {
    throw new CommandError("missing or invalid execute grant_id");
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(scopeDigest || "")) {
    throw new CommandError("missing or invalid execute scope digest");
  }
}

function commaList(value) {
  if (!value) return [];
  return [...new Set(String(value).split(",").map((item) => item.trim()).filter(Boolean))];
}

function booleanValue(value, label) {
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0" || value === "") return false;
  throw new CommandError(`invalid ${label}: ${value}`);
}

function parseControlArgs(argv, usage, name) {
  if (argv.length === 0) throw new CommandError(usage);
  const flags = {
    "--operation-id": "operationId",
    "--event-id": "eventId",
    "--kind": "kind",
    "--scope": "scope",
    "--authority-kind": "authorityKind",
    "--authority-ref": "authorityRef",
    "--backend": "backend",
    "--provider": "provider",
    "--model": "model",
    "--model-selection-event": "modelSelectionEventId",
    "--capability-snapshot": "capabilitySnapshotId",
    "--action": "action",
    "--lane": "laneId",
    "--purpose": "purpose",
    "--role": "role",
    "--paths": "paths",
    "--fallback-policy": "fallbackPolicy",
    "--selection-event": "selectionEventId",
    "--convergence": "convergence",
    "--dispatch": "dispatchId",
    "--objective": "objective",
    "--required-perspective": "requiredPerspective",
    "--disposition": "disposition",
    "--admitted-attempts": "admittedAttempts",
    "--evidence-refs": "evidenceRefs",
    "--resolution-ref": "resolutionRef",
    "--claim-operation-id": "claimOperationId",
    "--attempt": "attemptId",
    "--origin": "origin",
    "--retry-of": "retryOf",
    "--launch-operation-id": "launchOperationId",
    "--runtime-agent-id": "runtimeAgentId",
    "--workspace-id": "workspaceId",
    "--worktree": "worktree",
    "--base-sha": "baseSha",
    "--runtime-mode-id": "runtimeModeId",
    "--perspective": "perspectiveId",
    "--outcome": "outcome",
    "--observation-id": "observationId",
    "--observer-action": "observerAction",
    "--observer-args-json": "observerArgsJson",
    "--failure-class": "failureClass",
    "--retry-eligible": "retryEligible",
    "--launch-invoked": "launchInvoked",
    "--reason": "reason",
    "--from-attempt": "fromAttemptId",
    "--to-attempt": "toAttemptId",
    "--worktree-fingerprint": "worktreeFingerprint",
  };
  const result = { taskId: argv[0] };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--writable") {
      result.writable = true;
      continue;
    }
    let flag = argument;
    let value;
    const separator = argument.indexOf("=");
    if (separator !== -1) {
      flag = argument.slice(0, separator);
      value = argument.slice(separator + 1);
    }
    const field = flags[flag];
    if (!field) throw new CommandError(`unknown ${name} option: ${argument}`);
    if (value === undefined) {
      if (index + 1 >= argv.length) throw new CommandError(usage);
      value = argv[++index];
    }
    result[field] = value;
  }
  if (!result.operationId) throw new CommandError(`missing ${name} operation id`);
  return result;
}

function validateActionFields(parsed, name, usage, specifications) {
  const specification = specifications[parsed.action || parsed.kind];
  if (!specification) throw new CommandError(usage);
  for (const field of specification.required || []) {
    if (parsed[field] === undefined || parsed[field] === "") {
      throw new CommandError(`missing ${name} ${field}`);
    }
  }
  const allowed = new Set(["taskId", "operationId", "action", ...specification.allowed]);
  for (const [field, value] of Object.entries(parsed)) {
    if (!allowed.has(field) && value !== undefined && value !== "") {
      throw new CommandError(`${name} ${parsed.action || parsed.kind} does not accept ${field}`);
    }
  }
  return parsed;
}

function parseSelectionArgs(argv) {
  const parsed = parseControlArgs(argv, SELECTION_USAGE, "team-selection-record");
  return validateActionFields(parsed, "team-selection-record", SELECTION_USAGE, {
    backend: {
      required: ["eventId", "scope", "authorityKind", "authorityRef", "backend"],
      allowed: ["kind", "eventId", "scope", "authorityKind", "authorityRef", "backend"],
    },
    model: {
      required: ["eventId", "scope", "authorityKind", "authorityRef", "provider", "model"],
      allowed: ["kind", "eventId", "scope", "authorityKind", "authorityRef", "provider", "model"],
    },
    capability: {
      required: ["eventId", "authorityRef", "provider", "model"],
      allowed: ["kind", "eventId", "authorityRef", "provider", "model"],
    },
  });
}

function parseLaneArgs(argv) {
  const parsed = parseControlArgs(argv, LANE_USAGE, "team-lane-record");
  return validateActionFields(parsed, "team-lane-record", LANE_USAGE, {
    open: {
      required: ["laneId"],
      allowed: ["laneId", "purpose", "role", "paths", "fallbackPolicy", "selectionEventId", "backend", "writable"],
    },
    close: { required: ["laneId", "convergence"], allowed: ["laneId", "convergence"] },
  });
}

function parseDispatchArgs(argv) {
  const parsed = parseControlArgs(argv, DISPATCH_USAGE, "team-dispatch-record");
  return validateActionFields(parsed, "team-dispatch-record", DISPATCH_USAGE, {
    open: {
      required: ["laneId", "dispatchId"],
      allowed: ["laneId", "dispatchId", "objective", "backend", "fallbackPolicy", "selectionEventId", "requiredPerspective"],
    },
    dispose: {
      required: ["dispatchId", "disposition"],
      allowed: ["dispatchId", "disposition", "admittedAttempts", "evidenceRefs", "resolutionRef"],
    },
    close: { required: ["dispatchId"], allowed: ["dispatchId"] },
  });
}

function parseAttemptArgs(argv) {
  const parsed = parseControlArgs(argv, ATTEMPT_USAGE, "team-attempt-record");
  return validateActionFields(parsed, "team-attempt-record", ATTEMPT_USAGE, {
    reserve: {
      required: ["dispatchId", "attemptId", "launchOperationId"],
      allowed: ["dispatchId", "attemptId", "launchOperationId", "origin", "retryOf", "backend", "provider", "model", "modelSelectionEventId", "capabilitySnapshotId", "paths", "writable", "runtimeModeId", "perspectiveId"],
    },
    bind: {
      required: ["attemptId", "launchOperationId", "runtimeAgentId"],
      allowed: ["attemptId", "launchOperationId", "runtimeAgentId", "observationId", "workspaceId", "worktree", "baseSha", "runtimeModeId"],
    },
    running: { required: ["attemptId"], allowed: ["attemptId"] },
    terminal: {
      required: ["attemptId", "outcome"],
      allowed: ["attemptId", "outcome", "observationId", "failureClass", "retryEligible", "launchInvoked", "evidenceRefs"],
    },
    quiesced: { required: ["attemptId"], allowed: ["attemptId", "observationId", "evidenceRefs"] },
    observe: {
      required: ["attemptId", "observationId", "observerAction"],
      allowed: ["attemptId", "observationId", "observerAction", "observerArgsJson", "evidenceRefs"],
    },
    "resolve-launch": {
      required: [
        "attemptId", "claimOperationId", "launchOperationId", "disposition",
        "authorityRef", "reason", "evidenceRefs",
      ],
      allowed: [
        "attemptId", "claimOperationId", "launchOperationId", "disposition",
        "authorityRef", "reason", "evidenceRefs",
      ],
    },
  });
}

function parseFallbackArgs(argv) {
  const parsed = parseControlArgs(argv, FALLBACK_USAGE, "team-fallback-record");
  if (parsed.fromAttemptId === undefined || parsed.toAttemptId === undefined
    || parsed.launchOperationId === undefined) {
    throw new CommandError(FALLBACK_USAGE);
  }
  const allowed = new Set(["taskId", "operationId", "fromAttemptId", "toAttemptId",
    "launchOperationId", "worktreeFingerprint", "evidenceRefs"]);
  for (const [field, value] of Object.entries(parsed)) {
    if (!allowed.has(field) && value !== undefined && value !== "") {
      throw new CommandError(`team-fallback-record does not accept ${field}`);
    }
  }
  return parsed;
}

function parseRecordStartArgs(argv) {
  if (argv.length < 2) {
    throw new CommandError(RECORD_START_USAGE);
  }
  const parsed = parseFlags(argv, 2, {
    name: "team-record-start",
    usage: RECORD_START_USAGE,
    defaults: {
      backend: "",
      mode: "",
      agents: "",
      roles: "",
      providers: "",
      fallbackPolicy: "codex",
      selectionAuthorityKind: "",
      selectionAuthorityRef: "",
      authorizationRef: "",
      briefPath: "",
      grantId: "",
      operationId: "",
      scopeDigest: "",
    },
    flags: {
      "--backend": "backend",
      "--mode": "mode",
      "--agents": "agents",
      "--roles": "roles",
      "--providers": "providers",
      "--fallback-policy": "fallbackPolicy",
      "--selection-authority-kind": "selectionAuthorityKind",
      "--selection-authority-ref": "selectionAuthorityRef",
      "--authorization-ref": "authorizationRef",
      "--brief": "briefPath",
      "--grant-id": "grantId",
      "--operation-id": "operationId",
      "--scope-digest": "scopeDigest",
    },
    required: [
      ["mode", "missing team mode"],
    ],
  });
  if (parsed.mode === "execute") {
    if (!parsed.briefPath) throw new CommandError("execute Team start requires --brief");
    if (!parsed.operationId) throw new CommandError("execute Team start requires --operation-id");
  }
  if (parsed.operationId && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(parsed.operationId)) {
    throw new CommandError("team start operation id must be a safe identifier");
  }
  return { ...parsed, objective: argv[1], taskId: argv[0] };
}

function parseJsonStringArray(value, label) {
  let parsed;
  try {
    parsed = JSON.parse(value || "[]");
  } catch (error) {
    throw new CommandError(`invalid ${label} JSON: ${error.message}`);
  }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new CommandError(`${label} must be a JSON array of strings`);
  }
  return parsed;
}

function parseRecordFinalizeArgs(argv) {
  if (argv.length === 0) {
    throw new CommandError(RECORD_FINALIZE_USAGE);
  }
  return {
    ...parseFlags(argv, 1, {
      name: "team-record-finalize",
      usage: RECORD_FINALIZE_USAGE,
      defaults: { backend: "", status: "", roundFile: "", decisionFile: "", staffingFile: "" },
      flags: {
        "--backend": "backend",
        "--status": "status",
        "--round": "roundFile",
        "--decision": "decisionFile",
        "--staffing": "staffingFile",
      },
      required: [
        ["backend", "missing team backend"],
        ["status", "missing team status"],
      ],
    }),
    taskId: argv[0],
  };
}

function parseLoopRecordArgs(argv) {
  if (argv.length === 0) {
    throw new CommandError(LOOP_RECORD_USAGE);
  }
  return {
    ...parseFlags(argv, 1, {
      name: "team-loop-record",
      usage: LOOP_RECORD_USAGE,
      defaults: {
        backend: "",
        status: "",
        loopFile: "",
        iterations: "",
        maxIterations: "",
        maxTime: "",
      },
      flags: {
        "--backend": "backend",
        "--status": "status",
        "--loop": "loopFile",
        "--iterations": "iterations",
        "--max-iterations": "maxIterations",
        "--max-time": "maxTime",
      },
      required: [
        ["backend", "missing team backend"],
        ["status", "missing team loop status"],
        ["iterations", "missing team loop iterations"],
      ],
    }),
    taskId: argv[0],
  };
}

function parsePromoteArgs(argv) {
  if (argv.length === 0) {
    throw new CommandError(PROMOTE_USAGE);
  }
  const parsed = parseFlags(argv, 1, {
    name: "team-promote",
    usage: PROMOTE_USAGE,
    defaults: {
      target: "", authorizationRef: "", briefPath: "", grantId: "", operationId: "", scopeDigest: "",
    },
    flags: {
      "--to": "target",
      "--authorization-ref": "authorizationRef",
      "--brief": "briefPath",
      "--grant-id": "grantId",
      "--operation-id": "operationId",
      "--scope-digest": "scopeDigest",
    },
  });
  if (!new Set(["execute", "worktree", "finish"]).has(parsed.target)) {
    throw new CommandError(`invalid promotion target: ${parsed.target}`);
  }
  if (parsed.target === "execute") {
    if (!parsed.briefPath) throw new CommandError("execute Team promotion requires --brief");
    if (!parsed.operationId) throw new CommandError("execute Team promotion requires --operation-id");
  }
  if (parsed.operationId && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(parsed.operationId)) {
    throw new CommandError("team promotion operation id must be a safe identifier");
  }
  return { ...parsed, taskId: argv[0] };
}

function parseAuthorityMutationArgs(argv, name, usage, { replan = false } = {}) {
  if (argv.length < 2) throw new CommandError(usage);
  const parsed = {
    authorizationRef: "",
    briefPath: "",
    evidencePolicy: "",
    expectedDelta: null,
    expectedScopeDigest: "",
    grantId: "",
    objective: argv[1],
    operationId: "",
    retainEvidence: [],
    taskId: argv[0],
  };
  const fields = new Map([
    ["--authorization-ref", "authorizationRef"],
    ["--brief", "briefPath"],
    ["--evidence-policy", "evidencePolicy"],
    ["--expected-delta", "expectedDelta"],
    ["--expected-scope-digest", "expectedScopeDigest"],
    ["--grant-id", "grantId"],
    ["--operation-id", "operationId"],
    ["--retain-evidence", "retainEvidence"],
  ]);
  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    let option = argument;
    let value;
    const separator = argument.indexOf("=");
    if (separator !== -1) {
      option = argument.slice(0, separator);
      value = argument.slice(separator + 1);
    }
    const field = fields.get(option);
    if (!field || (!replan && new Set(["evidencePolicy", "expectedDelta", "retainEvidence"]).has(field))) {
      throw new CommandError(`unknown ${name} option: ${argument}`);
    }
    if (value === undefined) {
      if (index + 1 >= argv.length) throw new CommandError(usage);
      value = argv[++index];
    }
    if (field === "retainEvidence") parsed.retainEvidence.push(value);
    else if (parsed[field] !== "" && parsed[field] !== null) throw new CommandError(`duplicate ${name} option: ${option}`);
    else parsed[field] = value;
  }
  for (const field of ["authorizationRef", "briefPath", "grantId", "operationId"]) {
    if (!parsed[field]) throw new CommandError(usage);
  }
  validateReason(parsed.authorizationRef, `${name} authorization ref`);
  validateReason(parsed.objective, `${name} objective`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(parsed.grantId)
    || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(parsed.operationId)) {
    throw new CommandError(`${name} grant and operation ids must be safe identifiers`);
  }
  if (parsed.expectedScopeDigest
    && !/^sha256:[a-f0-9]{64}$/.test(parsed.expectedScopeDigest)) {
    throw new CommandError(`${name} expected scope digest is invalid`);
  }
  if (replan) {
    if (!new Set(["invalidate-incompatible", "retain-compatible"]).has(parsed.evidencePolicy)
      || typeof parsed.expectedDelta !== "string") {
      throw new CommandError(usage);
    }
    try {
      parsed.expectedDelta = JSON.parse(parsed.expectedDelta);
    } catch (error) {
      throw new CommandError(`${name} expected delta is invalid JSON: ${error.message}`);
    }
    if (!Array.isArray(parsed.expectedDelta)) throw new CommandError(`${name} expected delta must be an array`);
    if (parsed.evidencePolicy === "invalidate-incompatible" && parsed.retainEvidence.length > 0) {
      throw new CommandError(`${name} invalidate-incompatible policy cannot retain evidence`);
    }
    if (new Set(parsed.retainEvidence).size !== parsed.retainEvidence.length) {
      throw new CommandError(`${name} retain evidence ids must be unique`);
    }
  }
  return parsed;
}

function parseAuthorizeArgs(argv) {
  return parseAuthorityMutationArgs(argv, "team-authorize", AUTHORIZE_USAGE);
}

function parseReplanArgs(argv) {
  return parseAuthorityMutationArgs(argv, "team-replan", REPLAN_USAGE, { replan: true });
}

function parseGrantArgs(argv) {
  if (argv.length !== 1 || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(argv[0])) {
    throw new CommandError(GRANT_USAGE);
  }
  return { taskId: argv[0] };
}

module.exports = {
  AUTHORIZE_USAGE,
  ATTEMPT_USAGE,
  DISPATCH_USAGE,
  FALLBACK_USAGE,
  GRANT_USAGE,
  LANE_USAGE,
  LOOP_RECORD_USAGE,
  PROMOTE_USAGE,
  RECORD_FINALIZE_USAGE,
  RECORD_START_USAGE,
  REPLAN_USAGE,
  SELECTION_USAGE,
  STATUS_USAGE,
  STOP_USAGE,
  booleanValue,
  commaList,
  parseAuthorizeArgs,
  parseAttemptArgs,
  parseControlArgs,
  parseDispatchArgs,
  parseFallbackArgs,
  parseFlags,
  parseGrantArgs,
  parseJsonStringArray,
  parseLaneArgs,
  parseLoopRecordArgs,
  parsePromoteArgs,
  parseRecordFinalizeArgs,
  parseRecordStartArgs,
  parseReplanArgs,
  parseSelectionArgs,
  validateActionFields,
  validateBackend,
  validateExecutionAuthorization,
  validateFinalStatus,
  validateLoopStatus,
  validateMode,
  validatePositiveInteger,
  validateQuery,
  validateReason,
};
