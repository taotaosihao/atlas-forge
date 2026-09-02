"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { canonicalJson, readAuthoritativeEvents, sha256 } = require("../core/event-store");
const { taskArtifactDir } = require("../core/paths");
const {
  materializeTaskProjection,
  mutateTaskRuntime,
  projectionMatches,
  taskEventFile,
} = require("../core/task-mutation");
const {
  CommandError,
  commandOptions,
  oneLine,
  prepareTaskCommand,
} = require("../core/command-runtime");

const DECISION_RECORD_USAGE =
  'usage: codex-workflow decision-record <task-id> --id <decision-id> --authority-ref <user-message:ref|operator-input:ref> --statement "<current decision>" [--supersedes <decision-id>]... [--reject "<superseded behavior>"]... [--resolves <conflict-id>]... [--operation-id <id>]';
const DECISION_CONFLICT_USAGE =
  'usage: codex-workflow decision-conflict <task-id> --id <conflict-id> --decision <decision-id> --reason "<conflict>" --evidence <path-or-ref> [--operation-id <id>]';
const DECISION_CHECK_USAGE =
  "usage: codex-workflow decision-check <task-id>";
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const AUTHORITY_REF = /^(user-message|operator-input):[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const DECISION_KINDS = new Set(["decision.recorded", "decision.conflict.recorded"]);

function unique(values) {
  return [...new Set(values)];
}

function parseArgs(argv, configuration) {
  if (argv.length === 0) throw new CommandError(configuration.usage);
  const parsed = { taskId: argv[0], ...configuration.defaults };
  const seen = new Set();
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    const equal = argument.indexOf("=");
    const flag = equal === -1 ? argument : argument.slice(0, equal);
    const field = configuration.flags[flag];
    if (!field) throw new CommandError(configuration.usage);
    const value = equal === -1 ? argv[++index] : argument.slice(equal + 1);
    if (value === undefined) throw new CommandError(configuration.usage);
    if (configuration.collections.has(field)) parsed[field].push(value);
    else {
      if (seen.has(field)) throw new CommandError(configuration.usage);
      seen.add(field);
      parsed[field] = value;
    }
  }
  for (const [field, label] of configuration.required) {
    if (!parsed[field]) throw new CommandError(`missing required argument: ${label}`);
  }
  return parsed;
}

function parseDecisionRecordArgs(argv) {
  return parseArgs(argv, {
    usage: DECISION_RECORD_USAGE,
    defaults: {
      authorityRef: "",
      decisionId: "",
      operationId: "",
      rejectedBehaviors: [],
      resolves: [],
      statement: "",
      supersedes: [],
    },
    flags: {
      "--id": "decisionId",
      "--authority-ref": "authorityRef",
      "--statement": "statement",
      "--supersedes": "supersedes",
      "--reject": "rejectedBehaviors",
      "--resolves": "resolves",
      "--operation-id": "operationId",
    },
    collections: new Set(["rejectedBehaviors", "resolves", "supersedes"]),
    required: [
      ["decisionId", "--id"],
      ["authorityRef", "--authority-ref"],
      ["statement", "--statement"],
    ],
  });
}

function parseDecisionConflictArgs(argv) {
  return parseArgs(argv, {
    usage: DECISION_CONFLICT_USAGE,
    defaults: {
      conflictId: "",
      decisionId: "",
      evidenceRef: "",
      operationId: "",
      reason: "",
    },
    flags: {
      "--id": "conflictId",
      "--decision": "decisionId",
      "--reason": "reason",
      "--evidence": "evidenceRef",
      "--operation-id": "operationId",
    },
    collections: new Set(),
    required: [
      ["conflictId", "--id"],
      ["decisionId", "--decision"],
      ["reason", "--reason"],
      ["evidenceRef", "--evidence"],
    ],
  });
}

function parseDecisionCheckArgs(argv) {
  return parseArgs(argv, {
    usage: DECISION_CHECK_USAGE,
    defaults: {},
    flags: {},
    collections: new Set(),
    required: [],
  });
}

