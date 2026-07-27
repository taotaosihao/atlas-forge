"use strict";

const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");
const { CommandError, commandOptions } = require("../core/command-runtime");
const { sha256 } = require("../verification/identity");
const { mutateTaskRuntime } = require("../core/task-mutation");
const { taskArtifactDir } = require("../core/paths");
const { renderTaskFields, requireTaskFile, validateTaskFile } = require("../task/repository");
const { projectTaskState, readJsonObject, taskStateFile, timestampSeconds } = require("../task/runtime");
const { requiredGateAdmission } = require("../verification/required-gates");
const { teamClosureIssues } = require("./lane-registry");
const {
  briefRequestIdentity,
  captureWorktreeSnapshot,
  globalAdmissionLockFile,
  validateDependencies,
} = require("./admission");
const { sleepMilliseconds, withLock } = require("../core/lock");

const SLICE_ACCEPT_USAGE =
  "usage: codex-workflow team-slice-accept <task-id> --brief <brief.json> --operation-id <id> --keeper-output <declared-ref>=<file>...";
const SLICE_SUPERSEDE_USAGE =
  'usage: codex-workflow team-slice-supersede <task-id> --slice-id <id> --operation-id <id> --authority-ref <ref> --reason "<reason>"';
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function parseSliceAcceptArgs(argv) {
  if (argv.length === 0) throw new CommandError(SLICE_ACCEPT_USAGE);
  const parsed = { briefPath: "", keeperOutputs: [], operationId: "", taskId: argv[0] };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--brief" || argument === "--operation-id" || argument === "--keeper-output") {
      if (index + 1 >= argv.length) throw new CommandError(SLICE_ACCEPT_USAGE);
      const value = argv[++index];
      if (argument === "--brief") parsed.briefPath = value;
      if (argument === "--operation-id") parsed.operationId = value;
      if (argument === "--keeper-output") parsed.keeperOutputs.push(value);
    } else if (argument.startsWith("--brief=")) {
      parsed.briefPath = argument.slice("--brief=".length);
    } else if (argument.startsWith("--operation-id=")) {
      parsed.operationId = argument.slice("--operation-id=".length);
    } else if (argument.startsWith("--keeper-output=")) {
      parsed.keeperOutputs.push(argument.slice("--keeper-output=".length));
    } else {
      throw new CommandError(SLICE_ACCEPT_USAGE);
    }
  }
  if (!parsed.briefPath || !parsed.operationId || parsed.keeperOutputs.length === 0) {
    throw new CommandError(SLICE_ACCEPT_USAGE);
  }
  if (!SAFE_ID.test(parsed.taskId) || !SAFE_ID.test(parsed.operationId)) {
    throw new CommandError("team slice acceptance requires safe task and operation ids");
  }
  return parsed;
}

function parseSliceSupersedeArgs(argv) {
  if (argv.length === 0) throw new CommandError(SLICE_SUPERSEDE_USAGE);
  const parsed = { authorityRef: "", operationId: "", reason: "", sliceId: "", taskId: argv[0] };
  const fields = new Map([
    ["--authority-ref", "authorityRef"],
    ["--operation-id", "operationId"],
    ["--reason", "reason"],
    ["--slice-id", "sliceId"],
  ]);
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    const direct = fields.get(argument);
    if (direct) {
      if (parsed[direct] || index + 1 >= argv.length) throw new CommandError(SLICE_SUPERSEDE_USAGE);
      parsed[direct] = argv[++index];
      continue;
    }
    const matched = [...fields].find(([option]) => argument.startsWith(`${option}=`));
    if (!matched || parsed[matched[1]]) throw new CommandError(SLICE_SUPERSEDE_USAGE);
    parsed[matched[1]] = argument.slice(matched[0].length + 1);
  }
  if (!SAFE_ID.test(parsed.taskId) || !SAFE_ID.test(parsed.sliceId) || !SAFE_ID.test(parsed.operationId)
    || !parsed.authorityRef.trim() || !parsed.reason.trim()
    || /[\r\n\t]/.test(parsed.authorityRef) || /[\r\n\t]/.test(parsed.reason)) {
    throw new CommandError(SLICE_SUPERSEDE_USAGE);
  }
  return parsed;
}

