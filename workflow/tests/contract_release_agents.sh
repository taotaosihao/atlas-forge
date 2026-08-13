#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

node - "$ROOT" <<'NODE'
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = process.argv[2];
const roles = ["planner", "implementer", "reviewer", "phase-reviewer", "verifier", "browser-verifier"];
const shared = "Only Team execution-vnext completion-derived release_decision.status=certified is source-level release-readiness certification authority; this role cannot grant, author, overwrite, or infer it, and it never proves or authorizes installation, push, deployment, publication, or actual release.";
const contents = new Map();

for (const role of roles) {
  const file = path.join(root, ".codex", "agents", `atlas-sdd-${role}.toml`);
  const value = fs.readFileSync(file, "utf8");
  contents.set(role, value);
  assert.ok(value.includes(shared), `${role} must carry the release authority boundary`);
  assert.match(value, /Preserve denied\/cannot_verify exactly/);
  assert.doesNotMatch(value, /may be called (?:formally|actually) released/i);
}

assert.match(contents.get("planner"), /semantics-v6 release intent/);
assert.match(contents.get("planner"), /execution-plan schema version 4/);
assert.match(contents.get("planner"), /terminal same-candidate certification slice/);
assert.match(contents.get("implementer"), /do not manufacture facts, receipts, or controller state/);
assert.match(contents.get("reviewer"), /put any missing proof in cannot_verify_from_diff/);
assert.match(contents.get("reviewer"), /never translate APPROVED/);
assert.match(contents.get("phase-reviewer"), /terminal-sweep dependency closure/);
assert.match(contents.get("phase-reviewer"), /formal plan or contract review/);
assert.match(contents.get("verifier"), /arbitrary successful command, cached result, or mismatched candidate/);
assert.match(contents.get("browser-verifier"), /screenshots, a happy path, or visual judgment alone do not prove formal release readiness/);

for (const role of roles) {
  const value = contents.get(role);
  assert.doesNotMatch(value, /this role (?:certifies|grants certification|sets release_decision)/i);
}
NODE

printf 'contract_release_agents: ok\n'
