"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  CommandError,
  commandOptions,
} = require("../core/command-runtime");
const { canonicalJson, readAuthoritativeEvents } = require("../core/event-store");
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
const {
  captureVerificationIdentity,
  captureVerificationOutput,
  readCapturedFile,
  resolveVerificationOutputs,
  sha256,
} = require("./identity");
const { validateReleaseProducerProvenance } = require("./release-provenance");
const {
  buildVerificationIdentityRecord,
  renderVerificationRecord,
} = require("./record");
const { bindRequiredCheck } = require("./required-gates");
const {
  assertActiveExecutionGrant,
  authorityReplayPostcondition,
} = require("../team/execution-grant");
const { assertCanonicalGrantArtifacts } = require("../team/scope-artifacts");

const VERIFY_USAGE =
  "usage: codex-workflow verify <task-id> [--brief <brief.json> --slice-id <id> --check-id <id>] [--gate-class <id>] [--outcome passed|failed|blocked|skipped] [--trajectory reproduced|fixed|regressed|inconclusive|smoke-only] [--evaluator local-command|browser|human|multica-review|multica-e2e] [--failure-attribution code|test|env|data|dependency|missing-prereq|unknown] [--evidence <path-or-url>]... [--input <file>]... [--output <file>]... -- <command...>";
const VERIFY_RESOLVE_USAGE =
  "usage: codex-workflow verify-resolve <task-id> --operation-id <new-id> --pending-operation-id <id> --claim-operation-id <id> --authority-ref <user-message:ref|operator-input:ref> --reason <single-line> --evidence <task-artifact-relative-file> [--evidence <file>]...";
