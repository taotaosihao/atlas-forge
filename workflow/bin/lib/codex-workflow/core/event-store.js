"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function eventTimestamp(clock) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("clock must return a valid date");
  }
  return date.toISOString();
}

function appendStructuredEvent(
  file,
  { taskId, kind, data = {}, clock = () => new Date(), eventId = () => crypto.randomUUID() },
) {
  const event = {
    schema_version: 1,
    event_id: eventId(),
    task_id: taskId,
    kind,
    occurred_at: eventTimestamp(clock),
    data,
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
  );
}

function canonicalJson(value) {
  return JSON.stringify(stableValue(value));
}

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function eventPayloadDigest({ taskId, kind, data, expectedRevision }) {
  return sha256(canonicalJson({
    task_id: taskId,
    kind,
    data,
    expected_revision: expectedRevision,
  }));
}

function authoritativeEventDigest(event) {
  const record = { ...event };
  delete record.event_digest;
  return sha256(canonicalJson(record));
}

function appendAuthoritativeEvent(file, event) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const descriptor = fs.openSync(file, "a");
  try {
    fs.writeSync(descriptor, `${JSON.stringify(event)}\n`, null, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  return event;
}

function readAuthoritativeEvents(file, taskId = "") {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const events = [];
  for (const [index, line] of text.split("\n").entries()) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch (error) {
      throw new Error(`corrupt authoritative event at line ${index + 1}: ${error.message}`);
    }
    if (!event || event.schema_version !== 2 || typeof event !== "object") {
      throw new Error(`corrupt authoritative event at line ${index + 1}: schema_version 2 required`);
    }
    for (const field of ["event_id", "task_id", "operation_id", "kind", "occurred_at"]) {
      if (typeof event[field] !== "string" || !event[field]) {
        throw new Error(`corrupt authoritative event at line ${index + 1}: ${field} required`);
      }
    }
    if (!event.projection || typeof event.projection !== "object"
      || typeof event.projection.task_content !== "string"
      || !event.projection.state || typeof event.projection.state !== "object"
      || Array.isArray(event.projection.state)) {
      throw new Error(`corrupt authoritative event at line ${index + 1}: projection required`);
    }
    if (taskId && event.task_id !== taskId) {
      throw new Error(`authoritative event task mismatch at revision ${event.revision}`);
    }
    const previous = events.at(-1);
    const expectedRevision = previous ? previous.revision + 1 : 1;
    const expectedLastEventId = previous ? previous.event_id : "";
    if (event.revision !== expectedRevision || event.expected_revision !== expectedRevision - 1) {
      throw new Error(`authoritative event revision gap: expected ${expectedRevision}`);
    }
    if (event.last_event_id !== expectedLastEventId) {
      throw new Error(`authoritative event chain mismatch at revision ${event.revision}`);
    }
    const expectedDigest = eventPayloadDigest({
      taskId: event.task_id,
      kind: event.kind,
      data: event.data,
      expectedRevision: event.expected_revision,
    });
    if (event.payload_digest !== expectedDigest) {
      throw new Error(`authoritative event payload digest mismatch at revision ${event.revision}`);
    }
    if (event.event_digest !== authoritativeEventDigest(event)) {
      throw new Error(`authoritative event record digest mismatch at revision ${event.revision}`);
    }
    if (events.some((item) => item.event_id === event.event_id)) {
      throw new Error(`duplicate authoritative event_id: ${event.event_id}`);
    }
    if (events.some((item) => item.operation_id === event.operation_id)) {
      throw new Error(`duplicate authoritative operation_id: ${event.operation_id}`);
    }
    events.push(event);
  }
  return events;
}

const appendLifecycleEvent = appendStructuredEvent;

function readEventRows(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const rows = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    try {
      rows.push(JSON.parse(line));
    } catch {
      // Runtime files predate the schema and may contain malformed legacy rows.
    }
  }
  return rows;
}

module.exports = {
  appendAuthoritativeEvent,
  appendLifecycleEvent,
  appendStructuredEvent,
  canonicalJson,
  authoritativeEventDigest,
  eventPayloadDigest,
  eventTimestamp,
  readAuthoritativeEvents,
  readEventRows,
  sha256,
  stableValue,
};
