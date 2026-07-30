#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

node - "$ROOT" <<'NODE'
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = process.argv[2];
const rel = (...parts) => path.join(root, ...parts);
const read = (...parts) => fs.readFileSync(rel(...parts), "utf8");
const invariant = "Release-readiness invariant: only a Team execution-v3 product_release whose immutable Profile final sweep binds one unchanged candidate and yields the completion-derived release_decision.status=certified may be called source-level release-ready; it never proves or authorizes installation, push, deployment, publication, or actual release. Task/slice/agent/review completion, passing tests, screenshots, Business Acceptance, design approval, or MVP/Beta labels never grant release-ready status.";

const skillFiles = {
  task: ["plugins", "atlas-workflow", "skills", "task", "SKILL.md"],
  clarify: ["plugins", "atlas-workflow", "skills", "clarify", "SKILL.md"],
  design: ["plugins", "atlas-workflow", "skills", "design-review", "SKILL.md"],
  team: ["plugins", "atlas-workflow", "skills", "team", "SKILL.md"],
  business: ["plugins", "atlas-workflow", "skills", "team", "references", "business-acceptance.md"],
  sdd: ["plugins", "atlas-workflow", "skills", "team", "references", "sdd.md"],
};
const text = Object.fromEntries(Object.entries(skillFiles).map(([name, parts]) => [name, read(...parts)]));

for (const name of ["task", "clarify", "design", "team"]) {
  assert.ok(text[name].includes(invariant), `${name} must carry the shared release invariant`);
  assert.doesNotMatch(text[name], /may be called (?:formally|actually) released/i);
}

for (const name of ["task", "clarify", "team"]) {
  assert.match(text[name], /MVP.*Beta/s, `${name} must preserve the stage-quality floor`);
  assert.match(text[name], /pure Web UI/, `${name} must state the v1 surface boundary`);
  assert.match(text[name], /API, CLI, worker, mixed, and unknown/, `${name} must reject unsupported product surfaces`);
  assert.match(text[name], /fail (?:authoring\/admission|before release admission)/, `${name} must keep unsupported surfaces out of release admission`);
  assert.match(text[name], /without inventing a completion `release_decision`/, `${name} must not fabricate an unsupported-surface decision record`);
}

assert.match(text.task, /route its execution and certification through Team execution-v3/);
assert.match(text.task, /Direct Task work may implement or verify only a contributing, non-certification scope; it must not close the product-release goal/);
assert.match(text.task, /When no decision exists, keep `release_decision` absent and report the readiness assessment as `cannot_verify`/);
assert.match(text.clarify, /semantics v4/);
assert.match(text.clarify, /execution-plan schema version 2/);
assert.match(text.clarify, /terminal release-certification slice/);
assert.match(text.clarify, /whenever an authorized `product_release` target reaches execution or certification/);
assert.match(text.clarify, /Planning or review that directly authors or gates a named externally usable candidate retains `product_release`/);
assert.match(text.task, /planning or review that directly authors or gates a named externally usable candidate retains `product_release`/);
assert.match(text.team, /Planning or review that directly authors or gates a named externally usable candidate retains `product_release`/);
assert.match(text.team, /recomputes typed facts from raw inputs/);
assert.match(text.team, /Agents, reviewers, verifiers, arbitrary successful commands.*cannot create or overwrite `release_decision`/s);
assert.match(text.team, /release-bearing `execution-v3` admission and completion require the hash-bound `work_type=implementation`/);
assert.match(text.team, /Never convert an inadmissible sweep into a derived `cannot_verify` decision/);
assert.match(text.design, /only the four typed formal Web UI facts/);
assert.match(text.design, /do not write `certified`/);
assert.match(text.design, /scaffolded contract and verdict remain the generic fidelity record/);
assert.match(text.design, /never replace or reinterpret the generic verdict as release evidence/);
assert.match(text.business, /real integration path/);
assert.match(text.business, /only the Profile-bound `critical-journey` fact/);
assert.match(text.business, /conditional, blocked, missing, ambiguous, simulator-only, or unresolved evidence maps to `cannot_verify`/);
assert.match(text.sdd, /terminal release-certification slice/);
assert.match(text.sdd, /They never author `release_decision`/);

const profileDimensions = [
  "capability-truth",
  "critical-journey",
  "surface-states",
  "formal-content-ia",
  "production-data",
  "accessibility-quality",
  "security-operability",
];
for (const name of ["task", "clarify", "team"]) {
  assert.deepEqual(
    profileDimensions.filter((dimension) => text[name].includes(`\`${dimension}\``)),
    [],
    `${name} must reference the immutable Profile instead of copying its dimensions`,
  );
}

const anchors = JSON.parse(read("test", "fixtures", "implementation-contract", "release-certification", "anchors.json"));
assert.equal(anchors.length, 12);
assert.equal(new Set(anchors.map(({ case_id }) => case_id)).size, anchors.length);