const SAFE_OPERATION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const CONTROLLER_AUTHORITY_REF =
  /^(user-message|operator-input):[A-Za-z0-9][A-Za-z0-9._:-]*$/;
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
    outputPaths: [],
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
    } else if (argument === "--output") {
      if (index + 1 >= argv.length) {
        throw new CommandError(VERIFY_USAGE);
      }
      result.outputPaths.push(argv[++index]);
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
    } else if (argument.startsWith("--output=")) {
      result.outputPaths.push(argument.slice("--output=".length));
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

function parseVerifyResolveArgs(argv) {
  if (argv.length === 0) throw new CommandError(VERIFY_RESOLVE_USAGE);
  const parsed = {
    taskId: argv[0],
    operationId: "",
    pendingOperationId: "",
    claimOperationId: "",
    authorityRef: "",
    reason: "",
    evidenceRefs: [],
  };
  const flags = {
    "--operation-id": "operationId",
    "--pending-operation-id": "pendingOperationId",
    "--claim-operation-id": "claimOperationId",
    "--authority-ref": "authorityRef",
    "--reason": "reason",
  };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    let flag = argument;
    let value;
    const separator = argument.indexOf("=");
    if (separator !== -1) {
      flag = argument.slice(0, separator);
      value = argument.slice(separator + 1);
    }
    if (flag === "--evidence") {
      if (value === undefined) value = argv[++index];
      if (value === undefined || value === "") throw new CommandError(VERIFY_RESOLVE_USAGE);
      parsed.evidenceRefs.push(value);
      continue;
    }
    const field = flags[flag];
    if (!field) throw new CommandError(`unknown verify-resolve option: ${argument}`);
    if (value === undefined) value = argv[++index];
    if (value === undefined || value === "") throw new CommandError(VERIFY_RESOLVE_USAGE);
    parsed[field] = value;
  }
  for (const field of ["operationId", "pendingOperationId", "claimOperationId"]) {
    if (!SAFE_OPERATION_ID.test(parsed[field])) {
      throw new CommandError(`invalid verify-resolve ${field}: ${parsed[field] || "missing"}`);
    }
  }
  if (parsed.operationId === parsed.pendingOperationId
    || parsed.operationId === parsed.claimOperationId) {
    throw new CommandError("verify-resolve requires a new operation id");
  }
  if (!CONTROLLER_AUTHORITY_REF.test(parsed.authorityRef)) {
    throw new CommandError(
      "verify-resolve requires a controller-recordable user-message: or operator-input: ref",
    );
  }
  if (!parsed.reason.trim() || /[\r\n\t]/.test(parsed.reason)) {
    throw new CommandError("verify-resolve reason must be a single non-empty line");
  }
  if (parsed.evidenceRefs.length === 0) {
    throw new CommandError("verify-resolve requires canonical task-artifact evidence");
  }
  return parsed;
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

function verificationAuthorityIdentity(requiredGate) {
  if (!requiredGate) return null;
  return {
    grant_id: requiredGate.grant_id,
    scope_digest: requiredGate.scope_digest,
    evidence_epoch: requiredGate.evidence_epoch,
    slice_id: requiredGate.slice_id,
    brief_sha256: requiredGate.brief_sha256,
    contract_sha256: requiredGate.contract_sha256,
    execution_plan_sha256: requiredGate.execution_plan_sha256,
    admission_head_sha: requiredGate.admission_head_sha,
    admission_tree_oid: requiredGate.admission_tree_oid,
    repo_realpath: requiredGate.repo_realpath,
  };
}

function verificationExecutionTarget(parsed, cwd, declaredOutputs) {
  const cwdRealpath = fs.realpathSync(cwd);
  const inputPaths = [...new Set((parsed.inputPaths || [])
    .map((input) => path.resolve(cwdRealpath, input)))].sort();
  const outputPaths = [...new Set(declaredOutputs.map((output) => output.path))].sort();
  return {
    schema_version: 1,
    task_id: parsed.taskId,
    cwd_realpath: cwdRealpath,
    command: [...parsed.command],
    input_paths: inputPaths,
    output_paths: outputPaths,
  };
}

function requiredCheckBinding(requiredGate) {
  if (!requiredGate) return null;
  return {
    schema_version: 1,
    check_id: requiredGate.check_id,
    slice_id: requiredGate.slice_id,
    gate_class: requiredGate.gate_class,
    command_digest: requiredGate.command_digest,
  };
}

function capturedJsonSnapshot(entry, label) {
  try {
    const { bytes } = readCapturedFile(entry, label);
    const value = JSON.parse(bytes.toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return {
      entry: JSON.parse(JSON.stringify(entry)),
      content_base64: bytes.toString("base64"),
      value,
    };
  } catch {
    return null;
  }
}

function releaseEvidenceSnapshot(requiredGate, identity, outputs, producerProvenance) {
  const requirement = requiredGate?.release_requirement;
  if (!requirement) return null;
  const facts = outputs.map((entry) => capturedJsonSnapshot(entry, "release fact output"))
    .filter((snapshot) => (
    snapshot?.value?.schema_version === 1 && snapshot.value.fact_id
      && snapshot.value.policy_binding?.requirement_ref === requirement.requirement_ref
    ));
  const fact = facts.length === 1 ? facts[0] : null;
  const manifests = (identity.inputs || [])
    .map((entry) => capturedJsonSnapshot(entry, "release candidate input"))
    .filter((snapshot) => [1, 2].includes(snapshot?.value?.schema_version)
      && snapshot.value.manifest_digest === fact?.value?.candidate_manifest_digest);
  return {
    schema_version: 1,
    requirement_ref: requirement.requirement_ref,
    fact: fact ? { entry: fact.entry, content_base64: fact.content_base64 } : null,
    candidate_manifest: manifests.length === 1 ? {
      entry: manifests[0].entry,
      content_base64: manifests[0].content_base64,
    } : null,
    producer_provenance: producerProvenance || null,
  };
}

function verificationClaimIdentity(parsed, cwd, declaredOutputs, requiredGate, operationId) {
  const executionTarget = verificationExecutionTarget(parsed, cwd, declaredOutputs);
  const request = {
    schema_version: 1,
    task_id: parsed.taskId,
    cwd_realpath: fs.realpathSync(cwd),
    command: [...parsed.command],
    brief_path: parsed.briefPath ? path.resolve(parsed.briefPath) : "",
    slice_id: parsed.sliceId,
    check_id: parsed.checkId,
    gate_class: parsed.gateClass,
    gate_class_provided: Boolean(parsed.gateClassProvided),
    outcome: parsed.outcome,
    trajectory: parsed.trajectory,
    evaluator: parsed.evaluator,
    failure_attribution: parsed.failureAttribution,
    evidence_refs: [...parsed.evidenceRefs],
    input_paths: (parsed.inputPaths || []).map((input) => path.resolve(cwd, input)),
    output_paths: declaredOutputs.map((output) => output.path),
  };
  return {
    schema_version: 2,
    claim_kind: "verification-command",
    task_id: parsed.taskId,
    operation_id: operationId,
    claim_operation_id: `${operationId}-verification-claim`,
    terminal_operation_id: operationId,
    request_digest: sha256(canonicalJson(request)),
    execution_fingerprint: sha256(canonicalJson(executionTarget)),
    execution_target: executionTarget,
    required_check_binding: requiredCheckBinding(requiredGate),
    authority_identity: verificationAuthorityIdentity(requiredGate),
  };
}

function durableVerificationClaimIdentity(claim) {
  const identity = { ...claim };
  delete identity.status;
  delete identity.claimed_at;
  delete identity.terminal_at;
  delete identity.resolved_at;
  delete identity.resolution;
  delete identity.tombstone;
  delete identity.result;
  return identity;
}

function sameVerificationClaimIdentity(left, right) {
  return canonicalJson(durableVerificationClaimIdentity(left)) === canonicalJson(right);
}

function verificationAuthorityBoundary(authorityIdentity) {
  if (!authorityIdentity) {
    return {
      schema_version: 1,
      kind: "direct-unbound",
    };
  }
  return {
    schema_version: 1,
    kind: "execution-grant",
    grant_id: authorityIdentity.grant_id,
    scope_digest: authorityIdentity.scope_digest,
    evidence_epoch: authorityIdentity.evidence_epoch,
    slice_id: authorityIdentity.slice_id,
  };
}

function verificationIndeterminateTombstone(claim) {
  const derived = {
    schema_version: 1,
    request_digest: claim.request_digest,
    execution_fingerprint: claim.execution_fingerprint || "",
    authority_boundary: verificationAuthorityBoundary(claim.authority_identity || null),
    required_check_binding: claim.required_check_binding || null,
  };
  if (!claim.tombstone) return derived;
  if (canonicalJson(claim.tombstone) !== canonicalJson(derived)) {
    throw new CommandError(
      `verification indeterminate tombstone is inconsistent: ${claim.operation_id}`,
    );
  }
  return derived;
}

function sameVerificationTombstoneBoundary(claim, identity) {
  if (claim.status !== "indeterminate") return false;
  const tombstone = verificationIndeterminateTombstone(claim);
  const sameExecution = tombstone.execution_fingerprint
    ? tombstone.execution_fingerprint === identity.execution_fingerprint
    : tombstone.request_digest === identity.request_digest;
  return sameExecution
    && canonicalJson(tombstone.authority_boundary)
      === canonicalJson(verificationAuthorityBoundary(identity.authority_identity || null));
}

function sameVerificationExecutionBoundary(claim, identity) {
  const sameExecution = claim.execution_fingerprint
    ? claim.execution_fingerprint === identity.execution_fingerprint
    : claim.request_digest === identity.request_digest;
  return sameExecution
    && canonicalJson(verificationAuthorityBoundary(claim.authority_identity || null))
      === canonicalJson(verificationAuthorityBoundary(identity.authority_identity || null));
}

function indeterminateVerificationMessage(claim) {
  const boundary = verificationIndeterminateTombstone(claim).authority_boundary;
  const identity = boundary.kind === "direct-unbound"
    ? "the stable direct/unbound authority boundary"
    : `grant=${boundary.grant_id}, scope=${boundary.scope_digest}, ` +
      `evidence_epoch=${boundary.evidence_epoch}, slice=${boundary.slice_id}`;
  return `verification request is durably indeterminate for ${identity}; ` +
    `source_operation_id=${claim.operation_id} ` +
    `source_claim_operation_id=${claim.claim_operation_id}. ` +
    "It cannot run again under the same authority identity; use a new operation id only " +
    "after an explicit replan establishes a new authority identity/evidence epoch";
}

function assertNoIndeterminateVerificationTombstone(claims, identity) {
  const sameOperation = claims.find((claim) => claim.operation_id === identity.operation_id);
  if (sameOperation?.status === "indeterminate") {
    if (!sameVerificationClaimIdentity(sameOperation, identity)) {
      throw new CommandError(`operation_id replay payload conflict: ${identity.operation_id}`);
    }
    throw new CommandError(indeterminateVerificationMessage(sameOperation));
  }
  const sameRequest = claims.find((claim) => (
    sameVerificationTombstoneBoundary(claim, identity)
  ));
  if (sameRequest) {
    throw new CommandError(indeterminateVerificationMessage(sameRequest));
  }
}

function assertCurrentBoundVerification({
  clock,
  commandText,
  cwd,
  environment,
  expectedGate,
  parsed,
  paths,
  state,
}) {
  if (!expectedGate) return null;
  const rebound = bindRequiredCheck({ clock, commandText, cwd, parsed, paths, state });
  const expected = Object.hasOwn(expectedGate, "candidate_tree_oid")
    ? { ...rebound, candidate_tree_oid: expectedGate.candidate_tree_oid }
    : rebound;
  if (canonicalJson(expected) !== canonicalJson(expectedGate)) {
    throw new CommandError(
      "verification grant, brief, contract, or required check changed before event append",
    );
  }
  const grant = assertActiveExecutionGrant(state, {
    evidenceEpoch: expectedGate.evidence_epoch,
    grantId: expectedGate.grant_id,
    scopeDigest: expectedGate.scope_digest,
    sliceId: expectedGate.slice_id,
  }, { clock, requireUnexpired: true });
  assertCanonicalGrantArtifacts({
    briefPath: parsed.briefPath,
    environment,
    grant,
    paths,
    taskId: parsed.taskId,
  });
  return grant;
}

function assertCurrentVerificationClaimAuthority(state, authorityIdentity) {
  if (!authorityIdentity) return null;
  return assertActiveExecutionGrant(state, {
    evidenceEpoch: authorityIdentity.evidence_epoch,
    grantId: authorityIdentity.grant_id,
    scopeDigest: authorityIdentity.scope_digest,
    sliceId: authorityIdentity.slice_id,
  });
}

function verificationTerminalReplayPostcondition(authorityIdentity, clock) {
  if (!authorityIdentity) return null;
  return () => null;
}

function pendingVerificationRecoveryMessage(taskId, claim) {
  return `pending_operation_id=${claim.operation_id} ` +
    `claim_operation_id=${claim.claim_operation_id}; resolve with: ` +
    `codex-workflow verify-resolve ${taskId} --operation-id=<new-id> ` +
    `--pending-operation-id=${claim.operation_id} ` +
    `--claim-operation-id=${claim.claim_operation_id} ` +
    "--authority-ref=<user-message:...|operator-input:...> " +
    "--reason=<single-line> --evidence=<task-artifact-relative-file>";
}

function canonicalResolutionEvidenceRefs(paths, taskId, refs, { requireFiles = true } = {}) {
  const normalized = refs.map((reference) => {
    if (typeof reference !== "string" || !reference || reference.includes("\\")
      || path.isAbsolute(reference)) {
      throw new CommandError(
        `verify-resolve evidence must be a task-artifact-relative path: ${reference}`,
      );
    }
    const canonical = path.posix.normalize(reference);
    if (canonical === "." || canonical === ".." || canonical.startsWith("../")
      || canonical !== reference) {
      throw new CommandError(`verify-resolve evidence path is not canonical: ${reference}`);
    }
    return canonical;
  }).sort();
  if (new Set(normalized).size !== normalized.length) {
    throw new CommandError("verify-resolve evidence paths must be unique");
  }
  if (!requireFiles) return normalized;
  const root = fs.realpathSync(taskArtifactDir(paths, taskId));
  for (const reference of normalized) {
    const unresolved = path.resolve(root, reference);
    const relative = path.relative(root, unresolved);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new CommandError(`verify-resolve evidence escapes task artifacts: ${reference}`);
    }
    let stat;
    try {
      stat = fs.lstatSync(unresolved);
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new CommandError(`missing verify-resolve evidence: ${reference}`);
      }
      throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0
      || fs.realpathSync(unresolved) !== unresolved) {
      throw new CommandError(
        `verify-resolve evidence is not a canonical non-empty regular file: ${reference}`,
      );
    }
  }
  return normalized;
}

