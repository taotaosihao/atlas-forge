"use strict";

const crypto = require("crypto");

const DESIGN_HANDOFF_CAPABILITY = "atlas-product-design-handoff-1";
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const AUTHORITY_REF = /^(user-message|operator-input):[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const TARGETS = new Set(["exploration", "product_increment", "product_release"]);
const DATA_PROFILES = new Set(["production", "authorized_test", "synthetic", "mixed"]);
const FILES = Object.freeze({
  context: "product-design/A-product-context.md",
  scenario: "product-design/C-critical-scenario.md",
  flow: "product-design/D-flow-design.md",
  handoff: "product-design/E-design-handoff.md",
});
const FRONTMATTER_KEYS = Object.freeze({
  context: [
    "designed_feature_target", "allowed_claims", "primary_user", "critical_transaction",
    "critical_object", "durable_outcome", "data_profile", "source_refs", "assumptions",
    "context_identity",
  ],
  scenario: ["status", "source_refs", "content_identity", "approval_ref"],
  flow: [
    "status", "context_ref", "scenario_ref", "approved_context_identity",
    "approved_scenario_identity", "approved_flow_identity", "source_refs", "approval_ref",
  ],
  handoff: [
    "status", "context_ref", "scenario_ref", "flow_ref", "context_identity",
    "scenario_identity", "flow_identity", "scenario_approval_ref", "flow_approval_ref",
  ],
});
const FLOW_HEADINGS = Object.freeze([
  "1. Flow mapping",
  "2. Capability truth",
  "3. Surface responsibility and low-fidelity structure",
  "4. Necessary states and recovery",
  "5. Formal content and data",
  "6. Minimum accessibility",
  "7. Acceptance and open questions",
]);

class DesignHandoffError extends Error {
  constructor(message) {
    super(message);
    this.name = "DesignHandoffError";
  }
}

function fail(message) {
  throw new DesignHandoffError(message);
}

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function unquote(value, label) {
  const text = value.trim();
  if (!text) return "";
  if (text.startsWith('"')) {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed !== "string") fail(`${label} must be a string`);
      return parsed;
    } catch (error) {
      if (error instanceof DesignHandoffError) throw error;
      fail(`${label} has invalid quoted text`);
    }
  }
  if (text.startsWith("'") && text.endsWith("'") && text.length >= 2) {
    return text.slice(1, -1).replace(/''/g, "'");
  }
  if (/[:\[\]{}#,>&*!|%@`]/.test(text[0]) || /[\r\n\t]/.test(text)) {
    fail(`${label} must be a plain or quoted single-line scalar`);
  }
  return text;
}

function parseInlineArray(value, label) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    fail(`${label} must use a JSON string array`);
  }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    fail(`${label} must use a JSON string array`);
  }
  return parsed;
}

function parseFrontmatter(text, label) {
  const normalized = String(text).replace(/\r\n?/g, "\n");
  if (!normalized.startsWith("---\n")) fail(`${label} must start with YAML frontmatter`);
  const end = normalized.indexOf("\n---\n", 4);
  if (end < 0) fail(`${label} frontmatter is not closed`);
  const lines = normalized.slice(4, end).split("\n");
  const fields = {};
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = /^([a-z][a-z0-9_]*):(?:[ \t]*(.*))$/.exec(line);
    if (!match) fail(`${label} has unsupported frontmatter syntax on line ${index + 2}`);
    const [, key, raw] = match;
    if (Object.hasOwn(fields, key)) fail(`${label} has duplicate frontmatter field ${key}`);
    if (raw.trim().startsWith("[")) {
      fields[key] = parseInlineArray(raw.trim(), `${label}.${key}`);
      continue;
    }
    if (!raw.trim() && /^ {2}- /.test(lines[index + 1] || "")) {
      const values = [];
      while (/^ {2}- /.test(lines[index + 1] || "")) {
        index += 1;
        values.push(unquote(lines[index].slice(4), `${label}.${key}`));
      }
      fields[key] = values;
      continue;
    }
    fields[key] = unquote(raw, `${label}.${key}`);
  }
  return { body: normalized.slice(end + 5), fields };
}

