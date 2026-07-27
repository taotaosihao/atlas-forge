"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  CommandError,
  appendLegacyRuntimeEvent,
  commandOptions,
  prepareTaskCommand,
  updateTaskCommand,
} = require("../core/command-runtime");
const { relativeToCodeHome, taskArtifactDir } = require("../core/paths");
const { timestampSeconds } = require("../task/runtime");
const { captureVerificationIdentity, sha256 } = require("./identity");
const {
  writeVerificationIdentityRecord,
  writeVerificationRecord,
} = require("./record");

const VERIFY_USAGE =
  "usage: codex-workflow verify <task-id> [--gate-class <id>] [--outcome passed|failed|blocked|skipped] [--trajectory reproduced|fixed|regressed|inconclusive|smoke-only] [--evaluator local-command|browser|human|multica-review|multica-e2e] [--failure-attribution code|test|env|data|dependency|missing-prereq|unknown] [--evidence <path-or-url>]... [--input <file>]... -- <command...>";
const VALID_OUTCOMES = new Set(["", "passed", "failed", "blocked", "skipped"]);
const VALID_TRAJECTORIES = new Set([
  "",
  "reproduced",
  "fixed",
  "regressed",
  "inconclusive",
  "smoke-only",
]);
const VALID_EVALUATORS = new Set([
  "",
  "local-command",
  "browser",
  "human",
  "multica-review",
  "multica-e2e",
]);
const VALID_FAILURE_ATTRIBUTIONS = new Set([
  "",
  "code",
  "test",
  "env",
  "data",
  "dependency",
  "missing-prereq",
  "unknown",
]);

function parseVerifyArgs(argv) {
  if (argv.length === 0) {
    throw new CommandError(VERIFY_USAGE);
  }
  const result = {
    command: [],
    evaluator: "",
    evidenceRefs: [],
    failureAttribution: "",
    gateClass: "general",
    inputPaths: [],
    outcome: "",
    taskId: argv[0],
    trajectory: "",
  };
  let commandStart = -1;
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") {
      commandStart = index + 1;
      break;
    }
    const namedFlags = {
      "--gate-class": "gateClass",
      "--outcome": "outcome",
      "--trajectory": "trajectory",
      "--evaluator": "evaluator",
      "--failure-attribution": "failureAttribution",
    };
    if (Object.hasOwn(namedFlags, argument)) {
      if (index + 1 >= argv.length) {
        throw new CommandError(VERIFY_USAGE);
      }
      result[namedFlags[argument]] = argv[++index];
    } else if (argument === "--evidence") {
      if (index + 1 >= argv.length) {
        throw new CommandError(VERIFY_USAGE);
      }
      result.evidenceRefs.push(argv[++index]);
    } else if (argument === "--input") {
      if (index + 1 >= argv.length) {
        throw new CommandError(VERIFY_USAGE);
      }
      result.inputPaths.push(argv[++index]);
    } else if (argument.startsWith("--gate-class=")) {
      result.gateClass = argument.slice("--gate-class=".length);
    } else if (argument.startsWith("--outcome=")) {
      result.outcome = argument.slice("--outcome=".length);
    } else if (argument.startsWith("--trajectory=")) {
      result.trajectory = argument.slice("--trajectory=".length);
    } else if (argument.startsWith("--evaluator=")) {
      result.evaluator = argument.slice("--evaluator=".length);
    } else if (argument.startsWith("--failure-attribution=")) {
      result.failureAttribution = argument.slice("--failure-attribution=".length);
    } else if (argument.startsWith("--evidence=")) {
      result.evidenceRefs.push(argument.slice("--evidence=".length));
    } else if (argument.startsWith("--input=")) {
      result.inputPaths.push(argument.slice("--input=".length));
    } else {
      throw new CommandError(VERIFY_USAGE);
    }
  }
  if (commandStart < 0 || commandStart >= argv.length) {
    throw new CommandError(VERIFY_USAGE);
  }
  result.command = argv.slice(commandStart);

  if (!/^[a-z0-9][a-z0-9-]*$/.test(result.gateClass)) {
    throw new CommandError(`invalid gate class: ${result.gateClass}`);
  }
  if (!VALID_OUTCOMES.has(result.outcome)) {
    throw new CommandError(`invalid outcome: ${result.outcome}`);
  }
  if (!VALID_TRAJECTORIES.has(result.trajectory)) {
    throw new CommandError(`invalid trajectory: ${result.trajectory}`);
  }
  if (!VALID_EVALUATORS.has(result.evaluator)) {
    throw new CommandError(`invalid evaluator: ${result.evaluator}`);
  }
  if (!VALID_FAILURE_ATTRIBUTIONS.has(result.failureAttribution)) {
    throw new CommandError(`invalid failure attribution: ${result.failureAttribution}`);
  }
  return result;
}