function safeId(value, label) {
  const checked = oneLine(value, label, { allowEmpty: false });
  if (!SAFE_ID.test(checked)) throw new CommandError(`invalid ${label}: ${checked}`);
  return checked;
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())) {
    throw new CommandError(`${label} has invalid fields`);
  }
}

function validateStringArray(value, label) {
  if (!Array.isArray(value)) throw new CommandError(`${label} must be an array`);
  const checked = value.map((item) => oneLine(item, label, { allowEmpty: false }));
  if (unique(checked).length !== checked.length) {
    throw new CommandError(`${label} contains duplicates`);
  }
  return checked;
}

function validateDecisionData(data) {
  exactKeys(data, [
    "authority_ref", "decision_id", "rejected_behaviors", "resolves", "statement",
    "supersedes",
  ], "decision.recorded data");
  const decisionId = safeId(data.decision_id, "decision id");
  const authorityRef = oneLine(data.authority_ref, "decision authority ref", {
    allowEmpty: false,
  });
  if (!AUTHORITY_REF.test(authorityRef)) {
    throw new CommandError(
      "decision authority must be a controller-recordable user-message: or operator-input: ref",
    );
  }
  const statement = oneLine(data.statement, "decision statement", { allowEmpty: false });
  const supersedes = validateStringArray(data.supersedes, "supersedes decision id")
    .map((item) => safeId(item, "supersedes decision id"));
  const resolves = validateStringArray(data.resolves, "resolved conflict id")
    .map((item) => safeId(item, "resolved conflict id"));
  const rejectedBehaviors = validateStringArray(
    data.rejected_behaviors,
    "rejected behavior",
  );
  if (supersedes.includes(decisionId)) {
    throw new CommandError("a decision cannot supersede itself");
  }
  if (rejectedBehaviors.includes(statement)) {
    throw new CommandError("the active decision cannot also be a rejected behavior");
  }
  return {
    authorityRef,
    decisionId,
    rejectedBehaviors,
    resolves,
    statement,
    supersedes,
  };
}

function validateConflictData(data) {
  exactKeys(data, ["conflict_id", "decision_id", "evidence_ref", "reason"],
    "decision.conflict.recorded data");
  return {
    conflictId: safeId(data.conflict_id, "conflict id"),
    decisionId: safeId(data.decision_id, "conflict decision id"),
    evidenceRef: oneLine(data.evidence_ref, "conflict evidence", { allowEmpty: false }),
    reason: oneLine(data.reason, "conflict reason", { allowEmpty: false }),
  };
}

function decisionDigest(taskId, revision, active, rejectedBehaviors, openConflicts) {
  return sha256(canonicalJson({
    schema_version: 1,
    task_id: taskId,
    revision,
    active: active.map(({ decision_id, authority_ref, statement }) => ({
      decision_id,
      authority_ref,
      statement,
    })),
    rejected_behaviors: rejectedBehaviors,
    open_conflicts: openConflicts.map(({
      conflict_id, decision_id, evidence_ref, reason,
    }) => ({ conflict_id, decision_id, evidence_ref, reason })),
  }));
}

