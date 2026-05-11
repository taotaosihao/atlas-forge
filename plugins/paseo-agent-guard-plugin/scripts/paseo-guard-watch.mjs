#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import {
  GuardError,
  WorkflowStore,
  parseCliArgs,
  readObjective,
  reconcile,
  runCommand,
  runPaseoCommand
} from "./paseo-guard.mjs";

let stopping = false;
const AGENT_STATUS_WAIT_REASONS = new Set(["child_agent_running", "orchestrator_not_idle"]);
const COOLDOWN_WAIT_REASONS = new Set(["cooldown_active"]);

process.on("SIGINT", () => {
  stopping = true;
});

process.on("SIGTERM", () => {
  stopping = true;
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseWaitMessages(stdout) {
  const text = String(stdout || "").trim();
  if (!text) {
    return [];
  }
  try {
    const json = JSON.parse(text);
    if (Array.isArray(json)) {
      return json;
    }
    if (Array.isArray(json.messages)) {
      return json.messages;
    }
    if (Array.isArray(json.Messages)) {
      return json.Messages;
    }
    if (json.message) {
      return [json.message];
    }
    if (json.Message) {
      return [json.Message];
    }
    return [];
  } catch {
    return [];
  }
}

function printEvent(event) {
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`);
}

export async function waitForRoomEvent(workflow, { timeout, runner = runCommand }) {
  try {
    const result = runPaseoCommand(workflow, "chatWait", { room: workflow.room, timeout }, [], runner);
    const messages = parseWaitMessages(result.stdout);
    if (messages.length === 0) {
      return { type: "heartbeat", reason: "timeout_or_empty_wait" };
    }
    return { type: "message", messages };
  } catch (error) {
    return {
      type: "heartbeat",
      reason: "chat_wait_error",
      error: String(error.message || error).slice(0, 500)
    };
  }
}

export function needsAgentStatusPoll(objective) {
  return objective?.status === "active" &&
    objective?.lastDecision?.action === "wait" &&
    AGENT_STATUS_WAIT_REASONS.has(objective.lastDecision.reason);
}

export function needsCooldownPoll(objective) {
  return objective?.status === "active" &&
    objective?.lastDecision?.action === "wait" &&
    COOLDOWN_WAIT_REASONS.has(objective.lastDecision.reason);
}

export function selectWatchTimeout(objective, workflow, options = {}) {
  const timeout = options.timeout || workflow.watch?.timeout || "10m";
  if (needsAgentStatusPoll(objective)) {
    return options.agentStatusPollTimeout || workflow.watch?.agentStatusPollTimeout || "15s";
  }
  if (needsCooldownPoll(objective)) {
    return options.cooldownPollTimeout || workflow.watch?.cooldownPollTimeout || "15s";
  }
  return timeout;
}

function eventEnvelope(workflow, objective, event = {}) {
  return {
    room: workflow.room,
    workflowDigest: workflow.workflowDigest,
    workflowPath: workflow.workflowPath,
    workflowLoadError: workflow.workflowLoadError || null,
    watcherStatus: objective?.status || null,
    ...event
  };
}

export async function watch(workflowStore, options = {}) {
  const maxCycles = Number(options.maxCycles || 0);
  const idleSleepMs = Number(options.idleSleepMs || 5000);
  let cycles = 0;

  while (!stopping) {
    cycles += 1;
    const workflow = workflowStore.reload();
    const objective = readObjective(workflow);
    if (!objective) {
      throw new GuardError("objective_missing: run init first", "objective_missing");
    }

    if (objective.status !== "active") {
      printEvent(eventEnvelope(workflow, objective, {
        type: "heartbeat",
        reason: `objective_${objective.status}`
      }));
      if (maxCycles && cycles >= maxCycles) {
        break;
      }
      await sleep(idleSleepMs);
      continue;
    }

    const timeout = selectWatchTimeout(objective, workflow, options);
    const event = await waitForRoomEvent(workflow, { timeout, runner: options.runner });
    printEvent(eventEnvelope(workflow, objective, {
      ...event,
      watchTimeout: timeout,
      previousDecisionReason: objective.lastDecision?.reason || null
    }));
    try {
      const result = reconcile(workflow, {
        dryRun: Boolean(options.dryRun),
        runner: options.runner
      });
      printEvent(eventEnvelope(workflow, objective, {
        type: "reconcile",
        projectKey: result.decision.projectKey || null,
        decision: result.decision.action,
        reason: result.decision.reason,
        signal: result.decision.signal || null,
        messageId: result.decision.messageId || null,
        retryAttempt: result.decision.retryAttempt || null
      }));
    } catch (error) {
      printEvent(eventEnvelope(workflow, objective, {
        type: "heartbeat",
        reason: "reconcile_error",
        error: String(error.message || error).slice(0, 500)
      }));
    }

    if (maxCycles && cycles >= maxCycles) {
      break;
    }
  }

  const workflow = workflowStore.getWorkflow();
  const objective = readObjective(workflow);
  printEvent(eventEnvelope(workflow, objective, { type: "stopped" }));
}

function usage() {
  return [
    "Usage:",
    "  paseo-guard-watch [--workflow <path>] [--timeout 10m] [--agent-status-poll-timeout 15s] [--cooldown-poll-timeout 15s] [--dry-run] [--max-cycles 1]"
  ].join("\n");
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);
  if (args.config !== undefined) {
    throw new GuardError(
      "config_flag_removed: JSON config support was removed. Rename to WORKFLOW.md and use --workflow <path> instead.",
      "workflow_migration_required"
    );
  }
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  const workflowStore = new WorkflowStore(args.workflow || "./WORKFLOW.md");
  workflowStore.loadInitial();
  await watch(workflowStore, {
    timeout: args.timeout,
    agentStatusPollTimeout: args["agent-status-poll-timeout"],
    cooldownPollTimeout: args["cooldown-poll-timeout"],
    dryRun: Boolean(args["dry-run"]),
    maxCycles: args["max-cycles"]
  });
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await main();
  } catch (error) {
    const status = error instanceof GuardError ? error.code : "error";
    process.stderr.write(`${status}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