function deriveTarget(input) {
  const signals = [
    input.target_facts.named_external_candidate,
    input.target_facts.explicit_exploration_only,
    input.target_facts.standalone_non_product_deliverable,
  ];
  assert.equal(signals.filter(Boolean).length, 1, "each scenario must have one target signal");
  if (input.target_facts.explicit_exploration_only) return "exploration";
  if (input.target_facts.named_external_candidate) return "product_release";
  return "non_product";
}

function deriveProfile(input, target) {
  return target === "product_release"
    && input.target_facts.surface_kinds.length === 1
    && input.target_facts.surface_kinds[0] === "web_ui"
    ? "web-ui-v1"
    : null;
}

function deriveTeamRoute(input, target, profile) {
  if (target === "product_release" && profile === null) return "blocked_before_admission";
  if (input.execution_facts.authority === "team_execution_v3") return "already_bound";
  if (target === "product_release" && input.activity === "implementation") return "required";
  return "not_required_for_current_work";
}

function deriveDecision(input, target, profile) {
  const execution = input.execution_facts;
  assert.ok(["completion_evaluator", "reporting_role"].includes(input.evaluation_actor));
  if (input.evaluation_actor === "reporting_role") {
    assert.notEqual(execution.final_sweep, "admissible", "a reporting role cannot derive an admissible-sweep decision");
    return null;
  }
  if (target !== "product_release" || profile === null
    || execution.authority !== "team_execution_v3" || execution.final_sweep !== "admissible") {
    return null;
  }
  assert.equal(execution.final_sweep_fact_outcomes.length, 7, "an admissible web-ui-v1 sweep has seven facts");
  if (execution.final_sweep_fact_outcomes.includes("failed")) return "denied";
  if (execution.final_sweep_fact_outcomes.includes("cannot_verify")) return "cannot_verify";
  assert.ok(execution.final_sweep_fact_outcomes.every((outcome) => outcome === "passed"));
  return "certified";
}

function deriveAssessment(input, target, profile, decision) {
  if (target !== "product_release") return "not_applicable";
  if (profile === null) return "cannot_verify";
  if (decision === "certified") return "source_release_ready";
  if (decision === "denied" || input.execution_facts.observed_fact_outcomes.includes("failed")) {
    return "not_release_ready";
  }
  return "cannot_verify";
}

for (const anchor of anchors) {
  assert.deepEqual(Object.keys(anchor).sort(), ["case_id", "oracle", "scenario_input"]);
  assert.ok(!Object.hasOwn(anchor.scenario_input, "target_delivery_class"), `${anchor.case_id} input must hide classification`);
  assert.ok(!Object.hasOwn(anchor.scenario_input, "expected_release_decision"), `${anchor.case_id} input must hide decision`);
  assert.ok(anchor.scenario_input.request.length >= 40, `${anchor.case_id} needs a substantive forward prompt`);
  assert.ok(anchor.oracle.must_not_pass_reason.length >= 20, `${anchor.case_id} needs a substantive guard reason`);
  const target = deriveTarget(anchor.scenario_input);
  const profile = deriveProfile(anchor.scenario_input, target);
  const route = deriveTeamRoute(anchor.scenario_input, target, profile);
  const decision = deriveDecision(anchor.scenario_input, target, profile);
  const assessment = deriveAssessment(anchor.scenario_input, target, profile, decision);
  assert.equal(target, anchor.oracle.target_delivery_class, `${anchor.case_id} target class`);
  assert.equal(profile, anchor.oracle.expected_profile, `${anchor.case_id} Profile`);
  assert.equal(route, anchor.oracle.team_route, `${anchor.case_id} Team route`);
  assert.equal(decision, anchor.oracle.expected_release_decision, `${anchor.case_id} release decision`);
  assert.equal(assessment, anchor.oracle.release_readiness_assessment, `${anchor.case_id} readiness assessment`);
}

assert.ok(anchors.some(({ scenario_input, oracle }) => (
  scenario_input.activity === "planning" && oracle.target_delivery_class === "product_release"
)));
assert.ok(anchors.some(({ scenario_input, oracle }) => (
  scenario_input.activity === "review" && oracle.target_delivery_class === "product_release"
)));
assert.ok(anchors.some(({ oracle }) => oracle.target_delivery_class === "non_product"));
assert.ok(anchors.some(({ oracle }) => oracle.expected_release_decision === "certified"));
assert.ok(anchors.some(({ case_id, oracle }) => (
  case_id === "candidate-drift" && oracle.expected_release_decision === null
)));
assert.ok(anchors.some(({ case_id, oracle }) => (
  case_id === "direct-product-implementation" && oracle.expected_release_decision === null
)));
assert.ok(anchors.some(({ scenario_input, oracle }) => (
  scenario_input.target_facts.surface_kinds.includes("api")
  && oracle.release_readiness_assessment === "cannot_verify"
  && oracle.expected_release_decision === null
)));
NODE

printf 'contract_release_prompt: ok\n'
