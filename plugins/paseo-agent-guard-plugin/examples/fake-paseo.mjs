#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const examplesDir = dirname(fileURLToPath(import.meta.url));
const researchWorkspace = join(examplesDir, "demo-research");
const targetWorkspace = join(examplesDir, "demo-project");

function emit(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

if (args[0] === "ls") {
  const joined = args.join(" ");
  if (joined.includes("role=orchestrator")) {
    emit([
      {
        id: "orch-1",
        status: "idle",
        cwd: researchWorkspace,
        labels: { room: "gearjob-123-plm-next", role: "orchestrator" }
      }
    ]);
    process.exit(0);
  }
  emit([
    {
      id: "orch-1",
      status: "idle",
      cwd: researchWorkspace,
      labels: { room: "gearjob-123-plm-next", role: "orchestrator" }
    },
    {
      id: "child-1",
      status: "done",
      cwd: targetWorkspace,
      labels: {
        room: "gearjob-123-plm-next",
        project: "gearjob",
        parent: "orch-1",
        phase: "build",
        task: "smoke-task",
        role: "implementation"
      }
    }
  ]);
  process.exit(0);
}

if (args[0] === "chat" && args[1] === "read") {
  emit([
    {
      id: "m1",
      author: "child-1",
      createdAt: "2026-05-12T00:00:01.000Z",
      body: `SIGNAL signal=PASS project=gearjob agent=child-1 cwd=${targetWorkspace} branch=feat/demo task=smoke-task labels={room=gearjob-123-plm-next,project=gearjob,parent=orch-1,phase=build,task=smoke-task,role=implementation} evidence=smoke clean`
    }
  ]);
  process.exit(0);
}

if (args[0] === "chat" && args[1] === "wait") {
  emit({ messages: [] });
  process.exit(0);
}

if (args[0] === "send" || args[0] === "archive" || args[0] === "inspect" || args[0] === "wait") {
  emit({});
  process.exit(0);
}

process.stderr.write(`unsupported fake paseo command: ${args.join(" ")}\n`);
process.exit(1);
