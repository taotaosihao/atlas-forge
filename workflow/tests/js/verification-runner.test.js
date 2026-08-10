"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const test = require("node:test");

const WORKFLOW_ROOT = path.resolve(__dirname, "../..");
const PUBLIC_BIN = path.join(WORKFLOW_ROOT, "bin", "codex-workflow");
const RECORD_CLI = path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/verification/record-cli.js",
);
const TEMPLATE_DIR = path.join(WORKFLOW_ROOT, "templates");
const { resolvePaths, taskArtifactDir } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/core/paths.js",
));
const { completeTask, createTask, startTask } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/task/lifecycle.js",
));
const { getTaskField, taskFile } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/task/repository.js",
));
const { readJsonObject, taskRuntimeFile, taskStateFile } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/task/runtime.js",
));
const { outputPreview } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/verification/record.js",
));
const {
  captureVerificationIdentity,
  digestCanonical,
  resolveVerificationOutputs,
  validateCapturedOutput,
} = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/verification/identity.js",
));
const {
  VERIFY_USAGE,
  formatCommand,
  parseVerifyArgs,
  parseVerifyResolveArgs,
  runVerification,
  runVerificationResolution,
} = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/verification/runner.js",
));

function fixedClock() {
  return new Date("2026-07-10T09:15:00.000Z");
}

function temporaryWorkflow(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-verification-runner."));
  const environment = {
    ...process.env,
    CODEX_HOME_ROOT: home,
    CODEX_WORKFLOW_ROOT: path.join(home, "workflow"),
    CODEX_WORKFLOW_TEMPLATE_DIR: TEMPLATE_DIR,
    TMPDIR: path.join(home, "tmp"),
  };
  t.after(() => fs.rmSync(home, { force: true, recursive: true }));
  return { environment, home, paths: resolvePaths(environment) };
}

function createFixtureTask(environment, title = "Verification runner") {
  const options = {
    clock: fixedClock,
    environment,
  };
  const taskId = createTask(title, "verification record contract", options);
  startTask(taskId, options);
  return taskId;
}

