"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { atomicWriteJson } = require("./atomic-file");
const { readAuthoritativeEvents } = require("./event-store");
const { taskMutationLockFile, withLock } = require("./lock");
const { taskArtifactDir } = require("./paths");
const {
  appendMissingLegacyRows,
  applyTaskProjection,
  derivedLegacyRows,
  projectionMatches,
  resolveProjectionFile,
  taskEventFile,
  taskProjectionFiles,
} = require("./task-mutation");

function validateAuthority(authorityRef) {
  if (typeof authorityRef !== "string" || !authorityRef.trim() || /[\r\n\t]/.test(authorityRef)) {
    throw new Error("reconcile --apply requires authority_ref");
  }
}

function missingLegacyProjection(paths, taskId, events) {
  const { runtime } = taskProjectionFiles(paths, taskId);
  let rows = [];
  try {
    rows = fs.readFileSync(runtime, "utf8").split("\n").flatMap((line) => {
      if (!line.trim()) return [];
      try {
        return [JSON.parse(line)];
      } catch (_error) {
        return [];
      }
    });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const actual = new Set(rows.flatMap((row) => (
    typeof row.derived_from_event_id === "string"
      ? [`${row.derived_from_event_id}:${Number(row.derived_row_index || 0)}`]
      : []
  )));
  return events.some((event) => derivedLegacyRows(event).some(
    (row) => !actual.has(`${row.derived_from_event_id}:${row.derived_row_index}`),
  ));
}

function reconciliationStatus(paths, taskId, latest, events = latest ? [latest] : []) {
  if (!latest) return "no-events";
  const files = taskProjectionFiles(paths, taskId);
  let state;
  try {
    state = JSON.parse(fs.readFileSync(files.state, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return "missing";
    throw error;
  }
  const revision = Number(state.runtime_revision || 0);
  if (revision < latest.revision) return "behind";
  if (revision > latest.revision) return "ahead";
  if (state.last_event_id !== latest.event_id) return "diverged";
  if (!projectionMatches(paths, taskId, latest.projection)) return "diverged";
  return missingLegacyProjection(paths, taskId, events) ? "behind" : "current";
}

function backupProjection(paths, taskId, authorityRef, clock, latest) {
  const date = clock();
  const value = date instanceof Date ? date : new Date(date);
  const token = value.toISOString().replace(/[-:.]/g, "");
  const directory = path.join(taskArtifactDir(paths, taskId), "reconcile-backups");
  fs.mkdirSync(directory, { recursive: true });
  const files = taskProjectionFiles(paths, taskId);
  const manifest = {
    authority_ref: authorityRef,
    created_at: value.toISOString(),
    event_id: latest.event_id,
    revision: latest.revision,
    files: {},
    projection_files: {},
  };
  for (const [name, file] of Object.entries({ task: files.task, state: files.state, runtime: files.runtime })) {
    try {
      manifest.files[name] = fs.readFileSync(file).toString("base64");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      manifest.files[name] = null;
    }
  }
  for (const entry of latest.projection.files || []) {
    const file = resolveProjectionFile(paths, taskId, entry.path);
    try {
      manifest.projection_files[entry.path] = fs.readFileSync(file).toString("base64");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      manifest.projection_files[entry.path] = null;
    }
  }
  const target = path.join(directory, `${token}-${crypto.randomUUID()}.json`);
  atomicWriteJson(target, manifest);
  return target;
}

function reconcileTaskRuntime(taskId, options = {}) {
  const environment = options.environment || process.env;
  const paths = options.paths || require("./paths").resolvePaths(environment);
  const apply = options.apply === true;
  if (apply) validateAuthority(options.authorityRef || "");
  const run = () => {
    const events = readAuthoritativeEvents(taskEventFile(paths, taskId), taskId);
    const latest = events.at(-1);
    const before = reconciliationStatus(paths, taskId, latest, events);
    if (!apply || !latest) {
      return { applied: false, status: before, revision: latest?.revision || 0 };
    }
    const backup = backupProjection(
      paths,
      taskId,
      options.authorityRef,
      options.clock || (() => new Date()),
      latest,
    );
    applyTaskProjection(paths, taskId, latest.projection);
    for (const event of events) appendMissingLegacyRows(paths, taskId, event);
    return {
      applied: true,
      authority_ref: options.authorityRef,
      backup,
      previous_status: before,
      status: reconciliationStatus(paths, taskId, latest, events),
      revision: latest.revision,
    };
  };
  return apply ? withLock(taskMutationLockFile(paths, taskId), run) : run();
}

module.exports = {
  reconcileTaskRuntime,
  reconciliationStatus,
};
