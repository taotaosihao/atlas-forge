"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { atomicWriteJson } = require("./atomic-file");
const { canonicalJson, readAuthoritativeEvents, sha256 } = require("./event-store");
const { taskMutationLockFile, withLock } = require("./lock");
const { taskArtifactDir } = require("./paths");
const {
  appendMissingLegacyRows,
  applyTaskProjection,
  derivedLegacyRows,
  materializeTaskProjection,
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

function validateReason(reason) {
  if (typeof reason !== "string" || !reason.trim() || /[\r\n\t]/.test(reason)) {
    throw new Error("reconcile --apply requires reason");
  }
}

function reconciliationAuditFile(paths, taskId) {
  return path.join(taskArtifactDir(paths, taskId), "reconciliation-audit.jsonl");
}

function readReconciliationAudit(paths, taskId) {
  const file = reconciliationAuditFile(paths, taskId);
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const rows = [];
  for (const [index, line] of text.split("\n").entries()) {
    if (!line) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch (error) {
      throw new Error(`corrupt reconciliation audit at line ${index + 1}: ${error.message}`);
    }
    const previous = rows.at(-1);
    const expectedPrevious = previous?.audit_digest || "";
    if (row.schema_version !== 1
      || !new Set([
        "reconciliation.prepared", "reconciliation.applied", "reconciliation.failed",
      ]).has(row.event_name)
      || row.task_id !== taskId || row.last_audit_digest !== expectedPrevious) {
      throw new Error(`corrupt reconciliation audit chain at line ${index + 1}`);
    }
    const unsigned = { ...row };
    delete unsigned.audit_digest;
    if (row.audit_digest !== sha256(canonicalJson(unsigned))) {
      throw new Error(`corrupt reconciliation audit digest at line ${index + 1}`);
    }
    rows.push(row);
  }
  return rows;
}

function fsyncDirectory(directory) {
  const descriptor = fs.openSync(directory, "r");
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function appendReconciliationAudit(
  paths,
  taskId,
  eventName,
  data,
  eventId = () => crypto.randomUUID(),
) {
  const previous = readReconciliationAudit(paths, taskId).at(-1);
  const row = {
    schema_version: 1,
    audit_id: eventId(),
    event_name: eventName,
    task_id: taskId,
    ...data,
    last_audit_digest: previous?.audit_digest || "",
  };
  row.audit_digest = sha256(canonicalJson(row));
  const file = reconciliationAuditFile(paths, taskId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const existed = fs.existsSync(file);
  const descriptor = fs.openSync(file, "a");
  try {
    fs.writeSync(descriptor, `${JSON.stringify(row)}\n`, null, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  if (!existed) fsyncDirectory(path.dirname(file));
  return row;
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
  if (!projectionMatches(paths, taskId, materializeTaskProjection(events))) return "diverged";
  return missingLegacyProjection(paths, taskId, events) ? "behind" : "current";
}

function backupProjection(paths, taskId, authorityRef, clock, latest, projection) {
  const date = clock();
  const value = date instanceof Date ? date : new Date(date);
  const token = value.toISOString().replace(/[-:.]/g, "");
  const directory = path.join(taskArtifactDir(paths, taskId), "reconcile-backups");
  const directoryExisted = fs.existsSync(directory);
  fs.mkdirSync(directory, { recursive: true });
  if (!directoryExisted) fsyncDirectory(path.dirname(directory));
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
  for (const entry of projection.files || []) {
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
  const descriptor = fs.openSync(target, "r");
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fsyncDirectory(directory);
  return target;
}

function reconcileTaskRuntime(taskId, options = {}) {
  const environment = options.environment || process.env;
  const paths = options.paths || require("./paths").resolvePaths(environment);
  const apply = options.apply === true;
  if (apply) {
    validateAuthority(options.authorityRef || "");
    validateReason(options.reason || "");
  }
  const run = () => {
    const events = readAuthoritativeEvents(taskEventFile(paths, taskId), taskId);
    const latest = events.at(-1);
    const projection = materializeTaskProjection(events);
    const before = reconciliationStatus(paths, taskId, latest, events);
    const appendAudit = options.appendAudit || appendReconciliationAudit;
    const auditRows = readReconciliationAudit(paths, taskId);
    const incomplete = auditRows.at(-1)?.event_name === "reconciliation.prepared"
      ? auditRows.at(-1)
      : null;
    if (!apply || !latest) {
      return {
        applied: false,
        audit_incomplete: Boolean(incomplete),
        incomplete_operation_id: incomplete?.operation_id || "",
        status: before,
        revision: latest?.revision || 0,
      };
    }
    const clock = options.clock || (() => new Date());
    const occurredAt = () => {
      const occurred = clock();
      return (occurred instanceof Date ? occurred : new Date(occurred)).toISOString();
    };
    if (incomplete) {
      if (before === "current"
        && incomplete.restored_event_id === latest.event_id
        && incomplete.restored_revision === latest.revision) {
        const audit = appendAudit(paths, taskId, "reconciliation.applied", {
          operation_id: incomplete.operation_id,
          authority_ref: incomplete.authority_ref,
          reason: incomplete.reason,
          prepared_audit_digest: incomplete.audit_digest,
          previous_projection_digest: incomplete.previous_projection_digest,
          restored_event_id: latest.event_id,
          restored_revision: latest.revision,
          restored_projection_digest: sha256(canonicalJson(projection)),
          backup_manifest_digest: incomplete.backup_manifest_digest,
          occurred_at: occurredAt(),
          recovered_incomplete: true,
        }, options.auditId);
        return {
          applied: true,
          recovered_incomplete: true,
          audit,
          authority_ref: incomplete.authority_ref,
          backup: incomplete.backup,
          previous_status: before,
          status: before,
          revision: latest.revision,
        };
      }
      appendAudit(paths, taskId, "reconciliation.failed", {
        operation_id: incomplete.operation_id,
        authority_ref: incomplete.authority_ref,
        reason: incomplete.reason,
        prepared_audit_digest: incomplete.audit_digest,
        failure: "previous prepared reconciliation was not applied before retry",
        occurred_at: occurredAt(),
      }, options.auditId);
    }
    const backup = backupProjection(
      paths,
      taskId,
      options.authorityRef,
      clock,
      latest,
      projection,
    );
    const backupManifest = fs.readFileSync(backup);
    const previousProjectionDigest = sha256(canonicalJson({
      files: JSON.parse(backupManifest).files,
      projection_files: JSON.parse(backupManifest).projection_files,
    }));
    const operationId = options.operationId || crypto.randomUUID();
    const prepared = appendAudit(paths, taskId, "reconciliation.prepared", {
      operation_id: operationId,
      authority_ref: options.authorityRef,
      reason: options.reason,
      previous_projection_digest: previousProjectionDigest,
      restored_event_id: latest.event_id,
      restored_revision: latest.revision,
      backup_manifest_digest: sha256(backupManifest),
      backup,
      occurred_at: occurredAt(),
    }, options.auditId);
    try {
      const applyProjection = options.applyProjection || applyTaskProjection;
      applyProjection(paths, taskId, projection);
      for (const event of events) appendMissingLegacyRows(paths, taskId, event);
    } catch (error) {
      appendAudit(paths, taskId, "reconciliation.failed", {
        operation_id: operationId,
        authority_ref: options.authorityRef,
        reason: options.reason,
        prepared_audit_digest: prepared.audit_digest,
        failure: error.message,
        occurred_at: occurredAt(),
      }, options.auditId);
      throw error;
    }
    const audit = appendAudit(paths, taskId, "reconciliation.applied", {
      operation_id: operationId,
      authority_ref: options.authorityRef,
      reason: options.reason,
      prepared_audit_digest: prepared.audit_digest,
      previous_projection_digest: previousProjectionDigest,
      restored_event_id: latest.event_id,
      restored_revision: latest.revision,
      restored_projection_digest: sha256(canonicalJson(projection)),
      backup_manifest_digest: sha256(backupManifest),
      occurred_at: occurredAt(),
    }, options.auditId);
    return {
      applied: true,
      audit,
      authority_ref: options.authorityRef,
      backup,
      previous_status: before,
      status: reconciliationStatus(paths, taskId, latest, events),
      revision: latest.revision,
    };
  };
  return withLock(taskMutationLockFile(paths, taskId), run);
}

module.exports = {
  appendReconciliationAudit,
  readReconciliationAudit,
  reconcileTaskRuntime,
  reconciliationAuditFile,
  reconciliationStatus,
};