function bashQuote(value) {
  if (value === "") {
    return "''";
  }
  const safeAscii = /^[A-Za-z0-9_@%+=:./-]$/;
  if (!/[\n\r\t\x00-\x1f\x7f]/.test(value)) {
    return Array.from(value, (character, index) => {
      if (
        character.codePointAt(0) > 0x7f ||
        safeAscii.test(character) ||
        (index > 0 && (character === "#" || character === "~"))
      ) {
        return character;
      }
      return `\\${character}`;
    }).join("");
  }
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
  return `$'${escaped}'`;
}

function formatCommand(command) {
  return `${command.map(bashQuote).join(" ")} `;
}

function timestampToken(clock = () => new Date()) {
  const date = clock();
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) {
    throw new TypeError("clock must return a valid date");
  }
  const prefix = value.toISOString().slice(0, 19).replace(/[-:]/g, "");
  const milliseconds = String(value.getUTCMilliseconds()).padStart(3, "0");
  const subMilliseconds = String(process.hrtime.bigint() % 1_000_000n).padStart(6, "0");
  return `${prefix}${milliseconds}${subMilliseconds}`;
}

function commandExitCode(result, stderrFile) {
  if (Number.isInteger(result.status)) {
    return result.status;
  }
  if (result.signal && os.constants.signals[result.signal]) {
    return 128 + os.constants.signals[result.signal];
  }
  if (result.error && result.error.code === "ENOENT") {
    fs.appendFileSync(stderrFile, `${result.error.path}: command not found\n`, "utf8");
    return 127;
  }
  if (result.error && result.error.code === "EACCES") {
    fs.appendFileSync(stderrFile, `${result.error.path}: permission denied\n`, "utf8");
    return 126;
  }
  if (result.error) {
    fs.appendFileSync(stderrFile, `${result.error.message}\n`, "utf8");
  }
  return 1;
}

