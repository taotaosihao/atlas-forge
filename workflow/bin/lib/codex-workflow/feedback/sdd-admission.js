"use strict";

const fs = require("fs");
const path = require("path");
const { taskArtifactDir } = require("../core/paths");

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function pluginCandidates(environment, paths) {
  return [
    environment.ATLAS_WORKFLOW_PLUGIN_ROOT,
    path.join(paths.codeHome, "plugins", "atlas-workflow"),
    path.join(path.resolve(__dirname, "../../../../.."), "plugins", "atlas-workflow"),
  ].filter(Boolean);
}

function loadCanonicalContracts(environment, paths) {
  for (const root of pluginCandidates(environment, paths)) {
    const controllerFile = path.join(
      root,
      "contracts/team-sdd/validators/controller-resolution.js",
    );
    const verdictFile = path.join(root, "contracts/team-sdd/validators/review-verdict.js");
    if (fs.existsSync(controllerFile) && fs.existsSync(verdictFile)) {
      return {
        ...require(controllerFile),
        ...require(verdictFile),
      };
    }
  }
  return null;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function notAdmitted(reason) {
  return { admitted: false, status: "not-admitted", reason };
}

function evaluateSddAdmission(values, options) {
  if (values.source !== "sdd-review") {
    return notAdmitted("non-sdd-source-default");
  }
  const locator = values.admissionLocator;
  if (
    !locator
    || !locator.sliceId
    || !locator.findingId
    || !locator.verdictDigest
    || !locator.goalRef
  ) {
    return notAdmitted("missing-sdd-admission-locator");
  }
  if (!SAFE_ID.test(locator.sliceId) || !SAFE_ID.test(locator.findingId)) {
    return notAdmitted("invalid-sdd-admission-identity");
  }
  const contracts = loadCanonicalContracts(options.environment, options.paths);
  if (!contracts) {
    return notAdmitted("canonical-sdd-validator-unavailable");
  }
  const sliceDir = path.join(
    taskArtifactDir(options.paths, values.taskId),
    "team",
    "sdd",
    "slices",
    locator.sliceId,
  );
  const briefFile = path.join(sliceDir, "brief.json");
  const verdictFile = path.join(sliceDir, "review-verdict.json");
  const resolutionFile = path.join(sliceDir, "controller-resolution.json");
  if (![briefFile, verdictFile, resolutionFile].every((file) => fs.existsSync(file))) {
    return notAdmitted("missing-sdd-admission-artifact");
  }
  try {
    const brief = readJson(briefFile);
    const verdict = readJson(verdictFile);
    const resolution = readJson(resolutionFile);
    if (
      [brief, verdict, resolution].some((document) => (
        document.task_id !== values.taskId || document.slice_id !== locator.sliceId
      ))
    ) {
      return notAdmitted("cross-task-or-slice-artifact");
    }
    const verdictErrors = contracts.validateReviewVerdict(verdict);
    if (verdict.schema_version !== 2 || verdictErrors.length > 0) {
      return notAdmitted("invalid-sdd-review-verdict");
    }
    const verdictDigest = contracts.digestFile(verdictFile);
    const goalRef = contracts.computeGoalRef(brief, sliceDir);
    if (locator.verdictDigest !== verdictDigest) {
      return notAdmitted("stale-or-wrong-verdict-digest");
    }
    if (locator.goalRef !== goalRef) {
      return notAdmitted("stale-or-wrong-goal-ref");
    }
    const resolutionErrors = contracts.validateControllerResolutionAgainst(resolution, {
      verdict,
      brief,
      verdictDigest,
      goalRef,
      sliceDir,
    });
    if (resolutionErrors.length > 0) {
      return notAdmitted("invalid-controller-resolution");
    }
    const record = resolution.records.find((item) => item.finding_id === locator.findingId);
    if (!record) {
      return notAdmitted("finding-not-covered-by-admission");
    }
    if (record.disposition !== "current-required" || record.repair_status !== "open") {
      return notAdmitted("admission-not-current-required-open");
    }
    return {
      admitted: true,
      status: "current-required-open",
      reason: `validated:${locator.sliceId}:${locator.findingId}`,
    };
  } catch (_error) {
    return notAdmitted("unreadable-sdd-admission-artifact");
  }
}

module.exports = { evaluateSddAdmission, loadCanonicalContracts };
