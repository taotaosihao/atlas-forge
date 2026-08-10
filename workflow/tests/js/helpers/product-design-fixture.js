"use strict";

const fs = require("fs");
const path = require("path");

function writeApprovedDesignHandoff({ pluginRoot, target, taskRoot }) {
  const { contentIdentity, contextIdentity } = require(path.join(
    pluginRoot,
    "contracts/product-design/validators/design-handoff.js",
  ));
  const directory = path.join(taskRoot, "product-design");
  fs.mkdirSync(directory, { recursive: true });
  const context = {
    designed_feature_target: target,
    allowed_claims: ["The governed primary flow is operable on the admitted candidate."],
    critical_object: "governed release candidate",
    data_profile: "synthetic",
  };
  const contextId = contextIdentity(context);
  const contextText = [
    "---",
    `designed_feature_target: ${target}`,
    `allowed_claims: ${JSON.stringify(context.allowed_claims)}`,
    'primary_user: "release operator"',
    'critical_transaction: "complete the primary flow"',
    `critical_object: "${context.critical_object}"`,
    'durable_outcome: "the result remains visible after refresh"',
    `data_profile: ${context.data_profile}`,
    "source_refs: []",
    "assumptions: []",
    `context_identity: "${contextId}"`,
    "---",
    "",
    "# Product Context",
    "",
    "## User and business outcome",
    "",
    "The operator completes the governed primary flow and sees its durable result.",
    "",
  ].join("\n");
  const scenarioBody = [
    "# Critical Scenario",
    "",
    "## 1. Critical transaction and business goal",
    "Complete the primary flow and preserve the result.",
    "## 2. Primary user and real context",
    "A release operator on the served candidate.",
    "## 3. Trigger, Hope, Worry",
    "The operator needs a truthful result without synthetic-document substitution.",
    "## 4. Primary device or environment",
    "Desktop browser against the served application.",
    "## 5. Natural entry",
    "Open the declared browser entrypoint.",
    "## 6. User success and business success",
    "The result is visible and remains after refresh.",
    "## 7. Shortest path to a durable outcome",
    "Open, complete, save, and observe the durable result.",
    "## 8. Refresh or re-entry and one failure recovery",
    "Refresh preserves the result; a failed save offers an explicit retry.",
    "",
  ].join("\n");
  const scenarioId = contentIdentity(scenarioBody);
  const scenarioText = [
    "---",
    "status: approved",
    "source_refs: []",
    `content_identity: "${scenarioId}"`,
    'approval_ref: "user-message:scenario-approval"',
    "---",
    "",
    scenarioBody,
  ].join("\n");
  const flowBody = [
    "# Flow Design",
    "",
    "## 1. Flow mapping",
    "Open, act, save, confirm, and refresh.",
    "## 2. Capability truth",
    "The primary action persists one governed result.",
    "## 3. Surface responsibility and low-fidelity structure",
    "The served page owns the entry, action, feedback, and retry.",
    "## 4. Necessary states and recovery",
    "Default, success, and save-error with retry are required.",
    "## 5. Formal content and data",
    "Synthetic fixture data is visibly isolated from production claims.",
    "## 6. Minimum accessibility",
    "The primary action is named, keyboard reachable, and visibly focused.",
    "## 7. Acceptance and open questions",
    "- Open the served entrypoint and complete the primary flow.",
    "- Refresh and confirm the durable result.",
    "- Trigger a failed save and recover with retry.",
    "- Blocking open questions: none",
    "",
  ].join("\n");
  const flowId = contentIdentity(flowBody);
  const flowText = [
    "---",
    "status: approved",
    "context_ref: ./A-product-context.md",
    "scenario_ref: ./C-critical-scenario.md",
    `approved_context_identity: "${contextId}"`,
    `approved_scenario_identity: "${scenarioId}"`,
    `approved_flow_identity: "${flowId}"`,
    "source_refs: []",
    'approval_ref: "user-message:release"',
    "---",
    "",
    flowBody,
  ].join("\n");
  const handoffText = [
    "---",
    "status: approved",
    "context_ref: ./A-product-context.md",
    "scenario_ref: ./C-critical-scenario.md",
    "flow_ref: ./D-flow-design.md",
    `context_identity: "${contextId}"`,
    `scenario_identity: "${scenarioId}"`,
    `flow_identity: "${flowId}"`,
    'scenario_approval_ref: "user-message:scenario-approval"',
    'flow_approval_ref: "user-message:release"',
    "---",
    "",
    "# Design Handoff",
    "",
    "## References and current approval state",
    "A, C, and D are current and approved.",
    "## Designed feature target and allowed claims",
    `The target is ${target} with the finite claim from A.`,
    "## Mandatory behavior and non-goals",
    "The primary save and recovery flow are mandatory.",
    "## Visible acceptance",
    "Complete, refresh, and recover the served flow.",
    "## Data mode and browser entrypoint",
    "Synthetic fixture data through the real served document.",
    "## Blockers",
    "None.",
    "## Risk route and reason",
    "Use the governed release route because the target is formally certified.",
    "",
  ].join("\n");
  for (const [file, text] of [
    ["A-product-context.md", contextText],
    ["C-critical-scenario.md", scenarioText],
    ["D-flow-design.md", flowText],
    ["E-design-handoff.md", handoffText],
  ]) fs.writeFileSync(path.join(directory, file), text);
  return directory;
}

module.exports = { writeApprovedDesignHandoff };