function runVerificationResolution(parsed, options = {}) {
  const { clock, environment, paths } = commandOptions(options);
  const evidenceRefs = canonicalResolutionEvidenceRefs(
    paths,
    parsed.taskId,
    parsed.evidenceRefs,
    { requireFiles: false },
  );
  const resolutionData = {
    pending_operation_id: parsed.pendingOperationId,
    claim_operation_id: parsed.claimOperationId,
    disposition: "indeterminate",
    authority_ref: parsed.authorityRef,
    reason: parsed.reason.trim(),
    evidence_refs: evidenceRefs,
  };
  const committed = mutateTaskRuntime(
    paths,
    parsed.taskId,
    {
      kind: "verification.resolved",
      operationId: parsed.operationId,
      data: resolutionData,
    },
    ({ currentProjection, occurredAt }) => {
      if (currentProjection.state.status !== "doing") {
        throw new CommandError("verify-resolve requires a doing task");
      }
      canonicalResolutionEvidenceRefs(paths, parsed.taskId, evidenceRefs);
      const state = JSON.parse(JSON.stringify(currentProjection.state));
      const claims = Array.isArray(state.verification?.operation_claims)
        ? state.verification.operation_claims
        : [];
      const claim = claims.find((candidate) => (
        candidate.operation_id === parsed.pendingOperationId
          && candidate.claim_operation_id === parsed.claimOperationId
      ));
      if (!claim || claim.status !== "in_progress") {
        throw new CommandError(
          "verify-resolve requires the exact in-progress verification operation and claim",
        );
      }
      assertCurrentVerificationClaimAuthority(state, claim.authority_identity || null);
      const resolvedAt = timestampSeconds(() => new Date(occurredAt));
      const resolution = {
        schema_version: 1,
        operation_id: parsed.operationId,
        ...resolutionData,
        resolved_at: resolvedAt,
      };
      const tombstone = verificationIndeterminateTombstone(claim);
      state.verification = { ...(state.verification || {}) };
      state.verification.operation_claims = claims.map((candidate) => (
        candidate.operation_id === parsed.pendingOperationId
          ? {
            ...candidate,
            status: "indeterminate",
            resolved_at: resolvedAt,
            resolution,
            tombstone,
          }
          : candidate
      ));
      return {
        projection: {
          task_content: currentProjection.task_content,
          state,
          files: [],
        },
        result: {
          exitCode: 0,
          lines: [
            `task_id: ${parsed.taskId}`,
            `operation_id: ${parsed.pendingOperationId}`,
            "status: indeterminate",
          ],
        },
        legacy: [{
          kind: "verify-resolve",
          detail: `${parsed.pendingOperationId} => indeterminate`,
        }],
      };
    },
    {
      clock,
      environment,
      beforeEventAppend(event) {
        if (options.beforeEventAppend) options.beforeEventAppend(event);
        canonicalResolutionEvidenceRefs(paths, parsed.taskId, evidenceRefs);
      },
    },
  );
  return committed.result;
}

