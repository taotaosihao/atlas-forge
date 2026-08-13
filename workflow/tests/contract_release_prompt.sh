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
const invariant = "Release-readiness invariant: only a Team execution-vnext product_release whose immutable Profile final sweep binds one unchanged candidate and yields the completion-derived release_decision.status=certified may be called source-level release-ready; it never proves or authorizes installation, push, deployment, publication, or actual release. Task/slice/agent/review completion, passing tests, screenshots, Business Acceptance, design approval, or MVP/Beta labels never grant release-ready status.";

const skillFiles = {
  task: ["plugins", "atlas-workflow", "skills", "task", "SKILL.md"],
  clarify: ["plugins", "atlas-workflow", "skills", "clarify", "SKILL.md"],
  design: ["plugins", "atlas-workflow", "skills", "design-review", "SKILL.md"],
  team: ["plugins", "atlas-workflow", "skills", "team", "SKILL.md"],
  business: ["plugins", "atlas-workflow", "skills", "team", "references", "business-acceptance.md"],
  sdd: ["plugins", "atlas-workflow", "skills", "team", "references", "sdd.md"],
};
const text = Object.fromEntries(Object.entries(skillFiles).map(([name, parts]) => [name, read(...parts)]));
const implementationTemplates = [
  read("workflow", "templates", "implementation-contract.md"),
  read("workflow", "templates", "implementation-contract.final.md"),
];

for (const name of ["task", "clarify", "design", "team"]) {
  assert.ok(text[name].includes(invariant), `${name} must carry the shared release invariant`);
  assert.doesNotMatch(text[name], /may be called (?:formally|actually) released/i);
}

for (const name of ["task", "clarify", "team"]) {
  assert.match(text[name], /MVP.*Beta/s, `${name} must preserve the stage-quality floor`);
  assert.match(text[name], /pure Web UI/, `${name} must state the v1 surface boundary`);
  assert.match(text[name], /exact `web_ui` \+ `api` \+ `worker` \+ `database` \+ `external_integration` combination/, `${name} must state the exact integrated authoring boundary`);
  assert.match(text[name], /public CLI does not register its trusted producer/, `${name} must preserve the integrated producer dependency`);
  assert.match(text[name], /API-only, worker-only, CLI, different mixed combinations, and unknown/, `${name} must reject unsupported product surfaces`);
  assert.match(text[name], /fail (?:authoring\/admission|before release admission)/, `${name} must keep unsupported surfaces out of release admission`);
  assert.match(text[name], /without inventing a completion `release_decision`/, `${name} must not fabricate an unsupported-surface decision record`);
}

for (const name of ["task", "clarify", "team"]) {
  assert.match(text[name], /product_increment/, `${name} must expose the quick product route`);
  assert.match(text[name], /formal (?:release )?certification|release-ready|certified/, `${name} must require explicit formal intent for product_release`);
}
assert.match(text.task, /证据采集：降级/);
assert.match(text.task, /failed, was not run, or has an unknown result still blocks/);
assert.match(text.task, /staffing_mode/);
assert.match(text.task, /path lease from actual write-conflict risk/);
assert.match(text.task, /must omit release-intent, v4, immutable Profile/);
assert.match(text.task, /do not initialize workflow merely to log it/);
assert.match(text.task, /promotion to a usable product increment requires fresh `product_increment` authoring/);
assert.match(text.clarify, /Team just to obtain Saving Mode/);
assert.match(text.clarify, /For the default[\s\S]*`product_increment` path[\s\S]*do not create a[\s\S]*workflow task/);
assert.match(text.team, /does not enter execution-vnext or acquire a durable/);
assert.match(text.team, /Main-only single writers.*no lease requirement/s);
assert.match(text.team, /release_mode=product_increment/);

