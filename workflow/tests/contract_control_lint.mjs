import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const lint = resolve(root, "plugins/atlas-workflow/scripts/atlas-control-lint");
const work = mkdtempSync(join(process.env.TMP_ROOT || tmpdir(), "control-lint-"));

const git = (repo, ...args) =>
  execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid" },
  }).trim();
const write = (repo, file, text) => {
  mkdirSync(dirname(join(repo, file)), { recursive: true });
  writeFileSync(join(repo, file), text);
};
const commit = (repo, message, files) => {
  for (const [file, text] of Object.entries(files)) {
    if (text === null) rmSync(join(repo, file));
    else write(repo, file, text);
  }
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", message);
  return git(repo, "rev-parse", "HEAD");
};
const run = (repo, ...args) => {
  const result = spawnSync(process.execPath, [lint, "--repo", repo, ...args], { encoding: "utf8" });
  return { status: result.status, out: result.stdout + result.stderr };
};

const index = `# comment line
version: 1
entries:
  - id: task-states   # trailing comment
    controls: "DeviceTask 状态集合保持不变 # not a comment"
    source: user
    authority: ["docs/states.md#领域", "user-message:2026-10-14 ask"]
    paths: ["src/states/**"]
    checks: ["tests/acceptance/states.spec.ts", "pnpm openapi:diff && echo ok"]
  - id: deploy
    controls: >
      单一网关入口
      不暴露其他端口
    source: agent
    authority:
      - docs/deploy.md
    paths:
      - deploy/
    checks: []
    basis: 'cited practice: one ingress'
`;