function readEvents(paths, taskId) {
  return fs
    .readFileSync(taskRuntimeFile(paths, taskId), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

function legacyShape(event) {
  return { kind: event.kind, detail: event.detail, created_at: event.created_at };
}

test("runs a passing argv command and records independent verification metadata", (t) => {
  const { environment, home, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment);
  const inputFile = path.join(home, "verification-input.txt");
  fs.writeFileSync(inputFile, "explicit verification input\n");
  const parsed = parseVerifyArgs([
    taskId,
    "--gate-class=unit",
    "--input",
    inputFile,
    "--outcome",
    "blocked",
    "--trajectory=fixed",
    "--evaluator",
    "human",
    "--evidence",
    "verification/manual.md",
    "--evidence=https://example.invalid/run/1",
    "--",
    process.execPath,
    "-e",
    'process.stdout.write("child stdout\\n"); process.stderr.write("child stderr\\n")',
  ]);
  const result = runVerification(parsed, {
    clock: fixedClock,
    environment,
    recordToken: "20260710T091500000000000",
  });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.lines, [
    `task_id: ${taskId}`,
    `record: ${result.recordFile}`,
    "verdict: passed",
  ]);
  const record = fs.readFileSync(result.recordFile, "utf8");
  assert.match(record, /^# Verification Record/m);
  assert.match(record, /- exit_code: 0\n- verdict: passed\n- outcome: blocked/);
  assert.match(record, /- trajectory: fixed\n- evaluator: human/);
  assert.match(record, /- `verification\/manual\.md`/);
  assert.match(record, /- `https:\/\/example\.invalid\/run\/1`/);
  assert.match(record, /```text\nchild stdout\n```/);
  assert.match(record, /```text\nchild stderr\n```/);
  assert.match(record, /- identity_record: `/);
  assert.match(record, /- snapshot_stable: true/);
  assert.equal(fs.existsSync(result.identityFile), true);
  const identity = JSON.parse(fs.readFileSync(result.identityFile, "utf8"));
  assert.equal(identity.schema_version, 2);
  assert.equal(identity.task_id, taskId);
  assert.equal(identity.gate_class, "unit");
  assert.equal(identity.provenance, "executed");
  assert.equal(identity.snapshot_stable, true);
  assert.equal(identity.identity.argv[0], process.execPath);
  assert.match(identity.record_id, /^sha256:[a-f0-9]{64}$/);
  assert.match(identity.identity_digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(identity.identity.environment.secrets_persisted, false);
  assert.equal(Object.hasOwn(identity.result, "producer_provenance"), false);
  assert.deepEqual(identity.identity.inputs.map((entry) => entry.requested), [inputFile]);

  const file = taskFile(paths.tasksDir, taskId);
  assert.equal(getTaskField(file, "last_verified_at"), "2026-07-10T09:15:00Z");
  const state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(state.last_verified_at, "2026-07-10T09:15:00Z");
  assert.equal(
    state.verification.last_record,
    `workflow/artifacts/${taskId}/verification/20260710T091500000000000.md`,
  );
  assert.equal(
    state.verification.last_identity_record,
    `workflow/artifacts/${taskId}/verification/20260710T091500000000000.json`,
  );
  assert.equal(state.verification.last_exit_code, 0);
  assert.equal(state.verification.outcome, "blocked");
  assert.equal(state.verification.identity_schema_version, 2);
  assert.equal(state.verification.identity_stable, true);
  assert.equal(state.verification.record_id, identity.record_id);
  assert.equal(state.verification.identity_digest, identity.identity_digest);
  assert.equal(state.verification.trajectory, "fixed");
  assert.equal(state.verification.evaluator, "human");
  assert.equal(state.verification.failure_attribution, "");
  assert.equal(
    state.verification.evidence_refs,
    "verification/manual.md https://example.invalid/run/1",
  );
  assert.deepEqual(legacyShape(readEvents(paths, taskId).at(-1)), {
    kind: "verify",
    detail: `${formatCommand(parsed.command)} => passed`,
    created_at: "2026-07-10T09:15:00Z",
  });
});

test("durable verification terminal replay returns the stored result and executes once", (t) => {
  const { environment, home, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Verification terminal replay");
  const counter = path.join(home, "terminal-replay-count");
  const parsed = parseVerifyArgs([
    taskId,
    "--",
    process.execPath,
    "-e",
    `require("fs").appendFileSync(${JSON.stringify(counter)}, "run\\n")`,
  ]);
  const first = runVerification(parsed, {
    clock: fixedClock,
    environment,
    operationId: "verification-terminal-replay",
    recordToken: "20260710T091500000000101",
  });
  const replay = runVerification(parsed, {
    clock: fixedClock,
    environment,
    operationId: "verification-terminal-replay",
    recordToken: "20260710T091500000000102",
  });

  assert.deepEqual(replay, first);
  assert.equal(fs.readFileSync(counter, "utf8"), "run\n");
  const claims = readJsonObject(taskStateFile(paths, taskId)).verification.operation_claims;
  assert.equal(claims.length, 1);
  assert.equal(claims[0].status, "terminal");
  assert.equal(claims[0].operation_id, "verification-terminal-replay");
  assert.match(claims[0].request_digest, /^sha256:[a-f0-9]{64}$/);
});

test("an unrelated verification can fully terminalize between another claim and receipt", (t) => {
  const { environment, home, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Interleaved verification receipts");
  const firstCounter = path.join(home, "interleaved-first-count");
  const secondCounter = path.join(home, "interleaved-second-count");
  const first = parseVerifyArgs([
    taskId,
    "--",
    process.execPath,
    "-e",
    `require("fs").appendFileSync(${JSON.stringify(firstCounter)}, "run\\n")`,
  ]);
  const second = parseVerifyArgs([
    taskId,
    "--",
    process.execPath,
    "-e",
    `require("fs").appendFileSync(${JSON.stringify(secondCounter)}, "run\\n")`,
  ]);
  let nested = false;
  const firstResult = runVerification(first, {
    captureIdentity(input) {
      if (!nested) {
        nested = true;
        runVerification(second, {
          clock: fixedClock,
          environment,
          operationId: "interleaved-verification-b",
          recordToken: "20260710T091500000000112",
        });
      }
      return captureVerificationIdentity(input);
    },
    clock: fixedClock,
    environment,
    operationId: "interleaved-verification-a",
    recordToken: "20260710T091500000000111",
  });

  assert.equal(nested, true);
  assert.equal(fs.readFileSync(firstCounter, "utf8"), "run\n");
  assert.equal(fs.readFileSync(secondCounter, "utf8"), "run\n");
  const claims = readJsonObject(taskStateFile(paths, taskId)).verification.operation_claims;
  assert.deepEqual(
    claims.map((claim) => [claim.operation_id, claim.status]).sort(),
    [
      ["interleaved-verification-a", "terminal"],
      ["interleaved-verification-b", "terminal"],
    ],
  );

  const replay = runVerification(first, {
    captureIdentity() {
      throw new Error("terminal replay must not capture or execute");
    },
    clock: fixedClock,
    environment,
    operationId: "interleaved-verification-a",
    recordToken: "20260710T091500000000113",
  });
  assert.deepEqual(replay, firstResult);
  assert.equal(fs.readFileSync(firstCounter, "utf8"), "run\n");
  assert.equal(fs.readFileSync(secondCounter, "utf8"), "run\n");
});

test("a new explicit operation intentionally reruns a terminal verification request", (t) => {
  const { environment, home, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Fresh verification operation");
  const counter = path.join(home, "fresh-operation-count");
  const parsed = parseVerifyArgs([
    taskId,
    "--",
    process.execPath,
    "-e",
    `require("fs").appendFileSync(${JSON.stringify(counter)}, "run\\n")`,
  ]);
  runVerification(parsed, {
    clock: fixedClock,
    environment,
    operationId: "fresh-verification-one",
    recordToken: "20260710T091500000000114",
  });
  runVerification(parsed, {
    clock: fixedClock,
    environment,
    operationId: "fresh-verification-one",
    recordToken: "20260710T091500000000115",
  });
  runVerification(parsed, {
    clock: fixedClock,
    environment,
    operationId: "fresh-verification-two",
    recordToken: "20260710T091500000000116",
  });

  assert.equal(fs.readFileSync(counter, "utf8"), "run\nrun\n");
  assert.deepEqual(
    readJsonObject(taskStateFile(paths, taskId)).verification.operation_claims
      .map((claim) => [claim.operation_id, claim.status]).sort(),
    [
      ["fresh-verification-one", "terminal"],
      ["fresh-verification-two", "terminal"],
    ],
  );
});

test("a generated verification operation id cannot bypass the same pending request", (t) => {
  const { environment, home, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Verification generated id pending guard");
  const counter = path.join(home, "generated-id-count");
  const parsed = parseVerifyArgs([
    taskId,
    "--",
    process.execPath,
    "-e",
    `require("fs").appendFileSync(${JSON.stringify(counter)}, "run\\n")`,
  ]);
  assert.throws(() => runVerification(parsed, {
    clock: fixedClock,
    environment,
    failAfterClaimAppend: true,
  }), /authoritative event committed but projection is inconsistent/);
  assert.equal(fs.existsSync(counter), false);

  assert.throws(() => runVerification(parsed, {
    clock: fixedClock,
    environment,
  }), (error) => {
    assert.match(error.message, /request already has an in-progress claim/);
    assert.match(error.message, /pending_operation_id=/);
    assert.match(error.message, /claim_operation_id=.*-verification-claim/);
    assert.match(error.message, /codex-workflow verify-resolve/);
    return true;
  });
  assert.equal(fs.existsSync(counter), false);
  const recorderMetadataVariants = [
    ["--trajectory=smoke-only"],
    ["--outcome=blocked"],
    ["--evaluator=human"],
    ["--failure-attribution=env"],
    ["--evidence=event:controller-note"],
  ];
  for (const [index, metadata] of recorderMetadataVariants.entries()) {
    const variant = parseVerifyArgs([
      taskId,
      ...metadata,
      "--",
      process.execPath,
      "-e",
      `require("fs").appendFileSync(${JSON.stringify(counter)}, "run\\n")`,
    ]);
    assert.throws(() => runVerification(variant, {
      clock: fixedClock,
      environment,
      operationId: `verification-pending-metadata-${index}`,
    }), /request already has an in-progress claim/);
  }
  assert.equal(fs.existsSync(counter), false);
  const claims = readJsonObject(taskStateFile(paths, taskId)).verification.operation_claims;
  assert.equal(claims.length, 1);
  assert.equal(claims[0].status, "in_progress");
});

test("verification execution fingerprint distinguishes argv cwd input and output changes", (t) => {
  const { environment, home, paths } = temporaryWorkflow(t);
  const repo = path.join(home, "execution-fingerprint-repo");
  fs.mkdirSync(path.join(repo, "cwd-a"), { recursive: true });
  fs.mkdirSync(path.join(repo, "cwd-b"), { recursive: true });
  spawnSync("git", ["init", "-q", repo]);
  spawnSync("git", ["-C", repo, "config", "user.email", "atlas@example.test"]);
  spawnSync("git", ["-C", repo, "config", "user.name", "Atlas Test"]);
  fs.writeFileSync(path.join(repo, "README.md"), "execution fingerprint fixture\n");
  spawnSync("git", ["-C", repo, "add", "README.md"]);
  spawnSync("git", ["-C", repo, "commit", "-qm", "test: initialize fingerprint fixture"]);
  const inputA = path.join(repo, "input-a.txt");
  const inputB = path.join(repo, "input-b.txt");
  fs.writeFileSync(inputA, "input A\n");
  fs.writeFileSync(inputB, "input B\n");

  const cases = [
    {
      name: "argv",
      baseCommand: [process.execPath, "-e", "process.exit(0)"],
      variantCommand(counter) {
        return [
          process.execPath,
          "-e",
          `require("fs").appendFileSync(${JSON.stringify(counter)}, "argv\\n")`,
        ];
      },
    },
    {
      name: "cwd",
      baseCommand: [process.execPath, "-e", "process.exit(0)"],
      baseCwd: path.join(repo, "cwd-a"),
      variantCwd: path.join(repo, "cwd-b"),
      variantCommand(counter) {
        return [
          process.execPath,
          "-e",
          `require("fs").appendFileSync(${JSON.stringify(counter)}, "cwd\\n")`,
        ];
      },
      keepCommand: true,
    },
    {
      name: "input",
      baseCommand: [process.execPath, "-e", "process.exit(0)"],
      baseFlags: ["--input", inputA],
      variantFlags: ["--input", inputB],
      variantCommand(counter) {
        return [
          process.execPath,
          "-e",
          `require("fs").appendFileSync(${JSON.stringify(counter)}, "input\\n")`,
        ];
      },
      keepCommand: true,
    },
    {
      name: "output",
      outputCase: true,
    },
  ];

  for (const [index, item] of cases.entries()) {
    const taskId = createFixtureTask(environment, `Execution fingerprint ${item.name}`);
    const counter = path.join(home, `${item.name}-execution-count`);
    let baseCommand = item.baseCommand;
    let variantCommand = item.variantCommand?.(counter);
    let baseFlags = item.baseFlags || [];
    let variantFlags = item.variantFlags || [];
    if (item.keepCommand) baseCommand = variantCommand;
    if (item.outputCase) {
      const outputDir = path.join(taskArtifactDir(paths, taskId), "fingerprint-outputs");
      fs.mkdirSync(outputDir, { recursive: true });
      const outputCommand = [
        process.execPath,
        "-e",
        `const fs=require("fs");const [file]=JSON.parse(process.env.ATLAS_VERIFICATION_OUTPUTS_JSON);` +
          `fs.writeFileSync(file,"output\\n");fs.appendFileSync(${JSON.stringify(counter)},"output\\n")`,
      ];
      baseCommand = outputCommand;
      variantCommand = outputCommand;
      baseFlags = ["--output", path.join(outputDir, "base.txt")];
      variantFlags = ["--output", path.join(outputDir, "variant.txt")];
    }
    const base = parseVerifyArgs([
      taskId,
      ...baseFlags,
      "--",
      ...baseCommand,
    ]);
    const variant = parseVerifyArgs([
      taskId,
      ...variantFlags,
      "--",
      ...variantCommand,
    ]);
    assert.throws(() => runVerification(base, {
      clock: fixedClock,
      cwd: item.baseCwd || repo,
      environment,
      failAfterClaimAppend: true,
      operationId: `fingerprint-${item.name}-pending`,
    }), /authoritative event committed but projection is inconsistent/);
    runVerification(variant, {
      clock: fixedClock,
      cwd: item.variantCwd || repo,
      environment,
      operationId: `fingerprint-${item.name}-variant`,
      recordToken: `20260710T0915000000002${index}`,
    });
    assert.equal(fs.readFileSync(counter, "utf8"), `${item.name}\n`);
    const claims = readJsonObject(taskStateFile(paths, taskId)).verification.operation_claims;
    assert.deepEqual(claims.map((claim) => claim.status), ["in_progress", "terminal"]);
    assert.notEqual(claims[0].execution_fingerprint, claims[1].execution_fingerprint);
    assert.deepEqual(Object.keys(claims[0].execution_target).sort(), [
      "command",
      "cwd_realpath",
      "input_paths",
      "output_paths",
      "schema_version",
      "task_id",
    ]);
  }
});

test("a concurrent verification with the same operation fails before argv execution", (t) => {
  const { environment, home } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Verification concurrent claim");
  const counter = path.join(home, "concurrent-count");
  const parsed = parseVerifyArgs([
    taskId,
    "--",
    process.execPath,
    "-e",
    `require("fs").appendFileSync(${JSON.stringify(counter)}, "run\\n")`,
  ]);
  let nested = false;
  runVerification(parsed, {
    clock: fixedClock,
    environment,
    operationId: "verification-concurrent",
    recordToken: "20260710T091500000000103",
    captureIdentity(input) {
      if (!nested) {
        nested = true;
        assert.throws(() => runVerification(parsed, {
          clock: fixedClock,
          environment,
          operationId: "verification-concurrent",
          recordToken: "20260710T091500000000104",
        }), /verification operation is already in progress/);
      }
      return captureVerificationIdentity(input);
    },
  });
  assert.equal(nested, true);
  assert.equal(fs.readFileSync(counter, "utf8"), "run\n");
});

test("verification command crash before terminal append preserves pending claim and never reruns", (t) => {
  const { environment, home, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Verification terminal crash");
  const counter = path.join(home, "terminal-crash-count");
  const parsed = parseVerifyArgs([
    taskId,
    "--",
    process.execPath,
    "-e",
    `require("fs").appendFileSync(${JSON.stringify(counter)}, "run\\n")`,
  ]);
  assert.throws(() => runVerification(parsed, {
    beforeEventAppend(event) {
      if (event.kind === "verification.recorded") {
        throw new Error("injected verification terminal crash");
      }
    },
    clock: fixedClock,
    environment,
    operationId: "verification-terminal-crash",
    recordToken: "20260710T091500000000105",
  }), /injected verification terminal crash/);
  assert.equal(fs.readFileSync(counter, "utf8"), "run\n");
  assert.equal(
    readJsonObject(taskStateFile(paths, taskId)).verification.operation_claims[0].status,
    "in_progress",
  );

  assert.throws(() => runVerification(parsed, {
    clock: fixedClock,
    environment,
    operationId: "verification-terminal-crash",
    recordToken: "20260710T091500000000106",
  }), (error) => {
    assert.match(error.message, /verification operation is already in progress/);
    assert.match(error.message, /pending_operation_id=verification-terminal-crash/);
    assert.match(
      error.message,
      /claim_operation_id=verification-terminal-crash-verification-claim/,
    );
    assert.match(error.message, /codex-workflow verify-resolve/);
    return true;
  });
  assert.equal(fs.readFileSync(counter, "utf8"), "run\n");

  for (const authorityRef of [
    "",
    "user-message:",
    "user-message:slash/not-canonical",
    "operator-input:contains whitespace",
    "user-message:control\tcharacter",
    "workflow-self-assertion:invalid",
  ]) {
    assert.throws(() => parseVerifyResolveArgs([
      taskId,
      "--operation-id=verification-terminal-crash-resolution",
      "--pending-operation-id=verification-terminal-crash",
      "--claim-operation-id=verification-terminal-crash-verification-claim",
      `--authority-ref=${authorityRef}`,
      "--reason=controller process ended after argv execution",
      "--evidence=recovery/verification-crash.md",
    ]), /verify-resolve|controller-recordable/);
  }
  const missingEvidence = parseVerifyResolveArgs([
    taskId,
    "--operation-id=verification-terminal-crash-missing-evidence",
    "--pending-operation-id=verification-terminal-crash",
    "--claim-operation-id=verification-terminal-crash-verification-claim",
    "--authority-ref=operator-input:verification-crash",
    "--reason=controller process ended after argv execution",
    "--evidence=recovery/missing.md",
  ]);
  assert.throws(() => runVerificationResolution(missingEvidence, {
    clock: fixedClock,
    environment,
  }), /missing verify-resolve evidence/);
  assert.equal(
    readJsonObject(taskStateFile(paths, taskId)).verification.operation_claims[0].status,
    "in_progress",
  );

  const evidence = path.join(
    taskArtifactDir(paths, taskId), "recovery", "verification-crash.md",
  );
  fs.mkdirSync(path.dirname(evidence), { recursive: true });
  fs.writeFileSync(evidence, "controller confirmed argv result is indeterminate\n");
  const resolveArgs = [
    taskId,
    "--operation-id=verification-terminal-crash-resolution",
    "--pending-operation-id=verification-terminal-crash",
    "--claim-operation-id=verification-terminal-crash-verification-claim",
    "--authority-ref=operator-input:verification-crash",
    "--reason=controller process ended after argv execution",
    "--evidence=recovery/verification-crash.md",
  ];
  const beforeEvidenceSwap = readJsonObject(taskStateFile(paths, taskId));
  const evidenceBytes = fs.readFileSync(evidence);
  assert.throws(() => runVerificationResolution(parseVerifyResolveArgs([
    ...resolveArgs.map((argument) => (
      argument === "--operation-id=verification-terminal-crash-resolution"
        ? "--operation-id=verification-terminal-crash-evidence-swap"
        : argument
    )),
  ]), {
    beforeEventAppend() {
      fs.writeFileSync(evidence, "");
    },
    clock: fixedClock,
    environment,
  }), /canonical non-empty regular file/);
  assert.equal(
    readJsonObject(taskStateFile(paths, taskId)).runtime_revision,
    beforeEvidenceSwap.runtime_revision,
  );
  assert.equal(
    readJsonObject(taskStateFile(paths, taskId)).verification.operation_claims[0].status,
    "in_progress",
  );
  fs.writeFileSync(evidence, evidenceBytes);
  const resolved = runVerificationResolution(parseVerifyResolveArgs(resolveArgs), {
    clock: fixedClock,
    environment,
  });
  assert.ok(resolved.lines.includes("status: indeterminate"));
  const resolvedState = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(resolvedState.verification.operation_claims[0].status, "indeterminate");
  assert.equal(resolvedState.verification.operation_claims[0].resolution.disposition, "indeterminate");
  assert.deepEqual(resolvedState.verification.operation_claims[0].tombstone, {
    schema_version: 1,
    request_digest: resolvedState.verification.operation_claims[0].request_digest,
    execution_fingerprint:
      resolvedState.verification.operation_claims[0].execution_fingerprint,
    authority_boundary: {
      schema_version: 1,
      kind: "direct-unbound",
    },
    required_check_binding: null,
  });
  assert.equal(resolvedState.verification.required_gates, undefined);
  assert.equal(fs.readFileSync(counter, "utf8"), "run\n");
  assert.deepEqual(runVerificationResolution(parseVerifyResolveArgs(resolveArgs), {
    clock: fixedClock,
    environment,
  }), resolved);
  assert.equal(fs.readFileSync(counter, "utf8"), "run\n");
  assert.throws(() => runVerificationResolution(parseVerifyResolveArgs([
    ...resolveArgs.filter((argument) => !argument.startsWith("--reason=")),
    "--reason=a conflicting controller explanation",
  ]), {
    clock: fixedClock,
    environment,
  }), /operation_id replay payload conflict/);
  assert.equal(fs.readFileSync(counter, "utf8"), "run\n");

  assert.throws(() => runVerification(parsed, {
    clock: fixedClock,
    environment,
    operationId: "verification-terminal-crash",
    recordToken: "20260710T091500000000117",
  }), /durably indeterminate.*stable direct\/unbound authority boundary/);
  assert.throws(() => runVerification(parsed, {
    clock: fixedClock,
    environment,
    operationId: "verification-terminal-crash-new-operation",
    recordToken: "20260710T091500000000118",
  }), /durably indeterminate.*stable direct\/unbound authority boundary/);
  for (const [index, metadata] of [
    ["--trajectory=regressed"],
    ["--outcome=skipped"],
    ["--evaluator=human"],
    ["--failure-attribution=dependency"],
    ["--evidence=event:manual-resolution"],
  ].entries()) {
    const variant = parseVerifyArgs([
      taskId,
      ...metadata,
      "--",
      process.execPath,
      "-e",
      `require("fs").appendFileSync(${JSON.stringify(counter)}, "run\\n")`,
    ]);
    assert.throws(() => runVerification(variant, {
      clock: fixedClock,
      environment,
      operationId: `verification-indeterminate-metadata-${index}`,
    }), /durably indeterminate.*stable direct\/unbound authority boundary/);
  }
  assert.equal(fs.readFileSync(counter, "utf8"), "run\n");
  assert.equal(
    readJsonObject(taskStateFile(paths, taskId)).verification.operation_claims.length,
    1,
  );
});

test("direct indeterminate revalidation tombstones an older pass for succeeded completion", (t) => {
  const { environment, home, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Direct indeterminate completion barrier");
  const counter = path.join(home, "direct-indeterminate-completion-count");
  const parsed = parseVerifyArgs([
    taskId,
    "--",
    process.execPath,
    "-e",
    `require("fs").appendFileSync(${JSON.stringify(counter)}, "run\\n")`,
  ]);
  runVerification(parsed, {
    clock: fixedClock,
    environment,
    operationId: "direct-pass-before-indeterminate",
    recordToken: "20260710T091500000000119",
  });
  assert.throws(() => runVerification(parsed, {
    beforeEventAppend(event) {
      if (event.kind === "verification.recorded") {
        throw new Error("lose direct revalidation terminal receipt");
      }
    },
    clock: fixedClock,
    environment,
    operationId: "direct-indeterminate-revalidation",
    recordToken: "20260710T091500000000120",
  }), /lose direct revalidation terminal receipt/);
  assert.equal(fs.readFileSync(counter, "utf8"), "run\nrun\n");
  const evidence = path.join(taskArtifactDir(paths, taskId), "recovery", "direct.md");
  fs.mkdirSync(path.dirname(evidence), { recursive: true });
  fs.writeFileSync(evidence, "controller lost the second direct verification receipt\n");
  runVerificationResolution(parseVerifyResolveArgs([
    taskId,
    "--operation-id=resolve-direct-indeterminate-revalidation",
    "--pending-operation-id=direct-indeterminate-revalidation",
    "--claim-operation-id=direct-indeterminate-revalidation-verification-claim",
    "--authority-ref=operator-input:direct-indeterminate-revalidation",
    "--reason=controller lost the terminal receipt after command execution",
    "--evidence=recovery/direct.md",
  ]), { clock: fixedClock, environment });

  assert.throws(() => completeTask(taskId, {
    clock: fixedClock,
    environment,
    operationId: "complete-direct-succeeded-after-indeterminate",
    outcome: "succeeded",
  }), /successful completion is blocked by indeterminate verification/);
  completeTask(taskId, {
    authorityRef: "operator-input:close-direct-indeterminate-as-failed",
    clock: fixedClock,
    environment,
    evidenceRefs: ["event:resolve-direct-indeterminate-revalidation"],
    operationId: "complete-direct-failed-after-indeterminate",
    outcome: "failed",
  });
  const completed = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(completed.status, "done");
  assert.equal(completed.completion.outcome, "failed");
  assert.equal(
    completed.verification.operation_claims.find(
      (claim) => claim.operation_id === "direct-indeterminate-revalidation",
    ).status,
    "indeterminate",
  );
});

test("binds authoritative time and controller-owned outputs into the verification record", (t) => {
  const { environment, home, paths } = temporaryWorkflow(t);
  environment.ATLAS_VERIFICATION_CREATED_AT = "forged";
  environment.ATLAS_VERIFICATION_OUTPUTS_JSON = JSON.stringify(["/tmp/forged"]);
  const taskId = createFixtureTask(environment, "Controller outputs");
  const outputRoot = path.join(taskArtifactDir(paths, taskId), "generated");
  fs.mkdirSync(outputRoot);
  const first = path.join(outputRoot, "first.json");
  const second = path.join(outputRoot, "second.txt");
  const child = [
    "const fs=require('fs');",
    "const outputs=JSON.parse(process.env.ATLAS_VERIFICATION_OUTPUTS_JSON);",
    "fs.writeFileSync(outputs[0], JSON.stringify({createdAt:process.env.ATLAS_VERIFICATION_CREATED_AT}));",
    "fs.writeFileSync(outputs[1], 'second output\\n');",
  ].join("");
  const result = runVerification(parseVerifyArgs([
    taskId, "--output", first, `--output=${second}`,
    "--", process.execPath, "-e", child,
  ]), {
    clock: fixedClock,
    environment,
    recordToken: "20260710T091500000000010",
  });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(first, "utf8")), {
    createdAt: "2026-07-10T09:15:00Z",
  });
  const record = JSON.parse(fs.readFileSync(result.identityFile, "utf8"));
  assert.equal(record.created_at, "2026-07-10T09:15:00Z");
  assert.deepEqual(record.result.outputs.map((entry) => entry.path), [first, second]);
  assert.ok(record.result.outputs.every((entry) => (
    entry.type === "file" && /^0[0-7]{3}$/.test(entry.mode)
    && Number.isInteger(entry.size) && /^sha256:[a-f0-9]{64}$/.test(entry.sha256)
  )));
  const withoutId = { ...record };
  delete withoutId.record_id;
  assert.equal(record.record_id, digestCanonical(withoutId));
  fs.appendFileSync(second, "drift");
  assert.throws(() => validateCapturedOutput(record.result.outputs[1]), /changed after capture/);

  assert.throws(
    () => resolveVerificationOutputs([first, first], home, taskArtifactDir(paths, taskId)),
    /already exists|duplicate/,
  );
  assert.throws(
    () => resolveVerificationOutputs([path.join(home, "outside")], home, taskArtifactDir(paths, taskId)),
    /inside the task artifact root/,
  );
  const duplicate = path.join(outputRoot, "duplicate");
  assert.throws(
    () => resolveVerificationOutputs([duplicate, duplicate], home, taskArtifactDir(paths, taskId)),
    /duplicate verification output/,
  );
  const realParent = path.join(taskArtifactDir(paths, taskId), "real-parent");
  const linkedParent = path.join(taskArtifactDir(paths, taskId), "linked-parent");
  fs.mkdirSync(realParent);
  fs.symlinkSync(realParent, linkedParent);
  assert.throws(
    () => resolveVerificationOutputs([path.join(linkedParent, "output")], home,
      taskArtifactDir(paths, taskId)),
    /parent must be canonical/,
  );
});

test("fails closed when a successful child omits or substitutes a declared output", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Invalid outputs");
  const outputRoot = path.join(taskArtifactDir(paths, taskId), "invalid");
  fs.mkdirSync(outputRoot);
  const missing = path.join(outputRoot, "missing");
  assert.throws(() => runVerification(parseVerifyArgs([
    taskId, "--output", missing, "--", process.execPath, "-e", "process.exit(0)",
  ]), { clock: fixedClock, environment }), /was not created/);

  const directory = path.join(outputRoot, "directory");
  assert.throws(() => runVerification(parseVerifyArgs([
    taskId, "--output", directory, "--", process.execPath, "-e",
    "require('fs').mkdirSync(JSON.parse(process.env.ATLAS_VERIFICATION_OUTPUTS_JSON)[0])",
  ]), { clock: fixedClock, environment }), /canonical regular file/);

  const symlink = path.join(outputRoot, "symlink");
  assert.throws(() => runVerification(parseVerifyArgs([
    taskId, "--output", symlink, "--", process.execPath, "-e",
    "require('fs').symlinkSync(process.execPath,JSON.parse(process.env.ATLAS_VERIFICATION_OUTPUTS_JSON)[0])",
  ]), { clock: fixedClock, environment }), /canonical regular file/);

  const cleanEnvironment = {
    ...environment,
    ATLAS_VERIFICATION_OUTPUTS_JSON: JSON.stringify(["/tmp/forged"]),
  };
  const clean = runVerification(parseVerifyArgs([
    taskId, "--", process.execPath, "-e",
    "process.exit(Object.hasOwn(process.env,'ATLAS_VERIFICATION_OUTPUTS_JSON')?3:0)",
  ]), { clock: fixedClock, environment: cleanEnvironment });
  assert.equal(clean.exitCode, 0);
});

test("returns a failed command exit code after writing every projection", (t) => {
  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Failed verification");
  const parsed = parseVerifyArgs([
    taskId,
    "--outcome=failed",
    "--trajectory",
    "reproduced",
    "--evaluator=local-command",
    "--failure-attribution",
    "code",
    "--evidence",
    "review.md",
    "--",
    process.execPath,
    "-e",
    'process.stderr.write("failure detail\\n"); process.exit(3)',
  ]);
  const result = runVerification(parsed, {
    clock: fixedClock,
    environment,
    recordToken: "20260710T091500000000001",
  });

  assert.equal(result.exitCode, 3);
  assert.equal(result.lines[2], "verdict: failed");
  const record = fs.readFileSync(result.recordFile, "utf8");
  assert.match(record, /- exit_code: 3\n- verdict: failed/);
  assert.match(record, /- failure_attribution: code/);
  assert.match(record, /failure detail/);
  const state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(state.verification.last_exit_code, 3);
  assert.equal(state.verification.outcome, "failed");
  assert.equal(state.verification.failure_attribution, "code");
  assert.equal(readEvents(paths, taskId).at(-1).kind, "verify");
});

test("captures repository-wide untracked and nested lockfile identity from a subdirectory", (t) => {
  const { home } = temporaryWorkflow(t);
  const repo = path.join(home, "identity-repo");
  const nested = path.join(repo, "packages", "app");
  fs.mkdirSync(nested, { recursive: true });
  const git = (...args) => spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  assert.equal(git("init", "-q").status, 0);
  assert.equal(git("config", "user.name", "Atlas Test").status, 0);
  assert.equal(git("config", "user.email", "atlas@example.invalid").status, 0);
  fs.writeFileSync(path.join(repo, "root-tracked.txt"), "root tracked\n");
  fs.writeFileSync(path.join(nested, "package-lock.json"), "{\"lockfileVersion\":3}\n");
  fs.writeFileSync(path.join(nested, "tracked.txt"), "tracked\n");
  assert.equal(git("add", ".").status, 0);
  assert.equal(git("commit", "-qm", "fixture").status, 0);
  fs.writeFileSync(path.join(nested, "untracked.txt"), "untracked\n");

  const captured = captureVerificationIdentity({
    argv: [process.execPath, "--version"],
    cwd: nested,
    environment: process.env,
  });
  assert.equal(captured.identity.cwd_realpath, fs.realpathSync(nested));
  assert.deepEqual(captured.identity.lockfiles.map((entry) => entry.path), [
    "packages/app/package-lock.json",
  ]);
  assert.match(captured.identity.worktree.untracked_manifest_sha256, /^sha256:[a-f0-9]{64}$/);
  assert.match(captured.identity.worktree.tree_oid, /^[a-f0-9]{40}$/);
  fs.writeFileSync(path.join(repo, "root-tracked.txt"), "changed outside cwd\n");
  const changed = captureVerificationIdentity({
    argv: [process.execPath, "--version"],
    cwd: nested,
    environment: process.env,
  });
  assert.notEqual(
    changed.identity.worktree.tracked_diff_sha256,
    captured.identity.worktree.tracked_diff_sha256,
  );
  assert.notEqual(changed.identity.worktree.tree_oid, captured.identity.worktree.tree_oid);
});

test("marks an exit-zero verification unstable when the command changes its snapshot", (t) => {
  const { environment, home, paths } = temporaryWorkflow(t);
  const repo = path.join(home, "unstable-repo");
  fs.mkdirSync(repo);
  const git = (...args) => spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  assert.equal(git("init", "-q").status, 0);
  assert.equal(git("config", "user.name", "Atlas Test").status, 0);
  assert.equal(git("config", "user.email", "atlas@example.invalid").status, 0);
  const tracked = path.join(repo, "tracked.txt");
  fs.writeFileSync(tracked, "before\n");
  assert.equal(git("add", ".").status, 0);
  assert.equal(git("commit", "-qm", "fixture").status, 0);
  const taskId = createFixtureTask(environment, "Unstable verification");
  const result = runVerification(
    parseVerifyArgs([
      taskId,
      "--",
      process.execPath,
      "-e",
      `require("fs").writeFileSync(${JSON.stringify(tracked)}, "after\\n")`,
    ]),
    {
      clock: fixedClock,
      cwd: repo,
      environment,
      recordToken: "20260710T091500000000009",
    },
  );

  assert.equal(result.exitCode, 0);
  const identity = JSON.parse(fs.readFileSync(result.identityFile, "utf8"));
  assert.equal(identity.snapshot_stable, false);
  assert.notEqual(identity.pre_identity_digest, identity.identity_digest);
  assert.equal(readJsonObject(taskStateFile(paths, taskId)).verification.identity_stable, false);
});

test("keeps parser diagnostics and public child exit-code delegation stable", (t) => {
  assert.equal(formatCommand(["bash", "-lc", "exit 3"]), "bash -lc exit\\ 3 ");
  assert.equal(formatCommand(["echo", "中文", "a,b"]), "echo 中文 a\\,b ");
  assert.equal(
    formatCommand(["echo", "#", "~", "a#b", "a~b"]),
    "echo \\# \\~ a#b a~b ",
  );
  assert.throws(() => parseVerifyArgs([]), new RegExp(VERIFY_USAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.throws(() => parseVerifyArgs(["task", "--",]), new RegExp("usage: codex-workflow verify"));
  assert.throws(
    () => parseVerifyArgs(["task", "--outcome", "unknown", "--", "true"]),
    /invalid outcome: unknown/,
  );
  assert.throws(
    () => parseVerifyArgs(["task", "--failure-attribution=outside", "--", "true"]),
    /invalid failure attribution: outside/,
  );
  assert.throws(
    () => parseVerifyArgs(["task", "--gate-class=Unsafe Class", "--", "true"]),
    /invalid gate class: Unsafe Class/,
  );

  const { environment, paths } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Public failed verification");
  const child = spawnSync(
    PUBLIC_BIN,
    [
      "verify",
      taskId,
      "--outcome",
      "failed",
      "--failure-attribution",
      "test",
      "--",
      process.execPath,
      "-e",
      'process.stdout.write("not public\\n"); process.exit(3)',
    ],
    { encoding: "utf8", env: environment },
  );
  assert.equal(child.status, 3, child.stderr);
  assert.match(child.stdout, /^task_id: .+\nrecord: .+\nverdict: failed\n$/);
  assert.doesNotMatch(child.stdout, /not public/);
  assert.equal(child.stderr, "");
  const state = readJsonObject(taskStateFile(paths, taskId));
  assert.equal(state.verification.last_exit_code, 3);
  assert.equal(state.verification.failure_attribution, "test");

  const invalid = spawnSync(PUBLIC_BIN, ["verify", taskId, "--",], {
    encoding: "utf8",
    env: environment,
  });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stderr, `${VERIFY_USAGE}\n`);
});

test("shares the JavaScript record writer with smoke and preserves preview limits", (t) => {
  const { home } = temporaryWorkflow(t);
  const stdoutFile = path.join(home, "stdout");
  const stderrFile = path.join(home, "stderr");
  const recordFile = path.join(home, "smoke.md");
  fs.writeFileSync(
    stdoutFile,
    Array.from({ length: 82 }, (_, index) => `line-${index + 1}`).join("\n"),
  );
  fs.writeFileSync(stderrFile, "");
  assert.match(outputPreview(stdoutFile), /line-80\n\.\.\. \(2 more lines omitted\)$/);

  const written = spawnSync(
    process.execPath,
    [
      RECORD_CLI,
      recordFile,
      "smoke",
      "task-smoke",
      "codex exec smoke",
      "/tmp/repo",
      "0",
      "passed",
      stdoutFile,
      stderrFile,
      "2026-07-10T09:15:00Z",
      "passed",
      "smoke-only",
      "local-command",
      "",
      "0",
    ],
    { encoding: "utf8" },
  );
  assert.equal(written.status, 0, written.stderr);
  const record = fs.readFileSync(recordFile, "utf8");
  assert.match(record, /^# Smoke Record/);
  assert.match(record, /- trajectory: smoke-only/);
  assert.match(record, /\.\.\. \(2 more lines omitted\)/);
});

test("keeps the Bash smoke command compatible with the JavaScript record writer", (t) => {
  const { environment } = temporaryWorkflow(t);
  const taskId = createFixtureTask(environment, "Smoke writer");
  const mockCodex = path.join(environment.CODEX_HOME_ROOT, "mock-codex");
  fs.writeFileSync(
    mockCodex,
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "last_message=''",
      "while [[ $# -gt 0 ]]; do",
      "  if [[ \"$1\" == '--output-last-message' ]]; then",
      "    last_message=\"$2\"",
      "    shift 2",
      "  else",
      "    shift",
      "  fi",
      "done",
      "printf '%s\\n' 'CODEX-SMOKE-OK' > \"$last_message\"",
      "printf '%s\\n' 'mock smoke stdout'",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );

  const smoke = spawnSync(PUBLIC_BIN, ["smoke"], {
    encoding: "utf8",
    env: { ...environment, CODEX_BIN: mockCodex },
  });
  assert.equal(smoke.status, 0, smoke.stderr);
  assert.match(smoke.stdout, new RegExp(`^task_id: ${taskId}\\nrecord: (.+)\\nmessage: CODEX-SMOKE-OK\\n$`));
  const recordFile = smoke.stdout.match(/record: (.+)\n/)[1];
  const record = fs.readFileSync(recordFile, "utf8");
  assert.match(record, /^# Smoke Record/);
  assert.match(record, /mock smoke stdout/);
  assert.match(record, /CODEX-SMOKE-OK/);
  assert.match(record, /- verdict: passed/);
});
