"use strict";

const fs = require("fs");
const path = require("path");

const REQUIRED_FIELDS = ["id", "title", "status", "created", "updated"];
const VALID_STATUSES = new Set(["todo", "doing", "done"]);
const METADATA_LINE = /^[A-Za-z0-9_.-]+: /;
const TASK_DAY = /^(\d{8})-\d+-/;

class TaskRepositoryError extends Error {
  constructor(message) {
    super(message);
    this.name = "TaskRepositoryError";
  }
}

function parseTaskHeader(text) {
  const fields = Object.create(null);
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (line === "" || line.startsWith("## ") || line.startsWith("# ")) {
      break;
    }
    if (!METADATA_LINE.test(line)) {
      break;
    }

    const separator = line.indexOf(": ");
    const key = line.slice(0, separator);
    const value = line.slice(separator + 2);
    if (!fields[key]) {
      fields[key] = [];
    }
    fields[key].push(value);
  }
  return fields;
}

function validateTaskFile(file) {
  const content = fs.readFileSync(file);
  const fields = parseTaskHeader(content.toString("utf8"));
  const missing = REQUIRED_FIELDS.filter((field) => !fields[field]);
  const duplicate = REQUIRED_FIELDS.filter((field) => (fields[field] || []).length > 1);

  if (missing.length > 0) {
    throw new TaskRepositoryError(`malformed task file: ${file} missing ${missing.join(" ")}`);
  }
  if (duplicate.length > 0) {
    throw new TaskRepositoryError(
      `malformed task file: ${file} duplicate ${duplicate.join(" ")}`,
    );
  }

  const expectedId = path.basename(file, ".md");
  const task = Object.fromEntries(REQUIRED_FIELDS.map((field) => [field, fields[field][0]]));
  if (task.id !== expectedId) {
    throw new TaskRepositoryError(
      `malformed task file: ${file} filename/id mismatch (${expectedId} != ${task.id})`,
    );
  }
  if (!VALID_STATUSES.has(task.status)) {
    throw new TaskRepositoryError(`malformed task file: ${file} invalid status ${task.status}`);
  }

  return { content, fields, task };
}

function listTaskIds(tasksDir) {
  let names;
  try {
    names = fs.readdirSync(tasksDir);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return names
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.slice(0, -3))
    .sort();
}

function taskFile(tasksDir, taskId) {
  return path.join(tasksDir, `${taskId}.md`);
}

function isRegularFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function requireTaskFile(tasksDir, taskId) {
  const file = taskFile(tasksDir, taskId);
  if (isRegularFile(file)) {
    return file;
  }

  const knownTasks = listTaskIds(tasksDir);
  let message = `unknown task: ${taskId}`;
  if (knownTasks.length > 0) {
    message += `\nknown tasks:\n${knownTasks.join("\n")}`;
  }
  throw new TaskRepositoryError(message);
}

function shouldListTask(status, taskId, cutoffDay) {
  if (!cutoffDay || status !== "done") {
    return true;
  }
  const match = TASK_DAY.exec(taskId);
  return !match || match[1] >= cutoffDay;
}

function listTaskRecords(tasksDir, cutoffDay = "") {
  const taskIds = listTaskIds(tasksDir);
  const records = [];
  for (const taskId of taskIds) {
    const file = taskFile(tasksDir, taskId);
    const { task } = validateTaskFile(file);
    if (shouldListTask(task.status, task.id, cutoffDay)) {
      records.push(task);
    }
  }
  return records;
}

module.exports = {
  REQUIRED_FIELDS,
  TaskRepositoryError,
  listTaskIds,
  listTaskRecords,
  parseTaskHeader,
  requireTaskFile,
  shouldListTask,
  taskFile,
  validateTaskFile,
};
