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

function appendLifecycleEvent(
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
  appendLifecycleEvent,
  eventTimestamp,
  readEventRows,
};