function canonicalKeeperFile(repo, requested) {
  const file = path.resolve(repo, requested);
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    if (error.code === "ENOENT") throw new CommandError(`keeper output is missing: ${file}`);
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(file) !== file) {
    throw new CommandError(`keeper output must be a canonical regular file: ${file}`);
  }
  const relative = path.relative(repo, file);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new CommandError(`keeper output must be inside the admitted repository: ${file}`);
  }
  return { file, relative: relative.split(path.sep).join("/") };
}

function keeperBindings(parsed, repo) {
  const seen = new Set();
  return parsed.keeperOutputs.map((binding) => {
    const separator = binding.indexOf("=");
    if (separator <= 0 || separator === binding.length - 1) {
      throw new CommandError(`invalid keeper output binding: ${binding}`);
    }
    const reference = binding.slice(0, separator);
    if (seen.has(reference)) throw new CommandError(`duplicate keeper output binding: ${reference}`);
    seen.add(reference);
    const keeper = canonicalKeeperFile(repo, binding.slice(separator + 1));
    return {
      content_digest: sha256(fs.readFileSync(keeper.file)),
      path: keeper.relative,
      reference,
    };
  });
}

function git(repo, args) {
  try {
    return childProcess.execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const detail = String(error.stderr || error.message || "git failed").trim();
    throw new CommandError(`unable to measure admitted slice diff: ${detail}`);
  }
}

