#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import {
  GuardError,
  loadConfig,
  parseCliArgs,
  readObjective,
  reconcile,
  runCommand,
  runPaseoCommand
} from "./paseo-guard.mjs";

let stopping = false;
const AGENT_STATUS_WAIT_REASONS = new Set(["child_agent_running", "orchestrator_not_idle"]);

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

export async function waitForRoomEvent(config, { timeout, runner = runCommand }) {
  try {
    const result = runPaseoCommand(config, "chatWait", { room: config.room, timeout }, [], runner);
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

export function selectWatchTimeout(objective, config, options = {}) {
  const timeout = options.timeout || config.watch?.timeout || "10m";
  if (!needsAgentStatusPoll(objective)) {
    return timeout;
  }
  return options.agentStatusPollTimeout || config.watch?.agentStatusPollTimeout || "15s";
}

export async function watch(config, options = {}) {
  const maxCycles = Number(options.maxCycles || 0);
  const idleSleepMs = Number(options.idleSleepMs || 5000);
  let cycles = 0;

  while (!stopping) {
    cycles += 1;
    const objective = readObjective(config);
    if (!objective) {
      throw new GuardError("objective_missing: run init first", "objective_missing");
    }

    if (objective.status !== "active") {
      printEvent({ type: "heartbeat", reason: `objective_${objective.status}` });
      if (maxCycles && cycles >= maxCycles) {
        break;
      }
      await sleep(idleSleepMs);
      continue;
    }

    const timeout = selectWatchTimeout(objective, config, options);
    const event = await waitForRoomEvent(config, { timeout, runner: options.runner });
    printEvent({
      ...event,
      watchTimeout: timeout,
      previousDecisionReason: objective.lastDecision?.reason || null
    });
    if (event.type === "message" || event.type === "heartbeat") {
      try {
        const result = reconcile(config, { dryRun: Boolean(options.dryRun), runner: options.runner });
        printEvent({ type: "reconcile", decision: result.decision });
      } catch (error) {
        printEvent({
          type: "heartbeat",
          reason: "reconcile_error",
          error: String(error.message || error).slice(0, 500)
        });
      }
    }

    if (maxCycles && cycles >= maxCycles) {
      break;
    }
  }

  printEvent({ type: "stopped" });
}

function usage() {
  return [
    "Usage:",
    "  paseo-guard-watch --config <config> [--timeout 10m] [--agent-status-poll-timeout 15s] [--dry-run] [--max-cycles 1]"
  ].join("\n");
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);
  if (args.help || !args.config) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  const config = loadConfig(args.config);
  await watch(config, {
    timeout: args.timeout,
    agentStatusPollTimeout: args["agent-status-poll-timeout"],
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
