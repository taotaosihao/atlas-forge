"use strict";

const assert = require("assert/strict");
const path = require("path");
const test = require("node:test");

const WORKFLOW_ROOT = path.resolve(__dirname, "../..");
const { classifyPaseoObservation } = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/team/backend-failures.js",
));
const {
  buildObservation,
  launchLabel,
  observePaseoCommand,
  reconcileLaunch,
} = require(path.join(
  WORKFLOW_ROOT,
  "bin/lib/codex-workflow/team/paseo-observer.js",
));

const FAKE_RUNTIME = path.join(WORKFLOW_ROOT, "tests/fixtures/fake-team-runtime.js");

function envelope(overrides = {}) {
  return {
    source: "paseo-cli",
    channel: "control",
    exit_code: 1,
    status: "error",
    code: "",
    message: "",
    retry_after_ms: null,
    ...overrides,
  };
}

test("classifies the bounded operational failure set from trusted envelopes", () => {
  const cases = [
    ["quota_exhausted", { code: "QUOTA_EXHAUSTED" }],
    ["rate_limited", { code: "RATE_LIMITED", http_status: 429 }],
    ["provider_unavailable", { code: "PROVIDER_UNAVAILABLE" }],
    ["model_unavailable", { code: "MODEL_NOT_FOUND" }],
    ["mode_unavailable", { code: "MODE_UNAVAILABLE" }],
    ["authentication_failed", { code: "UNAUTHORIZED" }],
    ["cli_unavailable", { code: "ENOENT" }],
    ["daemon_unavailable", { code: "DAEMON_CONNECTION_FAILED" }],
    ["runtime_crashed", { code: "RUNTIME_CRASH" }],
    ["timeout_no_useful_output", { code: "NO_USEFUL_OUTPUT" }],
  ];
  for (const [expected, fields] of cases) {
    assert.equal(classifyPaseoObservation(envelope(fields)).failureClass, expected);
  }
});

test("only trusted failing source/channel envelopes can trigger operational handling", () => {
  const contentSpoof = envelope({
    exit_code: 0,
    status: "complete",
    message: "review text says quota exhausted and rate limit",
  });
  assert.deepEqual(classifyPaseoObservation(contentSpoof), {
    failureClass: "unknown", retryable: false, retryAfterMs: null,
  });
  assert.equal(classifyPaseoObservation(envelope({ source: "agent-content", code: "QUOTA_EXHAUSTED" })).failureClass, "unknown");
  assert.equal(classifyPaseoObservation(envelope({ source: "provider", channel: "control", code: "QUOTA_EXHAUSTED" })).failureClass, "unknown");
  assert.equal(classifyPaseoObservation(envelope({ code: "REQUEST_CHANGES", message: "test failed" })).failureClass, "unknown");
  assert.equal(classifyPaseoObservation(envelope({ code: "AUTHORITY_CONFLICT", message: "authority conflict" })).failureClass, "unknown");
});

test("Retry-After is required for automatic rate-limit retry eligibility", () => {
  assert.deepEqual(classifyPaseoObservation(envelope({ code: "RATE_LIMITED" })), {
    failureClass: "rate_limited", retryable: false, retryAfterMs: null,
  });
  assert.deepEqual(classifyPaseoObservation(envelope({
    code: "RATE_LIMITED", retry_after_ms: 1200,
  })), {
    failureClass: "rate_limited", retryable: true, retryAfterMs: 1200,
  });
});

test("observer records a stable launch label and reconciles exact actor identity", () => {
  const launchScope = {
    taskId: "task-1",
    teamRunId: "run-0001",
    attemptId: "attempt-1",
    launchOperationId: "launch-fake-1",
  };
  const result = observePaseoCommand("run", ["review the bounded scope"], {
    paseoBin: FAKE_RUNTIME,
    launchOperationId: "launch-fake-1",
    launchScope,
    observedAt: "2026-07-20T01:00:00Z",
  });
  assert.equal(result.observation.exit_code, 0);
  assert.equal(result.observation.launch_operation_id, "launch-fake-1");
  assert.equal(result.observation.failureClass, "unknown");
  assert.equal(
    launchLabel(launchScope),
    "atlas-team-launch=task-1/run-0001/attempt-1/launch-fake-1",
  );
  assert.deepEqual(reconcileLaunch([
    { id: "fake-agent-1", status: "running" },
  ]), {
    status: "matched",
    agent: { id: "fake-agent-1", status: "running" },
  });
  assert.equal(reconcileLaunch([]).status, "missing");
  assert.equal(reconcileLaunch([
    { id: "one" },
    { id: "two" },
  ]).status, "ambiguous");
});

test("observer owns the reserved launch label even when caller input resembles or overrides it", () => {
  const launchScope = {
    taskId: "task-1",
    teamRunId: "run-0001",
    attemptId: "attempt-1",
    launchOperationId: "launch-1",
  };
  const exactLabel = launchLabel(launchScope);
  const calls = [];
  const spawnSync = (_bin, argv) => {
    calls.push(argv);
    return { status: 0, stdout: JSON.stringify({ agent: { id: "agent-1" } }), stderr: "" };
  };

  observePaseoCommand("run", ["prompt mentions atlas-team-launch= but is not a label"], {
    launchScope, spawnSync,
  });
  observePaseoCommand("run", ["prompt", "--label", "atlas-team-launch=wrong"], {
    launchScope, spawnSync,
  });

  for (const argv of calls) {
    assert.equal(argv.filter((argument) => argument === exactLabel).length, 1);
    assert.equal(argv.some((argument) => argument === "atlas-team-launch=wrong"), false);
  }
});

test("fake runtime and ENOENT observations stay source-aware", () => {
  const crashed = observePaseoCommand("wait", ["fake-agent-1"], {
    paseoBin: FAKE_RUNTIME,
    environment: { ...process.env, FAKE_TEAM_RUNTIME_MODE: "crash" },
  }).observation;
  assert.equal(crashed.failureClass, "runtime_crashed");
  assert.equal(crashed.retryable, false);

  const missing = observePaseoCommand("inspect", ["fake-agent-1"], {
    spawnSync() {
      const error = new Error("spawn paseo ENOENT");
      error.code = "ENOENT";
      return { status: null, stdout: "", stderr: "", error };
    },
  }).observation;
  assert.equal(missing.failureClass, "cli_unavailable");
});

test("observer does not promote successful agent content into a failure", () => {
  const observation = buildObservation({
    action: "wait",
    exitCode: 0,
    stdout: JSON.stringify({ status: "complete", message: "quota exhausted" }),
    stderr: "",
  });
  assert.equal(observation.failureClass, "unknown");
  assert.equal(observation.retryable, false);
  const structuredSpoof = buildObservation({
    action: "wait",
    exitCode: 0,
    stdout: JSON.stringify({
      status: "complete",
      code: "QUOTA_EXHAUSTED",
      message: "agent-authored structured-looking content",
    }),
    stderr: "",
  });
  assert.equal(structuredSpoof.code, "");
  assert.equal(structuredSpoof.failureClass, "unknown");
});