function ownedPathMatcher(pattern) {
  const normalized = String(pattern || "").replace(/^\.\//, "").replace(/\\/g, "/");
  let expression = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === "*" && normalized[index + 1] === "*") {
      expression += ".*";
      index += 1;
    } else if (character === "*") {
      expression += "[^/]*";
    } else if (character === "?") {
      expression += "[^/]";
    } else {
      expression += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  return new RegExp(`^${expression}$`);
}

function actualSliceSize(brief, startSnapshot) {
  if (!startSnapshot?.tree_oid) {
    throw new CommandError("slice acceptance is missing its start worktree snapshot");
  }
  const current = captureWorktreeSnapshot(brief.repo);
  const changedFiles = git(brief.repo, [
    "diff-tree", "--no-commit-id", "-r", "--name-only", "-z",
    startSnapshot.tree_oid, current.tree_oid,
  ]).split("\0").filter(Boolean).sort();
  let loc = 0;
  for (const row of git(brief.repo, [
    "diff-tree", "--no-commit-id", "-r", "--numstat",
    startSnapshot.tree_oid, current.tree_oid,
  ]).split("\n")) {
    if (!row) continue;
    const [added, deleted] = row.split("\t", 2);
    if (/^\d+$/.test(added)) loc += Number(added);
    if (/^\d+$/.test(deleted)) loc += Number(deleted);
  }
  return {
    changed_files: changedFiles.length,
    changed_paths: changedFiles,
    current_tree_oid: current.tree_oid,
    loc,
    start_head_sha: startSnapshot.head_sha,
    start_tree_oid: startSnapshot.tree_oid,
  };
}

function validateActualSliceSize(brief, actual) {
  const estimate = brief.size_gate?.estimate;
  if (!estimate) throw new CommandError("admitted slice is missing its size estimate");
  const matchers = (brief.owned_paths || []).map(ownedPathMatcher);
  const outside = actual.changed_paths.filter((file) => !matchers.some((matcher) => matcher.test(file)));
  if (outside.length > 0) {
    throw new CommandError(`slice requires pause/replan: changed paths exceed admitted ownership: ${outside.join(", ")}`);
  }
  const fileLimit = Math.max(1, Math.floor(estimate.estimated_changed_files * 1.5));
  const locLimit = Math.max(1, Math.floor(estimate.estimated_net_loc * 1.5));
  if (actual.changed_files > fileLimit || actual.loc > locLimit
    || actual.changed_files > brief.budget.max_changed_files || actual.loc > brief.budget.max_loc) {
    throw new CommandError(
      `slice requires pause/replan: actual size ${actual.changed_files} files/${actual.loc} LOC exceeds admitted estimate or budget`,
    );
  }
}

function readBriefForKeeperBindings(parsed) {
  let brief;
  try {
    brief = JSON.parse(fs.readFileSync(parsed.briefPath, "utf8"));
  } catch (error) {
    throw new CommandError(`unable to read Team brief for keeper outputs: ${error.message}`);
  }
  if (!brief || brief.schema_version !== 3 || brief.task_id !== parsed.taskId
    || !path.isAbsolute(brief.repo || "")) {
    throw new CommandError("Team brief is invalid for slice acceptance");
  }
  return {
    brief,
    briefIdentity: briefRequestIdentity(parsed.briefPath),
    repo: fs.realpathSync(brief.repo),
  };
}

function progressProjection(paths, taskId, accepted) {
  const file = path.join(taskArtifactDir(paths, taskId), "team", "sdd", "progress.jsonl");
  let current = "";
  try {
    current = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const row = {
    schema_version: 1,
    event: "slice_complete",
    task_id: taskId,
    slice_id: accepted.slice_id,
    timestamp: accepted.accepted_at,
    outcome: "succeeded",
    keeper_outputs: accepted.keeper_outputs.map((item) => item.reference),
    authority: "derived-from-authoritative-slice-accepted",
    operation_id: accepted.operation_id,
  };
  return {
    path: "team/sdd/progress.jsonl",
    content_base64: Buffer.from(`${current}${JSON.stringify(row)}\n`).toString("base64"),
  };
}

function pauseAfterDependencyValidation(environment) {
  const raw = environment.CODEX_WORKFLOW_TEST_SLICE_ACCEPT_PAUSE_AFTER_DEPENDENCIES;
  if (!raw) return;
  const milliseconds = Number(raw) * 1000;
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    throw new CommandError(`invalid slice acceptance test pause: ${raw}`);
  }
  sleepMilliseconds(milliseconds);
}

function acceptedDependentSlices(paths, taskId, state, dependencySliceId) {
  const dependents = [];
  for (const [sliceId, accepted] of Object.entries(state.slice_acceptances || {})) {
    if (sliceId === dependencySliceId || accepted?.status !== "accepted") continue;
    const briefFile = path.join(
      taskArtifactDir(paths, taskId), "team", "sdd", "slices", sliceId, "brief.json",
    );
    const identity = briefRequestIdentity(briefFile);
    if (identity.brief_sha256 !== accepted.brief_sha256
      || identity.contract_sha256 !== accepted.contract_sha256
      || identity.execution_plan_sha256 !== accepted.execution_plan_sha256) {
      throw new CommandError(`accepted dependent slice brief identity is invalid: ${sliceId}`);
    }
    let brief;
    try {
      brief = JSON.parse(fs.readFileSync(briefFile, "utf8"));
    } catch (error) {
      throw new CommandError(`accepted dependent slice brief is invalid: ${sliceId}: ${error.message}`);
    }
    if (brief.task_id !== taskId || brief.slice_id !== sliceId) {
      throw new CommandError(`accepted dependent slice brief task identity is invalid: ${sliceId}`);
    }
    if ((brief.dependencies || []).some((dependency) => dependency.slice_id === dependencySliceId)) {
      dependents.push(sliceId);
    }
  }
  return dependents.sort();
}

function runSliceAccept(parsed, options = {}) {
  const { clock, environment, paths } = commandOptions(options);
  const { brief, briefIdentity, repo } = readBriefForKeeperBindings(parsed);
  let keepers = keeperBindings(parsed, repo);
  const declared = [...brief.keeper_outputs].sort();
  if (JSON.stringify(keepers.map((item) => item.reference).sort()) !== JSON.stringify(declared)) {
    throw new CommandError("keeper output bindings must exactly cover the admitted brief");
  }
  let committed;
  withLock(globalAdmissionLockFile(paths), () => {
    committed = mutateTaskRuntime(
      paths,
      parsed.taskId,
      {
        kind: "slice.accepted",
        operationId: parsed.operationId,
        data: {
          ...briefIdentity,
          keeper_outputs: keepers,
          slice_id: brief.slice_id,
        },
      },
      ({ events, revision }) => {
        const currentBrief = briefRequestIdentity(parsed.briefPath);
        if (JSON.stringify(currentBrief) !== JSON.stringify(briefIdentity)) {
          throw new CommandError("Team brief changed while slice acceptance was being evaluated");
        }
        const currentKeepers = keeperBindings(parsed, repo);
        if (JSON.stringify(currentKeepers) !== JSON.stringify(keepers)) {
          throw new CommandError("keeper outputs changed while slice acceptance was being evaluated");
        }
        keepers = currentKeepers;
        const taskFile = requireTaskFile(paths.tasksDir, parsed.taskId);
        validateTaskFile(taskFile);
        const taskContent = renderTaskFields(fs.readFileSync(taskFile, "utf8"), {});
        const currentState = readJsonObject(taskStateFile(paths, parsed.taskId));
        const gates = requiredGateAdmission(paths, parsed.taskId, currentState, {
          captureIdentity: options.captureIdentity,
          environment,
        });
        if (!gates || !gates.passed) {
          throw new CommandError(
            `slice acceptance requires all admitted verification gates\n${(gates?.reasons || []).join("\n")}`,
          );
        }
        const team = currentState.active_team && typeof currentState.active_team === "object"
          ? currentState.active_team
          : {};
        const closure = teamClosureIssues(team, "succeeded");
        if (closure.length > 0) throw new CommandError(closure.join("\n"));
        if (team.admission?.brief?.path !== path.resolve(parsed.briefPath)
          || team.slice_id !== brief.slice_id) {
          throw new CommandError("slice acceptance brief does not match the active Team run");
        }
        validateDependencies(paths, brief, {
          captureIdentity: options.captureIdentity,
          environment,
          validateCurrentIdentity: false,
        });
        pauseAfterDependencyValidation(environment);
        const actualSize = actualSliceSize(brief, team.admission.slice_start_snapshot);
        validateActualSliceSize(brief, actualSize);
        const matchers = (brief.owned_paths || []).map(ownedPathMatcher);
        for (const keeper of keepers) {
          if (!matchers.some((matcher) => matcher.test(keeper.path))) {
            throw new CommandError(`keeper output is outside admitted ownership: ${keeper.path}`);
          }
          if (!actualSize.changed_paths.includes(keeper.path)) {
            throw new CommandError(`keeper output was not produced by the current slice: ${keeper.path}`);
          }
        }
        const verificationRecords = gates.verificationRecords.map((record) => {
          const event = events.find((candidate) => candidate.revision === record.event_revision);
          if (!event || event.kind !== "verification.recorded"
            || event.data?.record_id !== record.record_id
            || event.data?.identity_digest !== record.identity_digest
            || event.data?.required_gate?.check_id !== record.check_id) {
            throw new CommandError(`verification event is not authoritative: ${record.check_id}`);
          }
          return {
            ...record,
            verification_event_id: event.event_id,
            verification_revision: event.revision,
          };
        });
        const acceptedAt = timestampSeconds(clock);
        const accepted = {
          authority_ref: `team-run:${team.team_run_id}`,
          actual_size: actualSize,
          accepted_at: acceptedAt,
          brief_sha256: team.admission.brief.sha256,
          contract_sha256: team.admission.brief.contract_sha256,
          execution_plan_sha256: team.admission.brief.execution_plan_sha256,
          generation: team.generation,
          keeper_outputs: keepers,
          operation_id: parsed.operationId,
          revision: revision + 1,
          slice_id: brief.slice_id,
          status: "accepted",
          task_id: parsed.taskId,
          team_run_id: team.team_run_id,
          verification_records: verificationRecords,
        };
        const state = projectTaskState(paths, parsed.taskId, taskContent, currentState, clock);
        state.slice_acceptances = {
          ...(state.slice_acceptances || {}),
          [brief.slice_id]: accepted,
        };
        return {
          projection: {
            task_content: taskContent,
            state,
            files: [progressProjection(paths, parsed.taskId, accepted)],
          },
          result: { accepted },
          legacy: [{ kind: "slice-accepted", detail: brief.slice_id }],
        };
      },
      { ...options, clock, environment },
    );
  });
  const accepted = committed.result.accepted;
  return {
    exitCode: 0,
    lines: [
      `task_id: ${parsed.taskId}`,
      `slice_id: ${accepted.slice_id}`,
      `team_run_id: ${accepted.team_run_id}`,
      `generation: ${accepted.generation}`,
      `status: ${accepted.status}`,
      ...(committed.replay ? ["replayed: true"] : []),
    ],
  };
}

function runSliceSupersede(parsed, options = {}) {
  const { clock, environment, paths } = commandOptions(options);
  let committed;
  withLock(globalAdmissionLockFile(paths), () => {
    committed = mutateTaskRuntime(
      paths,
      parsed.taskId,
      {
        kind: "slice.superseded",
        operationId: parsed.operationId,
        data: {
          authority_ref: parsed.authorityRef,
          reason: parsed.reason,
          slice_id: parsed.sliceId,
        },
      },
      () => {
        const taskFile = requireTaskFile(paths.tasksDir, parsed.taskId);
        validateTaskFile(taskFile);
        const taskContent = renderTaskFields(fs.readFileSync(taskFile, "utf8"), {});
        const currentState = readJsonObject(taskStateFile(paths, parsed.taskId));
        const accepted = currentState.slice_acceptances?.[parsed.sliceId];
        if (!accepted || accepted.status !== "accepted") {
          throw new CommandError(`slice does not have a current authoritative acceptance: ${parsed.sliceId}`);
        }
        const dependents = acceptedDependentSlices(
          paths, parsed.taskId, currentState, parsed.sliceId,
        );
        if (dependents.length > 0) {
          throw new CommandError(
            `cannot supersede ${parsed.sliceId} while accepted dependent slices remain: ${dependents.join(", ")}`,
          );
        }
        const superseded = {
          accepted_operation_id: accepted.operation_id,
          authority_ref: parsed.authorityRef,
          reason: parsed.reason,
          slice_id: parsed.sliceId,
          superseded_at: timestampSeconds(clock),
        };
        const state = projectTaskState(paths, parsed.taskId, taskContent, currentState, clock);
        state.slice_acceptances = {
          ...(state.slice_acceptances || {}),
          [parsed.sliceId]: { ...accepted, status: "superseded", superseded },
        };
        return {
          projection: { task_content: taskContent, state, files: [] },
          result: { superseded },
          legacy: [{ kind: "slice-superseded", detail: parsed.sliceId }],
        };
      },
      { ...options, clock, environment },
    );
  });
  return {
    exitCode: 0,
    lines: [
      `task_id: ${parsed.taskId}`,
      `slice_id: ${parsed.sliceId}`,
      "status: superseded",
      ...(committed.replay ? ["replayed: true"] : []),
    ],
  };
}

module.exports = {
  SLICE_ACCEPT_USAGE,
  SLICE_SUPERSEDE_USAGE,
  parseSliceAcceptArgs,
  parseSliceSupersedeArgs,
  runSliceAccept,
  runSliceSupersede,
};