function deriveDecisionControl(events, taskId) {
  const decisions = new Map();
  const activeIds = new Set();
  const conflicts = new Map();
  const explicitRejected = [];
  let revision = 0;

  for (const event of events) {
    if (!DECISION_KINDS.has(event.kind)) continue;
    if (event.task_id !== taskId) throw new CommandError("decision event task mismatch");
    revision = event.revision;
    if (event.kind === "decision.recorded") {
      const data = validateDecisionData(event.data);
      if (decisions.has(data.decisionId)) {
        throw new CommandError(`duplicate decision id: ${data.decisionId}`);
      }
      for (const supersededId of data.supersedes) {
        if (!activeIds.has(supersededId)) {
          throw new CommandError(`cannot supersede inactive decision: ${supersededId}`);
        }
      }
      for (const rejected of data.rejectedBehaviors) {
        const activeMatch = [...activeIds].find((id) => (
          decisions.get(id).statement === rejected && !data.supersedes.includes(id)
        ));
        if (activeMatch) {
          throw new CommandError(
            `rejected behavior is still active; supersede decision: ${activeMatch}`,
          );
        }
      }
      const openForSuperseded = [...conflicts.values()].filter(
        (conflict) => !conflict.resolved_by && data.supersedes.includes(conflict.decision_id),
      );
      for (const conflictId of data.resolves) {
        const conflict = conflicts.get(conflictId);
        if (!conflict || conflict.resolved_by) {
          throw new CommandError(`cannot resolve unknown or closed conflict: ${conflictId}`);
        }
        if (!data.supersedes.includes(conflict.decision_id)) {
          throw new CommandError(
            `resolved conflict requires superseding its challenged decision: ${conflictId}`,
          );
        }
      }
      const omitted = openForSuperseded
        .filter((conflict) => !data.resolves.includes(conflict.conflict_id));
      if (omitted.length > 0) {
        throw new CommandError(
          `superseded decision has unresolved conflicts: ${omitted.map((item) => item.conflict_id).join(", ")}`,
        );
      }
      for (const supersededId of data.supersedes) activeIds.delete(supersededId);
      for (const conflictId of data.resolves) {
        conflicts.get(conflictId).resolved_by = data.decisionId;
      }
      const decision = {
        decision_id: data.decisionId,
        authority_ref: data.authorityRef,
        statement: data.statement,
        recorded_revision: event.revision,
      };
      decisions.set(data.decisionId, decision);
      activeIds.add(data.decisionId);
      explicitRejected.push(...data.rejectedBehaviors);
    } else {
      const data = validateConflictData(event.data);
      if (conflicts.has(data.conflictId)) {
        throw new CommandError(`duplicate conflict id: ${data.conflictId}`);
      }
      if (!activeIds.has(data.decisionId)) {
        throw new CommandError(`conflict targets inactive decision: ${data.decisionId}`);
      }
      conflicts.set(data.conflictId, {
        conflict_id: data.conflictId,
        decision_id: data.decisionId,
        evidence_ref: data.evidenceRef,
        reason: data.reason,
        recorded_revision: event.revision,
        resolved_by: "",
      });
    }
  }

  const active = [...activeIds]
    .map((id) => decisions.get(id))
    .sort((left, right) => left.recorded_revision - right.recorded_revision);
  const activeStatements = new Set(active.map((decision) => decision.statement));
  const rejectedBehaviors = unique([
    ...[...decisions.values()]
      .filter((decision) => !activeIds.has(decision.decision_id))
      .map((decision) => decision.statement),
    ...explicitRejected,
  ]).filter((statement) => !activeStatements.has(statement));
  const openConflicts = [...conflicts.values()]
    .filter((conflict) => !conflict.resolved_by)
    .sort((left, right) => left.recorded_revision - right.recorded_revision);
  const digest = revision === 0
    ? ""
    : decisionDigest(taskId, revision, active, rejectedBehaviors, openConflicts);
  return {
    schema_version: 1,
    task_id: taskId,
    has_records: revision > 0,
    revision,
    digest,
    status: openConflicts.length > 0 ? "human-decision-required" : "current",
    active,
    rejected_behaviors: rejectedBehaviors,
    open_conflicts: openConflicts,
  };
}

function escapeTable(value) {
  return String(value).replace(/\|/g, "\\|");
}

