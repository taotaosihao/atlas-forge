"use strict";

const assert = require("assert/strict");
const path = require("path");
const { spawnSync } = require("child_process");
const test = require("node:test");

const MODULE_PATH = path.resolve(
  __dirname,
  "../../bin/lib/codex-workflow/task/id.js",
);
const {
  MAX_SLUG_LENGTH,
  normalizeTaskTitle,
  taskIdTitleToken,
} = require(MODULE_PATH);

test("preserves the existing ASCII lower-kebab token", () => {
  assert.equal(taskIdTitleToken("Contract Slug Baseline"), "contract-slug-baseline");
  assert.equal(taskIdTitleToken("Atlas__Workflow...Phase 1"), "atlas-workflow-phase-1");
});

test("strips at most one existing task-id prefix", () => {
  assert.equal(
    taskIdTitleToken("20260709-003-P0A Runtime Stub"),
    "p0a-runtime-stub",
  );
  assert.equal(
    taskIdTitleToken("20260709-003-20260708-017-Atlas Workflow"),
    "20260708-017-atlas-workflow",
  );
});

test("normalizes titles with NFC without applying compatibility folding", () => {
  assert.equal(normalizeTaskTitle("  20260709-003-Cafe\u0301  "), "Café");
  assert.equal(taskIdTitleToken("Cafe\u0301"), taskIdTitleToken("Café"));
  assert.equal(taskIdTitleToken("ＡＴＬＡＳ"), "u-98874ae288e3");
});

test("uses a stable short SHA-256 token when no ASCII token exists", () => {
  assert.equal(taskIdTitleToken("纯中文标题"), "u-e1e4b2c89617");
  assert.equal(taskIdTitleToken("20260709-003-纯中文标题"), "u-e1e4b2c89617");
  assert.equal(taskIdTitleToken("---"), "u-cb3f91d54eee");
});

test("caps ASCII slugs without leaving a trailing separator", () => {
  const token = taskIdTitleToken("Atlas workflow migration ".repeat(10));
  assert.equal(token.length, MAX_SLUG_LENGTH);
  assert.match(token, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
});

test("CLI writes exactly one token line", () => {
  const result = spawnSync(process.execPath, [MODULE_PATH, "20260709-003-CLI Slug"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "cli-slug\n");
  assert.equal(result.stderr, "");
});

test("CLI rejects an invalid argument count", () => {
  const result = spawnSync(process.execPath, [MODULE_PATH], { encoding: "utf8" });

  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, 'usage: id.js "<title>"\n');
});