function exactFields(fields, expected, label) {
  for (const key of expected) {
    if (!Object.hasOwn(fields, key)) fail(`${label} is missing frontmatter field ${key}`);
  }
  for (const key of Object.keys(fields)) {
    if (!expected.includes(key)) fail(`${label} has unknown frontmatter field ${key}`);
  }
}

function requiredString(value, label) {
  if (typeof value !== "string" || !value.trim() || /[\r\n\t]/.test(value)) {
    fail(`${label} must be a non-empty single-line string`);
  }
  return value;
}

function stringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    fail(`${label} must be an array of non-empty strings`);
  }
  return value;
}

function identity(value, label) {
  if (!DIGEST.test(value || "")) fail(`${label} must use sha256:<64 lowercase hex>`);
  return value;
}

function approvalRef(value, label) {
  if (!AUTHORITY_REF.test(value || "")) {
    fail(`${label} must be a controller-recordable user-message: or operator-input: ref`);
  }
  return value;
}

function semanticBody(body) {
  const lines = String(body).replace(/\r\n?/g, "\n").split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""));
  while (lines.length > 0 && !lines[0].trim()) lines.shift();
  while (lines.length > 0 && !lines.at(-1).trim()) lines.pop();
  return `${lines.join("\n")}\n`;
}

function contextIdentity(fields) {
  return sha256(`${JSON.stringify({
    designed_feature_target: fields.designed_feature_target,
    allowed_claims: fields.allowed_claims,
    critical_object: fields.critical_object,
    data_profile: fields.data_profile,
  })}\n`);
}

function contentIdentity(body) {
  return sha256(semanticBody(body));
}

function h2Headings(body) {
  return semanticBody(body).split("\n").flatMap((line) => {
    const match = /^##[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
    return match ? [match[1]] : [];
  });
}

function section(body, heading) {
  const lines = semanticBody(body).split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start < 0) return "";
  const end = lines.findIndex((line, index) => index > start && /^##[ \t]+/.test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trim();
}

function noBlockingQuestions(flowBody) {
  const value = section(flowBody, "7. Acceptance and open questions");
  return /(?:^|\n)[ \t]*-[ \t]*(?:blocking open questions|阻塞性开放问题)[ \t]*[:：][ \t]*(?:none\.?|not_applicable|无[。.]?)[ \t]*(?:\n|$)/i.test(`\n${value}\n`);
}

function noBlockers(handoffBody) {
  const value = section(handoffBody, "Blockers")
    .replace(/^[-*][ \t]*/gm, "")
    .trim();
  return !value || /^(?:none\.?|not_applicable|not applicable|无[。.]?)$/i.test(value);
}

function validateArtifactEnvelope(artifacts) {
  if (!artifacts || typeof artifacts !== "object" || Array.isArray(artifacts)) {
    fail("Design Handoff artifacts must be an object");
  }
  for (const [name, relativePath] of Object.entries(FILES)) {
    const artifact = artifacts[name];
    if (!artifact || typeof artifact.text !== "string" || artifact.relative_path !== relativePath
      || !DIGEST.test(artifact.sha256 || "")) {
      fail(`Design Handoff ${name} artifact is missing or not at ${relativePath}`);
    }
  }
}