function renderDecisionControl(control) {
  const active = control.active.length > 0
    ? control.active.map((decision) => (
      `| \`${decision.decision_id}\` | ${escapeTable(decision.statement)} | ` +
        `\`${decision.authority_ref}\` |`
    ))
    : ["| - | No active decisions recorded. | - |"];
  const rejected = control.rejected_behaviors.length > 0
    ? control.rejected_behaviors.map((statement) => `- ${statement}`)
    : ["- None recorded."];
  const conflicts = control.open_conflicts.length > 0
    ? control.open_conflicts.map((conflict) => (
      `| \`${conflict.conflict_id}\` | \`${conflict.decision_id}\` | ` +
        `${escapeTable(conflict.reason)} | \`${escapeTable(conflict.evidence_ref)}\` |`
    ))
    : ["| - | - | None. | - |"];
  return [
    "# Current Decisions",
    "",
    `- Task: \`${control.task_id}\``,
    `- Decision revision: ${control.revision}`,
    `- Decision digest: \`${control.digest || "-"}\``,
    `- Gate: ${control.status}`,
    "",
    "## Active decisions",
    "",
    "| ID | Current decision | Authority |",
    "| --- | --- | --- |",
    ...active,
    "",
    "## Rejected behavior — must not execute",
    "",
    ...rejected,
    "",
    "## Unresolved reviewer or evidence conflicts",
    "",
    "| Conflict | Decision | Reason | Evidence |",
    "| --- | --- | --- | --- |",
    ...conflicts,
    "",
  ].join("\n");
}

function decisionFile(paths, taskId) {
  return path.join(taskArtifactDir(paths, taskId), "decisions.md");
}

function assertDecisionReadyFromEvents(events, taskId, options = {}) {
  const control = deriveDecisionControl(events, taskId);
  if (Object.hasOwn(options, "expectedDigest")) {
    if (options.expectedDigest && !/^sha256:[a-f0-9]{64}$/.test(options.expectedDigest)) {
      throw new CommandError(`invalid expected decision digest: ${options.expectedDigest}`);
    }
    if (control.digest !== options.expectedDigest) {
      throw new CommandError(
        `stale decision snapshot: expected ${options.expectedDigest}, current ${control.digest || "none"}`,
      );
    }
  }
  if (control.open_conflicts.length > 0) {
    throw new CommandError(
      "HUMAN_DECISION_REQUIRED: unresolved decision conflict(s): " +
        control.open_conflicts.map((conflict) => conflict.conflict_id).join(", "),
    );
  }
  return control;
}

function assertDecisionProjection(paths, taskId, events, control) {
  const projection = materializeTaskProjection(events);
  if (!projection) throw new CommandError(`unknown task: ${taskId}`);
  if (!control.has_records) return control;
  const rendered = renderDecisionControl(control);
  const entry = (projection.files || []).find((item) => item.path === "decisions.md");
  if (!entry || entry.deleted === true
    || Buffer.from(entry.content_base64 || "", "base64").toString("utf8") !== rendered) {
    throw new CommandError("decision artifact projection is stale or invalid");
  }
  if (!projectionMatches(paths, taskId, projection)) {
    throw new CommandError("materialized decision artifact is stale or invalid");
  }
  return control;
}

function readDecisionControl(paths, taskId, options = {}) {
  const events = readAuthoritativeEvents(taskEventFile(paths, taskId), taskId);
  const control = assertDecisionReadyFromEvents(events, taskId, options);
  return assertDecisionProjection(paths, taskId, events, control);
}

function plainFileSha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function assertPromptBundleDecisionSnapshot(paths, taskId, control) {
  if (!control.has_records) return control;
  const bundleFile = path.join(taskArtifactDir(paths, taskId), "prompt-bundle.json");
  let bundle;
  try {
    bundle = JSON.parse(fs.readFileSync(bundleFile, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new CommandError(
        "current decisions require a prompt bundle; run prompt-bundle before Team start",
      );
    }
    throw new CommandError(`invalid prompt bundle: ${error.message}`);
  }
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)
    || bundle.task_id !== taskId || !Array.isArray(bundle.files)) {
    throw new CommandError(`invalid prompt bundle for task: ${taskId}`);
  }
  const expectedSnapshot = {
    schema_version: 1,
    revision: control.revision,
    digest: control.digest,
  };
  if (canonicalJson(bundle.decision_snapshot) !== canonicalJson(expectedSnapshot)) {
    throw new CommandError(
      "stale prompt bundle decision snapshot; regenerate prompt-bundle from current decisions",
    );
  }
  const currentFile = decisionFile(paths, taskId);
  const included = bundle.files.find((entry) => entry?.path === currentFile);
  if (!included || included.sha256 !== plainFileSha256(currentFile)) {
    throw new CommandError(
      "prompt bundle does not include the current decisions artifact",
    );
  }
  return control;
}