function runVerification(parsed, options = {}) {
  const { clock, cwd, environment, paths } = commandOptions(options);
  prepareTaskCommand(paths, parsed.taskId, clock);
  const captureIdentity = options.captureIdentity || captureVerificationIdentity;
  const before = captureIdentity({
    argv: parsed.command,
    cwd,
    environment,
    inputPaths: parsed.inputPaths || [],
  });
  const temporaryParent = options.temporaryParent || environment.TMPDIR || os.tmpdir();
  fs.mkdirSync(temporaryParent, { recursive: true });
  const temporaryDir = fs.mkdtempSync(path.join(temporaryParent, "codex-workflow-verify."));
  const stdoutFile = path.join(temporaryDir, "stdout");
  const stderrFile = path.join(temporaryDir, "stderr");
  fs.writeFileSync(stdoutFile, "", "utf8");
  fs.writeFileSync(stderrFile, "", "utf8");

  try {
    const stdoutDescriptor = fs.openSync(stdoutFile, "w");
    const stderrDescriptor = fs.openSync(stderrFile, "w");
    let child;
    try {
      child = spawnSync(parsed.command[0], parsed.command.slice(1), {
        cwd,
        env: environment,
        stdio: ["inherit", stdoutDescriptor, stderrDescriptor],
      });
    } finally {
      fs.closeSync(stdoutDescriptor);
      fs.closeSync(stderrDescriptor);
    }

    const exitCode = commandExitCode(child, stderrFile);
    const verdict = exitCode === 0 ? "passed" : "failed";
    const outcome = parsed.outcome || verdict;
    const evaluator = parsed.evaluator || "local-command";
    const commandText = formatCommand(parsed.command);
    const token = options.recordToken || timestampToken(clock);
    const createdAt = timestampSeconds(clock);
    const recordFile = path.join(
      taskArtifactDir(paths, parsed.taskId),
      "verification",
      `${token}.md`,
    );
    const identityFile = path.join(
      taskArtifactDir(paths, parsed.taskId),
      "verification",
      `${token}.json`,
    );
    const after = captureIdentity({
      argv: parsed.command,
      cwd,
      environment,
      inputPaths: parsed.inputPaths || [],
    });
    const snapshotStable = before.identityDigest === after.identityDigest;
    const identityRecord = writeVerificationIdentityRecord(identityFile, {
      schema_version: 2,
      task_id: parsed.taskId,
      created_at: createdAt,
      gate_class: parsed.gateClass || "general",
      verdict,
      outcome,
      provenance: "executed",
      identity: after.identity,
      identity_digest: after.identityDigest,
      pre_identity_digest: before.identityDigest,
      snapshot_stable: snapshotStable,
      result: {
        exit_code: exitCode,
        stdout_sha256: sha256(fs.readFileSync(stdoutFile)),
        stderr_sha256: sha256(fs.readFileSync(stderrFile)),
        evidence_refs: [...parsed.evidenceRefs],
      },
    });
    const identityReference = relativeToCodeHome(paths, identityFile);
    writeVerificationRecord({
      recordFile,
      recordType: "verification",
      taskId: parsed.taskId,
      commandText,
      cwd,
      exitCode,
      verdict,
      stdoutFile,
      stderrFile,
      createdAt,
      outcome,
      trajectory: parsed.trajectory,
      evaluator,
      failureAttribution: parsed.failureAttribution,
      evidenceRefs: parsed.evidenceRefs,
      identityRecord: identityReference,
      recordId: identityRecord.record_id,
      identityDigest: identityRecord.identity_digest,
      snapshotStable,
    });

    const verifiedAt = timestampSeconds(clock);
    updateTaskCommand(
      paths,
      parsed.taskId,
      { last_verified_at: verifiedAt },
      {
        last_verified_at: verifiedAt,
        "verification.last_record": relativeToCodeHome(paths, recordFile),
        "verification.last_identity_record": identityReference,
        "verification.last_exit_code": exitCode,
        "verification.outcome": outcome,
        "verification.trajectory": parsed.trajectory,
        "verification.evaluator": evaluator,
        "verification.failure_attribution": parsed.failureAttribution,
        "verification.identity_schema_version": 2,
        "verification.record_id": identityRecord.record_id,
        "verification.identity_digest": identityRecord.identity_digest,
        "verification.identity_stable": snapshotStable ? "__TRUE__" : "__FALSE__",
        "verification.evidence_refs":
          parsed.evidenceRefs.length > 0 ? parsed.evidenceRefs.join(" ") : "-",
      },
      clock,
    );
    appendLegacyRuntimeEvent(
      paths,
      parsed.taskId,
      "verify",
      `${commandText} => ${verdict}`,
      clock,
    );
    return {
      exitCode,
      lines: [
        `task_id: ${parsed.taskId}`,
        `record: ${recordFile}`,
        `verdict: ${verdict}`,
      ],
      identityFile,
      recordFile,
    };
  } finally {
    fs.rmSync(temporaryDir, { force: true, recursive: true });
  }
}

module.exports = {
  VERIFY_USAGE,
  bashQuote,
  formatCommand,
  parseVerifyArgs,
  runVerification,
  timestampToken,
};