function validateDesignHandoffArtifacts({ artifacts, expectedTarget, taskId }) {
  requiredString(taskId, "Design Handoff task_id");
  if (!TARGETS.has(expectedTarget)) fail(`unsupported Design Handoff target: ${expectedTarget}`);
  validateArtifactEnvelope(artifacts);

  const documents = Object.fromEntries(Object.entries(artifacts).map(([name, artifact]) => {
    const parsed = parseFrontmatter(artifact.text, `Design Handoff ${name}`);
    exactFields(parsed.fields, FRONTMATTER_KEYS[name], `Design Handoff ${name}`);
    return [name, parsed];
  }));
  const context = documents.context.fields;
  const scenario = documents.scenario.fields;
  const flow = documents.flow.fields;
  const handoff = documents.handoff.fields;

  if (!TARGETS.has(context.designed_feature_target)
    || context.designed_feature_target !== expectedTarget) {
    fail("Design Handoff target does not match the executable delivery target");
  }
  stringArray(context.allowed_claims, "Design Handoff context.allowed_claims");
  requiredString(context.critical_object, "Design Handoff context.critical_object");
  if (!DATA_PROFILES.has(context.data_profile)) {
    fail("Design Handoff context.data_profile is invalid");
  }
  const contextId = contextIdentity(context);
  if (identity(context.context_identity, "Design Handoff context.context_identity") !== contextId) {
    fail("Design Handoff context identity does not match current A semantics");
  }

  const scenarioId = contentIdentity(documents.scenario.body);
  const flowId = contentIdentity(documents.flow.body);
  if (scenario.status !== "approved" || flow.status !== "approved" || handoff.status !== "approved") {
    fail("Design Handoff A/C/D/E is not fully approved");
  }
  if (identity(scenario.content_identity, "Design Handoff scenario.content_identity") !== scenarioId) {
    fail("Design Handoff scenario identity does not match current C semantics");
  }
  const scenarioApproval = approvalRef(scenario.approval_ref, "Design Handoff scenario.approval_ref");
  const flowApproval = approvalRef(flow.approval_ref, "Design Handoff flow.approval_ref");
  if (expectedTarget === "product_release" && !flowApproval.startsWith("user-message:")) {
    fail("product_release Flow Approval must be an explicit current-user message ref");
  }
  if (flow.context_ref !== "./A-product-context.md"
    || flow.scenario_ref !== "./C-critical-scenario.md"
    || handoff.context_ref !== "./A-product-context.md"
    || handoff.scenario_ref !== "./C-critical-scenario.md"
    || handoff.flow_ref !== "./D-flow-design.md") {
    fail("Design Handoff A/C/D/E references are not canonical");
  }
  if (JSON.stringify(h2Headings(documents.flow.body)) !== JSON.stringify(FLOW_HEADINGS)) {
    fail("Design Handoff flow must contain exactly the seven required H2 sections in order");
  }
  if (!noBlockingQuestions(documents.flow.body) || !noBlockers(documents.handoff.body)) {
    fail("Design Handoff contains a blocking open question or blocker");
  }
  if (identity(flow.approved_context_identity, "Design Handoff flow.approved_context_identity") !== contextId
    || identity(flow.approved_scenario_identity, "Design Handoff flow.approved_scenario_identity") !== scenarioId
    || identity(flow.approved_flow_identity, "Design Handoff flow.approved_flow_identity") !== flowId
    || identity(handoff.context_identity, "Design Handoff handoff.context_identity") !== contextId
    || identity(handoff.scenario_identity, "Design Handoff handoff.scenario_identity") !== scenarioId
    || identity(handoff.flow_identity, "Design Handoff handoff.flow_identity") !== flowId
    || handoff.scenario_approval_ref !== scenarioApproval
    || handoff.flow_approval_ref !== flowApproval) {
    fail("Design Handoff E or approved D identities differ from current A/C/D approval");
  }

  return {
    status: "approved",
    task_id: taskId,
    designed_feature_target: expectedTarget,
    context_path: FILES.context,
    context_sha256: artifacts.context.sha256,
    context_identity: contextId,
    scenario_path: FILES.scenario,
    scenario_sha256: artifacts.scenario.sha256,
    scenario_identity: scenarioId,
    scenario_approval_ref: scenarioApproval,
    flow_path: FILES.flow,
    flow_sha256: artifacts.flow.sha256,
    flow_identity: flowId,
    flow_approval_ref: flowApproval,
    handoff_path: FILES.handoff,
    handoff_sha256: artifacts.handoff.sha256,
  };
}

module.exports = {
  DESIGN_HANDOFF_CAPABILITY,
  DESIGN_HANDOFF_FILES: FILES,
  DesignHandoffError,
  contentIdentity,
  contextIdentity,
  semanticBody,
  validateDesignHandoffArtifacts,
};