assert.match(text.task, /route its execution and certification through Team execution-vnext/);
assert.match(text.task, /Direct Task work may implement or verify only a contributing, non-certification scope; it must not close the product-release goal/);
assert.match(text.task, /When no decision exists, keep `release_decision` absent and report the readiness assessment as `cannot_verify`/);
assert.match(text.task, /target_delivery_authority_ref.*controller-recordable `user-message:` or `operator-input:`/s);
assert.match(text.task, /project-phase-report <task-id> <phase-id>/);
assert.match(text.clarify, /semantics v6/);
assert.match(text.clarify, /execution-plan schema version 4/);
assert.match(text.clarify, /terminal release-certification slice/);
assert.match(text.clarify, /whenever an authorized `product_release` target reaches execution or certification/);
assert.match(text.clarify, /Planning or review that directly authors or gates a named externally usable candidate retains `product_release`/);
assert.match(text.task, /planning or review that directly authors or gates a named externally usable candidate retains `product_release`/);
assert.match(text.team, /Planning or review that directly authors or gates a named externally usable candidate retains `product_release`/);
assert.match(text.team, /recomputes typed facts from raw inputs/);
assert.match(text.team, /missing workflow-bound producer provenance makes the fact `cannot_verify`/);
assert.match(text.team, /target_delivery_authority_ref.*controller-recordable `user-message:` or `operator-input:`/s);
assert.match(text.team, /project-phase-report <task-id> <phase-id>/);
assert.match(text.team, /Release-bearing `execution-vnext` admission and completion require the hash-bound `work_type=implementation`/);
assert.match(text.team, /Never convert an inadmissible sweep into a derived `cannot_verify` decision/);
assert.match(text.design, /only the four typed formal Web UI facts/);
assert.match(text.design, /do not write `certified`/);
assert.match(text.design, /scaffolded contract and verdict remain the generic fidelity record/);
assert.match(text.design, /never replace or reinterpret the generic verdict as release evidence/);
assert.match(text.business, /real integration path/);
assert.match(text.business, /only the Profile-bound `critical-journey` fact/);
assert.match(text.business, /conditional, blocked, missing, ambiguous, simulator-only, or unresolved evidence maps to `cannot_verify`/);
assert.match(text.business, /Content addressing alone does not establish that provenance/);
assert.match(text.sdd, /terminal release-certification slice/);
assert.match(text.sdd, /They never author `release_decision`/);
assert.match(text.sdd, /Each passing fact requires workflow-bound producer provenance/);

for (const template of implementationTemplates) {
  assert.match(template, /"target_delivery_authority_ref": "user-message:<message-id>"/);
  assert.match(template, /`goal:` and `current-required:` remain valid authoring references but are not resolvable release-execution authority for either Profile/);
  assert.match(template, /schema version 2, Profile `integrated-app-v1`/);
  assert.match(template, /project all 12 immutable requirements exactly once/);
}

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
assert.equal(anchors.length, 15);
assert.equal(new Set(anchors.map(({ case_id }) => case_id)).size, anchors.length);

for (const anchor of anchors) {
  assert.deepEqual(Object.keys(anchor).sort(), ["case_id", "oracle", "scenario_input"]);
  assert.deepEqual(Object.keys(anchor.oracle).sort(), [
    "expected_profile", "expected_release_decision", "must_not_pass_reason",
    "release_readiness_assessment", "target_delivery_class", "team_route",
  ]);
  assert.ok(!Object.hasOwn(anchor.scenario_input, "target_delivery_class"), `${anchor.case_id} input must hide classification`);
  assert.ok(!Object.hasOwn(anchor.scenario_input, "expected_release_decision"), `${anchor.case_id} input must hide decision`);
  assert.ok(anchor.scenario_input.request.length >= 40, `${anchor.case_id} needs a substantive forward prompt`);
  assert.ok(anchor.oracle.must_not_pass_reason.length >= 20, `${anchor.case_id} needs a substantive guard reason`);
}

assert.ok(anchors.some(({ scenario_input, oracle }) => (
  scenario_input.activity === "planning" && oracle.target_delivery_class === "product_release"
)));
assert.ok(anchors.some(({ scenario_input, oracle }) => (
  scenario_input.activity === "planning"
  && oracle.expected_profile === "integrated-app-v1"
  && scenario_input.target_facts.surface_kinds.join(",")
    === "web_ui,api,worker,database,external_integration"
  && oracle.expected_release_decision === null
)));
for (const [caseId, namedExternal] of [
  ["internal-mvp-product-increment", false],
  ["small-beta-product-increment", true],
]) {
  const anchor = anchors.find(({ case_id }) => case_id === caseId);
  assert.ok(anchor, `${caseId} positive quick-path anchor is required`);
  assert.equal(anchor.oracle.target_delivery_class, "product_increment");
  assert.equal(anchor.oracle.expected_release_decision, null);
  assert.equal(anchor.oracle.team_route, "not_required_for_current_work");
  assert.equal(anchor.scenario_input.target_facts.named_external_candidate, namedExternal);
  assert.match(anchor.scenario_input.request, /MVP|Beta/);
}
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

printf 'contract_release_prompt_structure: ok\n'
printf 'note: structural prompt contract and hidden-oracle corpus checked; natural-language model behavior was not executed\n'
