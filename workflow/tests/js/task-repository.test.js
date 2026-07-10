"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const test = require("node:test");

const REPOSITORY_PATH = path.resolve(
  __dirname,
  "../../bin/lib/codex-workflow/task/repository.js",
);
const CLI_PATH = path.resolve(__dirname, "../../bin/lib/codex-workflow/task/cli.js");
const {
  listTaskRecords,
  parseTaskHeader,
  validateTaskFile,
} = require(REPOSITORY_PATH);
const {
  LIST_USAGE,
  SHOW_USAGE,
  listCutoffDay,
  parseListArgs,
  versionSort,
} = require(CLI_PATH);

function temporaryWorkflow(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-task-repository."));
  fs.mkdirSync(path.join(root, "tasks"), { recursive: true });
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  return root;
}

function taskContent(id, { status = "todo", title = id, finalNewline = true } = {}) {
  const content = [
    `id: ${id}`,
    `title: ${title}`,
    `status: ${status}`,
    "created: 2026-07-10",
    "updated: 2026-07-10",
    "artifact_dir: artifacts/example",
    "",
    "## Success Criteria",
    "fixture",
  ].join("\n");
  return finalNewline ? `${content}\n` : content;
}

function writeTask(root, id, options) {
  const file = path.join(root, "tasks", `${id}.md`);
  fs.writeFileSync(file, taskContent(id, options));
  return file;
}

function runCli(root, ...args) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    encoding: "utf8",
    env: { ...process.env, CODEX_WORKFLOW_ROOT: root },
  });
}

test("parses the metadata header and stops before the body", () => {
  const fields = parseTaskHeader(
    "id: example\r\ntitle: Example\r\ncustom_field: value\r\n\r\nid: body-value\r\n",
  );

  assert.deepEqual(fields.id, ["example"]);
  assert.deepEqual(fields.title, ["Example"]);
  assert.deepEqual(fields.custom_field, ["value"]);
});

test("validates required, duplicate, filename, and status fields", (t) => {
  const root = temporaryWorkflow(t);
  const tasksDir = path.join(root, "tasks");

  const missing = path.join(tasksDir, "missing.md");
  fs.writeFileSync(missing, "id: missing\n");
  assert.throws(
    () => validateTaskFile(missing),
    /missing title status created updated$/,
  );

  const duplicate = path.join(tasksDir, "duplicate.md");
  fs.writeFileSync(
    duplicate,
    taskContent("duplicate").replace("title: duplicate", "title: duplicate\ntitle: again"),
  );
  assert.throws(() => validateTaskFile(duplicate), /duplicate title$/);

  const mismatch = path.join(tasksDir, "expected.md");
  fs.writeFileSync(mismatch, taskContent("actual"));
  assert.throws(
    () => validateTaskFile(mismatch),
    /filename\/id mismatch \(expected != actual\)$/,
  );

  const invalidStatus = path.join(tasksDir, "invalid-status.md");
  fs.writeFileSync(invalidStatus, taskContent("invalid-status", { status: "blocked" }));
  assert.throws(() => validateTaskFile(invalidStatus), /invalid status blocked$/);
});

test("filters only old done tasks by the inclusive cutoff day", (t) => {
  const root = temporaryWorkflow(t);
  writeTask(root, "20200101-001-old-done", { status: "done" });
  writeTask(root, "20200101-002-old-doing", { status: "doing" });
  writeTask(root, "20260704-001-cutoff-done", { status: "done" });
  writeTask(root, "custom-done", { status: "done" });

  assert.deepEqual(
    listTaskRecords(path.join(root, "tasks"), "20260704").map((task) => task.id),
    ["20200101-002-old-doing", "20260704-001-cutoff-done", "custom-done"],
  );
});

test("preserves GNU version ordering for task IDs", () => {
  const lines = [
    "todo\t20260710-2-two\tTwo",
    "todo\t20260710-10-ten\tTen",
    "todo\t20260710-002-padded-two\tPadded two",
    "todo\t20260710-010-padded-ten\tPadded ten",
  ];

  assert.equal(
    versionSort(lines),
    [lines[2], lines[0], lines[3], lines[1], ""].join("\n"),
  );
});

test("parses list options and computes the local inclusive window", () => {
  assert.deepEqual(parseListArgs([]), { days: "7", mode: "recent" });
  assert.deepEqual(parseListArgs(["--all"]), { days: "7", mode: "all" });
  assert.deepEqual(parseListArgs(["--days", "3"]), { days: "3", mode: "recent" });
  assert.deepEqual(parseListArgs(["--days=2"]), { days: "2", mode: "recent" });
  assert.equal(listCutoffDay("7", new Date(2026, 6, 10, 12, 0, 0)), "20260704");
  assert.throws(() => parseListArgs(["--days", "0"]), /invalid days: 0/);
  assert.throws(
    () => parseListArgs(["--all", "--days=2"]),
    (error) => error.message === LIST_USAGE,
  );
});

test("list CLI emits sorted tab-separated rows and normalizes title tabs", (t) => {
  const root = temporaryWorkflow(t);
  writeTask(root, "20260710-10-ten", { title: "Ten" });
  writeTask(root, "20260710-2-two", { title: "Two\tColumns" });

  const result = runCli(root, "list", "--all");
  assert.equal(result.status, 0);
  assert.equal(
    result.stdout,
    "todo\t20260710-2-two\tTwo Columns\ntodo\t20260710-10-ten\tTen\n",
  );
  assert.equal(result.stderr, "");
});

test("list CLI preserves usage and invalid-days errors", (t) => {
  const root = temporaryWorkflow(t);

  const invalidDays = runCli(root, "list", "--days", "0");
  assert.equal(invalidDays.status, 1);
  assert.equal(invalidDays.stdout, "");
  assert.equal(invalidDays.stderr, "invalid days: 0\n");

  const invalidOption = runCli(root, "list", "--unknown");
  assert.equal(invalidOption.status, 1);
  assert.equal(invalidOption.stdout, "");
  assert.equal(invalidOption.stderr, `${LIST_USAGE}\n`);
});

test("list CLI fails with the existing malformed task message", (t) => {
  const root = temporaryWorkflow(t);
  const file = path.join(root, "tasks", "broken.md");
  fs.writeFileSync(file, "id: broken\n");

  const result = runCli(root, "list", "--all");
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(
    result.stderr,
    `malformed task file: ${file} missing title status created updated\n`,
  );
});

test("show CLI writes the original task bytes without adding a newline", (t) => {
  const root = temporaryWorkflow(t);
  const id = "20260710-001-show-exact";
  const expected = taskContent(id, { finalNewline: false, title: "Show Exact" });
  writeTask(root, id, { finalNewline: false, title: "Show Exact" });

  const result = runCli(root, "show", id);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, expected);
  assert.equal(result.stderr, "");
});

test("show CLI preserves usage and unknown-task diagnostics", (t) => {
  const root = temporaryWorkflow(t);
  writeTask(root, "20260710-001-known", { title: "Known" });

  const usage = runCli(root, "show");
  assert.equal(usage.status, 1);
  assert.equal(usage.stdout, "");
  assert.equal(usage.stderr, `${SHOW_USAGE}\n`);

  const unknown = runCli(root, "show", "missing-task");
  assert.equal(unknown.status, 1);
  assert.equal(unknown.stdout, "");
  assert.equal(
    unknown.stderr,
    "unknown task: missing-task\nknown tasks:\n20260710-001-known\n",
  );
});
