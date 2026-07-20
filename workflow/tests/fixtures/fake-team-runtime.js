#!/usr/bin/env node
"use strict";

const action = process.argv[2] || "";
const args = process.argv.slice(3);
const mode = process.env.FAKE_TEAM_RUNTIME_MODE || "success";

function output(value, exitCode = 0) {
  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write(`${JSON.stringify(value)}\n`);
  process.exit(exitCode);
}

if (action === "run") {
  const labelIndex = args.indexOf("--label");
  const label = labelIndex === -1 ? "" : args[labelIndex + 1];
  output({
    status: "accepted",
    agent: { id: "fake-agent-1", labels: label ? [label] : [] },
    workspace_id: "fake-workspace-1",
    worktree: "/fake/worktree",
    base_sha: "0123456789abcdef",
  });
}

if (mode === "rate-limit") {
  output({
    status: "error",
    error: {
      code: "RATE_LIMITED",
      http_status: 429,
      retry_after_ms: 250,
      message: "provider rate limit",
    },
  }, 42);
}

if (mode === "crash") {
  output({
    status: "error",
    error: { code: "RUNTIME_CRASH", message: "runtime crash" },
  }, 43);
}

if (mode === "quota") {
  output({
    status: "error",
    error: { code: "QUOTA_EXHAUSTED", message: "credits exhausted" },
  }, 44);
}

if (action === "ls") {
  if (!args.includes("--global") || !args.includes("--label")) {
    output({ status: "error", error: { code: "MISSING_FILTER", message: "ls filter required" } }, 2);
  }
  const agents = mode === "reconcile-one"
    ? [{ id: "fake-agent-1", status: "running" }]
    : mode === "reconcile-ambiguous"
      ? [{ id: "fake-agent-1", status: "running" }, { id: "fake-agent-2", status: "idle" }]
      : [];
  output(agents);
}

if (["wait", "stop", "inspect"].includes(action)) {
  output({ status: "complete", agent_id: "fake-agent-1" });
}

output({ status: "error", error: { code: "UNKNOWN_ACTION", message: action } }, 2);