function assertExecutionGrantDecisionFresh(state, control) {
  if (!control.has_records) return control;
  const grant = (state.execution_authority?.grants || [])
    .find((candidate) => candidate.status === "active");
  if (grant && Number(grant.issued_revision || 0) < control.revision) {
    throw new CommandError(
      `stale execution grant: decision revision ${control.revision} is newer than grant ` +
        `${grant.grant_id} at revision ${grant.issued_revision}; explicit replan is required`,
    );
  }
  return control;
}

function assertVerificationDecisionFresh(events, state, control) {
  if (!control.has_records) return control;
  const recordId = state.verification?.record_id || "";
  const identityDigest = state.verification?.identity_digest || "";
  const source = events.findLast((event) => (
    event.kind === "verification.recorded"
      && event.data?.record_id === recordId
      && event.data?.identity_digest === identityDigest
  ));
  if (!source || Number(source.data?.observed_revision || 0) < control.revision) {
    throw new CommandError(
      `stale verification: the latest accepted verification predates decision revision ` +
        `${control.revision}; rerun verification against current decisions`,
    );
  }
  return control;
}

function assertTeamDecisionFresh(events, taskId, team, state = {}) {
  const control = assertDecisionReadyFromEvents(events, taskId);
  if (!control.has_records) return control;
  const anchor = events.filter((event) => (
    (event.kind === "team.started" || event.kind === "team.promoted")
      && event.projection?.state?.active_team?.team_run_id === team.team_run_id
  )).at(-1);
  if (!anchor || anchor.revision < control.revision) {
    throw new CommandError(
      `stale Team decision snapshot: current decision revision is ${control.revision}; ` +
        "stop the current Team generation, rebuild the prompt bundle, and start a new generation",
    );
  }
  if (team.mode === "execute") assertExecutionGrantDecisionFresh(state, control);
  return control;
}

function decisionProjection(currentProjection, control) {
  return {
    task_content: currentProjection.task_content,
    state: currentProjection.state,
    files: [{
      path: "decisions.md",
      content_base64: Buffer.from(renderDecisionControl(control)).toString("base64"),
    }],
  };
}

function recordDecision(parsed, options = {}) {
  const { clock, paths } = commandOptions(options);
  prepareTaskCommand(paths, parsed.taskId, clock);
  const data = validateDecisionData({
    decision_id: parsed.decisionId,
    authority_ref: parsed.authorityRef,
    statement: parsed.statement,
    supersedes: unique(parsed.supersedes),
    rejected_behaviors: unique(parsed.rejectedBehaviors),
    resolves: unique(parsed.resolves),
  });
  const eventData = {
    decision_id: data.decisionId,
    authority_ref: data.authorityRef,
    statement: data.statement,
    supersedes: data.supersedes,
    rejected_behaviors: data.rejectedBehaviors,
    resolves: data.resolves,
  };
  const committed = mutateTaskRuntime(
    paths,
    parsed.taskId,
    { kind: "decision.recorded", operationId: parsed.operationId, data: eventData },
    ({ currentProjection, events, revision }) => {
      if (currentProjection.state.status !== "doing") {
        throw new CommandError("decision-record requires a doing task");
      }
      const control = deriveDecisionControl([
        ...events,
        { kind: "decision.recorded", task_id: parsed.taskId, revision: revision + 1, data: eventData },
      ], parsed.taskId);
      return {
        projection: decisionProjection(currentProjection, control),
        result: {
          decision_id: data.decisionId,
          revision: control.revision,
          digest: control.digest,
          status: control.status,
        },
        legacy: [{ kind: "decision-record", detail: data.decisionId }],
      };
    },
    { ...options, clock },
  );
  const control = readDecisionControl(paths, parsed.taskId, {
    expectedDigest: committed.result.digest,
  });
  return [
    `task_id: ${parsed.taskId}`,
    `decision_id: ${committed.result.decision_id}`,
    `decision_revision: ${control.revision}`,
    `decision_digest: ${control.digest}`,
    `status: ${control.status}`,
    `artifact: ${decisionFile(paths, parsed.taskId)}`,
    ...(committed.replay ? ["replayed: true"] : []),
  ];
}

