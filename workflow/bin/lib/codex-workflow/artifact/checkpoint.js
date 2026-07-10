"use strict";

const fs = require("fs");
const path = require("path");
const { atomicWriteFile } = require("../core/atomic-file");
const { relativeToCodeHome } = require("../core/paths");
const { timestampSeconds } = require("../task/runtime");
const {
  ArtifactError,
  appendLegacyRuntimeEvent,
  artifactFile,
  commandOptions,
  oneLine,
  prepareArtifactTask,
  updateArtifactTask,
} = require("./runtime");

const CHECKPOINT_USAGE =
  'usage: codex-workflow checkpoint <task-id> --phase <intake|plan|implement|verify|repair|handoff|blocked|done> --summary "<summary>" [--branch <name>] [--worktree <path>] [--compose-project <name>] [--runtime-target <target>] [--blocker <reason>] [--next <step>]...';
const VALID_PHASES = new Set([
  "intake",
  "plan",
  "implement",
  "verify",
  "repair",
  "handoff",
  "blocked",
  "done",
]);

function parseCheckpointArgs(argv) {
  if (argv.length === 0) {
    throw new ArtifactError(CHECKPOINT_USAGE);
  }
  const result = {
    blocker: "",
    branch: "",
    composeProject: "",
    next: [],
    phase: "",
    runtimeTarget: "",
    summary: "",
    taskId: argv[0],
    worktree: "",
  };
  const map = {
    "--phase": "phase",
    "--summary": "summary",
    "--branch": "branch",
    "--worktree": "worktree",
    "--compose-project": "composeProject",
    "--runtime-target": "runtimeTarget",
    "--blocker": "blocker",
  };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--next") {
      if (index + 1 >= argv.length) {
        throw new ArtifactError(CHECKPOINT_USAGE);
      }
      result.next.push(argv[++index]);
      continue;
    }
    if (argument.startsWith("--next=")) {
      result.next.push(argument.slice("--next=".length));
      continue;
    }
    if (Object.hasOwn(map, argument)) {
      if (index + 1 >= argv.length) {
        throw new ArtifactError(CHECKPOINT_USAGE);
      }
      result[map[argument]] = argv[++index];
      continue;
    }
    const equal = argument.indexOf("=");
    const flag = equal === -1 ? argument : argument.slice(0, equal);
    if (equal !== -1 && Object.hasOwn(map, flag)) {
      result[map[flag]] = argument.slice(equal + 1);
      continue;
    }
    throw new ArtifactError(CHECKPOINT_USAGE);
  }
  if (!result.phase) {
    throw new ArtifactError("missing required argument: --phase");
  }
  if (!result.summary) {
    throw new ArtifactError("missing required argument: --summary");
  }
  return result;
}

function escapeTable(value) {
  return String(value).replace(/\|/g, "\\|");
}

function readLedger(file) {
  try {
    return fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => line.trim())
      .flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function writeCheckpoint(parsed, options = {}) {
  const { clock, paths } = commandOptions(options);
  const phase = oneLine(parsed.phase, "phase", { allowEmpty: false });
  const summary = oneLine(parsed.summary, "summary", { allowEmpty: false });
  const branch = oneLine(parsed.branch, "branch");
  const worktree = oneLine(parsed.worktree, "worktree");
  const composeProject = oneLine(parsed.composeProject, "compose project");
  const runtimeTarget = oneLine(parsed.runtimeTarget, "runtime target");
  const blocker = oneLine(parsed.blocker, "blocker");
  const next = parsed.next.map((value) =>
    oneLine(value, "next step", { allowEmpty: false }),
  );
  if (!VALID_PHASES.has(phase)) {
    throw new ArtifactError(`invalid phase: ${phase}`);
  }
  if (phase === "blocked" && !blocker) {
    throw new ArtifactError("blocked phase requires --blocker");
  }

  prepareArtifactTask(paths, parsed.taskId, clock);
  const recordedAt = timestampSeconds(clock);
  const ledgerFile = artifactFile(paths, parsed.taskId, "ledger.jsonl");
  const lifecycleFile = artifactFile(paths, parsed.taskId, "lifecycle.md");
  const event = {
    kind: "checkpoint",
    task_id: parsed.taskId,
    created_at: recordedAt,
    phase,
    summary,
    branch: branch || "-",
    worktree: worktree || "-",
    compose_project: composeProject || "-",
    runtime_target: runtimeTarget || "-",
    blocker: blocker || "-",
    next,
  };
  fs.mkdirSync(path.dirname(ledgerFile), { recursive: true });
  fs.appendFileSync(ledgerFile, `${JSON.stringify(event)}\n`, "utf8");

  const tableRows = [
    "| Created | Phase | Summary | Next |",
    "| --- | --- | --- | --- |",
    ...readLedger(ledgerFile)
      .slice(-20)
      .map((item) => {
        const nextDisplay = (item.next || []).join("; ") || "-";
        return `| ${item.created_at || "-"} | ${item.phase || "-"} | ${escapeTable(item.summary || "-")} | ${escapeTable(nextDisplay)} |`;
      }),
  ];
  const nextLines = next.length ? next.map((value) => `- ${value}`) : ["- None recorded."];
  atomicWriteFile(
    lifecycleFile,
    [
      "# Lifecycle",
      "",
      `Updated: ${recordedAt}`,
      `Atlas task: ${parsed.taskId}`,
      "",
      "## Current",
      "",
      `- Phase: ${phase}`,
      `- Summary: ${summary}`,
      `- Branch: \`${branch || "-"}\``,
      `- Worktree: \`${worktree || "-"}\``,
      `- Compose project: \`${composeProject || "-"}\``,
      `- Runtime target: \`${runtimeTarget || "-"}\``,
      `- Blocker: ${blocker || "-"}`,
      "",
      "## Next",
      "",
      ...nextLines,
      "",
      "## Recent Ledger",
      "",
      ...tableRows,
      "",
    ].join("\n"),
    { encoding: "utf8" },
  );

  const ledgerRelative = relativeToCodeHome(paths, ledgerFile);
  const lifecycleRelative = relativeToCodeHome(paths, lifecycleFile);
  updateArtifactTask(
    paths,
    parsed.taskId,
    {
      current_phase: phase,
      last_checkpoint: recordedAt,
      lifecycle: lifecycleRelative,
    },
    {
      current_phase: phase,
      lifecycle_outcome: phase,
      last_checkpoint: recordedAt,
      branch: branch || "-",
      worktree: worktree || "-",
      compose_project: composeProject || "-",
      runtime_target: runtimeTarget || "-",
      "checkpoint.summary": summary,
      "checkpoint.ledger": ledgerRelative,
      "checkpoint.lifecycle": lifecycleRelative,
    },
    clock,
  );
  appendLegacyRuntimeEvent(
    paths,
    parsed.taskId,
    "checkpoint",
    `${phase}: ${summary}`,
    clock,
  );
  return [
    `task_id: ${parsed.taskId}`,
    `ledger: ${ledgerFile}`,
    `lifecycle: ${lifecycleFile}`,
    `phase: ${phase}`,
    `next_count: ${next.length}`,
  ];
}

module.exports = {
  CHECKPOINT_USAGE,
  VALID_PHASES,
  parseCheckpointArgs,
  readLedger,
  writeCheckpoint,
};