try {
  const repo = join(work, "repo");
  mkdirSync(repo);
  git(repo, "init", "-q", "-b", "main");
  const base = commit(repo, "chore: product code", {
    "AGENTS.md": "# rules\n",
    "docs/states.md": "states\n",
    "docs/deploy.md": "deploy\n",
    "src/states/task.ts": "export const states = ['queued'];\n",
    "src/other.ts": "export {};\n",
    "deploy/compose.yaml": "services: {}\n",
    "tests/acceptance/states.spec.ts": "test('states')\n",
  });

  assert.equal(run(repo).status, 2, "a project without an index is blocked");
  assert.match(run(repo).out, /^blocked/);

  // init: index plus its declaration line in one Control-only commit.
  const init = commit(repo, "docs(control): add index", {
    "control/index.yaml": index,
    "AGENTS.md": "# rules\n- Control 索引见 `control/index.yaml`。\n",
  });
  let result = run(repo, "--base", base);
  assert.equal(result.status, 0, result.out);
  assert.match(result.out, /^consistent/);

  // Ordinary work on a governed path keeps the entry and needs no split.
  commit(repo, "fix: tidy states", { "src/states/task.ts": "export const states = ['queued'];\n\n", "src/other.ts": "export const x = 1;\n" });
  assert.equal(run(repo, "--base", init).status, 0);

  // A check file named by the index is Control: changing it with code is mixed.
  const mixedBase = git(repo, "rev-parse", "HEAD");
  commit(repo, "feat: retrying state", {
    "src/states/task.ts": "export const states = ['queued', 'retrying'];\n",
    "tests/acceptance/states.spec.ts": "test.skip('states')\n",
  });
  result = run(repo, "--base", mixedBase);
  assert.equal(result.status, 1, result.out);
  assert.match(result.out, /\[mixed-commit\].*\n\s+control: tests\/acceptance\/states\.spec\.ts\n\s+other: src\/states\/task\.ts/);
  git(repo, "reset", "-q", "--hard", mixedBase);

  // Dropping protection in the same commit still counts against the old index.
  commit(repo, "feat: unprotect and change", {
    "control/index.yaml": index.replace('"tests/acceptance/states.spec.ts", ', ""),
    "tests/acceptance/states.spec.ts": null,
    "src/states/task.ts": "export const states = [];\n",
  });
  result = run(repo, "--base", mixedBase);
  assert.equal(result.status, 1, result.out);
  assert.match(result.out, /\[mixed-commit\]/);
  git(repo, "reset", "-q", "--hard", mixedBase);

  // Deleting the whole index together with code is judged by the old index.
  commit(repo, "chore: drop control", { "control/index.yaml": null, "src/other.ts": "export const y = 2;\n" });
  result = run(repo, "--base", mixedBase);
  assert.equal(result.status, 1, result.out);
  assert.match(result.out, /was removed after/);
  assert.match(result.out, /\[mixed-commit\][^\n]*\n\s+control: control\/index\.yaml\n\s+other: src\/other\.ts/);
  git(repo, "reset", "-q", "--hard", mixedBase);

  // The declaring AGENTS.md is Control even when no entry cites it.
  commit(repo, "fix: rules and code", { "AGENTS.md": "# rules\n- Control 索引见 `control/index.yaml`。\n- 新规则\n", "src/other.ts": "export const z = 3;\n" });
  assert.match(run(repo, "--base", mixedBase).out, /\[mixed-commit\][^\n]*\n\s+control: AGENTS\.md\n\s+other: src\/other\.ts/);
  git(repo, "reset", "-q", "--hard", mixedBase);

  // The same change split into a Control commit first, then code, is consistent.
  commit(repo, "docs(control): allow retrying", {
    "docs/states.md": "states incl. retrying\n",
    "tests/acceptance/states.spec.ts": "test('states incl retrying')\n",
  });
  commit(repo, "feat: retrying state", { "src/states/task.ts": "export const states = ['queued', 'retrying'];\n" });
  result = run(repo, "--base", mixedBase);
  assert.equal(result.status, 0, result.out);

  // Stale references: missing authority, missing check file, unmatched path.
  const staleBase = git(repo, "rev-parse", "HEAD");
  commit(repo, "refactor: move deploy", { "docs/deploy.md": null, "deploy/compose.yaml": null, "ops/compose.yaml": "services: {}\n" });
  result = run(repo);
  assert.equal(result.status, 1, result.out);
  assert.match(result.out, /\[missing-authority\] entry deploy: docs\/deploy\.md/);
  assert.match(result.out, /\[unmatched-path\] entry deploy: deploy\/ matches no file/);
  assert.match(run(repo, "--base", staleBase).out, /\[mixed-commit\]/);
  git(repo, "reset", "-q", "--hard", staleBase);
  commit(repo, "test: drop acceptance", { "tests/acceptance/states.spec.ts": null });
  assert.match(run(repo).out, /\[missing-check\] entry task-states: tests\/acceptance\/states\.spec\.ts/);
  git(repo, "reset", "-q", "--hard", staleBase);

  // Schema problems are drift; unsupported syntax is blocked.
  commit(repo, "docs(control): bad entry", {
    "control/index.yaml": index.replace("source: agent", "source: bot").replace("basis: 'cited practice: one ingress'", "") + "  - id: task-states\n    controls: dup\n    source: agent\n    authority: [docs/states.md]\n    paths: [src/**]\n",
  });
  result = run(repo);
  assert.equal(result.status, 1, result.out);
  assert.match(result.out, /source must be user or agent/);
  assert.match(result.out, /duplicate id/);
  assert.match(result.out, /agent entry needs basis/);
  commit(repo, "docs(control): anchors", { "control/index.yaml": "version: 1\nentries:\n  - id: x\n    controls: &a y\n" });
  result = run(repo);
  assert.equal(result.status, 2, result.out);
  assert.match(result.out, /^blocked\n- control\/index\.yaml:4: unsupported YAML syntax/);
  assert.equal(run(repo, "--base", "no-such-rev").status, 2);

  // Fail-closed schema: empty values, unknown keys, mapping items, globs in refs.
  git(repo, "reset", "-q", "--hard", staleBase);
  commit(repo, "docs(control): sloppy entry", {
    "control/index.yaml": "version: 1\nentries:\n  - id:\n    controls:\n    source: agent\n    authority: [docs/*.md]\n    paths: [\"src/{a,b}.ts\"]\n    check: [tests/acceptance/states.spec.ts]\n    basis:\n",
  });
  result = run(repo);
  assert.equal(result.status, 1, result.out);
  for (const pattern of [/missing id/, /missing controls/, /agent entry needs basis/, /unknown field check/, /authority must name files, not a glob/, /unsupported glob syntax in paths/]) {
    assert.match(result.out, pattern);
  }
  assert.doesNotMatch(result.out, /missing-authority/);
  commit(repo, "docs(control): mapping item", { "control/index.yaml": "version: 1\nentries:\n  - id: x\n    checks:\n      - cmd: tests/a.spec.ts\n" });
  assert.match(run(repo).out, /^blocked\n.*sequence items must be scalars/);
  commit(repo, "docs(control): misindented key", { "control/index.yaml": "version: 1\nentries:\n  - id: x\n    checks: tests/a.spec.ts\n      basis: y\n" });
  assert.match(run(repo).out, /^blocked\n- control\/index\.yaml:5: unexpected indentation/);

  // A broken index in history is a finding with its commit, not a blocked range.
  const brokenBase = git(repo, "rev-parse", "HEAD~2");
  commit(repo, "docs(control): repair", { "control/index.yaml": index });
  result = run(repo, "--base", brokenBase);
  assert.equal(result.status, 1, result.out);
  assert.match(result.out, /cannot read the index at/);

  // Breaking the index together with code is judged by the readable side.
  git(repo, "reset", "-q", "--hard", staleBase);
  commit(repo, "fix: break index", { "control/index.yaml": "version: 1\nentries:\n  - id: x\n    controls: &a y\n", "src/other.ts": "export const b = 6;\n" });
  commit(repo, "docs(control): restore index", { "control/index.yaml": index });
  result = run(repo, "--base", staleBase);
  assert.match(result.out, /cannot read the index at/);
  assert.match(result.out, /\[mixed-commit\][^\n]*\n\s+control: control\/index\.yaml\n\s+other: src\/other\.ts/);

  // Accepted syntax: BOM, document start, CRLF, `|`, wrapped plain scalars,
  // directory refs, `*` / `**` / `?` globs, bracketed path names, empty entries.
  git(repo, "reset", "-q", "--hard", staleBase);
  const syntax = "﻿---\r\nversion: 1\r\nentries:\r\n  - id: routes\r\n    controls: 路由页面保持\r\n      现有入口\r\n    source: user\r\n    authority:\r\n      - docs\r\n      - \"app/[locale]/page.tsx\"\r\n    paths: [\"app/[locale]/*.tsx\", \"src/**/task.ts\", \"src/st?tes/\"]\r\n    checks: |\r\n      pnpm e2e\r\n";
  commit(repo, "docs(control): syntax", { "control/index.yaml": syntax, "app/[locale]/page.tsx": "x\n" });
  result = run(repo);
  assert.equal(result.status, 0, result.out);
  commit(repo, "docs(control): no entries", { "control/index.yaml": "version: 1\nentries: []\n" });
  assert.equal(run(repo).status, 0);
  commit(repo, "docs(control): glob miss", { "control/index.yaml": syntax.replace("src/**/task.ts", "src/*/x/task.ts") });
  assert.match(run(repo).out, /\[unmatched-path\] entry routes: src\/\*\/x\/task\.ts/);

  // Renaming a check file with code is mixed; a new acceptance file added with
  // its entry is Control by the after-index and may stand alone.
  git(repo, "reset", "-q", "--hard", staleBase);
  git(repo, "mv", "tests/acceptance/states.spec.ts", "tests/acceptance/task-states.spec.ts");
  commit(repo, "refactor: rename", { "src/other.ts": "export const w = 4;\n" });
  assert.match(run(repo, "--base", staleBase).out, /control: tests\/acceptance\/states\.spec\.ts\n\s+other: src\/other\.ts, tests\/acceptance\/task-states\.spec\.ts/);
  git(repo, "reset", "-q", "--hard", staleBase);
  commit(repo, "docs(control): new acceptance", {
    "control/index.yaml": index.replace('checks: []', 'checks: ["tests/acceptance/deploy.spec.ts"]'),
    "tests/acceptance/deploy.spec.ts": "test('one ingress')\n",
  });
  assert.equal(run(repo, "--base", staleBase).status, 0);
  commit(repo, "feat: ingress and its test", { "tests/acceptance/deploy.spec.ts": "test('one ingress v2')\n", "deploy/compose.yaml": "services: {gw: {}}\n" });
  assert.match(run(repo, "--base", staleBase).out, /\[mixed-commit\]/);

  // Merge commits are skipped; their parents are checked against the merge base.
  git(repo, "reset", "-q", "--hard", staleBase);
  git(repo, "checkout", "-q", "-b", "task");
  commit(repo, "fix: task work", { "src/other.ts": "export const t = 5;\n" });
  git(repo, "checkout", "-q", "main");
  commit(repo, "docs: upstream rules", { "docs/notes.md": "notes\n" });
  git(repo, "checkout", "-q", "task");
  git(repo, "merge", "-q", "--no-edit", "main");
  const mergeBase = git(repo, "merge-base", "HEAD", "main");
  assert.equal(run(repo, "--base", mergeBase).status, 0);
  git(repo, "checkout", "-q", "main");

  assert.equal(spawnSync(process.execPath, [lint, "--help"], { encoding: "utf8" }).status, 0);
  assert.equal(spawnSync(process.execPath, [lint, "--base"], { encoding: "utf8" }).status, 2);

  console.log("control lint contract passed");
} finally {
  rmSync(work, { recursive: true, force: true });
}