function recordDecisionConflict(parsed, options = {}) {
  const { clock, paths } = commandOptions(options);
  prepareTaskCommand(paths, parsed.taskId, clock);
  const data = validateConflictData({
    conflict_id: parsed.conflictId,
    decision_id: parsed.decisionId,
    reason: parsed.reason,
    evidence_ref: parsed.evidenceRef,
  });
  const eventData = {
    conflict_id: data.conflictId,
    decision_id: data.decisionId,
    reason: data.reason,
    evidence_ref: data.evidenceRef,
  };
  const committed = mutateTaskRuntime(
    paths,
    parsed.taskId,
    { kind: "decision.conflict.recorded", operationId: parsed.operationId, data: eventData },
    ({ currentProjection, events, revision }) => {
      if (currentProjection.state.status !== "doing") {
        throw new CommandError("decision-conflict requires a doing task");
      }
      const control = deriveDecisionControl([
        ...events,
        {
          kind: "decision.conflict.recorded",
          task_id: parsed.taskId,
          revision: revision + 1,
          data: eventData,
        },
      ], parsed.taskId);
      return {
        projection: decisionProjection(currentProjection, control),
        result: {
          conflict_id: data.conflictId,
          revision: control.revision,
          digest: control.digest,
          status: control.status,
        },
        legacy: [{ kind: "decision-conflict", detail: data.conflictId }],
      };
    },
    { ...options, clock },
  );
  const events = readAuthoritativeEvents(taskEventFile(paths, parsed.taskId), parsed.taskId);
  const control = deriveDecisionControl(events, parsed.taskId);
  assertDecisionProjection(paths, parsed.taskId, events, control);
  return [
    `task_id: ${parsed.taskId}`,
    `conflict_id: ${committed.result.conflict_id}`,
    `decision_revision: ${control.revision}`,
    `decision_digest: ${control.digest}`,
    `status: ${control.status}`,
    `artifact: ${decisionFile(paths, parsed.taskId)}`,
    ...(committed.replay ? ["replayed: true"] : []),
  ];
}

function checkDecisions(parsed, options = {}) {
  const { clock, paths } = commandOptions(options);
  prepareTaskCommand(paths, parsed.taskId, clock);
  const control = readDecisionControl(paths, parsed.taskId);
  return [
    `task_id: ${parsed.taskId}`,
    `decision_revision: ${control.revision}`,
    `decision_digest: ${control.digest || "none"}`,
    `status: ${control.status}`,
    `active_decisions: ${control.active.length}`,
    `rejected_behaviors: ${control.rejected_behaviors.length}`,
    `open_conflicts: ${control.open_conflicts.length}`,
  ];
}

module.exports = {
  DECISION_CHECK_USAGE,
  DECISION_CONFLICT_USAGE,
  DECISION_RECORD_USAGE,
  assertDecisionReadyFromEvents,
  assertExecutionGrantDecisionFresh,
  assertPromptBundleDecisionSnapshot,
  assertTeamDecisionFresh,
  assertVerificationDecisionFresh,
  checkDecisions,
  decisionFile,
  parseDecisionCheckArgs,
  parseDecisionConflictArgs,
  parseDecisionRecordArgs,
  readDecisionControl,
  recordDecision,
  recordDecisionConflict,
};
