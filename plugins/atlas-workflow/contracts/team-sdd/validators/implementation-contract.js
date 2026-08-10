"use strict";

const { ID_PATTERN } = require("./common");
const { validateExecutionPlan } = require("./execution-plan");
const {
  extractReleaseIntent,
} = require("../../release-certification/validators/release-intent");

const SUPPORTED_CONTRACT_SEMANTICS = Object.freeze([1, 2, 3, 4, 5, 6]);
const PLANNED_CONTRACT_SEMANTICS = Object.freeze([3, 4, 5, 6]);
const NEW_AUTHORING_CONTRACT_SEMANTICS = Object.freeze([5, 6]);
const WORK_TYPES = new Set(["implementation", "planning", "review", "audit", "docs-only"]);
const ENVELOPE_FIELDS = new Set(["task_id", "contract_semantics_version", "work_type"]);

function fenceOpening(line) {
  const match = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  return match ? { marker: match[1][0], length: match[1].length } : null;
}

function fenceCloses(line, fence) {
  const match = /^[ \t]{0,3}(`+|~+)[ \t]*$/.exec(line);
  return Boolean(match && match[1][0] === fence.marker && match[1].length >= fence.length);
}

function stripHtmlComments(line, inComment) {
  let visible = "";
  let cursor = 0;
  let comment = inComment;
  while (cursor < line.length) {
    if (comment) {
      const end = line.indexOf("-->", cursor);
      if (end === -1) return { visible, inComment: true };
      comment = false;
      cursor = end + 3;
      continue;
    }
    const start = line.indexOf("<!--", cursor);
    if (start === -1) {
      visible += line.slice(cursor);
      break;
    }
    visible += line.slice(cursor, start);
    comment = true;
    cursor = start + 4;
  }
  return { visible, inComment: comment };
}

function parseEnvelope(markdown) {
  const fields = new Map();
  const lines = String(markdown).split(/\r?\n/);
  let fence = null;
  let htmlComment = false;
  let sectionSeen = false;
  let h1Seen = false;
  let previousVisibleLine = "";

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    if (fence) {
      if (fenceCloses(rawLine, fence)) fence = null;
      previousVisibleLine = "";
      continue;
    }
    const stripped = stripHtmlComments(rawLine, htmlComment);
    htmlComment = stripped.inComment;
    const line = stripped.visible;
    const opening = fenceOpening(line);
    if (opening) {
      fence = opening;
      previousVisibleLine = "";
      continue;
    }
    if (/^ {0,3}-{2,}[ \t]*$/.test(line) && previousVisibleLine.trim()) sectionSeen = true;
    const heading = /^ {0,3}(#{1,6})(?:[ \t]+.*)?$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      if (level >= 2 || (level === 1 && h1Seen)) sectionSeen = true;
      if (level === 1) h1Seen = true;
    }
    previousVisibleLine = line;

    const match = /^([a-z][a-z0-9_]*):[ \t]*(.*)$/.exec(line);
    if (!match || !ENVELOPE_FIELDS.has(match[1])) continue;
    if (sectionSeen) throw new Error(`${match[1]} must be top-level before any H2-H6 section`);
    if (fields.has(match[1])) throw new Error(`duplicate ${match[1]} field`);
    fields.set(match[1], { line: index + 1, value: match[2].trim() });
  }
  return fields;
}

function parseContractSemanticsVersion(markdown, { allowUnversioned = true } = {}) {
  const fields = parseEnvelope(markdown);
  const field = fields.get("contract_semantics_version");
  if (!field) {
    if (allowUnversioned) return 1;
    throw new Error("contract_semantics_version is required");
  }
  if (!/^[1-9][0-9]*$/.test(field.value)) {
    throw new Error(`invalid contract_semantics_version: ${field.value || "<empty>"}`);
  }
  const version = Number(field.value);
  if (!SUPPORTED_CONTRACT_SEMANTICS.includes(version)) {
    throw new Error(`unsupported contract_semantics_version: ${field.value}`);
  }
  return version;
}

function parseExecutionPlanBlock(markdown) {
  const pattern = /^```atlas-execution-plan\+json[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm;
  const matches = [...String(markdown).matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error(`expected exactly one atlas-execution-plan+json fenced block, found ${matches.length}`);
  }
  try {
    return JSON.parse(matches[0][1]);
  } catch (error) {
    throw new Error(`invalid execution plan JSON: ${error.message}`);
  }
}

function releaseIntentBlockCount(markdown) {
  const pattern = /^```atlas-release-intent\+json[ \t]*\r?\n[\s\S]*?\r?\n```[ \t]*$/gm;
  return [...String(markdown).matchAll(pattern)].length;
}

function parseImplementationContract(markdown) {
  const executionPlan = parseExecutionPlanBlock(markdown);
  const fields = parseEnvelope(markdown);
  const semanticsVersion = parseContractSemanticsVersion(markdown, { allowUnversioned: false });
  if (!PLANNED_CONTRACT_SEMANTICS.includes(semanticsVersion)) {
    throw new Error(`contract semantics version ${semanticsVersion} does not carry a canonical execution plan`);
  }
  const taskId = fields.get("task_id")?.value || "";
  if (!ID_PATTERN.test(taskId)) throw new Error("task_id must be a safe identifier");

  const declaredWorkType = fields.get("work_type")?.value || "";
  if (declaredWorkType && !WORK_TYPES.has(declaredWorkType)) {
    throw new Error(`unsupported work_type: ${declaredWorkType}`);
  }
  if (new Set([4, 6]).has(semanticsVersion) && !declaredWorkType) {
    throw new Error(`semantics-v${semanticsVersion} requires work_type`);
  }
  if (semanticsVersion === 6 && declaredWorkType !== "implementation") {
    throw new Error("semantics-v6 requires work_type: implementation");
  }

  const releaseBlocks = releaseIntentBlockCount(markdown);
  let releaseIntent = null;
  if (new Set([4, 6]).has(semanticsVersion)) {
    releaseIntent = extractReleaseIntent(markdown);
  } else if (releaseBlocks !== 0) {
    throw new Error(`semantics-v${semanticsVersion} cannot carry atlas-release-intent+json`);
  }
  if (semanticsVersion === 6 && releaseIntent.target_delivery_class !== "product_release") {
    throw new Error("semantics-v6 requires target_delivery_class: product_release");
  }

  const errors = validateExecutionPlan(executionPlan, {
    contractSemanticsVersion: semanticsVersion,
    releaseIntent,
  });
  if (errors.length > 0) throw new Error(errors.join("; "));

  return {
    declaredWorkType,
    executionPlan,
    releaseIntent,
    semanticsVersion,
    taskId,
    workType: new Set([4, 6]).has(semanticsVersion) ? declaredWorkType : "",
  };
}

module.exports = {
  NEW_AUTHORING_CONTRACT_SEMANTICS,
  PLANNED_CONTRACT_SEMANTICS,
  SUPPORTED_CONTRACT_SEMANTICS,
  parseContractSemanticsVersion,
  parseImplementationContract,
};
