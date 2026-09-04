"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { atomicWriteFile, atomicWriteJson } = require("./atomic-file");
const {
  appendAuthoritativeEvent,
  authoritativeEventDigest,
  eventPayloadDigest,
  eventTimestamp,
  readAuthoritativeEvents,
} = require("./event-store");
const { sleepMilliseconds, taskMutationLockFile, withLock } = require("./lock");
const { taskArtifactDir } = require("./paths");

class TaskMutationError extends Error {
  constructor(message) {
    super(message);
    this.name = "TaskMutationError";
  }
}

function taskEventFile(paths, taskId) {
  return path.join(taskArtifactDir(paths, taskId), "events-v2.jsonl");
}

function taskProjectionFiles(paths, taskId) {
  return {
    task: path.join(paths.tasksDir, `${taskId}.md`),
    state: path.join(taskArtifactDir(paths, taskId), "state.json"),
    runtime: path.join(taskArtifactDir(paths, taskId), "runtime.jsonl"),
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function eventLocalDay(timestamp) {
  const date = new Date(timestamp);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((value, index) => String(value).padStart(index === 0 ? 4 : 2, "0"))
    .join("-");
}

function materializedProjectionFiles(events) {
  const files = new Map();
  for (const event of events) {
    const projection = event?.projection || {};
    if (projection.files_semantics === "snapshot") files.clear();
    for (const entry of projection.files || []) {
      files.set(entry.path, clone(entry));
    }
  }
  return [...files.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function materializeTaskProjection(events) {
  const latest = events.at(-1);
  if (!latest) return null;
  return {
    ...clone(latest.projection),
    files: materializedProjectionFiles(events),
    files_semantics: "snapshot",
  };
}

function finalizedProjection(projection, event, paths, events = []) {
  if (!projection || typeof projection !== "object" || Array.isArray(projection)) {
    throw new TaskMutationError("task mutation must return a projection object");
  }
  if (typeof projection.task_content !== "string") {
    throw new TaskMutationError("task mutation projection requires task_content");
  }
  if (!projection.state || typeof projection.state !== "object" || Array.isArray(projection.state)) {
    throw new TaskMutationError("task mutation projection requires state");
  }
  const output = clone({ files: [], ...projection });
  if (!Array.isArray(output.files)) {
    throw new TaskMutationError("task mutation projection files must be an array");
  }
  const seen = new Set();
  for (const entry of output.files) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new TaskMutationError("task mutation projection file must be an object");
    }
    resolveProjectionFile(paths, event.task_id, entry.path);
    if (seen.has(entry.path)) {
      throw new TaskMutationError(`duplicate projection file path: ${entry.path}`);
    }
    seen.add(entry.path);
    if (entry.deleted !== true && typeof entry.content_base64 !== "string") {
      throw new TaskMutationError(`projection file requires content_base64: ${entry.path}`);
    }
  }
  const files = new Map(
    (projection.files_semantics === "snapshot" ? [] : materializedProjectionFiles(events))
      .map((entry) => [entry.path, entry]),
  );
  for (const entry of output.files) files.set(entry.path, entry);
  output.files = [...files.values()].sort((left, right) => left.path.localeCompare(right.path));
  output.files_semantics = "snapshot";
  Object.assign(output.state, {
    runtime_revision: event.revision,
    last_event_id: event.event_id,
    consistency: "current",
  });
  return output;
}

function resolveProjectionFile(paths, taskId, relative) {
  if (typeof relative !== "string" || !relative || relative.includes("\\") || path.isAbsolute(relative)) {
    throw new TaskMutationError(`invalid projection file path: ${relative}`);
  }
  const root = path.resolve(taskArtifactDir(paths, taskId));
  const target = path.resolve(root, relative);
  const rel = path.relative(root, target);
  if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new TaskMutationError(`projection file escapes task artifact directory: ${relative}`);
  }
  return target;
}

function applyTaskProjection(paths, taskId, projection) {
  const files = taskProjectionFiles(paths, taskId);
  atomicWriteFile(files.task, projection.task_content, { encoding: "utf8" });
  atomicWriteJson(files.state, projection.state);
  for (const entry of projection.files || []) {
    const target = resolveProjectionFile(paths, taskId, entry.path);
    if (entry.deleted === true) {
      fs.rmSync(target, { force: true });
      continue;
    }
    if (typeof entry.content_base64 !== "string") {
      throw new TaskMutationError(`projection file requires content_base64: ${entry.path}`);
    }
    atomicWriteFile(target, Buffer.from(entry.content_base64, "base64"));
    if (entry.mode) fs.chmodSync(target, entry.mode);
  }
}

function derivedLegacyRows(event) {
  const values = Array.isArray(event.legacy) ? event.legacy : event.legacy ? [event.legacy] : [];
  return values.map((legacy, index) => {
    const common = {
      operation_id: event.operation_id,
      authoritative_event_id: event.event_id,
      revision: event.revision,
      derived_from_schema: 2,
      derived_from_event_id: event.event_id,
      derived_row_index: index,
    };
    if (legacy.schema_version === 1) {
      return {
        schema_version: 1,
        event_id: legacy.event_id || `legacy-${event.event_id}`,
        task_id: event.task_id,
        kind: legacy.kind,
        occurred_at: event.occurred_at,
        data: legacy.data || {},
        ...common,
      };
    }
    return {
      kind: legacy.kind,
      detail: legacy.detail || "",
      created_at: event.occurred_at.replace(/\.\d{3}Z$/, "Z"),
      ...common,
    };
  });
}

function appendMissingLegacyRows(paths, taskId, event) {
  const { runtime } = taskProjectionFiles(paths, taskId);
  let existing = "";
  try {
    existing = fs.readFileSync(runtime, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const derivedRows = new Set(existing.split("\n").flatMap((line) => {
    if (!line.trim()) return [];
    try {
      const row = JSON.parse(line);
      return typeof row.derived_from_event_id === "string"
        ? [`${row.derived_from_event_id}:${Number(row.derived_row_index || 0)}`]
        : [];
    } catch (_error) {
      return [];
    }
  }));
  const rows = derivedLegacyRows(event).filter(
    (row) => !derivedRows.has(`${row.derived_from_event_id}:${row.derived_row_index}`),
  );
  if (rows.length === 0) return false;
  fs.mkdirSync(path.dirname(runtime), { recursive: true });
  const descriptor = fs.openSync(runtime, "a");
  try {
    for (const row of rows) fs.writeSync(descriptor, `${JSON.stringify(row)}\n`, null, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  return true;
}

function projectionMatches(paths, taskId, projection) {
  const files = taskProjectionFiles(paths, taskId);
  try {
    if (fs.readFileSync(files.task, "utf8") !== projection.task_content) return false;
    const state = JSON.parse(fs.readFileSync(files.state, "utf8"));
    if (JSON.stringify(state) !== JSON.stringify(projection.state)) return false;
    for (const entry of projection.files || []) {
      const target = resolveProjectionFile(paths, taskId, entry.path);
      if (entry.deleted === true) {
        if (fs.existsSync(target)) return false;
      } else if (!fs.readFileSync(target).equals(Buffer.from(entry.content_base64, "base64"))) {
        return false;
      }
    }
    return true;
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return false;
    throw error;
  }
}

function pauseBeforeMutation(options) {
  const environment = options.environment || process.env;
  if (environment.CODEX_WORKFLOW_TEST_MUTATION_PAUSE_AFTER_OBSERVE) {
    const milliseconds = Number(environment.CODEX_WORKFLOW_TEST_MUTATION_PAUSE_AFTER_OBSERVE) * 1000;
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
      throw new TaskMutationError("invalid mutation test pause");
    }
    sleepMilliseconds(milliseconds);
  }
}

function mutateTaskRuntime(paths, taskId, input, transition, options = {}) {
  const file = taskEventFile(paths, taskId);
  const operationId = input.operationId || options.operationId || crypto.randomUUID();
  const data = clone(input.data || {});
  pauseBeforeMutation(options);
  return withLock(taskMutationLockFile(paths, taskId), () => {
    const events = readAuthoritativeEvents(file, taskId);
    const latest = events.at(-1);
    const currentProjection = materializeTaskProjection(events);
    const currentRevision = latest?.revision || 0;
    const expectedRevision = options.expectedRevision === undefined
      ? currentRevision
      : options.expectedRevision;
    const existing = events.find((event) => event.operation_id === operationId);
    if (existing) {
      const digest = eventPayloadDigest({
        taskId,
        kind: input.kind,
        data,
        expectedRevision: existing.expected_revision,
      });
      if (existing.kind !== input.kind || existing.payload_digest !== digest) {
        throw new TaskMutationError(`operation_id replay payload conflict: ${operationId}`);
      }
      if (options.replayPostcondition) {
        options.replayPostcondition({
          currentProjection: currentProjection ? clone(currentProjection) : null,
          events,
          existing: clone(existing),
          latest: clone(latest),
        });
      }
      if (latest && !projectionMatches(paths, taskId, currentProjection)) {
        applyTaskProjection(paths, taskId, currentProjection);
      }
      if (latest) appendMissingLegacyRows(paths, taskId, latest);
      appendMissingLegacyRows(paths, taskId, existing);
      if (options.afterEventAppend && existing.event_id === latest.event_id) {
        options.afterEventAppend(existing, { replay: true });
      }
      return {
        event: existing,
        latest: existing.event_id === latest.event_id,
        replay: true,
        result: clone(existing.result || {}),
      };
    }
    if (latest && !projectionMatches(paths, taskId, currentProjection)) {
      applyTaskProjection(paths, taskId, currentProjection);
    }
    if (latest) appendMissingLegacyRows(paths, taskId, latest);
    if (expectedRevision !== currentRevision) {
      throw new TaskMutationError(
        `stale task revision: expected ${expectedRevision}, current ${currentRevision}`,
      );
    }
    const occurredAt = eventTimestamp(options.clock || (() => new Date()));
    const output = transition({
      currentProjection: currentProjection ? clone(currentProjection) : null,
      events,
      occurredAt,
      revision: currentRevision,
    });
    const event = {
      schema_version: 2,
      event_id: options.eventId ? options.eventId() : crypto.randomUUID(),
      task_id: taskId,
      revision: currentRevision + 1,
      expected_revision: currentRevision,
      operation_id: operationId,
      payload_digest: eventPayloadDigest({
        taskId,
        kind: input.kind,
        data,
        expectedRevision: currentRevision,
      }),
      last_event_id: events.at(-1)?.event_id || "",
      kind: input.kind,
      occurred_at: occurredAt,
      local_day: eventLocalDay(occurredAt),
      local_utc_offset_minutes: -new Date(occurredAt).getTimezoneOffset() || 0,
      consistency: {
        authority: "event",
        projection: "replayable",
        legacy_row: "derived",
      },
      data,
      projection: null,
      result: clone(output.result || {}),
      legacy: clone(output.legacy || []),
    };
    if (output.authorityTransition !== undefined) {
      event.authority_transition = clone(output.authorityTransition);
    }
    event.projection = finalizedProjection(output.projection, event, paths, events);
    event.event_digest = authoritativeEventDigest(event);
    if (options.beforeEventAppend) {
      options.beforeEventAppend(event);
    }
    if (event.event_digest !== authoritativeEventDigest(event)) {
      throw new TaskMutationError("authoritative event changed after its record digest was computed");
    }
    require("../artifact/decisions")
      .validateDecisionEventProjection([...events, event], paths);
    require("../team/execution-grant").validateAuthorityEventProjection([...events, event]);
    require("../verification/claim-event-validation")
      .validateVerificationClaimEventProjection([...events, event]);
    require("../team/evidence-event-validation")
      .validateEvidenceEventProjection([...events, event]);
    require("../team/observer-claim-event-validation")
      .validateObserverClaimEventProjection([...events, event]);
    require("../task/lifecycle-event-validation")
      .validateTaskLifecycleEventProjection([...events, event]);
    if (options.failBeforeEventAppend) {
      throw new TaskMutationError("injected failure before authoritative event append");
    }
    appendAuthoritativeEvent(file, event);
    if (options.afterEventAppend) {
      try {
        options.afterEventAppend(event, { replay: false });
      } catch (error) {
        throw new TaskMutationError(
          `authoritative event committed but projection is inconsistent: ${error.message}`,
        );
      }
    }
    if (options.failAfterEventAppend) {
      throw new TaskMutationError(
        "authoritative event committed but projection is inconsistent: injected failure",
      );
    }
    try {
      applyTaskProjection(paths, taskId, event.projection);
    } catch (error) {
      throw new TaskMutationError(
        `authoritative event committed but projection is inconsistent: ${error.message}`,
      );
    }
    appendMissingLegacyRows(paths, taskId, event);
    return { event, latest: true, replay: false, result: clone(event.result) };
  });
}

function recordTaskRuntimeEvent(paths, taskId, input, legacy, options = {}) {
  return mutateTaskRuntime(
    paths,
    taskId,
    input,
    ({ currentProjection }) => {
      const files = taskProjectionFiles(paths, taskId);
      let taskContent;
      let state;
      if (currentProjection) {
        taskContent = currentProjection.task_content;
        state = clone(currentProjection.state);
      } else {
        try {
          taskContent = fs.readFileSync(files.task, "utf8");
          state = JSON.parse(fs.readFileSync(files.state, "utf8"));
        } catch (error) {
          if (error.code === "ENOENT") {
            throw new TaskMutationError(`missing task projection for runtime event: ${taskId}`);
          }
          if (error instanceof SyntaxError) {
            throw new TaskMutationError(`corrupt task state for runtime event: ${taskId}`);
          }
          throw error;
        }
      }
      if (options.projectionTransform) {
        ({ taskContent, state } = options.projectionTransform({ taskContent, state }));
      }
      return {
        projection: { task_content: taskContent, state },
        result: input.result || {},
        legacy: Array.isArray(legacy) ? legacy : [legacy],
      };
    },
    options,
  );
}

module.exports = {
  TaskMutationError,
  appendMissingLegacyRows,
  applyTaskProjection,
  derivedLegacyRows,
  materializeTaskProjection,
  materializedProjectionFiles,
  mutateTaskRuntime,
  projectionMatches,
  recordTaskRuntimeEvent,
  resolveProjectionFile,
  taskEventFile,
  taskProjectionFiles,
};