function appendVerificationClaim(currentProjection, identity, now) {
  const state = JSON.parse(JSON.stringify(currentProjection.state));
  const verification = state.verification && typeof state.verification === "object"
    ? { ...state.verification }
    : {};
  const claims = Array.isArray(verification.operation_claims)
    ? verification.operation_claims.map((claim) => ({ ...claim }))
    : [];
  assertNoIndeterminateVerificationTombstone(claims, identity);
  const sameOperation = claims.find((claim) => claim.operation_id === identity.operation_id);
  if (sameOperation) {
    if (!sameVerificationClaimIdentity(sameOperation, identity)) {
      throw new CommandError(`operation_id replay payload conflict: ${identity.operation_id}`);
    }
    throw new CommandError(`verification operation is already ${sameOperation.status}`);
  }
  const samePendingRequest = claims.find((claim) => (
    claim.status === "in_progress"
      && sameVerificationExecutionBoundary(claim, identity)
  ));
  if (samePendingRequest) {
    throw new CommandError(
      "verification request already has an in-progress claim: " +
        pendingVerificationRecoveryMessage(identity.task_id, samePendingRequest),
    );
  }
  const claim = { ...identity, status: "in_progress", claimed_at: now };
  verification.operation_claims = [...claims, claim];
  state.verification = verification;
  return {
    projection: {
      task_content: currentProjection.task_content,
      state,
      files: [],
    },
    result: { claim: JSON.parse(JSON.stringify(claim)) },
  };
}

