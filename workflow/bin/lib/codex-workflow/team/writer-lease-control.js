"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { CommandError } = require("../core/command-runtime");
const { canonicalJson, readAuthoritativeEvents, sha256 } = require("../core/event-store");
const { taskEventFile } = require("../core/task-mutation");
const { taskArtifactDir } = require("../core/paths");

const SNAPSHOT_SCHEMA_VERSION = 1;
const JOURNAL_SCHEMA_VERSION = 1;
const FORENSIC_SCHEMA_VERSION = 1;
const MAX_MIGRATION_EVENT_BYTES = 1024 * 1024;
const MAX_MIGRATION_STATE_BYTES = 256 * 1024;
const MAX_CONTROL_FILE_BYTES = 256 * 1024;
const MAX_CONTROL_LEASES = 512;
const MAX_LEASE_PATHS = 64;
const MAX_LEASE_PATH_BYTES = 512;
const MAX_FORENSIC_TASKS = 4096;
const MAX_TAIL_EVENT_BYTES = 256 * 1024;

function snapshotFile(paths) {
  return path.join(paths.stateDir, "team-writer-leases.json");
}

function journalFile(paths) {
  return path.join(paths.stateDir, "team-writer-leases.recovery.json");
}

function forensicFile(paths) {
  return path.join(paths.stateDir, "team-writer-leases.forensic.json");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function signed(value) {
  const unsigned = { ...value };
  delete unsigned.digest;
  return { ...unsigned, digest: sha256(canonicalJson(unsigned)) };
}

function fsyncDirectory(directory) {
  const descriptor = fs.openSync(directory, "r");
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function durableWriteJson(file, value) {
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = path.join(
    directory,
    `.${path.basename(file)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8" });
    const descriptor = fs.openSync(temporary, "r");
    try {
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(temporary, file);
    fsyncDirectory(directory);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function durableRemove(file) {
  const directory = path.dirname(file);
  fs.rmSync(file, { force: true });
  if (fs.existsSync(directory)) fsyncDirectory(directory);
}

function verifySigned(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CommandError(`writer lease control plane ${label} corrupt: object required`);
  }
  const { digest, ...unsigned } = value;
  if (typeof digest !== "string" || digest !== sha256(canonicalJson(unsigned))) {
    throw new CommandError(`writer lease control plane ${label} corrupt: digest mismatch`);
  }
  return value;
}

function readJsonIfPresent(file, label, maximumBytes = MAX_CONTROL_FILE_BYTES) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile()) {
      throw new CommandError(`writer lease control plane ${label} corrupt: not a file`);
    }
    if (stat.size > maximumBytes) {
      throw new CommandError(`writer lease control plane ${label} corrupt: exceeds size limit`);
    }
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    if (error instanceof SyntaxError) {
      throw new CommandError(`writer lease control plane ${label} corrupt: ${error.message}`);
    }
    throw error;
  }
}

function validateEntry(entry, label) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new CommandError(`writer lease control plane ${label} corrupt: lease entry object required`);
  }
  for (const field of ["task_id", "lease_id", "owner_attempt_id", "state"]) {
    if (typeof entry[field] !== "string" || !entry[field]) {
      throw new CommandError(`writer lease control plane ${label} corrupt: ${field} required`);
    }
  }
  if (!new Set(["active", "uncertain-active"]).has(entry.state)) {
    throw new CommandError(`writer lease control plane ${label} corrupt: invalid lease state`);
  }
  if (!Array.isArray(entry.paths) || entry.paths.length === 0
    || entry.paths.length > MAX_LEASE_PATHS
    || entry.paths.some((item) => (
      typeof item !== "string" || !item || Buffer.byteLength(item) > MAX_LEASE_PATH_BYTES
    ))) {
    throw new CommandError(`writer lease control plane ${label} corrupt: lease paths required`);
  }
  return entry;
}

function readSnapshot(paths) {
  const value = readJsonIfPresent(snapshotFile(paths), "snapshot");
  if (!value) return null;
  verifySigned(value, "snapshot");
  if (value.schema_version !== SNAPSHOT_SCHEMA_VERSION
    || !Number.isInteger(value.generation) || value.generation < 1
    || !Number.isInteger(value.coverage_count) || value.coverage_count < 0
    || typeof value.coverage_status !== "string"
    || typeof value.coverage_digest !== "string"
    || !Array.isArray(value.leases)
    || value.leases.length > MAX_CONTROL_LEASES) {
    throw new CommandError("writer lease control plane snapshot corrupt: invalid envelope");
  }
  value.leases.forEach((entry) => validateEntry(entry, "snapshot"));
  return value;
}

function readJournal(paths) {
  const value = readJsonIfPresent(journalFile(paths), "recovery journal");
  if (!value) return null;
  verifySigned(value, "recovery journal");
  if (value.schema_version !== JOURNAL_SCHEMA_VERSION
    || !Number.isInteger(value.generation) || value.generation < 1
    || value.phase !== "prepare"
    || !Array.isArray(value.leases)
    || value.leases.length > MAX_CONTROL_LEASES) {
    throw new CommandError("writer lease control plane recovery journal corrupt: invalid envelope");
  }
  value.leases.forEach((entry) => validateEntry(entry, "recovery journal"));
  return value;
}

function validateScannedTask(entry, label) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new CommandError(`writer lease control plane ${label} corrupt: scanned task object required`);
  }
  for (const field of ["task_id", "source_kind", "forensic_result"]) {
    if (typeof entry[field] !== "string" || !entry[field]) {
      throw new CommandError(`writer lease control plane ${label} corrupt: scanned task ${field} required`);
    }
  }
  if (!Number.isInteger(entry.bounded_byte_size) || entry.bounded_byte_size < 0) {
    throw new CommandError(`writer lease control plane ${label} corrupt: scanned task byte size required`);
  }
  for (const field of ["source_digest", "head_event_id", "head_event_digest"]) {
    if (entry[field] !== undefined && typeof entry[field] !== "string") {
      throw new CommandError(`writer lease control plane ${label} corrupt: scanned task ${field} invalid`);
    }
  }
  if (entry.head_revision !== undefined
    && (!Number.isInteger(entry.head_revision) || entry.head_revision < 0)) {
    throw new CommandError(`writer lease control plane ${label} corrupt: scanned task head revision invalid`);
  }
  return entry;
}

function forensicManifest(scannedTasks, generation, status) {
  if (scannedTasks.length > MAX_FORENSIC_TASKS) {
    throw new CommandError("writer lease control plane forensic manifest exceeds task limit");
  }
  return signed({
    schema_version: FORENSIC_SCHEMA_VERSION,
    generation,
    status,
    scanned_tasks: scannedTasks.sort((left, right) => left.task_id.localeCompare(right.task_id)),
  });
}

function assertJournalMatchesSnapshot(snapshot, journal) {
  if (!journal || !snapshot) return;
  if (journal.base_snapshot_digest !== snapshot.digest
    || journal.generation !== snapshot.generation + 1) {
    throw new CommandError(
      "writer lease control plane recovery journal corrupt: snapshot linkage mismatch",
    );
  }
}

function activeLeaseEntriesFromState(taskId, state, event, leaseState = "active") {
  const team = state?.active_team && typeof state.active_team === "object"
    ? state.active_team
    : {};
  return (team.writer_leases || [])
    .filter((lease) => new Set(["active", "uncertain-active"]).has(lease.state))
    .map((lease) => ({
      task_id: taskId,
      lease_id: String(lease.lease_id || ""),
      team_run_id: String(lease.team_run_id || team.team_run_id || ""),
      generation: Number(lease.generation || team.generation || 0),
      lane_id: String(lease.lane_id || ""),
      owner_attempt_id: String(lease.owner_attempt_id || ""),
      paths: Array.isArray(lease.paths) ? [...lease.paths] : lease.paths,
      state: leaseState === "uncertain-active" ? "uncertain-active" : lease.state,
      operation_id: String(event?.operation_id || ""),
      source_event_id: String(event?.event_id || ""),
      source_revision: Number(event?.revision || 0),
      updated_at: String(event?.occurred_at || ""),
    }))
    .map((entry) => validateEntry(entry, "derived"));
}

function boundedFileSize(file, maximum, label) {
  const stat = fs.statSync(file);
  if (!stat.isFile()) {
    throw new CommandError(`writer lease control plane migration cannot read ${label}: not a file`);
  }
  if (stat.size > maximum) {
    throw new CommandError(
      `writer lease control plane unavailable: ${label} exceeds bounded migration limit`,
    );
  }
  return stat.size;
}

function digestFileBounded(file, maximum, label) {
  boundedFileSize(file, maximum, label);
  return sha256(fs.readFileSync(file));
}

function digestFileStreaming(file) {
  const hash = crypto.createHash("sha256");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  const descriptor = fs.openSync(file, "r");
  try {
    while (true) {
      const bytes = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytes === 0) break;
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    fs.closeSync(descriptor);
  }
  return `sha256:${hash.digest("hex")}`;
}

function readLastCompleteLineBounded(file) {
  const stat = fs.statSync(file);
  const descriptor = fs.openSync(file, "r");
  const chunks = [];
  let position = stat.size;
  let seenNonWhitespace = false;
  let newlineTerminated = false;
  let buffered = 0;
  try {
    while (position > 0) {
      const readSize = Math.min(64 * 1024, position);
      position -= readSize;
      const chunk = Buffer.allocUnsafe(readSize);
      fs.readSync(descriptor, chunk, 0, readSize, position);
      for (let index = readSize - 1; index >= 0; index -= 1) {
        const byte = chunk[index];
        if (!seenNonWhitespace && (byte === 10 || byte === 13 || byte === 32 || byte === 9)) {
          if (byte === 10) newlineTerminated = true;
          continue;
        }
        if (!seenNonWhitespace && !newlineTerminated) {
          throw new CommandError(
            "writer lease control plane unavailable: authoritative tail is not newline-terminated",
          );
        }
        seenNonWhitespace = true;
        chunks.push(Buffer.from([byte]));
        buffered += 1;
        if (buffered > MAX_TAIL_EVENT_BYTES) {
          throw new CommandError("writer lease control plane unavailable: tail event exceeds size limit");
        }
        if (byte === 10 && buffered > 1) {
          chunks.pop();
          return Buffer.concat(chunks.reverse()).toString("utf8");
        }
      }
    }
  } finally {
    fs.closeSync(descriptor);
  }
  if (!seenNonWhitespace) return "";
  return Buffer.concat(chunks.reverse()).toString("utf8");
}

function readBoundedJson(file, label, maximumBytes) {
  const value = readJsonIfPresent(file, label, maximumBytes);
  if (!value) throw new CommandError(`writer lease control plane ${label} is missing`);
  return value;
}

function authoritativeSourceMetadata(taskId, eventFile, byteSize, latest) {
  return validateScannedTask({
    task_id: taskId,
    source_kind: "authoritative-events",
    bounded_byte_size: byteSize,
    source_digest: digestFileBounded(eventFile, MAX_MIGRATION_EVENT_BYTES, `authoritative events for ${taskId}`),
    head_event_id: latest?.event_id || "",
    head_revision: Number(latest?.revision || 0),
    head_event_digest: latest?.event_digest || "",
    forensic_result: latest ? "bounded-head-verified" : "empty-authoritative-stream",
  }, "migration");
}

function legacySourceMetadata(taskId, stateFile, byteSize) {
  return validateScannedTask({
    task_id: taskId,
    source_kind: "legacy-state",
    bounded_byte_size: byteSize,
    source_digest: digestFileBounded(stateFile, MAX_MIGRATION_STATE_BYTES, `legacy state for ${taskId}`),
    forensic_result: "legacy-state-uncertain",
  }, "migration");
}

function largeAuthoritativeSource(paths, taskId, eventFile, byteSize) {
  const stateFile = path.join(taskArtifactDir(paths, taskId), "state.json");
  const state = readBoundedJson(stateFile, `state ${taskId}`, MAX_MIGRATION_STATE_BYTES);
  let latest;
  try {
    latest = JSON.parse(readLastCompleteLineBounded(eventFile));
  } catch (error) {
    if (error instanceof CommandError) throw error;
    throw new CommandError(
      `writer lease control plane unavailable: authoritative tail failed for ${taskId}: ${error.message}`,
    );
  }
  if (!latest || latest.schema_version !== 2 || latest.task_id !== taskId
    || typeof latest.event_id !== "string" || !latest.event_id
    || !Number.isInteger(latest.revision) || latest.revision < 1
    || typeof latest.event_digest !== "string" || !latest.event_digest) {
    throw new CommandError(`writer lease control plane unavailable: authoritative tail invalid for ${taskId}`);
  }
  if (state.last_event_id !== latest.event_id || state.runtime_revision !== latest.revision) {
    throw new CommandError(
      `writer lease control plane unavailable: bounded authoritative head does not match state for ${taskId}`,
    );
  }
  return {
    leases: activeLeaseEntriesFromState(taskId, state, latest, "uncertain-active"),
    metadata: validateScannedTask({
      task_id: taskId,
      source_kind: "authoritative-events-large",
      bounded_byte_size: byteSize,
      source_digest: digestFileStreaming(eventFile),
      head_event_id: latest.event_id,
      head_revision: latest.revision,
      head_event_digest: latest.event_digest,
      forensic_result: "head-state-matched-history-unverified",
    }, "migration"),
  };
}

function migrateSnapshot(paths) {
  const leases = [];
  const scannedTasks = [];
  if (fs.existsSync(paths.artifactsDir)) {
    for (const entry of fs.readdirSync(paths.artifactsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const taskId = entry.name;
      const eventFile = taskEventFile(paths, taskId);
      const stateFile = path.join(taskArtifactDir(paths, taskId), "state.json");
      if (fs.existsSync(eventFile)) {
        const byteSize = fs.statSync(eventFile).size;
        if (byteSize > MAX_MIGRATION_EVENT_BYTES) {
          const migrated = largeAuthoritativeSource(paths, taskId, eventFile, byteSize);
          scannedTasks.push(migrated.metadata);
          leases.push(...migrated.leases);
        } else {
          boundedFileSize(eventFile, MAX_MIGRATION_EVENT_BYTES, `authoritative events for ${taskId}`);
          let events;
          try {
            events = readAuthoritativeEvents(eventFile, taskId);
          } catch (error) {
            throw new CommandError(
              `writer lease control plane unavailable: bounded authoritative evidence failed for ${taskId}: ${error.message}`,
            );
          }
          const latest = events.at(-1);
          scannedTasks.push(authoritativeSourceMetadata(taskId, eventFile, byteSize, latest));
          if (latest) leases.push(...activeLeaseEntriesFromState(taskId, latest.projection.state, latest));
        }
      } else if (fs.existsSync(stateFile)) {
        const byteSize = boundedFileSize(stateFile, MAX_MIGRATION_STATE_BYTES, `legacy state for ${taskId}`);
        const state = readBoundedJson(stateFile, `legacy state ${taskId}`, MAX_MIGRATION_STATE_BYTES);
        scannedTasks.push(legacySourceMetadata(taskId, stateFile, byteSize));
        leases.push(...activeLeaseEntriesFromState(taskId, state, null, "uncertain-active"));
      }
    }
  }
  const forensic = forensicManifest(scannedTasks, 1, "legacy-compatible");
  const snapshot = signed({
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    generation: 1,
    forensic_status: "legacy-compatible",
    coverage_digest: forensic.digest,
    coverage_count: scannedTasks.length,
    coverage_status: forensic.status,
    leases,
  });
  durableWriteJson(forensicFile(paths), forensic);
  durableWriteJson(snapshotFile(paths), snapshot);
  return snapshot;
}

function loadSnapshotOrMigrate(paths) {
  const snapshot = readSnapshot(paths);
  const journal = readJournal(paths);
  assertJournalMatchesSnapshot(snapshot, journal);
  if (snapshot) return snapshot;
  if (journal) {
    return {
      schema_version: SNAPSHOT_SCHEMA_VERSION,
      generation: journal.generation,
      forensic_status: "journal-only-recovery",
      coverage_digest: "",
      coverage_count: 0,
      coverage_status: "journal-only-recovery",
      leases: journal.leases.map((entry) => ({ ...entry, state: "uncertain-active" })),
      digest: "",
    };
  }
  return migrateSnapshot(paths);
}

function journalEntries(paths) {
  const snapshot = readSnapshot(paths);
  const journal = readJournal(paths);
  assertJournalMatchesSnapshot(snapshot, journal);
  return journal ? journal.leases.map((entry) => ({ ...entry, state: "uncertain-active" })) : [];
}

function activeControlPlaneLeases(paths, excludedTaskId = "") {
  const snapshot = loadSnapshotOrMigrate(paths);
  const combined = new Map();
  for (const entry of [...snapshot.leases, ...journalEntries(paths)]) {
    if (entry.task_id === excludedTaskId) continue;
    combined.set(`${entry.task_id}:${entry.lease_id}`, entry);
  }
  return [...combined.values()];
}

function prepareWriterLeaseControlEvent(paths, taskId, event) {
  const taskLeases = activeLeaseEntriesFromState(
    taskId,
    event.projection?.state,
    event,
    "uncertain-active",
  );
  if (taskLeases.length === 0) return;
  const snapshot = loadSnapshotOrMigrate(paths);
  const leases = [
    ...snapshot.leases.filter((lease) => lease.task_id !== taskId),
    ...taskLeases,
  ].sort((left, right) => (
    `${left.task_id}:${left.lease_id}`.localeCompare(`${right.task_id}:${right.lease_id}`)
  ));
  durableWriteJson(journalFile(paths), signed({
    schema_version: JOURNAL_SCHEMA_VERSION,
    generation: snapshot.generation + 1,
    phase: "prepare",
    base_snapshot_digest: snapshot.digest,
    task_id: taskId,
    operation_id: event.operation_id,
    event_id: event.event_id,
    revision: event.revision,
    leases,
  }));
}

function syncWriterLeaseControlAfterEvent(paths, taskId, event) {
  const taskLeases = activeLeaseEntriesFromState(taskId, event.projection?.state, event);
  if (taskLeases.length === 0
    && !fs.existsSync(snapshotFile(paths))
    && !fs.existsSync(journalFile(paths))) {
    return;
  }
  const snapshot = loadSnapshotOrMigrate(paths);
  const leases = [
    ...snapshot.leases.filter((lease) => lease.task_id !== taskId),
    ...taskLeases,
  ].sort((left, right) => (
    `${left.task_id}:${left.lease_id}`.localeCompare(`${right.task_id}:${right.lease_id}`)
  ));
  durableWriteJson(snapshotFile(paths), signed({
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    generation: snapshot.generation + 1,
    forensic_status: "current",
    coverage_digest: snapshot.coverage_digest || "",
    coverage_count: Number(snapshot.coverage_count || 0),
    coverage_status: snapshot.coverage_status || "current-event",
    leases: clone(leases),
  }));
  durableRemove(journalFile(paths));
}

module.exports = {
  activeControlPlaneLeases,
  forensicFile,
  journalFile,
  prepareWriterLeaseControlEvent,
  snapshotFile,
  syncWriterLeaseControlAfterEvent,
};
