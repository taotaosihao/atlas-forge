"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  CommandError,
  commandOptions,
} = require("../core/command-runtime");
const { readAuthoritativeEvents } = require("../core/event-store");
const { mutateTaskRuntime, taskEventFile } = require("../core/task-mutation");
const { relativeToCodeHome, taskArtifactDir } = require("../core/paths");
const {
  parseTaskHeader,
  renderTaskFields,
  requireOpenExecutionTask,
  requireTaskFile,
  validateTaskFile,
} = require("../task/repository");
const {
  ensureTaskRuntimeScaffold,
  projectTaskState,
  readJsonObject,
  taskStateFile,
  timestampSeconds,
} = require("../task/runtime");
const { captureVerificationIdentity, sha256 } = require("./identity");
const { validateReleaseProducerProvenance } = require("./release-provenance");
const {
  buildVerificationIdentityRecord,
  renderVerificationRecord,
} = require("./record");
const { bindRequiredCheck } = require("./required-gates");

const VERIFY_USAGE =
  "usage: codex-workflow verify <task-id> [--brief <brief.json> --slice-id <id> --check-id <id>] [--gate-class <id>] [--outcome passed|failed|blocked|skipped] [--trajectory reproduced|fixed|regressed|inconclusive|smoke-only] [--evaluator local-command|browser|human|multica-review|multica-e2e] [--failure-attribution code|test|env|data|dependency|missing-prereq|unknown] [--evidence <path-or-url>]... [--input <file>]... -- <command...>";
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
    briefPath: "",
    checkId: "",
    command: [],
    evaluator: "",
    evidenceRefs: [],
    failureAttribution: "",
    gateClass: "general",
    gateClassProvided: false,
    inputPaths: [],
    outcome: "",
    sliceId: "",
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
      "--brief": "briefPath",
      "--check-id": "checkId",
      "--gate-class": "gateClass",
      "--outcome": "outcome",
      "--trajectory": "trajectory",
      "--evaluator": "evaluator",
      "--failure-attribution": "failureAttribution",
      "--slice-id": "sliceId",
    };
    if (Object.hasOwn(namedFlags, argument)) {
      if (index + 1 >= argv.length) {
        throw new CommandError(VERIFY_USAGE);
      }
      result[namedFlags[argument]] = argv[++index];
      if (argument === "--gate-class") result.gateClassProvided = true;
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
    } else if (argument.startsWith("--brief=")) {
      result.briefPath = argument.slice("--brief=".length);
    } else if (argument.startsWith("--check-id=")) {
      result.checkId = argument.slice("--check-id=".length);
    } else if (argument.startsWith("--gate-class=")) {
      result.gateClass = argument.slice("--gate-class=".length);
      result.gateClassProvided = true;
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
    } else if (argument.startsWith("--slice-id=")) {
      result.sliceId = argument.slice("--slice-id=".length);
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
  for (const [label, value] of [["check id", result.checkId], ["slice id", result.sliceId]]) {
    if (value && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
      throw new CommandError(`invalid ${label}: ${value}`);
    }
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
  const observedEvents = readAuthoritativeEvents(taskEventFile(paths, parsed.taskId), parsed.taskId);
  const latest = observedEvents.at(-1);
  const observedRevision = observedEvents.at(-1)?.revision || 0;
  let latestState;
  let latestTask;
  let taskTitle;
  if (latest) {
    latestState = latest.projection.state;
    const fields = parseTaskHeader(latest.projection.task_content);
    latestTask = { status: fields.status?.[0] || "" };
    taskTitle = fields.title?.[0] || parsed.taskId;
  } else {
    const taskFile = requireTaskFile(paths.tasksDir, parsed.taskId);
    const { task } = validateTaskFile(taskFile);
    latestTask = task;
    latestState = readJsonObject(taskStateFile(paths, parsed.taskId));
    taskTitle = task.title;
  }
  requireOpenExecutionTask(latestTask, "verify");
  ensureTaskRuntimeScaffold(paths, parsed.taskId, taskTitle);
  const commandText = formatCommand(parsed.command).trimEnd();
  const requiredGate = bindRequiredCheck({
    commandText,
    cwd,
    parsed,
    paths,
    state: latestState,
  });
  const gateClass = requiredGate?.gate_class || parsed.gateClass || "general";
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
    const renderedCommandText = `${commandText} `;
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
    const completedRequiredGate = requiredGate ? {
      ...requiredGate,
      candidate_tree_oid: after.identity.worktree.tree_oid,
    } : null;
    let producerProvenance = null;
    // This callback is an in-process trust boundary. The public CLI never resolves it from
    // arguments, environment, stdout, or raw evidence; production producers must be registered here.
    if (exitCode === 0 && snapshotStable && completedRequiredGate?.release_requirement
      && typeof options.resolveReleaseProducer === "function") {
      producerProvenance = options.resolveReleaseProducer({
        command: [...parsed.command],
        cwd,
        identity: after.identity,
        requiredGate: JSON.parse(JSON.stringify(completedRequiredGate)),
        stderrFile,
        stdoutFile,
        taskId: parsed.taskId,
      });
      const provenanceErrors = validateReleaseProducerProvenance(producerProvenance, {
        identity: after.identity,
        requirementRef: completedRequiredGate.release_requirement.requirement_ref,
      });
      if (provenanceErrors.length > 0) {
        throw new CommandError(`release producer resolver returned invalid provenance: ${provenanceErrors.join("; ")}`);
      }
    }
    const identityRecord = buildVerificationIdentityRecord({
      schema_version: requiredGate ? 3 : 2,
      task_id: parsed.taskId,
      created_at: createdAt,
      gate_class: gateClass,
      verdict,
      outcome,
      provenance: requiredGate ? "fresh-executed" : "executed",
      ...(completedRequiredGate ? { required_gate: completedRequiredGate } : {}),
      identity: after.identity,
      identity_digest: after.identityDigest,
      pre_identity_digest: before.identityDigest,
      snapshot_stable: snapshotStable,
      result: {
        exit_code: exitCode,
        stdout_sha256: sha256(fs.readFileSync(stdoutFile)),
        stderr_sha256: sha256(fs.readFileSync(stderrFile)),
        evidence_refs: [...parsed.evidenceRefs],
        ...(producerProvenance ? { producer_provenance: producerProvenance } : {}),
      },
    });
    const identityReference = relativeToCodeHome(paths, identityFile);
    const recordContent = renderVerificationRecord({
      recordFile,
      recordType: "verification",
      taskId: parsed.taskId,
      commandText: renderedCommandText,
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
    const stateFields = {
      last_record: relativeToCodeHome(paths, recordFile),
      last_identity_record: identityReference,
      last_exit_code: exitCode,
      outcome,
      trajectory: parsed.trajectory,
      evaluator,
      failure_attribution: parsed.failureAttribution,
      identity_schema_version: requiredGate ? 3 : 2,
      record_id: identityRecord.record_id,
      identity_digest: identityRecord.identity_digest,
      identity_stable: snapshotStable,
      evidence_refs: parsed.evidenceRefs.length > 0 ? parsed.evidenceRefs.join(" ") : "-",
    };
    mutateTaskRuntime(
      paths,
      parsed.taskId,
      {
        kind: "verification.recorded",
        operationId: options.operationId,
        data: {
          record_id: identityRecord.record_id,
          identity_digest: identityRecord.identity_digest,
          observed_revision: observedRevision,
          required_gate: completedRequiredGate,
          verdict,
          outcome,
        },
      },
      ({ revision }) => {
        const currentFile = requireTaskFile(paths.tasksDir, parsed.taskId);
        const { task } = validateTaskFile(currentFile);
        requireOpenExecutionTask(task, "verify");
        const taskContent = renderTaskFields(fs.readFileSync(currentFile, "utf8"), {
          last_verified_at: verifiedAt,
        });
        const state = projectTaskState(
          paths,
          parsed.taskId,
          taskContent,
          readJsonObject(taskStateFile(paths, parsed.taskId)),
          clock,
        );
        state.last_verified_at = verifiedAt;
        state.verification = {
          ...(state.verification || {}),
          ...stateFields,
        };
        if (completedRequiredGate) {
          state.verification.schema_version = 3;
          state.verification.required_gates = {
            ...(state.verification.required_gates || {}),
            [completedRequiredGate.check_id]: {
              ...completedRequiredGate,
              completed_at: verifiedAt,
              event_revision: revision + 1,
              identity_digest: identityRecord.identity_digest,
              identity_record: identityReference,
              outcome,
              provenance: "fresh-executed",
              record_digest: identityRecord.record_id,
              record_id: identityRecord.record_id,
            },
          };
        }
        return {
          projection: {
            task_content: taskContent,
            state,
            files: [
              {
                path: `verification/${token}.md`,
                content_base64: Buffer.from(recordContent).toString("base64"),
              },
              {
                path: `verification/${token}.json`,
                content_base64: Buffer.from(`${JSON.stringify(identityRecord, null, 2)}\n`)
                  .toString("base64"),
              },
            ],
          },
          legacy: [{ kind: "verify", detail: `${renderedCommandText} => ${verdict}` }],
        };
      },
      {
        clock,
        environment,
        expectedRevision: observedRevision,
        failAfterEventAppend: options.failAfterEventAppend,
        failBeforeEventAppend: options.failBeforeEventAppend,
      },
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
