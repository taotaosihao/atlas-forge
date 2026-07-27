"use strict";

const fs = require("fs");
const path = require("path");
const { atomicWriteJson } = require("../core/atomic-file");
const { digestCanonical } = require("./identity");

function outputPreview(file) {
  if (!fs.existsSync(file)) {
    return "";
  }
  const text = fs.readFileSync(file, "utf8");
  const allLines = text.split(/\r\n|\n|\r/);
  if (allLines.at(-1) === "") {
    allLines.pop();
  }
  const lines = allLines.slice(0, 80);
  if (allLines.length > 80) {
    lines.push(`... (${allLines.length - 80} more lines omitted)`);
  }
  let content = lines.join("\n");
  if (content.length > 6000) {
    content = `${content.slice(0, 6000).trimEnd()}\n... (output truncated)`;
  }
  return content;
}

function recordTitle(recordType) {
  return `${recordType.slice(0, 1).toUpperCase()}${recordType.slice(1).toLowerCase()}`;
}

function renderVerificationRecord(record) {
  const metadata = [];
  if (record.outcome) {
    metadata.push(`- outcome: ${record.outcome}`);
  }
  if (record.trajectory) {
    metadata.push(`- trajectory: ${record.trajectory}`);
  }
  if (record.evaluator) {
    metadata.push(`- evaluator: ${record.evaluator}`);
  }
  if (record.failureAttribution) {
    metadata.push(`- failure_attribution: ${record.failureAttribution}`);
  }
  if (record.identityRecord) {
    metadata.push(`- identity_record: \`${record.identityRecord}\``);
  }
  if (record.recordId) {
    metadata.push(`- record_id: ${record.recordId}`);
  }
  if (record.identityDigest) {
    metadata.push(`- identity_digest: ${record.identityDigest}`);
  }
  if (record.snapshotStable !== undefined) {
    metadata.push(`- snapshot_stable: ${record.snapshotStable}`);
  }
  if (record.evidenceRefs.length > 0) {
    metadata.push("", "## Evidence Refs", "");
    metadata.push(...record.evidenceRefs.map((item) => `- \`${item}\``));
  }

  return [
    `# ${recordTitle(record.recordType)} Record`,
    "",
    `- task_id: ${record.taskId}`,
    `- created_at: ${record.createdAt}`,
    `- cwd: \`${record.cwd}\``,
    `- exit_code: ${record.exitCode}`,
    `- verdict: ${record.verdict}`,
    ...metadata,
    "",
    "## Command",
    "",
    "```bash",
    record.commandText,
    "```",
    "",
    "## Stdout",
    "",
    "```text",
    outputPreview(record.stdoutFile),
    "```",
    "",
    "## Stderr",
    "",
    "```text",
    outputPreview(record.stderrFile),
    "```",
    "",
  ].join("\n");
}

function writeVerificationRecord(record) {
  const content = renderVerificationRecord({
    evidenceRefs: [],
    failureAttribution: "",
    outcome: "",
    trajectory: "",
    evaluator: "",
    ...record,
  });
  fs.mkdirSync(path.dirname(record.recordFile), { recursive: true });
  fs.writeFileSync(record.recordFile, content, "utf8");
  return record.recordFile;
}

function writeVerificationIdentityRecord(recordFile, record) {
  const withoutId = { ...record };
  delete withoutId.record_id;
  const value = { ...withoutId, record_id: digestCanonical(withoutId) };
  atomicWriteJson(recordFile, value);
  return value;
}

module.exports = {
  outputPreview,
  renderVerificationRecord,
  writeVerificationIdentityRecord,
  writeVerificationRecord,
};
