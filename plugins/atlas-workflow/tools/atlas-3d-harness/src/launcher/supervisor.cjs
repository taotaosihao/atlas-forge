"use strict";

const { spawn, spawnSync } = require("child_process");
const path = require("path");
const { KERNEL_WORKER_ARGV, scrubEnvironment } = require("../kernel-integration/launcher.cjs");
const { LIMITS, boundedCounter } = require("../protocol/limits.cjs");

const INNER_COOPERATIVE_DEADLINE_MS = 875_000;
const OUTER_WATCHDOG_DEADLINE_MS = 900_000;
const TERM_GRACE_MS = 25_000;

function groupSignal(pid, signal) {
  try { process.kill(-pid, signal); return true; }
  catch (error) { if (error.code === "ESRCH" || error.code === "EPERM") return false; throw error; }
}
function groupAlive(pid) {
  try { process.kill(-pid, 0); return true; }
  catch (error) { if (error.code === "ESRCH") return false; if (error.code === "EPERM") return true; throw error; }
}
function processAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === "ESRCH") return false; if (error.code === "EPERM") return true; throw error; }
}
function processIdentity(pid) {
  const result = spawnSync("/bin/ps", ["-p", String(pid), "-o", "ppid=", "-o", "pgid=", "-o", "lstart="], { encoding: "utf8", env: scrubEnvironment(), shell: false, maxBuffer: 4096 });
  if (result.error) throw result.error;
  if (result.status !== 0) { if (!result.stdout.trim()) return null; throw new Error("SUPERVISOR_PROCESS_IDENTITY_LOOKUP"); }
  const match = /^\s*([0-9]+)\s+([0-9]+)\s+(.+?)\s*$/.exec(result.stdout);
  if (!match) throw new Error("SUPERVISOR_PROCESS_IDENTITY_FORMAT");
  return Object.freeze({ pid, ppid: Number(match[1]), pgid: Number(match[2]), started_at: match[3] });
}
function sameProcessIdentity(left, right) { return Boolean(left && right && left.pid === right.pid && left.pgid === right.pgid && left.started_at === right.started_at); }
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
function liveOwned(records, identityLookup) {
  const alive = [];
  for (const record of records) { const current = identityLookup(record.pid); if (!current) continue; if (!sameProcessIdentity(record.identity, current)) throw new Error("SUPERVISOR_RESIDUAL_IDENTITY_DRIFT"); alive.push(record); }
  return alive;
}
async function waitForExit(records, timeoutMs, identityLookup) {
  const deadline = Date.now() + timeoutMs;
  let alive = liveOwned(records, identityLookup);
  while (alive.length && Date.now() < deadline) { await delay(Math.min(10, Math.max(1, deadline - Date.now()))); alive = liveOwned(alive, identityLookup); }
  return alive;
}
async function terminateResidual(value, graceMs = TERM_GRACE_MS, identityLookup = processIdentity, signalProcess = process.kill.bind(process)) {
  const records = Array.isArray(value) ? value.filter((record) => record && Number.isInteger(record.pid) && record.pid > 1 && record.pid !== process.pid && record.identity) : [];
  let alive = liveOwned(records, identityLookup);
  for (const record of alive) {
    const current = identityLookup(record.pid);
    if (!current) continue;
    if (!sameProcessIdentity(record.identity, current)) throw new Error("SUPERVISOR_RESIDUAL_IDENTITY_DRIFT");
    try { signalProcess(record.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
  }
  alive = await waitForExit(alive, graceMs, identityLookup);
  for (const record of alive) { const current = identityLookup(record.pid); if (!current) continue; if (!sameProcessIdentity(record.identity, current)) throw new Error("SUPERVISOR_RESIDUAL_IDENTITY_DRIFT"); try { signalProcess(record.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; } }
  alive = await waitForExit(alive, Math.min(1_000, graceMs), identityLookup);
  if (alive.length) throw new Error("SUPERVISOR_RESIDUAL_PROCESS_UNCONFIRMED");
}

function runOwnedWorker(request, privateOptions = {}) {
  const argv = privateOptions.argv || KERNEL_WORKER_ARGV;
  const innerMs = privateOptions.innerMs ?? INNER_COOPERATIVE_DEADLINE_MS;
  const outerMs = privateOptions.outerMs ?? OUTER_WATCHDOG_DEADLINE_MS;
  const termGraceMs = privateOptions.termGraceMs ?? TERM_GRACE_MS;
  const signalSource = privateOptions.signalSource || process;
  const signalGroup = privateOptions.signalGroup || groupSignal;
  const settleSchedule = privateOptions.settleSchedule || setImmediate;
  const ownershipByteLimit = privateOptions.ownershipByteLimit ?? LIMITS.max_worker_stdout_bytes;
  const ownershipEventLimit = privateOptions.ownershipEventLimit ?? LIMITS.max_lifecycle_events;
  const identityLookup = privateOptions.identityLookup || processIdentity;
  if (!Array.isArray(argv) || argv.length < 2 || !Number.isInteger(innerMs) || !Number.isInteger(outerMs) || innerMs < 1 || outerMs <= innerMs || termGraceMs < 1 || !Number.isInteger(ownershipByteLimit) || ownershipByteLimit < 1 || !Number.isInteger(ownershipEventLimit) || ownershipEventLimit < 1) return Promise.reject(new Error("SUPERVISOR_PRIVATE_CONFIGURATION_INVALID"));
  return new Promise((resolve, reject) => {
    const ownershipPreload = path.join(__dirname, "process-ownership.cjs");
    const child = spawn(argv[0], argv.slice(1), { detached: true, env: { ...scrubEnvironment(), ATLAS_3D_OWNERSHIP_ACTIVE: "1", ATLAS_3D_OWNERSHIP_RECORD: "1", ATLAS_3D_OWNERSHIP_FD: "3", NODE_OPTIONS: `--require=${ownershipPreload}` }, shell: false, stdio: ["pipe", "pipe", "pipe", "pipe"] });
    let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0), ownership = "", ownershipFailed = false, ownershipEnded = false, ownershipOwnedOpenAtEof = false, settled = false, childClosed = false, innerTriggered = false, outerTriggered = false, interrupted = null, pendingFailure = null, termTimer = null;
    const ownedPids = new Map(), seenPids = new Set();
    const ownershipBytes = boundedCounter(ownershipByteLimit, "WORKER_OWNERSHIP_BYTE_LIMIT");
    const ownershipEvents = boundedCounter(ownershipEventLimit, "WORKER_OWNERSHIP_EVENT_LIMIT");
    const append = (current, chunk, limit, code) => {
      const nextLength = current.length + chunk.length;
      if (nextLength > limit) { signalGroup(child.pid, "SIGKILL"); throw new Error(code); }
      return Buffer.concat([current, chunk], nextLength);
    };
    const fail = (error) => { if (!settled) { settled = true; cleanup(); reject(error); } };
    const abortAfterReap = (error) => { if (!pendingFailure) { pendingFailure = error; signalGroup(child.pid, "SIGKILL"); } };
    const scheduleKill = (graceMs) => { if (termTimer || childClosed || settled) return; termTimer = setTimeout(() => { termTimer = null; if (!childClosed && !settled) signalGroup(child.pid, "SIGKILL"); }, graceMs); };
    const requestTermination = (graceMs) => { if (childClosed || settled || termTimer) return; signalGroup(child.pid, "SIGTERM"); scheduleKill(graceMs); };
    const forward = (signal) => { if (!interrupted) interrupted = signal; requestTermination(termGraceMs); };
    const onSigint = () => forward("SIGINT"), onSigterm = () => forward("SIGTERM");
    const cleanup = () => {
      clearTimeout(innerTimer); clearTimeout(outerTimer); clearTimeout(termTimer);
      signalSource.off("SIGINT", onSigint); signalSource.off("SIGTERM", onSigterm);
    };
    signalSource.on("SIGINT", onSigint); signalSource.on("SIGTERM", onSigterm);
    child.stdout.on("data", (chunk) => { try { stdout = append(stdout, chunk, LIMITS.max_worker_stdout_bytes, "WORKER_STDOUT_LIMIT"); } catch (error) { abortAfterReap(error); } });
    child.stderr.on("data", (chunk) => { try { stderr = append(stderr, chunk, LIMITS.max_worker_stderr_bytes, "WORKER_STDERR_LIMIT"); } catch (error) { abortAfterReap(error); } });
    child.stdio[3].on("data", (chunk) => {
      if (ownershipFailed) return;
      try {
        ownershipBytes.add(chunk.length);
        ownership += chunk.toString("utf8");
        const lines = ownership.split("\n"); ownership = lines.pop();
        for (const line of lines) {
          ownershipEvents.add();
          const match = /^(start|close):([1-9][0-9]*)$/.exec(line); if (!match) throw new Error("WORKER_OWNERSHIP_PROTOCOL");
          const pid = Number(match[2]);
          if (match[1] === "start") {
            if (seenPids.has(pid) || ownedPids.has(pid)) throw new Error("WORKER_OWNERSHIP_INVALID_TRANSITION");
            const identity = identityLookup(pid, child.pid);
            if (identity && identity.pgid !== child.pid) throw new Error("WORKER_OWNERSHIP_NOT_OWNED");
            seenPids.add(pid); ownedPids.set(pid, Object.freeze({ pid, identity }));
          } else {
            if (!ownedPids.has(pid)) throw new Error("WORKER_OWNERSHIP_INVALID_TRANSITION");
            const record = ownedPids.get(pid), current = record.identity ? identityLookup(pid, child.pid) : null;
            if (current && !sameProcessIdentity(record.identity, current)) throw new Error("WORKER_OWNERSHIP_IDENTITY_DRIFT");
            if (current) throw new Error("WORKER_OWNERSHIP_CLOSE_WHILE_ALIVE");
            ownedPids.delete(pid);
          }
        }
      } catch (error) { ownershipFailed = true; ownership = ""; abortAfterReap(error); }
    });
    child.stdio[3].on("end", () => {
      ownershipEnded = true;
      if (ownershipFailed) return;
      if (ownership.length) { ownershipFailed = true; ownership = ""; abortAfterReap(new Error("WORKER_OWNERSHIP_PARTIAL_EOF")); }
      else if (ownedPids.size) { ownershipFailed = true; ownershipOwnedOpenAtEof = [...ownedPids.values()].some((record) => record.identity); abortAfterReap(new Error("WORKER_OWNERSHIP_UNBALANCED_EOF")); }
    });
    child.on("error", fail);
    child.on("spawn", () => child.stdin.end(`${JSON.stringify(request)}\n`));
    child.on("close", (code, signal) => {
      if (settled) return;
      childClosed = true;
      clearTimeout(innerTimer);
      clearTimeout(outerTimer);
      clearTimeout(termTimer);
      termTimer = null;
      settleSchedule(async () => {
        try {
          if (!ownershipEnded && !ownershipFailed) throw new Error("WORKER_OWNERSHIP_EOF_REQUIRED");
          const residual = liveOwned([...ownedPids.values()].filter((record) => record.identity), identityLookup);
          if (groupAlive(child.pid) || residual.length || ownershipOwnedOpenAtEof) { signalGroup(child.pid, "SIGKILL"); await terminateResidual(residual, termGraceMs, identityLookup); throw new Error("SUPERVISOR_RESIDUAL_PROCESS"); }
          if (pendingFailure) throw pendingFailure;
          if (outerTriggered) throw new Error("SUPERVISOR_OUTER_WATCHDOG");
          if (interrupted) throw new Error(`SUPERVISOR_INTERRUPTED_${interrupted}`);
          if (code !== 0) throw new Error((stderr.toString("utf8") || `kernel worker exit=${code} signal=${signal || "none"}`).trim().slice(0, 4096));
          const value = JSON.parse(stdout.toString("utf8"));
          settled = true; cleanup(); resolve(Object.freeze({ value, lifecycle: Object.freeze({ detached: true, shell: false, pgid: child.pid, inner_deadline_ms: INNER_COOPERATIVE_DEADLINE_MS, outer_deadline_ms: OUTER_WATCHDOG_DEADLINE_MS, inner_triggered: innerTriggered, term_then_kill: innerTriggered || Boolean(interrupted), residual: false }) }));
        } catch (error) { fail(error); }
      });
    });
    const innerTimer = setTimeout(() => { if (childClosed || settled) return; innerTriggered = true; requestTermination(Math.min(termGraceMs, outerMs - innerMs)); }, innerMs);
    const outerTimer = setTimeout(() => { if (childClosed || settled) return; outerTriggered = true; signalGroup(child.pid, "SIGKILL"); }, outerMs);
  });
}

function invokeKernelWorkerSupervised(request) { return runOwnedWorker(request); }

module.exports = {
  INNER_COOPERATIVE_DEADLINE_MS,
  OUTER_WATCHDOG_DEADLINE_MS,
  TERM_GRACE_MS,
  invokeKernelWorkerSupervised,
  testing: Object.freeze({ groupAlive, groupSignal, processIdentity, runOwnedWorker, sameProcessIdentity, terminateResidual }),
};