function replayVerificationTerminal({
  claimIdentity,
  clock,
  environment,
  events,
  options,
  parsed,
  paths,
}) {
  const existing = events.find((event) => event.operation_id === claimIdentity.terminal_operation_id);
  if (!existing) return null;
  if (existing.kind !== "verification.recorded"
    || existing.data?.request_digest !== claimIdentity.request_digest
    || existing.data?.claim_operation_id !== claimIdentity.claim_operation_id
    || canonicalJson(existing.data?.authority_identity || null)
      !== canonicalJson(claimIdentity.authority_identity || null)) {
    throw new CommandError(`operation_id replay payload conflict: ${claimIdentity.operation_id}`);
  }
  const committed = mutateTaskRuntime(
    paths,
    parsed.taskId,
    {
      kind: existing.kind,
      operationId: existing.operation_id,
      data: existing.data,
    },
    () => {
      throw new CommandError("terminal verification replay unexpectedly entered transition");
    },
    {
      clock,
      environment,
      replayPostcondition: claimIdentity.authority_identity
        ? verificationTerminalReplayPostcondition(claimIdentity.authority_identity, clock)
        : options.replayPostcondition,
    },
  );
  return committed.result;
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
  const captureIdentity = options.captureIdentity || captureVerificationIdentity;
  const declaredOutputs = resolveVerificationOutputs(
    parsed.outputPaths,
    cwd,
    taskArtifactDir(paths, parsed.taskId),
  );
  const operationId = options.operationId || crypto.randomUUID();
  const requestIdentity = verificationClaimIdentity(
    parsed,
    cwd,
    declaredOutputs,
    null,
    operationId,
  );
  const existingTerminal = observedEvents
    .find((event) => event.operation_id === requestIdentity.terminal_operation_id);
  if (existingTerminal) {
    const replayed = replayVerificationTerminal({
      claimIdentity: {
        ...requestIdentity,
        authority_identity: existingTerminal.data?.authority_identity || null,
      },
      clock,
      environment,
      events: observedEvents,
      options,
      parsed,
      paths,
    });
    if (replayed) return replayed;
  }
  const requiredGate = bindRequiredCheck({
    clock,
    commandText,
    cwd,
    parsed,
    paths,
    state: latestState,
  });
  const gateClass = requiredGate?.gate_class || parsed.gateClass || "general";
  const claimIdentity = verificationClaimIdentity(
    parsed,
    cwd,
    declaredOutputs,
    requiredGate,
    operationId,
  );
  assertNoIndeterminateVerificationTombstone(
    latestState.verification?.operation_claims || [],
    claimIdentity,
  );
  let claimGuard = null;
  const claimed = mutateTaskRuntime(
    paths,
    parsed.taskId,
    {
      kind: "verification.claimed",
      operationId: claimIdentity.claim_operation_id,
      data: claimIdentity,
    },
    ({ currentProjection, occurredAt }) => {
      if (currentProjection.state.status !== "doing") {
        throw new CommandError("verify requires a doing task");
      }
      if (requiredGate) {
        claimGuard = () => assertCurrentBoundVerification({
          clock,
          commandText,
          cwd,
          environment,
          expectedGate: requiredGate,
          parsed,
          paths,
          state: currentProjection.state,
        });
        claimGuard();
      }
      return appendVerificationClaim(
        currentProjection,
        claimIdentity,
        timestampSeconds(() => new Date(occurredAt)),
      );
    },
    {
      clock,
      environment,
      expectedRevision: observedRevision,
      failAfterEventAppend: options.failAfterClaimAppend,
      failBeforeEventAppend: options.failBeforeClaimAppend,
      beforeEventAppend(event) {
        if (options.beforeEventAppend) options.beforeEventAppend(event);
        if (claimGuard) claimGuard(event);
      },
      replayPostcondition: requiredGate
        ? authorityReplayPostcondition({
          clock,
          evidenceEpoch: requiredGate.evidence_epoch,
          grantId: requiredGate.grant_id,
          requireUnexpired: true,
          scopeDigest: requiredGate.scope_digest,
          sliceId: requiredGate.slice_id,
          validateCurrent({ currentProjection }) {
            assertCurrentBoundVerification({
              clock,
              commandText,
              cwd,
              environment,
              expectedGate: requiredGate,
              parsed,
              paths,
              state: currentProjection.state,
            });
          },
        })
        : options.replayPostcondition,
    },
  );
  if (claimed.replay) {
    throw new CommandError(
      `verification operation is already in progress: ${operationId}; ` +
        pendingVerificationRecoveryMessage(
          parsed.taskId,
          claimed.result.claim || claimIdentity,
        ),
    );
  }
  const claimRevision = claimed.event.revision;
  const createdAt = timestampSeconds(clock);
  const childEnvironment = { ...environment, ATLAS_VERIFICATION_CREATED_AT: createdAt };
  if (declaredOutputs.length > 0) {
    childEnvironment.ATLAS_VERIFICATION_OUTPUTS_JSON = JSON.stringify(
      declaredOutputs.map((entry) => entry.path),
    );
  } else {
    delete childEnvironment.ATLAS_VERIFICATION_OUTPUTS_JSON;
  }
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
        env: childEnvironment,
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
    const outputs = exitCode === 0
      ? declaredOutputs.map(captureVerificationOutput)
      : [];
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
        outputs,
        ...(producerProvenance ? { producer_provenance: producerProvenance } : {}),
      },
    });
    const identityReference = relativeToCodeHome(paths, identityFile);
    const releaseEvidence = releaseEvidenceSnapshot(
      completedRequiredGate,
      after.identity,
      outputs,
      producerProvenance,
    );
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
    const storedResult = {
      exitCode,
      lines: [
        `task_id: ${parsed.taskId}`,
        `record: ${recordFile}`,
        `verdict: ${verdict}`,
      ],
      identityFile,
      recordFile,
    };
    const committed = mutateTaskRuntime(
      paths,
      parsed.taskId,
      {
        kind: "verification.recorded",
        operationId,
        data: {
          authority_identity: claimIdentity.authority_identity,
          claim_operation_id: claimIdentity.claim_operation_id,
          record_id: identityRecord.record_id,
          identity_digest: identityRecord.identity_digest,
          observed_revision: observedRevision,
          claim_revision: claimRevision,
          request_digest: claimIdentity.request_digest,
          required_gate: completedRequiredGate,
          release_evidence: releaseEvidence,
          verdict,
          outcome,
        },
      },
      ({ currentProjection, occurredAt, revision }) => {
        if (currentProjection.state.status !== "doing") {
          throw new CommandError("verify requires a doing task");
        }
        const currentClaims = currentProjection.state.verification?.operation_claims || [];
        const currentClaim = currentClaims
          .find((claim) => claim.operation_id === claimIdentity.operation_id);
        if (!currentClaim || currentClaim.status !== "in_progress"
          || !sameVerificationClaimIdentity(currentClaim, claimIdentity)) {
          throw new CommandError("verification terminal receipt does not match its durable claim");
        }
        assertCurrentVerificationClaimAuthority(
          currentProjection.state,
          claimIdentity.authority_identity,
        );
        const eventClock = () => new Date(occurredAt);
        const verifiedAt = timestampSeconds(eventClock);
        const taskContent = renderTaskFields(currentProjection.task_content, {
          last_verified_at: verifiedAt,
        });
        const state = projectTaskState(
          paths,
          parsed.taskId,
          taskContent,
          currentProjection.state,
          eventClock,
        );
        state.last_verified_at = verifiedAt;
        state.verification = {
          ...(state.verification || {}),
          ...stateFields,
        };
        state.verification.operation_claims = currentClaims.map((claim) => (
          claim.operation_id === claimIdentity.operation_id
            ? {
              ...claim,
              status: "terminal",
              terminal_at: verifiedAt,
              result: JSON.parse(JSON.stringify(storedResult)),
            }
            : claim
        ));
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
          result: storedResult,
          legacy: [{ kind: "verify", detail: `${renderedCommandText} => ${verdict}` }],
        };
      },
      {
        clock,
        environment,
        failAfterEventAppend: options.failAfterEventAppend,
        failBeforeEventAppend: options.failBeforeEventAppend,
        beforeEventAppend(event) {
          if (options.beforeEventAppend) options.beforeEventAppend(event);
        },
        replayPostcondition: claimIdentity.authority_identity
          ? verificationTerminalReplayPostcondition(claimIdentity.authority_identity, clock)
          : options.replayPostcondition,
      },
    );
    return committed.result;
  } finally {
    fs.rmSync(temporaryDir, { force: true, recursive: true });
  }
}

module.exports = {
  VERIFY_USAGE,
  VERIFY_RESOLVE_USAGE,
  bashQuote,
  formatCommand,
  parseVerifyArgs,
  parseVerifyResolveArgs,
  runVerification,
  runVerificationResolution,
  timestampToken,
};
